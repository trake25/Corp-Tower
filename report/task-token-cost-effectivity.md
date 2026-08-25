# Task token cost & effectivity

<!-- GENERATED FILE. Source: report/task-records.jsonl and report/task-cycle-reviews.jsonl. Run node scripts/task-report.mjs render. -->

This report is generated from structured task records. Historical records retain
their legacy source and warnings; unavailable measurements are not guessed.

## Definitions

The table uses R-est for the intake estimate, R-act for source-read tokens, Tot for all observed tokens, and Main for main-thread tokens. A tilde marks an estimated measurement.

| Retrieval result | Definition |
|---|---|
| ✓ | first-try |
| ~ | second-document |
| ✗ | repository-fallback |
| ! | doc-source-conflict |

Model is the exact implementing runtime variant for standard records. Legacy rows show their preserved label and are excluded from exact-variant coverage.

## Cycle 6 (open)

Current cycle: 17 recorded row(s); next row is 18.

| # | Task | Cx | Mode | Dom | F | R-est | R-act | Tot | Main | Hit | V | Model | Effort | Skills |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Implement manifest-driven automated task close-out | 4 | A | 1 | 5 | late estimate ~12,000 | ~18,000 | ~42,000 | ~42,000 | ✓ | ok | gpt-5 (variant unrecorded) | medium | qa-engineer,docs-steward,update-docs |
| 2 | Implement bounded portable context retrieval protocol | 5 | A | 1 | 10 | late estimate ~18,000 | ~25,000 | ~52,000 | ~52,000 | ✓ | ok | gpt-5 (variant unrecorded) | medium | docs-steward,qa-engineer,update-docs |
| 3 | Split conditional client visual specs from default skill | 3 | A | 2 | 9 | late estimate ~5,000 | ~8,000 | ~18,000 | ~18,000 | ! | ok | gpt-5 (variant unrecorded) | medium | client-engineer,skill-creator,qa-engineer,docs-steward |
| 4 | Automate documentation scope in task manifest | 3 | A | 2 | 6 | late estimate ~4,000 | ~6,000 | ~15,000 | ~15,000 | ! | ok | gpt-5 (variant unrecorded) | medium | client-engineer,skill-creator,qa-engineer,docs-steward,update-docs |
| 5 | Consolidate skill intake and close-out contracts | 4 | A | 3 | 22 | late estimate ~9,000 | ~13,000 | ~32,000 | ~32,000 | ! | ok | gpt-5 (variant unrecorded) | medium | skill-creator,infra-engineer,docs-steward,update-docs |
| 6 | Deduplicate documentation validation CI gate | 2 | A | 2 | 2 | late estimate ~3,500 | ~5,000 | ~12,000 | ~12,000 | ! | ok | gpt-5 (variant unrecorded) | medium | infra-engineer,docs-steward,update-docs |
| 7 | Guard balance sampling against constrained hosts | 4 | A | 2 | 6 | late estimate ~10,000 | ~24,000 | ~55,000 | ~55,000 | ! | ok | gpt-5 (variant unrecorded) | medium | qa-engineer,docs-steward,update-docs |
| 8 | Route task report retrieval through automation context | 2 | A | 1 | 3 | late estimate ~2,000 | ~5,000 | ~13,000 | ~13,000 | ! | ok | gpt-5 (variant unrecorded) | medium | infra-engineer,docs-steward,update-docs |
| 9 | Align placement with structural pose and contain tower tilt | 3 | B | 2 | 22 | ~8,000 | ~34,000 | ~57,000 | ~47,000 | ! | ok | variant unrecorded | high | fullstack-coordinator,server-engineer,client-engineer,qa-engineer,docs-steward,update-docs |
| 10 | Show remaining failures and terminal Home countdown in level summary | 3 | A | 1 | 7 | late estimate ~7,000 | ~20,000 | ~34,000 | ~34,000 | ~ | ok | gpt-5 (variant unrecorded) | medium | client-engineer,docs-steward,update-docs |
| 11 | Add debug Last Chance collapse rescue | 4 | B | 3 | 17 | late estimate ~6,000 | ~17,000 | ~27,000 | ~27,000 | ~ | ok | gpt-5 (variant unrecorded) | medium | fullstack-coordinator,server-engineer,client-engineer,qa-engineer,docs-steward,update-docs |
| 12 | Add guarded Git sync commit push automation | 2 | implementation | 3 | 4 | ~1,800 | 1,800 | 5,000 | 3,200 | ✓ | pass | gpt-5-codex | moderate | infra-engineer,docs-steward |
| 13 | Make Git automation infer task scope and keywords | 2 | implementation | 3 | 4 | ~900 | 900 | 3,000 | 2,200 | ✓ | pass | gpt-5-codex | moderate | infra-engineer,docs-steward |
| 14 | Add main branch safety to Git automation | 2 | implementation | 3 | 4 | ~1,200 | 1,200 | 3,500 | 2,600 | ✓ | pass | gpt-5-codex | moderate | infra-engineer,docs-steward |
| 15 | Add push-only backup branch mode | 2 | implementation | 3 | 4 | ~700 | 700 | 2,800 | 2,100 | ✓ | pass | gpt-5-codex | moderate | infra-engineer,docs-steward |
| 16 | Relocate machine task automation state | 3 | implementation | 3 | 8 | ~2,200 | 2,200 | 6,200 | 4,300 | ✓ | pass | gpt-5-codex | high | infra-engineer,docs-steward |
| 17 | Route completed plans to plan done | 1 | policy | 3 | 3 | ~700 | 700 | 1,800 | 1,400 | ✓ | pass | gpt-5-codex | low | docs-steward |
<!-- next: row 18 -->

