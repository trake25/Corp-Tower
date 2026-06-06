# Staging Deploy Guide

## Purpose
- Human deployment guide for staging setup.
- File: `docs/deploy-staging.md`.

## Responsibilities
- Explain Docker + ECR + Terraform staging deployment.
- List required GitHub secrets.
- Explain Terraform setup and outputs.
- Document rollback/troubleshooting.

## Key Logic
- Phase 1: Docker server image.
- Phase 2: Terraform staging infra.
- Phase 3: GitHub Actions deploy.
- TLS/ALB and production stack are future phases.

## Inputs/Outputs
- Input: local Terraform/AWS setup and GitHub secrets.
- Output: working staging EC2 server.

## Dependencies
- [[Terraform Infrastructure]]
- [[Server Staging Deploy Workflow]]
- [[Server Docker Image]]

## Notes
- Read this when deploying or debugging staging.
