import Semantics

/-! Hierarchical replacement of an open box by a diagram with the same external relation.
The context may have arbitrary wiring, including feedback. The series specialization is tied
explicitly to `glueAlong`; neither statement establishes cost or dynamic equivalence. -/
namespace CategoricalTriz.Semantics
open OpenDiagram
universe u
variable {V I O Qi Qo : Type u}

/-- Substitution into an arbitrary wired context is sound when the box summary is exactly
its inner diagram's external relation. -/
theorem hierarchy_substitution (context : OpenDiagram V I O) (inner : OpenDiagram V Qi Qo)
    (pin : Qi → context.Port) (pout : Qo → context.Port)
    (summary : (Qi → V) → (Qo → V) → Prop) (h : summary = inner.external) :
    (context.withHole pin pout {p | summary p.1 p.2}).external =
      (context.withHole pin pout {p | inner.external p.1 p.2}).external := by
  rw [h]

/-- In a series context, physically gluing the inner diagram gives composition through its
external relation, or equivalently through an equal declared box summary. -/
theorem hierarchy_glue_substitution {J K : Type u} (inner : OpenDiagram V I J)
    (context : OpenDiagram V J O) (c : K → inner.Port × context.Port)
    (hc : ∀ k, ∃ j, c k = (inner.output j, context.input j))
    (hj : ∀ j, ∃ k, c k = (inner.output j, context.input j))
    (summary : (I → V) → (J → V) → Prop) (h : summary = inner.external) :
    (glueAlong inner context c).external = Relation.Comp summary context.external := by
  rw [h]
  exact external_glueAlong hc hj
/-- Change which ports are observed, preserving the underlying diagram. -/
def reinterface (d : OpenDiagram V I O) {I' O' : Type u} (i : I' → d.Port)
    (o : O' → d.Port) : OpenDiagram V I' O' where
  Port := d.Port
  Box := d.Box
  Wire := d.Wire
  values := d.values
  behavior := d.behavior
  src := d.src
  tgt := d.tgt
  input := i
  output := o

/-- Physically substitute an inner diagram into arbitrary context ports. Cross wires connect
both sides of the box interface; context inputs and outputs remain exposed. -/
def substituteWired (d : OpenDiagram V I O) (inner : OpenDiagram V Qi Qo)
    (pin : Qi → d.Port) (pout : Qo → d.Port) : OpenDiagram V I O :=
  let left := reinterface d d.input pin
  let glued := glueAlong left inner (Sum.elim (fun i => (pin i, inner.input i))
    (fun o => (pout o, inner.output o)))
  reinterface glued glued.input (Sum.inl ∘ d.output)

/-- Actual wired substitution has exactly the semantics of the arbitrary context with a hole
whose relation is the inner diagram's external relation. This allows feedback and shared ports;
the interface cross wires impose all equalities, not merely series composition. -/
theorem external_substituteWired (d : OpenDiagram V I O) (inner : OpenDiagram V Qi Qo)
    (pin : Qi → d.Port) (pout : Qo → d.Port) :
    (substituteWired d inner pin pout).external =
      (d.withHole pin pout {p | inner.external p.1 p.2}).external := by
  funext x y
  apply propext
  constructor
  · rintro ⟨s, hs, hx, hy⟩
    obtain ⟨hd, hi, hc⟩ := mem_steadyStates_glueAlong.mp hs
    have hin : s ∘ Sum.inr ∘ inner.input = s ∘ Sum.inl ∘ pin := by
      funext i
      exact (hc (Sum.inl i)).symm
    have hout : s ∘ Sum.inr ∘ inner.output = s ∘ Sum.inl ∘ pout := by
      funext o
      exact (hc (Sum.inr o)).symm
    refine ⟨s ∘ Sum.inl, mem_steadyStates_withHole.mpr ⟨hd, ?_⟩, hx, hy⟩
    exact ⟨s ∘ Sum.inr, hi, hin, hout⟩
  · rintro ⟨s, hs, hx, hy⟩
    obtain ⟨hd, t, ht, hin, hout⟩ := mem_steadyStates_withHole.mp hs
    refine ⟨Sum.elim s t, mem_steadyStates_glueAlong.mpr ⟨hd, ht, ?_⟩, hx, hy⟩
    intro k
    cases k with
    | inl i => exact (congrFun hin i).symm
    | inr o => exact (congrFun hout o).symm

/-- An identity inner diagram substituted into an identity context admits a concrete valuation. -/
example : (substituteWired (OpenDiagram.id Bool : OpenDiagram Bool Bool Bool)
    (OpenDiagram.id Bool) id id).external (fun _ => true) (fun _ => true) := by
  delta OpenDiagram.id
  rw [external_substituteWired]
  refine ⟨fun _ => true, ?_, rfl, rfl⟩
  apply mem_steadyStates_withHole.mpr
  constructor
  · simp [OpenDiagram.steadyStates]
    exact Set.mem_univ _
  · exact ⟨fun _ => true, by
      simp [OpenDiagram.steadyStates], rfl, rfl⟩

/-- Nonempty concrete composition: identity diagrams relate an all-true boundary to itself. -/
example : (seq (OpenDiagram.id Bool : OpenDiagram Bool Bool Bool)
    (OpenDiagram.id Bool)).external (fun _ => true) (fun _ => true) := by
  rw [external_seq, external_id]
  exact ⟨fun _ => true, rfl, rfl⟩
end CategoricalTriz.Semantics
