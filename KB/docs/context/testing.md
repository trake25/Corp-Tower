# Testing

Scope: permanent server/client/automation coverage, deterministic local selection, balance tools, and release gates. Product behavior remains in its owning domain docs.

<!-- kb
id: testing.selection.local
alias: qa-gate
alias: targeted QA
source: scripts/qa-gate.mjs#@file
-->
## Local QA selection

`qa-gate` selects verification from explicit task-owned paths rather than the dirty tree. A changed test runs itself; shared or unmapped runtime code can widen to the affected domain. Server checks include syntax plus mapped Node tests, client checks include host-matching Godot smoke and mapped GUT, and infra/docs/site-only work does not inherit game suites without runtime risk.

<!-- kb
id: testing.server.coverage
alias: Node tests
alias: server tests
-->
## Server coverage

Permanent server coverage protects placement/geometry, stability/scoring invariants, authoritative events, Impact rollback, identity/profile boundaries, and multi-pod room lifecycle. Preview and award must agree; exact event-set tests isolate unrelated warning behavior. Test fixtures pin QA configuration instead of inheriting production calibration accidentally.

<!-- kb
id: testing.server.reconnect
alias: reconnect tests
adjacent: network.session.recovery
-->
## Reconnect coverage

Reconnect regression coverage protects superseded-socket behavior and targeted recovery snapshots that do not consume transient events. Broader gateway/cross-pod recovery remains an integration gap until dedicated coverage exists.

<!-- kb
id: testing.client.coverage
alias: GUT
alias: client smoke
-->
## Godot coverage

Client smoke loads runtime scripts, main scene, autoloads, and required gameplay bindings. GUT protects placement mirrors, inventory/block behavior, deterministic collapse/pose logic, authentication, tutorial progression, gameplay rendering, and meaningful UI structure.

<!-- kb
id: testing.client.rendered
alias: rendered QA
alias: manual visual QA
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
adjacent: gameplay.bots.calibration
-->
## Balance tools

Balance Simulator, Stability Probe, and Impact Probe are tuning instruments rather than pass/fail authorities. Host-aware wrappers control resource/time budgets and temporary output. The simulator uses the real engine/bot path; bot rejection of collapse makes bot collapse rate a poor stability calibration signal.

<!-- kb
id: testing.automation.protocol
alias: automation tests
alias: retrieval benchmark
source: scripts/tests/context-query.test.mjs#@file
source: scripts/tests/task-close.test.mjs#@file
adjacent: automation.retrieval.protocol
adjacent: automation.task-close.lifecycle
-->
## Automation protocol coverage

Automation tests protect retrieval result states/budgets, task-close ownership/closure, explicit publication scope, map generation, observability arithmetic, and safety gates. Retrieval benchmark is the end-to-end correctness/provider-byte guard for the retained context experiment.

<!-- kb
id: testing.contract.tutorial-parity
alias: tutorial parity test
source: scripts/tests/tutorial-defaults-parity.test.mjs#@file
adjacent: tutorial.defaults.parity
-->
## Tutorial parity

Tutorial defaults parity is a focused cross-domain contract test. It validates only derived live Level-1 mirrors and does not turn every tutorial edit into automation-protocol scope.

<!-- kb
id: testing.release.gates
alias: CI gates
alias: release QA
adjacent: build.android.pipeline
adjacent: deploy.eks.workflows
-->
## Release gates

Android deployment runs client smoke and required GUT before export. EKS server deployment runs the complete Node suite before image build/push. Release gates are broader than ordinary local task QA because they protect the shipping artifact.
