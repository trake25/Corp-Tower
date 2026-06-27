# Staging Automated Master Workflow

## Purpose
- Automated queue for the normal non-destructive staging server update path.
- File: `.github/workflows/Staging-Automated-Master.yml`.

## Responsibilities
- Classify changed paths before choosing the staging queue.
- Call [[Staging Diagnostics Workflow]] and [[Terraform Infrastructure]] through `Staging Infra Plan` when workflow/infra safety gates are relevant.
- Call [[Server Staging Deploy Workflow]] directly for ordinary server-only pushes.
- Keep destructive or repair actions outside the automated queue.

## Key Logic
- Triggers:
  - push to `main` or `master` when server, staging workflow, or Terraform paths change.
  - manual `workflow_dispatch`.
- Watched push paths:
  - `src/Server/**`
  - `infra/terraform/**`
  - staging workflow files used by the master queue.
- Client-only pushes do not trigger this workflow.
- Server-only push queue:
  - `Server Update`
- Workflow-change push queue:
  - `Diagnostics`
  - `Infra Plan`
  - `Server Update` if server files also changed.
- Terraform-only push queue:
  - `Infra Plan`
- Manual runs default to the full queue and can choose `fast_server_deploy` or `infra_plan_only`.
- Manual full-preflight runs can pass optional diagnostic extra public IPs to diagnostics.
- Push runs pass no extra diagnostic IPs and rely on AWS tag discovery.
- Uses reusable workflow calls with `secrets: inherit`.

## Excluded Workflows
- Does not call [[Staging Runtime Cleanup Workflow]].
- Does not call `Staging Infra Apply`.
- Does not call `Staging Infra Rebuild EC2`.

## Notes
- Use the fast server update path for normal staging server updates when infrastructure is expected to already exist and be healthy.
- `Staging Infra Plan` fails when Terraform plans any create, delete, or replace action, so the master queue stops before server update if infrastructure is not in the expected stable state.
- Run cleanup manually only when an implementation fails and the staging runtime needs to be reverted to the last working Docker deployment state.
