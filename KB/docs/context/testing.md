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

When executable QA is disabled, ordinary completion does not run those selected regression suites solely for closure. Required patch integrity and task-triggered KB/generated consistency remain separate from optional executable QA; valid legacy task-close manifests retain their explicitly selected QA behavior.

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
source: scripts/rendered-client-verify-xvfb.sh#run_virtual_display_verification
source: scripts/ensure-godot-binary.sh#provision_godot_binary
source: scripts/qa-gate.mjs#selectGodotBinary
adjacent: hud.constraint.rendered-verification
adjacent: ui.constraint.rendered-verification
-->
## Rendered client verification

Headless tests establish structure and deterministic behavior but cannot prove
final visual fidelity, touch pairing, or Tower Stack frame behavior. Rendered
verification supplements that correctness gate for drag state, collapse framing,
responsive layout, native provider flows, and other device-specific
presentation. From a Linux SSH or tmux session, run
`scripts/rendered-client-verify-xvfb.sh --authorized`; an inherited graphical
display is reused, otherwise the wrapper owns an isolated Xvfb display plus the
EWMH window manager required for exact `wmctrl` discovery. The application's
standard game window and the isolated virtual screen are both 412×917. Capture
targets the exact window ID rather than desktop coordinates, avoiding window-frame
offsets and removing any need to inflate the virtual desktop.

The wrapper first verifies the ignored root `Godot_v4.7.2-stable_linux.x86_64`
binary and restores that exact checksum-pinned editor from its official release
when absent. Ignored binaries are machine-local dependencies rather than durable
Git contents, so rendered QA never assumes one survived worktree creation or
cleanup. A screen-specific check may add a project-bounded scene such as
`--scene Cor/Scenes/ProfileScreen.tscn`; direct scene launch avoids authentication
or navigation prerequisites that are irrelevant to presentation. The verifier
waits for one exact-PID window, allows a startup settle interval, captures that
window directly under a task-specific `/tmp` directory, and terminates only its
retained process. Ambiguous ownership, invalid bounds, an out-of-project scene,
or an unexpected binary fails closed; visual judgment remains with the LLM.

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

Balance Simulator, Stability Probe, and Impact Probe are tuning instruments rather than pass/fail authorities. Host-aware wrappers control resource/time budgets and temporary output. The simulator uses the same normalized profile-driven Bot Manager path as spectator matches and supports mixed, three-Climber, three-Engineer, three-Opportunist, or custom exact-three lineups. Collapse and completion rates are observations for tuning, not pass thresholds or exact human calibration.

<!-- kb
id: testing.automation.protocol
alias: automation tests
alias: retrieval benchmark
source: scripts/tests/context-query.test.mjs#automation protocol paths remain manual while KB validation stays available
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

Automation protocol tests are retained manual-maintenance proof, not automatically selected
ChatGPT/Codex task QA. A maintainer may invoke a retained test explicitly when changing its
implementation, but ordinary changed-path selection excludes every member of this protocol suite.
Concept-KB validation and calibration remain separately available, and their automatic coverage
contains no automation-protocol test.

The suite protects Planner-to-plan policy isolation, absence of runtime skill routing,
agent-supported process-control resolution, compatibility behavior of standalone lifecycle tools,
parent-coordinated orchestration boundaries, explicit publication scope, standalone plan archival,
generated KB consistency, bounded observability, receipt sanitization, and safety gates.

Focused lifecycle tests preserve manual compatibility contracts: lightweight ownership works without
close-out, task-close remains explicit, and telemetry-enabled sessions do not require task-close.
Publication, receipt, and archive fixtures prove those maintenance mechanics remain usable without
adopting unrelated dirty-tree state.

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

Release gates answer whether a shipping artifact is safe to deploy; they do not
run every retained permanent regression merely because it exists. Android
deployment runs client smoke plus the curated release GUT suite, which protects
durable player journeys and client correctness. EKS game-server deployment runs
syntax/loadability checks plus curated Node cases protecting authoritative
identity, room/session, gameplay, score/state, and persistence contracts;
tutorial-default parity remains its focused cross-domain authority check.

Narrow permanent regressions remain available through targeted QA and the
broader local regression commands. Balance and tuning simulations or probes are
diagnostic instruments, never release pass/fail authorities.
