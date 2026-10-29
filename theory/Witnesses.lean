import CategoricalTriz

/-!
# Non-vacuity witnesses

A lemma whose hypotheses can never hold together proves nothing. For each `Wiring` lemma in
`CategoricalTriz`, this module gives:

- a concrete diagram on which all its hypotheses hold while a wire survives, so the lemma is not
  vacuous;
- a counterexample showing that each hypothesis is needed: drop it, and the conclusion fails.

The examples are checked by `lake build --wfail`, so CI keeps them in step with the lemmas.
-/

namespace CategoricalTriz.Witnesses

open CategoricalTriz CategoricalTriz.Wiring

/-- Three boxes, one wire 0 → 1; box 2 has a spare output of the same carrier (an absorber). -/
def d3 : Wiring (Fin 3) Unit Unit Unit where
  boxes := Set.univ
  wires := Set.univ
  src _ := (0, ())
  tgt _ := (1, ())
  carrier _ := ()
  out b _ := if b = 0 ∨ b = 2 then some () else none
  inp b _ := if b = 1 then some () else none

theorem d3_typed : d3.Typed := by
  intro w _
  simp [d3]

/-! ## `typed_delete`

Deleting box 2 meets the no-dangling condition and keeps the wire. Deleting box 1, the wire's
target, without deleting the wire breaks typing: `hd` is needed. -/

example : (d3.delete {2} ∅).Typed ∧ () ∈ (d3.delete {2} ∅).wires :=
  ⟨d3.typed_delete d3_typed (by intro w _ _; simp [d3]), by simp [Wiring.delete, d3]⟩

example : ¬ (d3.delete {1} ∅).Typed := by
  intro h
  have := (h () (by simp [Wiring.delete, d3])).2.1
  simp [Wiring.delete, d3] at this

/-! ## `typed_reroute`

Re-attaching the wire to box 2's same-carrier output keeps typing. Re-attaching it to box 1,
which has no output (`hq` fails), or to box 2 when box 2 is absent (`ha` fails), does not. -/

example : (d3.reroute () 2 ()).Typed := d3.typed_reroute d3_typed (by simp [d3]) (by simp [d3])

example : ¬ (d3.reroute () 1 ()).Typed := by
  intro h
  have := (h () (by simp [Wiring.reroute, d3])).2.2.1
  simp [Wiring.reroute, d3] at this

/-- `d3` without box 2: still typed, but the absorber is gone. -/
def d3b : Wiring (Fin 3) Unit Unit Unit := { d3 with boxes := {0, 1} }

example : d3b.Typed := by intro w _; simp [d3b, d3]

example : ¬ (d3b.reroute () 2 ()).Typed := by
  intro h
  have := (h () (by simp [Wiring.reroute, d3b, d3])).1
  simp [Wiring.reroute, d3b, d3] at this

/-! ## `typed_glue`

Gluing a well-typed wire 2 → 1 keeps typing and the new wire is present. Gluing a wire from
box 1, which has no output, does not: `hF` is needed. -/

/-- One existing wire 0 → 1 (`false`), and a candidate wire `true` from box `s` to box 1. -/
def dg (s : Fin 3) : Wiring (Fin 3) Unit Bool Unit where
  boxes := Set.univ
  wires := {false}
  src w := if w then (s, ()) else (0, ())
  tgt _ := (1, ())
  carrier _ := ()
  out b _ := if b = 0 ∨ b = 2 then some () else none
  inp b _ := if b = 1 then some () else none

example : ((dg 2).glue ∅ {true}).Typed ∧ true ∈ ((dg 2).glue ∅ {true}).wires :=
  ⟨(dg 2).typed_glue (by intro w hw; simp [dg] at hw ⊢; simp [hw]) (by intro w hw; simp [dg] at hw ⊢; simp [hw]),
   by simp [Wiring.glue, dg]⟩

example : ¬ ((dg 1).glue ∅ {true}).Typed := by
  intro h
  have := (h true (by simp [Wiring.glue, dg])).2.2.1
  simp [Wiring.glue, dg] at this

