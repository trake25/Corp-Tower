# Agent Automation

Scope: bounded repository retrieval, deterministic task close-out, documentation/map automation, agent observability, and explicitly authorized Git publication. Product behavior remains in product-domain docs.

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

The model selects one exact KB Tree concept or alias for each new information
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
## Retained retrieval protocol

`scripts/context.mjs` is Codex's preferred local implementation of the KB Tree
route, read, and bundle protocol; it accepts an exact ID or normalized alias but
does not select a concept. Its normal `concept-read` form returns the owning
prose leaf with bounded source grants and unloaded adjacency, while
`concept-route` remains route-oriented. Resolution never turns adjacency into an
implicit next read.

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
alias: build file map
alias: generated maps
source: scripts/build-concept-map.mjs#buildConceptMaps
adjacent: automation.docs.validation
-->
## Map regeneration

The concept generator derives KB Tree domain maps and the marked concept router
from authored concept metadata and bounded source grants. Generated output is
locator evidence, never an authored replacement for concept prose.

<!-- kb
id: automation.docs.validation
alias: validate docs
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
alias: docs-scope
alias: documentation scope
source: scripts/lib/concept-kb.mjs#loadConceptRegistry
-->
## Docs scoping

The concept registry derives a reverse source-to-concept index for deterministic
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

Workflow inefficiency requires deterministic evidence of retries, repeated
verification/recovery, rework, or retrieval expansion. Its concept is loaded
only when current-run tooling reports an eligible candidate and a provider turn
is already required; it never creates an extra turn by itself.

<!-- kb
id: automation.git.publish
alias: targeted push
alias: git sync commit push
source: scripts/git-sync-commit-push.mjs#requireManifest
-->
## Authorized Git publication

`git-sync-commit-push` is opt-in and requires explicit user authorization plus eligible closed task state. It performs only the authorized sync/stage/commit/push sequence and rejects invalid branch/scope/staging states rather than silently widening publication.
