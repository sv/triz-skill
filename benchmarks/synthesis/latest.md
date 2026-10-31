# Synthesis search benchmark

Synthetic finite fixed-wiring libraries. Every variant completed under identical work/state limits and matched exhaustive verdicts, satisfying counts and declaration-order first witnesses. Timings include parsing, preprocessing, independent declaration/certificate checking, propagation, validation, caching and result construction. Each request gets fresh caches. Offline Lean checks are reported separately.

Node v22.23.0, linux/arm64, unknown; 7 rotated samples after one warmup.

| Case | Full validations E / O / S | Union traces O → S | Summary states / transitions | Median ms E / O / S | O / S speedup |
|---|---:|---:|---:|---:|---:|
| safety | 256 / 1 / 1 | 512 → 512 | 0 / 0 | 94.56 / 2.83 / 3.19 | 0.89× |
| coverage | 243 / 1 / 1 | 32 → 32 | 0 / 0 | 54.61 / 1.24 / 1.01 | 1.22× |
| memoization | 256 / 256 / 256 | 4 → 4 | 6 / 5 | 64.96 / 34.39 / 36.30 | 0.95× |
| coupled | 64 / 32 / 32 | 128 → 4 | 14 / 23 | 14.71 / 8.29 / 8.45 | 0.98× |
| chain-2 | 4 / 2 / 2 | 8 → 4 | 6 / 7 | 0.52 / 0.34 / 0.51 | 0.67× |
| chain-4 | 16 / 8 / 8 | 32 → 4 | 10 / 15 | 3.12 / 1.53 / 1.76 | 0.87× |
| chain-8 | 256 / 128 / 128 | 512 → 4 | 18 / 31 | 63.62 / 39.68 / 35.64 | 1.11× |
| chain-10 | 1024 / 1024 / 512 | 2048 → 4 | 22 / 39 | 301.60 / 267.06 / 175.41 | 1.52× |
| library-2 | 8 / 4 / 4 | 16 → 4 | 8 / 11 | 1.89 / 0.94 / 1.45 | 0.65× |
| library-4 | 64 / 32 / 32 | 16 → 4 | 8 / 11 | 11.22 / 4.54 / 4.76 | 0.95× |
| library-8 | 512 / 256 / 256 | 16 → 4 | 8 / 11 | 67.14 / 26.84 / 27.94 | 0.96× |
| distinct-3 | 8 / 1 / 1 | 12 → 12 | 16 / 15 | 2.30 / 0.49 / 0.86 | 0.57× |
| distinct-5 | 32 / 1 / 1 | 20 → 20 | 64 / 63 | 15.71 / 0.93 / 2.47 | 0.38× |
| joint-chain-2 | 4 / 2 / 2 | 16 → 8 | 6 / 7 | 1.07 / 0.76 / 1.01 | 0.76× |
| joint-chain-4 | 16 / 8 / 8 | 64 → 8 | 10 / 15 | 6.04 / 2.85 / 3.52 | 0.81× |
| joint-chain-6 | 64 / 32 / 32 | 256 → 8 | 14 / 23 | 27.66 / 13.52 / 12.98 | 1.04× |
| joint-chain-8 | 256 / 256 / 128 | 1024 → 8 | 18 / 31 | 129.27 / 107.34 / 69.74 | 1.54× |
| joint-library-4 | 64 / 32 / 32 | 32 → 8 | 8 / 11 | 18.23 / 6.45 / 6.85 | 0.94× |
| joint-library-8 | 512 / 256 / 256 | 32 → 8 | 8 / 11 | 122.39 / 40.43 / 40.52 | 1.00× |
| joint-correlated | 4 / 2 / 2 | 16 → 8 | 6 / 7 | 0.88 / 0.55 / 0.79 | 0.70× |
| joint-unit-source | 4 / 2 / 2 | 4 → 2 | 6 / 7 | 0.74 / 0.52 / 0.74 | 0.70× |
| symbolic-work-fallback | 16 / 8 / 8 | 32 → 32 | 0 / 0 | 3.19 / 1.65 / 1.57 | 1.05× |
| symbolic-memory-fallback | 16 / 8 / 8 | 32 → 32 | 0 / 0 | 3.58 / 1.62 / 2.23 | 0.73× |

