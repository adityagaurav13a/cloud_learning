# Complete Serverless Architecture Deep Dive
## Lambda + API Gateway + DynamoDB + CI/CD
### Theory → Interview Questions → Hands-on Steps

---

## PART 1 — LAMBDA DEEP DIVE

### What is Lambda?
Lambda is AWS's serverless compute service — you upload code, AWS runs it.
No servers to manage, no OS to patch, no capacity to plan.

```
You write code → Upload to Lambda → AWS runs it when triggered
You pay only for: number of invocations + duration (ms)
```

### How Lambda actually works internally:
```
First request (cold start):
  AWS finds available capacity
  → Downloads your code from S3
  → Starts a container (execution environment)
  → Initialises your runtime (Python/Node/Java)
  → Runs your init code (outside handler)
  → Runs your handler function
  → Container stays warm for ~15 minutes

Subsequent requests (warm start):
  → Reuses existing container
  → Runs your handler function only
  → Much faster (no init overhead)
```

### Cold Starts — Deep Dive

**What causes cold start latency:**
| Runtime | Typical Cold Start |
|---|---|
| Python | ~100-300ms |
| Node.js | ~100-200ms |
| Java | 1-3 seconds (JVM startup) |
| Go | ~50-100ms |
| .NET | ~500ms-1s |

**What affects cold start duration:**
1. **Runtime** — compiled languages (Java, .NET) are slower
2. **Package size** — larger deployment package = longer download
3. **VPC** — Lambda in VPC creates ENI — adds 1-10 seconds (fixed in 2019 with hyperplane ENIs, now ~500ms extra)
4. **Memory** — more memory = more CPU = faster init
5. **Init code** — DB connections, SDK clients initialised outside handler run every cold start

**How to reduce cold starts:**
```python
# BAD — DB connection created on every invocation
def handler(event, context):
    conn = create_db_connection()  # cold AND warm start
    return query(conn)

# GOOD — DB connection created once per container lifetime
conn = create_db_connection()  # only on cold start

def handler(event, context):
    return query(conn)  # reuses connection
```

**Solutions for cold start problems:**
1. **Provisioned Concurrency** — pre-warm N containers, always ready, costs money
2. **Lambda SnapStart** (Java only) — snapshots initialised execution environment
3. **Scheduled warming** — ping Lambda every 5 minutes (not reliable)
4. **Use lighter runtimes** — Python/Node instead of Java for latency-sensitive
5. **Reduce package size** — use Lambda Layers for dependencies

---

### Lambda Concurrency

**How concurrency works:**
```
Request 1 arrives → Container 1 handles it (busy)
Request 2 arrives → Container 2 spun up (new cold start)
Request 3 arrives → Container 3 spun up
...
Request N arrives → Container N (hits concurrency limit → throttled)
```

**Three concurrency limits:**
| Type | Limit | Scope |
|---|---|---|
| Account concurrent executions | 1000 (default) | All Lambdas in region |
| Reserved concurrency | You set it | Specific function — guaranteed + capped |
| Provisioned concurrency | You set it | Pre-warmed containers |

**Reserved vs Provisioned:**
- **Reserved**: guarantees X containers for this function (subtracts from account pool), caps at X (throttle above)
- **Provisioned**: pre-initialised containers — eliminates cold starts, costs money even when idle

**Throttling:**
- Sync invocation (API Gateway) → returns 429 error to caller
- Async invocation (S3, SNS) → Lambda retries automatically (2 times, with delays)
- SQS → message stays in queue, retried up to maxReceiveCount

---

### Lambda Triggers (Event Sources)

| Trigger | Invocation Type | Use Case |
|---|---|---|
| API Gateway | Synchronous | REST APIs, web requests |
| ALB | Synchronous | HTTP endpoints |
| S3 | Asynchronous | File processing on upload |
| SNS | Asynchronous | Fan-out notifications |
| SQS | Polling (sync) | Queue processing, batch |
| DynamoDB Streams | Polling (sync) | React to DB changes |
| EventBridge | Asynchronous | Scheduled jobs, event routing |
| Cognito | Synchronous | Auth triggers (pre-signup, post-confirm) |
| CloudFront | Synchronous | Edge functions (Lambda@Edge) |

