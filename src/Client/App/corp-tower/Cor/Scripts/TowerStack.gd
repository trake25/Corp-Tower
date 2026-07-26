extends Control

const PlayerColors = preload("res://Cor/Scripts/PlayerColors.gd")
const BlockDataScript = preload("res://Cor/Scripts/GameUi/BlockData.gd")
const SnapGridScript = preload("res://Cor/Scripts/GameUi/SnapGrid.gd")
const CollapseSimScript = preload("res://Cor/Scripts/GameUi/CollapseSim.gd")

const COLLAPSE_NONE := 0
const COLLAPSE_LEAN := 1
const COLLAPSE_FALL := 2
const COLLAPSE_SETTLED := 3

const GRID_COLOR := Color(0.9, 0.95, 1.0, 0.9)
const FALLBACK_COLOR := PlayerColors.FALLBACK_COLOR


const SNAP_DOT_COLOR := Color(1.0, 1.0, 1.0, 0.5)
const SNAP_TARGET_HALO_ALPHA := 0.85
const BAND_FILL_COLOR := Color(1.0, 1.0, 1.0, 0.11)
const BAND_EDGE_COLOR := Color(1.0, 1.0, 1.0, 0.4)
const BAND_HEADROOM_UNITS := 2.0
const GHOST_OUTLINE_COLOR := Color(1.0, 1.0, 1.0, 0.7)

@export var brick_unit_size: float = 34.0
@export var top_padding: float = 14.0
@export var bottom_padding: float = 12.0
@export var scroll_start_ratio: float = 0.7
@export var scroll_ease_power: float = 3.0
@export var top_indicator_clearance_units: int = 1
@export var collapse_tilt_deg: float = 34.0
@export var collapse_lean_seconds: float = 0.25
@export var collapse_gravity_units: float = 42.0
@export var collapse_lean_push_units: float = 6.0
@export var collapse_lateral_spread_units: float = 2.2
@export var collapse_drop_kick_units: float = 1.5
@export var collapse_spin_max_deg: float = 260.0
@export var collapse_air_drag: float = 0.55
@export var collapse_restitution: float = 0.24
@export var collapse_floor_friction: float = 0.5
@export var collapse_bounce_min_units: float = 3.0
@export var collapse_max_bounces: int = 1
@export var collapse_flatten_seconds: float = 0.28
@export var collapse_pile_layers: int = 2
@export var collapse_pile_layer_units: float = 0.55
@export var collapse_span_ratio: float = 0.82
@export var tilt_ease_speed: float = 6.0
@export var drop_duration: float = 0.28
@export var snap_radius_units: float = 2.2
@export var snap_dot_radius: float = 3.5
@export var snap_target_radius: float = 8.5
@export var ghost_alpha: float = 0.45
@export var drag_grip_offset_units: float = 1.4
@export var emoji_unit_scale: float = 1.1

signal scroll_offset_changed(pixels: float)

var tower_blocks: Array = []
var current_height: int = 0
var target_height: int = 0
var player_color_map: Dictionary = {}
var tower_stability: int = 100
var tower_tilt_deg: float = 0.0
var displayed_tilt_deg: float = 0.0
var tower_collapsed: bool = false
var _last_scroll_pixels: float = 0.0
var snap_preview_active: bool = false
var drag_cells: Array = []
var drag_shape_id: String = ""
var drag_color: Color = PlayerColors.FALLBACK_COLOR
var active_snap: Dictionary = {}
var _drop_anim_id: String = ""
var _drop_anim_t: float = 0.0
var _drop_fall_units: float = 0.0
var _prev_block_count: int = 0
var mood_threshold: int = BlockDataScript.DEFAULT_MOOD_THRESHOLD
var _collapse_phase: int = COLLAPSE_NONE
var _collapse_lean_elapsed: float = 0.0
var _collapse_sim = null

func _ready() -> void:
	material = BlockDataScript.brick_shader_material()

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		queue_redraw()

