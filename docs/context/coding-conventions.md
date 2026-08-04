# Coding Conventions

Scope: patterns to follow when writing code or docs in this repo. Extracted once here instead of repeated per-module.

## Documentation policy

- **No explanatory comments in source.** Context that would help a future editor goes in the matching `.md` doc under `docs/context/`, not inline in code.
  - **Sole exception — `SAFETY EXCEPTION` comments:** inline comments that prevent an edit from leaking credentials or opening a security hole where the risk isn't visible from the code itself. Mark these `SAFETY EXCEPTION` with the reason inline (moving them to a doc would put the warning where nobody editing that line reads it). Currently three: two in `.github/actions/fetch-private-assets/action.yml`, one in `scripts/art-common.sh`.
- **Doc ownership by change type:** design/rules/scoring/balance/progression/debug-tuning-semantics/bot-behavior changes → [gameplay.md](./gameplay.md). Everything else (architecture, deploy, contracts, persistence, testing, tooling) → the matching technical doc (`architecture.md`, `networking.md`, `backend.md`, `ui.md`, `deployment.md`, `build.md`, `testing.md`).
- **Docs are updated only when the user runs `/update-docs`** (after confirming the goal is fully reached, not speculatively mid-task) **or `/compact-docs`**.
- Read component source only when a `.md` doc doesn't provide enough context (refactors, redesigns) or when actually implementing — and then read only the relevant sections/functions, not whole files, unless a full-file read is required to be correct.
- Do not commit, push, pull, or compare with the remote git repo unless explicitly instructed.

## Documentation maintenance

The `/update-docs` procedure, the retention test, the banned constructions, and the budget rules live in [doc-maintenance.md](./doc-maintenance.md) — loaded only by a run that is actually editing docs, so it never costs a coding session anything.

## Server: engine module delegation pattern

`Game Engine` is the facade for one room. Block supply, scoring, and Impact logic live in separate `src/Server/app/engine/` modules (`Block_Supply.js`, `Scoring.js`, `Impacts.js`), each following the same shape:

- Every export is a **plain function whose first argument is the owning `GameEngine` instance** (e.g. `Scoring.addPlacementScore(engine, player, block, effectiveHeight)`).
- `GameEngine` re-exposes each one as a same-named method on itself (`engine.addPlacementScore(...)` calls straight through).
- Callers (Lobby Manager, Bot Manager, Balance Simulator, tests) always go through the `GameEngine` facade — never `require()` an `engine/` module directly.
- Cross-calls between a module's own functions also go through the facade (e.g. `Block_Supply`'s `dealOpeningHands` calls `trimInventory` via `engine.trimInventory(...)`, not a direct local call), so the facade stays the single seam.

Adding a new engine-owned system: put it in its own `engine/` module following this shape rather than growing `Game_Engine.js` directly.

## Client: GameUi module family pattern

`Main.gd` (Main UI Controller) is a slim orchestrator over single-purpose modules in `Cor/Scripts/GameUi/`. Two shapes only:

- **Shared services** (`RefCounted`) — stateless/shared data, instantiable in GUT with no scene tree (e.g. `UiTuning`, `MatchState`, `PlayerContext`, `PopoverCoordinator`, `BlockData`).
- **View controllers** (`Node`) — `add_child`-ed by Main so they share the scene's lifecycle and can own `Tween`s/`Timer`s (e.g. `DebugPanelController`, `ScorePopupController`, `InventoryController`).

Neither shape is added to `GameUI.tscn` directly — each declares the nodes it needs via its own `bind_nodes(binder)` method, which Main aggregates through `UiNodeBinder`. Follow this shape for new UI modules rather than adding logic back into `Main.gd`.

**Popover triggers wire their own signal.** Each trigger (`QuestChip`, `QuickChatTrigger`, `PowerTrigger`) connects its own native `.pressed` signal and calls `should_block_popovers()` itself, rather than routing through a shared `_input()` hit-test dispatcher — a prior shared-router design (`PointerTriggerRouter`) was removed for this reason (see [decisions.md](./decisions.md)). Add new popover triggers the same way. (The former `TeamInventoryButton` trigger was removed entirely — see [decisions.md](./decisions.md#team-inventory-popover-removed--always-visible-team-inventory-panel).)

## Godot UI gotchas to respect

- **`mouse_filter = 2` (ignore) on decorative/overlapping nodes.** Any non-interactive node positioned over or near a tappable control must set this — Godot's default `mouse_filter = 0` (stop) makes a Control swallow touches even when it draws nothing there. Check new overlay/decorative nodes against nearby interactive controls before assuming the default is harmless.
- **Popover card size is author-set, not content-derived.** Each `Popover Panel` instance in `Game UI Scene` sets an explicit `custom_minimum_size` (`260x163` bottom-row popovers, `260x140` Quest). Change a popover's design size by editing that node's `custom_minimum_size` in the scene, not by relying on content to size the card.
- **`window/handheld/orientation` must be the Godot 4 integer** (`1` for `SCREEN_PORTRAIT`), not a Godot 3–style string — a string silently coerces to `0` (landscape) with no warning.

## Infra / workflow conventions

- Prefer GitHub Actions for Terraform validation/planning over local manual Terraform runs.
- Shared composite actions (`terraform-backend-bootstrap`, `aws-terraform-setup`, `resolve-ssh-key`, `terraform-validate-plan`) back every Terraform workflow (K3s Plan/Apply/Cleanup, EKS Plan) — extend those rather than re-implementing per workflow.
- A step-scoped `env:` value doesn't carry to later steps — only `$GITHUB_ENV` does. A later step that reads a secret-derived variable another step already resolved needs its own `env:` block (or the earlier step must persist it to `$GITHUB_ENV`), or `set -u` scripts fail with an unbound-variable error.

## Formatting conventions used across these docs

- Config/tuning keys are always given in their exact code identifier form (e.g. `impactMinContributionShare`), never paraphrased, since they must match `Game_Config.js` and the debug-config wire contract exactly.
- Numeric defaults are stated once in their canonical table ([gameplay.md](./gameplay.md) for tunables, per-doc tables elsewhere) and referenced, not re-derived, from other docs.
- **The docs own knob *semantics*; `Game_Config.js` owns knob *values*.** Mirroring a value into prose creates the KB's most common drift class, so a value is written down only when it drives design conversation on its own (the target-height curve, `impactMinContributionShare`, the stability weights and thresholds — roughly ten keys). Everything else gets name + meaning + shape, and the reader opens `Game_Config.js` for the current number.