/-! ## `typed_restrict`, `restrict_of_subset`

Zooming into boxes {0, 1} keeps the wire and its typing. Without `A' ⊆ A`, zooming into {0} and
then {0, 1} is not zooming into {0, 1}. -/

example : (d3.restrict {0, 1}).Typed ∧ () ∈ (d3.restrict {0, 1}).wires :=
  ⟨d3.typed_restrict d3_typed _, by simp [Wiring.restrict, d3]⟩

example : (d3.restrict {0}).restrict {0, 1} ≠ d3.restrict {0, 1} := by
  intro h
  have := congrArg (fun d => (1 : Fin 3) ∈ d.boxes) h
  simp [Wiring.restrict, d3] at this

/-! ## `typed_rename`

The lemma applies to a non-trivial relabelling: swapping the wire's source and target boxes. -/

example : (d3.rename (Equiv.swap 0 1) (fun _ => Equiv.refl _) (Equiv.refl _) (Equiv.refl _)).Typed :=
  (d3.typed_rename _ _ _ _).mpr d3_typed

/-! ## Behaviour

The behaviour lemmas with hypotheses are the two monotonicity statements. Lemmas without
hypotheses (`relTrace_swap`, `loopStates_id`, `relTrace_not_loop`) need no witness. -/

/-! ### `relation_comp_mono`

Both hypotheses hold on a strict inclusion of relations on `Bool`. Without `hR`, or without `hS`,
a larger first or second box gives a composite that is not below the smaller one's. -/

example : Relation.Comp (fun (a b : Bool) => a = b ∧ a = true) (fun (b c : Bool) => b = c) ≤
    Relation.Comp (fun (a b : Bool) => a = b) (fun (b c : Bool) => b = c) :=
  relation_comp_mono (fun _ _ h => h.1) le_rfl

example : ¬ Relation.Comp (fun (_ _ : Unit) => True) (fun (_ _ : Unit) => True) ≤
    Relation.Comp (fun (_ _ : Unit) => False) (fun (_ _ : Unit) => True) := by
  intro h
  obtain ⟨_, hb, _⟩ := h () () ⟨(), trivial, trivial⟩
  exact hb

example : ¬ Relation.Comp (fun (_ _ : Unit) => True) (fun (_ _ : Unit) => True) ≤
    Relation.Comp (fun (_ _ : Unit) => True) (fun (_ _ : Unit) => False) := by
  intro h
  obtain ⟨_, _, hc⟩ := h () () ⟨(), trivial, trivial⟩
  exact hc

/-! ### `relTrace_mono`

The hypothesis holds on a strict inclusion whose trace is non-empty. Without it, a loop that
admits every value has a trace that is not below the trace of a loop that admits none. -/

example : relTrace (fun (p q : Unit × Bool) => q.2 = p.2 ∧ p.2 = true) () () ∧
    relTrace (fun (p q : Unit × Bool) => q.2 = p.2 ∧ p.2 = true) ≤
      relTrace (fun (p q : Unit × Bool) => q.2 = p.2) :=
  ⟨⟨true, rfl, rfl⟩, relTrace_mono fun _ _ h => h.1⟩

example : ¬ relTrace (fun (_ _ : Unit × Unit) => True) ≤
    relTrace (fun (_ _ : Unit × Unit) => False) := by
  intro h
  obtain ⟨_, hu⟩ := h () () ⟨(), trivial⟩
  exact hu

/-! ## Dynamics

Each dynamics lemma with hypotheses holds on a concrete machine or step relation, and dropping
any one hypothesis breaks it. Lemmas without hypotheses (`reachIn_iff_trace`,
`reachWithin_iff_trace`) need no witness. -/

/-- One step from each number to the next. -/
def succStep : ℕ → ℕ → Prop := fun a b => b = a + 1

/-- Negation on `Bool`: from `false`, the reachable set `{false, true}` is complete after one step. -/
def flip : Bool → Bool → Prop := fun a b => b = !a

