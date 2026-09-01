# Testing

Scope: permanent server, client and automation coverage; local selection; balance
tools; CI gates. Product behavior belongs in [backend.md](./backend.md),
[gameplay.md](./gameplay.md), and the UI documents.
Agent-facing verification, failure classification, permanent-coverage decisions,
and QA-infrastructure scope belong to the `qa-engineer` skill.

## Local selection

`node scripts/qa-gate.mjs --changed <task-owned-path>...` selects checks from the
explicit task scope. A changed test runs itself; shared or unmapped runtime code
widens to the affected domain suite. Client runtime checks always include
`CiSmokeTest.gd`. Headless checks establish correctness but cannot establish
visual fidelity.

Automation-protocol paths select focused Node test files through the same gate.
Successful child output stays captured; a failure reports the file and first
diagnostic while retaining the complete stream in a temporary log. Final
`task-close` scope uses the same selector but schedules the complete automation
protocol and retrieval benchmark.

Server changes receive `node --check` plus mapped Node tests. Client changes use
the repository-root host-matching Godot binary, smoke, and mapped GUT files.
Infra, docs and site-only work runs no game suite unless it creates runtime risk.
`qa-gate --plan --json` exposes the same deterministic selection without running
it. CI retains the full server and client domain gates.

## Server coverage

Server tests protect placement and block geometry, stability/scoring invariants,
authoritative gameplay events, Impact rollback, authentication/account/profile
boundaries, and multi-pod room lifecycle. The shared engine fixture owns pinned
configuration and cleanup. Tests under `tests/` and tools do not ship in the
server image.

Reconnect coverage keeps the current socket attached after a superseded socket
closes and proves targeted recovery snapshots do not consume transient events.

Geometry and stability suites must use fixed configuration rather than live
tunables. Preview and award paths must agree, score components must conserve
their transaction totals, and tests that assert exact event sets must isolate
unrelated live warning behavior.

## Godot coverage

The smoke script loads every client runtime script, the main scene, autoloads,
and required gameplay UI bindings. GUT protects the server/client placement
mirror, inventory and block behavior, deterministic collapse/pose logic, auth,
tutorial progression, gameplay state rendering including top-bar stability
feedback, and meaningful UI structure.
Native provider flows and visual fidelity remain release/manual coverage.

`SnapGrid` range is static state and must be reset around its suite. Private face
art is gitignored, so a local texture case may fail on a machine without imported
art even though CI, which imports assets first, passes. Render Tower Stack drag
and collapse behavior in addition to running headless tests; structural coverage
does not catch frame-level defects.

## Balance tools

Balance Simulator, Stability Probe, and Impact Probe are tuning instruments, not
pass/fail authorities. Run their host-aware npm entrypoints without arguments
first; the wrapper pilots the workload, enforces CPU/RAM and time budgets, emits
heartbeats, and keeps verbose output briefly in a dedicated OS-temp namespace.
It prunes stale or excess runs automatically, and never uses `task/` as automated
scratch storage. Expensive samples require explicit opt-in and a deadline.

The simulator constructs the real Game Engine and delegates decisions to the
shipped Bot Manager. Its per-player cooldown clock is part of the model: removing
it lets one bot place repeatedly and makes contribution results meaningless.
Bots reject collapsing moves and favor clean construction, so collapse rate,
completion, timeout, and gap-placement frequency are poor balance signals. Use
stability distributions and Impact contribution outcomes, and use playtests for
messy human gap repair.

## Automation and CI

Automation tests protect retrieval result states and budgets, manifest
ownership/close-out, explicit Git publication scope, map generation, and private
observability arithmetic and safety gates. `benchmark-rag.mjs --check` is the
end-to-end retrieval correctness and provider-byte gate.

Tutorial defaults have one cross-domain Node parity test. Local QA selects it as
contract coverage when server configuration, tutorial copy, or the parity files
change; this selection does not add the automation protocol or retrieval
benchmark. Actual automation-tooling paths retain those wider checks. Both EKS
server and Android release workflows invoke the parity test before build/deploy
work. Derived Level-1 mirrors come from server behavior rather than duplicated
formulas, and `debugStartLevel` is outside the tutorial contract.

Android deployment runs client smoke and required GUT before export. Server EKS
deployment runs the complete Node suite before image build and push.

## Known gaps

- Broader reconnect and gateway routing across pods lacks integration coverage.
- Most visual fidelity, Tower Stack drag state, and collapse framing require a
  rendered client rather than structural GUT assertions.
- Native/browser/device authentication remains manual release coverage.
