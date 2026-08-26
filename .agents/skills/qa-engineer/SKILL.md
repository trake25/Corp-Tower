---
name: qa-engineer
description: The verification loop — src/Server/tests, the Godot GUT suites under Tests/Gut, CiSmokeTest, and the balance and stability CLIs in src/Server/tools. Use when writing or fixing tests, and as the done-check at the end of any other role's task.
---

# QA engineer

Most tasks invoke this skill as their **gate**, not as standalone work. The
manifest's post-edit `review` supplies the final-path testing context and QA
selection; run `qa-gate` directly only for iterative feedback before `close`.

## The gate

Verify the files owned by this task, not every pre-existing dirty file.
`qa-gate --plan --json` is the shared deterministic selection used by
`task-close close`; do not recreate the mapping in an agent response.

For a changed-source task, run `node scripts/qa-gate.mjs --changed <task-owned-path>...`
with every task-owned changed path stated explicitly. It selects this matrix,
prints one compact result on success, and saves verbose failure output under
`/tmp`; read that file only after a failure. It never derives scope from a dirty
working tree. Broaden the gate when the task's integration risk exceeds the
path mapping.

- Server: `node --check` each changed JavaScript file, then run the mapped tests.
- Client: run the smoke test plus mapped GUT files. A changed test runs itself.
- Unmapped or shared-core runtime code runs the full affected-domain suite.
- Infra, docs and site-only work runs neither game suite unless it changes a
  client artifact or presents a client runtime risk that Godot can validate.

For a complex task, decide whether Godot can exercise the integration risk and
use it when it can. Complex UI, screen, scene/autoload and asset integration
always require headless smoke/related GUT before a live rendered comparison.
Headless verification is the correctness gate; rendered comparison supplements
it for clipping, overlap, scale, and visual fidelity and never replaces it. On a
sandboxed Linux host, use the guarded procedure in
[`client-engineer/references/ui-screenshots.md`](../client-engineer/references/ui-screenshots.md)
before declaring the host display unavailable.

The local Godot binary is in the repository root on both platforms. Select the
newest host-matching file — `Godot_v*_linux.x86_64` on Linux or
`Godot_v*_win64.exe` on Windows — and never hardcode its version or silently use
a system Godot. Stop with the missing pattern if no match exists. On restricted
Linux hosts, request the host execution boundary before the first Godot-based
gate when sandbox execution is known to be unavailable; do not spend a failing
sandbox attempt to rediscover that constraint. Prefix the approved command with
an `XDG_DATA_HOME` under `/tmp` if Godot cannot write `user://logs`.

Test process time does not spend model tokens; retained stdout/stderr does.
Compact successful runs, then rerun a failure with normal output and report it
in full. Read [`references/test-commands.md`](references/test-commands.md) when
you need the platform-specific command forms.

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
- `npm test` and the full GUT directory remain the complete domain gates for CI
  and for local fallback; targeted local verification never narrows deployment CI.
