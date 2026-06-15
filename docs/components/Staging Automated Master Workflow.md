# Staging Automated Master Workflow

## Purpose
- Manual queue for the normal non-destructive staging update path.
- File: `.github/workflows/Staging-Automated-Master.yml`.

## Responsibilities
- Call [[Staging Diagnostics Workflow]].
- Call [[Terraform Infrastructure]] through `Staging Infra Plan`.
- Call [[Server Staging Deploy Workflow]] only after diagnostics and infra plan succeed.
- Keep destructive or repair actions outside the automated queue.

## Key Logic
- Trigger: manual `workflow_dispatch` only.
- Queue order:
  - `Diagnostics`
  - `Infra Plan`
  - `Server Update`
- Passes optional diagnostic extra public IPs to diagnostics.
- Uses reusable workflow calls with `secrets: inherit`.

## Excluded Workflows
- Does not call [[Staging Runtime Cleanup Workflow]].
- Does not call `Staging Infra Apply`.
- Does not call `Staging Infra Rebuild EC2`.

## Notes
- Use this for normal staging updates when infrastructure is expected to already exist and be healthy.
- `Staging Infra Plan` fails when Terraform plans any create, delete, or replace action, so the master queue stops before server update if infrastructure is not in the expected stable state.
- Run cleanup manually only when an implementation fails and the staging runtime needs to be reverted to the last working Docker deployment state.
