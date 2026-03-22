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

## PART 5 — CROSS-ACCOUNT ACCESS

### Two Ways to Do Cross-Account Access

```
Account A (your app) needs to access Account B (shared resources)

Method 1: AssumeRole (recommended)
  Account A role → AssumeRole → Account B role → access resources
  
  Requires:
  a) Account A role has permission to call sts:AssumeRole on Account B role
  b) Account B role trust policy allows Account A

Method 2: Resource-based policy
  Account B resource (S3, SQS) has policy allowing Account A directly
  No role assumption needed — simpler but less flexible
```

### Cross-Account AssumeRole Setup

```
Account A ID: 111111111111
Account B ID: 222222222222

Step 1 — In Account B: Create role with trust policy
```

```json
// Account B — trust policy on role
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::111111111111:role/account-a-role"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "sts:ExternalId": "unique-external-id-12345"
      }
    }
  }]
}
```

```json
// Account B — permission policy on role
{
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::account-b-shared-bucket",
      "arn:aws:s3:::account-b-shared-bucket/*"
    ]
  }]
}
```

```json
// Step 2 — In Account A: role permission to assume Account B role
{
  "Statement": [{
    "Effect": "Allow",
    "Action": "sts:AssumeRole",
    "Resource": "arn:aws:iam::222222222222:role/account-b-role"
  }]
}
```

```python
# Step 3 — Application code assumes Account B role
import boto3

def get_cross_account_client(role_arn, service):
    sts = boto3.client('sts')
    
    assumed = sts.assume_role(
        RoleArn=role_arn,
        RoleSessionName='cross-account-session',
        ExternalId='unique-external-id-12345',
        DurationSeconds=3600
    )
    
    creds = assumed['Credentials']
    
    return boto3.client(
        service,
        aws_access_key_id=creds['AccessKeyId'],
        aws_secret_access_key=creds['SecretAccessKey'],
        aws_session_token=creds['SessionToken']
    )

# Usage
s3 = get_cross_account_client(
    'arn:aws:iam::222222222222:role/account-b-role',
    's3'
)
s3.list_objects_v2(Bucket='account-b-shared-bucket')
```

### What is External ID and why use it?

```
Problem — confused deputy attack:
  Attacker tricks YOUR application into assuming a role
  attacker doesn't have permission to assume directly.
  
  Example:
  You build a multi-tenant SaaS
  Customer A's role ARN: arn:aws:iam::CustomerA:role/my-role
  Attacker gives you Customer B's role ARN
  Your app assumes it → attacker gains access to Customer B's account
  
Solution — External ID:
  Each customer gets a unique secret External ID
  Trust policy requires correct ExternalId
  Attacker can't forge it — they don't know Customer B's External ID
  
Best practice:
  Always use ExternalId for cross-account roles in multi-tenant systems
```

---

## PART 6 — PERMISSION BOUNDARIES

### What is a Permission Boundary?

```
Permission boundary = maximum permissions a user/role can have

Even if role has AdministratorAccess policy,
if permission boundary only allows S3 access,
the role can ONLY do S3 operations.

Effective permissions = 
  intersection of (identity policy) AND (permission boundary)
```

```
Identity policy allows: S3:*, EC2:*, DynamoDB:*
Permission boundary allows: S3:*, Lambda:*
Effective permissions: S3:* only (intersection)
```

### Why Use Permission Boundaries?

```
Use case: delegated administration
  You want junior devs to create IAM roles for their Lambdas
  But you don't want them to create roles with more permissions than they have
  
Solution:
  1. Attach permission boundary to junior dev's user
  2. Require them to attach same boundary to any role they create
  3. Even if they try to create an admin role — boundary limits it
  
Condition in dev's policy:
```

```json
{
  "Effect": "Allow",
  "Action": "iam:CreateRole",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "iam:PermissionsBoundary": 
        "arn:aws:iam::ACCOUNT:policy/DeveloperBoundary"
    }
  }
}
```

---

## PART 7 — IAM BEST PRACTICES + LEAST PRIVILEGE

### The 10 IAM Best Practices

