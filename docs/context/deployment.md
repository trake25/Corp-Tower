# Deployment

Scope: infrastructure, runtime topology, operational runbooks. Build/CI that
produces the artifacts → [build.md](./build.md). Server code →
[backend.md](./backend.md). Per-symbol file and line → grep
[map/infra.md](./map/infra.md).

## Overview

Two parallel Terraform paths, region `ap-southeast-1` for both.

- **EKS (`infra/eks`) is the production-grade target** — fully implemented,
  deployed on demand for hours and torn down after.
- **K3s (`infra/k3s`) is the lab** — where infra changes are tried before they
  reach EKS.
- The physical backup machine is the **development** environment — two dev
  instances plus the always-on public demo.

**EKS is session-scoped and never auto-applies.** Its control plane, NAT Gateway,
ALB and ElastiCache have no free tier, so every hour of existence spends real
credits — the nightly auto-destroy exists to bound that. The price is ~15 min
apply and ~14 min destroy of AWS-side latency per session, which no workflow
change can shorten.

### Terraform roots

| Root | State key | Notes |
|---|---|---|
| `infra/k3s/terraform` | `k3s-lab/terraform.tfstate` | `Environment=k3s-lab` |
| `infra/eks/terraform` | `eks-lab/terraform.tfstate` | stack `server-eks`, destroyed every session |
| `infra/eks/terraform-shared` | `eks-shared/terraform.tfstate` | persistent — ACM wildcard + Cloudflare DNS validation, applied once, never destroyed |

Workflows create the shared S3 backend bucket if missing.
**Extend the shared composite actions rather than re-implementing per workflow** —
`terraform-backend-bootstrap`, `aws-terraform-setup`, `terraform-validate-plan`
back every Terraform workflow; K3s additionally uses `resolve-ssh-key`. Prefer
GitHub Actions for Terraform validation and planning over local manual runs.

## K3s topology

- **`EC2-GW`** — public IPv4: SSH bastion, Caddy WSS gateway, Cloudflare DNS
  updater, NAT instance. Uses Docker only for the Caddy container; the game
  workload runs in K3s.
- **`EC2-K3S-CP`** — private control plane. **`EC2-K3S-A1`/`A2`** — private agents.
- VPC CIDR `10.60.0.0/16`, **chosen to avoid K3s's own pod (`10.42.0.0/16`) and
  service (`10.43.0.0/16`) CIDRs.**
- Traefik and ServiceLB are disabled — public traffic stays on EC2-GW Caddy.
- Four hostnames point at the gateway via Cloudflare DNS: `wsplaytod` /
  `wstodtest` (game) and `playtod` / `todtest` (web), enumerated in
  `infra/k3s/gateway_sites.yml` — **the single source both the Caddy config and
  the DNS upsert render from.**

### Runtime

Two isolated namespaces, `corp-tower-prod` and `corp-tower-test`, each with its own
in-cluster Redis and its own server and web Deployments. Fixed NodePorts: 30300
prod game · 30301 test game · 30310 prod web · 30311 test web.

- **`ecr-pull` is namespace-scoped** — imagePullSecrets don't cross namespaces, so
  prod and test each carry their own copy from the same ECR repository.
- The four committed Kustomize overlays carry a placeholder image tag; each deploy
  generates an **uncommitted** `overlays/runtime` (game) or `overlays/runtime-web`
  at deploy time with the real ECR tag. **The committed tag is never what runs.**
- **Every K3s deploy renders all four Caddy site blocks and upserts all four DNS
  records**, whichever single target it deploys — the gateway is one shared Caddy
  container, so a prod-only deploy must never orphan test's route.

### Caddy gateway ACME cert persistence (R2)

EC2-GW's root volume is ephemeral, so a recreated gateway carries no Caddy
automatic-HTTPS state. `configure_caddy.yml` round-trips the Caddy data volume
through R2 bucket `corp-tower-gateway-state`: restore before start, a liveness
check after, then persist.

