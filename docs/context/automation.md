# Agent automation

This document owns the repository's deterministic retrieval and task close-out
protocol. Product behavior belongs in its domain document; this file only owns
how agents find bounded evidence and record completion.

## Context protocol

`scripts/context.mjs` is the shared local-tool protocol for Codex, Claude Code,
and local LLM runners. Schema 2 returns repository-relative provenance, stable
result states, exact next commands and provider-visible byte counts. Search reads
only the KB and generated maps; it never exposes raw source, environment files,
secrets or the working-tree diff.

| Command | Role |
|---|---|
| `route <area-or-path>` | selects skill, docs, map and bounded source-read strategy |
| `search <query> [--anchor]` | ranks strict KB/map matches; `--anchor` confirms a canonical retry |
| `filter <query> ...` | narrows a fresh deterministic search by area, kind, path or required term |
| `outline` / `section` / `symbol` | reads one known KB structure, section or generated-map row set |
| `scope <task-owned-path>...` | returns routes, docs, maps, QA and exact verification tools for explicit paths |
| `bundle <task>` | writes selected KB/map evidence to ignored `.agent-state/automation/` state |

The gitignored working folders have explicit routes but are not searched as KB
content. `plan/` is where agents look for existing task plans and save new ones;
existing plans are read-only until the user explicitly instructs or approves an
edit. After complete verification and close-out, move the implemented plan
Markdown file into `plan/done/`. `reference/` is human-managed screen-guide and bug-screenshot material;
humans may upload, modify, or delete those files. Use `route plan/` or `route
reference/` when task context points to either folder. `plan/`, `task/`, and
`reference/` are human-maintained working folders. Machine-generated bundles,
manifests, receipts, and retrieval-benchmark output belong under ignored
`.agent-state/automation/`. Private workflow telemetry belongs under ignored
`.agent-state/telemetry/`. All `report/**` paths are excluded from normal
retrieval and indexing; only their owning tool or an explicit human request may
read them.

Search uses every query token as a required match. A weak narrative match returns
`needs-anchor` with at most three exact retries and no evidence; overflow returns
`needs-filter` with a direct section/symbol read and exact filter commands.
`matched` evidence exposes map provenance plus a structured candidate source
path, line and bounded `sed` range. An empty `search --anchor` returns
`retrieval-defect`. Only `retrieval-defect` and `tool-error` allow source
fallback; unfamiliar syntax, `needs-anchor` and `needs-filter` do not. Search the
smallest routed root first, record a real fallback through `task-close fallback`,
and add a passing benchmark fixture with the route, map purpose or alias repair.
A suggestion loop, invalid source target or budget breach is also a retrieval
defect even when the process exits zero.

Generated maps keep one authored purpose per file and only stable navigation
anchors. An exceptional cross-boundary term that extraction cannot recognize may
be marked `· stable`; regeneration relocates it by name and drops it if the source
term disappears. Maps do not explain local symbols—the bounded source read does.

Interactive search/filter defaults to five results and 6 KiB; the hard ceilings
are eight and 24 KiB. Diagnostics are three actions/2 KiB, sections default to 6
KiB with a 12 KiB ceiling, and bundles default to 12 KiB with a 24 KiB ceiling.
Public `scope` and task intake stay within 8 KiB; task-close stores larger route
detail only in its ignored manifest. Search JSON omits excerpts unless explicitly
requested. `retrieval-aliases.json` remains a small fixture-proven vocabulary
bridge, not a tag index. `scripts/fixtures/context-retrieval.json` owns checked
correctness, fallback, whole-read and provider-facing byte cases;
`benchmark-rag.mjs` writes non-check output to ignored
`.agent-state/automation/rag-benchmark/`. Exact provider usage stays null unless
a provider client reports it.

Cloud coding agents use the same command through a read-only tool adapter. A
cloud chat session without local-tool access receives only a deliberately made
`bundle`; it cannot execute a repository-local command or gain source access from
the bundle path.

## Automated close-out

`scripts/task-close.mjs` owns deterministic task closure. Its manifest is the
scope authority and always names paths explicitly; it never discovers scope from
a dirty working tree. Schema 2 separates authorized ownership from the final
change set and retains full routes, child output and fingerprints locally while
keeping console responses below the intake budget.

1. `prepare --task ... --path ...` records `owned_paths` after bounded retrieval
   and before the first edit. Intake reuses `scopeContext` to name roles, docs,
   maps, selected tests, validators and the next command. `--changed` remains an
   accepted schema-1-compatible alias for `--path`.
2. `amend --path ...` owns a later-discovered file before its edit. Adding source
   after review invalidates review; adding a reviewed candidate doc preserves the
   source review.
3. `review --changed ...` records only the explicit final authored/source paths,
   recomputes QA, and runs `docs-scope` after edits so it can return the exact KB
   ranges made falsifiable by the diff. No Git working-tree discovery supplies
   path scope.
4. Apply the doc-worthy gate, own each selected candidate doc through `amend`,
   edit only its returned ranges, and decide separately whether the completed
   change deserves durable regression coverage.
5. Run `close --decision <updated|not-needed> --reason ... [--doc-path ...]
   --coverage <updated|not-needed> --coverage-reason ...`. The coverage decision
   does not select QA: every task still runs the checks selected from its final
   paths, while cosmetic or source-obvious fixes normally use `not-needed`.
6. `close` validates both decisions, runs QA/map/KB/agent-config checks, detects
   generated maps by before/after content hash, rejects out-of-scope map output,
   and writes a resumable receipt. `publish_paths` is the union of explicit
   changes, documented paths and content-changed generated maps.

`fallback --query ... --classification <retrieval-defect|tool-error> --root ...
--fixture ...` records permitted source fallback. Closeout requires the named
fixture and a passing retrieval benchmark. Schema-1 `decide` and `verify` remain
compatibility commands; schema 2 uses `prepare → review → close`.

Child stdout/stderr is captured through a private ignored log file before being
embedded in the receipt, which preserves diagnostics on hosts that swallow
nested pipes. A passing close prints one line. A failure prints the step,
exit/signal, first actionable diagnostic and receipt path; identical close inputs
reuse the passing receipt.

`scripts/agent-observability.mjs` provides `start`, `event`, `candidate`,
`flag`, `close`, `finalize`, `render`, `analyze`, `export-public`, and `doctor`.
State resolves from `--state-dir`, then `CORP_TOWER_OBSERVABILITY_DIR`, then
`.agent-state/telemetry/v2/`. Exact mode requires stable disjoint event IDs,
child attribution and usage, settled counters, and a terminal callback; otherwise
finalization is visibly partial. The inclusive provider total counts every
settled root, child, retry, summary, observability, analytics, and terminal event
once; observability usage is a non-additive subset. Hosts use `--best-effort` so
collection never retries or fails user work. Formal flagging is current-run,
high-effort, allowlisted, capped, and permitted only inside an already-required
provider turn. Private flat weekly reports are local; `export-public --approve`
alone writes a rounded, cohort-suppressed report under `report/observability/`.

## Authorized Git automation

`node scripts/git-sync-commit-push.mjs` is an opt-in local tool for the complete
Git sync, stage, commit and push sequence. It is load-on-demand: an agent must
have explicit user authorization, pass `--approve`, and name its passing
close-out receipt with `--manifest`. It derives commit keywords from the
manifest task title and requires a passing closed schema-2 manifest before
staging its `publish_paths`.
Schema-1 manifests retain the explicit `changed_paths` fallback. It fetches the configured `origin`
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
