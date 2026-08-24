extends RefCounted

const EPSILON := 0.001

var _targets: Dictionary = {}
var _current: Dictionary = {}
var _section_targets: Dictionary = {}
var _section_current: Dictionary = {}

func clear() -> void:
	_targets = {}
	_current = {}
	_section_targets = {}
	_section_current = {}

func replace_targets(pose_entries: Array, immediate: bool) -> void:
	var next_targets: Dictionary = {}
	var next_section_targets: Dictionary = {}

	for value in pose_entries:
		if typeof(value) != TYPE_DICTIONARY:
			continue

		var pose: Dictionary = _normalize(value)
		var block_id: String = str(pose.get("blockId", ""))

		if block_id == "":
			continue

		next_targets[block_id] = pose
		if bool(pose.get("hasSectionTransform", false)):
			next_section_targets[str(pose.sectionId)] = pose

	var next_current: Dictionary = {}
	for block_id in next_targets:
		var target: Dictionary = next_targets[block_id]
		var previous: Dictionary = _current.get(block_id, {})
		var section_changed: bool = str(previous.get("sectionId", "")) != str(target.get("sectionId", ""))
		next_current[block_id] = target if immediate or previous.is_empty() or section_changed else previous

	var next_section_current: Dictionary = {}
	for section_id in next_section_targets:
		var target: Dictionary = next_section_targets[section_id]
		next_section_current[section_id] = (
			target if immediate or !_section_current.has(section_id) else _section_current[section_id]
		)

	_targets = next_targets
	_current = next_current
	_section_targets = next_section_targets
	_section_current = next_section_current

func step(delta: float, spring_speed: float) -> bool:
	var changed: bool = false
	var weight: float = clampf(delta * maxf(0.0, spring_speed), 0.0, 1.0)

	for section_id in _section_targets:
		var section_target: Dictionary = _section_targets[section_id]
		var section_current: Dictionary = _section_current.get(section_id, section_target)
		var section_next: Dictionary = blend(section_current, section_target, weight)

		if !_matches(section_next, section_target):
			changed = true

		_section_current[section_id] = section_next

	for block_id in _targets:
		var target: Dictionary = _targets[block_id]
		if bool(target.get("hasSectionTransform", false)):
			continue

		var current: Dictionary = _current.get(block_id, target)
		var next: Dictionary = blend(current, target, weight)

		if !_matches(next, target):
			changed = true

		_current[block_id] = next

	return changed

func pose_for(block_id: String) -> Dictionary:
	return _current.get(block_id, {})

func pose_for_grid(block_id: String, center: Vector2) -> Dictionary:
	var pose: Dictionary = pose_for(block_id)
	var section_id: String = str(pose.get("sectionId", ""))

	if !bool(pose.get("hasSectionTransform", false)) or !_section_current.has(section_id):
		return pose

	var section: Dictionary = _section_current[section_id]
	var angle: float = float(section.get("rotationDeg", 0.0))
	var radians: float = deg_to_rad(-angle)
	var rotated: Vector2 = Vector2(
		center.x * cos(radians) - center.y * sin(radians),
		center.x * sin(radians) + center.y * cos(radians)
	)
	var posed_center: Vector2 = Vector2(
		float(section.get("sectionOriginXUnits", 0.0)),
		float(section.get("sectionOriginYUnits", 0.0))
	) + rotated
	var resolved: Dictionary = pose.duplicate()
	resolved.offsetXUnits = posed_center.x - center.x
	resolved.offsetYUnits = posed_center.y - center.y
	resolved.rotationDeg = angle
	resolved.failureWeight = float(section.get("failureWeight", pose.get("failureWeight", 0.0)))
	return resolved

func transform_grid_point(block_id: String, center: Vector2, point: Vector2) -> Dictionary:
	var pose: Dictionary = pose_for(block_id)
	var section_id: String = str(pose.get("sectionId", ""))

	if bool(pose.get("hasSectionTransform", false)) and _section_current.has(section_id):
		var section: Dictionary = _section_current[section_id]
		var angle: float = float(section.get("rotationDeg", 0.0))
		return {
			"point": Vector2(
				float(section.get("sectionOriginXUnits", 0.0)),
				float(section.get("sectionOriginYUnits", 0.0))
			) + _rotate_grid_point(point, angle),
			"rotationDeg": angle
		}

	var angle: float = float(pose.get("rotationDeg", 0.0))
	return {
		"point": center + _rotate_grid_point(point - center, angle) + Vector2(
			float(pose.get("offsetXUnits", 0.0)),
			float(pose.get("offsetYUnits", 0.0))
		),
		"rotationDeg": angle
	}

