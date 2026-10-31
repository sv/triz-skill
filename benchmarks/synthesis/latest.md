# Synthesis search benchmark

Finite fixed-wiring libraries, including the unchanged shipped driver request. Every variant completed under identical work/state limits and matched exhaustive verdicts, satisfying counts and declaration-order first witnesses. Timings include parsing, preprocessing, independent declaration/certificate checking, propagation, validation, caching and result construction. Each request gets fresh caches. Offline Lean checks are reported separately. Small requests use optimized fallback unless a certificate is explicitly requested; the forced variant isolates that cost. These are declared finite examples, not production performance evidence.

Node v22.23.0, linux/arm64, unknown; 7 rotated samples after one warmup.

| Case | Full validations E / O / S | Union traces O → S | Summary states / transitions | Median ms E / O / S | O / S speedup |
|---|---:|---:|---:|---:|---:|
| repository-driver | 2 / 1 / 1 | 3 → 3 | 0 / 0 | 0.23 / 0.16 / 0.16 | 1.00× |
| safety | 256 / 1 / 1 | 512 → 512 | 0 / 0 | 95.31 / 2.80 / 2.62 | 1.07× |
| coverage | 243 / 1 / 1 | 32 → 32 | 0 / 0 | 53.76 / 0.92 / 0.90 | 1.02× |
| memoization | 256 / 256 / 256 | 4 → 4 | 6 / 5 | 66.14 / 33.60 / 35.48 | 0.95× |
| coupled | 64 / 32 / 32 | 128 → 4 | 14 / 23 | 13.89 / 8.29 / 8.52 | 0.97× |
| chain-2 | 4 / 2 / 2 | 8 → 8 | 0 / 0 | 0.52 / 0.34 / 0.35 | 0.98× |
| chain-4 | 16 / 8 / 8 | 32 → 32 | 0 / 0 | 2.85 / 1.40 / 1.53 | 0.92× |
| chain-8 | 256 / 128 / 128 | 512 → 4 | 18 / 31 | 63.71 / 36.74 / 36.21 | 1.01× |
| chain-10 | 1024 / 1024 / 512 | 2048 → 4 | 22 / 39 | 288.37 / 257.44 / 165.76 | 1.55× |
| library-2 | 8 / 4 / 4 | 16 → 16 | 0 / 0 | 1.51 / 0.88 / 0.93 | 0.95× |
| library-4 | 64 / 32 / 32 | 16 → 4 | 8 / 11 | 11.56 / 4.40 / 4.99 | 0.88× |
| library-8 | 512 / 256 / 256 | 16 → 4 | 8 / 11 | 67.65 / 27.64 / 28.30 | 0.98× |
| distinct-3 | 8 / 1 / 1 | 12 → 12 | 0 / 0 | 1.76 / 0.45 / 0.44 | 1.03× |
| distinct-5 | 32 / 1 / 1 | 20 → 20 | 0 / 0 | 15.61 / 0.96 / 0.89 | 1.08× |
| joint-chain-2 | 4 / 2 / 2 | 16 → 16 | 0 / 0 | 1.20 / 0.63 / 0.65 | 0.98× |
| joint-chain-4 | 16 / 8 / 8 | 64 → 64 | 0 / 0 | 5.83 / 3.13 / 3.28 | 0.96× |
| joint-chain-6 | 64 / 32 / 32 | 256 → 8 | 14 / 23 | 29.42 / 14.63 / 14.27 | 1.03× |
| joint-chain-8 | 256 / 256 / 128 | 1024 → 8 | 18 / 31 | 131.68 / 106.06 / 70.83 | 1.50× |
| joint-library-4 | 64 / 32 / 32 | 32 → 8 | 8 / 11 | 19.34 / 6.49 / 6.60 | 0.98× |
| joint-library-8 | 512 / 256 / 256 | 32 → 8 | 8 / 11 | 126.43 / 40.56 / 40.87 | 0.99× |
| joint-correlated | 4 / 2 / 2 | 16 → 16 | 0 / 0 | 0.89 / 0.59 / 0.57 | 1.03× |
| joint-unit-source | 4 / 2 / 2 | 4 → 4 | 0 / 0 | 0.82 / 0.54 / 0.53 | 1.00× |
| symbolic-work-fallback | 16 / 8 / 8 | 32 → 32 | 0 / 0 | 3.18 / 1.59 / 1.77 | 0.89× |
| symbolic-memory-fallback | 16 / 8 / 8 | 32 → 32 | 0 / 0 | 3.17 / 1.49 / 1.81 | 0.82× |

## Existing repository request: before/after

Unchanged `triz_synthesize` request in examples/assurance/requests.json; 31 rotated batches of 20 requests after 1,000 warmups per variant. Both versions warm together before the larger benchmark cases. Median ms per complete request; preprocessing, runtime checks and result construction included. Baseline source fingerprint and all samples are in local latest.json. Reproduce with `pnpm bench:synthesis --baseline /path/to/baseline-checkout`.

| Variant | Median ms | Work | Full validations | Union traces | Unchanged passes reused |
|---|---:|---:|---:|---:|---:|
| previous optimized | 0.164 | 286 | 1 | 3 | 0 |
| previous symbolic | 0.186 | 315 | 1 | 3 | 0 |
| current optimized | 0.169 | 286 | 1 | 3 | 1 |
| current symbolic | 0.157 | 286 | 1 | 3 | 1 |