func set_tower(blocks: Array, new_current_height: int, new_target_height: int, new_stability: int = 100, diagnostics: Dictionary = {}) -> void:
	var previous_global_height: int = current_height
	tower_blocks = blocks
	current_height = max(0, new_current_height)
	target_height = max(0, new_target_height)
	tower_stability = clampi(new_stability, 0, 100)

	tower_collapsed = bool(diagnostics.get("collapsed", false))
	var reported_tilt: float = float(diagnostics.get("tiltAngleDeg", 0.0))

	if tower_collapsed:
		var lean_sign: float = 1.0 if reported_tilt >= 0.0 else -1.0
		tower_tilt_deg = lean_sign * collapse_tilt_deg

		if _collapse_phase == COLLAPSE_NONE:
			_collapse_phase = COLLAPSE_LEAN
			_collapse_lean_elapsed = 0.0
	else:
		tower_tilt_deg = reported_tilt
		_reset_collapse()

	_maybe_start_drop_animation(previous_global_height)
	_update_scroll_offset()
	queue_redraw()

func refresh_visuals() -> void:
	_update_scroll_offset()
	queue_redraw()

# Driven by debug_config, so moving the slider repaints every standing brick's
# face on the next frame.
func set_mood_threshold(value: int) -> void:
	var resolved: int = maxi(1, value)

	if resolved == mood_threshold:
		return

	mood_threshold = resolved
	queue_redraw()

# Expressed in brick units rather than pixels so the lift that keeps the finger
# off the brick scales with brick_unit_size instead of drifting out of
# proportion whenever the brick size is retuned.
func drag_grip_offset() -> Vector2:
	return Vector2(0.0, -drag_grip_offset_units * _unit_size())

func begin_snap_drag(block: Dictionary, color: Color) -> void:
	drag_cells = block.get("cells", [])
	drag_shape_id = str(block.get("shapeId", ""))
	drag_color = color
	active_snap = {}
	snap_preview_active = false
	queue_redraw()

# Called by InventoryController on every drag-move. `ghost_global_pos` is the
# centre of the dragged brick, not the raw touch point, so the grip offset that
# lifts the brick clear of the finger applies to the snap resolution too.
func resolve_snap(cells: Array, ghost_global_pos: Vector2) -> Dictionary:
	return SnapGridScript.resolve(
		tower_blocks, cells, global_to_grid(ghost_global_pos), snap_radius_units
	)

func set_snap_state(snap: Dictionary) -> void:
	active_snap = snap
	snap_preview_active = bool(snap.get("valid", false))
	queue_redraw()

# Hides the overlay without forgetting the brick being dragged -- the pointer
# leaves and re-enters the drop zone freely during one drag, so tearing down
# the drag state here would lose the ghost for the rest of that drag.
func clear_snap_preview() -> void:
	snap_preview_active = false
	active_snap = {}
	queue_redraw()

func end_snap_drag() -> void:
	drag_cells = []
	drag_shape_id = ""
	clear_snap_preview()

# Lattice <-> pixel transform. Lattice x is a column boundary index and lattice
# y is a height in grid units above the platform, matching SnapGrid. Everything
# that maps between grid and screen space -- brick boxes, snap dots, the drag
# ghost, and cursor hit-testing -- routes through here so there is exactly one
# definition of the transform.
func grid_to_local(lattice: Vector2) -> Vector2:
	var unit: float = _unit_size()

	return _lattice_to_local(
		lattice, unit, size.x * 0.5, size.y - bottom_padding, _scroll_offset_units(unit)
	)

func local_to_grid(local: Vector2) -> Vector2:
	var unit: float = _unit_size()
	var untilted: Vector2 = _untilt(local)

	return Vector2(
		(untilted.x - size.x * 0.5) / unit + SnapGridScript.grid_center_col() + 0.5,
		((size.y - bottom_padding) - untilted.y) / unit + float(_scroll_offset_units(unit))
	)

func global_to_grid(global_pos: Vector2) -> Vector2:
	return local_to_grid(get_global_transform().affine_inverse() * global_pos)

func _lattice_to_local(
	lattice: Vector2, unit: float, base_x: float, baseline: float, scroll_offset_units: int
) -> Vector2:
	return Vector2(
		base_x + (lattice.x - SnapGridScript.grid_center_col() - 0.5) * unit,
		baseline - (lattice.y - float(scroll_offset_units)) * unit
	)

func _tilt_pivot() -> Vector2:
	return Vector2(size.x * 0.5, size.y - bottom_padding)

