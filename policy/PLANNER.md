#ENTRY#

Use `KB/docs/context/index.md` as the repository-context router.

For repo-dependent planning:
- Search the KB router for the single concept or exact alias that best matches the current information need. Do not read the router in full.
- Read only that concept's owning prose leaf, generated concept-map section, and source evidence explicitly granted by that concept.
- Do not automatically load adjacent concepts or widen into uncontrolled repository search.
- At any point before the planning task is complete, if more repository context is required, return to `KB/docs/context/index.md` and resolve the next required concept. Repeat this loop only as needed until contextualization is sufficient.
- If exact retrieval cannot resolve required context, follow the model-level KB retrieval transport/fallback contract and report any resulting retrieval defect.

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

## Execution mode planning

Assess the approved task's execution shape before writing the implementation plan:

- SINGLE — one cohesive Codex implementation run is the safer or more efficient execution unit.
- ORCHESTRATED — the task has multiple coherent implementation responsibilities whose bounded delegation materially reduces context reconstruction, enables useful safe concurrency, or improves integration control enough to justify orchestration overhead.

Do not choose ORCHESTRATED only because the task may approach a model context window. Compaction is allowed. Decompose by semantic responsibility, dependency boundaries, architectural coupling, integration risk, and expected context-reconstruction cost.

Prefer SINGLE when splitting would make multiple agents rediscover the same implementation state or when the work is too tightly coupled to create independently verifiable units.

For either mode, base the plan on:
- the approved numbered contract;
- current repository state;
- only the KB concepts and bounded source evidence required to scope implementation.

Every plan must state:
- execution mode;
- scope;
- approved intended behavior;
- implementation boundaries;
- verification expectations;
- directly affected documentation;
- any explicitly authorized generic QA tooling;
- recommended Codex model and effort.

Select only model names supported by current authoritative Codex/product configuration. Do not invent model names. Allowed effort recommendations are Medium, High, xHigh, Max, and Ultra where supported.

For SINGLE, recommend the model and effort for that implementation run.

For ORCHESTRATED:
- Create one authoritative parent implementation plan.
- Define coherent semantic worker units, their dependencies, what each unit produces or consumes, shared invariants or interfaces, and parent-level acceptance criteria.
- Identify material likely write-overlap or sequencing risks when current evidence makes them knowable, but do not inspect unnecessary source merely to predict every changed file.
- Recommend an orchestrator/integrator model and effort and a model and effort for each worker unit. Different worker units may use different recommendations.
- The orchestrator recommendation must be at least as capable as the strongest worker recommendation, and its effort must be at least the highest worker effort. If authoritative model capability ordering is unavailable, use the same model as the strongest worker requirement rather than guessing that another model is stronger.
- The parent plan authorizes the orchestrator to refine executable decomposition against current repository evidence by merging, splitting, ordering, or serializing worker units without changing approved intended behavior or adding unrelated scope.
- The parent plan must require dependency-aware execution waves rather than maximum parallelism, one active writer for each shared mutable path, bounded worker context, compact worker handoffs, same-worker repair reuse when a failure remains inside that worker's ownership, and parent-level integration verification.
- Isolated branches or worktrees are exceptional. Include them only when their parallelism benefit justifies merge and cleanup overhead and the required Git operation is explicitly authorized.

For approved WORKFLOW changes where policy or authored KB wording itself carries the intended behavior, write the exact replacement or insertion prose in the plan. Codex integrates that approved prose without paraphrasing it. Generated KB routers and maps remain tooling-owned.

Keep unrelated maintenance out of scope.

Do not repeat the same requirements across multiple sections or use redundant wording.

Deliver the implementation plan as a downloadable Markdown artifact named:

`[short-task-name].md`

In the accompanying ChatGPT reply, state:
- task complexity;
- execution mode;
- recommended model and effort for SINGLE, or orchestrator plus worker recommendations for ORCHESTRATED;
- a short reason for the recommendation.

After delivering the Phase 2 plan, stop. Implementation belongs to Codex.

If the user later reports implementation completion with `Done. QA.` or an equivalent post-implementation review request, search `policy/REVIEWER.md` for `#ENTRY#` and continue from that route.
