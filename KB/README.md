# Corp Tower KB Tree

`KB/` is the production knowledge root for the ChatGPT/Codex workflow. KB Tree
contextualization starts at `KB/docs/context/index.md` and resolves one concept
at a time:

`concept router → owning prose leaf → generated concept map → bounded source`

The filesystem root remains `KB/`; **KB Tree** is the workflow and product name.
Concept adjacency names a possible next route, never an automatic read. Source
owns exact implementation detail and current values. Working material is not KB
evidence.

## Tooling

- `node scripts/build-concept-map.mjs` derives concept maps and the marked
  router block. `--check --quiet` verifies equality without writing.
- `node scripts/validate-concept-kb.mjs --quiet` validates identity, aliases,
  leaf ownership, source grants, adjacency, isolation, budgets, and generated
  output.
- `node scripts/context.mjs concept-route <id-or-exact-alias>` returns the
  exact route, map, source grant, and explicit adjacency. `concept-read` adds
  only its leaf; `concept-bundle` writes an intentionally bounded handoff under
  `.agent-state/automation/`.
- `node scripts/benchmark-rag.mjs --concept-check` proves representative exact
  routes and fail-closed behavior while recording sanitized local metrics.

Concept metadata is authored beside its owning leaf. Source line numbers,
bounded read commands, generated maps, and the router table are derived; do not
hand-edit them. See `KB/docs/context/CONCEPT-SCHEMA.md` for the full contract.
