---
role: "DevOps"
order: 2
headline: "I automate software delivery so the same checks happen every time code is released."
plain: "Changes move through testing and controlled environments before they can reach production."
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
    title: "1 · One pipeline for every destination"
    keywords:
      - "Destination Matrix"
      - "Trust Allocation"
      - "Gate Policy"
    body: "The pipeline serves five destinations: production and development for the game server and web client, plus Android's internal testing track. Only development deploys from a push; every other release has a written gate."
  - id: build
    title: "2 · Test before deployment"
    keywords:
      - "Brief-Driven Implementation"
      - "Shared Composite Actions"
      - "Fail-Closed Checks"
    body: "Shared GitHub Actions composite actions keep all destinations on one pipeline. CI uses OIDC short-lived cloud access; Android signing unlocks its key for one step, and every build hash-checks its art — either failure stops the build."
  - id: ship
    title: "3 · Control which environments can deploy"
    keywords:
      - "Staged Rollout"
      - "Environment Isolation"
      - "Credential Scoping"
    body: "Production and Android update only after development proves the build, never in parallel. Each environment has separate networking and credentials, so a development key cannot reach production."
  - id: operate
    title: "4 · Verify and observe releases"
    keywords:
      - "Live-State Verification"
      - "Alerting & Escalation"
      - "Future Work"
    body: "Planned, not yet built: read the live state in each destination and alert on drift from the deployed result. Five years of NOC work provides the alarm, escalation and failover-verification experience; this environment still needs the implementation."
    planned: true
---

#### Full auto-deploy, once it has been earned

Development already deploys itself on a push. Extending that to production is built, ready, tested but deliberately switched off.
