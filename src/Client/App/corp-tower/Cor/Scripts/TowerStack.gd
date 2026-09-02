extends Control

const PlayerColors = preload("res://Cor/Scripts/PlayerColors.gd")
const BlockDataScript = preload("res://Cor/Scripts/GameUi/BlockData.gd")
const SnapGridScript = preload("res://Cor/Scripts/GameUi/SnapGrid.gd")
const CollapseSimScript = preload("res://Cor/Scripts/GameUi/CollapseSim.gd")
const StructuralPoseScript = preload("res://Cor/Scripts/GameUi/StructuralPose.gd")
const PlacementProjectionScript = preload("res://Cor/Scripts/GameUi/PlacementProjection.gd")
const TowerScrollStateScript = preload("res://Cor/Scripts/GameUi/TowerScrollState.gd")

const COLLAPSE_NONE := 0
const COLLAPSE_LEAN := 1
const COLLAPSE_FALL := 2
const COLLAPSE_SETTLED := 3

const BEAT_NONE := 0
const BEAT_ZOOM_OUT := 1
const BEAT_WAVE := 2
const BEAT_HOLD := 3

const WAVE_POP_BAND_UNITS := 2.5
const WAVE_POP_SCALE := 0.35
const MIN_CAMERA_ZOOM := 0.05
const VERDICT_POSITIVE := "positive"
const VERDICT_NEGATIVE := "negative"

const GRID_COLOR := Color(0.9, 0.95, 1.0, 0.9)
const FALLBACK_COLOR := PlayerColors.FALLBACK_COLOR


const SNAP_DOT_COLOR := Color(1.0, 1.0, 1.0, 0.5)
const SNAP_TARGET_HALO_ALPHA := 0.85
const BAND_FILL_COLOR := Color(1.0, 1.0, 1.0, 0.11)
const BAND_EDGE_COLOR := Color(1.0, 1.0, 1.0, 0.4)
const BAND_HEADROOM_UNITS := 2.0
const GHOST_OUTLINE_COLOR := Color(1.0, 1.0, 1.0, 0.7)
const DANGER_GLOW_COLOR := Color(0.984, 0.549, 0.129, 0.34)
const DANGER_BORDER_COLOR := Color(0.902, 0.204, 0.145, 1.0)
const ARMED_GHOST_ALPHA_BOOST := 0.3
const ARMED_PULSE_SPEED := 5.0

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
@export var collapse_return_pan_speed_units: float = 24.0
@export var tilt_ease_speed: float = 6.0
@export var structural_pose_ease_speed: float = 9.0
@export var drop_duration: float = 0.28
@export var snap_radius_units: float = 2.2
@export var snap_dot_radius: float = 3.5
@export var snap_target_radius: float = 8.5
@export var ghost_alpha: float = 0.45
@export var drag_grip_offset_units: float = 1.4
@export var emoji_unit_scale: float = 1.1

signal scroll_offset_changed(pixels: float)
signal camera_zoom_changed(zoom: float)
signal placement_world_visibility_changed(visible: bool)

var tower_blocks: Array = []
var current_height: int = 0
var target_height: int = 0
var player_color_map: Dictionary = {}
var tower_stability: int = 100
var tower_tilt_deg: float = 0.0
var displayed_tilt_deg: float = 0.0
var tower_collapsed: bool = false
var structural_pose = StructuralPoseScript.new()
var placement_projection = PlacementProjectionScript.new()
var scroll_state = TowerScrollStateScript.new()
var _last_scroll_pixels: float = 0.0
var snap_preview_active: bool = false
var drag_cells: Array = []
var drag_shape_id: String = ""
var drag_color: Color = PlayerColors.FALLBACK_COLOR
var active_snap: Dictionary = {}
var _drop_anim_id: String = ""
var _drop_anim_t: float = 0.0
var _drop_fall_units: float = 0.0
var _armed_pulse_t: float = 0.0
var _prev_block_count: int = 0
var mood_threshold: int = BlockDataScript.DEFAULT_MOOD_THRESHOLD
var support_warning_threshold: int = 75
var support_critical_threshold: int = 30
var _collapse_phase: int = COLLAPSE_NONE
var _collapse_lean_elapsed: float = 0.0
var _collapse_elapsed: float = 0.0
var _collapse_sim = null
var _collapsing_block_ids: Dictionary = {}
var _last_collapse_key: String = ""
var _placement_world_hidden_for_return: bool = false
var visual_hooks = null
var _camera_zoom: float = 1.0
var _beat_phase: int = BEAT_NONE
var _beat_elapsed: float = 0.0
var _beat_zoom_from: float = 1.0
var _beat_zoom_target: float = 1.0
var _wave_progress: float = -1.0
var _wave_span_units: float = 0.0
var _verdict_by_player: Dictionary = {}
var _shake_duration: float = 0.0
var _shake_elapsed: float = 0.0
var _shake_magnitude_px: float = 0.0
var _shake_offset: Vector2 = Vector2.ZERO

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		_sync_scroll_state()
		_update_scroll_offset()
		queue_redraw()

func set_tower(blocks: Array, new_current_height: int, new_target_height: int, new_stability: int = 100, diagnostics: Dictionary = {}, pose_entries: Array = []) -> void:
	var previous_global_height: int = current_height
	var previous_block_count: int = tower_blocks.size()
	var direct_pose_replace: bool = blocks.size() != previous_block_count and blocks.size() != previous_block_count + 1
	var newly_fallen: Dictionary = _newly_fallen_block_ids(tower_blocks, blocks)
	tower_blocks = blocks
	current_height = max(0, new_current_height)
	target_height = max(0, new_target_height)
	tower_stability = clampi(new_stability, 0, 100)
	structural_pose.replace_targets(pose_entries, direct_pose_replace)

	var collapse_ids: Dictionary = newly_fallen
	if collapse_ids.is_empty() and bool(diagnostics.get("collapsed", false)):
		collapse_ids = _all_block_ids()
	var collapse_key: String = _collapse_key(collapse_ids)
	var starts_collapse: bool = collapse_key != "" and collapse_key != _last_collapse_key
	var reported_tilt: float = float(diagnostics.get("tiltAngleDeg", 0.0))
	var critical_support: Dictionary = diagnostics.get("criticalSupport", {})
	var critical_direction: String = str(critical_support.get("direction", ""))

	if starts_collapse:
		_set_placement_world_hidden_for_return(false)
		scroll_state.hold_current()
		scroll_state.frozen = true
		tower_collapsed = true
		_last_collapse_key = collapse_key
		_collapsing_block_ids = collapse_ids
		if !newly_fallen.is_empty():
			critical_direction = _collapse_direction_for(newly_fallen)
		var lean_sign: float = 1.0 if critical_direction == "right" or (critical_direction == "" and reported_tilt >= 0.0) else -1.0
		tower_tilt_deg = lean_sign * collapse_tilt_deg
		_collapse_phase = COLLAPSE_LEAN
		_collapse_lean_elapsed = 0.0
		_collapse_elapsed = 0.0
		_collapse_sim = null
	elif _collapse_phase == COLLAPSE_NONE:
		scroll_state.frozen = false
		tower_collapsed = false
		tower_tilt_deg = 0.0 if structural_pose.has_targets() else reported_tilt

	_maybe_start_drop_animation(previous_global_height)
	if _collapse_phase == COLLAPSE_NONE:
		_sync_scroll_state(previous_block_count == 0)
	_update_scroll_offset()
	queue_redraw()

