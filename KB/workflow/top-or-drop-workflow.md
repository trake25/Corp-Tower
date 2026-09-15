# Top or Drop — Agent Workflow Overview

## A. Three authority layers

Top or Drop uses three execution-context layers.

1. `AGENTS.md` is the universal Codex execution kernel. It contains only rules needed on every
   implementation task.
2. The approved Phase 2 plan contains only policy selected for that task.
3. The KB/source handoff contains domain and task-scope knowledge selected by Planner.

Runtime agent skills are not an authority layer and are not used.

## B. Planning

ChatGPT Planner resolves intended behavior before implementation. Phase 1 is the final approved
behavior contract. Phase 2 preserves that contract and uses direct bounded current-source evidence
to identify likely writes, generated outputs, and minimum verification; it adds KB context where a
durable semantic contract is materially needed.

Planner performs policy selection and semantic context selection once so Codex does not repeat that
reasoning.

## C. Phase 2 handoff

The Phase 2 plan is a compact retrieval handoff, not a copy of source or repeated universal policy.
Every Phase 2 plan contains four required sections plus one selected only when execution is
non-default:

1. `## 1. Behavior` — the approved intended behavior and any task-specific policy.
2. `## 2. Retrieval` — a `Source` block of locators, searches, filters, and anchors the Implementor
   starts from (not copied source), plus `Intersections` naming the cross-cutting invariants those
   locators must jointly satisfy; exact KB concept IDs appear only where deeper semantics are
   materially needed.
3. `## 3. Changes` — `Direct` (task-branch edit scope), `Finalization` (integration-candidate-only
   scope such as shared authored KB prose and generated maps), `Generated` (deterministic outputs and
   their owning generator), and `Invariants` the implementation must preserve.
4. `## 4. Verification` — the minimum task-branch and candidate/finalization checks that prove the
   behavior and its material risks; a Planner/Reviewer-selected policy note belongs here rather than
   in a separate policy section.
5. `## Overrides` appears only when execution differs from defaults (for example
   `Execution shape: ORCHESTRATED`, or a non-default `publication`/`plan_archival` value); a task
   using every default omits it.

Repeated universal policy, feasibility narrative already proven during planning, and empty sections
are removed rather than carried into Phase 2 for completeness. A section may state `None required`
only when that is itself the material fact (no deeper KB authority is needed, no Finalization scope
applies); it is not restated boilerplate.

A default-OFF optional process is not named in the plan. Planner compiles its policy only when the
process is selected ON or otherwise made non-default. Normal single-run execution is implicit.

### Planner/Reviewer vs Implementor context

Token/context optimization is an Implementor-only constraint. Planner and Reviewer use all repository
context needed for correctness — they always inspect intersecting features and relevant edge cases,
and provider-token savings never limit that investigation. The Implementor instead treats Phase 2 as a
bounded retrieval handoff: it reads current repository files itself from the plan's `Source` locators
rather than expecting copied source, reconstructs context only when current source contradicts the
plan or exposes a missing dependency, and prefers compact source/Git tooling over routine broad
`git status`/`git diff`/`git log`/`git show`. Codex and Claude Code both implement the same
Implementor contract from `AGENTS.md`; neither gets a provider-specific relaxation of it.

## D. Codex runtime

Normal runtime is:

`AGENTS.md → approved Phase 2 plan → supplied KB/source context → implementation → required verification/completion mechanics → compact result`

Codex does not route through Planner-side policy files or runtime skills. It consumes the policy and
context already selected into the plan.

Deeper KB retrieval is demand-driven from exact plan-supplied concept IDs/aliases. Broad repository
rediscovery is not normal execution.

## E. Policy selection

`policy/CODEX.md`, `policy/IMPLEMENT.md`, and `policy/FIX.md` are Planner-side policy sources.

Planner selects IMPLEMENT or FIX, then loads only optional policy that actually applies. Telemetry,
QA, coverage, receipts, orchestration, strict execution, and similar optional systems are not
universal Codex knowledge. Standalone ownership/task-close utilities are retained for manual
maintenance only and are never Planner/Codex process routes.

## F. Process controls

Agent-supported BARE defaults telemetry, workflow inefficiency flagging, executable QA, permanent QA
coverage, and public QA receipt OFF. Plan archival remains ON.

Default-OFF means invisible to Codex. An enabled process contributes only its selected compact task
policy and deterministic mechanics.

Workflow inefficiency flagging requires telemetry. ORCHESTRATED execution is a parent
reasoning/execution shape and does not imply a process override or deterministic scope lifecycle.
These routing details are Planner concerns and are not taught by `AGENTS.md`.

Plan archival is a default deterministic completion mechanic, independent from retained manual
task-close tooling.

## G. Domain context

Current source establishes implementation facts. Durable intended behavior, architecture,
ownership, terminology, and related semantic contracts belong in the KB Tree. Planner resolves
only the material concepts, compacts their durable contracts into the plan, and supplies exact
bounded source context.

Client, server, QA, infra, web, editorial, and coordination knowledge are not loaded through role
skills.

## H. Orchestration

Normal execution is one Codex run. Planner selects ORCHESTRATED only when bounded decomposition
materially improves context efficiency or integration control.

When selected, the plan carries worker responsibilities, dependencies, planned non-overlapping
writes, shared invariants, execution waves, scoped verification, handoffs, and parent integration
criteria. Each worker returns only a compact integration summary: completion status, files changed,
verification performed and result, material interface/invariant notes, and blockers. Workers do not
return full transcripts, duplicated task/source context, or long logs unless the parent explicitly
requests the minimum additional detail needed to resolve an integration problem. The parent
coordinates sequencing and overlap avoidance through reasoning and remains responsible for the
integrated result.

## I. Review

Post-implementation review routes through ChatGPT Reviewer. Reviewer checks actual repository
evidence against the approved plan; Codex summaries are not proof.

Implementation defects, integration defects, tooling/verification issues, and unrelated maintenance
remain separately classified.

## J. Token-efficiency principle

Provider context is spent only where it changes the next decision:

- universal policy is small;
- optional policy appears only when selected;
- current source is Planner-selected directly, with KB context added only when semantic authority is material;
- Codex reuses the supplied context instead of rediscovering it;
- default-OFF systems generate no runtime policy/context;
- deterministic tooling keeps detailed state/logs private and returns compact results.

The goal is a minimal default Codex path with stronger context added only when the task actually
needs it.