---

### Lambda Layers
Layers let you share code/dependencies across multiple Lambda functions without including them in every deployment package.

```
Without layers:
  function-a.zip (50MB) = your code (1MB) + numpy/pandas (49MB)
  function-b.zip (50MB) = your code (1MB) + numpy/pandas (49MB)

With layers:
  numpy-layer.zip (49MB) — shared layer
  function-a.zip (1MB) = your code only
  function-b.zip (1MB) = your code only
```

**Limits:**
- Max 5 layers per function
- Total unzipped size (function + layers) ≤ 250MB
- Layers are immutable — each version gets a new ARN

**Common use cases:**
- Python dependencies (numpy, pandas, requests)
- Shared utility libraries across functions
- AWS SDK custom version
- Custom runtimes

---

### Lambda Hands-on: Deploy a Python function

#### Step 1 — Create function in console
```
Lambda → Create function
Runtime: Python 3.12
Architecture: x86_64
Execution role: Create new role with basic Lambda permissions
```

#### Step 2 — Write handler
```python
import json

def lambda_handler(event, context):
    name = event.get('name', 'World')
    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': f'Hello, {name}!'
        })
    }
```

#### Step 3 — Test with event
```json
{
  "name": "Aditya"
}
```

#### Step 4 — Check CloudWatch Logs
```
Lambda → Monitor → View CloudWatch Logs
Look for: INIT_START (cold start), START, END, REPORT
REPORT shows: Duration, Billed Duration, Memory Used, Init Duration
```

---

### Lambda Interview Questions

**Q: Your Lambda runs fine locally but times out in AWS. Why?**
- Default timeout is 3 seconds — increase it (max 15 min)
- Lambda in VPC? ENI creation adds latency
- Connecting to RDS or external service? Network latency + connection time
- Check X-Ray trace to identify which segment is slow

**Q: How do you share a database connection pool across Lambda invocations?**
- Initialise connection outside the handler (execution environment reuse)
- Use **RDS Proxy** — maintains a connection pool, Lambda connects to proxy not RDS directly
- RDS Proxy handles connection management, prevents "too many connections" errors

**Q: Lambda is processing duplicate messages from SQS. Why and how do you fix it?**
- SQS delivers at-least-once — duplicates are possible
- Make Lambda **idempotent** — processing same message twice = same result
- Use message ID as deduplication key in DynamoDB
- Use SQS FIFO queue for exactly-once processing

---

## PART 2 — API GATEWAY DEEP DIVE

### REST API vs HTTP API vs WebSocket API

| | REST API | HTTP API | WebSocket API |
|---|---|---|---|
| Cost | $3.50/million | $1.00/million | $1.00/million + connection |
| Latency | ~6ms | ~1ms | N/A |
| Features | Full featured | Lightweight | Bidirectional |
| Auth | IAM, Cognito, Lambda | IAM, Cognito, JWT | IAM, Lambda |
| Usage plans | Yes | No | No |
| Caching | Yes | No | No |
| Request validation | Yes | No | No |
| Best for | Complex APIs, enterprise | Simple proxies, lower cost | Chat, real-time |

**Rule of thumb:**
- New project → **HTTP API** (cheaper, faster, simpler)
- Need caching / request validation / usage plans → **REST API**
- Real-time bidirectional → **WebSocket API**

---

### API Gateway Concepts

#### Stages
```
API Gateway → Deploy → Stage

Stages = environments:
  /dev     → dev Lambda alias
  /staging → staging Lambda alias
  /prod    → prod Lambda alias

URL pattern: https://abc123.execute-api.region.amazonaws.com/prod/users
```

**Stage variables** — like environment variables for API Gateway:
```
Stage variable: functionAlias = prod
Integration URI: arn:aws:lambda:region:account:function:myFunc:${stageVariables.functionAlias}

Change stage variable → routes to different Lambda alias
No code change needed to switch environments
```

#### Throttling
```
Account level: 10,000 RPS (requests per second), burst 5,000
Stage level: you can set lower limits per stage
Method level: you can set limits per endpoint

429 Too Many Requests → throttled
```

**Usage Plans + API Keys:**
- Assign API keys to customers
- Attach usage plan: 1000 requests/day, 100 RPS
- Track per-customer usage
- Rate limit individual customers independently

