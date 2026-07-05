# Staging Deploy Guide

## Purpose
- Human deployment guide for staging setup.
- File: `docs/components/Staging Deploy Guide.md`.

## Responsibilities
- Explain Docker + ECR + Terraform staging deployment for the EC2 gateway/workers lab.
- List required GitHub secrets.
- Explain Terraform setup and outputs.
- Document rollback/troubleshooting.

## Key Logic
- Normal Docker path is manual while K3s owns the live endpoint.
- Full preflight path: run [[Staging Automated Master Workflow]] manually with `full_preflight` to queue `Diagnostics -> Infra Plan -> Server Update`.
- Fast Docker rollback/showcase path: run [[Staging Automated Master Workflow]] manually with `fast_server_deploy`.
- Manual infra path: run Terraform plan/apply workflows to create, adopt, or update EC2-1 gateway and EC2-2/EC2-3 workers.
- Server workflow builds/pushes Docker image to ECR.
- Server workflow installs pinned Ansible on the GitHub runner, generates a temporary EC2 inventory, updates DuckDNS, then starts Redis/Caddy on EC2-1 and game server Docker containers on EC2-2/EC2-3.
- Runtime cleanup: Run [[Staging Runtime Cleanup Workflow]] when stale Caddy, legacy nginx, Redis, server containers, Docker network, Docker images, or temp deployment files are suspected on existing Docker EC2 hosts.
- Infra cleanup: Run [[Staging Infra Cleanup Workflow]] to remove old Docker EC2 AWS resources while preserving ECR and GitHub OIDC resources reused by K3s.
- Managed AWS ALB/NLB, ElastiCache, and EKS are intentionally not used in this learning setup.
- K3s exploration now has a separate parallel lab path in [[K3s Lab Stack]] and [[K3s Lab Workflows]]. Docker staging remains the rollback path.

## Inputs/Outputs
- Input: local Terraform/AWS setup, repository secrets, and `DUCKDNS_TOKEN` in the GitHub `staging` environment.
- Output: working EC2 gateway plus two Docker server workers.

## Dependencies
- [[Terraform Infrastructure]]
- [[Server Staging Deploy Workflow]]
- [[Server Docker Image]]

## Notes
- Read this when deploying or debugging staging.
- Godot connects to `wss://corp-tower.duckdns.org`.
- Cleanup is a repair/revert helper, not part of the normal automated deployment queue.
- Infra Apply and EC2 Rebuild stay manual-only because they can intentionally change infrastructure.
- Gateway and workers should stay in the same staging VPC/subnet learning topology.
- Check gateway logs on EC2-1 with `sudo docker logs corp-tower-gateway`; check worker logs on EC2-2/EC2-3 with `sudo docker logs corp-tower-server`.
- Ansible deploy assets live under `infra/ansible`; deployment edits should be tested through manual Docker staging runs.
- Keep this Docker staging path as the fallback while using the parallel K3s lab.
- If K3s owns `corp-tower.duckdns.org`, start the Docker EC2s and run [[Server Staging Deploy Workflow]] to point DuckDNS back to Docker staging.
