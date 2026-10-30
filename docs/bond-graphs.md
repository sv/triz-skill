# Bond-graph semantics: design and limits

This extension treats an energy subsystem as explicitly declared effort/flow ports and
constitutive element types. It does not infer physical domains, laws, or numerical parameters
from names. Information carriers cannot be bonds. Chemistry is outside the initial scope.
Thermal domains must declare an approximate effort/flow pair and acknowledge that approximation.

A carrier's optional `energy` declaration gives the domain name and typed effort and flow
quantities (`quantity`, SI vector). Their exponent sums must equal a power dimension, declared
explicitly as `power_si`; there is no built-in domain catalogue. A box's optional `bond` declares
one of Se, Sf, R, C, I, TF, GY, 0, or 1, and its numeric parameters. Ordinary wires remain directed
function-model wires. For this tool their declared direction supplies the power reference sign;
causality is a separate effort/flow assignment and never reverses the function rating.

Sequential assignment starts at effort/flow sources and integral-preference C/I elements,
propagates through two-port TF/GY elements and 0/1 junctions, and assigns remaining resistive
freedom by bounded search. At a 0 junction exactly one bond supplies effort; at a 1 junction
exactly one supplies flow. TF keeps effort causality on opposite ends; GY swaps it. A bond
connects two energy ports on the same carrier declaration. No cross-domain transformer is
implicit: distinct-domain ports require an explicit two-port element and compatible power
vectors. Each completed assignment is independently checked against every constraint.

A source conflict, an algebraic dependency cycle, or a storage element forced into derivative
causality is a structural finding. Algebraic loops are reported as dependencies requiring a
simultaneous constitutive solve, rather than as proof of inconsistency. Integral preference may
be relaxed only after the integral search is completely exhausted; a cap returns undecided.
A causality conflict can motivate a TRIZ contradiction or a separation hypothesis, but does not
itself prove conflicting physical requirements or select an inventive principle.

Per-storage derivative findings mean derivative causality holds in **every** admissible assignment,
checked with the other storage preferences relaxed. If only joint all-integral feasibility fails,
the finding identifies that joint constraint without naming one storage as individually forced.
`equationStructure.states` still describes one checked assignment, with `forcedDerivative`
separating necessity from that witness's choice. Search branches follow endpoint declaration
order, so reversing a wire's power-reference direction preserves the assignment and findings.

The export contains storage state candidates, effort/flow causal directions, and constitutive
constraint templates, with declared parameters. It is an equation structure, not solved
state equations or numerical simulation. Nonlinear R laws, parameter units, physical accuracy,
non-energetic flows, chemistry, and automatic thermal thermodynamics are not claimed.

The first implementation uses a bounded finite constraint form of sequential causality
assignment. It retains multiple admissible choices in declaration order and returns one checked
assignment. Lack of a complete assignment establishes a structural conflict only after the full
bounded problem is exhausted. No Lean bond-graph theorem is claimed in this stage.
