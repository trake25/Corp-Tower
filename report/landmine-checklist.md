# Landmine checklist — extracted before the Phase 3b rewrite

Every gotcha and rework guard in the current KB, pulled out **before** any doc is
compressed. An 8× compression is exactly how this class of content gets lost, so
each line is ticked off in the rewritten doc and the checklist is a phase gate:
**3b is not done until this file is 100% ticked.**

If a doc can only meet its token budget by dropping one of these, **the budget is
wrong, not the landmine** — raise that doc's budget in `validate-docs.mjs` and
record why in the same commit. That is the plan's stated abort condition, not a
judgement call to be made under budget pressure.

Status: `[ ]` not yet carried · `[x]` present in the rewritten doc.

## Source coverage

| Source doc | Extracted | Notes |
|---|---|---|
| `decisions.md` | yes | full pass, 189 lines |
| `coding-conventions.md` | yes | full pass |
| `glossary.md` | yes | definitions that carry a trap |
| `scripts/validate-docs.mjs` | yes | tooling landmines in its own comments |
| `backend.md` | yes | rewritten; raw `GameConfig` fallback in `evaluate()` confirmed and carried |
| `ui.md` | yes | rewritten; `godot --editor --quit` corruption found here, not in `build.md` |
| `gameplay.md` | yes | rewritten |
| `deployment.md` | yes | rewritten |
| `networking.md` | yes | rewritten |
| `build.md` | yes | rewritten |
| `testing.md` | yes | rewritten |

**All seven domain docs rewritten, all 50 hazards verified present.** Every
`After` figure below is measured by `validate-docs.mjs`, not estimated.

| Doc | Before | After | Budget |
|---|---|---|---|
| `ui.md` | 16,649 | 5,719 | 5,800 |
| `backend.md` | 10,895 | 5,670 | 5,700 |
| `gameplay.md` | 6,894 | 5,244 | 5,300 |
| `deployment.md` | 6,464 | 4,812 | 5,000 |
| `testing.md` | 5,258 | 2,984 | 3,000 |
| `networking.md` | 4,005 | 2,655 | 4,000 |
| `build.md` | 2,178 | 1,931 | 3,000 |

## The `Rejected:` form is retired

A doc entry earns its place only if it changes what someone does to the code
**today**. Two things had been conflated under "rework guard":

- **A live constraint** — `Number(null)` is `0`; `SnapGrid.settle_origin_y` mirrors
  server `settleBlock`; `checkFailCondition` must not take the efficiency factor.
  The hazard is still in the code. **Keep, stated as a present-tense rule.**
- **A story about a fixed bug or a system that no longer exists** — the two-skin
  picker, the removed EC2 staging stack, "we tried X and it broke". Nothing acts on
  it. **Delete.**

Every `**Rejected:** <option> → <failure>` line was resolved one of those two ways;
none remain. Where the constraint was live it became a statement of how the system
behaves and why it cannot behave otherwise, which is shorter than the narrative it
replaced. This is why the budgets below came *down* rather than up.

The three still above the plan's flat 5,000 are carrying real debt: the plan
expected per-symbol detail to migrate into map rows, and Phase 2 generates maps
bare with `Does` authored on demand, so that destination is still empty.
**Authoring map prose is what closes that gap — raising the budgets again is not.**

**Drift found while rewriting — four `!` findings:**

1. `ui.md` contradicted itself. Its Tower Stack entry documented the **pre-fix
   14-column const-aliased grid** (`GRID_CENTER_COL 6.5`, placeable 4/9) that the
   same file's `SnapGrid` entry and `decisions.md` both described as the bug that
   drew the tower 102px off-screen. Rewritten to the server-owned form.
2. `networking.md` contradicted itself. Line 48 claimed **"only `column` crosses
   the wire"** and that `origin_y` was client-side presentation only, while line 38
   in the same file documented `originY` as a `place_block` field — and both
   `backend.md` and `ui.md` depend on it crossing. Stale text from before the
   point-snap redesign. Corrected.
3. The Tutorial's level-1 numbers (target 16, Impact 48) do not match the shipped
   curve (30 / 90). **Left stated as drift rather than silently corrected** — the
   fix is a code change, not a doc edit, since lesson copy quotes both figures
   verbatim and a lesson seeds a filler tower so the scripted brick lands on 16.

4. `gameplay.md`'s supply-coverage numbers contradicted `Game_Config.js`. The doc
   claimed coverage lerps **120% → 90% by level 20**; source holds
   `levelSupplyCoverageStart: 1.05`, `levelSupplyCoverageEnd: 0.75`,
   `levelSupplyCoverageFullLevel: 15`. Every figure was wrong, and the end value
   being **below** full coverage changes the design read: late levels are not meant
   to finish on the dealt pile alone. Rewritten to name the keys and state the
   shape, **without mirroring the values** — the rule that exists for exactly this.

