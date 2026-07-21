# Popover Panel

## Purpose
Reusable anchored card component (title, rule, list of rows) used for every
tap-triggered popover in the play screen. File:
`src/Client/App/corp-tower/Cor/Scripts/PopoverPanel.gd`, scene
`Cor/Scenes/PopoverPanel.tscn`.

## Responsibilities
- Render a title + rule + vertical list of rows inside an anchored card.
- Auto-close after `auto_close_seconds` (default 4s), on tap/touch outside
  the card (via a full-screen `OutsideCatcher`, ignoring presses for
  `OUTSIDE_TAP_GRACE_MS` after `open()` — see Notes), or when the owner
  explicitly closes it (e.g. on drag start — see [[Main UI Controller]]).
- Stay non-blocking — it never pauses gameplay underneath it.

## Public interface
- `set_title(text: String)`, `clear_rows()`.
- `add_row(text: String) -> Label` — plain text row. Single-line: autowrap is
  off and `clip_text` is on, so overflowing text is clipped horizontally
  inside the fixed card rather than wrapping to extra lines and growing it.
- `add_action_row(text: String, on_pressed: Callable) -> Button` — tappable
  row (same single-line `clip_text` treatment as `add_row`).
- `add_icon_row(icon: Control, text: String) -> HBoxContainer` — icon + text
  row (used for the Team Inventory "next brick" preview).
- `open()` / `close()`, `dismissed` signal.
- `get_card_size() -> Vector2` — `get_combined_minimum_size()` floored by the
  card's `custom_minimum_size`, valid synchronously right after rows are
  added. Each popover instance sets an explicit design-size
  `custom_minimum_size` in [[Game UI Scene]] — `260x163` for the three
  bottom-row popovers and `260x140` for Quest — so this returns that fixed
  size for the common (short) content instead of a smaller content-only box.
  Combined with single-line `clip_text` rows, long text can't inflate it
  either, so the card holds its design footprint in both directions.
- `set_card_global_position(target: Vector2)` — resets the card's anchors to
  top-left, sets an explicit size, and places its top-left at `target` clamped
  to the popover's visible rect. Each controller computes `target` from its
  own trigger's live `get_global_rect()` so the card tracks that trigger
  instead of the viewport edge: [[Main UI Controller]]'s
  `position_team_inventory_popover_card()`, `QuestController`'s
  `position_quest_popover_card()`, `QuickChatController`'s
  `position_chat_popover_card()`, and `PowerController`'s
  `position_power_popover_card()`. The three bottom-row popovers share a
  bottom-edge baseline: each sits at `trigger.y - 13 - card_height`, so their
  now-equal fixed height lands their bottom edges on the same y (they differ
  only in x, per trigger). Quest anchors top-left off its chip instead.
- Each new row after the first gets an `HSeparator` inserted above it — rows
  are added to the tree before the separator is positioned via
  `move_child()`, since Godot requires a node to already be a child before it
  can be reordered.

## Depends on
- Internal: none (rows/icons are handed to it fully built by the caller)
- External: none

## Notes
- There are four instances in [[Game UI Scene]], one per trigger:
  `TeamInventoryPopover`, `ChatPopover`, `PowerPopover` (all anchored
  bottom-right near the bottom-row trigger buttons), and `QuestPopover`
  (anchored top-left next to the Quest chip, since that trigger lives in a
  different screen location). Each was previously borrowed —
  `TeamInventoryPopover` doubled as the Chat and Power popover, with a
  `shared_popover_mode` string tracking which — until each got its own
  instance, so Team Inventory's popover no longer opens at Power's position
  when Power is tapped. Only one popover is ever open at a time, tracked by
  [[Main UI Controller]]'s `active_popover`.
- Opening any popover closes whichever one is currently active first
  (`PopoverCoordinator.close_active()`), so switching triggers can't leave two
  cards open. Starting a block drag also closes the active popover, so a popover
  can't eat the first drag input of a 30-second round.
- All four triggers toggle: tapping a trigger while its own popover is
  already open closes it instead of reopening (resetting the auto-close
  timer). Each opener guards this with the popover's current `.visible` state
  via `PopoverCoordinator.is_open(popover)` — not just last-known
  `active_popover` bookkeeping — since `close()` can fire asynchronously from
  the auto-close timer or an outside tap without the trigger's owner finding
  out synchronously, so checking `.visible` is what keeps a stale
  "already open" read from silently swallowing the next tap instead of
  reopening the popover.
- **Fixed: same-tap self-close race (Android + WebGL).** `OutsideCatcher` is a
  full-screen `mouse_filter=STOP` Control, so once a popover is open it covers
  the trigger's own screen position too. Every physical tap on Android/WebGL
  produces both a real input event and an emulated partner
  (`emulate_mouse_from_touch`, on in `project.godot`); the trigger's `.pressed`
  signal consumes one of the pair to open the popover, and the other one then
  landed on the freshly-visible `OutsideCatcher` and closed it again on the
  same tap — a timing-dependent race, hence "tap it repeatedly and it opens
  only sometimes." `open()` now stamps `opened_at_ms`, and
  `_on_outside_catcher_gui_input` ignores presses within
  `OUTSIDE_TAP_GRACE_MS` (250ms) of that stamp, swallowing the emulated
  partner without eating a genuine outside tap to dismiss (that gesture just
  needs to land after the grace window). Doesn't affect toggle-close
  (re-tapping the same trigger) or switching triggers — both call `close()`
  directly, bypassing `OutsideCatcher`.
- **Card size (fixed at the source; on-device verification pending).** The
  cards used to size themselves purely from content: the base `Card` floored
  only width (`custom_minimum_size = (260, 0)`), leaving height floored at 0.
  Chat happened to measure ~163 and looked right, but Team Inventory and Power
  measured shorter and — because the y-anchor is `trigger.y - 13 - card_height`
  — their bottom edges drifted off Chat's baseline, while a wrapped long Quest
  label grew that card past its 140 design height. Fixed by giving each popover
  `Card` an explicit design-size `custom_minimum_size` (`260x163` bottom row,
  `260x140` Quest) so `get_card_size()` returns the design size, plus switching
  rows to single-line `clip_text` so long text is clipped horizontally instead
  of inflating the card. Runtime positioning (`set_card_global_position`, driven
  from the trigger's `get_global_rect()`) was already in place and unchanged.
  The editor and GUT layout tests confirm the sizes and shared baseline, but
  the editor only runs at the 412×917 design size, so a deployed WebGL or
  Android build is still required to confirm the on-device symptom is resolved.
- Team Inventory's rows are the one case using `add_icon_row`: when
  `last_draw_pile_count > 0` and a next block exists, an `add_icon_row` shows
  a `BlockPreview` instance (tinted with the same `DRAW_PILE_COLOR` as the
  HUD's draw-pile preview, attached via `set_script`/`set("cell_color", ...)`
  at runtime rather than a scene-authored node) next to the plain label "Next
  brick" — the shape alone conveys which block, no shape-id text. Below it, a
  centered `add_row` reads "`<n>` Remaining bricks". When the pile is empty,
  only that count row renders (reading "0") — there is no separate "no
  bricks" row, since that would just repeat what the count already says.