# The render path leans the whole tower around a bottom-centre pivot whenever
# tower_blocks is non-empty, so a cursor position has to be un-leaned before it
# means anything in grid space -- otherwise aiming at a snap point on a tilted
# tower resolves to the column that point would have had upright.
func _untilt(local: Vector2) -> Vector2:
	if tower_blocks.is_empty() or is_zero_approx(displayed_tilt_deg):
		return local

	var pivot: Vector2 = _tilt_pivot()

	return pivot + (local - pivot).rotated(-deg_to_rad(displayed_tilt_deg))

func _maybe_start_drop_animation(previous_global_height: int) -> void:
	var new_count: int = tower_blocks.size()

	if new_count == _prev_block_count + 1 and new_count > 0:
		var entry: Dictionary = tower_blocks[new_count - 1]
		_drop_anim_id = _entry_block_id(entry)
		_drop_anim_t = 0.0
		_drop_fall_units = _compute_drop_fall_units(entry, previous_global_height)
	elif new_count != _prev_block_count:
		_drop_anim_id = ""

	_prev_block_count = new_count

# spawn = platform top (row 0's bottom edge, height 0) + current tower height
# + 2x the dropped brick's own height, all in the same row/height units the
# rest of this file already uses for origin_y/box_top math.
func _compute_drop_fall_units(entry: Dictionary, previous_global_height: int) -> float:
	var block: Dictionary = _normalize_block_entry(entry)
	var block_height: int = int(block.get("height", 0))
	var bounds: Dictionary = BlockDataScript.cell_bounds(block.get("cells", []))
	var origin_y: int = int(entry.get("originY", entry.get("baseHeight", 0)))
	var landed_top_edge: int = origin_y + bounds.max_y + 1
	var spawn_top_edge: float = float(previous_global_height) + 2.0 * float(block_height)

	return maxf(0.0, spawn_top_edge - float(landed_top_edge))

func _entry_block_id(entry: Dictionary) -> String:
	var block: Variant = entry.get("block", {})
	if typeof(block) == TYPE_DICTIONARY:
		return str(block.get("id", ""))
	return ""

func _drop_ease(t: float) -> float:
	var clamped: float = clampf(t, 0.0, 1.0)
	return 1.0 - pow(1.0 - clamped, 3.0)

func _process(delta: float) -> void:
	var needs_redraw: bool = false

	if absf(displayed_tilt_deg - tower_tilt_deg) > 0.01:
		displayed_tilt_deg = lerpf(displayed_tilt_deg, tower_tilt_deg, minf(1.0, tilt_ease_speed * delta))
		needs_redraw = true

	if _drop_anim_id != "":
		_drop_anim_t += delta / drop_duration
		if _drop_anim_t >= 1.0:
			_drop_anim_t = 1.0
			_drop_anim_id = ""
		needs_redraw = true

	if _collapse_phase == COLLAPSE_LEAN:
		_collapse_lean_elapsed += delta
		if _collapse_lean_elapsed >= collapse_lean_seconds:
			_begin_collapse()
		needs_redraw = true
	elif _collapse_phase == COLLAPSE_FALL and _collapse_sim != null:
		_collapse_sim.step(delta)
		if _collapse_sim.is_settled():
			_collapse_phase = COLLAPSE_SETTLED
		needs_redraw = true

	if needs_redraw:
		queue_redraw()

func set_player_color_map(new_player_color_map: Dictionary) -> void:
	player_color_map = new_player_color_map
	queue_redraw()

func clear_tower() -> void:
	tower_blocks = []
	current_height = 0
	target_height = 0
	_prev_block_count = 0
	_drop_anim_id = ""
	tower_collapsed = false
	_reset_collapse()
	_update_scroll_offset()
	queue_redraw()

func _reset_collapse() -> void:
	_collapse_phase = COLLAPSE_NONE
	_collapse_lean_elapsed = 0.0
	_collapse_sim = null

