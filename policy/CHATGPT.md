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

## KB retrieval transport

Reuse exact current concept evidence already available for the next step. When
new repository context is needed, select one canonical KB Tree concept or exact
alias, then prefer the available repository/GitHub connector to read its owning
prose leaf, generated map section, and granted source range.

If a known exact path or range cannot be fetched, use another available exact
repository transport for the same evidence. If exact KB and transport attempts
still cannot resolve it, a third fallback may broaden repository search solely
to diagnose and report the retrieval defect. Evidence found by that diagnostic
search is not ordinary task authority until the KB route is repaired or
explicitly re-established. Declared adjacency remains unloaded until selected.

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
