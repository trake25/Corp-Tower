---
name: qa-engineer
description: The verification loop — src/Server/tests, the Godot GUT suites under Tests/Gut, CiSmokeTest, and the balance and stability CLIs in src/Server/tools. Use when writing or fixing tests, and as the done-check at the end of any other role's task.
---

# QA engineer

**Route:** [`testing.md`](../../../docs/context/testing.md) — it is inside budget
and holds the suite-by-suite coverage map. Read the section for the suite you are
touching, not the file.

Most tasks invoke this skill as their **gate**, not as standalone work.

## The gate

Run what the change touched. Server-only changes do not need the Godot run.

```bash
cd src/Server && npm test
```

```bash
./Godot_v4.6.2-stable_win64.exe --headless --path "src/Client/App/corp-tower" -s Tests/CiSmokeTest.gd
```

```bash
./Godot_v4.6.2-stable_win64.exe --headless --path "src/Client/App/corp-tower" -s addons/gut/gut_cmdln.gd -gdir=res://Tests/Gut -ginclude_subdirs -gexit
```

The smoke test loads every script under `Cor`/`Sys`, so it is the real syntax
gate for the client. **`--check-only --script <one file>` is not** — it registers
no autoloads, so anything referencing `NetworkManager` fails there whatever its
state. Do not read that as a parse error.

## Policy

- **A stale assertion is a bug in the test, not licence to change the source.**
  Source is truth. Prove which one is wrong before editing either — `git log -S`
  on the constant is usually enough.
- **Prefer an invariant to a hardcoded expected value.** A test that asserts
  conservation (what went in still adds up) survives a retune; one that asserts
  `=== 15` breaks on every tuning pass and teaches nothing when it does.
- **`reset_placeable_range()` in `before_each`** or a GUT suite inherits the
  previous test's grid.
- **Never make a test pass by weakening it.** If the gate is wrong, say so.

## Balance and stability CLIs

`src/Server/tools/Balance_Simulator.js` and `Stability_Probe.js` are tuning
instruments, not tests — they report distributions, not pass/fail. Invocation and
column meanings → `testing.md` § balance CLIs.

## Always

- **Report the actual output.** If a suite fails, specify which and paste it. A green
  claim over a red run is the one unrecoverable failure in this role.
