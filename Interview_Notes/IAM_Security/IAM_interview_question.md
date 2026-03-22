# AWS IAM Interview Questions
## Theory + Practical Scenario Based
### Mid-Level to Senior DevOps / Cloud Engineer

---

## README — How to Use This Document

**Total questions:** 50 (30 theory + 20 practical scenarios + 5 trick questions)
**Prep time:** 3-4 days recommended
**Target roles:** DevOps Engineer, Cloud Engineer, Platform Engineer, SRE

---

### Priority 1 — Must Memorise (comes up in every interview)

| Question | Topic | Why it matters |
|---|---|---|
| Q8 | Policy evaluation order | Interviewers test this constantly — get this wrong and they lose confidence |
| Q10 | iam:PassRole privilege escalation | Senior-level question — shows you understand security risks, not just usage |
| Q31 | Debugging AccessDenied on Lambda | You WILL face this in real work — having a structured approach impresses |
| Q41 | Leaked access key incident response | Incident response question — tests if you panic or act systematically |
| Q50 | Region restriction + BoolIfExists vs Bool | Classic trick question — most candidates get the condition operator wrong |

---

### Priority 2 — Your Strongest Answers (backed by real experience)

These questions map directly to things you've actually built — answer these
with your real project context, not generic textbook answers.

| Question | Topic | Your real experience |
|---|---|---|
| Q33 | GitHub Actions OIDC — no stored credentials | Your deploy.yaml for judicialsolutions.in already implements this |
| Q35 | EC2 instance profile for S3 access | You've set this up hands-on — reference your EC2 + S3 work |
| Q36 | Cross-account access setup end-to-end | Relevant to judicialsolutions.in multi-service architecture |
| Q44 | IRSA for EKS pods | You have EKS experience on your resume — this shows depth |

---

### Priority 3 — Scenario Questions to Practice Out Loud

Scenarios 31–45 should be answered verbally, not just read.
For each one, time yourself — aim to answer in under 2 minutes.
If you can't answer in 2 minutes without reading, practise again.

---

### How to Answer IAM Questions in Interviews

**For theory questions:** Structure as Definition → How it works → When to use it → Example

**For scenario questions:** Structure as Diagnosis → Root cause → Fix → Prevention

**Power phrases that signal seniority:**
- *"Explicit deny always wins — even AdministratorAccess can't override it"*
- *"I'd use iam:simulate-principal-policy to test before applying"*
- *"Default is implicit deny — you must explicitly allow everything"*
- *"I'd check CloudTrail to see what changed and when"*
- *"I'd use OIDC instead of long-term access keys for CI/CD"*

---

### Exam Traps Quick Reference (read before every interview)

```
1.  Explicit Deny > Allow — always, no exceptions
2.  Default = implicit deny — you must Allow everything
3.  S3 same-account: IAM OR bucket policy is enough
    S3 cross-account: BOTH must allow
4.  SCPs restrict only — they never grant permissions
5.  EC2 needs instance profile, not role directly
6.  Permission boundary limits max — doesn't grant on its own
7.  Role chaining → max session = 1 hour regardless of role setting
8.  AKIA = permanent key, ASIA = temporary STS key
9.  iam:PassRole = privilege escalation risk
10. Root bypasses IAM policies but NOT SCPs
11. IAM is eventually consistent — 1-2 second delay after changes
12. aws:SourceIp breaks through VPC endpoints — use aws:VpcSourceIp
13. Bool fails for API calls without MFA — use BoolIfExists
```

---

---

## SECTION 1 — THEORY QUESTIONS (30 Questions)

### Users, Groups, Roles

**Q1. What is the difference between an IAM user, group, and role?**

- **User**: permanent identity representing a person or application. Has long-term credentials (password + access keys). Credentials don't expire unless rotated.
- **Group**: collection of users. Policies attached to group apply to all members. Cannot nest groups inside groups.
- **Role**: temporary identity assumed by services, users, or applications. No long-term credentials — STS issues temporary credentials that auto-expire. Always prefer roles over users for AWS services.

---

**Q2. Can an IAM role have multiple trust policies?**

No — a role has exactly ONE trust policy document. However, that document can have multiple statements allowing multiple principals to assume the role:

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {"Service": "lambda.amazonaws.com"},
      "Action": "sts:AssumeRole"
    },
    {
      "Effect": "Allow",
      "Principal": {"Service": "ec2.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }
  ]
}
```

---

**Q3. What is the maximum number of IAM policies you can attach to a role?**

- Managed policies: **10 per role** (soft limit, can request increase)
- Inline policies: unlimited (but avoid them)
- Total policy size across all inline policies: 10,240 characters per role

---

**Q4. What happens when you delete an IAM role that is currently in use by a Lambda function?**

- Lambda function continues to run using the **cached temporary credentials** until they expire (up to 1 hour)
- After expiry, Lambda will fail to get new credentials — returns AccessDenied
- Any new Lambda invocation after role deletion will fail immediately
- Best practice: never delete roles without first checking what's using them

```bash
# Check who is using a role before deleting
aws iam generate-service-last-accessed-details \
  --arn arn:aws:iam::ACCOUNT:role/my-role
