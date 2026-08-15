shader_type canvas_item;

uniform vec4 color_top : source_color = vec4(1.0);
uniform vec4 color_bottom : source_color = vec4(1.0);

void fragment() {
	COLOR.rgb = mix(color_top.rgb, color_bottom.rgb, clamp(UV.y, 0.0, 1.0));
}
