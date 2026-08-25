# Task reporting v3

Each bucket groups one exact model, reasoning effort, and estimated complexity. A cycle closes after 12 verified samples. Token values use k/m units and time values use minutes; pricing is intentionally absent.

| Model | Reasoning effort | Estimated complexity | Completed cycles | Current rows (of 12) | First / continued sessions | Median actual tokens | Median active time | Median elapsed time | Cache hit rate | P90 actual tokens | Median estimate difference | First-try retrieval |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| gpt-5.6-terra | high | 4 | 0 | 1/12 | 1/0 | 5.136m | — | 10.3 min | 98.2% | 5.136m | 5.071m | 100% |

Definitions: estimated tokens are the provider usage recorded during context retrieval plus planned file changes. Actual tokens are the provider counter delta from the user instruction through close-out. Detailed input, cache, output, and reasoning measurements remain in the JSONL. Elapsed time runs from the user instruction to completion; active time excludes approval and human waits. Cache hit rate is cached input ÷ input. First-try retrieval is receipt-linked. — means unavailable. Complexity: 1=Routine, known-path change; 2=Bounded single-subsystem work; 3=Multi-component work or meaningful debugging uncertainty; 4=Cross-domain, integration-heavy, or high-risk behavior; 5=Architectural or exceptional multi-domain work with substantial compatibility or verification demands.
