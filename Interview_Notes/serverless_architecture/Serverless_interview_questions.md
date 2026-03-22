# Serverless Interview Questions — Extended Edition
## Lambda + API Gateway + DynamoDB + CI/CD
### Core Theory + Practical Scenarios + Trick Questions

---

## SECTION 1 — LAMBDA (35 Questions)

### Core Theory

**Q1. What is the maximum timeout for a Lambda function?**
- 15 minutes (900 seconds)
- Default is 3 seconds — most people forget to increase it
- Interview tip: always mention you tune timeout based on actual p99 execution time + buffer

---

**Q2. What is the difference between Lambda's execution environment and a container?**
- Lambda runs in a **Firecracker microVM** — lightweight VM, not Docker container
- Each execution environment handles one request at a time
- AWS reuses environments (warm start) or creates new ones (cold start)
- You share the microVM between invocations of the SAME function — not between different functions

---

**Q3. What files persist between Lambda invocations?**
- Files written to `/tmp` persist within the same execution environment
- In-memory variables (global scope) persist within same execution environment
- Nothing persists when environment is recycled (after ~15 min idle)
- Use this for: caching, DB connections, loaded ML models

```python
# This persists between warm invocations
cache = {}

def lambda_handler(event, context):
    key = event['key']
    if key in cache:
        return cache[key]  # served from memory — no external call
    result = fetch_from_db(key)
    cache[key] = result
    return result
```

---

**Q4. What is Lambda's /tmp storage limit and when would you use it?**
- Default: 512 MB, max: 10,240 MB (10 GB)
- Use for: downloading files for processing, git clone, temporary computation
- Not shared between invocations unless same execution environment is reused
- Costs extra above 512 MB

---

**Q5. What happens when Lambda hits the account concurrency limit?**
- Synchronous (API Gateway): returns **429 Too Many Requests** to caller
- Asynchronous (S3, SNS): Lambda **retries twice** with delays, then sends to Dead Letter Queue (DLQ)
- SQS trigger: message stays in queue, retried until maxReceiveCount reached

---

**Q6. Explain Lambda aliases and versions.**

```
Lambda Function: my-api
├── Version 1 (immutable snapshot of code + config)
├── Version 2 (immutable snapshot)
├── Version 3 (immutable snapshot — current)
└── Aliases (mutable pointers):
    ├── prod → Version 2
    ├── staging → Version 3
    └── dev → $LATEST (always latest)
```

- **Version**: immutable snapshot — once published, code never changes
- **Alias**: mutable pointer to a version — can shift traffic between versions
- **Canary deployment using alias**:
```bash
# Send 10% to new version, 90% to old
aws lambda update-alias \
  --function-name my-api \
  --name prod \
  --routing-config AdditionalVersionWeights={"3"=0.1}
```

---

**Q7. What is Lambda@Edge and when do you use it?**
- Lambda that runs at **CloudFront edge locations** globally — not in one region
- Triggered by CloudFront events: viewer request, origin request, origin response, viewer response
- Use cases:
  - A/B testing at the edge
  - Redirect based on geography
  - Add security headers
  - Authenticate before hitting origin
- Limitations: max 5 seconds timeout, no environment variables, no VPC, no layers

---

**Q8. How does Lambda handle environment variables and secrets?**
```python
import os
import boto3

# Environment variables (in Lambda config — visible in console)
TABLE_NAME = os.environ['TABLE_NAME']  # non-sensitive config

# SSM Parameter Store (encrypted, not visible in Lambda console)
ssm = boto3.client('ssm')
db_password = ssm.get_parameter(
    Name='/judicial/db/password',
    WithDecryption=True
)['Parameter']['Value']

# Secrets Manager (auto-rotation support)
secrets = boto3.client('secretsmanager')
secret = secrets.get_secret_value(SecretId='judicial/api-key')
```

- Environment variables: encrypted at rest with KMS, but visible in console — for non-sensitive config
- SSM: for sensitive values, cheap ($0.05/10k reads)
- Secrets Manager: for auto-rotating secrets (DB passwords), costs more ($0.40/secret/month)

---

**Q9. What is a Dead Letter Queue (DLQ) in Lambda?**
- For **async invocations only** — where Lambda retries automatically
- After all retries exhausted (2 retries = 3 total attempts), failed event sent to DLQ
- DLQ can be **SQS** or **SNS**
- Use to: investigate failures, replay failed events, alert on failures

```hcl
resource "aws_lambda_function" "processor" {
  ...
  dead_letter_config {
    target_arn = aws_sqs_queue.dlq.arn
  }
}
```

---

**Q10. Explain Lambda Destinations — how is it different from DLQ?**

| | DLQ | Destinations |
|---|---|---|
| Works for | Async only | Async + stream |
| Captures | Failed events only | Success AND failure |
| Target | SQS or SNS only | SQS, SNS, Lambda, EventBridge |
| Payload | Original event | Original event + response/error |

