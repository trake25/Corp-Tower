# Staging Infra Cleanup Workflow

## Purpose
- Manual cleanup path for old Docker staging AWS infrastructure that the K3s lab does not reuse.
- File: `.github/workflows/Staging-Infra-Cleanup.yml`.

## Responsibilities
- Build a targeted Terraform destroy plan for Docker-only staging resources.
- Remove old Docker EC2 gateway/worker instances, their staging security group, the staging EC2 key pair, and the Docker EC2 IAM role/profile/pull policy.
- Preserve resources still reused by K3s:
  - ECR repository and lifecycle policy.
  - GitHub Actions OIDC provider.
  - GitHub Actions deploy role and ECR push policy.
  - Terraform state bucket.

## Key Logic
- Trigger: manual `workflow_dispatch` only.
- `cleanup_mode=plan` shows the targeted destroy plan and makes no AWS changes.
- `cleanup_mode=destroy` requires `confirm_cleanup=DESTROY_DOCKER_STAGING_INFRA`.
- The workflow rejects any cleanup plan that would delete resources outside the Docker-only allowlist.
- After destroy, it verifies the ECR repository and GitHub Actions role still exist.

## Use
- Run `plan` first.
- If the plan only includes Docker-only resources, rerun with `destroy`.
- To recreate Docker staging later, run `Staging Infra Apply`, then `Staging Server Update` or `Staging Automated Master` manually.

## Notes
- This is separate from [[Staging Runtime Cleanup Workflow]], which cleans Docker containers/files on existing EC2 hosts.
- Do not use a full Terraform destroy on `infra/terraform` while K3s still relies on the staging ECR repository and GitHub Actions role.
