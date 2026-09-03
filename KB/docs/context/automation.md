# Agent Automation

Scope: bounded repository retrieval, deterministic task close-out, documentation/map automation, agent observability, and explicitly authorized Git publication. Product behavior remains in product-domain docs.

<!-- kb
id: automation.retrieval.direct
alias: agent retrieval
alias: bounded context
source: AGENTS.md#@file
adjacent: automation.retrieval.protocol
-->
## Direct retrieval discipline

Normal agent retrieval starts from an explicit semantic route, reads bounded knowledge, then bounded source. Repository-wide exploratory search is not ordinary context. The future router should grant exact policy/KB/map/source envelopes instead of broad role-root access.

<!-- kb
id: automation.retrieval.protocol
alias: context.mjs
alias: context query
source: scripts/context.mjs#@file
source: scripts/lib/context-query.mjs#@file
adjacent: testing.automation.protocol
-->
## Retained retrieval protocol

`scripts/context.mjs` is a retained local-tool experiment and portable bundle producer. Its current bounded primitives include routing, exact Markdown section extraction, symbol/map lookup, byte budgets, provenance, and bounded source-read instructions. It is not the final semantic router.

<!-- kb
id: automation.retrieval.states
alias: needs-anchor
alias: needs-filter
alias: retrieval-defect
source: scripts/lib/context-query.mjs#@file
-->
## Retrieval result states

The retained experiment distinguishes matched evidence from requests that need a better anchor/filter and from confirmed retrieval/tool defects. Ordinary ambiguity does not authorize source fallback. Future concept routing should preserve explicit failure reasons while replacing global narrative search with concept resolution.

<!-- kb
id: automation.retrieval.aliases
alias: retrieval-aliases.json
source: docs/context/retrieval-aliases.json#@file
-->
## Retrieval aliases

Vocabulary bridges exist only to resolve demonstrated naming mismatches. In the proposed KB architecture, aliases move to the one owning concept's metadata and any legacy alias JSON becomes generated compatibility output rather than a second authored authority.

<!-- kb
id: automation.retrieval.fallback
alias: source fallback
alias: broad fallback
source: scripts/lib/context-query.mjs#@file
adjacent: automation.docs.retrieval-repair
-->
## Retrieval fallback

A confirmed retrieval defect is a tooling/KB failure, not permission for uncontrolled repository search. During migration the current system still has a bounded role-root fallback, but the target architecture fails closed with a reason and routes explicit repair separately.

<!-- kb
id: automation.retrieval.bundle
alias: context bundle
source: scripts/context.mjs#@file
-->
## Context bundles

A context bundle is a bounded handoff for environments without direct local-tool access. It contains selected evidence/provenance under explicit byte limits and never grants filesystem capabilities beyond what was deliberately included.

<!-- kb
id: automation.task-close.lifecycle
alias: task close
alias: task-close
source: scripts/task-close.mjs#@file
adjacent: automation.task-close.scope
adjacent: automation.task-close.receipt
-->
## Task-close lifecycle

`task-close` is deterministic repository closure around explicit task-owned paths. Schema-2 flow is `prepare → review → close`, with `amend` adding later ownership. Scope is never discovered from the dirty working tree.

<!-- kb
id: automation.task-close.scope
alias: task manifest
alias: owned paths
source: scripts/task-close.mjs#@file
source: scripts/lib/context-query.mjs#@file
-->
## Task-close scope

Prepare owns explicit paths, planned QA tooling, and optional active plan before edits. Review accepts only owned final changes and recomputes QA/docs. Close records documentation/coverage decisions and verifies the reviewed set.

<!-- kb
id: automation.task-close.verification
alias: task close QA
alias: maintenance-blocked
source: scripts/task-close.mjs#@file
adjacent: testing.selection.local
-->
## Task-close verification

Close-out runs selected protocol/QA checks, regenerates affected maps, validates KB/agent configuration as required, and keeps detailed child output out of public scope. Task-caused failures remain open; only approved unrelated maintenance blockers can produce a maintenance-blocked closure.