#### Caching
```
REST API only:
- Enable caching per stage
- Cache TTL: 0-3600 seconds (default 300s)
- Cache key: method + path + query params + headers
- Cache size: 0.5GB to 237GB

Client can bypass cache with: Cache-Control: max-age=0
```

---

### API Gateway Auth Options

#### 1. IAM Authorization
```
Client signs request with AWS Signature V4
→ API Gateway verifies IAM permissions
Use case: internal AWS service-to-service calls
```

#### 2. Cognito User Pools
```
User logs in → Cognito returns JWT token
Client sends token in Authorization header
→ API Gateway validates token with Cognito
→ No Lambda invocation for auth check
Use case: web/mobile apps with user login
```

#### 3. Lambda Authorizer (Custom Auth)
```
Client sends token (JWT, API key, OAuth)
→ API Gateway calls your Lambda authorizer
→ Lambda validates token, returns IAM policy
→ API Gateway caches policy for TTL duration
→ Allows or denies request
Use case: custom auth logic, third-party tokens
```

```python
# Lambda Authorizer example
def handler(event, context):
    token = event['authorizationToken']
    
    # Validate token (call your auth service, verify JWT, etc.)
    if is_valid(token):
        return generate_policy('user', 'Allow', event['methodArn'])
    else:
        return generate_policy('user', 'Deny', event['methodArn'])

def generate_policy(principal_id, effect, resource):
    return {
        'principalId': principal_id,
        'policyDocument': {
            'Statement': [{
                'Action': 'execute-api:Invoke',
                'Effect': effect,
                'Resource': resource
            }]
        }
    }
```

---

### API Gateway Integration Types

| Type | What it does |
|---|---|
| Lambda Proxy | Passes entire request to Lambda, Lambda controls response |
| Lambda (non-proxy) | API GW transforms request/response using mapping templates |
| HTTP Proxy | Passes request to HTTP backend as-is |
| HTTP | Transforms request/response to HTTP backend |
| Mock | Returns response without hitting backend |
| AWS Service | Direct integration with AWS services (SQS, DynamoDB, SNS) |

**Lambda Proxy Integration (most common):**
```python
# Lambda receives full event:
{
    "httpMethod": "POST",
    "path": "/users",
    "headers": {"Content-Type": "application/json"},
    "body": "{\"name\": \"Aditya\"}",
    "queryStringParameters": {"page": "1"},
    "pathParameters": {"id": "123"}
}

# Lambda must return:
{
    "statusCode": 200,
    "headers": {"Content-Type": "application/json"},
    "body": json.dumps({"message": "created"})
}
```

---

### API Gateway Hands-on

#### Create a simple REST API → Lambda → DynamoDB
```
Step 1: API Gateway → Create API → REST API
Step 2: Create Resource: /users
Step 3: Create Method: POST
Step 4: Integration: Lambda Proxy → select your Lambda function
Step 5: Deploy → Stage: dev
Step 6: Test with curl:

curl -X POST \
  https://YOUR-API-ID.execute-api.ap-south-1.amazonaws.com/dev/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Aditya", "email": "test@example.com"}'
```

---

### API Gateway Interview Questions

**Q: Difference between REST API and HTTP API in API Gateway?**
- HTTP API: cheaper ($1 vs $3.50/million), lower latency, no caching/request validation
- REST API: full features — caching, usage plans, request validation, WAF support
- For new simple Lambda APIs → HTTP API
- For enterprise features → REST API

**Q: How do you prevent API Gateway from being overwhelmed?**
- Set throttling limits at account/stage/method level
- Enable usage plans with API keys for external consumers
- Add WAF to block malicious IPs/patterns
- Enable caching to reduce Lambda invocations

**Q: Your API returns 502 Bad Gateway. What does that mean?**
- Lambda returned an invalid response format
- Lambda timed out
- Lambda threw an unhandled exception
- Check: Lambda response must have statusCode + body + headers
- Check: Lambda timeout is sufficient

---

## PART 3 — DYNAMODB DEEP DIVE

### What is DynamoDB?
Fully managed NoSQL key-value and document database.
- Single-digit millisecond performance at any scale
- No servers, no schema, no joins
- Scales horizontally automatically
- Multi-region replication (Global Tables)

