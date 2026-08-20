# Deployment

Scope: infrastructure, runtime topology, operational runbooks. Build/CI that
produces the artifacts → [build.md](./build.md). Server code →
[backend.md](./backend.md). Per-symbol file and line → grep
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

## EKS (production-grade target)

Dedicated hostnames — `wstodplay` (game), `todplay` (web). Only the prod pair is
deployed; `eks-test` overlays are committed but not wired to any workflow.

**Topology:** Cloudflare CNAME → ALB `:443` (ACM wildcard, host-based routing,
`idle_timeout=300`) → two target groups on the existing NodePorts, registered via
`aws_autoscaling_attachment` → managed node group (2× `t3.small`, private subnets,
NAT egress) → pods → ElastiCache Redis over `rediss://`. **Game target group
health matcher is `426`** — `ws` answers a plain `GET /` with Upgrade Required;
web is `200`. No in-cluster Redis on EKS.

Routing uses **`target_type=instance` NodePorts** — 30300 game, 30310 web — with no
extra controllers. An AWS Load Balancer Controller would add a Helm install and
IRSA wiring this stack does not need.

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

No bastion, SSH, Ansible or Caddy anywhere in AWS: the ALB terminates TLS and
`update-kubeconfig` reaches the cluster directly.

**One-time manual setup, before the first apply — no workflow can do these:**
expand `AWS_ROLE_ARN`'s IAM permissions for EKS/ElastiCache/ELB/NAT/OIDC (**CI
cannot grant itself permissions**); create Budgets alerts at $20/$40/$50; resolve
an operator IAM **role** ARN (not an assumed-role ARN) into
`EKS_OPERATOR_PRINCIPAL_ARN`; run `EKS-Shared-Infra-Apply.yml` once. The two
CNAMEs are created by the deploy workflows on first use.

## Backup (physical machine)

A manually-operated Linux Mint machine runs six containers behind one shared
Cloudflare Tunnel, independent of AWS: two dev game servers
(`devwstod1`/`devwstod2`), two dev web servers (`devtod1`/`devtod2`), and one
always-on public demo pair (`wstoddemo`/`toddemo`, instance **3**). Game servers
run the unmodified server image.

**No Redis for the two dev instances** — `Redis_State.js`'s in-memory fallback,
correct for one machine, wrong for multi-replica EKS. Instance 3 (`wstoddemo`)
alone gets a real, persistent `redis:7-alpine` container
(`scripts/backup/backup-redis-up.sh`, appendonly, its own docker network) so
the public demo-completion counters survive a redeploy's container recreate,
not just a crash. `scripts/backup/backup-redis-reset-demo-stats.sh` zeroes
just the two `stats:demo:*` keys — never a `FLUSHALL`, since this Redis also
now backs `wstoddemo`'s live room/session/queue state. Game servers bind
loopback only, matching the web servers: `cloudflared` is the only intended
caller.

**Landmine — Cloudflare's free Universal SSL covers the zone apex and exactly one
subdomain level.** A two-level name behind a *proxied* record (which a Tunnel
requires) hits a bare TLS handshake failure. The EKS hostnames escape it only
because they are DNS-only (`proxied:false`) with the ALB serving the ACM wildcard
itself, so Cloudflare never terminates for them. Reusing an existing
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
| `CLOUDFLARE_API_TOKEN` / `_ZONE_ID` | ACM validation and the two EKS CNAMEs |
| `EKS_OPERATOR_PRINCIPAL_ARN` | IAM **role** ARN granted cluster-admin via an access entry |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Auth. Both optional — unset ships builds with sign-in off |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional. **Bypasses RLS** — server-side only, never in a client build |
| `TOD_FACEBOOK_APP_SECRET` | Meta App Secret; server-only verification of native Android access tokens |

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
`kubectl apply` (the `ecr-pull` pattern) and the container reads it via
`secretKeyRef` with `optional: true` — no secret, no env var, and the profile
store stays in memory. Unsetting the GitHub secret deletes the k8s one.
**A Secret change alone does not restart pods**; the deploy patches the image tag
every run, which is what actually rolls them. Unset `SUPABASE_URL`
turns verification off entirely; `SUPABASE_AUTH_REQUIRED=true` closes any socket
that fails it, which breaks every already-installed client, so flip it only once
signed-in builds are out.

Native Android Facebook verification needs `TOD_FACEBOOK_APP_ID` (repository
variable) and `TOD_FACEBOOK_APP_SECRET` (GitHub secret). The deploy job creates
the optional `corp-tower-facebook` Secret; `Auth_Verifier.js` uses it only to
call Meta's `debug_token` endpoint and maps the verified Meta id to the existing
UUID-only profile table. If either value is absent, Facebook sign-in cannot
pass a required-auth socket gate.

The `R2_*` art-pipeline secrets are listed in [build.md](./build.md). The
`EC2_STAGING_*` and `R2_GATEWAY_*` secrets went unused when the K3s lab was
deleted — nothing reads them; revoke at will.

**A step-scoped `env:` value does not carry to later steps** — only `$GITHUB_ENV`
does. A later step reading a secret-derived variable another step resolved needs
its own `env:` block, or `set -u` scripts fail on an unbound variable.
