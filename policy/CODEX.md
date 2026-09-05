#ENTRY#

Identify the execution type that best matches the authorized repository task:

- IMPLEMENT
- FIX

Search this file for the matching execution section, for example `#IMPLEMENT#`, and read only that section.

If the task does not fit either execution type, stop and immediately tell the user why no execution route matches.

#IMPLEMENT#

Use when authorized to create or modify approved repository behavior or deliverables, including product behavior, UI, gameplay, server or networking changes, tuning, tooling, workflow, documentation, build, CI, infrastructure, or a bounded refactor required by the task.

Search this file for `#EXECUTION#` and read only that section.

Then search `policy/IMPLEMENT.md` for `#ENTRY#` and read only that entry section.

#FIX#

Use when authorized to repair a confirmed bug or regression against intended existing behavior.

Do not use FIX to silently redesign intended behavior.

If repository evidence shows the requested repair requires a behavior or workflow redesign rather than restoration, stop and tell the user that the redesign must be planned with ChatGPT before returning to Codex.

Search this file for `#EXECUTION#` and read only that section.

Then search `policy/FIX.md` for `#ENTRY#` and read only that entry section.

#EXECUTION#

Use the authorized user task or approved implementation plan as the task contract.

Use `KB/docs/context/index.md` as the repository-context router.

For repository context:
- Resolve only the concept or exact alias needed for the current information need.
- Read only that concept's owning prose leaf, generated concept-map section, and source evidence explicitly granted by that concept.
- Return to the KB router whenever another concept is required.
- Do not automatically load adjacent concepts or widen into uncontrolled repository search.
- If required context cannot be resolved and no valid route or fallback exists, stop and report the exact reason.

## KB retrieval transport

Reuse exact current concept evidence already available for the next step. When
new repository context is needed, the model selects one canonical concept ID or
exact alias; tooling does not select it. Prefer `node scripts/context.mjs
concept-read <concept-id-or-exact-alias>` when local tooling is available, using
`concept-route` only when route metadata without prose is sufficient.

If that tool is unavailable or defective, perform the same exact manual KB Tree
route: router → one concept → owning prose leaf → generated map section →
granted bounded source. If that route also fails, stop and report the precise
retrieval/KB defect. Do not broaden repository search.

Working material under `plan/`, `task/`, `reference/`, `repair/`, `report/`, and `.agent-state/` is not KB evidence. Access an exact working-material item only when the active task or workflow explicitly requires it.

Once the initial task-owned paths are known, begin the repository `task-close` lifecycle before the first edit. Scope comes from the authorized task and resolved evidence, never from the dirty working tree. Amend ownership only for a proven direct task dependency.

Preserve unrelated concurrent changes.

Use deterministic repository tooling for generated outputs, QA selection, validation, maps, receipts, and close-out. Do not manually reproduce mechanics already owned by tooling.

If deterministic close-out returns an eligible workflow-inefficiency candidate, resolve `automation.observability.flags` and assess it in the already-required final provider turn. Otherwise load no flagging context.

Use existing permanent QA by default. Add or update permanent coverage only when it protects a durable product contract or credible regression within the authorized task. Do not encode tunables, current defaults, copy, pixels, calibration, or private implementation details as permanent contracts.

Existing `SAFETY EXCEPTION` comments must not be removed, weakened, or rewritten unless the authorized task explicitly retires the underlying safety condition. Keep the exact explanation local to the relevant source.

Generic QA infrastructure, reusable harnesses, validators, runners, selection logic, or other broad QA tooling may be changed only when explicitly authorized by the task contract.

Never weaken a valid check merely to make the task pass.

If current repository evidence materially conflicts with the authorized intended behavior or makes the required behavior ambiguous, stop and report the conflict instead of inventing a resolution.

Do not commit, push, pull, compare remotes, create or switch branches, deploy, apply, destroy, or perform another externally consequential or destructive operation unless the user explicitly authorizes that operation.
