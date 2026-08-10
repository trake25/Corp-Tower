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

### Pilot runs — not the verdict

Two exploratory runs against the mid-Phase-3b tree, kept because they exposed
scoring defects, **not** because they measure anything. Neither is the after-3b
run and neither may be compared against baseline.

| P | Cowork Tok | Cowork Hit | Code Tok | Code Hit |
|---|---|---|---|---|
| P1 | 2,900 | ~ | 7,500 | ✓ |
| P2 | 1,400 | ~ | 2,800 | ~ |
| P3 | 2,600 | ✓ | 5,970 | ✓ |
| P4 | 1,900 | **!** | 1,400 | ✓ |
| P5 | 2,300 | ✓ | 4,000 | ~ |
| P6 | 600 | ✓ | 150 | *(blank)* |
| **total** | **11,700** | 3✓ 2~ 1! | **21,820** | 3✓ 2~ 1 blank |

Three defects, all now fixed in
[PROBE-KICKOFF.md](./PROBE-KICKOFF.md):

1. **Cheaper was wrong.** P1 asked for the popover auto-close *duration*. The
   cheaper run stopped at `PopoverPanel.gd:7` — `OUTSIDE_TAP_GRACE_MS`, the
   neighbouring constant — and still scored `~`. Landing in the right file is not
   landing on the answer, so the prompt now demands an `Answer:` field carrying the
   value, and a near-miss caps at `~`.
2. **A blank `Hit`.** P6 in one run has no grade, which silently reads as a free
   correct answer when totalled. `Hit` is now mandatory.
3. **A bare `!`.** P4's contradiction was recorded as a mark with nothing quoted,
   so it cannot be fixed without re-running. The prompt now requires quoting the
   doc sentence and the source line.

Reading the totals as "Cowork is ~2× more efficient" does not survive the first
defect: strip P1, where the cheaper run answered the wrong constant, and the gap
roughly halves. Cost is S1; correctness is S3/S5 and outranks it.

### After Phase 3b — Plan A complete  ·  **never run**

This run was pre-registered as the S1–S6 verdict and **did not happen**. Phases 4
and 5 landed first, so the tree it was meant to measure no longer exists: the
comment strip moved nearly every line number in the repo and the role skills
changed hop 1. The row is left empty rather than back-filled from a later run.

**What this costs:** the before/after-Plan-A and Plan-A/Plan-B comparisons collapse
into one. The next run measures Plan A **and** Plan B together against baseline, so
a gain cannot be attributed between them. S1–S6 still resolve — the criteria were
registered against baseline, which is intact — but the answer to *"do skills add
anything over Plan A?"* is no longer recoverable without reverting the tree.

Recorded here rather than quietly relabelling the next run as the 3b verdict,
which would claim a controlled comparison that was not run.

### After Phase 5 — Plan A + Plan B  ·  **the S1–S6 verdict**

Run 2026-08-10, fresh session, Q1 → Q6 fixed order. `Tok` is **incremental**, per
rule 3 and the S1 amendment — total is the statistic.

| P | Tok | Cum | Answer | Skill | Hit |
|---|---|---|---|---|---|
| P1 | 7,429 | 7,429 | `auto_close_seconds = 4.0` · `PopoverPanel.gd:7` | none | ✓ |
| P2 | 1,327 | 8,756 | `emoji_mood_for_delta()` · `BlockData.gd:122` | none | ~ |
| P3 | 1,650 | 10,406 | `updateDebugConfig` · `Lobby_Manager.js:621` | none | ~ |
| P4 | 2,104 | 12,510 | `snap_radius_units = 2.2` / `isPlacementLegal` | none | ✓ |
| P5 | 2,129 | 14,639 | `Scoring.js` → facade → wire → `ScorePopupController` | none | ✓ |
| P6 | 1,693 | 16,332 | `isRoomOwner` gates `dispatchRoomAction` | none | ✓ |

