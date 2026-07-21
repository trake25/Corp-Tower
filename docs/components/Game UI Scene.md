# Game UI Scene

## Purpose
The single Godot scene hosting every HUD/debug node the main gameplay
controller binds against. File:
`src/Client/App/corp-tower/Cor/Scenes/GameUI.tscn`, themed by
`Cor/Themes/GameUITheme.tres`. Required at runtime — [[Screen Manager]]
instances it dynamically once a match is found, and [[Main UI Controller]]
binds its required nodes at that point to function at all.

## Responsibilities
- Provide the required node contract [[Main UI Controller]] binds against.
- Host HUD, inventory, radial cooldown overlays, quick-chat controls, Power
  target/inventory and quest-label nodes, draw-pile preview, tower, tower
  drop zone, drag preview, score, summary, and tabbed debug overlay nodes.

## Public interface
Not code — the "interface" is the node-name contract [[Main UI Controller]]
expects to find and bind when it loads. The two required drag nodes:

- `TowerDropZone` — full-rect control over the tower track, used to validate
  a drag release position.
- `DragPreview` — hidden [[Block Preview]] instance shown while dragging an
  inventory block.

## Depends on
- Internal: [[Block Preview]], [[Tower Stack]], [[Cooldown Overlay]],
  [[Debug Overlay]] (all instanced as nodes within this scene)
- External: none

## Notes
- This scene used to be one of two swappable "skins" (`DefaultSkin.tscn` /
  `Figma_SkinV1.tscn`), picked at runtime through a skin-picker overlay. Both
  were UI prototypes; the runtime skin system, the picker overlay, and the
  Figma variant were removed ahead of the production UI design pass, leaving
  this one scene as the only gameplay UI — there is no `ProjectSettings`
  skin preference or skin-picker node group to keep in sync anymore. It is
  now instanced dynamically by [[Screen Manager]] (created when a match is
  found, freed when the room closes) rather than being a static child of
  `Main.tscn`.
- The `.tres` theme resource defines the shared `theme_type_variation`
  styles used across the scene (e.g. `ActionButton`, `CircleButtonPanel`,
  `HudPanel`, `WhiteCardButton`, `TopBarFramePanel`/`TopBarTrackPanel`,
  `TowerFillPanel`/`TowerTrackPanel`) — most per-node fine-tuning is still
  inline `theme_override_*` properties on individual scene nodes.
- The four [[Popover Panel]] instances each override their `Card` node with an
  explicit `custom_minimum_size` that fixes the popover's design footprint —
  `260x163` for `TeamInventoryPopover`, `ChatPopover`, and `PowerPopover`, and
  `260x140` for `QuestPopover`. This is the authored source of the fixed card
  size that `get_card_size()` returns at runtime; changing a popover's design
  size means editing that node here.
- Non-interactive nodes positioned over/near a tappable control (buttons,
  the Power/team-inventory triggers, etc.) must set `mouse_filter = 2`
  (ignore); Godot's default `mouse_filter = 0` (stop) makes a Control
  swallow touches even when it draws nothing there. `ImpactTrack` (the
  [[Impact Bar]] column) overlaps ~80% of the `PowerTrigger` tap area and
  was missing this, making the Power icon tap inconsistent until fixed —
  check new overlay/decorative nodes against nearby interactive controls
  before assuming the default filter is harmless.
