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

Rows 8–9 are the first marked `Mode: A` rather than `A0`. Rows 2–7 built Plan A
and so could not retrieve through it; row 8 is the first task that did — it routed
`resolvePlacementOrigin`, the settle mirrors and the Balance Simulator columns
through `map/backend.md` and the domain docs without a repo-wide search. Mode `B`
starts with the first task after row 9, since the skills exist but were not used
to build themselves.

Both carry no `R-est`, for a reason worth recording rather than hiding: **the
session resumed mid-flight from a context compaction, so the "before reading
anything" moment had already passed.** The append rule silently assumes a session
boundary is a task boundary. It is not, and a fabricated estimate would be worse
than a blank — the same call rows 1–2 made. If this recurs, the fix is to record
`R-est` at the point the *task* is stated, not the point the session starts.

Row 8's `Hit` is `✓`, and it is the first row where that means something specific.
The strip deletes 653 comments, many of them load-bearing "why" prose, so the pass
opened by auditing every one against the docs before removing any. The docs already
held them — the mirror hazards, the `Number(null)` trap, the Balance Simulator
columns, the supply lerp — and in two cases stated them **better** than the comment
did: `ui.md` names the tutorial's actual numeric divergence where the source
comment only warned that one was possible. That is the restructure's own claim,
tested from the opposite direction: Phases 2–3b said the docs could carry this
load, and Phase 4 is what happens if they cannot.

The prediction it did settle: `map/backend.md` carried all 266 authored `Does`
lines across a strip that moved nearly every line number in the file, at zero
re-authoring cost. Carry-forward by `file#symbol` works.

Two things Phase 4 found that the plan did not anticipate. The **−560 estimate was
scoped to `src/Server/app` and `Cor/**` only**; adding `src/Server/tools` (90 lines
across the two balance CLIs) reconciles it to 645 whole lines + 8 trailing. And the
plan's refactor-gate list is **already stale** — it names six files over 600 lines
at pre-strip counts and misses two K3s workflows at 621 and 612. The role skills
therefore point the gate at the map's `### <path> — NNN ln` header, which
regenerates on every edit, rather than carrying six copies of a list that rots.

Row 10 is the after-Phase-5 probe and it is the row this whole log exists to make
legible: **the restructure did not reduce retrieval cost.** 16,332 against a 13,700
baseline, with S1 missing its target by roughly 6× and S2 flat at 4/6. S3, S4 and
S5 all hold — nothing was traded away for speed, every answer landed, no doc
contradicted source — so the failure is specifically and only the cost claim. Full
scoring and post-hoc analysis in [retrieval-probes.md](./retrieval-probes.md).

Three things that row establishes, none of which were visible before it ran. **The
three-hop contract works when followed and nothing makes anyone follow it** — five
of six questions averaged 1,780 tokens while the sixth loaded two docs whole and
spent 7,429, which is 43% of the run. **The ≤2,740 target was arithmetically
unreachable**: six questions each ending in a real source read cost ~1,700 apiece
however good the KB is. And **the probe protocol favours the KB being replaced** —
rule 3's fixed order let the baseline amortise three big doc loads across six
questions and answer the last two for zero, which is the one workload where
front-loading wins. Real sessions ask one question.

Row 11 is the first row in the log with a real `R-est` recorded before the reads
since row 7, and it ran 2× *over* estimate in the cheap direction — ~3,000
predicted, ~1,500 actual. Small tasks are being over-estimated, which is the
harmless direction but still a bias worth watching as the cycle fills, because it
is the same bias that would push a borderline task toward delegation it does not
need.

Row 12 scores the six cold solo sessions. `R-est` is blank for the third time, and
the reason is the one row 8 already named: the user's message *arrived carrying the
data*, so reading began in the same breath as the task statement and the
"before reading anything" moment never existed as a separate instant. Three blanks
in twelve rows is now a pattern rather than an accident, and the pattern is that the
append rule assumes a task starts with a pause. Fix it at the next cycle rollup, not
by back-filling here.

