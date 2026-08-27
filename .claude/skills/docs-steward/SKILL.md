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

After a whole-KB compaction, ratchet each ceiling to the greater of ten percent
headroom or 100 estimated tokens above the cleaned document, rounded up to 50.
That allowance is capacity for a real feature contract, not permission to append
source-obvious detail.

**A doc over budget again after already being raised is a compaction signal, not
a second raise.** Check history before touching the ceiling:
`git log -p -- scripts/validate-docs.mjs | grep "'<doc>.md':"`. If the number
already moved once, raising it again is not the fix — run
[`compact-docs`](../compact-docs/SKILL.md) on that doc, and if
compaction can't recover enough room, split it (a new doc plus a router entry)
instead. One raise is allowed without that check; the same doc going over a
second time skips straight to compaction or a split.

## Repairing a retrieval miss

A miss is a defect in the KB, not a reason to route around it. Fix it in the same
task: bare or wrong map row → author the `Does` · wrong or missing router row →
fix the KB's `index.md` · **doc contradicts source → source wins**, fix the doc
and log the task row `!`.

**Flag instead of fixing** when the repair needs a call only the user can make:
source and docs disagree and neither is obviously right · a budget cannot hold
what the doc must say · the fix changes `build-file-map.mjs` output or the
carry-forward key · the fix would drop authored `Does` rows. State the defect and
its cost, then stop.

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
by `file#symbol`. Fix every validator error before completion. Receipt is one line:
`docs: gameplay.md, backend.md (+4/−31) · validate PASS`.

**Do not commit unless explicitly told to.**