```
1. Lock away root account credentials
   - Never use root for daily operations
   - Enable MFA on root
   - Create admin IAM user instead

2. Create individual IAM users
   - One user per person — never share credentials
   - Audit who did what using CloudTrail

3. Use groups to assign permissions
   - Assign policies to groups, not individual users
   - User joins/leaves group = instant permission change

4. Grant least privilege
   - Start with minimum permissions
   - Add more as needed
   - Never use * in production policies

5. Enable MFA for privileged users
   - Enforce MFA for console access
   - Require MFA for sensitive operations via condition

6. Use roles for applications
   - EC2, Lambda, ECS always use roles
   - Never embed access keys in code or config files

7. Rotate credentials regularly
   - Rotate access keys every 90 days
   - Use AWS Secrets Manager for automatic rotation

8. Remove unnecessary credentials
   - Delete unused users and access keys
   - Use IAM Access Analyzer to find unused permissions

9. Use policy conditions
   - Restrict by IP, region, MFA, time
   - Make policies context-aware

10. Monitor activity with CloudTrail
    - All IAM changes logged
    - Set alarms for suspicious activity
```

### Least Privilege in Practice

```json
// Stage 1 — Discovery (never in production)
{"Effect": "Allow", "Action": "*", "Resource": "*"}

// Stage 2 — Narrow by service
{"Effect": "Allow", "Action": "s3:*", "Resource": "*"}

// Stage 3 — Narrow by action
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "*"
}

// Stage 4 — Narrow by resource (production ready)
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "arn:aws:s3:::judicial-solutions/*"
}

// Stage 5 — Add conditions (most secure)
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "arn:aws:s3:::judicial-solutions/*",
  "Condition": {
    "StringEquals": {
      "aws:RequestedRegion": "ap-south-1"
    }
  }
}
```

### Common Security Conditions

```json
// Require MFA for sensitive operations
{
  "Effect": "Deny",
  "Action": ["iam:*", "cloudtrail:DeleteTrail"],
  "Resource": "*",
  "Condition": {
    "BoolIfExists": {"aws:MultiFactorAuthPresent": "false"}
  }
}

// Restrict to specific IP range
{
  "Condition": {
    "NotIpAddress": {"aws:SourceIp": ["203.0.113.0/24", "198.51.100.0/24"]},
    "Bool": {"aws:ViaAWSService": "false"}
  }
}

// Restrict to specific region
{
  "Condition": {
    "StringNotEquals": {"aws:RequestedRegion": "ap-south-1"}
  }
}

// Require HTTPS only
{
  "Condition": {"Bool": {"aws:SecureTransport": "false"}}
}

// Tag-based access control
{
  "Condition": {
    "StringEquals": {"aws:ResourceTag/Environment": "prod"}
  }
}
```

---

## PART 8 — STS + TEMPORARY CREDENTIALS

### What is STS?

AWS Security Token Service — issues temporary credentials for:
- AssumeRole (users and services assuming roles)
- AssumeRoleWithWebIdentity (OIDC — Google, Facebook, GitHub)
- AssumeRoleWithSAML (enterprise SSO)
- GetFederationToken (legacy)
- GetSessionToken (add MFA to long-term credentials)

### Temporary Credentials vs Long-term

```
Long-term (IAM user access keys):
  AccessKeyId starts with: AKIA...
  SecretAccessKey: never changes (until rotated)
  No expiration
  Risk: if leaked, attacker has permanent access

Temporary (STS):
  AccessKeyId starts with: ASIA...
  SecretAccessKey: different every time
  SessionToken: required
  Expiration: 15 minutes to 12 hours
  Risk: if leaked, expires automatically
```

### STS Hands-on

```bash
# Check your current identity
aws sts get-caller-identity
# Output:
{
    "UserId": "AIDAXXXXXXXXXXXXXXXX",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/aditya"
}

# Get session token (adds MFA verification to existing credentials)
aws sts get-session-token \
  --duration-seconds 3600 \
  --serial-number arn:aws:iam::ACCOUNT:mfa/aditya \
  --token-code 123456  # MFA code from your device

# Assume a role
aws sts assume-role \
  --role-arn arn:aws:iam::ACCOUNT:role/DevOpsRole \
  --role-session-name my-session \
  --duration-seconds 3600

# Decode if you get AccessDenied — tells you what was denied
aws sts decode-authorization-message \
  --encoded-message "long-encoded-string-from-error"
```

### OIDC — GitHub Actions to AWS Without Access Keys

