# Synthesis search benchmark

Synthetic finite fixed-wiring libraries. All variants completed under the same 1,000,000 work and 10,000 state limits; counts, verdicts and first witnesses match exhaustive search. Timings include parsing, preprocessing, validation, caching and result construction. Each request gets a fresh cache.

Node v22.23.0, linux/arm64; 7 samples after one warmup per variant.

| Case | Full evaluations before → after | Avoided | Boundary computations before → after | Median ms before → after | Speedup |
|---|---:|---:|---:|---:|---:|
| safety | 256 → 1 | 99.6% | 513 → 1 | 97.75 → 3.03 | 32.26× |
| coverage | 243 → 1 | 99.6% | 487 → 1 | 52.04 → 0.99 | 52.42× |
| memoization | 256 → 256 | 0.0% | 768 → 1 | 65.72 → 33.52 | 1.96× |
| coupled | 64 → 32 | 50.0% | 160 → 32 | 13.57 → 7.80 | 1.74× |

## Individual optimizations

| Case | Variant | Full evaluations | Boundary computations | Cache hits | Work | Median ms |
|---|---|---:|---:|---:|---:|---:|
| safety | exhaustive | 256 | 513 | 0 | 276314 | 97.75 |
| safety | memoization only | 256 | 256 | 257 | 267576 | 85.08 |
| safety | residual only | 1 | 3 | 0 | 33130 | 3.40 |
| safety | propagation only | 256 | 513 | 0 | 303123 | 100.30 |
| safety | pruning without memoization | 1 | 3 | 0 | 33469 | 3.40 |
| safety | optimized | 1 | 1 | 2 | 33401 | 3.03 |
| coverage | exhaustive | 243 | 487 | 0 | 144173 | 52.04 |
| coverage | memoization only | 243 | 243 | 244 | 89761 | 41.35 |
| coverage | residual only | 243 | 487 | 0 | 147057 | 52.10 |
| coverage | propagation only | 1 | 3 | 0 | 5765 | 1.25 |
| coverage | pruning without memoization | 1 | 3 | 0 | 5765 | 1.19 |
| coverage | optimized | 1 | 1 | 2 | 5319 | 0.99 |
| memoization | exhaustive | 256 | 768 | 0 | 98642 | 65.72 |
| memoization | memoization only | 256 | 1 | 767 | 77933 | 33.25 |
| memoization | residual only | 256 | 768 | 0 | 99708 | 66.99 |
| memoization | propagation only | 256 | 768 | 0 | 99824 | 65.80 |
| memoization | pruning without memoization | 256 | 768 | 0 | 99824 | 63.93 |
| memoization | optimized | 256 | 1 | 767 | 79115 | 33.52 |
| coupled | exhaustive | 64 | 160 | 0 | 20692 | 13.57 |
| coupled | memoization only | 64 | 64 | 96 | 19060 | 10.72 |
| coupled | residual only | 32 | 96 | 0 | 20636 | 9.64 |
| coupled | propagation only | 32 | 96 | 0 | 28652 | 9.34 |
| coupled | pruning without memoization | 32 | 96 | 0 | 32060 | 9.47 |
| coupled | optimized | 32 | 32 | 64 | 30972 | 7.80 |

Safety uses nondeterministic alternatives that retain good rows but also produce invalid outputs. Coverage uses safe alternatives that omit required outputs. Memoization uses interchangeable behavior with different resource costs; every resource combination is still checked. Coupled uses copy/flip chains whose individually different choices can compensate. These are synthetic algorithm exercises, not motor/cyclone measurements or a universal speed guarantee.

Work is the engine's bounded accounting, not elapsed CPU time. Compilation and propagation can increase work on tightly coupled cases; raw timing samples and source hashes are in latest.json. The exhaustive strategy and optimization switches remain available for diagnosis.
