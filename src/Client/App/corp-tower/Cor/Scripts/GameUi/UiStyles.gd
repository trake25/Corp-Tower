extends RefCounted

static func glass_panel(corner_radius: int = 16) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.88, 0.965, 1.0, 0.78)
	style.border_color = Color(1.0, 1.0, 1.0, 0.96)
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.corner_radius_top_left = corner_radius
	style.corner_radius_top_right = corner_radius
	style.corner_radius_bottom_right = corner_radius
	style.corner_radius_bottom_left = corner_radius
	style.shadow_color = Color(0.12, 0.28, 0.34, 0.22)
	style.shadow_size = 10
	style.shadow_offset = Vector2(0, 5)
	return style
