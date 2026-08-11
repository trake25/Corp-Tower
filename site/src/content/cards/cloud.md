---
role: "Cloud"
order: 1
headline: "I build infrastructure that can be rebuilt, secured and controlled for cost."
plain: "Before I build anything, I decide what the system needs, who can access it, and what it should cost."
tools:
  - "Terraform"
  - "AWS (EKS, EC2, ElastiCache)"
  - "Kubernetes"
  - "Docker"
  - "GitHub Actions"
  - "Cloudflare Tunnel"
  - "Claude Code"
# Paths are relative to `profile.mediaBase` — the R2 public host is set once
# there, not repeated per file. Apply and destroy are both here on purpose: a
# card that only shows the cluster coming up has shown half of what
# deploy-on-demand means, and the teardown is what backs the cost claim.
videos:
  - src: "clips/cloud-eks-infra-apply.mp4"
    poster: "clips/cloud-eks-infra-apply.jpg"
    caption: "Terraform apply standing the EKS environment up from nothing — 12 to 15 minutes end to end."
  - src: "clips/cloud-eks-infra-destroy.mp4"
    poster: "clips/cloud-eks-infra-destroy.jpg"
    caption: "The same environment destroyed again in about the same time — what deploy-on-demand costs when nobody is playing."
details:
  - id: objectives
    title: "1 · The requirements, before anything is designed"
    keywords:
      - "Business Deliverables"
      - "Technical Requirements"
      - "AI-Assisted Discovery"
    body: "Concurrent players, a latency budget, and a monthly cost limit get written down before any design work starts. That list ruled out an always-on cluster: a game still in development needs a reachable demo, not a load balancer billing by the hour. An assistant priced the options, and I made the call."
  - id: foundation
    title: "2 · Who has access, and for how long"
    keywords:
      - "Credentials"
      - "IAM & OIDC"
      - "Secrets Management"
    body: "Every identity is decided before it's handed out: which IAM roles exist, and what each one can touch. Nothing holds a standing credential. CI proves who it is on every run through OIDC, and its access expires with the job."
  - id: environments
    title: "3 · The target environments, and what each is for"
    keywords:
      - "Environment Strategy"
      - "Network Architecture"
      - "Resource Isolation"
    body: "Production, staging and development are three separate targets, each with its own networking. Production-grade infrastructure gets provisioned only where it's actually needed: the EKS path is written and tested, held deploy-on-demand until the game ships, while staging and development run today on one Linux machine already paid for, reached through a Cloudflare tunnel. Standing the cluster up takes 12 to 15 minutes and tearing it back down takes about the same, which is what makes deploy-on-demand a switch rather than a commitment."
  - id: guardrails
    title: "4 · The limits every resource has to obey"
    keywords:
      - "Security Baselines"
      - "Compliance Constraints"
      - "Cost Control"
    body: "Encryption, tagging, monitoring, backup, quotas and budgets are written as rules the platform enforces, not things somebody has to remember to do. They are applied when a resource is provisioned rather than audited afterwards, because a resource that slipped its tag is exactly the one nobody notices is still charging."
  - id: resources
    title: "5 · Capacity and cost, decided together"
    keywords:
      - "Resource Management"
      - "Capacity & Scaling"
      - "Budget Forecasting"
    body: "Sizing and price are decided together, not separately. Instance families, cache tier, and how many availability zones all get checked against the cost ceiling from step one before anything is picked. That's how encrypted ElastiCache made the cut while a separate load-balancer controller didn't."
  - id: validation
    title: "6 · Steps one to five, combined into one plan"
    keywords:
      - "Consolidated Brief"
      - "Implementation Plan"
      - "Final Review"
    body: "Nothing gets built yet. The five decisions above are combined into one brief, and the agent plans from it. I read that plan before a single resource is provisioned."
  - id: automation
    title: "7 · Built as code, then tested by deploying it"
    keywords:
      - "Infrastructure as Code"
      - "Deployment Testing"
      - "Repeatability"
    body: "All of it is Terraform, so the platform can be destroyed and rebuilt from one source with nothing left in anybody's head. I read the plan and the manifests line by line before anything is applied — an apply is not the place to find out what a change actually does. Code isn't proof either, so the deploy itself is the test: it stops before installing anything if the last apply never ran."
---
