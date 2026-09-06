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
behavior contract. Phase 2 preserves that contract and contextualizes the current repository far
enough to identify bounded source, likely writes, affected durable KB contracts, generated outputs,
and minimum verification.

Planner performs policy selection and semantic context selection once so Codex does not repeat that
reasoning.

## C. Phase 2 handoff

Every Phase 2 plan contains:

1. `## 1. Intended Behavior`
2. `## 2. Task-Specific Policy`
3. `## 3. Context`
   - `### Compacted KB Context`
   - `### KB Retrieval Inputs`
   - `### Source Context`
4. `## 4. Expected Write Scope`
5. `## 5. Implementation`
6. `## 6. Verification`
7. `## 7. Done Criteria`

`## Execution Overrides` appears only when execution differs from defaults.

A default-OFF optional process is not named in the plan. Planner compiles its policy only when the
process is selected ON or otherwise made non-default. Normal single-run execution is implicit.

## D. Codex runtime

Normal runtime is:

`AGENTS.md → approved Phase 2 plan → supplied KB/source context → implementation → required verification/completion mechanics → compact result`

Codex does not route through Planner-side policy files or runtime skills. It consumes the policy and
context already selected into the plan.

Deeper KB retrieval is demand-driven from exact plan-supplied concept IDs/aliases. Broad repository
rediscovery is not normal execution.

## E. Policy selection

`policy/CODEX.md`, `policy/IMPLEMENT.md`, and `policy/FIX.md` are Planner-side policy sources.

Planner selects IMPLEMENT or FIX, then loads only optional policy that actually applies. Task-close,
ownership, telemetry, QA, coverage, receipts, orchestration, strict execution, and similar optional
systems are not universal Codex knowledge.

## F. Process controls

BARE defaults task ownership, task-close, telemetry, workflow inefficiency flagging, executable QA,
permanent QA coverage, and public QA receipt OFF. Plan archival remains ON.

Default-OFF means invisible to Codex. An enabled process contributes only its selected compact task
policy and deterministic mechanics.

Task-close requires ownership. Workflow inefficiency flagging requires telemetry. ORCHESTRATED
execution requires ownership. These dependencies are Planner/tooling concerns and are not taught by
`AGENTS.md`.

Plan archival is a default deterministic completion mechanic, independent from task-close.

## G. Domain context

Domain knowledge belongs in the KB Tree. Planner resolves only the concepts needed for the task,
compacts their durable contracts into the plan, and supplies exact bounded source context.

Client, server, QA, infra, web, editorial, and coordination knowledge are not loaded through role
skills.

## H. Orchestration

Normal execution is one Codex run. Planner selects ORCHESTRATED only when bounded decomposition
materially improves context efficiency or integration control.

When selected, the plan carries worker responsibilities, dependencies, explicit write claims,
shared invariants, execution waves, scoped verification, and parent integration criteria. Parent
ownership is required; task-close remains separately optional.

## I. Review

Post-implementation review routes through ChatGPT Reviewer. Reviewer checks actual repository
evidence against the approved plan; Codex summaries are not proof.

Implementation defects, integration defects, tooling/verification issues, and unrelated maintenance
remain separately classified.

## J. Token-efficiency principle

Provider context is spent only where it changes the next decision:

- universal policy is small;
- optional policy appears only when selected;
- domain context is Planner-selected from the KB;
- Codex reuses the supplied context instead of rediscovering it;
- default-OFF systems generate no runtime policy/context;
- deterministic tooling keeps detailed state/logs private and returns compact results.

The goal is a minimal default Codex path with stronger context added only when the task actually
needs it.