func _begin_collapse() -> void:
	var unit: float = _unit_size()
	var base_x: float = size.x * 0.5
	var baseline: float = size.y - bottom_padding
	var scroll_px: float = float(_scroll_offset_units(unit)) * unit
	var pivot: Vector2 = _tilt_pivot()
	var lean_rad: float = deg_to_rad(displayed_tilt_deg)
	var top_units: float = maxf(1.0, float(SnapGridScript.top_height(tower_blocks)))
	var seeds: Array = []

	for entry_value in tower_blocks:
		if typeof(entry_value) != TYPE_DICTIONARY:
			continue

		var seed_data: Dictionary = _build_collapse_seed(
			entry_value, unit, base_x, baseline, scroll_px, pivot, lean_rad, top_units
		)

		if !seed_data.is_empty():
			seeds.append(seed_data)

	if seeds.is_empty():
		_collapse_phase = COLLAPSE_SETTLED
		return

	var span_half_width: float = size.x * clampf(collapse_span_ratio, 0.1, 1.0) * 0.5

	_collapse_sim = CollapseSimScript.new()
	_collapse_sim.begin(seeds, {
		"seed": _collapse_seed(),
		"gravity": collapse_gravity_units * unit,
		"lean_sign": 1.0 if displayed_tilt_deg >= 0.0 else -1.0,
		"lean_push": collapse_lean_push_units * unit,
		"lateral_spread": collapse_lateral_spread_units * unit,
		"drop_kick": collapse_drop_kick_units * unit,
		"spin_max": deg_to_rad(collapse_spin_max_deg),
		"air_drag": collapse_air_drag,
		"restitution": collapse_restitution,
		"floor_friction": collapse_floor_friction,
		"bounce_min_speed": collapse_bounce_min_units * unit,
		"max_bounces": collapse_max_bounces,
		"flatten_seconds": collapse_flatten_seconds,
		"floor_y": baseline,
		"span_center": base_x,
		"span_half_width": span_half_width,
		"bucket_width": unit,
		"pile_max_layers": collapse_pile_layers,
		"pile_layer_height": collapse_pile_layer_units * unit
	})
	_collapse_phase = COLLAPSE_FALL

func _build_collapse_seed(
	entry: Dictionary,
	unit: float,
	base_x: float,
	baseline: float,
	scroll_px: float,
	pivot: Vector2,
	lean_rad: float,
	top_units: float
) -> Dictionary:
	var block: Dictionary = _normalize_block_entry(entry)
	var cells: Array = block.get("cells", [])

	if cells.is_empty():
		return {}

	var shape_id: String = str(block.get("shapeId", ""))
	var origin_x: int = int(entry.get("originX", 0))
	var origin_y: int = int(entry.get("originY", entry.get("baseHeight", 0)))
	var box: Rect2 = _footprint_box(origin_x, origin_y, cells, unit, base_x, baseline, 0)
	var center: Vector2 = box.position + box.size * 0.5
	var leaned: Vector2 = pivot + (center + Vector2(0.0, scroll_px) - pivot).rotated(lean_rad)
	var bounds: Dictionary = BlockDataScript.cell_bounds(cells)
	var center_units: float = float(origin_y) + (float(bounds.min_y) + float(bounds.max_y) + 1.0) * 0.5
	var texture: Texture2D = BlockDataScript.brick_texture(shape_id)
	var quad_size: Vector2 = box.size
	var rotation_steps: int = 0

	if texture != null:
		rotation_steps = BlockDataScript.detect_rotation_steps(shape_id, cells)
		var canonical_bounds: Dictionary = BlockDataScript.cell_bounds(
			BlockDataScript.BRICK_SHAPES[shape_id]
		)
		quad_size = Vector2(
			float(canonical_bounds.max_x - canonical_bounds.min_x + 1) * unit,
			float(canonical_bounds.max_y - canonical_bounds.min_y + 1) * unit
		)

	var emoji_texture: Texture2D = null
	var emoji_offset: Vector2 = Vector2.ZERO

	if entry.has(BlockDataScript.BALANCE_DELTA_KEY):
		var mood: String = BlockDataScript.emoji_mood_for_delta(
			int(entry.get(BlockDataScript.BALANCE_DELTA_KEY, 0)), mood_threshold
		)
		emoji_texture = BlockDataScript.emoji_texture(mood)

		var anchor: Vector2 = BlockDataScript.emoji_anchor(cells)
		emoji_offset = _lattice_to_local(
			Vector2(float(origin_x) + anchor.x, float(origin_y) + anchor.y),
			unit,
			base_x,
			baseline,
			0
		) - center

	return {
		"pos": leaned - Vector2(0.0, scroll_px),
		"angle": lean_rad,
		"height_ratio": clampf(center_units / top_units, 0.0, 1.0),
		"footprint": box.size,
		"quad_size": quad_size,
		"rotation_steps": rotation_steps,
		"texture": texture,
		"color": _player_color(entry),
		"emoji_texture": emoji_texture,
		"emoji_offset": emoji_offset
	}

