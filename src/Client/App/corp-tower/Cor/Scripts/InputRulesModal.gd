extends Control

func _ready() -> void:
	%CloseButton.pressed.connect(close_rules)
	visible = false

func open_rules(title: String, body: String) -> void:
	%TitleLabel.text = title
	%BodyLabel.text = body
	visible = true

func close_rules() -> void:
	visible = false
