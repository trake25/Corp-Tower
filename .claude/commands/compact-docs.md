---
description: Whole-KB compaction pass over docs/context — collapse superseded entries, dedupe, bring docs under token budget.
---

Compact the `docs/context/` knowledge base. This is the periodic counterpart to
`/update-docs`: that command is diff-scoped and cheap, so entropy still collects in
docs it never opens. This one is whole-KB and expensive — run it when
`validate-docs.mjs` reports docs over budget or a banned-phrase backlog, not
routinely.

**This pass changes no facts.** It removes history, duplication and mirrored
values. If compaction would change what the docs claim the system does, stop and
ask — that is an `/update-docs` job, or a bug in the docs.

Procedure:

1. `node scripts/validate-docs.mjs`. Its over-budget list, long-line list,
   banned-phrase list and status-marker list are the worklist. Work the largest
   over-budget doc first.
2. Apply the retention test from `/update-docs` to **every** paragraph: keep only
   **State** and **live constraints**, both written in the present tense as how the
   system behaves. Delete abandoned alternatives and fixed-bug narratives outright.
   A surviving lesson is rewritten as the constraint itself, never as a rejection.
3. Collapse superseded entries rather than annexing them. An entry describing
   something that no longer exists is deleted outright unless a live hazard
   survives it — then keep the hazard and drop the rest.
4. **Landmines are not compressible.** Before rewriting a doc, list every gotcha in
   it; after rewriting, tick each one off in the new text. A *live* hazard is one
   the code still carries — a fixed bug is not a landmine and does not survive the
   pass. Budget policy — when raising one is legitimate — is `docs-steward`'s.
5. Move per-symbol detail into `docs/context/map/` rather than deleting it. A
   symbol's file, line and one-line purpose belong in a map row; the doc keeps the
   behaviour and the contract.
6. Strip mirrored `Game_Config.js` values — keep values only for the ~10 keys that
   drive design conversation on their own.
7. Resolve each status marker: still true (keep), now done (delete), stale (delete
   and note it in the receipt).
8. Re-run `node scripts/validate-docs.mjs` until it passes. Receipt: one line per
   doc, `ui.md 31,000 → 4,900 tok`.

Do not commit unless explicitly instructed.
