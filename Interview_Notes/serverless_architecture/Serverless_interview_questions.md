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
