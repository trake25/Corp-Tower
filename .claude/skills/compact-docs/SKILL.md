---
name: compact-docs
description: Whole-KB compaction pass over docs/context — collapse superseded entries, dedupe, bring docs under token budget.
---

Compact the `docs/context/` knowledge base. This is the periodic counterpart to
`update-docs`: that skill is diff-scoped and cheap, so entropy still collects in
docs it never opens. This one is whole-KB and expensive — run it as an explicit
maintenance task for actual entropy, duplication, stale/history prose,
banned-phrase backlog, or sustained capacity pressure, not routinely.

**This pass changes no facts.** It removes history, duplication and mirrored
values. If compaction would change what the docs claim the system does, stop and
ask — that is an `update-docs` job, or a bug in the docs.

Procedure:

1. `node scripts/validate-docs.mjs`. Its capacity handoff, long-line list,
   banned-phrase list and status-marker list are the worklist. Work the largest
   entropy or sustained-capacity candidate first.
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
8. Re-run `node scripts/validate-docs.mjs` until it passes. Receipt: one line per
   doc, `ui.md 31,000 → 4,900 tok`.

Do not commit unless explicitly instructed.
