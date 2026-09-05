# Top or Drop — New Agent Workflow Overview

## A. Universal policy plus on-demand contextualization

The repository workflow is branched instead of role-heavy.

Every session starts from a very small universal router. The runtime selects the correct workflow family, then the task selects only the policy branch it needs.

Repository knowledge is not preloaded by broad roles such as client engineer, server engineer, or QA engineer. The active agent uses the KB Tree to resolve one semantic concept at a time and reads only the owning concept prose, the generated locator-map section for that concept, and the bounded source evidence explicitly granted by it.

If another fact becomes necessary later, the agent returns to the KB Tree router and resolves another concept. Adjacency is a possible next route, never permission to preload neighboring knowledge.

This keeps ordinary tasks from loading unrelated contracts. A client task does not automatically load pressed-state, glass treatment, rendered verification, networking, or gameplay authority unless the task actually needs them.

## B. Deterministic workflow mechanics belong to tooling

Mechanical work should not consume cloud-model reasoning tokens when repository tooling can perform it deterministically.

Tooling owns repeatable operations such as explicit task-owned scope, generated KB routing and maps, QA selection, validation, compact execution summaries, close-out receipts, plan archival, workflow observability, and publication gates.

The LLM supplies intent and judgment. It should not manually reconstruct deterministic mappings or consume verbose successful output when a compact tool result is sufficient.

## C. Cloud LLMs remain the reasoning layer

ChatGPT and Codex still perform the reasoning that cannot be reduced to deterministic rules.

ChatGPT owns product and workflow design, planning, review, bug diagnosis, research, and maintenance coordination.

Codex owns authorized repository implementation and confirmed bug repair.

Both must strictly follow workflow branching so each session contextualizes only what it needs, modifies only task-owned scope, invokes only relevant tools, verifies only the affected contract and integration risk, repairs only task-caused failures, avoids unrelated maintenance, and stops when required intent is ambiguous instead of inventing behavior.

The goal is not less reasoning. The goal is to spend reasoning only where judgment is required.

## D. Knowledge, policy, source, and tooling have separate ownership

The system separates four kinds of information:

- **Policy** — how the agent must reason, scope work, obtain authorization, or stop.
- **KB Tree** — durable current-system behavior, mechanism, rationale, invariants, and ownership boundaries.
- **Source** — exact implementation detail, current values, symbols, and local behavior.
- **Tooling** — deterministic repository mechanics and generated state.

Working material such as plans, references, reports, repair handoffs, and machine state is not KB evidence unless an explicit task route authorizes that exact material.

## E. KB Tree prose is current-system knowledge, not a scratchpad

Each KB Tree concept owns one semantic responsibility.

Concept prose explains only the current system contract needed before source inspection. It does not preserve task history, fixed-bug chronology, abandoned approaches, file or scene inventories, routine copied defaults, tunable values already owned by source, or duplicated neighboring contracts.

Generated maps locate implementation. Source retains exact local detail.

## F. Implementation workflow

The Codex implementation path is:

`AGENTS.md → CODEX.md → IMPLEMENT.md → KB Tree concept → bounded source → edit → KB Tree loop when more context is needed → semantic KB update when required → deterministic task-close / QA → result`

The authorized user task or approved ChatGPT implementation plan is the task contract.

If implementation creates or changes a durable system contract, Codex updates the owning KB Tree concept. If a genuinely new semantic responsibility is created, Codex creates the smallest concept that owns it.

Unrelated defects and maintenance do not expand the task.

## G. Fix workflow

The Codex repair path is:

`AGENTS.md → CODEX.md → FIX.md → defect evidence → KB Tree concept → bounded source → smallest complete restoration → deterministic QA → result`

FIX restores intended existing behavior. It does not redesign behavior.

If repository evidence shows that the requested repair actually requires a product or workflow design decision, Codex stops and reports the conflict. The user returns to ChatGPT to design and approve the new behavior before Codex implementation resumes.

A manually discovered bug is a regression candidate, not automatic justification for permanent QA.

## H. Review workflow

A fresh ChatGPT review session routes through the normal runtime and Reviewer entry.

A continued Planner session can transition directly into Reviewer without rereading planning policy already present in the session.

Reviewer reads only the required context branch and review type, inspects actual repository evidence, and distinguishes implementation defects, verification/tooling failures, and unrelated maintenance.

Codex summaries are not proof; the repository and deterministic evidence are.

## I. Token-efficiency principle

The workflow optimizes provider usage through three controls:

1. **Sparse policy reads** — only the active branch is loaded.
2. **Sparse knowledge retrieval** — only required KB Tree concepts and bounded source evidence are loaded.
3. **Deterministic execution** — repeatable mechanics and verbose proof stay inside tooling, with compact results returned to the LLM.

The cloud model therefore spends most of its context and reasoning budget on task-specific decisions that actually require intelligence.
