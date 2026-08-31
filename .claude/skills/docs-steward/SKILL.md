---
name: docs-steward
description: Explicit documentation and retrieval-maintenance role for docs/context/** and site/docs/**. Use for planner-approved semantic docs, validator defects, stale maps, broken citations, and retrieval repairs.
---

# Docs steward

This is an explicit maintenance role, not the final phase of every source
change. Normal Codex implementation records semantic documentation as
`planner-follow-up`; the user-initiated planning/review session decides whether
prose needs revision. [`update-docs`](../update-docs/SKILL.md) owns the
doc-worthy gate, prose retention and landmine policy.

## Budgets

The validators enforce tokens (`bytes/4`), not lines, plus a 300-character line
cap. **A doc growing is not evidence its budget is wrong.** The first thing to
re-examine is whether the content acts on anything — retiring narrative has
repeatedly freed more room than raising a budget would have. Raise a budget only
when a doc is all current behaviour and live constraint and still does not fit,
and say why in the same change.

The current capacity baseline allows the greater of twenty percent or 200
estimated tokens of headroom, rounded up to 50, and never lowers an existing
ceiling. A capacity breach is a `validator-maintenance` handoff, not an automatic
compaction or scope expansion. Compact only as an explicit maintenance task when
entropy, duplication, stale/history prose, or sustained capacity pressure makes
the KB harder to use.

## Repairing a retrieval miss

A miss is a defect in the KB. During unrelated product work, use the smallest
role-root fallback and record the defect in `repair/`; do not expand the task to
change routing or maps. In this explicit role, source wins over conflicting docs
and the repair updates the appropriate router, map, or prose.

**Flag instead of fixing** when the repair needs a call only the user can make:
source and docs disagree and neither is obviously right · the fix changes
`build-file-map.mjs` output or the carry-forward key · the fix would drop
authored `Does` rows. State the defect and its cost, then stop.

## Procedures

- Diff-scoped update after a task → [`update-docs`](../update-docs/SKILL.md)
- Whole-KB compaction, only when a validator says so → [`compact-docs`](../compact-docs/SKILL.md)

Those two files hold the executable steps; this skill holds the policy they
apply.

## Close-out

`task-close review` records explicit paths and QA selection. `task-close close`
regenerates content-changed maps, validates the relevant game/site KB, and
writes exact command evidence; pending planner documentation is non-blocking.

Regenerated maps preserve each authored file purpose and explicit stable anchor
by `file#symbol`. Repair semantic, task-caused validator failures before
completion. A classified unrelated capacity/tooling failure produces a
maintenance handoff and a truthful `maintenance-blocked` receipt. Receipt is one
line: `docs: gameplay.md, backend.md (+4/−31) · validate PASS`.

**Do not commit unless explicitly told to.**
