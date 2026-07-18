# Server K3s Stack

## Purpose
- Parallel Server K3s infrastructure for Corp Tower.
- Files: `infra/k3s/terraform`, `infra/k3s/ansible`, `infra/k3s/apps`, and `infra/k3s/argocd/bootstrap`.

## Responsibilities
- Reuse existing GitHub staging secrets and ECR repository. The K3s infra workflows can derive the EC2 public key from `EC2_STAGING_SSH_KEY` when `EC2_STAGING_SSH_PUBLIC_KEY` is empty.
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
  - `Server-K3s-Deploy.yml` generates an uncommitted `overlays/runtime`
    Kustomize overlay on top of `overlays/lab` at deploy time to inject the
    real ECR image tag — the committed `lab-placeholder` tag in
    `overlays/lab` is never what actually runs.

## Dependencies
- [[Server K3s Workflows]]
- [[Server Docker Image]]
- [[Server EKS Stack]]

## Notes
- `ws.tod.galaxxigames.com` currently points to the active Server K3s gateway via Cloudflare DNS.
- EC2-GW uses Docker only to run the Caddy gateway container; the game server workload runs in K3s.
- Known issue: `infra/k3s/argocd/bootstrap/application.yaml`'s
  `spec.source.targetRevision` is pinned to an already-merged feature branch
  instead of `main`. Harmless while Argo CD manifests stay unapplied, but fix
  this before ever enabling Argo CD or syncs will track the wrong ref.
