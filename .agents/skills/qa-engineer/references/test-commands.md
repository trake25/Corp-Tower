# Local verification commands

Run commands from the repository root. Replace placeholders with the files
selected by `docs/context/testing.md`.

Server targeted tests:

```bash
cd src/Server
node --test --test-reporter=dot <mapped-test-files>
```

Godot smoke test:

```bash
"$GODOT_BIN" --headless --path src/Client/App/corp-tower -s Tests/CiSmokeTest.gd
```

Targeted GUT:

```bash
"$GODOT_BIN" --headless --path src/Client/App/corp-tower -s addons/gut/gut_cmdln.gd -gtest=res://Tests/Gut/<mapped-test>.gd -glog=0 -gdisable_colors -gexit
```

On a restricted Linux host, set a task-specific temporary `XDG_DATA_HOME`; do
not change the user's normal Godot data directory.
