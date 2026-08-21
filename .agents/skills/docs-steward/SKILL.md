---
name: docs-steward
description: Owns the two knowledge bases — docs/context/** for the game and site/docs/** for the portfolio. Use at the end of any task that changed source, whenever a validator reports a doc over budget, a banned phrase, a stale map or a broken citation, and whenever retrieval missed and the KB needs repairing.
---

# Docs steward

Every other role ends here. The knowledge base is the thing that makes the next
task cheap, so it is maintained on the way out, not in a cleanup pass later.

## The doc-worthy gate — before any file is opened

A change earns an edit only if it alters a **number, a wire contract, a rule, a
file's role, or a term**. A pure refactor with none of those produces **no doc
change** — say so, validate, stop. Do not manufacture an entry to show work.

What survives an edit, and how it is written, is the retention test in
[`update-docs`](../update-docs/SKILL.md). That skill is its only home;
a second copy here is the exact drift this KB exists to prevent.

**A fixed bug does not by itself earn a landmine.** A landmine is for a trap
still genuinely reachable in the code's current shape, with no compiler or test
signal to catch it — not a record that something was once broken. Default to
folding the resulting behaviour into the relevant section's normal description
(how the system works now, stated so the next agent can reuse it) instead of
appending a landmine bullet; reach for a landmine only when the failure would
otherwise be silent. These docs are not a session log or a scratchpad — nothing
here should read as a trace of what a session did, only as the mechanism as it
now stands.

## Budgets

The validators enforce tokens (`bytes/4`), not lines, plus a 300-character line
cap. **A doc growing is not evidence its budget is wrong.** The first thing to
re-examine is whether the content acts on anything — retiring narrative has
repeatedly freed more room than raising a budget would have. Raise a budget only
when a doc is all current behaviour and live constraint and still does not fit,
and say why in the same change.

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

Game KB:

```bash
node scripts/build-file-map.mjs && node scripts/validate-docs.mjs
```

Regenerate the map after **any** source edit — line numbers move, and the
authored `Does` column carries forward by `file#symbol`, so it costs one command
and no re-authoring.

Site KB (`site/docs/`) — four docs, no generator, and the file map is a
hand-authored table in `site/docs/index.md` that the validator checks both ways:

```bash
cd site && npm run docs:check
```

Fix every validator error before reporting done. Receipt is one line:
`docs: gameplay.md, backend.md (+4/−31) · validate PASS`.

**Do not commit unless explicitly told to.**
