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
    title: "1 · Define requirements"
    keywords:
      - "Business Deliverables"
      - "Technical Requirements"
      - "AI-Assisted Discovery"
    body: "Set player capacity, latency and monthly cost limits before choosing the architecture. For a game still in development, this ruled out keeping a full cluster running all the time."
  - id: foundation
    title: "2 · Set access rules"
    keywords:
      - "Credentials"
      - "IAM & OIDC"
      - "Secrets Management"
    body: "Define who or what can access each resource. CI uses short-lived identity through OIDC instead of storing long-lived cloud credentials; IAM roles scope what each identity can access."
  - id: environments
    title: "3 · Separate environments"
    keywords:
      - "Environment Strategy"
      - "Network Architecture"
      - "Resource Isolation"
    body: "Keep development and production isolated so testing changes cannot accidentally affect the live environment. Production, staging and development have separate networking; the EKS path is deploy-on-demand, while staging and development use an already-paid-for Linux machine through Cloudflare Tunnel."
  - id: resources
    title: "4 · Choose resources"
    keywords:
      - "Resource Management"
      - "Capacity & Scaling"
      - "Budget Forecasting"
    body: "Select the AWS services and capacity based on the requirements instead of starting with infrastructure and fitting the application around it. Instance families, cache tier and availability zones are checked against the cost ceiling; this kept encrypted ElastiCache and ruled out a separate load-balancer controller."
  - id: guardrails
    title: "5 · Add guardrails"
    keywords:
      - "Security Baselines"
      - "Compliance Constraints"
      - "Cost Control"
    body: "Set boundaries around access, resources and spending before deployment. Encryption, tagging, monitoring, backup, quotas and budgets apply at provisioning time, making the infrastructure difficult to misuse and easy to control."
  - id: validation
    title: "6 · Define as code"
    keywords:
      - "Consolidated Brief"
      - "Implementation Plan"
      - "Final Review"
    body: "Terraform defines the infrastructure so environments can be recreated consistently instead of configured manually. I review the plan and manifests before apply."
  - id: automation
    title: "7 · Build and verify"
    keywords:
      - "Infrastructure as Code"
      - "Deployment Testing"
      - "Repeatability"
    body: "Provision the environment, deploy the required services and verify that the resulting infrastructure matches the intended design. Installation stops if the prior infrastructure apply did not complete; the EKS environment takes 12–15 minutes to create or remove."
---
