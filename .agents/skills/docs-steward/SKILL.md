---
name: docs-steward
description: Owns the two knowledge bases — docs/context/** for the game and site/docs/** for the portfolio. Use at the end of any task that changed source, whenever a validator reports a doc over budget, a banned phrase, a stale map or a broken citation, and whenever retrieval missed and the KB needs repairing.
---

# Docs steward

Every other role ends here. The knowledge base is maintained on the way out, not
in a cleanup pass later. [`update-docs`](../update-docs/SKILL.md) is the only
home for the doc-worthy gate, prose retention and landmine policy; this skill
owns budget decisions and repair when retrieval fails.

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

A miss is a defect in the KB, not a reason to route around it. Fix it in the same
task: bare or wrong map row → author the `Does` · wrong or missing router row →
fix the KB's `index.md` · **doc contradicts source → source wins**, fix the doc
and log the task row `!`.

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

`task-close review` is the post-edit handoff: it recomputes the exact
documentation scope and QA plan from explicit final paths. After the agent owns
and edits any selected candidate docs, `task-close close` records the doc-worthy
decision, regenerates content-changed maps, validates the relevant game/site KB
and writes exact command evidence.

Regenerated maps preserve each authored file purpose and explicit stable anchor
by `file#symbol`. Repair semantic, task-caused validator failures before
completion. A classified unrelated capacity/tooling failure produces a
maintenance handoff and a truthful `maintenance-blocked` receipt. Receipt is one
line: `docs: gameplay.md, backend.md (+4/−31) · validate PASS`.

**Do not commit unless explicitly told to.**
