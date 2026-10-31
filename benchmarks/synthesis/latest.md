# Synthesis search benchmark

Shared-kernel finite fixed-wiring libraries, including the unchanged shipped driver request and the separator/resource control. Every variant completed under identical work/state limits and matched exhaustive verdicts, satisfying counts and declaration-order first witnesses. Timings include parsing, preprocessing, independent declaration/certificate checking, propagation, validation, caching and result construction. Each request gets fresh caches. Offline Lean checks are reported separately. Small requests use optimized fallback unless a certificate is explicitly requested; the forced variant isolates that cost. These are declared finite examples, not production performance evidence.

Node v22.23.0, linux/arm64, unknown; 7 rotated samples after one warmup.

| Case | Full validations E / O / S | Union traces O → S | Summary states / transitions | Median ms E / O / S | O / S speedup |
|---|---:|---:|---:|---:|---:|
| repository-driver | 2 / 1 / 1 | 3 → 3 | 0 / 0 | 0.25 / 0.18 / 0.18 | 0.99× |
| separators | 3 / 3 / 3 | 0 → 0 | 0 / 0 | 8.65 / 1.70 / 1.77 | 0.96× |
| safety | 256 / 1 / 1 | 512 → 512 | 0 / 0 | 131.65 / 3.64 / 3.51 | 1.04× |
| coverage | 243 / 1 / 1 | 32 → 32 | 0 / 0 | 68.84 / 1.28 / 1.09 | 1.17× |
| memoization | 256 / 256 / 256 | 4 → 4 | 6 / 5 | 70.95 / 35.72 / 37.51 | 0.95× |
| coupled | 64 / 32 / 32 | 128 → 4 | 14 / 23 | 16.68 / 8.39 / 8.94 | 0.94× |
| chain-2 | 4 / 2 / 2 | 8 → 8 | 0 / 0 | 0.57 / 0.38 / 0.40 | 0.95× |
| chain-4 | 16 / 8 / 8 | 32 → 32 | 0 / 0 | 3.72 / 1.67 / 1.53 | 1.09× |
| chain-8 | 256 / 128 / 128 | 512 → 4 | 18 / 31 | 70.41 / 42.56 / 40.65 | 1.05× |
| chain-10 | 1024 / 1024 / 512 | 2048 → 4 | 22 / 39 | 310.92 / 282.71 / 182.58 | 1.55× |
| library-2 | 8 / 4 / 4 | 16 → 16 | 0 / 0 | 1.28 / 0.90 / 0.77 | 1.18× |
| library-4 | 64 / 32 / 32 | 16 → 4 | 8 / 11 | 11.25 / 4.61 / 4.80 | 0.96× |
| library-8 | 512 / 256 / 256 | 16 → 4 | 8 / 11 | 71.28 / 28.60 / 29.59 | 0.97× |
| distinct-3 | 8 / 1 / 1 | 12 → 12 | 0 / 0 | 2.48 / 0.58 / 0.49 | 1.19× |
| distinct-5 | 32 / 1 / 1 | 20 → 20 | 0 / 0 | 15.64 / 1.25 / 1.06 | 1.18× |
| joint-chain-2 | 4 / 2 / 2 | 16 → 16 | 0 / 0 | 0.93 / 0.63 / 0.60 | 1.04× |
| joint-chain-4 | 16 / 8 / 8 | 64 → 64 | 0 / 0 | 6.07 / 3.11 / 3.22 | 0.97× |
| joint-chain-6 | 64 / 32 / 32 | 256 → 8 | 14 / 23 | 31.90 / 14.60 / 14.55 | 1.00× |
| joint-chain-8 | 256 / 256 / 128 | 1024 → 8 | 18 / 31 | 127.46 / 109.69 / 70.36 | 1.56× |
| joint-library-4 | 64 / 32 / 32 | 32 → 8 | 8 / 11 | 21.34 / 7.07 / 7.50 | 0.94× |
| joint-library-8 | 512 / 256 / 256 | 32 → 8 | 8 / 11 | 132.84 / 41.29 / 42.60 | 0.97× |
| joint-correlated | 4 / 2 / 2 | 16 → 16 | 0 / 0 | 0.86 / 0.59 / 0.60 | 1.00× |
| joint-unit-source | 4 / 2 / 2 | 4 → 4 | 0 / 0 | 0.66 / 0.46 / 0.49 | 0.95× |
| symbolic-work-fallback | 16 / 8 / 8 | 32 → 32 | 0 / 0 | 3.27 / 1.55 / 1.58 | 0.98× |
| symbolic-memory-fallback | 16 / 8 / 8 | 32 → 32 | 0 / 0 | 3.38 / 1.48 / 1.81 | 0.82× |

