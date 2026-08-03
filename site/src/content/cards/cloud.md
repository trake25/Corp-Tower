---
role: "Cloud"
order: 1
headline: "Pay for production-grade infrastructure where it changes behaviour. Refuse to pay for it anywhere else."
plain: "The game runs on three different foundations: a production-grade AWS stack, a small cluster I keep as a lab, and one Linux box at home that serves the demo you just played. Same container image on all three — what's different between them is the whole point."
tools:
  - "Terraform"
  - "AWS (EKS, EC2, ElastiCache)"
  - "Kubernetes"
  - "K3s"
  - "Docker"
  - "GitHub Actions"
  - "Cloudflare Tunnel"
details:
  - id: objectives
    title: "1 · Business and technical objectives, before any Terraform"
    body: "The production target had to answer to a number, not a feeling. A control plane, NAT gateway, load balancer and managed cache have no AWS free tier, so leaving one running is an open-ended bill — the actual requirement became session-scoped: production-grade for the length of a play session, gone after. AWS Budgets alerts at $20/$40/$50 back that up, but they are not the control (see step 4)."
    evidence:
      label: "Why the production target is session-scoped, not always-on"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#eks-kept-session-scoped-not-always-on"
  - id: foundation
    title: "2 · Identity before infrastructure"
    body: "Nothing in either Terraform root holds a long-lived AWS key — CI assumes AWS_ROLE_ARN through GitHub's own OIDC provider, and an operator's kubectl access comes from an EKS access entry bound to their own IAM role, not a shared kubeconfig. The same discipline shows up outside AWS entirely: the art pipeline's R2 credentials are split so CI only ever holds a read-only token and can neither publish nor delete, while the read-write token needed to actually publish stays local and manual. Least privilege isn't a slogan here — it's a policy applied consistently across two unrelated cloud providers."
    evidence:
      label: "The same least-privilege split, enforced outside AWS too"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#private-asset-pipeline-credential-split"
  - id: environments
    title: "3 · Three environments, three networks"
    body: "EKS, K3s and the physical backup aren't the same environment at different sizes — each owns its own network and its own DNS. K3s's VPC even has to dodge itself: its CIDR is chosen specifically to avoid colliding with the pod and service ranges K3s hands out internally. EKS gets its own hostnames so a production deploy can never touch K3s's four DNS records, and the backup machine is a different network entirely, reachable only through a tunnel."
    evidence:
      label: "A VPC CIDR chosen to avoid colliding with the cluster's own network"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/deployment.md#k3s-topology"
  - id: guardrails
    title: "4 · Guardrails that fail closed, not alerts that fail open"
    body: "An AWS Budgets alert lags 8 to 24 hours — useless as the thing that actually stops spend, so the real guardrail is a scheduled workflow that destroys the EKS stack every night regardless. The same discipline applies to state, not just cost: the gateway's TLS certificates used to get re-requested from Let's Encrypt on every rebuild, because the box holding them was ephemeral — enough rebuilds in a week hit Let's Encrypt's rate limit and took the public demo down. The fix externalises that state instead of hoping the box survives."
    evidence:
      label: "The rate-limit incident that forced TLS state out of the box"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#caddy-gateway-acme-cert-cache-persisted-to-r2"
  - id: resources
    title: "5 · Sizing the service, not the label"
    body: "Production and lab buy different things on purpose. EKS pays for ElastiCache over rediss:// and two managed nodes in private subnets, because a production-grade target has to prove the design survives a managed dependency it doesn't control. K3s runs its own in-cluster Redis per namespace on a single small instance, because at lab scale a managed cache is money for nothing. The load balancer skips a controller entirely — target groups bind straight to the autoscaling group's existing node ports, one fewer thing to install, upgrade and grant IAM to, for exactly two services."
    evidence:
      label: "What EKS actually provisions, and why K3s doesn't"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/deployment.md#eks-production-grade-target"
  - id: validation
    title: "6 · Reviewed before it's trusted"
    body: "Attaching a custom security group to the node launch template silently opts the cluster out of EKS's default node-to-control-plane wiring — nothing errors at apply time, and the cluster can even come up looking healthy while cross-node pod traffic quietly breaks. That only surfaces in review, not in a plan diff, which is why the fix is three explicit ingress rules and a comment for whoever adds the next node group."
    evidence:
      label: "A silent AWS default, caught before it shipped"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#eks-node-security-group-must-carry-its-own-control-plane-and-self-referencing-rules"
  - id: automation
    title: "7 · Infrastructure as code, not infrastructure as intent"
    body: "Terraform is split by lifecycle, not convenience: a persistent shared root for the ACM certificate and DNS validation, applied once and never touched again, and a session-scoped root for everything that gets destroyed nightly. Both reuse the same composite GitHub Actions for backend bootstrap, plan and validate, so K3s and EKS never drift into two different apply procedures. And a committed fix isn't a shipped fix until it's actually applied — deploy workflows now hard-fail before any build if the infra code on disk doesn't match what the last apply actually ran."
    evidence:
      label: "Committed doesn't mean applied"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#eks-deploy-workflows-fail-fast-on-infra-code-the-last-infra-apply-never-ran"
---
