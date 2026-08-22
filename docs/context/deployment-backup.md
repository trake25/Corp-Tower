# Physical Backup Deployment

Scope: self-hosted backup and public-demo topology, guards and recovery operations.

## Backup (physical machine)

A manually-operated Linux Mint machine runs six containers behind one shared
Cloudflare Tunnel, independent of AWS: two dev game servers
(`devwstod1`/`devwstod2`), two dev web servers (`devtod1`/`devtod2`), and one
always-on public demo pair (`wstoddemo`/`toddemo`, instance **3**). Game servers
run the unmodified server image.

**No Redis for the two dev instances** — `Redis_State.js`'s in-memory fallback,
correct for one machine, wrong for multi-replica EKS. Instance 3 (`wstoddemo`)
alone gets a real, persistent `redis:7-alpine` container
(`scripts/backup/backup-redis-up.sh`, appendonly, its own docker network) so
the public demo-completion counters survive a redeploy's container recreate,
not just a crash. `scripts/backup/backup-redis-reset-demo-stats.sh` zeroes
just the two `stats:demo:*` keys — never a `FLUSHALL`, since this Redis also
now backs `wstoddemo`'s live room/session/queue state. Game servers bind
loopback only, matching the web servers: `cloudflared` is the only intended
caller.

**Landmine — Cloudflare's free Universal SSL covers the zone apex and exactly one
subdomain level.** A two-level name behind a *proxied* record (which a Tunnel
requires) hits a bare TLS handshake failure. The EKS hostnames escape it only
because they are DNS-only (`proxied:false`) with the ALB serving the ACM wildcard
itself, so Cloudflare never terminates for them. Reusing an existing
two-level hostname does not dodge it either — Cloudflare's edge, not the origin,
terminates TLS for a proxied record.

**Landmine — `cloudflared` must only ever run as the user-level systemd service.**
The system-level unit is masked, so a plain `sudo systemctl start cloudflared`
without `--user` targets that masked unit and is a **no-op on the real tunnel**,
not a restart of it. It also needs `loginctl enable-linger` once, since a
self-hosted runner has no TTY for a `sudo` prompt.

**Landmine — two connectors alive on one tunnel ID does not error.** Cloudflare's
edge pins requests to whichever connector it prefers, so a hostname the stale
connector's config doesn't know about 404s while DNS, Docker and both "tunnel
active" checks all still look healthy.

**Landmine — `actions/checkout`'s clean step wipes gitignored and untracked files**
inside the checkout. That is why per-run state lives in a machine-local
`$CORP_TOWER_BACKUP_STATE_DIR`: `.env.backup`, the web content dirs, and the
Tunnel's own config and credentials.

Script logic is tracked in `scripts/backup/` so the multi-instance fan-out gets
review, CI and history; only genuinely secret material stays off-repo.

The dev web exports embed the Supabase public configuration and their own
`https://devtod{1,2}.galaxxigames.com/` OAuth redirect. The backup game deploy
inherits the matching verification, profile-store, Facebook, and identity secrets
so `devwstod{1,2}` can verify those signed-in clients. Both redirect URLs must
remain in Supabase's allow list.

`stop_cloudflared_if_idle` only stops the tunnel once **all six** containers are
down — with the demo always running, it effectively never stops on its own.

**The demo differs from the dev instances in four ways**, all resolved from the
instance index: bots enabled (it fills every seat), debug UI off, demo mode on
(the client's bots-disclosure label), and its own dispatchers carrying **no push
trigger**, so a routine push can never redeploy it.
The demo is deliberately off the push path: it is a link on a résumé, and a routine
commit must never redeploy it.

### Auto-deploy guard rails check live status, not a stored flag

`Backup-Deploy-All.yml` auto-deploys on push, diffing the push range to deploy only
the services whose paths actually changed, always targeting **instance 1**, behind
a job probing that target's actual live state with `docker ps`. Manual dispatch
ignores the changed-paths check and runs unguarded. Instance 3 is deliberately not
a choice — the demo has its own dispatchers.

The guard reads **live container status**, not a stored flag another workflow must
remember to set — a runtime check cannot drift out of sync. Unguarded, an
auto-deploy silently undoes an intentional stand-down on the next matching push.

**Landmine — the backup guards are self-hosted jobs and queue indefinitely with no
timeout** when the machine's runner is offline, so a push while the machine is off
just waits rather than failing fast.

**Landmine — a skipped guard job cascades downstream.** A job's default `if` is
`success()`, evaluated against its **entire** upstream graph, not just its direct
`needs`. Any job downstream of a conditionally-skipped job needs an explicit
`if: always() && needs.<dep>.result == 'success'`.

**Landmine — `github.event_name` reflects the top-level run's trigger**, unchanged
however many `workflow_call` levels deep a job sits. Checking it fired confirmation
gates on the fully-automated path too, and the first real test of automatic
failover failed before ever reaching the machine. The shape that works is an
explicit boolean declared only under `on.workflow_call.inputs`, checked as
`inputs.invoked_via_call != true`, since `inputs.*` genuinely is per-invocation.

**Landmine — `dig` never sees a CNAME for a proxied record.** Cloudflare resolves
the hostname straight to its own anycast addresses, so the query is always empty
and the wait loop always timed out and died. `wait_for_cname` re-queries the
Cloudflare API and compares `.result[0].content`; `dig` is out of these scripts'
`require_cmd` lists entirely. The API reflects a write immediately, so the retry
loop is a margin against a transient read, not a propagation wait.

### Runbook (backup)

1. **Bring a dev instance up:** dispatch `Backup Deploy All` narrowed, or run
   `scripts/backup/backup-{server,web}-up.sh <instance>` on the machine.
2. **Redeploy the demo:** dispatch `Demo Deploy` — `Backup Deploy All` does not
   reach instance 3.
3. **Check state:** `Backup Diagnose`, or the `*-status.sh` scripts.
4. **Stand down:** `Backup Cleanup All` (dev) or `Demo Cleanup` (demo), each with
   its own typed phrase.

**No workflow in this repo has a `pull_request` trigger** — required, since a
self-hosted runner would otherwise let any external contributor's PR execute code
on the physical machine.
