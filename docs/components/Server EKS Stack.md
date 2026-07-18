# Server EKS Stack

## Purpose
- Plan-only parallel managed AWS path for Corp Tower server infrastructure.
- Replaces the K3s learning stack pieces with managed AWS equivalents before any apply workflow is added.

## Terraform
- Root: `infra/eks/terraform`.
- State key: `eks-lab/terraform.tfstate`.
- Resource tag stack: `server-eks`.

## Planned Topology
- EKS cluster and managed node group run server pods in private subnets.
- Internet-facing NLB exposes game WebSocket traffic on `443/tcp`.
- NLB subnet mappings reserve Elastic IPs for stable public ingress.
- ElastiCache Redis replaces Docker/in-cluster Redis for active matchmaking, room/session snapshots, reconnect, and worker recovery.
- Existing ECR repository is reused as a Terraform data source.

## Constraints
- This stack currently has a plan workflow only.
- No apply or deploy workflow should be added until the plan output and expected monthly/free-tier cost impact are reviewed.
- The NLB target group has no pod/node registration mechanism yet — no Load
  Balancer Controller or IRSA OIDC provider exists in this Terraform root.
  That wiring is unimplemented, another reason apply/deploy isn't ready.

## Links
- [[Server EKS Workflow]]
- [[Server K3s Stack]]