func _all_block_ids() -> Dictionary:
	var block_ids: Dictionary = {}
	for entry_value in tower_blocks:
		if typeof(entry_value) == TYPE_DICTIONARY:
			block_ids[_entry_block_id(entry_value)] = true
	return block_ids

func _collapse_key(block_ids: Dictionary) -> String:
	var ids: Array = block_ids.keys()
	ids.sort()
	var parts := PackedStringArray()
	for block_id in ids:
		parts.append(str(block_id))
	return "|".join(parts)

func _newly_fallen_block_ids(previous: Array, current: Array) -> Dictionary:
	var fallen: Dictionary = {}
	if previous.is_empty():
		return fallen
	var prior_states: Dictionary = {}
	for entry_value in previous:
		if typeof(entry_value) != TYPE_DICTIONARY:
			continue
		var entry: Dictionary = entry_value
		prior_states[_entry_block_id(entry)] = str(entry.get("towerState", "standing"))
	for entry_value in current:
		if typeof(entry_value) != TYPE_DICTIONARY:
			continue
		var entry: Dictionary = entry_value
		if str(entry.get("towerState", "standing")) != "fallen":
			continue
		var block_id: String = _entry_block_id(entry)
		if !prior_states.has(block_id) or str(prior_states[block_id]) != "fallen":
			fallen[block_id] = true
	return fallen

func _collapse_direction_for(block_ids: Dictionary) -> String:
	for entry_value in tower_blocks:
		if typeof(entry_value) != TYPE_DICTIONARY:
			continue
		var entry: Dictionary = entry_value
		if block_ids.has(_entry_block_id(entry)):
			return str(entry.get("collapseDirection", "center"))
	return "center"

func refresh_visuals() -> void:
	_sync_scroll_state()
	_update_scroll_offset()
	queue_redraw()

func set_mood_threshold(value: int) -> void:
	var resolved: int = maxi(1, value)

	if resolved == mood_threshold:
		return

	mood_threshold = resolved
	queue_redraw()

func set_support_stability_thresholds(warning_threshold: int, critical_threshold: int) -> void:
	var warning: int = clampi(warning_threshold, 0, 100)
	var critical: int = mini(warning, clampi(critical_threshold, 0, 100))

	if warning == support_warning_threshold and critical == support_critical_threshold:
		return

	support_warning_threshold = warning
	support_critical_threshold = critical
	queue_redraw()

func set_visual_hooks(hooks) -> void:
	visual_hooks = hooks

func play_impact_beat(verdicts: Dictionary) -> bool:
	if visual_hooks == null or !visual_hooks.impact_beat_enabled:
		return false

	if tower_blocks.is_empty() or _collapse_phase != COLLAPSE_NONE:
		return false

	scroll_state.return_to_auto()
	_verdict_by_player = verdicts.duplicate()
	_wave_span_units = maxf(1.0, float(SnapGridScript.top_height(tower_blocks)))
	_wave_progress = 0.0
	_beat_phase = BEAT_ZOOM_OUT
	_beat_elapsed = 0.0
	_beat_zoom_from = _camera_zoom
	_beat_zoom_target = _impact_beat_zoom()
	queue_redraw()

	return true

func cancel_impact_beat() -> void:
	if _beat_phase == BEAT_NONE and _wave_progress < 0.0 and is_equal_approx(_camera_zoom, 1.0):
		return

	_beat_phase = BEAT_NONE
	_beat_elapsed = 0.0
	_wave_progress = -1.0
	_verdict_by_player = {}
	_set_camera_zoom(1.0)
	queue_redraw()

func shake(duration_ms: int, magnitude_units: float) -> void:
	var duration: float = maxf(0.0, float(duration_ms) / 1000.0)

	if duration <= 0.0 or magnitude_units <= 0.0:
		return

	_shake_duration = duration
	_shake_elapsed = 0.0
	_shake_magnitude_px = magnitude_units * brick_unit_size

func _impact_beat_zoom() -> float:
	var tower_units: float = float(
		maxi(maxi(current_height, target_height), 1) + top_indicator_clearance_units
	)
	var available_height: float = maxf(1.0, size.y - top_padding - bottom_padding)
	var fit_zoom: float = (available_height / brick_unit_size) / tower_units

	return clampf(fit_zoom, visual_hooks.impact_beat_min_zoom, 1.0)

func _set_camera_zoom(value: float) -> void:
	var resolved: float = clampf(value, MIN_CAMERA_ZOOM, 1.0)

	if is_equal_approx(resolved, _camera_zoom):
		return

	_camera_zoom = resolved
	camera_zoom_changed.emit(_camera_zoom)
	_sync_scroll_state()
	_update_scroll_offset()

func _beat_ease(t: float) -> float:
	var clamped: float = clampf(t, 0.0, 1.0)

	return clamped * clamped * (3.0 - 2.0 * clamped)

func _step_impact_beat(delta: float) -> void:
	if visual_hooks == null:
		cancel_impact_beat()
		return

	_beat_elapsed += delta

	if _beat_phase == BEAT_ZOOM_OUT:
		var zoom_out_seconds: float = maxf(0.001, float(visual_hooks.impact_beat_zoom_out_ms) / 1000.0)
		var zoom_out_t: float = clampf(_beat_elapsed / zoom_out_seconds, 0.0, 1.0)

		_set_camera_zoom(lerpf(_beat_zoom_from, _beat_zoom_target, _beat_ease(zoom_out_t)))

		if zoom_out_t >= 1.0:
			_beat_phase = BEAT_WAVE
			_beat_elapsed = 0.0
	elif _beat_phase == BEAT_WAVE:
		var wave_seconds: float = maxf(0.001, float(visual_hooks.impact_beat_wave_ms) / 1000.0)
		var wave_t: float = clampf(_beat_elapsed / wave_seconds, 0.0, 1.0)

		_wave_progress = wave_t * (_wave_span_units + WAVE_POP_BAND_UNITS)

		if wave_t >= 1.0:
			_beat_phase = BEAT_HOLD
			_beat_elapsed = 0.0

func _step_shake(delta: float) -> void:
	_shake_elapsed += delta

	if _shake_elapsed >= _shake_duration:
		_shake_duration = 0.0
		_shake_elapsed = 0.0
		_shake_offset = Vector2.ZERO
		return

	var decay: float = 1.0 - (_shake_elapsed / _shake_duration)
	var amplitude: float = _shake_magnitude_px * decay * decay

	_shake_offset = Vector2(
		randf_range(-amplitude, amplitude), randf_range(-amplitude, amplitude)
	)