```
Traditional (insecure):
  Store AWS_ACCESS_KEY_ID in GitHub secrets
  Long-term credentials — never expire
  If GitHub is compromised → permanent AWS access

OIDC (secure — no stored credentials):
  GitHub → OIDC token (short-lived JWT)
  → STS → temporary credentials (1hr)
  → CI/CD runs → credentials expire
  No stored credentials anywhere
```

```bash
# Step 1: Create OIDC provider in AWS
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1"
```

```json
// Step 2: Create role with OIDC trust policy
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": 
          "repo:adityagaurav13a/*:*"
      }
    }
  }]
}
```

```yaml
# Step 3: GitHub Actions workflow — no secrets needed
jobs:
  deploy:
    permissions:
      id-token: write   # required for OIDC
      contents: read

    steps:
      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::ACCOUNT:role/github-actions-role
          aws-region: ap-south-1
          # No access key or secret key needed!

      - name: Deploy
        run: aws s3 sync . s3://my-bucket
```

---

## HANDS-ON EXERCISES

### Exercise 1: Create a least-privilege Lambda role

```bash
# Step 1: Create policy document
cat > lambda-policy.json << 'EOF'
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
      "Resource": "arn:aws:logs:ap-south-1:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:ap-south-1:*:table/users"
    }
  ]
}
EOF

# Step 2: Create the policy
aws iam create-policy \
  --policy-name LambdaUserAPIPolicy \
  --policy-document file://lambda-policy.json

# Step 3: Create trust policy
cat > trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF

# Step 4: Create role
aws iam create-role \
  --role-name LambdaUserAPIRole \
  --assume-role-policy-document file://trust-policy.json

# Step 5: Attach policy to role
aws iam attach-role-policy \
  --role-name LambdaUserAPIRole \
  --policy-arn arn:aws:iam::ACCOUNT:policy/LambdaUserAPIPolicy

# Step 6: Verify
aws iam get-role --role-name LambdaUserAPIRole
aws iam list-attached-role-policies --role-name LambdaUserAPIRole
```

---

### Exercise 2: Test AssumeRole

```bash
# Step 1: Create a role you can assume
cat > test-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::YOUR_ACCOUNT:user/YOUR_USERNAME"
    },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role \
  --role-name TestAssumeRole \
  --assume-role-policy-document file://test-trust-policy.json

# Attach S3 read-only
aws iam attach-role-policy \
  --role-name TestAssumeRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

# Step 2: Assume the role
CREDS=$(aws sts assume-role \
  --role-arn arn:aws:iam::YOUR_ACCOUNT:role/TestAssumeRole \
  --role-session-name test-session)

# Step 3: Export credentials
export AWS_ACCESS_KEY_ID=$(echo $CREDS | jq -r '.Credentials.AccessKeyId')
export AWS_SECRET_ACCESS_KEY=$(echo $CREDS | jq -r '.Credentials.SecretAccessKey')
export AWS_SESSION_TOKEN=$(echo $CREDS | jq -r '.Credentials.SessionToken')

# Step 4: Verify you're now the role
aws sts get-caller-identity
# Should show: TestAssumeRole

# Step 5: Test permissions
aws s3 ls  # should work (S3 read)
aws ec2 describe-instances  # should fail (no EC2 permission)

# Step 6: Go back to original identity
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
aws sts get-caller-identity  # back to original user
```

---

### Exercise 3: Use IAM Access Analyzer

```bash
# Find over-permissive resources (publicly accessible)
aws accessanalyzer list-analyzers

# Create analyzer if none exists
aws accessanalyzer create-analyzer \
  --analyzer-name judicial-analyzer \
  --type ACCOUNT

# List findings (publicly accessible resources)
aws accessanalyzer list-findings \
  --analyzer-arn arn:aws:accessanalyzer:ap-south-1:ACCOUNT:analyzer/judicial-analyzer

# Generate least privilege policy based on CloudTrail activity
aws accessanalyzer generate-policy \
  --trail-arn arn:aws:cloudtrail:ap-south-1:ACCOUNT:trail/management-trail
```

---

## INTERVIEW QUESTIONS RAPID FIRE

**Q: What's the difference between an IAM role and an instance profile?**
- Role = IAM identity with permissions
- Instance profile = container that holds a role for EC2
- EC2 can't directly use a role — needs instance profile wrapper
- When you create a role for EC2 in console, AWS auto-creates instance profile with same name

