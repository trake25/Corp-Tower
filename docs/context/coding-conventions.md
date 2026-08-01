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

This section is the **single source of the `/update-docs` procedure**. `.claude/commands/update-docs.md` is a pointer to it and holds no steps of its own — so the procedure syncs to every machine by `git pull`, and stays out of session-start context until a task actually needs it.

**Entry point:** [index.md](./index.md) is the always-load entry (system overview, working rules, task router, retrieval tiers, ignore map). It links out, never duplicates.

### The one rule that governs every doc edit

These docs are a **description of the system as it is now**, not a record of how it got here. Git holds the history; the KB holds the current state plus what a future session must not have to rediscover. Every `/update-docs` run therefore *replaces* prose — it never appends to it.

**Retention test.** A sentence stays only if it is one of three things:

1. **State** — current behavior, contract, number, term, or a file's role.
2. **Rework guard** — an alternative that was tried and failed, stated *with its failure mode*, so a future session doesn't retry it.
3. **Landmine** — a gotcha that bites the next person who edits that code.

Anything else is deleted: chronology, ordering of attempts, who found what, how many passes it took, what a thing "used to" be. If the code no longer does X, no sentence saying it once did X survives.

**Supersede-and-collapse.** When a decision is reversed, its entry is **not** given an addendum. Rewrite it down to the lesson that survives, or delete it outright. Losing the narrative is intended — `git log -p docs/context/` still has it.

**Banned constructions** (rewrite, don't soften): *used to · previously · originally · the first attempt · was later · since removed · then deleted · reverted · earlier version · several calibration passes · this pass*. State the current rule instead; if a failure is worth keeping under the retention test, render it as a single `**Rejected:** <option> → <failure>` line. `validate-docs.mjs` flags these.

**Net-line expectation.** A typical goal is 2–15 net lines across all docs. Adding more than 30 net lines to one doc means the session is being transcribed rather than the system documented — compress before finishing.

### Update procedure (`/update-docs`, diff-driven — never a full rebuild)

1. **Scope the diff cheaply.** One stat pass, not a full read:

   ```
   git status --porcelain
   git diff --stat --ignore-all-space HEAD -- . ":(exclude)docs/context" ":(exclude)*.uid" ":(exclude)*.import" ":(exclude)*.tres"
   ```

   Then open `git diff -U2 -- <path>` **only** for paths whose owning doc is actually affected. Always read in full, regardless: `src/Server/app/Game_Config.js` and `src/Server/app/engine/**` — they encode numbers and contracts where a missed hunk becomes a wrong doc. Never re-read the repo.

2. **Doc-worthy gate.** A change earns a doc edit only if it alters a **number, a wire contract, a rule, a file's role, a term, or a rationale a future session would otherwise re-litigate**. A pure refactor with none of those produces *no doc change* — say so, run validation, stop. Do not manufacture an entry to show work.

3. **Route.** Map each doc-worthy path → [module-index.md](./module-index.md) row → its owning doc (ownership map above). Rationale → [decisions.md](./decisions.md); terms → [glossary.md](./glossary.md); message shapes → [networking.md](./networking.md); stack/rules → [index.md](./index.md).

4. **Edit as replacement.** Apply the retention test to what you write *and* to what is already there. While a doc is open, scan **that doc only** for statements this diff just falsified and delete them — it is already in context, so this is free. Do not sweep docs you didn't otherwise need.

5. **Validate.** `node scripts/validate-docs.mjs`; fix anything it flags as an error.

6. **Receipt.** One line, e.g. `docs: gameplay.md, decisions.md (+4/−31) · validate PASS`. No delta report — `git diff` already has it. Commit only if explicitly instructed.

Whole-KB compaction (dedupe across docs, collapse superseded entries, work the blacklist backlog) is **not** part of this procedure — it is the separate, user-run `/compact-docs`.

### `decisions.md` entry shape

Entries there decay into stories faster than anywhere else, so they take a fixed shape, ~12 lines max:

```markdown
## <the current rule, stated as a rule>
**Now:** what the system does, one line.
**Why:** the constraint that forces it.
**Rejected:** <option> → <the failure that killed it>.
**Consequence:** what breaks if this is changed.
```

A decision genuinely spanning several mechanisms may add prose after `Consequence:`, but the four labelled lines come first and each stays one line.

### Validation and budgets

`scripts/validate-docs.mjs` runs after any doc edit. Hard errors (exit 1): broken links, dead anchors, and — for any doc **changed in this run that grew past its line budget** — over-budget and banned-phrase violations. The same violations in a doc you shrank or didn't touch are warnings only, so compaction is never blocked and growth always is. It also lists unresolved status markers (`Not yet verified`, `Known bug`, `TODO`, …) each run for a keep/resolve/delete call.

**Invariants:** exactly one owning doc per concept · every link and `#anchor` resolves · numeric defaults stated once and referenced · every doc within its budget · docs change only via `/update-docs` or `/compact-docs`.

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