```

---

**Q5. What is the difference between AWS managed policies and customer managed policies?**

| | AWS Managed | Customer Managed |
|---|---|---|
| Created by | AWS | You |
| Maintained by | AWS (auto-updated) | You |
| Versions | No rollback | Up to 5 versions, rollback supported |
| Reusability | Yes | Yes |
| Visibility | Shared across all accounts | Your account only |
| Best for | Standard use cases | Fine-grained custom permissions |

---

**Q6. Can an IAM group be a member of another IAM group?**

No — groups cannot be nested. A group can only contain users, not other groups. This is a hard AWS limitation. If you need hierarchical permissions, use role chaining or attach multiple groups to users.

---

**Q7. What is an IAM instance profile and how is it different from a role?**

- **Role**: IAM identity with permission policies and trust policy
- **Instance profile**: container that holds exactly one IAM role, designed specifically for EC2
- EC2 cannot directly use an IAM role — it needs an instance profile
- When you create an EC2 role in the console, AWS auto-creates an instance profile with the same name
- Via CLI, you must create them separately:

```bash
aws iam create-role --role-name MyEC2Role ...
aws iam create-instance-profile --instance-profile-name MyEC2Profile
aws iam add-role-to-instance-profile \
  --instance-profile-name MyEC2Profile \
  --role-name MyEC2Role
```

---

**Q8. What is the IAM policy evaluation order?**

```
1. Explicit DENY (anywhere — identity, resource, SCP) → DENY immediately
2. SCP (Service Control Policy) — if not allowed → DENY
3. Resource-based policy allows same-account principal → ALLOW
4. Permission boundary — if not allowed → DENY
5. Identity-based policy allows → ALLOW
6. Nothing matched → implicit DENY (default)

Rule: Explicit DENY always wins. Default is DENY.
```

---

**Q9. What is the difference between an explicit deny and an implicit deny?**

- **Implicit deny**: no policy allows the action — default state, AWS denies by default
- **Explicit deny**: a policy has `"Effect": "Deny"` for the action
- **Key difference**: explicit deny cannot be overridden by any allow, even in another policy. Implicit deny can be overridden by an allow.

```json
// Explicit deny — cannot be overridden
{"Effect": "Deny", "Action": "s3:DeleteObject", "Resource": "*"}

// If this deny exists, even AdministratorAccess cannot delete S3 objects
```

---

**Q10. What is iam:PassRole and why is it a security concern?**

`iam:PassRole` is the permission to assign an IAM role to an AWS service.

Security concern:
```
User has: iam:PassRole on AdminRole + lambda:CreateFunction
User creates Lambda, passes AdminRole to it
Lambda has admin permissions
User invokes Lambda → effectively has admin access
= Privilege escalation without needing admin directly
```

Fix:
```json
{
  "Effect": "Allow",
  "Action": "iam:PassRole",
  "Resource": "arn:aws:iam::ACCOUNT:role/LambdaBasicRole",
  "Condition": {
    "StringEquals": {
      "iam:PassedToService": "lambda.amazonaws.com"
    }
  }
}
```

---

### Policies

**Q11. What are IAM policy variables and give an example?**

Dynamic values substituted at policy evaluation time:

```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "arn:aws:s3:::company-bucket/${aws:username}/*"
}
```

Each user can only access their own folder in the bucket. Common variables:
- `${aws:username}` — IAM username
- `${aws:userid}` — user or role ID
- `${aws:accountid}` — AWS account ID
- `${aws:PrincipalTag/department}` — tag on the principal

---

**Q12. What is the difference between identity-based and resource-based policies?**

```
Identity-based policy (on user/role):
  "Lambda function X can access DynamoDB table Y"
  → Attached to the ACTOR
  → Controls what the actor can do

Resource-based policy (on the resource):
  "DynamoDB table Y allows Lambda function X"
  → Attached to the RESOURCE
  → Controls who can access the resource
  → Supports cross-account access without role assumption
  → Supported by: S3, SQS, SNS, Lambda, KMS, Secrets Manager, ECR

For same-account: either one is enough
For cross-account: need both OR resource-based policy alone
```

---

**Q13. Can you attach a policy to an IAM group that denies access to a specific service for all members?**

Yes:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Action": "ec2:*",
    "Resource": "*"
  }]
}
```

Attach to the group — all members are denied EC2 access even if their individual policies allow it. Explicit deny always wins.

---

**Q14. What is a Service Control Policy (SCP) and how is it different from IAM policies?**

```
SCP:
  - Part of AWS Organizations
  - Applied to accounts or OUs (Organizational Units)
  - Sets MAXIMUM permissions for an account
  - Does NOT grant permissions — only restricts
  - Applies to ALL users and roles in the account including root
  - Root user cannot bypass SCP

IAM Policy:
  - Applied to users, groups, roles
  - Grants or denies permissions
  - Only applies to the specific identity

Example:
  SCP denies ec2:* on dev account
  → Even if an IAM admin creates a policy allowing ec2:*
  → EC2 is still blocked in that account
```

---

**Q15. What is the maximum session duration for an assumed role?**

