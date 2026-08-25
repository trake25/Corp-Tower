# Task reporting v2

<!-- GENERATED FILE. Source: report/v2/data/task-records.jsonl and report/v2/data/task-cycle-reviews.jsonl. Run node scripts/task-report.mjs render. -->

This report is generated from structured task records. Archived runs preserve
their original values; unavailable measurements are shown as unavailable.

## Definitions

Estimated tokens are the context-plus-change budget recorded before edits. Context used is the provider usage consumed before the first edit. Actual tokens are the provider counter delta for the completed task; Main-thread tokens exclude delegated workers. A tilde marks an estimated measurement.

| Retrieval result | Definition |
|---|---|
| ✓ | first-try |
| ~ | second-document |
| ✗ | repository-fallback |
| ! | doc-source-conflict |

Model is the exact implementing runtime variant for standard records. Legacy rows show their preserved label and are excluded from exact-variant coverage.

## Cycle 1 (open)

Current cycle: 1 recorded row(s); next row is 2.

| Row | Task | Complexity | Work mode | Domains | Files | Estimated tokens | Context used | Actual tokens | Main-thread tokens | Retrieval | Result | Model | Effort | Skills |
|---:|---|---:|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| 1 | Repair task reporting close-out, archive v2 and v3 history, and reset reporting data | 4 | implementation | 3 | 21 | legacy ~65k | unavailable | 5,135,979 | 5,135,979 | ✓ | pass | gpt-5.6-terra | high | infra-engineer, docs-steward, qa-engineer, update-docs |
<!-- next: row 2 -->
