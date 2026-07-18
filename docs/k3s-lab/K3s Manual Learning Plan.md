# Server K3s

## Purpose
- Build a parallel K3s learning stack without mutating the Docker staging Terraform, Ansible, workflows, or EC2 resources.
- Keep `wss://corp-tower.duckdns.org` as the single public endpoint. Docker staging and Server K3s should not both own DuckDNS at the same time.
- Prepare the K3s manifests so Argo CD can adopt the stack later after the lab is stable.

## Topology
- `EC2-GW`: public IPv4, SSH bastion, Caddy WSS gateway, DuckDNS updater, and NAT instance.
- `EC2-K3S-CP`: private K3s server/control plane, default `t3.small`.
- `EC2-K3S-A1` and `EC2-K3S-A2`: private K3s agents, default `t3.micro`.
- VPC CIDR defaults to `10.60.0.0/16` to avoid K3s default pod CIDR `10.42.0.0/16` and service CIDR `10.43.0.0/16`.

## Workflow Order
1. Run `Server K3s Infra Plan`.
2. Run `Server K3s Infra Apply` with `APPLY_SERVER_K3S`.
3. Run `Server K3s Automated Master` with `full_preflight` for the first normal K3s queue run.
4. Use `Server K3s Automated Master` with `fast_server_deploy` for ordinary server/image updates when the lab is already healthy.
5. Use `Server K3s Diagnostics` when AWS, SSH, DNS, or cluster reachability is suspicious.
6. Use `Server K3s Cleanup` runtime cleanup before returning the lab to a clean runtime state, or `terraform_destroy` with `DESTROY_SERVER_K3S` to remove Server K3s AWS resources.

`Server K3s Automated Master` also runs automatically on watched server and K3s path pushes to `main` or `master`.

## Runtime
- K3s disables Traefik and ServiceLB.
- Redis runs in-cluster as `redis:6379`.
- The game server runs two replicas with `REDIS_URL=redis://redis:6379`.
- The game service is a fixed NodePort on `30300/tcp`.
- EC2-GW Caddy reverse-proxies `corp-tower.duckdns.org` to private K3s node IPs on `30300`.

## Argo CD Readiness
- Argo CD is not installed by the first K3s rollout.
- Bootstrap manifests live in `infra/k3s/argocd/bootstrap`.
- When enabled later, Argo CD stays private and is accessed through bastion plus `kubectl port-forward`.
- First sync is manual. Automated prune/self-heal waits until one manual sync and rollback test succeed.
- Private repositories need a persistent repo-read credential; GitHub Actions `GITHUB_TOKEN` is not a long-lived Argo CD repo credential.

## Deprecated Docker Rollback
- Docker staging GitHub Actions workflows have been removed.
- Use Server K3s workflows for the active stack.

## Observability
- Run `Server K3s Diagnostics` for AWS topology, DuckDNS ownership, and SSH reachability.
- Use `kubectl -n corp-tower get pods -o wide`, `kubectl -n corp-tower get all -o wide`, and `kubectl get nodes -o wide` for current cluster state.
- Use `kubectl -n corp-tower logs deploy/corp-tower-server --all-containers --tail=200 -f` for live game server logs.
- Use `kubectl get events -A --sort-by=.lastTimestamp` for scheduling, image pull, restart, and readiness problems.
- Use `kubectl top nodes` and `kubectl top pods -A` if metrics-server is available.
- On EC2-GW, use `sudo docker logs -f corp-tower-k3s-caddy` for public gateway traffic/proxy issues.
- On K3s nodes, use `sudo journalctl -u k3s -f` on the control plane and `sudo journalctl -u k3s-agent -f` on agents.

## Secret Notes
- K3s workflows reuse the existing GitHub `staging` Environment.
- `EC2_STAGING_SSH_PUBLIC_KEY` is preferred for Terraform key-pair creation.
- If `EC2_STAGING_SSH_PUBLIC_KEY` is empty, K3s infra workflows derive the public key from `EC2_STAGING_SSH_KEY`.
