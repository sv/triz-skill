# Shared relation benchmark

Baseline: `d7184d93bd966dc8171a9d0196a98e41e6fed6e3`. 7 rotated samples per variant after one warmup; v22.23.0, linux/arm64.

Engine rows compare whole calls against the named committed baseline, including validation, propagation, query planning and output construction. Kernel rows include relation compilation/indexing/projection; the single-column variant disables compound keys. Semijoin rows compare complete propagation passes with a 10,000,000 work allowance. Every variant completed with matching relations, state counts or synthesis verdicts/counts/first witnesses. Timing assertions are not tests.

| Engine case | Median ms before → after | Speedup | Work or search states before → after |
|---|---:|---:|---:|
| semijoin/overlap-128 | 2.126 → 0.088 | 24.05× | 33937 → 1814 |
| behavior/overlap-128 | 3.263 → 1.217 | 2.68× | 1 → 1 |
| semijoin/overlap-512 | 8.971 → 0.361 | 24.82× | 528913 → 7190 |
| behavior/overlap-512 | 10.191 → 4.649 | 2.19× | 1 → 1 |
| semijoin/overlap-1024 | 21.170 → 0.724 | 29.23× | 2106385 → 14358 |
| behavior/overlap-1024 | 42.046 → 9.820 | 4.28× | 1025 → 1 |
| behavior/tuple-chain | 23.886 → 7.753 | 3.08× | 1536 → 1536 |
| behavior/hidden-factors | 3.020 → 0.348 | 8.68× | 32769 → 46 |
| behavior/small-connected-control | 0.031 → 0.034 | 0.89× | 3 → 3 |
| global/disconnected-contradiction | 1.258 → 0.189 | 6.65× | 50983 → 307 |
| synthesis/safety | 4.452 → 5.289 | 0.84× | 33401 → 32973 |
| synthesis/coverage | 1.407 → 1.608 | 0.88× | 5319 → 5213 |
| synthesis/memoization | 43.123 → 44.662 | 0.97× | 79115 → 79171 |
| synthesis/coupled | 9.098 → 9.705 | 0.94× | 30972 → 30946 |

| Semijoin case | Row comparisons scan reference → indexed | Work committed baseline → indexed |
|---|---:|---:|
| semijoin/overlap-128 | 16384 → 0 | 33937 → 1814 |
| semijoin/overlap-512 | 262144 → 0 | 528913 → 7190 |
| semijoin/overlap-1024 | 1048576 → 0 | 2106385 → 14358 |

| Kernel case | Variant | Row candidates | Search states | Median ms |
|---|---|---:|---:|---:|
| kernel/indexed-chain | scan | 129024 | 1440 | 4.289 |
| kernel/indexed-chain | index only | 1344 | 1440 | 1.602 |
| kernel/indexed-chain | single-column | 1344 | 1440 | 1.491 |
| kernel/indexed-chain | factors only | 129024 | 1440 | 4.405 |
| kernel/indexed-chain | index + factors | 1344 | 1440 | 1.594 |
| kernel/tuple-chain | scan | 327680 | 1536 | 8.666 |
| kernel/tuple-chain | index only | 1280 | 1536 | 1.714 |
| kernel/tuple-chain | single-column | 20480 | 1536 | 2.648 |
| kernel/tuple-chain | factors only | 327680 | 1536 | 9.333 |
| kernel/tuple-chain | index + factors | 1280 | 1536 | 1.630 |
| kernel/hidden-factors | scan | 32767 | 32768 | 6.461 |
| kernel/hidden-factors | index only | 32767 | 32768 | 6.458 |
| kernel/hidden-factors | single-column | 29 | 45 | 0.071 |
| kernel/hidden-factors | factors only | 29 | 45 | 0.053 |
| kernel/hidden-factors | index + factors | 29 | 45 | 0.052 |
| kernel/boundary-factors | scan | 4096 | 2304 | 1.001 |
| kernel/boundary-factors | index only | 4096 | 2304 | 1.001 |
| kernel/boundary-factors | single-column | 32 | 288 | 0.855 |
| kernel/boundary-factors | factors only | 32 | 288 | 0.829 |
| kernel/boundary-factors | index + factors | 32 | 288 | 0.817 |

Independent hidden factors retain all global constraints and multiply exact internal-state counts; no boundary outputs are discarded. The output and state-sample sizes remain bounded. Timings include overhead, so the small connected control and synthesis cases expose regressions as well as improvements. These are synthetic workloads, not universal speed guarantees or physical validation.

Reproduce with `node --import tsx scripts/benchmark-relations.mjs --base d7184d9 --output benchmarks/relations`. Raw samples, counters and source hashes are in `latest.json`.