```python
# With Destinations, on success you get:
{
    "requestContext": {...},
    "requestPayload": {"original": "event"},
    "responseContext": {"statusCode": 200},
    "responsePayload": {"message": "processed"}  # your Lambda's return value
}
```

---

### Practical Questions

**Q11. Your Lambda processes S3 file uploads. Files are sometimes 500MB. What issues do you face and how do you solve them?**

Issues:
- Lambda `/tmp` default is 512MB — 500MB file barely fits, no room for processing
- Lambda timeout — processing 500MB may take > 15 minutes

Solutions:
```python
# Option 1: Stream the file instead of downloading completely
import boto3

s3 = boto3.client('s3')

def lambda_handler(event, context):
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = event['Records'][0]['s3']['object']['key']
    
    # Stream — don't download entire file
    response = s3.get_object(Bucket=bucket, Key=key)
    stream = response['Body']
    
    # Process line by line
    for line in stream.iter_lines():
        process_line(line)
```

- Option 2: Increase `/tmp` to 10GB in Lambda config
- Option 3: Use **S3 Select** to query only needed data from file
- Option 4: Use **AWS Batch** or **ECS Fargate** for heavy processing — Lambda is wrong tool

---

**Q12. How do you debug a Lambda that works locally but fails in AWS?**

Checklist:
```
1. Check CloudWatch Logs — what's the actual error?
   Lambda → Monitor → View CloudWatch Logs

2. IAM permissions — Lambda role missing permissions?
   Error: "AccessDenied" → add policy to Lambda execution role

3. Environment variables — set in AWS? Match local .env?
   Lambda → Configuration → Environment variables

4. VPC configuration — Lambda in VPC trying to reach internet?
   Need NAT Gateway in VPC for outbound internet

5. Timeout — local has no timeout, Lambda defaults to 3s
   Increase timeout in Lambda configuration

6. Package size — dependencies included in deployment?
   Lambda can't pip install at runtime

7. Runtime version — Python 3.12 locally, 3.9 in Lambda?
   Match runtime versions

8. Enable X-Ray tracing — identifies exactly which line/service is slow
```

---

**Q13. Write a Lambda function that reads from SQS, processes messages in batch, and handles partial failures.**

```python
import json
import boto3

def lambda_handler(event, context):
    failed_message_ids = []
    
    for record in event['Records']:
        message_id = record['messageId']
        body = json.loads(record['body'])
        
        try:
            process_message(body)
        except Exception as e:
            print(f"Failed to process {message_id}: {e}")
            # Report failure — this message will be retried
            failed_message_ids.append({'itemIdentifier': message_id})
    
    # Return failed items — Lambda will retry only these
    # Successfully processed messages are auto-deleted from queue
    return {
        'batchItemFailures': failed_message_ids
    }

def process_message(body):
    # your business logic here
    pass
```

Key point: `batchItemFailures` — only failed messages go back to queue. Without this, if ANY message fails, ALL messages in the batch are retried — causing duplicates.

---

**Q14. Your Lambda function connects to RDS. Under high load you get "Too many connections" error. Why and how do you fix it?**

Why:
```
Lambda scales to 1000 concurrent executions
Each Lambda creates 1 DB connection
RDS max_connections = 100 (for small instance)
1000 > 100 → connection refused
```

Fix — **RDS Proxy:**
```
Lambda 1 ─┐
Lambda 2 ─┤→ RDS Proxy (connection pool) → RDS
Lambda 3 ─┤   (maintains 100 connections)
...1000   ─┘
```

```hcl
resource "aws_db_proxy" "main" {
  name                   = "judicial-proxy"
  debug_logging          = false
  engine_family          = "POSTGRESQL"
  idle_client_timeout    = 1800
  require_tls            = true
  role_arn               = aws_iam_role.rds_proxy.arn
  vpc_security_group_ids = [aws_security_group.rds.id]
  vpc_subnet_ids         = aws_subnet.private[*].id

  auth {
    auth_scheme = "SECRETS"
    secret_arn  = aws_secretsmanager_secret.db.arn
  }
}
```

RDS Proxy maintains a warm pool of connections — Lambda connects to proxy, proxy reuses DB connections.

---

**Q15. How do you implement a retry mechanism in Lambda with exponential backoff?**

```python
import time
import random
import boto3
from botocore.exceptions import ClientError

def call_with_retry(func, max_retries=3):
    for attempt in range(max_retries):
        try:
            return func()
        except ClientError as e:
            if e.response['Error']['Code'] == 'ThrottlingException':
                if attempt == max_retries - 1:
                    raise
                # Exponential backoff with jitter
                wait = (2 ** attempt) + random.uniform(0, 1)
                print(f"Throttled. Waiting {wait:.2f}s before retry {attempt + 1}")
                time.sleep(wait)
            else:
                raise

def lambda_handler(event, context):
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table('users')
    
    result = call_with_retry(
        lambda: table.get_item(Key={'userId': event['userId']})
    )
    return result
```

