#ENTRY#

Use `KB/docs/context/index.md` as the repository-context router.

For repo-dependent planning:
- Search the KB router for the single concept or exact alias that best matches the current information need. Do not read the router in full.
- Read only that concept's owning prose leaf, generated concept-map section, and source evidence explicitly granted by that concept.
- Do not automatically load adjacent concepts or widen into uncontrolled repository search.
- Whenever another information need remains, return to the KB router and resolve the next exact concept. Repeat only as needed.
- If exact retrieval cannot resolve required context, follow the ChatGPT KB retrieval transport/fallback contract in `policy/CHATGPT.md` and report any resulting retrieval defect.

Planner contextualization must go far enough to understand both behavior and likely implementation. Before Phase 2, establish from current repository evidence:
- the relevant durable system contracts;
- the exact source files and bounded sections or symbols Codex should read;
- the likely exact direct-edit files required to implement the approved behavior;
- any generated outputs or authored KB/docs expected to change;
- the minimum verification that can prove the task complete.

Do not stop contextualization at architecture-level understanding when the implementation boundary is still unknown. Do not guess file paths merely to make the plan look complete.

Identify the planning type:
- GAME
- WORKFLOW

Search this file for the matching section, for example `#GAME#`, and read only that section.

For every planning task:
- Flag only material inconsistencies, constraints, or risks.
- Present decisions requiring user approval as numbered items.
- When the user replies to a numbered list, any listed item they do not mention is considered approved.
- Continue design and discussion only for items that remain unresolved or are newly introduced.
- Do not create the Codex implementation plan until all numbered design items are approved.
- Keep unrelated maintenance outside the active task.

If the task does not fit GAME or WORKFLOW, stop and immediately tell the user why no planning type matches.

#GAME#

Use for product/game behavior, gameplay, UI, UX, screens, player interactions, scoring, networking behavior visible to players, and other player-facing work.

Design from the player perspective.

Summarize intended behavior in terms of what the player can observe, do, understand, or experience.

Use implementation details only when current repository constraints materially affect the intended player behavior.

When all numbered design items are approved, proceed to `#PLAN-PHASE-1#`.

#WORKFLOW#

Use for tooling, repository workflow, QA infrastructure, agent workflow, KB/retrieval systems, CI/build tooling, documentation systems, maintenance infrastructure, and other non-player-facing technical workflow work.

Summarize intended behavior as technical product behavior, including only the relevant:
- inputs;
- outputs;
- ownership;
- deterministic behavior;
- failure handling;
- fallback behavior;
- boundaries;
- safety and security.

Avoid product/game implementation context unless the workflow directly depends on it.

When all numbered design items are approved, proceed to `#PLAN-PHASE-1#`.

#PLAN-PHASE-1#

List all approved numbered items as the final intended-behavior contract.

Do not introduce new behavior, requirements, maintenance, or implementation scope in this summary.

Ask for final approval of the complete numbered contract.

If the user changes an item, return to the applicable `#GAME#` or `#WORKFLOW#` discussion for that item.

Once the complete numbered contract is approved, proceed to `#PLAN-PHASE-2#`.

#PLAN-PHASE-2#

Phase 2 compiles a self-contained, execution-oriented Codex plan. Planner performs the workflow-policy selection and repository-context discovery once so Codex does not repeat that reasoning during normal execution.

## Policy selection

Search `policy/CODEX.md` for `#ENTRY#` and read only that entry section. Follow its Planner-side routing to the relevant implementation policy:
- IMPLEMENT → `policy/IMPLEMENT.md#ENTRY#`
- FIX → `policy/FIX.md#ENTRY#`

Load only additional task-specific policy sections that the current task actually needs, such as orchestration, process overrides, strict execution, visual/client rules, KB rules, or another specialized policy source. Do not load optional policy merely because it exists.

Compile only the selected rules that materially constrain this task into the plan's `## 2. Task-Specific Policy`. Do not copy universal Codex rules already present in `AGENTS.md`, and do not require Codex to reread `policy/CODEX.md`, `policy/IMPLEMENT.md`, or `policy/FIX.md` during normal execution.

For approved WORKFLOW changes where authored policy or authored KB wording itself carries the intended behavior, include the exact replacement or insertion prose in the implementation plan. Codex integrates that approved prose without paraphrasing it. Generated KB routers and maps remain tooling-owned.

## Defaults and overrides

Repository defaults are implicit and must not be repeated in the plan.

Do not include BARE process-control values when the task uses the default process profile. Include only non-default process controls or an explicitly selected non-default profile under `## Execution Overrides`.

Do not state SINGLE execution when the task uses the default single-run execution shape. Include ORCHESTRATED only when orchestration is intentionally selected.

