import CategoricalTriz
import Mathlib.Data.ENat.Lattice
import Mathlib.Data.Fintype.Order

/-!
# Non-vacuity witnesses

A lemma whose hypotheses can never hold together proves nothing. For each `Wiring` lemma in
`CategoricalTriz`, and for the behaviour and co-design lemmas with hypotheses, this module gives:

- a concrete diagram or relation on which all its hypotheses hold while something survives, so
  the lemma is not vacuous;
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

/-! ## Co-design feasibility

Each composition lemma holds on concrete monotone relations whose composite is non-empty, and
fails when one argument is not monotone. `kleene_lfp` needs at least one step on `Bool`, and
without finiteness no finite iterate reaches the least fixpoint. `kleeneStep_upperClosure` and
`codesign_lfp` hold on small examples and fail without `hmono` and without `Finite`. -/

/-- Needs at least what it provides: a monotone feasibility relation. -/
def atLeast : ℕ → ℕ → Prop := fun f r => f ≤ r

theorem atLeast_mono : MonotoneFeasibility atLeast := by
  intro f f' r r' hf hr h
  exact hf.trans (h.trans hr)

/-- Providing less needs more: not monotone in the functionality. -/
def backwards : ℕ → ℕ → Prop := fun f m => if f = 0 then m = 5 else m = 0

/-- Only no resource will do: not monotone in the resource. -/
def onlyNone : ℕ → ℕ → Prop := fun _ r => r = 0

/-! ### `feasibility_comp` -/

example : MonotoneFeasibility (Relation.Comp atLeast atLeast) ∧ Relation.Comp atLeast atLeast 1 2 :=
  ⟨feasibility_comp atLeast_mono atLeast_mono, ⟨1, by simp [atLeast], by simp [atLeast]⟩⟩

example : ¬ MonotoneFeasibility (Relation.Comp backwards atLeast) := by
  intro H
  obtain ⟨m, hm, hmr⟩ := @H 1 0 0 0 zero_le_one le_rfl ⟨0, by simp [backwards], by simp [atLeast]⟩
  simp [backwards] at hm
  simp [atLeast] at hmr
  omega

example : ¬ MonotoneFeasibility (Relation.Comp atLeast onlyNone) := by
  intro H
  obtain ⟨m, -, hm⟩ := @H 0 0 0 1 le_rfl zero_le_one ⟨0, by simp [atLeast], by simp [onlyNone]⟩
  simp [onlyNone] at hm

/-! ### `feasibility_par` -/

example : MonotoneFeasibility (fun (f : ℕ × ℕ) (r : ℕ) => ∃ r₁ r₂, atLeast f.1 r₁ ∧ atLeast f.2 r₂ ∧ r₁ + r₂ ≤ r) ∧
    ∃ r₁ r₂, atLeast 1 r₁ ∧ atLeast 1 r₂ ∧ r₁ + r₂ ≤ 2 :=
  ⟨feasibility_par (· + ·) atLeast_mono atLeast_mono, 1, 1, by simp [atLeast], by simp [atLeast], le_rfl⟩

example : ¬ MonotoneFeasibility (fun (f : ℕ × ℕ) (r : ℕ) => ∃ r₁ r₂, backwards f.1 r₁ ∧ atLeast f.2 r₂ ∧ r₁ + r₂ ≤ r) := by
  intro H
  obtain ⟨r₁, r₂, h₁, -, hle⟩ := @H (1, 0) (0, 0) 0 0 (by simp) le_rfl ⟨0, 0, by simp [backwards], by simp [atLeast], le_rfl⟩
  simp [backwards] at h₁
  omega

example : ¬ MonotoneFeasibility (fun (f : ℕ × ℕ) (r : ℕ) => ∃ r₁ r₂, atLeast f.1 r₁ ∧ backwards f.2 r₂ ∧ r₁ + r₂ ≤ r) := by
  intro H
  obtain ⟨r₁, r₂, -, h₂, hle⟩ := @H (0, 1) (0, 0) 0 0 (by simp) le_rfl ⟨0, 0, by simp [atLeast], by simp [backwards], le_rfl⟩
  simp [backwards] at h₂
  omega

/-! ### `feasibility_trace` -/

example : MonotoneFeasibility (relTrace (fun (p q : ℕ × ℕ) => p ≤ q)) ∧ relTrace (fun (p q : ℕ × ℕ) => p ≤ q) 1 1 :=
  ⟨feasibility_trace (fun _ _ _ _ hf hr h => hf.trans (h.trans hr)), ⟨0, le_rfl⟩⟩

example : ¬ MonotoneFeasibility (relTrace (fun (_ q : ℕ × ℕ) => q.1 = 0)) := by
  intro H
  obtain ⟨u, hu⟩ := @H 0 0 0 1 le_rfl zero_le_one ⟨0, rfl⟩
  simp at hu

