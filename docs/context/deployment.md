# Deployment

Scope: infrastructure, runtime topology, and operational runbooks. Build/CI that produces artifacts → [build.md](./build.md). Server code → [backend.md](./backend.md).

## Overview

Two parallel Terraform paths exist. **K3s is active** and carries live staging traffic; **EKS is session-scoped** — apply-ready, brought up for a validation session (hours) and torn down after, never continuously running.

| Path | Status |
|---|---|
| K3s (`infra/k3s`) | **Active** — live staging |
| EKS (`infra/eks`) | Session-scoped validation stack, not always-on ([why](./decisions.md#eks-kept-session-scoped-not-always-on)) |

Region for both: `ap-southeast-1`.

## Terraform roots

| Root | State key | Resource tag |
|---|---|---|
| `infra/k3s/terraform` | `k3s-lab/terraform.tfstate` | `Environment=k3s-lab` |
| `infra/eks/terraform` | `eks-lab/terraform.tfstate` | stack `server-eks`, destroyed every session |
| `infra/eks/terraform-shared` | `eks-shared/terraform.tfstate` | stack `server-eks-shared`, persistent — ACM wildcard cert + Cloudflare DNS validation, applied once, never destroyed |

Workflows create the shared S3 backend bucket if missing, via `.github/actions/terraform-backend-bootstrap`. AWS/Terraform CLI setup and the init/fmt/validate/plan sequence are shared through `.github/actions/aws-terraform-setup` and `terraform-validate-plan` — used by K3s Plan/Apply/Cleanup and every EKS Terraform workflow alike (K3s Plan/Apply/Cleanup additionally use `resolve-ssh-key`, which EKS has no need for). EKS's Terraform reuses the existing ECR repository as a data source rather than creating a new one.

## K3s topology

- **`EC2-GW`** — public IPv4: SSH bastion, Caddy WSS gateway, Cloudflare DNS updater, NAT instance. Uses Docker only to run the Caddy gateway container (the game server workload itself runs in K3s).
- **`EC2-K3S-CP`** — private K3s control plane, default `t3.small`.
- **`EC2-K3S-A1` / `EC2-K3S-A2`** — private K3s agents, default `t3.micro` (2 agents by default).
- VPC CIDR defaults to `10.60.0.0/16` — chosen to avoid K3s's default pod CIDR (`10.42.0.0/16`) and service CIDR (`10.43.0.0/16`).
- Public subnet: EC2-GW. Private subnet: K3s control plane + agents, default route via EC2-GW's primary network interface.
- Security groups: public `22/80/443` only on EC2-GW; private K3s API, kubelet, Flannel VXLAN, SSH, and NodePort traffic (`30300`–`30311`) scoped to lab security groups.
- Traefik and ServiceLB are disabled — public traffic stays on EC2-GW Caddy.
- Four hostnames point at the K3s gateway via Cloudflare DNS — `wsplaytod.galaxxigames.com`/`wstodtest.galaxxigames.com` (game servers) and `playtod.galaxxigames.com`/`todtest.galaxxigames.com` (web servers) — enumerated in `infra/k3s/gateway_sites.yml`, the single source both the Caddy config and the DNS upsert render from.

## K3s runtime

- Two isolated namespaces, `corp-tower-prod` and `corp-tower-test`, each with its own in-cluster Redis (`ClusterIP` service `redis:6379`, namespace-local DNS) and its own `corp-tower-server`/`corp-tower-web` Deployments (1 replica each, `REDIS_URL=redis://redis:6379` for the server). Fixed NodePorts: `30300` prod game (wsplaytod) · `30301` test game (wstodtest) · `30310` prod web (playtod) · `30311` test web (todtest). EC2-GW Caddy reverse-proxies each `gateway_sites.yml` hostname to its matching NodePort.
- `ecr-pull` is namespace-scoped and refreshed by whichever deploy workflow owns that namespace — imagePullSecrets don't cross namespaces, so prod and test each carry their own copy from the same ECR repository.
- Kustomize base `apps/corp-tower/base` (game server + Redis) and `web-base` (web server) are shared; `overlays/{prod,test,web-prod,web-test}` layer namespace + NodePort per target. Each K3s deploy workflow generates an **uncommitted** `overlays/runtime` (game) or `overlays/runtime-web` (web) overlay at deploy time to inject the real ECR image tag — the committed `lab-placeholder` tag in the base is never what actually runs.
- Every K3s deploy renders **all four** Caddy site blocks and upserts **all four** DNS records, regardless of which single target is being deployed — the gateway is one shared Caddy container, so a prod-only deploy must never orphan test's route or vice versa.

## Caddy gateway ACME cert persistence (R2)

EC2-GW's root volume is ephemeral, so a destroyed/recreated gateway carries no Caddy automatic-HTTPS state of its own — see [decisions.md](./decisions.md#caddy-gateway-acme-cert-cache-persisted-to-r2) for the Let's Encrypt rate-limit incident that caused. `configure_caddy.yml` (`infra/k3s/ansible/roles/gateway/tasks/`) round-trips the `corp-tower-k3s-caddy-data` Docker volume through R2 bucket `corp-tower-gateway-state`:

- **Restore** (before Caddy starts): the K3s deploy workflow's `Restore Caddy gateway state from R2` step downloads the archive (no-ops if none exists yet) and `scp`s it to EC2-GW; Ansible extracts it into the volume.
- **Liveness check**: after start, Ansible waits 3s and asserts the container is still running, capturing `docker logs` and failing loudly if not — replaces a prior silent failure mode where a crashed Caddy container wasn't caught until the public WSS smoke test timed out 5 minutes later.
- **Persist** (after the liveness check passes): Ansible re-archives the volume; the `Persist Caddy gateway state to R2` step `scp`s it back and uploads it.
- On smoke-test failure regardless of cause, `Dump Caddy gateway logs on smoke test failure` SSHes to EC2-GW and dumps `docker ps`/`docker logs` into the CI log.

The archive holds the gateway's live ACME account key and TLS private key: both the runner and EC2-GW sides restrict it to `0600` immediately after it's written and delete it once consumed. R2 was chosen over AWS S3 to reuse the project's existing free R2 usage without adding AWS IAM scope; the payload is a few KB and R2's free tier (10 GB storage, 1M/10M Class A/B ops/month, no egress fee) has no realistic exposure at this cadence.

**Not yet verified end-to-end** — added while blocked on the rate limit it fixes; first live confirmation is pending the next deploy.

## K3s workflows

All manual `workflow_dispatch` only — K3s has no automated/push-triggered path (that exists only for the physical backup's `devwstod1`/`devtod1` instances — see [Backup](#backup-physical-machine-4-dev-instances)).

| Workflow | Behavior |
|---|---|
| `K3s-Infra-Plan.yml` | Reusable / manual. Plans the K3s Terraform root; intentionally allows create/delete actions to be reviewed |
| `K3s-Infra-Apply.yml` | Manual, requires `APPLY_K3S`. Plans first and **hard-fails if the plan contains any delete/replace action** — run `K3s Infra Destroy`'s `terraform_destroy` first if a plan would replace/delete resources |
| `K3s-Infra-Diagnose.yml` | Reusable / manual. Inspects tagged lab AWS resources, verifies all four Cloudflare DNS records resolve to the gateway, probes SSH through the bastion |
| `K3s-Infra-Destroy.yml` | Manual, `cleanup_mode` choice `runtime_only` (uninstalls K3s/Caddy on every node — affects both game and web) or `terraform_destroy` (`DESTROY_K3S`) — the only workflow that tears down the whole shared cluster's AWS resources; distinct from `K3s-Cleanup-All.yml` below, which only touches Deployments/Services inside the still-running cluster |
| `K3s-Deploy-Game-Server.yml` | Reusable core, `target: wsplaytod\|wstodtest`. Tests server code, builds/pushes one shared Docker image tagged by commit SHA, installs/configures K3s via EC2-GW bastion/NAT (restoring/persisting Caddy's ACME cache to R2, rendering all four Caddy sites, upserting all four DNS records), refreshes `ecr-pull` in the target namespace, applies that target's Kustomize overlay, validates nodes/Redis/replica/Caddy/public WSS |
| `K3s-Deploy-Web-Server.yml` | Reusable core, `target: playtod\|todtest`. Builds the Web export (debug UI disabled), pushes an `nginx:alpine` image tagged `web-<target>-<sha>`, same K3s plumbing as the game-server core, HTTPS smoke test |
| `K3s-Deploy-All.yml` | Manual dispatcher over both cores, `deploy_target` choice `All\|Game only\|Web only` crossed with `environment` choice `prod\|test\|all`. Always runs game-prod → game-test → web-prod → web-test in that order regardless of selection (skipping unselected combinations), since all four share one Caddy gateway and R2 ACME cache |
| `K3s-Cleanup-Game-Server.yml` | Reusable core, `target: wsplaytod\|wstodtest`. Deletes only the game server's Deployment/Service and its namespace-local Redis by name — **never** the namespace itself, since each prod/test namespace also hosts that environment's web server |
| `K3s-Cleanup-Web-Server.yml` | Reusable core, `target: playtod\|todtest`. Soft cleanup: `kubectl apply -k`'s a `web-maintenance-{prod,test}` overlay that swaps the web Deployment's image to `nginx:alpine` serving an offline/maintenance placeholder — the Deployment, Service, and DNS record are never deleted, so a normal redeploy's `kubectl apply` of the real overlay cleanly overwrites the placeholder |
| `K3s-Cleanup-All.yml` | Manual dispatcher over both cores, `cleanup_target` choice `All\|Game only\|Web only` crossed with `environment` choice `prod\|test\|all`, gated by a typed `confirm_cleanup` phrase specific to the chosen combination (printed to the run summary) |

Argo CD is prepared in manifests only — no K3s workflow installs or exposes it.

## Operational runbook

1. **First-time / cold start:** `K3s Infra Plan` → `K3s Infra Apply` (`APPLY_K3S`) → `K3s Deploy All` (`deploy_target: All`, `environment: all`).
2. **Ordinary update, lab already healthy:** dispatch `K3s Deploy All` with `deploy_target`/`environment` narrowed to the server(s) and environment(s) that need it (e.g. `Game only` + `prod`).
3. **AWS/SSH/DNS/cluster reachability looks off:** `K3s Infra Diagnose`.
4. **Returning to a clean runtime state:** `K3s Cleanup All` with `cleanup_target`/`environment` set to what to clean up (game deletes its Deployment/Service; web instead sets the offline/maintenance placeholder), gated by its typed `confirm_cleanup` phrase — or `K3s Infra Destroy`'s `terraform_destroy` (`DESTROY_K3S`) to remove all K3s AWS resources.

### Operational checks (what "healthy" means)

Terraform `fmt`/`validate` · server `npm test` · K3s Ansible syntax check · all K3s nodes Ready · Redis deployment Ready · the target's server/web replica Ready · `ecr-pull` secret present in the target namespace · EC2-GW Caddy validates, reloads, and is confirmed still running (liveness-checked with `docker logs` captured on failure) · Cloudflare DNS resolves to the K3s gateway public IP for all four hostnames · WebSocket (game) or HTTPS (web) smoke connects to the target's own hostname.

### Observability commands

```bash
# Cluster state (substitute corp-tower-test for the test environment)
kubectl -n corp-tower-prod get pods -o wide
kubectl -n corp-tower-prod get all -o wide
kubectl get nodes -o wide

# Live game/web server logs
kubectl -n corp-tower-prod logs deploy/corp-tower-server --all-containers --tail=200 -f
kubectl -n corp-tower-prod logs deploy/corp-tower-web --all-containers --tail=200 -f

# Scheduling / image-pull / restart / readiness issues
kubectl get events -A --sort-by=.lastTimestamp

# If metrics-server is available
kubectl top nodes
kubectl top pods -A
```

On EC2-GW: `sudo docker logs -f corp-tower-k3s-caddy` (public gateway traffic/proxy issues). On K3s nodes: `sudo journalctl -u k3s -f` (control plane) / `sudo journalctl -u k3s-agent -f` (agents).

## Argo CD readiness

Not installed by the first K3s rollout. Bootstrap manifests: `infra/k3s/argocd/bootstrap` — `AppProject` destinations cover both `corp-tower-prod` and `corp-tower-test`; the one `Application` resource tracks `overlays/prod` on `main`. When enabled, Argo CD stays private — bastion + `kubectl port-forward` only. First sync is manual; automated prune/self-heal waits until one manual sync + a rollback test succeed. Private repos need a persistent repo-read credential (`GITHUB_TOKEN` is not suitable long-term). Full rationale → [decisions.md](./decisions.md#argo-cd-prepared-but-not-enabled).

## Required secrets (infra scope)

| Secret | Used for |
|---|---|
| `AWS_ROLE_ARN` | GitHub OIDC → AWS for Terraform/K3s/EKS workflows — EKS needs the expanded `CorpTowerEksLab` policy attached once, manually (see [EKS manual setup](#eks-session-scoped-validation-stack)) |
| `ECR_REPOSITORY` | Server image push/pull |
| `EC2_STAGING_HOST` | EC2 staging host reference |
| `EC2_STAGING_USER` | SSH user for EC2-GW/K3s nodes |
| `EC2_STAGING_SSH_KEY` | SSH private key |
| `EC2_STAGING_SSH_PUBLIC_KEY` | *(optional)* Preferred for Terraform key-pair creation; if empty, K3s infra workflows derive the public key from `EC2_STAGING_SSH_KEY` |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` | DNS updates for the four `infra/k3s/gateway_sites.yml` hostnames, the EKS ACM validation record, and the two EKS CNAMEs (`wstodplay`, `todplay`) |
| `EKS_OPERATOR_PRINCIPAL_ARN` | IAM role ARN (not assumed-role form) granted cluster-admin via an EKS access entry, so `kubectl` works from an operator's laptop |
| `EC2_STAGING_PORT`, `STAGING_SSH_CIDR`, `STAGING_GAME_PORT_CIDR` | *(optional)* |
| `R2_GATEWAY_BUCKET`, `R2_GATEWAY_ACCESS_KEY_ID`, `R2_GATEWAY_SECRET_ACCESS_KEY` | Caddy ACME cert cache persistence to R2 bucket `corp-tower-gateway-state` (reuses `R2_ACCOUNT_ID` from [build.md](./build.md#required-secrets-client--art-scope)); repo secrets (not environment-scoped), so `deploy-k3s`'s `environment: staging` job can still see them — steps no-op if unset |

K3s workflows reuse the existing GitHub `staging` Environment rather than duplicating secret names — except the `R2_GATEWAY_*` trio and `R2_ACCOUNT_ID`, which are repo secrets shared with the art pipeline, not environment-scoped. Client/Android/art secrets are scoped separately — see [build.md](./build.md#required-secrets-client--art-scope).

## EKS (session-scoped validation stack)

Own dedicated hostnames — `wstodplay.galaxxigames.com` (game), `todplay.galaxxigames.com` (web) — so a session never touches K3s's four live records. Only the prod pair is deployed; `eks-test` overlays are committed but not wired to any workflow. Apply-ready but not always-on → [decisions.md](./decisions.md#eks-kept-session-scoped-not-always-on).

**Topology:** Cloudflare CNAME → ALB `:443` (HTTPS, ACM wildcard `*.galaxxigames.com`, host-based routing, `idle_timeout=300`) → two target groups (`target_type=instance` on the existing NodePorts — 30300 game, 30310 web — registered via `aws_autoscaling_attachment`, no Load Balancer Controller) → managed node group (2× `t3.small`, private subnets, NAT egress, dedicated node security group whose launch template opts it out of EKS's default SG wiring — see [decisions.md](./decisions.md#eks-node-security-group-must-carry-its-own-control-plane-and-self-referencing-rules)) → `corp-tower-server`/`corp-tower-web` pods → ElastiCache Redis over `rediss://`. Game target group health matcher is `426` (`ws` answers a plain `GET /` with Upgrade Required); web is `200`. No in-cluster Redis on EKS — ElastiCache replaces it entirely; K3s keeps its own.

**Kubernetes:** `infra/eks/apps/corp-tower/{base,web-base}` mirror the K3s bases minus the Redis manifests; `overlays/{eks-prod,eks-test}/{game,web}` mirror K3s's namespace/NodePort split (`corp-tower-prod`/`corp-tower-test`, NodePorts 30300/30301 game, 30310/30311 web).

| Workflow | Behavior |
|---|---|
| `EKS-Infra-Plan.yml` | Plan only (renamed from `Server-EKS-Infra-Plan.yml`) |
| `EKS-Infra-Apply.yml` / `EKS-Infra-Destroy.yml` | Typed `APPLY_EKS` / `DESTROY_EKS`; apply records the applied `infra/eks/terraform` git tree to the state bucket for the deploy-side drift check; destroy also fails if any `Stack=server-eks`-tagged resource is still live, cross-verified against the actual EC2 API rather than trusting the tagging API alone → [decisions.md](./decisions.md#eks-infra-destroy-verifies-orphans-against-live-ec2-not-the-tagging-api-alone) |
| `EKS-Force-Unlock.yml` | Manual, clears a stuck Terraform S3-native state lock (no auto-expiry) left by a cancelled/crashed run, using the Lock ID from that run's error output |
| `EKS-Infra-Auto-Destroy.yml` | Scheduled ~18:00 UTC daily, no-ops if no cluster exists — the control that actually acts, since AWS Budgets alerts lag 8-24h |
| `EKS-Shared-Infra-Apply.yml` | One-time apply of the persistent ACM/Cloudflare root |
| `EKS-Deploy-Game-Server.yml` / `EKS-Deploy-Web-Server.yml` | A `verify-infra` job fails the run before any build when `infra/eks/terraform` differs from the tree the last `EKS Infra Apply` recorded (warn-only if no marker) → [decisions.md](./decisions.md#eks-deploy-workflows-fail-fast-on-infra-code-the-last-infra-apply-never-ran). Then test → build → push ECR → `aws eks update-kubeconfig` → `kubectl apply` → Cloudflare CNAME upsert (PATCH if the record exists, POST to create it otherwise — mirrors the K3s DNS step) → WSS/HTTPS smoke test. Game deploy additionally asserts `REDIS_URL` reached the pod as `rediss://`, ElastiCache `CurrConnections` is non-zero, and an idle WebSocket survives past 60s |
| `EKS-Deploy-All.yml` | Manual dispatcher, `deploy_target` choice `All\|Game only\|Web only`, runs the two cores above accordingly |
| `EKS-Cleanup-Game-Server.yml` | Deletes the game server's Deployment+Service by name; namespace and cluster stay up |
| `EKS-Cleanup-Web-Server.yml` | Soft cleanup: `kubectl apply -k`'s an `eks-prod/web-maintenance` overlay that swaps the web Deployment's image to `nginx:alpine` serving an offline/maintenance placeholder, instead of deleting it |
| `EKS-Cleanup-All.yml` | Manual dispatcher, `cleanup_target` choice `All\|Game only\|Web only`, runs the two cores above accordingly |
| `EKS-Infra-Diagnose.yml` | Nodes, ALB target-group health, DNS, Redis reachability |

No bastion, SSH, Ansible, or Caddy on this path: the ALB terminates TLS directly and `aws eks update-kubeconfig` replaces K3s's bastion-tunnel kubeconfig dance.

**One-time manual setup, before the first apply (cannot be done by any workflow):** expand `AWS_ROLE_ARN`'s IAM permissions for EKS/ElastiCache/ELB/NAT/OIDC (CI cannot grant itself permissions); create AWS Budgets alerts at $20/$40/$50; resolve an operator IAM role ARN (not an assumed-role ARN) into the `EKS_OPERATOR_PRINCIPAL_ARN` secret, which grants `kubectl` cluster-admin via an EKS access entry; run `EKS-Shared-Infra-Apply.yml` once. The two Cloudflare CNAMEs (`wstodplay`, `todplay`) need no manual creation — the deploy workflows create them on first use, same as K3s's DNS step.

## Backup (physical machine, 4 dev instances)

A manually-operated physical machine (Linux Mint) runs four containers behind one Cloudflare Tunnel, entirely independent of K3s: two dev game servers (`devwstod1`/`devwstod2`, `wss://`, loopback ports 3001/3002) and two dev web servers (`devtod1`/`devtod2`, `https://`, loopback ports 8091/8092, `nginx:alpine`). Game servers run the unmodified `src/Server/Dockerfile` image with no Redis (`Redis_State.js`'s single-instance in-memory mode). Every hostname is one level below the zone apex, inside Cloudflare's free Universal SSL depth limit for a proxied Tunnel record — full rationale → [decisions.md](./decisions.md#physical-backup-four-dev-instances-one-shared-tunnel).

**Script logic is tracked in the repo**, `scripts/backup/` — `backup-server-{up,down,status}.sh` and `backup-web-{up,down,status}.sh`, each taking an instance argument (`1` or `2`). Only credentials and per-run state stay off the repo, in `$CORP_TOWER_BACKUP_STATE_DIR` (default `~/corp-tower-server-backup`, kept out-of-repo because `actions/checkout`'s clean step would otherwise wipe it every CI run): `.env.backup` (indexed schema — `WS1_DOMAIN`/`WS1_PORT` … `WEB2_BUILD_SHA`; template `scripts/backup/.env.backup.example`), `web-content-1/`, `web-content-2/`, and the Cloudflare Tunnel's own config/credentials. `stop_cloudflared_if_idle` (`backup-common.sh`) only stops the shared tunnel once **all four** containers are down, so tearing one down never cuts off the other three.

Client endpoint config for `devtod1`/`devtod2` is written by `scripts/write-endpoint-config.sh` before each build — each instance points its `PRIMARY` at its own game instance and `FAILOVER` at the other (`devwstod1`↔`devwstod2`), with the debug UI enabled.

| Workflow | Trigger | Behavior |
|---|---|---|
| `Backup-Diagnose.yml` | Manual | Runs all four `*-status.sh` scripts plus `cloudflared` service/tunnel state |
| `Backup-Deploy-Game-Server.yml` / `Backup-Cleanup-Game-Server.yml` | Reusable cores, `target: devwstod1\|devwstod2` | Up/down via the matching `backup-server-*.sh <instance>` |
| `Backup-Deploy-Web-Server.yml` / `Backup-Cleanup-Web-Server.yml` | Reusable cores, `target: devtod1\|devtod2` | Build the Web export (`fetch-private-assets` + `build-godot-web`), deploy via `backup-web-*.sh <instance>` |
| `Backup-Deploy-All.yml` | **Auto** (push to `src/Server/**` and/or the client/build-input paths below) or manual (`deploy_target` choice `All\|Game only\|Web only` × `instance` choice `1\|2\|all`) | On push, diffs `github.event.before`..`github.sha` to deploy only the service(s) whose paths actually changed, always targeting instance 1 for that service, each guarded: skipped if that instance's container isn't currently running, so a routine push never silently un-stands-down it. Manual dispatch ignores the changed-paths check and runs `deploy_target`/`instance` directly, unguarded |
| `Backup-Cleanup-All.yml` | Manual, `cleanup_target` choice `All\|Game only\|Web only` × `instance` choice `1\|2\|all`, gated by a typed `confirm_cleanup` phrase specific to the chosen combination (printed to the run summary) | Stop/stand-down the container(s); DNS record(s) left in place pointing at the idle tunnel |

None of these workflows has a `pull_request`/`pull_request_target` trigger, matching every other workflow in this (public) repo — required, since a self-hosted runner would otherwise let any external contributor's PR execute code on the physical machine. Only collaborators with repo write access can dispatch these.

### Operational runbook (backup)

1. **Bring an instance up:** dispatch `Backup Deploy All` with `deploy_target`/`instance` narrowed to what's needed (or the matching `scripts/backup/backup-{server,web}-up.sh <instance>` directly on the machine).
2. **Check state (read-only, any time):** `Backup Diagnose`, or `scripts/backup/backup-{server,web}-status.sh <instance>` on the machine.
3. **Stand down:** dispatch `Backup Cleanup All` with its typed `confirm_cleanup` phrase.

## Deprecated: Docker EC2 staging

Removed — see [decisions.md](./decisions.md#removed-systems-stale-references-you-may-still-hit).
