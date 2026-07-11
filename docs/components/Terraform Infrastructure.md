# Terraform Infrastructure

## Purpose
- Track Terraform roots used by Corp Tower infrastructure workflows.

## Roots
- `infra/k3s/terraform`: active Server K3s AWS learning stack.
- `infra/eks/terraform`: plan-only parallel Server EKS managed AWS stack.
- `infra/terraform`: deprecated Docker staging EC2 stack retained as source history only; its GitHub Actions workflows were removed.

## Server K3s
- Workflows: [[Server K3s Workflows]].
- State key: `k3s-lab/terraform.tfstate`.
- Creates the isolated K3s VPC, public EC2-GW, private K3s nodes, routes, security groups, key pair, and EC2 IAM role/profile.
- `Server-K3s-Infra-Plan.yml` plans the root and intentionally allows create/delete actions so a weekend recreate plan can be reviewed after weekday cleanup.
- `Server-K3s-Infra-Apply.yml` applies only after `APPLY_SERVER_K3S`.
- `Server-K3s-Cleanup.yml` with `terraform_destroy` destroys all AWS resources managed by the K3s Terraform state after `DESTROY_SERVER_K3S`.

## Server EKS
- Workflows: [[Server EKS Workflow]].
- State key: `eks-lab/terraform.tfstate`.
- Plans EKS, private managed node group, public NLB, Elastic IPs for NLB subnet mappings, and ElastiCache Redis.
- The ECR repository is reused as a data source.
- There is no apply workflow yet.

## Notes
- Region: `ap-southeast-1`.
- Workflows create the shared S3 backend bucket if it is missing.
- User prefers GitHub Actions for Terraform validation and planning instead of local manual Terraform runs.
- Managed AWS resources in the EKS path may exceed free-tier expectations; review plan output and cost before adding apply/deploy workflows.
