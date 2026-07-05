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
- Normal server-only path: push through [[Staging Automated Master Workflow]] to run the fast guarded `Server Update` path.
- Full preflight path: run [[Staging Automated Master Workflow]] manually with `full_preflight`, or change staging workflow files, to queue `Diagnostics -> Infra Plan -> Server Update`.
- Manual infra path: run Terraform plan/apply workflows to create, adopt, or update EC2-1 gateway and EC2-2/EC2-3 workers.
- Server workflow builds/pushes Docker image to ECR.
- Server workflow installs pinned Ansible on the GitHub runner, generates a temporary EC2 inventory, updates DuckDNS, then starts Redis/Caddy on EC2-1 and game server Docker containers on EC2-2/EC2-3.
- Cleanup: Run [[Staging Runtime Cleanup Workflow]] when stale Caddy, legacy nginx, Redis, server containers, Docker network, Docker images, or temp deployment files are suspected.
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
- Ansible deploy assets live under `infra/ansible`; deployment edits there trigger diagnostics plus server update through [[Staging Automated Master Workflow]].
- Keep this Docker staging path as the fallback while using the parallel K3s lab.
- If K3s owns `corp-tower.duckdns.org`, start the Docker EC2s and run [[Server Staging Deploy Workflow]] to point DuckDNS back to Docker staging.
