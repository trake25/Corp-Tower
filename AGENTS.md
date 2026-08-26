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
   scope. For an
   assessment that needs no manifest, use
   `node scripts/context.mjs route` or `scope <task-owned-path>...`. Game
   knowledge starts at `docs/context/index.md`; portfolio knowledge at
   `site/docs/index.md`.
3. Treat `context.mjs` as the primary retrieval tool. Start `search` with one
   stable product anchor — a named screen, node, signal, file, or feature — not
   a narrative symptom sentence: every query term must match one result. Use
   `search <anchor> --anchor` when the anchor is known. Otherwise obey the exact
   command returned by `needs-anchor` or `needs-filter` before reading source.
4. `rg` source fallback is allowed only for `retrieval-defect` or `tool-error`,
   starting in the smallest routed root. Record the fallback in the manifest and
   repair the route, map purpose, alias, budget or tool in the same task with a
   passing benchmark fixture. Unfamiliar CLI usage is never a fallback trigger.
5. The CLI's `bundle` writes the bounded, upload-safe KB/map handoff under
   ignored `.agent-state/automation/`. The protocol and limits are in
   `docs/context/automation.md`.

A confirmed retrieval miss, suggestion loop, invalid source target or budget
breach is a retrieval-system defect. Repair it in the same task under
`docs-steward`, unless the correct behavior needs a user decision.

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

Generated observability state belongs under ignored
`.agent-state/telemetry/`. `report/**` is non-context output: normal retrieval,
indexing, file discovery and broad-search fallback must exclude it. Only
observability tooling or an explicit human request may read reports. The host
collects telemetry locally; agents never create a provider call solely to
record it or read historical reports during ordinary work.

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
- Product source under the server app and Godot client has no comments.
  `scripts/`, `.github/`, and `site/` retain useful comments; never remove a
  `SAFETY EXCEPTION` comment.
- Finish repository changes through that manifest: `review` the explicit final
  paths after source edits, own and update any selected KB docs, then `close`
  with the documentation decision. It owns QA selection, map generation and
  relevant KB checks; it never reads a shared dirty worktree for scope.
- Files over 600 lines are decomposition candidates. Propose a split; do not
  expand the current task without approval.
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
- `plan/`, `task/`, and `reference/` are human-maintained working material. They
  cannot
  satisfy documentation citations or become knowledge-base dependencies.

## Delegation

Role policies normally load sequentially in one agent. Delegate only when the
active environment supports it and the task clearly benefits from independent
parallel work; higher-level agent policies and user instructions control it.

## Completion

Use the passing `task-close` receipt as the QA/docs-steward handoff.