func drag_grip_offset() -> Vector2:
	return Vector2(0.0, -drag_grip_offset_units * _unit_size())

func begin_snap_drag(block: Dictionary, color: Color) -> void:
	drag_cells = block.get("cells", [])
	drag_shape_id = str(block.get("shapeId", ""))
	drag_color = color
	active_snap = {}
	snap_preview_active = false
	queue_redraw()

func resolve_snap(cells: Array, ghost_global_pos: Vector2) -> Dictionary:
	var local: Vector2 = get_global_transform().affine_inverse() * ghost_global_pos
	var unit: float = _unit_size()
	return placement_projection.resolve(
		tower_blocks,
		cells,
		local_to_grid(local),
		local,
		snap_radius_units,
		unit,
		size.x * 0.5,
		size.y - bottom_padding,
		_scroll_offset_units(unit),
		structural_pose
	)

func is_placement_still_legal(cells: Array, column: int, origin_y: int) -> bool:
	return SnapGridScript.is_placement_legal(tower_blocks, cells, column, origin_y)

func set_snap_state(snap: Dictionary) -> void:
	active_snap = snap
	snap_preview_active = bool(snap.get("valid", false))

	if !bool(snap.get("armed", false)):
		_armed_pulse_t = 0.0

	queue_redraw()

func clear_snap_preview() -> void:
	snap_preview_active = false
	active_snap = {}
	queue_redraw()

func end_snap_drag() -> void:
	drag_cells = []
	drag_shape_id = ""
	clear_snap_preview()

func is_placement_frame_active() -> bool:
	return snap_preview_active and structural_pose.has_targets()

func placement_visual_bounds() -> Rect2:
	var unit: float = _unit_size()
	var base_x: float = size.x * 0.5
	var baseline: float = size.y - bottom_padding
	var scroll_offset_units: float = _scroll_offset_units(unit)
	var bounds := Rect2()
	var has_bounds := false
	var active_bounds := Rect2()
	var has_active_bounds := false

	for entry_value in tower_blocks:
		if typeof(entry_value) != TYPE_DICTIONARY:
			continue

		var entry: Dictionary = entry_value
		var brick_bounds: Rect2 = _entry_rendered_bounds(
			entry, unit, base_x, baseline, scroll_offset_units
		)
		bounds = brick_bounds if !has_bounds else bounds.merge(brick_bounds)
		has_bounds = true

	if active_snap.has("visual_ghost_center_local") and !drag_cells.is_empty():
		var column: int = int(active_snap.get("column", SnapGridScript.placeable_column_min))
		var origin_y: int = int(active_snap.get("aim_origin_y", active_snap.get("origin_y", 0)))
		var ghost_box: Rect2 = _footprint_box(
			column, origin_y, drag_cells, unit, base_x, baseline, scroll_offset_units
		)
		var ghost_center: Vector2 = active_snap.get("visual_ghost_center_local", ghost_box.get_center())
		var ghost_extents := _rotated_half_extents(
			ghost_box.size * 0.5, float(active_snap.get("visual_rotation_deg", 0.0))
		)
		var ghost_bounds := Rect2(ghost_center - ghost_extents, ghost_extents * 2.0)
		bounds = ghost_bounds if !has_bounds else bounds.merge(ghost_bounds)
		has_bounds = true
		active_bounds = ghost_bounds.grow(unit)
		has_active_bounds = true

	if has_active_bounds:
		return active_bounds
	return bounds if has_bounds else Rect2(Vector2.ZERO, size)

func _entry_rendered_bounds(
	entry: Dictionary,
	unit: float,
	base_x: float,
	baseline: float,
	scroll_offset_units: float
) -> Rect2:
	var block: Dictionary = _normalize_block_entry(entry)
	var cells: Array = block.get("cells", [])
	var origin_x: int = int(entry.get("originX", 0))
	var origin_y: int = int(entry.get("originY", entry.get("baseHeight", 0)))
	var box: Rect2 = _footprint_box(
		origin_x, origin_y, cells, unit, base_x, baseline, scroll_offset_units
	)
	var center: Vector2 = box.get_center()
	var rotation: float = 0.0
	var pose_bounds: Dictionary = BlockDataScript.cell_bounds(cells)
	var pose: Dictionary = structural_pose.pose_for_grid(
		_entry_block_id(entry),
		Vector2(
			float(origin_x) + (float(pose_bounds.min_x) + float(pose_bounds.max_x) + 1.0) * 0.5,
			float(origin_y) + (float(pose_bounds.min_y) + float(pose_bounds.max_y) + 1.0) * 0.5
		)
	)

	if !pose.is_empty():
		center += Vector2(
			float(pose.get("offsetXUnits", 0.0)) * unit,
			-float(pose.get("offsetYUnits", 0.0)) * unit
		)
		rotation = float(pose.get("rotationDeg", 0.0))

	var extents := _rotated_half_extents(box.size * 0.5, rotation)
	return Rect2(center - extents, extents * 2.0)

func trouble_target() -> Dictionary:
	var unit: float = _unit_size()
	var base_x: float = size.x * 0.5
	var baseline: float = size.y - bottom_padding
	var viewport_bottom: float = size.y - bottom_padding
	var selected: Dictionary = {}

	for entry_value in tower_blocks:
		if typeof(entry_value) != TYPE_DICTIONARY:
			continue
		var entry: Dictionary = entry_value
		if str(entry.get("towerState", "standing")) == "fallen":
			continue
		var stability: int = int(entry.get("supportStability", 100))
		if stability > support_critical_threshold:
			continue
		var bounds: Rect2 = _entry_rendered_bounds(
			entry, unit, base_x, baseline, _scroll_offset_units(unit)
		)
		if bounds.position.y <= viewport_bottom:
			continue
		var candidate := {
			"block_id": _entry_block_id(entry),
			"origin_y": int(entry.get("originY", entry.get("baseHeight", 0))),
			"support_stability": stability,
			"bounds": bounds,
		}
		if selected.is_empty() or _trouble_precedes(candidate, selected):
			selected = candidate

	return selected

func _trouble_precedes(left: Dictionary, right: Dictionary) -> bool:
	if int(left.support_stability) != int(right.support_stability):
		return int(left.support_stability) < int(right.support_stability)
	if int(left.origin_y) != int(right.origin_y):
		return int(left.origin_y) < int(right.origin_y)
	return str(left.block_id) < str(right.block_id)

func navigate_to_trouble(block_id: String) -> bool:
	if is_navigation_blocked_by_presentation():
		return false
	_sync_scroll_state()
	for entry_value in tower_blocks:
		if typeof(entry_value) != TYPE_DICTIONARY:
			continue
		var entry: Dictionary = entry_value
		if _entry_block_id(entry) != block_id or str(entry.get("towerState", "standing")) == "fallen":
			continue
		return scroll_state.navigate_to_row(
			float(entry.get("originY", entry.get("baseHeight", 0))),
			2.0
		)
	return false

