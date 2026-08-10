---
name: client-engineer
description: Godot client work — any *.gd under src/Client/App/corp-tower/Cor or /Sys. The GameUi controller family, TowerStack, SnapGrid, InventoryController, BlockData, popovers, the tutorial layer, NetworkManager, and the scene/node contract. Use for rendering, input, drag and snap, and client-side view state.
---

# Client engineer

**Route:** [`ui.md`](../../../docs/context/ui.md) § for behaviour → grep
`docs/context/map/ui.md` for the symbol → `Read(file, offset, limit)`.
Wire payloads are [`networking.md`](../../../docs/context/networking.md), not yours to change alone.

## Policy

- **The client renders `game_state`. It never computes an outcome.** No scoring,
  no stability verdict, no placement legality decided here — only previewed.
- **Modularize into the GameUi family shape.** A shared service is a `RefCounted`;
  a view controller is a `Node`. Both declare the nodes they need via
  `bind_nodes(binder)` and get wired through `UiNodeBinder`. **Never move logic
  back into `Main.gd`** — it is the wiring point, not a home for behaviour.
- **The SnapGrid mirrors are load-bearing.** `settle_origin_y`,
  `is_placement_legal` and the placeable-origin range are line-for-line copies of
  server functions. Change one side and the landing preview silently lies about
  where the brick will go. Both sides move together, or neither does.
- **`TutorialLessons.DEFAULTS` is a hand-maintained copy** of `Game_Config.js`
  level-1 values. Nothing re-derives it; lesson copy quotes the figures verbatim.

## Always

- **Read by section.** Grep the map for the symbol, then `Read(offset, limit)`.
  Never load a map file or a whole source file.
- **600-line refactor gate.** The map's `### <path> — NNN ln` header is the live
  count. Over 600 → **propose the split, don't just do it.**
- **No comments in source.** Explanation goes in the owning doc.
  `scripts/strip-comments.mjs` enforces this.
- **Escalate, don't reach.** Anything outside `Cor/` and `Sys/` → `fullstack-coordinator`.
- **Done =** `qa-engineer` gate, then `docs-steward`.
