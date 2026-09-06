#ENTRY#

Planner uses this policy for Phase 2 when the task restores confirmed intended existing behavior for an authorized defect or regression.

Before producing the fix plan, establish from current repository evidence:
- the observed defect;
- the intended existing behavior;
- the affected boundary and responsible source;
- the likely exact files required for the repair;
- the minimum verification that exercises the repaired behavior.

Select only the rules below that materially constrain the current fix and compile them into `## 2. Task-Specific Policy`. Do not copy the section mechanically, and do not repeat universal `AGENTS.md` rules.

Fix policy candidates:
- Restore the confirmed intended behavior; do not silently redesign it.
- Make the smallest complete repair that resolves the defect, while allowing a bounded task-local refactor or modularization when current source evidence shows it is necessary for a correct or materially cleaner restoration and `strict_execution=ON` is not selected.
- Preserve behavior outside the confirmed repair boundary unless current evidence proves a direct dependency is required to restore the approved behavior.
- If repository evidence shows the requested repair requires a new product or workflow decision rather than restoration, stop the fix path and return that decision to ChatGPT planning.
- Update authored KB prose only when the durable current contract actually changes within the authorized repair or the existing KB contract is demonstrably incorrect. Keep KB prose about the current system, never bug chronology or repair history.
- Verification must exercise the repaired behavior at the minimum level required by the plan. A manually discovered bug is a regression candidate, not automatic authorization for permanent QA coverage.
- Add or update permanent regression coverage only when the approved fix or an execution override explicitly authorizes it.

During Phase 2, Planner should include only the applicable items above, plus any more specific task policy selected from relevant repository policy/skill sources.
