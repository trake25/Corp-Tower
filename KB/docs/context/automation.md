# Agent Automation

Scope: bounded repository retrieval, deterministic task close-out, documentation/map automation, agent observability, and explicitly authorized Git publication. Product behavior remains in product-domain docs.

<!-- kb
id: automation.retrieval.direct
alias: agent retrieval
alias: bounded context
source: AGENTS.md#Retrieval
adjacent: automation.retrieval.protocol
-->
## Direct retrieval discipline

Normal agent retrieval starts from an explicit semantic route, reads bounded knowledge, then bounded source. Repository-wide exploratory search is not ordinary context. The future router should grant exact policy/KB/map/source envelopes instead of broad role-root access.

<!-- kb
id: automation.retrieval.protocol
alias: context.mjs
alias: context query
source: scripts/context.mjs#main
source: scripts/lib/context-query.mjs#searchContext
source: scripts/lib/context-query.mjs#conceptRoute
source: scripts/lib/context-query.mjs#conceptRead
source: scripts/lib/context-query.mjs#conceptBundle
adjacent: testing.automation.protocol
-->
## Retained retrieval protocol

`scripts/context.mjs` retains the primary routing/search protocol and adds opt-in concept route, read, and bundle commands for this parallel KB. Concept resolution is exact-ID then exact normalized alias, returns bounded source instructions and explicit adjacency, and does not activate the future cloud model/task router.

<!-- kb
id: automation.retrieval.states
alias: needs-anchor
alias: needs-filter
alias: retrieval-defect
source: scripts/lib/context-query.mjs#searchContext
-->
## Retrieval result states

The retained experiment distinguishes matched evidence from requests that need a better anchor/filter and from confirmed retrieval/tool defects. Experimental concept routing adds closed, reason-bearing identity, section, source, map, budget, access, and tool failures without changing the primary result states.

<!-- kb
id: automation.retrieval.aliases
alias: retrieval-aliases.json
source: docs/context/retrieval-aliases.json#terms
-->
## Retrieval aliases

Vocabulary bridges exist only to resolve demonstrated naming mismatches. This parallel KB authors aliases beside their one owning concept. The legacy alias JSON remains an independent part of the unchanged primary retrieval system during the experiment.

<!-- kb
id: automation.retrieval.fallback
alias: source fallback
alias: broad fallback
source: scripts/lib/context-query.mjs#searchContext
adjacent: automation.docs.retrieval-repair
-->
## Retrieval fallback

A confirmed retrieval defect is a tooling/KB failure, not permission for uncontrolled repository search. The current system retains its bounded role-root fallback contract. The parallel concept interface always fails closed with a reason and never authorizes repository-wide fallback.

<!-- kb
id: automation.retrieval.bundle
alias: context bundle
source: scripts/context.mjs#safeBundlePath
source: scripts/lib/context-query.mjs#contextBundle
-->
## Context bundles

A context bundle is a bounded handoff for environments without direct local-tool access. It contains selected evidence/provenance under explicit byte limits and never grants filesystem capabilities beyond what was deliberately included.

<!-- kb
id: automation.task-close.lifecycle
alias: task close
alias: task-close
source: scripts/task-close.mjs#main
adjacent: automation.task-close.scope
adjacent: automation.task-close.receipt
-->
## Task-close lifecycle

`task-close` is deterministic repository closure around explicit task-owned paths. Schema-2 flow is `prepare → review → close`, with `amend` adding later ownership. Scope is never discovered from the dirty working tree.

<!-- kb
id: automation.task-close.scope
alias: task manifest
alias: owned paths
source: scripts/task-close.mjs#createManifest
source: scripts/lib/context-query.mjs#scopeContext
-->
## Task-close scope

Prepare owns explicit paths, planned QA tooling, and optional active plan before edits. Review accepts only owned final changes and recomputes QA/docs. Close records documentation/coverage decisions and verifies the reviewed set.

<!-- kb
id: automation.task-close.verification
alias: task close QA
alias: maintenance-blocked
source: scripts/task-close.mjs#verifyV2
adjacent: testing.selection.local
-->
## Task-close verification

Close-out runs selected protocol/QA checks, regenerates affected maps, validates KB/agent configuration as required, and keeps detailed child output out of public scope. Task-caused failures remain open; only approved unrelated maintenance blockers can produce a maintenance-blocked closure.

<!-- kb
id: automation.task-close.receipt
alias: qa receipt
alias: public receipt
source: scripts/task-close.mjs#finishVerification
-->
## Public receipt

