# Corp Tower — AI Context Entry Point

Read this first, then load **only** the docs the task needs (see Task router). This is the single entry to the `docs/context/` knowledge base. Tool-agnostic — per-tool shims (e.g. gitignored `CLAUDE.md`) just point here.

## System

3-player real-time **selfish-cooperation** tower puzzle. Godot Android client, authoritative Node.js WebSocket server, Redis shared state. Server is authoritative; the client renders `game_state` and never computes final outcomes.

| Layer | Stack |
|---|---|
| Client | Godot `4.6.2.stable`, GDScript, `WebSocketPeer` |
| Server | Node.js, `ws`, `redis` — entry `src/Server/app/Server.js` |
| Shared state | Redis (multi-worker matchmaking / room / reconnect) |
| Infra | Terraform · K3s-on-EC2 (active) · EKS (plan-only) · Docker · Caddy |
| CI/CD | GitHub Actions |
| Endpoint | `wss://ws.tod.galaxxigames.com` (primary) · `wss://devtod.galaxxigames.com` (manual physical backup, see [deployment.md](./deployment.md#backup-server-manual-physical-machine)) |

## Working rules (always apply)

- Server is authoritative; the client never computes final gameplay outcomes.
- **No explanatory comments in source** — context goes in the matching `docs/context/*.md`. Sole exception: `SAFETY EXCEPTION` credential/security comments.
- **One owning doc per concept** (see Task router / [coding-conventions.md](./coding-conventions.md)). Edit that doc, never a duplicate.
- **Docs change only when the user runs `/update-docs`**, after the goal is confirmed reached — never speculatively.
- Read source only when a doc is insufficient; then read only the needed section, not whole files.
- Do **not** commit / push / pull / compare with remote unless explicitly instructed.

## Retrieval (load least; escalate only if needed)

`Tier 0` this file (always) → `Tier 1` the task's domain doc(s) via Task router → `Tier 2` [module-index.md](./module-index.md) row → the exact source `file:section` → `Tier 3` open source only if the doc is insufficient.
**Fallback:** if all tiers miss, do a scoped search (respect the Ignore map), then record the finding in the owning doc via `/update-docs` so the next session hits Tier 1 instead of searching again.

## Task router

| Task | Load (Tier 1) | Usually skip |
|---|---|---|
| Gameplay rules / scoring / balance / tuning semantics | [gameplay.md](./gameplay.md) | ui, deployment, build |
| Server logic (rooms / engine / scoring / impacts / bots) | [backend.md](./backend.md) + [module-index.md](./module-index.md) | ui, deployment, build |
| WebSocket messages / payload shapes / reconnect wire | [networking.md](./networking.md) | deployment, build |
| Godot client UI / scenes / popovers | [ui.md](./ui.md) + [module-index.md](./module-index.md) | deployment, build, networking |
| Deploy / K3s / EKS / infra / runbook | [deployment.md](./deployment.md) | gameplay, ui |
| CI build / Android / HTML5 / private art pipeline | [build.md](./build.md) | gameplay, deployment |
| Tests / balance simulator / CI gates | [testing.md](./testing.md) | deployment |
| "Why is it built this way?" / rejected options / known gaps | [decisions.md](./decisions.md) | — |
| "Which file does X?" | [module-index.md](./module-index.md) | — |
| Terms / renames / tuning shorthand | [glossary.md](./glossary.md) | — |
| System shape / runtime flow / repo layout | [architecture.md](./architecture.md) | — |

Every domain doc states its scope on line 1. Full doc catalog → [module-index.md](./module-index.md).

## Ignore map (don't read unless explicitly asked)

- **Godot generated:** `**/*.uid`, `**/*.import`, `.godot/`, `**/*.tres`
- **Third-party / lockfiles:** `**/addons/`, `node_modules/`, `**/package-lock.json`
- **Terraform state:** `**/.terraform/`, `**/*.tfstate*`, `**/.terraform.lock.hcl`
- **Assets / binaries:** `*.ttf`, `*.fnt`, `*.png`, `*.svg`, private art `src/Client/App/corp-tower/Cor/Art/`
- **Local / working:** `plan/`, `TOD*` hand-off files, build/export output
- **Read only when working that area:** `**/tests/`, `**/Tests/`, `*.tscn` (consult [ui.md](./ui.md) node contract first)

## Token discipline

A common task should load **this file + 1–2 domain docs** and do **0** repo-wide searches. Loading all of `docs/context/` (~1.2k lines) for a single task defeats the purpose — route, don't sweep.
