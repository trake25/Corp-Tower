# Argo CD Bootstrap Readiness

These manifests are intentionally not applied during the first K3s rollout.

## Later Enablement Order
1. Apply `install/` to install Argo CD `v3.4.4` into namespace `argocd`.
2. Add a persistent repo-read credential if the repository is private.
3. Apply this directory after Argo CD CRDs exist.
4. Manually sync `corp-tower` once and verify rollback before enabling automated prune/self-heal.

Argo CD UI/API stays private. Access it through the bastion and `kubectl port-forward`, not a public Service.
