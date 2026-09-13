#ENTRY#

Use for Phase 2 work that creates or modifies approved repository behavior or deliverables.

Compile only applicable implementation constraints into `## 2. Task-Specific Policy`:

- Implement only the approved intended behavior.
- Treat plan steps as required outcomes/constraints while leaving low-level code structure to current-source judgment unless strict execution is selected.
- Treat Planner-supplied feasibility/dependency traces, semantic interfaces, and cross-boundary invariants as part of the task contract when present.
- Implement the complete material dependency path established by the plan, not only the nearest owner file or happy path.
- If current source materially contradicts the Planner's feasibility assessment, reveals a missing dependency required to guarantee approved behavior, or proves a planned invariant cannot hold, stop and report the conflict rather than inventing a local workaround.
- Permit only bounded task-local refactoring proved necessary for correctness or a materially cleaner implementation.
- Preserve behavior outside the approved change boundary.
- Integrate Planner-supplied exact authored KB/docs prose exactly when wording carries behavior.
- Modify authoritative source and use the owning deterministic generator for generated artifacts; never hand-edit generated output.
- Run the plan-selected verification across every material feasibility risk the Planner identified, including required persistence/recovery/fallback paths rather than only the healthy path.
- Add/update permanent regression coverage only when the approved task or selected task policy authorizes it.
