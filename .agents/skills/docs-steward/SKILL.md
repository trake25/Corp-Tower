---
name: docs-steward
description: Explicit documentation and retrieval-maintenance role for docs/context/** and site/docs/**. Use for planner-approved semantic docs, validator defects, stale maps, broken citations, and retrieval repairs.
---

# Docs steward

This is an explicit maintenance role, not the final phase of every source
change. [`update-docs`](../update-docs/SKILL.md) is the normal task's
post-implementation doc-worthy gate; this role owns deliberate documentation,
validator, capacity, citation, map, and retrieval repair work.

## Budgets

The validators enforce tokens (`bytes/4`) plus a hard 300-character line cap.
Whole-file prose budgets are advisory because retrieval reads routed sections;
95% pressure and ordinary overage warn without blocking or triggering
compaction. Rebaseline them only from an approved healthy snapshot using the
greater of twenty percent or 200 estimated tokens of headroom, rounded up to 50,
and never lower an existing ceiling.

Section size is the primary prose retrieval guard. A hard section overflow or
the exceptional KB-wide hard prose ceiling is task-owned `compaction-required`
work: keep closure open, load `compact-docs`, and repair the smallest safe scope.
Never raise a hard limit merely to pass. Generated-map historical/file-count
capacity is also soft; only its density ceiling, per map or in aggregate, is a
`validator-maintenance` blocker requiring generator investigation.

## Repairing a retrieval miss

A miss is a defect in the KB. During unrelated product work, use the smallest
role-root fallback and record the defect in `repair/`; do not expand the task to
change routing or maps. In this explicit role, source wins over conflicting docs
and the repair updates the appropriate router, map, or prose.

**Flag instead of fixing** when the repair needs a call only the user can make:
source and docs disagree and neither is obviously right · the fix changes
`build-file-map.mjs` output or the carry-forward key · the fix would drop
authored `Does` rows · safe compaction cannot preserve every live fact or
constraint. State the defect and its cost, then stop.

## Procedures

- Diff-scoped update after a task → [`update-docs`](../update-docs/SKILL.md)
- Whole-KB compaction, only when a validator says so → [`compact-docs`](../compact-docs/SKILL.md)

Those two files hold the executable steps; this skill holds the policy they
apply.

## Close-out

`task-close review` records every explicit final path and recomputes QA and
candidate docs. `task-close close` requires the source-changing documentation
decision, publishes owned affected docs, regenerates content-changed maps,
validates the relevant game/site KB, and writes exact command evidence.

Regenerated maps preserve each authored file purpose and explicit stable anchor
by `file#symbol`. Repair semantic, task-caused validator failures before
completion. A classified unrelated capacity/tooling failure produces a
maintenance handoff and a truthful `maintenance-blocked` receipt. Receipt is one
line: `docs: gameplay.md, backend.md (+4/−31) · validate PASS`.

**Do not commit unless explicitly told to.**