---

**Q16. What is the difference between Lambda's synchronous and asynchronous error handling?**

```
Synchronous (API Gateway → Lambda):
  Error → returned to API Gateway → 502 to client
  No automatic retry
  Caller must handle retry

Asynchronous (S3 → Lambda):
  Error → Lambda retries twice (3 total attempts)
  Retry 1: after 1 minute
  Retry 2: after 2 minutes
  All fail → DLQ or Destination (if configured)
  
Stream (SQS/DynamoDB → Lambda):
  Error → batch stays in queue/stream
  Lambda retries until success or maxReceiveCount
  Use batchItemFailures for partial batch success
```

---

**Q17. You need Lambda to process events in order. How do you achieve this?**

- SQS standard queue: no ordering guarantee
- **SQS FIFO queue**: ordered within a message group
- **DynamoDB Streams**: ordered per partition key
- **Kinesis**: ordered within a shard

```python
# SQS FIFO — send with MessageGroupId
sqs.send_message(
    QueueUrl=fifo_queue_url,
    MessageBody=json.dumps(event),
    MessageGroupId='user-123',  # all messages for user-123 processed in order
    MessageDeduplicationId=str(uuid.uuid4())
)
```

---

**Q18. How do you implement a Lambda warmer to reduce cold starts?**

```yaml
# EventBridge rule — ping Lambda every 5 minutes
resource "aws_cloudwatch_event_rule" "warmer" {
  name                = "lambda-warmer"
  schedule_expression = "rate(5 minutes)"
}

resource "aws_cloudwatch_event_target" "warmer" {
  rule      = aws_cloudwatch_event_rule.warmer.name
  target_id = "WarmLambda"
  arn       = aws_lambda_function.api.arn
  input     = jsonencode({"warmer": true, "concurrency": 3})
}
```

```python
def lambda_handler(event, context):
    # Handle warmer ping — don't process as real request
    if event.get('warmer'):
        print(f"Warming up — concurrency: {event.get('concurrency', 1)}")
        return {'warmed': True}
    
    return route(event)
```

Note: Warming is unreliable — **Provisioned Concurrency** is the proper solution.

---

## SECTION 2 — API GATEWAY (25 Questions)

### Core Theory

**Q19. What is the maximum integration timeout for API Gateway?**
- **29 seconds** — hard limit, cannot be increased
- If your Lambda takes > 29 seconds → API Gateway returns 504 Gateway Timeout
- Solution: switch to async pattern (API GW → SQS → Lambda → result via WebSocket/polling)

---

**Q20. Explain the API Gateway request/response lifecycle.**

```
Client Request
    ↓
Method Request      ← validates headers, query params, body
    ↓
Integration Request ← transforms request (mapping templates)
    ↓
Lambda / Backend
    ↓
Integration Response ← transforms response (mapping templates)
    ↓
Method Response     ← sets HTTP status codes, headers
    ↓
Client Response
```

With Lambda Proxy integration — steps 2,3,4,5 are bypassed — Lambda gets raw request and controls raw response.

---

**Q21. What is CORS and how do you enable it in API Gateway?**

CORS (Cross-Origin Resource Sharing) — browser security policy that blocks requests from different domains.

```
judicialsolutions.in (frontend) → api.judicialsolutions.in (API Gateway)
Different origin → browser sends OPTIONS preflight request
→ API Gateway must respond with CORS headers
→ Browser allows the actual request
```

Enable in API Gateway:
```
REST API:
  Select resource → Actions → Enable CORS
  Adds OPTIONS method with correct headers

HTTP API:
  Configuration → CORS → Add origin, methods, headers
```

Or handle in Lambda:
```python
def lambda_handler(event, context):
    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': 'https://judicialsolutions.in',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization'
        },
        'body': json.dumps({'data': 'response'})
    }
```

---

**Q22. How do you implement request validation in API Gateway?**

REST API only — HTTP API doesn't support this:
```
API Gateway → Model (JSON Schema) → Validates request body
If invalid → 400 Bad Request returned WITHOUT hitting Lambda
Saves Lambda invocation cost + reduces load
```

```json
// Model (JSON Schema)
{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "required": ["name", "email"],
  "properties": {
    "name": {"type": "string", "minLength": 1},
    "email": {"type": "string", "format": "email"}
  }
}
```

---

**Q23. What are mapping templates in API Gateway?**

Velocity Template Language (VTL) scripts that transform request/response between API Gateway and backend — only in REST API non-proxy integration.

```
# Transform incoming request before sending to Lambda
#set($body = $input.json('$'))
{
  "userId": "$input.params('userId')",
  "body": $body,
  "stage": "$context.stage"
}
```

