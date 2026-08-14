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
minimum-description-length selection.

## Procedure

1. **Enumerate operating situations.** List the conditions the concept must work under, including
   ones no stakeholder has asked for yet — other suppliers, other volumes, other regulatory regimes,
   other adjacent systems. This list is the measuring instrument; a careless list gives a careless
   answer.
2. **For each concept, mark the situations it admits.** A situation is admitted if the concept still
   functions there without modification. Be strict: "we could extend it later" is not admitting.
3. **Rank by count of admitted situations.** Highest wins.
4. **Break ties on simplicity, cost, and time** — never the reverse order.
5. **Record what each rejected concept would have committed to.** That list is the substantiation
   evidence if the decision is revisited, and it is what makes an over-committed choice visible to
   a reviewer.

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
  change. State the list alongside the decision.
