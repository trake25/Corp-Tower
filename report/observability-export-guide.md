# Manual observability report export

This guide is for a human operator exporting one ISO week's finalized workflow
telemetry from the repository terminal. Nothing schedules or publishes this
report automatically.

## Prerequisites

- Run commands from the repository root.
- The selected week uses `YYYY-Www`, for example `2026-W35`.
- Tasks have completed the observability lifecycle, normally through
  `task-close prepare` and `task-close close` plus the Codex `Stop` hook.
- Review and trust the repository hooks once through Codex `/hooks`; changed
  hook definitions require review again.
- Exact task events include stable event IDs, provider, model family, model
  variant, reasoning effort, settled usage, parent/child attribution, and a
  terminal callback.
- Any improvement included in the public report has been reviewed by a human.

The default private state is `.agent-state/telemetry/v3/`. Pass
`--state-dir <path>` to every command when the host stores it elsewhere.

## 1. Confirm finalized telemetry exists

List task final records without opening unrelated repository reports:

```bash
find .agent-state/telemetry/v3/tasks -name final.json -type f -print
```

If the directory or final records do not exist, stop. Exporting would create an
empty public summary, not reconstruct telemetry.

Before exporting, inspect the private report's Data Quality section. Partial
tasks name their reason and carry `DQ-*` flags; they remain useful for diagnosing
host integration but are excluded from exact public token aggregates.

## 2. Render the private human-readable report

Replace the example week:

```bash
node scripts/agent-observability.mjs render \
  --json '{"week":"2026-W35"}'
```

The command writes:

```text
.agent-state/telemetry/v3/reports/observability-2026-W35.md
```

Large weeks may also produce `observability-2026-W35-part-N.md`. Review the
private Markdown locally; it may contain task-level operational detail and must
not be used as normal repository context.

## 3. Check the publishable aggregate

This optional command shows whether the week has useful comparable cohorts. Five
verified tasks is the default decision-ready minimum:

```bash
node scripts/agent-observability.mjs analyze \
  --json '{"week":"2026-W35","minimum_sample":5}'
```

Public output includes exact finalized tasks only, rounds token values to 100,
and suppresses comparable cohorts smaller than five tasks.

## 4. Export the public report

The write requires explicit approval:

```bash
node scripts/agent-observability.mjs export-public --approve \
  --json '{"week":"2026-W35","improvements":[]}'
```

It creates:

```text
report/observability/2026-W35.md
```

There is no CI or scheduled invocation. A human runs this command directly, or
explicitly authorizes an agent to run it, after reviewing the private report and
the week's data quality.

## Publishing reviewed improvements

Improvements are optional. Every entry must use `"reviewed": true`; the exporter
rejects unreviewed entries and scans the completed report for prohibited private
content.

```bash
node scripts/agent-observability.mjs export-public --approve \
  --json '{
    "week":"2026-W35",
    "improvements":[{
      "category":"retrieval_context",
      "occurrences":3,
      "change":"Added a stable route for the repeated retrieval miss.",
      "outcome":"The retrieval benchmark now resolves the feature directly.",
      "reviewed":true
    }]
  }'
```

## Final human review

```bash
less report/observability/2026-W35.md
git diff -- report/observability/2026-W35.md
```

Confirm that the report contains no identities, local absolute paths, secrets,
URLs, task IDs, or unreviewed claims before committing or sharing it. Exporting
does not commit or publish the file.
