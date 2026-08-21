# Linux/X11 screenshot verification

Use this only when `DISPLAY` points to a live X11 session and `ffmpeg` and
`wmctrl` are already installed. Do not install desktop tooling as part of an
ordinary UI task.

Select the newest repository Godot binary, launch the game, locate the window,
and capture only that window:

```bash
GODOT_BIN=$(find . -maxdepth 1 -type f -name 'Godot_v*_linux.x86_64' -print | sort -V | tail -1)
nohup "$GODOT_BIN" --path src/Client/App/corp-tower >/tmp/corp-tower-godot.log 2>&1 &
sleep 6
wmctrl -a "Godot"
read -r _ _ X Y W H _ < <(wmctrl -l -G | rg -i -m1 godot)
ffmpeg -y -f x11grab -video_size "${W}x${H}" -i ":0.0+${X},${Y}" -frames:v 1 -update 1 /tmp/corp-tower-shot.png
pkill -f "$(basename "$GODOT_BIN")"
```

Inspect `/tmp/corp-tower-shot.png` with the active agent's image-viewing
capability. A full-desktop capture can expose unrelated windows and is forbidden.
