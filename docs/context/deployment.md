# Deployment

Scope: infrastructure, runtime topology, operational runbooks. Build/CI that
produces the artifacts → [build.md](./build.md). Server code →
[backend.md](./backend.md). File purposes and stable anchors → grep
[map/infra.md](./map/infra.md).

## Overview

One Terraform path in AWS, region `ap-southeast-1`.

- **EKS (`infra/eks`) is the production-grade target** — fully implemented,
  deployed on demand for hours and torn down after.
- The physical backup machine is the **development** environment — two dev
  instances plus the always-on public demo.

**EKS is session-scoped and never auto-applies.** Its control plane, NAT Gateway,
ALB and ElastiCache have no free tier, so every hour of existence spends real
credits — the nightly auto-destroy exists to bound that. The price is ~15 min
apply and ~14 min destroy of AWS-side latency per session, which no workflow
change can shorten.

A K3s-on-EC2 lab (bastion, Caddy gateway, private nodes) preceded EKS and was
deleted once EKS covered the same ground; see the alias in
[index.md](./index.md#aliases). Nothing in the tree depends on it.

### Terraform roots

| Root | State key | Notes |
|---|---|---|
| `infra/eks/terraform` | `eks-lab/terraform.tfstate` | stack `server-eks`, destroyed every session |
| `infra/eks/terraform-shared` | `eks-shared/terraform.tfstate` | persistent — ACM wildcard + Cloudflare DNS validation, applied once, never destroyed |

Workflows create the shared S3 backend bucket if missing.
**Extend the shared composite actions rather than re-implementing per workflow** —
`terraform-backend-bootstrap`, `aws-terraform-setup`, `terraform-validate-plan`
back every Terraform workflow. Prefer GitHub Actions for Terraform validation and
planning over local manual runs.

## Operational targets

- [EKS production target](./deployment-eks.md) — Terraform, EKS/ALB/Redis topology,
  deployment workflows, infrastructure guards and one-time setup.
- [Physical backup target](./deployment-backup.md) — six-container host topology,
  Cloudflare Tunnel constraints, auto-deploy guards and operator runbook.

## Required secrets (infra scope)

| Secret | Used for |
|---|---|
| `AWS_ROLE_ARN` | GitHub OIDC → AWS. EKS needs the expanded policy attached once, manually |
| `ECR_REPOSITORY` | Server image push/pull |
| `CLOUDFLARE_API_TOKEN` / `_ZONE_ID` | ACM validation and the two EKS CNAMEs |
| `EKS_OPERATOR_PRINCIPAL_ARN` | IAM **role** ARN granted cluster-admin via an access entry |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Auth. Both optional — unset ships builds with sign-in off |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional. **Bypasses RLS** — server-side only, never in a client build |
| `TOD_FACEBOOK_APP_SECRET` | Meta App Secret; server-only verification of native Android access tokens |
| `PLAYER_IDENTITY_HMAC_SECRET` | Server-only HMAC key for Facebook provider identities |

Browser-provider sign-in additionally needs **both redirect targets in Supabase's
allow list** — `com.galaxxigames.tod://auth-callback` for Android and the
deployed web origin. Native Android Facebook uses the installed Meta app and
does not redirect through Supabase.
Supabase silently falls back to its Site URL for anything not listed, so a missing
entry looks like a redirect to the wrong page rather than an error.

### Server auth env

The game pod takes `SUPABASE_URL` and `SUPABASE_AUTH_REQUIRED`, patched in beside
`REDIS_URL` by the deploy workflow's runtime overlay and passed by
`backup-server-up.sh` on the backup box. **Neither is a secret** — verification
uses the project's public JWKS, so no key reaches the pod.

`SUPABASE_SERVICE_ROLE_KEY` is different: it **bypasses row-level security**, so
it never travels through the kustomize patch, whose values land in workflow logs.
The deploy job syncs it into a `corp-tower-supabase` k8s Secret piped through
`kubectl apply` (the `ecr-pull` pattern). `PLAYER_IDENTITY_HMAC_SECRET` similarly
syncs to `corp-tower-identity`; both are required for durable player-account
resolution. Unsetting either secret disables that resolution.
**A Secret change alone does not restart pods**; the deploy patches the image tag
every run, which is what actually rolls them. Unset `SUPABASE_URL`
turns verification off entirely; `SUPABASE_AUTH_REQUIRED=true` closes any socket
that fails it, which breaks every already-installed client, so flip it only once
signed-in builds are out.

Native Android Facebook verification needs `TOD_FACEBOOK_APP_ID` (repository
variable) and `TOD_FACEBOOK_APP_SECRET` (GitHub secret). The deploy job creates
the optional `corp-tower-facebook` Secret; `Auth_Verifier.js` calls Meta
`debug_token`, then `Account_Store` HMACs the verified provider subject. The
runtime overlay sets `PLAYER_IDENTITY_HMAC_KEY_VERSION`; a rotation also supplies
the optional prior secret and version until every active identity has a new hash.
If account resolution is unavailable, Facebook cannot pass a required-auth socket
gate.

The `R2_*` art-pipeline secrets are listed in [build.md](./build.md). The
`EC2_STAGING_*` and `R2_GATEWAY_*` secrets went unused when the K3s lab was
deleted — nothing reads them; revoke at will.

**A step-scoped `env:` value does not carry to later steps** — only `$GITHUB_ENV`
does. A later step reading a secret-derived variable another step resolved needs
its own `env:` block, or `set -u` scripts fail on an unbound variable.
