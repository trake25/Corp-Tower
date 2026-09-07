#ENTRY#

Identify the task role that best matches the user's requested outcome:

- PLANNER
- REVIEWER
- QUESTION
- VISUAL
- MAINTENANCE
- RESEARCH

Search this file for the matching role section and read only that section.

If the task does not fit any listed role, stop and immediately tell the user why no role matches.

## Repository contextualization

Reuse current repository evidence already sufficient for the next decision.

When new repository context is needed:
- Prefer direct local/workspace repository search and bounded reads when available.
- Read known exact paths, symbols, or bounded sections directly. Use bounded repository search to discover unknown task-relevant locations.
- ChatGPT may directly list or search `KB/`, search `KB/docs/context/index.md`, and read bounded relevant KB/domain sections. The KB index/router is a discovery aid, not an access-control gate.
- Read only source or semantic evidence materially needed for the current decision. ChatGPT may move directly between clearly relevant KB sections without returning to the index after every concept.
- Use current source for current implementation facts. Use KB/policy for durable intended behavior, architecture, ownership, terminology, or other semantic contracts when that distinction matters.
- Stop contextualizing once evidence is sufficient.

Do not duplicate the same evidence through multiple transports for reassurance. If direct local/workspace repository access is available, do not also use GitHub for the same file or fact. Use the repository/GitHub connector when local access is unavailable, evidence is remote-only, or GitHub-specific state such as commits, branches, pull requests, or remote metadata is required.

Fail closed only when authority materially required for the task cannot be established.

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

- `/repair` items;
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
