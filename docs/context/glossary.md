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
| **Impact** | A score-gated checkpoint occurring **every level** (`impactInterval` = 1). Each player must meet a minimum score-contribution share to pass; failing rolls the team back to the last completed Impact — with an interval of 1 that is the level just played. |
| **Impact band** | The group of levels between two Impacts — currently a single level. |
| **Lean** | The signed stability axis: CoM drift + column-height imbalance + the just-placed brick's overhang. Drives the visual tilt and collapses at `towerCollapseTiltScore`. |
| **Integrity** | The unsigned 0–100 stability axis: slenderness + support deficit. Collapses at 0. Added because Lean measures only asymmetry, so a symmetric spire read as perfectly stable — see [decisions.md](./decisions.md#two-axis-stability-lean--integrity-replaces-the-single-tilt-scalar). |
| **Slenderness** | Tower height ÷ ground-footprint width. Penalty-free up to `towerSlendernessSafe`, reaching integrity 0 at `towerSlendernessMax`. |
| **Support deficit** | Share of cells across the whole tower with nothing directly beneath them and not on the ground. Only recovers by dilution — gravity means a void can never be filled from above. |
| **Maturity ramp** | `min(1, height / towerStabilityMinHeight)`, multiplied into every stability penalty so a stubby tower can't topple and small-tower ratios don't swing wildly. |
| **Reinforce** | Score paid for a placement that raises Integrity or corrects Lean — the cooperative earner, as against the contested height claim. Emits a `reinforce` score event. |
| **Stability multiplier** | Scales placement score by the stability the placer *inherited*: `placementStabilityFloor + (1 − floor) × stabilityBefore/100`. Racing on a wobbling tower pays less. |
| **Site / site width** | The buildable column span for a level, derived from its target height rather than fixed. Always even and centred on the grid; capped at 8 columns by the tower viewport. |
| **Power** | Consumable room-wide-effect item (Score Cap, Copy Score, Refresh). Activating one affects every player in the room, caster included — there is no target selection. |
| **MVP** | Player with the highest level score for a given level. Display-only; awards no extra score. |
| **Finisher** | The player whose placement completes the level (reaches or exceeds target height). |
| **Exact finish / Precision** | Placement that lands the tower at *exactly* target height (no overbuild). Triggers Precision Bonus (finisher) and Team Bonus (whole team). |
| **Overbuild** | Placement that exceeds target height. Wastes the excess height; no exact-finish bonuses. |
| **Effective height** | A block's *vertical footprint* (fixed by its orientation), not its cell count. E.g. a 3-cell horizontal block has effective height 1. |
| **Carry-over blocks** | Unused hand + leftover draw-pile blocks saved into the next level's draw pile on completion (max 3, precision-blocks prioritized). Discarded entirely on level failure. |
| **Draw pile** | Shared, server-owned pool of blocks players draw from as hands empty. Built from carry-over blocks + a derived generated reserve sized to the level's height requirement. |
| **Precision block** | A block with height ≤ 2 — useful for landing an exact finish. |
| **Cooperative (bot strategy)** | Bots prefer exact-finishing blocks, avoid overbuilding near target, otherwise play the highest useful block; they only accept columns within `debugBotStabilityTolerance` of the best available stability, and **yield their turn entirely** once their own Impact share is banked while a teammate is short. |
| **MVP-greedy (bot strategy)** | Bots prefer exact-finishing blocks, otherwise the highest effective-height contribution — even if it overbuilds — and accept any non-collapsing column. Never yields. |
| **Yield (`wait` action)** | A bot action that consumes the turn without placing, leaving the remaining height (and its score) to a teammate who is short of their Impact share. |
| **Shape ID** | One of the **5 fixed brick types**: `I`, `O`, `L`, `T`, `Z`, all 4-cell, available from level 1. `Game_Config.brickShapes` cells define only each shape's canonical (unrotated) layout — the dealt block gets a **random rotation** at generation (see [decisions.md](./decisions.md#placement-design-lineage-superseded)), so actual height/width per draw varies 1–4, not a fixed per-shape number. (Old size-1..6 variant ids like `I4H`/`I5V`/`J`/`S` are retired.) |
| **Lane** *(retired)* | Formerly one of three placeable columns (left/center/right = grid columns 3/4/5 on the 9-wide tower). Replaced by direct **column** placement on the derived per-level site — see **Placeable column range** and **Snap point** below, and [decisions.md](./decisions.md#placement-design-lineage-superseded). |
| **`anchorX`** *(retired)* | Formerly the local cell column of a brick that landed on the chosen lane column, chosen randomly at block creation. Removed along with lanes — a dragged brick's own geometry now determines its column directly, no internal anchor cell needed. |
| **Placeable column range** | The level's **site**: a derived, even, grid-centred span of columns — the only ones a brick may occupy. Columns outside it are permanently unplaceable, a **hard exclusion** (unlike the retired lane system's overflow columns): a brick's entire footprint must fit inside. Derived per level from target height and broadcast as `placeableColumnMin`/`placeableColumnMax`; the `Game_Config` keys of the same name are now only the pre-level fallback. |
| **Snap point** | A lattice point a dragged brick's corner can dock to: one fixed platform point per column boundary across the site **plus every true outline corner of every already-placed brick**, so the set grows as the tower is built. Resolution pairs each corner of the held brick against each snap point and takes the closest pair, which fixes the `column` sent to the server (`Game_Engine.resolveColumnOriginX`). Shown as light rings, with the active target enlarged and filled — see [ui.md](./ui.md#leaf-components). |
| **Lattice coordinates** | The client's placement coordinate space (`SnapGrid`): x is a column *boundary* index (column `c` spans x = `c` to `c+1`), y is a height in grid units above the platform. Distinct from cell-center coordinates; it is what makes a brick corner and a snap point directly comparable. |
| **Landing ghost** | The translucent copy of the dragged brick that Tower Stack draws at its resolved landing position (snapped column + gravity-settled row) while the pointer is over the tower. Shows the exact final resting place before release; the brick is hidden from the finger-following preview while docked. |
| **Snap radius** | How close a brick corner must come to a snap point to lock on (`snap_radius_units`, default 2.2 bricks). Beyond it, placement falls back to plain nearest-column aiming so a drag over open sky still resolves. Debug-tunable in the **Placement** category. |
| **Grip lift** | How far above the finger the dragged brick floats (`drag_grip_offset_units`, default 1.4 bricks) so a thumb never covers the brick or the target point. Stored in brick units so it scales with `brick_unit_size`. |
| **Impact-fill bonus** | Score awarded at each passed Impact, `round(band_overshoot × impactFillBonusRate)`, rewarding a player whose band contribution exceeded the minimum requirement. |
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