/-! ### `kleene_lfp`

On `Bool`, the constant map to `true` has a least fixpoint above `⊥`, which the ascent reaches. On
`ℕ∞`, which is infinite, the successor's least fixpoint is `⊤`, and no finite iterate from `⊥`
reaches it: finiteness is needed. -/

example : (OrderHom.const Bool true)^[Fintype.card Bool] ⊥ = (OrderHom.const Bool true).lfp ∧
    (OrderHom.const Bool true).lfp ≠ ⊥ := by
  refine ⟨kleene_lfp _, ?_⟩
  rw [← kleene_lfp]
  simp [Function.iterate_succ]

/-- The successor on `ℕ∞`: monotone, with least fixpoint `⊤`. -/
def enatSucc : ℕ∞ →o ℕ∞ := ⟨fun n => n + 1, fun _ _ h => add_le_add h le_rfl⟩

example : ∀ k, enatSucc^[k] ⊥ ≠ enatSucc.lfp := by
  have hlfp : enatSucc.lfp = ⊤ := by
    have h := enatSucc.map_lfp
    generalize enatSucc.lfp = n at h ⊢
    induction n using ENat.recTopCoe with
    | top => rfl
    | coe m =>
      simp only [enatSucc, OrderHom.coe_mk] at h
      norm_cast at h
      omega
  intro k
  have hk : enatSucc^[k] ⊥ = k := by
    induction k with
    | zero => simp
    | succ k ih => rw [Function.iterate_succ_apply', ih]; simp [enatSucc]
  rw [hk, hlfp]
  exact ENat.coe_ne_top k

/-! ### `kleeneStep_upperClosure`

With a requirement that does not depend on the configuration, the step from `{0}` is the upper
set of `1`. Without `hmono`, a requirement only the larger configuration has puts `true` in the
step but not in the step computed on the generator `false`. -/

example : kleeneStep (fun (_ x : ℕ) => x = 1) (upperClosure {0}) = upperClosure {1} := by
  rw [kleeneStep_upperClosure (fun _ _ x _ h => ⟨x, le_rfl, h⟩)]
  congr 1
  ext y
  simp

example : true ∈ kleeneStep (fun (s x : Bool) => s = true ∧ x = true) (upperClosure {false}) ∧
    true ∉ upperClosure {y | ∃ s ∈ ({false} : Set Bool), ∃ x, (s = true ∧ x = true) ∧ y = x ⊔ s} := by
  refine ⟨⟨true, mem_upperClosure.mpr ⟨false, rfl, by decide⟩, true, ⟨rfl, rfl⟩, le_rfl⟩, ?_⟩
  simp

/-! ### `codesign_lfp`

On `Fin 3`, where every configuration requires `1`, the least fixpoint holds `1` and not `0`. On
`ℤ`, where every configuration requires one more than itself, nothing is feasible, yet every
configuration lies in the least fixpoint: without finiteness the regress never bottoms out. -/

example : (1 : Fin 3) ∈ (kleeneStep (fun (_ x : Fin 3) => x = 1)).lfp ∧
    (0 : Fin 3) ∉ (kleeneStep (fun (_ x : Fin 3) => x = 1)).lfp := by
  have h := codesign_lfp (fun (_ x : Fin 3) => x = 1)
  constructor
  · rw [← SetLike.mem_coe, h, SetLike.mem_coe, mem_upperClosure]
    exact ⟨1, ⟨1, rfl, le_rfl⟩, le_rfl⟩
  · rw [← SetLike.mem_coe, h, SetLike.mem_coe, mem_upperClosure]
    rintro ⟨a, ⟨x, rfl, hx⟩, ha⟩
    exact absurd (hx.trans ha) (by decide)

example : ((kleeneStep (fun (s x : ℤ) => x = s + 1)).lfp : Set ℤ) ≠
    (upperClosure {s : ℤ | ∃ x, x = s + 1 ∧ x ≤ s} : Set ℤ) := by
  have hlfp : (kleeneStep (fun (s x : ℤ) => x = s + 1)).lfp = ⊥ := by
    refine le_antisymm (OrderHom.lfp_le _ ?_) bot_le
    rw [← UpperSet.coe_subset_coe, UpperSet.coe_bot]
    intro t _
    exact ⟨t - 1, by simp [← SetLike.mem_coe], t, by omega, by simp⟩
  rw [hlfp, UpperSet.coe_bot]
  intro h
  have : (0 : ℤ) ∈ (upperClosure {s : ℤ | ∃ x, x = s + 1 ∧ x ≤ s} : Set ℤ) := h ▸ Set.mem_univ 0
  simp at this

end CategoricalTriz.Witnesses
