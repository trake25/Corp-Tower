# Server K3s Automated Master Workflow

## Purpose
- Automated/manual queue for the non-destructive Server K3s deploy path.
- File: `.github/workflows/Server-K3s-Automated-Master.yml`.

## Responsibilities
- Classify changed paths before choosing the Server K3s queue.
- Call [[Server K3s Workflows]] diagnostics and infra plan when safety gates are relevant.
- Call `Server-K3s-Deploy.yml` directly for ordinary server or Kustomize app updates.
- Keep cleanup, Terraform apply, and destructive infrastructure changes outside the automated queue.

## Key Logic
- Manual `full_preflight`: `Diagnostics -> Infra Plan -> K3s Deploy`.
- Manual `fast_server_deploy`: `K3s Deploy` directly.
- Manual `infra_plan_only`: `Infra Plan` only.
- Pushes to `main` or `master` on watched paths run automatically.
- Watched push paths:
  - `src/Server/**`
  - `infra/k3s/ansible/**`
  - `infra/k3s/apps/**`
  - `infra/k3s/terraform/**`
  - Server K3s workflow files used by the master queue
- Server or Kustomize app changes use the fast deploy path.
- Ansible changes run diagnostics before deploy.
- Terraform changes run infra plan and stop if create/delete/replace actions are planned.
- Workflow changes run diagnostics and infra plan.

## Notes
- Use manual `fast_server_deploy` for immediate K3s redeploys when you do not want to wait for a push-triggered run.
- Use manual `full_preflight` after K3s infrastructure restarts, Ansible changes, workflow changes, or uncertainty about current lab health.
