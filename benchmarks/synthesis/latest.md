# Synthesis search benchmark

Synthetic finite fixed-wiring libraries. Every variant completed under identical work/state limits and matched exhaustive verdicts, satisfying counts and declaration-order first witnesses. Timings include parsing, preprocessing, independent declaration/certificate checking, propagation, validation, caching and result construction. Each request gets fresh caches. Offline Lean checks are reported separately.

Node v22.23.0, linux/arm64, unknown; 7 rotated samples after one warmup.

| Case | Full validations E / O / S | Union traces O → S | Summary states / transitions | Median ms E / O / S | O / S speedup |
|---|---:|---:|---:|---:|---:|
| safety | 256 / 1 / 1 | 512 → 512 | 0 / 0 | 100.64 / 3.06 / 3.11 | 0.98× |
| coverage | 243 / 1 / 1 | 32 → 32 | 0 / 0 | 56.50 / 1.11 / 1.14 | 0.98× |
| memoization | 256 / 256 / 256 | 4 → 4 | 6 / 5 | 67.46 / 36.07 / 37.86 | 0.95× |
| coupled | 64 / 32 / 32 | 128 → 4 | 14 / 23 | 27.75 / 20.72 / 18.57 | 1.12× |
| chain-2 | 4 / 2 / 2 | 8 → 4 | 6 / 7 | 1.62 / 1.38 / 1.67 | 0.82× |
| chain-4 | 16 / 8 / 8 | 32 → 4 | 10 / 15 | 6.78 / 3.98 / 4.16 | 0.96× |
| chain-8 | 256 / 128 / 128 | 512 → 4 | 18 / 31 | 64.86 / 37.37 / 36.61 | 1.02× |
| chain-10 | 1024 / 1024 / 512 | 2048 → 4 | 22 / 39 | 298.93 / 264.34 / 174.24 | 1.52× |
| library-2 | 8 / 4 / 4 | 16 → 4 | 8 / 11 | 1.74 / 1.00 / 1.25 | 0.80× |
| library-4 | 64 / 32 / 32 | 16 → 4 | 8 / 11 | 10.32 / 4.63 / 5.17 | 0.90× |
| library-8 | 512 / 256 / 256 | 16 → 4 | 8 / 11 | 66.78 / 28.42 / 28.55 | 1.00× |
| distinct-3 | 8 / 1 / 1 | 12 → 12 | 16 / 15 | 2.35 / 0.49 / 0.79 | 0.62× |
| distinct-5 | 32 / 1 / 1 | 20 → 20 | 64 / 63 | 15.15 / 0.99 / 1.97 | 0.50× |
| symbolic-work-fallback | 16 / 8 / 8 | 32 → 32 | 0 / 0 | 3.17 / 1.51 / 1.61 | 0.94× |
| symbolic-memory-fallback | 16 / 8 / 8 | 32 → 32 | 0 / 0 | 3.08 / 1.94 / 1.77 | 1.10× |

E = exhaustive; O = current optimized; S = checked symbolic. Unsupported or capped compilation falls back to optimized. Full validations still check original engineering choices; behavior grouping does not collapse their costs/resources.

## Trace, cache, and work accounting

