# Top or Drop — Agent Workflow Overview

## A. Policy ownership

ChatGPT and Codex no longer traverse the same startup policy tree.

ChatGPT is routed directly to `policy/CHATGPT.md#ENTRY#`, which selects only the ChatGPT role needed for the current request. Planner, Reviewer, Question, Visual, Maintenance, and Research remain sparse on-demand branches.

`AGENTS.md` is the universal Codex execution policy. It contains only rules that apply to every Codex implementation task. Codex does not identify runtime/product, model, or effort and does not route through `policy/CODEX.md`, `policy/IMPLEMENT.md`, or `policy/FIX.md` during normal planned execution.

`policy/CODEX.md`, `policy/IMPLEMENT.md`, and `policy/FIX.md` are Planner-side policy sources. ChatGPT Planner reads only the relevant portions while compiling Phase 2 and embeds only the selected task-specific rules into the plan.

## B. Planning workflow

Planner resolves intended behavior with the user before implementation.

Phase 1 is the final user-approved intended-behavior contract. Phase 2 must preserve that contract without reinterpretation or expansion.

For repository-dependent work, Planner contextualizes far enough to understand likely implementation, not only architecture. It uses the KB Tree to resolve the relevant durable contracts and inspects enough current source to identify the exact source files and bounded sections Codex should read, the likely direct-edit files, generated outputs or authored KB/docs that may change, and the minimum verification that proves completion.

The workflow reasoning cost is paid once during planning so Codex does not repeat policy selection, KB concept selection, or implementation-boundary discovery during normal execution.

## C. Standard Phase 2 handoff

Every Phase 2 implementation plan uses the same core sections:

1. `## 1. Intended Behavior` — the exact behavior approved by the user during Phase 1.
2. `## 2. Task-Specific Policy` — only the relevant rules selected from detached Planner-side policy sources.
3. `## 3. Context`
   - `### Compacted KB Context` — implementation-relevant KB prose already read and summarized by Planner.
   - `### KB Retrieval Inputs` — exact canonical concept IDs or aliases Codex may use if deeper detail becomes necessary.
   - `### Source Context` — exact current source files plus bounded sections, symbols, or ranges Codex should inspect.
4. `## 4. Expected Write Scope`
   - `### Direct Edits`
   - `### Generated Outputs`
5. `## 5. Implementation` — ordered required outcomes and material constraints.
6. `## 6. Verification` — only the minimum task-required verification plus mandatory repository consistency/closure.
7. `## 7. Done Criteria` — observable completion conditions.

`## Execution Overrides` exists only when execution differs from repository defaults.

BARE process controls are not repeated in the plan. Normal single-run execution is not stated. Current Codex runtime identity, model, and effort are not plan content. Planner may recommend a model and effort to the user outside the plan.

## D. Codex implementation workflow

The normal Codex path is:

`AGENTS.md → approved Phase 2 plan → Compacted KB Context + Source Context → implementation → minimum verification / deterministic closure → result`

Codex uses the compacted KB summary as its primary durable-system context and reads the listed source context before editing. The listed KB retrieval inputs are fallback routes for deeper detail, not mandatory startup reads.

The Expected Write Scope is Planner's evidence-based likely scope, not a hard whitelist by default. Current source evidence may justify a proven direct task dependency or bounded task-local refactor when needed for a complete or materially cleaner implementation. That freedom never authorizes unrelated cleanup, maintenance, speculative architecture, or behavior outside the approved Phase 1 contract.

If implementation changes a durable current system contract, Codex updates the owning authored KB concept. Generated KB routers and concept maps remain tooling-owned.

## E. Strict execution

`strict_execution=ON` is a non-default execution override.

When absent, Codex retains task-local implementation judgment inside the approved behavior and universal `AGENTS.md` boundaries.

When enabled, the plan must prescribe the implementation constraints and direct-write scope closely enough for deterministic execution. Codex follows that path rather than substituting its own refactor, modularization, or additional write dependency. If current source makes the prescribed path impossible, unsafe, or materially incorrect, Codex reports the conflict rather than deviating autonomously.