func return_to_auto_scroll() -> bool:
	if is_navigation_blocked_by_presentation():
		return false
	return scroll_state.return_to_auto()

func pan_scroll_pixels(delta_pixels: float) -> bool:
	return pan_scroll_units(delta_pixels / maxf(1.0, _unit_size()))

func pan_scroll_units(delta_units: float) -> bool:
	if is_navigation_blocked_by_presentation():
		return false
	_sync_scroll_state()
	if !scroll_state.pan_by(delta_units):
		return false
	_update_scroll_offset()
	queue_redraw()
	return true

func is_scroll_displaced() -> bool:
	return scroll_state.is_displaced()

func is_scroll_manually_displaced() -> bool:
	return scroll_state.is_manually_displaced()

func is_scroll_navigating() -> bool:
	return scroll_state.is_navigating()

func reset_navigation() -> void:
	_set_placement_world_hidden_for_return(false)
	scroll_state.frozen = false
	scroll_state.snap_to_normal()
	_update_scroll_offset()
	queue_redraw()

func is_navigation_blocked_by_presentation() -> bool:
	return (
		_collapse_phase != COLLAPSE_NONE
		or _beat_phase != BEAT_NONE
		or _placement_world_hidden_for_return
	)

func is_placement_world_hidden() -> bool:
	return _placement_world_hidden_for_return

func grid_to_local(lattice: Vector2) -> Vector2:
	var unit: float = _unit_size()

	return _lattice_to_local(
		lattice, unit, size.x * 0.5, size.y - bottom_padding, _scroll_offset_units(unit)
	)

func local_to_grid(local: Vector2) -> Vector2:
	var unit: float = _unit_size()

	return Vector2(
		(local.x - size.x * 0.5) / unit + SnapGridScript.grid_center_col() + 0.5,
		((size.y - bottom_padding) - local.y) / unit + float(_scroll_offset_units(unit))
	)

func global_to_grid(global_pos: Vector2) -> Vector2:
	return local_to_grid(get_global_transform().affine_inverse() * global_pos)

func _lattice_to_local(
	lattice: Vector2, unit: float, base_x: float, baseline: float, scroll_offset_units: float
) -> Vector2:
	return Vector2(
		base_x + (lattice.x - SnapGridScript.grid_center_col() - 0.5) * unit,
		baseline - (lattice.y - float(scroll_offset_units)) * unit
	)

func _maybe_start_drop_animation(previous_global_height: int) -> void:
	var new_count: int = tower_blocks.size()

	if new_count == _prev_block_count + 1 and new_count > 0:
		var entry: Dictionary = tower_blocks[new_count - 1]
		_drop_anim_id = _entry_block_id(entry)
		_drop_anim_t = 0.0
		_drop_fall_units = minf(
			_compute_drop_fall_units(entry, previous_global_height),
			_drop_clearance_units(new_count - 1)
		)
	elif new_count != _prev_block_count:
		_drop_anim_id = ""

	_prev_block_count = new_count

func _compute_drop_fall_units(entry: Dictionary, previous_global_height: int) -> float:
	var block: Dictionary = _normalize_block_entry(entry)
	var block_height: int = int(block.get("height", 0))
	var bounds: Dictionary = BlockDataScript.cell_bounds(block.get("cells", []))
	var origin_y: int = int(entry.get("originY", entry.get("baseHeight", 0)))
	var landed_top_edge: int = origin_y + bounds.max_y + 1
	var spawn_top_edge: float = float(previous_global_height) + 2.0 * float(block_height)

	return maxf(0.0, spawn_top_edge - float(landed_top_edge))

func _drop_clearance_units(entry_index: int) -> float:
	if entry_index < 0 or entry_index >= tower_blocks.size():
		return INF

	var brick_top: Dictionary = {}

	for cell in SnapGridScript.entry_cells(tower_blocks[entry_index]):
		brick_top[cell.x] = maxi(int(brick_top.get(cell.x, -1)), cell.y)

	if brick_top.is_empty():
		return INF

	var clearance: float = INF

	for i in range(tower_blocks.size()):
		if i == entry_index:
			continue

		for cell in SnapGridScript.entry_cells(tower_blocks[i]):
			if !brick_top.has(cell.x):
				continue

			var top: int = brick_top[cell.x]

			if cell.y <= top:
				continue

			clearance = minf(clearance, float(cell.y - top - 1))

	return maxf(0.0, clearance)

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

	if _collapse_phase == COLLAPSE_NONE:
		var scroll_changed: bool = (
			scroll_state.step_at_speed(delta, collapse_return_pan_speed_units)
			if _placement_world_hidden_for_return
			else scroll_state.step(delta)
		)
		if scroll_changed:
			_update_scroll_offset()
			needs_redraw = true
	if _placement_world_hidden_for_return and !scroll_state.is_displaced():
		_set_placement_world_hidden_for_return(false)

	if structural_pose.step(delta, structural_pose_ease_speed):
		needs_redraw = true

	if absf(displayed_tilt_deg - tower_tilt_deg) > 0.01:
		displayed_tilt_deg = lerpf(displayed_tilt_deg, tower_tilt_deg, minf(1.0, tilt_ease_speed * delta))
		needs_redraw = true

	if _drop_anim_id != "":
		_drop_anim_t += delta / drop_duration
		if _drop_anim_t >= 1.0:
			_drop_anim_t = 1.0
			_drop_anim_id = ""
		needs_redraw = true

	if snap_preview_active and bool(active_snap.get("armed", false)):
		_armed_pulse_t = fmod(_armed_pulse_t + delta * ARMED_PULSE_SPEED, TAU)
		needs_redraw = true

	if _collapse_phase != COLLAPSE_NONE:
		_collapse_elapsed += delta
		if _collapse_elapsed >= _collapse_debris_lifetime_seconds():
			_expire_collapse_debris()
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

	if _beat_phase != BEAT_NONE and _beat_phase != BEAT_HOLD:
		_step_impact_beat(delta)
		needs_redraw = true

	if _shake_duration > 0.0:
		_step_shake(delta)
		needs_redraw = true

	if needs_redraw:
		queue_redraw()

func set_player_color_map(new_player_color_map: Dictionary) -> void:
	player_color_map = new_player_color_map
	queue_redraw()

func clear_tower() -> void:
	_set_placement_world_hidden_for_return(false)
	tower_blocks = []
	current_height = 0
	target_height = 0
	_prev_block_count = 0
	_drop_anim_id = ""
	tower_collapsed = false
	_last_collapse_key = ""
	structural_pose.clear()
	scroll_state.reset()
	_reset_collapse()
	cancel_impact_beat()
	_update_scroll_offset()
	queue_redraw()

