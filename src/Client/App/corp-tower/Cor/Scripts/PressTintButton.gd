extends TextureButton

const PRESSED_TINT := Color(0.518, 0.902, 0.976, 1)
const NORMAL_TINT := Color(1, 1, 1, 1)

func _ready() -> void:
	button_down.connect(func(): modulate = PRESSED_TINT)
	button_up.connect(func(): modulate = NORMAL_TINT)