Findings 1 and 2 are the same class and neither is catchable by a link checker, a
line budget or a token budget: a file disagreeing with itself. Both were found by
reading a doc end to end in order to rewrite it, which is an argument for the
rewrite pass having value independent of the compression.

Finding 4 is the class the claim-check was meant to catch and does not: a mirrored
constant going stale. The checker verifies counted assertions ("currently N …"),
not tuning values copied into prose. The durable fix is the one applied — name the
key, state the shape, let the reader open `Game_Config.js` — because a value that
is never mirrored cannot drift. Two server tests in the same supply area were
already failing before this pass, which is consistent with one retune that outran
both its tests and its docs.

## Client / UI

- [x] **`mouse_filter = 2` on every decorative or overlapping node.** Godot's
  default `0` (stop) makes a Control swallow touches even where it draws nothing.
  Check new overlays against nearby interactive controls.
- [x] **Popover card size is author-set, not content-derived** — explicit
  `custom_minimum_size` per instance (`260x163` bottom row, `260x140` Quest).
- [x] **`window/handheld/orientation` must be the Godot 4 integer** (`1` =
  `SCREEN_PORTRAIT`). A Godot 3-style string silently coerces to `0` (landscape),
  no warning.
- [x] **Same-tap self-close race** in Popover Panel hit every trigger equally —
  fixed by `OUTSIDE_TAP_GRACE_MS` (250 ms) on `OutsideCatcher`, not by per-trigger
  wiring. `OutsideCatcher` is a later sibling than the triggers, so it wins normal
  GUI hit-testing while a popover is open.
- [x] **Labels on a white card need an explicit dark `font_color` override** — the
  shared `CardMetaLabel` theme variation defines none and falls through to a
  near-white default, invisible on `WhiteCardPanel`.
- [x] **A constant parallax ratio cannot cancel an easing-induced lag.**
  `PlatformArt` at `parallax_ratio = 1.1` against eased `lerpf` motion left a
  residual `−7 + 0.1 × scroll_pixels` gap — unbounded past ~70px. Fix is
  `parallax_ratio = 1.0` plus a per-instance `instant` flag snapping in the same
  frame as the brick redraw. `BgArt` keeps eased motion.
- [x] **The platform is background, not HUD.** `_is_rect_visible()`'s bottom bound
  extends to the real screen bottom; clipping at the Control's own rect while the
  ground sank past it made the tower appear to float.
- [x] **`Main.apply_camera_zoom()` must pivot `PlatformArt` on its top centre**
  before scaling, or the ground shrinks away from the bricks resting on it.
- [x] **Camera follow during a collapse is deliberately out of scope** — known
  cost: on a scrolled level the debris pile lands below the viewport, so
  `CollapseSim` is invisible on most failures.
- [x] **The revealed sky is a placeholder.** A replacement must be *seamlessly
  vertically-tileable*, not merely a taller image — a flat colour has no edge, so
  it pans any distance.
- [x] **Node order in `GameUI.tscn` is deliberate.** `TopIndicatorRow` before
  `TowerStack` makes the tower draw over the bar.
- [x] **The tower viewport ceiling is a fact, not a preference.** `TowerStack` is
  272px at a fixed 34px brick, so only 8 grid columns are ever on screen.
  `towerSiteWidthMax` is capped at 8 in config *and* in the debug clamp; widening
  it means widening the viewport or shrinking bricks.
- [x] **The client must derive its grid from the server.** `towerGridWidth` and
  `placeableColumnMin`/`Max` are `static var`s on `SnapGrid`, render centre derived
  as `(grid_width − 1) / 2`. Held as `const`s they aliased into `TowerStack` and
  drew the tower 102px off-screen with no error anywhere. Tests must call
  `reset_placeable_range()` between cases.
- [x] **`SnapGrid.settle_origin_y` / `is_placement_legal` are line-for-line mirrors
  of `Tower_Stability.settleBlock` / `isPlacementLegal`.** Any change to either
  server function must be mirrored or the preview silently lies. All four sites
  carry a comment saying so.
- [x] **`clear_snap_preview()` must stay separate from `end_snap_drag()`** —
  merged, they wipe drag state on the first move, since the pointer legitimately
  leaves and re-enters the drop zone many times per drag. Found by rendering the
  play field to PNG, not by unit tests: **placement visuals still need eyes on a
  real build.**
- [x] **The drag ghost is drawn inside `TowerStack`**, not as a floating sibling —
  the same `draw_set_transform` block shares tilt pivot, scroll offset and brick
  size, making desync impossible.
- [x] **Cursor hit-testing un-leans the tilt (`_untilt`)**, or aiming at a point on
  a leaning tower resolves to the column it would have had upright.
