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

Server verification uses public Supabase project information plus runtime authentication policy. Service-role and player-identity HMAC material are privileged server secrets and must not enter client builds or log-visible deployment overlays. Provider verification secrets stay server-side.

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
