# Design-around and patent circumvention

Recurring practitioner use case: a competitor's claim blocks a needed function, or freedom to
operate requires a different mechanism. TRIZ's functional view is the working tool here. The
legal outcome, however, is decided by claim construction, the doctrine of equivalents, and
qualified counsel — never by this skill. Treat this page as method, not legal advice.

## Standard moves

1. **Element table.** Decompose the claim into its function-carrying elements. In most regimes
   every claimed element must be present for infringement (the all-elements rule), so this table
   is the real map of the design space.
2. **Trim an element.** Remove it and let the remaining system, the object itself, or the
   environment provide the function (self-service, use of resources). This is the strongest
   design-around when achievable, and it is ordinary TRIZ trimming.
3. **Substitute the function carrier.** Replace a claimed element with a different physical
   principle performing the same function — the [effects database](../data/effects.json) is the
   search space. Substituting a mechanism that works in a substantially similar way carries
   doctrine-of-equivalents risk; prefer a different principle of operation.
4. **Change the operating principle.** Rebuild the function at another system level
   (super- or subsystem) or move it along an evolution line
   ([evolution-trends.md](evolution-trends.md)): dynamize, change the working field.
5. **Reverse the flow.** Invert who acts on what: the object performs the function, or the
   environment drives the step.

## Guardrails

- Map the function, not the wording: a paraphrased element that performs identically usually
  still infringes; a changed mechanism performing the function differently may not.
- Run failure analysis on the design-around like any new concept — a new mechanism brings new
  harms, and an invented-around feature still has to substantiate.
- Close with a claim chart mapping your mechanism against each claim element, reviewed by
  qualified counsel, before relying on any design-around.
