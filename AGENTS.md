# Corp Tower — agent entry

This file is the vendor-neutral repository contract. Load one role skill from
`.agents/skills/` for the task, then retrieve only the context needed.

## Retrieval

1. Select a role from the task: `client-engineer`, `server-engineer`,
   `fullstack-coordinator`, `infra-engineer`, `qa-engineer`, `web-designer`,
   `editorial`, or `docs-steward`. Workflows are `update-docs` and
   `compact-docs`; `workflow-inefficiency-flagging` is conditional and may load
   only after its current-run eligibility gate. Load only the role needed for
   the current phase; bring in QA or documentation workflow skills when the
   task reaches that phase. `update-docs` is the normal post-implementation
   doc-worthy gate; `docs-steward` is reserved for explicit documentation,
   validator, capacity, map, citation, or retrieval maintenance.
2. For an implementation, begin the task-close run with its explicit
   task-owned paths after bounded context retrieval and before the first file
   edit. Its intake is the canonical role route, KB/map, QA, validator and tool
   scope. Game knowledge starts at `docs/context/index.md`; portfolio knowledge
   at `site/docs/index.md`.
3. Use the selected KB index as the router. Read only the row for the task, then
   search its named document and map with one stable product anchor — a screen,
   node, signal, file, feature or exact term. Prefer
   `rg -n -i '<anchor>' <routed-doc-or-map>` and add a path or second term when
   the result is noisy. Do not search every KB document or load a generated map
   whole.
4. Read the smallest matching KB section and map row, then use the row's path and
   line for a bounded source read. If the map has no usable row, search only the
   smallest root owned by the active role and record a confirmed missing or stale
   KB router/map entry in `repair/` for planning/review follow-up.
5. `scripts/context.mjs` remains a dormant retrieval experiment and portable
   bundle producer; it is not the normal agent router. Keep its implementation,
   fixtures, benchmarks and dedicated validation intact. Its protocol and limits
   are documented in `docs/context/automation.md`.

A confirmed retrieval miss, invalid source target or budget breach is a
retrieval-system defect. Continue through the smallest-role-root fallback and
record it in `repair/`; do not repair retrieval infrastructure during an
unrelated product task. A suggestion loop in the dormant
retrieval experiment is a tool defect, not a reason to route normal work through
another tool retry.

## Working material

The gitignored `plan/` folder is the place to look for existing task plans and
the place to save a new plan. Agents may read an existing plan for context, but
must not modify it unless the user instructs the edit or the agent asks and the
user approves it. Start a separate plan file when no edit approval exists. Bind
an active implementation plan to `task-close`; successful lifecycle closure
archives it under `plan/done/`. Never archive an unfinished plan.

The gitignored `reference/` folder contains human-managed screen guides and bug
screenshots. Agents may read these references when the route calls for them;
humans may upload, modify, or delete the files there. Do not treat either
folder as tracked source, KB evidence, or a reason to search the whole repo.
Use `node scripts/context.mjs route plan/` or `route reference/` for the
standard workspace guidance.

`plan/`, `task/`, and `reference/` are human-maintained working material.
Automated tools must not create scratch, log, or output trees there; disposable
machine-generated output belongs in OS temporary storage or an explicitly
designated ignored machine-state/output location. A human may intentionally
save a requested retained artifact into working material.

The gitignored `repair/` folder holds close-out handoffs for unrelated
tooling, environment, capacity, retrieval-map, or advisory decomposition work.
Repair files are not context, citations, maps, or publication paths; humans own
the follow-up. Machine state under `.agent-state/` and output under `report/`
are also non-context. Close-out, handoff, observability, hook, and authorized
Git-tool behavior belong in `docs/context/automation.md`.

### Skill reuse

Load each selected role skill once per active context window, then reuse it for
all matching follow-up work in that window. Do not reread a `SKILL.md` merely
because the user sends a new message or narrows the current task.

Reload a skill only when the context was compacted, the task switches to a new
role, or a required referenced instruction was not previously read. Keep the
active skill names in the task's first working update or plan; if a reload is
needed, record its reason there. This makes a reload auditable instead of an
automatic reflex.

## Always

- The server is authoritative. The client renders `game_state`; it does not
  decide scoring, stability, legality, or another game outcome.
- Verify every implementation proportionately; `qa-engineer` owns selection,
  failure classification, and permanent-coverage procedure.
- Context docs explain how a feature works at the system and subsystem level
  before source is opened. They keep authority, flow, boundaries, rationale and
  live landmines; they do not repeat labels, scene inventories, private symbols,
  local defaults or details that become obvious in the routed source.
- Product source under the server app and Godot client has no comments.
  `scripts/`, `.github/`, and `site/` retain useful comments; never remove a
  `SAFETY EXCEPTION` comment.
- Finish repository changes through the explicit-path task-close manifest;
  `update-docs`, `qa-engineer`, and `docs/context/automation.md` own the
  close-out procedure.
- Do not deploy, commit, push, pull, compare remotes, create branches, or perform
  destructive operations unless the user authorizes that action.
- `plan/`, `task/`, `reference/`, and `repair/` are isolated working
  material. They cannot satisfy documentation citations or become knowledge-base
  dependencies.

## Delegation

Role policies normally load sequentially in one agent. Delegate only when the
active environment supports it and the task clearly benefits from independent
parallel work; higher-level agent policies and user instructions control it.

## Completion

Use the closed `task-close` receipt as the QA/planner handoff. A
`maintenance-blocked` receipt completes only when every failed check is an
unrelated classified maintenance blocker; task-caused defects stay open.
