import Mathlib.Data.Set.Basic

/-! A local generalized-arc-consistency step preserves solutions. Each constraint observes only
its declared scope. Surviving values need not extend to a joint solution. -/

namespace Propagation

variable {I V A : Type*}

/-- An assignment satisfies every scoped table and the current domains. -/
def Solution (scope : I → Set V) (tables : I → Set (V → A)) (D : V → Set A)
    (assignment : V → A) : Prop :=
  (∀ v, assignment v ∈ D v) ∧
    ∀ i, ∃ row ∈ tables i, ∀ v ∈ scope i, row v = assignment v

/-- A value survives when every incident table supports it within the current domains. -/
def pruneDomain (scope : I → Set V) (tables : I → Set (V → A)) (D : V → Set A)
    (v : V) : Set A :=
  {a | a ∈ D v ∧ ∀ i, v ∈ scope i →
    ∃ row ∈ tables i, row v = a ∧ ∀ w ∈ scope i, row w ∈ D w}

/-- Remove rows whose scoped values were removed from a domain. -/
def pruneRows (scope : I → Set V) (tables : I → Set (V → A)) (D : V → Set A)
    (i : I) : Set (V → A) :=
  {row | row ∈ tables i ∧ ∀ v ∈ scope i, row v ∈ pruneDomain scope tables D v}

/-- Every actual solution witnesses support in each incident table. -/
theorem solution_survives (scope : I → Set V) (tables : I → Set (V → A))
    (D : V → Set A) (assignment : V → A) (h : Solution scope tables D assignment) :
    Solution scope (pruneRows scope tables D) (pruneDomain scope tables D) assignment := by
  have hd : ∀ v, assignment v ∈ pruneDomain scope tables D v := by
    intro v
    refine ⟨h.1 v, ?_⟩
    intro i hv
    obtain ⟨row, hr, he⟩ := h.2 i
    refine ⟨row, hr, he v hv, ?_⟩
    intro w hw
    rw [he w hw]
    exact h.1 w
  refine ⟨hd, ?_⟩
  intro i
  obtain ⟨row, hr, he⟩ := h.2 i
  refine ⟨row, ⟨hr, ?_⟩, he⟩
  intro v hv
  rw [he v hv]
  exact hd v

/-- Pruning preserves the entire solution set, including when there are no solutions. -/
theorem solution_iff_pruned (scope : I → Set V) (tables : I → Set (V → A))
    (D : V → Set A) (assignment : V → A) :
    Solution scope tables D assignment ↔
      Solution scope (pruneRows scope tables D) (pruneDomain scope tables D) assignment := by
  constructor
  · exact solution_survives scope tables D assignment
  · intro h
    refine ⟨fun v => (h.1 v).1, ?_⟩
    intro i
    obtain ⟨row, hr, he⟩ := h.2 i
    exact ⟨row, hr.1, he⟩

end Propagation
