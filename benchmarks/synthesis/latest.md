# Synthesis search benchmark

Synthetic finite fixed-wiring libraries. Every variant completed under identical work/state limits and matched exhaustive verdicts, satisfying counts and declaration-order first witnesses. Timings include parsing, preprocessing, independent declaration/certificate checking, propagation, validation, caching and result construction. Each request gets fresh caches. Offline Lean checks are reported separately.

Node v22.23.0, linux/arm64, unknown; 7 rotated samples after one warmup.

| Case | Full validations E / O / S | Union traces O → S | Summary states / transitions | Median ms E / O / S | O / S speedup |
|---|---:|---:|---:|---:|---:|
| safety | 256 / 1 / 1 | 512 → 512 | 0 / 0 | 97.27 / 2.95 / 2.86 | 1.03× |
| coverage | 243 / 1 / 1 | 32 → 32 | 0 / 0 | 53.63 / 1.14 / 1.06 | 1.08× |
| memoization | 256 / 256 / 256 | 4 → 4 | 6 / 5 | 66.68 / 35.25 / 36.37 | 0.97× |
| coupled | 64 / 32 / 32 | 128 → 4 | 14 / 23 | 14.95 / 8.49 / 8.47 | 1.00× |
| chain-2 | 4 / 2 / 2 | 8 → 4 | 6 / 7 | 0.57 / 0.37 / 0.58 | 0.65× |
| chain-4 | 16 / 8 / 8 | 32 → 4 | 10 / 15 | 3.19 / 1.58 / 2.14 | 0.74× |
| chain-8 | 256 / 128 / 128 | 512 → 4 | 18 / 31 | 64.81 / 37.18 / 35.63 | 1.04× |
| chain-10 | 1024 / 1024 / 512 | 2048 → 4 | 22 / 39 | 297.66 / 264.73 / 173.76 | 1.52× |
| library-2 | 8 / 4 / 4 | 16 → 4 | 8 / 11 | 1.67 / 0.96 / 1.35 | 0.71× |
| library-4 | 64 / 32 / 32 | 16 → 4 | 8 / 11 | 11.74 / 4.25 / 4.98 | 0.85× |
| library-8 | 512 / 256 / 256 | 16 → 4 | 8 / 11 | 68.81 / 27.44 / 28.57 | 0.96× |
| distinct-3 | 8 / 1 / 1 | 12 → 12 | 16 / 15 | 2.30 / 0.53 / 0.93 | 0.57× |
| distinct-5 | 32 / 1 / 1 | 20 → 20 | 64 / 63 | 15.59 / 1.10 / 2.50 | 0.44× |
| joint-chain-2 | 4 / 2 / 2 | 16 → 8 | 6 / 7 | 1.31 / 0.75 / 0.92 | 0.81× |
| joint-chain-4 | 16 / 8 / 8 | 64 → 8 | 10 / 15 | 5.51 / 2.80 / 3.34 | 0.84× |
| joint-chain-6 | 64 / 32 / 32 | 256 → 8 | 14 / 23 | 30.49 / 13.74 / 13.13 | 1.05× |
| joint-chain-8 | 256 / 256 / 128 | 1024 → 8 | 18 / 31 | 131.95 / 109.33 / 70.41 | 1.55× |
| joint-library-4 | 64 / 32 / 32 | 32 → 8 | 8 / 11 | 19.83 / 6.60 / 7.14 | 0.92× |
| joint-library-8 | 512 / 256 / 256 | 32 → 8 | 8 / 11 | 129.03 / 41.00 / 40.68 | 1.01× |
| joint-correlated | 4 / 2 / 2 | 16 → 8 | 6 / 7 | 0.97 / 0.72 / 0.78 | 0.92× |
| joint-unit-source | 4 / 2 / 2 | 4 → 2 | 6 / 7 | 0.88 / 0.55 / 0.87 | 0.64× |
| symbolic-work-fallback | 16 / 8 / 8 | 32 → 32 | 0 / 0 | 3.08 / 1.64 / 1.61 | 1.02× |
| symbolic-memory-fallback | 16 / 8 / 8 | 32 → 32 | 0 / 0 | 3.14 / 1.64 / 2.00 | 0.82× |

E = exhaustive; O = current optimized; S = checked symbolic. Unsupported or capped compilation falls back to optimized. Full validations still check original engineering choices; behavior grouping does not collapse their costs/resources.

## Trace, cache, and work accounting

