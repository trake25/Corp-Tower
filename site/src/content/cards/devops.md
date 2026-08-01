---
role: "DevOps"
order: 2
tags: ["DevOps"]
headline: "I encoded the three teammates I don't have as CI jobs."
plain: "I run every environment of this project alone. So I built the parts of a team that isn't there — the person who does releases, the person who checks before you break something, and the person who remembers the steps."
metric: "34"
metricLabel: "CI/CD workflows, no manual deploys"
links:
  - label: "Android release pipeline"
    href: "https://github.com/trake25/Corp-Tower/blob/main/.github/workflows/Android-Deploy-wsplaytod.yml"
  - label: "Guarded Terraform apply"
    href: "https://github.com/trake25/Corp-Tower/blob/main/.github/workflows/EKS-Infra-Apply.yml"
  - label: "Drift check action"
    href: "https://github.com/trake25/Corp-Tower/blob/main/.github/actions/eks-infra-drift-check/action.yml"
  - label: "All workflows"
    href: "https://github.com/trake25/Corp-Tower/tree/main/.github/workflows"
---

### Decision

Encode three absent roles as CI jobs rather than as discipline.

- **The release engineer.** One workflow takes Android from source to store: verified art, version code resolved from the live Play API, signed build, five artifact checks, upload, then a read-back to confirm the store lists what was just sent.
- **The reviewer.** Nothing destructive runs unchallenged. A deploy fails **before any build** if infra code differs from what was last applied. An apply hard-fails if the plan contains any delete or replace. A destroy cross-checks leftovers against the live EC2 API. Cleanup needs a typed phrase naming the exact target.
- **The runbook.** Reusable cores with thin dispatchers; shared composite actions for auth, Terraform setup, art fetch, and web build; deploy-time generated manifests so nobody hand-edits an image tag; diagnose workflows that answer "is it healthy" without SSH.

### Instead of

**The two normal answers.** Copy-pasted per-target workflows are fastest to write and drift until prod and test differ for reasons nobody remembers. One monolithic workflow with conditionals is unreadable and makes deploying a single target risky. Also rejected: trusting stored status flags and the AWS tagging API — both are checked against live state instead, because both have lied.

### Why it matters

Automation removes what's repetitive; guardrails remove what's irreversible. Automating a daily task saves time. Automating a *rare* one — like a release — prevents an error that would otherwise reach users, because infrequency means muscle memory never forms.

### Proof

- Version codes derived by reading every existing track rather than incrementing a counter.
- Art verified download → hash → extract → file count → sentinel files, each failing the build closed, with the hash-skipping override marked never-for-release in the workflow itself.
- Push-triggered deploys skip an instance whose container isn't running, so a routine commit can't silently restart something that was deliberately taken down.
- DNS cutover verified through the Cloudflare API rather than `dig`, because a proxied record never exposes a literal CNAME — the obvious check would report every success as a failure.
