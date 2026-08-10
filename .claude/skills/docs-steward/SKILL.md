---
name: docs-steward
description: Owns docs/context/** — the knowledge base every other role retrieves from. Use at the end of any task that changed source, and whenever validate-docs reports a doc over budget, a banned phrase, a stale map or a broken citation.
---

# Docs steward

Every other role ends here. The knowledge base is the thing that makes the next
task cheap, so it is maintained on the way out, not in a cleanup pass later.

## The retention test

A sentence survives only if it changes what someone does to the code **today**.
Two forms qualify:

1. **State** — current behaviour, a contract, a number, a term, a file's role.
2. **Live constraint** — something the code still cannot do, or a trap still
   sitting in it. `Number(null)` is `0`. `SnapGrid.settle_origin_y` mirrors
   server `settleBlock`.

Write both in the **present tense**, as how the system behaves and why it cannot
behave otherwise — never as a story about how it got that way.

> ✗ `**Rejected:** two swappable UI skins → every scene edit had to be made twice.`
> ✓ `There is one gameplay UI scene and no skin system.`

**If a system is gone from the source, it is gone from the docs.** A fixed bug is
not a landmine. Do not document the absence of something; nobody can act on it.

## The doc-worthy gate — before any file is opened

A change earns an edit only if it alters a **number, a wire contract, a rule, a
file's role, or a term**. A pure refactor with none of those produces **no doc
change** — say so, validate, stop. Do not manufacture an entry to show work.

## Budgets

`validate-docs.mjs` enforces tokens (`bytes/4`), not lines, plus a 300-character
line cap. **A doc growing is not evidence its budget is wrong.** The first thing
to re-examine is whether the content acts on anything — retiring narrative has
repeatedly freed more room than raising a budget would have. Raise a budget only
when a doc is all State and live constraint and still does not fit, and say why
in the same change.

## Procedures

- Diff-scoped update after a task → [`/update-docs`](../../commands/update-docs.md)
- Whole-KB compaction, only when the validator says so → [`/compact-docs`](../../commands/compact-docs.md)

Those two files hold the executable steps; this skill holds the policy they
apply. Keep it that way — a second copy of the retention test is the exact drift
this KB exists to prevent.

## Close-out

```bash
node scripts/build-file-map.mjs && node scripts/validate-docs.mjs
```

Regenerate the map after **any** source edit — line numbers move, and the
authored `Does` column carries forward by `file#symbol`, so it costs one command
and no re-authoring. Fix every validator error before reporting done.

Receipt is one line: `docs: gameplay.md, backend.md (+4/−31) · validate PASS`.

**Do not commit unless explicitly told to.**
