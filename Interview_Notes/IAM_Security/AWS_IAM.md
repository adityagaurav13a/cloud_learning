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
