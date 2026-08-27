---
name: update-docs
description: Diff-driven update of docs/context to match code changes. Run only after a goal is confirmed reached.
---

Update `docs/context/` after the current goal is fully reached — never
speculatively mid-task. Run it in the session that made the change: it already
holds the diff, intent and current constraints a cold agent cannot recover.

`task-close` owns manifest scope, generated maps, validators and the final report.
This workflow owns the agentic part only: applying the doc-worthy gate and writing
current, compact prose before the manifest records its documentation decision.

## The one rule

These docs describe the system **as it is now**, not how it got here. Git holds
the history. Every run *replaces* prose; it never appends.

**Retention test.** A sentence survives only if it both changes what someone
does to the code **today** and supplies understanding that is not obvious from
the routed source file. Two forms qualify:

1. **State** — feature behaviour, authority, cross-file or cross-system
   contract, term, or subsystem role.
2. **Live constraint** — something the code still cannot do, or a trap still
   sitting in it. `Number(null)` is `0`. `SnapGrid.settle_origin_y` mirrors server
   `settleBlock`. `checkFailCondition` must not take the efficiency factor.

Write both in the **present tense, as how the system behaves and why it cannot
behave otherwise.** Never as a story about how it got that way.

The docs are the feature briefing before source inspection, not a prose rendering
of the source. A label, asset name, pixel value, private symbol, local default,
scene-node inventory or implementation branch fails the gate unless another
system consumes it as a contract. The routed file will be read for those details.

A landmine is only a currently reachable silent trap. Fold a fixed bug into the
normal behaviour; do not preserve it as task history.

Everything else goes: chronology, who found what, how many passes it took, what a
thing "used to" be — and **any alternative that was tried and abandoned**. A
rejected design is only worth a sentence when the constraint that killed it is
*still live*, and then it is written as the constraint, not as the rejection:

> ✗ `**Rejected:** two swappable UI skins → every scene edit had to be made twice.`
> ✓ `There is one gameplay UI scene and no skin system.`

> ✗ `**Rejected:** holding them as `const`s → the alias froze the old 14-wide grid…`
> ✓ `Never alias them into `const`s — the server re-derives the grid every level.`

If a system is gone from the source, it is gone from the docs. Do not document the
absence of something; nobody can act on it.

**Banned constructions:** *used to · previously · originally · the first attempt ·
was later · since removed · then deleted · reverted · earlier version ·
calibration passes · in this pass*. `validate-docs.mjs` flags these.

## Procedure — the gate comes before any file is opened

1. **Scope to the task manifest, not the tree.** Use the exact post-edit ranges
   from `task-close review`, which runs `docs-scope` against explicit final
   paths. `--from-git` is not a close-out fallback because it can include
   concurrent work.

2. **Doc-worthy gate.** A change earns an edit only if it alters feature
   behaviour, a rule, authority or ownership, a cross-boundary contract, a term,
   or a rationale/live trap a future session cannot recover from one routed
   source file. Copy fixes, cosmetic values, local defaults, node or symbol
   changes and pure refactors produce *no doc change* unless they alter one of
   those medium-level contracts. Say so, validate, stop; do not manufacture an
   entry to show work.

3. **Read the diff only where you don't already hold it.** Use the per-path
   strategy `docs-scope.mjs` prints: `full` (the file encodes numbers a hunk can
   hide — `Game_Config.js`), `wide` (`git diff -U10`), `hunk` (`git diff -U2`).

4. **Edit as replacement.** Read **only the line ranges `docs-scope.mjs` printed** —
   the only prose this diff can have falsified — with a bounded line-range command. Never read
   a doc in full to change a few lines. A doc with no printed ranges is getting a
   new entry: pick the insertion point from the printed outline.

5. **Verify through the manifest.** Own each selected candidate doc through
   `task-close amend` before editing it, then `task-close close` records the
   decision, regenerates content-changed maps and carries authored `Does` by
   symbol.

6. **Fix every validator error.** The same verification receipt validates the game
   KB and, when in scope, the site KB; rerun the individual validator only to read
   its full failure detail.

7. **Receipt.** One line: `docs: gameplay.md, backend.md (+4/−31) · validate PASS`.
   Commit only if explicitly instructed.

**Net-line expectation:** 2–15 net lines across all docs for a typical goal. More
than 30 net lines into one doc means the session is being transcribed rather than
the system documented — compress before finishing.

Whole-KB compaction is not part of this — load `compact-docs` for that workflow.

`site/` is out of scope: `docs-scope.mjs` drops those paths and prints them as
dropped. The portfolio has its own KB at `site/docs/`, updated in place as part
of the `web-designer` / `editorial` close-out.
