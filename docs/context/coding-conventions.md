# Coding Conventions

Scope: patterns to follow when writing code or docs in this repo. Extracted once here instead of repeated per-module.

## Documentation policy

- **No explanatory comments in source.** Context that would help a future editor goes in the matching `.md` doc under `docs/context/`, not inline in code.
  - **Sole exception — `SAFETY EXCEPTION` comments:** inline comments that prevent an edit from leaking credentials or opening a security hole where the risk isn't visible from the code itself. Mark these `SAFETY EXCEPTION` with the reason inline (moving them to a doc would put the warning where nobody editing that line reads it). Currently three: two in `.github/actions/fetch-private-assets/action.yml`, one in `scripts/art-common.sh`.
- **Doc ownership by change type:** design/rules/scoring/balance/progression/debug-tuning-semantics/bot-behavior changes → [gameplay.md](./gameplay.md). Everything else (architecture, deploy, contracts, persistence, testing, tooling) → the matching technical doc (`architecture.md`, `networking.md`, `backend.md`, `ui.md`, `deployment.md`, `build.md`, `testing.md`).
- **Docs are updated only when the user runs `/update-docs`**, after confirming the goal is fully reached — not speculatively mid-task.
- Read component source only when a `.md` doc doesn't provide enough context (refactors, redesigns) or when actually implementing — and then read only the relevant sections/functions, not whole files, unless a full-file read is required to be correct.
- Do not commit, push, pull, or compare with the remote git repo unless explicitly instructed.

## Documentation maintenance

- **Entry point:** [index.md](./index.md) is the always-load entry (system overview, working rules, task router, retrieval tiers, ignore map). Keep it ≤ ~150 lines — it links out, never duplicates.
- **Update procedure (`/update-docs`, diff-driven — never a full rebuild):**
  1. `git status` + `git diff` to find changed paths; do not re-read the repo.
  2. Map each changed path → [module-index.md](./module-index.md) row → its owning doc (ownership map above). Rationale → [decisions.md](./decisions.md); terms → [glossary.md](./glossary.md); message shapes → [networking.md](./networking.md); stack/rules → [index.md](./index.md).
  3. Edit only the affected docs (and their `module-index.md` rows).
  4. Run `node scripts/validate-docs.mjs`; fix anything it flags.
  5. Report the delta. Commit only if explicitly instructed.
- **Validation:** `scripts/validate-docs.mjs` checks link + anchor integrity (hard), plus orphans, module↔source existence, stack drift, and oversized docs (soft). Run it after any doc edit.
- **Invariants:** exactly one owning doc per concept · every link and `#anchor` resolves · numeric defaults stated once and referenced · `index.md` within budget · docs change only via `/update-docs`.

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

**Popover triggers wire their own signal.** Each trigger (`QuestChip`, `QuickChatTrigger`, `TeamInventoryButton`, `PowerTrigger`) connects its own native `.pressed` signal and calls `should_block_popovers()` itself, rather than routing through a shared `_input()` hit-test dispatcher — a prior shared-router design (`PointerTriggerRouter`) was removed for this reason (see [decisions.md](./decisions.md)). Add new popover triggers the same way.

## Godot UI gotchas to respect

- **`mouse_filter = 2` (ignore) on decorative/overlapping nodes.** Any non-interactive node positioned over or near a tappable control must set this — Godot's default `mouse_filter = 0` (stop) makes a Control swallow touches even when it draws nothing there. Check new overlay/decorative nodes against nearby interactive controls before assuming the default is harmless.
- **Popover card size is author-set, not content-derived.** Each `Popover Panel` instance in `Game UI Scene` sets an explicit `custom_minimum_size` (`260x163` bottom-row popovers, `260x140` Quest). Change a popover's design size by editing that node's `custom_minimum_size` in the scene, not by relying on content to size the card.
- **`window/handheld/orientation` must be the Godot 4 integer** (`1` for `SCREEN_PORTRAIT`), not a Godot 3–style string — a string silently coerces to `0` (landscape) with no warning.

## Infra / workflow conventions

- Prefer GitHub Actions for Terraform validation/planning over local manual Terraform runs.
- Shared composite actions (`terraform-backend-bootstrap`, `aws-terraform-setup`, `resolve-ssh-key`, `terraform-validate-plan`) back every Terraform workflow (K3s Plan/Apply/Cleanup, EKS Plan) — extend those rather than re-implementing per workflow.

## Formatting conventions used across these docs

- Config/tuning keys are always given in their exact code identifier form (e.g. `impactMinContributionShare`), never paraphrased, since they must match `Game_Config.js` and the debug-config wire contract exactly.
- Numeric defaults are stated once in their canonical table ([gameplay.md](./gameplay.md) for tunables, per-doc tables elsewhere) and referenced, not re-derived, from other docs.