func _reset_collapse() -> void:
	_collapse_phase = COLLAPSE_NONE
	_collapse_lean_elapsed = 0.0
	_collapse_elapsed = 0.0
	_collapse_sim = null
	_collapsing_block_ids = {}
	scroll_state.frozen = false

func _collapse_debris_lifetime_seconds() -> float:
	if visual_hooks == null:
		return 2.0
	return maxf(0.0, float(visual_hooks.collapse_debris_lifetime_ms) / 1000.0)

func _expire_collapse_debris() -> void:
	var collapse_offset_units: float = scroll_state.displayed_offset_units
	_reset_collapse()
	tower_collapsed = false
	tower_tilt_deg = 0.0
	_sync_scroll_state()
	if collapse_offset_units > scroll_state.normal_target_units + TowerScrollStateScript.EPSILON:
		scroll_state.return_to_auto_from(collapse_offset_units)
		_set_placement_world_hidden_for_return(true)
	else:
		_set_placement_world_hidden_for_return(false)
		scroll_state.return_to_auto()
	_update_scroll_offset()

func _set_placement_world_hidden_for_return(hidden: bool) -> void:
	if hidden == _placement_world_hidden_for_return:
		return
	_placement_world_hidden_for_return = hidden
	placement_world_visibility_changed.emit(!hidden)

func _begin_collapse() -> void:
	var unit: float = _unit_size()
	var base_x: float = size.x * 0.5
	var baseline: float = size.y - bottom_padding
	var scroll_px: float = _scroll_offset_units(unit) * unit
	var pivot: Vector2 = Vector2(base_x, baseline)
	var lean_rad: float = deg_to_rad(displayed_tilt_deg)
	var top_units: float = maxf(1.0, float(SnapGridScript.top_height(tower_blocks)))
	var seeds: Array = []

	for entry_value in tower_blocks:
		if typeof(entry_value) != TYPE_DICTIONARY:
			continue
		if !_collapsing_block_ids.has(_entry_block_id(entry_value)):
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
		"lean_sign": 1.0 if tower_tilt_deg >= 0.0 else -1.0,
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
	var bounds: Dictionary = BlockDataScript.cell_bounds(cells)
	var grid_center: Vector2 = Vector2(
		float(origin_x) + (float(bounds.min_x) + float(bounds.max_x) + 1.0) * 0.5,
		float(origin_y) + (float(bounds.min_y) + float(bounds.max_y) + 1.0) * 0.5
	)
	var pose: Dictionary = structural_pose.pose_for_grid(_entry_block_id(entry), grid_center)
	var has_pose: bool = !pose.is_empty()
	var leaned: Vector2 = pivot + (center + Vector2(0.0, scroll_px) - pivot).rotated(lean_rad)
	var pose_angle: float = deg_to_rad(float(pose.get("rotationDeg", 0.0)))
	var posed_center: Vector2 = center + Vector2(
		float(pose.get("offsetXUnits", 0.0)) * unit,
		-float(pose.get("offsetYUnits", 0.0)) * unit
	)
	var center_units: float = grid_center.y
	var texture: Texture2D = BlockDataScript.brick_texture(shape_id)
	var quad_size: Vector2 = box.size
	var rotation_steps: int = 0
	var flipped: bool = false

	if texture != null:
		var orientation: Dictionary = BlockDataScript.detect_orientation(shape_id, cells)
		rotation_steps = int(orientation.steps)
		flipped = bool(orientation.flipped)
		var canonical_bounds: Dictionary = BlockDataScript.cell_bounds(
			BlockDataScript.BRICK_SHAPES[shape_id]
		)
		quad_size = Vector2(
			float(canonical_bounds.max_x - canonical_bounds.min_x + 1) * unit,
			float(canonical_bounds.max_y - canonical_bounds.min_y + 1) * unit
		)

	var emoji_texture: Texture2D = null
	var emoji_offset: Vector2 = Vector2.ZERO

	var mood: String = _emoji_mood_for_entry(entry)
	if mood != "":
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
		"pos": (posed_center if has_pose else leaned) - Vector2(0.0, scroll_px),
		"angle": pose_angle if has_pose else lean_rad,
		"height_ratio": clampf(center_units / top_units, 0.0, 1.0),
		"footprint": box.size,
		"quad_size": quad_size,
		"rotation_steps": rotation_steps,
		"flipped": flipped,
		"texture": texture,
		"color": _player_color(entry),
		"emoji_texture": emoji_texture,
		"emoji_offset": emoji_offset,
		"failure_weight": float(pose.get("failureWeight", 0.0)) if has_pose else 0.0
	}

func _collapse_seed() -> int:
	var key: String = ""

	for entry_value in tower_blocks:
		if typeof(entry_value) != TYPE_DICTIONARY:
			continue
		if !_collapsing_block_ids.has(_entry_block_id(entry_value)):
			continue

		key += _entry_block_id(entry_value) + "|"

	return key.hash()

func _draw_debris(unit: float) -> void:
	if _collapse_sim == null:
		return

	var scroll_px: float = _scroll_offset_units(unit) * unit
	var uvs: PackedVector2Array = BlockDataScript.brick_quad_uvs()
	var emoji_size: Vector2 = Vector2.ONE * unit * emoji_unit_scale

	for piece_value in _collapse_sim.pieces:
		var piece: Dictionary = piece_value
		var screen_pos: Vector2 = piece.pos + Vector2(0.0, scroll_px) + _shake_offset
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
					Vector2.ZERO, piece.quad_size, int(piece.rotation_steps), bool(piece.flipped)
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
	var scroll_pixels: float = _scroll_offset_units(unit) * unit

	if is_equal_approx(scroll_pixels, _last_scroll_pixels):
		return

	_last_scroll_pixels = scroll_pixels
	scroll_offset_changed.emit(scroll_pixels)

