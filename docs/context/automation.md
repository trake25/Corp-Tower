# Agent automation

This document owns the repository's deterministic retrieval and task close-out
protocol. Product behavior belongs in its domain document; this file only owns
how agents find bounded evidence and record completion.

## Context protocol

`scripts/context.mjs` is the shared local-tool protocol for Codex, Claude Code,
and local LLM runners. Its JSON envelope is versioned, returns repository-relative
provenance, and searches only the KB and generated maps; it never exposes raw
source, environment files, secrets, or the working-tree diff.

| Command | Role |
|---|---|
| `route <area-or-path>` | selects skill, docs, map and bounded source-read strategy |
| `search <query>` | ranks KB sections and map rows with fixed scoring |
| `filter <query> ...` | narrows a fresh deterministic search by area, kind, path or required term |
| `outline` / `section` / `symbol` | reads one known KB structure, section or generated-map row set |
| `scope <task-owned-path>...` | returns routes, docs, maps and the QA selection for explicit task paths |
| `bundle <task>` | writes selected KB/map evidence to ignored `.agent-state/automation/` state |

The gitignored working folders have explicit routes but are not searched as KB
content. `plan/` is where agents look for existing task plans and save new ones;
existing plans are read-only until the user explicitly instructs or approves an
edit. After complete verification and close-out, move the implemented plan
Markdown file into `plan/done/`. `reference/` is human-managed screen-guide and bug-screenshot material;
humans may upload, modify, or delete those files. Use `route plan/` or `route
reference/` when task context points to either folder. `plan/`, `task/`, and
`reference/` are human-maintained working folders. Machine-generated bundles,
manifests, and receipts belong under ignored `.agent-state/automation/`.

Search returns at most eight results and 24 KB. A broad or empty result is a KB
repair signal: add a precise route, map `Does` purpose, or retrieval alias rather
than reading the repository broadly. `retrieval-aliases.json` supplies the small,
validated vocabulary bridge for common product terms; it is not an open-ended tag
taxonomy.

**Retrieval guardrail:** `search` uses every query token as a required match. An
agent starts with one stable product anchor — a named screen, node, signal, file,
or feature — then refines an empty narrative query once with that anchor and uses
`filter` for an overfull result. `rg` is a source-reading fallback only after a
routed target, an unavailable CLI, or an unresolved anchor refinement; a
confirmed miss repairs the route, map purpose, or alias in the same task.

Cloud coding agents use the same command through a read-only tool adapter. A
cloud chat session without local-tool access receives only a deliberately made
`bundle`; it cannot execute a repository-local command or gain source access from
the bundle path.

## Automated close-out

`scripts/task-close.mjs` owns deterministic task closure. Its manifest is the
scope authority and always names paths explicitly; it never discovers scope from
a dirty working tree. Start an implementation with `prepare`: its JSON intake
returns each route, QA plan, documentation candidates, map ownership and exact
documentation scope, so no separate `context scope` call is needed.

1. `prepare` records explicit task-owned paths after bounded context retrieval
   and before the first file edit. It returns routing, QA selection,
   documentation candidates, exact `docs-scope` output and map ownership in
   ignored JSON. Never rerun it against the same manifest; start a new `--output`
   run instead.
2. The agent updates KB prose only when the doc-worthy gate applies, then
   `decide` records `updated` with the edited document or `not-needed` with a
   rationale. This is an agent decision, not a human checkpoint.
3. `verify` runs selected QA, file-map generation for source paths, relevant KB
   validation, and agent-configuration validation for skill or entry-contract
   edits into a receipt under `.agent-state/automation/`.

Verification receipts retain command output for audit, but the console summary is
bounded: step name, exit code or signal, and the first failure marker or
file/line location. An empty child stream is reported as `process exited without
output`, never as an unexplained `no summary`.

## Authorized Git automation

`node scripts/git-sync-commit-push.mjs` is an opt-in local tool for the complete
Git sync, stage, commit and push sequence. It is load-on-demand: an agent must
have explicit user authorization and pass `--approve`. It reads the task
manifest by default, derives commit keywords from the manifest task title, and
stages only the manifest's `changed_paths`. It fetches the configured `origin`
branch and runs `git pull --ff-only` before staging any local changes, then
pushes the current branch after the commit succeeds. By default the current
branch must be `main`; selecting another branch requires both `--branch` and
`--switch`, and the worktree must be clean before switching.
An explicitly authorized backup publication may use `--push-only` with a local
`--branch` and new `--remote-branch`; that mode fetches `origin/main` and pushes
only the existing local ref, without staging, committing, or switching.

Commit subjects contain no more than three keywords and a version suffix, for
example `Fix Lobby Sync v0.01`. The tool finds the highest matching local
history version and increments it by `0.01`; unrelated keyword groups start at
`v0.01`. It refuses detached HEADs, pre-staged changes, invalid paths, and empty
staging results.
