# KB Tree integrity

KB Tree is the production knowledge root for ChatGPT/Codex. Its executable
checks prove concept identity, exact alias routing, bounded source grants,
explicit adjacency, generated map/router equality, and fail-closed failures.

Run:

```sh
node scripts/build-concept-map.mjs --check --quiet
node scripts/validate-concept-kb.mjs --quiet
node scripts/benchmark-rag.mjs --concept-check
```

The benchmark records only sanitized local footprint metrics. It neither grants
repository access nor turns measurements into correctness thresholds. Working
material, private state, and reports remain outside KB Tree evidence.
