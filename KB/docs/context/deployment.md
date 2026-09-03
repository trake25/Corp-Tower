# Deployment

Scope: shared infrastructure topology and operational contracts. Target-specific EKS and physical-backup details live in their dedicated docs; build/CI artifact creation lives in `build.md`.

<!-- kb
id: deploy.shared.environments
alias: deployment environments
-->
## Environment model

AWS EKS is the production-grade on-demand target. The physical machine is the development environment and always-on public demo host. These environments share application artifacts but have different runtime topology and operational constraints.

<!-- kb
id: deploy.shared.terraform-roots
alias: Terraform roots
alias: shared infra
adjacent: deploy.eks.lifecycle
-->
## Terraform roots

EKS uses a session-scoped application root plus a persistent shared infrastructure root. Shared state/bootstrap actions are reused rather than reimplemented per workflow. Applying or destroying production infrastructure is an explicit operation rather than a side effect of deploy.

<!-- kb
id: deploy.shared.auth-env
alias: Supabase env
alias: identity secret
adjacent: backend.identity.auth
adjacent: build.endpoint-auth.injection
-->
## Authentication environment

Server verification uses public Supabase project information plus runtime authentication policy. Service-role and player-identity HMAC material are privileged server secrets and must not enter client builds or log-visible deployment overlays. Provider verification secrets stay server-side.

<!-- kb
id: deploy.shared.secret-rollout
alias: kubernetes secret restart
alias: GITHUB_ENV
adjacent: deploy.eks.workflows
-->
## Secret rollout

Changing a runtime Secret does not by itself restart existing pods. Deployment must cause an actual workload rollout when new secret material needs to take effect. Step-scoped workflow environment does not automatically persist to later steps.
