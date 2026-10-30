import Semantics
import Mathlib.CategoryTheory.Elements

/-!
# Restriction, element lifts, and conditional residual descent

The grid is covariant on time and opposite inclusion. Its category of elements therefore has
unique forward lifts (the discrete opfibration orientation). Reversing the category of elements
and its base gives the discrete fibration orientation; no backwards rewrite is asserted.
Residual descent requires a uniform context projection square and saturation of the target.
Extension alone supplies a projection equality, not target saturation.
-/
namespace CategoricalTriz
open CategoryTheory Opposite
universe u v w

/-- Unique forward lifts in Mathlib's category of elements, over a fixed base arrow and source. -/
theorem elements_unique_forward_lift {C : Type u} [Category.{v} C] (F : C ⥤ Type w)
    (x : F.Elements) {Y : C} (f : x.1 ⟶ Y) :
    ∃! lift : Σ y : F.obj Y, x ⟶ F.elementsMk Y y, lift.2.hom = f := by
  refine ⟨⟨F.map f x.2, ⟨f, rfl⟩⟩, rfl, ?_⟩
  rintro ⟨y, ⟨g, hg⟩⟩ h
  dsimp at h
  subst g
  change F.map f x.2 = y at hg
  subst y
  rfl

/-- The grid lifts in the actual forward time and restriction direction. -/
theorem restrictionGrid_unique_forward_lift {B : Type u} {P W C : Type u}
    (r₁ r₂ : Wiring.Rule B W) (x : (Wiring.restrictionGrid (P := P) (C := C) r₁ r₂).Elements)
    {Y : Fin 3 × (Set B)ᵒᵖ} (f : x.1 ⟶ Y) :
    ∃! lift : Σ y : (Wiring.restrictionGrid (P := P) (C := C) r₁ r₂).obj Y,
      x ⟶ (Wiring.restrictionGrid (P := P) (C := C) r₁ r₂).elementsMk Y y,
      lift.2.hom = f :=
  elements_unique_forward_lift _ x f

/-- In the opposite category, the same lifts have the discrete fibration orientation. -/
theorem elements_unique_opposite_lift {C : Type u} [Category.{v} C] (F : C ⥤ Type w)
    (x : F.Elements) {Y : C} (f : x.1 ⟶ Y) :
    ∃! lift : Σ y : F.obj Y,
      op (F.elementsMk Y y) ⟶ op x, lift.2.unop.hom = f := by
  refine ⟨⟨F.map f x.2, (show x ⟶ F.elementsMk Y (F.map f x.2) from ⟨f, rfl⟩).op⟩, rfl, ?_⟩
  rintro ⟨y, g⟩ h
  have huniq : (⟨y, g.unop⟩ : Σ y : F.obj Y, x ⟶ F.elementsMk Y y) =
      ⟨F.map f x.2, ⟨f, rfl⟩⟩ := (elements_unique_forward_lift F x f).unique h rfl
  have mapped := congrArg (fun l : Σ y : F.obj Y, x ⟶ F.elementsMk Y y =>
    (⟨l.1, l.2.op⟩ : Σ y : F.obj Y, op (F.elementsMk Y y) ⟶ op x)) huniq
  simpa using mapped

/-- The reversed grid projection has the corresponding unique incoming lifts. -/
theorem restrictionGrid_unique_opposite_lift {B : Type u} {P W C : Type u}
    (r₁ r₂ : Wiring.Rule B W) (x : (Wiring.restrictionGrid (P := P) (C := C) r₁ r₂).Elements)
    {Y : Fin 3 × (Set B)ᵒᵖ} (f : x.1 ⟶ Y) :
    ∃! lift : Σ y : (Wiring.restrictionGrid (P := P) (C := C) r₁ r₂).obj Y,
      op ((Wiring.restrictionGrid (P := P) (C := C) r₁ r₂).elementsMk Y y) ⟶ op x,
      lift.2.unop.hom = f :=
  elements_unique_opposite_lift _ x f

section Descent
variable {α β γ δ γ' δ' : Type u}
/-- Projection of an external relation along its interface map. -/
def projectRelation (p : γ × δ → γ' × δ') (R : SetRel γ δ) : SetRel γ' δ' := p '' R

