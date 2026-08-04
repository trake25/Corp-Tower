---
role: "Cloud"
order: 1
headline: "Knowing what it has to do, and what it's allowed to cost, is the whole job."
plain: "The requirements, the cost ceiling and the guardrails are settled before any infrastructure exists — each one is expensive to add later, and a platform sized for the wrong target is a rebuild rather than a fix. An assistant runs the analysis at every step: options compared, costs modelled, Terraform drafted. That only works because someone holding both the business and the technical requirement is there to accept or reject what comes back. The steps below are that order of work."
tools:
  - "Terraform"
  - "AWS (EKS, EC2, ElastiCache)"
  - "Kubernetes"
  - "Docker"
  - "GitHub Actions"
  - "Cloudflare Tunnel"
  - "Claude Code"
details:
  - id: objectives
    title: "1 · The requirements, before anything is designed"
    keywords:
      - "Business Deliverables"
      - "Technical Requirements"
      - "AI-Assisted Discovery"
    body: "The platform's requirements and its cost ceiling are written down before any design exists — concurrent players, a latency budget, a monthly limit nothing may cross. Everything after is measured against that list. It is what ruled out an always-on cluster: a game still in development needs a demo anyone can reach, not a load balancer billing by the hour. An assistant priced the options; the list was mine."
    evidence:
      label: "The cost decision, written down before anything was built"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#eks-kept-session-scoped-not-always-on"
  - id: foundation
    title: "2 · Who has access, and for how long"
    keywords:
      - "Credentials"
      - "IAM & OIDC"
      - "Secrets Management"
    body: "Every identity is decided before any is handed out: which IAM roles exist, what each may touch, where the secrets live. Nothing holds a standing credential — CI proves who it is per run through OIDC and gets access that expires with the job. No credential is wider or longer-lived than its task, which is why the private art pipeline splits its tokens the same way."
    evidence:
      label: "The same rule, applied to something that isn't even AWS"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#private-asset-pipeline-credential-split"
  - id: environments
    title: "3 · The target environments, and what each is for"
    keywords:
      - "Environment Strategy"
      - "Network Architecture"
      - "Resource Isolation"
    body: "Production, staging and development are three separate targets, each with its own networking and its own reason to exist. Production-grade infrastructure only where that is the requirement: EKS for the sessions that genuinely need it, while staging and development are carried by a Linux machine already paid for, reaching the internet through one outbound tunnel rather than an open port. The environment a change is proven in is never the one a player is sitting in."
    evidence:
      label: "How a machine already paid for carries the development phase"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#physical-backup-dev-instances-and-demo-one-shared-tunnel"
  - id: guardrails
    title: "4 · The limits every resource has to obey"
    keywords:
      - "Security Baselines"
      - "Compliance Constraints"
      - "Cost Control"
    body: "Encryption, tagging, monitoring, backup, quotas and budgets are rules the platform obeys, not things somebody remembers. AWS Budgets can take most of a day to fire — a report, not a brake — so the real control is a scheduled teardown that checks what is left against live EC2, because a resource that slipped its tag is the one still charging. A guardrail that only notifies has stopped nothing."
    evidence:
      label: "Why the teardown checks live EC2 instead of trusting a tag"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#eks-infra-destroy-verifies-orphans-against-live-ec2-not-the-tagging-api-alone"
  - id: resources
    title: "5 · Capacity and cost, decided together"
    keywords:
      - "Resource Management"
      - "Capacity & Scaling"
      - "Budget Forecasting"
    body: "Sizing and price are one question, not two. Instance families, cache tier, how many availability zones, what ten times the load adds to the monthly bill — all worked against the ceiling from step one, before anything is selected. That is what buys encrypted ElastiCache and nodes across more than one zone, and why a separate load-balancer controller was left out: at this size the simpler wiring does the same job."
    evidence:
      label: "What production buys, piece by piece"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/deployment.md#eks-production-grade-target"
  - id: validation
    title: "6 · Steps one to five, combined into one plan"
    keywords:
      - "Consolidated Brief"
      - "Implementation Plan"
      - "Final Review"
    body: "Nothing has been built yet — five written decisions, cut down into one brief. The agent plans from it; I read that plan before a single resource is provisioned. Which is where one AWS default nearly went through: a custom security group on EKS nodes stops EKS adding the rules it otherwise would — no error, a healthy-looking cluster, intermittent failures much later. A confident plan and a correct one read identically."
    evidence:
      label: "The default that looks fine until it isn't"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#eks-node-security-group-must-carry-its-own-control-plane-and-self-referencing-rules"
  - id: automation
    title: "7 · Built as code, then tested by deploying it"
    keywords:
      - "Infrastructure as Code"
      - "Deployment Testing"
      - "Repeatability"
    body: "All of it is Terraform, so the platform can be destroyed and rebuilt from one source with no step left in anybody's head. Code is not proof, so the deploy is the test: it stops before installing anything if the last infrastructure apply never ran, rather than building on a fix that exists only in a file. The agent wrote most of the modules; that gate was mine. Infrastructure never rebuilt from its own code is not repeatable, only working."
    evidence:
      label: "The check that catches a fix nobody applied"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#eks-deploy-workflows-fail-fast-on-infra-code-the-last-infra-apply-never-ran"
---
