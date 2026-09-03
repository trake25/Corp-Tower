# Corp Tower experimental concept KB

`KB/` is a working parallel knowledge base for local concept-retrieval
experiments. It is tracked documentation, but it is not authoritative and is
not part of the default agent retrieval corpus.

The current production path remains:

`AGENTS.md → docs/context/index.md → docs/context prose → current locator maps`

The opt-in experimental path is:

`KB/docs/context/index.md → concept leaf → generated concept map → bounded source`

## Implemented tooling

- `node scripts/build-concept-map.mjs` parses authored concept metadata,
  resolves exact source anchors, writes ten domain maps, and replaces only the
  marked generated router block in `KB/docs/context/index.md`.
- `node scripts/build-concept-map.mjs --check --quiet` proves generated output
  is current without writing it.
- `node scripts/validate-concept-kb.mjs` validates identity, aliases, leaf
  ownership, adjacency, source grants, isolation, budgets, maps, and router
  equality independently from the primary KB validator.
- `node scripts/context.mjs concept-route <id-or-alias>` returns exact route,
  map, source-grant, and adjacency metadata.
- `concept-read` adds only the owning prose leaf. `concept-bundle` writes a
  bounded handoff under `.agent-state/automation/`. Neither traverses adjacent
  concepts automatically.
- `node scripts/benchmark-rag.mjs --concept-check` runs the parallel concept
  fixtures. The command without this option retains the legacy benchmark.

## Authored metadata

A retrievable leaf is preceded by one canonical metadata block:

```md
<!-- kb
id: hud.tower.collapse.presentation
alias: collapse framing
source: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd#_begin_collapse
adjacent: hud.tower.collapse.recovery
-->
## Collapse presentation
```

Concept IDs, aliases, source grants, and adjacency are authored only beside the
owning prose. Document ranges, map rows, source lines, router tables, and the
reverse source index are derived. Every ready concept has at least one exact
source grant; `#@file` migration seeds are rejected.

Concept source grants cannot enter `report/`, `repair/`, `plan/`, `task/`,
`reference/`, `.agent-state/`, or this `KB/` tree. Adjacency is a directed choice
for another explicit route call, never permission to load neighboring prose.

## Experimental budgets

The concept prose section hard limit is 6 KiB. Concept commands default to a
12 KiB response and accept at most 24 KiB. The experimental Markdown line
ceiling is 400 characters, as separately authorized for this new KB; the
primary `docs/context/**` limits are unchanged.

Cloud ChatGPT/Claude activation and model/task-router redesign remain deferred.
