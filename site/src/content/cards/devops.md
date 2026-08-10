---
role: "DevOps"
order: 2
headline: "Every destination runs the same pipeline. Only one is allowed to start it by itself."
plain: "This card combines the other two. The environments and guardrails come from the Cloud work, and the brief-and-review loop comes from the AI work. The result is one pipeline that deploys to five destinations, and a push only deploys itself to development. Everything past that has to clear a gate first."
tools:
  - "GitHub Actions"
  - "Composite Actions"
  - "Docker"
  - "Godot Export (GUT)"
  - "Google Play Publisher API"
  - "Cloudflare R2"
  - "Claude Code"
# Paths are relative to `profile.mediaBase` — the R2 public host is set once
# there, not repeated per file. Three runs because the claim is that one
# pipeline serves five destinations: a deploy, its teardown, and the Android
# track that shares the same composite actions.
videos:
  - src: "clips/devops-deploy-all.mp4"
    poster: "clips/devops-deploy-all.jpg"
    caption: "One pipeline run deploying every destination."
  - src: "clips/devops-cleanup-all.mp4"
    poster: "clips/devops-cleanup-all.jpg"
    caption: "The teardown workflow returning every destination to zero."
  - src: "clips/devops-ci-android-client.mp4"
    poster: "clips/devops-ci-android-client.jpg"
    caption: "The Android client build, signed and pushed to the internal testing track."
details:
  - id: plan
    title: "1 · What ships where, and how much trust each gets"
    keywords:
      - "Destination Matrix"
      - "Trust Allocation"
      - "Gate Policy"
    body: "There are five destinations, not a vague every environment. The game server and web client each get a production and a development target, and Android gets a limited internal testing track. Development can deploy itself from a push; nothing else can, and the gates for every other release are written down before any pipeline exists."
  - id: build
    title: "2 · One pipeline, shared across every destination"
    keywords:
      - "Brief-Driven Implementation"
      - "Shared Composite Actions"
      - "Fail-Closed Checks"
    body: "Every destination calls the same set of pipeline actions instead of five separate scripts, so a fix only has to land once. Each still runs its own steps where the target actually differs — the Android build gets signed with a key unlocked for that one step, and every build depends on art that gets hash-checked before it's allowed in. Either check failing stops the build outright, not just a warning in the log."
  - id: ship
    title: "3 · Target environments"
    keywords:
      - "Staged Rollout"
      - "Environment Isolation"
      - "Credential Scoping"
    body: "Production and the Android track only get an update once development has already proven it works, never in parallel. Each environment carries its own networking and its own credentials, so a leaked development key can't reach production. A bad development build stops at that wall instead of reaching a real player."
  - id: operate
    title: "4 · Monitoring"
    keywords:
      - "Live-State Verification"
      - "Alerting & Escalation"
      - "Future Work"
    body: "Not built in this environment yet — the plan is to read what's actually running in each destination and raise an alert when it drifts from what was deployed, rather than relying on someone noticing. The practice behind it is not new to me: five years of enterprise NOC work was alarm detection, escalation and failover verification, which is this same problem with different nouns. What's missing here is the implementation, not the discipline."
    planned: true
---

#### Full auto-deploy, once it has been earned

Development already deploys itself on a push. Extending that to production is built, ready, tested but deliberately switched off.
