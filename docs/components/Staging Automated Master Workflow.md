# Staging Automated Master Workflow

## Purpose
- Manual queue for the non-destructive Docker staging server update path.
- File: `.github/workflows/Staging-Automated-Master.yml`.

## Responsibilities
- Run the classifier job on the pinned GitHub runner image `ubuntu-24.04`.
- Classify the selected manual deploy mode before choosing the staging queue.
- Call [[Staging Diagnostics Workflow]] and [[Terraform Infrastructure]] through `Staging Infra Plan` when workflow/infra safety gates are relevant.
- Call [[Server Staging Deploy Workflow]] directly for manual fast server deploys.
- Keep destructive or repair actions outside the automated queue.

## Key Logic
- Trigger: manual `workflow_dispatch`.
- Manual runs default to the full queue and can choose `fast_server_deploy` or `infra_plan_only`.
- Manual full-preflight runs can pass optional diagnostic extra public IPs to diagnostics.
- Uses reusable workflow calls with `secrets: inherit`.
- Called staging workflows use the same pinned runner image and Node 24-compatible GitHub Action majors.

## Excluded Workflows
- Does not call [[Staging Runtime Cleanup Workflow]].
- Does not call `Staging Infra Apply`.
- Does not call `Staging Infra Rebuild EC2`.

## Notes
- Use the fast server update path when intentionally returning `corp-tower.duckdns.org` to Docker staging for rollback or showcase.
- Automatic server-push deployment is owned by [[K3s Lab Automated Master Workflow]] while the K3s lab is the live stack.
- `Staging Infra Plan` fails when Terraform plans any create, delete, or replace action, so the master queue stops before server update if infrastructure is not in the expected stable state.
- Run cleanup manually only when an implementation fails and the staging runtime needs to be reverted to the last working Docker deployment state.
