# Decisions

Scope: why things are built the way they are — rationale, tradeoffs, rejected alternatives, and known constraints. Not a bug tracker; per-doc "Notes" sections carry point-in-time implementation gotchas.

## Politics → Power, Checkpoint → Impact rename

Both gameplay systems were renamed ahead of the production UI design pass to match their production UI names — every wire-protocol field, config key, and Redis-persisted field name was renamed together, not just the docs/code identifiers. **Consequence:** deploy client and server together. A room in flight during that deploy will not restore its Impact/Power state from an old-shaped Redis snapshot.

## Refresh token economy removed

Refresh used to be its own player action gated by a per-player token count (`free_refresh`, capped uses). It is now purely an effect of activating a held `refresh` Power item: no token count, no per-level use cap, fires unconditionally on activation and rerolls **every** player's hand, not just the caster's. The item's id/title dropped "free" as meaningless leftover vocabulary once the cap was gone.

## UI skin-switching system removed

The client used to ship two swappable UI "skins" (`DefaultSkin.tscn` / `Figma_SkinV1.tscn`) with a runtime picker overlay. Both were prototypes, and every scene edit had to be made twice to keep them in sync. Removed ahead of the production UI pass, leaving [Game UI Scene](./ui.md#game-ui-scene) as the one gameplay UI. There is no `ProjectSettings` skin preference or skin-picker node group to keep in sync anymore — if you see references to a skin system, they're stale.

## PointerTriggerRouter removed → native per-trigger signals

A shared `_input()` hit-test router (`PointerTriggerRouter`) used to dispatch taps to popover triggers, because a popover's full-screen `OutsideCatcher` (a later sibling than the triggers) otherwise wins normal GUI hit-testing while a popover is open. It was replaced with each trigger wiring its own native `.pressed` signal (see [coding-conventions.md](./coding-conventions.md)). Investigating a Power-trigger tap bug during this change surfaced the real cause — a same-tap self-close race in [Popover Panel](./ui.md#popover-panel) affecting all four triggers, not something specific to Power's wiring. Fixed via an `OUTSIDE_TAP_GRACE_MS` (250 ms) window on `OutsideCatcher`.

## Team Inventory popover removed → always-visible Team Inventory Panel

The tap-to-open "Team Inventory" popover (`TeamInventoryButton` trigger + `TeamInventoryPopover`) was removed and replaced with a permanently-visible `TeamInventoryPanel` bar in [Game UI Scene](./ui.md#team-inventory-panel), matching a production design reference (`reference/play.png`). The redesign reused the existing `DrawPilePreview`/`DrawPileNameLabel`/`DrawPileCountLabel` nodes verbatim — they previously sat inert in a hidden legacy container — rather than building new nodes or controller logic, so [InventoryController](./ui.md#main-ui-controller) needed no changes beyond the draw-pile preview's color source. `QuickChatTrigger` shifted into the vacated button's screen slot; `PowerTrigger` was left in place. Follow-up bug fixes (all in `InventoryController.update_draw_pile_ui()`/the panel's scene layout, not new features): the draw-pile preview now colors with `players_ctx.local_color()` instead of a fixed `DRAW_PILE_COLOR` constant (removed); the row's labels needed an explicit dark `font_color` override since the shared `CardMetaLabel` theme type has none and defaults to a near-white that's invisible on the panel's white background; the row's `HBoxContainer` alignment is `0` (left) rather than `1` (center) — center alignment crowded the `VSeparator` toward the panel's right edge once the count label's text grew to "Remaining Bricks" phrasing; and `DrawPileNameLabel` always reads the constant `"Next Draw"` rather than interpolating the next block's shape id, since the preview icon already shows the shape visually.

## Tower Stability must stay a pure function

`Tower_Stability.js`'s `settleBlock()`/`evaluate()` must be a pure, deterministic function of the `entries` array — no history, randomness, or hidden state. Two consumers depend on that: the [Balance Simulator](./testing.md#balance-simulator) re-runs it thousands of times and needs reproducible results, and the client re-derives the same tilt from a `game_state` snapshot after reconnecting rather than replaying placement history. Any change to this module must preserve determinism.

## GitHub Pages over Cloudflare Pages for HTML5

Cloudflare Pages was evaluated and rejected: it caps individual files at 25 MiB on every plan (including paid), and the project's `index.wasm` is 35.95 MiB. The cap applies to the stored file, so compression doesn't help, and Workers static assets carry the same limit. The only workaround — serving the wasm from a public R2 bucket with a patched Godot loader — was judged not worth the complexity. GitHub Pages allows 100 MB per file, so it was chosen instead.

**Consequence:** the deployed HTML5 build is public to anyone with the URL; GitHub Pages has no access control. If invite-only playtesting becomes a requirement, itch.io supports restricted projects for free at this file size.

## Private Asset Pipeline credential split

Cloudflare's R2 S3-compatible endpoint doesn't accept GitHub OIDC federation (unlike the AWS Terraform workflows, which do use OIDC), so this path needs static credentials. The mitigation is a strict read/write split: CI holds an **Object Read only** R2 token (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` secrets) and cannot publish or delete art; only local dev holds an **Object Read & Write** token (gitignored `.env.art`). Publishing (`art-push.sh`) is therefore local and manual by design — automating it would require a write token in GitHub Secrets and defeat the split.

Note on the guarantee's actual scope: art is absent from the repo/history and not browsable from GitHub, but it *is* extractable from a shipped build (`.pck` extractors are commodity tooling; the HTML5 build serves the `.pck` as a public download). `Cor/Art/` is a build input, not a secret — encrypting the PCK wouldn't change this, since the key would ship inside the exported binary.

## Docker EC2 staging removed in favor of K3s

The earlier Docker EC2-1/EC2-2/EC2-3 staging workflows, Terraform, and Ansible have been fully removed. The K3s lab (`infra/k3s`) is the current active stack; see [deployment.md](./deployment.md).

## Caddy gateway ACME cert cache persisted to R2

EC2-GW's `root_block_device` is ephemeral (`infra/k3s/terraform/ec2.tf`) — every `terraform destroy`/recreate of the K3s lab wipes the Docker volume backing Caddy's automatic-HTTPS state (`corp-tower-k3s-caddy-data`), forcing a fresh Let's Encrypt certificate request for `ws.tod.galaxxigames.com` on every rebuild. Repeated destroy/recreate cycles within one week hit Let's Encrypt's "5 duplicate certificates per exact identifier set per 168h" limit, blocking the public WSS smoke test with a `429 rateLimited` until the rolling window cleared — with nothing surfacing the real cause beyond a generic 5-minute smoke-test timeout, since neither the Ansible role nor the deploy workflow checked whether the Caddy container actually stayed up.

Fixed two ways, both in `configure_caddy.yml` / `Server-K3s-Deploy.yml`: (1) a post-start liveness check now fails fast with `docker logs` output instead of waiting out the smoke-test timeout; (2) the ACME cache round-trips through a dedicated Cloudflare R2 bucket (`corp-tower-gateway-state`) around each deploy — restored before Caddy starts, saved after it's confirmed running — so a destroyed-and-recreated gateway reuses the still-valid 90-day cert instead of requesting a new one, and recreates stop counting against the weekly quota. R2 was chosen over AWS S3 specifically to avoid adding AWS IAM scope and reuse the project's existing free R2 usage (see [Private Asset Pipeline credential split](#private-asset-pipeline-credential-split) for the other R2 consumer); the payload is a few KB and R2's free tier has no realistic exposure at this cadence. Full mechanism → [deployment.md](./deployment.md#caddy-gateway-acme-cert-persistence-r2).

Since the archive carries the gateway's live ACME account key and TLS private key, both the GitHub runner and EC2-GW restrict it to `0600` immediately after it's written/received and delete it once consumed, rather than leaving it in shared `/tmp` at default permissions.

**Not yet verified end-to-end** — implemented while blocked on the same rate limit it fixes; first live confirmation is pending the next deploy after the 429 window clears.

## EKS kept plan-only

The EKS path (`infra/eks`) is Terraform **plan only** — deliberately not applied. Two reasons: (1) managed AWS resources in this path may exceed free-tier expectations, so plan output and cost need review before any apply/deploy workflow is added; (2) the NLB target group has no pod/node registration mechanism yet (no Load Balancer Controller or IRSA OIDC provider exists in this Terraform root), so applying it wouldn't produce working ingress yet regardless of cost.

## Argo CD prepared but not enabled

Argo CD bootstrap manifests exist (`infra/k3s/argocd/bootstrap`) but nothing installs or applies them in the first K3s rollout. Planned enablement path: install → one manual sync → a rollback test succeeds → only then turn on automated prune/self-heal. `GITHUB_TOKEN` is not a suitable long-lived Argo CD repo credential for private repos; a persistent repo-read credential is needed instead. **Known bug to fix before enabling:** `infra/k3s/argocd/bootstrap/application.yaml`'s `spec.source.targetRevision` is currently pinned to an already-merged feature branch instead of `main` — harmless while unapplied, but would track the wrong ref the moment Argo CD is turned on.

## Debug menu / debug config not yet gated

The floating debug overlay is present in every client build (no build flag, no `SHOW_DEBUG_UI`-style constant) and is only *disabled* (not hidden) until a room connects. Server-side, `update_config`/`resetDebugConfig` have no admin/auth check beyond the existing message-validation rules. **This must be gated — behind a build flag, QA account permission, or server-side admin authorization — before public release.** Tracked from both the design side (GDD) and the technical side (TDD future work); stated once here.

## No persistent leaderboard yet

Redis is active-session state (matchmaking/reconnect/room snapshots), not long-term persistence. There is no durable leaderboard or player-stat storage yet — planned future technical work, along with structured logging. Multi-worker matchmaking now has integration-level regression coverage (see [testing.md](./testing.md#server-matchmaking-queue-tests)); reconnect/gateway routing across pods more broadly is still untested at that level.

## Matchmaking queue lost-update and cross-pod room-delivery gap

Reported symptom: when two players joined from the same network at nearly the same moment (plus a third player from elsewhere), only one of the two made it to the play screen. Player identity was already `playerId`/`reconnectToken`-based, not IP-based, so the cause was elsewhere. Two independent multi-pod bugs were found and fixed together in `Lobby_Manager.js`/`Redis_State.js`:

1. **Lost-update race in the shared queue.** `tryCreateRoom()` used to read the entire Redis matchmaking queue, then unconditionally overwrite it (`replaceQueue()`: `DEL` + rewrite). `addPlayer()` calls `enqueuePlayer()` (an unlocked `lPush`) *before* acquiring the matchmaking lock, so if another pod's `enqueuePlayer()` landed in the gap between one pod's read and its full-queue rewrite, that player's entry was silently wiped from Redis — they stayed connected but never got queued into any room. Fixed by replacing the read-all/rewrite-all pattern with `dequeueRealPlayers(maxCount)` (atomic `RPOP ... count`) and `requeuePlayers(players)` (atomic `RPUSH` of only what was actually taken back out) — neither can clobber an entry it never touched. `replaceQueue()` was deleted rather than kept as a fallback, since its read/write gap was the actual defect.
2. **Cross-pod delivery gap.** Whichever pod wins the matchmaking lock is the one that runs `createRoom()`, but with 2 server replicas behind round-robin, that pod only holds live WebSocket references for players connected to itself — a teammate connected to a different pod got added to the room's player list server-side, but the direct `sendPlayer()` call silently no-op'd (`ws` was `null` locally), so `room_created` never reached them and their socket just sat open and silent. Fixed by publishing a lightweight `player:assignments` pub/sub event (`Redis_State.js`'s `publishPlayerAssignment`/`subscribeToPlayerAssignments`) whenever a room-assigned player isn't locally connected; the pod that actually owns that player's socket receives it and calls `resumePlayer()`, reusing the same `hydrateRoom()`/room-channel-subscribe path already relied on for genuine reconnects, rather than inventing a parallel state-relay mechanism.

Regression coverage: [Server Matchmaking Queue Tests](./testing.md#server-matchmaking-queue-tests).

## Fixed brick size + parallax scroll replaces shrink-to-fit tower rendering

[Tower Stack](./ui.md#leaf-components) used to keep the whole tower on screen by shrinking brick size to fit (`MIN_UNIT_SIZE`/`MAX_UNIT_SIZE`, a fit-to-box formula in `_unit_size()`), which made bricks visibly smaller than their designed size on tall/overbuilt towers. Requested fix: bricks must stay the designed size (`BRICK_UNIT_SIZE`, 34px) always; once the tower's top approaches the [Top Indicator](./ui.md#main-ui-controller), the view should instead scroll/pan up, like a camera panning up the tower, with HUD elements staying fixed and only the tower + background moving. The scroll/clip machinery this needed (`_scroll_offset_units()`, `_visible_unit_capacity()`, `_is_rect_visible()`) already existed in `TowerStack.gd` — it previously only activated in the rare case where shrink-to-fit bottomed out at `MIN_UNIT_SIZE`; removing shrink-to-fit made it the primary, always-available mechanism instead of new code being written. Chosen over a capped pan distance: pan is unlimited, matching that a tower can be arbitrarily overbuilt.

The background reveal reuses the existing full-screen `Background` `Panel` (solid sky-blue, already sitting behind `BgArt`) as the "extra sky" revealed when [Background Parallax](./ui.md#leaf-components) pans `BgArt` down — no new node was needed for a placeholder fill. This was an explicit interim choice: new painted background art is expected later once the mechanic is confirmed working. Because a flat color has no edge, it already supports unlimited pan; the real art replacement must be a seamlessly vertically-tileable sky/cloud texture (top edge matches bottom edge) to preserve that property, rather than just a taller static image. The 0.4 parallax ratio (`BackgroundParallax.PARALLAX_RATIO`) and 4.0 ease speed are implementation defaults, not values specified by the request.

## Score Cap / Copy Score disabled via powerCatalog active flag

Score Cap and Copy Score were reachable only through the Impact-MVP reward path (`Impacts.js`'s `awardImpactPower()`), which picked randomly across every key in `GameConfig.powerCatalog` — the guaranteed-baseline and side-quest grant paths were already hardcoded to `"refresh"` only. Per a power-system redesign in progress, they're pulled from play for now, keeping only Refresh obtainable. Rather than deleting their catalog entries or `activatePower()` effect branches (which would need re-authoring from scratch once new power designs are ready), each `powerCatalog` entry got an `active: boolean` flag; `awardImpactPower()` now filters to `active: true` entries before picking. Score Cap/Copy Score are `active: false` — fully defined, never granted, so they never surface in a player's Power list. Re-enabling either later is a one-line flip of its `active` flag in `Game_Config.js`, no other code changes needed. See [gameplay.md § Effects catalog](./gameplay.md#effects-catalog) and [backend.md § Game Config](./backend.md#game-config).

## Shape-block system invalidated old balance assumptions

The migration to fixed-orientation shape blocks changed balance assumptions that predate it. Progression/target-height tuning needs a future recalibration pass — candidates include per-level shape pools, guaranteed minimum available height, target-curve bands, and fail-condition pressure. Use the [Balance Simulator](./testing.md#balance-simulator) to evaluate changes; see [gameplay.md](./gameplay.md#future-debug-variables-planned) for the planned tuning surface.
