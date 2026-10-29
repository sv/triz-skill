# Selecting between adequate concepts: weakness

Stage 4 (Synthesize) produces at least three mechanisms. Often more than one resolves the
contradiction on the evidence available. This reference decides between them.

## The criterion

> Among concepts that resolve the contradiction equally well on the evidence you have, choose the
> one that **commits to the fewest facts about the operating conditions**.

The number of situations a concept admits is its *weakness*. Maximise it.

This is not the same as choosing the simplest or shortest concept, and the two come apart exactly
where it matters. A concept can be stated in one clause and still assume a great deal (one clause
naming a specific mechanism, supplier, protocol, or operating regime). Another can take three
clauses and assume almost nothing. The first is short and **strong**; the second is longer and
**weak**. Strength is what fails when conditions change.

## Why

Michael Timothy Bennett, *The Optimal Choice of Hypothesis Is the Weakest, Not the Shortest*
(AGI-23, arXiv:2301.12987v4), proves that under a uniform distribution over tasks:

- maximising weakness is **necessary and sufficient** to maximise the probability that a hypothesis
  inferred from a known task generalises to an unknown broader task;
- minimising description length is **neither**, shown by counterexample;
- generalisation is *impossible* once a hypothesis excludes states the broader task requires — so
  over-commitment is not a matter of degree, it is a hard failure.

Measured on binary arithmetic, weakest-hypothesis selection generalised at 110–500% of the rate of
minimum-description-length selection. The paper measures a hypothesis's weakness as the number of
situations it admits (the size of its extension).

## Procedure

1. **Enumerate operating situations.** List the conditions the concept must work under, including
   ones no stakeholder has asked for yet — other suppliers, other volumes, other regulatory regimes,
   other adjacent systems. This list is the measuring instrument; a careless list gives a careless
   answer. For a modelled concept, the list is its declared input space (see below).
2. **For each concept, mark the situations it admits.** A situation is admitted if the concept still
   functions there without modification. Be strict: "we could extend it later" is not admitting.
3. **Rank by inclusion, then by count.** A concept that admits every situation another admits,
   and more, is weaker. Two concepts that each admit a situation the other rejects are
   incomparable: say so, and decide between them by step 4 or by a real prior. The count comes
   second. Under a uniform distribution over your list it is the paper's measure, but splitting
   one situation into two changes it. A strict inclusion always gives a larger count, so the two
   never disagree there. Between incomparable concepts, the count depends on how finely you
   listed the situations.
4. **Break ties on simplicity, cost, and time** — never the reverse order.
5. **Record what each rejected concept would have committed to.** That list is the substantiation
   evidence if the decision is revisited, and it is what makes an over-committed choice visible to
   a reviewer.

## Modelled concepts: `triz_weakness`

When each candidate is a function model that declares behaviour (see
[categorical-model.md](categorical-model.md#weakness-ranking)), `triz_weakness` performs steps
1–3:

- **Step 1** is the declared input space. A situation is a valuation of the concepts' boundary
  inputs (unwired input ports, matched by box and port id) over their carriers' declared
  `values`. Declaring the values is enumerating the situations.
- **Step 2.** A concept admits a situation when it has a steady state there and every
  deliverable output there is acceptable. You give `acceptable`, per deliverable port, and it is
  required. A situation with no steady state is not admitted.
- **Step 3.** The output ranks by inclusion: the weakest concept if there is one, the maximal
  ones, and each pair with a situation only one admits, each way. The counts follow.

It refuses concepts that deliver different ports. A concept that drops a deliverable has fewer
outputs to be acceptable, and that is vagueness, not weakness. Adequacy (does the concept
resolve the contradiction), step 4, and step 5 stay with you. For concepts not modelled, follow
the procedure by hand.

## Guardrails

- **Weakness is not vagueness.** A concept that admits every situation because it specifies nothing
  is not weak, it is empty — it must still resolve the contradiction. Filter for adequacy first,
  rank by weakness second. This ordering is not optional.
- **Weakness is not speculative generality.** Adding options, knobs, or configurability *adds*
  commitments about how the system will be operated. It makes a concept stronger, not weaker. The
  weak concept is the one that needs to assume less, not the one that does more.
- **A real prior beats the uniform assumption.** The proof assumes a uniform distribution over
  tasks. Where you have genuine evidence about which situations will actually arise, use it —
  weakness is the correct default under ignorance, not an override for knowledge.
- **Safety predicates are exempt.** Where a concept governs a safety, integrity, or authorisation
  decision, admitting more states is the wrong direction. Fail closed and select on other grounds.
- **Weakness is relative to your enumeration.** Change the situation list and the ranking can
  change. State the list alongside the decision. For modelled concepts, the list is the declared
  carrier values.
