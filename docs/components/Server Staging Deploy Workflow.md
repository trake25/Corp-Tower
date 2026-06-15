# Server Staging Deploy Workflow

## Purpose
- Preferred server CI/CD path for staging.
- File: `.github/workflows/Server-Staging-Deploy.yml`.

## Responsibilities
- Test server code on GitHub VM.
- Build Docker image.
- Push image to ECR.
- Discover EC2 worker instances.
- Deploy server image as Docker containers on worker EC2 instances.
- Deploy Docker Redis and nginx reverse proxy to EC2-1 gateway.
- Fail early when the gateway and workers are not all in one subnet.

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
  - Verifies at least two running workers and one shared subnet.
  - Gateway EC2 runs external Redis simulation with `redis:7-alpine`.
  - Deploy keeps healthy Redis running; otherwise it recreates Redis and waits for `PONG`.
  - EC2-2/EC2-3 pull the ECR image and run `corp-tower-server` Docker containers.
  - Worker containers use `REDIS_URL=redis://<gateway-private-ip>:6379`.
  - Worker containers use `RECONNECT_TTL_SECONDS=10` for faster staging/debug reconnect testing.
  - Deploy validates generated nginx config with `nginx -t`.
  - Deploy reloads an existing gateway nginx container when possible instead of always recreating it.
  - Godot connects to gateway `ws://<gateway-public-ip>:3000`; nginx routes WebSocket traffic to worker private IPs on port `3000`.

## Inputs/Outputs
- Input: GitHub push/manual run and repository secrets.
- Output: gateway reverse proxy + external Redis on EC2-1, Docker server containers on EC2-2/EC2-3.

## Dependencies
- [[Server Docker Image]]
- [[Terraform Infrastructure]]
- [[Staging Deploy Guide]]
- [[Staging Runtime Cleanup Workflow]]

## Notes
- This is the active path.
- User does not test in local machine but in Github Action and staging only.
- Useful EC2 checks: `sudo docker ps --filter name=corp-tower`, `sudo docker logs corp-tower-gateway`, `sudo docker logs corp-tower-redis`, and on workers `sudo docker logs corp-tower-server`.
