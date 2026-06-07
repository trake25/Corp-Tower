# Server Staging Deploy Workflow

## Purpose
- Preferred server CI/CD path for staging.
- File: `.github/workflows/Server-Staging-Deploy.yml`.

## Responsibilities
- Test server code on GitHub VM.
- Build Docker image.
- Push image to ECR.
- Discover EC2 worker instances.
- Install/verify k3s control plane and worker agents.
- Deploy server image through Kubernetes manifests.
- Deploy Docker Redis and nginx reverse proxy to EC2-1 gateway.

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
  - Finds running worker instances by Terraform tags.
  - EC2-1 runs k3s control plane and EC2-2/EC2-3 join as k3s agents.
  - Workflow labels EC2-2/EC2-3 nodes with `corp-tower-role=worker`.
  - Gateway EC2 runs external Redis simulation with `redis:7-alpine`.
  - Deploy starts gateway Redis and waits for `PONG` before starting workers.
  - Workflow creates/refreshes Kubernetes `ecr-registry` image pull secret.
  - Workflow renders and applies [[K3s Staging Manifests]].
  - Server pods use `REDIS_URL=redis://<gateway-private-ip>:6379`.
  - Server pods use `RECONNECT_TTL_SECONDS=10` for faster staging/debug reconnect testing.
  - Deploy validates generated nginx config with `nginx -t` before starting gateway proxy.
  - Godot connects to gateway `ws://<gateway-public-ip>:3000`; nginx routes WebSocket traffic to k3s NodePort `30080`.

## Inputs/Outputs
- Input: GitHub push/manual run and repository secrets.
- Output: gateway reverse proxy + external Redis on EC2-1, server pods on EC2-2/EC2-3 through k3s.

## Dependencies
- [[Server Docker Image]]
- [[Terraform Infrastructure]]
- [[Staging Deploy Guide]]

## Notes
- This is the active path.
- User does not test in local machine but in Github Action and staging only.
- Useful EC2-1 checks: `sudo k3s kubectl get nodes`, `sudo k3s kubectl get pods -n corp-tower-staging -o wide`.
