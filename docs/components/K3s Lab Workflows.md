# K3s Lab Workflows

## Purpose
- GitHub Actions entry points for the parallel K3s lab.

## Workflows
- `K3s-Lab-Automated-Master.yml`: K3s lab equivalent of the staging automated master, with full preflight, fast server deploy, and infra-plan-only modes.
- `K3s-Lab-Infra-Plan.yml`: plans the isolated K3s Terraform root.
- `K3s-Lab-Infra-Apply.yml`: applies reviewed K3s lab infrastructure after `APPLY_K3S_LAB`.
- `K3s-Lab-Deploy.yml`: tests server code, builds/pushes the Docker image, installs/configures K3s, refreshes ECR pull credentials, applies the Kustomize overlay, and runs a public WSS smoke test.
- `K3s-Lab-Diagnostics.yml`: inspects tagged lab AWS resources, verifies DuckDNS points at the K3s gateway, and probes SSH through the gateway bastion.
- `K3s-Lab-ECR-Auth-Refresh.yml`: refreshes namespace `corp-tower` secret `ecr-pull` every 6 hours while the lab is running so restarted pods can keep pulling private ECR images.
- `K3s-Lab-Cleanup.yml`: runtime cleanup removes K3s/Caddy artifacts; `terraform_destroy` removes lab AWS resources after `DESTROY_K3S_LAB`.

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
- K3s deploy and diagnostics are reusable workflow calls so `K3s-Lab-Automated-Master.yml` can orchestrate them.
- K3s owns automatic server-push deployment while the lab is live. Docker `Staging-Automated-Master.yml` is manual-only for rollback or showcase.
- ECR auth refresh does not deploy a new image. It only refreshes the Kubernetes `ecr-pull` image pull secret for the currently running lab.
- Argo CD is prepared in manifests only; no K3s workflow installs or exposes it.
