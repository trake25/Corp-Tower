# Server Staging Deploy Workflow

## Purpose
- Preferred server CI/CD path for staging.
- File: `.github/workflows/Server-Staging-Deploy.yml`.

## Responsibilities
- Test server code on GitHub VM.
- Build Docker image.
- Push image to ECR.
- SSH to staging EC2.
- Pull and run image with Docker.

## Key Logic
- Trigger:
  - Push to `main`/`master` touching `src/Server/**` or workflow file.
  - Manual `workflow_dispatch`.
- Jobs:
  - `test-server`
  - `build-and-push`
  - `deploy-staging`
- AWS auth:
  - OIDC role via `AWS_ROLE_ARN`.
- Deploy:
  - EC2 pulls ECR image.
  - Replaces `corp-tower-server` container.

## Inputs/Outputs
- Input: GitHub push/manual run and repository secrets.
- Output: running staging Docker container on EC2.

## Dependencies
- [[Server Docker Image]]
- [[Terraform Infrastructure]]
- [[Staging Deploy Guide]]

## Notes
- This is the active path.
- [[Legacy Server Update Workflow]] is disabled.
