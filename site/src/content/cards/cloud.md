---
role: "Cloud"
order: 1
tags: ["Cloud"]
plain: "The game runs on two completely different setups — a serious cloud one for production, and a single computer at home for the demo you just played. Same game, deliberately different foundations, and the reason why is the whole point."
---

**Decision.** Production on EKS: ALB with an ACM wildcard, target groups bound to node ports via the autoscaling group, managed nodes in private subnets, ElastiCache over `rediss://`. Dev and demo on one Linux box behind a Cloudflare Tunnel — no load balancer, no NAT, no managed cache. Identical container image, ports, and manifests.

**Instead of** one topology for both: an always-on cloud dev cluster costs money monthly for an audience of one and still isn't production; running production the home way means one machine between the game and the internet. Also rejected: the AWS Load Balancer Controller — binding target groups straight to the ASG removes a component to install, upgrade, and grant IAM, in exchange for static node ports. Worth it at two services.

**For** the operator (permanent environment at zero marginal cost, production-grade one only while in use) and the player (a link that's always up). Buy environment parity where it changes behavior; skip it where it only costs money.

**Proof.** Health matcher `426`, because `ws` answers a plain `GET /` with Upgrade Required. Node security group carries its own control-plane and self-referencing rules via a launch template that opts out of EKS's default wiring. Auto-destroy at 18:00 UTC daily *because AWS Budgets alerts lag 8–24h* — the alarm can't be the control. Gateway TLS state externalised to R2 after ephemeral disks re-requested certificates until Let's Encrypt's rate limit stopped it.