| Case | Variant | All traces | Boundary cache hits | Primitive compositions / avoided | Residual calls / cache hits | Symbolic checks (work) | Retained symbolic chars | Work | Median ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| safety | exhaustive | 13636 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 276314 | 97.27 |
| safety | memoization only | 13122 | 257 | 0 / 0 | 0 / 0 | 0 | 0 | 267576 | 81.38 |
| safety | residual only | 520 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 33130 | 3.15 |
| safety | propagation only | 14150 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 303123 | 99.40 |
| safety | pruning without memoization | 520 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 33469 | 3.16 |
| safety | optimized | 516 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 33401 | 2.95 |
| safety | symbolic without residual cache | 516 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 33622 | 3.13 |
| safety | symbolic | 516 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 33622 | 2.86 |
| coverage | exhaustive | 8832 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 144173 | 53.63 |
| coverage | memoization only | 1024 | 244 | 0 / 0 | 0 / 0 | 0 | 0 | 89761 | 42.74 |
| coverage | residual only | 8896 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 147057 | 54.32 |
| coverage | propagation only | 160 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 5765 | 1.31 |
| coverage | pruning without memoization | 160 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 5765 | 1.15 |
| coverage | optimized | 96 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 5319 | 1.14 |
| coverage | symbolic without residual cache | 96 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 5497 | 1.06 |
| coverage | symbolic | 96 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 5497 | 1.06 |
| memoization | exhaustive | 3072 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 98642 | 66.68 |
| memoization | memoization only | 4 | 767 | 0 / 0 | 0 / 0 | 0 | 0 | 77933 | 35.10 |
| memoization | residual only | 3080 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 99708 | 67.81 |
| memoization | propagation only | 3080 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 99824 | 67.43 |
| memoization | pruning without memoization | 3080 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 99824 | 66.62 |
| memoization | optimized | 12 | 767 | 0 / 0 | 0 / 0 | 0 | 0 | 79115 | 35.25 |
| memoization | symbolic without residual cache | 12 | 767 | 5 / 12 | 341 / 0 | 1309 | 4494 | 87827 | 35.84 |
| memoization | symbolic | 12 | 767 | 5 / 12 | 1 / 340 | 1309 | 4496 | 84432 | 36.37 |
| coupled | exhaustive | 320 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 20692 | 14.95 |
| coupled | memoization only | 128 | 96 | 0 / 0 | 0 / 0 | 0 | 0 | 19060 | 11.70 |
| coupled | residual only | 322 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 20636 | 10.76 |
| coupled | propagation only | 322 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 28652 | 10.48 |
| coupled | pruning without memoization | 322 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 32060 | 10.52 |
| coupled | optimized | 194 | 64 | 0 / 0 | 0 / 0 | 0 | 0 | 30972 | 8.49 |
| coupled | symbolic without residual cache | 70 | 64 | 23 / 0 | 95 / 0 | 956 | 4966 | 17737 | 8.19 |
| coupled | symbolic | 70 | 64 | 23 / 0 | 2 / 93 | 956 | 4970 | 17065 | 8.47 |
| chain-2 | exhaustive | 20 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 736 | 0.57 |
| chain-2 | memoization only | 8 | 6 | 0 / 0 | 0 / 0 | 0 | 0 | 682 | 0.47 |
| chain-2 | residual only | 22 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 902 | 0.44 |
| chain-2 | propagation only | 22 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 955 | 0.44 |
| chain-2 | pruning without memoization | 22 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 976 | 0.46 |
| chain-2 | optimized | 14 | 4 | 0 / 0 | 0 / 0 | 0 | 0 | 940 | 0.37 |
| chain-2 | symbolic without residual cache | 10 | 4 | 7 / 0 | 5 / 0 | 352 | 1938 | 1297 | 0.57 |
| chain-2 | symbolic | 10 | 4 | 7 / 0 | 2 / 3 | 352 | 1942 | 1285 | 0.58 |
| chain-4 | exhaustive | 80 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 4000 | 3.19 |
| chain-4 | memoization only | 32 | 24 | 0 / 0 | 0 / 0 | 0 | 0 | 3688 | 2.59 |
| chain-4 | residual only | 82 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 4130 | 2.00 |
| chain-4 | propagation only | 82 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 5014 | 2.47 |
| chain-4 | pruning without memoization | 82 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 5386 | 1.90 |
| chain-4 | optimized | 50 | 16 | 0 / 0 | 0 / 0 | 0 | 0 | 5178 | 1.58 |
| chain-4 | symbolic without residual cache | 22 | 16 | 15 / 0 | 23 / 0 | 646 | 3452 | 4322 | 1.98 |
| chain-4 | symbolic | 22 | 16 | 15 / 0 | 2 / 21 | 646 | 3456 | 4178 | 2.14 |
| chain-8 | exhaustive | 1280 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 102760 | 64.81 |
| chain-8 | memoization only | 670 | 305 | 0 / 0 | 0 / 0 | 0 | 0 | 96355 | 56.21 |
| chain-8 | residual only | 1282 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 105446 | 43.04 |
| chain-8 | propagation only | 1282 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 162598 | 44.17 |
| chain-8 | pruning without memoization | 1282 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 186982 | 45.61 |
| chain-8 | optimized | 828 | 227 | 0 / 0 | 0 / 0 | 0 | 0 | 182215 | 37.18 |
| chain-8 | symbolic without residual cache | 320 | 227 | 31 / 0 | 383 / 0 | 1282 | 6480 | 82597 | 38.07 |
| chain-8 | symbolic | 320 | 227 | 31 / 0 | 2 / 381 | 1282 | 6484 | 79813 | 35.63 |
| chain-10 | exhaustive | 5120 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 492988 | 297.66 |
| chain-10 | memoization only | 2990 | 1065 | 0 / 0 | 0 / 0 | 0 | 0 | 466363 | 259.72 |
| chain-10 | residual only | 7170 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 592988 | 301.86 |
| chain-10 | propagation only | 7170 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 592988 | 302.09 |
| chain-10 | pruning without memoization | 7170 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 592988 | 302.02 |
| chain-10 | optimized | 5040 | 1065 | 0 / 0 | 0 / 0 | 0 | 0 | 566363 | 264.73 |
| chain-10 | symbolic without residual cache | 1890 | 594 | 39 / 0 | 1535 / 0 | 1624 | 7994 | 397689 | 175.25 |
| chain-10 | symbolic | 1890 | 594 | 39 / 0 | 2 / 1533 | 1624 | 7998 | 386457 | 173.76 |
| library-2 | exhaustive | 40 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 1760 | 1.67 |
| library-2 | memoization only | 16 | 12 | 0 / 0 | 0 / 0 | 0 | 0 | 1628 | 1.66 |
| library-2 | residual only | 42 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 1924 | 1.37 |
| library-2 | propagation only | 42 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 2170 | 1.55 |
| library-2 | pruning without memoization | 42 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 2272 | 1.23 |
| library-2 | optimized | 26 | 8 | 0 / 0 | 0 / 0 | 0 | 0 | 2184 | 0.96 |
| library-2 | symbolic without residual cache | 14 | 8 | 11 / 0 | 11 / 0 | 497 | 2695 | 2335 | 1.24 |
| library-2 | symbolic | 14 | 8 | 11 / 0 | 2 / 9 | 497 | 2699 | 2279 | 1.35 |
| library-4 | exhaustive | 320 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 13060 | 11.74 |
| library-4 | memoization only | 16 | 152 | 0 / 0 | 0 / 0 | 0 | 0 | 11388 | 6.75 |
| library-4 | residual only | 210 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 8508 | 7.24 |
| library-4 | propagation only | 210 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 9068 | 7.21 |
| library-4 | pruning without memoization | 210 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 9220 | 7.93 |
| library-4 | optimized | 26 | 92 | 0 / 0 | 0 / 0 | 0 | 0 | 8208 | 4.25 |
| library-4 | symbolic without residual cache | 14 | 92 | 11 / 10 | 53 / 0 | 713 | 3500 | 9361 | 5.51 |
| library-4 | symbolic | 14 | 92 | 11 / 10 | 2 / 51 | 713 | 3504 | 9025 | 4.98 |
| library-8 | exhaustive | 2560 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 102716 | 68.81 |
| library-8 | memoization only | 16 | 1272 | 0 / 0 | 0 / 0 | 0 | 0 | 88724 | 41.45 |
| library-8 | residual only | 1554 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 59452 | 43.23 |
| library-8 | propagation only | 1554 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 61108 | 44.85 |
| library-8 | pruning without memoization | 1554 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 61396 | 42.19 |
| library-8 | optimized | 26 | 764 | 0 / 0 | 0 / 0 | 0 | 0 | 52992 | 27.44 |
| library-8 | symbolic without residual cache | 14 | 764 | 11 / 30 | 329 / 0 | 1145 | 5110 | 61165 | 27.10 |
| library-8 | symbolic | 14 | 764 | 11 / 30 | 2 / 327 | 1145 | 5114 | 59069 | 28.57 |
| distinct-3 | exhaustive | 102 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 3137 | 2.30 |
| distinct-3 | memoization only | 48 | 9 | 0 / 0 | 0 / 0 | 0 | 0 | 2822 | 1.30 |
| distinct-3 | residual only | 36 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 2548 | 0.58 |
| distinct-3 | propagation only | 36 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 2623 | 0.60 |
| distinct-3 | pruning without memoization | 36 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 2662 | 0.65 |
| distinct-3 | optimized | 24 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 2592 | 0.53 |
| distinct-3 | symbolic without residual cache | 24 | 2 | 15 / 0 | 4 / 0 | 1691 | 5147 | 4417 | 0.95 |
| distinct-3 | symbolic | 24 | 2 | 15 / 0 | 2 / 2 | 1691 | 5153 | 4395 | 0.93 |
| distinct-5 | exhaustive | 650 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 23795 | 15.59 |
| distinct-5 | memoization only | 320 | 33 | 0 / 0 | 0 / 0 | 0 | 0 | 21188 | 10.61 |
| distinct-5 | residual only | 60 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 7842 | 1.36 |
| distinct-5 | propagation only | 60 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 8097 | 1.25 |
| distinct-5 | pruning without memoization | 60 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 8252 | 1.22 |
| distinct-5 | optimized | 40 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 8094 | 1.10 |
| distinct-5 | symbolic without residual cache | 40 | 2 | 63 / 0 | 6 / 0 | 8593 | 20497 | 18470 | 2.56 |
| distinct-5 | symbolic | 40 | 2 | 63 / 0 | 2 / 4 | 8593 | 20510 | 18378 | 2.50 |
| joint-chain-2 | exhaustive | 40 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 1599 | 1.31 |
| joint-chain-2 | memoization only | 16 | 6 | 0 / 0 | 0 / 0 | 0 | 0 | 1485 | 0.92 |
| joint-chain-2 | residual only | 44 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 2625 | 0.99 |
| joint-chain-2 | propagation only | 44 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 2752 | 0.98 |
| joint-chain-2 | pruning without memoization | 44 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 2773 | 0.93 |
| joint-chain-2 | optimized | 28 | 4 | 0 / 0 | 0 / 0 | 0 | 0 | 2697 | 0.75 |
| joint-chain-2 | symbolic without residual cache | 20 | 4 | 7 / 0 | 5 / 0 | 791 | 3001 | 3038 | 1.03 |
| joint-chain-2 | symbolic | 20 | 4 | 7 / 0 | 2 / 3 | 791 | 3005 | 3008 | 0.92 |
| joint-chain-4 | exhaustive | 160 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 8677 | 5.51 |
| joint-chain-4 | memoization only | 64 | 24 | 0 / 0 | 0 / 0 | 0 | 0 | 8029 | 4.47 |
| joint-chain-4 | residual only | 164 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 11255 | 4.86 |
| joint-chain-4 | propagation only | 164 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 13395 | 4.19 |
| joint-chain-4 | pruning without memoization | 164 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 13767 | 4.12 |
| joint-chain-4 | optimized | 100 | 16 | 0 / 0 | 0 / 0 | 0 | 0 | 13335 | 2.80 |
| joint-chain-4 | symbolic without residual cache | 44 | 16 | 15 / 0 | 23 / 0 | 1417 | 5297 | 8725 | 3.26 |
| joint-chain-4 | symbolic | 44 | 16 | 15 / 0 | 2 / 21 | 1417 | 5301 | 8455 | 3.34 |
| joint-chain-6 | exhaustive | 640 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 44915 | 30.49 |
| joint-chain-6 | memoization only | 284 | 89 | 0 / 0 | 0 / 0 | 0 | 0 | 41800 | 21.97 |
| joint-chain-6 | residual only | 644 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 51623 | 20.10 |
| joint-chain-6 | propagation only | 644 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 71063 | 18.76 |
| joint-chain-6 | pruning without memoization | 644 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 74471 | 20.28 |
| joint-chain-6 | optimized | 388 | 64 | 0 / 0 | 0 / 0 | 0 | 0 | 72231 | 13.74 |
| joint-chain-6 | symbolic without residual cache | 140 | 64 | 23 / 0 | 95 / 0 | 2067 | 7593 | 32684 | 13.46 |
| joint-chain-6 | symbolic | 140 | 64 | 23 / 0 | 2 / 93 | 2067 | 7597 | 31454 | 13.13 |
| joint-chain-8 | exhaustive | 2560 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 223281 | 131.95 |
| joint-chain-8 | memoization only | 1456 | 276 | 0 / 0 | 0 / 0 | 0 | 0 | 211413 | 105.81 |
| joint-chain-8 | residual only | 3588 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 323277 | 134.91 |
| joint-chain-8 | propagation only | 3588 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 323277 | 136.58 |
| joint-chain-8 | pruning without memoization | 3588 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 323277 | 133.09 |
| joint-chain-8 | optimized | 2484 | 276 | 0 / 0 | 0 / 0 | 0 | 0 | 311409 | 109.33 |
| joint-chain-8 | symbolic without residual cache | 876 | 168 | 31 / 0 | 383 / 0 | 2741 | 9889 | 149070 | 72.02 |
| joint-chain-8 | symbolic | 876 | 168 | 31 / 0 | 2 / 381 | 2741 | 9893 | 144000 | 70.41 |
| joint-library-4 | exhaustive | 640 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 27848 | 19.83 |
| joint-library-4 | memoization only | 32 | 152 | 0 / 0 | 0 / 0 | 0 | 0 | 24352 | 10.01 |
| joint-library-4 | residual only | 420 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 18844 | 12.44 |
| joint-library-4 | propagation only | 420 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 20116 | 12.40 |
| joint-library-4 | pruning without memoization | 420 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 20268 | 12.51 |
| joint-library-4 | optimized | 52 | 92 | 0 / 0 | 0 / 0 | 0 | 0 | 18152 | 6.60 |
| joint-library-4 | symbolic without residual cache | 28 | 92 | 11 / 10 | 53 / 0 | 1593 | 5554 | 18441 | 7.15 |
| joint-library-4 | symbolic | 28 | 92 | 11 / 10 | 2 / 51 | 1593 | 5558 | 17799 | 7.14 |
| joint-library-8 | exhaustive | 5120 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 219028 | 129.03 |
| joint-library-8 | memoization only | 32 | 1272 | 0 / 0 | 0 / 0 | 0 | 0 | 189772 | 61.93 |
| joint-library-8 | residual only | 3108 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 123320 | 81.23 |
| joint-library-8 | propagation only | 3108 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 126920 | 80.31 |
| joint-library-8 | pruning without memoization | 3108 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 127208 | 79.79 |
| joint-library-8 | optimized | 52 | 764 | 0 / 0 | 0 / 0 | 0 | 0 | 109636 | 41.00 |
| joint-library-8 | symbolic without residual cache | 28 | 764 | 11 / 30 | 329 / 0 | 2577 | 8364 | 117965 | 41.69 |
| joint-library-8 | symbolic | 28 | 764 | 11 / 30 | 2 / 327 | 2577 | 8368 | 113907 | 40.68 |
| joint-correlated | exhaustive | 40 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 1389 | 0.97 |
| joint-correlated | memoization only | 16 | 6 | 0 / 0 | 0 / 0 | 0 | 0 | 1275 | 0.72 |
| joint-correlated | residual only | 44 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 2064 | 0.76 |
| joint-correlated | propagation only | 44 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 2191 | 0.78 |
| joint-correlated | pruning without memoization | 44 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 2212 | 0.77 |
| joint-correlated | optimized | 28 | 4 | 0 / 0 | 0 / 0 | 0 | 0 | 2136 | 0.72 |
| joint-correlated | symbolic without residual cache | 20 | 4 | 7 / 0 | 5 / 0 | 658 | 2745 | 2597 | 0.82 |
| joint-correlated | symbolic | 20 | 4 | 7 / 0 | 2 / 3 | 658 | 2749 | 2567 | 0.78 |
| joint-unit-source | exhaustive | 10 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 1050 | 0.88 |
| joint-unit-source | memoization only | 4 | 6 | 0 / 0 | 0 / 0 | 0 | 0 | 1026 | 0.74 |
| joint-unit-source | residual only | 11 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 1164 | 0.68 |
| joint-unit-source | propagation only | 11 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 1180 | 0.64 |
| joint-unit-source | pruning without memoization | 11 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 1201 | 0.65 |
| joint-unit-source | optimized | 7 | 4 | 0 / 0 | 0 / 0 | 0 | 0 | 1185 | 0.55 |
| joint-unit-source | symbolic without residual cache | 5 | 4 | 7 / 0 | 5 / 0 | 451 | 2214 | 1702 | 0.79 |
| joint-unit-source | symbolic | 5 | 4 | 7 / 0 | 2 / 3 | 451 | 2218 | 1699 | 0.87 |
| symbolic-work-fallback | exhaustive | 80 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 4000 | 3.08 |
| symbolic-work-fallback | memoization only | 32 | 24 | 0 / 0 | 0 / 0 | 0 | 0 | 3688 | 2.49 |
| symbolic-work-fallback | residual only | 82 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 4130 | 1.94 |
| symbolic-work-fallback | propagation only | 82 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 5014 | 1.94 |
| symbolic-work-fallback | pruning without memoization | 82 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 5386 | 2.37 |
| symbolic-work-fallback | optimized | 50 | 16 | 0 / 0 | 0 / 0 | 0 | 0 | 5178 | 1.64 |
| symbolic-work-fallback | symbolic without residual cache | 50 | 16 | 0 / 0 | 0 / 0 | 0 | 0 | 5178 | 1.68 |
| symbolic-work-fallback | symbolic | 50 | 16 | 0 / 0 | 0 / 0 | 0 | 0 | 5178 | 1.61 |
| symbolic-memory-fallback | exhaustive | 80 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 4000 | 3.14 |
| symbolic-memory-fallback | memoization only | 32 | 24 | 0 / 0 | 0 / 0 | 0 | 0 | 3688 | 2.86 |
| symbolic-memory-fallback | residual only | 82 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 4130 | 1.99 |
| symbolic-memory-fallback | propagation only | 82 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 5014 | 2.63 |
| symbolic-memory-fallback | pruning without memoization | 82 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 5386 | 2.19 |
| symbolic-memory-fallback | optimized | 50 | 16 | 0 / 0 | 0 / 0 | 0 | 0 | 5178 | 1.64 |
| symbolic-memory-fallback | symbolic without residual cache | 50 | 16 | 15 / 0 | 0 / 0 | 598 | 0 | 6069 | 1.86 |
| symbolic-memory-fallback | symbolic | 50 | 16 | 15 / 0 | 0 / 0 | 598 | 0 | 6069 | 2.00 |

