import os
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import decimal

import boto3
from botocore.exceptions import ClientError

# -------------------------
# Config / logging
# -------------------------
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger("judicial_single_lambda")

FILES_BUCKET = (
    os.environ.get("FILES_BUCKET")
    or os.environ.get("FILES_BUCKET_NAME")
    or "judicial-files-bucket"
)

TABLE_FORMS = os.environ.get("TABLE_FORMS", "judicial-forms")
TABLE_CASES = os.environ.get("TABLE_CASES", "judicial-cases")
TABLE_MESSAGES = os.environ.get("TABLE_MESSAGES", "judicial-messages")
TABLE_APPOINTMENTS = os.environ.get("TABLE_APPOINTMENTS", "judicial-appointments")
TABLE_SERVICES = os.environ.get("TABLE_SERVICES", "judicial-services")
TABLE_FILES = os.environ.get("TABLE_FILES", "judicial-files")

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")

TABLE_MAP = {
    "forms": dynamodb.Table(TABLE_FORMS),
    "cases": dynamodb.Table(TABLE_CASES),
    "messages": dynamodb.Table(TABLE_MESSAGES),
    "appointments": dynamodb.Table(TABLE_APPOINTMENTS),
    "services": dynamodb.Table(TABLE_SERVICES),
    "files": dynamodb.Table(TABLE_FILES),
}

# -------------------------
# Helpers
# -------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class EnhancedJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        return super().default(obj)

def make_response(
    status: int,
    body: Any = None,
    extra_headers: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
    }
    if extra_headers:
        headers.update(extra_headers)
    # return {
    #     "statusCode": status,
    #     "headers": headers,
    #     "body": json.dumps(body) if body is not None else "",
    # }
    return {
        "statusCode": status,
        "headers": headers,
        "body": json.dumps(body, cls=EnhancedJSONEncoder) if body is not None else "",
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
        raise ValueError(
            f"unknown resource '{resource}'. Allowed: {list(TABLE_MAP.keys())}"
        )
    return tbl

def create_presigned_upload(event: Dict[str, Any]) -> Dict[str, Any]:
    data = parse_json_body(event)
    filename = (data.get("filename") or "").strip()
    content_type = data.get("content_type") or "application/octet-stream"

    if not filename:
        return make_response(400, {"error": "filename_required"})

    key = f"uploads/{uuid.uuid4().hex}_{filename}"

    try:
        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": FILES_BUCKET,
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=900,
        )
    except ClientError as e:
        logger.exception("Error generating presigned URL")
        return make_response(500, {"error": "presign_failed", "message": str(e)})

    file_url = f"https://{FILES_BUCKET}.s3.ap-south-1.amazonaws.com/{key}"
    return make_response(200, {"upload_url": url, "key": key, "file_url": file_url})