/-- A uniform projection square and target saturation suffice for residual descent. -/
theorem residual_descends (C : SetRel α β → SetRel γ δ)
    (C' : SetRel α β → SetRel γ' δ') (p : γ × δ → γ' × δ')
    (T : SetRel γ δ) (T' : SetRel γ' δ')
    (square : ∀ R, projectRelation p (C R) = C' R)
    (saturated : T = p ⁻¹' T') : residual C T = residual C' T' := by
  ext r
  change C {r} ⊆ T ↔ C' {r} ⊆ T'
  rw [saturated, ← square {r}]
  exact Set.image_subset_iff.symm

/-- The existing steady-state extension condition establishes one context projection square.
Apply it to each hole relation to obtain the uniform square required by `residual_descends`. -/
theorem external_sub_project_of_extends {V I O I' O' : Type u}
    (d : Semantics.OpenDiagram V I O) (P : Set d.Port) (B : Set d.Box)
    (inp : I' → P) (out : O' → P) (fI : I' → I) (fO : O' → O)
    (hI : ∀ i, (inp i : d.Port) = d.input (fI i))
    (hO : ∀ o, (out o : d.Port) = d.output (fO o))
    (hext : ∀ t ∈ (d.sub P B inp out).steadyStates, ∃ s ∈ d.steadyStates, s ∘ Subtype.val = t) :
    projectRelation (fun p : (I → V) × (O → V) => (p.1 ∘ fI, p.2 ∘ fO))
      {p | d.external p.1 p.2} = {p | (d.sub P B inp out).external p.1 p.2} := by
  ext ⟨x, y⟩
  constructor
  · rintro ⟨⟨x₀, y₀⟩, h, heq⟩
    have hx : x₀ ∘ fI = x := congrArg Prod.fst heq
    have hy : y₀ ∘ fO = y := congrArg Prod.snd heq
    exact (d.external_sub_iff_of_extends hI hO hext).2 ⟨x₀, y₀, h, hx, hy⟩
  · intro h
    obtain ⟨x₀, y₀, h₀, hx, hy⟩ := (d.external_sub_iff_of_extends hI hO hext).1 h
    exact ⟨(x₀, y₀), h₀, Prod.ext hx hy⟩
end Descent

section Counterexample
/-- Two distinct full outcomes have the same projection. -/
def witnessContext (R : SetRel Bool Unit) : SetRel Unit Bool := (fun r => ((), r.1)) '' R
def witnessProjection (r : Unit × Bool) : Unit × Unit := (r.1, ())
def witnessProjectedContext (R : SetRel Bool Unit) : SetRel Unit Unit :=
  projectRelation witnessProjection (witnessContext R)
def witnessTarget : SetRel Unit Bool := { ((), false) }
def witnessProjectedTarget : SetRel Unit Unit := { ((), ()) }

/-- With the same non-injective projection, saturating the target restores descent. -/
theorem saturated_witness_descent :
    residual witnessContext (witnessProjection ⁻¹' witnessProjectedTarget) =
      residual witnessProjectedContext witnessProjectedTarget :=
  residual_descends witnessContext witnessProjectedContext witnessProjection _ _ (fun _ => rfl) rfl

/-- Every projected outcome extends and the context square holds, yet residuals differ when the
full target discards one of two outcomes in the same projection fiber. -/
theorem extension_without_saturation_counterexample :
    (∀ R, projectRelation witnessProjection (witnessContext R) = witnessProjectedContext R) ∧
    projectRelation witnessProjection (witnessContext Set.univ) = witnessProjectedTarget ∧
    projectRelation witnessProjection witnessTarget = witnessProjectedTarget ∧
    witnessTarget ≠ witnessProjection ⁻¹' witnessProjectedTarget ∧
    residual witnessContext witnessTarget ≠ residual witnessProjectedContext witnessProjectedTarget := by
  refine ⟨fun _ => rfl, ?_, ?_, ?_, ?_⟩
  · ext ⟨a, b⟩
    cases a; cases b
    simp [projectRelation, witnessProjection, witnessContext, witnessProjectedTarget]
  · ext ⟨a, b⟩
    cases a; cases b
    simp [projectRelation, witnessProjection, witnessTarget, witnessProjectedTarget]
  · intro h
    have : ((), true) ∈ witnessTarget := by
      rw [h]
      simp [witnessProjection, witnessProjectedTarget]
    simp [witnessTarget] at this
  · intro h
    have hm : (true, ()) ∈ residual witnessProjectedContext witnessProjectedTarget := by
      simp [residual, witnessProjectedContext, projectRelation, witnessContext,
        witnessProjectedTarget, witnessProjection]
    rw [← h] at hm
    simp [residual, witnessContext, witnessTarget] at hm
end Counterexample
end CategoricalTriz