## Existing repository request: before/after

Unchanged `triz_synthesize` request in examples/assurance/requests.json; 31 rotated batches of 20 requests after 1,000 warmups per variant. Both versions warm together before the larger benchmark cases. Median ms per complete request; preprocessing, runtime checks and result construction included. Baseline source fingerprint and all samples are in local latest.json. Reproduce with `pnpm bench:synthesis --baseline /path/to/baseline-checkout`.

| Variant | Median ms | Work | Full validations | Union traces | Unchanged passes reused |
|---|---:|---:|---:|---:|---:|
| previous optimized | 0.147 | 286 | 1 | 3 | 1 |
| previous symbolic | 0.140 | 286 | 1 | 3 | 1 |
| current optimized | 0.168 | 304 | 1 | 3 | 1 |
| current symbolic | 0.155 | 304 | 1 | 3 | 1 |

## Shared-kernel integration: before/after

7 rotated samples after one warmup per variant; identical input and work/state limits across the archived pre-integration engine and current shared kernel.

| Case | Variant | Median ms | Work | Full validations | Union traces |
|---|---|---:|---:|---:|---:|
| separators | previous optimized | 2.14 | 5303 | 3 | 0 |
| separators | previous symbolic | 2.10 | 5303 | 3 | 0 |
| separators | current optimized | 2.70 | 2397 | 3 | 0 |
| separators | current symbolic | 2.65 | 2397 | 3 | 0 |
| chain-10 | previous optimized | 260.16 | 566363 | 1024 | 2048 |
| chain-10 | previous symbolic | 170.91 | 345486 | 512 | 4 |
| chain-10 | current optimized | 272.96 | 566379 | 1024 | 2048 |
| chain-10 | current symbolic | 180.56 | 345432 | 512 | 4 |
| joint-chain-8 | previous optimized | 105.87 | 311409 | 256 | 1024 |
| joint-chain-8 | previous symbolic | 69.21 | 135791 | 128 | 8 |
| joint-chain-8 | current optimized | 110.96 | 311407 | 256 | 1024 |
| joint-chain-8 | current symbolic | 71.61 | 135739 | 128 | 8 |

E = exhaustive; O = current optimized; S = adaptive checked symbolic. Unsupported, small or capped compilation falls back to optimized. Full validations still check original engineering choices; behavior grouping does not collapse their costs/resources.

## Trace, cache, and work accounting