Strict execution is intended for tasks where a deliberately prescriptive path is more valuable than adaptive implementation judgment.

## F. Fix workflow

Confirmed bug repair still uses the normal planning and execution handoff.

ChatGPT Planner classifies the approved task through the detached Planner-side Codex policy and selects the relevant FIX rules. The Phase 2 plan carries the confirmed intended behavior, affected source context, expected repair scope, minimum verification, and only the FIX constraints that materially apply.

Codex then follows the same runtime path:

`AGENTS.md → approved Phase 2 fix plan → supplied context → smallest complete restoration → minimum verification / deterministic closure → result`

FIX restores confirmed intended behavior. If repository evidence proves that restoration requires a new product or workflow decision, the task returns to ChatGPT planning rather than letting Codex invent a redesign.

## G. Process controls and deterministic tooling

Repository process defaults remain deterministic tooling behavior rather than repeated plan prose.

New tasks default to BARE internally: telemetry, workflow inefficiency flagging, executable QA, permanent QA coverage, and public QA receipt are off; plan archival is on. Planner writes only non-default values under `## Execution Overrides`. Task-close still resolves and persists the complete effective process contract internally. Corp Tower observability hooks are not registered from an auto-discovered project `hooks.json` in the default path, so telemetry OFF means those hook commands are not dispatched. A plan with `telemetry=ON` is started through the deterministic pre-session Codex launcher, which injects the repository observability hooks only for that implementation session and fails before launch if activation cannot be resolved.

Deterministic tooling owns repeatable mechanics such as explicit task ownership, task-close lifecycle, generated KB routing/maps, process-control validation, compact QA execution, receipts, plan archival, orchestration write claims, observability, and authorized publication gates.

Optional processes never disable task ownership, concurrent-change preservation, authorization or safety boundaries, patch integrity, repair of task-caused failures, or required KB/generated consistency.

## H. Orchestrated execution

Normal single-run execution is implicit.

Planner selects ORCHESTRATED only when semantic decomposition materially reduces context reconstruction, enables useful safe concurrency, or improves integration control enough to justify coordination overhead. When selected, Planner reads the detached orchestration policy and compiles the required worker contract into `## Execution Overrides`.

The parent plan remains the behavior authority. Worker units receive only their bounded behavior, selected policy, compacted KB context, exact retrieval inputs when needed, source context, write ownership, shared interfaces, and verification expectations.

Parallel workers may share read evidence but may not hold overlapping active write claims. Shared mutable paths use one owner or serialized work. Parent closure, integration, worker-claim resolution, and final verification remain orchestrator-owned.

## I. Review workflow

A fresh ChatGPT review session routes through `policy/CHATGPT.md#ENTRY#` to Reviewer. A continued Planner session can transition directly into Reviewer without reconstructing already-present planning decisions.

Reviewer inspects actual repository evidence against the approved plan. Codex summaries are not proof. For orchestrated work, the parent plan is the implementation contract and worker handoffs are supporting evidence only.

Review distinguishes implementation defects, integration defects, verification/tooling issues, and unrelated maintenance. Fix-required findings return through focused planning before Codex implementation resumes.

## J. Token-efficiency principle

The workflow reduces provider cost by moving reusable reasoning upstream and keeping defaults implicit:

1. **Planner-side policy selection** — ChatGPT selects only task-relevant execution policy once.
2. **Compacted KB handoff** — Planner summarizes already-read KB prose instead of making Codex reread it.
3. **Exact source handoff** — Planner identifies bounded source context and likely write files before implementation.
4. **Implicit defaults** — BARE controls and normal single-run execution do not consume plan context.
5. **Adaptive Codex execution** — Codex spends reasoning on current source and implementation choices rather than workflow routing.
6. **Deterministic mechanics** — tooling owns repeatable closure, generation, QA, receipts, and state management with compact outputs.

The goal is to minimize duplicate workflow reasoning while preserving strong implementation judgment where current source evidence matters most.
