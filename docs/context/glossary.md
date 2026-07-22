# Glossary

Scope: project-specific terms. If a chat log, branch name, or old PR uses a term marked "formerly," it means the current system below it.

## Renamed systems (both renamed together, ahead of the production UI pass — see [decisions.md](./decisions.md))

| Current name | Formerly | What it is |
|---|---|---|
| **Power** | Politics | The item/quest system: side quests, Power items, activation |
| **Impact** | Checkpoint | The score-gate/rollback system, and the `Impacts.js` engine module (was `Checkpoints.js`) |
| **Refresh** (Power item) | Free Refresh (`free_refresh`) | The item that rerolls hands; "free" dropped once the token-cap economy was removed |

## Gameplay terms

| Term | Meaning |
|---|---|
| **Impact** | A score-gated checkpoint occurring every 3 levels (`impactInterval`). Players must meet a minimum score-contribution share to pass; failing rolls the team back to the last completed Impact. |
| **Impact band** | The group of levels between two Impacts. |
| **Power** | Consumable room-wide-effect item (Score Cap, Copy Score, Refresh). Activating one affects every player in the room, caster included — there is no target selection. |
| **MVP** | Player with the highest level score for a given level. Display-only; awards no extra score. |
| **Finisher** | The player whose placement completes the level (reaches or exceeds target height). |
| **Exact finish / Precision** | Placement that lands the tower at *exactly* target height (no overbuild). Triggers Precision Bonus (finisher) and Team Bonus (whole team). |
| **Overbuild** | Placement that exceeds target height. Wastes the excess height; no exact-finish bonuses. |
| **Effective height** | A block's *vertical footprint* (fixed by its orientation), not its cell count. E.g. a 3-cell horizontal block has effective height 1. |
| **Carry-over blocks** | Unused hand + leftover draw-pile blocks saved into the next level's draw pile on completion (max 3, precision-blocks prioritized). Discarded entirely on level failure. |
| **Draw pile** | Shared, server-owned pool of blocks players draw from as hands empty. Built from carry-over blocks + level-scaled generated reserve blocks. |
| **Precision block** | A block with height ≤ 2 — useful for landing an exact finish. |
| **Cooperative (bot strategy)** | Bots prefer exact-finishing blocks, avoid overbuilding near target, otherwise play the highest useful block. |
| **MVP-greedy (bot strategy)** | Bots prefer exact-finishing blocks, otherwise the highest effective-height contribution — even if it overbuilds. |
| **Shape ID** | Compact orientation name for a block, e.g. `I4H` (4-cell horizontal line), `I4V` (4-cell vertical line), `I1` (1-cell), `I5V`/`I6V` (late-game height-5/6 lines). Tetris-style multi-cell variants use `O`/`T`/`L`/`J`/`S`/`Z`. |
| **`towerBlocks`** | Ordered authoritative placement history broadcast to clients; source of truth for tower rendering. |
| **Level states** | `waiting` → `starting` → `playing` → `finished` \| `failed` → (next level or Impact rollback) → … → `game_completed` \| `closed`. |

## Infra / ops terms

| Term | Meaning |
|---|---|
| **EC2-GW** | Public EC2 instance: SSH bastion, Caddy WSS gateway, Cloudflare DNS updater, NAT instance for the K3s lab VPC. |
| **K3s lab** | The active, self-hosted K3s-on-EC2 stack (Terraform root `infra/k3s`, state key `k3s-lab/terraform.tfstate`). |
| **NodePort 30300** | Fixed port the Corp Tower server Service exposes inside K3s; EC2-GW Caddy proxies to it. |
| **`ws.tod.galaxxigames.com`** | The one public WebSocket endpoint, Cloudflare-DNS-managed, currently pointed at the K3s gateway. |
| **ECR** | AWS Elastic Container Registry; stores the server's Docker image, tagged by commit SHA. |
| **Kustomize `overlays/lab` vs `overlays/runtime`** | `overlays/lab` is committed with a placeholder image tag; `Server-K3s-Deploy.yml` generates the uncommitted `overlays/runtime` at deploy time with the real ECR tag. |
| **R2** | Cloudflare R2 object storage; private bucket `corp-tower-assets` holds production art bundles. |

## Tuning-knob shorthand

| Key | Meaning |
|---|---|
| `powerLifetime` | `impact` = Power inventory restored to its last-Impact snapshot on rollback (default). `match` = earned items survive rollback (debug/legacy only). |
| `targetHeightMultiplier` | Debug scalar applied to the whole target-height curve; default `3` leaves the authored curve unchanged. |
| `towerStabilityFeedbackMode` | Client tower-stability feedback mode; validated against an allowlist server-side. |

Full tuning variable table (all debug-exposed `Game_Config` keys): [gameplay.md § Debug Menu and Live Tuning](./gameplay.md#debug-menu-and-live-tuning).