Its own cost is small — ~3,000 read — because it is the first task in the log to
route entirely through the map and a targeted `Get-ChildItem`, opening no source
file at all. What it *found* is in
[retrieval-probes.md](./retrieval-probes.md); the part that belongs in this log is
that **the token column of both files is a lower bound, not a measurement.** Six
sessions reported the same `index.md` at six sizes, all 36–47% under its true 5,176
bytes. Every `Tot` in this table is self-reported the same way. Ratios between rows
survive that bias; absolute figures do not, and no decision should rest on one.

Row 13's `R-est` is blank for the fourth time, and **this one is not the append
rule's fault.** Rows 1-2, 8-9 and 12 had structural reasons; here the task arrived
as five numbered instructions with a clear starting line, and the estimate simply
was not written down. Recording that honestly is the point of the column. Four
blanks in thirteen rows means the rule is being followed about 70% of the time,
which is the number the cycle-1 rollup should act on.

Two findings the row exists to carry. **The delegation gate said delegate and the
task ran solo anyway**: it spans code and infra, touches far more than four files,
and read ~36,000 tokens of source — three of the five thresholds. It ran inline
because this session forbids unrequested subagents. It completed correctly, which
is one data point that the ~25,000-token threshold may be set too low; one row is
not enough to move it, but the closed-cycle rollup should look here first.

And **`infra-engineer` never fired** on a task that was 100% infra work. That is
the third independent confirmation, after the 12 probe runs, that role skills are
inert — hop 0 is not reachable in practice, so `index.md` keeps being paid.

The row is `✓` on a specific claim: the 424-row worklist was produced *by grepping
the map itself*, and no repo-wide search happened at any point across 135 files.
The map bootstrapped its own completion.

Three defects the gates caught before anything was written: two rows over the
300-character cap, one row using a banned construction, and one row that tripped
the validator's own counted-claim check by containing the literal phrase it was
describing. **All three were self-inflicted and none reached the file** — the
line cap and the banned list are doing exactly the job they were added for.

Row 14 closes the map layer: **1,407 symbols across three files, zero bare `TODO`**.
The 175 remaining `ui` rows were found by grepping the map, same as row 13 — two
consecutive completions with no repo-wide search between them.

**The skills question, answered as far as it can be from inside a session.** What is
proven: the six skills are registered and invocable — `docs-steward` was called here
and loaded. So inertness is not a config defect, and no amount of file repair would
have shown up as a fix. What is *not* provable from inside a running session: whether
the name-and-description listing was surfaced at session start, since it is not
visible after a compaction. The diagnosis therefore rests on the part that is
inspectable, and that part is enough:

**`CLAUDE.md` hop 0 gated the skills on a condition unknowable at hop 0.** It read
"if one matches the paths you are about to touch" — but on a retrieval task the paths
are the *output* of hops 1-3, not an input to hop 0. By the time a role was decidable,
the routing the skill offers had already been paid for. That is why 12 probe runs and
two authoring tasks all skipped it. Hop 0 now selects on the *kind of work*, which is
known from the request itself, and names all six.

The second half is that the skills advertise **routing**, which `CLAUDE.md` already
states inline, while their non-duplicated value is **policy**. `infra-engineer` is the
proof: it holds "`scripts/` and `.github/` keep their comments", and `CLAUDE.md` said
flatly "No comments in source". `strip-comments.mjs` confirms the skill was right.
**An agent reading only the entry file held a wrong belief about the comment rule**,
and the correction sat in a file nothing ever opened. Fixed at the source.

The audit cut three things that were scratchpad rather than contract: a probe's
token measurements (they live in `retrieval-probes.md`), the `map/ui.md` gap notice
(now false), and the hand-maintained "9 of 20" tally (already stale at 13, and the
rollup line below owns that number). A counted claim in `CLAUDE.md` was also dropped
on purpose — the file sits outside `validate-docs`, so a bare "9 SAFETY EXCEPTION
comments" would rot silently, and **four of those nine live in the K3s workflows
that are scheduled for deletion**.

