---
name: update-docs
description: Diff-driven update of docs/context to match code changes. Run only after a goal is confirmed reached.
---

Update `docs/context/` to reflect the code changes just completed. Run only after
the user confirms the goal is fully reached — never speculatively mid-task. Run it
in the session that made the change: it already holds the diff, the intent, and
the alternatives that were rejected, none of which a cold agent could recover.

## The one rule

These docs describe the system **as it is now**, not how it got here. Git holds
the history. Every run *replaces* prose; it never appends.

**Retention test.** A sentence survives only if it changes what someone does to
the code **today**. Two forms qualify:

1. **State** — current behaviour, contract, number, term, or a file's role.
2. **Live constraint** — something the code still cannot do, or a trap still
   sitting in it. `Number(null)` is `0`. `SnapGrid.settle_origin_y` mirrors server
   `settleBlock`. `checkFailCondition` must not take the efficiency factor.

Write both in the **present tense, as how the system behaves and why it cannot
behave otherwise.** Never as a story about how it got that way.

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

1. **Scope to the task, not the tree.**
   `node scripts/docs-scope.mjs <the paths you changed for this goal>`. The working
   tree is not the scope — it also holds other agents' in-flight work. Add
   `--range <sha>^..<sha>` if the task is already committed. `--from-git` scopes to
   the whole tree and is right only when you know the tree is all one task.

2. **Doc-worthy gate.** A change earns an edit only if it alters a **number, a wire
   contract, a rule, a file's role, a term, or a rationale a future session would
   re-litigate**. A pure refactor with none of those produces *no doc change* — say
   so, validate, stop. Do not manufacture an entry to show work.

3. **Read the diff only where you don't already hold it.** Use the per-path
   strategy `docs-scope.mjs` prints: `full` (the file encodes numbers a hunk can
   hide — `Game_Config.js`), `wide` (`git diff -U10`), `hunk` (`git diff -U2`).

4. **Edit as replacement.** Read **only the line ranges `docs-scope.mjs` printed** —
   the only prose this diff can have falsified — with a bounded line-range command. Never read
   a doc in full to change a few lines. A doc with no printed ranges is getting a
   new entry: pick the insertion point from the printed outline.

5. **Regenerate the map** if any source file changed:
   `node scripts/build-file-map.mjs`. Line numbers move on every edit; the authored
   `Does` column carries forward by symbol, so this costs one command.

6. **Validate.** `node scripts/validate-docs.mjs --quiet`; fix every error, re-run
   without `--quiet` for detail.

7. **Receipt.** One line: `docs: gameplay.md, backend.md (+4/−31) · validate PASS`.
   Commit only if explicitly instructed.

**Net-line expectation:** 2–15 net lines across all docs for a typical goal. More
than 30 net lines into one doc means the session is being transcribed rather than
the system documented — compress before finishing.

Whole-KB compaction is not part of this — load `compact-docs` for that workflow.

`site/` is out of scope: `docs-scope.mjs` drops those paths and prints them as
dropped. The portfolio has its own KB at `site/docs/`, updated in place as part
of the `web-designer` / `editorial` close-out.
