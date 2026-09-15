#ENTRY#

Identify context:
- CONTINUED — this session already has the approved behavior/plan.
- FRESH — reconstruct the contract from current repository evidence.

Identify type:
- QA — review completed or exact pre-integration work.
- BUG — investigate a defect/regression.

Read the matching context and type sections.

#CONTINUED#

Use the approved behavior/plan already present.

For orchestrated work, the approved parent plan is the implementation contract.

For independent integration, the task plan remains behavior authority. Other agents' plans/transcripts do not.

#FRESH#

Reconstruct the behavior contract from current source, plan, exact revision, receipts, KB/maps, history, and other evidence as needed. Do not optimize Reviewer contextualization for provider-token savings.

## QA

Inspect actual repository evidence, not Implementor summaries.

Review surface:
- INTEGRATED — verify current integrated state.
- PRE-INTEGRATION — verify the exact task/candidate revision against current `main`.

Use whatever repository context is needed for confidence. Inspect intersecting features and relevant edge cases, including failure/recovery, stale/duplicate state, timing, compatibility, integration overlap, persistence, reconnect/resync, and lifecycle boundaries.

When the plan contains a feasibility/dependency trace or explicit cross-boundary invariants, verify those declared boundaries first:
- confirm the complete material path is implemented;
- confirm affected intersections still hold;
- confirm verification exercises material risks;
- for PRE-INTEGRATION, confirm current-main behavior outside scope is preserved and finalization matches the candidate.

Also inspect additional dependencies the Planner may have missed. Do not treat Planner feasibility as proof.

Classify findings:
- implementation defect
- integration defect
- verification/tooling issue
- unrelated maintenance

Permanent QA should protect durable behavior, not tunables, copy, pixels, calibration, or private implementation detail.

Report one:
- PASS
- FIX REQUIRED
- MAINTENANCE
- BLOCKED

PRE-INTEGRATION PASS clears only the reviewed revision. INTEGRATED PASS proceeds to user manual testing. FIX REQUIRED continues to BUG. Unrelated maintenance routes to `MAINTENANCE.md`.

#BUG#

Use broad enough current evidence to establish:
- observed behavior;
- intended behavior;
- full affected/intersecting boundary;
- issue classification and edge cases.

For player bugs, state player-observable behavior. For workflow bugs, state technical behavior.

For orchestrated work, identify whether the repair is worker-local or cross-unit. For independent integration, compare the task revision, current `main`, and affected intersections.

If the defect exposes incomplete Planner feasibility, make that lapse explicit so the repair closes the full boundary.

If a new decision is needed, present only material numbered decisions. Otherwise route through `PLANNER.md#ENTRY#` for a focused fix plan.

After implementation and `Done. QA.`, return to QA.
