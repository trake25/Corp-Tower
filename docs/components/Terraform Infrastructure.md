# Terraform Infrastructure

## Purpose
- Provision AWS staging infrastructure.
- Folder: `infra/terraform`.

## Responsibilities
- Create EC2-1 gateway and EC2-2/EC2-3 worker instances for a free-tier learning lab.
- Create ECR repository.
- Avoid managed AWS ElastiCache, ALB/NLB, and EKS to reduce credit burn.
- Create security group rules.
- Create IAM/OIDC resources for GitHub Actions.
- Output values needed by GitHub secrets.

## Key Logic
- Region: `ap-southeast-1`.
- EC2:
  - Amazon Linux 2023.
  - Docker and AWS CLI installed through user data.
  - Instance profile allows ECR pull.
  - EC2-1 is the public gateway that simulates ALB/Redis/k3s for learning.
  - EC2-2 and EC2-3 simulate server pods by running the Docker server image.
  - Gateway runs Docker Redis and nginx reverse proxy; workers connect to `redis://EC2-1:6379`.
- GitHub Actions:
  - OIDC role runs Terraform, pushes ECR images, discovers workers, and deploys Docker over SSH.
- Remote state:
  - Bootstrap workflow creates S3 state bucket and DynamoDB lock table.
  - Staging Terraform workflow uses S3 backend and migrates existing local state on first CI run.
- Cost-safe CI rollout order:
  - Run bootstrap apply once.
  - Run staging Terraform target `ec2-learning-lab`.
  - Run server staging deploy; it installs Redis/proxy on EC2-1 and server containers on EC2-2/3.
  - Stop EC2 instances when not testing.

## Inputs/Outputs
- Input: GitHub Actions secrets and Terraform variables.
- Output: gateway public IP, worker public/private IPs, SSH user, ECR repo, GitHub role ARN, Godot WebSocket URL.

## Dependencies
- GitHub Actions OIDC role with enough staging infra permissions.
- [[Server Staging Deploy Workflow]]
- [[Staging Deploy Guide]]

## Notes
- `staging.tfvars` is ignored.
- User prefers GitHub Actions for Terraform/Docker/Redis/Kubernetes validation and deploy instead of local manual runs.
- Cost guardrail: Managed ElastiCache, ALB/NLB, and EKS are intentionally not used.
- EC2-1 is not a real AWS ALB; it is a self-managed gateway/reverse proxy that simulates ALB behavior for learning.
