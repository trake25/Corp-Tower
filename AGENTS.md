# Corp Tower — agent entry

This file is the vendor-neutral repository contract. Load one role skill from
`.agents/skills/` for the task, then retrieve only the context needed.

## Retrieval

1. Select a role from the task: `client-engineer`, `server-engineer`,
   `fullstack-coordinator`, `infra-engineer`, `qa-engineer`, `web-designer`,
   `editorial`, or `docs-steward`. Workflows are `update-docs` and
   `compact-docs`. Load the matching `SKILL.md` before editing.
2. For an implementation, begin with `task-close prepare` and its explicit
   task-owned paths. Its intake is the canonical role route, KB/map, QA and
   documentation scope. For an assessment that needs no manifest, use
   `node scripts/context.mjs route` or `scope <task-owned-path>...`. Game
   knowledge starts at `docs/context/index.md`; portfolio knowledge at
   `site/docs/index.md`.
3. Use the CLI's `search` or `filter` before an arbitrary KB read; it returns at
   most eight provenance-bearing KB/map results. Use `outline`, `section` or
   `symbol` only when the target is already known, then read source at the
   returned `path:line`.
4. The CLI's `bundle` writes the bounded, upload-safe KB/map handoff under
   ignored `task/`. The protocol and limits are in `docs/context/automation.md`.

A miss is a knowledge-base defect. Repair its route or map purpose in the same
task under `docs-steward`, unless the correct behavior needs a user decision.

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
- Finish repository changes through that manifest: record the documentation
  decision, then `verify` and `report`. It owns QA selection, map generation,
  relevant KB checks and report schema validation; it never reads a shared dirty
  worktree for scope.
- Files over 600 lines are decomposition candidates. Propose a split; do not
  expand the current task without approval.
- Do not deploy, commit, push, pull, compare remotes, create branches, or perform
  destructive operations unless the user authorizes that action.
- `plan/`, `task/`, and `reference/` are isolated working material. They cannot
  satisfy documentation citations or become knowledge-base dependencies.

## Delegation

Role policies normally load sequentially in one agent. Delegate only when the
active environment supports it and the task clearly benefits from independent
parallel work; higher-level agent policies and user instructions control it.

## Completion

Use the passing `task-close` receipt as the QA/docs-steward handoff, then append
through its `report` command. The report helper still enforces the open-cycle
schema and plain-English cycle close-out.
