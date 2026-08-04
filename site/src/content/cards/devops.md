---
role: "DevOps"
order: 2
headline: "Every destination runs the same pipeline. Only one is allowed to start it by itself."
plain: "This card is the other two combined: the environments and guardrails come from the Cloud work, the brief-and-review loop from the AI work, and what comes out is one pipeline with five destinations. Each gets the same three workflows — deploy it, clean it up, diagnose it when it misbehaves. A push deploys itself to development and nowhere else; everything past that clears a gate on security, timing and clearance first. The steps below are that build order."
tools:
  - "GitHub Actions"
  - "Composite Actions"
  - "Docker"
  - "Godot Export (GUT)"
  - "Google Play Publisher API"
  - "Cloudflare R2"
  - "Claude Code"
details:
  - id: plan
    title: "1 · What ships where, and how much trust each gets"
    keywords:
      - "Destination Matrix"
      - "Trust Allocation"
      - "Gate Policy"
    body: "Nothing gets written until the destinations do, and there are five, not a vague every environment: the game server and the web client each in production and development, and the Android build in a limited internal testing track. Trust is decided in the same breath — development may deploy itself from a push, and nothing else may. The gates are written down before any pipeline exists: which checks stop a release, which only advise. A gate decided while you're waiting on a deploy isn't a gate."
    evidence:
      label: "The checks allowed to block a release, settled in advance"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/testing.md#ci-test-gates"
  - id: build
    title: "2 · One pipeline, written by the agent"
    keywords:
      - "Brief-Driven Implementation"
      - "Shared Composite Actions"
      - "Fail-Closed Checks"
    body: "The plan goes to the coding agent as any task does: a short brief and the exact documents it needs, never the whole repository. What it builds is deliberately boring — one set of shared composite actions every destination calls, so a fix lands once and development can't drift from the path that reaches players. What I read line by line is what the pipeline is trusted with: every build depends on art that never touches the public repository, so it is downloaded, hash-checked, unpacked and file-counted, every one of those failing the build outright. The agent wrote the steps; which of them fail closed was not its call."
    evidence:
      label: "Every art check fails the build closed, not open"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/build.md#private-asset-pipeline"
  - id: ship
    title: "3 · Shipped, and proven able to refuse"
    keywords:
      - "Deployment Verification"
      - "Staged Rollout"
      - "Negative Testing"
    body: "A pipeline that has only been read is untested, so each gets run for real — against development first, where a failure costs an afternoon rather than a player. The Android path is the longest and the clearest: ask the store what version is already published so the number is never guessed, unlock the signing key for that one step, build, sign, upload to a limited internal track. A green run only proves the happy path; the run worth more is the one deliberately made to fail. Anyone can show a pipeline that deploys. The interesting question is whether it stops."
    evidence:
      label: "The version number the pipeline never has to guess"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/build.md#android-deploy-wsplaytod-workflow"
  - id: operate
    title: "4 · Operating it after it ships"
    keywords:
      - "Diagnostics"
      - "Targeted Cleanup"
      - "Live-State Verification"
    body: "Deploying is the easy part, which is why two of the three workflows are for the days afterwards. Diagnose comes first because almost nobody builds it: its entire job is to answer what is actually running right now, read from the live system rather than what a dashboard last recorded. An automatic deploy checks the same way, which stops a routine push from restarting something deliberately turned off. Clean up is its companion, pointed at one destination on demand to take back what a run left behind. Ship the deploy, call that operations, and you find out at the worst moment that nothing can tell you what state you're in."
    evidence:
      label: "Why a deploy asks what is live instead of what a flag says"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#auto-deploy-guard-rails-check-live-status-not-a-stored-flag"
---

#### Full auto-deploy, once it has been earned

Development already deploys itself on a push. Extending that to production is built, ready, and [deliberately switched off](https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#argo-cd-prepared-but-not-enabled). Automating a deploy earns that switch after a live install, one fully manual sync, and one deliberate rollback test have all succeeded — not before, because automating the step ahead of that trust only means the same mistake happens faster. Nothing about the pipeline changes on the day it gets turned on. Only who is allowed to start it does.