## Cycle 5 (closed)

This cycle's improvement is more disciplined task close-out and context retrieval planning. The remaining regression risk is treating green automation as proof of semantic correctness. The main flaw is that prior helpers are separate and require repeated agent orchestration. Recommendation: ship the manifest and JSON retrieval layers with fixtures before adding a remote service or embeddings.

Factual rollup: 10/20 first-try retrievals, 6/20 documentation conflicts, 8/20 pre-read estimates, and estimated total-token median 32500.

| # | Task | Cx | Mode | Dom | F | R-est | R-act | Tot | Main | Hit | V | Model | Effort | Skills |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Restore session startup and center Android Play canvas | 2 | B | 2 | 4 | ~2,000 | ~3,500 | ~8,000 | ~8,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | client-engineer,qa-engineer,docs-steward |
| 2 | Make Android CI select its embedded WebSocket target | 2 | A | 2 | 4 | ~5,000 | ~10,000 | ~16,000 | ~16,000 | ! | ok | gpt-5 (variant unrecorded) | medium | infra-engineer,qa-engineer,docs-steward,update-docs |
| 3 | Enable browser social sign-in for backup dev web builds | 3 | A | 3 | 5 | ~8,000 | ~13,000 | ~21,000 | ~21,000 | ! | ok | gpt-5 (variant unrecorded) | medium | fullstack-coordinator,server-engineer,client-engineer,infra-engineer,qa-engineer,docs-steward,update-docs |
| 4 | Implement Play screen Art v7 migration and glass HUD refresh | 5 | B | 1 | 27 | ~80,000 | ~90,000 | ~135,000 | ~135,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | client-engineer,qa-engineer,docs-steward,update-docs |
| 5 | Fix Android Play alignment, Impact fill, power toast and parallax seam | 3 | B | 1 | 16 | ~15,000 | ~28,000 | ~40,000 | ~40,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | client-engineer,qa-engineer,docs-steward,update-docs |
| 6 | Fix Play overlay layers, Android width scaling and post-update startup gap | 3 | B | 2 | 17 | ~18,000 | ~24,000 | ~35,000 | ~35,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | client-engineer,qa-engineer,docs-steward,update-docs |
| 7 | Preserve Android Play aspect and tighten Impact bar layout | 3 | B | 1 | 12 | late estimate ~8,000 | ~15,000 | ~28,000 | ~28,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | client-engineer,qa-engineer,docs-steward,update-docs |
| 8 | Keep Hook Zoom platform grounded and tower attached | 3 | B | 1 | 8 | late estimate ~6,000 | ~12,000 | ~24,000 | ~24,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | client-engineer,qa-engineer,docs-steward,update-docs |
| 9 | Align covered Android Play background ground with platform | 3 | B | 1 | 7 | late estimate ~5,000 | ~14,000 | ~28,000 | ~28,000 | ~ | ok | gpt-5 (variant unrecorded) | high | client-engineer,qa-engineer,docs-steward,update-docs |
| 10 | Finalize Tower Stability, Scoring, and Impact redesign implementation plans | 5 | B | 4 | 3 | late estimate ~30,000 | ~55,000 | ~90,000 | ~90,000 | ~ | ok | gpt-5 (variant unrecorded) | high | server-engineer,fullstack-coordinator,client-engineer,qa-engineer,docs-steward |
| 11 | Implement graph-based tower stability and structural poses | 5 | B | 5 | 26 | late estimate ~55,000 | ~78,000 | ~125,000 | ~125,000 | ~ | ok | gpt-5 (variant unrecorded) | high | server-engineer,fullstack-coordinator,client-engineer,qa-engineer,docs-steward,update-docs |
| 12 | Retune tower stability dial and rigid structural pose | 5 | B | 3 | 16 | ~18,000 | ~55,000 | ~95,000 | ~95,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | fullstack,server,client,qa,docs |
| 13 | Set tower stability and site width defaults | 1 | B | 3 | 2 | late estimate ~1,000 | ~4,000 | ~7,000 | ~7,000 | ✓ | ok | gpt-5 (variant unrecorded) | medium | server-engineer,qa-engineer,docs-steward,update-docs |
| 14 | Implement unified structural scoring transactions | 5 | B | 3 | 27 | ~80,000 | ~96,000 | ~160,000 | ~120,000 | ✓ | ok | GPT-5 variant unrecorded | high | fullstack-coordinator,server-engineer,client-engineer,qa-engineer,docs-steward,update-docs |
| 15 | Align Debug Scoring controls with player payout table | 4 | B | 3 | 11 | late estimate ~18,000 | ~38,000 | ~55,000 | ~45,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | fullstack-coordinator,server-engineer,client-engineer,qa-engineer,docs-steward,update-docs |
| 16 | Implement server Impact contribution, retry, terminal cleanup, and balance probe | 5 | B | 3 | 19 | late estimate ~25,000 | ~42,000 | ~72,000 | ~72,000 | ! | ok | gpt-5 (variant unrecorded) | high | fullstack-coordinator,server-engineer,client-engineer,qa-engineer,docs-steward,update-docs |
| 17 | Sync Impact bars to authoritative contribution and raise default share | 2 | B | 3 | 5 | late estimate ~4,000 | ~10,000 | ~18,000 | ~18,000 | ! | ok | gpt-5 (variant unrecorded) | high | fullstack-coordinator,server-engineer,client-engineer,qa-engineer,docs-steward,update-docs |
| 18 | Route terminal Impact closes Home and suppress duplicate checkpoint summaries | 3 | B | 3 | 7 | late estimate ~8,000 | ~17,000 | ~30,000 | ~30,000 | ! | ok | gpt-5 (variant unrecorded) | high | fullstack-coordinator,server-engineer,client-engineer,qa-engineer,docs-steward,update-docs |
| 19 | Repair terminal matchmaking reconnect and Impact banking | 3 | B | 3 | 8 | late estimate ~6,000 | ~13,000 | ~43,000 | ~43,000 | ! | ok | gpt-5 (variant unrecorded) | high | fullstack-coordinator,server-engineer,client-engineer,qa-engineer,docs-steward,update-docs |
| 20 | Create QA/docs/report automation and portable retrieval plans | 3 | A | 1 | 4 | late estimate ~8,000 | ~12,000 | ~24,000 | ~24,000 | ~ | ok | gpt-5 (variant unrecorded) | medium | docs-steward,qa-engineer |

