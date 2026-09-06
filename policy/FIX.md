#ENTRY#

Planner uses this policy for Phase 2 when the task restores confirmed intended existing behavior for an authorized defect or regression.

Before producing the fix plan, establish from current repository evidence:
- the observed defect;
- the confirmed intended existing behavior;
- the affected boundary and responsible source;
- the likely exact files required for repair;
- the minimum verification that exercises the repaired behavior.

Select only rules that materially constrain the current fix and compile them into `## 2. Task-Specific Policy`. Do not repeat universal `AGENTS.md` rules.

Fix policy candidates:
- Restore confirmed intended behavior; do not silently redesign it.
- Make the smallest complete repair, allowing only a bounded task-local refactor that current source proves necessary for a correct/materially cleaner restoration when strict execution is not selected.
- Preserve behavior outside the confirmed repair boundary unless current evidence proves a direct dependency is required.
- If repair requires a new product/workflow decision rather than restoration, stop and return that decision to ChatGPT planning.
- Update authored KB prose only when the durable current contract actually changes within the authorized repair or the existing KB contract is demonstrably incorrect. Keep KB prose about the current system, not bug chronology.
- Verification must exercise the repaired behavior at the minimum level required by the plan. A manually discovered bug is a regression candidate, not automatic authorization for permanent coverage.
- Add/update permanent regression coverage only when the approved fix or selected task policy authorizes it.

Domain/task-scope constraints come from the plan's KB/source context. Do not route through agent skills.

During Phase 2, include only applicable items above plus exact conditional policy selected from `policy/CODEX.md`.