**Landmine — Let's Encrypt allows 5 duplicate certificates per identifier set per
168h.** Repeated destroy/recreate cycles within a week hit it and blocked the
public WSS smoke test with `429 rateLimited`, surfacing only as a generic 5-minute
timeout because nothing checked whether Caddy actually stayed up. The liveness
check now waits 3s after start, asserts the container is still running, and fails
loudly with `docker logs` captured.

**Landmine — the archive carries the live ACME account key and TLS private key.**
Both the runner and EC2-GW chmod it `0600` immediately after writing and delete it
once consumed.

R2 over S3 avoids widening AWS IAM scope and reuses existing free usage; the
payload is a few KB.

**Unverified in a live deploy.** The restore path is untested against a real Let's
Encrypt rate-limit event — the condition it exists for. Confirm on the next deploy
that EC2-GW reused the cached account key rather than requesting a new cert.

### K3s workflows

All manual `workflow_dispatch` only. K3s has no push-triggered path — that exists
only for the physical backup's instance 1.

| Workflow | Behaviour |
|---|---|
| `K3s-Infra-Plan.yml` | Plans the root; intentionally allows create/delete actions to be reviewed |
| `K3s-Infra-Apply.yml` | Requires `APPLY_K3S`. Plans first and **hard-fails if the plan contains any delete or replace action** — run Infra Destroy's `terraform_destroy` first if one would |
| `K3s-Infra-Diagnose.yml` | Tagged AWS resources, all four DNS records, SSH through the bastion |
| `K3s-Infra-Destroy.yml` | `runtime_only` (uninstalls K3s/Caddy on every node, affects game *and* web) or `terraform_destroy` (`DESTROY_K3S`) — the only workflow that tears down the shared cluster's AWS resources |
| `K3s-Deploy-Game-Server.yml` | Reusable core per target. Test → build/push one shared image by SHA → K3s via bastion → restore/persist ACME cache → render all four sites → upsert all four DNS → refresh `ecr-pull` → apply overlay → validate nodes/Redis/replica/Caddy/public WSS |
| `K3s-Deploy-Web-Server.yml` | Same plumbing; builds the Web export with debug UI disabled, pushes `nginx:alpine` tagged `web-<target>-<sha>` |
| `K3s-Deploy-All.yml` | Dispatcher. **Always runs game-prod → game-test → web-prod → web-test in that order** regardless of selection, since all four share one Caddy gateway and one R2 ACME cache |
| `K3s-Cleanup-Game-Server.yml` | Deletes the game Deployment/Service and namespace-local Redis **by name — never the namespace**, which also hosts that environment's web server |
| `K3s-Cleanup-Web-Server.yml` | Soft: swaps the web image to a maintenance placeholder. Deployment, Service and DNS are never deleted, so a normal redeploy cleanly overwrites it |
| `K3s-Cleanup-All.yml` | Dispatcher, gated by a typed phrase specific to the chosen combination |

### Operational runbook

1. **Cold start:** Infra Plan → Infra Apply (`APPLY_K3S`) → Deploy All (`All`,
   `all`).
2. **Ordinary update:** Deploy All narrowed to the server and environment that
   need it.
3. **Reachability looks off:** Infra Diagnose.
4. **Back to a clean runtime:** Cleanup All with its typed phrase, or Infra
   Destroy's `terraform_destroy` to remove all AWS resources.

**What "healthy" means:** Terraform `fmt`/`validate` · server `npm test` · Ansible
syntax check · all nodes Ready · Redis Ready · the target's replica Ready ·
`ecr-pull` present in the namespace · Caddy validates, reloads and is confirmed
still running · DNS resolves to the gateway IP for all four hostnames · WSS (game)
or HTTPS (web) smoke connects to the target's own hostname.

```bash
kubectl -n corp-tower-prod get pods -o wide
kubectl -n corp-tower-prod logs deploy/corp-tower-server --all-containers --tail=200 -f
kubectl get events -A --sort-by=.lastTimestamp
```

