# Task token cost & effectivity

Observational log: one appended row per completed task. It answers *"what do
things cost lately"* — not *"did the restructure work?"* That is
[retrieval-probes.md](./retrieval-probes.md), which is controlled.

Cost is never read without correctness beside it. A cycle where `Tot` falls and
`Hit` degrades is recorded as a **regression**, not a win.

## Append rule

> A `<!-- next: row N -->` sentinel sits immediately below the open table. To
> append: grep this file for the sentinel (never read the whole file) to get
> `N`, read just that line, then replace it with the new row plus an updated
> sentinel for `N+1`. Record `R-est` **before** reading anything. Writing row
> 20 closes the cycle immediately: read the full table, write a plain-English
> rollup (median `R-act`, `Hit` distribution, misroute rate, and whether the
> cycle was cost-efficient) above it, archive it under a new
> `## Cycle N (closed)` heading, clear the table, and reset the sentinel to
> `row 1`. A row is the minimum required — number, columns, nothing else.

`R-est` recorded after the fact is worthless. A row where `R-est` equals `R-act`
exactly is the tell; spot-check for it while a cycle is open.

## Columns

`Cx` complexity 1–5, logged for correlation only — `R-est` and `Dom` are what
drive the delegate decision, and logging both is how we find out whether
complexity predicts cost at all.
`Mode` A0 pre-restructure · A Plan A · B role skills inline · Bd delegated.
`Dom` role domains touched · `F` files in scope.
`R-est` / `R-act` predicted vs actual source read, tokens.
`Tot` total · `Main` main-thread tokens (differs from `Tot` only when `Bd`).
`Hit` ✓ first try · ~ needed a second doc · ✗ fell back to repo search · ! doc
contradicted source.
`V` verdict: `ok` · `→Bd` should have delegated · `→A` delegation wasn't worth it.

## Cycle 2 (open)

| # | Task | Cx | Mode | Dom | F | R-est | R-act | Tot | Main | Hit | V |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Sign-in + Home screens built, Join Screen rebuilt, flow rewired | 4 | A | 1 | 13 | — | ~45,000 | ~60,000 | ~60,000 | ✓ | ok |
| 2 | Backjob: stub buttons pressable, pressed-state consistency, SVG pixelation fix | 3 | A | 1 | 6 | ~20,000 | ~19,000 | ~34,000 | ~34,000 | ✓ | ok |
| 3 | Sentinel append policy authored + tested; scanned KB for other append-log candidates (none found) | 2 | A | 1 | 2 | — | ~4,000 | ~9,000 | ~9,000 | ✓ | ok |
| 4 | Android mobile misalignment: `window/stretch/aspect.mobile="keep"` fix + ui.md doc update | 3 | A | 2 | 2 | — | ~18,000 | ~32,000 | ~32,000 | ! | ok |
| 5 | Contact form taken live: readiness debug, Resend 422 traced to a domain in CONTACT_TO, address guard + provider logging, live guardrail probe | 2 | B | 2 | 3 | — | ~6,000 | ~48,000 | ~48,000 | ! | ok |
<!-- next: row 6 -->

## Cycle 1 (closed)

**Rollup:** 19 tasks, typically reading about 25,000 tokens of source. Retrieval
found the right doc on the first try 11 times out of 19 and needed one extra
lookup twice; it never had to fall back to a full repository search. In 6 tasks
a doc was stale or contradicted the source — a documentation problem, not a
retrieval-cost one. Every task used the right mode (no solo/delegate misroutes).
The delegation gate recommended delegating in 4 tasks; all 4 were finished solo
without issue, so its file/token thresholds were raised for cycle 2. Estimates
were only recorded before reading in 5 of 19 tasks, so cost predictions are
mostly untested this cycle. **Verdict: cost-efficient** — no wasted searches, no
wrong-mode work — but doc freshness and estimate discipline need attention
before cycle 2's numbers can be trusted.

| # | Task | Cx | Mode | Dom | F | R-est | R-act | Tot | Main | Hit | V |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Phase 0 baseline probe run, P1–P6 | 3 | A0 | 2 | 6 | — | 13,700 | 13,700 | 13,700 | ~ | ok |
| 2 | Phase 1+1b+3a: validator, map gen, doc merge | 5 | A0 | 3 | 12 | — | ~45,000 | ~45,000 | ~45,000 | ✓ | ok |
| 3 | Phase 3b: 7 domain docs rewritten to budget | 5 | A0 | 3 | 13 | ~70,000 | ~62,000 | ~95,000 | ~95,000 | ! | ok |
| 4 | Audit: is Phase 1–3b complete? (read-only) | 2 | A0 | 1 | 9 | — | ~9,000 | ~18,000 | ~18,000 | ! | ok |
| 5 | Finish Phase 3a+3b: delete 6 docs, close gates | 5 | A0 | 3 | 24 | ~40,000 | ~62,000 | ~120,000 | ~120,000 | ! | ok |
| 6 | Retire `Rejected:`; strip fixed-bug narrative | 4 | A0 | 3 | 12 | ~25,000 | ~28,000 | ~52,000 | ~52,000 | ✓ | ok |
| 7 | Fix 2 server tests; author map `Does` column | 4 | A0 | 2 | 20 | ~30,000 | ~55,000 | ~90,000 | ~90,000 | ! | ok |
| 8 | Phase 4: comment strip, −653, maps regenerated | 4 | A | 3 | 33 | — | ~25,000 | ~55,000 | ~55,000 | ✓ | ok |
| 9 | Phase 5: 5 role skills + `docs-steward` | 3 | A | 1 | 7 | — | ~5,000 | ~14,000 | ~14,000 | ✓ | ok |
| 10 | After-5 probe run, P1–P6 (read-only) | 3 | A | 2 | 6 | — | 16,332 | 16,332 | 16,332 | ~ | ok |
| 11 | Phase 6: delegation gate in `CLAUDE.md` | 2 | A | 1 | 4 | ~3,000 | ~1,500 | ~12,000 | ~12,000 | ✓ | ok |
| 12 | Solo probe: 6 cold sessions, scored | 3 | A | 1 | 5 | — | ~3,000 | ~9,000 | ~9,000 | ✓ | ok |
| 13 | Map rows carry `path:line`; infra map authored 436/436 | 4 | A | 2 | 12 | — | ~36,000 | ~70,000 | ~70,000 | ✓ | ok |
| 14 | Skills-inert diagnosis; ui map 705/705; CLAUDE.md audited + un-ignored | 4 | A | 2 | 15 | — | ~33,000 | ~62,000 | ~62,000 | ✓ | ok |
| 15 | Delete the K3s stack — source, workflows, docs | 3 | B | 2 | 85 | — | ~35,000 | ~75,000 | ~75,000 | ✓ | ok |
| 16 | Portfolio KB + validator, 2 site skills, policy dedupe | 4 | B | 3 | 27 | — | ~38,000 | ~95,000 | ~95,000 | ! | ok |
| 17 | Contact form: dialog, `/api/contact` Worker, guardrails | 4 | Bd | 3 | 11 | — | ~22,000 | ~185,000 | ~110,000 | ✓ | ok |
| 18 | CI deploy failed on the KV placeholder; endpoint made dormant-by-default | 2 | Bd | 3 | 6 | — | ~9,000 | ~55,000 | ~30,000 | ! | ok |
| 19 | Portfolio content compression, workflow diagram and CV-source sync | 4 | A | 2 | 14 | — | ~21,000 | ~29,000 | ~29,000 | ✓ | ok |
