# Task reporting v3

Compact dashboard. Each bucket is exact model × effort × estimated complexity; cycles close every 12 verified samples. Pricing is intentionally absent.

| Model | Effort | Est Cx | Closed cycles | Open n/12 | Fresh/continued | Median total | Median active time | Median wall time | Cache % | P90 | Median absolute estimate error | First-try |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| gpt-5.6-luna | xhigh | 3 | 0 | 1/12 | 1/0 | 6,877,080 | — | 10,838.201 | — | 6,877,080 | 6,847,080 | 100% |

Definitions: active time excludes human or approval waits; wall time includes them. Cache % is cached input ÷ input. First-try is receipt-linked retrieval. Complexity: 1=Routine, known-path change; 2=Bounded single-subsystem work; 3=Multi-component work or meaningful debugging uncertainty; 4=Cross-domain, integration-heavy, or high-risk behavior; 5=Architectural or exceptional multi-domain work with substantial compatibility or verification demands.