On EC2-GW: `sudo docker logs -f corp-tower-k3s-caddy`. On nodes:
`sudo journalctl -u k3s -f` / `-u k3s-agent -f`.

## EKS (production-grade target)

Own dedicated hostnames — `wstodplay` (game), `todplay` (web) — so a deploy never
touches K3s's four records. Only the prod pair is deployed; `eks-test` overlays are
committed but not wired to any workflow.

**Topology:** Cloudflare CNAME → ALB `:443` (ACM wildcard, host-based routing,
`idle_timeout=300`) → two target groups on the existing NodePorts, registered via
`aws_autoscaling_attachment` → managed node group (2× `t3.small`, private subnets,
NAT egress) → pods → ElastiCache Redis over `rediss://`. **Game target group
health matcher is `426`** — `ws` answers a plain `GET /` with Upgrade Required;
web is `200`. No in-cluster Redis on EKS.

Routing uses **`target_type=instance` NodePorts**, reusing the numbers K3s already
standardises on, with no extra controllers. An AWS Load Balancer Controller would
add a Helm install and IRSA wiring this stack does not need.

**Landmine — a custom node security group replaces, not extends, EKS's automatic
wiring.** Specifying any custom SG on the launch template silently opts out of the
default node↔control-plane and node↔node rules, with **no error at apply time**.
Three rules must be declared explicitly: node→control-plane 443,
control-plane→node 1025-65535, and a self-referencing all-traffic rule on the node
SG. Missing the self-referencing one still lets the cluster come up — it only drops
cross-node pod traffic, surfacing as intermittent `getaddrinfo EAI_AGAIN` on
whichever pod's DNS query lands on the other node. Any future node group or launch
template must re-add all three; there is no way to inherit them.

**Landmine — the Resource Groups Tagging API is an eventually-consistent search
index.** It keeps listing a deleted resource's ARN for minutes, worst for NAT
Gateways which linger in `deleting`. The post-destroy orphan check cross-verifies
every ARN against a live `describe-*` call before failing. Retrying the tagging
API alone does not converge — observed lag outlasts a 2.5-minute window returning
the same stale ARNs every attempt.

**Landmine — deploy workflows run no Terraform**, so a committed-and-pushed infra
fix is inert until an Infra Apply runs on that commit, and nothing else surfaces
the gap. `EKS-Infra-Apply` records the applied tree hash to the state bucket;
`verify-infra` hard-fails before any build job on a mismatch, and warns without
failing when no marker exists. Deleting the marker downgrades the guard to a
warning, not a pass. **"The fix is on `main`" is not a deploy precondition** — only
an Infra Apply on that commit is.

| Workflow | Behaviour |
|---|---|
| `EKS-Infra-Plan.yml` | Plan only |
| `EKS-Infra-Apply.yml` / `EKS-Infra-Destroy.yml` | Typed `APPLY_EKS` / `DESTROY_EKS`; destroy fails on any live `Stack=server-eks` resource, cross-verified against EC2 |
| `EKS-Force-Unlock.yml` | Clears a stuck S3-native state lock (**no auto-expiry**) left by a cancelled run, using the Lock ID from that run's output |
| `EKS-Infra-Auto-Destroy.yml` | Scheduled ~18:00 UTC daily, no-ops if no cluster exists — **the control that actually acts**, since Budgets alerts lag 8–24h |
| `EKS-Shared-Infra-Apply.yml` | One-time apply of the persistent ACM/Cloudflare root |
| `EKS-Deploy-*.yml` | `verify-infra` → test → build → push → `update-kubeconfig` → apply → CNAME upsert → smoke test. Game additionally asserts `REDIS_URL` arrived as `rediss://`, ElastiCache `CurrConnections` is non-zero, and an idle WebSocket survives past 60s |
| `EKS-Cleanup-*.yml` | Game deletes Deployment+Service by name; web swaps to a maintenance placeholder |
| `EKS-Infra-Diagnose.yml` | Nodes, target-group health, DNS, Redis reachability |

