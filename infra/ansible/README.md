# Corp Tower Staging Ansible

This folder contains the GitHub Actions Ansible deployment layer for the Docker staging path.

## Responsibilities
- Generate a temporary inventory from AWS EC2 tag discovery.
- Prepare the EC2 gateway and worker prerequisites used by staging deploys.
- Keep Docker Redis healthy on the gateway.
- Roll Docker worker containers with candidate validation, serial cutover, and rollback.
- Render and reload the gateway nginx upstream.

## CI Entry Points
- Workflow: `.github/workflows/Server-Staging-Deploy.yml`
- Playbook: `playbooks/staging_deploy.yml`
- Inventory generator: `scripts/generate_staging_inventory.py`

## Local Checks
Run these from the repository root when Python and Ansible are available:

```bash
python -m unittest discover -s infra/ansible/tests
ansible-playbook -i <generated-inventory.json> infra/ansible/playbooks/staging_deploy.yml --syntax-check
```

The full deploy is intended to run from GitHub Actions against staging EC2.
