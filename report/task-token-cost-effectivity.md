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

`Task` one compact clause naming what changed — ≤120 characters, no session
narrative (root-cause trails, verification steps, "per user's call", "flagged
rather than"). That detail belongs in the commit or PR, not here; this row is
a cost log, not a scratchpad.
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
`Model` model used for the task (e.g. Sonnet 5, Opus 5).
`Effort` reasoning effort level in effect (low/medium/high/xhigh/max).
`Skills` skills loaded during the task, comma-separated.

## Cycle 3 (open)

| # | Task | Cx | Mode | Dom | F | R-est | R-act | Tot | Main | Hit | V | Model | Effort | Skills |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Matchmaking rebuilt to incremental room-fill; lobby persists through leaves/timeouts; ready toggle; disconnect modal | 5 | B | 3 | 13 | — | ~140,000 | ~300,000 | ~300,000 | ✓ | ok | Sonnet 5 | xhigh | — |
| 2 | Demo-build impact audit vs lobby overhaul; ScreenManager skips Public Lobby, auto-readies in demo mode | 3 | B | 3 | 12 | — | ~10,000 | ~45,000 | ~45,000 | ✓ | ok | Sonnet 5 | medium | client-engineer, docs-steward |
| 3 | Supabase auth Phase 1: verified-JWT identity on the reconnect handshake, guest sign-in, flag-gated soft rollout | 4 | B | 5 | 35 | — | ~85,000 | ~420,000 | ~420,000 | ! | ok | Opus 5 | xhigh→max | docs-steward |
| 4 | Supabase auth Phase 2: Google PKCE sign-in on Android and web, vendored Deeplink plugin, still flag-dormant | 4 | B | 4 | 20 | ~60,000 | ~55,000 | ~330,000 | ~330,000 | ✓ | ok | Opus 5 | max | docs-steward |
<!-- next: row 5 -->

## Cycle 2 (closed)

Median `R-act` ~18,500 tok (n=20). `Hit`: 15 ✓ first try, 3 `!` doc contradicted
source, 1 `~` needed a second doc, 1 `✗` fell back to repo search — a 5%
misroute rate (1/20), flat vs cycle 1. All three `!` rows (4, 5, 19) were docs
the code had outrun, caught and fixed in the same task, not a retrieval defect.
One task (11, a JoinScreen visual fix verified only by headless instantiation,
no real render) was flagged `→Bd` — the follow-on tasks (12–17) added a live
X11 screenshot verification loop and ran clean afterward, so the gap closed
within the cycle rather than repeating. `R-est` was logged before reading in
only 6 of 20 tasks — the discipline gap flagged at the end of cycle 1 persisted
through cycle 2 unchanged. Task 19 (`Bd`, Opus 5, xhigh) is the clear outlier
at 230,000 `R-act` / 495,000 `Tot`, a genuinely large two-domain feature;
excluding it the cycle's spread is tight (4,000–65,000). **Verdict:
cost-efficient** — no repeat misroutes, docs self-corrected their own
staleness, delegation was reserved for the one task that warranted it — but
`R-est`-before-read still needs enforcement, not just logging, going into
cycle 3.

| # | Task | Cx | Mode | Dom | F | R-est | R-act | Tot | Main | Hit | V | Model | Effort | Skills |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Sign-in + Home screens built, Join Screen rebuilt, flow rewired | 4 | A | 1 | 13 | — | ~45,000 | ~60,000 | ~60,000 | ✓ | ok | — | — | — |
| 2 | Backjob: stub buttons pressable, pressed-state consistency, SVG pixelation fix | 3 | A | 1 | 6 | ~20,000 | ~19,000 | ~34,000 | ~34,000 | ✓ | ok | — | — | — |
| 3 | Sentinel append policy authored + tested; scanned KB for other append-log candidates (none found) | 2 | A | 1 | 2 | — | ~4,000 | ~9,000 | ~9,000 | ✓ | ok | — | — | — |
| 4 | Android mobile misalignment: `window/stretch/aspect.mobile="keep"` fix + ui.md doc update | 3 | A | 2 | 2 | — | ~18,000 | ~32,000 | ~32,000 | ! | ok | — | — | — |
| 5 | Contact form taken live: readiness debug, Resend 422 traced to a domain in CONTACT_TO, address guard + provider logging, live guardrail probe | 2 | B | 2 | 3 | — | ~6,000 | ~48,000 | ~48,000 | ! | ok | — | — | — |
| 6 | Portfolio "By the numbers" stats: NOC/CI-deploy/cost/test tiles live, demo-completion instrumentation (Redis counters, new HTTP route, build-time fetch) shipped not yet live; both KBs updated, index.md budget raised | 5 | Bd | 4 | 14 | — | ~50,000 | ~268,000 | ~140,000 | ✓ | ok | — | — | — |
| 7 | `DEMO_STATS_API_URL` resolved to `wstoddemo`, daily 00:00 UTC deploy cron added, demo-stat Redis counters made durable (new persistent `backup-redis-up.sh`, wired into instance 3 only) | 4 | B | 2 | 6 | ~15,000 | ~18,000 | ~45,000 | ~45,000 | ✓ | ok | — | — | — |
| 8 | Live-debugged tile stuck at 0/0: `curl`'d prod endpoint, traced to `some(isBot)` vs `every(isBot)` in the bot-exclusion guard — real demo sessions were silently excluded since `wstoddemo` bot-fills every solo visitor | 3 | B | 1 | 3 | ~5,000 | ~7,000 | ~15,000 | ~15,000 | ✓ | ok | — | — | — |
| 9 | Demo tile switched percentage→raw `completed/attempted` (misleading at low N); new `backup-redis-reset-demo-stats.sh` scoped to the two demo keys only, never `FLUSHALL` since that Redis now backs live room/session/queue state too | 3 | B | 2 | 4 | ~3,000 | ~4,000 | ~12,000 | ~12,000 | ✓ | ok | — | — | — |
| 10 | Portfolio deploy split: enportfolio (prod) now manual dispatch + daily cron only, new devenportfolio staging auto-deploys on push via `env.staging` in `wrangler.jsonc`; deploy.md/index.md updated, deploy.md/index.md/total budgets raised with rationale | 3 | A | 2 | 6 | — | ~65,000 | ~110,000 | ~110,000 | ~ | ok | — | — | — |
| 11 | JoinScreen visual bug fix: dropped white "Join Private Server" card, added blue-to-white gradient background, restructured field/spacing to match `guide-only-join-screen.png`; verified by headless scene instantiation (no display server for a real screenshot) | 3 | B | 1 | 1 | — | ~35,000 | ~40,000 | ~40,000 | ✗ | →Bd | — | — | — |
| 12 | JoinScreen fix #1 failed user's browser check (`Join-Screen-Bug.png`): header had a leftover dark panel style, field text had no left padding, Join/Find Match buttons filled full width instead of a narrower centered pill, and the public-match title was white-on-green instead of dark. Root-caused each via pixel measurement against both reference images (not eyeballing), fixed all 4 in scene + theme | 4 | B | 1 | 2 | — | ~55,000 | ~65,000 | ~65,000 | ✓ | ok | — | — | — |
| 13 | `client-engineer` skill gained a real X11 screenshot recipe; used it to actually render JoinScreen in-engine (via a throwaway themed wrapper scene, since launching JoinScreen.tscn standalone skips the theme normally applied by Main.tscn) and confirmed fix #2 visually matches the guide — first real render check instead of static analysis | 2 | B | 1 | 0 | — | ~12,000 | ~20,000 | ~20,000 | ✓ | ok | — | — | — |
| 14 | Green panel gradient built natively: new reusable `VerticalGradientFill.gdshader` (project's first UI shader) tints a borderless inset `Panel` sibling layered under the existing bordered/shadowed `GreenPillPanel` stylebox, preserving StyleBoxFlat's own AA/border/shadow instead of baking a gradient PNG; verified live via the same X11 screenshot rig, border and corner AA confirmed intact | 3 | B | 1 | 1 | — | ~15,000 | ~28,000 | ~28,000 | ✓ | ok | — | — | — |
| 15 | Hover-text-vanishes bug on Join/Find Match buttons: root cause was native `Button.text` being subject to Godot's unset `font_hover_color`/`font_pressed_color` (falls back to the light default theme, invisible on a light hover bg) — HomeScreen/SignInScreen buttons avoid this by using `text=""` + a child `Label` with a fixed color, immune to Button state coloring; matched that pattern. Verified live by scripting a synthetic mouse-hover in a throwaway preview scene and screenshotting mid-hover. Poppins requested for the font but no font asset exists anywhere in the repo (checked site/ too) — flagged to user, not fabricated | 3 | B | 1 | 1 | — | ~20,000 | ~32,000 | ~32,000 | ✓ | ok | — | — | — |
| 16 | Poppins wired app-wide: user dropped the full family into `Cor/Fonts/Poppins/`; set `Theme.default_font` once on the shared `GameUITheme.tres` (single inheritance point via `Main.tscn`) rather than touching every Label. Needed a headless `--import` pass first (fresh `.ttf`s have no `.import` yet, load fails without it) — undocumented gotcha, not obvious from the error text alone. Verified live on both JoinScreen and HomeScreen; project's first font asset, no `build.md` convention exists yet for the asset kind | 2 | B | 1 | 2 | — | ~18,000 | ~30,000 | ~30,000 | ✓ | ok | — | — | — |
| 17 | "Join Server" / "Join public match" titles set bold via per-`Label` `theme_override_fonts/font` pointing at `Poppins-Bold.ttf`, rather than changing the theme-wide default — verified live with a screenshot | 1 | B | 1 | 1 | — | ~6,000 | ~14,000 | ~14,000 | ✓ | ok | — | — | — |
| 18 | docs-steward close-out for the JoinScreen/Poppins session: `ui.md` gained the Poppins fact, a Gradient Fill leaf-component row, and the Button-hover-text landmine; `build.md` gained a Font row + the fresh-font-`.import` landmine. `ui.md` had zero budget headroom pre-existing (already at 5800/5800) — trimmed additions repeatedly, still +157 tok over; flagged rather than silently raising, per user's call raised to 6000 with no inline reason this one time. Also hardened the `docs-steward` skill itself per user feedback: landmines now require a still-live, silent trap (not "a bug got fixed"); docs must read as current mechanism, not a session log; a doc over budget *again* after one raise must be compacted or split, not raised again (checked via `git log` on the budget table) | 4 | B | 2 | 6 | — | ~35,000 | ~58,000 | ~58,000 | ✓ | ok | — | — | — |
| 19 | Public Lobby ready-up stage added between matchmaking and match start; Find Match rebuilt onto guide art | 5 | Bd | 2 | 19 | — | ~230,000 | ~495,000 | ~195,000 | ! | ok | Opus 5 | xhigh | client-engineer, fullstack-coordinator, docs-steward |
| 20 | ui.md/map-ui.md split by concept into screens/HUD/debug/tutorial docs; fixed carry-forward + STRIP_AREAS generator bugs | 4 | A | 1 | 15 | — | ~22,000 | ~48,000 | ~48,000 | ✓ | ok | Sonnet 5 | medium | docs-steward |

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
