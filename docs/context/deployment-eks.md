# EKS Deployment

Scope: production AWS topology, infrastructure lifecycle and deploy operations.

## EKS (production-grade target)

Dedicated hostnames — `wstodplay` (game), `todplay` (web). Only the prod pair is
deployed; `eks-test` overlays are committed but not wired to any workflow.

**Topology:** Cloudflare CNAME → ALB `:443` (ACM wildcard, host-based routing,
`idle_timeout=300`) → two target groups on the existing NodePorts, registered via
`aws_autoscaling_attachment` → managed node group (2× `t3.small`, private subnets,
NAT egress) → pods → ElastiCache Redis over `rediss://`. **Game target group
health matcher is `426`** — `ws` answers a plain `GET /` with Upgrade Required;
web is `200`. No in-cluster Redis on EKS.

The game pod overrides the `Game_Config.js` development defaults by disabling
the latency indicator and selecting warning-only stability feedback, keeping
production presentation separate.

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
