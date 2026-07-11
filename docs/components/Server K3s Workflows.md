# Server K3s Workflows

## Purpose
- GitHub Actions entry points for the parallel Server K3s.

## Workflows
- `Server-K3s-Automated-Master.yml`: Server K3s equivalent of the staging automated master, with full preflight, fast server deploy, and infra-plan-only modes.
- `Server-K3s-Infra-Plan.yml`: plans the isolated K3s Terraform root and allows create/delete actions to be reviewed manually.
- `Server-K3s-Infra-Apply.yml`: applies reviewed Server K3s infrastructure after `APPLY_SERVER_K3S`.
- `Server-K3s-Deploy.yml`: tests server code, builds/pushes the Docker image, installs/configures K3s, refreshes ECR pull credentials, applies the Kustomize overlay, and runs a public WSS smoke test.
- `Server-K3s-Diagnostics.yml`: inspects tagged lab AWS resources, verifies DuckDNS points at the K3s gateway, and probes SSH through the gateway bastion.
- `Server-K3s-Cleanup.yml`: runtime cleanup removes K3s/Caddy artifacts; `terraform_destroy` removes AWS resources managed by `infra/k3s/terraform` after `DESTROY_SERVER_K3S`.

## Automated Master
- Manual `full_preflight`: `Diagnostics -> Infra Plan -> K3s Deploy`.
- Manual `fast_server_deploy`: `K3s Deploy` directly for ordinary server/image updates when the lab infrastructure is already healthy.
- Manual `infra_plan_only`: `Infra Plan` without deployment.
- Pushes to `main` or `master` on watched server/K3s paths run automatically.
- Server or Kustomize app changes run the fast deploy path, Ansible changes run diagnostics before deploy, Terraform changes run infra plan, and K3s workflow changes run diagnostics plus infra plan.

## Required Secrets
- `AWS_ROLE_ARN`
- `ECR_REPOSITORY`
- `EC2_STAGING_USER`
- `EC2_STAGING_SSH_KEY`
- `DUCKDNS_TOKEN`
- Optional: `EC2_STAGING_SSH_PUBLIC_KEY`, `EC2_STAGING_PORT`, `STAGING_SSH_CIDR`, `STAGING_GAME_PORT_CIDR`
- K3s infra workflows derive the EC2 key-pair public key from `EC2_STAGING_SSH_KEY` when `EC2_STAGING_SSH_PUBLIC_KEY` is empty.

## Operational Checks
- Terraform `fmt` and `validate`.
- Server `npm test`.
- K3s Ansible syntax check.
- K3s nodes Ready.
- Redis deployment Ready.
- Two server replicas Ready.
- Caddy validates and reloads.
- DuckDNS resolves to the K3s gateway public IP.
- WebSocket smoke connects to `wss://corp-tower.duckdns.org`.

## Notes
- Workflows use the existing GitHub `staging` Environment to avoid duplicating secret names.
- K3s deploy and diagnostics are reusable workflow calls so `Server-K3s-Automated-Master.yml` can orchestrate them.
- Server K3s owns automatic server-push deployment while the lab is live.
- Argo CD is prepared in manifests only; no K3s workflow installs or exposes it.