func _draw() -> void:
	var unit: float = _unit_size()
	var base_x: float = size.x * 0.5 + _shake_offset.x
	var baseline: float = size.y - bottom_padding + _shake_offset.y

	if tower_blocks.is_empty():
		_draw_fallback_stack()
		_draw_snap_layer(unit, base_x, baseline, Vector2.ZERO)
		return

	var scroll_offset_units: float = _scroll_offset_units(unit)
	var tower_units: int = max(target_height, current_height, 1)

	var has_structural_pose: bool = structural_pose.has_targets()
	var pivot: Vector2 = Vector2(base_x, baseline)
	var component_collapse_active: bool = _collapse_phase != COLLAPSE_NONE
	var draw_origin: Vector2 = Vector2.ZERO if has_structural_pose or component_collapse_active else pivot

	if has_structural_pose or component_collapse_active:
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	else:
		draw_set_transform(pivot, deg_to_rad(displayed_tilt_deg), Vector2.ONE)

	for i in range(tower_blocks.size()):
		var entry: Dictionary = tower_blocks[i]
		var entry_fallen: bool = str(entry.get("towerState", "standing")) == "fallen"
		if entry_fallen and (
			_collapse_phase != COLLAPSE_LEAN or !_collapsing_block_ids.has(_entry_block_id(entry))
		):
			continue
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

		var center: Vector2 = box_rect.position + box_rect.size * 0.5 - draw_origin
		var texture: Texture2D = BlockDataScript.brick_texture(shape_id)
		var pose_bounds: Dictionary = BlockDataScript.cell_bounds(cells)
		var pose: Dictionary = structural_pose.pose_for_grid(
			_entry_block_id(entry),
			Vector2(
				float(origin_x) + (float(pose_bounds.min_x) + float(pose_bounds.max_x) + 1.0) * 0.5,
				float(base_height) + (float(pose_bounds.min_y) + float(pose_bounds.max_y) + 1.0) * 0.5
			)
		)

		if has_structural_pose and !pose.is_empty():
			var posed_center: Vector2 = center + Vector2(
				float(pose.get("offsetXUnits", 0.0)) * unit,
				-float(pose.get("offsetYUnits", 0.0)) * unit
			)
			draw_set_transform(posed_center, deg_to_rad(float(pose.get("rotationDeg", 0.0))), Vector2.ONE)

			if texture == null:
				_draw_fallback_block(Vector2.ZERO, box_rect.size, color)
			else:
				var posed_orientation: Dictionary = BlockDataScript.detect_orientation(shape_id, cells)
				var posed_canonical_bounds: Dictionary = BlockDataScript.cell_bounds(BlockDataScript.BRICK_SHAPES[shape_id])
				var posed_canonical_size: Vector2 = Vector2(
					float(posed_canonical_bounds.max_x - posed_canonical_bounds.min_x + 1) * unit,
					float(posed_canonical_bounds.max_y - posed_canonical_bounds.min_y + 1) * unit
				)
				var posed_points: PackedVector2Array = BlockDataScript.brick_quad_points(
					Vector2.ZERO, posed_canonical_size, int(posed_orientation.steps), bool(posed_orientation.flipped)
				)
				var posed_colors: PackedColorArray = BlockDataScript.brick_quad_colors(color, posed_points)

				draw_primitive(posed_points, posed_colors, BlockDataScript.brick_quad_uvs(), texture)

			_draw_posed_block_emoji(
				entry, cells, origin_x, base_height, unit, base_x, baseline, scroll_offset_units,
				drop_offset, box_rect.position + box_rect.size * 0.5
			)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		elif texture == null:
			_draw_fallback_block(center, box_rect.size, color)
		else:
			var orientation: Dictionary = BlockDataScript.detect_orientation(shape_id, cells)
			var canonical_bounds: Dictionary = BlockDataScript.cell_bounds(BlockDataScript.BRICK_SHAPES[shape_id])
			var canonical_size: Vector2 = Vector2(
				float(canonical_bounds.max_x - canonical_bounds.min_x + 1) * unit,
				float(canonical_bounds.max_y - canonical_bounds.min_y + 1) * unit
			)
			var points: PackedVector2Array = BlockDataScript.brick_quad_points(
				center, canonical_size, int(orientation.steps), bool(orientation.flipped)
			)
			var colors: PackedColorArray = BlockDataScript.brick_quad_colors(color, points)

			draw_primitive(points, colors, BlockDataScript.brick_quad_uvs(), texture)

		if !has_structural_pose or pose.is_empty():
			_draw_block_emoji(
				entry, cells, origin_x, base_height, unit, base_x, baseline, scroll_offset_units, drop_offset, draw_origin
			)

		if _has_danger_outline(entry):
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			_draw_danger_outline(entry, drop_offset)
			if !has_structural_pose and !component_collapse_active:
				draw_set_transform(pivot, deg_to_rad(displayed_tilt_deg), Vector2.ONE)

	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

	if _collapse_phase == COLLAPSE_FALL or _collapse_phase == COLLAPSE_SETTLED:
		_draw_debris(unit)

	if has_structural_pose or component_collapse_active:
		_draw_snap_layer(unit, base_x, baseline, Vector2.ZERO)
	else:
		draw_set_transform(pivot, deg_to_rad(displayed_tilt_deg), Vector2.ONE)
		_draw_snap_layer(unit, base_x, baseline, pivot)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

	if current_height > tower_units:
		_draw_fallback_stack()

func _draw_block_emoji(
	entry: Dictionary,
	cells: Array,
	origin_x: int,
	origin_y: int,
	unit: float,
	base_x: float,
	baseline: float,
	scroll_offset_units: float,
	drop_offset: float,
	pivot: Vector2
) -> void:
	if cells.is_empty():
		return

	var bounds: Dictionary = BlockDataScript.cell_bounds(cells)
	var brick_top_units: float = float(origin_y + int(bounds.max_y) + 1)
	var verdict_mood: String = _verdict_mood_for(entry, brick_top_units)
	var mood: String = verdict_mood

	if mood == "":
		mood = _emoji_mood_for_entry(entry)
		if mood == "":
			return

	var texture: Texture2D = BlockDataScript.emoji_texture(mood)

	if texture == null:
		return

	var pop_scale: float = 1.0

	if verdict_mood != "":
		pop_scale += WAVE_POP_SCALE * _wave_pop_factor(brick_top_units)

	var anchor: Vector2 = BlockDataScript.emoji_anchor(cells)
	var center: Vector2 = _lattice_to_local(
		Vector2(float(origin_x) + anchor.x, float(origin_y) + anchor.y + drop_offset),
		unit,
		base_x,
		baseline,
		scroll_offset_units
	) - pivot
	var box_size: Vector2 = Vector2.ONE * unit * emoji_unit_scale * pop_scale

	draw_texture_rect(texture, Rect2(center - box_size * 0.5, box_size), false)

func _draw_posed_block_emoji(
	entry: Dictionary,
	cells: Array,
	origin_x: int,
	origin_y: int,
	unit: float,
	base_x: float,
	baseline: float,
	scroll_offset_units: float,
	drop_offset: float,
	block_center: Vector2
) -> void:
	if cells.is_empty():
		return

	var bounds: Dictionary = BlockDataScript.cell_bounds(cells)
	var brick_top_units: float = float(origin_y + int(bounds.max_y) + 1)
	var verdict_mood: String = _verdict_mood_for(entry, brick_top_units)
	var mood: String = verdict_mood

	if mood == "":
		mood = _emoji_mood_for_entry(entry)
		if mood == "":
			return

	var texture: Texture2D = BlockDataScript.emoji_texture(mood)

	if texture == null:
		return

	var pop_scale: float = 1.0
	if verdict_mood != "":
		pop_scale += WAVE_POP_SCALE * _wave_pop_factor(brick_top_units)

	var anchor: Vector2 = BlockDataScript.emoji_anchor(cells)
	var local_anchor: Vector2 = _lattice_to_local(
		Vector2(float(origin_x) + anchor.x, float(origin_y) + anchor.y + drop_offset),
		unit,
		base_x,
		baseline,
		scroll_offset_units
	) - block_center
	var box_size: Vector2 = Vector2.ONE * unit * emoji_unit_scale * pop_scale
	draw_texture_rect(texture, Rect2(local_anchor - box_size * 0.5, box_size), false)

