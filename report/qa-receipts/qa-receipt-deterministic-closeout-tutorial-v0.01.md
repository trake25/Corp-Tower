# QA receipt — Deterministic Closeout Tutorial v0.01

- Original task: Deterministic closeout tutorial parity
- Task identity: Deterministic Closeout Tutorial v0.01

## Outcome

- Implementation: COMPLETED
- Verification: MAINTENANCE-BLOCKED
- Task closure: CLOSED
- Plan archive: ARCHIVED
- Active plan: plan/deterministic-closeout-tutorial-parity.md
- Archived plan: plan/done/deterministic-closeout-tutorial-parity.md

## Scope

### Reviewed changed scope

- .github/workflows/Android-Deploy-wstodplay.yml
- .github/workflows/EKS-Deploy-Game-Server.yml
- AGENTS.md
- docs/context/automation.md
- docs/context/map/backend.md
- docs/context/map/infra.md
- docs/context/testing.md
- docs/context/ui-tutorial.md
- scripts/lib/qa-receipt.mjs
- scripts/lib/tutorial-defaults-parity.mjs
- scripts/qa-gate.mjs
- scripts/task-close.mjs
- scripts/tests/qa-gate.test.mjs
- scripts/tests/task-close.test.mjs
- scripts/tests/tutorial-defaults-parity.test.mjs
- src/Client/App/corp-tower/Cor/Scripts/GameUi/Tutorial/TutorialLessons.gd
- src/Client/App/corp-tower/Tests/Gut/GameUi/test_tutorial_lessons.gd
- src/Server/app/Game_Config.js

### Final published scope

- .github/workflows/Android-Deploy-wstodplay.yml
- .github/workflows/EKS-Deploy-Game-Server.yml
- AGENTS.md
- docs/context/automation.md
- docs/context/map/backend.md
- docs/context/map/infra.md
- docs/context/testing.md
- docs/context/ui-tutorial.md
- report/qa-receipts/qa-receipt-deterministic-closeout-tutorial-v0.01.md
- scripts/lib/qa-receipt.mjs
- scripts/lib/tutorial-defaults-parity.mjs
- scripts/qa-gate.mjs
- scripts/task-close.mjs
- scripts/tests/qa-gate.test.mjs
- scripts/tests/task-close.test.mjs
- scripts/tests/tutorial-defaults-parity.test.mjs
- src/Client/App/corp-tower/Cor/Scripts/GameUi/Tutorial/TutorialLessons.gd
- src/Client/App/corp-tower/Tests/Gut/GameUi/test_tutorial_lessons.gd
- src/Server/app/Game_Config.js

## Executable proof

### automation protocol — PASS

- Summary: exit 0

### retrieval benchmark — PASS

- Summary: exit 0; PASS — retrieval 18/18, skills 10/10, protocol 20/20, sessions 5/5, median 293 bytes (35.2% reduction)

### QA — BLOCKED

- Summary: exit 1; FAIL — server full suite — not ok 164 - v2.1 ships with Difficulty 25 and a forty-percent lateral cap
- Failure classification: test-expectation

### file map — PASS

- Summary: exit 0

### game KB — PASS

- Summary: exit 0

### agent config — PASS

- Summary: exit 0; PASS — 11 canonical skills, mirror and route targets valid

## QA decisions

- Permanent coverage: added
- Protected contract: Plan archival is deterministic and retryable; tutorial defaults remain equal to current direct and derived server authority.
- Temporary verification: not-used
- QA tooling: planned-change

## Maintenance

### Blocking

#### QA — test-expectation

- Affected component or tool: /usr/bin/node scripts/qa-gate.mjs --changed .github/workflows/Android-Deploy-wstodplay.yml .github/workflows/EKS-Deploy-Game-Server.yml AGENTS.md docs/context/automation.md docs/c…
- Diagnostic / impact: exit 1; FAIL — server full suite — not ok 164 - v2.1 ships with Difficulty 25 and a forty-percent lateral cap QA could not provide required proof.
- Follow-up: Confirm the expectation against source history, then repair or rerun QA.

---

Generated mechanically by `scripts/task-close.mjs` from sanitized structured close-out evidence. Raw logs remain private.
