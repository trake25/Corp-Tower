#ENTRY#

Use `KB/docs/context/index.md` as the repository-context router.

For repo-dependent planning:
- Resolve only the canonical concept or exact alias needed for the current information need.
- Read that concept's owning prose leaf, generated concept-map section, and explicitly granted source evidence.
- Do not automatically load adjacency or widen into uncontrolled repository search.
- When another information need remains, return to the router and resolve the next exact concept.
- If exact retrieval cannot resolve required context, follow `policy/CHATGPT.md`'s KB retrieval transport/fallback contract and report any retrieval defect.

Before Phase 2, contextualize far enough to establish:
- the relevant durable system contracts;
- the exact bounded source files/sections Codex should read;
- the likely direct-edit files;
- authored KB/docs and generated outputs expected to change;
- the minimum verification needed to prove completion.

Do not guess implementation files merely to make a plan look complete.

Identify the planning type:
- GAME
- WORKFLOW

Read only the matching section below.

For every planning task:
- Flag only material inconsistencies, constraints, or risks.
- Present decisions requiring approval as numbered items.
- When the user replies to a numbered list, any listed item they do not mention is considered approved.
- Continue design only for unresolved or newly introduced decisions.
- Do not create Phase 2 until all numbered design items are approved.
- Keep unrelated maintenance outside the task.

#GAME#

Use for player-facing product/game behavior: gameplay, UI/UX, screens, interactions, scoring, networking behavior visible to players, and related work.

Design from the player perspective. Summarize intended behavior in terms of what the player can observe, do, understand, or experience. Use implementation detail only when current repository constraints materially affect that behavior.

When all numbered design items are approved, proceed to `#PLAN-PHASE-1#`.

#WORKFLOW#

Use for tooling, repository workflow, QA infrastructure, agent workflow, KB/retrieval systems, CI/build tooling, documentation systems, maintenance infrastructure, and other non-player-facing technical workflow work.

Summarize intended behavior as technical product behavior, including only relevant inputs, outputs, ownership, deterministic behavior, failure/fallback handling, boundaries, safety, and security.

When all numbered design items are approved, proceed to `#PLAN-PHASE-1#`.

#PLAN-PHASE-1#

List all approved numbered items as the final intended-behavior contract.

Do not introduce new behavior, maintenance, or implementation scope.

Ask for final approval. If the user changes an item, return to the applicable design section.

Once the complete numbered contract is approved, proceed to `#PLAN-PHASE-2#`.

#PLAN-PHASE-2#

Phase 2 is a self-contained execution handoff. Planner performs policy selection and repository contextualization once so Codex does not repeat that reasoning.

## Policy selection

Read `policy/CODEX.md#ENTRY#`, classify the implementation as IMPLEMENT or FIX, then read only the matching entry:
- IMPLEMENT → `policy/IMPLEMENT.md#ENTRY#`
- FIX → `policy/FIX.md#ENTRY#`

Domain/task-scope knowledge comes from the KB Tree, never from runtime skills.

Optional execution/process policy is selected only when it actually applies:
- If the user requests process customization or "everything ON", read `policy/CODEX.md#PROCESS-ROUTER#`.
- If a specific non-default process is enabled, read only that process's exact section in `policy/CODEX.md`.
- If ORCHESTRATED execution is selected, read `policy/CODEX.md#ORCHESTRATION#` and the ownership section it requires.
- If strict execution is selected, read `policy/CODEX.md#STRICT-EXECUTION#`.

A default-OFF process is absent from the Phase 2 plan and absent from Codex runtime context. Do not name, explain, disable, or route through an optional process merely because its tooling exists.

Compile only the selected rules that materially constrain this task into `## 2. Task-Specific Policy` and, when needed, `## Execution Overrides`. Do not copy universal `AGENTS.md` rules into the plan.

Repository agent-policy/adapter Markdown is user-owned manual configuration. If approved behavior requires changing `AGENTS.md`, `policy/*.md`, or `CLAUDE.md`, ChatGPT provides the complete replacement file for the user to apply before Codex implementation. Never assign those files to Codex write scope.

## Context ownership

The plan has exactly three authority layers:
1. `AGENTS.md` — universal Codex execution policy.
2. Phase 2 task policy — only policy selected for this task.
3. KB/source context — domain/task-scope knowledge selected by Planner.

Do not use or route through agent skills. Do not copy domain instructions into universal policy.

## Defaults and selected policy

Normal single-run execution and default-OFF processes are implicit and omitted.

`## Execution Overrides` appears only when execution differs from defaults. The heading and encoding are Planner/tooling mechanics; `AGENTS.md` must not teach Codex how they work.

Plan archival is enabled by repository default. Treat it as a deterministic completion mechanic, not universal Codex policy prose. Unless explicitly disabled, include only the concrete archival completion action/criterion needed for the current plan.

## Execution-shape planning

Use the default single-run shape unless semantic decomposition materially reduces reconstruction/integration risk enough to justify coordination.

Select ORCHESTRATED only when that benefit is real. ORCHESTRATED requires the non-default ownership process; compile the ownership and orchestration rules into the task plan. Do not enable any other optional process merely because orchestration is selected.

## Standard Phase 2 format

Every plan uses:

### `## 1. Intended Behavior`
Copy the approved Phase 1 numbered contract without reinterpretation.

### `## 2. Task-Specific Policy`
Include only selected task policy. Default-OFF optional policy is completely absent.

### `## 3. Context`

#### `### Compacted KB Context`
Summarize implementation-relevant KB prose already read by Planner.

#### `### KB Retrieval Inputs`
List exact canonical concept IDs/aliases for deeper detail only if needed.

#### `### Source Context`
List exact current source files plus bounded symbols/sections Codex should inspect and why.

### `## 4. Expected Write Scope`

#### `### Direct Edits`
List likely authored files.

#### `### Generated Outputs`
List only deterministic generated outputs expected to change.

This is evidence-based expected scope, not a hard whitelist unless strict execution is selected. Policy/adapter files requiring manual replacement are never Codex direct edits.

### `## 5. Implementation`
Provide ordered required outcomes, material interfaces/invariants, compatibility constraints, and exact authored prose when wording carries behavior. Leave low-level code structure to current-source judgment unless strict execution is selected.

### `## 6. Verification`
Specify only minimum task-required verification plus consistency/generated mechanics required by actual changed scope or selected task policy.

### `## 7. Done Criteria`
State observable completion conditions. Include deterministic plan archival when enabled, without explaining the process-control system.

### `## Execution Overrides`
Append only when a non-default execution/process rule is selected.

## Plan quality and delivery

Phase 2 is not ready until current evidence supports its compacted KB context, source context, likely write scope, and verification.

Keep unrelated maintenance out of scope and do not repeat requirements across sections.

Deliver the plan as `[short-task-name].md`.

In the accompanying reply state task complexity, recommended model/effort, and a short reason. If manual policy/adapter replacements are required, provide them and tell the user to apply them before Codex. If telemetry is selected ON, tell the user outside the plan to start that implementation session through `node scripts/codex-task-run.mjs <phase-2-plan-path>`.

After delivering Phase 2, stop. Implementation belongs to Codex.

If the user later requests post-implementation QA, route through `policy/REVIEWER.md#ENTRY#`.
