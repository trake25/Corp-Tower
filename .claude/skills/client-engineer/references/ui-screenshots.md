# Guarded Linux/X11 rendered verification

Use rendered verification only when the current task requires visual evidence
for the repository application or UI state being changed. It supplements, and
never replaces, the headless smoke and related test gate. Do not run it when the
user prohibits GUI execution.

## Safety boundary

- Launch only the repository application required by the task.
- Request approval immediately before any host-level or unsandboxed diagnostic,
  launch, window query, or capture required by the agent environment.
- Scope that approval to the named application and this verification attempt.
- Never run `xhost +`, `xhost +local:`, copy Xauthority cookies, change socket or
  cookie permissions, disable authentication, or persist display credentials.
- Never read the clipboard, inject input, inspect unrelated windows, or capture
  the full desktop. Do not attach to an application instance the agent did not
  launch for the task.
- Store diagnostics and captures in a task-specific directory under `/tmp`.
- Track the exact launched PID and terminate only that PID. Never use `pkill`,
  `killall`, a name pattern, or another broad process selector.
- If window ownership or bounds cannot be resolved unambiguously, stop without
  capturing and report the specific failed check.

## Availability diagnostic

`DISPLAY` may be absent inside a coding-agent sandbox even when the same Linux
host has a working desktop. Diagnose before declaring rendered verification
unavailable:

1. Inspect `DISPLAY`, `XAUTHORITY`, `DBUS_SESSION_BUS_ADDRESS`, `id`, and
   `/tmp/.X11-unix`. Do not print cookie contents.
2. If the active environment is known to block X11 sockets or repository GUI
   execution, skip the sandbox probe and request the host execution boundary
   now; do not spend a failing probe to rediscover that constraint. Otherwise,
   if `DISPLAY` is set, run `xdpyinfo` in the current environment.
3. If `xdpyinfo` fails, or `DISPLAY` is empty while an X socket exists, resolve
   the active display and the current user's Xauthority path. Common local values
   are `:0` and the current user's `.Xauthority`, but verify rather than assuming.
4. With user approval, use the environment's host-level or unsandboxed execution
   mechanism for only this probe, passing explicit values:

   ```bash
   DISPLAY=:0 XAUTHORITY=/absolute/path/to/current-user/.Xauthority xdpyinfo
   ```

5. Continue only when the approved probe succeeds. The absence of inherited
   variables is not itself a reason to change host configuration.

In the Corp Tower development host, the validated local values are `DISPLAY=:0`
and `XAUTHORITY=/home/galaxxigames/.Xauthority`. They still require the active
agent environment's approval mechanism when sandbox policy blocks X11 sockets.

## Window-only capture

Use the newest repository Godot binary selected by the QA skill. Run the entire
GUI launch, window lookup, capture, and cleanup through the same approved host
execution boundary that passed `xdpyinfo`, with explicit `DISPLAY` and
`XAUTHORITY` values.

Launch the task-owned process, retain its PID, and wait only long enough for its
window to appear. Query `wmctrl -l -p -G` and accept exactly one window whose PID
matches the launched process. Filter by that PID inside the host command; never
print or retain unmatched window rows. Parse the matched row's x, y, width, and
height. Capture only that rectangle with `ffmpeg` into the task-specific `/tmp`
directory, then terminate the retained PID.

Do not fall back to title-only selection when multiple windows match. Do not use
a full-screen or full-desktop rectangle when PID lookup fails. Bring the window
forward only if the task's required UI state cannot otherwise render, and do not
send keys, clicks, or other input unless that interaction is explicitly within
the user's task.

Inspect the window-only image with the active agent's image-viewing capability.
Compare the task-owned surfaces for bounds, clipping, overlap, scaling,
typography, state visibility, and fidelity to the supplied design reference.
