# Concept Map — deploy

DRAFT GENERATED OUTPUT. The repository generator should validate every source target,
resolve stable anchors to current line numbers, and emit bounded source-read ranges.

## deploy.backup.auto-deploy

Owner: `deployment-backup.md` → **Auto-deploy guard**

| Source seed | Status |
|---|---|
| `.github/workflows/Backup-Deploy-All.yml#@file` | coarse `@file` seed — refine before activation |

## deploy.backup.cloudflare-record

Owner: `deployment-backup.md` → **Cloudflare record verification**

_No source seed authored yet; repository-side inspection must add one before source retrieval is enabled for this concept._

## deploy.backup.cloudflare-tls

Owner: `deployment-backup.md` → **Cloudflare TLS**

_No source seed authored yet; repository-side inspection must add one before source retrieval is enabled for this concept._

## deploy.backup.cloudflared-service

Owner: `deployment-backup.md` → **Tunnel service ownership**

_No source seed authored yet; repository-side inspection must add one before source retrieval is enabled for this concept._

## deploy.backup.connector-uniqueness

Owner: `deployment-backup.md` → **Connector uniqueness**

_No source seed authored yet; repository-side inspection must add one before source retrieval is enabled for this concept._

## deploy.backup.demo-mode

Owner: `deployment-backup.md` → **Demo differences**

_No source seed authored yet; repository-side inspection must add one before source retrieval is enabled for this concept._

## deploy.backup.demo-redis

Owner: `deployment-backup.md` → **Demo Redis**

| Source seed | Status |
|---|---|
| `scripts/backup/backup-redis-up.sh#@file` | coarse `@file` seed — refine before activation |

## deploy.backup.machine-state

Owner: `deployment-backup.md` → **Machine-local state**

_No source seed authored yet; repository-side inspection must add one before source retrieval is enabled for this concept._

## deploy.backup.offline-runner

Owner: `deployment-backup.md` → **Offline runner behavior**

| Source seed | Status |
|---|---|
| `.github/workflows/Backup-Deploy-All.yml#@file` | coarse `@file` seed — refine before activation |

## deploy.backup.runbook

Owner: `deployment-backup.md` → **Operator runbook**

_No source seed authored yet; repository-side inspection must add one before source retrieval is enabled for this concept._

## deploy.backup.topology

Owner: `deployment-backup.md` → **Host topology**

_No source seed authored yet; repository-side inspection must add one before source retrieval is enabled for this concept._

## deploy.backup.workflow-context

Owner: `deployment-backup.md` → **Reusable workflow trigger context**

_No source seed authored yet; repository-side inspection must add one before source retrieval is enabled for this concept._

## deploy.backup.workflow-skips

Owner: `deployment-backup.md` → **Skipped-job dependency**

| Source seed | Status |
|---|---|
| `.github/workflows/Backup-Deploy-All.yml#@file` | coarse `@file` seed — refine before activation |

## deploy.eks.applied-tree

Owner: `deployment-eks.md` → **Applied-tree guard**

| Source seed | Status |
|---|---|
| `.github/workflows/EKS-Infra-Apply.yml#@file` | coarse `@file` seed — refine before activation |
| `.github/workflows/EKS-Deploy-Server.yml#@file` | coarse `@file` seed — refine before activation |

## deploy.eks.destroy-verification

Owner: `deployment-eks.md` → **Destroy verification**

| Source seed | Status |
|---|---|
| `.github/workflows/EKS-Infra-Destroy.yml#@file` | coarse `@file` seed — refine before activation |

## deploy.eks.dns

Owner: `deployment-eks.md` → **DNS update**

_No source seed authored yet; repository-side inspection must add one before source retrieval is enabled for this concept._

## deploy.eks.lifecycle

Owner: `deployment-eks.md` → **Infrastructure lifecycle**

| Source seed | Status |
|---|---|
| `.github/workflows/EKS-Infra-Apply.yml#@file` | coarse `@file` seed — refine before activation |
| `.github/workflows/EKS-Infra-Destroy.yml#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `deploy.shared.terraform-roots`

## deploy.eks.manual-setup

Owner: `deployment-eks.md` → **Operator setup**

| Source seed | Status |
|---|---|
| `.github/workflows/EKS-Shared-Infra-Apply.yml#@file` | coarse `@file` seed — refine before activation |

## deploy.eks.node-security

Owner: `deployment-eks.md` → **Node security groups**

_No source seed authored yet; repository-side inspection must add one before source retrieval is enabled for this concept._

## deploy.eks.topology

Owner: `deployment-eks.md` → **Topology**

_No source seed authored yet; repository-side inspection must add one before source retrieval is enabled for this concept._

## deploy.eks.workflows

Owner: `deployment-eks.md` → **Deployment workflows**

_No source seed authored yet; repository-side inspection must add one before source retrieval is enabled for this concept._

Adjacent concepts: `testing.release.gates`

## deploy.shared.auth-env

Owner: `deployment.md` → **Authentication environment**

_No source seed authored yet; repository-side inspection must add one before source retrieval is enabled for this concept._

Adjacent concepts: `backend.identity.auth`, `build.endpoint-auth.injection`

## deploy.shared.environments

Owner: `deployment.md` → **Environment model**

_No source seed authored yet; repository-side inspection must add one before source retrieval is enabled for this concept._

## deploy.shared.secret-rollout

Owner: `deployment.md` → **Secret rollout**

_No source seed authored yet; repository-side inspection must add one before source retrieval is enabled for this concept._

Adjacent concepts: `deploy.eks.workflows`

## deploy.shared.terraform-roots

Owner: `deployment.md` → **Terraform roots**

_No source seed authored yet; repository-side inspection must add one before source retrieval is enabled for this concept._

Adjacent concepts: `deploy.eks.lifecycle`

