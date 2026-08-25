# Task reporting v3

Each bucket is exact model × effort × estimated complexity; cycles close every 12 verified samples. Token values use k/m units; time values are minutes. Pricing is intentionally absent.

| Model | Effort | Estimated complexity | Closed cycles | Open rows/12 | First/continued sample | Median actual pool tokens | Median active (min) | Median wall (min) | Cache ratio | P90 actual pool tokens | Median absolute pool delta | First-try retrieval |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| gpt-5.6-luna | xhigh | 2 | 0 | 1/12 | 0/1 | 1.224m | — | 13.7 min | 99.3% | 1.224m | 1.216m | 100% |
| gpt-5.6-luna | xhigh | 3 | 0 | 1/12 | 1/0 | 6.877m | — | 29.1 min | — | 6.877m | 6.847m | 100% |
| gpt-5.6-luna | xhigh | 4 | 0 | 1/12 | 0/1 | 20.903m | — | 25.4 min | 98.1% | 20.903m | 20.058m | 100% |

Definitions: estimated pool tokens are measured provider usage from context retrieval plus planned file changes; actual pool tokens are the provider-reported total-token delta consumed from the usage pool over the task interval. Input, cached input, output, and reasoning breakdowns remain in the JSONL. A row marked legacy used the older pre-read estimate and is not pool-comparable. Wall time runs from the matching user instruction to task completion. First means the first v3 sample recorded in this runtime session; continued means another sample already existed. Active time excludes human or approval waits. Cache ratio is cached input ÷ input; — means unavailable. First-try is receipt-linked retrieval. Complexity: 1=Routine, known-path change; 2=Bounded single-subsystem work; 3=Multi-component work or meaningful debugging uncertainty; 4=Cross-domain, integration-heavy, or high-risk behavior; 5=Architectural or exceptional multi-domain work with substantial compatibility or verification demands.