The CNAME upsert polls up to 5 minutes for the hostname to resolve to the new ALB,
since a `PATCH` onto a pre-existing record can outlast the 60s TTL if a resolver
cached the old ALB just before the run — but fails immediately, without polling, if
the ALB's own DNS name resolves to no IPs at all.

No bastion, SSH, Ansible or Caddy on this path: the ALB terminates TLS and
`update-kubeconfig` replaces K3s's bastion-tunnel dance.

**One-time manual setup, before the first apply — no workflow can do these:**
expand `AWS_ROLE_ARN`'s IAM permissions for EKS/ElastiCache/ELB/NAT/OIDC (**CI
cannot grant itself permissions**); create Budgets alerts at $20/$40/$50; resolve
an operator IAM **role** ARN (not an assumed-role ARN) into
`EKS_OPERATOR_PRINCIPAL_ARN`; run `EKS-Shared-Infra-Apply.yml` once. The two
CNAMEs are created by the deploy workflows on first use.

## Backup (physical machine)

A manually-operated Linux Mint machine runs six containers behind one shared
Cloudflare Tunnel, independent of K3s: two dev game servers
(`devwstod1`/`devwstod2`), two dev web servers (`devtod1`/`devtod2`), and one
always-on public demo pair (`wstoddemo`/`toddemo`, instance **3**). Game servers
run the unmodified server image.

**No Redis here** — a single machine on `Redis_State.js`'s in-memory fallback.
Correct for one machine, wrong for multi-replica K3s. Game servers bind loopback
only, matching the web servers: `cloudflared` is the only intended caller.

**Landmine — Cloudflare's free Universal SSL covers the zone apex and exactly one
subdomain level.** A two-level name behind a *proxied* record (which a Tunnel
requires) hits a bare TLS handshake failure. Every K3s hostname escapes this only
because it is DNS-only with Caddy fetching its own cert. Reusing an existing
two-level hostname does not dodge it either — Cloudflare's edge, not the origin,
terminates TLS for a proxied record.

**Landmine — `cloudflared` must only ever run as the user-level systemd service.**
The system-level unit is masked, so a plain `sudo systemctl start cloudflared`
without `--user` targets that masked unit and is a **no-op on the real tunnel**,
not a restart of it. It also needs `loginctl enable-linger` once, since a
self-hosted runner has no TTY for a `sudo` prompt.

**Landmine — two connectors alive on one tunnel ID does not error.** Cloudflare's
edge pins requests to whichever connector it prefers, so a hostname the stale
connector's config doesn't know about 404s while DNS, Docker and both "tunnel
active" checks all still look healthy.

**Landmine — `actions/checkout`'s clean step wipes gitignored and untracked files**
inside the checkout. That is why per-run state lives in a machine-local
`$CORP_TOWER_BACKUP_STATE_DIR`: `.env.backup`, the web content dirs, and the
Tunnel's own config and credentials.

Script logic is tracked in `scripts/backup/` so the multi-instance fan-out gets
review, CI and history; only genuinely secret material stays off-repo.

`stop_cloudflared_if_idle` only stops the tunnel once **all six** containers are
down — with the demo always running, it effectively never stops on its own.