<!-- kb
id: automation.task-close.receipt
alias: qa receipt
alias: public receipt
source: scripts/task-close.mjs#@file
-->
## Public receipt

Public QA receipts expose sanitized task identity, owned scope, compact verification outcomes, and maintenance classification without publishing raw private child output. Implementation completion and verification status remain separately representable.

<!-- kb
id: automation.task-close.plan-archive
alias: plan done
alias: archive plan
source: scripts/task-close.mjs#@file
-->
## Plan archival

A bound active plan moves to completed history only after successful lifecycle closure. Archive failure preserves proof for an idempotent retry rather than pretending closure succeeded.

<!-- kb
id: automation.docs.maps
alias: build file map
alias: generated maps
source: scripts/build-file-map.mjs#@file
adjacent: automation.docs.validation
-->
## Map regeneration

Generated source locator maps preserve one authored file purpose and stable navigation anchors while regenerating line numbers from source. The KB overhaul adds concept maps derived from concept metadata without replacing locator-map coverage during migration.

<!-- kb
id: automation.docs.validation
alias: validate docs
alias: KB validator
source: scripts/validate-docs.mjs#@file
-->
## KB validation

The game-KB validator protects links/anchors, isolated-material boundaries, source-map coverage, source citations, prose constraints, and capacity. The concept overhaul must extend it with concept identity, alias, adjacency, source-anchor, generated-router, and concept-map integrity.

<!-- kb
id: automation.docs.scope
alias: docs-scope
alias: documentation scope
source: scripts/docs-scope.mjs#@file
-->
## Docs scoping

Docs updates are scoped from explicit changed paths. The current implementation finds candidate docs then searches for source names in prose; the concept architecture should replace this with a generated reverse source→concept index so only concept sections that can actually be falsified are opened.

<!-- kb
id: automation.docs.retrieval-repair
alias: retrieval maintenance
source: scripts/lib/context-query.mjs#@file
adjacent: automation.retrieval.fallback
-->
## Retrieval repair

Retrieval/map defects discovered during unrelated product work are maintenance findings, not permission to broaden that product task. An explicit retrieval-maintenance task may repair concept metadata, generated routes/maps, validators, fixtures, or benchmark expectations.

<!-- kb
id: automation.docs.skill-mirror
alias: sync agent skills
source: scripts/sync-agent-skills.mjs#@file
-->
## Skill mirroring

`.agents/skills/**` is canonical for current role skills and the Claude mirror is synchronized through the repository's commit-time mechanism. Generated mirrors are derived state, not independent policy authorities.

<!-- kb
id: automation.observability.binding
alias: agent observability
alias: task binding
source: scripts/agent-observability.mjs#@file
-->
## Observability binding

Agent observability binds task/session identity and records bounded structured outcomes rather than prompt/tool transcripts. Without a live session binding, a task remains pending rather than being finalized with fabricated terminal evidence.

<!-- kb
id: automation.observability.usage
alias: provider tokens
alias: rollout usage
source: scripts/lib/agent-observability/usage.mjs#@file
-->
## Observability usage

Usage accounting relies on stable disjoint identifiers and terminal host evidence. Missing rollout usage is represented as partial/unavailable, never as a fabricated zero, and observability subsets are not double-counted into provider totals.

<!-- kb
id: automation.observability.flags
alias: workflow candidate
alias: inefficiency flag
source: scripts/lib/agent-observability/flagging.mjs#@file
-->
## Workflow inefficiency flags

Workflow inefficiency requires evidence of retries, repeated verification/recovery, rework, or retrieval expansion. One correctly handled maintenance failure is not itself evidence that the workflow is inefficient.

<!-- kb
id: automation.git.publish
alias: targeted push
alias: git sync commit push
source: scripts/git-sync-commit-push.mjs#@file
-->
## Authorized Git publication

`git-sync-commit-push` is opt-in and requires explicit user authorization plus eligible closed task state. It performs only the authorized sync/stage/commit/push sequence and rejects invalid branch/scope/staging states rather than silently widening publication.
