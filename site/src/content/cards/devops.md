---
role: "DevOps"
order: 2
headline: "I encoded the three teammates I don't have as CI jobs."
plain: "I run every environment of this project alone. So I built the parts of a team that isn't there — the person who does releases, the person who checks before you break something, and the person who remembers the steps."
tools:
  - "GitHub Actions"
  - "Composite Actions"
  - "Godot Export (GUT)"
  - "Google Play Publisher API"
  - "Cloudflare R2"
  - "Docker"
details:
  - id: objectives
    title: "1 · Don't touch what's already running"
    body: "Before any pipeline was built, the rule was: nothing that's already running gets touched by surprise. A routine code push shouldn't silently restart something that was deliberately turned off — so every automatic deploy checks whether its target is actually live right now, not whether a saved status flag says it should be. A flag can lie about what's actually running; the real, current state can't."
    evidence:
      label: "The rule that stops a routine push from undoing a deliberate shutdown"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#auto-deploy-guard-rails-check-live-status-not-a-stored-flag"
  - id: source_control
    title: "2 · Keeping the record honest"
    body: "This isn't a multi-branch, multi-reviewer repo — it's one person directing an AI coding agent, so the thing that actually needs governing isn't code review, it's whether the written record of the system still matches what's true. Changes to that record follow their own fixed procedure: what's worth writing down, what gets deleted because it's no longer true, and a one-line receipt of exactly what changed and why — checked by a script before it's accepted, the same way a pull request would be checked."
    evidence:
      label: "The procedure that reviews changes to the truth, not just the code"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/coding-conventions.md#documentation-maintenance"
  - id: ci
    title: "3 · Nothing ships unverified"
    body: "Every build depends on art that never touches the public repository, which means the build has to prove that art arrived correctly before doing anything else with it: downloaded, hash-checked, unpacked, file-counted, and checked for specific files that must exist. Every single one of those checks fails the build outright rather than shipping with something missing or wrong."
    evidence:
      label: "Every art check fails the build closed, not open"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/build.md#private-asset-pipeline"
  - id: orchestration
    title: "4 · Getting it out, safely"
    body: "Getting a release out is one long, ordered sequence, not a single button: figure out the next version number by asking the store itself what's already published, unlock the signing key from a secret store, build and sign the release, then push it to a limited internal testing track — never straight to everyone. The keys and credentials involved are pulled in only for that one step and never written anywhere else."
    evidence:
      label: "The version number the pipeline never has to guess"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/build.md#android-deploy-wsplaytod-workflow"
  - id: validation
    title: "5 · Proven, not assumed"
    body: "A release doesn't reach a real device until it clears specific, named checks — not a general 'looks fine' judgement. Scripted tests run and block the pipeline if they fail, before a single signed build is exported. Which checks are actually allowed to stop a release, and which are advisory, is written down as a fixed table, not decided case-by-case in the moment."
    evidence:
      label: "The exact list of checks that are allowed to block a release"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/testing.md#ci-test-gates"
  - id: automation
    title: "6 · Earning full automation"
    body: "Full delivery automation — the kind where a merged change deploys itself with no one pressing a button — is built and ready to switch on. It isn't switched on yet. Automating a deploy earns that trust only after a live install, one fully manual sync, and one deliberate rollback test all succeed — automating the step before that trust exists just means the same mistake happens faster."
    evidence:
      label: "Automation that's ready, deliberately not yet turned on"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#argo-cd-prepared-but-not-enabled"
---
