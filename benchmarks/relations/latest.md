# Shared relation benchmark

Baseline: `d7184d93bd966dc8171a9d0196a98e41e6fed6e3`. 7 rotated samples per variant after one warmup; v22.23.0, linux/arm64.

Engine rows compare whole calls against the committed pre-refactor implementation, including validation, propagation, query planning and output construction. Kernel rows include relation compilation/indexing/projection and isolate the two optimizations. Every variant completed with matching relations, state counts or synthesis verdicts/counts/first witnesses. Timing assertions are not tests.

| Engine case | Median ms before → after | Speedup | Work or search states before → after |
|---|---:|---:|---:|
| behavior/hidden-factors | 2.710 → 0.415 | 6.53× | 32769 → 46 |
| behavior/small-connected-control | 0.036 → 0.039 | 0.91× | 3 → 3 |
| global/disconnected-contradiction | 1.308 → 0.208 | 6.30× | 50983 → 307 |
| synthesis/safety | 4.477 → 5.452 | 0.82× | 33401 → 32973 |
| synthesis/coverage | 1.564 → 1.703 | 0.92× | 5319 → 5213 |
| synthesis/memoization | 43.422 → 42.411 | 1.02× | 79115 → 79171 |
| synthesis/coupled | 10.397 → 11.043 | 0.94× | 30972 → 30946 |

| Kernel case | Variant | Row candidates | Search states | Median ms |
|---|---|---:|---:|---:|
| kernel/indexed-chain | scan | 129024 | 1440 | 3.763 |
| kernel/indexed-chain | index only | 1344 | 1440 | 0.916 |
| kernel/indexed-chain | factors only | 129024 | 1440 | 3.711 |
| kernel/indexed-chain | index + factors | 1344 | 1440 | 1.048 |
| kernel/hidden-factors | scan | 32767 | 32768 | 6.312 |
| kernel/hidden-factors | index only | 32767 | 32768 | 6.313 |
| kernel/hidden-factors | factors only | 29 | 45 | 0.065 |
| kernel/hidden-factors | index + factors | 29 | 45 | 0.050 |
| kernel/boundary-factors | scan | 4096 | 2304 | 1.068 |
| kernel/boundary-factors | index only | 4096 | 2304 | 1.114 |
| kernel/boundary-factors | factors only | 32 | 288 | 0.853 |
| kernel/boundary-factors | index + factors | 32 | 288 | 0.848 |

Independent hidden factors retain all global constraints and multiply exact internal-state counts; no boundary outputs are discarded. The output and state-sample sizes remain bounded. Timings include overhead, so the small connected control and synthesis cases expose regressions as well as improvements. These are synthetic workloads, not universal speed guarantees or physical validation.

Reproduce with `node --import tsx scripts/benchmark-relations.mjs --base d7184d9`. Raw samples, counters and source hashes are in `latest.json`.
