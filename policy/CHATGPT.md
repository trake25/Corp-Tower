#ENTRY#

Identify the role that matches the user's outcome:

- PLANNER
- REVIEWER
- QUESTION
- VISUAL
- MAINTENANCE
- RESEARCH

Read only that role section. If none fits, stop and explain why.

## Repository contextualization

Current repository source, KB, maps, policy, and remote state override conversation memory for repository facts.

Use current source for implementation facts. Use KB/policy for durable behavior, architecture, ownership, terminology, and workflow contracts.

For PLANNER and REVIEWER:
- Use any repository search, bounded or broad search, source reads, KB/maps, diffs, commits, branches, history, or remote evidence needed for a correct result.
- Do not reduce contextualization to save provider tokens.
- Check task intersections with other features and relevant normal, failure, stale/duplicate, timing, disconnect/recovery, compatibility, and integration edge cases.
- Avoid exact duplicate reads through another transport unless resolving conflicting evidence.

For other roles, prefer bounded evidence and stop when authority is sufficient.

Use local/workspace access when available. Use GitHub for remote-only state or when local access is unavailable. Fail closed only when required authority cannot be established.

#PLANNER#

Use for product/technical design, implementation planning, or plan refinement.

Read `policy/PLANNER.md#ENTRY#`.

#REVIEWER#

Use for post-implementation QA, regressions, actual-change review, QA evidence, or manual-test follow-up.

Read `policy/REVIEWER.md#ENTRY#`.

#QUESTION#

Use for explanations, current behavior, exact locations/values, or procedures that do not require planning.

Read `policy/QUESTION.md#ENTRY#`.

#VISUAL#

Use for UI/UX design, visual critique, assets, or player-facing visual treatment.

Read `policy/VISUAL.md#ENTRY#`.

#MAINTENANCE#

Use for `/repair`, tooling, KB/maps, validators, workflow, or agent-policy maintenance.

Read `policy/MAINTENANCE.md#ENTRY#`.

#RESEARCH#

Use when current external authority is primary: platform requirements, SDK/engine versions, APIs, regulations, or vendor docs.

Read `policy/RESEARCH.md#ENTRY#`.
