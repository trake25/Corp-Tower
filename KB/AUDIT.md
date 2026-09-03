# Experimental concept KB readiness audit

Snapshot after repository-side grounding and tooling implementation:

- Prose documents: 12
- Canonical concepts: 185
- Exact source grants: 251
- Concepts without a source grant: 0
- Coarse `#@file` migration seeds: 0
- Duplicate concept IDs: 0
- Ambiguous normalized aliases: 0
- Missing or self-referential adjacency targets: 0
- Generated domain maps: 10
- Generated router blocks: 1
- Prohibited source grants: 0
- Unresolved source targets or anchors: 0
- Concepts above the experimental hard prose ceiling: 0

## Executable proof

`build-concept-map.mjs --check` compares every generated domain map and the
marked index router with metadata-derived output. `validate-concept-kb.mjs`
also checks leaf ownership, source resolution, isolation, budgets, stale or
duplicate map concepts, and exact map/prose ownership.

All 185 concepts satisfy structural and exact-source validation.

All 185 leaves received a prose-quality pass against one-responsibility
behavior/mechanism/rationale/boundary ownership. Healthy prose was retained;
terse or tooling-changed owners were enriched without copying neighboring
contracts. The experimental capacity model is intentionally wider and remains
under calibration; its advisory bands do not create QA blockers.

The focused concept benchmark covers HUD collapse presentation and recovery,
Critical Save, session recovery, task-close, Android target-SDK/AAB validation,
EKS deployment, and private-room behavior. It also proves closed failure for an
unknown concept, an ambiguous alias, a missing anchor, and a prohibited source.
Five authored journeys cover collapse/navigation, Critical Save/stability,
reconnect, automation, and deployment/build contextualization.

Every explicit concept benchmark writes deterministic footprint measurements to
private ignored benchmark state without source contents or model/session data.
Public calibration is available only through the manual exporter; no public
report was generated as part of this implementation, and observations are not
correctness thresholds.

The primary `docs/context/**` corpus, context commands, fixture, and legacy
benchmark remain the default. Primary validation excludes `KB/`, so experimental
files cannot satisfy primary citation/source checks. Primary locator-map anchor
promotion also excludes experimental KB data, concept fixtures/tests, private
state, and reports while keeping normal concept-tool source coverage in
`map/infra.md`.

The substrate is ready for later model/task-router integration but is not an
authoritative cloud-agent knowledge base. Cloud router activation is deferred.

Blockers: none for the parallel retrieval substrate; cloud-agent activation remains intentionally out of scope.
