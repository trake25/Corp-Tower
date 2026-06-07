# K3s Staging Manifests

## Purpose
- Kubernetes manifests for the live staging game server path.
- File: `infra/k3s/corp-tower-server.yaml`.

## Responsibilities
- Define `corp-tower-staging` namespace.
- Configure server runtime env through ConfigMap.
- Run the server Docker image as a Kubernetes Deployment.
- Expose server pods through a NodePort Service for EC2-1 nginx.

## Key Logic
- Deployment runs `replicas: 2`.
- Pods are scheduled only on nodes labeled `corp-tower-role=worker`.
- Workers receive:
  - `PORT=3000`
  - `REDIS_URL=redis://<EC2-1-private-ip>:6379`
  - `RECONNECT_TTL_SECONDS=10`
- Service exposes NodePort `30080`.
- ECR image pull uses Kubernetes secret `ecr-registry`, created by [[Server Staging Deploy Workflow]].

## Inputs/Outputs
- Input: rendered ECR image URI and Redis URL.
- Output: two server pods behind a Kubernetes Service.

## Dependencies
- EC2-1 k3s control plane.
- EC2-2/EC2-3 k3s worker nodes.
- External Redis simulation on EC2-1.
- [[Server Docker Image]]

## Notes
- Redis intentionally stays outside k3s to simulate production EKS pods using external ElastiCache.
- EC2-1 nginx remains the public gateway and forwards to NodePort `30080`.