**Q: Can an IAM policy allow access to a resource in another AWS account?**
- Yes — two ways:
  1. Resource-based policy (S3, SQS, KMS) — grant access to another account's principal
  2. Assume role — identity in Account A assumes role in Account B

**Q: What happens if you have both an allow in identity policy and a deny in SCP?**
- Deny wins — SCP explicit deny overrides everything
- Even an explicit Allow in identity policy doesn't help

**Q: How do you audit who has access to an S3 bucket?**
```bash
# Check bucket policy
aws s3api get-bucket-policy --bucket my-bucket

# Check bucket ACL
aws s3api get-bucket-acl --bucket my-bucket

# Use IAM Access Analyzer
aws accessanalyzer list-findings  # shows external access

# Check CloudTrail for access history
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=my-bucket
```

**Q: What is the confused deputy problem in AWS IAM?**
- A trusted service is tricked into performing actions on behalf of an attacker
- Solution: use External ID in cross-account role trust policies
- Also use aws:SourceAccount and aws:SourceArn conditions when granting permissions to AWS services

**Q: How do you prevent privilege escalation in IAM?**
```json
// User should not be able to give themselves more permissions
// Deny creating/attaching policies that exceed their own permissions
{
  "Effect": "Deny",
  "Action": [
    "iam:CreatePolicy",
    "iam:AttachRolePolicy",
    "iam:PutRolePolicy",
    "iam:PassRole"
  ],
  "Resource": "*",
  "Condition": {
    "ArnNotEquals": {
      "iam:PolicyARN": [
        "arn:aws:iam::ACCOUNT:policy/AllowedPolicy1"
      ]
    }
  }
}
```

**Q: What is iam:PassRole and why is it important?**
```
iam:PassRole = permission to assign a role to an AWS service

Example:
  You create a Lambda function and assign it an IAM role
  → You need iam:PassRole permission on that role
  → Without it: "User is not authorized to pass a role"

Why it matters:
  If user has iam:PassRole on admin role,
  they can pass admin role to a Lambda they create,
  then invoke Lambda to do admin actions
  = privilege escalation

Best practice:
  Restrict iam:PassRole to specific roles only:
```

```json
{
  "Effect": "Allow",
  "Action": "iam:PassRole",
  "Resource": "arn:aws:iam::ACCOUNT:role/LambdaExecutionRole*",
  "Condition": {
    "StringEquals": {"iam:PassedToService": "lambda.amazonaws.com"}
  }
}
```

**Q: How do you rotate IAM access keys without downtime?**
```
Step 1: Create new access key (max 2 keys per user)
  aws iam create-access-key --user-name my-user

Step 2: Update application to use new key

Step 3: Verify application works with new key

Step 4: Deactivate old key (don't delete yet)
  aws iam update-access-key \
    --access-key-id OLD_KEY_ID \
    --status Inactive

Step 5: Monitor for any usage of old key (CloudTrail)

Step 6: Delete old key after confidence period
  aws iam delete-access-key --access-key-id OLD_KEY_ID
```

---

## QUICK REFERENCE

### IAM Policy variables:
```json
// Use dynamic values in policies
{
  "Resource": "arn:aws:s3:::my-bucket/${aws:username}/*"
  // Each user can only access their own folder
}

// Common variables:
aws:username         // IAM username
aws:userid           // user/role ID
aws:accountid        // AWS account ID
aws:PrincipalTag/key // tags on the principal
aws:RequestedRegion  // region of the request
aws:CurrentTime      // current time
aws:SecureTransport  // true if HTTPS
aws:MultiFactorAuthPresent // true if MFA used
```

### ARN format:
```
arn:partition:service:region:account-id:resource

Examples:
arn:aws:iam::123456789012:user/aditya
arn:aws:iam::123456789012:role/LambdaRole
arn:aws:iam::123456789012:policy/MyPolicy
arn:aws:s3:::my-bucket           (S3 has no region/account)
arn:aws:s3:::my-bucket/*         (objects in bucket)
arn:aws:lambda:ap-south-1:123456789012:function:my-func
arn:aws:dynamodb:ap-south-1:123456789012:table/users
```

### Access key prefixes:
```
AKIA... = long-term access key (IAM user)
ASIA... = temporary access key (STS/AssumeRole)
AROA... = role ID
AIDA... = IAM user ID
AGPA... = group ID
```