Do not place Codex runtime identity, current model, or current effort in the plan. Planner may still recommend a model and effort to the user in the accompanying ChatGPT reply. For ORCHESTRATED work, worker configuration may appear in the execution override only when it is required to dispatch the planned worker units; it is configuration guidance, not a Codex runtime identity check.

`## Execution Overrides` exists only when at least one non-default execution rule applies, such as:
- ORCHESTRATED;
- `strict_execution=ON`;
- a non-default process control or process profile;
- explicitly authorized generic QA tooling;
- explicitly authorized Git, deployment, or another normally prohibited external action;
- another task-specific execution constraint that changes the default Codex path.

## Execution-shape planning

Use the default single-run shape when one cohesive Codex implementation is the safer or more efficient execution unit. Do not write that default into the plan.

Select ORCHESTRATED only when multiple coherent implementation responsibilities have boundaries that materially reduce context reconstruction, enable useful safe concurrency, or improve integration control enough to justify orchestration overhead. Do not orchestrate merely because a task may approach a context window; compaction is allowed.

When ORCHESTRATED is selected, read `policy/CODEX.md#ORCHESTRATION#` and compile the required orchestration contract into `## Execution Overrides`.

## Standard Phase 2 format

Every Phase 2 plan uses the following core sections in this order.

### `## 1. Intended Behavior`

Copy the intended behavior approved by the user during Plan Phase 1. Preserve the approved numbered contract and its meaning. Do not reinterpret, expand, or redesign it during Phase 2.

### `## 2. Task-Specific Policy`

Provide only the policy rules selected for this task from the Planner-side policy sources. Keep them compact and executable. Do not repeat universal `AGENTS.md` rules.

### `## 3. Context`

Include these subsections:

#### `### Compacted KB Context`

Summarize the implementation-relevant KB prose already read by Planner. Preserve the current system contracts, ownership, boundaries, invariants, and relationships Codex needs, while removing history, repetition, and unrelated detail. This compacted summary is Codex's primary KB context.

#### `### KB Retrieval Inputs`

List the exact canonical KB concept IDs or exact aliases Planner used or identified as relevant, with a short statement of when deeper retrieval may be needed. These inputs are a fallback for further detail, not mandatory startup reads.

#### `### Source Context`

List the exact current source files Codex should inspect, with the relevant bounded section, symbol, or range and why it matters to this implementation. Planner must contextualize far enough that this list is evidence-based rather than guessed.

### `## 4. Expected Write Scope`

List the likely exact files Planner expects the task to modify.

Use:
- `### Direct Edits` for authored files Codex is expected to change.
- `### Generated Outputs` only when deterministic generation is expected to produce changed files.

This is an evidence-based expected scope, not a hard whitelist by default. Codex may use its stronger current-source understanding to add a proven direct task dependency or bounded task-local refactor when needed for a complete or materially cleaner implementation, while remaining inside the approved behavior and universal scope boundaries.

If `strict_execution=ON` is selected, the plan must make the prescribed direct-write scope and implementation constraints explicit because Codex may not autonomously expand them.

### `## 5. Implementation`

Provide ordered, concrete implementation requirements tied to the approved behavior, compacted context, source context, and expected write scope.

Specify what must change and any material interfaces, invariants, sequencing, compatibility requirements, or exact authored prose. Do not unnecessarily prescribe low-level coding choices that current source evidence is better positioned for Codex to decide unless strict execution is intentionally enabled.

### `## 6. Verification`

Specify only the minimum task-required verification. Prefer exact existing commands or deterministic checks when current repository evidence makes them known.

Include required task ownership, patch-integrity, repository-consistency, generated-output, and requested build mechanics when applicable. Add executable regression QA or permanent QA coverage only when an applicable execution override or explicit approved requirement enables it.

### `## 7. Done Criteria`

State compact observable conditions that mean the approved intended behavior has been implemented successfully and the required verification/closure is complete.

### `## Execution Overrides`

Append this section only when at least one non-default execution rule applies. Omit the entire section for the normal default path.

## Plan quality

Phase 2 is not ready until Planner has enough current evidence to provide the compacted KB context, exact source context, and likely exact write files required for a highly execution-oriented handoff.

Keep unrelated maintenance out of scope. Do not repeat the same requirement across multiple sections or restate defaults that Codex already receives from repository policy/tooling.

Deliver the implementation plan as a downloadable Markdown artifact named:

`[short-task-name].md`

In the accompanying ChatGPT reply, state:
- task complexity;
- recommended model and effort for the implementation run, or orchestrator plus worker recommendations when ORCHESTRATED;
- a short reason for the recommendation.

Do not put the default execution mode, BARE controls, or the current Codex runtime identity/model/effort into the plan merely to mirror the accompanying recommendation.

After delivering the Phase 2 plan, stop. Implementation belongs to Codex.

If the user later reports implementation completion with `Done. QA.` or an equivalent post-implementation review request, search `policy/REVIEWER.md` for `#ENTRY#` and continue from that route.