---

### Core Concepts

#### Table Structure
```
Table: Users
├── Item 1: {userId: "u1", name: "Aditya", email: "a@b.com", age: 28}
├── Item 2: {userId: "u2", name: "Rahul", email: "r@b.com"}
└── Item 3: {userId: "u3", name: "Priya", city: "Mumbai"}  ← different attributes OK
```
- No fixed schema — each item can have different attributes
- Only **Primary Key** is required for all items

#### Primary Key Types

**1. Simple Primary Key (Partition Key only)**
```
Table: Products
Partition Key: productId

Access pattern: Get product by productId → O(1)
```

**2. Composite Primary Key (Partition Key + Sort Key)**
```
Table: Orders
Partition Key: userId
Sort Key: orderDate

Access patterns:
- Get all orders for a user: Query userId = "u1"
- Get orders in date range: Query userId = "u1" AND orderDate BETWEEN "2024-01-01" AND "2024-12-31"
- Get specific order: Get userId = "u1" AND orderDate = "2024-03-15"
```

---

### How DynamoDB Partitions Work

```
Your table → split across multiple partitions (managed by AWS)
Partition key → hashed → determines which partition stores the item

Good partition key = high cardinality (userId, orderId, UUID)
Bad partition key = low cardinality (status, country, boolean)
```

**Hot partition problem:**
```
Table: GameScores
Partition Key: gameId

Popular game "FIFA" → 90% of traffic → one partition overloaded
Other partitions idle

Fix: Use userId as partition key, gameId as sort key
Or: Add random suffix to partition key (write sharding)
```

---

### Indexes

#### 1. Local Secondary Index (LSI)
```
- Same partition key as table, different sort key
- Created at TABLE CREATION TIME only (can't add later)
- Max 5 per table
- Strong or eventual consistency
- Shares table's read/write capacity

Example:
Table: Orders (PK: userId, SK: orderId)
LSI: (PK: userId, SK: orderDate)  ← now can sort by date
```

#### 2. Global Secondary Index (GSI)
```
- Different partition key AND sort key from table
- Can be added anytime
- Max 20 per table
- Eventually consistent only
- Has its own read/write capacity

Example:
Table: Users (PK: userId)
GSI: (PK: email)  ← now can look up user by email
GSI: (PK: city, SK: joinDate)  ← users by city, sorted by date
```

**Rule:** Design your GSIs based on your access patterns first.

---

### Read/Write Capacity Modes

#### On-Demand Mode
```
- Pay per request ($1.25/million writes, $0.25/million reads)
- No capacity planning
- Scales instantly
- Best for: unpredictable traffic, new apps, dev/test
```

#### Provisioned Mode
```
- Specify Read Capacity Units (RCU) and Write Capacity Units (WCU)
- RCU: 1 strongly consistent read/sec for items up to 4KB
- WCU: 1 write/sec for items up to 1KB
- Can enable Auto Scaling
- Best for: predictable traffic, cost optimisation at scale
```

**Cost comparison:**
```
On-demand: 1M writes = $1.25
Provisioned: 1 WCU = $0.00065/hr = ~$0.47/month
If you need 1M writes/day consistently → provisioned is 10x cheaper
```

---

### DynamoDB Streams
Captures item-level changes in DynamoDB table in real-time.

```
DynamoDB Table
    │ Item created/updated/deleted
    ▼
DynamoDB Stream (24hr retention)
    │
    ▼
Lambda Function (triggered automatically)
    │
    ├── Send notification (SNS)
    ├── Update Elasticsearch index
    ├── Replicate to another table
    └── Trigger downstream workflow
```

**Stream view types:**
- `KEYS_ONLY` — only key attributes
- `NEW_IMAGE` — entire item after change
- `OLD_IMAGE` — entire item before change
- `NEW_AND_OLD_IMAGES` — both before and after

---

### DynamoDB Hands-on

