#ENTRY#

Use for Phase 2 work that restores confirmed intended existing behavior.

Before producing the fix plan, establish:
- the observed defect;
- the confirmed intended behavior;
- the affected boundary and responsible source;
- the likely repair files;
- the minimum verification that exercises the repaired behavior.

Compile only applicable fix constraints into `## 2. Task-Specific Policy`:

- Restore confirmed intended behavior; do not redesign it.
- Make the smallest complete repair, allowing only bounded task-local refactoring proved necessary for correctness or a materially cleaner restoration.
- Preserve behavior outside the confirmed repair boundary unless current evidence proves a direct dependency.
- If repair requires a new product/workflow decision rather than restoration, return that decision to planning.
- Update authored KB prose only when the durable current contract changes or existing KB prose is demonstrably wrong. Keep KB prose about the current system, not bug chronology.
- Verification must exercise the repaired behavior at the minimum level required by the plan.
- Add/update permanent regression coverage only when the approved fix or selected task policy authorizes it.
