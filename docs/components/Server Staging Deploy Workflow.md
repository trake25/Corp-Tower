# Server Staging Deploy Workflow

## Purpose
- Manual Docker server CI/CD path for staging rollback or showcase.
- File: `.github/workflows/Server-Staging-Deploy.yml`.

## Responsibilities
- Run CI/CD jobs on the pinned GitHub runner image `ubuntu-24.04`.
- Test server code on GitHub VM.
- Build Docker image.
- Push image to ECR.
- Discover EC2 worker instances.
- Generate a transient Ansible inventory from AWS EC2 tag discovery.
- Deploy server image as Docker containers on worker EC2 instances through Ansible.
- Deploy Docker Redis and Caddy reverse proxy to EC2-1 gateway through Ansible.
- Fail early when the gateway and workers are not all in one subnet.

## Key Logic
- Trigger: manual `workflow_dispatch` or reusable workflow call from [[Staging Automated Master Workflow]].
- Jobs:
  - `test-server`
  - `build-and-push`
  - `deploy-staging`
- CI dependency install uses `npm ci` with GitHub npm cache and the committed server lockfile.
- GitHub Action dependencies are pinned to Node 24-compatible majors, and server tests use Node.js `24.14.1`.
- Docker image builds use BuildKit GitHub Actions cache and push the immutable commit SHA image tag.
- Ansible is installed from `infra/ansible/requirements.txt` and runs from `infra/ansible/playbooks/staging_deploy.yml`.
- The inventory generator unit tests run before AWS target discovery.
- Step summaries include timing visibility for server tests, image push, Ansible setup, EC2 target discovery, SSH host key setup, and the Ansible deploy.
- Server container healthchecks run on a short staging cadence so Docker reports recovery quickly during rolling deploys.
- AWS auth:
  - OIDC role via `AWS_ROLE_ARN`.
- Deploy:
  - Finds running worker instances by Terraform tags.
  - Verifies at least two running workers and one shared subnet.
  - Generates a temporary Ansible inventory that preserves worker public/private IP pairing from one AWS JSON response.
  - Runs `ansible-playbook --syntax-check` before deploying.
  - Gateway EC2 runs external Redis simulation with `redis:7-alpine`.
  - Deploy keeps healthy Redis running; otherwise it recreates Redis and waits for `PONG`.
  - EC2-2/EC2-3 pull the ECR image and prepare candidate `corp-tower-server-next` containers in parallel.
  - Worker containers use `REDIS_URL=redis://<gateway-private-ip>:6379`.
  - Worker containers use `RECONNECT_TTL_SECONDS=10` for faster staging/debug reconnect testing.
  - Worker containers retry Redis startup connection for EC2 stop/start boot-order recovery.
  - Deploy updates DuckDNS so `corp-tower.duckdns.org` points at the current EC2-1 public IP.
  - Deploy validates generated Caddyfile with `caddy validate`.
  - Deploy stores the generated Caddyfile under `/etc/corp-tower/caddy` so gateway restart survives EC2 stop/start.
  - Before each worker update, deploy reloads Caddy without that worker in the upstream.
  - If a candidate container fails, the current worker container is left in place.
  - If the replacement container fails after the current worker was removed, deploy attempts to restore the previous worker image before failing.
  - If any worker update fails, deploy restores the full gateway upstream before exiting.
  - After the worker is healthy, deploy continues to the next worker and finally restores all healthy workers in Caddy.
  - Deploy reloads an existing gateway Caddy container when possible instead of always recreating it.
  - Godot connects to gateway `wss://corp-tower.duckdns.org`; Caddy routes WebSocket traffic to worker private IPs on port `3000`.

## Inputs/Outputs
- Input: manual run or reusable workflow call, repository secrets, and `DUCKDNS_TOKEN` in the GitHub `staging` environment.
- Output: gateway reverse proxy + external Redis on EC2-1, Docker server containers on EC2-2/EC2-3.

## Dependencies
- [[Server Docker Image]]
- [[Terraform Infrastructure]]
- [[Staging Deploy Guide]]
- [[Staging Runtime Cleanup Workflow]]

## Notes
- This is the Docker rollback/showcase path while K3s owns the live endpoint.
- Rolling worker drain reduces new connections to a worker while it is being replaced; existing WebSocket connections on that worker can still drop and rely on client reconnect.
- This workflow is the only workflow that should install/update the active Docker runtime; [[Staging Runtime Cleanup Workflow]] is scoped to remove what this workflow creates except EC2 prerequisites.
- User does not test in local machine but in Github Action and staging only.
- Useful EC2 checks: `sudo docker ps --filter name=corp-tower`, `sudo docker logs corp-tower-gateway`, `sudo docker logs corp-tower-redis`, and on workers `sudo docker logs corp-tower-server`.
