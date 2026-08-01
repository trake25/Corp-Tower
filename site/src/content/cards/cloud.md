---
role: "Cloud"
order: 1
tags: ["Cloud"]
headline: "Buy environment parity where it changes behavior. Skip it where it only costs money."
plain: "The game runs on two completely different foundations — a production-grade cloud stack, and a single Linux box at home serving the demo you just played. Same container image, deliberately different infrastructure, and the reason why is the whole point."
metric: "3"
metricLabel: "environments, one image"
links:
  - label: "EKS Terraform root"
    href: "https://github.com/trake25/Corp-Tower/tree/main/infra/eks/terraform"
  - label: "K3s Terraform root"
    href: "https://github.com/trake25/Corp-Tower/tree/main/infra/k3s/terraform"
  - label: "Nightly auto-destroy"
    href: "https://github.com/trake25/Corp-Tower/blob/main/.github/workflows/EKS-Infra-Auto-Destroy.yml"
  - label: "deployment.md"
    href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/deployment.md"
---

### Decision

Production on EKS: ALB with an ACM wildcard, target groups bound to node ports via the autoscaling group, managed nodes in private subnets, ElastiCache over `rediss://`. Dev and demo on one Linux box behind a Cloudflare Tunnel — no load balancer, no NAT, no managed cache. Identical container image, ports, and manifests.

### Instead of

**One topology for both.** An always-on cloud dev cluster costs money every month for an audience of one and still isn't production; running production the home way puts one machine between the game and the internet. Also rejected: the AWS Load Balancer Controller — binding target groups straight to the ASG removes a component to install, upgrade, and grant IAM, in exchange for static node ports. Worth it at two services.

### Why it matters

For the operator, a permanent environment at zero marginal cost and a production-grade one only while it's in use. For the player, a link that's always up.

### Proof

- Health matcher `426`, because `ws` answers a plain `GET /` with Upgrade Required.
- The node security group carries its own control-plane and self-referencing rules via a launch template that opts out of EKS's default wiring.
- Auto-destroy at 18:00 UTC daily *because AWS Budgets alerts lag 8–24h* — the alarm can't be the control.
- Gateway TLS state externalised to R2 after ephemeral disks re-requested certificates until Let's Encrypt's rate limit stopped it.
