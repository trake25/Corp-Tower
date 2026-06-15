# Staging Diagnostics Workflow

## Purpose
- Manual read-only diagnostics for the staging EC2 gateway/workers lab.
- File: `.github/workflows/Staging-Diagnostics.yml`.

## Responsibilities
- Discover tagged staging gateway/worker EC2 instances.
- Accept extra public IPs for diagnosis when tags or roles are suspect.
- Print EC2 topology, public/private IPs, subnet IDs, VPC IDs, and security groups.
- Print EC2 instance status checks.
- Print security group inbound rules, subnet route tables, and subnet network ACLs.
- Probe SSH from the GitHub runner using deterministic `ssh-keyscan` known_hosts setup.

## Key Logic
- Trigger: manual `workflow_dispatch` only.
- Does not modify AWS, Terraform state, Docker, or EC2 runtime files.
- Uses GitHub OIDC AWS credentials for AWS inspection.
- Uses the same EC2 SSH secrets as server deploy for SSH reachability checks.

## Dependencies
- `AWS_ROLE_ARN`
- `EC2_STAGING_USER`
- `EC2_STAGING_SSH_KEY`
- Optional `EC2_STAGING_PORT`

## Notes
- Run this first when staging behavior is suspicious.
- A successful diagnostics run means GitHub Actions can see the expected AWS topology and SSH into the staging EC2 hosts.
- Diagnostics does not prove the game server is healthy; use [[Server Staging Deploy Workflow]] logs and Godot client testing for that.
