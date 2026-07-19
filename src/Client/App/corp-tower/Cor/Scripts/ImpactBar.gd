extends Control

@onready var fill: TextureRect = %ImpactBarFill

var gradient: Gradient
var gradient_texture: GradientTexture2D

func _ready() -> void:
	gradient = Gradient.new()
	gradient.offsets = PackedFloat32Array([0.0, 1.0])
	gradient.colors = PackedColorArray([Color.WHITE, Color.WHITE])

	gradient_texture = GradientTexture2D.new()
	gradient_texture.gradient = gradient
	gradient_texture.width = 8
	gradient_texture.height = 256
	gradient_texture.fill_from = Vector2(0, 0)
	gradient_texture.fill_to = Vector2(0, 1)

	fill.texture = gradient_texture

func set_bar(seat_color: Color, ratio: float) -> void:
	gradient.set_color(0, seat_color.lightened(0.32))
	gradient.set_color(1, seat_color.darkened(0.12))

	fill.anchor_top = 1.0 - clampf(ratio, 0.0, 1.0)
