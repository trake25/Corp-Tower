extends RefCounted

const EPSILON := 0.001

var _targets: Dictionary = {}
var _current: Dictionary = {}

func clear() -> void:
	_targets = {}
	_current = {}

func replace_targets(pose_entries: Array, immediate: bool) -> void:
	var next_targets: Dictionary = {}

	for value in pose_entries:
		if typeof(value) != TYPE_DICTIONARY:
			continue

		var pose: Dictionary = _normalize(value)
		var block_id: String = str(pose.get("blockId", ""))

		if block_id == "":
			continue

		next_targets[block_id] = pose

	var next_current: Dictionary = {}
	for block_id in next_targets:
		var target: Dictionary = next_targets[block_id]
		next_current[block_id] = target if immediate or !_current.has(block_id) else _current[block_id]

	_targets = next_targets
	_current = next_current

func step(delta: float, spring_speed: float) -> bool:
	var changed: bool = false
	var weight: float = clampf(delta * maxf(0.0, spring_speed), 0.0, 1.0)

	for block_id in _targets:
		var target: Dictionary = _targets[block_id]
		var current: Dictionary = _current.get(block_id, target)
		var next: Dictionary = blend(current, target, weight)

		if !_matches(next, target):
			changed = true

		_current[block_id] = next

	return changed

func pose_for(block_id: String) -> Dictionary:
	return _current.get(block_id, {})

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
		"failureWeight": lerpf(float(first.get("failureWeight", 0.0)), float(second.get("failureWeight", 0.0)), t)
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

func _normalize(value: Dictionary) -> Dictionary:
	return {
		"blockId": str(value.get("blockId", "")),
		"offsetXUnits": float(value.get("offsetXUnits", 0.0)),
		"offsetYUnits": float(value.get("offsetYUnits", 0.0)),
		"rotationDeg": float(value.get("rotationDeg", 0.0)),
		"failureWeight": clampf(float(value.get("failureWeight", 0.0)), 0.0, 1.0)
	}

func _matches(first: Dictionary, second: Dictionary) -> bool:
	return (
		absf(float(first.get("offsetXUnits", 0.0)) - float(second.get("offsetXUnits", 0.0))) <= EPSILON and
		absf(float(first.get("offsetYUnits", 0.0)) - float(second.get("offsetYUnits", 0.0))) <= EPSILON and
		absf(float(first.get("rotationDeg", 0.0)) - float(second.get("rotationDeg", 0.0))) <= EPSILON and
		absf(float(first.get("failureWeight", 0.0)) - float(second.get("failureWeight", 0.0))) <= EPSILON
	)