## Cycle 4 (closed)

Cycle 4 improved client screen fidelity and Android launch behavior while keeping retrieval correct through role skills, file-map regeneration, and targeted QA. The main regression risk was changing immersive mode globally, which the build notes exposed as a splash crop flaw; the fix restores immersive mode and requests runtime system bars instead. A remaining process flaw is that visual Android-device validation is not available in this environment. Recommendation: keep the immersive splash setting protected by the build note and validate the runtime bar transition on a physical Android device before release.

Factual rollup: 16/20 first-try retrievals, 0/20 documentation conflicts, 6/20 pre-read estimates, and estimated total-token median 21500.

| # | Task | Cx | Mode | Dom | F | R-est | R-act | Tot | Main | Hit | V | Model | Effort | Skills |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Durable Facebook player accounts with HMAC identity links, browser fallback, and native debug toggle | 5 | B | 4 | 29 | ~20,000 | ~30,000 | ~85,000 | ~85,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | fullstack-coordinator,server-engineer,client-engineer,infra-engineer,qa-engineer,docs-steward,update-docs |
| 2 | Keep debug bot toggles in the lobby and reset readiness on roster changes | 2 | A | 2 | 4 | ~3,000 | ~9,000 | ~16,000 | ~16,000 | ✓ | ok | variant unrecorded | medium | client-engineer,fullstack-coordinator,server-engineer,qa-engineer,docs-steward,update-docs |
| 3 | Reset native sign-in debug toggles per app reload and accept compatible Supabase Facebook identity IDs | 3 | B | 3 | 8 | ~8,000 | ~13,000 | ~38,000 | ~38,000 | ~ | ok | gpt-5 (variant unrecorded) | high | fullstack-coordinator,server-engineer,client-engineer,qa-engineer,docs-steward,update-docs |
| 4 | Remove OAuth diagnostic alerts and preserve web PKCE verifier across provider redirect reloads | 3 | B | 2 | 6 | ~7,000 | ~11,000 | ~32,000 | ~32,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | client-engineer,qa-engineer,docs-steward,update-docs |
| 5 | Remove hidden legacy HUD wiring and expose connection, session, objective, Impact, and inventory state | 4 | B | 3 | 13 | late estimate ~18,000 | ~25,000 | ~55,000 | ~55,000 | ~ | ok | gpt-5 (variant unrecorded) | high | client-engineer,qa-engineer,docs-steward,update-docs |
| 6 | Guard X11 visual verification with approved host access and window-only capture | 2 | B | 1 | 4 | late estimate ~4,000 | ~8,000 | ~15,000 | ~15,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | skill-creator |
| 7 | Remove reintroduced session and inventory HUD text; gate numeric stability meter behind debug feedback modes | 3 | B | 3 | 9 | late estimate ~8,000 | ~14,000 | ~28,000 | ~28,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | client-engineer,qa-engineer,docs-steward |
| 8 | Remove expandable Impact readiness panel while retaining the player bars | 2 | B | 3 | 5 | late estimate ~5,000 | ~9,000 | ~17,000 | ~17,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | client-engineer,qa-engineer,docs-steward |
| 9 | Remove redundant inventory card metadata and revise the UI art handoff checklist | 2 | B | 3 | 5 | late estimate ~6,000 | ~11,000 | ~21,000 | ~21,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | client-engineer,qa-engineer,docs-steward |
| 10 | Add repository-wide skill reuse and reload-reason guardrail | 1 | B | 1 | 1 | late estimate ~1,000 | ~2,000 | ~4,000 | ~4,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | none |
| 11 | Automate canonical skill mirroring with a path-aware pre-commit hook | 2 | B | 2 | 5 | ~6,000 | ~13,000 | ~22,000 | ~22,000 | ✓ | ok | gpt-5.6 (variant unrecorded) | medium | infra-engineer,qa-engineer,docs-steward |
| 12 | Add compact path-based QA gate for task-owned source changes | 3 | B | 2 | 6 | ~6,000 | ~18,000 | ~32,000 | ~32,000 | ✓ | ok | gpt-5.6 (variant unrecorded) | medium | qa-engineer,infra-engineer,docs-steward |
| 13 | Restore player score rail and Impact progress rendering | 1 | B | 1 | 1 | late estimate ~1,000 | ~1,200 | ~3,000 | ~3,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | client-engineer,qa-engineer,docs-steward |
| 14 | Restrict Top indicator copy and remove c07 UI remnants | 2 | B | 1 | 5 | late estimate ~1,500 | ~2,400 | ~5,000 | ~5,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | client-engineer,qa-engineer,docs-steward,update-docs |
| 15 | Cover tutorial and demo HUD routes for legacy UI fixes | 1 | B | 1 | 2 | late estimate ~800 | ~1,500 | ~3,000 | ~3,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | client-engineer,qa-engineer,docs-steward |
| 16 | Restore Top indicator height counts and audit hidden legacy HUD | 2 | B | 1 | 4 | late estimate ~1,500 | ~2,500 | ~5,500 | ~5,500 | ✓ | ok | gpt-5 (variant unrecorded) | high | client-engineer,qa-engineer,docs-steward |
| 17 | Decompose server/client ownership, compose GameUI subscenes, and split deployment routing | 5 | B | 4 | 40 | late estimate ~25,000 | ~55,000 | ~120,000 | ~120,000 | ✓ | ok | gpt-5.6-sol | high | fullstack-coordinator,server-engineer,client-engineer,qa-engineer,docs-steward,update-docs |
| 18 | Refresh PNG UI art and screen layouts for Sign-in, Home, Join, Match, Lobby, and reusable Loader | 3 | B | 2 | 12 | late estimate ~12,000 | ~22,000 | ~42,000 | ~42,000 | ~ | ok | gpt-5 (variant unrecorded) | high | client-engineer,qa-engineer,docs-steward |
| 19 | Correct Android status bar and guide-aligned Sign-in, Home, Join, and Find Match layouts | 3 | B | 2 | 9 | late estimate ~7,000 | ~12,000 | ~23,000 | ~23,000 | ✓ | ok | gpt-5 (variant unrecorded) | high | client-engineer,fullstack-coordinator,qa-engineer,docs-steward |
| 20 | Preserve immersive splash while restoring Android system bars after runtime startup | 2 | B | 2 | 5 | late estimate ~3,000 | ~6,000 | ~12,000 | ~12,000 | ~ | ok | gpt-5 (variant unrecorded) | high | client-engineer,fullstack-coordinator,qa-engineer,docs-steward |

