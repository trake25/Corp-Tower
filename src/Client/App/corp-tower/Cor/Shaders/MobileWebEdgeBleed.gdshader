shader_type canvas_item;

// Matches the protected center's TextureRect mapping, then clamps only the
// horizontal source coordinate beyond that center to its exact edge texel.
uniform vec2 viewport_size = vec2(412.0, 917.0);
uniform vec2 protected_size = vec2(412.0, 917.0);
uniform float source_offset_y = 0.0;
uniform int source_mapping = 6;

void fragment() {
	vec2 texture_size = 1.0 / TEXTURE_PIXEL_SIZE;
	float cover_scale = max(protected_size.x / texture_size.x, protected_size.y / texture_size.y);
	float keep_scale = min(protected_size.x / texture_size.x, protected_size.y / texture_size.y);
	float scale = source_mapping == 5 ? keep_scale : cover_scale;
	vec2 visible_source_size = protected_size / (texture_size * scale);
	vec2 source_origin = (vec2(1.0) - visible_source_size) * 0.5;
	float protected_left = (viewport_size.x - protected_size.x) * 0.5;
	float protected_x = clamp((UV.x * viewport_size.x - protected_left) / protected_size.x, 0.0, 1.0);
	float protected_y = clamp((UV.y * viewport_size.y - source_offset_y) / protected_size.y, 0.0, 1.0);
	vec2 source_uv = clamp(
		source_origin + visible_source_size * vec2(protected_x, protected_y),
		vec2(0.0),
		vec2(1.0)
	);
	COLOR = texture(TEXTURE, source_uv) * COLOR;
}
