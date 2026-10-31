# Synthesis search benchmark

Finite fixed-wiring libraries, including the unchanged shipped driver request. Every variant completed under identical work/state limits and matched exhaustive verdicts, satisfying counts and declaration-order first witnesses. Timings include parsing, preprocessing, independent declaration/certificate checking, propagation, validation, caching and result construction. Each request gets fresh caches. Offline Lean checks are reported separately. Small requests use optimized fallback unless a certificate is explicitly requested; the forced variant isolates that cost. These are declared finite examples, not production performance evidence.

Node v22.23.0, linux/arm64, unknown; 7 rotated samples after one warmup.

| Case | Full validations E / O / S | Union traces O → S | Summary states / transitions | Median ms E / O / S | O / S speedup |
|---|---:|---:|---:|---:|---:|
| repository-driver | 2 / 1 / 1 | 3 → 3 | 0 / 0 | 0.22 / 0.16 / 0.16 | 1.01× |
| safety | 256 / 1 / 1 | 512 → 512 | 0 / 0 | 98.06 / 2.95 / 2.86 | 1.03× |
| coverage | 243 / 1 / 1 | 32 → 32 | 0 / 0 | 56.05 / 0.98 / 0.95 | 1.04× |
| memoization | 256 / 256 / 256 | 4 → 4 | 6 / 5 | 65.27 / 34.15 / 35.80 | 0.95× |
| coupled | 64 / 32 / 32 | 128 → 4 | 14 / 23 | 16.16 / 8.42 / 9.18 | 0.92× |
| chain-2 | 4 / 2 / 2 | 8 → 8 | 0 / 0 | 0.53 / 0.36 / 0.40 | 0.92× |
| chain-4 | 16 / 8 / 8 | 32 → 32 | 0 / 0 | 3.11 / 1.69 / 2.03 | 0.83× |
| chain-8 | 256 / 128 / 128 | 512 → 4 | 18 / 31 | 65.81 / 39.53 / 37.83 | 1.05× |
| chain-10 | 1024 / 1024 / 512 | 2048 → 4 | 22 / 39 | 302.75 / 265.93 / 175.36 | 1.52× |
| library-2 | 8 / 4 / 4 | 16 → 16 | 0 / 0 | 1.82 / 0.91 / 0.97 | 0.94× |
| library-4 | 64 / 32 / 32 | 16 → 4 | 8 / 11 | 11.35 / 4.86 / 5.76 | 0.84× |
| library-8 | 512 / 256 / 256 | 16 → 4 | 8 / 11 | 66.84 / 27.81 / 27.79 | 1.00× |
| distinct-3 | 8 / 1 / 1 | 12 → 12 | 0 / 0 | 1.73 / 0.44 / 0.43 | 1.02× |
| distinct-5 | 32 / 1 / 1 | 20 → 20 | 0 / 0 | 14.72 / 0.91 / 0.84 | 1.09× |
| joint-chain-2 | 4 / 2 / 2 | 16 → 16 | 0 / 0 | 1.14 / 0.68 / 0.62 | 1.10× |
| joint-chain-4 | 16 / 8 / 8 | 64 → 64 | 0 / 0 | 5.26 / 2.68 / 2.85 | 0.94× |
| joint-chain-6 | 64 / 32 / 32 | 256 → 8 | 14 / 23 | 29.63 / 13.27 / 13.91 | 0.95× |
| joint-chain-8 | 256 / 256 / 128 | 1024 → 8 | 18 / 31 | 129.77 / 107.37 / 70.60 | 1.52× |
| joint-library-4 | 64 / 32 / 32 | 32 → 8 | 8 / 11 | 18.79 / 6.66 / 7.53 | 0.88× |
| joint-library-8 | 512 / 256 / 256 | 32 → 8 | 8 / 11 | 123.98 / 40.01 / 42.72 | 0.94× |
| joint-correlated | 4 / 2 / 2 | 16 → 16 | 0 / 0 | 0.99 / 0.57 / 0.58 | 0.99× |
| joint-unit-source | 4 / 2 / 2 | 4 → 4 | 0 / 0 | 0.74 / 0.55 / 0.52 | 1.04× |
| symbolic-work-fallback | 16 / 8 / 8 | 32 → 32 | 0 / 0 | 3.24 / 2.19 / 2.17 | 1.01× |
| symbolic-memory-fallback | 16 / 8 / 8 | 32 → 32 | 0 / 0 | 3.09 / 1.46 / 1.79 | 0.82× |

## Existing repository request: before/after

Unchanged `triz_synthesize` request in examples/assurance/requests.json; 31 rotated batches of 20 requests after 1,000 warmups per variant. Both versions warm together before the larger benchmark cases. Median ms per complete request; preprocessing, runtime checks and result construction included. Baseline source fingerprint and all samples are in local latest.json. Reproduce with `pnpm bench:synthesis --baseline /path/to/baseline-checkout`.

| Variant | Median ms | Work | Full validations | Union traces | Unchanged passes reused |
|---|---:|---:|---:|---:|---:|
| previous optimized | 0.162 | 286 | 1 | 3 | 0 |
| previous symbolic | 0.185 | 315 | 1 | 3 | 0 |
| current optimized | 0.169 | 286 | 1 | 3 | 1 |
| current symbolic | 0.154 | 286 | 1 | 3 | 1 |