#### Create table and add items via CLI
```bash
# Create table
aws dynamodb create-table \
  --table-name Users \
  --attribute-definitions \
    AttributeName=userId,AttributeType=S \
  --key-schema \
    AttributeName=userId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Put item
aws dynamodb put-item \
  --table-name Users \
  --item '{
    "userId": {"S": "u001"},
    "name": {"S": "Aditya"},
    "email": {"S": "aditya@example.com"}
  }'

# Get item
aws dynamodb get-item \
  --table-name Users \
  --key '{"userId": {"S": "u001"}}'

# Query (needs sort key or GSI)
aws dynamodb query \
  --table-name Orders \
  --key-condition-expression "userId = :uid" \
  --expression-attribute-values '{":uid": {"S": "u001"}}'

# Scan (avoid in production — reads entire table)
aws dynamodb scan --table-name Users
```

---

### DynamoDB Interview Questions

**Q: When would you use DynamoDB over RDS?**
- DynamoDB: key-value access patterns, massive scale, no complex queries, serverless
- RDS: complex joins, transactions, reporting, existing SQL knowledge
- DynamoDB can't do: JOINs, complex aggregations, ad-hoc queries

**Q: What is a DynamoDB Scan and why should you avoid it?**
- Scan reads EVERY item in the table — O(n) cost
- Expensive on large tables — consumes all read capacity
- Use Query instead — always provide partition key
- If you need Scan-like access → use GSI with your search field as partition key

**Q: Your DynamoDB table is getting throttled but you have enough capacity. Why?**
- Hot partitions — all traffic hitting same partition key
- Solution: better partition key choice, write sharding, DAX for reads
- Check: CloudWatch metric `ConsumedWriteCapacityUnits` per partition

**Q: Difference between Query and Scan?**
- **Query**: efficient, requires partition key, optionally filters by sort key, reads only matching partition
- **Scan**: inefficient, reads entire table, filters after reading all items
- Always prefer Query — design table + GSIs to support your Query patterns

---

## PART 4 — CI/CD FOR SERVERLESS

### The Problem with Traditional CI/CD for Serverless
```
Traditional app: build → test → deploy binary/container
Serverless app: need to deploy:
  - Lambda function code
  - API Gateway config
  - DynamoDB tables
  - IAM roles
  - CloudWatch alarms
  ... all as infrastructure
```

Solution: treat everything as code — **Infrastructure as Code + CI/CD**

---

### Two Main Approaches

#### 1. AWS SAM (Serverless Application Model)
AWS's native IaC tool for serverless — extends CloudFormation.

```yaml
# template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Timeout: 30
    Runtime: python3.12
    Environment:
      Variables:
        TABLE_NAME: !Ref UsersTable

Resources:
  # Lambda Function
  CreateUserFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/
      Handler: create_user.lambda_handler
      Events:
        CreateUser:
          Type: Api
          Properties:
            Path: /users
            Method: post

  # DynamoDB Table
  UsersTable:
    Type: AWS::Serverless::SimpleTable
    Properties:
      PrimaryKey:
        Name: userId
        Type: String

Outputs:
  ApiEndpoint:
    Value: !Sub "https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod/"
```

**SAM CLI commands:**
```bash
# Build
sam build

# Test locally (runs Lambda in Docker)
sam local invoke CreateUserFunction --event events/create_user.json
sam local start-api  # local API Gateway at localhost:3000

# Deploy
sam deploy --guided  # first time, creates samconfig.toml
sam deploy           # subsequent times

# Delete stack
sam delete
```

#### 2. Terraform for Serverless
```hcl
# Lambda function
resource "aws_lambda_function" "create_user" {
  filename         = "src.zip"
  function_name    = "create-user-${var.env}"
  role             = aws_iam_role.lambda_role.arn
  handler          = "create_user.lambda_handler"
  runtime          = "python3.12"
  source_code_hash = filebase64sha256("src.zip")

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.users.name
    }
  }
}

# API Gateway
resource "aws_apigatewayv2_api" "main" {
  name          = "serverless-api-${var.env}"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "create_user" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.create_user.invoke_arn
}

resource "aws_apigatewayv2_route" "create_user" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /users"
  target    = "integrations/${aws_apigatewayv2_integration.create_user.id}"
}

# DynamoDB
resource "aws_dynamodb_table" "users" {
  name         = "users-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }
}
```

---

### GitHub Actions CI/CD Pipeline for Serverless

