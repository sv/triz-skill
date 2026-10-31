# Synthesis search benchmark

Synthetic finite fixed-wiring libraries. Each fixture uses the same work/state allowances across variants (recorded in latest.json); counts, verdicts and first witnesses match exhaustive search. Timings include parsing, preprocessing, validation, caching and result construction. Each request gets a fresh cache.

Node v22.23.0, linux/arm64; 7 samples after one warmup per variant.

| Case | Full evaluations before → after | Avoided | Boundary computations before → after | Median ms before → after | Speedup |
|---|---:|---:|---:|---:|---:|
| safety | 256 → 1 | 99.6% | 513 → 1 | 137.14 → 3.63 | 37.76× |
| coverage | 243 → 1 | 99.6% | 487 → 1 | 71.04 → 1.35 | 52.73× |
| memoization | 256 → 256 | 0.0% | 768 → 1 | 68.30 → 34.39 | 1.99× |
| coupled | 64 → 32 | 50.0% | 160 → 32 | 14.14 → 8.12 | 1.74× |
| separators | 3 → 3 | 0.0% | 9 → 1 | 8.53 → 1.57 | 5.44× |

## Individual optimizations

| Case | Variant | Full evaluations | Boundary computations | Cache hits | Work | Median ms |
|---|---|---:|---:|---:|---:|---:|
| safety | exhaustive | 256 | 513 | 0 | 276314 | 137.14 |
| safety | memoization only | 256 | 256 | 257 | 179306 | 93.93 |
| safety | residual only | 1 | 3 | 0 | 32702 | 3.95 |
| safety | propagation only | 256 | 513 | 0 | 214425 | 115.32 |
| safety | pruning without memoization | 1 | 3 | 0 | 33041 | 4.31 |
| safety | indexed evaluation only | 256 | 513 | 0 | 188044 | 114.07 |
| safety | factor decomposition only | 256 | 513 | 0 | 188044 | 115.46 |
| safety | separator elimination only | 256 | 513 | 0 | 188044 | 115.36 |
| safety | optimized | 1 | 1 | 2 | 32973 | 3.63 |
| coverage | exhaustive | 243 | 487 | 0 | 144173 | 71.04 |
| coverage | memoization only | 243 | 243 | 244 | 87259 | 44.89 |
| coverage | residual only | 243 | 487 | 0 | 144449 | 68.52 |
| coverage | propagation only | 1 | 3 | 0 | 5659 | 1.61 |
| coverage | pruning without memoization | 1 | 3 | 0 | 5659 | 1.51 |
| coverage | indexed evaluation only | 243 | 487 | 0 | 141671 | 69.19 |
| coverage | factor decomposition only | 243 | 487 | 0 | 141671 | 67.58 |
| coverage | separator elimination only | 243 | 487 | 0 | 141671 | 68.42 |
| coverage | optimized | 1 | 1 | 2 | 5213 | 1.35 |
| memoization | exhaustive | 256 | 768 | 0 | 98642 | 68.30 |
| memoization | memoization only | 256 | 1 | 767 | 77933 | 33.88 |
| memoization | residual only | 256 | 768 | 0 | 99764 | 69.17 |
| memoization | propagation only | 256 | 768 | 0 | 99880 | 67.76 |
| memoization | pruning without memoization | 256 | 768 | 0 | 99880 | 68.44 |
| memoization | indexed evaluation only | 256 | 768 | 0 | 98642 | 67.40 |
| memoization | factor decomposition only | 256 | 768 | 0 | 98642 | 68.87 |
| memoization | separator elimination only | 256 | 768 | 0 | 98642 | 68.69 |
| memoization | optimized | 256 | 1 | 767 | 79171 | 34.39 |
| coupled | exhaustive | 64 | 160 | 0 | 20692 | 14.14 |
| coupled | memoization only | 64 | 64 | 96 | 19060 | 10.92 |
| coupled | residual only | 32 | 96 | 0 | 20610 | 9.79 |
| coupled | propagation only | 32 | 96 | 0 | 28626 | 9.95 |
| coupled | pruning without memoization | 32 | 96 | 0 | 32034 | 10.13 |
| coupled | indexed evaluation only | 64 | 160 | 0 | 20692 | 14.35 |
| coupled | factor decomposition only | 64 | 160 | 0 | 20692 | 14.24 |
| coupled | separator elimination only | 64 | 160 | 0 | 20692 | 15.23 |
| coupled | optimized | 32 | 32 | 64 | 30946 | 8.12 |
| separators | exhaustive | 3 | 9 | 0 | 29871 | 8.53 |
| separators | memoization only | 3 | 1 | 8 | 5303 | 2.16 |
| separators | residual only | 3 | 9 | 0 | 29871 | 9.18 |
| separators | propagation only | 3 | 9 | 0 | 29871 | 9.06 |
| separators | pruning without memoization | 3 | 9 | 0 | 29871 | 8.79 |
| separators | indexed evaluation only | 3 | 9 | 0 | 29871 | 8.57 |
| separators | factor decomposition only | 3 | 9 | 0 | 29871 | 8.73 |
| separators | separator elimination only | 3 | 9 | 0 | 3717 | 5.57 |
| separators | optimized | 3 | 1 | 8 | 2397 | 1.57 |

Safety uses nondeterministic alternatives that retain good rows but also produce invalid outputs. Coverage uses safe alternatives that omit required outputs. Memoization uses interchangeable behavior with different resource costs; every resource combination is still checked. Coupled uses copy/flip chains whose individually different choices can compensate. Separators uses a nondeterministic connected chain and three identical behavior alternatives with distinct costs; exactly two implementations satisfy the shared resource budget, independently of internal state multiplicity. These are synthetic algorithm exercises, not motor/cyclone measurements or a universal speed guarantee.

Work is the engine's bounded accounting, not elapsed CPU time. Compilation and propagation can increase work on tightly coupled cases; raw timing samples and source hashes are in latest.json. The exhaustive strategy and optimization switches remain available for diagnosis.
