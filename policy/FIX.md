#ENTRY#

Restore the confirmed intended behavior for the authorized defect.

Use the KB context loop from `policy/CODEX.md` only as needed to understand the affected boundary.

Before editing, establish from current repository evidence:
- the observed defect;
- the intended existing behavior;
- the task-owned source responsible for the defect.

Make the smallest complete repair that restores the intended behavior.

Do not redesign intended behavior under FIX.

If repository evidence shows that the repair requires a product or workflow design decision rather than restoration, stop and tell the user what conflict was found. The redesign must be planned with ChatGPT before implementation returns to Codex.

Update KB prose only when the durable current contract changes within the authorized fix or the existing KB contract is demonstrably incorrect.

When KB changes are required, read and follow `KB/docs/context/CONCEPT-SCHEMA.md`. Keep the prose about the current system, never the bug chronology or repair history.

Do not hand-edit generated KB routers or concept maps. Use the repository's deterministic tooling.

Verification must exercise the repaired behavior through the existing task-close and QA path.

A manually discovered bug is a regression candidate, not automatic justification for permanent QA. Reuse existing coverage by default; add or update permanent coverage only when it protects a durable regression contract within the authorized fix.

Repair task-caused failures before closing.

Keep unrelated maintenance outside the fix and hand it off through the repository's maintenance path when required.

After successful close-out, stop and report the repair result.
