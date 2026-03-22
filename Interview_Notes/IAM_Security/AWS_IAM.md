# AWS IAM Complete Deep Dive
## Users, Roles, Policies, Trust Relationships, STS + Hands-on
### Theory → Interview Questions → Hands-on Steps

---

## PART 1 — USERS, GROUPS, ROLES

### The Core Difference

```
IAM User:
  - Represents a PERSON or APPLICATION
  - Has long-term credentials (password + access keys)
  - Credentials don't expire (unless you rotate them)
  - Example: developer, CI/CD service account

IAM Group:
  - Collection of IAM users
  - Attach policies to group → all users inherit
  - Cannot nest groups (no group inside group)
  - Example: Developers group, DevOps group, ReadOnly group

IAM Role:
  - Represents an IDENTITY that can be ASSUMED
  - Has NO long-term credentials — temporary credentials only
  - Assumed by: AWS services, users, applications, other accounts
  - Example: Lambda execution role, EC2 instance profile, cross-account role
```

### When to use each

```
Use IAM User when:
  - Human needs AWS console access
  - CI/CD pipeline needs long-term credentials (avoid if possible — use OIDC instead)
  - External application can't use IAM roles

Use IAM Group when:
  - Multiple developers need same permissions
  - Easy permission management — change group policy → all members updated

Use IAM Role when:
  - AWS service needs to call another AWS service (Lambda → DynamoDB)
  - EC2 instance needs AWS API access
  - Cross-account access
  - Federated identity (SSO, SAML)
  - GitHub Actions → AWS (OIDC)
  - ALWAYS prefer roles over users for AWS services
```

### Interview Question:
**"What's the difference between an IAM user and an IAM role?"**

Key points:
- User = permanent identity with static credentials
- Role = temporary identity, assumed when needed, credentials auto-expire
- Best practice: AWS services should ALWAYS use roles, never users with access keys

---

## PART 2 — POLICIES DEEP DIVE

### Policy Types

```
1. Identity-based policies (attached to user/group/role)
   ├── AWS Managed policies (created by AWS, maintained by AWS)
   │   └── Example: AmazonS3ReadOnlyAccess, AdministratorAccess
   ├── Customer Managed policies (you create, you maintain)
   │   └── Example: your custom policy for specific S3 bucket
   └── Inline policies (embedded directly in user/role — not reusable)
       └── Avoid these — hard to audit and manage

2. Resource-based policies (attached to the RESOURCE)
   └── Example: S3 bucket policy, SQS queue policy, Lambda resource policy
   └── Allows cross-account access WITHOUT assuming a role

3. Permission boundaries (max permissions a role/user can have)
4. Service Control Policies (SCPs) — AWS Organizations level
5. Session policies — passed during AssumeRole
```

### Policy Structure — JSON Deep Dive

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowS3ReadOnSpecificBucket",
      "Effect": "Allow",
      "Principal": "*",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::judicial-solutions",
        "arn:aws:s3:::judicial-solutions/*"
      ],
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "ap-south-1"
        },
        "IpAddress": {
          "aws:SourceIp": "203.0.113.0/24"
        }
      }
    },
    {
      "Sid": "DenyDeleteEverywhere",
      "Effect": "Deny",
      "Action": "s3:DeleteObject",
      "Resource": "*"
    }
  ]
}
```

**Breaking down each field:**

| Field | Values | Meaning |
|---|---|---|
| Version | "2012-10-17" | Always use this — older version doesn't support variables |
| Sid | Any string | Optional label — for your reference |
| Effect | Allow / Deny | What to do |
| Principal | ARN / * | WHO this applies to (resource policies only) |
| Action | service:action | WHAT operation |
| Resource | ARN / * | WHICH resource |
| Condition | key-value pairs | WHEN this applies |

---

### Policy Evaluation Logic — Critical to Understand

```
Request comes in → IAM evaluates in this ORDER:

1. Explicit DENY anywhere → DENY (overrides everything)
2. SCP (AWS Organizations) allows? → if no, DENY
3. Resource-based policy allows? → ALLOW (for same account)
4. Permission boundary allows? → if no, DENY
5. Identity-based policy allows? → ALLOW
6. Nothing matched → implicit DENY