With Lambda Proxy integration — mapping templates not needed — Lambda handles transformation.

---

**Q24. How do you secure an API Gateway endpoint so only your CloudFront distribution can access it?**

```python
# Add custom header in CloudFront origin request
# CloudFront → API Gateway with secret header

# In API Gateway — Lambda Authorizer checks header
def authorizer_handler(event, context):
    token = event['headers'].get('x-origin-verify')
    
    if token == os.environ['CLOUDFRONT_SECRET']:
        return generate_policy('allow', event['methodArn'])
    else:
        return generate_policy('deny', event['methodArn'])
```

Or use **AWS WAF** attached to API Gateway — only allow requests from CloudFront IP ranges.

---

**Q25. Explain API Gateway stages and how you use them for blue/green deployments.**

```
API Gateway
├── Stage: prod  → Lambda alias: prod → Lambda version 5
├── Stage: v2    → Lambda alias: v2   → Lambda version 6 (new)
└── Stage: dev   → Lambda alias: dev  → $LATEST

Blue/Green process:
1. Deploy new code → Lambda version 6
2. Create/update stage v2 → points to v6
3. Test v2 endpoint thoroughly
4. Update prod stage → points to v6
5. Instant cutover — no downtime
6. Rollback: prod stage → points back to v5
```

---

### Practical Questions

**Q26. Your API Gateway is returning 403 for every request. What do you check?**

```
Checklist:
1. Resource policy — does it block your IP or source?
2. Lambda authorizer — returning Deny policy?
3. Cognito authorizer — token expired or invalid?
4. IAM authorization — caller doesn't have execute-api:Invoke permission?
5. API key required but not provided?
6. Usage plan throttled?
7. Stage doesn't exist or wrong URL?

Debug:
- Enable CloudWatch logs on API Gateway (not on by default)
  Stage → Logs/Tracing → Enable CloudWatch Logs
- Check the execution log — shows exactly which step rejected
```

---

**Q27. How would you rate limit specific users/customers on your API?**

```
Solution: Usage Plans + API Keys

1. Create Usage Plan:
   - 1000 requests/day
   - 10 requests/second (rate)
   - 50 requests/second (burst)

2. Create API Key per customer:
   aws apigateway create-api-key --name "customer-abc" --enabled

3. Associate API key with usage plan

4. Customer sends key in header:
   x-api-key: abc123def456

5. API Gateway enforces limits per key
   → 429 when exceeded
```

---

**Q28. How do you handle large payloads (>10MB) through API Gateway?**

API Gateway max payload = 10MB — hard limit.

Solutions:
```
Option 1: Presigned S3 URL pattern
  Client → API Gateway → Lambda → generates S3 presigned URL → returns URL
  Client → uploads directly to S3 (bypasses API Gateway)
  S3 → triggers Lambda for processing

Option 2: Multipart upload
  Split large payload into chunks < 10MB
  Send each chunk separately
  Lambda reassembles

Option 3: Use CloudFront → ALB instead of API Gateway
  ALB has higher payload limits
```

---

**Q29. Write the Lambda response format for API Gateway — what happens if you get it wrong?**

```python
# CORRECT — Lambda Proxy response format
def lambda_handler(event, context):
    return {
        'statusCode': 200,                    # required — integer
        'headers': {                           # optional
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps({'data': 'value'}), # required — must be STRING
        'isBase64Encoded': False               # optional
    }

# WRONG — body not stringified
return {
    'statusCode': 200,
    'body': {'data': 'value'}  # dict, not string → 502 Bad Gateway
}

# WRONG — statusCode missing
return {
    'body': json.dumps({'data': 'value'})  # → 502 Bad Gateway
}

# WRONG — statusCode as string
return {
    'statusCode': '200',  # must be int → 502 Bad Gateway
    'body': json.dumps({'data': 'value'})
}
```

Common interview question: "Your API returns 502 — what are the possible causes?"
- Lambda response format wrong (above)
- Lambda timed out
- Lambda threw unhandled exception
- Lambda returned nothing (no return statement)

---

**Q30. How do you implement WebSocket API with API Gateway for real-time notifications?**

```
Client connects → API Gateway WebSocket → Lambda (onConnect)
Client sends message → API Gateway → Lambda (onMessage)
Server pushes to client → Lambda → API Gateway Management API → Client
Client disconnects → API Gateway → Lambda (onDisconnect)
```

```python
import boto3
import json
import os

# Push message to connected client FROM Lambda
def send_to_client(connection_id, message):
    apigw = boto3.client(
        'apigatewaymanagementapi',
        endpoint_url=f"https://{os.environ['API_ID']}.execute-api.{os.environ['REGION']}.amazonaws.com/{os.environ['STAGE']}"
    )
    
    apigw.post_to_connection(
        ConnectionId=connection_id,
        Data=json.dumps(message)
    )

def lambda_handler(event, context):
    route = event['requestContext']['routeKey']
    connection_id = event['requestContext']['connectionId']
    
    if route == '$connect':
        # Store connection_id in DynamoDB
        save_connection(connection_id)
        
    elif route == '$disconnect':
        # Remove from DynamoDB
        remove_connection(connection_id)
        
    elif route == 'sendMessage':
        body = json.loads(event['body'])
        # Broadcast to all connected clients
        for conn_id in get_all_connections():
            send_to_client(conn_id, body)
    
    return {'statusCode': 200}
```