- Default: 1 hour (3600 seconds)
- Minimum: 15 minutes (900 seconds)
- Maximum: 12 hours (43200 seconds) — but only if the role's MaxSessionDuration is configured for longer
- Default MaxSessionDuration on a role: 1 hour
- Can be set up to 12 hours per role

```bash
# Update role to allow longer sessions
aws iam update-role \
  --role-name MyRole \
  --max-session-duration 43200  # 12 hours
```

---

**Q16. What is the difference between STS AssumeRole and AssumeRoleWithWebIdentity?**

```
AssumeRole:
  Used by: IAM users, IAM roles, AWS services
  Authentication: AWS credentials (access key + secret)
  Use case: cross-account access, service-to-service

AssumeRoleWithWebIdentity:
  Used by: web/mobile apps, GitHub Actions, Google, Facebook login
  Authentication: OIDC/JWT token from identity provider
  Use case: OIDC federation (GitHub Actions → AWS, mobile app → AWS)
  No IAM user needed — identity provider handles authentication

AssumeRoleWithSAML:
  Used by: enterprise SSO (Active Directory, Okta, Ping)
  Authentication: SAML assertion from identity provider
  Use case: corporate SSO to AWS console
```

---

**Q17. What is an IAM permission boundary and when would you use it?**

A permission boundary is an advanced feature that sets the MAXIMUM permissions an identity can have, regardless of what policies are attached.

```
Identity policy allows: S3:*, EC2:*, DynamoDB:*
Permission boundary allows: S3:* only
Effective permissions: S3:* (intersection)

Even if you attach AdministratorAccess,
if the boundary only allows S3,
the identity can only do S3 operations.
```

Use cases:
- Delegated administration — let developers create Lambda roles without exceeding their own permissions
- Limit what a compromised role can do
- Compliance — restrict certain teams to specific services

---

**Q18. How does IAM handle policy versioning?**

- Customer managed policies support up to **5 versions**
- One version is the **default** (used when policy is evaluated)
- Can rollback to any previous version instantly
- When you create a 6th version, oldest non-default version is automatically deleted

```bash
# List versions
aws iam list-policy-versions \
  --policy-arn arn:aws:iam::ACCOUNT:policy/MyPolicy

# Set a specific version as default (rollback)
aws iam set-default-policy-version \
  --policy-arn arn:aws:iam::ACCOUNT:policy/MyPolicy \
  --version-id v2

# Delete old version
aws iam delete-policy-version \
  --policy-arn arn:aws:iam::ACCOUNT:policy/MyPolicy \
  --version-id v1
```

---

**Q19. What is the confused deputy problem in IAM?**

A legitimate service (deputy) is tricked by an attacker into performing actions on their behalf.

```
Example — multi-tenant SaaS:
  Your app assumes roles in customer accounts
  Attacker knows your app's ARN
  Attacker creates a role in their own account
  Attacker tricks your app into assuming their role
  Now your app is "working for" the attacker

Solution — External ID:
  Each customer gets unique External ID (secret between you and them)
  Trust policy requires correct ExternalId
  Attacker cannot forge it
```

```json
{
  "Condition": {
    "StringEquals": {"sts:ExternalId": "customer-abc-secret-123"}
  }
}
```

---

**Q20. What is the difference between aws:SourceIp and aws:VpcSourceIp conditions?**

```
aws:SourceIp:
  The public IP address of the requester
  Works for requests over the internet
  Does NOT work for requests through VPC endpoints
  (VPC endpoint requests appear to come from VPC, not public IP)

aws:VpcSourceIp:
  The private IP address within the VPC
  Only works for requests through VPC endpoints
  Use when restricting S3 access to specific EC2 private IPs

Best practice — use BOTH for complete coverage:
```

```json
{
  "Condition": {
    "NotIpAddress": {
      "aws:SourceIp": ["203.0.113.0/24"]
    },
    "Bool": {
      "aws:ViaAWSService": "false"
    }
  }
}
```

---

### Trust + STS

**Q21. What does "sts:AssumeRole" in a trust policy actually do?**

It authorises the named principal to call the STS AssumeRole API to obtain temporary credentials for this role. Without this, even if a user has iam:CreateRole and all other permissions, they cannot assume the role.

The trust policy is essentially the role saying: "I trust YOU to wear my identity."

---

**Q22. Can an IAM role assume another IAM role?**

Yes — this is called role chaining:

```
User → assumes RoleA → RoleA assumes RoleB → RoleB has final permissions

Limitations:
- Maximum session duration drops to 1 hour (regardless of role settings)
- CLI/SDK does not automatically chain — you must explicitly assume each role
- Not recommended for production — increases complexity and attack surface
```

---

**Q23. What is the difference between an access key starting with AKIA and ASIA?**

```
AKIA... = Long-term access key
  Belongs to: IAM user
  Expiry: none (until manually deleted/deactivated)
  Risk: if leaked, permanent access until rotated

ASIA... = Temporary access key (STS)
  Belongs to: assumed role, federated user
  Expiry: 15 minutes to 12 hours
  Requires: SessionToken (third credential)
  Risk: self-limiting — expires automatically
```

---

