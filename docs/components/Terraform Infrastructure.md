# Terraform Infrastructure

## Purpose
- Provision AWS staging infrastructure.
- Folder: `infra/terraform`.

## Responsibilities
- Create staging EC2.
- Create ECR repository.
- Create security group rules.
- Create IAM/OIDC resources for GitHub Actions.
- Output values needed by GitHub secrets.

## Key Logic
- Region: `ap-southeast-1`.
- EC2:
  - Amazon Linux 2023.
  - Docker and AWS CLI installed through user data.
  - Instance profile allows ECR pull.
- GitHub Actions:
  - OIDC role allows ECR push.

## Inputs/Outputs
- Input: `staging.tfvars`.
- Output: EC2 public IP, SSH user, ECR repo, GitHub role ARN.

## Dependencies
- AWS CLI/Terraform locally.
- [[Server Staging Deploy Workflow]]
- [[Staging Deploy Guide]]

## Notes
- `staging.tfvars` is ignored.
- Optional bootstrap folder supports remote state setup.
