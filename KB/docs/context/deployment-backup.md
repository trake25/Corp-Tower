# Physical Backup Deployment

Scope: self-hosted development/public-demo topology, guards, Cloudflare tunnel constraints, and recovery operations.

<!-- kb
id: deploy.backup.topology
alias: backup server
alias: physical machine
alias: demo host
source: scripts/backup/backup-common.sh#stop_cloudflared_if_idle
-->
## Host topology

One Linux host runs two development game/web pairs plus an always-on public demo pair behind one Cloudflare Tunnel. Development servers can use in-memory Redis fallback because they are single-process; the public demo has persistent Redis so room/session state and demo counters survive ordinary redeploys.

<!-- kb
id: deploy.backup.demo-redis
alias: backup redis
alias: demo counters
source: scripts/backup/backup-redis-up.sh#VOLUME_NAME
-->
## Demo Redis

The demo's persistent Redis stores both live room/session state and demo counters. Reset tooling must target only the demo statistic keys rather than using a destructive global flush.

<!-- kb
id: deploy.backup.cloudflare-tls
alias: Universal SSL
alias: tunnel TLS
source: scripts/backup/backup-common.sh#upsert_cloudflare_cname
-->
## Cloudflare TLS

Cloudflare proxied tunnel hostnames are constrained by Universal SSL hostname depth. Two-level proxied names can fail before reaching the origin; EKS avoids this because its DNS-only names terminate TLS at the ALB.

<!-- kb
id: deploy.backup.cloudflared-service
alias: cloudflared systemd
source: scripts/backup/backup-common.sh#start_cloudflared_if_needed
-->
## Tunnel service ownership

The real tunnel runs as the user-level `cloudflared` service. The system-level unit is intentionally not the control surface, and self-hosted automation needs user-service persistence without an interactive sudo prompt.

<!-- kb
id: deploy.backup.connector-uniqueness
alias: stale tunnel connector
source: scripts/backup/backup-common.sh#start_cloudflared_if_needed
-->
## Connector uniqueness

Multiple live connectors for one tunnel id do not necessarily error. A stale connector can receive traffic for hostnames absent from its configuration while DNS and Docker appear healthy. Operational checks must detect connector/config divergence rather than assuming tunnel-active means correct routing.

<!-- kb
id: deploy.backup.machine-state
alias: backup state dir
alias: checkout clean
source: scripts/backup/backup-common.sh#load_env
-->
## Machine-local state

`actions/checkout` cleans gitignored/untracked checkout content, so per-run deployment state, web content, tunnel configuration, and credentials live in a permission-controlled machine directory outside the checkout. Backup scripts resolve that one state root before loading environment or generated artifacts; repository working material is never a durable host-state store.

<!-- kb
id: deploy.backup.demo-mode
alias: demo instance
alias: instance 3
source: scripts/backup/backup-server-up.sh#CORP_TOWER_BOTS_ENABLED
-->
## Demo differences

The public demo is selected by instance identity, which drives cooperative bots, disabled debug UI, demo presentation, and the persistent demo Redis path while development instances retain their lighter behavior. Dedicated manual dispatchers control demo rollout, so an ordinary development push is not authority to redeploy the public demo.

<!-- kb
id: deploy.backup.auto-deploy
alias: Backup Deploy All
alias: live status guard
source: .github/workflows/Backup-Deploy-All.yml#resolve
-->
## Auto-deploy guard

Push-triggered backup deployment scopes changed services and checks the target's live container status instead of trusting a stored stand-down flag. Manual dispatch bypasses changed-path auto-deploy gating.

<!-- kb
id: deploy.backup.offline-runner
alias: self hosted runner offline
source: .github/workflows/Backup-Deploy-All.yml#check-devwstod1-status
-->
## Offline runner behavior

Self-hosted backup jobs queue while the machine runner is offline rather than failing fast. Operations that assume immediate feedback must account for that queueing behavior.

<!-- kb
id: deploy.backup.workflow-skips
alias: skipped job cascade
source: .github/workflows/Backup-Deploy-All.yml#deploy-devwstod1
-->
## Skipped-job dependency

A conditionally skipped upstream GitHub Actions job affects downstream default `success()` evaluation across the dependency graph. Downstream jobs that intentionally tolerate an upstream skip need explicit `always()` plus direct dependency-result conditions.

<!-- kb
id: deploy.backup.workflow-context
alias: workflow_call event name
source: .github/workflows/Backup-Deploy-Game-Server.yml#workflow_call
-->
## Reusable workflow trigger context

`github.event_name` remains the top-level run trigger through nested reusable workflows. Invocation-specific behavior must be carried through explicit `workflow_call` inputs rather than inferred from the top-level event inside reusable jobs.

<!-- kb
id: deploy.backup.cloudflare-record
alias: proxied CNAME
alias: wait_for_cname
source: scripts/backup/backup-common.sh#wait_for_cname
-->
## Cloudflare record verification

For proxied Cloudflare records, DNS lookup does not expose the configured CNAME target. Record verification should query Cloudflare's API rather than waiting for `dig` to reveal a value the proxy intentionally hides.

<!-- kb
id: deploy.backup.runbook
alias: backup runbook
alias: demo cleanup
source: .github/workflows/Backup-Diagnose.yml#diagnose
-->
## Operator runbook

Development bring-up, demo redeploy, state diagnosis, and cleanup are explicit operator actions through dedicated workflows/scripts. External pull requests must never execute repository code on the self-hosted machine.
