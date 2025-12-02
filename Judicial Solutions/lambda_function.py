import os
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import boto3
from botocore.exceptions import ClientError

# -------------------------
# Config / logging
# -------------------------
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger("judicial_single_lambda")

TABLE_FORMS = os.environ.get("TABLE_FORMS", "judicial-forms")
TABLE_CASES = os.environ.get("TABLE_CASES", "judicial-cases")
TABLE_MESSAGES = os.environ.get("TABLE_MESSAGES", "judicial-messages")

dynamodb = boto3.resource("dynamodb")
TABLE_MAP = {
    "forms": dynamodb.Table(TABLE_FORMS),
    "cases": dynamodb.Table(TABLE_CASES),
    "messages": dynamodb.Table(TABLE_MESSAGES),
}

# -------------------------
# Helpers
# -------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def make_response(status: int, body: Any = None, extra_headers: Optional[Dict[str,str]] = None) -> Dict[str, Any]:
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
    }
    if extra_headers:
        headers.update(extra_headers)
    return {
        "statusCode": status,
        "headers": headers,
        "body": json.dumps(body) if body is not None else ""
    }

def parse_json_body(event: Dict[str, Any]) -> Dict[str, Any]:
    body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        import base64
        try:
            body = base64.b64decode(body).decode("utf-8")
        except Exception:
            body = "{}"
    try:
        return json.loads(body)
    except Exception:
        return {}

def choose_table(resource: str):
    tbl = TABLE_MAP.get(resource)
    if tbl is None:
        raise ValueError(f"unknown resource '{resource}'. Allowed: {list(TABLE_MAP.keys())}")
    return tbl

