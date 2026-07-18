# Corp Tower Server K3s Ansible

## Purpose
- Configure the isolated Server K3s after Terraform creates EC2-GW and private K3s nodes.

## Responsibilities
- Generate a temporary inventory from AWS EC2 tag discovery.
- Configure EC2-GW as SSH bastion, NAT instance, Cloudflare DNS updater, and Caddy gateway.
- Install a single K3s server and private K3s agents.
- Render Caddy upstreams to K3s node private IPs on NodePort `30300`.
- Provide a runtime cleanup playbook for K3s services and gateway artifacts.

## CI Entry Points
- Workflow: `.github/workflows/Server-K3s-Deploy.yml`
- Workflow: `.github/workflows/Server-K3s-Cleanup.yml`
- Playbook: `playbooks/site.yml`
- Cleanup playbook: `playbooks/cleanup.yml`
- Inventory generator: `scripts/generate_k3s_inventory.py`
