# Synthesis search benchmark

Synthetic finite fixed-wiring libraries. All variants completed under the same 1,000,000 work and 10,000 state limits; counts, verdicts and first witnesses match exhaustive search. Timings include parsing, preprocessing, validation, caching and result construction. Each request gets a fresh cache.

Node v22.23.0, linux/arm64; 7 samples after one warmup per variant.

| Case | Full evaluations before → after | Avoided | Boundary computations before → after | Median ms before → after | Speedup |
|---|---:|---:|---:|---:|---:|
| safety | 256 → 1 | 99.6% | 513 → 1 | 132.07 → 3.70 | 35.72× |
| coverage | 243 → 1 | 99.6% | 487 → 1 | 67.00 → 1.28 | 52.28× |
| memoization | 256 → 256 | 0.0% | 768 → 1 | 65.66 → 32.49 | 2.02× |
| coupled | 64 → 32 | 50.0% | 160 → 32 | 13.76 → 7.44 | 1.85× |

## Individual optimizations

| Case | Variant | Full evaluations | Boundary computations | Cache hits | Work | Median ms |
|---|---|---:|---:|---:|---:|---:|
| safety | exhaustive | 256 | 513 | 0 | 276314 | 132.07 |
| safety | memoization only | 256 | 256 | 257 | 179306 | 92.32 |
| safety | residual only | 1 | 3 | 0 | 32702 | 3.95 |
| safety | propagation only | 256 | 513 | 0 | 214425 | 112.60 |
| safety | pruning without memoization | 1 | 3 | 0 | 33041 | 3.76 |
| safety | indexed evaluation only | 256 | 513 | 0 | 188044 | 110.01 |
| safety | factor decomposition only | 256 | 513 | 0 | 188044 | 111.57 |
| safety | optimized | 1 | 1 | 2 | 32973 | 3.70 |
| coverage | exhaustive | 243 | 487 | 0 | 144173 | 67.00 |
| coverage | memoization only | 243 | 243 | 244 | 87259 | 43.33 |
| coverage | residual only | 243 | 487 | 0 | 144449 | 65.57 |
| coverage | propagation only | 1 | 3 | 0 | 5659 | 1.46 |
| coverage | pruning without memoization | 1 | 3 | 0 | 5659 | 1.44 |
| coverage | indexed evaluation only | 243 | 487 | 0 | 141671 | 66.54 |
| coverage | factor decomposition only | 243 | 487 | 0 | 141671 | 66.79 |
| coverage | optimized | 1 | 1 | 2 | 5213 | 1.28 |
| memoization | exhaustive | 256 | 768 | 0 | 98642 | 65.66 |
| memoization | memoization only | 256 | 1 | 767 | 77933 | 32.13 |
| memoization | residual only | 256 | 768 | 0 | 99764 | 66.25 |
| memoization | propagation only | 256 | 768 | 0 | 99880 | 65.09 |
| memoization | pruning without memoization | 256 | 768 | 0 | 99880 | 66.11 |
| memoization | indexed evaluation only | 256 | 768 | 0 | 98642 | 65.21 |
| memoization | factor decomposition only | 256 | 768 | 0 | 98642 | 65.97 |
| memoization | optimized | 256 | 1 | 767 | 79171 | 32.49 |
| coupled | exhaustive | 64 | 160 | 0 | 20692 | 13.76 |
| coupled | memoization only | 64 | 64 | 96 | 19060 | 11.04 |
| coupled | residual only | 32 | 96 | 0 | 20610 | 9.32 |
| coupled | propagation only | 32 | 96 | 0 | 28626 | 9.34 |
| coupled | pruning without memoization | 32 | 96 | 0 | 32034 | 9.79 |
| coupled | indexed evaluation only | 64 | 160 | 0 | 20692 | 13.73 |
| coupled | factor decomposition only | 64 | 160 | 0 | 20692 | 13.82 |
| coupled | optimized | 32 | 32 | 64 | 30946 | 7.44 |

Safety uses nondeterministic alternatives that retain good rows but also produce invalid outputs. Coverage uses safe alternatives that omit required outputs. Memoization uses interchangeable behavior with different resource costs; every resource combination is still checked. Coupled uses copy/flip chains whose individually different choices can compensate. These are synthetic algorithm exercises, not motor/cyclone measurements or a universal speed guarantee.

Work is the engine's bounded accounting, not elapsed CPU time. Compilation and propagation can increase work on tightly coupled cases; raw timing samples and source hashes are in latest.json. The exhaustive strategy and optimization switches remain available for diagnosis.
