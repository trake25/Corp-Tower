# RAG benchmark — latest

Generated 2026-08-26T01:24:01.348Z. This deterministic run tests the shared router, bounded retrieval protocol, source-target handoff, and provider-facing text. It does not claim provider billing or prove that a particular agent UI auto-loaded a skill.

- Retrieval correctness: 6/6
- First-route hit: 6/6
- Expected skill routes: 8/8
- Protocol fixtures: 5/5
- Complete retrieval sessions: 5/5
- Repository fallbacks used: 0
- Whole-document reads: 0
- Legacy map median: ~113 tokens
- Provider-facing session median: 293 bytes (~73 tokens)
- Saved baseline: 452 bytes
- Reduction from baseline: 35.2% (target met)
- Exact provider usage: unavailable (recorded as null)

## Measurement boundary

Provider-facing bytes count the exact compact text produced by route and search steps in each deterministic session. The local runner cannot observe model-side skill activation, cache use, tokenizer behavior, or provider billing, so exact provider fields remain null rather than estimates.