Simple rule: DENY wins over ALLOW always
Default is DENY — you must explicitly allow everything
```

### Interview Question:
**"If a user has Allow on S3:* and there's a bucket policy with Deny for that user, what happens?"**
- **Deny wins** — explicit Deny always overrides Allow
- Even if 10 policies Allow, one explicit Deny blocks it

---

### Inline vs Managed Policies

```
Customer Managed Policy (recommended):
  ✓ Reusable — attach to multiple roles
  ✓ Version history — rollback to previous version
  ✓ Visible in IAM console separately
  ✓ Can audit who has this policy
  ✗ Extra management overhead

Inline Policy (avoid):
  ✓ One-to-one relationship with role
  ✗ Not reusable
  ✗ No version history
  ✗ Deleted when role is deleted
  ✗ Hard to audit at scale
  Use only when: policy must be strictly tied to one identity
```

### Resource-based Policy vs Identity-based Policy

```
Identity-based (on the role/user):
  "I (Lambda function) can access S3 bucket X"
  → Lambda's execution role has S3 permissions

Resource-based (on the resource):
  "S3 bucket X allows Lambda function Y to access it"
  → S3 bucket policy grants access to Lambda ARN

For SAME account access:
  Either one is sufficient

For CROSS-account access:
  Need BOTH:
  → Source account role has permission to access target
  → Target resource policy allows the source account
  OR: use resource-based policy alone (if service supports it)
```

---

## PART 3 — TRUST RELATIONSHIPS + ASSUMEROLE

### What is a Trust Relationship?

A trust relationship defines **WHO can assume a role**.
It's a resource-based policy on the role itself — the "trust policy".

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

This says: **"Lambda service is allowed to assume this role"**

---

### Trust Policy Examples

```json
// EC2 can assume this role
{
  "Principal": {"Service": "ec2.amazonaws.com"},
  "Action": "sts:AssumeRole"
}

// Another AWS account can assume this role
{
  "Principal": {"AWS": "arn:aws:iam::123456789012:root"},
  "Action": "sts:AssumeRole"
}

// Specific user in another account can assume
{
  "Principal": {"AWS": "arn:aws:iam::123456789012:user/john"},
  "Action": "sts:AssumeRole"
}

// GitHub Actions (OIDC) can assume this role
{
  "Principal": {
    "Federated": "arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com"
  },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub": "repo:adityagaurav13a/cloud_learning:ref:refs/heads/main"
    }
  }
}

// ECS task can assume this role
{
  "Principal": {"Service": "ecs-tasks.amazonaws.com"},
  "Action": "sts:AssumeRole"
}
```

---

### AssumeRole Flow

```
Actor (user/service/account)
    │
    │ sts:AssumeRole (role ARN)
    ▼
STS (Security Token Service)
    │ checks trust policy — is actor allowed to assume?
    │ checks permission boundary
    ▼
Returns temporary credentials:
    - AccessKeyId (starts with ASIA...)
    - SecretAccessKey
    - SessionToken (required with temp creds)
    - Expiration (15min to 12hr, default 1hr)
    │
    ▼
Actor uses temp credentials to make API calls
Credentials expire → must assume role again
```

### Hands-on: AssumeRole

```bash
# Assume a role and get temporary credentials
aws sts assume-role \
  --role-arn "arn:aws:iam::123456789012:role/my-role" \
  --role-session-name "my-session"

# Output:
{
    "Credentials": {
        "AccessKeyId": "ASIAXXXXXXXXXXXXXXXX",
        "SecretAccessKey": "xxxxxxxxxxxxxxxxxxxx",
        "SessionToken": "IQoJb3JpZ2luX2VjEA...",
        "Expiration": "2024-03-22T10:30:00Z"
    }
}

# Use the temporary credentials
export AWS_ACCESS_KEY_ID="ASIAXXXXXXXXXXXXXXXX"
export AWS_SECRET_ACCESS_KEY="xxxxxxxxxxxxxxxxxxxx"
export AWS_SESSION_TOKEN="IQoJb3JpZ2luX2VjEA..."

# Now CLI commands use assumed role
aws s3 ls  # runs as the assumed role

# Check who you are
aws sts get-caller-identity
```

---

### Interview Question:
**"Explain the difference between a role's trust policy and permission policy."**

```
Trust policy (who can assume):
  "Lambda service can assume this role"
  → Controls AUTHENTICATION — who gets the role