E = exhaustive; O = current optimized; S = adaptive checked symbolic. Unsupported, small or capped compilation falls back to optimized. Full validations still check original engineering choices; behavior grouping does not collapse their costs/resources.

## Trace, cache, and work accounting

| Case | Variant | All traces | Boundary cache hits | Primitive compositions / avoided | Residual calls / cache hits | Symbolic checks (work) | Retained symbolic chars | Work | Median ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| repository-driver | optimized | 7 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 286 | 0.16 |
| repository-driver | symbolic forced | 7 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 293 | 0.20 |
| repository-driver | symbolic without residual cache | 7 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 286 | 0.16 |
| repository-driver | symbolic | 7 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 286 | 0.16 |
| chain-10 | optimized | 5040 | 1065 | 0 / 0 | 0 / 0 | 0 | 0 | 566363 | 257.44 |
| chain-10 | symbolic forced | 1890 | 594 | 39 / 0 | 1 / 1022 | 1624 | 7996 | 345486 | 168.69 |
| chain-10 | symbolic without residual cache | 1890 | 594 | 39 / 0 | 1023 / 0 | 1624 | 7994 | 353657 | 167.94 |
| chain-10 | symbolic | 1890 | 594 | 39 / 0 | 1 / 1022 | 1624 | 7996 | 345486 | 165.76 |
| library-8 | optimized | 26 | 764 | 0 / 0 | 0 / 0 | 0 | 0 | 52992 | 27.64 |
| library-8 | symbolic forced | 14 | 764 | 11 / 30 | 2 / 327 | 1145 | 5114 | 59069 | 28.72 |
| library-8 | symbolic without residual cache | 14 | 764 | 11 / 30 | 329 / 0 | 1145 | 5110 | 61165 | 29.18 |
| library-8 | symbolic | 14 | 764 | 11 / 30 | 2 / 327 | 1145 | 5114 | 59069 | 28.30 |
| distinct-5 | optimized | 40 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 8094 | 0.96 |
| distinct-5 | symbolic forced | 40 | 2 | 63 / 0 | 1 / 0 | 8593 | 20508 | 17703 | 3.06 |
| distinct-5 | symbolic without residual cache | 40 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 8094 | 0.95 |
| distinct-5 | symbolic | 40 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 8094 | 0.89 |
| joint-chain-8 | optimized | 2484 | 276 | 0 / 0 | 0 / 0 | 0 | 0 | 311409 | 106.06 |
| joint-chain-8 | symbolic forced | 876 | 168 | 31 / 0 | 1 / 254 | 2741 | 9891 | 135791 | 67.97 |
| joint-chain-8 | symbolic without residual cache | 876 | 168 | 31 / 0 | 255 / 0 | 2741 | 9889 | 139342 | 68.86 |
| joint-chain-8 | symbolic | 876 | 168 | 31 / 0 | 1 / 254 | 2741 | 9891 | 135791 | 70.83 |

## Proof checking and bounds

Reusable laws compiled and all theorem axioms audited locally in 567.35 ms. These are build-time costs. Per-request normalized certificate/declaration/substitution checks run inside TypeScript and are INCLUDED in request timings and work. Optional offline kernel checks of actual generated whole-region certificates took 288.49–418.45 ms per request; encoding sizes 2119–5944 bytes. 10 altered certificates per request were rejected by kernel-proved false propositions; process failures and timeouts are not accepted as rejection evidence. The remaining trust boundary is documented in docs/symbolic-synthesis.md.

Global work ≤ 1,000,000; solver states ≤ 100,000 (synthetic fixtures: 10,000); symbolic/residual work per pass ≤ 100,000 and ≤ one quarter of remaining work. Retained symbolic encoding/masks/residual cache ≤ 200,000 characters; residual cache ≤ 128 entries. Boundary cache ≤ 128 entries / 200,000 cells and key characters. Retained symbolic characters and boundary cells/key characters are logical bounds, not JS heap byte bounds. Heap samples after each request include process history, GC and other variants; they are not peak allocation measurements. Search work also bounds transient DAG construction; compilation and propagation each receive at most one quarter of then-remaining work.

Safety/coverage exercise unsupported nondeterministic/partial rows. Copy/involution chain prefixes retain two maps (after the fixed source's one map), while support multiplicities remain exponential. Joint cases compose multi-port maps with explicit typed wire permutations; the correlated case changes arity 2→1→2, and the unit-source case starts from a zero-port source. Duplicate primitive grouping and residual reuse compound the summary sharing; the uncached symbolic variant isolates residual-cache effects. Library cases vary concrete implementations sharing those two maps. Distinct cases use disjoint transpositions: prefix widths double and symbolic checking can cost more. Bounded fallback cases force work or memory exhaustion. No universal polynomial-time claim is made for arbitrary maps, relations, or engineering search.

Full ablations, timing/phase/heap samples, fallback reasons, support counts, prefix widths and source hashes are generated into git-ignored latest.json. Regenerate with `pnpm bench:synthesis`. Timings are observations, never correctness thresholds.
