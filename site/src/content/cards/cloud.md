---
role: "Cloud"
order: 1
tags: ["AWS", "Kubernetes"]
headline: "Pay for production-grade infrastructure where it changes behaviour. Refuse to pay for it anywhere else."
plain: "The game runs on three different foundations: a production-grade AWS stack, a small cluster I keep as a lab, and one Linux box at home that serves the demo you just played. Same container image on all three — what's different between them is the whole point."
metric: "Per session"
metricLabel: "how long production exists"
links:
  - label: "EKS Terraform root — production"
    href: "https://github.com/trake25/Corp-Tower/tree/main/infra/eks/terraform"
  - label: "K3s Terraform root — the lab"
    href: "https://github.com/trake25/Corp-Tower/tree/main/infra/k3s/terraform"
  - label: "Nightly auto-destroy"
    href: "https://github.com/trake25/Corp-Tower/blob/main/.github/workflows/EKS-Infra-Auto-Destroy.yml"
  - label: "deployment.md"
    href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/deployment.md"
---

### Decision

Three deployment targets, deliberately unequal, from one container image.

- **EKS is the production-grade target.** ALB with an ACM wildcard, target groups bound to node ports via the autoscaling group, managed nodes in private subnets, ElastiCache over `rediss://`. It is stood up for a session and destroyed after it — the full production wiring, none of the standing bill.
- **K3s on a single EC2 instance is the lab.** Where a change gets tried before it goes anywhere near the production path, and where I run the pieces I haven't run before. Cheap enough to leave on, so it is left on.
- **One Linux box at home is the cost-efficient development target** — and what serves the public demo. Behind a Cloudflare Tunnel: no load balancer, no NAT gateway, no managed cache. Identical image, ports and manifests.

### Instead of

**One topology for all three.** Running everything the production way means paying production prices to develop, for an audience of one. Running production the home way puts a single machine between the game and the internet, and proves nothing about whether the design survives real infrastructure. Also rejected: the AWS Load Balancer Controller — binding target groups straight to the autoscaling group removes a component to install, upgrade and grant IAM to, in exchange for static node ports. Worth it at two services.

### Why it matters

For the operator: production-grade infrastructure on demand at zero standing cost, plus somewhere to break things that isn't it. For the player: a link that is always up — served from the cheapest of the three, which is exactly why the demo's latency is not what the production stack's would be. Naming which target you are on is part of the design, not a caveat bolted on afterwards.

### Proof

- Health matcher `426`, because `ws` answers a plain `GET /` with Upgrade Required.
- The node security group carries its own control-plane and self-referencing rules via a launch template that opts out of EKS's default wiring.
- Auto-destroy at 18:00 UTC daily *because AWS Budgets alerts lag 8–24h* — the alarm cannot be the control.
- Gateway TLS state externalised to R2 after ephemeral disks re-requested certificates until Let's Encrypt's rate limit stopped it.