Permission policy (what the role can do):
  "This role can read from S3 and write to DynamoDB"
  → Controls AUTHORIZATION — what the role can do

Both are required:
  Trust policy → Lambda can assume the role ✓
  Permission policy → role can access DynamoDB ✓
  Result → Lambda can access DynamoDB ✓

  Trust policy → Lambda can assume the role ✓
  Permission policy → (empty) nothing allowed
  Result → Lambda has no permissions ✗
```

---

# PART 4 — IAM FOR AWS SERVICES

### Lambda Execution Role

```
Lambda needs TWO things:
1. Trust policy — allows Lambda to assume the role
2. Permission policy — what the Lambda can do

Minimum required policy (CloudWatch Logs):
```

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

```json
// Lambda role for DynamoDB CRUD
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:ap-south-1:ACCOUNT:table/users",
        "arn:aws:dynamodb:ap-south-1:ACCOUNT:table/users/index/*"
      ]
    }
  ]
}
```

**Least privilege for Lambda:**
```json
// BAD — too broad
{"Action": "dynamodb:*", "Resource": "*"}

// GOOD — specific actions on specific table
{
  "Action": ["dynamodb:GetItem", "dynamodb:PutItem"],
  "Resource": "arn:aws:dynamodb:ap-south-1:123456:table/users"
}
```

---

### EC2 Instance Profile

```
EC2 can't "log in" to assume a role like a human does.
Instance Profile = container that holds an IAM role for EC2.

Flow:
  EC2 instance → requests credentials from instance metadata service
  URL: http://169.254.169.254/latest/meta-data/iam/security-credentials/role-name
  → Gets temporary credentials automatically
  → AWS SDK uses these automatically (no config needed)
```

```bash
# Check what role an EC2 has
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/
# Returns: role-name

# Get the actual credentials
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/my-role
# Returns: AccessKeyId, SecretAccessKey, Token, Expiration
```

```bash
# Create instance profile and attach role
aws iam create-instance-profile \
  --instance-profile-name my-ec2-profile

aws iam add-role-to-instance-profile \
  --instance-profile-name my-ec2-profile \
  --role-name my-ec2-role

# Attach to EC2
aws ec2 associate-iam-instance-profile \
  --instance-id i-1234567890 \
  --iam-instance-profile Name=my-ec2-profile
```

---

### ECS Task Role vs ECS Execution Role

```
Two separate roles for ECS tasks:

1. Task Execution Role:
   Used by ECS AGENT (not your application)
   Needed for:
   - Pull Docker image from ECR
   - Write logs to CloudWatch
   - Get secrets from Secrets Manager / SSM

   Minimum permissions:
   - ecr:GetAuthorizationToken
   - ecr:BatchGetImage
   - logs:CreateLogStream
   - logs:PutLogEvents

2. Task Role:
   Used by YOUR APPLICATION CODE inside the container
   What your app needs:
   - DynamoDB access
   - S3 access
   - SQS access
   - etc.

Think of it this way:
  Execution role = permissions to START the container
  Task role = permissions for code RUNNING IN the container
```

```json
// ECS Task Definition
{
  "family": "judicial-api",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/judicial-task-role",
  "containerDefinitions": [...]
}
```

---

### IRSA — IAM Roles for Service Accounts (Kubernetes)

```
Problem: EKS pods running on EC2 inherit the node's IAM role
         All pods on a node have SAME permissions = security risk

Solution: IRSA — each Kubernetes service account gets its own IAM role

Flow:
  Pod → annotated with IAM role ARN
  → EKS OIDC provider verifies pod identity
  → STS issues temporary credentials
  → Pod code uses role's permissions (not node's)
```

```bash
# Create OIDC provider for EKS cluster
eksctl utils associate-iam-oidc-provider \
  --cluster judicial-cluster \
  --approve

# Create IAM role with trust policy for specific service account
eksctl create iamserviceaccount \
  --cluster judicial-cluster \
  --namespace default \
  --name judicial-api-sa \
  --attach-policy-arn arn:aws:iam::ACCOUNT:policy/JudicialAPIPolicy \
  --approve
```

```yaml
# Kubernetes pod uses the service account
apiVersion: v1
kind: ServiceAccount
metadata:
  name: judicial-api-sa
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT:role/judicial-role

---
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      serviceAccountName: judicial-api-sa  # pod uses this SA
```

---
