# Retrieval Probes — controlled before/after

The task log in [task-token-cost-effectivity.md](./task-token-cost-effectivity.md)
is observational: different tasks, different sessions, no control. It cannot answer
*"did the restructure work?"* — only *"what did things cost lately."*

This file does answer it. **Six fixed probes, identical wording every run, executed
at each phase boundary.** Same question against a changing system = a paired
comparison, which is statistically meaningful at n=6 in a way that 5 unpaired
observations per mode never is.

**Probes are read-only.** Route, locate, report — never edit. A probe run costs
what it costs precisely because nothing else is happening.

---

## Protocol

Run at three points only:

| Run | When | Answers |
|---|---|---|
| **baseline** | before any file changes | what the KB costs today |
| **after 3b** | docs rewritten to budget | **did Plan A work?** — this is the S1–S6 verdict |
| **after 5** | role skills landed | do skills add anything over Plan A? |

Three runs rather than one per phase: the two comparisons that matter are
before/after Plan A and Plan A/Plan B. The cost is losing per-phase attribution —
if the after-3b run regresses, the cause is somewhere across Phases 2–3b rather
than pinned to one. Acceptable, because Phase 3a and 3b each have their own
non-probe gate (link integrity, landmine checklist) that catches most of it.

For each probe, in a **fresh session**, record:

**Method pin.** `bytes/4` as reported by `validate-docs.mjs` is the number, for
every run. The estimates written into the rebuild plan ran roughly 2× higher
(`ui.md` "~31,000" against a measured 16,649; KB total "~153,000" against a
measured 77,251). Only relative comparison is needed, so a consistently-applied
estimate is sufficient — but it has to be the *same* estimate on both sides of the
comparison, so the plan's figures are superseded by the validator's from here.

- `Tok` — tokens to reach the answer, `bytes/4` over everything read
- `Hops` — files opened before landing on the right source section
- `Hit` — `✓` first try · `~` needed a second doc · `✗` fell back to repo search · `!` doc contradicted source
- `Ans` — did it end at the correct file **and** section? `y` / `n`

### Three rules that keep a run valid

**1. Fresh session.** A warm context makes every probe look free and measures
nothing.

**2. The probing session must not read this file, or `plan/`.** The
`Correct landing` column below is the answer key — an agent that reads it scores
100% having learned nothing. Paste the six questions into the fresh session
verbatim, with an instruction not to open `report/` or `plan/`. The agent reports
where it landed; scoring against the key happens afterward.

**3. Fixed order, P1 → P6, every run.** The first probe pays the `CLAUDE.md` +
`index.md` entry cost and later probes ride on it. That is fine — it is identical
in every run, so the paired comparison holds. Record P1's cost as the entry-inclusive
figure and note it.

---

## The six probes

| P | Complexity | Question (verbatim) | Correct landing |
|---|---|---|---|
| **P1** | easy | "Where is the popover auto-close duration set?" | `PopoverPanel.gd:7` |
| **P2** | easy | "Which file decides the colour of a brick's mood face?" | `BlockData.gd` · `emoji_mood_for_delta` |
| **P3** | medium | "Where is a debug-config key clamped and validated server-side?" | `Lobby_Manager.js` · `updateDebugConfig` |
| **P4** | medium | "What sets the client's snap radius, and where does the server re-validate that placement?" | `TowerStack.gd` snap consts + `Game_Engine.js` · `resolveColumnOriginX` |
| **P5** | complex | "Which modules must change to add a new scoring event end-to-end?" | `Scoring.js` · `Game_Engine.js` facade · `networking.md` contract · `ScorePopupController.gd` |
| **P6** | complex | "Where is cross-pod room handoff implemented and what breaks if the lease check is removed?" | `Lobby_Manager.js` · `dispatchRoomAction`/`handlePlayerAssignment` + `Redis_State.js` lease methods |

P1–P2 are single-symbol lookups. P3–P4 cross a file boundary. P5–P6 need the
dependency graph, which is where the old KB is weakest and the map layer should
show the largest gain.

---

## Pre-registered success criteria

Written **before** any measurement, so the result cannot be rationalised after the
fact. The restructure succeeds if, measured after Phase 3b against baseline:

| # | Criterion | Target |
|---|---|---|
| S1 | Median probe cost | **≥ 5× reduction** |
| S2 | First-try hit rate (`✓`) | **≥ 5 of 6** |
| S3 | Fallback searches (`✗`) | **0** |
| S4 | Drift found (`!`) | **0** |
| S5 | Correct landing (`Ans = y`) | **6 of 6** |
| S6 | `validate-docs.mjs` | PASS, every doc in budget |