**The demo differs from the dev instances in four ways**, all resolved from the
instance index: bots enabled (it fills every seat), debug UI off, demo mode on
(the client's bots-disclosure label), and its own dispatchers carrying **no push
trigger**, so a routine push can never redeploy it.
The demo is deliberately off the push path: it is a link on a résumé, and a routine
commit must never redeploy it.

### Auto-deploy guard rails check live status, not a stored flag

`Backup-Deploy-All.yml` auto-deploys on push, diffing the push range to deploy only
the services whose paths actually changed, always targeting **instance 1**, behind
a job probing that target's actual live state with `docker ps`. Manual dispatch
ignores the changed-paths check and runs unguarded. Instance 3 is deliberately not
a choice — the demo has its own dispatchers.

The guard reads **live container status**, not a stored flag another workflow must
remember to set — a runtime check cannot drift out of sync. Unguarded, an
auto-deploy silently undoes an intentional stand-down on the next matching push.

**Landmine — the backup guards are self-hosted jobs and queue indefinitely with no
timeout** when the machine's runner is offline, so a push while the machine is off
just waits rather than failing fast.

**Landmine — a skipped guard job cascades downstream.** A job's default `if` is
`success()`, evaluated against its **entire** upstream graph, not just its direct
`needs`. Any job downstream of a conditionally-skipped job needs an explicit
`if: always() && needs.<dep>.result == 'success'`.

**Landmine — `github.event_name` reflects the top-level run's trigger**, unchanged
however many `workflow_call` levels deep a job sits. Checking it fired confirmation
gates on the fully-automated path too, and the first real test of automatic
failover failed before ever reaching the machine. The shape that works is an
explicit boolean declared only under `on.workflow_call.inputs`, checked as
`inputs.invoked_via_call != true`, since `inputs.*` genuinely is per-invocation.

**Landmine — `dig` never sees a CNAME for a proxied record.** Cloudflare resolves
the hostname straight to its own anycast addresses, so the query is always empty
and the wait loop always timed out and died. `wait_for_cname` re-queries the
Cloudflare API and compares `.result[0].content`; `dig` is out of these scripts'
`require_cmd` lists entirely. The API reflects a write immediately, so the retry
loop is a margin against a transient read, not a propagation wait.

### Runbook (backup)

1. **Bring a dev instance up:** dispatch `Backup Deploy All` narrowed, or run
   `scripts/backup/backup-{server,web}-up.sh <instance>` on the machine.
2. **Redeploy the demo:** dispatch `Demo Deploy` — `Backup Deploy All` does not
   reach instance 3.
3. **Check state:** `Backup Diagnose`, or the `*-status.sh` scripts.
4. **Stand down:** `Backup Cleanup All` (dev) or `Demo Cleanup` (demo), each with
   its own typed phrase.

**No workflow in this repo has a `pull_request` trigger** — required, since a
self-hosted runner would otherwise let any external contributor's PR execute code
on the physical machine.

## Required secrets (infra scope)

| Secret | Used for |
|---|---|
| `AWS_ROLE_ARN` | GitHub OIDC → AWS. EKS needs the expanded policy attached once, manually |
| `ECR_REPOSITORY` | Server image push/pull |
| `EC2_STAGING_HOST` / `_USER` / `_SSH_KEY` | Bastion and node access |
| `EC2_STAGING_SSH_PUBLIC_KEY` | *(optional)* preferred for key-pair creation; derived from the private key if empty |
| `CLOUDFLARE_API_TOKEN` / `_ZONE_ID` | DNS for the four K3s hostnames, ACM validation, and the two EKS CNAMEs |
| `EKS_OPERATOR_PRINCIPAL_ARN` | IAM **role** ARN granted cluster-admin via an access entry |
| `R2_GATEWAY_BUCKET` / `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | ACME cache persistence; **repo** secrets, not environment-scoped, so the `staging`-environment deploy job can still see them. Steps no-op if unset |

**A step-scoped `env:` value does not carry to later steps** — only `$GITHUB_ENV`
does. A later step reading a secret-derived variable another step resolved needs
its own `env:` block, or `set -u` scripts fail on an unbound variable.

## Argo CD readiness

Bootstrap manifests exist at `infra/k3s/argocd/bootstrap`, covering both
namespaces; **nothing installs or applies them.** Enablement waits on install → one
manual sync → a passing rollback test, and only then automated prune/self-heal.
When enabled, Argo CD stays private — bastion plus `kubectl port-forward` only.
Private repos need a persistent repo-read credential; `GITHUB_TOKEN` is not
suitable long-term.
