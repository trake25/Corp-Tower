# Agent Automation

Scope: bounded repository retrieval, deterministic task close-out, KB Tree automation, agent observability, and explicitly authorized Git publication. Product behavior remains in product-domain concepts.

<!-- kb
id: automation.retrieval.direct
alias: agent retrieval
alias: bounded context
source: AGENTS.md#Route
source: policy/CODEX.md#KB retrieval transport
source: policy/CHATGPT.md#KB retrieval transport
adjacent: automation.retrieval.protocol
-->
## Direct retrieval discipline

KB Tree is the sole semantic repository-context corpus. The model selects one exact concept or alias for each new information
need; retrieval transport does not make that semantic choice. Codex prefers
local deterministic concept retrieval, while ChatGPT uses exact connector reads.
Both receive the same owning prose, generated map, and granted-source envelope.
Already-valid evidence is reused, and repository-wide exploration is not ordinary
context.

<!-- kb
id: automation.retrieval.protocol
alias: context.mjs
alias: context query
source: scripts/context.mjs#main
source: scripts/lib/context-query.mjs#conceptRoute
source: scripts/lib/context-query.mjs#conceptRead
source: scripts/lib/context-query.mjs#conceptTextLines
source: scripts/lib/context-query.mjs#conceptBundle
adjacent: testing.automation.protocol
-->
## Concept retrieval protocol

`scripts/context.mjs` is Codex's preferred local implementation of the KB Tree
route, read, and bundle protocol. Its only commands are `concept-route`,
`concept-read`, and `concept-bundle`; each accepts an exact ID or normalized
alias but does not select a concept. `concept-read` returns the owning prose leaf
with bounded source grants and unloaded adjacency. Resolution never turns
adjacency into an implicit next read.

<!-- kb
id: automation.retrieval.states
alias: needs-anchor
alias: needs-filter
alias: retrieval-defect
source: scripts/lib/context-query.mjs#conceptRoute
-->
## Retrieval result states

KB Tree returns closed, reason-bearing identity, section, source, map, budget,
access, and tool failures. A missing route is a retrieval defect, not permission
to widen into uncontrolled source search.

<!-- kb
id: automation.retrieval.aliases
alias: retrieval-aliases.json
source: scripts/lib/concept-kb.mjs#conceptForInput
-->
## Retrieval aliases

Aliases exist only to resolve demonstrated naming mismatches and are authored
beside their one owning concept. Exact canonical IDs remain the preferred route.

<!-- kb
id: automation.retrieval.fallback
alias: source fallback
alias: broad fallback
source: scripts/lib/context-query.mjs#conceptRoute
source: policy/CODEX.md#KB retrieval transport
source: policy/CHATGPT.md#KB retrieval transport
adjacent: automation.docs.retrieval-repair
-->
## Retrieval fallback

Ordinary retrieval fails closed: a confirmed KB Tree/tooling defect is not
permission to replace granted evidence with repository search. After exact KB
and transport attempts fail, ChatGPT alone may broaden search solely to identify
and report that defect; sources found there are not ordinary task authority until
the KB route is repaired or explicitly re-established. Codex retries only the
same exact manual route, then reports the defect.

<!-- kb
id: automation.retrieval.bundle
alias: context bundle
source: scripts/lib/context-query.mjs#conceptBundle
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
source: scripts/task-close.mjs#taskCloseIntake
-->
## Task-close scope

Prepare owns explicit paths, planned QA tooling, and an optional active plan
before edits. Review accepts only owned final changes and recomputes deterministic
QA and documentation candidates. Close records documentation/coverage decisions
and verifies the reviewed set.

<!-- kb
id: automation.task-close.verification
alias: task close QA
alias: maintenance-blocked
source: scripts/task-close.mjs#verifyV2
adjacent: testing.selection.local
-->
## Task-close verification

Close-out runs selected QA checks, regenerates KB Tree output when authored
concepts change, validates KB Tree as required, and keeps detailed child output
out of public scope.
Task-caused failures remain open; only approved unrelated maintenance blockers
can produce a maintenance-blocked closure.

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
alias: concept map generator
source: scripts/build-concept-map.mjs#buildConceptMaps
adjacent: automation.docs.validation
-->
## Map regeneration

The concept generator is the only map architecture. It derives KB Tree domain maps and the marked concept router
from authored concept metadata and bounded source grants. Generated output is
locator evidence, never an authored replacement for concept prose.

