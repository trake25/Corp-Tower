# Corp Tower — agent entry

This file is the only one guaranteed loaded, so it states the contract rather than
pointing at it. The knowledge base is `docs/context/`; the router is
[`docs/context/index.md`](docs/context/index.md).

## Retrieval — three hops, then a bounded read

0. **A role skill — pick it from the task, not from the files.** You know the kind
   of work before you know which paths it touches, so this is decidable first:
   `client-engineer` · `server-engineer` · `fullstack-coordinator` (the wire moves)
   · `infra-engineer` · `qa-engineer` · `docs-steward` (every task ends here).
   **Each carries policy this file does not repeat.** Load it, then skip hop 1.
1. **`index.md`** — task router → the one domain doc and map file your task needs.
2. **That doc's section** — behaviour, contracts, rework guards. **Read the section,
   not the file.** Every doc now fits in a single read, which is not permission to
   take one: a whole-doc load costs several times what the section costs and
   answers the same question.
3. **`docs/context/map/<area>.md`** — **grep it, never load it.**
   `Grep "resolvePlacementOrigin" docs/context/map/backend.md` returns file, line
   and purpose for ~150 tokens. Loading the map costs thousands for the same row.
4. `Read(file, offset, limit)` on the `path:line` the matched row already gave you.
   Every map row is self-sufficient; a hit never needs a second lookup.

Never sweep the repo. A repo-wide search means the map has a gap — fix the map.

## When retrieval fails

A miss is a defect in the KB, not a reason to route around it. Repair it in the
same task: bare or wrong map row → author the `Does` · wrong or missing router row
→ fix `index.md` · **doc contradicts source → source wins**, fix the doc and log
the task row `!`.

**Flag instead of fixing** when the repair needs a call only the user can make:
source and docs disagree and neither is obviously right · a budget cannot hold what
the doc must say · the fix changes `build-file-map.mjs` output or the carry-forward
key · the fix would drop authored `Does` rows. State the defect and its cost, then
stop.

All three maps are fully authored — 1,309 symbols, no bare `TODO`. A row that is
wrong or too vague to act on is the same defect as a missing one: fix it in place.

## Always

- **Server is authoritative.** The client renders `game_state`; it never computes
  an outcome. Values live in `Game_Config.js`, semantics in the docs.
- **No comments in product source** — the server app and the Godot client, which
  is exactly what `strip-comments.mjs` covers. **`scripts/` and `.github/` keep
  theirs**, and every `SAFETY EXCEPTION` comment lives there; never strip one.
  Explanation belongs in `docs/context/`, which is budgeted and validated.
- **Budgets are tokens, not lines** — `bytes/4`, plus a hard 300-character line
  cap. `node scripts/validate-docs.mjs` enforces both.
- **Regenerate the map after any source edit**: `node scripts/build-file-map.mjs`.
  Line numbers move; the authored `Does` column carries forward by `path#symbol`,
  so regenerating costs one command and no re-authoring.
- **A file over 600 lines is a decomposition candidate** — propose the split,
  don't just do it.
- **Don't commit unless told.**
- Godot executable is in the root folder.

## Delegation (default: off)

Role skills load inline. Subagents are for complex work only, never the default.

Force on: `@deep` in the request.   Force off: `@solo`.

Absent either, delegate only if 2+ hold BEFORE work starts:
- spans 2+ role domains (client+server, or code+infra)
- more than ~4 files in scope
- needs decomposition of a file over 600 lines
- independent branches that can run in parallel
- expected source reads > 25k tokens

Never delegate: single-section edits · context already loaded in this thread ·
ambiguous tasks that need user input mid-flight (agents cannot ask).

If it turns out bigger mid-task: say so and propose escalation. Do not spawn
silently — context already in this thread is usually cheaper than a cold agent.

These five thresholds are **placeholders**. Replace them from the first closed
rollup in the task log, not from an estimate — that file's rollup line carries the
live counts, so do not restate them here.

## On task completion

Append one row to [`report/task-token-cost-effectivity.md`](report/task-token-cost-effectivity.md).
Record `R-est` **before** reading anything. At 20 entries, stop and say the cycle
is full.
