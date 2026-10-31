# Shared relation benchmark

Baseline: `d7184d93bd966dc8171a9d0196a98e41e6fed6e3`. 7 rotated samples per variant after one warmup; v22.23.0, linux/arm64.

Engine rows compare whole calls against the named committed baseline, including validation, propagation, query planning and output construction. Kernel rows include relation compilation/indexing/projection; only the separator variant enables elimination. Semijoin rows compare complete propagation passes with a 10,000,000 work allowance. Every variant completed with matching relations, state counts or synthesis verdicts/counts/first witnesses. Timing assertions are not tests.

| Engine case | Median ms before → after | Speedup | Work or search states before → after |
|---|---:|---:|---:|
| behavior/separator-chain | 3.070 → 1.222 | 2.51× | 24574 → 213 |
| behavior/separator-star | 2.535 → 1.017 | 2.49× | 24576 → 90 |
| behavior/separator-cycle | 1.969 → 0.985 | 2.00× | 16384 → 207 |
| semijoin/overlap-128 | 2.016 → 0.090 | 22.38× | 33937 → 1814 |
| behavior/overlap-128 | 2.913 → 1.083 | 2.69× | 1 → 1 |
| semijoin/overlap-512 | 8.992 → 0.372 | 24.15× | 528913 → 7190 |
| behavior/overlap-512 | 13.994 → 4.357 | 3.21× | 1 → 1 |
| semijoin/overlap-1024 | 32.399 → 0.650 | 49.85× | 2106385 → 14358 |
| behavior/overlap-1024 | 45.128 → 9.839 | 4.59× | 1025 → 1 |
| behavior/tuple-chain | 24.438 → 7.298 | 3.35× | 1536 → 1536 |
| behavior/hidden-factors | 2.585 → 0.326 | 7.93× | 32769 → 46 |
| behavior/small-connected-control | 0.029 → 0.035 | 0.83× | 3 → 3 |
| global/disconnected-contradiction | 1.268 → 0.198 | 6.39× | 50983 → 307 |
| synthesis/safety | 4.675 → 4.713 | 0.99× | 33401 → 32973 |
| synthesis/coverage | 1.320 → 1.442 | 0.92× | 5319 → 5213 |
| synthesis/memoization | 41.451 → 43.830 | 0.95× | 79115 → 79171 |
| synthesis/coupled | 10.138 → 10.973 | 0.92× | 30972 → 30946 |
| synthesis/separators | 2.092 → 2.175 | 0.96× | 5303 → 2397 |

| Semijoin case | Row comparisons scan reference → indexed | Work committed baseline → indexed |
|---|---:|---:|
| semijoin/overlap-128 | 16384 → 0 | 33937 → 1814 |
| semijoin/overlap-512 | 262144 → 0 | 528913 → 7190 |
| semijoin/overlap-1024 | 1048576 → 0 | 2106385 → 14358 |

| Kernel case | Variant | Row candidates | Search states | Median ms |
|---|---|---:|---:|---:|
| kernel/indexed-chain | scan | 129024 | 1440 | 3.868 |
| kernel/indexed-chain | index only | 1344 | 1440 | 1.242 |
| kernel/indexed-chain | single-column | 1344 | 1440 | 1.253 |
| kernel/indexed-chain | factors only | 129024 | 1440 | 3.723 |
| kernel/indexed-chain | index + factors | 1344 | 1440 | 1.162 |
| kernel/indexed-chain | separator elimination | 1344 | 1440 | 1.663 |
| kernel/tuple-chain | scan | 327680 | 1536 | 8.552 |
| kernel/tuple-chain | index only | 1280 | 1536 | 2.141 |
| kernel/tuple-chain | single-column | 20480 | 1536 | 2.579 |
| kernel/tuple-chain | factors only | 327680 | 1536 | 8.973 |
| kernel/tuple-chain | index + factors | 1280 | 1536 | 1.592 |
| kernel/tuple-chain | separator elimination | 1280 | 1536 | 1.615 |
| kernel/hidden-factors | scan | 32767 | 32768 | 6.435 |
| kernel/hidden-factors | index only | 32767 | 32768 | 6.501 |
| kernel/hidden-factors | single-column | 29 | 45 | 0.076 |
| kernel/hidden-factors | factors only | 29 | 45 | 0.054 |
| kernel/hidden-factors | index + factors | 29 | 45 | 0.053 |
| kernel/hidden-factors | separator elimination | 29 | 45 | 0.053 |
| kernel/boundary-factors | scan | 4096 | 2304 | 1.033 |
| kernel/boundary-factors | index only | 4096 | 2304 | 1.019 |
| kernel/boundary-factors | single-column | 32 | 288 | 0.872 |
| kernel/boundary-factors | factors only | 32 | 288 | 0.843 |
| kernel/boundary-factors | index + factors | 32 | 288 | 0.876 |
| kernel/boundary-factors | separator elimination | 32 | 288 | 0.840 |
| kernel/separator-chain | scan | 32760 | 16382 | 3.894 |
| kernel/separator-chain | index only | 32760 | 16382 | 3.888 |
| kernel/separator-chain | single-column | 32760 | 16382 | 3.887 |
| kernel/separator-chain | factors only | 32760 | 16382 | 3.787 |
| kernel/separator-chain | index + factors | 32760 | 16382 | 3.777 |
| kernel/separator-chain | separator elimination | 276 | 209 | 0.666 |
| kernel/separator-star | scan | 32760 | 16382 | 3.660 |
| kernel/separator-star | index only | 32760 | 16382 | 3.647 |
| kernel/separator-star | single-column | 32760 | 16382 | 3.664 |
| kernel/separator-star | factors only | 32760 | 16382 | 3.528 |
| kernel/separator-star | index + factors | 32760 | 16382 | 3.652 |
| kernel/separator-star | separator elimination | 96 | 86 | 0.258 |
| kernel/separator-cycle | scan | 32760 | 12286 | 3.454 |
| kernel/separator-cycle | index only | 32760 | 12286 | 3.248 |
| kernel/separator-cycle | single-column | 32760 | 12286 | 3.458 |
| kernel/separator-cycle | factors only | 32760 | 12286 | 3.246 |
| kernel/separator-cycle | index + factors | 32760 | 12286 | 3.435 |
| kernel/separator-cycle | separator elimination | 272 | 203 | 0.585 |

| Elimination case | Planning and evaluation work | Allocated cells | Separator width | Message rows |
|---|---:|---:|---:|---:|
| kernel/separator-chain/separator elimination | 17386 | 7528 | 2 | 92 |
| kernel/separator-star/separator elimination | 2447 | 900 | 1 | 24 |
| kernel/separator-cycle/separator elimination | 16364 | 7018 | 2 | 90 |
| behavior/separator-chain/after | 17458 | 7534 | 2 | 92 |
| behavior/separator-star/after | 2585 | 934 | 1 | 24 |
| behavior/separator-cycle/after | 16524 | 7052 | 2 | 90 |

Independent hidden factors retain all global constraints and multiply exact internal-state counts; no boundary outputs are discarded. Separator messages count assignments of removed variables and retain bounded valid samples; this does not merge component/resource choices. Elimination has a separate bounded preprocessing allowance, like domain propagation; its work/cells are reported above, while search-state counts measure join visits. The output and state-sample sizes remain bounded. Timings include overhead, so the small connected control and synthesis cases expose regressions as well as improvements. These are synthetic workloads, not universal speed guarantees or physical validation.

Reproduce with `node --import tsx scripts/benchmark-relations.mjs --base d7184d9 --output benchmarks/relations`. Raw samples, counters and source hashes are in `latest.json`.