```yaml
# .github/workflows/deploy.yml
name: Deploy Serverless App

on:
  push:
    branches: [main]        # deploy to prod
  pull_request:
    branches: [main]        # run tests only

env:
  AWS_REGION: ap-south-1

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pytest

      - name: Run tests
        run: pytest tests/ -v

  deploy-staging:
    needs: test
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    environment: staging

    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Set up SAM
        uses: aws-actions/setup-sam@v2

      - name: Build
        run: sam build

      - name: Deploy to staging
        run: |
          sam deploy \
            --stack-name serverless-app-staging \
            --parameter-overrides Env=staging \
            --no-confirm-changeset \
            --no-fail-on-empty-changeset

  deploy-prod:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production   # requires manual approval in GitHub

    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Set up SAM
        uses: aws-actions/setup-sam@v2

      - name: Build
        run: sam build

      - name: Deploy to production
        run: |
          sam deploy \
            --stack-name serverless-app-prod \
            --parameter-overrides Env=prod \
            --no-confirm-changeset \
            --no-fail-on-empty-changeset

      - name: Smoke test
        run: |
          API_URL=$(aws cloudformation describe-stacks \
            --stack-name serverless-app-prod \
            --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
            --output text)
          curl -f $API_URL/health || exit 1
```

**GitHub Secrets to configure:**
```
AWS_ACCESS_KEY_ID     → IAM user with deploy permissions
AWS_SECRET_ACCESS_KEY → IAM user secret
```

**Better practice — use OIDC (no static keys):**
```yaml
- name: Configure AWS credentials via OIDC
  uses: aws-actions/configure-aws-credentials@v2
  with:
    role-to-assume: arn:aws:iam::ACCOUNT:role/github-actions-role
    aws-region: ap-south-1
```

---

## PART 5 — CONNECTING ALL 4 TOGETHER

### Complete Architecture

```
                    ┌─────────────────────────────────┐
                    │         GitHub Repository        │
                    │  Push to main → GitHub Actions  │
                    └──────────────┬──────────────────┘
                                   │ CI/CD Pipeline
                                   ▼
                    ┌─────────────────────────────────┐
                    │      AWS (ap-south-1)            │
                    │                                  │
  Client Request    │  API Gateway (HTTP API)          │
  ──────────────▶  │  POST /users                     │
                    │        │                         │
                    │        ▼                         │
                    │  Lambda Function                 │
                    │  (create_user.py)                │
                    │        │                         │
                    │        ▼                         │
                    │  DynamoDB Table (Users)          │
                    │                                  │
                    │  CloudWatch Logs + Metrics       │
                    └─────────────────────────────────┘
```

### Complete Working Example

#### Project Structure
```
serverless-app/
├── template.yaml          # SAM template
├── src/
│   ├── create_user.py     # POST /users
│   ├── get_user.py        # GET /users/{id}
│   └── list_users.py      # GET /users
├── tests/
│   ├── test_create_user.py
│   └── test_get_user.py
├── events/
│   └── create_user.json   # test event
├── requirements.txt
└── .github/
    └── workflows/
        └── deploy.yml
```

#### Lambda Handler (create_user.py)
```python
import json
import boto3
import uuid
import os
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

def lambda_handler(event, context):
    try:
        body = json.loads(event['body'])

        # Validate input
        if 'name' not in body or 'email' not in body:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'name and email required'})
            }

        # Create user
        user_id = str(uuid.uuid4())
        item = {
            'userId': user_id,
            'name': body['name'],
            'email': body['email'],
            'createdAt': datetime.utcnow().isoformat()
        }

        table.put_item(Item=item)

        return {
            'statusCode': 201,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'userId': user_id, 'message': 'User created'})
        }

    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Internal server error'})
        }
```

#### SAM Template (template.yaml)
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Parameters:
  Env:
    Type: String
    Default: dev
    AllowedValues: [dev, staging, prod]

Globals:
  Function:
    Timeout: 30
    Runtime: python3.12
    MemorySize: 256
    Environment:
      Variables:
        TABLE_NAME: !Ref UsersTable
        ENV: !Ref Env

