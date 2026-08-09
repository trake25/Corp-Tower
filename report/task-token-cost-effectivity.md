# Task token cost & effectivity

Observational log: one appended row per completed task. It answers *"what do
things cost lately"* — not *"did the restructure work?"* That is
[retrieval-probes.md](./retrieval-probes.md), which is controlled.

Cost is never read without correctness beside it. A cycle where `Tot` falls and
`Hit` degrades is recorded as a **regression**, not a win.

## Append rule

> On task completion, append one row. Record `R-est` **before** reading anything.
> At 20 entries, stop and tell the user the cycle is full.

At 20, roll up: median `R-act`, `Hit` distribution, misroute rate. Archive the
rows under a `## Cycle N (closed)` heading, keep the rollup line, start a new
table. The first closed cycle is what sets the Phase 6 delegation thresholds —
the numbers in the plan are placeholders until then.

`R-est` recorded after the fact is worthless. A row where `R-est` equals `R-act`
exactly is the tell; spot-check for it while cycle 1 is open.

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

## Cycle 1 (open)

| # | Task | Cx | Mode | Dom | F | R-est | R-act | Tot | Main | Hit | V |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Phase 0 baseline probe run, P1–P6 | 3 | A0 | 2 | 6 | — | 13,700 | 13,700 | 13,700 | ~ | ok |
| 2 | Phase 1+1b+3a: validator, map gen, doc merge | 5 | A0 | 3 | 12 | — | ~45,000 | ~45,000 | ~45,000 | ✓ | ok |
| 3 | Phase 3b: 7 domain docs rewritten to budget | 5 | A0 | 3 | 13 | ~70,000 | ~62,000 | ~95,000 | ~95,000 | ! | ok |
| 4 | Audit: is Phase 1–3b complete? (read-only) | 2 | A0 | 1 | 9 | — | ~9,000 | ~18,000 | ~18,000 | ! | ok |
| 5 | Finish Phase 3a+3b: delete 6 docs, close gates | 5 | A0 | 3 | 24 | ~40,000 | ~62,000 | ~120,000 | ~120,000 | ! | ok |
| 6 | Retire `Rejected:`; strip fixed-bug narrative | 4 | A0 | 3 | 12 | ~25,000 | ~28,000 | ~52,000 | ~52,000 | ✓ | ok |
| 7 | Fix 2 server tests; author map `Does` column | 4 | A0 | 2 | 20 | ~30,000 | ~55,000 | ~90,000 | ~90,000 | ! | ok |

Rows 1–2 carry no `R-est`: both predate the append rule they establish. They are
measurements, not predictions, and are marked as such rather than back-filled — a
fabricated `R-est` is worse than a blank one. This is also the concrete argument
for 1b landing before the work rather than after: the two largest tasks in the
restructure are permanently un-predicted.

Row 1 `Hit` is `~` — two of six probes needed a second lookup to turn a named
symbol into a `file:line`. Row 2 is `✓`: every doc it needed was named by the
router, no repo-wide search.

Row 3 is the first row with a real `R-est`, recorded before the reads: ~70,000
predicted against ~62,000 actual, an 11% over-estimate. It is `!` because the pass
found three places where a doc contradicted itself or the code — the marker is
about what the work *found*, not about how it went, and `V` stays `ok` because all
three were resolved in the same pass.

Row 4 `Hit` is `!` and rows 2–3 are the thing it contradicts. Row 2 logs Phase 3a
as done, but 3a's four deletions never ran — the merges landed, the source files
stayed. Row 3 logs seven docs "rewritten to budget"; four are still over. Both
rows are left as written: **a task log that gets edited to match later findings
stops being evidence.** The lesson is that a self-reported phase row is a claim,
not a gate — the gate is the validator, and it was never green.

Row 5's `R-est` ran ~35% under actual. The miss is instructive rather than
embarrassing: the estimate priced deleting six docs and trimming four, and missed
that **verifying** a deletion is safe costs more than the deletion — every one of
the six had to be read end to end to prove its unique content had a home, which is
where most of the 62,000 went. A deletion-heavy task should be estimated on what
must be read to justify it, not on what is written.

Its `Hit` is `!`: `gameplay.md` contradicted `Game_Config.js` on the supply
coverage constants. Recorded in [landmine-checklist.md](./landmine-checklist.md)
as finding 4.

Row 6 is the one that should change how later rows are read. Rows 1–5 were run
under a retention test that sanctioned a `**Rejected:** <option> → <failure>` line
for every abandoned alternative. That clause was the KB's largest single source of
prose, and it survived three compaction passes because each line looked individually
defensible. It was removed on the user's challenge — *what does documenting a thing
that is no longer in the source buy a future implementation?* — and the answer was
nothing. Where the constraint is still live it is now written as the constraint, in
the present tense, which is **shorter** than the narrative it replaced.

The measurable result: `ui.md` 6,408 → 5,719 and `backend.md` 5,718 → 5,670 with
**all 50 hazards re-verified present**, and three budgets lowered rather than
raised. `Rejected:` is now itself a banned construction in `validate-docs.mjs`, so
the loophole cannot reopen quietly.

The lesson for the remaining phases: **a doc growing is not evidence the budget is
wrong.** Rows 1–5 treated over-budget as a signal to re-examine the budget; the
first thing to re-examine is whether the content acts on anything.

Row 7's `!` is the most serious drift found so far, and the map is what found it.
`Game_Config.js` was missing `levelTimeLimitMs` entirely while `Game_Engine.js:547`
read it and `Lobby_Manager.js` exposed a debug setter for it. `git log -S` traced
the deletion to commit `58702d9` — **a comment-stripping pass that swallowed a real
config line sitting between two comment lines** (11 insertions, 138 deletions). The
round-clock floor had silently defaulted to 1000 ms ever since.

This is a direct warning for **Phase 4**, whose whole content is a comment strip
over ~560 lines. The plan already says it needs a tokenizer-lite pass rather than a
regex; this is proof of what the regex version costs, and it was found by a config
key diff (`git show <sha>^:file | grep keys` against the current file), which is a
cheap check Phase 4 should run as a gate rather than trusting parse + tests alone.

**Rollup (cycle 1, open):** n=7 · median `R-act` ~45,000 · ✓2 ~1 ✗0 !4 · misroute 0%
