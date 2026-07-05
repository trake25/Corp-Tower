# K3s Lab Stack

## Purpose
- Parallel K3s lab infrastructure for Corp Tower.
- Files: `infra/k3s/terraform`, `infra/k3s/ansible`, `infra/k3s/apps`, and `infra/k3s/argocd/bootstrap`.

## Responsibilities
- Keep K3s lab AWS resources and Terraform state separate from Docker staging.
- Reuse existing GitHub staging secrets and ECR repository.
- Route public WSS through EC2-GW Caddy to K3s NodePort `30300`.
- Keep K3s nodes private behind EC2-GW bastion/NAT.
- Keep Argo CD manifests ready but unapplied during the first rollout.

## Key Logic
- Terraform state key: `k3s-lab/terraform.tfstate`.
- Resource tag environment: `k3s-lab`.
- Default VPC shape:
  - public subnet for EC2-GW
  - private subnet for K3s control plane and agents
  - private subnet default route through EC2-GW primary network interface
- Security:
  - public `22/80/443` only on EC2-GW
  - private K3s API, kubelet, Flannel VXLAN, SSH, and NodePort traffic scoped to lab security groups
- K3s:
  - one server/control plane
  - two agents by default
  - Traefik and ServiceLB disabled
- Corp Tower workload:
  - namespace `corp-tower`
  - Redis `ClusterIP` service `redis:6379`
  - server deployment with two replicas
  - `ecr-pull` image pull secret refreshed by workflow
  - fixed NodePort `30300/tcp`

## Dependencies
- [[K3s Lab Workflows]]
- [[Server Docker Image]]
- [[Staging Deploy Guide]]

## Notes
- Docker staging remains the rollback target.
- `corp-tower.duckdns.org` can point to either Docker staging or K3s lab, not both.
- EC2-GW uses Docker only to run the Caddy gateway container; the game server workload runs in K3s.