E = exhaustive; O = current optimized; S = checked symbolic. Unsupported or capped compilation falls back to optimized. Full validations still check original engineering choices; behavior grouping does not collapse their costs/resources.

## Trace, cache, and work accounting

| Case | Variant | All traces | Boundary cache hits | Primitive compositions / avoided | Residual calls / cache hits | Symbolic checks (work) | Retained symbolic chars | Work | Median ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| chain-10 | optimized | 5040 | 1065 | 0 / 0 | 0 / 0 | 0 | 0 | 566363 | 267.06 |
| chain-10 | symbolic without residual cache | 1890 | 594 | 39 / 0 | 1535 / 0 | 1624 | 7994 | 397689 | 176.54 |
| chain-10 | symbolic | 1890 | 594 | 39 / 0 | 2 / 1533 | 1624 | 7998 | 386457 | 175.41 |
| library-8 | optimized | 26 | 764 | 0 / 0 | 0 / 0 | 0 | 0 | 52992 | 26.84 |
| library-8 | symbolic without residual cache | 14 | 764 | 11 / 30 | 329 / 0 | 1145 | 5110 | 61165 | 28.19 |
| library-8 | symbolic | 14 | 764 | 11 / 30 | 2 / 327 | 1145 | 5114 | 59069 | 27.94 |
| distinct-5 | optimized | 40 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 8094 | 0.93 |
| distinct-5 | symbolic without residual cache | 40 | 2 | 63 / 0 | 6 / 0 | 8593 | 20497 | 18470 | 2.59 |
| distinct-5 | symbolic | 40 | 2 | 63 / 0 | 2 / 4 | 8593 | 20510 | 18378 | 2.47 |
| joint-chain-8 | optimized | 2484 | 276 | 0 / 0 | 0 / 0 | 0 | 0 | 311409 | 107.34 |
| joint-chain-8 | symbolic without residual cache | 876 | 168 | 31 / 0 | 383 / 0 | 2741 | 9889 | 149070 | 68.24 |
| joint-chain-8 | symbolic | 876 | 168 | 31 / 0 | 2 / 381 | 2741 | 9893 | 144000 | 69.74 |

## Proof checking and bounds

Reusable laws compiled and all theorem axioms audited locally in 1168.73 ms. These are build-time costs. Per-request normalized certificate/declaration/substitution checks run inside TypeScript and are INCLUDED in request timings and work. Optional offline kernel checks of actual generated whole-region certificates took 297.57–422.62 ms per request; encoding sizes 2119–5944 bytes. 10 altered certificates per request were rejected by kernel-proved false propositions; process failures and timeouts are not accepted as rejection evidence. The remaining trust boundary is documented in docs/symbolic-synthesis.md.

Global work ≤ 1,000,000; solver states ≤ 10,000; symbolic/residual work per pass ≤ 100,000 and ≤ one quarter of remaining work. Retained symbolic encoding/masks/residual cache ≤ 200,000 characters; residual cache ≤ 128 entries. Boundary cache ≤ 128 entries / 200,000 cells and key characters. Retained symbolic characters and boundary cells/key characters are logical bounds, not JS heap byte bounds. Heap samples after each request include process history, GC and other variants; they are not peak allocation measurements. Search work also bounds transient DAG construction; compilation and propagation each receive at most one quarter of then-remaining work.

Safety/coverage exercise unsupported nondeterministic/partial rows. Copy/involution chain prefixes retain two maps (after the fixed source's one map), while support multiplicities remain exponential. Joint cases compose multi-port maps with explicit typed wire permutations; the correlated case changes arity 2→1→2, and the unit-source case starts from a zero-port source. Duplicate primitive grouping and residual reuse compound the summary sharing; the uncached symbolic variant isolates residual-cache effects. Library cases vary concrete implementations sharing those two maps. Distinct cases use disjoint transpositions: prefix widths double and symbolic checking can cost more. Bounded fallback cases force work or memory exhaustion. No universal polynomial-time claim is made for arbitrary maps, relations, or engineering search.

Full ablations, timing/phase/heap samples, fallback reasons, support counts, prefix widths and source hashes are generated into git-ignored latest.json. Regenerate with `pnpm bench:synthesis`. Timings are observations, never correctness thresholds.
