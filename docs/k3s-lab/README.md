# K3s Lab

## Purpose
- Build a parallel K3s learning stack without mutating the Docker staging Terraform, Ansible, workflows, or EC2 resources.
- Keep `wss://corp-tower.duckdns.org` as the single public endpoint. Docker staging and K3s lab should not both own DuckDNS at the same time.
- Prepare the K3s manifests so Argo CD can adopt the stack later after the lab is stable.

## Topology
- `EC2-GW`: public IPv4, SSH bastion, Caddy WSS gateway, DuckDNS updater, and NAT instance.
- `EC2-K3S-CP`: private K3s server/control plane, default `t3.small`.
- `EC2-K3S-A1` and `EC2-K3S-A2`: private K3s agents, default `t3.micro`.
- VPC CIDR defaults to `10.60.0.0/16` to avoid K3s default pod CIDR `10.42.0.0/16` and service CIDR `10.43.0.0/16`.

## Workflow Order
1. Run `K3s Lab Infra Plan`.
2. Run `K3s Lab Infra Apply` with `APPLY_K3S_LAB`.
3. Run `K3s Lab Deploy`.
4. Keep `K3s Lab ECR Auth Refresh` enabled while the lab is running.
5. Use `K3s Lab Diagnostics` when AWS, SSH, or cluster reachability is suspicious.
6. Use `K3s Lab Cleanup` runtime cleanup before returning the lab to a clean runtime state, or `terraform_destroy` with `DESTROY_K3S_LAB` to remove lab AWS resources.

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

## Rollback To Docker
- Start the Docker staging EC2s.
- Run the existing `Staging Server Update` workflow.
- That workflow updates DuckDNS back to the Docker EC2 gateway and redeploys the Docker Redis/Caddy/server runtime.

## Secret Notes
- K3s workflows reuse the existing GitHub `staging` Environment.
- `EC2_STAGING_SSH_PUBLIC_KEY` is preferred for Terraform key-pair creation.
- If `EC2_STAGING_SSH_PUBLIC_KEY` is empty, K3s infra workflows derive the public key from `EC2_STAGING_SSH_KEY`.
