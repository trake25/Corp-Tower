shader_type canvas_item;

uniform float top_multiplier : hint_range(0.5, 2.0) = 1.28;
uniform float bottom_multiplier : hint_range(0.5, 2.0) = 0.86;

void fragment() {
	vec4 modulate_color = COLOR;
	vec4 tex_color = texture(TEXTURE, UV);
	float shade = mix(top_multiplier, bottom_multiplier, UV.y);
	COLOR = vec4(tex_color.rgb * shade, tex_color.a) * modulate_color;
}