| Case | Variant | All traces | Boundary cache hits | Primitive compositions / avoided | Residual calls / cache hits | Symbolic checks (work) | Retained symbolic chars | Work | Median ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| repository-driver | optimized | 7 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 304 | 0.18 |
| repository-driver | symbolic forced | 7 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 311 | 0.22 |
| repository-driver | symbolic without residual cache | 7 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 304 | 0.18 |
| repository-driver | symbolic | 7 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 304 | 0.18 |
| chain-10 | optimized | 5042 | 1064 | 0 / 0 | 0 / 0 | 0 | 0 | 566379 | 282.71 |
| chain-10 | symbolic forced | 1894 | 592 | 39 / 0 | 1 / 1022 | 1624 | 7996 | 345432 | 183.30 |
| chain-10 | symbolic without residual cache | 1894 | 592 | 39 / 0 | 1023 / 0 | 1624 | 7994 | 353603 | 184.89 |
| chain-10 | symbolic | 1894 | 592 | 39 / 0 | 1 / 1022 | 1624 | 7996 | 345432 | 182.58 |
| library-8 | optimized | 26 | 764 | 0 / 0 | 0 / 0 | 0 | 0 | 53014 | 28.60 |
| library-8 | symbolic forced | 14 | 764 | 11 / 30 | 2 / 327 | 1145 | 5114 | 59084 | 29.67 |
| library-8 | symbolic without residual cache | 14 | 764 | 11 / 30 | 329 / 0 | 1145 | 5110 | 61180 | 29.18 |
| library-8 | symbolic | 14 | 764 | 11 / 30 | 2 / 327 | 1145 | 5114 | 59084 | 29.59 |
| distinct-5 | optimized | 40 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 4800 | 1.25 |
| distinct-5 | symbolic forced | 40 | 2 | 63 / 0 | 1 / 0 | 8593 | 20508 | 16153 | 2.72 |
| distinct-5 | symbolic without residual cache | 40 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 4800 | 1.10 |
| distinct-5 | symbolic | 40 | 2 | 0 / 0 | 0 / 0 | 0 | 0 | 4800 | 1.06 |
| joint-chain-8 | optimized | 2484 | 276 | 0 / 0 | 0 / 0 | 0 | 0 | 311407 | 109.69 |
| joint-chain-8 | symbolic forced | 876 | 168 | 31 / 0 | 1 / 254 | 2741 | 9891 | 135739 | 71.84 |
| joint-chain-8 | symbolic without residual cache | 876 | 168 | 31 / 0 | 255 / 0 | 2741 | 9889 | 139290 | 70.07 |
| joint-chain-8 | symbolic | 876 | 168 | 31 / 0 | 1 / 254 | 2741 | 9891 | 135739 | 70.36 |

## Proof checking and bounds

Reusable laws compiled and all theorem axioms audited locally in 564.63 ms. These are build-time costs. Per-request normalized certificate/declaration/substitution checks run inside TypeScript and are INCLUDED in request timings and work. Optional offline kernel checks of actual generated whole-region certificates took 294.05–417.55 ms per request; encoding sizes 2119–5944 bytes. 90 altered certificates across 9 regions were rejected by kernel-proved false propositions; process failures and timeouts are not accepted as rejection evidence. The remaining trust boundary is documented in docs/symbolic-synthesis.md.

Global work ≤ 1,000,000; solver states ≤ 100,000 (synthetic fixtures: 10,000); symbolic/residual work per pass ≤ 100,000 and ≤ one quarter of remaining work. Retained symbolic encoding/masks/residual cache ≤ 200,000 characters; residual cache ≤ 128 entries. Boundary cache ≤ 128 entries / 200,000 cells and key characters. Retained symbolic characters and boundary cells/key characters are logical bounds, not JS heap byte bounds. Heap samples after each request include process history, GC and other variants; they are not peak allocation measurements. Search work also bounds transient DAG construction; compilation and propagation each receive at most one quarter of then-remaining work.

Safety/coverage exercise unsupported nondeterministic/partial rows. Copy/involution chain prefixes retain two maps (after the fixed source's one map), while support multiplicities remain exponential. Joint cases compose multi-port maps with explicit typed wire permutations; the correlated case changes arity 2→1→2, and the unit-source case starts from a zero-port source. Duplicate primitive grouping and residual reuse compound the summary sharing; the uncached symbolic variant isolates residual-cache effects. Library cases vary concrete implementations sharing those two maps. Distinct cases use disjoint transpositions: prefix widths double and symbolic checking can cost more. Bounded fallback cases force work or memory exhaustion. No universal polynomial-time claim is made for arbitrary maps, relations, or engineering search.

Validation trace counters count complete valuations actually emitted or reconstructed, including discarded attempts; factor/separator multiplicities are not enumeration. Intermediate relation work remains in relationStats. Full ablations, timing/phase/heap samples, fallback reasons, support counts, prefix widths and source hashes are generated into git-ignored latest.json. Regenerate with `pnpm bench:synthesis`. Timings are observations, never correctness thresholds.
