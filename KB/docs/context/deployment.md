# Deployment

Scope: shared infrastructure topology and operational contracts. Target-specific EKS and physical-backup details live in their dedicated docs; build/CI artifact creation lives in `build.md`.

<!-- kb
id: deploy.shared.environments
alias: deployment environments
source: .github/workflows/Backup-Deploy-All.yml#resolve
source: .github/workflows/EKS-Deploy-All.yml#deploy-game
source: scripts/verify-supabase-environment.sh#readonly SINGAPORE_PRODUCTION_PROJECT_REF=
-->
## Environment model

AWS EKS is the production-grade on-demand target and binds to the GitHub `production`
environment and the Singapore Production Supabase project. The physical machine is the
development environment and always-on public demo host; those targets bind to GitHub
`development` and the separate Singapore Development Supabase project. Production and
Development share application artifacts but never a runtime Supabase project, Auth
namespace, API-key set, or player-identity HMAC lifecycle.

The former Seoul project is migration rollback/history only, not a runtime target. Copying
Production player data into Development is prohibited during normal operation; the one-time
environment bootstrap clone is valid only when Development is proven as the target and
cloned Auth/player state is scrubbed before any Development deployment.

<!-- kb
id: deploy.shared.production-preflight
alias: production environment preflight
alias: write-freeze preflight
source: .github/workflows/Production-Environment-Preflight.yml#preflight
source: scripts/verify-production-environment.mjs#export async function verifyProductionEnvironment
adjacent: deploy.shared.environments
adjacent: deploy.shared.auth-env
-->
## Production environment preflight

The Production write-freeze cannot be requested until an environment-scoped GitHub Actions preflight
has validated every value consumed by Production workflows. Each value receives its own missing,
format, ownership, environment, authentication, permission, and cross-field checks as applicable;
failures name that input without disclosing its value. Supabase project ref, canonical URL, anon key,
and service-role key must all independently resolve to the Singapore Production project, while the
player-identity HMAC material must match the current Production Kubernetes Secret and deployment.
The preflight also exercises the bounded provider, infrastructure, private-asset, signing, and
store permissions needed by current Production jobs. It is non-deploying, reports Production ready only
after the complete set passes, and never substitutes a local or partial result for an actual run inside
the GitHub `production` environment. The AWS role must trust that environment's GitHub OIDC subject;
when role authentication fails, EKS, ECR, and HMAC results remain explicitly unverified rather than being
reported as value mismatches. Cloudflare zone ownership comes from the zone-details resource, while the
DNS endpoints independently prove record access and write permission.

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
source: scripts/verify-supabase-environment.sh#verify_supabase_environment() {
source: src/Client/App/corp-tower/Sys/Auth/Auth_Manager.gd#_recover_existing_google_link
source: src/Client/App/corp-tower/Sys/Auth/Auth_Manager.gd#link_with_provider
source: src/Server/app/Server.js#handleProfileMessage
source: src/Server/app/Server.js#redirectOriginMatchesRequest
adjacent: backend.identity.auth
adjacent: build.endpoint-auth.injection
-->
## Authentication environment

Server verification uses public Supabase project information plus runtime authentication policy. The hosted
Supabase Auth project enables anonymous sign-in, Google, Facebook, and Manual Linking; these capability facts
are intentionally public KB context so agents can reason about supported authentication flows. Top or Drop
accepts at most one external provider per durable account and treats its backend account state as authoritative
for that product rule. Provider linking upgrades the currently authenticated Guest in place and preserves the
durable Top or Drop account and Profile. Web Google and Mobile Web Facebook use the selected environment's
Supabase PKCE and authenticated manual identity-link paths; a link callback may stage only that same project's
original Guest before authoritative commit, and an existing identity is a conflict rather than a merge. PC Web
Facebook retains its direct authorization-code flow. Its game-server exchange is accepted only when both request
`Origin` and redirect URI match that deployment's explicit `FACEBOOK_WEB_ORIGIN`; backup and EKS deployment
wiring map that non-secret value to the paired Web environment. The selected game server re-verifies and
atomically claims the Facebook subject. Android Facebook keeps its ordinary native access-token flow separately.
Every shipping deployment supplies an
explicit Production or Development marker, project ref, canonical project URL, and environment-scoped
credentials. A non-mutating pre-deploy guard rejects the Seoul migration source, cross-environment values,
missing durable Data API surfaces, and incomplete server HMAC configuration. Until the request transports are
migrated away from placing project API keys in bearer headers, deployments use the project's legacy JWT-form
`anon` and `service_role` keys; the guard rejects opaque `sb_publishable_` and `sb_secret_` keys that those
transports cannot safely use. Public project/client capability information may be injected into builds, but
repository prose records capabilities rather than deployed credential values. Service-role keys, provider client
secrets, signing secrets, player-identity HMAC secrets, access/refresh tokens, and other credentials remain
private and must never be written to KB prose, logs, generated plans, or client configuration.

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