<!-- kb
id: automation.docs.validation
alias: concept KB validator
alias: KB validator
source: scripts/validate-concept-kb.mjs#validateConceptKb
source: scripts/lib/concept-kb.mjs#conceptProseCapacity
-->
## KB validation

The KB Tree validator protects concept identity, aliases, leaf ownership,
adjacency, exact source anchors, isolation, generated equality, and its capacity
model. Advisory bands are calibration signals; only prose beyond the
2,500-estimated-token ceiling or the 400-character line ceiling is a capacity
error.

<!-- kb
id: automation.docs.scope
alias: source concept ownership
alias: documentation ownership
source: scripts/lib/concept-kb.mjs#loadConceptRegistry
-->
## Docs scoping

The concept registry derives the sole reverse source-to-concept index for deterministic
tooling. Durable-current-contract changes belong to their smallest owning concept;
task history and working material never become KB Tree prose.

<!-- kb
id: automation.docs.retrieval-repair
alias: retrieval maintenance
source: scripts/lib/context-query.mjs#conceptRoute
adjacent: automation.retrieval.fallback
-->
## Retrieval repair

Retrieval/map defects discovered during unrelated product work are maintenance findings, not permission to broaden that product task. An explicit retrieval-maintenance task may repair concept metadata, generated routes/maps, validators, fixtures, or benchmark expectations.

<!-- kb
id: automation.observability.binding
alias: agent observability
alias: task binding
source: scripts/lib/agent-observability/state.mjs#bindActiveTask
source: scripts/codex-observability-hook.mjs#handleHook
source: scripts/task-close.mjs#closeObservabilityUnsafe
-->
## Observability binding

Agent observability binds task/session identity and records only bounded categories,
outcomes, and opaque identifiers, never prompts, responses, patches, commands, or
transcript contents. Hooks are best-effort: they record health when possible and
cannot alter task execution, QA, or receipt correctness. Stop performs normal
settlement; SessionEnd remains a cheap health fallback. Without a live session
binding, a task remains pending rather than being finalized with fabricated
terminal evidence.

<!-- kb
id: automation.observability.usage
alias: provider tokens
alias: rollout usage
source: scripts/lib/agent-observability/usage.mjs#aggregateUsage
source: scripts/lib/agent-observability/codex-rollout.mjs#codexRolloutUsage
source: scripts/lib/agent-observability/task-telemetry.mjs#buildTaskTelemetry
source: scripts/lib/agent-observability/schema.mjs#sanitizeTelemetry
source: scripts/lib/agent-observability/analytics.mjs#optionalFlaggingOverhead
source: scripts/agent-observability.mjs#executeCommand
source: scripts/lib/agent-observability/report.mjs#displayStageGroups
-->
## Observability usage

Usage accounting relies on stable disjoint identifiers and terminal evidence. Stop
first validates and reads the current supplied rollout, then uses only the
narrowest related child discovery; bounded inventory is fallback-only. Missing
exact usage is partial/unavailable, never a fabricated zero. Task telemetry
derives concept retries, verification and rework only from retained outcomes;
optional workflow-review cost is measured as bounded handoff/material bytes and
count, with attributable provider tokens absent unless exactly observable.

<!-- kb
id: automation.observability.flags
alias: workflow candidate
alias: inefficiency flag
source: scripts/lib/agent-observability/flagging.mjs#flagEligibility
source: scripts/lib/agent-observability/runtime.mjs#modelFamily
-->
## Workflow inefficiency flags

Workflow inefficiency requires deterministic evidence of explicit retrieval
defect/fallback, same-concept recovery, failed-tool recovery, repeated
task-caused rework, or unresolved retest cycles; normal movement between
different concepts is not a candidate. Its concept is loaded only when current-run
tooling reports an eligible candidate and a provider turn is already required;
it never creates an extra turn by itself. Astra follows the same approved-family,
high-or-higher effort, current-turn, task-evidence, and 1.5 KiB material gate.
Public QA receipt correctness remains independent of candidate and hook health.

<!-- kb
id: automation.git.publish
alias: targeted push
alias: git sync commit push
source: scripts/git-sync-commit-push.mjs#requireManifest
-->
## Authorized Git publication

`git-sync-commit-push` is opt-in and requires explicit user authorization plus eligible closed task state. It performs only the authorized sync/stage/commit/push sequence and rejects invalid branch/scope/staging states rather than silently widening publication.