**Q24. How do you enforce MFA for sensitive AWS operations?**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "Action": [
        "iam:DeleteUser",
        "iam:CreateAccessKey",
        "s3:DeleteBucket",
        "cloudtrail:DeleteTrail"
      ],
      "Resource": "*",
      "Condition": {
        "BoolIfExists": {
          "aws:MultiFactorAuthPresent": "false"
        }
      }
    }
  ]
}
```

`BoolIfExists` vs `Bool`:
- `Bool` — fails if key doesn't exist (breaks API calls)
- `BoolIfExists` — only evaluates if key is present (safer for API/role access)

---

**Q25. What is IAM Access Analyzer and what problems does it solve?**

```
Finds resources accessible from OUTSIDE your account:
  - S3 buckets publicly accessible
  - IAM roles that can be assumed by external accounts
  - KMS keys accessible cross-account
  - Lambda functions with public resource policies
  - SQS queues allowing external access

Also generates:
  - Least privilege policies based on CloudTrail activity
  - Policy validation findings (syntax errors, security warnings)
  - Unused access findings (permissions never used in 90 days)
```

```bash
# Create analyzer
aws accessanalyzer create-analyzer \
  --analyzer-name my-analyzer \
  --type ACCOUNT

# List external access findings
aws accessanalyzer list-findings \
  --analyzer-arn arn:aws:accessanalyzer:region:account:analyzer/my-analyzer

# Generate least-privilege policy from CloudTrail
aws accessanalyzer generate-policy \
  --trail-arn arn:aws:cloudtrail:region:account:trail/management
```

---

**Q26. What is the difference between AWS managed policy AdministratorAccess and root user access?**

```
AdministratorAccess:
  {"Effect": "Allow", "Action": "*", "Resource": "*"}
  Can do almost everything
  CANNOT: manage billing (needs specific billing policy)
  CANNOT: bypass SCPs
  CANNOT: close AWS account
  CANNOT: enable/disable AWS regions

