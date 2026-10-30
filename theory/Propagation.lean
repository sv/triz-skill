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

/-! Overlap-aware table consistency is stronger than unary-domain consistency. A running
intersection order is an explicit acyclicity witness for the constraint scopes. These results
do not infer that witness from a wiring DAG or verify the runtime reducer. -/

namespace Propagation

variable {V A : Type*}

structure Table (V A : Type*) where
  scope : Set V
  rows : Set (V → A)

def Agrees (scope : Set V) (a b : V → A) : Prop := ∀ v ∈ scope, a v = b v

def Satisfies (tables : List (Table V A)) (assignment : V → A) : Prop :=
  ∀ t ∈ tables, ∃ row ∈ t.rows, Agrees t.scope row assignment

/-- A semijoin keeps a left row exactly when the right table supports its whole overlap. -/
def semijoin (left right : Table V A) : Table V A :=
  { left with rows := {row | row ∈ left.rows ∧
      ∃ other ∈ right.rows, Agrees (left.scope ∩ right.scope) row other} }

theorem satisfies_pair_iff_semijoin (left right : Table V A) (a : V → A) :
    Satisfies [left, right] a ↔ Satisfies [semijoin left right, right] a := by
  constructor
  · intro h
    obtain ⟨l, hl, hla⟩ := h left (by simp)
    obtain ⟨r, hr, hra⟩ := h right (by simp)
    intro t ht
    simp only [List.mem_cons, List.not_mem_nil, or_false] at ht
    rcases ht with ht | ht
    · subst t
      exact ⟨l, ⟨hl, r, hr, fun v hv => (hla v hv.1).trans (hra v hv.2).symm⟩, hla⟩
    · subst t
      exact ⟨r, hr, hra⟩
  · intro h t ht
    simp only [List.mem_cons, List.not_mem_nil, or_false] at ht
    rcases ht with ht | ht
    · subst t
      obtain ⟨l, hl, ha⟩ := h (semijoin left right) (by simp)
      exact ⟨l, hl.1, ha⟩
    · subst t
      exact h right (by simp)

def PairwiseConsistent (tables : List (Table V A)) : Prop :=
  ∀ left ∈ tables, ∀ right ∈ tables, ∀ row ∈ left.rows,
    ∃ other ∈ right.rows, Agrees (left.scope ∩ right.scope) row other

/-- Remove the first scope as a leaf: all its intersections with remaining scopes lie in
one remaining parent scope. This is a supplied running-intersection elimination order. -/
def RunningIntersection : List (Table V A) → Prop
  | [] => True
  | t :: ts => RunningIntersection ts ∧
      (ts = [] ∨ ∃ parent ∈ ts, ∀ other ∈ ts, t.scope ∩ other.scope ⊆ parent.scope)

/-- Nonempty, pairwise-consistent tables with a running-intersection order have a global
assignment. No such claim holds for arbitrary cyclic constraint hypergraphs. -/
theorem exists_solution_of_runningIntersection [Nonempty A] (tables : List (Table V A))
    (nonempty : ∀ t ∈ tables, t.rows.Nonempty)
    (consistent : PairwiseConsistent tables) (tree : RunningIntersection tables) :
    ∃ a, Satisfies tables a := by
  classical
  induction tables with
  | nil => exact ⟨fun _ => Classical.arbitrary A, by simp [Satisfies]⟩
  | cons t ts ih =>
    obtain ⟨a, ha⟩ := ih (fun c hc => nonempty c (by simp [hc]))
      (fun l hl r hr => consistent l (by simp [hl]) r (by simp [hr])) tree.1
    rcases tree.2 with empty | ⟨parent, hp, overlap⟩
    · subst ts
      obtain ⟨row, hr⟩ := nonempty t (by simp)
      refine ⟨row, fun c hc => ?_⟩
      have eq : c = t := by simpa using hc
      subst c
      exact ⟨row, hr, fun _ _ => rfl⟩
    · obtain ⟨pr, hpr, hpa⟩ := ha parent hp
      obtain ⟨row, hr, hmatch⟩ := consistent parent (by simp [hp]) t (by simp) pr hpr
      let merged := fun v => if v ∈ t.scope then row v else a v
      refine ⟨merged, ?_⟩
      intro c hc
      rcases List.mem_cons.mp hc with rfl | hc
      · exact ⟨row, hr, fun v hv => by simp [merged, hv]⟩
      · obtain ⟨cr, hcr, hca⟩ := ha c hc
        refine ⟨cr, hcr, ?_⟩
        intro v hv
        by_cases ht : v ∈ t.scope
        · have hvp := overlap c hc ⟨ht, hv⟩
          have eq := (hca v hv).trans ((hpa v hvp).symm.trans (hmatch v ⟨hvp, ht⟩))
          simpa [merged, ht] using eq
        · simpa [merged, ht] using hca v hv

end Propagation