| Case | Variant | All traces | Cache hits | Symbolic checks (work) | Retained symbolic chars | Work | Median ms |
|---|---|---:|---:|---:|---:|---:|---:|
| safety | exhaustive | 13636 | 0 | 0 | 0 | 276314 | 100.64 |
| safety | memoization only | 13122 | 257 | 0 | 0 | 267576 | 85.84 |
| safety | residual only | 520 | 0 | 0 | 0 | 33130 | 3.25 |
| safety | propagation only | 14150 | 0 | 0 | 0 | 303123 | 103.40 |
| safety | pruning without memoization | 520 | 0 | 0 | 0 | 33469 | 3.39 |
| safety | optimized | 516 | 2 | 0 | 0 | 33401 | 3.06 |
| safety | symbolic | 516 | 2 | 0 | 0 | 33947 | 3.11 |
| coverage | exhaustive | 8832 | 0 | 0 | 0 | 144173 | 56.50 |
| coverage | memoization only | 1024 | 244 | 0 | 0 | 89761 | 44.24 |
| coverage | residual only | 8896 | 0 | 0 | 0 | 147057 | 56.47 |
| coverage | propagation only | 160 | 0 | 0 | 0 | 5765 | 1.74 |
| coverage | pruning without memoization | 160 | 0 | 0 | 0 | 5765 | 1.23 |
| coverage | optimized | 96 | 2 | 0 | 0 | 5319 | 1.11 |
| coverage | symbolic | 96 | 2 | 0 | 0 | 5671 | 1.14 |
| memoization | exhaustive | 3072 | 0 | 0 | 0 | 98642 | 67.46 |
| memoization | memoization only | 4 | 767 | 0 | 0 | 77933 | 35.02 |
| memoization | residual only | 3080 | 0 | 0 | 0 | 99708 | 68.54 |
| memoization | propagation only | 3080 | 0 | 0 | 0 | 99824 | 65.66 |
| memoization | pruning without memoization | 3080 | 0 | 0 | 0 | 99824 | 70.17 |
| memoization | optimized | 12 | 767 | 0 | 0 | 79115 | 36.07 |
| memoization | symbolic | 12 | 767 | 1435 | 3815 | 100113 | 37.86 |
| coupled | exhaustive | 320 | 0 | 0 | 0 | 20692 | 27.75 |
| coupled | memoization only | 128 | 96 | 0 | 0 | 19060 | 13.26 |
| coupled | residual only | 322 | 0 | 0 | 0 | 20636 | 11.40 |
| coupled | propagation only | 322 | 0 | 0 | 0 | 28652 | 14.17 |
| coupled | pruning without memoization | 322 | 0 | 0 | 0 | 32060 | 12.73 |
| coupled | optimized | 194 | 64 | 0 | 0 | 30972 | 20.72 |
| coupled | symbolic | 70 | 64 | 822 | 4325 | 21957 | 18.57 |
| chain-2 | exhaustive | 20 | 0 | 0 | 0 | 736 | 1.62 |
| chain-2 | memoization only | 8 | 6 | 0 | 0 | 682 | 1.71 |
| chain-2 | residual only | 22 | 0 | 0 | 0 | 902 | 1.50 |
| chain-2 | propagation only | 22 | 0 | 0 | 0 | 955 | 1.18 |
| chain-2 | pruning without memoization | 22 | 0 | 0 | 0 | 976 | 0.71 |
| chain-2 | optimized | 14 | 4 | 0 | 0 | 940 | 1.38 |
| chain-2 | symbolic | 10 | 4 | 290 | 1673 | 1289 | 1.67 |
| chain-4 | exhaustive | 80 | 0 | 0 | 0 | 4000 | 6.78 |
| chain-4 | memoization only | 32 | 24 | 0 | 0 | 3688 | 6.89 |
| chain-4 | residual only | 82 | 0 | 0 | 0 | 4130 | 4.48 |
| chain-4 | propagation only | 82 | 0 | 0 | 0 | 5014 | 4.68 |
| chain-4 | pruning without memoization | 82 | 0 | 0 | 0 | 5386 | 4.34 |
| chain-4 | optimized | 50 | 16 | 0 | 0 | 5178 | 3.98 |
| chain-4 | symbolic | 22 | 16 | 548 | 2999 | 4894 | 4.16 |
| chain-8 | exhaustive | 1280 | 0 | 0 | 0 | 102760 | 64.86 |
| chain-8 | memoization only | 670 | 305 | 0 | 0 | 96355 | 56.46 |
| chain-8 | residual only | 1282 | 0 | 0 | 0 | 105446 | 43.06 |
| chain-8 | propagation only | 1282 | 0 | 0 | 0 | 162598 | 44.55 |
| chain-8 | pruning without memoization | 1282 | 0 | 0 | 0 | 186982 | 47.10 |
| chain-8 | optimized | 828 | 227 | 0 | 0 | 182215 | 37.37 |
| chain-8 | symbolic | 320 | 227 | 1112 | 5651 | 106169 | 36.61 |
| chain-10 | exhaustive | 5120 | 0 | 0 | 0 | 492988 | 298.93 |
| chain-10 | memoization only | 2990 | 1065 | 0 | 0 | 466363 | 260.89 |
| chain-10 | residual only | 7170 | 0 | 0 | 0 | 592988 | 305.44 |
| chain-10 | propagation only | 7170 | 0 | 0 | 0 | 592988 | 308.41 |
| chain-10 | pruning without memoization | 7170 | 0 | 0 | 0 | 592988 | 303.78 |
| chain-10 | optimized | 5040 | 1065 | 0 | 0 | 566363 | 264.34 |
| chain-10 | symbolic | 1890 | 594 | 1418 | 6977 | 517229 | 174.24 |
| library-2 | exhaustive | 40 | 0 | 0 | 0 | 1760 | 1.74 |
| library-2 | memoization only | 16 | 12 | 0 | 0 | 1628 | 1.35 |
| library-2 | residual only | 42 | 0 | 0 | 0 | 1924 | 1.61 |
| library-2 | propagation only | 42 | 0 | 0 | 0 | 2170 | 1.21 |
| library-2 | pruning without memoization | 42 | 0 | 0 | 0 | 2272 | 1.26 |
| library-2 | optimized | 26 | 8 | 0 | 0 | 2184 | 1.00 |
| library-2 | symbolic | 14 | 8 | 417 | 2336 | 2478 | 1.25 |
| library-4 | exhaustive | 320 | 0 | 0 | 0 | 13060 | 10.32 |
| library-4 | memoization only | 16 | 152 | 0 | 0 | 11388 | 6.53 |
| library-4 | residual only | 210 | 0 | 0 | 0 | 8508 | 7.54 |
| library-4 | propagation only | 210 | 0 | 0 | 0 | 9068 | 6.70 |
| library-4 | pruning without memoization | 210 | 0 | 0 | 0 | 9220 | 6.59 |
| library-4 | optimized | 26 | 92 | 0 | 0 | 8208 | 4.63 |
| library-4 | symbolic | 14 | 92 | 633 | 3064 | 11598 | 5.17 |
| library-8 | exhaustive | 2560 | 0 | 0 | 0 | 102716 | 66.78 |
| library-8 | memoization only | 16 | 1272 | 0 | 0 | 88724 | 41.72 |
| library-8 | residual only | 1554 | 0 | 0 | 0 | 59452 | 42.50 |
| library-8 | propagation only | 1554 | 0 | 0 | 0 | 61108 | 42.66 |
| library-8 | pruning without memoization | 1554 | 0 | 0 | 0 | 61396 | 43.05 |
| library-8 | optimized | 26 | 764 | 0 | 0 | 52992 | 28.42 |
| library-8 | symbolic | 14 | 764 | 1065 | 4520 | 88374 | 28.55 |
| distinct-3 | exhaustive | 102 | 0 | 0 | 0 | 3137 | 2.35 |
| distinct-3 | memoization only | 48 | 9 | 0 | 0 | 2822 | 2.30 |
| distinct-3 | residual only | 36 | 0 | 0 | 0 | 2548 | 0.71 |
| distinct-3 | propagation only | 36 | 0 | 0 | 0 | 2623 | 0.65 |
| distinct-3 | pruning without memoization | 36 | 0 | 0 | 0 | 2662 | 0.62 |
| distinct-3 | optimized | 24 | 2 | 0 | 0 | 2592 | 0.49 |
| distinct-3 | symbolic | 24 | 2 | 1635 | 4320 | 4810 | 0.79 |
| distinct-5 | exhaustive | 650 | 0 | 0 | 0 | 23795 | 15.15 |
| distinct-5 | memoization only | 320 | 33 | 0 | 0 | 21188 | 11.60 |
| distinct-5 | residual only | 60 | 0 | 0 | 0 | 7842 | 1.42 |
| distinct-5 | propagation only | 60 | 0 | 0 | 0 | 8097 | 1.39 |
| distinct-5 | pruning without memoization | 60 | 0 | 0 | 0 | 8252 | 1.27 |
| distinct-5 | optimized | 40 | 2 | 0 | 0 | 8094 | 0.99 |
| distinct-5 | symbolic | 40 | 2 | 8181 | 16882 | 20539 | 1.97 |
| symbolic-work-fallback | exhaustive | 80 | 0 | 0 | 0 | 4000 | 3.17 |
| symbolic-work-fallback | memoization only | 32 | 24 | 0 | 0 | 3688 | 2.14 |
| symbolic-work-fallback | residual only | 82 | 0 | 0 | 0 | 4130 | 2.39 |
| symbolic-work-fallback | propagation only | 82 | 0 | 0 | 0 | 5014 | 2.49 |
| symbolic-work-fallback | pruning without memoization | 82 | 0 | 0 | 0 | 5386 | 2.06 |
| symbolic-work-fallback | optimized | 50 | 16 | 0 | 0 | 5178 | 1.51 |
| symbolic-work-fallback | symbolic | 50 | 16 | 0 | 0 | 5178 | 1.61 |
| symbolic-memory-fallback | exhaustive | 80 | 0 | 0 | 0 | 4000 | 3.08 |
| symbolic-memory-fallback | memoization only | 32 | 24 | 0 | 0 | 3688 | 2.12 |
| symbolic-memory-fallback | residual only | 82 | 0 | 0 | 0 | 4130 | 2.99 |
| symbolic-memory-fallback | propagation only | 82 | 0 | 0 | 0 | 5014 | 2.05 |
| symbolic-memory-fallback | pruning without memoization | 82 | 0 | 0 | 0 | 5386 | 2.12 |
| symbolic-memory-fallback | optimized | 50 | 16 | 0 | 0 | 5178 | 1.94 |
| symbolic-memory-fallback | symbolic | 50 | 16 | 508 | 0 | 5989 | 1.77 |

