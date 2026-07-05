# Terraform Infrastructure

## Purpose
- Provision AWS staging infrastructure.
- Folder: `infra/terraform`.

## Responsibilities
- Create EC2-1 gateway and EC2-2/EC2-3 worker instances for a free-tier learning lab.
- Adopt existing staging resources into Terraform state before planning.
- Create ECR repository.
- Avoid managed AWS ElastiCache, ALB/NLB, and EKS to reduce credit burn.
- Create security group rules for SSH and public WSS game traffic.
- Create IAM/OIDC resources for GitHub Actions.
- Output values needed by GitHub secrets.

## Key Logic
- Region: `ap-southeast-1`.
- EC2:
  - Amazon Linux 2023.
  - Docker and AWS CLI installed through user data.
  - Instance profile allows ECR pull.
  - Gateway and workers run in the same default VPC/subnet learning topology.
  - EC2-1 is the public gateway.
  - EC2-2 and EC2-3 run Docker server workers.
  - Gateway runs Docker Redis and Caddy reverse proxy; worker containers connect to `redis://<EC2-1-private-ip>:6379`.
  - Public WSS uses `corp-tower.duckdns.org` on ports `80/443`.
- GitHub Actions:
  - OIDC role runs Terraform, pushes ECR images, discovers workers, and deploys Docker over SSH.
  - Staging Terraform/deployment workflows run on the pinned GitHub runner image `ubuntu-24.04`.
  - GitHub Action dependencies are pinned to Node 24-compatible majors; deprecated Node 20 compatibility flags are not used.
- Remote state:
  - Staging Terraform workflow creates the S3 state bucket if missing before `terraform init`.
  - Backend uses S3 native lockfile instead of DynamoDB lock table.
  - Staging Terraform workflow uses S3 backend and migrates existing local state on first CI run.
  - Existing manually/previously-created staging resources are imported into state before planning.
- Manual CI rollout order:
  - Run `Staging Diagnostics` to inspect AWS topology and GitHub-runner SSH.
  - Run `Staging Infra Plan` to adopt/refresh state and review planned changes.
  - Run `Staging Infra Apply` only after a successful plan when infra changes are intended.
  - Run `Staging Server Update` to deploy Docker Redis/Caddy/server runtime.
  - Stop EC2 instances when not testing.
- Manual Docker update path:
  - `Staging Automated Master` can run `Diagnostics -> Infra Plan -> Server Update` for full Docker staging preflight.
  - `Staging Automated Master` can run `Server Update` directly with `fast_server_deploy`.
  - The master path does not run Cleanup, Infra Apply, or EC2 Rebuild.
  - `Staging Infra Plan` fails when Terraform plans any create, delete, or replace action.
- Docker infra cleanup:
  - `Staging Infra Cleanup` uses targeted Terraform destroy to remove Docker EC2-only AWS resources.
  - It preserves ECR and GitHub OIDC resources because K3s uses them for image push/pull and GitHub Actions authentication.

## Inputs/Outputs
- Input: GitHub Actions secrets and Terraform variables.
- Output: gateway public IP, worker public/private IPs, SSH user, ECR repo, GitHub role ARN, Godot secure WebSocket URL.

## Dependencies
- GitHub Actions OIDC role with enough staging infra permissions.
- [[Server Staging Deploy Workflow]]
- [[Staging Deploy Guide]]

## Notes
- `staging.tfvars` is ignored.
- User prefers GitHub Actions for Terraform/Docker/Redis validation and deploy instead of local manual runs.
- Infra plan/apply workflows are manual-only because creating or changing EC2 infrastructure is a real AWS side effect.
- `Staging Infra Rebuild EC2` is manual-only and reserved for intentional fresh EC2 replacement.
- Cost guardrail: Managed ElastiCache, ALB/NLB, and EKS are intentionally not used.
- EC2-1 is not a real AWS ALB; it is a self-managed gateway/reverse proxy that simulates ALB behavior for learning.
