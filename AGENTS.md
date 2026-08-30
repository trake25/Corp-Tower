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
   task reaches that phase.
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
   smallest root owned by the active role and repair a confirmed missing or stale
   KB router/map entry in the same task under `docs-steward`.
5. `scripts/context.mjs` remains a dormant retrieval experiment and portable
   bundle producer; it is not the normal agent router. Keep its implementation,
   fixtures, benchmarks and dedicated validation intact. Its protocol and limits
   are documented in `docs/context/automation.md`.

A confirmed retrieval miss, invalid source target or budget breach is a
retrieval-system defect. Repair it in the same task under `docs-steward`, unless
the correct behavior needs a user decision. A suggestion loop in the dormant
retrieval experiment is a tool defect, not a reason to route normal work through
another tool retry.

## Working material

The gitignored `plan/` folder is the place to look for existing task plans and
the place to save a new plan. Agents may read an existing plan for context, but
must not modify it unless the user instructs the edit or the agent asks and the
user approves it. Start a separate plan file when no edit approval exists. Once
the implementation is completely verified and closed, move its plan Markdown
file to `plan/done/`; never archive an unfinished plan.

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
Task-close writes a handoff only when an unresolved item exists, may rewrite
only its own run file, and never deletes one. Repair files are not normal
context, citations, maps, or publication paths; humans own the follow-up.

Generated observability state belongs under ignored
`.agent-state/telemetry/`. `report/**` is non-context output: normal retrieval,
indexing, file discovery and broad-search fallback must exclude it. Only
observability tooling or an explicit human request may read reports. The host
collects telemetry locally; agents never create a provider call solely to
record it or read historical reports during ordinary work.

`task-close prepare` starts and binds that private telemetry when Codex session
metadata is available; trusted repo hooks record bounded current-run evidence
and settle it after the closing response. If `task-close close` returns an
eligible workflow candidate, the same active agent may load
`workflow-inefficiency-flagging` and formalize it before the final response—do
not spawn an agent or add a provider turn. Missing host usage or identity must
remain partial and produce a named data-quality flag, never a fabricated total.

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
- Every implementation is verified in proportion to its risk, but verification
  does not automatically become permanent test coverage. Add or retain a test
  only for a rule, boundary, invariant, credible regression, meaningful UI
  structure, or release-critical smoke path. Exact copy, pixels, local defaults,
  private implementation and other source-obvious details are task evidence, not
  permanent suite obligations.
- Context docs explain how a feature works at the system and subsystem level
  before source is opened. They keep authority, flow, boundaries, rationale and
  live landmines; they do not repeat labels, scene inventories, private symbols,
  local defaults or details that become obvious in the routed source.
- Product source under the server app and Godot client has no comments.
  `scripts/`, `.github/`, and `site/` retain useful comments; never remove a
  `SAFETY EXCEPTION` comment.
- Finish repository changes through that manifest: `review` the explicit final
  paths after source edits, own and update any selected KB docs, then `close`
  with documentation and permanent-coverage decisions. It owns QA selection,
  map generation and relevant KB checks; it never reads a shared dirty worktree
  for scope.
- A changed first-party code file at roughly 900 lines is an advisory
  decomposition review candidate; at roughly 1200 lines it is a strong
  candidate. Neither signal invalidates the current task, requires a refactor,
  or expands scope without approval. Generated/content files, tests, docs/maps,
  and load-on-demand automation under `scripts/` are excluded. Judge that
  automation by cohesion, bounded output, interface tests and maintainability;
  length alone is a false positive.
- Do not deploy, commit, push, pull, compare remotes, create branches, or perform
  destructive operations unless the user authorizes that action.
- `scripts/git-sync-commit-push.mjs` is a load-on-demand Git automation tool. An
  agent may invoke it only after the user explicitly authorizes the operation and
  the command includes `--approve`; it fetches and fast-forward pulls before
  staging, commits, and pushes. It requires the current branch to be `main` by
  default; a different branch requires an explicitly supplied `--branch` and
  `--switch`, plus the user's approval to switch and push that branch. It reads
  `.agent-state/automation/close-out.json` by default and
  stages only a passing schema-2 manifest's `publish_paths` (schema 1 uses
  `changed_paths`); it derives at most three commit keywords from the manifest
  task title. Its commit format is those keywords followed by
  `v0.01`; related commits increment by `0.01`.
  For an explicitly approved branch backup publication, use `--push-only` with
  `--branch` and `--remote-branch`; this publishes only the existing local ref
  and never stages, commits, or switches the dirty worktree.
- `plan/`, `task/`, `reference/`, and `repair/` are isolated working
  material. They cannot satisfy documentation citations or become knowledge-base
  dependencies.

## Delegation

Role policies normally load sequentially in one agent. Delegate only when the
active environment supports it and the task clearly benefits from independent
parallel work; higher-level agent policies and user instructions control it.

## Completion

Use the closed `task-close` receipt as the QA/docs-steward handoff. A
`maintenance-blocked` receipt completes only when every failed check is an
unrelated classified maintenance blocker; task-caused defects stay open.