func _emoji_mood_for_entry(entry: Dictionary) -> String:
	var block_id: String = _entry_block_id(entry)
	var is_collapsing: bool = (
		str(entry.get("towerState", "standing")) == "fallen" or
		_collapsing_block_ids.has(block_id)
	)

	if !is_collapsing and block_id == _drop_anim_id and entry.has(BlockDataScript.BALANCE_DELTA_KEY):
		return BlockDataScript.emoji_mood_for_delta(
			int(entry.get(BlockDataScript.BALANCE_DELTA_KEY, 0)), mood_threshold
		)

	if entry.has(BlockDataScript.SUPPORT_STABILITY_KEY):
		return BlockDataScript.emoji_mood_for_support(
			int(entry.get(BlockDataScript.SUPPORT_STABILITY_KEY, 100)),
			support_warning_threshold,
			support_critical_threshold
		)

	if entry.has(BlockDataScript.BALANCE_DELTA_KEY):
		return BlockDataScript.emoji_mood_for_delta(
			int(entry.get(BlockDataScript.BALANCE_DELTA_KEY, 0)), mood_threshold
		)

	return ""

func _has_danger_outline(entry: Dictionary) -> bool:
	return (
		str(entry.get("towerState", "standing")) == "standing" and
		entry.has(BlockDataScript.SUPPORT_STABILITY_KEY) and
		int(entry.get(BlockDataScript.SUPPORT_STABILITY_KEY, 100)) <= support_critical_threshold
	)

func _danger_outline_geometry(entry: Dictionary, drop_offset: float = 0.0) -> PackedVector2Array:
	var points := PackedVector2Array()
	if !_has_danger_outline(entry):
		return points

	var block: Dictionary = _normalize_block_entry(entry)
	var cells: Array = block.get("cells", [])
	if cells.is_empty():
		return points

	var unit: float = _unit_size()
	var base_x: float = size.x * 0.5 + _shake_offset.x
	var baseline: float = size.y - bottom_padding + _shake_offset.y
	var scroll_offset_units: float = _scroll_offset_units(unit)
	var origin_x: int = int(entry.get("originX", 0))
	var origin_y: int = int(entry.get("originY", entry.get("baseHeight", 0)))
	var box: Rect2 = _footprint_box(
		origin_x,
		origin_y,
		cells,
		unit,
		base_x,
		baseline,
		scroll_offset_units,
		drop_offset
	)
	var center: Vector2 = box.get_center()
	var occupied: Dictionary = {}
	for cell in cells:
		occupied[Vector2i(SnapGridScript.cell_x(cell), SnapGridScript.cell_y(cell))] = true

	var unposed_points := PackedVector2Array()
	for cell in cells:
		var x: int = SnapGridScript.cell_x(cell)
		var y: int = SnapGridScript.cell_y(cell)
		var sides: Array = [
			[Vector2i(-1, 0), Vector2(float(x), float(y)), Vector2(float(x), float(y + 1))],
			[Vector2i(1, 0), Vector2(float(x + 1), float(y + 1)), Vector2(float(x + 1), float(y))],
			[Vector2i(0, -1), Vector2(float(x + 1), float(y)), Vector2(float(x), float(y))],
			[Vector2i(0, 1), Vector2(float(x), float(y + 1)), Vector2(float(x + 1), float(y + 1))]
		]
		for side in sides:
			if occupied.has(Vector2i(x, y) + side[0]):
				continue
			for corner in [side[1], side[2]]:
				unposed_points.append(_lattice_to_local(
					Vector2(
						float(origin_x) + corner.x,
						float(origin_y) + corner.y + drop_offset
					),
					unit,
					base_x,
					baseline,
					scroll_offset_units
				))

	var cell_bounds: Dictionary = BlockDataScript.cell_bounds(cells)
	var pose: Dictionary = structural_pose.pose_for_grid(
		_entry_block_id(entry),
		Vector2(
			float(origin_x) + (float(cell_bounds.min_x) + float(cell_bounds.max_x) + 1.0) * 0.5,
			float(origin_y) + (float(cell_bounds.min_y) + float(cell_bounds.max_y) + 1.0) * 0.5
		)
	)
	var has_structural_pose: bool = structural_pose.has_targets()

	if has_structural_pose and !pose.is_empty():
		var posed_center: Vector2 = center + Vector2(
			float(pose.get("offsetXUnits", 0.0)) * unit,
			-float(pose.get("offsetYUnits", 0.0)) * unit
		)
		var pose_angle: float = deg_to_rad(float(pose.get("rotationDeg", 0.0)))
		for point in unposed_points:
			points.append(posed_center + (point - center).rotated(pose_angle))
	elif has_structural_pose or _collapse_phase != COLLAPSE_NONE:
		points = unposed_points
	else:
		var pivot := Vector2(base_x, baseline)
		var tower_angle: float = deg_to_rad(displayed_tilt_deg)
		for point in unposed_points:
			points.append(pivot + (point - pivot).rotated(tower_angle))

	return points

func _draw_danger_outline(entry: Dictionary, drop_offset: float) -> void:
	var points: PackedVector2Array = _danger_outline_geometry(entry, drop_offset)
	if points.size() < 2:
		return
	var unit: float = _unit_size()
	for index in range(0, points.size(), 2):
		draw_line(points[index], points[index + 1], DANGER_GLOW_COLOR, maxf(5.0, unit * 0.2), true)
		draw_line(points[index], points[index + 1], DANGER_BORDER_COLOR, maxf(2.0, unit * 0.07), true)

func _verdict_mood_for(entry: Dictionary, brick_top_units: float) -> String:
	if _wave_progress < 0.0 or _verdict_by_player.is_empty():
		return ""

	if brick_top_units > _wave_progress:
		return ""

	var player_id: String = str(entry.get("playerId", entry.get("player_id", "")))

	if !_verdict_by_player.has(player_id):
		return ""

	return (
		VERDICT_POSITIVE
		if str(_verdict_by_player[player_id]) == VERDICT_POSITIVE
		else VERDICT_NEGATIVE
	)

func _wave_pop_factor(brick_top_units: float) -> float:
	var distance: float = _wave_progress - brick_top_units

	if distance < 0.0 or distance > WAVE_POP_BAND_UNITS:
		return 0.0

	return sin((1.0 - distance / WAVE_POP_BAND_UNITS) * PI)

func _footprint_box(origin_x: int, origin_y: int, cells: Array, unit: float, base_x: float, baseline: float, scroll_offset_units: float, drop_offset: float = 0.0) -> Rect2:
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