E = exhaustive; O = current optimized; S = adaptive checked symbolic. Unsupported, small or capped compilation falls back to optimized. Full validations still check original engineering choices; behavior grouping does not collapse their costs/resources.

## Trace, cache, and work accounting

| Case | Variant | All traces | Boundary cache hits | Primitive compositions / avoided | Residual calls / cache hits | Symbolic checks (work) | Retained symbolic chars | Work | Median ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| repository-driver | optimized | 7 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 286 | 0.16 |
| repository-driver | symbolic forced | 7 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 293 | 0.21 |
| repository-driver | symbolic without residual cache | 7 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 286 | 0.16 |
| repository-driver | symbolic | 7 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 286 | 0.16 |
| chain-10 | optimized | 5040 | 1065 | 0 / 0 | 0 / 0 | 0 | 0 | 566363 | 265.93 |
| chain-10 | symbolic forced | 1890 | 594 | 39 / 0 | 1 / 1022 | 1624 | 7996 | 345486 | 173.98 |
| chain-10 | symbolic without residual cache | 1890 | 594 | 39 / 0 | 1023 / 0 | 1624 | 7994 | 353657 | 175.38 |
| chain-10 | symbolic | 1890 | 594 | 39 / 0 | 1 / 1022 | 1624 | 7996 | 345486 | 175.36 |
| library-8 | optimized | 26 | 764 | 0 / 0 | 0 / 0 | 0 | 0 | 52992 | 27.81 |
| library-8 | symbolic forced | 14 | 764 | 11 / 30 | 2 / 327 | 1145 | 5114 | 59069 | 28.35 |
| library-8 | symbolic without residual cache | 14 | 764 | 11 / 30 | 329 / 0 | 1145 | 5110 | 61165 | 28.10 |
| library-8 | symbolic | 14 | 764 | 11 / 30 | 2 / 327 | 1145 | 5114 | 59069 | 27.79 |
| distinct-5 | optimized | 40 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 8094 | 0.91 |
| distinct-5 | symbolic forced | 40 | 2 | 63 / 0 | 1 / 0 | 8593 | 20508 | 17703 | 2.58 |
| distinct-5 | symbolic without residual cache | 40 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 8094 | 0.91 |
| distinct-5 | symbolic | 40 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 8094 | 0.84 |
| joint-chain-8 | optimized | 2484 | 276 | 0 / 0 | 0 / 0 | 0 | 0 | 311409 | 107.37 |
| joint-chain-8 | symbolic forced | 876 | 168 | 31 / 0 | 1 / 254 | 2741 | 9891 | 135791 | 67.96 |
| joint-chain-8 | symbolic without residual cache | 876 | 168 | 31 / 0 | 255 / 0 | 2741 | 9889 | 139342 | 67.10 |
| joint-chain-8 | symbolic | 876 | 168 | 31 / 0 | 1 / 254 | 2741 | 9891 | 135791 | 70.60 |

## Proof checking and bounds

Reusable laws compiled and all theorem axioms audited locally in 570.46 ms. These are build-time costs. Per-request normalized certificate/declaration/substitution checks run inside TypeScript and are INCLUDED in request timings and work. Optional offline kernel checks of actual generated whole-region certificates took 285.39–413.11 ms per request; encoding sizes 2119–5944 bytes. 90 altered certificates across 9 regions were rejected by kernel-proved false propositions; process failures and timeouts are not accepted as rejection evidence. The remaining trust boundary is documented in docs/symbolic-synthesis.md.

Global work ≤ 1,000,000; solver states ≤ 100,000 (synthetic fixtures: 10,000); symbolic/residual work per pass ≤ 100,000 and ≤ one quarter of remaining work. Retained symbolic encoding/masks/residual cache ≤ 200,000 characters; residual cache ≤ 128 entries. Boundary cache ≤ 128 entries / 200,000 cells and key characters. Retained symbolic characters and boundary cells/key characters are logical bounds, not JS heap byte bounds. Heap samples after each request include process history, GC and other variants; they are not peak allocation measurements. Search work also bounds transient DAG construction; compilation and propagation each receive at most one quarter of then-remaining work.

Safety/coverage exercise unsupported nondeterministic/partial rows. Copy/involution chain prefixes retain two maps (after the fixed source's one map), while support multiplicities remain exponential. Joint cases compose multi-port maps with explicit typed wire permutations; the correlated case changes arity 2→1→2, and the unit-source case starts from a zero-port source. Duplicate primitive grouping and residual reuse compound the summary sharing; the uncached symbolic variant isolates residual-cache effects. Library cases vary concrete implementations sharing those two maps. Distinct cases use disjoint transpositions: prefix widths double and symbolic checking can cost more. Bounded fallback cases force work or memory exhaustion. No universal polynomial-time claim is made for arbitrary maps, relations, or engineering search.

Full ablations, timing/phase/heap samples, fallback reasons, support counts, prefix widths and source hashes are generated into git-ignored latest.json. Regenerate with `pnpm bench:synthesis`. Timings are observations, never correctness thresholds.
