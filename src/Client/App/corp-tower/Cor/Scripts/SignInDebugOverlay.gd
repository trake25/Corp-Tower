extends Control

const DebugPanelControllerScript = preload("res://Cor/Scripts/GameUi/DebugPanelController.gd")

var panel: PanelContainer
var category_dropdown: OptionButton
var native_google_toggle: CheckButton

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	_build()

func toggle() -> void:
	set_open(not visible)

func set_open(open: bool) -> void:
	visible = open
	if open:
		_refresh()

func _build() -> void:
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.04, 0.09, 0.82)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.gui_input.connect(_on_dim_input)
	add_child(dim)

	panel = PanelContainer.new()
	panel.custom_minimum_size = Vector2(320, 250)
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.position = Vector2(-160, -125)
	add_child(panel)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 20)
	margin.add_theme_constant_override("margin_top", 18)
	margin.add_theme_constant_override("margin_right", 20)
	margin.add_theme_constant_override("margin_bottom", 18)
	panel.add_child(margin)

	var rows := VBoxContainer.new()
	rows.add_theme_constant_override("separation", 12)
	margin.add_child(rows)

	var header := HBoxContainer.new()
	rows.add_child(header)
	var title := Label.new()
	title.text = "Debug"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_size_override("font_size", 22)
	header.add_child(title)
	var close := Button.new()
	close.text = "Close"
	close.pressed.connect(func(): set_open(false))
	header.add_child(close)

	category_dropdown = OptionButton.new()
	category_dropdown.name = "DebugCategoryDropdown"
	for i in range(DebugPanelControllerScript.DEBUG_CATEGORY_NAMES.size()):
		var category_name: String = DebugPanelControllerScript.DEBUG_CATEGORY_NAMES[i]
		category_dropdown.add_item(category_name, i)
		category_dropdown.set_item_disabled(i, category_name != "Sign In")
	category_dropdown.select(DebugPanelControllerScript.DEBUG_CATEGORY_NAMES.find("Sign In"))
	rows.add_child(category_dropdown)

	var section_title := Label.new()
	section_title.text = "Sign In"
	section_title.add_theme_font_size_override("font_size", 18)
	rows.add_child(section_title)

	native_google_toggle = CheckButton.new()
	native_google_toggle.name = "NativeGoogleToggle"
	native_google_toggle.text = "Use native Android Google sign-in"
	native_google_toggle.toggled.connect(_on_native_google_toggled)
	rows.add_child(native_google_toggle)

	var detail := Label.new()
	detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail.text = "Off forces Google sign-in through the browser OAuth flow on this device."
	rows.add_child(detail)

	_refresh()

func _refresh() -> void:
	if native_google_toggle == null:
		return

	native_google_toggle.set_pressed_no_signal(AuthManager.is_native_google_enabled())
	var is_android := OS.get_name() == "Android"
	native_google_toggle.disabled = not is_android
	if not is_android:
		native_google_toggle.text = "Use native Android Google sign-in (Android only)"

func _on_native_google_toggled(enabled: bool) -> void:
	AuthManager.set_native_google_enabled(enabled)

func _on_dim_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		set_open(false)