func _height_to_pixel_y(height_units: float, unit: float, baseline: float, scroll_offset_units: float) -> float:
	return _lattice_to_local(Vector2(0.0, height_units), unit, 0.0, baseline, scroll_offset_units).y

func _rotated_half_extents(half_size: Vector2, rotation: float) -> Vector2:
	var radians: float = deg_to_rad(rotation)
	return Vector2(
		absf(cos(radians)) * half_size.x + absf(sin(radians)) * half_size.y,
		absf(sin(radians)) * half_size.x + absf(cos(radians)) * half_size.y
	)

func _draw_snap_layer(unit: float, base_x: float, baseline: float, pivot: Vector2) -> void:
	if !snap_preview_active:
		return

	var scroll_offset_units: float = _scroll_offset_units(unit)

	_draw_placeable_band(unit, base_x, baseline, scroll_offset_units, pivot, _band_top_units())

	if bool(active_snap.get("show_ghost", true)):
		_draw_drag_ghost(unit, base_x, baseline, scroll_offset_units, pivot)

	_draw_snap_points(unit, base_x, baseline, scroll_offset_units, pivot)

func _band_top_units() -> float:
	var top_units: float = float(SnapGridScript.top_height(tower_blocks))

	if !drag_cells.is_empty():
		var bounds: Dictionary = BlockDataScript.cell_bounds(drag_cells)
		var ghost_row: int = int(active_snap.get("aim_origin_y", active_snap.get("origin_y", 0)))
		var ghost_top: int = ghost_row + bounds.max_y + 1
		top_units = maxf(top_units, float(ghost_top))

	return top_units + BAND_HEADROOM_UNITS

func _draw_placeable_band(
	unit: float,
	base_x: float,
	baseline: float,
	scroll_offset_units: float,
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

func _draw_drag_ghost(
	unit: float,
	base_x: float,
	baseline: float,
	scroll_offset_units: float,
	pivot: Vector2
) -> void:
	if drag_cells.is_empty():
		return

	var column: int = int(active_snap.get("column", SnapGridScript.placeable_column_min))
	var origin_y: int = int(active_snap.get("aim_origin_y", active_snap.get("origin_y", 0)))
	var box: Rect2 = _footprint_box(
		column, origin_y, drag_cells, unit, base_x, baseline, scroll_offset_units
	)
	var armed: bool = bool(active_snap.get("armed", false))
	var pulse: float = 0.5 + 0.5 * sin(_armed_pulse_t)
	var alpha: float = minf(1.0, ghost_alpha + ARMED_GHOST_ALPHA_BOOST) if armed else ghost_alpha
	var outline: Color = GHOST_OUTLINE_COLOR
	var outline_width: float = 1.5

	if armed:
		outline = Color(1.0, 1.0, 1.0, 0.55 + 0.45 * pulse)
		outline_width = 2.5

	var fill: Color = Color(drag_color.r, drag_color.g, drag_color.b, alpha)
	var texture: Texture2D = BlockDataScript.brick_texture(drag_shape_id)
	var has_visual_ghost: bool = active_snap.has("visual_ghost_center_local")
	var center: Vector2 = box.get_center() - pivot

	if has_visual_ghost:
		center = active_snap.get("visual_ghost_center_local", box.get_center())
		draw_set_transform(
			center,
			deg_to_rad(float(active_snap.get("visual_rotation_deg", 0.0))),
			Vector2.ONE
		)
		center = Vector2.ZERO

	if texture == null:
		draw_rect(Rect2(center - box.size * 0.5, box.size), fill, true)
	else:
		var orientation: Dictionary = BlockDataScript.detect_orientation(drag_shape_id, drag_cells)
		var canonical_bounds: Dictionary = BlockDataScript.cell_bounds(
			BlockDataScript.BRICK_SHAPES[drag_shape_id]
		)
		var canonical_size: Vector2 = Vector2(
			float(canonical_bounds.max_x - canonical_bounds.min_x + 1) * unit,
			float(canonical_bounds.max_y - canonical_bounds.min_y + 1) * unit
		)
		var points: PackedVector2Array = BlockDataScript.brick_quad_points(
			center, canonical_size, int(orientation.steps), bool(orientation.flipped)
		)
		var colors: PackedColorArray = BlockDataScript.brick_quad_colors(fill, points)

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

		var cell_origin: Vector2 = cell_top_left - pivot
		if has_visual_ghost:
			cell_origin = cell_top_left - box.get_center()

		draw_rect(Rect2(cell_origin, Vector2(unit, unit)), outline, false, outline_width)

	if has_visual_ghost:
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func _draw_snap_points(
	unit: float, base_x: float, baseline: float, scroll_offset_units: float, pivot: Vector2
) -> void:
	var snapped: bool = bool(active_snap.get("snapped", false))
	var target_point: Vector2i = active_snap.get("target_point", Vector2i.ZERO)
	var visual_point: Vector2i = active_snap.get("visual_aim_point", target_point)
	var halo: Color = Color(drag_color.r, drag_color.g, drag_color.b, SNAP_TARGET_HALO_ALPHA)
	var owners: Dictionary = SnapGridScript.snap_point_owners(tower_blocks)

	for point in SnapGridScript.tower_snap_points(tower_blocks):
		var local: Vector2 = _lattice_to_local(
			Vector2(point), unit, base_x, baseline, scroll_offset_units
		)

		if structural_pose.has_targets():
			var point_owners: Array = owners.get(point, [])
			if !point_owners.is_empty():
				var projected: Dictionary = placement_projection.project_point(
					point_owners[0], Vector2(point), structural_pose
				)
				local = _lattice_to_local(
					Vector2(projected.get("point", Vector2(point))),
					unit,
					base_x,
					baseline,
					scroll_offset_units
				)

		if snapped and point == visual_point and active_snap.has("visual_target_local"):
			local = active_snap.get("visual_target_local", local)

		local -= pivot

		if snapped and point == visual_point:
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
	var scroll_offset_units: float = _scroll_offset_units(unit)

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
	return brick_unit_size * _camera_zoom

func _sync_scroll_state(snap_to_normal: bool = false) -> void:
	var retained_offset_units: float = scroll_state.displayed_offset_units
	var unit: float = _unit_size()
	scroll_state.configure(
		current_height,
		target_height,
		SnapGridScript.top_height(tower_blocks),
		_visible_unit_capacity(unit),
		scroll_start_ratio,
		scroll_ease_power,
		top_indicator_clearance_units
	)
	if _placement_world_hidden_for_return:
		if retained_offset_units > scroll_state.normal_target_units + TowerScrollStateScript.EPSILON:
			scroll_state.return_to_auto_from(retained_offset_units)
		else:
			_set_placement_world_hidden_for_return(false)
	if snap_to_normal and scroll_state.mode == TowerScrollStateScript.Mode.AUTO:
		scroll_state.snap_to_normal()

func _scroll_offset_units(_unit: float) -> float:
	return scroll_state.displayed_offset_units

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
