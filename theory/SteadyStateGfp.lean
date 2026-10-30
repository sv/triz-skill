import SemanticsWitnesses
import Mathlib.Order.FixedPoints

/-!
# Whole-diagram consistency as a greatest fixed point

The operator filters sets of *complete* port valuations against every declared port domain,
box relation and wire equality. Its greatest fixed point is exactly the steady-state set.
Starting from all valuations reaches it in one step, for finite or infinite diagrams. This
is a set-theoretic characterization, not a claim of an efficient local propagation algorithm:
materializing the full valuation set can be exponential. The kernel's whole scope uses exact
finite search; this result does not prove that implementation or equate local GAC with global
consistency.
-/

namespace CategoricalTriz.Semantics.OpenDiagram

universe u
variable {V I O : Type u}

/-- A single declared constraint, indexed by a port, box, or wire. -/
def constraint {d : OpenDiagram V I O} : d.Port ⊕ d.Box ⊕ d.Wire → Set (d.Port → V)
  | .inl p => {s | s p ∈ d.values p}
  | .inr (.inl b) => d.behavior b
  | .inr (.inr w) => {s | s (d.src w) = s (d.tgt w)}

/-- Remove complete valuations failing any declared constraint. -/
def consistency (d : OpenDiagram V I O) : Set (d.Port → V) →o Set (d.Port → V) where
  toFun S := {s | s ∈ S ∧ ∀ c, s ∈ constraint c}
  monotone' := by
    intro A B h s hs
    exact ⟨h hs.1, hs.2⟩

theorem consistency_le (d : OpenDiagram V I O) (S : Set (d.Port → V)) :
    d.consistency S ⊆ S := fun _ h => h.1

theorem mem_all_constraints (d : OpenDiagram V I O) (s : d.Port → V) :
    (∀ c, s ∈ constraint c) ↔ s ∈ d.steadyStates := by
  constructor
  · intro h
    exact ⟨fun p => h (.inl p), fun b => h (.inr (.inl b)), fun w => h (.inr (.inr w))⟩
  · rintro ⟨hv, hb, hw⟩ c
    rcases c with p | b | w
    · exact hv p
    · exact hb b
    · exact hw w

/-- The greatest fixed point of the actual diagram-constraint filter is its steady states. -/
theorem steadyStates_gfp (d : OpenDiagram V I O) : d.consistency.gfp = d.steadyStates := by
  apply le_antisymm
  · intro s hs
    have hf := d.consistency.map_gfp
    have hm : s ∈ d.consistency d.consistency.gfp := hf.symm ▸ hs
    exact (mem_all_constraints d s).mp hm.2
  · apply OrderHom.le_gfp
    intro s hs
    exact ⟨hs, (mem_all_constraints d s).mpr hs⟩

/-- The descent from the full valuation set reaches the fixed point immediately. -/
theorem consistency_top (d : OpenDiagram V I O) : d.consistency ⊤ = d.steadyStates := by
  ext s
  exact ⟨fun h => (mem_all_constraints d s).mp h.2,
    fun h => ⟨trivial, (mem_all_constraints d s).mpr h⟩⟩

theorem consistency_steadyStates (d : OpenDiagram V I O) :
    d.consistency d.steadyStates = d.steadyStates := by
  rw [← steadyStates_gfp]
  exact d.consistency.map_gfp

/-- Every positive iterate from the full set equals the greatest fixed point. -/
theorem consistency_iterate_top (d : OpenDiagram V I O) (n : ℕ) :
    (d.consistency^[n + 1]) ⊤ = d.consistency.gfp := by
  induction n with
  | zero => simpa only [Nat.zero_add, Function.iterate_one, consistency_top] using (steadyStates_gfp d).symm
  | succ n ih =>
    rw [Function.iterate_succ_apply', ih, OrderHom.map_gfp]

end CategoricalTriz.Semantics.OpenDiagram

namespace CategoricalTriz.SteadyStateGfpWitnesses

open Semantics Semantics.OpenDiagram SemanticsWitnesses

/-- The identity feedback has a steady state, hence a nonempty greatest fixed point. -/
theorem identity_feedback_nonempty :
    (feedbackAlong (loopBox copy) (loopWire copy)).consistency.gfp.Nonempty := by
  rw [steadyStates_gfp]
  have h := (feedback_loopBox_iff copy Empty.elim (fun _ => true)).mpr rfl
  obtain ⟨s, hs, _, _⟩ := h
  exact ⟨s, hs⟩

/-- The negating feedback has no steady state and its greatest fixed point is empty. -/
theorem negation_feedback_empty :
    (feedbackAlong (loopBox negate) (loopWire negate)).consistency.gfp = ∅ := by
  rw [steadyStates_gfp]
  apply Set.eq_empty_iff_forall_notMem.mpr
  intro s hs
  have h := (feedback_loopBox_iff negate Empty.elim (s ∘ (feedbackAlong (loopBox negate) (loopWire negate)).output)).mp
    ⟨s, hs, Subsingleton.elim _ _, rfl⟩
  change s (2 : Fin 3) = !s (2 : Fin 3) at h
  cases hs0 : s (2 : Fin 3) <;> simp [hs0] at h

/-- A downstream condition can exclude an upstream input from the whole relation. -/
theorem downstream_strict : upstream.external (fun _ => true) (fun _ => true) ∧
    ∀ y, ¬ withDownstream.external (fun _ => true) y := by
  refine ⟨⟨fun _ => true, ⟨fun _ => trivial, fun ⟨b, hb⟩ => ⟨fun _ => true, ?_, rfl⟩,
    fun w => (w.2.2 rfl).elim⟩, rfl, rfl⟩, ?_⟩
  · rw [Set.mem_singleton_iff] at hb
    subst hb
    rfl
  · rintro y ⟨s, ⟨-, hb, hw⟩, hx, -⟩
    have h₀ : s 0 = true := congrFun hx ()
    have h₁ : s 1 = s 0 := hb false
    have h₂ : s 2 = false := hb true
    have h₃ : s 1 = s 2 := hw ()
    rw [h₁, h₀, h₂] at h₃
    exact Bool.noConfusion h₃

end CategoricalTriz.SteadyStateGfpWitnesses