**S3 and S5 outrank S1.** If cost drops 10× but a probe can no longer find its
answer, the restructure failed and the offending doc gets content back. Stated now
so that trade is not quietly made later.

If S1 misses but S2–S6 hold, the KB is correct and merely not as cheap as
projected — tune budgets, do not add hops.

---

## Results

### Baseline — before Phase 1

Run 2026-08-09, fresh session, P1 → P6 fixed order. P1 is entry-inclusive
(`CLAUDE.md` + `index.md`). `Tok` is **incremental** — a doc already loaded by an
earlier probe costs the later probe nothing, which is what rule 3 intends.

| P | Tok | Hops | Hit | Ans |
|---|---|---|---|---|
| P1 | 6,500 | 3 | ✓ | y |
| P2 | 600 | 2 | ~ | y |
| P3 | 5,600 | 1 | ✓ | y |
| P4 | 1,000 | 2 | ~ | y |
| P5 | 0 | 0 | ✓ | y |
| P6 | 0 | 0 | ✓ | y |

**Median: 800  ·  Total: 13,700  ·  Hit ✓: 4/6  ·  Fallback: 0  ·  Correct: 6/6**

Route taken, per probe: P1 `index.md` → `ui.md`. P2 `module-index.md` + one
symbol grep. P3 `backend.md`. P4 `networking.md` + one symbol grep. P5 and P6
answered from `backend.md` / `networking.md` / `ui.md` already in context, no
source file opened.

Both `~` are the same failure mode: the doc named the right symbol but not the
file or line, forcing a targeted grep to convert symbol → `file:line`. That is
precisely the gap the map layer closes, so P2 and P4 are the two probes most
likely to move to `✓` after Phase 2.

Two zeroes are real, not missing data. P5 and P6 are the complex probes and they
cost nothing *because* P1–P4 had already paid for the three docs they needed. The
old KB answers dependency-graph questions well once loaded; what it charges for is
the loading.

**S6 at baseline: PASS** — every doc is inside its line budget (`ui.md` 173/175,
`decisions.md` 188/190, `backend.md` 199/200). This is the old line-based
validator passing a KB that costs ~153k tokens, which is the defect Phase 1
exists to fix, not evidence of health.

#### Amendment to S1's statistic — registered at baseline, blind to the after-3b run

Median-of-incremental is close to degenerate under rule 3's ride-along protocol.
Four of six values here are ≤1,000 and two are exactly 0, so the median is set by
whichever two probes happen to land in the middle rather than by what the KB
costs. A 5× reduction on a median of 800 means hitting ≤160, which no honest
restructure reaches and which failing would say nothing.

**Total run cost is the S1 statistic from here on; median is retained as a
secondary.** Both numbers are recorded above and in every later run, so either can
be computed retrospectively — nothing is discarded. This is registered now,
before the after-3b measurement exists, so it cannot be a post-hoc rationalisation;
the ≥5× target itself is unchanged. S1 therefore reads: **total ≤ 2,740.**

### After Phase 3b — Plan A complete  ·  **the S1–S6 verdict**

*(not yet run)*

| P | Tok | Hops | Hit | Ans |
|---|---|---|---|---|
| P1 | | | | |
| P2 | | | | |
| P3 | | | | |
| P4 | | | | |
| P5 | | | | |
| P6 | | | | |

**Median: —  ·  Hit ✓: —/6  ·  Fallback: —  ·  Correct: —/6**
**S1 —  S2 —  S3 —  S4 —  S5 —  S6 —**

### After Phase 5 — role skills

*(not yet run)*

| P | Tok | Hops | Hit | Ans |
|---|---|---|---|---|
| P1 | | | | |
| P2 | | | | |
| P3 | | | | |
| P4 | | | | |
| P5 | | | | |
| P6 | | | | |

**Median: —  ·  Hit ✓: —/6  ·  Fallback: —  ·  Correct: —/6**

---

## Trend

One row per run. This is the answer to *"is the RAG actually doing the right thing?"*

| Run | Total Tok | Median Tok | vs baseline | Hit ✓ | ✗ | ! | Correct | Criteria met |
|---|---|---|---|---|---|---|---|---|
| baseline | 13,700 | 800 | 1.0× | 4/6 | 0 | 0 | 6/6 | — (reference) |

Baseline holds S3 (0 fallback), S4 (0 drift) and S5 (6/6 correct) already. The old
KB is **not wrong — it is expensive.** S2 misses at 4/6 and S1 is the whole point.
So the restructure has one job and one trap: cut cost and lift S2, without
spending S3/S4/S5 to do it. A later run that improves S1 while dropping S5 below
6/6 is a regression even if every other number improves.
