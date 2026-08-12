# Corp Tower — agent entry

The router. Policy lives in the role skills and the two knowledge bases and is
loaded on demand, so this file stays cheap enough to be free every session.

## Retrieval — pick a skill, then three hops

0. **A role skill, picked from the task and not from the files** — decidable
   before you know which paths it touches. **Each carries policy this file does
   not repeat.** Load it, then skip hop 1.

   `client-engineer` (Godot client) · `server-engineer` (game server) ·
   `fullstack-coordinator` (the wire moves) · `infra-engineer` (Terraform, CI,
   scripts, deploy) · `qa-engineer` (tests, the done-check) · `web-designer`
   (portfolio layout, components, diagrams) · `editorial` (the words on the
   portfolio) · `docs-steward` (every task that changed source ends here).

1. **The KB router** — game: [`docs/context/index.md`](docs/context/index.md).
   Site: [`site/docs/index.md`](site/docs/index.md), separate and much smaller.
   Each names the one doc and map your task needs.
2. **That doc's section, not the file.** Every doc fits in one read, which is not
   permission to take one — a whole-doc load costs several times the section and
   answers the same question.
3. **The map — grep it, never load it.** `docs/context/map/<area>.md` for the
   game, the file-map table in `site/docs/index.md` for the site.
   `Grep "resolvePlacementOrigin" docs/context/map/backend.md` returns file, line
   and purpose for ~150 tokens; loading that map costs thousands for the same row.
4. `Read(file, offset, limit)` on the `path:line` the row gave you. Every row is
   self-sufficient; a hit never needs a second lookup.

Never sweep the repo. A repo-wide search means the map has a gap — a miss is a KB
defect, not a reason to route around it. Repair it in the same task;
`docs-steward` holds the repair rules and the misses to flag instead of fixing.

## Always

- **Server is authoritative.** The client renders `game_state`; it never computes
  an outcome. Values live in `Game_Config.js`, semantics in the docs.
- **No comments in product source** — the server app and the Godot client, which
  is what `strip-comments.mjs` covers. **`scripts/` and `.github/` keep theirs**,
  and every `SAFETY EXCEPTION` comment lives there; never strip one. `site/`
  keeps short field-level notes, rationale in `site/docs/`.
- **Budgets are tokens** — `bytes/4`, plus a 300-character line cap.
  `scripts/validate-docs.mjs` gates the game KB,
  `site/tools/validate-site-docs.mjs` the site KB.
- **Regenerate the map after any source edit**: `node scripts/build-file-map.mjs`.
  The authored `Does` column carries forward by `path#symbol`, so it costs one
  command and no re-authoring.
- **A file over 600 lines is a decomposition candidate** — the map's
  `### <path> — NNN ln` header is the live count. Propose the split, don't do it.
- **Don't commit, push, pull or compare with the remote unless told to.** The
  Godot executable is in the root folder.

## Delegation (default: off)

Role skills load inline. Subagents are for complex work only, never the default.
Force on with `@deep`, off with `@solo`. Absent either, delegate only if 2+ hold
before work starts: spans 2+ role domains · more than ~30 files · needs a 600-line
decomposition · independent parallel branches · expected source reads > 40k
tokens.

Never delegate: single-section edits · context already loaded in this thread ·
ambiguous tasks needing user input mid-flight (agents cannot ask). If it turns
out bigger mid-task, say so and propose escalation rather than spawning silently.

## On task completion

Append one row to [`report/task-token-cost-effectivity.md`](report/task-token-cost-effectivity.md).
Record `R-est` **before** reading anything. If the row would be the 21st in the
open cycle, close the cycle first — see that file's append rule — then log this
task as row 1 of the next cycle.

## Plan Policy

All created plans *.md are saved in local plan folder.
