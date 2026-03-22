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
