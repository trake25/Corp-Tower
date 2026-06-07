# Staging Deploy Guide

## Purpose
- Human deployment guide for staging setup.
- File: `docs/deploy-staging.md`.

## Responsibilities
- Explain Docker + ECR + Terraform staging deployment for the EC2 gateway/workers lab.
- List required GitHub secrets.
- Explain Terraform setup and outputs.
- Document rollback/troubleshooting.

## Key Logic
- Phase 1: Manually run Terraform `ec2-learning-lab` apply to create/adopt EC2-1 gateway and EC2-2/EC2-3 workers.
- Phase 2: Server workflow builds/pushes Docker image to ECR.
- Phase 3: Server workflow starts Redis/nginx/k3s on EC2-1 and game server containers on EC2-2/EC2-3.
- Managed AWS ALB/NLB, ElastiCache, and EKS are intentionally not used in this learning setup.

## Inputs/Outputs
- Input: local Terraform/AWS setup and GitHub secrets.
- Output: working EC2 gateway plus two Docker server workers.

## Dependencies
- [[Terraform Infrastructure]]
- [[Server Staging Deploy Workflow]]
- [[Server Docker Image]]

## Notes
- Read this when deploying or debugging staging.
- Godot connects to `ws://<EC2-1-public-ip>:3000`.
- Check gateway logs on EC2-1 and server logs on EC2-2/EC2-3.
