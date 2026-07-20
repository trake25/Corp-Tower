# Popover Panel

## Purpose
Reusable anchored card component (title, rule, list of rows) used for every
tap-triggered popover in the play screen. File:
`src/Client/App/corp-tower/Cor/Scripts/PopoverPanel.gd`, scene
`Cor/Scenes/PopoverPanel.tscn`.

## Responsibilities
- Render a title + rule + vertical list of rows inside an anchored card.
- Auto-close after `auto_close_seconds` (default 4s), on tap/touch outside
  the card (via a full-screen `OutsideCatcher`), or when the owner explicitly
  closes it (e.g. on drag start — see [[Main UI Controller]]).
- Stay non-blocking — it never pauses gameplay underneath it.

## Public interface
- `set_title(text: String)`, `clear_rows()`.
- `add_row(text: String) -> Label` — plain text row.
- `add_action_row(text: String, on_pressed: Callable) -> Button` — tappable
  row.
- `add_icon_row(icon: Control, text: String) -> HBoxContainer` — icon + text
  row (used for the Team Inventory "next brick" preview).
- `open()` / `close()`, `dismissed` signal.
- `get_card_size() -> Vector2` — the card's content-driven size
  (`get_combined_minimum_size()` floored by `custom_minimum_size`, valid
  synchronously right after rows are added).
- `set_card_global_position(target: Vector2)` — resets the card's anchors to
  top-left, sets an explicit size, and places its top-left at `target` clamped
  to the popover's visible rect. Callers ([[Main UI Controller]]'s
  `position_shared_popover_card()` and `QuestController`'s
  `position_quest_popover_card()`) compute `target` from the trigger's live
  `get_global_rect()` so the card tracks the trigger instead of the viewport
  edge. **Still not fully correct on device** — see the note below.
- Each new row after the first gets an `HSeparator` inserted above it — rows
  are added to the tree before the separator is positioned via
  `move_child()`, since Godot requires a node to already be a child before it
  can be reordered.

## Depends on
- Internal: none (rows/icons are handed to it fully built by the caller)
- External: none

## Notes
- There are two instances in [[Game UI Scene]], not four, even though there
  are four popover triggers: `TeamInventoryPopover` is shared by Team
  Inventory, Quick Chat, and Power (its `Card` anchors bottom-right, near the
  three bottom-row trigger buttons; [[Main UI Controller]] swaps
  title/rows per open call), and `QuestPopover` is a separate instance
  anchored top-left next to the Quest chip, since that trigger lives in a
  different screen location. Only one popover is ever open at a time,
  tracked by [[Main UI Controller]]'s `active_popover`.
- Opening any popover closes whichever one is currently active first
  (`PopoverCoordinator.close_active()`), so switching triggers can't leave two
  cards open. Starting a block drag also closes the active popover, so a popover
  can't eat the first drag input of a 30-second round.
- All four triggers toggle: tapping a trigger while its own popover is
  already open closes it instead of reopening (resetting the auto-close
  timer). Each opener guards this with the popover's current `.visible` state
  via `PopoverCoordinator.is_open(popover, mode)`, not just last-known
  bookkeeping (`active_popover` + `shared_popover_mode` for the shared
  `TeamInventoryPopover`, `active_popover` alone for `QuestPopover`) — `close()`
  can fire asynchronously from the auto-close timer or an outside tap without
  the trigger's owner finding out synchronously, so checking `.visible` is
  what keeps a stale "already open" read from silently swallowing the next
  tap instead of reopening the popover.
- **Open bug (WebGL + Android, not the editor): popover cards still land at the
  wrong position/size on device.** Runtime positioning was added
  (`set_card_global_position`, driven from the trigger's `get_global_rect()`),
  which fixed the editor and the GUT layout tests but has not resolved the
  on-device symptom. The editor runs at exactly the 412×917 design size — the
  one size where the authored layout is already correct — so it cannot
  reproduce the failure; a deployed WebGL build or an Android build is required
  to see ground truth. Full diagnosis, what has already been tried, and the
  next steps are in the hand-off plan `TOD20260720-01.md`.
- Team Inventory's rows are the one case using `add_icon_row`: when
  `last_draw_pile_count > 0` and a next block exists, an `add_icon_row` shows
  a `BlockPreview` instance (tinted with the same `DRAW_PILE_COLOR` as the
  HUD's draw-pile preview, attached via `set_script`/`set("cell_color", ...)`
  at runtime rather than a scene-authored node) next to the plain label "Next
  brick" — the shape alone conveys which block, no shape-id text. Below it, a
  centered `add_row` reads "`<n>` Remaining bricks". When the pile is empty,
  only that count row renders (reading "0") — there is no separate "no
  bricks" row, since that would just repeat what the count already says.
