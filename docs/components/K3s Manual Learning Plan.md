# K3s Manual Learning Plan

## Purpose
- Preserve the step-by-step K3s learning plan, proof checks, and rollback notes for Corp Tower.
- Keep the old Docker staging notes only as historical rollback context.
- Require a revert path after every implementation step before moving forward.

## Current Baseline
- Active staging now runs on the Server K3s path in [[Server K3s Stack]] and [[Server K3s Workflows]].
- Docker staging GitHub Actions workflows have been removed.
- `Server K3s Automated Master` owns watched server/K3s path pushes while K3s is live.
- The K3s implementation track uses isolated AWS resources, separate Terraform state, and Argo CD-ready manifests.
- The current Terraform `instance_type` default is `t3.micro`. K3s documents a server baseline of 2 CPU cores and 2 GB RAM, while agents need 1 CPU core and 512 MB RAM. Do not start the control plane on the current default size unless the node is intentionally resized or replaced for the lab.

## Source Notes
- K3s requirements: https://docs.k3s.io/installation/requirements
- K3s quick start: https://docs.k3s.io/quick-start
- K3s configuration options: https://docs.k3s.io/installation/configuration
- K3s backup and restore: https://docs.k3s.io/datastore/backup-restore
- K3s uninstall: https://docs.k3s.io/installation/uninstall
- K3s etcd snapshots: https://docs.k3s.io/cli/etcd-snapshot

## Guardrails
- Keep rollback steps explicit while K3s owns the live endpoint.
- Do one phase at a time. Each phase must have:
  - baseline capture
  - manual action
  - proof check
  - rollback command or AWS rollback path
- Prefer an isolated Server K3s EC2 set if AWS credits allow it. If reusing staging EC2, stop or clean Docker runtime first and accept that staging may be unavailable during the lab.
- Keep K3s node networking private where possible. Do not expose Flannel VXLAN UDP `8472` to the internet.
- Use a K3s config file for settings we want to remember instead of relying only on install command flags.
- Take AWS EBS snapshots before installing K3s on any existing staging node.
- Back up `/var/lib/rancher/k3s/server/token` with any K3s datastore backup. The token is required to decrypt confidential datastore content during restore.

## Recommended Topology
- Learning control-plane: EC2-1 gateway only after resizing to at least 2 GB RAM, or a temporary separate K3s server node.
- Learning agents: EC2-2 and EC2-3 can be agents if their size meets agent minimums.
- First cluster mode: one K3s server using the default SQLite datastore, plus optional agents.
- Later cluster mode: embedded etcd only after the single-server path is understood; etcd adds restore and quorum complexity.

## Phase 0 - Baseline And Stop Criteria
### Manual Action
- Run `Server K3s Diagnostics`.
- Run `Server K3s Infra Plan` and review the plan.
- Record:
  - EC2 instance ids, public IPs, private IPs, subnet id, and security group id.
  - current game URL: `wss://corp-tower.duckdns.org`
  - current Docker containers on each node: `sudo docker ps --format '{{.Names}} {{.Image}} {{.Status}}'`

### Proof Check
- Godot can connect to the Server K3s gateway.
- K3s nodes, Redis, and server replicas are ready.

### Rollback
- No changes should have been made.

## Phase 1 - Infra Safety Prep
### Manual Action
- Decide whether the lab uses separate K3s EC2 nodes or the existing staging nodes.
- If reusing staging nodes:
  - create EBS snapshots for EC2-1, EC2-2, and EC2-3 root volumes
  - stop nonessential runtime containers before K3s install testing
  - resize the K3s server node to at least 2 GB RAM
- Add only the minimum security group rules needed for the selected phase:
  - TCP `6443` from staging nodes to K3s server
  - UDP `8472` self-referenced between K3s nodes when using default Flannel VXLAN
  - TCP `10250` self-referenced between K3s nodes for kubelet metrics/API
  - TCP `2379-2380` self-referenced only when testing embedded etcd HA

### Proof Check
- AWS console or diagnostics confirms the intended node size and security group rules.
- No K3s process is installed yet.

### Rollback
- Remove the added security group rules.
- Resize the node back to the previous instance type if it was changed.
- If any node fails to boot after resizing, restore from the EBS snapshot.

## Phase 2 - Single Server Install
### Manual Action
- SSH to the K3s server node.
- Create `/etc/rancher/k3s/config.yaml`:

```yaml
write-kubeconfig-mode: "644"
node-name: "corp-tower-k3s-server-1"
disable:
  - traefik
  - servicelb
```

- Install K3s as a system service:

```sh
curl -sfL https://get.k3s.io | sh -
```

- Record the installed version:

```sh
k3s --version
```

### Proof Check
```sh
sudo systemctl status k3s --no-pager
sudo k3s kubectl get nodes -o wide
sudo k3s kubectl get pods -A
```

### Rollback
- Soft stop without deleting data:

```sh
sudo systemctl stop k3s
```

- Full uninstall if the lab node should return to the Docker path:

```sh
sudo /usr/local/bin/k3s-uninstall.sh
```

- If uninstall does not return the node to a clean state, restore the root volume from the EBS snapshot.

## Phase 3 - Add One Agent
### Manual Action
- On the server, read the agent token:

```sh
sudo cat /var/lib/rancher/k3s/server/node-token
```

