# Server Staging Deploy Workflow

## Purpose
- Preferred server CI/CD path for staging.
- File: `.github/workflows/Server-Staging-Deploy.yml`.

## Responsibilities
- Test server code on GitHub VM.
- Build Docker image.
- Push image to ECR.
- Discover EC2 worker instances.
- Deploy server Docker image to EC2-2/EC2-3 workers.
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
  - Worker EC2 instances pull ECR image and replace `corp-tower-server`.
  - Workers use `REDIS_URL=redis://<gateway-private-ip>:6379`.
  - Workers use `RECONNECT_TTL_SECONDS=10` for faster staging/debug reconnect testing.
  - Gateway EC2 installs k3s for learning and runs `redis:7-alpine` plus `nginx:1.27-alpine`.
  - Deploy starts gateway Redis and waits for `PONG` before starting workers.
  - Deploy validates generated nginx config with `nginx -t` before starting gateway proxy.
  - k3s is present for manual/learning inspection but not used for live game routing yet.
  - Godot connects to gateway `ws://<gateway-public-ip>:3000`; nginx routes WebSocket traffic to workers.

## Inputs/Outputs
- Input: GitHub push/manual run and repository secrets.
- Output: gateway reverse proxy + Redis on EC2-1, server Docker containers on EC2-2/EC2-3.

## Dependencies
- [[Server Docker Image]]
- [[Terraform Infrastructure]]
- [[Staging Deploy Guide]]

## Notes
- This is the active path.
- User does not test in local machine but in Github Action and staging only.