**Total: 16,332  ·  Median: 1,899  ·  Hit ✓: 4/6  ·  Fallback: 0  ·  Correct: 6/6**

| | Target | Actual | |
|---|---|---|---|
| **S1** | total ≤ 2,740 | **16,332** — 1.19× *more* than baseline | ✗ |
| **S2** | ✓ ≥ 5/6 | **4/6** — unchanged from baseline | ✗ |
| **S3** | ✗ = 0 | 0 | ✓ |
| **S4** | ! = 0 | 0 | ✓ |
| **S5** | correct 6/6 | 6/6 | ✓ |
| **S6** | validator PASS | PASS, every doc in budget | ✓ |

**The restructure did not make retrieval cheaper.** It got slightly more expensive.
S3/S4/S5 hold, so the KB is correct and nothing was traded away for speed — the
`✗`/`!` columns are clean and every answer landed. But the cost criterion, which
is what the whole rebuild was for, missed by roughly 6×.

Neither abort condition fires: no new `✗`, no `!`.

#### Post-hoc analysis — **not** a re-registration

Recorded after seeing the numbers, and therefore held to a lower standard of proof
than the S1 amendment, which was registered blind. **None of the criteria are
changed on the strength of it.**

*P1 paid a whole-KB entry it did not need.* `index.md` (1,294) + `ui.md` (5,719) =
7,013, which is 94% of P1's 7,429 and 43% of the entire run. P2–P6 average 1,780
and plainly did **not** load whole docs — P3 answered a `Lobby_Manager` question
for 1,650 against a 5,670-token `backend.md`, so it went to the map and the source
directly. So the three-hop contract works when followed, and P1 did not follow it:
the budgets made each doc small enough to swallow whole, which removed the pressure
to read by section. Nothing structurally prevents a whole-doc read.

*S1's target was arithmetically unreachable.* Six questions that each end in a real
source read cost ~1,700–2,100 apiece however good the KB is. A ≤2,740 **total**
implies ~450 per question including opening the file — below the cost of one
`Read` window plus one grep. Even a perfectly-routed run lands near 10,700.

*The protocol favours the KB being replaced.* Rule 3's fixed order lets the old KB
amortise: baseline spent 12,100 of its 13,700 on P1 and P3 loading three big docs,
then answered P5 and P6 for **zero**. The new KB is charged per question and never
gets that back. The baseline note already said it — *"what it charges for is the
loading"* — without following it through to the consequence, which is that a
six-question sweep is the one workload where front-loading wins. Real sessions ask
one question: there, baseline costs 6,500 and a well-routed run costs ~1,780.

*Phase 5 is unmeasured.* `Skill: none` on all six. The skill descriptions trigger on
doing work in a domain; the probes are phrased as questions, so none fired. This
run is Plan A plus a comment strip, not Plan A + Plan B. The instrument cannot see
the mechanism.

Map coverage at run time: `map/backend.md` fully authored (266/266),
`map/ui.md` 530/705, `map/infra.md` 12/436. P3 and P6 land in authored territory,
P1/P2/P4 in partly-authored — so a cost gap between them may be measuring map
coverage rather than routing.

Two changes since the pilot runs that this run measures and the pilots could not:
the comment strip removed 653 comments from product source, so a probe that used
to find its answer in a comment must now find it in a doc or a map row; and the
six role skills put hop 1 in the system prompt, so `index.md` need not be loaded
to route. Both push in the same direction, which is why they cannot be told apart
from one run.

### Solo run — six sessions, one question each  ·  **prediction confirmed**

Protocol in [PROBE-KICKOFF-SOLO.md](./PROBE-KICKOFF-SOLO.md). Questions are
verbatim; only rule 3 changes, so ride-along is the single variable under test.

**What it can answer.** The true cost of a *real* session — one question, cold
context, paying its own entry. Whether the whole-doc load that consumed 43% of the
after-5 run is systematic or was one question's mistake. Whether a role skill ever
fires.

