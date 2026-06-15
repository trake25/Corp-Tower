# Staging Runtime Cleanup Workflow

## Purpose
- Manual cleanup path for broken staging runtime state.
- File: `.github/workflows/Staging-Runtime-Cleanup.yml`.

## Responsibilities
- Discover tagged staging gateway/worker EC2 instances.
- Accept extra public IPs for cleanup when tags or roles are suspect.
- Revoke stale k3s inbound security group rules.
- Stop and remove Corp Tower Docker containers.
- Remove Corp Tower Docker network and temporary deployment files.
- Uninstall leftover k3s/k3s-agent runtime artifacts.
- Optionally remove Corp Tower, nginx, and redis Docker images.

## Key Logic
- Trigger: manual `workflow_dispatch` only.
- Inputs:
  - `extra_public_ips`: optional space/comma/newline-separated IPs.
  - `remove_images`: defaults to `true`.
- SSH uses the same staging secrets as server deploy.
- Cleanup leaves Docker installed because the normal deploy workflow needs Docker.
- Security group cleanup removes stale inbound `6443/tcp`, `10250/tcp`, `8472/udp`, and `30000-32767/tcp` rules.

## Dependencies
- `AWS_ROLE_ARN`
- `EC2_STAGING_USER`
- `EC2_STAGING_SSH_KEY`
- Optional `EC2_STAGING_PORT`

## Notes
- Use this before retrying staging deploy when EC2 hosts have stale k3s, nginx, Redis, or server containers.
- Use this when AWS Console still shows old k3s security group ingress rules.
- The workflow prints discovered public/private IPs and subnet IDs for topology debugging.