func _collapse_seed() -> int:
	var key: String = ""

	for entry_value in tower_blocks:
		if typeof(entry_value) != TYPE_DICTIONARY:
			continue

		key += _entry_block_id(entry_value) + "|"

	return key.hash()

func _draw_debris(unit: float) -> void:
	if _collapse_sim == null:
		return

	var scroll_px: float = float(_scroll_offset_units(unit)) * unit
	var uvs: PackedVector2Array = BlockDataScript.brick_quad_uvs()
	var emoji_size: Vector2 = Vector2.ONE * unit * emoji_unit_scale

	for piece_value in _collapse_sim.pieces:
		var piece: Dictionary = piece_value
		var screen_pos: Vector2 = piece.pos + Vector2(0.0, scroll_px)
		var radius: float = float(piece.half_extent) * 1.5

		if !_is_rect_visible(
			Rect2(screen_pos - Vector2(radius, radius), Vector2(radius * 2.0, radius * 2.0))
		):
			continue

		var color: Color = piece.color
		var texture: Texture2D = piece.texture

		draw_set_transform(screen_pos, float(piece.angle), Vector2.ONE)

		if texture == null:
			_draw_fallback_block(Vector2.ZERO, piece.footprint, color)
		else:
			draw_primitive(
				BlockDataScript.brick_quad_points(
					Vector2.ZERO, piece.quad_size, int(piece.rotation_steps)
				),
				PackedColorArray([color, color, color, color]),
				uvs,
				texture
			)

		var emoji_texture: Texture2D = piece.emoji_texture

		if emoji_texture != null:
			draw_texture_rect(
				emoji_texture, Rect2(piece.emoji_offset - emoji_size * 0.5, emoji_size), false
			)

	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func _update_scroll_offset() -> void:
	var unit: float = _unit_size()
	var scroll_pixels: float = float(_scroll_offset_units(unit)) * unit

	if is_equal_approx(scroll_pixels, _last_scroll_pixels):
		return

	_last_scroll_pixels = scroll_pixels
	scroll_offset_changed.emit(scroll_pixels)

func _draw() -> void:
	var unit: float = _unit_size()
	var base_x: float = size.x * 0.5
	var baseline: float = size.y - bottom_padding

	if _collapse_phase == COLLAPSE_FALL or _collapse_phase == COLLAPSE_SETTLED:
		_draw_debris(unit)
		return

	if tower_blocks.is_empty():
		_draw_fallback_stack()
		_draw_snap_layer(unit, base_x, baseline, Vector2.ZERO)
		return

	var scroll_offset_units: int = _scroll_offset_units(unit)
	var tower_units: int = max(target_height, current_height, 1)

	var pivot: Vector2 = Vector2(base_x, baseline)
	draw_set_transform(pivot, deg_to_rad(displayed_tilt_deg), Vector2.ONE)

	for i in range(tower_blocks.size()):
		var entry: Dictionary = tower_blocks[i]
		var block: Dictionary = _normalize_block_entry(entry)
		var cells: Array = block.get("cells", [])
		var shape_id: String = str(block.get("shapeId", ""))
		var base_height: int = int(entry.get("originY", entry.get("baseHeight", 0)))
		var origin_x: int = int(entry.get("originX", 0))
		var color: Color = _player_color(entry)

		var drop_offset: float = 0.0
		if _drop_anim_id != "" and _entry_block_id(entry) == _drop_anim_id:
			drop_offset = (1.0 - _drop_ease(_drop_anim_t)) * _drop_fall_units

		var box_rect: Rect2 = _footprint_box(origin_x, base_height, cells, unit, base_x, baseline, scroll_offset_units, drop_offset)

		if !_is_rect_visible(box_rect):
			continue

		var center: Vector2 = box_rect.position + box_rect.size * 0.5 - pivot
		var texture: Texture2D = BlockDataScript.brick_texture(shape_id)

		if texture == null:
			_draw_fallback_block(center, box_rect.size, color)
		else:
			var rotation_steps: int = BlockDataScript.detect_rotation_steps(shape_id, cells)
			var canonical_bounds: Dictionary = BlockDataScript.cell_bounds(BlockDataScript.BRICK_SHAPES[shape_id])
			var canonical_size: Vector2 = Vector2(
				float(canonical_bounds.max_x - canonical_bounds.min_x + 1) * unit,
				float(canonical_bounds.max_y - canonical_bounds.min_y + 1) * unit
			)
			var points: PackedVector2Array = BlockDataScript.brick_quad_points(center, canonical_size, rotation_steps)
			var colors := PackedColorArray([color, color, color, color])

			draw_primitive(points, colors, BlockDataScript.brick_quad_uvs(), texture)

		_draw_block_emoji(
			entry, cells, origin_x, base_height, unit, base_x, baseline, scroll_offset_units, drop_offset, pivot
		)

	_draw_snap_layer(unit, base_x, baseline, pivot)

	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

	if current_height > tower_units:
		_draw_fallback_stack()