**What it cannot answer, stated before the numbers exist so it is not argued away
afterwards: there is no baseline to compare it against.** The pre-restructure KB is
gone, exactly as the Phase 0 note warned, and its per-question figures are
incremental with ride-along — P2's 600 assumed `ui.md` was already loaded, so it is
not a single-session cost and cannot be treated as one. **This run yields absolute
figures only. It does not produce an S1 verdict and does not overturn the one
above.** Six sessions summed is not comparable to 13,700.

**Pre-registered prediction.** If **4 or more of the 6** sessions read a domain doc
in full, whole-doc loading is systematic, the three-hop contract is not being
followed, and the fix is structural rather than another round of budget-cutting. If
3 or fewer do, the after-5 Q1 was an outlier and per-question cost is near its
floor — in which case the KB is as cheap as this design gets, and further
compaction buys nothing.

#### Results

`Whole doc` is the domain doc(s) the session loaded in full. `Corrected` replaces
each self-reported doc size with the file's true `bytes/4` and keeps the session's
own estimates for greps and source reads.

| S | Question | Whole doc | Reported | Corrected | Skill | Hit |
|---|---|---|---|---|---|---|
| 1 | popover auto-close | `ui.md` | 4,770 | 7,228 | none | ✓ |
| 2 | mood face colour | `ui.md` | 6,050 | 8,801 | none | ~ |
| 3 | debug-config clamp | — | 2,310 | 2,895 | none | ✓ |
| 4 | snap radius | — | 3,400 | 3,920 | none | ~ |
| 5 | new scoring event | `backend.md` + `networking.md` | 6,070 | 9,955 | none | ~ |
| 6 | cross-pod handoff | `backend.md` | 4,373 | 7,052 | none | ✓ |
| | **total** | **4 of 6** | **26,973** | **39,851** | **0/6** | 3✓ 3~ 0✗ 0! |

**The token column is not a trustworthy instrument.** Six sessions read the same
`index.md` and reported it at six different sizes — 2,740 to 3,318 bytes against a
true 5,176. Every one was low, by 36–47%. `ui.md` came back as 14,900 and 14,200
against 22,876; `backend.md` as 13,050 and 14,400 against 22,679. The after-5 run
did *not* have this bias (its Q1 7,429 brackets the true 7,013 for the two files it
loaded), so this is per-session estimation noise, not a fixed correction factor.
Treat every self-reported total in this file as a lower bound, and prefer the
`Hit` column and the route for anything load-bearing.

#### Prediction resolved — systematic

**4 of 6 sessions loaded a domain doc in full**, hitting the threshold exactly. The
three-hop contract's hop 2 — *read the section, not the file* — is not being
followed, and the pre-registered consequence stands: **the fix is structural, not
another round of budget-cutting.**

The split is clean enough to be causal. The two sessions that never loaded a doc
whole cost 2,895 and 3,920; the four that did cost 7,052 to 9,955. **2.4× on that
one behaviour**, with no other variable moving.

Where the corrected 39,851 went:

| Layer | Tok | Share |
|---|---|---|
| Domain docs (full loads + grep context) | 27,583 | 69% |
| Router (`index.md`, all six sessions) | 7,764 | 19% |
| Map (grep + the odd context read) | 2,075 | 5% |
| **Source — the actual answer** | **2,429** | **6%** |

**The layer built to be cheap costs 5% and carried every landing. The layer that
costs 69% is mostly not read.** Whole-doc loads alone are 25,433 tok — 64% of the
run — to extract sections worth a few hundred each.

Counterfactual, holding content constant: give the four whole-doc sessions ~700 tok
of section instead of a 5,670–8,325 tok file and the run is ~17,900 — **55% off
with not one byte of the KB rewritten.** That is the size of the behaviour gap, and
it is larger than anything remaining on the content side.

#### Two defects, both cheap