Root user:
  Ultimate superuser
  CAN: everything above
  CAN: bypass SCPs (SCPs don't apply to root)
  CAN: close AWS account
  CAN: restore IAM access if locked out

Best practice: use AdministratorAccess for daily admin work,
              never use root except for account-level tasks
```

---

**Q27. How do you find all IAM resources that have access to a specific S3 bucket?**

```bash
# Step 1: Check bucket policy
aws s3api get-bucket-policy --bucket my-bucket

# Step 2: Check bucket ACL
aws s3api get-bucket-acl --bucket my-bucket

# Step 3: IAM Access Analyzer
aws accessanalyzer list-findings \
  --filter '{"resourceType": {"eq": ["AWS::S3::Bucket"]}}'

# Step 4: Simulate policy (check if specific role can access)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::ACCOUNT:role/MyRole \
  --action-names s3:GetObject \
  --resource-arns arn:aws:s3:::my-bucket/*

# Step 5: CloudTrail — who accessed it recently
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=my-bucket \
  --start-time 2024-01-01
```

---

**Q28. What is ABAC (Attribute-Based Access Control) in IAM?**

Control access based on tags on both the principal AND the resource:

```json
// Allow access only when resource tag matches principal tag
{
  "Effect": "Allow",
  "Action": ["ec2:StartInstances", "ec2:StopInstances"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "ec2:ResourceTag/Team": "${aws:PrincipalTag/Team}"
    }
  }
}
```

```
Developer (tagged Team=backend) → can only start/stop EC2s tagged Team=backend
Designer (tagged Team=frontend) → can only start/stop EC2s tagged Team=frontend
Same policy — no need to create per-team policies
```

Use when: large organisations, dynamic teams, many resources

---

**Q29. What is the maximum size of an IAM policy document?**

```
Inline policy per user/role/group: 2,048 characters
Total inline policies per user: 10,240 characters
Total inline policies per role: 10,240 characters
Managed policy document: 6,144 characters
```

If you hit the limit:
- Split into multiple managed policies
- Use resource-based policies to complement
- Use AWS managed policies for common permissions

---

**Q30. How does IAM work with AWS Organizations SCPs — can SCP allow something that IAM denies?**

No:
```
Effective permission = IAM policy AND SCP

SCP only restricts — it cannot grant permissions.
SCP allows something + IAM denies = DENIED
SCP denies something + IAM allows = DENIED

Both must allow for access to be granted.

Exception: root user — SCPs apply to root too,
but root cannot be denied by IAM policies
(root bypasses IAM policies — only SCPs can restrict root)
```

---

## SECTION 2 — PRACTICAL SCENARIO QUESTIONS (25 Questions)

---

**Q31. Scenario: Your Lambda function returns AccessDenied when trying to write to DynamoDB. How do you debug and fix it?**

```
Step 1: Read the error message carefully
  AccessDeniedException: User: arn:aws:sts::ACCOUNT:assumed-role/MyRole/session
  is not authorized to perform: dynamodb:PutItem
  on resource: arn:aws:dynamodb:region:ACCOUNT:table/users

Step 2: Identify the role
  arn:aws:sts::ACCOUNT:assumed-role/MyRole/session
  → Lambda is using role: MyRole

Step 3: Check the role's policies
  aws iam list-attached-role-policies --role-name MyRole
  aws iam list-role-policies --role-name MyRole  # inline policies

Step 4: Simulate the action
  aws iam simulate-principal-policy \
    --policy-source-arn arn:aws:iam::ACCOUNT:role/MyRole \
    --action-names dynamodb:PutItem \
    --resource-arns arn:aws:dynamodb:region:ACCOUNT:table/users

Step 5: Add the missing permission
  Add dynamodb:PutItem on arn:aws:dynamodb:...:table/users
  Also check if GSI access needed: table/users/index/*

Common mistakes:
  - Policy allows dynamodb:PutItem but on wrong resource ARN
  - Table name has typo
  - Region mismatch in ARN
  - GSI access missing (need table/name/index/*)
```

---

**Q32. Scenario: You need to give a developer read-only access to production but prevent them from accessing sensitive data in S3. How do you design this?**

```json
// Policy 1: Read-only to most services
{
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "ec2:Describe*",
      "lambda:Get*",
      "lambda:List*",
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "cloudwatch:Get*",
      "cloudwatch:List*",
      "logs:Get*",
      "logs:Describe*"
    ],
    "Resource": "*"
  }]
}

// Policy 2: S3 with explicit deny on sensitive buckets
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": "*"
    },
    {
      "Effect": "Deny",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::judicial-sensitive-data",
        "arn:aws:s3:::judicial-sensitive-data/*",
        "arn:aws:s3:::backups",
        "arn:aws:s3:::backups/*"
      ]
    }
  ]
}
```

---

**Q33. Scenario: Your CI/CD pipeline in GitHub Actions needs to deploy to AWS. Currently using access keys stored in GitHub secrets. How do you make this more secure?**

Current (insecure):
```
AWS_ACCESS_KEY_ID stored in GitHub Secrets
→ Long-term credentials
→ If GitHub breached → permanent AWS access
→ Keys don't expire automatically
```

Better approach — OIDC:
```bash
# Step 1: Create OIDC provider
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1"
```

```json
// Step 2: Create role with OIDC trust
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub":
          "repo:adityagaurav13a/cloud_learning:ref:refs/heads/main"
      }
    }
  }]
}
```

```yaml
# Step 3: Update GitHub Actions workflow
jobs:
  deploy:
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::ACCOUNT:role/GitHubActionsRole
          aws-region: ap-south-1
          # No access keys at all!
```

---

**Q34. Scenario: You accidentally gave a developer AdministratorAccess. How do you fix it without breaking their work?**

```bash
# Step 1: Check what the developer is actually doing
aws iam generate-service-last-accessed-details \
  --arn arn:aws:iam::ACCOUNT:user/developer-john

# Get the report
aws iam get-service-last-accessed-details \
  --job-id <job-id>
# Shows: which services used, when last accessed

# Step 2: Check CloudTrail for recent actions
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=Username,AttributeValue=developer-john \
  --start-time 2024-01-01

# Step 3: Use IAM Access Analyzer to generate least privilege policy
# Based on actual CloudTrail activity

# Step 4: Create replacement policy with only what they need
# Test it (attach to test user first)

# Step 5: Remove AdministratorAccess, attach new policy
aws iam detach-user-policy \
  --user-name developer-john \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

aws iam attach-user-policy \
  --user-name developer-john \
  --policy-arn arn:aws:iam::ACCOUNT:policy/DeveloperPolicy

# Step 6: Inform developer — they should test their work immediately
```

---

**Q35. Scenario: An EC2 instance needs to read from S3. What's the right way to set this up?**

Wrong way (never do this):
```bash
# Hard-coding credentials in EC2 — NEVER
aws configure  # stores keys in ~/.aws/credentials
# Or worse: export AWS_ACCESS_KEY_ID="AKIA..." in code
```

Right way:
```bash
# Step 1: Create policy
cat > ec2-s3-policy.json << 'EOF'
{
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::judicial-bucket",
      "arn:aws:s3:::judicial-bucket/*"
    ]
  }]
}
EOF

aws iam create-policy \
  --policy-name EC2S3ReadPolicy \
  --policy-document file://ec2-s3-policy.json

# Step 2: Create role with EC2 trust
aws iam create-role \
  --role-name EC2S3ReadRole \
  --assume-role-policy-document '{"Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

# Step 3: Attach policy to role
aws iam attach-role-policy \
  --role-name EC2S3ReadRole \
  --policy-arn arn:aws:iam::ACCOUNT:policy/EC2S3ReadPolicy

# Step 4: Create instance profile and attach role
aws iam create-instance-profile \
  --instance-profile-name EC2S3ReadProfile

aws iam add-role-to-instance-profile \
  --instance-profile-name EC2S3ReadProfile \
  --role-name EC2S3ReadRole

# Step 5: Attach to EC2 (at launch or after)
aws ec2 associate-iam-instance-profile \
  --instance-id i-1234567890 \
  --iam-instance-profile Name=EC2S3ReadProfile

# On EC2 — AWS SDK automatically uses instance profile credentials
# No configuration needed in your code
import boto3
s3 = boto3.client('s3')  # automatically uses EC2 role
s3.list_objects_v2(Bucket='judicial-bucket')
```

---

**Q36. Scenario: You need to set up cross-account access. Company A's Lambda needs to read from Company B's DynamoDB. Walk through the complete setup.**

```
Account A: 111111111111 (Lambda lives here)
Account B: 222222222222 (DynamoDB lives here)
```

```bash
# IN ACCOUNT B: Create role Lambda can assume
# Trust policy — allows Account A Lambda role to assume
cat > trust-policy.json << 'EOF'
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::111111111111:role/LambdaExecutionRole"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "sts:ExternalId": "company-a-secret-456"
      }
    }
  }]
}
EOF

aws iam create-role \
  --role-name CrossAccountDynamoDBReader \
  --assume-role-policy-document file://trust-policy.json \
  --profile account-b

# Permission policy — what the role can do in Account B
aws iam attach-role-policy \
  --role-name CrossAccountDynamoDBReader \
  --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess \
  --profile account-b
```

```bash
# IN ACCOUNT A: Give Lambda role permission to assume Account B role
cat > assume-policy.json << 'EOF'
{
  "Statement": [{
    "Effect": "Allow",
    "Action": "sts:AssumeRole",
    "Resource": "arn:aws:iam::222222222222:role/CrossAccountDynamoDBReader"
  }]
}
EOF

aws iam put-role-policy \
  --role-name LambdaExecutionRole \
  --policy-name AssumeAccountBRole \
  --policy-document file://assume-policy.json
```

```python
# Lambda code in Account A
import boto3

def get_cross_account_dynamodb():
    sts = boto3.client('sts')
    assumed = sts.assume_role(
        RoleArn='arn:aws:iam::222222222222:role/CrossAccountDynamoDBReader',
        RoleSessionName='lambda-cross-account',
        ExternalId='company-a-secret-456'
    )
    creds = assumed['Credentials']
    return boto3.resource(
        'dynamodb',
        aws_access_key_id=creds['AccessKeyId'],
        aws_secret_access_key=creds['SecretAccessKey'],
        aws_session_token=creds['SessionToken'],
        region_name='ap-south-1'
    )

def lambda_handler(event, context):
    dynamodb = get_cross_account_dynamodb()
    table = dynamodb.Table('account-b-table')
    return table.get_item(Key={'id': event['id']})
```

---

**Q37. Scenario: Your team reports that a Lambda function suddenly lost access to S3. Nothing was changed in the Lambda code. What could have caused this and how do you investigate?**

```
Possible causes (ranked by likelihood):

1. IAM policy was modified or detached
   aws iam list-attached-role-policies --role-name LambdaRole
   aws iam get-role-policy --role-name LambdaRole --policy-name inline-policy

2. S3 bucket policy was changed to deny access
   aws s3api get-bucket-policy --bucket my-bucket

3. SCP change at organization level
   Check with AWS Organizations admin

4. Permission boundary was added
   aws iam get-role --role-name LambdaRole
   Look for PermissionsBoundary field

5. KMS key policy changed (if S3 uses SSE-KMS)
   aws kms get-key-policy --key-id key-id --policy-name default

6. VPC endpoint policy changed (if using S3 VPC endpoint)
   Check endpoint policy in VPC console

Investigation:
   aws cloudtrail lookup-events \
     --lookup-attributes AttributeKey=ResourceName,AttributeValue=LambdaRole \
     --start-time 2024-03-01
   # Shows all IAM changes to this role in the time period

Fix based on finding:
   Re-attach policy / revert bucket policy / check SCP
```

---

**Q38. Scenario: You need to allow an S3 bucket to be accessed only from within your VPC. How do you implement this?**

```json
// S3 Bucket Policy
{
  "Statement": [
    {
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::judicial-private-bucket",
        "arn:aws:s3:::judicial-private-bucket/*"
      ],
      "Condition": {
        "StringNotEquals": {
          "aws:SourceVpce": "vpce-xxxxxxxxxxxxxxxxx"
        }
      }
    }
  ]
}
```

```bash
# Also create S3 Gateway Endpoint in VPC
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxxxxxxx \
  --service-name com.amazonaws.ap-south-1.s3 \
  --route-table-ids rtb-xxxxxxxx

# Now S3 access from within VPC goes through endpoint
# Bucket policy denies all requests NOT coming through the endpoint
# = bucket is only accessible from within VPC
```

---

**Q39. Scenario: A developer needs temporary elevated access to production for an incident. How do you provide this safely?**

```bash
# Option 1: Time-limited role assumption
# Create a break-glass role with elevated access
# Developer assumes it with short session duration

aws sts assume-role \
  --role-arn arn:aws:iam::ACCOUNT:role/BreakGlassAdminRole \
  --role-session-name incident-2024-03-22 \
  --duration-seconds 3600  # 1 hour only

# Option 2: AWS IAM Identity Center (SSO) with time-bound access
# Assign temporary permission set, set expiry, revoke after incident

# Option 3: Condition-based time restriction in policy
{
  "Condition": {
    "DateLessThan": {
      "aws:CurrentTime": "2024-03-22T18:00:00Z"
    }
  }
}

# All options:
# 1. Log every action during elevated access (CloudTrail)
# 2. Alert on break-glass role usage (CloudWatch alarm)
# 3. Require manager approval before access (manual gate)
# 4. Revoke after incident is resolved
# 5. Post-incident review of all actions taken
```

---

**Q40. Scenario: How do you design IAM for a multi-environment setup (dev/staging/prod) in a single AWS account?**

```
Approach: Tag-based access control + Environment-specific roles

Tagging strategy:
  All resources tagged: Environment=dev/staging/prod

Developer role (can only touch dev resources):
```

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["lambda:*", "dynamodb:*", "s3:*"],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:ResourceTag/Environment": "dev"
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": ["lambda:Get*", "lambda:List*"],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:ResourceTag/Environment": ["staging", "prod"]
        }
      }
    },
    {
      "Effect": "Deny",
      "Action": ["lambda:Update*", "lambda:Delete*", "dynamodb:Put*"],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:ResourceTag/Environment": ["staging", "prod"]
        }
      }
    }
  ]
}
```

---

**Q41. Scenario: You discover an IAM access key was leaked on GitHub. What do you do immediately?**

```
Incident Response — in this exact order:

T+0 minutes: IMMEDIATELY deactivate the key
  aws iam update-access-key \
    --access-key-id AKIAXXXXXXXXXXXXXXXX \
    --status Inactive \
    --user-name compromised-user

T+5 minutes: Check what was done with the key
  aws cloudtrail lookup-events \
    --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIAXXXXXXXXXXXXXXXX
  Also check: GuardDuty findings for the key

T+10 minutes: Rotate to new key (if user is legitimate)
  aws iam create-access-key --user-name compromised-user
  Update the application using the key

T+15 minutes: Delete the leaked key permanently
  aws iam delete-access-key \
    --access-key-id AKIAXXXXXXXXXXXXXXXX \
    --user-name compromised-user

T+20 minutes: Assess blast radius
  What did the key have access to?
  Any resources created/deleted by the attacker?
  Any data exfiltrated?

T+30 minutes: Remediation
  Revoke any resources created by attacker
  Rotate any secrets that may have been accessed
  Update GitHub to remove the leaked key from history:
    git filter-repo (don't just delete the file — it's in git history)

Prevention going forward:
  Enable GitHub secret scanning
  Add AWS credential detection to pre-commit hooks
  Use OIDC instead of access keys for CI/CD
```

---

**Q42. Scenario: How do you audit all IAM permissions in your AWS account to find over-privileged roles?**

```bash
# Step 1: Enable IAM Access Analyzer
aws accessanalyzer create-analyzer \
  --analyzer-name account-analyzer \
  --type ACCOUNT

# Step 2: Get unused access report
aws accessanalyzer start-resource-scan \
  --analyzer-arn arn:aws:accessanalyzer:region:account:analyzer/account-analyzer \
  --resource-arn arn:aws:iam::account:role/MyRole

# Step 3: Check last used dates for all roles
aws iam get-account-authorization-details \
  --filter Role \
  --query 'RoleDetailList[*].[RoleName,RoleLastUsed.LastUsedDate]'

# Step 4: Check service last accessed per role
for role in $(aws iam list-roles --query 'Roles[*].RoleName' --output text); do
  echo "Role: $role"
  aws iam generate-service-last-accessed-details \
    --arn arn:aws:iam::ACCOUNT:role/$role
done

# Step 5: Identify roles not used in 90+ days
# Candidates for deletion or permission reduction

# Step 6: For each over-privileged role
# Compare: permissions granted vs permissions actually used
# Remove any service/action not used in 90 days
```

---

**Q43. Scenario: You need to allow your Lambda function to be invoked by an S3 bucket in a different AWS account. How do you set this up?**

```bash
# Lambda resource-based policy — allow cross-account S3 invocation
aws lambda add-permission \
  --function-name my-function \
  --statement-id cross-account-s3 \
  --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-arn arn:aws:s3:::other-account-bucket \
  --source-account 222222222222  # IMPORTANT: prevents confused deputy

# Without source-account:
# Any S3 bucket could trigger your Lambda if they know the ARN
# source-account restricts to ONLY that specific account's S3

# In Account B — configure S3 bucket notification
aws s3api put-bucket-notification-configuration \
  --bucket other-account-bucket \
  --notification-configuration '{
    "LambdaFunctionConfigurations": [{
      "LambdaFunctionArn": "arn:aws:lambda:region:111111111111:function:my-function",
      "Events": ["s3:ObjectCreated:*"]
    }]
  }' \
  --profile account-b
```

---

**Q44. Scenario: Your EKS pods are using the node's IAM role instead of their own role. Some pods are accessing resources they shouldn't. How do you fix this?**

```
Problem:
  All pods on node share node's IAM role
  If node role has S3:*, all pods can access all S3 buckets
  Violates least privilege

Solution: IRSA (IAM Roles for Service Accounts)

Step 1: Enable OIDC on cluster
eksctl utils associate-iam-oidc-provider \
  --cluster my-cluster --approve

Step 2: Create IAM role per service
eksctl create iamserviceaccount \
  --cluster my-cluster \
  --namespace production \
  --name api-service-account \
  --attach-policy-arn arn:aws:iam::ACCOUNT:policy/APIServicePolicy \
  --approve

Step 3: Restrict node role (remove permissions now handled by IRSA)
  Remove S3, DynamoDB, etc. from node group role
  Keep only: ECR pull, CloudWatch logs, EKS node management

Step 4: Annotate pod to use service account
apiVersion: v1
kind: Pod
spec:
  serviceAccountName: api-service-account
  containers:
  - name: api
    image: myapp:latest

Step 5: Verify
kubectl exec -it pod-name -- aws sts get-caller-identity
# Should show the IRSA role, not the node role
```

---

**Q45. Scenario: Write an IAM policy that allows a user to manage ONLY their own IAM access keys.**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ManageOwnAccessKeys",
      "Effect": "Allow",
      "Action": [
        "iam:CreateAccessKey",
        "iam:DeleteAccessKey",
        "iam:GetAccessKeyLastUsed",
        "iam:ListAccessKeys",
        "iam:UpdateAccessKey"
      ],
      "Resource": "arn:aws:iam::*:user/${aws:username}"
    },
    {
      "Sid": "ViewOwnUserInfo",
      "Effect": "Allow",
      "Action": [
        "iam:GetUser",
        "iam:ListUserPolicies",
        "iam:ListAttachedUserPolicies"
      ],
      "Resource": "arn:aws:iam::*:user/${aws:username}"
    },
    {
      "Sid": "ListUsersInConsole",
      "Effect": "Allow",
      "Action": "iam:ListUsers",
      "Resource": "*"
    }
  ]
}
```

`${aws:username}` variable ensures the policy dynamically resolves to the current user. User can only manage their OWN keys, not anyone else's.

---

## TRICK QUESTIONS

**Q46. If a user has no IAM policies attached, can they do anything in AWS?**

Almost nothing — but they CAN:
- Log in to the AWS console (authentication ≠ authorization)
- View their own IAM info (some GetUser actions allowed by default)
- Access the billing console (if billing access is enabled for IAM users)

Everything else is denied by default. You must explicitly allow all actions.

---

**Q47. Can the root user be denied by an IAM policy?**

- IAM policies: No — root user bypasses IAM permission evaluations
- SCPs (Service Control Policies): Yes — SCPs DO apply to root user
- This is why SCPs are so powerful — they're the only way to truly restrict root

---

**Q48. Can two IAM roles in the same account have the same name?**

No — IAM role names must be unique within an account. However:
- Same role name can exist in different accounts
- Role names are case-insensitive (MyRole = myrole = MYROLE — all the same)

---

**Q49. What happens to an IAM user's active sessions when you delete the user?**

- Existing valid sessions continue until they expire
- Long-term credentials (access keys) stop working immediately
- Console sessions expire at the session timeout (usually 1-12 hours)
- Best practice: deactivate access keys BEFORE deleting user to revoke access immediately

---

**Q50. Can you restrict which AWS regions a user can operate in using IAM?**

Yes — using the `aws:RequestedRegion` condition:

```json
{
  "Effect": "Deny",
  "Action": "*",
  "Resource": "*",
  "Condition": {
    "StringNotEquals": {
      "aws:RequestedRegion": [
        "ap-south-1",
        "us-east-1"
      ]
    }
  }
}
```

This denies ALL actions outside ap-south-1 and us-east-1. Useful for:
- Data residency compliance
- Cost control (prevent expensive regions)
- Security (reduce attack surface)

Note: some global services (IAM, CloudFront, Route53) don't have a region — they bypass this condition. Use `aws:ViaAWSService` to handle this:

```json
{
  "Condition": {
    "StringNotEquals": {
      "aws:RequestedRegion": "ap-south-1"
    },
    "Bool": {
      "aws:ViaAWSService": "false"
    }
  }
}
```

---

## QUICK REFERENCE — EXAM TRAPS

```
1. Explicit Deny always wins — even over AdministratorAccess

2. Default is implicit deny — you must explicitly allow everything

3. S3 bucket policy + IAM policy — for same account access,
   EITHER one allowing is sufficient (OR logic)
   For cross-account — BOTH must allow (AND logic)

4. SCPs don't grant permissions — they only restrict

5. Instance profile ≠ IAM role — EC2 needs instance profile wrapper

6. Permission boundary limits max permissions —
   doesn't grant permissions on its own

7. Role session duration max = 1 hour when role chaining

8. AKIA = long-term key, ASIA = temporary STS key

9. iam:PassRole = dangerous permission — can be used for privilege escalation

10. Root user bypasses IAM policies but NOT SCPs

11. IAM is eventually consistent — changes may take a few seconds to propagate
    (cause of "works in console, fails in CLI right after policy change")

12. aws:SourceIp doesn't work through VPC endpoints — use aws:VpcSourceIp instead

13. MFA condition: use BoolIfExists not Bool
    Bool fails for API/role access (no MFA token in the request)
    BoolIfExists only checks when the key is present
```