## Proof checking and bounds

Reusable laws compiled and all theorem axioms audited locally in 521.55 ms. These are build-time costs. Per-request normalized certificate/declaration/substitution checks run inside TypeScript and are INCLUDED in request timings and work. Optional offline kernel checks of actual generated whole-region certificates took 286.73–394.34 ms per request; encoding sizes 1888–4914 bytes. 8 altered certificates per request were rejected by kernel-proved false propositions; process failures and timeouts are not accepted as rejection evidence. The remaining trust boundary is documented in docs/symbolic-synthesis.md.

Global work ≤ 1,000,000; solver states ≤ 10,000; symbolic/residual work per pass ≤ 100,000 and ≤ one quarter of remaining work. Retained symbolic encoding ≤ 200,000 characters. Boundary cache ≤ 128 entries / 200,000 cells and key characters. Retained symbolic characters and boundary cells/key characters are logical bounds, not JS heap byte bounds. Heap samples after each request include process history, GC and other variants; they are not peak allocation measurements. Search work also bounds transient DAG construction; compilation and propagation each receive at most one quarter of then-remaining work.

Safety/coverage exercise unsupported nondeterministic/partial rows. Copy/involution chain prefixes retain two maps (after the fixed source's one map), while support multiplicities remain exponential. Library cases vary concrete implementations sharing those two maps. Distinct cases use disjoint transpositions: prefix widths double and symbolic checking can cost more. Bounded fallback cases force work or memory exhaustion. No universal polynomial-time claim is made for arbitrary maps, relations, or engineering search.

Raw timing/phase/heap samples, fallback reasons, support counts, prefix widths and source hashes are in latest.json. Timings are observations, never correctness thresholds.
