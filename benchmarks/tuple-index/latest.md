# Shared relation benchmark

Baseline: `3178d4b59a03f10139a2def223ce0884f707a84e`. 7 rotated samples per variant after one warmup; v22.23.0, linux/arm64.

Engine rows compare whole calls against the named committed baseline, including validation, propagation, query planning and output construction. Kernel rows include relation compilation/indexing/projection; only the separator variant enables elimination. Semijoin rows compare complete propagation passes with a 10,000,000 work allowance. Every variant completed with matching relations, state counts or synthesis verdicts/counts/first witnesses. Timing assertions are not tests.

| Engine case | Median ms before → after | Speedup | Work or search states before → after |
|---|---:|---:|---:|
| behavior/separator-chain | 6.819 → 1.142 | 5.97× | 24574 → 213 |
| behavior/separator-star | 4.387 → 1.009 | 4.35× | 16386 → 90 |
| behavior/separator-cycle | 4.055 → 0.988 | 4.10× | 12290 → 207 |
| semijoin/overlap-128 | 1.991 → 0.088 | 22.56× | 33937 → 1814 |
| behavior/overlap-128 | 3.117 → 1.087 | 2.87× | 1 → 1 |
| semijoin/overlap-512 | 5.242 → 0.335 | 15.64× | 528913 → 7190 |
| behavior/overlap-512 | 13.315 → 4.320 | 3.08× | 1 → 1 |
| semijoin/overlap-1024 | 31.680 → 0.668 | 47.46× | 2106385 → 14358 |
| behavior/overlap-1024 | 25.860 → 9.809 | 2.64× | 1025 → 1 |
| behavior/tuple-chain | 22.517 → 9.047 | 2.49× | 1536 → 1536 |
| behavior/hidden-factors | 0.307 → 0.289 | 1.06× | 46 → 46 |
| behavior/small-connected-control | 0.037 → 0.038 | 0.97× | 3 → 3 |
| global/disconnected-contradiction | 0.228 → 0.224 | 1.02× | 307 → 307 |
| synthesis/safety | 4.854 → 5.027 | 0.97× | 32973 → 32973 |
| synthesis/coverage | 1.733 → 1.758 | 0.99× | 5213 → 5213 |
| synthesis/memoization | 42.778 → 44.440 | 0.96× | 79171 → 79171 |
| synthesis/coupled | 9.741 → 10.182 | 0.96× | 30946 → 30946 |
| synthesis/separators | 2.292 → 2.358 | 0.97× | 5303 → 2397 |

| Semijoin case | Row comparisons scan reference → indexed | Work committed baseline → indexed |
|---|---:|---:|
| semijoin/overlap-128 | 16384 → 0 | 33937 → 1814 |
| semijoin/overlap-512 | 262144 → 0 | 528913 → 7190 |
| semijoin/overlap-1024 | 1048576 → 0 | 2106385 → 14358 |

| Kernel case | Variant | Row candidates | Search states | Median ms |
|---|---|---:|---:|---:|
| kernel/indexed-chain | scan | 129024 | 1440 | 5.283 |
| kernel/indexed-chain | index only | 1344 | 1440 | 1.882 |
| kernel/indexed-chain | single-column | 1344 | 1440 | 1.309 |
| kernel/indexed-chain | factors only | 129024 | 1440 | 5.008 |
| kernel/indexed-chain | index + factors | 1344 | 1440 | 1.677 |
| kernel/indexed-chain | separator elimination | 1344 | 1440 | 1.805 |
| kernel/tuple-chain | scan | 327680 | 1536 | 10.436 |
| kernel/tuple-chain | index only | 1280 | 1536 | 2.338 |
| kernel/tuple-chain | single-column | 20480 | 1536 | 2.539 |
| kernel/tuple-chain | factors only | 327680 | 1536 | 9.515 |
| kernel/tuple-chain | index + factors | 1280 | 1536 | 1.848 |
| kernel/tuple-chain | separator elimination | 1280 | 1536 | 2.074 |
| kernel/hidden-factors | scan | 32767 | 32768 | 6.436 |
| kernel/hidden-factors | index only | 32767 | 32768 | 6.423 |
| kernel/hidden-factors | single-column | 29 | 45 | 0.077 |
| kernel/hidden-factors | factors only | 29 | 45 | 0.052 |
| kernel/hidden-factors | index + factors | 29 | 45 | 0.052 |
| kernel/hidden-factors | separator elimination | 29 | 45 | 0.052 |
| kernel/boundary-factors | scan | 4096 | 2304 | 1.019 |
| kernel/boundary-factors | index only | 4096 | 2304 | 1.013 |
| kernel/boundary-factors | single-column | 32 | 288 | 0.851 |
| kernel/boundary-factors | factors only | 32 | 288 | 0.840 |
| kernel/boundary-factors | index + factors | 32 | 288 | 0.850 |
| kernel/boundary-factors | separator elimination | 32 | 288 | 0.847 |
| kernel/separator-chain | scan | 32760 | 16382 | 3.884 |
| kernel/separator-chain | index only | 32760 | 16382 | 3.794 |
| kernel/separator-chain | single-column | 32760 | 16382 | 3.782 |
| kernel/separator-chain | factors only | 32760 | 16382 | 3.778 |
| kernel/separator-chain | index + factors | 32760 | 16382 | 3.718 |
| kernel/separator-chain | separator elimination | 276 | 209 | 0.692 |
| kernel/separator-star | scan | 32760 | 16382 | 3.681 |
| kernel/separator-star | index only | 32760 | 16382 | 3.623 |
| kernel/separator-star | single-column | 32760 | 16382 | 3.668 |
| kernel/separator-star | factors only | 32760 | 16382 | 3.544 |
| kernel/separator-star | index + factors | 32760 | 16382 | 3.597 |
| kernel/separator-star | separator elimination | 96 | 86 | 0.277 |
| kernel/separator-cycle | scan | 32760 | 12286 | 3.370 |
| kernel/separator-cycle | index only | 32760 | 12286 | 3.360 |
| kernel/separator-cycle | single-column | 32760 | 12286 | 3.214 |
| kernel/separator-cycle | factors only | 32760 | 12286 | 3.320 |
| kernel/separator-cycle | index + factors | 32760 | 12286 | 3.171 |
| kernel/separator-cycle | separator elimination | 272 | 203 | 0.647 |

| Elimination case | Planning and evaluation work | Allocated cells | Separator width | Message rows |
|---|---:|---:|---:|---:|
| kernel/separator-chain/separator elimination | 17386 | 7528 | 2 | 92 |
| kernel/separator-star/separator elimination | 2447 | 900 | 1 | 24 |
| kernel/separator-cycle/separator elimination | 16364 | 7018 | 2 | 90 |
| behavior/separator-chain/after | 17458 | 7534 | 2 | 92 |
| behavior/separator-star/after | 2585 | 934 | 1 | 24 |
| behavior/separator-cycle/after | 16524 | 7052 | 2 | 90 |

Independent hidden factors retain all global constraints and multiply exact internal-state counts; no boundary outputs are discarded. Separator messages count assignments of removed variables and retain bounded valid samples; this does not merge component/resource choices. Elimination has a separate bounded preprocessing allowance, like domain propagation; its work/cells are reported above, while search-state counts measure join visits. The output and state-sample sizes remain bounded. Timings include overhead, so the small connected control and synthesis cases expose regressions as well as improvements. These are synthetic workloads, not universal speed guarantees or physical validation.

Reproduce with `node --import tsx scripts/benchmark-relations.mjs --base 3178d4b --output benchmarks/tuple-index`. Raw samples, counters and source hashes are in `latest.json`.
