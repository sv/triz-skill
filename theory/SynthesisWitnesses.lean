import CategoricalTriz
import SourceSupport
import Propagation

/-! Small non-vacuity checks for the research-derived synthesis foundations. These are
mathematical examples, not generated request-bound runtime certificates. -/

namespace SynthesisWitnesses

open SourceSupport

/-- A supplied source enables a rule and grounds its output. -/
theorem seeded_rule : closure ({false} : Set Bool) (fun _ : Unit => {false})
    (fun _ => {true}) = Set.univ := by
  have trace : Derivation ({false} : Set Bool) (fun _ : Unit => {false})
      (fun _ => {true}) ({false} ∪ {true}) :=
    .fire .source () Set.Subset.rfl
  have both : ({false} : Set Bool) ∪ {true} = Set.univ := by
    ext b
    cases b <;> simp
  rw [both] at trace
  exact (derivation_eq_closure _ _ _ trace
    ⟨Set.subset_univ _, fun _ _ => Set.subset_univ _⟩).symm

/-- A self-supplying rule has no grounded fact in the absence of a seed. -/
theorem unseeded_cycle : closure (∅ : Set Bool) (fun _ : Unit => {true})
    (fun _ => {true}) = ∅ :=
  closure_empty_of_nonempty_needs _ _ (fun _ => ⟨true, by simp⟩)

def leftTable : Propagation.Table (Fin 3) Bool where
  scope := {0, 1}
  rows := {row | row 0 = row 1}

def rightTable : Propagation.Table (Fin 3) Bool where
  scope := {1, 2}
  rows := {row | row 1 = row 2}

/-- Two compatible tables glue over their shared variable, using an explicit leaf order. -/
theorem join_tree_solution : ∃ a, Propagation.Satisfies [leftTable, rightTable] a := by
  apply Propagation.exists_solution_of_runningIntersection
  · intro t ht
    simp only [List.mem_cons, List.not_mem_nil, or_false] at ht
    rcases ht with rfl | rfl
    · exact ⟨fun _ => false, rfl⟩
    · exact ⟨fun _ => true, rfl⟩
  · simp only [Propagation.PairwiseConsistent, List.mem_cons, List.not_mem_nil, or_false,
      forall_eq_or_imp, forall_eq]
    refine ⟨⟨?_, ?_⟩, ⟨?_, ?_⟩⟩
    · intro row hr
      exact ⟨row, hr, fun _ _ => rfl⟩
    · intro row _
      refine ⟨fun _ => row 1, rfl, ?_⟩
      intro v hv
      simp only [leftTable, rightTable, Set.mem_inter_iff, Set.mem_insert_iff,
        Set.mem_singleton_iff] at hv
      have eq : v = 1 := by grind
      subst v
      rfl
    · intro row _
      refine ⟨fun _ => row 1, rfl, ?_⟩
      intro v hv
      simp only [leftTable, rightTable, Set.mem_inter_iff, Set.mem_insert_iff,
        Set.mem_singleton_iff] at hv
      have eq : v = 1 := by grind
      subst v
      rfl
    · intro row hr
      exact ⟨row, hr, fun _ _ => rfl⟩
  · refine ⟨⟨trivial, Or.inl rfl⟩, Or.inr ⟨rightTable, by simp, ?_⟩⟩
    intro t ht
    have eq : t = rightTable := by simpa using ht
    subst t
    exact Set.inter_subset_right

/-- A randomized policy on a one-state chain is covered by the occupation bridge. -/
theorem randomized_occupation : Lifecycle.Occupation (fun _ : Unit => fun _ : Bool => fun _ : Unit => 1)
    (fun _ : Unit => fun _ : Bool => (1 / 2 : ℚ)) := by
  have h := Lifecycle.occupation_of_stationary_policy
    (fun _ : Unit => fun _ : Bool => fun _ : Unit => (1 : ℚ)) (fun _ : Unit => (1 : ℚ))
    (fun _ : Unit => fun _ : Bool => (1 / 2 : ℚ))
    (by decide +kernel) (by decide +kernel) (by decide +kernel)
  simpa using h

end SynthesisWitnesses
