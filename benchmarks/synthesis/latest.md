# Synthesis search benchmark

Synthetic finite fixed-wiring libraries. All variants completed under the same 1,000,000 work and 10,000 state limits; counts, verdicts and first witnesses match exhaustive search. Timings include parsing, preprocessing, validation, caching and result construction. Each request gets a fresh cache.

Node v22.23.0, linux/arm64; 7 samples after one warmup per variant.

| Case | Full evaluations before → after | Avoided | Boundary computations before → after | Median ms before → after | Speedup |
|---|---:|---:|---:|---:|---:|
| safety | 256 → 1 | 99.6% | 513 → 1 | 127.23 → 3.55 | 35.83× |
| coverage | 243 → 1 | 99.6% | 487 → 1 | 65.34 → 1.24 | 52.51× |
| memoization | 256 → 256 | 0.0% | 768 → 1 | 64.96 → 32.78 | 1.98× |
| coupled | 64 → 32 | 50.0% | 160 → 32 | 13.83 → 7.54 | 1.83× |

## Individual optimizations

| Case | Variant | Full evaluations | Boundary computations | Cache hits | Work | Median ms |
|---|---|---:|---:|---:|---:|---:|
| safety | exhaustive | 256 | 513 | 0 | 276314 | 127.23 |
| safety | memoization only | 256 | 256 | 257 | 179306 | 87.17 |
| safety | residual only | 1 | 3 | 0 | 32702 | 3.85 |
| safety | propagation only | 256 | 513 | 0 | 214425 | 108.12 |
| safety | pruning without memoization | 1 | 3 | 0 | 33041 | 3.80 |
| safety | indexed evaluation only | 256 | 513 | 0 | 188044 | 103.74 |
| safety | factor decomposition only | 256 | 513 | 0 | 188044 | 104.53 |
| safety | optimized | 1 | 1 | 2 | 32973 | 3.55 |
| coverage | exhaustive | 243 | 487 | 0 | 144173 | 65.34 |
| coverage | memoization only | 243 | 243 | 244 | 87259 | 42.95 |
| coverage | residual only | 243 | 487 | 0 | 144449 | 65.77 |
| coverage | propagation only | 1 | 3 | 0 | 5659 | 1.38 |
| coverage | pruning without memoization | 1 | 3 | 0 | 5659 | 1.37 |
| coverage | indexed evaluation only | 243 | 487 | 0 | 141671 | 65.57 |
| coverage | factor decomposition only | 243 | 487 | 0 | 141671 | 64.98 |
| coverage | optimized | 1 | 1 | 2 | 5213 | 1.24 |
| memoization | exhaustive | 256 | 768 | 0 | 98642 | 64.96 |
| memoization | memoization only | 256 | 1 | 767 | 77933 | 32.06 |
| memoization | residual only | 256 | 768 | 0 | 99764 | 65.31 |
| memoization | propagation only | 256 | 768 | 0 | 99880 | 65.24 |
| memoization | pruning without memoization | 256 | 768 | 0 | 99880 | 65.75 |
| memoization | indexed evaluation only | 256 | 768 | 0 | 98642 | 64.92 |
| memoization | factor decomposition only | 256 | 768 | 0 | 98642 | 66.09 |
| memoization | optimized | 256 | 1 | 767 | 79171 | 32.78 |
| coupled | exhaustive | 64 | 160 | 0 | 20692 | 13.83 |
| coupled | memoization only | 64 | 64 | 96 | 19060 | 10.94 |
| coupled | residual only | 32 | 96 | 0 | 20610 | 9.24 |
| coupled | propagation only | 32 | 96 | 0 | 28626 | 9.81 |
| coupled | pruning without memoization | 32 | 96 | 0 | 32034 | 9.76 |
| coupled | indexed evaluation only | 64 | 160 | 0 | 20692 | 14.14 |
| coupled | factor decomposition only | 64 | 160 | 0 | 20692 | 13.93 |
| coupled | optimized | 32 | 32 | 64 | 30946 | 7.54 |

Safety uses nondeterministic alternatives that retain good rows but also produce invalid outputs. Coverage uses safe alternatives that omit required outputs. Memoization uses interchangeable behavior with different resource costs; every resource combination is still checked. Coupled uses copy/flip chains whose individually different choices can compensate. These are synthetic algorithm exercises, not motor/cyclone measurements or a universal speed guarantee.

Work is the engine's bounded accounting, not elapsed CPU time. Compilation and propagation can increase work on tightly coupled cases; raw timing samples and source hashes are in latest.json. The exhaustive strategy and optimization switches remain available for diagnosis.