- [x] **Drag grip lift is in brick units** (`drag_grip_offset_units`) — Android-first;
  a centred ghost puts the thumb over the exact area being aimed at.
- [x] **Never classify brick mood server-side and store the verdict.** Stamping a
  mood string froze it at placement so the knob could not restyle a standing tower.
  Store the number, classify in the view. A brick with **no `balanceDelta` draws no
  face** — a neutral face is indistinguishable from a real "barely moved" verdict
  and hides a stale server.

## Server / gameplay

- [x] **`Number(null)` is `0`** — an absent `originY` must be tested *before* the
  numeric coercion, or every bot placement reads as "aim at row 0" and threads into
  the lowest gap that fits.
- [x] **`place_block` carries an optional `originY`.** A server that ignores it
  silently reverts every client to top-of-tower placement.
- [x] **Small towers make every ratio degenerate.** A lone `T` on its stem is 50%
  unsupported; an `L`/`Z` leans ~10° immediately. Fix is the single maturity ramp
  `min(1, height / towerStabilityMinHeight)` on **all** penalty terms — never
  per-shape special cases.
- [x] **`towerBaseHalfWidthFloor` is a divide-by-zero guard only.** Using it as a
  difficulty lever is what killed the lean axis — above the site's real half-width
  it pinned lean's divisor so `tiltScore` never passed 0.76 against a threshold of 6.
- [x] **Site usage is worst at the very first brick.** One narrow brick alone on the
  ground is maximal `siteWidth / groundWidth`; at high pressure this collapsed 47%
  of runs on placement one. Any future harshening must re-check the opening brick,
  not just steady-state play.
- [x] **Integrity is recomputed from `entries` every call, never accumulated** —
  that is what keeps a persistent-*feeling* score a pure function.
- [x] **`Tower_Stability.js` must stay pure and deterministic.** The Balance
  Simulator re-runs `evaluate()` thousands of times and the client re-derives tilt
  from a `game_state` snapshot after reconnect rather than replaying history.
- [x] **Do not apply the packing-efficiency factor to `checkFailCondition`.** That
  check tests *impossibility* and needs the true optimistic upper bound — one
  height-3 brick genuinely can add 3 height if stacked. A test caught it failing a
  level while a winning move still existed.
- [x] **`maxGeneratedDrawPileBlocks` is a sanity ceiling against a bad config, not
  a balance knob.** Target height is uncapped, so a value that binds starves the
  level outright.
- [x] **`getImpactScoreStatus` reads banked `score`**, which only absorbs
  `levelScore` at level end — mid-level every player reads as short and the
  cooperative bot's yield never fires without the same live-score correction the
  client's Impact bar applies.
- [x] **Deploy client and server together.** Both renames (Power, Impact) went
  across every wire field, config key and Redis-persisted field, so a room in
  flight during a split deploy will not restore its Impact/Power state from an
  old-shaped snapshot.
- [x] **A handed-off player's local `engine.room` is a frozen `hydrateRoom()`
  snapshot**, never refreshed by later broadcasts. Room actions must route through
  `dispatchRoomAction()` and run only on the lease-owning pod; the owning pod must
  stay the sole writer.
- [x] **Deferring a rebalance across a geometry change is the ancestor of two
  unwinnable-game bugs.** A narrowed placeable footprint under untouched stability
  weights and an old target curve produced both the two-axis stability rework and
  the supply resize.

## Testing / tuning

- [x] **Never trust a tuning number from a simulator that omits a real
  constraint.** The Impact gate's first measured pass rate of 0–8% read as a fatal
  design flaw; it was a simulator artifact — one bot placed 128 times in a row
  because the per-player placement cooldown was not modelled. True rate 62–90%.
- [x] **Bot collapse rate cannot calibrate stability.** `chooseBotPlacement` skips
  collapsing placements, so simulated collapse reads ~0% across wildly different
  configs. Tune against `avgStability` and per-placement spread.

## Infra / CI

- [x] **A skipped guard job cascades downstream.** A job's default `if` is
  `success()`, evaluated against its **entire** upstream graph, not just its direct
  `needs`. Any job downstream of a conditionally-skipped job needs an explicit
  `if: always() && needs.<dep>.result == 'success'`.
- [x] **`github.event_name` reflects the top-level run's trigger**, however many
  `workflow_call` levels deep a job sits. Use an explicit boolean declared only
  under `on.workflow_call.inputs`, checked as `inputs.invoked_via_call != true`.
- [x] **A step-scoped `env:` value does not carry to later steps** — only
  `$GITHUB_ENV` does. A later step reading a secret-derived variable needs its own
  `env:` block, or `set -u` scripts fail on an unbound variable.
- [x] **`dig` never sees a CNAME for a proxied Cloudflare record.** The edge
  resolves the hostname straight to anycast A/AAAA, so the query is always empty
  and a wait loop always times out. Query the Cloudflare API instead.