# -------------------------
# CRUD operations
# -------------------------
def create_resource_item(resource: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    table = choose_table(resource)
    item_id = str(uuid.uuid4())
    base = {
        "id": item_id,
        "form_id": payload.get("form_id", resource),
        "created_at": now_iso(),
        "read": False
    }

    # Resource-specific defaults
    if resource == "forms":
        base.update({
            "name": payload.get("name", "").strip(),
            "email": payload.get("email", "").strip(),
            "phone": payload.get("phone", "").strip(),
            "message": payload.get("message", "").strip(),
        })
    elif resource == "cases":
        base.update({
            "case_number": payload.get("case_number", "").strip(),
            "title": payload.get("title", "").strip(),
            "description": payload.get("description", "").strip(),
        })
    elif resource == "messages":
        base.update({
            "sender": payload.get("sender", "").strip(),
            "recipient": payload.get("recipient", "").strip(),
            "body": payload.get("body", "").strip(),
        })

    # Include any extra fields from payload (non-destructive)
    extras = {k: v for k, v in payload.items() if k not in base}
    base.update(extras)

    logger.info("Creating %s item in table %s: id=%s", resource, table.table_name, item_id)
    table.put_item(Item=base)
    return base

def list_resource_items(resource: str, limit: int = 50, last: Optional[str] = None) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    table = choose_table(resource)
    kwargs = {"Limit": limit}
    if last:
        try:
            kwargs["ExclusiveStartKey"] = json.loads(last)
        except Exception:
            logger.warning("invalid last key provided, ignoring")
    resp = table.scan(**kwargs)
    items = resp.get("Items", [])
    logger.info("Scanned %d items from %s (limit=%s)", len(items), table.table_name, limit)
    return items, resp.get("LastEvaluatedKey")

def get_resource_item(resource: str, item_id: str) -> Optional[Dict[str, Any]]:
    table = choose_table(resource)
    resp = table.get_item(Key={"id": item_id})
    item = resp.get("Item")
    logger.info("Get item from %s id=%s found=%s", table.table_name, item_id, bool(item))
    return item

def update_read_flag(resource: str, item_id: str, read_flag: bool) -> Optional[Dict[str, Any]]:
    table = choose_table(resource)
    resp = table.update_item(
        Key={"id": item_id},
        UpdateExpression="SET #r = :v, updated_at = :u",
        ExpressionAttributeNames={"#r": "read"},
        ExpressionAttributeValues={":v": read_flag, ":u": now_iso()},
        ReturnValues="ALL_NEW"
    )
    logger.info("Updated read flag on %s id=%s to %s", table.table_name, item_id, read_flag)
    return resp.get("Attributes")

def delete_resource_item(resource: str, item_id: str) -> bool:
    table = choose_table(resource)
    # check existence first
    existing = table.get_item(Key={"id": item_id}).get("Item")
    if not existing:
        logger.info("Delete requested for %s id=%s but item not found", table.table_name, item_id)
        return False
    table.delete_item(Key={"id": item_id})
    logger.info("Deleted %s id=%s from table %s", resource, item_id, table.table_name)
    return True

def partial_update_item(resource: str, item_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    table = choose_table(resource)
    # remove id if present
    updates.pop("id", None)
    if not updates:
        return None

    expr_parts = []
    expr_names = {}
    expr_values = {}
    idx = 0
    for k, v in updates.items():
        idx += 1
        name_key = f"#f{idx}"
        val_key = f":v{idx}"
        expr_parts.append(f"{name_key} = {val_key}")
        expr_names[name_key] = k
        expr_values[val_key] = v

    # ensure updated_at is set
    expr_parts.append("#u = :u")
    expr_names["#u"] = "updated_at"
    expr_values[":u"] = now_iso()

    update_expr = "SET " + ", ".join(expr_parts)
    resp = table.update_item(
        Key={"id": item_id},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW"
    )
    logger.info("Partially updated %s id=%s fields=%s", table.table_name, item_id, list(updates.keys()))
    return resp.get("Attributes")

def route(event: Dict[str, Any]) -> Dict[str, Any]:
    # Support both API Gateway REST API (v1) and HTTP API (v2) formats
    request_context = event.get("requestContext") or {}
    http_ctx = request_context.get("http") or {}

    # REST API v1: event["httpMethod"]
    # HTTP API v2: event["requestContext"]["http"]["method"]
    method = event.get("httpMethod") or http_ctx.get("method", "")

    path_params = event.get("pathParameters") or {}

    # REST API v1: event["path"]
    # HTTP API v2: event["rawPath"] or requestContext.http.path
    raw_path = (
        event.get("rawPath")
        or event.get("path")
        or http_ctx.get("path")
        or "/"
    )

    # CORS preflight
    if method == "OPTIONS":
        return make_response(204, None)

    # normalize path segments
    parts = [p for p in raw_path.split("/") if p]
    if not parts:
        return make_response(404, {"error": "no_resource_in_path"})

    resource = parts[0]  # expected: forms | cases | messages

    try:
        # POST /{resource}  -> create
        if method == "POST" and len(parts) == 1:
            payload = parse_json_body(event)
            # basic validation
            if resource == "forms":
                if not payload.get("name") or not payload.get("email"):
                    return make_response(400, {"error": "name and email required for forms"})
            if resource == "cases":
                if not payload.get("case_number") or not payload.get("title"):
                    return make_response(400, {"error": "case_number and title required for cases"})
            if resource == "messages":
                if not payload.get("sender") or not payload.get("recipient") or not payload.get("body"):
                    return make_response(400, {"error": "sender, recipient, body required for messages"})
            created = create_resource_item(resource, payload)
            return make_response(201, created)

        # GET /{resource} -> list
        if method == "GET" and len(parts) == 1:
            qs = event.get("queryStringParameters") or {}
            limit = int(qs.get("limit", "50"))
            last = qs.get("last")
            items, last_key = list_resource_items(resource, limit=limit, last=last)
            return make_response(200, {"items": items, "last": json.dumps(last_key) if last_key else None})

        # GET /{resource}/{id} -> get single
        if method == "GET" and (len(parts) == 2 or path_params.get("id")):
            item_id = path_params.get("id") or parts[1]
            item = get_resource_item(resource, item_id)
            if not item:
                return make_response(404, {"error": "not_found"})
            return make_response(200, item)

        # PATCH /{resource}/{id}/read  -> update read flag
        if method in ("PATCH",) and (len(parts) >= 3 and parts[2] == "read" or path_params.get("id") and parts[-1] == "read"):
            # extract item id
            if path_params.get("id"):
                item_id = path_params["id"]
            else:
                item_id = parts[1]
            payload = parse_json_body(event)
            if "read" not in payload or not isinstance(payload["read"], bool):
                return make_response(400, {"error": "'read' boolean required in body"})
            updated = update_read_flag(resource, item_id, payload["read"])
            if not updated:
                return make_response(404, {"error": "not_found"})
            return make_response(200, updated)

        # PUT /{resource}/{id} -> partial update (set fields provided; adds updated_at)
        if method in ("PUT",) and (len(parts) == 2 or path_params.get("id")):
            item_id = path_params.get("id") or parts[1]
            updates = parse_json_body(event)
            if not updates:
                return make_response(400, {"error": "no_update_fields_provided"})
            updated = partial_update_item(resource, item_id, updates)
            if not updated:
                return make_response(404, {"error": "not_found_or_no_change"})
            return make_response(200, updated)

        # DELETE /{resource}/{id} -> delete single item
        if method == "DELETE" and (len(parts) == 2 or path_params.get("id")):
            item_id = path_params.get("id") or parts[1]
            deleted = delete_resource_item(resource, item_id)
            if not deleted:
                return make_response(404, {"error": "not_found"})
            return make_response(204, None)

        return make_response(404, {"error": "route_not_found", "method": method, "path": raw_path})
    except ValueError as ve:
        return make_response(400, {"error": str(ve)})
    except ClientError as ce:
        logger.exception("DynamoDB client error")
        return make_response(500, {"error": "dynamodb_error", "message": str(ce)})
    except Exception as ex:
        logger.exception("Unhandled exception")
        return make_response(500, {"error": "internal_server_error", "message": str(ex)})

# -------------------------
# Lambda handler
# -------------------------
def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    logger.info("event httpMethod=%s path=%s", event.get("httpMethod"), event.get("path") or event.get("rawPath"))
    return route(event)