---

## SECTION 3 — DYNAMODB (30 Questions)

### Core Theory

**Q31. What is the difference between eventually consistent and strongly consistent reads in DynamoDB?**

```
Eventually Consistent (default):
  Read might return stale data (up to 1 second old)
  Uses any replica — could be slightly behind
  Cost: 0.5 RCU per 4KB
  
Strongly Consistent:
  Always returns latest data
  Routes to leader node only
  Cost: 1 RCU per 4KB (2x expensive)
  Not available for GSIs

When to use strongly consistent:
  - Reading immediately after write
  - Financial transactions
  - Inventory management
```

```python
# Eventually consistent (default, cheaper)
table.get_item(Key={'userId': 'u1'})

# Strongly consistent (latest data, 2x cost)
table.get_item(
    Key={'userId': 'u1'},
    ConsistentRead=True
)
```

---

**Q32. Explain DynamoDB's read/write capacity units with calculations.**

```
RCU (Read Capacity Unit):
  1 RCU = 1 strongly consistent read/second for items ≤ 4KB
  1 RCU = 2 eventually consistent reads/second for items ≤ 4KB
  
  Example: item size 10KB, strongly consistent
  RCUs needed = ceil(10KB / 4KB) = 3 RCUs per read

WCU (Write Capacity Unit):
  1 WCU = 1 write/second for items ≤ 1KB
  
  Example: item size 3.5KB
  WCUs needed = ceil(3.5KB / 1KB) = 4 WCUs per write

Transactional reads/writes:
  2x the normal RCU/WCU cost
```

---

**Q33. What is DynamoDB Accelerator (DAX) and when do you use it?**

```
DynamoDB → DAX (in-memory cache) → Application

DAX:
  - In-memory cache for DynamoDB
  - Microsecond read latency (vs milliseconds)
  - Item cache: caches individual GetItem results
  - Query cache: caches Query/Scan results
  - Write-through: writes go to both DAX and DynamoDB
  
When to use:
  - Read-heavy workloads
  - Same items read repeatedly
  - Need microsecond latency
  
When NOT to use:
  - Write-heavy workloads
  - Strongly consistent reads required (DAX is eventually consistent)
  - Rarely read items
```

---

**Q34. What is DynamoDB's item size limit and what do you do if you exceed it?**

- Max item size: **400 KB**

Solutions if exceeded:
```
Option 1: Store large attribute in S3, store S3 key in DynamoDB
  DynamoDB item: {userId: "u1", profileS3Key: "profiles/u1.json"}
  Large data: stored in S3

Option 2: Compress the attribute
  import gzip, base64
  compressed = base64.b64encode(gzip.compress(large_data.encode()))
  table.put_item(Item={'userId': 'u1', 'data': compressed})

Option 3: Split item across multiple items
  {userId: "u1", chunk: "1", data: "first 200KB"}
  {userId: "u1", chunk: "2", data: "next 200KB"}
```

---

**Q35. Explain DynamoDB Transactions.**

```python
# All operations succeed or all fail — ACID transactions
dynamodb = boto3.client('dynamodb')

# Transfer money between accounts
dynamodb.transact_write_items(
    TransactItems=[
        {
            'Update': {
                'TableName': 'Accounts',
                'Key': {'accountId': {'S': 'acc-1'}},
                'UpdateExpression': 'SET balance = balance - :amount',
                'ConditionExpression': 'balance >= :amount',  # don't go negative
                'ExpressionAttributeValues': {':amount': {'N': '100'}}
            }
        },
        {
            'Update': {
                'TableName': 'Accounts',
                'Key': {'accountId': {'S': 'acc-2'}},
                'UpdateExpression': 'SET balance = balance + :amount',
                'ExpressionAttributeValues': {':amount': {'N': '100'}}
            }
        }
    ]
)
```

- Max 100 items per transaction
- Costs 2x normal read/write capacity
- Use for: financial operations, inventory, multi-table consistency

---

### Practical Questions

**Q36. Design a DynamoDB table for a chat application with these access patterns:**
- Get all messages in a room
- Get messages in a room after a timestamp
- Get a specific message

