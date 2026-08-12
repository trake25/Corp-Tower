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
    title: "1 · Decide what the system needs"
    keywords:
      - "Business Deliverables"
      - "Technical Requirements"
      - "AI-Assisted Discovery"
    body: "I set concurrent-player, latency and monthly-cost requirements before design starts. That ruled out an always-on cluster: a game in development needs a reachable demo, not a load balancer billing by the hour. An assistant compared prices; I made the decision."
  - id: foundation
    title: "2 · Set the access rules"
    keywords:
      - "Credentials"
      - "IAM & OIDC"
      - "Secrets Management"
    body: "I define IAM roles and what each can access before granting them. Nothing keeps a standing credential: CI proves its identity through OIDC on every run, then access expires with the job."
  - id: environments
    title: "3 · Separate environments"
    keywords:
      - "Environment Strategy"
      - "Network Architecture"
      - "Resource Isolation"
    body: "Production, staging and development are separate targets with their own networking. The EKS path is written and tested but stays deploy-on-demand until release; staging and development run on one already-paid-for Linux machine through a Cloudflare Tunnel. The cluster takes 12–15 minutes to create or remove."
  - id: guardrails
    title: "4 · Add security and cost guardrails"
    keywords:
      - "Security Baselines"
      - "Compliance Constraints"
      - "Cost Control"
    body: "Encryption, tagging, monitoring, backup, quotas and budgets are platform rules, not reminders. They apply at provisioning time, before an untagged resource becomes an unnoticed cost."
  - id: resources
    title: "5 · Choose services and capacity"
    keywords:
      - "Resource Management"
      - "Capacity & Scaling"
      - "Budget Forecasting"
    body: "I choose sizing and price together. Instance families, cache tier and availability zones are checked against the cost ceiling before selection; that kept encrypted ElastiCache and ruled out a separate load-balancer controller."
  - id: validation
    title: "6 · Define everything as code"
    keywords:
      - "Consolidated Brief"
      - "Implementation Plan"
      - "Final Review"
    body: "The decisions become one implementation brief. The agent plans from it, and I review that plan before a resource is provisioned."
  - id: automation
    title: "7 · Build and verify the environment"
    keywords:
      - "Infrastructure as Code"
      - "Deployment Testing"
      - "Repeatability"
    body: "Terraform makes the platform rebuildable from one source. I review the plan and manifests before apply, then verify by deploying: installation stops if the prior infrastructure apply did not complete."
---
