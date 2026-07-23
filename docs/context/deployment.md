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
| `Server-K3s-Automated-Master.yml` | Auto (push to `main`/`master` on watched paths) or manual | Orchestrates the others — see modes below |
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

## Deprecated: Docker EC2 staging

Removed — see [decisions.md](./decisions.md#docker-ec2-staging-removed-in-favor-of-k3s).
