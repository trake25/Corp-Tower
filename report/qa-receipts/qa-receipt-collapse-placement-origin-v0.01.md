# QA receipt — Collapse Placement Origin v0.01

- Original task: collapse placement origin linger
- Task identity: Collapse Placement Origin v0.01

## Outcome

- Implementation: COMPLETED
- Verification: PASSED
- Task closure: CLOSED
- Plan archive: ARCHIVED
- Active plan: plan/collapse-placement-origin-1s-linger-v0.01.md
- Archived plan: plan/done/collapse-placement-origin-1s-linger-v0.01.md

## Scope

### Reviewed changed scope

- src/Client/App/corp-tower/Cor/Scripts/GameUi/VisualHooks.gd
- src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd
- src/Client/App/corp-tower/Tests/Gut/GameUi/test_collapse_camera_reveal.gd
- src/Server/app/Game_Config.js

### Final published scope

- docs/context/map/ui-hud.md
- report/qa-receipts/qa-receipt-collapse-placement-origin-v0.01.md
- src/Client/App/corp-tower/Cor/Scripts/GameUi/VisualHooks.gd
- src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd
- src/Client/App/corp-tower/Tests/Gut/GameUi/test_collapse_camera_reveal.gd
- src/Server/app/Game_Config.js

## Executable proof

### QA — PASS

- Summary: exit 0; PASS — contract targeted tests (1); server syntax (1); server full suite; client smoke; client targeted GUT (2)

### file map — PASS

- Summary: exit 0

### game KB — PASS

- Summary: exit 0

## QA decisions

- Permanent coverage: added
- Protected contract: A collapse-start snapshot that includes a newly placed falling block clears ordinary drop state and seeds collapse debris from the resolved authoritative placement origin.
- Temporary verification: not-used
- QA tooling: unchanged

## Maintenance

### Advisory

#### strong decomposition candidate — architecture-decomposition

- Affected component or tool: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd
- Diagnostic / impact: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd is 1758 lines; the advisory threshold is ~1200 lines. Advisory only; verification remains valid.
- Follow-up: Plan a focused decomposition before the next feature expands this file.

---

Generated mechanically by `scripts/task-close.mjs` from sanitized structured close-out evidence. Raw logs remain private.
