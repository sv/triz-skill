import Mathlib.Order.FixedPoints

/-! Source grounding as least Horn closure. Facts and rules are declarations, not physical
laws. The trace theorem checks a finite activation derivation together with closure at its
end. It does not verify the TypeScript encoder, resource balance, or timed startup. -/

namespace SourceSupport

variable {F R : Type*}

/-- One monotone round retains facts, includes boundary supplies, and fires enabled rows. -/
def step (seed : Set F) (needs gives : R → Set F) : Set F →o Set F where
  toFun S := seed ∪ S ∪ {f | ∃ r, needs r ⊆ S ∧ f ∈ gives r}
  monotone' := by
    intro S T h f hf
    rcases hf with (hs | hs) | ⟨r, hr, hg⟩
    · exact Or.inl (Or.inl hs)
    · exact Or.inl (Or.inr (h hs))
    · exact Or.inr ⟨r, hr.trans h, hg⟩

noncomputable def closure (seed : Set F) (needs gives : R → Set F) : Set F :=
  (step seed needs gives).lfp

/-- A candidate contains every source fact and is closed under all declared rows. -/
def Closed (seed : Set F) (needs gives : R → Set F) (S : Set F) : Prop :=
  seed ⊆ S ∧ ∀ r, needs r ⊆ S → gives r ⊆ S

theorem step_subset_iff (seed : Set F) (needs gives : R → Set F) (S : Set F) :
    step seed needs gives S ⊆ S ↔ Closed seed needs gives S := by
  constructor
  · intro h
    exact ⟨fun _ hf => h (Or.inl (Or.inl hf)),
      fun r hr _ hg => h (Or.inr ⟨r, hr, hg⟩)⟩
  · rintro ⟨hs, hc⟩ f ((hf | hf) | ⟨r, hr, hg⟩)
    · exact hs hf
    · exact hf
    · exact hc r hr hg

theorem closure_closed (seed : Set F) (needs gives : R → Set F) :
    Closed seed needs gives (closure seed needs gives) :=
  (step_subset_iff seed needs gives _).mp (step seed needs gives).map_lfp.le

/-- Leastness excludes facts supported only by a circular assumption. -/
theorem closure_le (seed : Set F) (needs gives : R → Set F) {S : Set F}
    (h : Closed seed needs gives S) : closure seed needs gives ⊆ S :=
  (step seed needs gives).lfp_le ((step_subset_iff seed needs gives S).mpr h)

/-- A finite activation trace may fire a row only after all its premises are available. -/
inductive Derivation (seed : Set F) (needs gives : R → Set F) : Set F → Prop
  | source : Derivation seed needs gives seed
  | fire {S : Set F} (prior : Derivation seed needs gives S) (r : R)
      (enabled : needs r ⊆ S) : Derivation seed needs gives (S ∪ gives r)

theorem derivation_subset_closure (seed : Set F) (needs gives : R → Set F) {S : Set F}
    (h : Derivation seed needs gives S) : S ⊆ closure seed needs gives := by
  have hc := closure_closed seed needs gives
  induction h with
  | source => exact hc.1
  | fire _ r enabled ih => exact Set.union_subset ih (hc.2 r (enabled.trans ih))

/-- A valid finite activation trace ending at a closed set computes exactly the least closure.
No continuity or assumed bound on the number of rounds is needed for this certificate. -/
theorem derivation_eq_closure (seed : Set F) (needs gives : R → Set F) {S : Set F}
    (trace : Derivation seed needs gives S) (closed : Closed seed needs gives S) :
    S = closure seed needs gives :=
  Set.Subset.antisymm (derivation_subset_closure seed needs gives trace)
    (closure_le seed needs gives closed)

/-- A cycle of rules with nonempty premises supplies no facts without an external seed. -/
theorem closure_empty_of_nonempty_needs (needs gives : R → Set F)
    (positive : ∀ r, (needs r).Nonempty) : closure ∅ needs gives = ∅ := by
  apply Set.Subset.antisymm ?_ (Set.empty_subset _)
  apply closure_le ∅ needs gives
  refine ⟨Set.empty_subset _, ?_⟩
  intro r hr
  obtain ⟨f, hf⟩ := positive r
  exact (hr hf).elim

/-- Threshold facts faithfully turn max-combined provision into set union. Zero provision
already supplies threshold zero; no positive requirement is introduced as a source fact. -/
def levels {P L : Type*} [LinearOrder L] (available : P → L) : Set (P × L) :=
  {q | q.2 ≤ available q.1}

theorem levels_max {P L : Type*} [LinearOrder L] (a b : P → L) :
    levels (fun p => max (a p) (b p)) = levels a ∪ levels b := by
  ext q
  simp only [levels, Set.mem_ofPred_eq, Set.mem_union, le_max_iff]

theorem levels_zero {P : Type*} (p : P) (n : ℕ) :
    (p, n) ∈ levels (fun _ => (0 : ℕ)) ↔ n = 0 := by
  simp [levels]

end SourceSupport
