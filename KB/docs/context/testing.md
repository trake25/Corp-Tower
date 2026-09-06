# Testing

Scope: permanent server/client/automation coverage, deterministic local selection, balance tools, and release gates. Product behavior remains in its owning domain docs.

<!-- kb
id: testing.selection.local
alias: qa-gate
alias: targeted QA
source: scripts/qa-gate.mjs#selectQa
-->
## Local QA selection

When executable QA is enabled for the task, `qa-gate` selects verification from explicit task-owned paths rather than the dirty tree. A changed test runs itself; shared or unmapped runtime code can widen to the affected domain.
Server checks include syntax plus mapped Node tests, client checks include host-matching Godot smoke and mapped GUT, and infra/docs/site-only work does not inherit game suites without runtime risk.

When executable QA is disabled, task-close does not run those selected regression suites solely for closure. Required ownership, patch integrity, and task-triggered KB/generated consistency remain separate from optional executable QA.

<!-- kb
id: testing.server.coverage
alias: Node tests
alias: server tests
source: src/Server/tests/Gameplay_Events.test.js#placement emits one authoritative score transaction and contribution
-->
## Server coverage

Permanent server coverage protects placement/geometry, stability/scoring invariants, authoritative events, Impact rollback, identity/profile boundaries, and multi-pod room lifecycle. Preview and award must agree; exact event-set tests isolate unrelated warning behavior. Test fixtures pin QA configuration instead of inheriting production calibration accidentally.

<!-- kb
id: testing.server.reconnect
alias: reconnect tests
source: src/Server/tests/Matchmaking_Queue.test.js#a resumed connection keeps its room socket when the superseded socket closes
adjacent: network.session.recovery
-->
## Reconnect coverage

Reconnect regression coverage protects superseded-socket behavior and targeted recovery snapshots that do not consume transient events. Broader gateway/cross-pod recovery remains an integration gap until dedicated coverage exists.

<!-- kb
id: testing.client.coverage
alias: GUT
alias: client smoke
source: src/Client/App/corp-tower/Tests/CiSmokeTest.gd#check_application_scripts
source: src/Client/App/corp-tower/Tests/Gut/GameUi/test_game_ui_baseline.gd#test_game_state_renders_rail_and_top_bar
source: scripts/qa-gate.mjs#main
-->
## Godot coverage

The deterministic QA path selects the repository/host-matching Godot executable.
Client smoke is the application/script correctness gate: it loads runtime
scripts, main scene, autoloads, and required gameplay bindings rather than
treating a single-file check as equivalent. GUT protects placement mirrors,
inventory/block behavior, deterministic collapse/pose logic, authentication,
tutorial progression, gameplay rendering, and meaningful UI structure.

<!-- kb
id: testing.client.rendered
alias: rendered QA
alias: manual visual QA
source: src/Client/App/corp-tower/Tests/CiSmokeTest.gd#check_main_scene_ready
source: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd#_begin_collapse
source: scripts/rendered-client-verify.mjs#runRenderedVerification
source: scripts/qa-gate.mjs#selectGodotBinary
adjacent: hud.constraint.rendered-verification
adjacent: ui.constraint.rendered-verification
-->
## Rendered client verification

Headless tests establish structure and deterministic behavior but cannot prove
final visual fidelity, touch pairing, or Tower Stack frame behavior. Rendered
verification supplements that correctness gate for drag state, collapse framing,
responsive layout, native provider flows, and other device-specific
presentation. When selected and authorized, its helper launches only the
task-owned repository application with the QA-selected Godot executable, accepts
one exact-PID window with valid bounds, captures only that rectangle under a
task-specific `/tmp` directory, and terminates only the retained PID. Missing
display access, ambiguous ownership, or invalid bounds fails closed. It uses
only inherited display authorization, never changes X-server access, and
filters window lookup to the task PID before parsing or retaining results;
visual judgment remains with the LLM.

<!-- kb
id: testing.client.snapgrid-isolation
alias: SnapGrid shared state
alias: placeable range test isolation
source: src/Client/App/corp-tower/Cor/Scripts/GameUi/SnapGrid.gd#reset_placeable_range
source: src/Client/App/corp-tower/Tests/Gut/GameUi/test_snap_grid.gd#before_each
-->
## SnapGrid shared-state isolation