/-! ### `mealyStep_mono`

Both hypotheses hold on a strict inclusion of rows and of inputs with a step. Without `hT`, or
without `hX`, a step of the smaller machine is lost in the larger one. -/

example : mealyStep (fun (s i s' : Bool) (_ : Unit) => s' = (s && i)) {true} true true ∧
    mealyStep (fun (s i s' : Bool) (_ : Unit) => s' = (s && i)) {true} ≤
      mealyStep (fun (s i s' : Bool) (_ : Unit) => s' = (s && i) ∨ s' = s) Set.univ :=
  ⟨⟨true, Set.mem_singleton _, (), rfl⟩, mealyStep_mono (fun _ _ _ _ h => Or.inl h) (Set.subset_univ _)⟩

example : ¬ mealyStep (fun (_ _ _ _ : Unit) => True) Set.univ ≤
    mealyStep (fun (_ _ _ _ : Unit) => False) Set.univ := by
  intro h
  obtain ⟨_, _, _, hf⟩ := h () () ⟨(), Set.mem_univ _, (), trivial⟩
  exact hf

example : ¬ mealyStep (fun (_ _ _ _ : Unit) => True) Set.univ ≤
    mealyStep (fun (_ _ _ _ : Unit) => True) ∅ := by
  intro h
  obtain ⟨_, hi, _⟩ := h () () ⟨(), Set.mem_univ _, (), trivial⟩
  exact hi

/-! ### `reachIn_mono`, `reachWithin_mono`

The hypothesis holds on a strict inclusion under which a configuration is still reached. Without
it, a step of the larger relation is lost in the smaller one. -/

example : reachIn (fun a b : ℕ => b = a + 1 ∧ a < 1) 1 0 1 ∧
    reachIn (fun a b : ℕ => b = a + 1 ∧ a < 1) 1 ≤ reachIn succStep 1 :=
  ⟨⟨0, rfl, rfl, Nat.one_pos⟩, reachIn_mono (fun _ _ h => h.1) 1⟩

example : reachWithin (fun a b : ℕ => b = a + 1 ∧ a < 1) 2 0 1 ∧
    reachWithin (fun a b : ℕ => b = a + 1 ∧ a < 1) 2 ≤ reachWithin succStep 2 :=
  ⟨⟨1, by norm_num, 0, rfl, rfl, Nat.one_pos⟩, reachWithin_mono (fun _ _ h => h.1) 2⟩

example : ¬ reachIn (fun _ _ : Unit => True) 1 ≤ reachIn (fun _ _ : Unit => False) 1 := by
  intro h
  obtain ⟨_, _, hf⟩ := h () () ⟨(), rfl, trivial⟩
  exact hf

/-! ### `reach_of_trace`

A valid trace of two steps ends in the target, within a horizon of three. Without `hτ`, a
sequence of non-steps claims a state that is not reachable. Without `hk`, a valid trace longer
than the horizon claims a state the horizon does not reach. Without `hU`, there is no target to
reach. -/

example : ∃ b ∈ ({2} : Set ℕ), reachWithin succStep 3 0 b :=
  reach_of_trace (r := succStep) (τ := fun i => i) (k := 2) (fun _ _ => rfl) (Nat.le_succ 2) rfl

/-- With no admitted step, only the start is reachable. -/
theorem reachWithin_false {n a b : ℕ} (h : reachWithin (fun _ _ : ℕ => False) n a b) : a = b := by
  obtain ⟨k, -, hk⟩ := h
  cases k with
  | zero => exact hk
  | succ k => obtain ⟨_, _, hf⟩ := hk; exact hf.elim

/-- From `0`, within `n` successor steps, only `0, …, n` are reachable. -/
theorem reachWithin_succStep {n b : ℕ} (h : reachWithin succStep n 0 b) : b ≤ n := by
  obtain ⟨k, hk, hr⟩ := h
  obtain ⟨τ, h0, rfl, hτ⟩ := reachIn_iff_trace.mp hr
  have : ∀ i ≤ k, τ i = i := by
    intro i hi
    induction i with
    | zero => exact h0
    | succ i ih => rw [hτ i (by omega), ih (by omega)]
  rw [this k le_rfl]
  exact hk

example : ¬ reachWithin succStep 1 ≤ reachWithin (fun _ _ : ℕ => False) 1 :=
  fun h => absurd (reachWithin_false (h 0 1 ⟨1, le_rfl, 0, rfl, rfl⟩)) (by norm_num)

example : (∀ i < 1, ¬ (fun _ _ : ℕ => False) ((fun i : ℕ => i) i) ((fun i : ℕ => i) (i + 1))) ∧
    ¬ ∃ b ∈ ({1} : Set ℕ), reachWithin (fun _ _ : ℕ => False) 1 0 b :=
  ⟨fun _ _ h => h, fun ⟨_, hb, h⟩ => absurd ((reachWithin_false h).trans hb) (by norm_num)⟩

example : ¬ ∃ b ∈ ({2} : Set ℕ), reachWithin succStep 1 0 b :=
  fun ⟨_, hb, h⟩ => absurd (reachWithin_succStep h) (by rw [hb]; norm_num)

example : ¬ ∃ b ∈ (∅ : Set ℕ), reachWithin succStep 3 0 b :=
  fun ⟨_, hb, _⟩ => hb

/-! ### `reachIn_of_trace`

On a valid trace of three steps, the point at time two is reached in exactly two steps. Without
`hτ`, a sequence of non-steps claims a point that is not reached. Without `hi`, a trace of zero
steps says nothing about its value at time one. -/

example : reachIn succStep 2 0 2 :=
  reachIn_of_trace (τ := fun i => i) (n := 3) (fun _ _ => rfl) (Nat.le_succ 2)

example : ¬ reachIn (fun _ _ : ℕ => False) 1 0 1 := fun ⟨_, _, hf⟩ => hf

example : (∀ j < 0, succStep ((fun _ : ℕ => 0) j) ((fun _ : ℕ => 0) (j + 1))) ∧
    ¬ reachIn succStep 1 ((fun _ : ℕ => 0) 0) ((fun _ : ℕ => 0) 1) :=
  ⟨fun _ h => absurd h (Nat.not_lt_zero _), fun ⟨c, hc, h⟩ => by subst hc; exact absurd h (by simp [succStep])⟩

/-! ### `reachWithin_saturated`

Negation on `Bool` from `false` meets the hypothesis at `k = 1`: two steps add nothing, and the
bound holds at a larger horizon. Without it, the successor relation from `0` reaches `1` within
one step but not within zero. -/

example : (∀ b, (∃ a ∈ ({false} : Set Bool), reachIn flip 2 a b) → ∃ a ∈ ({false} : Set Bool), reachWithin flip 1 a b) ∧
    ∃ a ∈ ({false} : Set Bool), reachWithin flip 5 a true := by
  refine ⟨?_, false, Set.mem_singleton _, 1, by norm_num, false, rfl, rfl⟩
  rintro b ⟨a, ha, c, ⟨d, hd, hdc⟩, hcb⟩
  rw [Set.mem_singleton_iff] at ha
  subst ha hd
  refine ⟨false, Set.mem_singleton _, 0, Nat.zero_le _, ?_⟩
  show false = b
  simp only [flip] at hdc hcb
  rw [hcb, hdc]
  rfl

example : (∃ a ∈ ({0} : Set ℕ), reachWithin succStep 1 a 1) ∧
    ¬ ∃ a ∈ ({0} : Set ℕ), reachWithin succStep 0 a 1 := by
  refine ⟨⟨0, Set.mem_singleton _, 1, le_rfl, 0, rfl, rfl⟩, ?_⟩
  rintro ⟨a, ha, h⟩
  rw [Set.mem_singleton_iff] at ha
  subst ha
  exact absurd (reachWithin_succStep h) (by norm_num)

end CategoricalTriz.Witnesses