`R-est` was blank a fifth time, my omission again — 5 of 14 rows, ~64% compliance and
falling. The rule is not working as written and the rollup should treat that as a
finding about the rule, not about any one task.

**The delegation gate said delegate, and the task ran solo again** — code plus docs,
15 files, ~33,000 tokens of source: three of five thresholds, the same three as row
13. Second consecutive correct completion over the gate's objection. Two data points
now say the ~25,000-token threshold is too low.

Row 15 deletes the K3s stack row 14 anticipated. 85 files, but the widest task in the
log so far is also among the cheapest per file: the maps answered every "who else
references this" question by grep, and no doc contradicted source anywhere in it. The
`Does` column earned its cost here — `resolve-ssh-key` was provably K3s-only from map
rows alone, and `data.tf`'s row already said the ECR repository is shared with EKS and
**not** created by K3s, which is the fact that made the deletion safe to attempt.

The one coupling no map row could have surfaced was `eks-infra-drift-check` hashing
`git rev-parse HEAD:infra/eks/terraform`: editing one stale K3s reference in an EKS
Terraform output would have blocked every EKS deploy until a full Infra Apply. **That
file was deliberately left alone.** A cross-stack guard whose blast radius is "any
edit anywhere in this directory" deserves a louder note than a per-symbol row can
carry; `deployment.md` already states it, which is where it belongs.

`R-est` was blank a sixth time — 5 of 15 rows recorded, ~60% compliance and still
falling. Three rows running, the estimate has been skipped by a different mechanism
than forgetfulness: the task's shape was not knowable until after the first sweep.

**The delegation gate said delegate, and the task ran solo again** — 2 domains, 85
files, ~35,000 tokens of source: three thresholds, third consecutive correct
completion over the gate's objection. The file-count threshold (~4) is now the
worst-calibrated of the five; 85 files of mechanical deletion cost less than 15 files
of diagnosis did in row 14.

Row 16 is `!` for the widest doc/source divergence measured so far, and it is the
argument for this whole table. `site/` had one 15.7 KB README and no validator, so
nothing could fail: it claimed a four-level page with the six skill cards nested
inside the game card, six cards rendering, and three files that no longer exist,
against a source where the cards are a top-level section and four render. The game
KB, which is gated, has produced four `!` rows in fifteen tasks and none of that
size. An ungated doc does not drift more slowly than a gated one — it drifts
silently, and the cost lands on whoever reads it next.

`R-est` was blank a seventh time — 5 of 16 rows, ~31% and falling. The mechanism is
now stable and worth naming: on tasks whose scope is *discovering* what has drifted,
the estimate is not knowable until the first sweep is already paid for.

**The delegation gate said delegate, and the task ran solo again** — 3 domains, 27
files, ~38,000 tokens: three thresholds, fourth consecutive completion over the
gate's objection. The gate has now been wrong four times running and right zero.

Row 17 is the first row where the KB was right and the **request** was wrong. The
brief named an existing "Hire me" button and an existing email route to reuse; the
site had neither. `site/docs/index.md` said so in one line — "no server-side logic,
no bindings" — and two searches confirmed it. `Hit` is `✓` because retrieval did its
job; the cost that mattered was the two subagent sweeps run to be sure a whole
subsystem was absent, which is the one thing a file map cannot prove on its own.
Absence is more expensive to establish than presence, and no budget makes it cheap.

It is also the first row to raise a site budget. deploy.md went 1450 → 1900 because
the site acquired a server route, three secrets and a token-scope caveat that did
not exist when that number was set. The raise is logged in the validator itself, not
just here.

**Rollup (cycle 1, open):** n=17 · median `R-act` ~28,000 · ✓10 ~2 ✗0 !5 · misroute 0%
· 3 rows to close
