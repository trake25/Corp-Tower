# Testing

Scope: permanent server/client/automation coverage, deterministic local selection, balance tools, and release gates. Product behavior remains in its owning domain docs.

<!-- kb
id: testing.selection.local
alias: qa-gate
alias: targeted QA
source: scripts/qa-gate.mjs#selectQa
-->
## Local QA selection

`qa-gate` selects verification from explicit task-owned paths rather than the dirty tree. A changed test runs itself; shared or unmapped runtime code can widen to the affected domain. Server checks include syntax plus mapped Node tests, client checks include host-matching Godot smoke and mapped GUT, and infra/docs/site-only work does not inherit game suites without runtime risk.

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
-->
## Godot coverage

Client smoke loads runtime scripts, main scene, autoloads, and required gameplay bindings. GUT protects placement mirrors, inventory/block behavior, deterministic collapse/pose logic, authentication, tutorial progression, gameplay rendering, and meaningful UI structure.

<!-- kb
id: testing.client.rendered
alias: rendered QA
alias: manual visual QA
source: src/Client/App/corp-tower/Tests/CiSmokeTest.gd#check_main_scene_ready
source: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd#_begin_collapse
adjacent: hud.constraint.rendered-verification
adjacent: ui.constraint.rendered-verification
-->
## Rendered client verification

Headless tests establish structure and deterministic behavior but cannot prove final visual fidelity, touch pairing, or Tower Stack frame behavior. Drag state, collapse framing, responsive layout, native provider flows, and other device-specific presentation need rendered/manual verification.

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
source: scripts/tests/task-close.test.mjs#prepare creates a compact schema-v2 ownership manifest and intake
source: scripts/tests/concept-kb.test.mjs#the repository concept registry is complete, deterministic, and source-grounded
source: scripts/benchmark-rag.mjs#runConceptBenchmark
adjacent: automation.retrieval.protocol
adjacent: automation.task-close.lifecycle
-->
## Automation protocol coverage

Automation tests protect retrieval states and budgets, task-close ownership and closure, publication scope, map generation, observability arithmetic, and safety gates. Focused concept tests cover parser/generator/validator integrity, while the opt-in concept benchmark proves exact routes and closed failures without changing the legacy benchmark.

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
