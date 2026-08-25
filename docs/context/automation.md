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

`report/v2/reports/task-token-cost-effectivity.md` routes to this protocol;
retrieve it with `route` before analysing v2 rows. V2 data is append-only under
`report/v2/data/`. V3 data is append-only under `report/v3/data/samples.jsonl`,
with a compact dashboard at `report/v3/reports/index.md` and one generated
table per exact model, effort and estimated complexity under
`report/v3/reports/by-model/`. Markdown is generated presentation; never parse
or hand-edit it for metrics.

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

1. `prepare --complexity <1-5> --r-change-est <tokens>` records the effective
   model and effort from the active runtime transcript/host adapter, the matching
   user-instruction start boundary, hashed session freshness, and an immutable
   task-start usage baseline. Run it after bounded context retrieval and before
   the first file edit. The estimate is `measured context usage + estimated file
   changes`; this is the expected provider usage-pool consumption before work.
   `--model-variant` and `--effort` are validated fallbacks when no
   adapter exists. Legacy `--r-est` remains accepted as a pre-read estimate.
   The command also returns routing, QA selection, documentation candidates,
   exact `docs-scope` output and map ownership in ignored JSON. Never rerun it
   against the same manifest; start a new `--output` run instead.
2. The agent updates KB prose only when the doc-worthy gate applies, then
   `decide` records `updated` with the edited document or `not-needed` with a
   rationale. This is an agent decision, not a human checkpoint.
3. `verify` runs selected QA, file-map generation for source paths, relevant KB
   validation, agent-configuration validation for skill or entry-contract edits,
   and `task-report validate` into a receipt under `.agent-state/automation/`.
4. `report` can stage only after a passing receipt. It reads the frozen model,
   effort, complexity, context-plus-change estimate and session from the
   manifest, copies path and domain counts, and accepts no end-of-task runtime
   override. A Stop hook runs `scripts/task-report-stop.mjs` to read counters
   from the user instruction through the matching `task_complete` event and
   active / wall timing, then commits v2 and v3 together. A failed hook leaves the
   ignored pending transaction for retry. Values such as `GPT-5` or `variant
   unrecorded` are invalid for standard records.

## Structured task reporting

`node scripts/task-report.mjs start` remains the low-level v2 intake writer;
`task-close prepare` is the normal entry point. `append` requires a passed
receipt and reads the exact runtime variant, effort, complexity and frozen
context-plus-change estimate from the manifest. Source-read, provider usage-pool
total, and v3 input/cache/output/reasoning measurements carry `exact`,
`estimated`, or `unavailable` provenance; provider pool usage is never inferred
from local tool output.

Verification receipts retain command output for audit, but the console summary is
bounded: step name, exit code or signal, and the first failure marker or
file/line location. An empty child stream is reported as `process exited without
output`, never as an unexplained `no summary`.

V3 uses active agent seconds as its primary completion-efficiency measure and
wall duration as operational context. Active time excludes human or approval
waits; wall duration and actual usage-pool tokens are measured from the matching
user instruction to task completion. Human reports show token values in `k`/`m` units and time in
minutes; the JSONL source keeps exact token and second values. The first v3
sample in a runtime session is labelled `first`; later samples are `continued`.
Complexity is estimated at intake and realized at close; a changed rating
requires a compact reason code and never changes the selected bucket.

Receipts referenced by open-cycle records are local-only evidence under
`.agent-state/automation/`; validation does not require those ignored files to exist
in a clean clone. Public report data remains in `report/`.

Use `analyze --from <cycle> --to last-closed --json` for v2 metrics. V3 adds
`v3-analyze`, `compare`, `view --model ... --effort ... --complexity ...`, and
`runtime-diagnose`. V3 buckets close automatically at 12 samples and sample 13
opens the next cycle. `render` regenerates both presentations. `validate` checks
both stores, one-to-one dual-write linkage, receipts, cycle state, generated
freshness, legacy warnings and v3 table shape. V3 comparisons keep estimated
complexity, freshness and worker-count coverage separate and provide evidence
for a choice without generating a composite winner.

`import` is the one-time legacy-Markdown migration path. It preserves missing
metadata and warnings, including the Cycle 2 four-versus-six estimate
discrepancy. `close-cycle` accepts exactly twenty receipt-linked standard rows,
writes the review and factual rollup, opens the next cycle, renders once, and
leaves records untouched if validation fails.

Human involvement is limited to testing that requires a real rendered/device
comparison and the final product pass. Green deterministic checks do not replace
an agent's documentation, coverage, or root-cause judgement.

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
