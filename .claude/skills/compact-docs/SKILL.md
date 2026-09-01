---
name: compact-docs
description: Bounded or whole-KB compaction of docs/context while preserving live behavior and constraints.
---

Compact `docs/context/` in one of two modes. Normal close-out uses bounded mode
only when the validator emits a hard `compaction-required` section or KB-wide
condition. Whole-KB mode is exceptional: use it for an explicit entropy,
duplication, or stale-prose maintenance task, or after bounded attempts cannot
resolve a validator-proven hard aggregate ceiling. Advisory 95% pressure and
whole-file soft overage never trigger either mode.

**This pass changes no facts.** It removes history, duplication and mirrored
values. If compaction would change what the docs claim the system does, stop and
ask — that is an `update-docs` job, or a bug in the docs.

Procedure:

1. Run `node scripts/validate-docs.mjs`. For bounded mode, take the exact doc and
   section from its `compaction-required` diagnostic, amend that path into the
   active task-close manifest before editing, and keep the task open. For an
   explicit whole-KB pass, use the verbose report as the worklist.
2. Apply the retention test from `update-docs` to **every** paragraph: keep only
   medium-level **State** and **live constraints** that are not obvious from one
   routed source file. Delete local implementation narration, abandoned
   alternatives and fixed-bug history. A surviving lesson is rewritten as the
   constraint itself, never as a rejection.
3. Collapse superseded entries rather than annexing them. An entry describing
   something that no longer exists is deleted outright unless a live hazard
   survives it — then keep the hazard and drop the rest.
4. **Landmines are not compressible.** Before rewriting a doc, list every gotcha in
   it; after rewriting, tick each one off in the new text. A *live* hazard is one
   the code still carries — a fixed bug is not a landmine and does not survive the
   pass. Budget policy — when raising one is legitimate — is `docs-steward`'s.
5. Delete per-symbol explanation instead of moving it elsewhere. Generated maps
   keep one file purpose plus stable navigation anchors and line numbers; source
   supplies local symbol behavior.
6. Strip mirrored `Game_Config.js` values — keep values only for the ~10 keys that
   drive design conversation on their own.
7. Resolve each status marker: still true (keep), now done (delete), stale (delete
   and note it in the receipt).
8. Re-run the validator and task-close review after each bounded edit. Widen from
   the failing section to its containing doc only when section-local compaction
   cannot safely resolve the hard condition. Widen to the whole KB only for a
   proven hard aggregate ceiling after bounded candidates fail.
9. If safe compaction cannot preserve every live fact, constraint, and landmine,
   stop for a user decision. Never raise a hard limit merely to pass. Receipt:
   one line per doc, `ui.md 1,700 → 1,420 tok`.

Do not commit unless explicitly instructed.
