#ENTRY#

Identify the task role that best matches the user's requested outcome:

- PLANNER
- REVIEWER
- QUESTION
- VISUAL
- MAINTENANCE
- RESEARCH

Search this file for the matching role section, for example "#PLANNER#", and read only that section.

If the task does not fit any listed role, stop and immediately tell the user why no role matches.

## Repository contextualization

Reuse current repository evidence already available for the next decision.

When new repository context is needed:
- Prefer direct local/workspace repository search and bounded reads when that transport is available.
- Read a known exact path, symbol, or bounded section directly instead of routing through the KB first.
- Use bounded repository search to discover task-relevant implementation files or symbols when their exact location is not yet known.
- Treat current source discovered through direct repository search as ordinary authority for current implementation facts.
- Use the KB Tree when durable intended behavior, architecture, ownership, terminology, or another semantic contract materially helps the task. KB routing is a knowledge-selection aid, not a prerequisite or access-control gate for source discovery.
- When using the KB Tree, keep concept retrieval bounded: select only concepts that materially help the task and do not load adjacency automatically.
- Stop contextualizing once evidence is sufficient for the current decision instead of routing every information need through a separate concept transaction.

Do not duplicate the same evidence through multiple transports for reassurance. If direct local/workspace repository access is available, do not also use the GitHub connector for the same file or fact. Use the repository/GitHub connector when local repository access is unavailable, when the required evidence is remote-only, or when GitHub-specific state such as commits, branches, pull requests, or remote metadata is required.

If current source establishes an implementation fact but the task requires intended behavior or another durable semantic authority that source alone cannot establish, consult the relevant KB/policy evidence. Fail closed only when the missing authority is materially required to answer, plan, review, or implement safely.

#PLANNER#

Use for:

- designing intended product or technical behavior;
- creating an implementation plan;
- refining or narrowing an existing task or plan.

Search `policy/PLANNER.md` for `#ENTRY#` and read only that entry section.

#REVIEWER#

Use for:

- post-implementation QA;
- reviewing actual repository changes;
- investigating bugs or regressions;
- reviewing executable proof or QA receipts;
- manual-test follow-up.

Search `policy/REVIEWER.md` for `#ENTRY#` and read only that entry section.

#QUESTION#

Use when the user wants:

- an explanation;
- current repository behavior;
- an exact file, location, value, or procedure;
- an answer that does not require planning or implementation.

Search `policy/QUESTION.md` for `#ENTRY#` and read only that entry section.

#VISUAL#

Use for:

- UI/UX design;
- visual critique;
- image or asset generation;
- visual treatment of player-facing behavior.

Search `policy/VISUAL.md` for `#ENTRY#` and read only that entry section.

#MAINTENANCE#

Use for:

- "/repair" items;
- broken QA or repository tooling;
- KB, map, retrieval, validator, workflow, or agent-policy maintenance;
- maintenance triage that should remain separate from product implementation.

Search `policy/MAINTENANCE.md` for `#ENTRY#` and read only that entry section.

#RESEARCH#

Use when the task depends primarily on current external authoritative information such as:

- platform requirements;
- SDK or engine versions;
- external APIs;
- regulations;
- service or vendor documentation.

Search `policy/RESEARCH.md` for `#ENTRY#` and read only that entry section.
