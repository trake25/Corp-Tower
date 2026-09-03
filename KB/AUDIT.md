# Experimental concept KB readiness audit

Snapshot after repository-side grounding and tooling implementation:

- Prose documents: 12
- Canonical concepts: 185
- Exact source grants: 247
- Concepts without a source grant: 0
- Coarse `#@file` migration seeds: 0
- Duplicate concept IDs: 0
- Ambiguous normalized aliases: 0
- Missing or self-referential adjacency targets: 0
- Generated domain maps: 10
- Generated router blocks: 1
- Prohibited source grants: 0
- Unresolved source targets or anchors: 0

## Executable proof

`build-concept-map.mjs --check` compares every generated domain map and the
marked index router with metadata-derived output. `validate-concept-kb.mjs`
also checks leaf ownership, source resolution, isolation, budgets, stale or
duplicate map concepts, and exact map/prose ownership.

The focused concept benchmark covers HUD collapse presentation and recovery,
Critical Save, session recovery, task-close, Android target-SDK/AAB validation,
EKS deployment, and private-room behavior. It also proves closed failure for an
unknown concept, an ambiguous alias, a missing anchor, and a prohibited source.

The primary `docs/context/**` corpus, locator-map generator, context commands,
fixture, and legacy benchmark remain the default. Primary validation excludes
`KB/`, so experimental files cannot satisfy primary citation/source checks.

The substrate is ready for later model/task-router integration but is not an
authoritative cloud-agent knowledge base. Cloud router activation is deferred.

Blockers: none for the parallel retrieval substrate; cloud-agent activation remains intentionally out of scope.