SnapGrid's placeable range is shared mutable state. A test that changes it must
restore or reset it so later tests start from the default range rather than
inheriting another test's level-specific span.

<!-- kb
id: testing.balance.tools
alias: balance simulator
alias: stability probe
alias: impact probe
source: src/Server/tools/Balance_Run.js#planRun
source: src/Server/tools/Balance_Simulator.js#simulateSmartPlay
source: src/Server/tools/Stability_Probe.js#run
source: src/Server/tools/Impact_Balance_Probe.js#runImpactProbe
adjacent: gameplay.bots.calibration
-->
## Balance tools

Balance Simulator, Stability Probe, and Impact Probe are tuning instruments rather than pass/fail authorities. Host-aware wrappers control resource/time budgets and temporary output. The simulator uses the real engine/bot path; bot rejection of collapse makes bot collapse rate a poor stability calibration signal.

<!-- kb
id: testing.automation.protocol
alias: automation tests
alias: retrieval benchmark
source: scripts/tests/context-query.test.mjs#automation scope selects the protocol suite and retrieval benchmark
source: scripts/tests/task-ownership.test.mjs#lightweight task ownership acquires explicit scope, rejects active overlap, and releases independently
source: scripts/tests/plan-archive.test.mjs#standalone plan archival is collision-safe and idempotent without task-close
source: scripts/tests/orchestration-scope.test.mjs#parallel worker ownership rejects overlapping write claims
source: scripts/tests/policy-routing.test.mjs#universal policy excludes optional process routing
source: scripts/tests/concept-kb.test.mjs#the repository concept registry is complete, deterministic, and source-grounded
source: scripts/benchmark-rag.mjs#runConceptBenchmark
source: scripts/lib/kb-calibration.mjs#measureKbCalibration
source: scripts/export-kb-calibration-report.mjs#exportKbCalibrationReport
source: scripts/tests/codex-observability-hook.test.mjs#production hook smoke keeps observability fail-open and private
source: scripts/tests/codex-task-run.test.mjs#telemetry-enabled launcher establishes an opt-in binding that settles without task-close
source: scripts/tests/task-receipt.test.mjs#standalone receipt writes only explicit sanitized scope and states skipped QA
source: scripts/qa-gate.mjs#selectToolingQa
source: scripts/fixtures/agent-observability/provider-events.json#events
adjacent: automation.retrieval.protocol
adjacent: automation.task-close.lifecycle
adjacent: automation.orchestration.ownership
-->
## Automation protocol coverage

Automation tests protect Planner-to-plan policy isolation, absence of runtime skill routing,
process-control resolution, optional task ownership/task-close, orchestration write exclusion,
explicit publication scope, standalone plan archival, generated KB consistency, bounded
observability, receipt sanitization, and safety gates.

Policy-routing coverage proves `AGENTS.md` contains only universal execution rules, default-OFF
optional processes are not universal runtime policy, Planner-side policy sources contain no skill
routing, and the active `.claude/skills/` tree is retired.

Focused lifecycle tests prove lightweight ownership works without close-out, task-close runs only
when selected, telemetry-enabled sessions work without requiring task-close, and default telemetry
dispatches no project hooks. Publication/receipt/archive fixtures prove those mechanics remain
usable without adopting unrelated dirty-tree state.

<!-- kb
id: testing.contract.tutorial-parity
alias: tutorial parity test
source: scripts/tests/tutorial-defaults-parity.test.mjs#tutorial defaults match current authoritative Level 1 behavior
adjacent: tutorial.defaults.parity
-->
## Tutorial parity

Tutorial defaults parity is a focused cross-domain contract test. It validates only derived live Level-1 mirrors and does not turn every tutorial edit into automation-protocol scope.

<!-- kb
id: testing.release.gates
alias: CI gates
alias: release QA
source: .github/workflows/Android-Deploy-wstodplay.yml#build-android
source: .github/workflows/EKS-Deploy-Game-Server.yml#test-server
adjacent: build.android.pipeline
adjacent: deploy.eks.workflows
-->
## Release gates

Android deployment runs client smoke and required GUT before export. EKS server deployment runs the complete Node suite before image build/push. Release gates are broader than ordinary local task QA because they protect the shipping artifact.