# The server stamps the mood on the entry at placement time, so a brick's face
# is fixed for the rest of the level and survives a rebroadcast or reconnect.
# Drawn inside the same transform block as the brick it belongs to, so it
# inherits the tower's lean and scroll; the face itself is never rotated to
# match the brick texture's rotation, since an upside-down smile reads as a
# frown. Only placed bricks get one -- the drag ghost and the inventory/team
# previews have no stability outcome yet.
func _draw_block_emoji(
	entry: Dictionary,
	cells: Array,
	origin_x: int,
	origin_y: int,
	unit: float,
	base_x: float,
	baseline: float,
	scroll_offset_units: int,
	drop_offset: float,
	pivot: Vector2
) -> void:
	if cells.is_empty():
		return

	# No face at all rather than a neutral one when the server sent no delta (a
	# pre-emoji build or a room hydrated from an older snapshot). A neutral face
	# is indistinguishable from a real "barely moved" verdict, which makes a
	# missing field look like a working feature that ignores its own tuning.
	if not entry.has(BlockDataScript.BALANCE_DELTA_KEY):
		return

	var mood: String = BlockDataScript.emoji_mood_for_delta(
		int(entry.get(BlockDataScript.BALANCE_DELTA_KEY, 0)), mood_threshold
	)
	var texture: Texture2D = BlockDataScript.emoji_texture(mood)

	if texture == null:
		return

	var anchor: Vector2 = BlockDataScript.emoji_anchor(cells)
	var center: Vector2 = _lattice_to_local(
		Vector2(float(origin_x) + anchor.x, float(origin_y) + anchor.y + drop_offset),
		unit,
		base_x,
		baseline,
		scroll_offset_units
	) - pivot
	var box_size: Vector2 = Vector2.ONE * unit * emoji_unit_scale

	draw_texture_rect(texture, Rect2(center - box_size * 0.5, box_size), false)

# Computes the on-screen box for a footprint resting at (origin_x, origin_y)
# in grid units -- shared by the main render loop and the snap-point overlay
# so both use the exact same pixel<->grid transform.
func _footprint_box(origin_x: int, origin_y: int, cells: Array, unit: float, base_x: float, baseline: float, scroll_offset_units: int, drop_offset: float = 0.0) -> Rect2:
	var bounds: Dictionary = BlockDataScript.cell_bounds(cells)
	var width_units: int = bounds.max_x - bounds.min_x + 1
	var height_units: int = bounds.max_y - bounds.min_y + 1
	var y_max_units: int = origin_y + bounds.max_y

	var top_left: Vector2 = _lattice_to_local(
		Vector2(float(origin_x + bounds.min_x), float(y_max_units + 1) + drop_offset),
		unit,
		base_x,
		baseline,
		scroll_offset_units
	)

	return Rect2(top_left, Vector2(float(width_units) * unit, float(height_units) * unit))

func _height_to_pixel_y(height_units: float, unit: float, baseline: float, scroll_offset_units: int) -> float:
	return _lattice_to_local(Vector2(0.0, height_units), unit, 0.0, baseline, scroll_offset_units).y

# The whole drag overlay: the placeable-column band behind everything, the
# docked landing ghost, then the snap points with the active target picked out.
# `pivot` must match whatever `draw_set_transform` is currently active (the tilt
# pivot when tower_blocks is non-empty, Vector2.ZERO when it's untransformed)
# since draw calls made under a transform are automatically offset by it.
func _draw_snap_layer(unit: float, base_x: float, baseline: float, pivot: Vector2) -> void:
	if !snap_preview_active:
		return

	var scroll_offset_units: int = _scroll_offset_units(unit)

	_draw_placeable_band(unit, base_x, baseline, scroll_offset_units, pivot, _band_top_units())
	_draw_drag_ghost(unit, base_x, baseline, scroll_offset_units, pivot)
	_draw_snap_points(unit, base_x, baseline, scroll_offset_units, pivot)