```
Table: Messages
PK: roomId (partition key)
SK: timestamp#messageId (sort key — composite for uniqueness)

Access patterns:
- All messages in room:
  Query PK = "room-1"
  
- Messages after timestamp:
  Query PK = "room-1" AND SK > "2024-03-01T10:00:00"
  
- Specific message:
  GetItem PK = "room-1" SK = "2024-03-01T10:05:23#msg-uuid"

Items:
{
  "roomId": "room-1",
  "timestamp#messageId": "2024-03-01T10:05:23#abc-123",
  "userId": "user-1",
  "message": "Hello!",
  "type": "text"
}
```

---

**Q37. Your DynamoDB table is being throttled despite having enough WCU. Why?**

```
Scenario:
  Provisioned: 100 WCU
  Actual usage: 80 WCU average
  Still throttled

Root cause: Hot partition

DynamoDB distributes WCU across partitions
If you have 10 partitions: each gets 10 WCU
If 90 WCU hits ONE partition → throttled (10 WCU limit on that partition)

Diagnosis:
  CloudWatch → DynamoDB → ConsumedWriteCapacityUnits
  Look for spikes on specific operations

Fix:
  1. Better partition key (higher cardinality)
  2. Write sharding — add random suffix
  3. Switch to on-demand — AWS manages partition scaling
  4. Use DynamoDB Streams + batch writes to spread load
```

---

**Q38. How do you implement pagination in DynamoDB?**

```python
def get_all_users(table, page_size=25, last_key=None):
    kwargs = {
        'Limit': page_size
    }
    
    # Continue from where we left off
    if last_key:
        kwargs['ExclusiveStartKey'] = last_key
    
    response = table.scan(**kwargs)
    
    items = response['Items']
    
    # LastEvaluatedKey = None means no more pages
    next_key = response.get('LastEvaluatedKey')
    
    return items, next_key

# Usage:
items, next_key = get_all_users(table)
# Pass next_key to client — client sends it back for next page

# API pattern:
# GET /users?pageToken=<base64 encoded LastEvaluatedKey>
# Response: {items: [...], nextPageToken: "..."}
```

---

**Q39. How do you implement optimistic locking in DynamoDB?**

```python
# Prevent lost updates when multiple processes update same item

def update_with_lock(table, user_id, new_name, current_version):
    try:
        table.update_item(
            Key={'userId': user_id},
            UpdateExpression='SET #name = :name, version = version + :inc',
            ConditionExpression='version = :current_version',
            ExpressionAttributeNames={'#name': 'name'},
            ExpressionAttributeValues={
                ':name': new_name,
                ':inc': 1,
                ':current_version': current_version  # fails if version changed
            }
        )
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        # Another process updated first — retry with fresh data
        raise OptimisticLockException("Item was updated by another process")
```

---

**Q40. How do you implement TTL (Time To Live) in DynamoDB?**

```python
from datetime import datetime, timedelta
import time

# Enable TTL on table (one-time setup)
# DynamoDB → Table → Additional settings → TTL → Enable → attribute: ttl

# When writing item — set TTL as Unix timestamp
def create_session(table, user_id, session_token):
    # Expire session in 24 hours
    expiry = int(time.time()) + (24 * 60 * 60)
    
    table.put_item(Item={
        'sessionId': session_token,
        'userId': user_id,
        'createdAt': datetime.utcnow().isoformat(),
        'ttl': expiry  # DynamoDB auto-deletes when current time > ttl
    })

# DynamoDB deletes expired items within 48 hours (not instant)
# Don't rely on TTL for exact-time deletion — use for cleanup only
```

---

**Q41. Design a DynamoDB table for an e-commerce order system.**

```
Access patterns to support:
1. Get order by orderId
2. Get all orders for a customer
3. Get orders by status (pending, shipped, delivered)
4. Get orders in a date range for a customer

Table: Orders
PK: orderId
SK: (none — simple primary key)

GSI 1: CustomerOrders
  PK: customerId
  SK: createdAt
  → supports patterns 2 and 4

GSI 2: StatusIndex  
  PK: status
  SK: createdAt
  → supports pattern 3

Items:
{
  "orderId": "ord-123",
  "customerId": "cust-456",
  "status": "pending",
  "createdAt": "2024-03-01T10:00:00",
  "total": 1500,
  "items": [...]
}

Queries:
Pattern 1: GetItem orderId="ord-123"
Pattern 2: GSI1 Query customerId="cust-456"
Pattern 3: GSI2 Query status="pending"
Pattern 4: GSI1 Query customerId="cust-456" AND createdAt BETWEEN dates
```

---

## SECTION 4 — CI/CD FOR SERVERLESS (20 Questions)

### Core Theory

**Q42. What is the difference between SAM and Serverless Framework?**

| | AWS SAM | Serverless Framework |
|---|---|---|
| Made by | AWS | Third party (Serverless Inc.) |
| Cloud support | AWS only | AWS, Azure, GCP, more |
| Language | CloudFormation extension | Own DSL |
| Local testing | sam local | serverless invoke local |
| Cost | Free | Free (paid tiers for teams) |
| Community | Smaller | Larger |
| Best for | AWS-only teams | Multi-cloud or existing Serverless users |

