# Shared relation benchmark

Baseline: `a39b48db212db9c3756202ceea9ccb218ee2418a`. 7 rotated samples per variant after one warmup; v22.23.0, linux/arm64.

Engine rows compare whole calls against the named committed baseline, including validation, propagation, query planning and output construction. Kernel rows include relation compilation/indexing/projection; only the separator variant enables elimination. Semijoin rows compare complete propagation passes with a 10,000,000 work allowance. Every variant completed with matching relations, state counts or synthesis verdicts/counts/first witnesses. Timing assertions are not tests.

| Engine case | Median ms before → after | Speedup | Work or search states before → after |
|---|---:|---:|---:|
| behavior/separator-chain | 6.932 → 1.232 | 5.63× | 24574 → 213 |
| behavior/separator-star | 4.612 → 0.914 | 5.05× | 16386 → 90 |
| behavior/separator-cycle | 3.806 → 1.010 | 3.77× | 12290 → 207 |
| semijoin/overlap-128 | 0.121 → 0.075 | 1.61× | 1814 → 1814 |
| behavior/overlap-128 | 1.069 → 1.118 | 0.96× | 1 → 1 |
| semijoin/overlap-512 | 0.393 → 0.295 | 1.33× | 7190 → 7190 |
| behavior/overlap-512 | 4.605 → 4.011 | 1.15× | 1 → 1 |
| semijoin/overlap-1024 | 0.669 → 0.514 | 1.30× | 14358 → 14358 |
| behavior/overlap-1024 | 10.255 → 9.692 | 1.06× | 1 → 1 |
| behavior/tuple-chain | 8.894 → 8.701 | 1.02× | 1536 → 1536 |
| behavior/hidden-factors | 0.321 → 0.279 | 1.15× | 46 → 46 |
| behavior/small-connected-control | 0.040 → 0.034 | 1.19× | 3 → 3 |
| global/disconnected-contradiction | 0.158 → 0.157 | 1.00× | 307 → 307 |
| synthesis/safety | 5.040 → 5.151 | 0.98× | 32973 → 32973 |
| synthesis/coverage | 1.579 → 1.652 | 0.96× | 5213 → 5213 |
| synthesis/memoization | 45.867 → 45.682 | 1.00× | 79171 → 79171 |
| synthesis/coupled | 10.264 → 10.585 | 0.97× | 30946 → 30946 |
| synthesis/separators | 2.635 → 2.151 | 1.23× | 5303 → 2397 |

| Semijoin case | Row comparisons scan reference → indexed | Work committed baseline → indexed |
|---|---:|---:|
| semijoin/overlap-128 | 16384 → 0 | 1814 → 1814 |
| semijoin/overlap-512 | 262144 → 0 | 7190 → 7190 |
| semijoin/overlap-1024 | 1048576 → 0 | 14358 → 14358 |

| Kernel case | Variant | Row candidates | Search states | Median ms |
|---|---|---:|---:|---:|
| kernel/indexed-chain | scan | 129024 | 1440 | 4.031 |
| kernel/indexed-chain | index only | 1344 | 1440 | 1.348 |
| kernel/indexed-chain | single-column | 1344 | 1440 | 1.226 |
| kernel/indexed-chain | factors only | 129024 | 1440 | 4.164 |
| kernel/indexed-chain | index + factors | 1344 | 1440 | 1.212 |
| kernel/indexed-chain | separator elimination | 1344 | 1440 | 1.255 |
| kernel/tuple-chain | scan | 327680 | 1536 | 8.827 |
| kernel/tuple-chain | index only | 1280 | 1536 | 1.709 |
| kernel/tuple-chain | single-column | 20480 | 1536 | 3.361 |
| kernel/tuple-chain | factors only | 327680 | 1536 | 8.973 |
| kernel/tuple-chain | index + factors | 1280 | 1536 | 1.692 |
| kernel/tuple-chain | separator elimination | 1280 | 1536 | 2.163 |
| kernel/hidden-factors | scan | 32767 | 32768 | 6.671 |
| kernel/hidden-factors | index only | 32767 | 32768 | 6.648 |
| kernel/hidden-factors | single-column | 29 | 45 | 0.083 |
| kernel/hidden-factors | factors only | 29 | 45 | 0.054 |
| kernel/hidden-factors | index + factors | 29 | 45 | 0.052 |
| kernel/hidden-factors | separator elimination | 29 | 45 | 0.053 |
| kernel/boundary-factors | scan | 4096 | 2304 | 1.001 |
| kernel/boundary-factors | index only | 4096 | 2304 | 1.013 |
| kernel/boundary-factors | single-column | 32 | 288 | 0.835 |
| kernel/boundary-factors | factors only | 32 | 288 | 0.825 |
| kernel/boundary-factors | index + factors | 32 | 288 | 0.830 |
| kernel/boundary-factors | separator elimination | 32 | 288 | 0.829 |
| kernel/separator-chain | scan | 32760 | 16382 | 4.101 |
| kernel/separator-chain | index only | 32760 | 16382 | 3.943 |
| kernel/separator-chain | single-column | 32760 | 16382 | 3.907 |
| kernel/separator-chain | factors only | 32760 | 16382 | 3.847 |
| kernel/separator-chain | index + factors | 32760 | 16382 | 3.867 |
| kernel/separator-chain | separator elimination | 276 | 209 | 0.670 |
| kernel/separator-star | scan | 32760 | 16382 | 3.704 |
| kernel/separator-star | index only | 32760 | 16382 | 3.819 |
| kernel/separator-star | single-column | 32760 | 16382 | 3.760 |
| kernel/separator-star | factors only | 32760 | 16382 | 3.635 |
| kernel/separator-star | index + factors | 32760 | 16382 | 3.693 |
| kernel/separator-star | separator elimination | 96 | 86 | 0.301 |
| kernel/separator-cycle | scan | 32760 | 12286 | 3.393 |
| kernel/separator-cycle | index only | 32760 | 12286 | 3.365 |
| kernel/separator-cycle | single-column | 32760 | 12286 | 3.256 |
| kernel/separator-cycle | factors only | 32760 | 12286 | 3.491 |
| kernel/separator-cycle | index + factors | 32760 | 12286 | 3.247 |
| kernel/separator-cycle | separator elimination | 272 | 203 | 0.549 |

| Elimination case | Planning and evaluation work | Allocated cells | Separator width | Message rows |
|---|---:|---:|---:|---:|
| kernel/separator-chain/separator elimination | 17386 | 7528 | 2 | 92 |
| kernel/separator-star/separator elimination | 2447 | 900 | 1 | 24 |
| kernel/separator-cycle/separator elimination | 16364 | 7018 | 2 | 90 |
| behavior/separator-chain/after | 17458 | 7534 | 2 | 92 |
| behavior/separator-star/after | 2585 | 934 | 1 | 24 |
| behavior/separator-cycle/after | 16524 | 7052 | 2 | 90 |

Independent hidden factors retain all global constraints and multiply exact internal-state counts; no boundary outputs are discarded. Separator messages count assignments of removed variables and retain bounded valid samples; this does not merge component/resource choices. Elimination has a separate bounded preprocessing allowance, like domain propagation; its work/cells are reported above, while search-state counts measure join visits. The output and state-sample sizes remain bounded. Timings include overhead, so the small connected control and synthesis cases expose regressions as well as improvements. These are synthetic workloads, not universal speed guarantees or physical validation.

Reproduce with `node --import tsx scripts/benchmark-relations.mjs --base a39b48d --output benchmarks/elimination`. Raw samples, counters and source hashes are in `latest.json`.
