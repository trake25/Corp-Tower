---
role: "DevOps"
order: 2
headline: "Ship it the same way every time."
plain: "I automate delivery so changes follow the same tests, security checks and deployment controls."
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
  - id: destination
    title: "1 · Choose the destination"
    keywords:
      - "Destination Matrix"
      - "Trust Allocation"
      - "Gate Policy"
    body: "One pipeline supports the project's different destinations instead of maintaining separate release processes. It serves five destinations: production and development for the game server and web client, plus Android's internal testing track."
  - id: checks
    title: "2 · Run the checks"
    keywords:
      - "Brief-Driven Implementation"
      - "Shared Composite Actions"
      - "Fail-Closed Checks"
    body: "Every change passes the required tests and validation before deployment continues. Shared GitHub Actions composite actions keep the checks consistent across destinations."
  - id: authenticate
    title: "3 · Authenticate securely"
    keywords:
      - "Staged Rollout"
      - "Environment Isolation"
      - "Credential Scoping"
    body: "CI obtains short-lived cloud access through OIDC instead of relying on permanent credentials. Each environment has separate credentials, and Android signing unlocks its key for one step."
  - id: artifact
    title: "4 · Verify what gets deployed"
    keywords:
      - "Artifact verification"
      - "Fail-closed checks"
      - "Build integrity"
    body: "Deployment uses the expected build artifact and verifies it before releasing it to the target environment. Every build hash-checks its art; a failed check stops the build."
  - id: gates
    title: "5 · Control the release"
    keywords:
      - "Deployment gates"
      - "Environment isolation"
      - "Protected environments"
    body: "Protected environments require the appropriate approval or deployment gate before a release can continue. Only development deploys from a push; every other release clears a written gate, with environment isolation keeping credentials separate."
  - id: release
    title: "6 · Deploy and clean up"
    keywords:
      - "Deployment"
      - "Teardown"
      - "Temporary infrastructure"
    body: "Deploy to the selected environment and remove temporary infrastructure when it is no longer needed. Teardown returns temporary destinations to zero."
  - id: monitoring
    title: "Monitoring status"
    keywords:
      - "Live-State Verification"
      - "Alerting & Escalation"
      - "Future Work"
    body: "Planned, not yet built: read the live state in each destination and alert on drift from the deployed result."
    planned: true
---

#### Full auto-deploy, once it has been earned

Development already deploys itself on a push. Extending that to production is built, ready, tested but deliberately switched off.