## Proof checking and bounds

Reusable laws compiled and all theorem axioms audited locally in 616.96 ms. These are build-time costs. Per-request normalized certificate/declaration/substitution checks run inside TypeScript and are INCLUDED in request timings and work. Optional offline kernel checks of actual generated whole-region certificates took 298.08–474.43 ms per request; encoding sizes 2119–5944 bytes. 10 altered certificates per request were rejected by kernel-proved false propositions; process failures and timeouts are not accepted as rejection evidence. The remaining trust boundary is documented in docs/symbolic-synthesis.md.

Global work ≤ 1,000,000; solver states ≤ 10,000; symbolic/residual work per pass ≤ 100,000 and ≤ one quarter of remaining work. Retained symbolic encoding/masks/residual cache ≤ 200,000 characters; residual cache ≤ 128 entries. Boundary cache ≤ 128 entries / 200,000 cells and key characters. Retained symbolic characters and boundary cells/key characters are logical bounds, not JS heap byte bounds. Heap samples after each request include process history, GC and other variants; they are not peak allocation measurements. Search work also bounds transient DAG construction; compilation and propagation each receive at most one quarter of then-remaining work.

Safety/coverage exercise unsupported nondeterministic/partial rows. Copy/involution chain prefixes retain two maps (after the fixed source's one map), while support multiplicities remain exponential. Joint cases compose multi-port maps with explicit typed wire permutations; the correlated case changes arity 2→1→2, and the unit-source case starts from a zero-port source. Duplicate primitive grouping and residual reuse compound the summary sharing; the uncached symbolic variant isolates residual-cache effects. Library cases vary concrete implementations sharing those two maps. Distinct cases use disjoint transpositions: prefix widths double and symbolic checking can cost more. Bounded fallback cases force work or memory exhaustion. No universal polynomial-time claim is made for arbitrary maps, relations, or engineering search.

Raw timing/phase/heap samples, fallback reasons, support counts, prefix widths and source hashes are in latest.json. Timings are observations, never correctness thresholds.