---

**Q43. How do you manage different environments (dev/staging/prod) in serverless CI/CD?**

```yaml
# SAM — use parameters
Parameters:
  Env:
    Type: String
    AllowedValues: [dev, staging, prod]

Resources:
  UsersTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub "users-${Env}"  # users-dev, users-staging, users-prod
      
# Deploy:
sam deploy --parameter-overrides Env=staging
```

```yaml
# GitHub Actions — separate jobs per environment
jobs:
  deploy-dev:
    environment: dev
    steps:
      - run: sam deploy --parameter-overrides Env=dev
  
  deploy-staging:
    needs: deploy-dev
    environment: staging
    steps:
      - run: sam deploy --parameter-overrides Env=staging
  
  deploy-prod:
    needs: deploy-staging
    environment: production  # requires manual approval
    steps:
      - run: sam deploy --parameter-overrides Env=prod
```

---

**Q44. How do you implement canary deployments for Lambda using CI/CD?**

```yaml
# SAM — built-in canary deployment via CodeDeploy
Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      ...
      AutoPublishAlias: live  # auto-publish new version on deploy
      DeploymentPreference:
        Type: Canary10Percent5Minutes  # 10% traffic to new, shift 100% after 5min
        Alarms:
          - !Ref ErrorRateAlarm  # rollback if alarm fires
        Hooks:
          PreTraffic: !Ref PreTrafficTest  # run tests before shifting traffic
```

Types:
- `Canary10Percent5Minutes` — 10% for 5 min, then 100%
- `Linear10PercentEvery1Minute` — add 10% every minute
- `AllAtOnce` — immediate (no canary)

---

**Q45. How do you test Lambda functions in CI/CD before deploying to production?**

```
Testing pyramid for serverless:

Unit tests (fast, no AWS):
  Mock boto3 calls
  Test business logic only
  Run: pytest tests/unit/

Integration tests (real AWS, staging):
  Deploy to staging first
  Call real API endpoints
  Verify DynamoDB records created
  Run: pytest tests/integration/ --env=staging

End-to-end tests (real AWS, production-like):
  Full user journey
  Smoke tests after deployment
  Run: pytest tests/e2e/
```

```python
# Unit test with mocked DynamoDB
import pytest
from unittest.mock import patch, MagicMock
import json

@patch('create_user.boto3')
def test_create_user_success(mock_boto3):
    # Setup mock
    mock_table = MagicMock()
    mock_boto3.resource.return_value.Table.return_value = mock_table
    mock_table.put_item.return_value = {}
    
    # Call handler
    from create_user import lambda_handler
    event = {
        'body': json.dumps({'name': 'Aditya', 'email': 'a@b.com'})
    }
    result = lambda_handler(event, {})
    
    # Assert
    assert result['statusCode'] == 201
    mock_table.put_item.assert_called_once()
```

---

**Q46. What is SAM Accelerate and how does it speed up deployments?**

```bash
# Normal sam deploy: 2-3 minutes
# SAM Accelerate: 10-30 seconds for code-only changes

# Start sync session
sam sync --stack-name judicial-prod --watch

# SAM monitors for changes:
# Code change only → direct Lambda update (bypasses CloudFormation)
# Config change → full CloudFormation update
# New resource → full CloudFormation update

# Only use in dev/staging — not for production deployments
# Production should always go through CloudFormation for auditability
```

---

### Practical Questions

**Q47. Your production Lambda deployment failed halfway. Some functions are on new version, some on old. How do you handle this?**

```
Scenario: 5 Lambda functions, deploy failed after updating 3
Result: 3 new + 2 old = inconsistent state

Prevention (SAM/CloudFormation):
  All-or-nothing deployment — CloudFormation rollback on failure
  If ANY resource fails → all resources rolled back to previous state
  This is the main benefit of IaC over manual deployments

If it happens anyway:
  Option 1: Re-run the deployment — CloudFormation detects what changed
  Option 2: Manual rollback — update 3 new functions back to previous version
  aws lambda update-function-code \
    --function-name func-1 \
    --s3-bucket artifact-bucket \
    --s3-key previous-version.zip

Monitoring: CloudWatch dashboards showing which version each function is on
  aws lambda list-functions --query 'Functions[*].[FunctionName,Version]'
```

---

**Q48. How do you store and manage Terraform state for a serverless project in a team?**