Resources:

  CreateUserFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/
      Handler: create_user.lambda_handler
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref UsersTable
      Events:
        CreateUser:
          Type: HttpApi
          Properties:
            Path: /users
            Method: POST

  GetUserFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/
      Handler: get_user.lambda_handler
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref UsersTable
      Events:
        GetUser:
          Type: HttpApi
          Properties:
            Path: /users/{userId}
            Method: GET

  UsersTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub "users-${Env}"
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: userId
          AttributeType: S
        - AttributeName: email
          AttributeType: S
      KeySchema:
        - AttributeName: userId
          KeyType: HASH
      GlobalSecondaryIndexes:
        - IndexName: email-index
          KeySchema:
            - AttributeName: email
              KeyType: HASH
          Projection:
            ProjectionType: ALL

Outputs:
  ApiEndpoint:
    Description: API Gateway endpoint
    Value: !Sub "https://${ServerlessHttpApi}.execute-api.${AWS::Region}.amazonaws.com"
  TableName:
    Value: !Ref UsersTable
```

---

### End-to-End Flow When Code is Pushed

```
1. Developer pushes to main branch
        ↓
2. GitHub Actions triggers
        ↓
3. Install dependencies + run pytest
        ↓ (if tests pass)
4. sam build → packages Lambda code + dependencies
        ↓
5. sam deploy → CloudFormation changeset
   - Creates/updates Lambda functions
   - Creates/updates API Gateway routes
   - Creates/updates DynamoDB table
   - Creates/updates IAM roles
        ↓
6. CloudFormation outputs API endpoint URL
        ↓
7. Smoke test: curl /health endpoint
        ↓
8. Done — new version live in ~3 minutes
```

---

### CI/CD Interview Questions

**Q: How do you handle database migrations in serverless CI/CD?**
- DynamoDB: schema-less, no migrations — add new attributes freely
- If using RDS: run migration Lambda as part of deploy step
- Use feature flags to gradually enable new fields
- Never delete old attributes until all consumers are updated

**Q: How do you roll back a bad Lambda deployment?**
```bash
# Option 1: Deploy previous version via SAM
git revert HEAD
git push  # triggers pipeline with old code

# Option 2: Lambda versions + aliases
# Publish a version on each deploy
# Alias "prod" points to current version
# On rollback: point alias to previous version (instant, no deploy needed)
aws lambda update-alias \
  --function-name create-user \
  --name prod \
  --function-version 5  # rollback to version 5
```

**Q: How do you test Lambda locally before deploying?**
```bash
# SAM local testing
sam local invoke CreateUserFunction --event events/create_user.json
sam local start-api  # full local API Gateway

# Unit testing
pytest tests/ -v

# Integration testing against real AWS (staging)
curl -X POST $STAGING_URL/users -d '{"name":"test"}'
```

**Q: How do you manage secrets in Lambda?**
```python
# Option 1: SSM Parameter Store (cheap)
import boto3
ssm = boto3.client('ssm')
secret = ssm.get_parameter(Name='/app/db-password', WithDecryption=True)

# Option 2: Secrets Manager (auto-rotation, costs more)
import boto3
client = boto3.client('secretsmanager')
secret = client.get_secret_value(SecretId='prod/db/password')

# Option 3: Environment variables (for non-sensitive config only)
import os
table_name = os.environ['TABLE_NAME']  # set in SAM template
```

---

## QUICK REFERENCE

### Lambda limits to know:
| Limit | Value |
|---|---|
| Max timeout | 15 minutes |
| Max memory | 10,240 MB |
| Max deployment package (zipped) | 50 MB |
| Max deployment package (unzipped) | 250 MB |
| Max /tmp storage | 10,240 MB |
| Max concurrent executions | 1,000 (default) |
| Max environment variable size | 4 KB |

### DynamoDB limits to know:
| Limit | Value |
|---|---|
| Max item size | 400 KB |
| Max partition key length | 2,048 bytes |
| Max sort key length | 1,024 bytes |
| Max GSIs per table | 20 |
| Max LSIs per table | 5 |
| Max tables per region | 2,500 |

### API Gateway limits:
| Limit | Value |
|---|---|
| Default throttle | 10,000 RPS |
| Burst limit | 5,000 |
| Max integration timeout | 29 seconds |
| Max payload size | 10 MB |
| Max stages per API | 10 |
