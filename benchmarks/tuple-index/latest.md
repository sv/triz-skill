# Shared relation benchmark

Baseline: `3178d4b59a03f10139a2def223ce0884f707a84e`. 7 rotated samples per variant after one warmup; v22.23.0, linux/arm64.

Engine rows compare whole calls against the named committed baseline, including validation, propagation, query planning and output construction. Kernel rows include relation compilation/indexing/projection; the single-column variant disables compound keys. Semijoin rows compare complete propagation passes with a 10,000,000 work allowance. Every variant completed with matching relations, state counts or synthesis verdicts/counts/first witnesses. Timing assertions are not tests.

| Engine case | Median ms before → after | Speedup | Work or search states before → after |
|---|---:|---:|---:|
| semijoin/overlap-128 | 2.078 → 0.099 | 20.89× | 33937 → 1814 |
| behavior/overlap-128 | 3.263 → 1.103 | 2.96× | 1 → 1 |
| semijoin/overlap-512 | 5.399 → 0.271 | 19.96× | 528913 → 7190 |
| behavior/overlap-512 | 11.124 → 4.292 | 2.59× | 1 → 1 |
| semijoin/overlap-1024 | 20.695 → 0.631 | 32.80× | 2106385 → 14358 |
| behavior/overlap-1024 | 24.623 → 9.376 | 2.63× | 1025 → 1 |
| behavior/tuple-chain | 18.874 → 7.983 | 2.36× | 1536 → 1536 |
| behavior/hidden-factors | 0.338 → 0.322 | 1.05× | 46 → 46 |
| behavior/small-connected-control | 0.035 → 0.033 | 1.04× | 3 → 3 |
| global/disconnected-contradiction | 0.157 → 0.157 | 1.00× | 307 → 307 |
| synthesis/safety | 5.067 → 5.329 | 0.95× | 32973 → 32973 |
| synthesis/coverage | 1.509 → 1.665 | 0.91× | 5213 → 5213 |
| synthesis/memoization | 41.031 → 42.732 | 0.96× | 79171 → 79171 |
| synthesis/coupled | 9.850 → 9.631 | 1.02× | 30946 → 30946 |

| Semijoin case | Row comparisons scan reference → indexed | Work committed baseline → indexed |
|---|---:|---:|
| semijoin/overlap-128 | 16384 → 0 | 33937 → 1814 |
| semijoin/overlap-512 | 262144 → 0 | 528913 → 7190 |
| semijoin/overlap-1024 | 1048576 → 0 | 2106385 → 14358 |

| Kernel case | Variant | Row candidates | Search states | Median ms |
|---|---|---:|---:|---:|
| kernel/indexed-chain | scan | 129024 | 1440 | 3.893 |
| kernel/indexed-chain | index only | 1344 | 1440 | 1.302 |
| kernel/indexed-chain | single-column | 1344 | 1440 | 1.564 |
| kernel/indexed-chain | factors only | 129024 | 1440 | 3.763 |
| kernel/indexed-chain | index + factors | 1344 | 1440 | 1.527 |
| kernel/tuple-chain | scan | 327680 | 1536 | 8.399 |
| kernel/tuple-chain | index only | 1280 | 1536 | 1.711 |
| kernel/tuple-chain | single-column | 20480 | 1536 | 2.556 |
| kernel/tuple-chain | factors only | 327680 | 1536 | 8.828 |
| kernel/tuple-chain | index + factors | 1280 | 1536 | 1.690 |
| kernel/hidden-factors | scan | 32767 | 32768 | 6.233 |
| kernel/hidden-factors | index only | 32767 | 32768 | 6.272 |
| kernel/hidden-factors | single-column | 29 | 45 | 0.060 |
| kernel/hidden-factors | factors only | 29 | 45 | 0.050 |
| kernel/hidden-factors | index + factors | 29 | 45 | 0.050 |
| kernel/boundary-factors | scan | 4096 | 2304 | 0.982 |
| kernel/boundary-factors | index only | 4096 | 2304 | 0.984 |
| kernel/boundary-factors | single-column | 32 | 288 | 0.831 |
| kernel/boundary-factors | factors only | 32 | 288 | 0.822 |
| kernel/boundary-factors | index + factors | 32 | 288 | 0.825 |

Independent hidden factors retain all global constraints and multiply exact internal-state counts; no boundary outputs are discarded. The output and state-sample sizes remain bounded. Timings include overhead, so the small connected control and synthesis cases expose regressions as well as improvements. These are synthetic workloads, not universal speed guarantees or physical validation.

Reproduce with `node --import tsx scripts/benchmark-relations.mjs --base 3178d4b --output benchmarks/tuple-index`. Raw samples, counters and source hashes are in `latest.json`.
