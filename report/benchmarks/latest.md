# RAG benchmark — latest

Generated 2026-08-21T01:55:35.614Z. This deterministic run tests the shared router and bounded map queries; it does not claim provider token usage or prove that a particular agent UI auto-loaded a skill.

- Retrieval correctness: 6/6
- First-route hit: 6/6
- Repository fallbacks: 0
- Whole-document reads: 0
- Median estimated retrieval cost: 113 tokens
- Expected skill routes: 8/8
- Exact provider usage: unavailable (recorded as null)

## Flaws and recommendations

This run cannot observe model-side skill activation, cache use, or provider billing because the local router exposes none of those fields. Run the same fixtures through fresh Codex and Claude sessions when their authenticated clients are available, keep raw JSONL under the ignored raw directory, and normalize those results without replacing null values with estimates.
