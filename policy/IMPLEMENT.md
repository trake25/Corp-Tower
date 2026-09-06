#ENTRY#

Planner uses this policy for Phase 2 when the approved task creates or modifies repository behavior or deliverables rather than restoring a confirmed regression.

Select only the rules below that materially constrain the current task and compile them into `## 2. Task-Specific Policy`. Do not copy the section mechanically, and do not repeat universal `AGENTS.md` rules.

Implementation policy candidates:
- Implement the approved intended behavior without adding unapproved product or workflow behavior.
- Treat the Phase 2 implementation steps as required outcomes and constraints, while leaving low-level code structure to current-source implementation judgment unless `strict_execution=ON` is selected.
- Permit a bounded task-local refactor or modularization when current source evidence shows it is necessary for correctness or produces a materially cleaner implementation of the approved behavior. Do not turn that freedom into unrelated cleanup, architecture work, or speculative future generalization.
- Preserve existing external behavior outside the approved change boundary unless the Phase 1 contract explicitly changes it.
- When the approved task changes an authored policy or KB contract and Planner supplies exact replacement/insertion prose, integrate that prose exactly rather than paraphrasing it.
- When an expected generated artifact changes, modify its authoritative source and use the owning deterministic generator instead of hand-editing generated output.
- Add or update permanent regression coverage only when the approved task or an execution override explicitly authorizes that coverage work.

During Phase 2, Planner should include only the applicable items above, plus any more specific task policy selected from relevant repository policy/skill sources.