**The map row does not carry its file.** `Grep "snap_radius_units" map/ui.md`
returns `| 61 | snap_radius_units · export | client snap radius, 2.2 bricks; ... |`
— line, symbol and an excellent `Does`, but no path. The path is in a `### <path>`
header far above, so S4 had to run a second grep against the heading list purely to
learn that line 61 is `TowerStack.gd`. Its map spend was 1,025 tok, the highest of
any session, almost entirely that. Every map hit pays this.

**The router has no row for a cross-cutting change.** `index.md` routes by *area* —
"Gameplay rules, scoring, balance", "Server logic — rooms, engine, scoring" — and
has no row for *"add a new event type"*. S5 read `backend.md` and `networking.md` in
full (8,325 tok) to assemble a module list, then still needed `ui.md` and a source
read. It is the most expensive session and the only one whose cost is the router's
fault rather than the reader's.

#### What held

`0 ✗` and `0 !` — across **all 12 measured question-runs**, after-5 and solo. No
repo-wide sweep has ever been needed, and no doc has yet contradicted source. The
second of those is the Phase 4 claim tested from the far side: 653 comments were
deleted from product source and retrieval has not once landed on a doc the code
disagrees with.

Two sessions show the design working at opposite ends. S3 skipped the domain doc
entirely — `index.md` → grep `map/backend.md` → read the symbol, 2,895 tok, ✓ — the
cheapest run in the file. S6 answered a two-part architectural question, *where* and
*what breaks*, **without opening a single source file**, because `backend.md`'s own
section named every symbol and the map supplied the lines. Doc-sufficient and
map-sufficient, both correct. Nothing structural is missing.

#### Ride-along, now priced

Solo and after-5 differ in exactly one thing: the session boundary. Same KB, same
questions, same wording. **26,973 solo against 16,332 ride-along — warm context was
hiding 39% of true cost.** The after-5 post-hoc argued rule 3 flatters a
front-loading KB; this is that argument with a number on it, and it applies at least
as strongly to the 13,700 baseline, whose KB front-loaded harder.

#### Phase 5 is inert, and now twice-confirmed

`Skill: none` in 6 of 6, as in 6 of 6 after-5. **0 of 12.** The cause is structural,
not incidental: skills are scoped to *"paths you are about to touch"*, and a
read-only question touches no paths. Hop 0 cannot fire on question-shaped work
however good the skills are — which also means the 7,764 tok of `index.md` it exists
to eliminate is still being paid every session. Phase 5 remains unmeasured, and only
a task-shaped probe can measure it.

---

## Trend

One row per run. This is the answer to *"is the RAG actually doing the right thing?"*

| Run | Total Tok | Median Tok | vs baseline | Hit ✓ | ✗ | ! | Correct | Criteria met |
|---|---|---|---|---|---|---|---|---|
| baseline | 13,700 | 800 | 1.0× | 4/6 | 0 | 0 | 6/6 | — (reference) |
| after 5 | 16,332 | 1,899 | **0.84× (worse)** | 4/6 | 0 | 0 | 6/6 | S3 S4 S5 S6 · **S1 ✗ S2 ✗** |
| solo | 39,851 | 7,140 | n/c — see below | 3/6 | 0 | 0 | 6/6 | S3 S4 S5 · S1 S2 n/a |

The solo row carries **no `vs baseline`** and that is not an omission. It is six
cold sessions, not one warm run; the comparison was ruled out in the
pre-registration before its numbers existed, and it is not to be back-filled. Its
`Hit ✓` of 3/6 is likewise not a regression against after-5's 4/6 — the ✓ that
moved is Q2, which spent its extra lookup *verifying* that no runtime tint exists
beyond the texture choice. Score the answer, not the file count.

Baseline holds S3 (0 fallback), S4 (0 drift) and S5 (6/6 correct) already. The old
KB is **not wrong — it is expensive.** S2 misses at 4/6 and S1 is the whole point.
So the restructure has one job and one trap: cut cost and lift S2, without
spending S3/S4/S5 to do it. A later run that improves S1 while dropping S5 below
6/6 is a regression even if every other number improves.
