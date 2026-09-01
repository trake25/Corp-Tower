---
name: update-docs
description: Diff-driven update of docs/context to match code changes. Run only after a goal is confirmed reached.
---

Update `docs/context/` after the current goal is fully reached — never
speculatively mid-task. Run it in the same active task: that session already
holds the approved intent, implementation evidence, and live constraints a cold
follow-up cannot reliably reconstruct.

`task-close` owns explicit paths, generated maps, validators and the final
report. This workflow owns the agentic step: apply the doc-worthy gate, update
only affected semantic prose, and supply the close-out decision.

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

1. **Scope to the task manifest, approved intent, and task-owned implementation
   paths—not the tree.** `--from-git` is not a fallback because it can include
   concurrent work.

2. **Doc-worthy gate.** A change earns an edit only if it alters feature
   behaviour, a rule, authority or ownership, a cross-boundary contract, a term,
   or a rationale/live trap a future session cannot recover from one routed
   source file. Copy fixes, cosmetic values, local defaults, node or symbol
   changes and pure refactors produce *no doc change* unless they alter one of
   those medium-level contracts. Say so, validate, stop; do not manufacture an
   entry to show work.

3. **Read the implementation evidence only where you do not already hold it.**
   Use a bounded source/diff read around the approved behavior; widen only when
   a configuration shape or cross-file contract requires it.

4. **Edit as replacement.** Read only the affected document section with a
   bounded line-range command. A new entry uses the relevant outline insertion
   point; never read a doc in full to change a few lines.

5. **Verify through the manifest.** Own each selected candidate doc with
   `task-close amend` before editing it, include it in `review`, then close with
   `--decision updated --doc-path ...` or `--decision not-needed`, always with a
   compact `--reason`. Close-out regenerates content-changed maps and validates
   the relevant KB.

6. **Repair deterministic and semantic task defects.** The same receipt validates
   the game KB and, when in scope, the site KB. Close-out regenerates file maps
   but does not synchronize agent skills or publish mirror paths as derived
   output. `.agents/skills/**` is canonical; `.githooks/pre-commit` alone runs the
   skill sync, stages `.claude/skills/**`, and verifies it during commit. Bad
   links, anchors, citations, map targets, generated structure, hard line limits,
   and task-caused failures remain open work. Ambiguous source-vs-doc meaning
   stops for the user.

7. **Compact only on a hard prose trigger.** A `compaction-required` section or
   exceptional KB-wide hard ceiling never becomes `maintenance-blocked`. Load
   `compact-docs`, own the named doc before editing, compact the failing section
   first, preserve every live state/constraint/landmine, re-review, and retry
   close-out without asking. Widen to the containing doc only when section-local
   work cannot safely pass; whole-KB widening is allowed only for a proven hard
   aggregate condition after bounded attempts fail. If meaning cannot be
   preserved, stop for a user decision instead of raising the hard limit.

8. **Receipt.** One line: `docs: gameplay.md, backend.md (+4/−31) · validate PASS`.
   Commit only if explicitly instructed.

**Net-line expectation:** 2–15 net lines across all docs for a typical goal. More
than 30 net lines into one doc means the session is being transcribed rather than
the system documented — compress before finishing.

Advisory 95% pressure and whole-file prose/map soft overage never trigger
compaction or a maintenance handoff. Whole-KB compaction remains an explicit
entropy/duplication task except for the validator-proven hard aggregate fallback
above.

`site/` has its own KB at `site/docs/`; the same gate updates it in place when a
portfolio task changes a medium-level contract.