```hcl
# backend.tf — shared remote state
terraform {
  backend "s3" {
    bucket         = "judicial-terraform-state"
    key            = "judicial-solutions/prod/terraform.tfstate"
    region         = "ap-south-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

# Create the S3 bucket and DynamoDB table first (bootstrap):
aws s3 mb s3://judicial-terraform-state --region ap-south-1
aws s3api put-bucket-versioning \
  --bucket judicial-terraform-state \
  --versioning-configuration Status=Enabled

aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

---

**Q49. How do you implement automatic rollback in GitHub Actions if deployment fails?**

```yaml
jobs:
  deploy:
    steps:
      - name: Get current Lambda version (before deploy)
        id: current_version
        run: |
          VERSION=$(aws lambda get-alias \
            --function-name judicial-api \
            --name prod \
            --query 'FunctionVersion' \
            --output text)
          echo "version=$VERSION" >> $GITHUB_OUTPUT

      - name: Deploy
        id: deploy
        run: sam deploy --stack-name judicial-prod
        continue-on-error: true

      - name: Smoke test
        id: smoke_test
        if: steps.deploy.outcome == 'success'
        run: pytest tests/smoke/ --env=prod
        continue-on-error: true

      - name: Rollback if smoke test failed
        if: steps.smoke_test.outcome == 'failure'
        run: |
          echo "Smoke test failed — rolling back to version ${{ steps.current_version.outputs.version }}"
          aws lambda update-alias \
            --function-name judicial-api \
            --name prod \
            --function-version ${{ steps.current_version.outputs.version }}

      - name: Fail job if rollback was triggered
        if: steps.smoke_test.outcome == 'failure'
        run: exit 1
```

---

**Q50. Complete scenario: A user reports that creating an account on your serverless app fails randomly. Walk through your debugging process.**

```
Step 1: CloudWatch Logs
  Lambda → /aws/lambda/create-user → Filter: ERROR
  Find the error message and stack trace
  Note the requestId

Step 2: X-Ray trace
  X-Ray → Traces → filter by URL/error
  See which service segment is failing:
  API Gateway → Lambda → DynamoDB → which one?

Step 3: Check metrics
  Lambda: Error count, Duration, Throttles
  DynamoDB: ConsumedWriteCapacity, ThrottledRequests
  API Gateway: 4xx, 5xx rates

Step 4: Reproduce locally
  sam local invoke CreateUserFunction --event events/create_user.json

Step 5: Common causes for "random" failures:
  - DynamoDB throttling (on-demand lag)
  - Lambda cold start timeout
  - Cognito rate limits
  - Duplicate email causing ConditionalCheckFailed
  - Race condition in userId generation

Step 6: Fix and verify
  Deploy fix to staging
  Run integration tests
  Monitor for 30 minutes
  Deploy to prod
  Monitor again
```

---

## TRICK QUESTIONS (Often asked to catch you off guard)

**Q51. Can Lambda access the internet if it's NOT in a VPC?**
- **Yes** — Lambda outside VPC has internet access by default
- Lambda outside VPC runs in AWS-managed network with internet access
- Lambda INSIDE VPC loses internet access (needs NAT Gateway)
- Common misconception: people think VPC gives internet — it actually takes it away unless you configure NAT

---

**Q52. DynamoDB is serverless — does it ever go cold?**
- **No** — DynamoDB has no cold start concept
- Always available, always fast (single-digit ms)
- Only Lambda has cold starts among serverless services

---

**Q53. Can you run Lambda for 30 minutes for a long-running task?**
- **No** — max 15 minutes
- For longer tasks: AWS Batch, ECS Fargate, Step Functions (orchestrate multiple Lambdas), EC2

---

**Q54. Is API Gateway free tier permanent?**
- REST API: 1 million calls/month free for 12 months only
- HTTP API: 1 million calls/month free for 12 months only
- After 12 months: you pay for every call
- WebSocket: no free tier

---

**Q55. Can two different Lambda functions share the same execution environment?**
- **No** — each execution environment is dedicated to one function
- Different functions never share environments
- Same function can reuse its own environment (warm start)
- This is why global variables in one function don't affect another

---

## QUICK REFERENCE

### Lambda error codes:
| Code | Meaning |
|---|---|
| 200 | Success |
| 429 | Throttled (concurrency limit) |
| 500 | Function error |
| 502 | Bad gateway (wrong response format) |
| 503 | Service unavailable |
| 504 | Integration timeout (>29s) |

### DynamoDB operation costs:
| Operation | Cost |
|---|---|
| GetItem (eventually consistent, 4KB) | 0.5 RCU |
| GetItem (strongly consistent, 4KB) | 1 RCU |
| PutItem (1KB) | 1 WCU |
| Query | RCUs for all returned items |
| Scan | RCUs for ALL items in table |
| Transaction read | 2x normal RCU |
| Transaction write | 2x normal WCU |

### GitHub Actions key concepts:
| Concept | Purpose |
|---|---|
| `needs` | Job dependency — run after another job |
| `environment` | Named environment with protection rules |
| `secrets` | Encrypted values — never shown in logs |
| `outputs` | Pass values between steps/jobs |
| `continue-on-error` | Don't fail job if step fails |
| `if` | Conditional step execution |
| `matrix` | Run job with multiple configs |
