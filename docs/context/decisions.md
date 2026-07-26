# Decisions

Scope: why things are built the way they are — rationale, tradeoffs, rejected alternatives, and known constraints. Not a bug tracker; per-doc "Notes" sections carry point-in-time implementation gotchas.

## Politics → Power, Checkpoint → Impact rename

Both gameplay systems were renamed ahead of the production UI design pass to match their production UI names — every wire-protocol field, config key, and Redis-persisted field name was renamed together, not just the docs/code identifiers. **Consequence:** deploy client and server together. A room in flight during that deploy will not restore its Impact/Power state from an old-shaped Redis snapshot.

## Removed systems (stale references you may still hit)

- **Refresh token economy.** Refresh was once its own action gated by a capped per-player token count. It is now purely the effect of activating a held `refresh` Power item — no count, no per-level cap, rerolls **every** player's hand. The id dropped "free" once the cap was gone.
- **UI skin switching.** Two swappable skins (`DefaultSkin`/`Figma_SkinV1`) with a runtime picker were removed ahead of the production UI pass — every scene edit had to be made twice. [Game UI Scene](./ui.md#game-ui-scene) is the one gameplay UI; no `ProjectSettings` skin preference or picker group exists.
- **Docker EC2 staging.** The EC2-1/2/3 staging workflows, Terraform and Ansible are fully removed; the K3s lab (`infra/k3s`) is the active stack → [deployment.md](./deployment.md).

## PointerTriggerRouter removed → native per-trigger signals

A shared `_input()` hit-test router (`PointerTriggerRouter`) used to dispatch taps to popover triggers, because a popover's full-screen `OutsideCatcher` (a later sibling than the triggers) otherwise wins normal GUI hit-testing while a popover is open. It was replaced with each trigger wiring its own native `.pressed` signal (see [coding-conventions.md](./coding-conventions.md)). Investigating a Power-trigger tap bug during this change surfaced the real cause — a same-tap self-close race in [Popover Panel](./ui.md#popover-panel) affecting all four triggers, not something specific to Power's wiring. Fixed via an `OUTSIDE_TAP_GRACE_MS` (250 ms) window on `OutsideCatcher`.

## Team Inventory popover removed → always-visible Team Inventory Panel

The tap-to-open "Team Inventory" popover was replaced with a permanently-visible [Team Inventory Panel](./ui.md#team-inventory-panel) bar, matching the production design reference. The redesign reused the existing `DrawPilePreview`/`DrawPileNameLabel`/`DrawPileCountLabel` nodes verbatim — they had been sitting inert in a hidden legacy container — so [InventoryController](./ui.md#main-ui-controller) needed no logic changes. `QuickChatTrigger` moved into the vacated slot.

One gotcha worth reusing: labels placed on a white card need an explicit dark `font_color` override. The shared `CardMetaLabel` theme variation defines none, so it falls through to a near-white default that is invisible on `WhiteCardPanel`.

## Tower Stability must stay a pure function

`Tower_Stability.js`'s `settleBlock()`/`evaluate()` must be a pure, deterministic function of the `entries` array — no history, randomness, or hidden state. Two consumers depend on that: the [Balance Simulator](./testing.md#balance-simulator) re-runs it thousands of times and needs reproducible results, and the client re-derives the same tilt from a `game_state` snapshot after reconnecting rather than replaying placement history. Any change to this module must preserve determinism.

## GitHub Pages over Cloudflare Pages for HTML5

Cloudflare Pages was evaluated and rejected: it caps individual files at 25 MiB on every plan (including paid), and the project's `index.wasm` is 35.95 MiB. The cap applies to the stored file, so compression doesn't help, and Workers static assets carry the same limit. The only workaround — serving the wasm from a public R2 bucket with a patched Godot loader — was judged not worth the complexity. GitHub Pages allows 100 MB per file, so it was chosen instead.

**Consequence:** the deployed HTML5 build is public to anyone with the URL; GitHub Pages has no access control. If invite-only playtesting becomes a requirement, itch.io supports restricted projects for free at this file size.

## Pages custom domain must be set manually

Tried automating the `play.tod.galaxxigames.com` custom domain by adding a workflow step that calls `PUT /repos/{owner}/{repo}/pages` with `{"cname": "..."}` using the default `GITHUB_TOKEN` (which the workflow already grants `pages: write`). Rejected: that request failed (curl exit 22 / HTTP 403) because this specific endpoint requires the caller to be a repo admin/maintainer — `github-actions[bot]` never holds that role, regardless of the `permissions:` block. The `pages: write` workflow permission only unlocks the *deployment* API (`actions/deploy-pages` internals), not the Pages *settings* API.

**Consequence:** the custom domain is set once, manually, via Settings → Pages → Custom domain. It's stored as repo config and survives normal deploys and soft-undeploy; a **hard** undeploy deletes the Pages site object and the setting with it, requiring it to be re-added by hand → [build.md § Client HTML5 Pages](./build.md#client-html5-pages).

## Private Asset Pipeline credential split

Cloudflare's R2 S3-compatible endpoint doesn't accept GitHub OIDC federation (unlike the AWS Terraform workflows, which do use OIDC), so this path needs static credentials. The mitigation is a strict read/write split: CI holds an **Object Read only** R2 token (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` secrets) and cannot publish or delete art; only local dev holds an **Object Read & Write** token (gitignored `.env.art`). Publishing (`art-push.sh`) is therefore local and manual by design — automating it would require a write token in GitHub Secrets and defeat the split.

Note on the guarantee's actual scope: art is absent from the repo/history and not browsable from GitHub, but it *is* extractable from a shipped build (`.pck` extractors are commodity tooling; the HTML5 build serves the `.pck` as a public download). `Cor/Art/` is a build input, not a secret — encrypting the PCK wouldn't change this, since the key would ship inside the exported binary.

## Caddy gateway ACME cert cache persisted to R2

EC2-GW's root volume is ephemeral, so every `terraform destroy`/recreate wiped Caddy's automatic-HTTPS state and forced a fresh Let's Encrypt request. Repeated cycles within a week hit the **"5 duplicate certificates per identifier set per 168h"** limit, blocking the public WSS smoke test with `429 rateLimited` — surfacing only as a generic 5-minute timeout, since nothing checked whether Caddy actually stayed up.

Fixed two ways: a post-start liveness check that fails fast with `docker logs`, and round-tripping the ACME cache through a dedicated R2 bucket around each deploy, so a recreated gateway reuses its still-valid 90-day cert instead of counting against the quota. R2 over S3 to avoid widening AWS IAM scope and reuse existing free usage. Because the archive carries the live ACME account key and TLS private key, both the runner and EC2-GW chmod it `0600` immediately and delete it once consumed. Mechanism → [deployment.md](./deployment.md#caddy-gateway-acme-cert-persistence-r2).

**Not yet verified end-to-end** — implemented while blocked on the very rate limit it fixes.

## Backup server: separate hostname, and out-of-repo automation

The physical backup uses `wss://devtod.galaxxigames.com`, **not** `dev.tod.…`. **Cloudflare's free Universal SSL covers the zone apex and exactly one subdomain level**, so a two-level name behind a *proxied* record (which a Tunnel requires) hits a bare TLS handshake failure. `ws.tod.…` escapes this only because it is DNS-only, with Caddy fetching its own cert. Fixing it properly would mean buying Advanced Certificate Manager; a one-level-deep hostname is free. **This same limit bit twice** — see [Web (HTML5) backup](#web-html5-backup-dedicated-hostname-not-shared-with-github-pages).

A wholly separate hostname (rather than cutting `ws.tod.…` over during an incident) is deliberate: `ws.` already has two independent DNS updaters, and a shared-hostname cutover would risk one silently overwriting the other. Cost: failover is client-side, not DNS-level → [networking.md § NetworkManager](./networking.md#networkmanager).

The backup's own automation lives at `~/corp-tower-server-backup/` **outside the repo** for two reasons: it holds live Cloudflare credentials, and `actions/checkout`'s clean step deletes untracked/ignored files on every run, so anything gitignored *inside* the checkout would be wiped by the next CI run anyway. Only the workflow YAMLs live in the repo.

Two deliberate simplifications: no Redis (single machine, relying on `Redis_State.js`'s in-memory fallback — correct here, wrong for multi-replica K3s), and the deploy fails with instructions rather than `sudo`-installing missing tools. Relatedly `cloudflared` runs as a **user-level** systemd service so `systemctl --user` needs no `sudo` — a self-hosted runner has no TTY for a password prompt (`sudo: a terminal is required` was a real failure). `loginctl enable-linger` is required once so it survives non-interactive sessions.

## Automated Master fast deploy routes to whichever server is up

The fast path called `Server-K3s-Deploy.yml` unconditionally. With K3s down — the exact scenario the physical backup exists for — it failed opaquely deep inside inventory generation, well after AWS/SSH setup, with no hint that the backup was viable.

Fixed by routing on a live status check: K3s up → normal fast deploy; K3s down → check the backup's container and deploy there; neither → fail loudly with an explicit message. **Deliberate ordering:** the backup check only runs once K3s is confirmed down, because self-hosted runner jobs queue *indefinitely* with no timeout when no matching runner is online — checking unconditionally would stall every healthy push on the physical machine being awake.

## Web (HTML5) backup: dedicated hostname, not shared with GitHub Pages

Reusing `play.tod.galaxxigames.com` for the backup hit the **same one-level certificate-depth limit** as `devtod` above. It worked while pointed at GitHub Pages (a cert for that exact name already existed) but cutting the same *proxied* hostname to a Tunnel surfaced `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` — Cloudflare's edge, not GitHub's, terminates TLS for a proxied record. Resolved the same way: a separate one-level-deep `devplay.galaxxigames.com`, sharing the WS backup's existing Tunnel via a second ingress rule. Pages and its custom domain are untouched.

**The "only one live at a time" policy was dropped entirely.** It was first baked into the base workflows, which meant none could be dispatched independently; then moved into a dedicated orchestration workflow; then deleted once live operation showed both hosts running simultaneously without issue. The four base workflows now have no knowledge of each other.

## Auto-deploy guard rails check live status, not a stored flag

`Client-HTML5-Pages.yml` gained a `push` trigger (previously `workflow_dispatch`/`workflow_call`-only, see [build.md § Client HTML5 Pages](./build.md#client-html5-pages)) so it auto-deploys on client pushes the same way `Client-HTML5-Backup-Deploy.yml` already did. Without a guard, that auto-deploy would silently undo an intentional `Client-HTML5-Undeploy.yml` run (or an intentional `Client-HTML5-Backup-Cleanup.yml` stand-down) the next time someone pushed to `src/Client/**`.

Both workflows now gate their `push` trigger behind a job that checks the target's actual live state, rather than a stored flag a separate workflow would have to remember to set: `check-pages-status` `curl`s `https://play.tod.galaxxigames.com/` directly and treats a `404` (hard-undeploy) or a body matching the soft-undeploy placeholder text ("Corp Tower is offline") as not-deployed; `check-web-backup-status` runs `docker ps` for the running `corp-tower-web` container on the self-hosted `backup` runner. This is the same live-status-check pattern `check-k3s-status`/`check-backup-status` already use (see [Automated Master fast deploy routes to whichever server is up](#automated-master-fast-deploy-routes-to-whichever-server-is-up) above) — a runtime check can't drift out of sync the way a manually-toggled flag could.

This is deliberately **not** a reintroduction of the cross-workflow coupling removed in the entry above: each guard only inspects its *own* target's live state, never the other host's — `play.tod.galaxxigames.com` and `devplay.galaxxigames.com` still deploy, stand down, and stay live fully independently of each other. The guard also only gates the `push` trigger; manual `workflow_dispatch` always runs regardless of live state, so an intentional redeploy after an undeploy/stand-down still works exactly as before.

## A skipped guard job cascades to skip downstream jobs unless their `if` says otherwise

Adding `check-pages-status` ahead of `build` in `Client-HTML5-Pages.yml` (see [above](#auto-deploy-guard-rails-check-live-status-not-a-stored-flag)) broke manual `workflow_dispatch` deploys: `build` correctly ran and succeeded (its `if` explicitly treats `needs.check-pages-status.result == 'skipped'` as OK, since that job only runs on `push`), but `deploy` — `needs: build`, no explicit `if` — was skipped on every manual dispatch regardless of Pages' live state. Confirmed live via the Actions API across several `workflow_dispatch` runs: `build: success`, `deploy: skipped`.

Cause: a job's default `if` (when omitted) is `success()`, and `success()` evaluates against the job's **entire upstream dependency graph**, not just its direct `needs` — a skipped job anywhere in that ancestry (here, `check-pages-status`, an ancestor via `build`) makes it evaluate false, even though the job's direct dependency (`build`) itself succeeded. `Client-HTML5-Backup-Deploy.yml`'s equivalent `deploy-to-backup` job already had `if: always() && needs.build.result == 'success'` for this exact reason and was unaffected; `Client-HTML5-Pages.yml`'s `deploy` job was missing that same guard. Fixed by adding `if: always() && needs.build.result == 'success'` to `deploy`. Any job placed downstream of a conditionally-skipped job needs this pattern explicitly — omitting `if` is not equivalent to "run when my direct dependency succeeds."

## Nested reusable workflows can't detect their own trigger via event name

While wiring the automatic coupling (originally `Client-HTML5-Undeploy.yml` → `Client-HTML5-Backup-Deploy.yml` and `Client-HTML5-Pages.yml` → `Client-HTML5-Backup-Cleanup.yml`; the pairing later moved into a dedicated `Client-HTML5-Set-Live-Host.yml` orchestration workflow, then was deleted entirely once "only one live" stopped being the policy — see the entry above), each backup workflow's manual-dispatch confirmation gate (`CLEANUP_WEB_BACKUP`, and `Client-HTML5-Undeploy.yml`'s own `UNDEPLOY` guard) needed to be skipped when the workflow was invoked automatically as a reusable `workflow_call`, since the caller never had that confirmation string to pass through. The first attempt gated this on `if: github.event_name == 'workflow_dispatch'` — this does **not** work: `github.event_name` reflects the *top-level* run's trigger event, unchanged no matter how many levels of `workflow_call` nesting the current job is inside. Since every workflow in this chain was ultimately kicked off by a human `workflow_dispatch`, every nested job saw `event_name == 'workflow_dispatch'` too, so the confirmation guard ran (and failed) even on the fully-automated path — the first real test of the automatic failover failed for this reason before ever reaching the backup machine.

Fixed by using an explicit input instead of ambient context: an `invoked_via_call` boolean, declared only under each workflow's `on.workflow_call.inputs` (default `true`, never declared under `workflow_dispatch`), checked via `if: inputs.invoked_via_call != true`. This worked because `inputs.*` genuinely is scoped per-invocation (unlike `github.event_name`) — a direct `workflow_dispatch` run simply never has that input defined at all. **Since removed:** once `Client-HTML5-Set-Live-Host.yml` (the only caller) was deleted, `workflow_call` triggers and `invoked_via_call` inputs were stripped from `Client-HTML5-Undeploy.yml` and `Client-HTML5-Backup-Cleanup.yml` too (`Client-HTML5-Backup-Deploy.yml`'s `workflow_call` had no confirmation gate, so it just lost the trigger, nothing else) — the guard jobs now run unconditionally, gated only by their `workflow_dispatch` confirmation string. This decision record stays as the reference for the underlying `github.event_name` nesting gotcha, should a future reusable-workflow chain need it again.

## DNS cutover verification must use the Cloudflare API, not `dig`, for proxied records

`server-backup-common.sh`'s `wait_for_cname` helper (shared by both the WS and web backups' up-scripts) originally polled `dig +short $name CNAME` after a Cloudflare DNS upsert, to confirm the cutover actually took effect rather than trusting a bare API 200. This produced a false failure on the web backup's very first successful end-to-end run: Cloudflare **never exposes a literal CNAME to public resolvers for a proxied (orange-cloud) record** — it resolves the hostname straight to its own anycast A/AAAA addresses instead, regardless of what the record's `content` actually is. `dig CNAME` against a correctly-configured proxied record is therefore always empty, and the wait loop always timed out and `die`d — even though a direct Cloudflare API query confirmed the record was exactly right, and the site was already reachable and working.

Fixed by having `wait_for_cname` re-query the Cloudflare API (the same `dns_records?type=CNAME&name=...` lookup `upsert_cloudflare_cname` already uses) and compare `.result[0].content` directly, dropping `dig` from these scripts' `require_cmd` lists entirely. This is also more correct in principle: the Cloudflare API reflects a write immediately (no public DNS propagation delay to wait out), so the retry loop is now just a small safety margin against a transient API read, not a genuine convergence wait. The same misleading `dig`-based display existed in both `server-backup-status.sh` and `web-backup-status.sh`'s read-only DNS section and was fixed the same way, so operator-facing status output doesn't show a healthy record as blank/broken.

## EKS kept plan-only

The EKS path (`infra/eks`) is Terraform **plan only** — deliberately not applied. Two reasons: (1) managed AWS resources in this path may exceed free-tier expectations, so plan output and cost need review before any apply/deploy workflow is added; (2) the NLB target group has no pod/node registration mechanism yet (no Load Balancer Controller or IRSA OIDC provider exists in this Terraform root), so applying it wouldn't produce working ingress yet regardless of cost.

## Argo CD prepared but not enabled

Argo CD bootstrap manifests exist (`infra/k3s/argocd/bootstrap`) but nothing installs or applies them in the first K3s rollout. Planned enablement path: install → one manual sync → a rollback test succeeds → only then turn on automated prune/self-heal. `GITHUB_TOKEN` is not a suitable long-lived Argo CD repo credential for private repos; a persistent repo-read credential is needed instead. **Known bug to fix before enabling:** `infra/k3s/argocd/bootstrap/application.yaml`'s `spec.source.targetRevision` is currently pinned to an already-merged feature branch instead of `main` — harmless while unapplied, but would track the wrong ref the moment Argo CD is turned on.

## Debug menu / debug config not yet gated

The floating debug overlay is present in every client build (no build flag, no `SHOW_DEBUG_UI`-style constant) and is only *disabled* (not hidden) until a room connects. Server-side, `update_config`/`resetDebugConfig` have no admin/auth check beyond the existing message-validation rules. **This must be gated — behind a build flag, QA account permission, or server-side admin authorization — before public release.** Tracked from both the design side (GDD) and the technical side (TDD future work); stated once here.

## Debug menu category navigation switched from tabs to a dropdown

An 8th category made the `TabContainer` header row visibly cramped. Replaced with a plain `Control` holding the same category `ScrollContainer`s stacked full-rect, plus a `DebugCategoryDropdown` `OptionButton` toggling `.visible` on exactly one at a time. Chosen over shrinking or wrapping tab labels because a dropdown scales to arbitrarily many categories with zero added header space — and debug categories were expected to keep growing, which they have (10 now). Only the outer navigation chrome changed; every category's rows and their `configure_slider()`/`apply_config()` wiring were untouched.

## Debug Tooltip: a purpose-built dimmed popup, not a reuse of Popover Panel

The Parallax category's calibration variables (`scroll_start_ratio`, `scroll_ease_power`, etc.) aren't self-explanatory from a slider alone, so each row's name button opens a short designer-facing description on tap. [Popover Panel](./ui.md#popover-panel) already implements the "tap outside to close, with a grace period so the opening tap doesn't immediately close it" pattern used elsewhere (Chat/Power/Quest popovers), but its `OutsideCatcher` is transparent — those popovers are anchored corner cards over live game content, so dimming the rest of the screen would be wrong for them. The debug tooltip is conceptually a modal explainer over an already-modal debug panel, where dimming everything behind the card (including the debug panel itself) reads correctly. Rather than adding a dim option to the shared `PopoverPanel.gd`/`.tscn` (risking behavior changes to the three existing popovers), a small dedicated `DebugTooltip.gd` was added that mirrors Popover Panel's outside-tap/grace-period shape (`OUTSIDE_TAP_GRACE_MS`) but adds an actual semi-transparent `ColorRect` dim layer, keeping the two components' behavior contracts independent.

## No persistent leaderboard yet

Redis is active-session state (matchmaking/reconnect/room snapshots), not long-term persistence. There is no durable leaderboard or player-stat storage yet — planned future technical work, along with structured logging. Multi-worker matchmaking now has integration-level regression coverage (see [testing.md](./testing.md#server-matchmaking-queue-tests)); reconnect/gateway routing across pods more broadly is still untested at that level.

## Matchmaking queue lost-update and cross-pod room-delivery gap

Reported symptom: when two players joined from the same network at nearly the same moment (plus a third player from elsewhere), only one of the two made it to the play screen. Player identity was already `playerId`/`reconnectToken`-based, not IP-based, so the cause was elsewhere. Two independent multi-pod bugs were found and fixed together in `Lobby_Manager.js`/`Redis_State.js`:

1. **Lost-update race in the shared queue.** `tryCreateRoom()` used to read the entire Redis matchmaking queue, then unconditionally overwrite it (`replaceQueue()`: `DEL` + rewrite). `addPlayer()` calls `enqueuePlayer()` (an unlocked `lPush`) *before* acquiring the matchmaking lock, so if another pod's `enqueuePlayer()` landed in the gap between one pod's read and its full-queue rewrite, that player's entry was silently wiped from Redis — they stayed connected but never got queued into any room. Fixed by replacing the read-all/rewrite-all pattern with `dequeueRealPlayers(maxCount)` (atomic `RPOP ... count`) and `requeuePlayers(players)` (atomic `RPUSH` of only what was actually taken back out) — neither can clobber an entry it never touched. `replaceQueue()` was deleted rather than kept as a fallback, since its read/write gap was the actual defect.
2. **Cross-pod delivery gap.** Whichever pod wins the matchmaking lock is the one that runs `createRoom()`, but with 2 server replicas behind round-robin, that pod only holds live WebSocket references for players connected to itself — a teammate connected to a different pod got added to the room's player list server-side, but the direct `sendPlayer()` call silently no-op'd (`ws` was `null` locally), so `room_created` never reached them and their socket just sat open and silent. Fixed by publishing a lightweight `player:assignments` pub/sub event (`Redis_State.js`'s `publishPlayerAssignment`/`subscribeToPlayerAssignments`) whenever a room-assigned player isn't locally connected; the pod that actually owns that player's socket receives it and calls `resumePlayer()`, reusing the same `hydrateRoom()`/room-channel-subscribe path already relied on for genuine reconnects, rather than inventing a parallel state-relay mechanism.

Regression coverage: [Server Matchmaking Queue Tests](./testing.md#server-matchmaking-queue-tests).

## Fixed brick size + parallax scroll replaces shrink-to-fit tower rendering

[Tower Stack](./ui.md#leaf-components) used to keep the whole tower on screen by shrinking bricks to fit, which made them visibly smaller than designed on tall towers. Requirement: bricks stay `brick_unit_size` (34px) **always**, and the view pans up like a camera instead, with HUD fixed and only the tower + background moving. The scroll machinery already existed for the rare shrink-to-fit floor case; removing shrink-to-fit just made it the primary mechanism.

**Current scroll rule** (after several calibration passes): no scroll at all when `target_height` already fits under the Top Indicator; otherwise no scroll below `scroll_start_ratio` of visible capacity, then a `pow(progress, scroll_ease_power)` ease from the start row toward the flush row as `current_height` approaches `target_height`, frozen once target is reached so overbuild bricks ride up and tuck *under* the indicator (`GameUI.tscn` node order puts `TopIndicatorRow` after `TowerStack` — deliberately unchanged; an early attempt reordered them so the tower drew over the bar, which was wrong).

**Durable lessons from the calibration, worth not relearning:**

- **A constant ratio cannot cancel an easing-induced lag.** `PlatformArt` was given `parallax_ratio = 1.1` to compensate for `BackgroundParallax` easing via `lerpf` while `TowerStack`'s scroll applies instantly. The residual gap worked out to `−7 + 0.1 × scroll_pixels` — fine at low scroll, unbounded past ~70px. Six-plus "calibration" commits chased this before the real fix: `parallax_ratio = 1.0` plus a per-instance `instant` flag that snaps `PlatformArt` in the same frame as the brick redraw. `BgArt` keeps eased motion (no ground-contact requirement).
- **A `Camera2D`/viewport-follow redesign was considered and rejected.** The client is entirely `Control`-node based with `TowerStack` drawing bricks via raw `_draw()`, not `Node2D` children a camera can pan. That would mean re-architecting `TowerStack`/`BlockPreview`/`BackgroundParallax` and the drag hit-testing math for a bug fixable as a scalar/timing correction.
- **The platform is background, not HUD.** It recedes with the parallax rather than staying screen-fixed. Once it did, the tower appeared to float because old bricks were culled at the Control's own rect while the ground sank past it; `_is_rect_visible()`'s bottom bound now extends to the real screen bottom, so bricks are hidden by later-drawn siblings rather than an arbitrary clip.
- **The revealed sky is a placeholder**: the existing solid-colour `Background` panel stands in behind `BgArt`. A flat colour has no edge so it pans any distance — a real replacement must be a **seamlessly vertically-tileable** texture to keep that property, not merely a taller image.

The scroll/tilt/drop values are `@export var`s purely so the Debug Overlay's Parallax category can tune them live, client-side with no server round-trip.

## Two-axis stability: Lean + Integrity replaces the single tilt scalar

`Tower_Stability.evaluate()` used to reduce a tower to one signed tilt score built from CoM offset, column imbalance, and the last brick's overhang — all normalised by the tower's **own** ground footprint. Every term measures *asymmetry*, and none measures *slenderness*, so a symmetric tower was stable at any height. Verified directly against the shipped module before changing it:

```
centered 2-wide O-spire, height 40  -> stability 100, tiltScore 0.000
edge     2-wide O-spire, height 20  -> stability 100, tiltScore 0.000
```

A 2-wide, 40-tall needle scored perfect. This mattered more than a missing penalty: the height-optimal play (build a spire) was also the stability-optimal play, so stability never constrained anyone, and the [Balance Simulator](./testing.md#balance-simulator)'s greedy bot "building narrow towers" was correct play rather than a bot flaw.

Fixed by adding a second axis rather than reweighting the first. **Lean** keeps the existing three terms and still drives `tiltAngleDeg`, so `TowerStack`'s tilt rendering needed no change. **Integrity** adds slenderness (height ÷ ground width) plus a whole-tower support deficit. `stability = min(leanStability, integrity)`, so the existing 0–100 scalar, the warning/critical thresholds, and the client readout all keep working unchanged.

Integrity is recomputed from `entries` on every call, never accumulated — that is what lets a score that *feels* persistent stay a [pure function](#tower-stability-must-stay-a-pure-function). It also means adding well-supported bricks raises it, which is what makes repair a payable action.

**Two follow-on corrections, both found by measuring rather than reasoning:**

- **A void can never be filled from above.** Bricks drop to first contact, so the support-deficit ratio only recovers by *dilution*, never by actually filling the gap under a bridge. Slenderness and lean are the genuinely repairable terms, which is why Reinforce is effectively "widen the base / straighten the tower" rather than "patch the holes".
- **Small towers made every ratio degenerate.** With 4 cells placed, a lone `T` resting on its stem is 50% unsupported — it collapsed the level on the opening brick, and an `L`/`Z` leaned ~10° immediately. Both are the *intended* stability hook at scale, not failures. Fixed with a single maturity ramp (`min(1, height / towerStabilityMinHeight)`) applied to **all** penalty terms plus a `towerBaseHalfWidthFloor`, rather than special-casing shapes.

## Supply was sized for vertical stacking, and made high levels unwinnable

`Block_Supply.isLevelBlockSupplyValid()` accepted a level when `Σ brick.height ∈ [target, target + 6]`, and `hasExactHeightCombination()` did subset-sum on the same heights. Both assume one unit of brick height converts to one unit of *tower* height — true only for a single-column stack, while stability demands horizontal spread. Measured on the pre-redesign build, completion collapsed from 88.5% at level 5 to **0% from level 12 onward**, with `avgPlacements == avgBlocks` and `avgOverbuild ≈ 0`: the team placed every brick it had and still never reached target. The flat `+0..6` surplus covers the shortfall at target 12 and cannot at target 26.

Fixed by sizing supply against `ceil(targetHeight / packingEfficiency)`. Efficiency is **derived, not a constant** — measured 0.68 / 0.48 / 0.42 at site widths 4 / 6 / 8, which fits "you need one brick-layer across roughly half the site per height unit", so it is computed from brick geometry (`cells per brick ÷ (avg brick height × effective width)`) instead of a fitted number. The same reasoning replaced the 33-entry `generatedDrawPileScaling` table with a derived reserve count, so both self-correct if `brickWeights` or the site width change.

**`checkFailCondition` deliberately kept the optimistic sum.** Applying the efficiency factor there too was in the original plan and was reverted: an existing test caught it failing a level while a winning move still existed (one height-3 brick genuinely *can* add 3 height if stacked). That check tests *impossibility*, so it needs the true upper bound; efficiency belongs only in deciding how many bricks to deal.

## Buildable site width scales with target height

Placement was fixed at columns 4–9 regardless of level, so a target of 40 stood on the same 6-wide base as a target of 3 — physically absurd and the main reason tall levels were unreachable. The site is now derived from the level's target height (`evenRoundUp(target / towerSiteSlendernessTarget)`, clamped), so height and footprint cannot drift apart and one knob reshapes the game's whole aspect ratio. Deriving it beat a second hand-authored table for exactly that reason. The width is forced even so the site stays centred on the grid, and `getSiteWidthForHeight` re-evens after clamping so a debug-set odd bound cannot push it off-centre.

**The ceiling is a viewport fact, not a design preference.** `TowerStack` is 272px wide at a fixed 34px brick, so only 8 grid columns are ever on screen. An early version scaled the site to 12 and silently culled bricks in columns the player could never see. `towerSiteWidthMax` is capped at 8 in config *and* in the debug clamp. Widening it means widening the tower viewport or shrinking bricks — and fixed brick size is itself a deliberate decision ([see above](#fixed-brick-size--parallax-scroll-replaces-shrink-to-fit-tower-rendering)).

**Consequence worth knowing:** with level 1 already targeting height 16, the derived width sits at the 8-column cap for essentially all normal play, so the scaling mechanism is currently near-inert. It is retained because it is correct and tunable, not because it is currently doing much work.

## The client must derive its grid from the server, never hardcode it

`SnapGrid` held `GRID_WIDTH`/`GRID_CENTER_COL` as `const`s (14 / 6.5) and `TowerStack` aliased them into its own `const`s. The moment `Game_Config.towerGridWidth` was retuned to 8 during playtest tuning, the server began sending columns 0–7 while the client still centred on 6.5 — drawing the entire tower 102px off-screen left, with no error anywhere.

`towerGridWidth` and the resolved `placeableColumnMin`/`Max` are now broadcast in `game_state` and held as `static var`s on `SnapGrid`, with the render centre *derived* as `(grid_width − 1) / 2`. Static state was chosen over threading the values through ~8 static functions: the grid is genuinely global for a whole level, and the alternative was far more churn for the same value. The cost is that tests must `reset_placeable_range()` between cases, which `test_snap_grid.gd` now does.

## Scoring carries the selfish-cooperation tension

Before this pass every scoring path paid for *height gained*. Placing a brick that widened the base or corrected a lean earned nothing, and collapse was a flat team-wide loss with no individual stake — so the game's defining tension had no mechanical surface at all, and no config value could create one.

Two additions, deliberately kept small: placement score is multiplied by the stability the placer **inherited** (`placementStabilityFloor + (1−floor) × stabilityBefore/100`), and a new **Reinforce** event pays for integrity gained and lean corrected. Using stability *before* the placement rather than after is what makes "fix it, then claim" the rational order — paying on the result would reward a player for their own overhang. Reinforce is sized to be competitive with, not dominant over, a good height claim.

Rejected alternatives: a purely contested finite height pool (sharpens selfishness but still leaves stability an unrewarded shared punishment), and a personal collapse stake (needs per-player blame attribution the pure stability function does not produce, and reads as punitive).

## Impact every level, and the share is bounded by arithmetic

`impactInterval` moved from 3 to 1 so filling the Impact bar *is* the per-level objective. That is only viable because rollback correspondingly shortened — failing now replays the level just played instead of discarding up to three levels.

**The contribution share cannot be set by feel.** Three players × the share is the fraction of a level's score pool that must be split near-evenly; at 30% that is 90%, which no natural distribution reaches. The first measurement showed a 0–8% gate pass rate and looked like a fatal design flaw. It was **a simulator artifact**: the simulator let one player place unboundedly in a row (one bot scoring 128 while others scored 0) because it never modelled the per-player placement cooldown that forces a real room to interleave. With the cooldown modelled the true rate is 62–90%, and the share settled at **25%**, leaving a 25% contested margin. Recorded here because the failure mode — trusting a tuning number from a simulator that omits a real constraint — is easy to repeat.

Power and the side quest also unlock at level 1, and Refresh became **quest-only** via two default-off flags (`powerGuaranteedBaseline`, `powerImpactMvpReward`) rather than deleting either grant path. The Impact-MVP path in particular would otherwise hand out a Refresh *every* level under the new interval.

## Bot strategies differ by risk appetite, not competence

The first attempt at splitting `cooperative` from `mvp_greedy` had cooperative maximise stability outright. That made it spread bricks pointlessly, starve itself of supply, and **lose to greedy on completion** — incompetence dressed as caution. Recast so both bots pursue height and the difference is how much risk they accept: greedy takes the best height gain among any non-collapsing column, cooperative only among columns within `debugBotStabilityTolerance` of the *best available* stability.

That gate is **relative rather than an absolute threshold** because an absolute one stops discriminating entirely once stability is tuned forgiving enough that every column reads healthy — which is exactly the live tuning state.

Cooperative additionally **yields its whole turn** (`{ type: "wait" }`) once it has banked its own Impact share while a teammate is short, since under a per-level gate that teammate's shortfall fails everyone. A bot that is short can never take that branch, so a room cannot deadlock. This required fixing a real bug first: `getImpactScoreStatus` reads banked `score`, which only absorbs `levelScore` at level end, so mid-level every player read as short and the yield never fired — the same live-score correction the client's Impact bar already applied.

**Divergence is contingent on stability being able to punish.** Measured: with collapse effectively impossible, greedy wins both completion and gate (96% vs 88% at level 10) because it carries no downside; with stability biting, cooperative wins decisively (87% gate / 2% collapse vs 64% / 28%). Both are correct — with no risk there is nothing to be risk-averse about.

## Score Cap / Copy Score disabled via powerCatalog active flag

Score Cap and Copy Score were reachable only through the Impact-MVP reward path (`Impacts.js`'s `awardImpactPower()`), which picked randomly across every key in `GameConfig.powerCatalog` — the guaranteed-baseline and side-quest grant paths were already hardcoded to `"refresh"` only. Per a power-system redesign in progress, they're pulled from play for now, keeping only Refresh obtainable. Rather than deleting their catalog entries or `activatePower()` effect branches (which would need re-authoring from scratch once new power designs are ready), each `powerCatalog` entry got an `active: boolean` flag; `awardImpactPower()` now filters to `active: true` entries before picking. Score Cap/Copy Score are `active: false` — fully defined, never granted, so they never surface in a player's Power list. Re-enabling either later is a one-line flip of its `active` flag in `Game_Config.js`, no other code changes needed. See [gameplay.md § Effects catalog](./gameplay.md#activation-and-effects) and [backend.md § Game Config](./backend.md#game-config).

## Placement design lineage (superseded)

Placement was redesigned four times. Only the durable conclusions are kept; the current mechanic is [Point-based snap resolution](#point-based-snap-resolution-and-the-docked-landing-ghost) plus the per-level site in [Buildable site width](#buildable-site-width-scales-with-target-height).

| Design | Why it died |
|---|---|
| **Size-1..6 block ladder** | Replaced by 5 fixed 4-cell bricks (`I`/`O`/`L`/`T`/`Z`) from level 1. Difficulty should come from height, timer, stability and site — not unlock gating. |
| **3 lanes (L/C/R) on a 5- then 9-wide grid** | Wide bricks anchored near a lane edge spilled into "overflow" columns, producing a silent hard-clamp bug where the right lane collapsed onto the centre lane's placement. |
| **Per-instance random `anchorX`** | Only existed to bridge a 3-way discrete lane choice to a per-shape reference point. Once placement became continuous the bridge was unnecessary. Two alternatives were tried first — a contextual per-lane anchor (collapsed most brick widths onto identical placements) and wider lane spacing (rejected to keep lanes adjacent). |
| **Fixed 14-column grid, columns 4–9 placeable** | Requiring the *entire* footprint to fit up front removed the overflow bug class and still stands as a rule. The fixed numbers do not: grid width is now a config value the client reads off the wire, and the site is derived per level. |

Two things from that era **still stand and are load-bearing**: random rotation at generation (`Block_Supply.getRotations`), and the integer `column` wire field that replaced `lane`.

Its **explicit non-goal — "no stability/balance rebalancing in this pass"** — is what left a narrowed placeable footprint sitting under untouched stability weights and a target curve sized for the old geometry. That deferral is the direct ancestor of both [Two-axis stability](#two-axis-stability-lean--integrity-replaces-the-single-tilt-scalar) and [Supply was sized for vertical stacking](#supply-was-sized-for-vertical-stacking-and-made-high-levels-unwinnable). Deferring a rebalance across a geometry change is what turned two tractable tuning problems into two unwinnable-game bugs.

## Point-based snap resolution and the docked landing ghost

The previous mechanic was *named* corner-snap but resolved placement in pure 1-D column math: cursor x → fractional column, compared against candidate origin edges. The y axis was ignored and the placed tower's geometry never entered the calculation, so the drawn snap dots and the resolver were computed independently — the dots were decoration.

- **Resolution is a 2-D pairing** in the node-free `SnapGrid` service: for every outline vertex of the dragged brick × every snap point on the platform and on every placed brick, the candidate origin column is `point.x − vertex.x`; candidates whose footprint leaves the site are rejected and the smallest squared lattice distance wins. Beyond `snap_radius_units` it falls back to nearest-column aiming so a drag over open sky never dead-ends.
- **Gravity is deliberately preserved — the snap picks the column only.** Rejected: locking the brick at the snapped point (bricks could hang in mid-air, bypassing `settleBlock`, needing a `row` on the wire plus a stability rebalance), and filtering to only "supportable" points (far fewer legal targets, still needs a server-side row). Drop-to-contact means **no server or wire change at all**, so client and server need no lockstep deploy, and overhang stays the stability hook.
- **The client mirrors the server's settle to preview the landing row.** `SnapGrid.settle_origin_y` is a line-for-line mirror of `Tower_Stability.settleBlock`'s drop loop — deliberate duplication with a real coupling cost: **any change to `settleBlock` must be mirrored there or the preview silently lies.** Both sites carry a comment saying so.
- **The highlighted point is recomputed *after* settling.** Highlighting the point the cursor pairing chose aimed the ring at a spot gravity dropped the brick short of; `contact_pair` re-derives it from the settled footprint.
- **The ghost is drawn inside `TowerStack`, not as a floating sibling.** Docking means sharing the tower's tilt pivot, scroll offset and brick size exactly; emitting it in the same `draw_set_transform` block makes that free and impossible to desync.
- **Cursor hit-testing un-leans the tilt** (`_untilt`) — otherwise aiming at a point on a leaning tower resolves to the column it would have had upright, a real error at the live-play tilt cap.
- **The drag grip lift is in brick units, not pixels** (`drag_grip_offset_units`) — an Android-first requirement, since a centred ghost puts the thumb over the exact area being aimed at. Units keep it proportional when `brick_unit_size` is retuned, and the lifted position feeds the resolution so the ghost docks where the *brick* points, not the thumb.
- **`clear_snap_preview()` is separate from `end_snap_drag()`.** Merging them wiped the drag state on the first move — the pointer legitimately leaves and re-enters the drop zone many times per drag. **Found by rendering the play field to PNG, not by unit tests**: the snap math was correct in isolation the whole time. Placement visuals still need eyes on a real build.
