# Staging Runtime Cleanup Workflow

## Purpose
- Manual cleanup path for broken Docker staging runtime state.
- File: `.github/workflows/Staging-Runtime-Cleanup.yml`.

## Responsibilities
- Discover tagged staging gateway/worker EC2 instances.
- Accept extra public IPs for cleanup when tags or roles are suspect.
- Stop and remove Corp Tower Docker containers created by [[Server Staging Deploy Workflow]].
- Remove Corp Tower Docker network and temporary deployment files.
- Optionally remove Corp Tower, nginx, and redis Docker images.
- Leave EC2 prerequisites installed, including Docker and AWS CLI.

## Key Logic
- Trigger: manual `workflow_dispatch` only.
- Inputs:
  - `extra_public_ips`: optional space/comma/newline-separated IPs.
  - `remove_images`: defaults to `true`.
  - `fail_on_ssh_error`: defaults to `false`.
- SSH uses the same staging secrets as server deploy.
- Cleanup matches the runtime surface installed or updated by Server Update:
  - `corp-tower-*` Docker containers.
  - `corp-tower-gateway` Docker network.
  - optional Corp Tower, nginx, and redis Docker images.
  - `/tmp/corp-tower-*` deployment files.
- Cleanup leaves Docker and AWS CLI installed because normal deploys need them.

## Dependencies
- `AWS_ROLE_ARN`
- `EC2_STAGING_USER`
- `EC2_STAGING_SSH_KEY`
- Optional `EC2_STAGING_PORT`

## Notes
- Use this before retrying staging deploy when EC2 hosts have stale nginx, Redis, or server containers.
- This workflow is not a k3s uninstaller anymore. k3s has been removed from the active staging path and future k3s work should be planned manually first.
- The workflow prints discovered public/private IPs and subnet IDs for topology debugging.
