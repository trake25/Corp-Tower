#ENTRY#

Planner uses this policy for Phase 2 when the approved task creates or modifies repository behavior or deliverables rather than restoring a confirmed regression.

Select only the rules that materially constrain the current task and compile them into `## 2. Task-Specific Policy`. Do not repeat universal `AGENTS.md` rules.

Implementation policy candidates:
- Implement the approved intended behavior without adding unapproved product or workflow behavior.
- Treat implementation steps as required outcomes/constraints while leaving low-level code structure to current-source judgment unless strict execution is selected.
- Permit only bounded task-local refactoring that current source proves necessary for correctness or a materially cleaner implementation of the approved behavior.
- Preserve external behavior outside the approved change boundary unless Phase 1 explicitly changes it.
- When Planner supplies exact authored KB/docs prose because wording carries behavior, integrate it exactly rather than paraphrasing it.
- Modify authoritative source and use the owning deterministic generator for generated artifacts; never hand-edit generated output.
- Add/update permanent regression coverage only when the approved task or selected task policy authorizes it.

Domain/task-scope constraints come from the plan's KB/source context. Do not route through agent skills.

During Phase 2, include only applicable items above plus exact conditional policy selected from `policy/CODEX.md`.