# -------------------------
# CRUD operations
# -------------------------
def create_resource_item(resource: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    table = choose_table(resource)
    item_id = str(uuid.uuid4())
    base: Dict[str, Any] = {
        "id": item_id,
        "form_id": payload.get("form_id", resource),
        "created_at": now_iso(),
        "read": False,
    }

    # Resource-specific defaults
    if resource == "forms":
        base.update(
            {
                "name": payload.get("name", "").strip(),
                "email": payload.get("email", "").strip(),
                "phone": payload.get("phone", "").strip(),
                "message": payload.get("message", "").strip(),
                "case_type": payload.get("case_type", "").strip(),
            }
        )
    elif resource == "cases":
        base.update(
            {
                "case_number": payload.get("case_number", "").strip(),
                "title": payload.get("title", "").strip(),
                "description": payload.get("description", "").strip(),
                "court": payload.get("court", "").strip(),
                "judgment_date": payload.get("judgment_date", "").strip(),
            }
        )
    elif resource == "messages":
        base.update(
            {
                "sender": payload.get("sender", "").strip(),
                "recipient": payload.get("recipient", "").strip(),
                "body": payload.get("body", "").strip(),
            }
        )
    elif resource == "appointments":
        base.update(
            {
                "client": payload.get("client", "").strip(),
                "case_type": payload.get("case_type", "").strip(),
                "datetime": payload.get("datetime", "").strip(),
                "mode": payload.get("mode", "").strip(),
                "status": payload.get("status", "").strip(),
                "notes": payload.get("notes", "").strip(),
            }
        )
    elif resource == "services":
        base.update(
            {
                "name": payload.get("name", "").strip(),
                "category": payload.get("category", "").strip(),
                "description": payload.get("description", "").strip(),
                "shown": bool(payload.get("shown", True)),
            }
        )
    elif resource == "files":   # 👈 NEW
        base.update(
            {
                "title": payload.get("title", "").strip(),
                "type": payload.get("type", "").strip(),         # template/file/etc
                "file_url": payload.get("file_url", "").strip(), # S3 or any URL
                "description": payload.get("description", "").strip(),
                "category": payload.get("category", "").strip(),
                "status": payload.get("status", "active").strip(),
                "tags": payload.get("tags", []),
            }
        )

    # Include any extra fields from payload (non-destructive)
    extras = {k: v for k, v in payload.items() if k not in base}
    base.update(extras)

    logger.info("Creating %s item in table %s: id=%s", resource, table.table_name, item_id)
    table.put_item(Item=base)
    return base

def list_resource_items(
    resource: str, limit: int = 50, last: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    table = choose_table(resource)
    kwargs: Dict[str, Any] = {"Limit": limit}
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
        ReturnValues="ALL_NEW",
    )
    logger.info("Updated read flag on %s id=%s to %s", table.table_name, item_id, read_flag)
    return resp.get("Attributes")

def delete_resource_item(resource: str, item_id: str) -> bool:
    table = choose_table(resource)
    existing = table.get_item(Key={"id": item_id}).get("Item")
    if not existing:
        logger.info("Delete requested for %s id=%s but item not found", table.table_name, item_id)
        return False
    table.delete_item(Key={"id": item_id})
    logger.info("Deleted %s id=%s from table %s", resource, item_id, table.table_name)
    return True

def partial_update_item(resource: str, item_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    table = choose_table(resource)
    updates.pop("id", None)
    if not updates:
        return None

    expr_parts = []
    expr_names: Dict[str, str] = {}
    expr_values: Dict[str, Any] = {}
    idx = 0
    for k, v in updates.items():
        idx += 1
        name_key = f"#f{idx}"
        val_key = f":v{idx}"
        expr_parts.append(f"{name_key} = {val_key}")
        expr_names[name_key] = k
        expr_values[val_key] = v

    expr_parts.append("#u = :u")
    expr_names["#u"] = "updated_at"
    expr_values[":u"] = now_iso()

    update_expr = "SET " + ", ".join(expr_parts)
    resp = table.update_item(
        Key={"id": item_id},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )
    logger.info(
        "Partially updated %s id=%s fields=%s",
        table.table_name,
        item_id,
        list(updates.keys()),
    )
    return resp.get("Attributes")

# -------------------------
# Router
# -------------------------
def route(event: Dict[str, Any]) -> Dict[str, Any]:
    request_context = event.get("requestContext") or {}
    http_ctx = request_context.get("http") or {}

    method = event.get("httpMethod") or http_ctx.get("method", "")
    path_params = event.get("pathParameters") or {}

    raw_path = (
        event.get("rawPath")
        or event.get("path")
        or http_ctx.get("path")
        or "/"
    )

    logger.info("Routing method=%s path=%s", method, raw_path)

    if method == "OPTIONS":
        return make_response(204, None)

    parts = [p for p in raw_path.split("/") if p]
    if not parts:
        return make_response(404, {"error": "no_resource_in_path"})

    resource = parts[0]  # forms | cases | messages | appointments | services

    # POST /files/upload  -> get presigned URL
    if resource == "files" and len(parts) == 2 and parts[1] == "upload" and method == "POST":
        return create_presigned_upload(event)

    try:
        # POST /{resource}
        if method == "POST" and len(parts) == 1:
            payload = parse_json_body(event)

            if resource == "forms":
                if not payload.get("name") or not payload.get("email"):
                    return make_response(400, {"error": "name and email required for forms"})
            if resource == "cases":
                if not payload.get("case_number") or not payload.get("title"):
                    return make_response(400, {"error": "case_number and title required for cases"})
            if resource == "messages":
                if not payload.get("sender") or not payload.get("recipient") or not payload.get("body"):
                    return make_response(400, {"error": "sender, recipient, body required for messages"})
            if resource == "appointments":
                if not payload.get("client") or not payload.get("datetime"):
                    return make_response(400, {"error": "client and datetime required for appointments"})
            if resource == "services":
                if not payload.get("name"):
                    return make_response(400, {"error": "name required for services"})
            if resource == "files":
                if not payload.get("title") or not payload.get("type") or not payload.get("file_url"):
                    return make_response(400,{"error": "title, type and file_url required for files"})

            created = create_resource_item(resource, payload)
            return make_response(201, created)

        # GET /{resource}
        if method == "GET" and len(parts) == 1:
            qs = event.get("queryStringParameters") or {}
            limit = int(qs.get("limit", "50"))
            last = qs.get("last")
            items, last_key = list_resource_items(resource, limit=limit, last=last)
            # FILTER SOFT-DELETED ITEMS (ONLY FOR FORMS)
            if resource == "forms":
                items = [item for item in items if not item.get("is_deleted", False)]
            return make_response(
                200,
                {"items": items, "last": json.dumps(last_key) if last_key else None},
            )

        # GET /{resource}/{id}
        if method == "GET" and (len(parts) == 2 or path_params.get("id")):
            item_id = path_params.get("id") or parts[1]
            item = get_resource_item(resource, item_id)
            if not item:
                return make_response(404, {"error": "not_found"})
            return make_response(200, item)

        # PATCH /{resource}/{id}/read
        if method == "PATCH" and (
            (len(parts) >= 3 and parts[2] == "read")
            or (path_params.get("id") and parts[-1] == "read")
        ):
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

        # PUT /{resource}/{id}
        if method == "PUT" and (len(parts) == 2 or path_params.get("id")):
            item_id = path_params.get("id") or parts[1]
            updates = parse_json_body(event)
            if not updates:
                return make_response(400, {"error": "no_update_fields_provided"})
            updated = partial_update_item(resource, item_id, updates)
            if not updated:
                return make_response(404, {"error": "not_found_or_no_change"})
            return make_response(200, updated)

        # DELETE /{resource}/{id}
        if method == "DELETE" and (len(parts) == 2 or path_params.get("id")):
            item_id = path_params.get("id") or parts[1]
            deleted = delete_resource_item(resource, item_id)
            if not deleted:
                return make_response(404, {"error": "not_found"})
            return make_response(204, None)

        return make_response(
            404, {"error": "route_not_found", "method": method, "path": raw_path}
        )

    except ValueError as ve:
        logger.exception("ValueError in route")
        return make_response(400, {"error": str(ve)})
    except ClientError as ce:
        logger.exception("DynamoDB client error")
        return make_response(
            500, {"error": "dynamodb_error", "message": str(ce)}
        )
    except Exception as ex:
        logger.exception("Unhandled exception")
        return make_response(
            500, {"error": "internal_server_error", "message": str(ex)}
        )

# -------------------------
# Lambda handler
# -------------------------
def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    logger.info(
        "event httpMethod=%s path=%s",
        event.get("httpMethod"),
        event.get("path") or event.get("rawPath"),
    )
    return route(event)