## Cycle 3 (closed)

Improvement: the cycle completed a broad mix of client, server, auth, infrastructure, and documentation tasks with role-specific retrieval usually finding the correct local context. Regression: several tasks still incurred high total token cost for narrow fixes, especially when validation or cross-domain inspection expanded. Flaw: historical entries have incomplete pre-read estimates and mixed model metadata, so cost comparisons remain directional. Recommendation: record the retrieval estimate before the first read, keep implementation scope matched to the owning role, and retain targeted smoke and GUT gates for client changes.

Factual rollup: 18/20 first-try retrievals, 2/20 documentation conflicts, 9/20 pre-read estimates, and estimated total-token median 60000.

| # | Task | Cx | Mode | Dom | F | R-est | R-act | Tot | Main | Hit | V | Model | Effort | Skills |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Matchmaking rebuilt to incremental room-fill; lobby persists through leaves/timeouts; ready toggle; disconnect modal | 5 | B | 3 | 13 | — | ~140,000 | ~300,000 | ~300,000 | ✓ | ok | Sonnet 5 | xhigh | — |
| 2 | Demo-build impact audit vs lobby overhaul; ScreenManager skips Public Lobby, auto-readies in demo mode | 3 | B | 3 | 12 | — | ~10,000 | ~45,000 | ~45,000 | ✓ | ok | Sonnet 5 | medium | client-engineer,docs-steward |
| 3 | Supabase auth Phase 1: verified-JWT identity on the reconnect handshake, guest sign-in, flag-gated soft rollout | 4 | B | 5 | 35 | — | ~85,000 | ~420,000 | ~420,000 | ! | ok | Opus 5 | xhigh→max | docs-steward |
| 4 | Supabase auth Phase 2: Google PKCE sign-in on Android and web, vendored Deeplink plugin, still flag-dormant | 4 | B | 4 | 20 | ~60,000 | ~55,000 | ~330,000 | ~330,000 | ✓ | ok | Opus 5 | max | docs-steward |
| 5 | Supabase auth Phase 3: `profiles` table + RLS, PostgREST profile store behind the service_role key | 3 | B | 3 | 12 | ~25,000 | ~30,000 | ~180,000 | ~180,000 | ! | ok | Opus 5 | max | docs-steward |
| 6 | Android package rename `corptower`→`tod`: export preset, deploy workflow, OAuth redirect scheme, debug_ui dispatch input, docs | 2 | B | 3 | 8 | ~15,000 | ~14,000 | ~60,000 | ~60,000 | ✓ | ok | Sonnet 5 | medium | infra-engineer,client-engineer |
| 7 | Android splash crop + screen-fill fixed: `boot_splash` stretch_mode, `window/stretch/aspect.mobile`=expand, doc updated | 3 | B | 2 | 2 | — | ~12,000 | ~220,000 | ~220,000 | ✓ | ok | Sonnet 5 | medium | client-engineer |
| 8 | Android boot_splash still cropped post-fix: traced engine source, Keep→Keep Height (mode 3); web mobile letterbox diagnosed, deferred | 3 | B | 1 | 1 | — | ~8,000 | ~140,000 | ~140,000 | ✓ | ok | Sonnet 5 | medium | client-engineer |
| 9 | Diagnosed splash.png rounded-corner alpha defect + margin math; patched locally (unpublished, gitignored art), stretch_mode.mobile back to Cover | 3 | B | 1 | 2 | — | ~15,000 | ~160,000 | ~160,000 | ✓ | ok | Sonnet 5 | medium | client-engineer |
| 10 | Splash crop root cause found via git archaeology: `screen/immersive_mode` flipped true→false in the splash commit; restored, build.md landmine added | 2 | A | 1 | 2 | ~10,000 | ~9,000 | ~55,000 | ~55,000 | ✓ | ok | Opus 5 | xhigh | infra-engineer,docs-steward |
| 11 | Detailed Facebook manual setup guide and repository implementation plan saved | 3 | A | 3 | 2 | ~18,000 | ~18,000 | ~18,000 | ~18,000 | ✓ | ok | Opus 5 | high | — |
| 12 | Updated Facebook plans for current Meta Quickstart UI and clarified configuration destinations | 2 | A | 3 | 2 | ~10,000 | ~8,000 | ~8,000 | ~8,000 | ✓ | ok | Opus 5 | high | — |
| 13 | Facebook repo integration: native Android plugin, Supabase token exchange, CI config, tests and docs | 4 | A | 3 | 17 | ~30,000 | ~32,000 | ~70,000 | ~70,000 | ✓ | ok | Opus 5 | high | — |
| 14 | Native Facebook access-token verification bridge, profile UUID mapping, deploy secret wiring and tests | 5 | A | 4 | 17 | — | ~26,000 | ~58,000 | ~58,000 | ✓ | ok | gpt-5.6-terra | high | — |
| 15 | Restored Facebook native callback compatibility and bounded missing callback state | 3 | A | 2 | 5 | — | ~8,000 | ~20,000 | ~20,000 | ✓ | ok | gpt-5.6-terra | high | — |
| 16 | Documented provider display-name fallbacks and replaced stale Facebook OIDC guidance | 2 | A | 2 | 4 | — | ~6,000 | ~15,000 | ~15,000 | ✓ | ok | gpt-5.6-terra | medium | — |
| 17 | Targeted QA gate: cross-platform root Godot policy, compact selection matrix, 53-case server suite split, CI coverage preserved | 4 | A | 2 | 10 | ~25,000 | ~24,000 | ~50,000 | ~50,000 | ✓ | ok | gpt-5.6-sol | high | qa-engineer,docs-steward |
| 18 | Saved approved persistent Facebook identity repository plan and manual runbook | 1 | A | 0 | 2 | — | ~1,000 | ~3,000 | ~3,000 | ✓ | ok | gpt-5.6-terra | low | — |
| 19 | Universal agent/RAG migration: canonical skills, bounded routing, hard validators, budgets and analytics | 5 | B | 3 | 50 | — | ~65,000 | unavailable | unavailable | ✓ | ok | gpt-5.6-sol | high | skill-creator,openai-docs |
| 20 | Screen-aware debug menu with device-local Android Google browser fallback | 3 | B | 3 | 14 | ~15,000 | ~24,000 | ~95,000 | ~95,000 | ✓ | ok | gpt-5.6 (variant unrecorded) | medium | client-engineer,qa-engineer,docs-steward,update-docs |

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

Factual rollup: 15/20 first-try retrievals, 3/20 documentation conflicts, 4/20 pre-read estimates, and estimated total-token median 37000.

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
| 19 | Public Lobby ready-up stage added between matchmaking and match start; Find Match rebuilt onto guide art | 5 | Bd | 2 | 19 | — | ~230,000 | ~495,000 | ~195,000 | ! | ok | Opus 5 | xhigh | client-engineer,fullstack-coordinator,docs-steward |
| 20 | ui.md/map-ui.md split by concept into screens/HUD/debug/tutorial docs; fixed carry-forward + STRIP_AREAS generator bugs | 4 | A | 1 | 15 | — | ~22,000 | ~48,000 | ~48,000 | ✓ | ok | Sonnet 5 | medium | docs-steward |