func has_pose(block_id: String) -> bool:
	return _current.has(block_id)

func has_targets() -> bool:
	return !_targets.is_empty()

func target_for(block_id: String) -> Dictionary:
	return _targets.get(block_id, {})

func blend(first: Dictionary, second: Dictionary, weight: float) -> Dictionary:
	var t: float = clampf(weight, 0.0, 1.0)
	return {
		"blockId": str(second.get("blockId", first.get("blockId", ""))),
		"offsetXUnits": lerpf(float(first.get("offsetXUnits", 0.0)), float(second.get("offsetXUnits", 0.0)), t),
		"offsetYUnits": lerpf(float(first.get("offsetYUnits", 0.0)), float(second.get("offsetYUnits", 0.0)), t),
		"rotationDeg": lerpf(float(first.get("rotationDeg", 0.0)), float(second.get("rotationDeg", 0.0)), t),
		"failureWeight": lerpf(float(first.get("failureWeight", 0.0)), float(second.get("failureWeight", 0.0)), t),
		"sectionId": str(second.get("sectionId", first.get("sectionId", ""))),
		"sectionOriginXUnits": lerpf(float(first.get("sectionOriginXUnits", 0.0)), float(second.get("sectionOriginXUnits", 0.0)), t),
		"sectionOriginYUnits": lerpf(float(first.get("sectionOriginYUnits", 0.0)), float(second.get("sectionOriginYUnits", 0.0)), t),
		"hasSectionTransform": bool(second.get("hasSectionTransform", first.get("hasSectionTransform", false)))
	}

func weighted_blend(poses: Array, weights: Array) -> Dictionary:
	var total: float = 0.0
	var blended: Dictionary = {
		"blockId": "",
		"offsetXUnits": 0.0,
		"offsetYUnits": 0.0,
		"rotationDeg": 0.0,
		"failureWeight": 0.0
	}

	for index in range(mini(poses.size(), weights.size())):
		if typeof(poses[index]) != TYPE_DICTIONARY:
			continue

		var weight: float = maxf(0.0, float(weights[index]))
		var pose: Dictionary = _normalize(poses[index])
		total += weight
		blended.offsetXUnits += float(pose.offsetXUnits) * weight
		blended.offsetYUnits += float(pose.offsetYUnits) * weight
		blended.rotationDeg += float(pose.rotationDeg) * weight
		blended.failureWeight += float(pose.failureWeight) * weight

	if total > 0.0:
		blended.offsetXUnits /= total
		blended.offsetYUnits /= total
		blended.rotationDeg /= total
		blended.failureWeight /= total

	return blended

func _rotate_grid_point(point: Vector2, angle: float) -> Vector2:
	return point.rotated(deg_to_rad(-angle))

func _normalize(value: Dictionary) -> Dictionary:
	return {
		"blockId": str(value.get("blockId", "")),
		"offsetXUnits": float(value.get("offsetXUnits", 0.0)),
		"offsetYUnits": float(value.get("offsetYUnits", 0.0)),
		"rotationDeg": float(value.get("rotationDeg", 0.0)),
		"failureWeight": clampf(float(value.get("failureWeight", 0.0)), 0.0, 1.0),
		"sectionId": str(value.get("sectionId", "")),
		"sectionOriginXUnits": float(value.get("sectionOriginXUnits", 0.0)),
		"sectionOriginYUnits": float(value.get("sectionOriginYUnits", 0.0)),
		"hasSectionTransform": (
			value.has("sectionId") and
			value.has("sectionOriginXUnits") and
			value.has("sectionOriginYUnits")
		)
	}

func _matches(first: Dictionary, second: Dictionary) -> bool:
	return (
		absf(float(first.get("offsetXUnits", 0.0)) - float(second.get("offsetXUnits", 0.0))) <= EPSILON and
		absf(float(first.get("offsetYUnits", 0.0)) - float(second.get("offsetYUnits", 0.0))) <= EPSILON and
		absf(float(first.get("rotationDeg", 0.0)) - float(second.get("rotationDeg", 0.0))) <= EPSILON and
		absf(float(first.get("failureWeight", 0.0)) - float(second.get("failureWeight", 0.0))) <= EPSILON and
		absf(float(first.get("sectionOriginXUnits", 0.0)) - float(second.get("sectionOriginXUnits", 0.0))) <= EPSILON and
		absf(float(first.get("sectionOriginYUnits", 0.0)) - float(second.get("sectionOriginYUnits", 0.0))) <= EPSILON
	)
