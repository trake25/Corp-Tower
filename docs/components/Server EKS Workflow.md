# Server EKS Workflow

## Purpose
- GitHub Actions entry point for reviewing the parallel Server EKS managed AWS plan.

## Workflow
- File: `.github/workflows/Server-EKS-Infra-Plan.yml`.
- Trigger: manual `workflow_dispatch` or reusable `workflow_call`.
- Terraform root: `infra/eks/terraform`.

## Behavior
- Configures AWS credentials through GitHub OIDC.
- Ensures the shared Terraform S3 backend bucket exists.
- Runs `terraform init`, `terraform fmt -check`, `terraform validate`, and `terraform plan`.
- Shows the full no-color Terraform plan in workflow logs for review.

## Scope
- EKS replaces private K3s EC2 nodes.
- NLB with Elastic IPs replaces EC2-GW public ingress.
- ElastiCache Redis replaces Docker/in-cluster Redis.
- This workflow does not apply infrastructure.

## Links
- [[Server EKS Stack]]
- [[Server K3s Workflows]]
