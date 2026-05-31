# Corp-Tower staging deploy (Docker + Terraform + GitHub Actions)

Repository: [trake25/Corp-Tower](https://github.com/trake25/Corp-Tower)

Region: **ap-southeast-1**

This guide covers **Phase 1–3** only: Docker image in CI, AWS infra via Terraform, deploy to a **new staging EC2**. TLS / ALB (`wss://`) is intentionally skipped while testing.

---

## What runs where

| Step | Where | What happens |
|------|--------|----------------|
| 1 | GitHub Actions | `npm test` on server JS |
| 2 | GitHub Actions | `docker build` → push to **ECR** (OIDC, no AWS keys in workflow file) |
| 3 | GitHub Actions | SSH to **staging EC2** → `docker pull` → `docker run` |
| Legacy | Old EC2 | **Unchanged** — `Server-Update.yml` is disabled; old host keeps running until you retire it |

---

## Phase 1 — Docker (files only; build in CI)

- `src/Server/Dockerfile` — packages Node 24 + your `.js` files
- `src/Server/.dockerignore` — excludes local `node_modules`
- `Server.js` — reads `PORT` (default `3000`)

You do **not** need Docker Desktop locally. The first build happens on the GitHub runner.

---

## Phase 2 — Terraform (no AWS console)

### Prerequisites on your PC

1. [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5
2. [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) configured: `aws configure` (or env vars / SSO)

### One-time setup

```powershell
cd "d:\Projects\AWS Learning\Simple Game Projects\Corp-Tower\infra\terraform"
copy staging.tfvars.example staging.tfvars
# Edit staging.tfvars: set ssh_public_key to your PUBLIC key (see below)
terraform init
terraform plan -var-file=staging.tfvars
terraform apply -var-file=staging.tfvars
```

After `apply`, save outputs:

```powershell
terraform output -json
```

Important outputs:

| Output | GitHub secret / use |
|--------|---------------------|
| `github_actions_role_arn` | **AWS_ROLE_ARN** (new) |
| `ecr_repository_url` | **ECR_REPOSITORY** — use the repo **name** only: `corp-tower-server-staging` (see workflow: login provides registry host) |
| `staging_ec2_public_ip` | **EC2_STAGING_HOST** (new) |
| `staging_ssh_user` | **EC2_STAGING_USER** → usually `ec2-user` |

**ECR_REPOSITORY secret:** Set to the repository **name** from `ecr_repository_name` output (e.g. `corp-tower-server-staging`), not the full URL. The workflow combines registry + name.

### SSH public key

Use the **public** key that matches the **private** key in GitHub `EC2_STAGING_SSH_KEY`:

- If you reuse the same deploy key as legacy `EC2_SSH_KEY`, paste that key’s `.pub` content into `ssh_public_key` in `staging.tfvars`.
- Amazon Linux user: **ec2-user**.

### Optional: remote state (no console after bootstrap)

```powershell
cd infra/bootstrap
terraform init
terraform apply
# Uncomment backend "s3" in infra/terraform/versions.tf, then:
cd ../terraform
terraform init -migrate-state
```

Add `staging.tfvars` to `.gitignore` if it contains sensitive CIDRs (example file is safe to commit).

---

## Phase 3 — GitHub Actions

Workflow: `.github/workflows/Server-Staging-Deploy.yml`

Triggers: push to `main`/`master` when `src/Server/**` changes, or **workflow_dispatch**.

Deprecated: `.github/workflows/Server-Update.yml` — manual run only, always fails with a message.

### GitHub environment

Create environment **staging** (Settings → Environments → staging) if you use protection rules. The workflow uses `environment: staging`.

### OIDC (no long-lived AWS access keys required)

Terraform creates IAM role `corp-tower-staging-github-actions` trusted for:

`repo:trake25/Corp-Tower:ref:refs/heads/main` (and `master`)

The workflow uses:

```yaml
permissions:
  id-token: write
```

and `aws-actions/configure-aws-credentials` with `secrets.AWS_ROLE_ARN`.

**You do not need** `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` for ECR push if OIDC is configured.

---

## GitHub secrets — reuse vs new

| Secret | Reuse? | Notes |
|--------|--------|--------|
| `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`, `EC2_REPO_PATH`, `EC2_PORT` | **Keep** | Legacy prod EC2; unused by new workflow |
| `EC2_STAGING_HOST` | **New** | From `terraform output staging_ec2_public_ip` |
| `EC2_STAGING_USER` | **New** | `ec2-user` |
| `EC2_STAGING_PORT` | **New** | `22` (optional if default) |
| `EC2_STAGING_SSH_KEY` | **Reuse value** | Same **private** key as `EC2_SSH_KEY` if same key pair registered in Terraform |
| `AWS_ROLE_ARN` | **New** | From `terraform output github_actions_role_arn` |
| `ECR_REPOSITORY` | **New** | ECR repo **name**: `corp-tower-server-staging` |
| `AWS_ACCESS_KEY_ID` | **Not required** | OIDC replaces for build/push |

### Configure secrets

GitHub → **Settings → Secrets and variables → Actions → Repository secrets**

1. `AWS_ROLE_ARN` = terraform output `github_actions_role_arn`
2. `ECR_REPOSITORY` = `corp-tower-server-staging` (or `terraform output ecr_repository_name`)
3. `EC2_STAGING_HOST` = staging public IP
4. `EC2_STAGING_USER` = `ec2-user`
5. `EC2_STAGING_SSH_KEY` = copy from existing `EC2_SSH_KEY` if same key

---

## After first deploy

1. **Godot client** — update `NetworkManager.gd` to staging IP (still `ws://` for now):
   - `ws://<EC2_STAGING_HOST>:3000`
2. **Legacy EC2** — leave running until you switch all testers; stop PM2 there when ready to avoid confusion on port 3000 if you ever point DNS to old host.
3. **Verify on EC2:**
   ```bash
   ssh -i your-key ec2-user@<staging-ip>
   sudo docker ps
   sudo docker logs corp-tower-server
   ```

---

## Rollback

In GitHub Actions, re-run deploy for an older commit, or SSH:

```bash
sudo docker pull <account>.dkr.ecr.ap-southeast-1.amazonaws.com/corp-tower-server-staging:<older-sha>
sudo docker stop corp-tower-server && sudo docker rm corp-tower-server
sudo docker run -d --name corp-tower-server --restart unless-stopped -p 3000:3000 -e PORT=3000 <image-uri>
```

---

## Troubleshooting

| Problem | Check |
|---------|--------|
| OIDC / AssumeRole failed | `AWS_ROLE_ARN` correct; repo is `trake25/Corp-Tower`; branch is `main`/`master` |
| ECR push denied | Role policy attached; repository name matches `ECR_REPOSITORY` |
| SSH failed | `EC2_STAGING_HOST`; security group `ssh_cidr`; public key in `staging.tfvars` matches private secret |
| `docker pull` failed on EC2 | Instance profile on EC2; Docker installed (`user_data`); wait 2–3 min after first boot |
| Port 3000 in use | Stop legacy PM2/node on **staging** host only (new instance should be clean) |
| Workflow did not run | Push must touch `src/Server/**` or use **workflow_dispatch** |

---

## Manual checklist (you must do these)

- [ ] Install Terraform + AWS CLI; `aws configure`
- [ ] Create `infra/terraform/staging.tfvars` from example (with your `ssh_public_key`)
- [ ] Run `terraform apply`
- [ ] Add GitHub secrets: `AWS_ROLE_ARN`, `ECR_REPOSITORY`, `EC2_STAGING_*`
- [ ] Create GitHub **staging** environment (optional)
- [ ] Push to `main` or run workflow manually
- [ ] Update Godot `ws://` URL to staging IP
- [ ] Retire legacy workflow / EC2 when ready (not required for learning)

---

## Next phases (not in this doc)

- Phase 4: `wss://`, domain, ALB
- Phase 5–6: Production duplicate stack, multi-EC2 + stickiness
