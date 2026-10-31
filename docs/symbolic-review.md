# Symbolic synthesis soundness review

Scope: the finite-map compiler, original declaration binding, whole-context substitution,
choice-support traversal, local Lean export/checker and engineering-validation bridge.
The exhaustive reference mode and independent whole-port oracle remain separate from the
symbolic implementation.

## Fixed findings

**High — sparse arrays could pass the independent certificate checker.** JavaScript's
`every`, `map` and `some` skip missing array entries. Sparse cumulative images could pass
root identity, map validity and composition checks, even when bound primitive relations were
complete. A same-behavior library with one summary per prefix demonstrated acceptance of
missing map values. The checker now requires dense arrays, string domain values, natural
indices, full row pairs and valid edge indices before interpreting a certificate. Regression
tests exercise both stand-alone checking and original-declaration binding.

**Medium — the Lean export did not require a complete region.** Stage certificates alone
left unchecked terminal layers possible; deleting all stages produced a root-only proof.
The encoding now includes box/hole references and choice counts. `regionOK` requires a
nonempty stage list, exactly one more layer than stages, a valid identity root, unique box
and concrete-hole references, and every connected stage's full finite checks. Negative
kernel tests remove stages, append layers, repeat holes and alter choice counts.

**Medium — negative proof checks accepted tool failures as rejection evidence.** A nonzero
or missing exit status previously counted as a successful tamper test, while positive axiom
audits checked only the number of messages. The checker now requires normal process completion
and an explicit kernel-checked false proposition for each negative test. Positive audits must
match every theorem identity exactly once and use only the standard axioms. Missing tools,
timeouts, malformed output, warnings, duplicate audits and extra axioms are covered separately.

## Whole-model and backward-pruning checks

The compiler now independently checks the actual reduced context before residual enumeration.
Every outside box and wire must survive, with original metadata, resource declarations,
polarity and carrier information. Only certified interior edges are removed, only certified
tails are redirected, and every virtual alternative is checked against its terminal map.
Negative tests remove a disconnected box or external wire, change a resource mode/polarity,
and corrupt a virtual row.

No incorrect backward pruning was found. A literal whole-port oracle computes the accepted
concrete assignments independently. All 343 nonempty partial choice domains are checked in
each of two contexts, including restricted operating inputs and reversed hole declaration
order. Every oracle solution survives; singleton domains are accepted exactly when the oracle
accepts that concrete assignment. Existing cap/rollback, feedback, fan-in, correlated-port,
disconnected-loop and resource-distinction tests are retained.

The full engineering validator continues to receive original concrete implementations.
Behavior-equivalent choices retain distinct engineering outcomes and internal-state diagnostics.
Unsupported relations and exhausted preprocessing allowances retain bounded optimized fallback.

## Limits

The TypeScript compiler, checker, normalization, residual solver, traversal/counting and
engineering validator are executable trust boundaries. Lean checks the emitted normalized
complete regions; it does not parse FunctionModel inputs, prove JavaScript control flow or
establish empirical correctness. See [the detailed scope and proof coverage](symbolic-synthesis.md).
The benchmark report includes all new checks and separates per-request checking from offline
proof compilation and kernel certificate checking.
