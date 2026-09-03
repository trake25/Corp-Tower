# Draft audit

- Prose docs: 12
- Concepts: 185
- Concepts with no authored source seed yet: 23
- Source seeds: 202
- Exact/stable-anchor seeds already named: 6
- Coarse `#@file` seeds requiring repo-side refinement: 196
- Concept-map draft files: 10
- Unresolved adjacency references: 0

## Required repo-side proof before adoption

1. Parse and validate every concept metadata block.
2. Confirm global ID uniqueness and deterministic alias resolution.
3. Resolve any missing/ambiguous adjacency intentionally.
4. Validate every authored source filename against current source.
5. Replace/refine coarse `#@file` source seeds with exact stable anchors where the concept needs implementation evidence.
6. Add source anchors to concepts intentionally left without a seed.
7. Generate line-numbered concept maps from current source.
8. Generate the `index.md` router block from metadata and compare with this snapshot.
9. Extend KB validation for concept/map/source/isolation integrity.
10. Keep existing locator maps valid throughout migration.
