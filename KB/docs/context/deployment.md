# Deployment

Scope: shared infrastructure topology and operational contracts. Target-specific EKS and physical-backup details live in their dedicated docs; build/CI artifact creation lives in `build.md`.

<!-- kb
id: deploy.shared.environments
alias: deployment environments
source: .github/workflows/Backup-Deploy-All.yml#resolve
source: .github/workflows/EKS-Deploy-All.yml#deploy-game
-->
## Environment model

AWS EKS is the production-grade on-demand target. The physical machine is the development environment and always-on public demo host. These environments share application artifacts but have different runtime topology and operational constraints.

<!-- kb
id: deploy.shared.terraform-roots
alias: Terraform roots
alias: shared infra
source: .github/workflows/EKS-Infra-Apply.yml#apply
source: .github/workflows/EKS-Shared-Infra-Apply.yml#apply
source: .github/actions/terraform-validate-plan/action.yml#Terraform Validate And Plan
adjacent: deploy.eks.lifecycle
-->
## Terraform roots

EKS uses a session-scoped application root plus a persistent shared
infrastructure root. Shared GitHub Actions provide the Terraform validation and
planning environment for both roots, keeping composite behavior consistent
rather than reimplemented per workflow. Applying or destroying production
infrastructure is an explicit operation rather than a side effect of deploy.

<!-- kb
id: deploy.shared.auth-env
alias: Supabase env
alias: identity secret
source: .github/workflows/EKS-Deploy-Game-Server.yml#Sync Supabase service role secret
source: scripts/backup/backup-server-up.sh#AUTH_ARGS
adjacent: backend.identity.auth
adjacent: build.endpoint-auth.injection
-->
## Authentication environment

Server verification uses public Supabase project information plus runtime authentication policy. The
hosted Supabase Auth project enables anonymous sign-in, Google, Facebook, and Manual Linking; these
capability facts are intentionally public KB context so agents can reason about supported authentication
flows. Top or Drop accepts at most one external provider per durable account and treats its backend
account state as authoritative for that product rule. Provider linking upgrades the currently authenticated
Guest in place and preserves the durable Top or Drop account and Profile. Google linking uses the Supabase
identity-link path. Android Facebook linking keeps the ordinary native Facebook access-token flow: the
server verifies the token with Facebook, confirms ownership against the authenticated Guest account, and
atomically claims the Facebook subject in Top or Drop's account store. This Android Facebook-link path does
not require attaching Facebook as a Supabase Auth identity or opening browser OAuth; the existing anonymous
Supabase binding remains associated with the durable account. Public project/client capability information
may be injected into builds, but repository prose records capabilities rather than deployed credential
values. Service-role keys, provider client secrets, signing secrets, player-identity HMAC secrets,
access/refresh tokens, and other credentials remain private and must never be written to KB prose, logs,
generated plans, or client configuration.

<!-- kb
id: deploy.shared.secret-rollout
alias: kubernetes secret restart
alias: GITHUB_ENV
source: .github/workflows/EKS-Deploy-Game-Server.yml#Sync Supabase service role secret
source: .github/workflows/EKS-Deploy-Game-Server.yml#Apply Corp Tower Kustomize overlay
adjacent: deploy.eks.workflows
-->
## Secret rollout

Changing a runtime Secret does not by itself restart existing pods. Deployment must cause an actual workload rollout when new secret material needs to take effect. Step-scoped workflow environment does not automatically persist to later steps.