Public QA receipts expose sanitized task identity, owned scope, compact verification outcomes, and maintenance classification without publishing raw private child output. Implementation completion and verification status remain separately representable.

<!-- kb
id: automation.task-close.plan-archive
alias: plan done
alias: archive plan
source: scripts/task-close.mjs#archivePlan
-->
## Plan archival

A bound active plan moves to completed history only after successful lifecycle closure. Archive failure preserves proof for an idempotent retry rather than pretending closure succeeded.

<!-- kb
id: automation.docs.maps
alias: build file map
alias: generated maps
source: scripts/build-file-map.mjs#build
source: scripts/build-file-map.mjs#isPrimaryAnchorReferencePath
source: scripts/build-concept-map.mjs#buildConceptMaps
adjacent: automation.docs.validation
-->
## Map regeneration

Primary source locator maps preserve authored file purpose and navigation
anchors. Non-intrinsic anchor promotion consults only the explicitly allowed
primary source/tooling reference corpus: experimental KB material, concept
fixtures/tests, private state, and reports cannot promote a primary anchor. Concept
tooling remains eligible to appear normally in the infrastructure map, while
the separate concept generator derives experimental domain maps and the marked
concept router without replacing primary coverage.

<!-- kb
id: automation.docs.validation
alias: validate docs
alias: KB validator
source: scripts/validate-docs.mjs#classification
source: scripts/validate-concept-kb.mjs#validateConceptKb
source: scripts/lib/concept-kb.mjs#conceptProseCapacity
-->
## KB validation

The primary game-KB validator protects the authoritative corpus and excludes
this tree. The separate experimental validator protects concept identity,
aliases, leaf ownership, adjacency, exact source anchors, isolation, generated
equality, and a concept-specific capacity model. Advisory bands are calibration
signals; only prose beyond the independent 2,500-estimated-token ceiling or the
400-character line ceiling is a capacity error.

<!-- kb
id: automation.docs.scope
alias: docs-scope
alias: documentation scope
source: scripts/docs-scope.mjs#targets
-->
## Docs scoping

Primary docs updates remain scoped from explicit changed paths and routed source names. The concept registry now derives a reverse source-to-concept index for later router integration; it does not change ordinary product documentation scope in this experiment.

<!-- kb
id: automation.docs.retrieval-repair
alias: retrieval maintenance
source: scripts/lib/context-query.mjs#searchContext
adjacent: automation.retrieval.fallback
-->
## Retrieval repair

Retrieval/map defects discovered during unrelated product work are maintenance findings, not permission to broaden that product task. An explicit retrieval-maintenance task may repair concept metadata, generated routes/maps, validators, fixtures, or benchmark expectations.

<!-- kb
id: automation.docs.skill-mirror
alias: sync agent skills
source: scripts/sync-agent-skills.mjs#skillMirrorDrift
-->
## Skill mirroring

`.agents/skills/**` is canonical for current role skills and the Claude mirror is synchronized through the repository's commit-time mechanism. Generated mirrors are derived state, not independent policy authorities.

<!-- kb
id: automation.observability.binding
alias: agent observability
alias: task binding
source: scripts/lib/agent-observability/state.mjs#bindActiveTask
-->
## Observability binding

Agent observability binds task/session identity and records bounded structured outcomes rather than prompt/tool transcripts. Without a live session binding, a task remains pending rather than being finalized with fabricated terminal evidence.

<!-- kb
id: automation.observability.usage
alias: provider tokens
alias: rollout usage
source: scripts/lib/agent-observability/usage.mjs#aggregateUsage
-->
## Observability usage

Usage accounting relies on stable disjoint identifiers and terminal host evidence. Missing rollout usage is represented as partial/unavailable, never as a fabricated zero, and observability subsets are not double-counted into provider totals.

<!-- kb
id: automation.observability.flags
alias: workflow candidate
alias: inefficiency flag
source: scripts/lib/agent-observability/flagging.mjs#flagEligibility
-->
## Workflow inefficiency flags

Workflow inefficiency requires evidence of retries, repeated verification/recovery, rework, or retrieval expansion. One correctly handled maintenance failure is not itself evidence that the workflow is inefficient.

<!-- kb
id: automation.git.publish
alias: targeted push
alias: git sync commit push
source: scripts/git-sync-commit-push.mjs#requireManifest
-->
## Authorized Git publication

`git-sync-commit-push` is opt-in and requires explicit user authorization plus eligible closed task state. It performs only the authorized sync/stage/commit/push sequence and rejects invalid branch/scope/staging states rather than silently widening publication.
