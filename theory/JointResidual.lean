import Semantics

namespace CategoricalTriz.Semantics.OpenDiagram

universe u
variable {V I O H : Type u}

/-- Joint ports are a disjoint union; the diagram retains all inter-hole wires. -/
def jointContext (d : OpenDiagram V I O) {Qi Qo : H → Type*}
    (pin : (Σ h, Qi h) → d.Port) (pout : (Σ h, Qo h) → d.Port) :=
  d.holeContext pin pout

theorem jointContext_preservesUnions (d : OpenDiagram V I O) {Qi Qo : H → Type*}
    (pin : (Σ h, Qi h) → d.Port) (pout : (Σ h, Qo h) → d.Port) :
    PreservesUnions (jointContext d pin pout) :=
  d.holeContext_preservesUnions pin pout

theorem joint_residual_coverage (d : OpenDiagram V I O) {Qi Qo : H → Type*}
    (pin : (Σ h, Qi h) → d.Port) (pout : (Σ h, Qo h) → d.Port)
    (T : SetRel (I → V) (O → V)) :
    (∃ R, jointContext d pin pout R = T) ↔
      T ⊆ jointContext d pin pout (residual (jointContext d pin pout) T) :=
  covers_iff_exists_eq (jointContext_preservesUnions d pin pout)

theorem joint_feasible_coverage (d : OpenDiagram V I O) {Qi Qo : H → Type*}
    (pin : (Σ h, Qi h) → d.Port) (pout : (Σ h, Qo h) → d.Port)
    (T : SetRel (I → V) (O → V)) (F : SetRel ((Σ h, Qi h) → V) ((Σ h, Qo h) → V)) :
    (∃ R ⊆ F, jointContext d pin pout R = T) ↔
      T ⊆ jointContext d pin pout (residual (jointContext d pin pout) T ∩ F) :=
  covers_feasible_iff (jointContext_preservesUnions d pin pout)

/-- Three separate output-only holes, each carrying one Boolean port. -/
abbrev ThreePorts := Σ _ : Fin 3, Unit

def threeDiagram : OpenDiagram Bool Empty ThreePorts where
  Port := ThreePorts
  Box := Empty
  Wire := Empty
  values := fun _ => Set.univ
  behavior := Empty.elim
  src := Empty.elim
  tgt := Empty.elim
  input := Empty.elim
  output := fun p => p

def threePin : (Σ _ : Fin 3, Empty) → ThreePorts := fun p => nomatch p.2
def threePout : (Σ _ : Fin 3, Unit) → ThreePorts := fun p => p

def threeTarget : SetRel (Empty → Bool) (ThreePorts → Bool) :=
  {p | p.2 ⟨0, ()⟩ = p.2 ⟨1, ()⟩ ∧ p.2 ⟨1, ()⟩ = p.2 ⟨2, ()⟩}

def jointRow (f : ThreePorts → Bool) : ((Σ _ : Fin 3, Empty) → Bool) × (ThreePorts → Bool) :=
  ((fun p => nomatch p.2), f)

theorem three_residual_iff (f : ThreePorts → Bool) :
    jointRow f ∈ residual (jointContext threeDiagram threePin threePout) threeTarget ↔
    f ⟨0, ()⟩ = f ⟨1, ()⟩ ∧ f ⟨1, ()⟩ = f ⟨2, ()⟩ := by
  simp [residual, jointContext, holeContext, external, steadyStates, withHole, ofRel,
    threeDiagram, threeTarget, threePin, threePout, jointRow, Function.comp_def, funext_iff, Option.forall]
  constructor
  · intro h
    apply h f f
    · change ∀ x, f x = f x
      intro x; rfl
    · intro x; rfl
  · intro h b x hx hb
    change ∀ p, x p = f p at hx
    have hxf : x = f := funext hx
    have hxb : x = b := funext hb
    rw [← hxb, hxf]
    exact h

/-- Each hole can project a value from a safe residual row, yet combining those
projections gives the unsafe mixed row: the residual does not factor. -/
theorem joint_nonfactorization :
    let zero : ThreePorts → Bool := fun _ => false
    let one : ThreePorts → Bool := fun _ => true
    let mixed : ThreePorts → Bool := fun p => p.1 = 2
    jointRow zero ∈ residual (jointContext threeDiagram threePin threePout) threeTarget ∧
    jointRow one ∈ residual (jointContext threeDiagram threePin threePout) threeTarget ∧
    (∀ h : Fin 3, mixed ⟨h, ()⟩ = zero ⟨h, ()⟩ ∨ mixed ⟨h, ()⟩ = one ⟨h, ()⟩) ∧
    jointRow mixed ∉ residual (jointContext threeDiagram threePin threePout) threeTarget := by
  simp only [three_residual_iff]
  simp
  intro h
  exact (Classical.em (h = 2)).symm

end CategoricalTriz.Semantics.OpenDiagram
