#ENTRY#

Use `KB/docs/context/index.md` as the repository-context router.

For repo-dependent planning:
- Search the KB router for the single concept or exact alias that best matches the current information need. Do not read the router in full.
- Read only that concept's owning prose leaf, generated concept-map section, and source evidence explicitly granted by that concept.
- Do not automatically load adjacent concepts or widen into uncontrolled repository search.
- At any point before the planning task is complete, if more repository context is required, return to `KB/docs/context/index.md` and resolve the next required concept. Repeat this loop only as needed until contextualization is sufficient.
- If the KB cannot resolve required context and provides no valid route or fallback, stop and tell the user the exact reason.

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
- safety and security

Avoid product/game implementation context unless the workflow directly depends on it.

When all numbered design items are approved, proceed to `#PLAN-PHASE-1#`.

#PLAN-PHASE-1#

List all approved numbered items as the final intended-behavior contract.

Do not introduce new behavior, requirements, maintenance, or implementation scope in this summary.

Ask for final approval of the complete numbered contract.

If the user changes an item, return to the applicable `#GAME#` or `#WORKFLOW#` discussion for that item.

Once the complete numbered contract is approved, proceed to `#PLAN-PHASE-2#`.

#PLAN-PHASE-2#

Create one compact implementation plan for a single uninterrupted Codex run.

Base the plan on:
- the approved numbered contract;
- current repository state;
- only the KB concepts and bounded source evidence required to scope implementation.

The plan must state:
- scope;
- approved intended behavior;
- implementation boundaries;
- verification expectations;
- directly affected documentation;
- any explicitly authorized generic QA tooling.

Keep unrelated maintenance out of scope.

Do not repeat the same requirements across multiple sections or use redundant wording.

Deliver the implementation plan as a downloadable Markdown artifact named:

`[short-task-name].md`

In the accompanying ChatGPT reply, state:
- task complexity;
- recommended Codex model: Terra, Sol, Astra only;
- recommended effort: Medium, High, xHigh, Max only;
- a short reason for the model and effort recommendation.

After delivering the Phase 2 plan, stop. Implementation belongs to Codex.

If the user later reports implementation completion with `Done. QA.` or an equivalent post-implementation review request, search `policy/REVIEWER.md` for `#ENTRY#` and continue from that route.
