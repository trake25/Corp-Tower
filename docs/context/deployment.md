# Deployment

Scope: infrastructure, runtime topology, and operational runbooks. Build/CI that produces artifacts → [build.md](./build.md). Server code → [backend.md](./backend.md).

## Overview

Two parallel Terraform paths exist. **Only K3s is active** and carries live staging traffic; EKS is plan-only.

| Path | Status |
|---|---|
| K3s (`infra/k3s`) | **Active** — live staging |
| EKS (`infra/eks`) | Plan-only, not applied ([why](./decisions.md#eks-kept-plan-only)) |

Region for both: `ap-southeast-1`.

## Terraform roots

| Root | State key | Resource tag |
|---|---|---|
| `infra/k3s/terraform` | `k3s-lab/terraform.tfstate` | `Environment=k3s-lab` |
| `infra/eks/terraform` | `eks-lab/terraform.tfstate` | stack `server-eks` |

Workflows create the shared S3 backend bucket if missing, via `.github/actions/terraform-backend-bootstrap`. AWS/Terraform CLI setup, SSH-key resolution, and the init/fmt/validate/plan sequence are shared through `.github/actions/aws-terraform-setup`, `resolve-ssh-key`, and `terraform-validate-plan` — used by K3s Plan/Apply/Cleanup and EKS Plan alike. EKS's Terraform reuses the existing ECR repository as a data source rather than creating a new one.

## K3s topology

- **`EC2-GW`** — public IPv4: SSH bastion, Caddy WSS gateway, Cloudflare DNS updater, NAT instance. Uses Docker only to run the Caddy gateway container (the game server workload itself runs in K3s).
- **`EC2-K3S-CP`** — private K3s control plane, default `t3.small`.
- **`EC2-K3S-A1` / `EC2-K3S-A2`** — private K3s agents, default `t3.micro` (2 agents by default).
- VPC CIDR defaults to `10.60.0.0/16` — chosen to avoid K3s's default pod CIDR (`10.42.0.0/16`) and service CIDR (`10.43.0.0/16`).
- Public subnet: EC2-GW. Private subnet: K3s control plane + agents, default route via EC2-GW's primary network interface.
- Security groups: public `22/80/443` only on EC2-GW; private K3s API, kubelet, Flannel VXLAN, SSH, and NodePort traffic scoped to lab security groups.
- Traefik and ServiceLB are disabled — public traffic stays on EC2-GW Caddy.
- `ws.tod.galaxxigames.com` currently points at the K3s gateway via Cloudflare DNS.

## K3s runtime

- Namespace `corp-tower`. In-cluster Redis `ClusterIP` service `redis:6379`. Server deployment: 2 replicas, `REDIS_URL=redis://redis:6379`. Fixed NodePort `30300/tcp`. EC2-GW Caddy reverse-proxies `ws.tod.galaxxigames.com` → private K3s node IPs on `30300`.
- `ecr-pull` image-pull secret is refreshed by the deploy workflow, reusing the same ECR repository secret as the old Docker staging path.
- `Server-K3s-Deploy.yml` generates an **uncommitted** `overlays/runtime` Kustomize overlay on top of the committed `overlays/lab` at deploy time, to inject the real ECR image tag — the committed `lab-placeholder` tag in `overlays/lab` is never what actually runs.

## Caddy gateway ACME cert persistence (R2)

EC2-GW's root volume is ephemeral, so a destroyed/recreated gateway used to lose Caddy's automatic-HTTPS state and request a brand-new Let's Encrypt cert every time — see [decisions.md](./decisions.md#caddy-gateway-acme-cert-cache-persisted-to-r2) for the rate-limit incident this caused. `configure_caddy.yml` (`infra/k3s/ansible/roles/gateway/tasks/`) now round-trips the `corp-tower-k3s-caddy-data` Docker volume through R2 bucket `corp-tower-gateway-state`:

- **Restore** (before Caddy starts): `Server-K3s-Deploy.yml`'s `Restore Caddy gateway state from R2` step downloads the archive (no-ops if none exists yet) and `scp`s it to EC2-GW; Ansible extracts it into the volume.
- **Liveness check**: after start, Ansible waits 3s and asserts the container is still running, capturing `docker logs` and failing loudly if not — replaces a prior silent failure mode where a crashed Caddy container wasn't caught until the public WSS smoke test timed out 5 minutes later.
- **Persist** (after the liveness check passes): Ansible re-archives the volume; the `Persist Caddy gateway state to R2` step `scp`s it back and uploads it.
- On smoke-test failure regardless of cause, `Dump Caddy gateway logs on smoke test failure` SSHes to EC2-GW and dumps `docker ps`/`docker logs` into the CI log.

The archive holds the gateway's live ACME account key and TLS private key: both the runner and EC2-GW sides restrict it to `0600` immediately after it's written and delete it once consumed. R2 was chosen over AWS S3 to reuse the project's existing free R2 usage without adding AWS IAM scope; the payload is a few KB and R2's free tier (10 GB storage, 1M/10M Class A/B ops/month, no egress fee) has no realistic exposure at this cadence.

**Not yet verified end-to-end** — added while blocked on the rate limit it fixes; first live confirmation is pending the next deploy.

## K3s workflows

| Workflow | Trigger | Behavior |
|---|---|---|
| `Server-K3s-Automated-Master.yml` | Auto (push to `main`/`master` on watched paths) or manual | Orchestrates the others — see modes below. Fast path only: checks the K3s control plane is actually running before deploying to it, and falls back to `Server-Backup-Deploy.yml` if K3s is down but the physical backup is up |
| `Server-K3s-Infra-Plan.yml` | Reusable / manual | Plans the K3s Terraform root; intentionally allows create/delete actions to be reviewed (e.g. weekend recreate after weekday cleanup) |
| `Server-K3s-Infra-Apply.yml` | Manual, requires `APPLY_SERVER_K3S` | Plans first and **hard-fails if the plan contains any delete/replace action** — run Cleanup's `terraform_destroy` first if a plan would replace/delete resources |
| `Server-K3s-Deploy.yml` | Reusable / manual | Tests server code → builds/pushes Docker image → installs/configures K3s via EC2-GW bastion/NAT (restoring/persisting Caddy's ACME cert cache to R2 around the Ansible run) → refreshes `ecr-pull` → applies the Kustomize overlay → validates nodes/Redis/replicas/Caddy/public WSS |
| `Server-K3s-Diagnostics.yml` | Reusable / manual | Inspects tagged lab AWS resources, verifies Cloudflare DNS ownership, probes SSH through the bastion |
| `Server-K3s-Cleanup.yml` | Manual, requires `confirm_cleanup` | `runtime_only` (needs `CLEANUP_SERVER_K3S`) removes K3s/Caddy artifacts; `terraform_destroy` (needs `DESTROY_SERVER_K3S`) removes all AWS resources in `infra/k3s/terraform` |

K3s Deploy, Diagnostics, and Infra Plan are all reusable workflow calls, so the Automated Master can orchestrate them. Argo CD is prepared in manifests only — no K3s workflow installs or exposes it.

### Automated Master modes

| Manual mode | Runs |
|---|---|
| `full_preflight` | Diagnostics → Infra Plan → K3s Deploy |
| `fast_server_deploy` | K3s Deploy directly |
| `infra_plan_only` | Infra Plan only |

Automatic push-path routing (to `main`/`master`): server (`src/Server/**`) or Kustomize app (`infra/k3s/apps/**`) changes → fast deploy path; Ansible changes → diagnostics before deploy; Terraform changes → infra plan only (via the reusable Infra-Plan call; **the plan is not auto-rejected here even with delete/replace actions** — that gate lives only in `Infra-Apply.yml`, which this workflow never calls); K3s workflow file changes → diagnostics + infra plan. Concurrency group `server-k3s-automated-master-<ref>` **queues** overlapping runs (`cancel-in-progress: false`), unlike `Server-K3s-Deploy.yml`'s own group.

**Fast path deploy-target routing:** only the fast path (`fast_k3s_deploy == true`) is affected — `full_preflight`/Ansible/Terraform paths always target K3s directly, since they're explicitly about fixing K3s itself. For the fast path, `check-k3s-status` queries AWS (`describe-instances`, tag `Role=k3s-control-plane`, `Environment=k3s-lab`, `running`) for exactly one running control-plane instance. If found, `k3s-deploy-fast` runs as before. If not, `check-backup-status` (runs only in this branch, so a healthy K3s never depends on the physical machine's runner being online) checks the physical backup's `corp-tower-server` Docker container via `docker ps` on the self-hosted (`backup`-labeled) runner; if it's up, `backup-deploy-fast` calls `Server-Backup-Deploy.yml` (now also a `workflow_call`, not just `workflow_dispatch`) instead. If neither K3s nor the backup is up, `fast-deploy-unavailable` fails the run with an explicit error rather than the previous opaque failure inside `generate_k3s_inventory.py` (which raised on zero/wrong-count AWS instances).

## Operational runbook

1. **First-time / cold start:** `Server K3s Infra Plan` → `Server K3s Infra Apply` (`APPLY_SERVER_K3S`) → `Server K3s Automated Master` with `full_preflight`.
2. **Ordinary server/image update, lab already healthy:** `Server K3s Automated Master` with `fast_server_deploy` (or just push — watched paths trigger it automatically).
3. **AWS/SSH/DNS/cluster reachability looks off:** `Server K3s Diagnostics`.
4. **Returning to a clean runtime state:** `Server K3s Cleanup` (`runtime_only`), or `terraform_destroy` (`DESTROY_SERVER_K3S`) to remove all K3s AWS resources.

Use manual `fast_server_deploy` when you don't want to wait for a push-triggered run. Use manual `full_preflight` after infra restarts, Ansible changes, workflow changes, or any uncertainty about current lab health.

### Operational checks (what "healthy" means)

Terraform `fmt`/`validate` · server `npm test` · K3s Ansible syntax check · all K3s nodes Ready · Redis deployment Ready · two server replicas Ready · `ecr-pull` secret present in `corp-tower` · EC2-GW Caddy validates, reloads, and is confirmed still running (liveness-checked with `docker logs` captured on failure) · Cloudflare DNS resolves to the K3s gateway public IP · WebSocket smoke connects to `wss://ws.tod.galaxxigames.com`.

### Observability commands

```bash
# Cluster state
kubectl -n corp-tower get pods -o wide
kubectl -n corp-tower get all -o wide
kubectl get nodes -o wide

# Live game server logs
kubectl -n corp-tower logs deploy/corp-tower-server --all-containers --tail=200 -f

# Scheduling / image-pull / restart / readiness issues
kubectl get events -A --sort-by=.lastTimestamp

# If metrics-server is available
kubectl top nodes
kubectl top pods -A
```

On EC2-GW: `sudo docker logs -f corp-tower-k3s-caddy` (public gateway traffic/proxy issues). On K3s nodes: `sudo journalctl -u k3s -f` (control plane) / `sudo journalctl -u k3s-agent -f` (agents).

## Argo CD readiness

Not installed by the first K3s rollout. Bootstrap manifests: `infra/k3s/argocd/bootstrap`. When enabled, Argo CD stays private — bastion + `kubectl port-forward` only. First sync is manual; automated prune/self-heal waits until one manual sync + a rollback test succeed. Private repos need a persistent repo-read credential (`GITHUB_TOKEN` is not suitable long-term). **Known bug — fix before enabling:** `application.yaml`'s `spec.source.targetRevision` is pinned to an already-merged feature branch instead of `main`. Full rationale → [decisions.md](./decisions.md#argo-cd-prepared-but-not-enabled).

## Required secrets (infra scope)

| Secret | Used for |
|---|---|
| `AWS_ROLE_ARN` | GitHub OIDC → AWS for Terraform/K3s workflows |
| `ECR_REPOSITORY` | Server image push/pull |
| `EC2_STAGING_HOST` | EC2 staging host reference |
| `EC2_STAGING_USER` | SSH user for EC2-GW/K3s nodes |
| `EC2_STAGING_SSH_KEY` | SSH private key |
| `EC2_STAGING_SSH_PUBLIC_KEY` | *(optional)* Preferred for Terraform key-pair creation; if empty, K3s infra workflows derive the public key from `EC2_STAGING_SSH_KEY` |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` | DNS updates for `ws.tod.galaxxigames.com` |
| `EC2_STAGING_PORT`, `STAGING_SSH_CIDR`, `STAGING_GAME_PORT_CIDR` | *(optional)* |
| `R2_GATEWAY_BUCKET`, `R2_GATEWAY_ACCESS_KEY_ID`, `R2_GATEWAY_SECRET_ACCESS_KEY` | Caddy ACME cert cache persistence to R2 bucket `corp-tower-gateway-state` (reuses `R2_ACCOUNT_ID` from [build.md](./build.md#required-secrets-client--art-scope)); repo secrets (not environment-scoped), so `deploy-k3s`'s `environment: staging` job can still see them — steps no-op if unset |

K3s workflows reuse the existing GitHub `staging` Environment rather than duplicating secret names — except the `R2_GATEWAY_*` trio and `R2_ACCOUNT_ID`, which are repo secrets shared with the art pipeline, not environment-scoped. Client/Android/art secrets are scoped separately — see [build.md](./build.md#required-secrets-client--art-scope).

## EKS (plan-only)

`infra/eks/terraform` — parallel managed-AWS path, **plan workflow only, no apply**. Planned topology: EKS cluster + managed node group running server pods in private subnets; internet-facing NLB exposing WebSocket traffic on `443/tcp`; NLB subnet mappings reserving Elastic IPs for stable public ingress; ElastiCache Redis replacing Docker/in-cluster Redis. Constraints and why it's not applied yet → [decisions.md](./decisions.md#eks-kept-plan-only).

**`Server-EKS-Infra-Plan.yml`:** manual `workflow_dispatch` or reusable `workflow_call`. Configures AWS via OIDC, ensures the shared S3 backend bucket exists, runs `init`/`fmt -check`/`validate`/`plan`, shows the full no-color plan in workflow logs. Does not apply infrastructure.

## Backup server (manual, physical machine)

A manually-operated physical machine (Linux Mint) acts as a standby for the whole K3s stack, for when it's destroyed or unusable (e.g. the Caddy/Let's Encrypt cert rate limit — see [decisions.md](./decisions.md#caddy-gateway-acme-cert-cache-persisted-to-r2)). It's an entirely separate path, not a K3s node: one Docker container running the unmodified `src/Server/Dockerfile` image, no Redis (`Redis_State.js`'s single-instance in-memory mode is used deliberately), exposed at `wss://devtod.galaxxigames.com` via a Cloudflare Tunnel (`cloudflared`) rather than Caddy — Cloudflare terminates TLS at its edge with its own certificate, so this path never touches Let's Encrypt. `ws.tod.galaxxigames.com` and `devtod.galaxxigames.com` are separate DNS names/records that never fight each other; only one is meant to be actively used at a time, decided manually. Client-side automatic failover between the two → [networking.md § NetworkManager](./networking.md#networkmanager). Full rationale for the separate hostname and the out-of-repo automation → [decisions.md](./decisions.md#backup-server-separate-hostname-and-out-of-repo-automation).

**Where the automation actually lives:** `~/corp-tower-server-backup/` on the physical machine itself — deliberately **outside** the git repo (it holds live Cloudflare credentials in a gitignored-equivalent `.env.backup`, and `actions/checkout`'s clean step would wipe anything gitignored *inside* the repo checkout on every CI run anyway). Only the two workflow files below live in the repo, and they contain no secrets — they call the external scripts by absolute path (`$HOME/corp-tower-server-backup/server-backup-{up,down}.sh`) on the self-hosted runner.

| Workflow | Trigger | Behavior |
|---|---|---|
| `Server-Backup-Deploy.yml` | Manual `workflow_dispatch`, or reusable `workflow_call` (from `Server-K3s-Automated-Master.yml`'s fast-path fallback when K3s is down but this backup is up — see [K3s workflows](#k3s-workflows)) | Runs on self-hosted runner (label `backup`); calls `server-backup-up.sh` — builds the server image, runs the container, starts `cloudflared` (user-level systemd service), upserts the `devtod.` Cloudflare CNAME, verifies the container logs, and self-updates `CORP_TOWER_IMAGE_TAG` in `.env.backup` to the deployed commit |
| `Server-Backup-Cleanup.yml` | Manual `workflow_dispatch`, requires `confirm_cleanup` = `CLEANUP_SERVER_BACKUP` | Runs on the same self-hosted runner; calls `server-backup-down.sh` — stops/removes the container and stops `cloudflared`. Leaves the `devtod.` DNS record in place (idle tunnel, harmless) |

Neither workflow has a `pull_request`/`pull_request_target` trigger, matching every other workflow in this (public) repo — required, since a self-hosted runner would otherwise let any external contributor's PR execute code on the physical machine. Only collaborators with repo write access can dispatch these.

### Operational runbook (WS backup)

1. **Bring it up:** dispatch `Server-Backup-Deploy.yml`, or run `~/corp-tower-server-backup/server-backup-up.sh` directly on the machine.
2. **Check state (read-only, any time):** `~/corp-tower-server-backup/server-backup-status.sh`.
3. **Stand down once K3s is healthy again:** dispatch `Server-Backup-Cleanup.yml` (`CLEANUP_SERVER_BACKUP`), then trigger `Server K3s Automated Master` (`fast_server_deploy`) so `ws.tod.galaxxigames.com` is confirmed current.

## Web (HTML5) backup

The same physical machine also backs up the GitHub-Pages-hosted web build ([build.md § Client HTML5 Pages](./build.md#client-html5-pages)), serving it at **`https://devplay.galaxxigames.com`** — a separate hostname from `https://play.tod.galaxxigames.com` (GitHub Pages' custom domain). Same class of reason as `devtod` vs `ws.tod` above, different underlying limit: Cloudflare's free Edge Certificate (Universal SSL) only covers the zone apex and *one* level of subdomain below it. `devtod`/`devplay` are one level deep and get automatic coverage; `play.tod` is two levels deep and would need a paid Advanced Certificate Manager add-on (Total TLS) to get Cloudflare edge-cert coverage if reused directly for the tunnel — confirmed the hard way (`ERR_SSL_VERSION_OR_CIPHER_MISMATCH`) before settling on the separate-hostname design. Full rationale → [decisions.md](./decisions.md#web-html5-backup-dedicated-hostname-not-shared-with-github-pages).

Mechanism: the same Cloudflare Tunnel as the WS backup carries a second `ingress` hostname rule (`devplay.galaxxigames.com` → `http://localhost:8090`) — one tunnel, two backends, no second tunnel needed. Unlike the WS backup's server image, the web build isn't produced by a local Dockerfile — it's built on a GitHub-hosted runner (the same `fetch-private-assets` + `build-godot-web` composite actions as [Client HTML5 Pages](./build.md#client-html5-pages)) and shipped to the physical machine as a plain workflow artifact, then served from an `nginx:alpine` container (`corp-tower-web`, bound to `127.0.0.1:8090` only — `cloudflared` is its only intended caller).

**No automatic coupling between Pages and the web backup:** `Client-HTML5-Pages.yml`, `Client-HTML5-Undeploy.yml`, `Client-HTML5-Backup-Deploy.yml`, and `Client-HTML5-Backup-Cleanup.yml` are fully independent — none of them touches another as a side effect, so `play.tod.galaxxigames.com` and `devplay.galaxxigames.com` can both be live at once. `Client-HTML5-Set-Live-Host.yml` is the only place the "only one live" policy is enforced, by explicitly chaining a pair of calls itself — see its table row below. Full rationale for why this moved out of the base workflows → [decisions.md](./decisions.md#web-html5-backup-dedicated-hostname-not-shared-with-github-pages).

**Auto-deploy on client push:** `Client-HTML5-Backup-Deploy.yml` also triggers on push to `main`/`master` for `src/Client/**`, the `build-godot-web`/`fetch-private-assets` composite actions, `.github/godot/export_presets.web.ci.cfg`, and its own workflow file — so the backup's served build stays current with the latest client code independent of whether it's the currently-live host. `web-backup-status.sh`'s "commits behind/ahead of `origin/main`" report reflects this.

| Workflow | Trigger | Behavior |
|---|---|---|
| `Client-HTML5-Backup-Deploy.yml` | Push to `main`/`master` on client-side paths (see above), manual `workflow_dispatch`, or reusable `workflow_call` (from `Client-HTML5-Set-Live-Host.yml`'s `target: backup` path) | `build` job (hosted runner): fetches private art, builds the Web export, uploads it as a plain artifact. `deploy-to-backup` job (self-hosted runner, label `backup`): downloads the artifact, calls `web-backup-up.sh` — refuses an empty/broken build (checks for `index.html` + a `.wasm` file), syncs it into a local content dir, (re)starts `corp-tower-web`, upserts the `devplay.` Cloudflare CNAME, and records the deployed commit SHA in `.env.backup` |
| `Client-HTML5-Backup-Cleanup.yml` | Manual `workflow_dispatch`, requires `confirm_cleanup` = `CLEANUP_WEB_BACKUP`, or reusable `workflow_call` (from `Client-HTML5-Set-Live-Host.yml`'s `target: pages` path) | Runs on the same self-hosted runner; calls `web-backup-down.sh` — stops/removes `corp-tower-web`. Leaves the `devplay.` DNS record in place (idle tunnel, harmless), same as the WS backup does for `devtod.` |
| `Client-HTML5-Set-Live-Host.yml` | Manual `workflow_dispatch` | Recommended entry point: pick `target: pages` or `target: backup`. `target: pages` dispatches `Client-HTML5-Pages.yml`, then (on success) `Client-HTML5-Backup-Cleanup.yml`. `target: backup` dispatches `Client-HTML5-Undeploy.yml` (soft mode), then (on success) `Client-HTML5-Backup-Deploy.yml` — this workflow owns that pairing explicitly; the four underlying workflows no longer do it themselves. `target: backup` requires typing `SWITCH_TO_BACKUP` (it takes GitHub Pages offline); `target: pages` doesn't, matching `Client-HTML5-Pages.yml`'s own no-confirmation dispatch |

Reusable `workflow_call` invocations of `Client-HTML5-Backup-{Deploy,Cleanup}.yml` skip their manual-dispatch confirmation strings via an `invoked_via_call` input, declared only under `on.workflow_call.inputs` (defaulting to `true`) — `github.event_name` turned out not to be a reliable way to detect this. Full gotcha → [decisions.md](./decisions.md#nested-reusable-workflows-cant-detect-their-own-trigger-via-event-name).

Scripts (`web-backup-{up,down,status}.sh`) live alongside the WS backup's scripts in `~/corp-tower-server-backup/` (see above), sharing `server-backup-common.sh`'s `upsert_cloudflare_cname`/`wait_for_cname`/`start_cloudflared_if_needed`/`stop_cloudflared_if_idle` helpers. `wait_for_cname` verifies a DNS cutover via the **Cloudflare API**, not `dig` — full reason → [decisions.md](./decisions.md#dns-cutover-verification-must-use-the-cloudflare-api-not-dig-for-proxied-records).

### Operational runbook (web backup)

1. **Bring it up:** dispatch `Client-HTML5-Set-Live-Host.yml` (`target: backup`, `confirm_backup: SWITCH_TO_BACKUP`) — recommended — or `Client-HTML5-Undeploy.yml` directly, or `Client-HTML5-Backup-Deploy.yml` directly, or run `web-backup-up.sh` on the machine with `CORP_TOWER_WEB_BUILD_DIR` pointed at an exported `build/web` directory.
2. **Check state (read-only, any time):** `~/corp-tower-server-backup/web-backup-status.sh` — also reports how many commits behind (or ahead of) `origin/main` the currently-served build is.
3. **Stand down once Pages is healthy again:** dispatch `Client-HTML5-Set-Live-Host.yml` (`target: pages`) — recommended — or `Client-HTML5-Pages.yml` directly, or `Client-HTML5-Backup-Cleanup.yml` directly (`CLEANUP_WEB_BACKUP`).

## Deprecated: Docker EC2 staging

Removed — see [decisions.md](./decisions.md#docker-ec2-staging-removed-in-favor-of-k3s).
