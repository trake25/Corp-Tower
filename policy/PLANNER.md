#ENTRY#

For repository-dependent planning, follow `policy/CHATGPT.md`'s repository-contextualization contract.

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

Summarize intended behavior as technical product behavior, including only relevant inputs, outputs, deterministic behavior, failure/fallback handling, boundaries, safety, and security.

When all numbered design items are approved, proceed to `#PLAN-PHASE-1#`.

#PLAN-PHASE-1#

List all approved numbered items as the final intended-behavior contract.

Do not introduce new behavior, maintenance, or implementation scope.

Ask for final approval. If the user changes an item, return to the applicable design section.

Once the complete numbered contract is approved, proceed to `#PLAN-PHASE-2#`.

#PLAN-PHASE-2#

Phase 2 is a self-contained execution handoff.

Only at Phase 2, contextualize far enough to establish:
- relevant durable system contracts when material;
- exact bounded source files/sections Codex should inspect;
- likely direct-edit files;
- authored KB/docs and generated outputs expected to change;
- minimum verification needed to prove completion.

Do not guess implementation files merely to make a plan look complete.

## Policy selection

Read `policy/CODEX.md#ENTRY#` and follow only the implementation and conditional sections it selects for the task.

Compile only selected task policy into `## 2. Task-Specific Policy` and any exact non-default process assignments required by CODEX policy into `## Execution Overrides`.

Do not copy universal `AGENTS.md` rules or duplicate CODEX routing/process prose in the plan.

Repository agent-policy/adapter Markdown is user-owned manual configuration. If approved behavior requires changing `AGENTS.md`, `policy/*.md`, or `CLAUDE.md`, ChatGPT provides complete replacement files for the user to apply before Codex implementation. Never assign those files to Codex write scope.

## PLAN-PHASE-2-B (Scenario based only)

If completing the task requires user manual intervention outside ordinary manual game testing, also create a detailed current runbook `.md` for those steps.

## Context ownership

The plan has exactly three authority layers:

1. `AGENTS.md` — universal Codex execution policy.
2. Phase 2 task policy — only policy selected for this task.
3. Planner-selected repository context — current source plus KB evidence only where semantic or durable-contract context is materially needed.

Do not use or route through agent skills.

## Defaults and selected policy

Normal single-run execution and default process values are implicit.

Follow `policy/CODEX.md` for any non-default process encoding or selected execution shape. Do not restate universal closeout mechanics from `AGENTS.md`.

## Execution-shape planning

Use the default single-run shape unless semantic decomposition materially reduces reconstruction/integration risk.

If ORCHESTRATED is selected, follow `policy/CODEX.md#ORCHESTRATION#` and state `Execution shape: ORCHESTRATED` exactly once in `## 2. Task-Specific Policy`.

## Standard Phase 2 format

Every plan uses:

### `## 1. Intended Behavior`

Copy the approved Phase 1 numbered contract without reinterpretation.

### `## 2. Task-Specific Policy`

Include only selected task policy.

### `## 3. Context`

#### `### Compacted KB Context`

Include only implementation-relevant KB prose actually used by Planner. If no KB semantic context was materially required, state `None required`.

#### `### KB Retrieval Inputs`

List exact canonical concept IDs and Planner-resolved aliases only when Codex may materially need deeper KB detail during implementation. If none are needed, state `None required`.

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

For Godot/client work, select headless smoke/GUT when needed to prove implementation correctness. Rendered/visual verification is optional and must be selected explicitly only when visual judgment materially helps prove the approved behavior. If selected verification later cannot run because of tooling/environment limitations, the implementor reports that limitation; Planner does not pre-disable the required check or change archival/publication defaults.

### `## 7. Done Criteria`

State observable task completion conditions only. Do not repeat universal archival or publication mechanics from `AGENTS.md`.

### `## Execution Overrides`

Append only when required by selected non-default policy.

## Plan quality and delivery

Phase 2 is ready only when current evidence supports its source context, likely write scope, verification, and any KB semantic context actually required.

Keep unrelated maintenance out of scope and do not repeat requirements across sections.

Deliver the plan as `[short-task-name].md`.

In the accompanying reply state task complexity, recommended model/effort, and a short reason. Follow any selected CODEX policy that requires an out-of-plan user instruction.

After delivering Phase 2, stop. Implementation belongs to Codex.

If the user later requests post-implementation QA, route through `policy/REVIEWER.md#ENTRY#`.