# The band exists to show which columns are legal, so it only needs to cover the
# build zone plus a little headroom. Running it the full height of the control
# turns it into two stray lines up through the sky.
func _band_top_units() -> float:
	var top_units: float = float(SnapGridScript.top_height(tower_blocks))

	if !drag_cells.is_empty():
		var bounds: Dictionary = BlockDataScript.cell_bounds(drag_cells)
		var ghost_top: int = int(active_snap.get("origin_y", 0)) + bounds.max_y + 1
		top_units = maxf(top_units, float(ghost_top))

	return top_units + BAND_HEADROOM_UNITS

func _draw_placeable_band(
	unit: float,
	base_x: float,
	baseline: float,
	scroll_offset_units: int,
	pivot: Vector2,
	top_units: float
) -> void:
	var left: float = _lattice_to_local(
		Vector2(float(SnapGridScript.placeable_column_min), 0.0), unit, base_x, baseline, scroll_offset_units
	).x
	var right: float = _lattice_to_local(
		Vector2(float(SnapGridScript.placeable_column_max + 1), 0.0), unit, base_x, baseline, scroll_offset_units
	).x
	var bottom: float = minf(
		_height_to_pixel_y(0.0, unit, baseline, scroll_offset_units), size.y
	)
	var top: float = maxf(
		_height_to_pixel_y(top_units, unit, baseline, scroll_offset_units), 0.0
	)

	if bottom <= top:
		return

	draw_rect(
		Rect2(Vector2(left, top) - pivot, Vector2(right - left, bottom - top)),
		BAND_FILL_COLOR,
		true
	)
	draw_line(Vector2(left, top) - pivot, Vector2(left, bottom) - pivot, BAND_EDGE_COLOR, 2.0)
	draw_line(Vector2(right, top) - pivot, Vector2(right, bottom) - pivot, BAND_EDGE_COLOR, 2.0)

# The ghost is emitted inside the same transform block as the placed bricks, so
# it inherits the tilt, the scroll offset and brick_unit_size and can never
# drift out of alignment with the tower it is docking onto.
func _draw_drag_ghost(
	unit: float,
	base_x: float,
	baseline: float,
	scroll_offset_units: int,
	pivot: Vector2
) -> void:
	if drag_cells.is_empty():
		return

	var column: int = int(active_snap.get("column", SnapGridScript.placeable_column_min))
	var origin_y: int = int(active_snap.get("origin_y", 0))
	var box: Rect2 = _footprint_box(
		column, origin_y, drag_cells, unit, base_x, baseline, scroll_offset_units
	)
	var fill: Color = Color(drag_color.r, drag_color.g, drag_color.b, ghost_alpha)
	var texture: Texture2D = BlockDataScript.brick_texture(drag_shape_id)

	if texture == null:
		draw_rect(Rect2(box.position - pivot, box.size), fill, true)
	else:
		var center: Vector2 = box.position + box.size * 0.5 - pivot
		var rotation_steps: int = BlockDataScript.detect_rotation_steps(drag_shape_id, drag_cells)
		var canonical_bounds: Dictionary = BlockDataScript.cell_bounds(
			BlockDataScript.BRICK_SHAPES[drag_shape_id]
		)
		var canonical_size: Vector2 = Vector2(
			float(canonical_bounds.max_x - canonical_bounds.min_x + 1) * unit,
			float(canonical_bounds.max_y - canonical_bounds.min_y + 1) * unit
		)
		var points: PackedVector2Array = BlockDataScript.brick_quad_points(
			center, canonical_size, rotation_steps
		)
		var colors := PackedColorArray([fill, fill, fill, fill])

		draw_primitive(points, colors, BlockDataScript.brick_quad_uvs(), texture)

	for cell in drag_cells:
		var cell_top_left: Vector2 = _lattice_to_local(
			Vector2(
				float(column + SnapGridScript.cell_x(cell)),
				float(origin_y + SnapGridScript.cell_y(cell) + 1)
			),
			unit,
			base_x,
			baseline,
			scroll_offset_units
		)

		draw_rect(
			Rect2(cell_top_left - pivot, Vector2(unit, unit)), GHOST_OUTLINE_COLOR, false, 1.5
		)

