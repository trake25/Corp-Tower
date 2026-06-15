# Staging Automated Master Workflow

## Purpose
- Automated queue for the normal non-destructive staging server update path.
- File: `.github/workflows/Staging-Automated-Master.yml`.

## Responsibilities
- Call [[Staging Diagnostics Workflow]].
- Call [[Terraform Infrastructure]] through `Staging Infra Plan`.
- Call [[Server Staging Deploy Workflow]] only after diagnostics and infra plan succeed.
- Keep destructive or repair actions outside the automated queue.

## Key Logic
- Triggers:
  - push to `main` or `master` when server-side paths change.
  - manual `workflow_dispatch`.
- Server-side push paths:
  - `src/Server/**`
  - staging workflow files used by the master queue.
- Client-only pushes do not trigger this workflow.
- Queue order:
  - `Diagnostics`
  - `Infra Plan`
  - `Server Update`
- Manual runs can pass optional diagnostic extra public IPs to diagnostics.
- Push runs pass no extra diagnostic IPs and rely on AWS tag discovery.
- Uses reusable workflow calls with `secrets: inherit`.

## Excluded Workflows
- Does not call [[Staging Runtime Cleanup Workflow]].
- Does not call `Staging Infra Apply`.
- Does not call `Staging Infra Rebuild EC2`.

## Notes
- Use this for normal staging server updates when infrastructure is expected to already exist and be healthy.
- `Staging Infra Plan` fails when Terraform plans any create, delete, or replace action, so the master queue stops before server update if infrastructure is not in the expected stable state.
- Run cleanup manually only when an implementation fails and the staging runtime needs to be reverted to the last working Docker deployment state.
