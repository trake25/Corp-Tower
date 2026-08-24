# Pressed state

Read this only when creating or changing a control's pressed treatment.

- Bare `TextureButton`s have no StyleBox; attach
  `Cor/Scripts/PressTintButton.gd`.
- Card `Button`s use a `styles/pressed` StyleBox.
- Use `Color(0.518, 0.902, 0.976, 1)` consistently. The card theme resource is
  `StyleBoxFlat_MenuCardPressed` in `GameUITheme.tres`.