# Drawn from SnapGrid's own point set, so every dot the player sees is a point
# the resolver actually considers -- the two used to be computed independently.
func _draw_snap_points(
	unit: float, base_x: float, baseline: float, scroll_offset_units: int, pivot: Vector2
) -> void:
	var snapped: bool = bool(active_snap.get("snapped", false))
	var target_point: Vector2i = active_snap.get("target_point", Vector2i.ZERO)
	var halo: Color = Color(drag_color.r, drag_color.g, drag_color.b, SNAP_TARGET_HALO_ALPHA)

	for point in SnapGridScript.tower_snap_points(tower_blocks):
		var local: Vector2 = _lattice_to_local(
			Vector2(point), unit, base_x, baseline, scroll_offset_units
		) - pivot

		if snapped and point == target_point:
			draw_arc(local, snap_target_radius, 0.0, TAU, 24, halo, 2.5, true)
			draw_circle(local, snap_dot_radius + 1.0, halo)
		else:
			draw_arc(local, snap_dot_radius, 0.0, TAU, 16, SNAP_DOT_COLOR, 1.5, true)

func _draw_fallback_block(center: Vector2, box_size: Vector2, color: Color) -> void:
	var rect: Rect2 = Rect2(center - box_size * 0.5, box_size)
	draw_rect(rect, color, true)
	draw_rect(rect, GRID_COLOR, false, 1.5)

func _draw_fallback_stack() -> void:
	if current_height <= 0:
		return

	var unit: float = _unit_size()
	var width: float = clamp(size.x * 0.24, unit * 1.5, unit * 3.5)
	var x: float = (size.x - width) * 0.5
	var baseline: float = size.y - bottom_padding
	var scroll_offset_units: int = _scroll_offset_units(unit)

	for y in range(current_height):
		var rect: Rect2 = Rect2(
			Vector2(x, baseline - float(y + 1 - scroll_offset_units) * unit),
			Vector2(width, unit)
		)

		if !_is_rect_visible(rect):
			continue

		draw_rect(rect, FALLBACK_COLOR, true)
		draw_rect(rect, GRID_COLOR, false, 1.0)

func _unit_size() -> float:
	return brick_unit_size

func _scroll_offset_units(unit: float) -> int:
	var visible_units: int = _visible_unit_capacity(unit)
	var start_units: int = max(1, int(floor(float(visible_units) * scroll_start_ratio)))
	var flush_units: int = max(start_units, visible_units - top_indicator_clearance_units)

	# A target that already fits under the Top Indicator needs no camera move at
	# all -- panning a tower that was never going off-screen just drags the
	# ground away from under it for no reason.
	if target_height > 0 and target_height <= flush_units:
		return 0

	var focus_height: int = max(current_height, 1)

	if target_height > 0:
		focus_height = min(focus_height, target_height)

	if focus_height <= start_units:
		return 0

	var linear_t: float = 1.0
	if target_height > start_units:
		linear_t = clampf(float(focus_height - start_units) / float(target_height - start_units), 0.0, 1.0)

	var ramp_t: float = pow(linear_t, scroll_ease_power)
	var top_row: float = lerpf(float(start_units), float(flush_units), ramp_t)
	return int(round(float(focus_height) - top_row))

func _visible_unit_capacity(unit: float) -> int:
	var available_height: float = max(1.0, size.y - top_padding - bottom_padding)
	return max(1, int(floor(available_height / unit)))

func _is_rect_visible(rect: Rect2) -> bool:
	var bottom_limit: float = size.y

	if get_parent() is Control:
		bottom_limit = maxf(bottom_limit, get_parent().size.y - position.y)

	return (
		rect.position.y + rect.size.y >= 0.0 &&
		rect.position.y <= bottom_limit &&
		rect.position.x + rect.size.x >= 0.0 &&
		rect.position.x <= size.x
	)

func _normalize_block_entry(entry: Dictionary) -> Dictionary:
	return SnapGridScript.entry_block(entry)

func _player_color(entry: Dictionary) -> Color:
	var player_id: String = str(entry.get("playerId", entry.get("player_id", "")))

	if player_color_map.has(player_id):
		return player_color_map[player_id]

	return PlayerColors.color_for_player_id(player_id)