- On EC2-2, join the cluster:

```sh
curl -sfL https://get.k3s.io | K3S_URL=https://<server-private-ip>:6443 K3S_TOKEN=<node-token> sh -
```

### Proof Check
```sh
sudo k3s kubectl get nodes -o wide
```

### Rollback
- On the agent:

```sh
sudo /usr/local/bin/k3s-agent-uninstall.sh
```

- On the server:

```sh
sudo k3s kubectl delete node <agent-node-name>
```

## Phase 4 - Add The Second Agent
### Manual Action
- Repeat Phase 3 for EC2-3.

### Proof Check
- `kubectl get nodes` shows one server and two ready agents.
- All system pods are healthy.

### Rollback
- Run the agent uninstall script on EC2-3.
- Delete the node object from the cluster.
- If node cleanup is confusing, stop and keep only the single-server lab until the agent flow is understood.

## Phase 5 - Deploy A Disposable Test Workload
### Manual Action
- Create a learning namespace:

```sh
sudo k3s kubectl create namespace corp-tower-k3s-lab
sudo k3s kubectl create deployment hello --image=caddy:2-alpine -n corp-tower-k3s-lab
sudo k3s kubectl expose deployment hello --port=80 --target-port=80 -n corp-tower-k3s-lab
```

### Proof Check
```sh
sudo k3s kubectl get all -n corp-tower-k3s-lab
sudo k3s kubectl port-forward -n corp-tower-k3s-lab service/hello 8080:80
```

### Rollback
```sh
sudo k3s kubectl delete namespace corp-tower-k3s-lab
```

## Phase 6 - Deploy Corp Tower Internally
### Manual Action
- Create namespace:

```sh
sudo k3s kubectl create namespace corp-tower
```

- Create a short-lived ECR image pull secret:

```sh
ECR_PASSWORD="$(aws ecr get-login-password --region ap-southeast-1)"
sudo k3s kubectl create secret docker-registry ecr-pull \
  --docker-server=<account-id>.dkr.ecr.ap-southeast-1.amazonaws.com \
  --docker-username=AWS \
  --docker-password="$ECR_PASSWORD" \
  -n corp-tower
unset ECR_PASSWORD
```

- Deploy Redis first, then deploy `corp-tower-server` with:
  - `NODE_ENV=staging`
  - `PORT=3000`
  - `REDIS_URL=redis://redis:6379`
  - `RECONNECT_TTL_SECONDS=10`

### Proof Check
- Redis pod is ready.
- Server deployment has at least two ready replicas.
- Server logs show it started and connected to Redis.
- Internal service DNS resolves from a temporary debug pod.

### Rollback
```sh
sudo k3s kubectl delete namespace corp-tower
```

## Phase 7 - Expose The Game Deliberately
### Manual Action
- Start with a temporary NodePort or port-forward instead of changing the public gateway immediately.
- Only after internal tests pass, decide between:
  - keep Docker Caddy as the external gateway and point it to K3s node/service endpoints
  - use a Kubernetes Ingress controller in a separate phase
  - use K3s ServiceLB in a separate phase

### Proof Check
- Godot can connect through the selected temporary endpoint.
- Two real clients can reconnect through Redis-backed sessions.
- Rolling one server pod does not destroy active Redis state.

### Rollback
- Delete only the exposure object first:

```sh
sudo k3s kubectl delete service <public-service-name> -n corp-tower
```

- If exposure changed the Server K3s gateway, rerun [[Server K3s Workflows]] with `full_preflight`.

## Phase 8 - Decide Whether To Productize
### Manual Action
- Decision completed: Server K3s is the live automated lab path.
- Keep comparing the K3s path against the Docker workflow for:
  - learning value
  - runtime cost
  - operational complexity
  - rollback clarity
  - GitHub Actions changes required

### Proof Check
- Written decision in [[Corp_Tower_TDD]].

### Rollback
- Stop or uninstall Server K3s resources as needed.

## Backup And Revert Matrix
| Layer | Before Change | Proof | Revert |
|---|---|---|---|
| Docs | commit or patch review | links resolve | revert doc commit |
| Terraform/security group | `Server K3s Infra Plan` | rules visible in AWS | remove rules and re-apply |
| EC2 root volume | EBS snapshot | snapshot completed | stop instance, restore/swap volume |
| K3s server config | copy `/etc/rancher/k3s/config.yaml` | config file readable | edit config, restart, or uninstall |
| K3s SQLite datastore | copy `/var/lib/rancher/k3s/server/db/` and `/var/lib/rancher/k3s/server/token` | backup files exist off-node | stop K3s, restore db and token |
| K3s agent | none required beyond node baseline | node joins Ready | `k3s-agent-uninstall.sh` and delete node |
| Test namespace | namespace manifest or command log | workload ready | delete namespace |
| Corp Tower namespace | manifest snapshot | server and Redis pods ready | delete namespace |
| Public exposure | record previous Caddy/service config | Godot connects | delete exposure and rerun Docker deploy |

## Completion Definition
- The Server K3s promotion is complete only when:
  - Server K3s is documented as the active path
  - K3s server install, agent join, test workload, Corp Tower internal deployment, and exposure have each been executed with proof checks
  - each phase has been reverted successfully at least once
  - automatic K3s deploys are active and Docker deploys remain manual