- [x] **Free Universal SSL covers the apex and exactly one subdomain level.** A
  two-level name behind a *proxied* record fails the TLS handshake outright. K3s
  hostnames escape this only because they are DNS-only with Caddy fetching its own
  cert.
- [x] **The ACME cache archive carries the live ACME account key and TLS private
  key** — chmod `0600` immediately on both runner and EC2-GW, delete once consumed.
- [x] **Let's Encrypt allows 5 duplicate certificates per identifier set per 168h.**
  EC2-GW's root volume is ephemeral, so repeated destroy/recreate cycles hit it and
  surface only as a generic 5-minute timeout.
- [x] **A custom node SG replaces, not extends, EKS's automatic node↔control-plane
  and node↔node wiring** — silently, with no apply-time error. Three rules must be
  declared explicitly: node→control-plane 443, control-plane→node 1025-65535, and a
  self-referencing all-traffic rule. Missing the self-referencing one still lets the
  cluster come up and only drops cross-node pod traffic, surfacing as intermittent
  `getaddrinfo EAI_AGAIN`.
- [x] **The Resource Groups Tagging API is an eventually-consistent search index**
  that keeps listing deleted ARNs for minutes. Cross-verify every ARN with a live
  `describe-*` before failing an orphan check.
- [x] **EKS deploy workflows run no Terraform**, so a committed infra fix is inert
  until an Infra Apply runs on that commit. The `verify-infra` tree-hash marker is
  what surfaces the gap; deleting the S3 marker downgrades the guard to a warning.
- [x] **Backup guard jobs are self-hosted and queue indefinitely with no timeout**
  when the physical machine's runner is offline.
- [x] **`actions/checkout`'s clean step wipes gitignored and untracked files** in
  the checkout, which is why backup state lives in a machine-local
  `$CORP_TOWER_BACKUP_STATE_DIR`.
- [x] **`cloudflared` runs as a user-level systemd service** (a self-hosted runner
  has no TTY for a `sudo` prompt) and needs `loginctl enable-linger` once to survive
  non-interactive sessions.
- [x] **No Redis on the backup machine** — single machine on `Redis_State.js`'s
  in-memory fallback. Correct there, wrong for multi-replica K3s.

## Doc tooling

- [x] **Split on `\r?\n`.** A lone `\r` is a JS line terminator, so `.` in a heading
  regex won't consume it and `$` never matches — on a CRLF checkout that silently
  yields zero anchors and every `#link` reads dead.
- [x] **`resolve()` returns backslash paths on Windows**, so separator splits and
  prefix tests must be platform-aware, or every link with a path part skips its
  anchor check silently.

## Rejected options worth keeping as rework guards

These are not gotchas but they are the other half of the retention test — each
becomes one `**Rejected:** <option> → <failure>` line in the section it protects.

- Shrinking bricks to fit → bricks visibly smaller than designed on tall towers.
- A `Camera2D`/viewport-follow redesign → the client is `Control`-based with raw
  `_draw()`, not `Node2D` children a camera can pan.
- Reweighting the existing Lean terms → no weighting of asymmetry measures
  slenderness.
- Keeping the nine raw stability constants and hand-tuning them → the units are the
  problem.
- Subtracting the placed brick's `overhangPenalty` from `balanceDelta` → recreates
  the one-sided frown bias and double-counts `comOffset`.
- Placing *at* the snapped point with support as a legality rule → bricks hang in
  mid-air off a single diagonal corner.
- Filtering to only "supportable" snap points → far fewer legal targets for what
  gravity gives free.
- Re-hydrating the local room snapshot on every relayed broadcast → two
  independently-mutable copies of one room.
- `replaceQueue()`'s read-all/rewrite-all → another pod's entry landing in the
  read/write gap was silently wiped.
- Cooperative bot maximising stability outright → it lost to greedy on completion;
  incompetence dressed as caution.
- A stored auto-deploy flag → a runtime live-state check cannot drift out of sync.
- A `window.location.hostname` sniff for the debug flag → web-only, one host.
- A `TabContainer` header for debug categories → cramped at 8; a dropdown scales.
- Adding a dim option to shared `PopoverPanel` → risks the three live popovers.
- Two swappable UI skins with a runtime picker → every scene edit made twice.
- Cloudflare Pages for the HTML5 client → 25 MiB per-file cap vs a 35.95 MiB
  `index.wasm`; the cap is on the stored file so compression doesn't help.
- An AWS Load Balancer Controller + IRSA + `TargetGroupBinding` → a Helm install and
  IRSA wiring for what `target_type=instance` NodePorts already do.
- Deleting the inactive `powerCatalog` entries → they would need re-authoring from
  scratch when new power designs land.
