import CategoricalTriz
import Mathlib.Algebra.BigOperators.Fin
import Mathlib.Algebra.BigOperators.Pi

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

open CategoricalTriz CategoricalTriz.Wiring CategoryTheory Opposite

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

/-! ## `typed_overlay`, `typed_dpo`

The host `gh` has one function 0 → 1 and an idle box 3. A rule deletes box 3 and, like
"mono → bi", adds box 2 with a second function 2 → 1 (`rhs`, already renamed into the host's
ids). The result is typed, has the new function, and has lost box 3. Each hypothesis is needed;
in each counterexample below, the hypotheses not under test hold. -/

/-- Host: wire `false` from box 0 to box 1, carrier `false`; box 3 is present and unwired. -/
def gh : Wiring (Fin 4) Unit Bool Bool where
  boxes := {0, 1, 3}
  wires := {false}
  src _ := (0, ())
  tgt _ := (1, ())
  carrier _ := false
  out b _ := if b = 0 then some false else none
  inp b _ := if b = 1 then some false else none

theorem gh_typed : gh.Typed := by
  intro w hw
  simp [gh] at hw ⊢

/-- Renamed right-hand side: interface boxes 0 and 1 with wire `false`, and the new box 2 with
wire `true` from 2 to 1. -/
def rhs : Wiring (Fin 4) Unit Bool Bool where
  boxes := {0, 1, 2}
  wires := Set.univ
  src w := if w then (2, ()) else (0, ())
  tgt _ := (1, ())
  carrier _ := false
  out b _ := if b = 0 ∨ b = 2 then some false else none
  inp b _ := if b = 1 then some false else none

theorem rhs_typed : rhs.Typed := by
  rintro (_ | _) _ <;> simp [rhs]

/-- `rhs` and `gh` give every port they both type the same carrier. -/
theorem rhs_gh_out : ∀ b p c c', rhs.out b p = some c → gh.out b p = some c' → c = c' := by
  intro b _ c c' h₁ h₂
  simp [rhs] at h₁
  simp [gh] at h₂
  rw [h₁.2, h₂.2]

theorem rhs_gh_inp : ∀ b p c c', rhs.inp b p = some c → gh.inp b p = some c' → c = c' := by
  intro b _ c c' h₁ h₂
  simp [rhs] at h₁
  simp [gh] at h₂
  rw [h₁.2, h₂.2]

example : ((gh.delete {3} ∅).overlay rhs).Typed ∧ true ∈ ((gh.delete {3} ∅).overlay rhs).wires ∧
    (3 : Fin 4) ∉ ((gh.delete {3} ∅).overlay rhs).boxes :=
  ⟨gh.typed_dpo gh_typed rhs_typed (by intro w hw _; simp [gh] at hw ⊢)
    rhs_gh_out rhs_gh_inp,
   by simp [Wiring.overlay, rhs], by simp [Wiring.overlay, Wiring.delete, gh, rhs]⟩

/-- Typing does not need the no-identification condition. This application deletes box 1, which
`rhs` keeps as interface, and the overlay restores it. The result is typed but is not a
pushout. -/
example : ((gh.delete {1} {false}).overlay rhs).Typed :=
  gh.typed_dpo gh_typed rhs_typed (by intro w hw hE; simp [gh] at hw; simp [hw] at hE)
    rhs_gh_out rhs_gh_inp

/-- `hR` is needed: `rhs` with the new wire drawn from box 1, which has no output. -/
def rhsBad : Wiring (Fin 4) Unit Bool Bool := { rhs with src := fun w => if w then (1, ()) else (0, ()) }

example : ¬ ((gh.delete {3} ∅).overlay rhsBad).Typed := by
  intro h
  have := (h true (by simp [Wiring.overlay, rhsBad, rhs])).2.2.1
  simp [Wiring.overlay, Wiring.delete, rhsBad, rhs, gh] at this

/-- The empty right-hand side: typed, and it types no port. -/
def rnone : Wiring (Fin 4) Unit Bool Bool :=
  { gh with boxes := ∅, wires := ∅, out := fun _ _ => none, inp := fun _ _ => none }

/-- `hd` is needed: deleting box 1, the surviving wire's target. -/
example : ¬ ((gh.delete {1} ∅).overlay rnone).Typed := by
  intro h
  have := (h false (by simp [Wiring.overlay, Wiring.delete, rnone, gh])).2.1
  simp [Wiring.overlay, Wiring.delete, rnone, gh] at this

/-- `hout` is needed: the right-hand side gives box 0's output port carrier `true`. -/
example : ¬ ((gh.delete ∅ ∅).overlay { rnone with boxes := {0}, out := fun b _ => if b = 0 then some true else none }).Typed := by
  intro h
  have := (h false (by simp [Wiring.overlay, Wiring.delete, rnone, gh])).2.2.1
  simp [Wiring.overlay, Wiring.delete, rnone, gh] at this

/-- `hinp` is needed: the right-hand side gives box 1's input port carrier `true`. -/
example : ¬ ((gh.delete ∅ ∅).overlay { rnone with boxes := {1}, inp := fun b _ => if b = 1 then some true else none }).Typed := by
  intro h
  have := (h false (by simp [Wiring.overlay, Wiring.delete, rnone, gh])).2.2.2
  simp [Wiring.overlay, Wiring.delete, rnone, gh] at this

/-! ## `typed_rename`

The lemma applies to a non-trivial relabelling: swapping the wire's source and target boxes. -/

example : (d3.rename (Equiv.swap 0 1) (fun _ => Equiv.refl _) (Equiv.refl _) (Equiv.refl _)).Typed :=
  (d3.typed_rename _ _ _ _).mpr d3_typed

/-! ## Principle constructions

### `typed_retarget`

Moving the wire's target to box 2's input keeps typing. Moving it to box 0, which has no input
(`hq` fails), or to box 2 when box 2 is absent (`ha` fails), does not. -/

/-- One wire 0 → 1; box 0 has the only output, boxes 1 and 2 have inputs. -/
def dr : Wiring (Fin 3) Unit Unit Unit where
  boxes := Set.univ
  wires := Set.univ
  src _ := (0, ())
  tgt _ := (1, ())
  carrier _ := ()
  out b _ := if b = 0 then some () else none
  inp b _ := if b = 1 ∨ b = 2 then some () else none

theorem dr_typed : dr.Typed := by
  intro w _
  simp [dr]

example : (dr.retarget () 2 ()).Typed ∧ () ∈ (dr.retarget () 2 ()).wires :=
  ⟨dr.typed_retarget dr_typed (by simp [dr]) (by simp [dr]), by simp [Wiring.retarget, dr]⟩

example : ¬ (dr.retarget () 0 ()).Typed := by
  intro h
  have := (h () (by simp [Wiring.retarget, dr])).2.2.2
  simp [Wiring.retarget, dr] at this

/-- `dr` without box 2. -/
def drb : Wiring (Fin 3) Unit Unit Unit := { dr with boxes := {0, 1} }

example : ¬ (drb.retarget () 2 ()).Typed := by
  intro h
  have := (h () (by simp [Wiring.retarget, drb, dr])).2.1
  simp [Wiring.retarget, drb, dr] at this

/-! ### `typed_reverse`

Reversing the wire 0 → 1 gives a typed wire 1 → 0 when box 1 has an output and box 0 an input.
Without box 1's output (`hq` fails), or without box 0's input (`hp` fails), it does not. -/

/-- One wire 0 → 1; `o` gives box 1 an output and `i` gives box 0 an input. -/
def dv (o i : Bool) : Wiring (Fin 2) Unit Unit Unit where
  boxes := Set.univ
  wires := Set.univ
  src _ := (0, ())
  tgt _ := (1, ())
  carrier _ := ()
  out b _ := if b = 0 ∨ o then some () else none
  inp b _ := if b = 1 ∨ i then some () else none

theorem dv_typed (o i : Bool) : (dv o i).Typed := by
  intro w _
  simp [dv]

example : (((dv true true).reroute () 1 ()).retarget () 0 ()).Typed ∧
    (((dv true true).reroute () 1 ()).retarget () 0 ()).src () = (1, ()) ∧
    (((dv true true).reroute () 1 ()).retarget () 0 ()).tgt () = (0, ()) :=
  ⟨(dv true true).typed_reverse (dv_typed _ _) (by simp [dv]) (by simp [dv]),
   by simp [Wiring.retarget, Wiring.reroute], by simp [Wiring.retarget]⟩

example : ¬ (((dv false true).reroute () 1 ()).retarget () 0 ()).Typed := by
  intro h
  have := (h () (by simp [Wiring.retarget, Wiring.reroute, dv])).2.2.1
  simp [Wiring.retarget, Wiring.reroute, dv] at this

example : ¬ (((dv true false).reroute () 1 ()).retarget () 0 ()).Typed := by
  intro h
  have := (h () (by simp [Wiring.retarget, Wiring.reroute, dv])).2.2.2
  simp [Wiring.retarget, Wiring.reroute, dv] at this

/-! ### `typed_extend`

Declaring an output and an input on every box keeps `d3` typed. Dropping its outputs (`ho`
fails) or its inputs (`hi` fails) breaks it. -/

example : ({ d3 with out := fun _ _ => some (), inp := fun _ _ => some () } : Wiring (Fin 3) Unit Unit Unit).Typed :=
  d3.typed_extend (by intro b p c; simp) (by intro b p c; simp) d3_typed

example : ¬ ({ d3 with out := fun _ _ => none } : Wiring (Fin 3) Unit Unit Unit).Typed := by
  intro h
  have := (h () (by simp [d3])).2.2.1
  simp at this

example : ¬ ({ d3 with inp := fun _ _ => none } : Wiring (Fin 3) Unit Unit Unit).Typed := by
  intro h
  have := (h () (by simp [d3])).2.2.2
  simp at this

/-! ### `reach_quotient`

The path 0 → 1 → 2 maps to the path 0 → 1 when boxes 0 and 1 merge. Keeping every box apart
with no edges in the image, `h` fails on the edge 0 → 1, and the path 0 →* 2 has no image path. -/

/-- The path 0 → 1 → 2. -/
abbrev path3 (a b : Fin 3) : Prop := a.val + 1 = b.val

/-- Merge boxes 0 and 1. -/
abbrev merge01 (a : Fin 3) : Fin 2 := if a = 2 then 1 else 0

theorem path3_0_2 : Relation.ReflTransGen path3 0 2 :=
  (Relation.ReflTransGen.single (show path3 0 1 by decide)).tail (show path3 1 2 by decide)

example : Relation.ReflTransGen (fun x y : Fin 2 => x = 0 ∧ y = 1) (merge01 0) (merge01 2) :=
  reach_quotient merge01 (by decide) path3_0_2

example : ¬ ∀ a b, path3 a b → id a = id b ∨ False := by decide

example : ¬ Relation.ReflTransGen (fun _ _ : Fin 3 => False) (id 0) (id 2) := by
  intro h
  have := (Relation.reflTransGen_iff_eq (fun _ h => h)).mp h
  exact absurd this (by decide)

/-! ### `cheaper_part_lowers_cost`

Two parts costing 1 each: a copy of part 0 costing 0 lowers the total; one costing 2 raises it,
so `hc` is needed. -/

example : ∑ i : Fin 2, Function.update (fun _ _ => (1 : ℝ)) (0 : Fin 2) (fun _ : Unit => 0) i <
    ∑ i : Fin 2, (fun _ _ => (1 : ℝ)) i := by
  refine lt_of_le_of_ne (cheaper_part_lowers_cost _ _ (by intro; norm_num)) fun h => ?_
  have := congrFun h ()
  simp [Fin.sum_univ_two, Finset.sum_apply] at this

example : ¬ ∑ i : Fin 2, Function.update (fun _ _ => (1 : ℝ)) (0 : Fin 2) (fun _ : Unit => 2) i ≤
    ∑ i : Fin 2, (fun _ _ => (1 : ℝ)) i := by
  intro h
  have := h ()
  rw [Finset.sum_apply, Finset.sum_apply, Fin.sum_univ_two, Fin.sum_univ_two] at this
  simp only [Function.update_self, ne_eq, Fin.one_eq_zero_iff, OfNat.ofNat_ne_one, not_false_eq_true,
    Function.update_of_ne] at this
  norm_num at this

/-! ## `restrict_eq_self`, `supportedOn`, `typedOn`

`d3b` (boxes {0, 1}, wire 0 → 1) is typed and supported on {0, 1}, so it is a typed section of
the level presheaf there. Dropping `hA`: `d3` has box 2 outside {0, 1}. Dropping `h`: with box 0
absent, the wire leaves the boxes and restriction removes it. -/

theorem d3b_typed : d3b.Typed := by intro w _; simp [d3b, d3]

example : d3b.restrict {0, 1} = d3b ∧ () ∈ d3b.wires :=
  ⟨d3b.restrict_eq_self d3b_typed le_rfl, by simp [d3b, d3]⟩

example : (⟨d3b, d3b.restrict_eq_self d3b_typed le_rfl⟩ :
    (Wiring.supportedOn (Fin 3) Unit Unit Unit).obj (op {0, 1})) ∈
      (Wiring.typedOn (Fin 3) Unit Unit Unit).obj (op {0, 1}) :=
  d3b_typed

example : d3.restrict {0, 1} ≠ d3 := by
  intro h
  have := congrArg (fun d => (2 : Fin 3) ∈ d.boxes) h
  simp [Wiring.restrict, d3] at this

/-- `d3` without box 0: the wire's source is missing, so the diagram is not typed. -/
def d3u : Wiring (Fin 3) Unit Unit Unit := { d3 with boxes := {1} }

example : ¬ d3u.Typed ∧ d3u.boxes ⊆ {1} ∧ d3u.restrict {1} ≠ d3u := by
  refine ⟨fun h => ?_, le_rfl, fun h => ?_⟩
  · have := (h () (by simp [d3u, d3])).1
    simp [d3u, d3] at this
  · have := congrArg (fun d => () ∈ d.wires) h
    simp [Wiring.restrict, d3u, d3] at this

/-! ## `restrict_rewrite`, `restrict_rewrite_of_inside`, `boundary_rewrite`

Adding the wire `true` (box `s` → box 1) to `dg s`, and zooming into {0, 1}:

- from box 0 the addition is inside {0, 1}: the step applies verbatim and the wire survives;
- from box 2 it crosses the boundary: verbatim application keeps a wire the restriction drops
  (`hF` is needed), and the wire lands in the boundary instead;
- adding box 2 to a diagram on {0, 1} is outside: verbatim application keeps it (`hN` is needed).

`restrict_rewrite` has no hypothesis; these show its restricted rule is not the rule. -/

/-- Glue the wire `true`. -/
def addWire : Wiring.Rule (Fin 3) Bool := ⟨∅, ∅, ∅, {true}⟩

example : ((dg 0).rewrite addWire).restrict {0, 1} = ((dg 0).restrict {0, 1}).rewrite addWire ∧
    true ∈ (((dg 0).rewrite addWire).restrict {0, 1}).wires :=
  ⟨(dg 0).restrict_rewrite_of_inside (by simp [addWire])
      (by intro w hw; simp [addWire] at hw; simp [hw, dg]),
   by simp [Wiring.rewrite, Wiring.restrict, Wiring.glue, Wiring.delete, addWire, dg]⟩

example : ((dg 2).rewrite addWire).restrict {0, 1} ≠ ((dg 2).restrict {0, 1}).rewrite addWire := by
  intro h
  have := congrArg (fun d => true ∈ d.wires) h
  simp [Wiring.rewrite, Wiring.restrict, Wiring.glue, Wiring.delete, addWire, dg] at this

example : true ∈ ((dg 2).rewrite addWire).boundary {0, 1} := by
  rw [Wiring.boundary_rewrite]
  simp [addWire, dg]

/-- Glue box 2. -/
def addBox : Wiring.Rule (Fin 3) Bool := ⟨∅, ∅, {2}, ∅⟩

example : (({ dg 0 with boxes := {0, 1} } : Wiring (Fin 3) Unit Bool Unit).rewrite addBox).restrict {0, 1} ≠
    (({ dg 0 with boxes := {0, 1} } : Wiring (Fin 3) Unit Bool Unit).restrict {0, 1}).rewrite addBox := by
  intro h
  have := congrArg (fun d => (2 : Fin 3) ∈ d.boxes) h
  simp [Wiring.rewrite, Wiring.restrict, Wiring.glue, Wiring.delete, addBox] at this

/-! Re-attaching a wire across the boundary does not commute with restriction: `reroute` moves an
endpoint, which a delete/glue step never does. The kernel reads a wire re-added under the same id
with a new endpoint as a deleted wire and a glued one. -/

example : (d3.reroute () 2 ()).restrict {0, 1} ≠ (d3.restrict {0, 1}).reroute () 2 () := by
  intro h
  have := congrArg (fun d => () ∈ d.wires) h
  simp [Wiring.reroute, Wiring.restrict, d3] at this

/-! ## `restrictionGrid`

The window at (present, {0, 1}) seen from (past, all boxes) is the past diagram stepped, then
restricted. -/

example : ((Wiring.restrictionGrid (P := Unit) (C := Unit) addWire addWire).map
      (X := ((0 : Fin 3), op (Set.univ : Set (Fin 3)))) (Y := ((1 : Fin 3), op ({0, 1} : Set (Fin 3))))
      (homOfLE (by decide), (homOfLE (Set.subset_univ _)).op)
      ⟨dg 2, (dg 2).restrict_univ⟩).1 = ((dg 2).rewrite addWire).restrict {0, 1} := by
  change (((dg 2).rewrite addWire).restrict Set.univ).restrict {0, 1} = _
  rw [Wiring.restrict_restrict, Set.univ_inter]

/-! ## Behaviour

The behaviour lemmas with hypotheses are the two monotonicity statements. Lemmas without
hypotheses (`relTrace_swap`, `loopStates_id`, `relTrace_not_loop`) need no witness. The two
product characterisations are equivalences, so they get examples where each side holds and
where each fails. -/

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

/-! ### `eq_projections_prod_iff`, `eq_projections_prod_iff_rectangle`, `eq_projections_pi_iff`

Neither has hypotheses. Each is an equivalence, so the witnesses show that both sides can hold
and both can fail. A non-empty proper product splits. Equality on `Bool` does not. Parity on
three bits, `c = a xor b`, splits over no partition into single bits, although any two of its
bits range freely: testing parts pairwise is not enough, which is why `segment` tests each part
against all the others. -/

/-- A non-empty proper product: the first bit is `false`, the second is free. -/
def firstFalse : Set (Bool × Bool) := {false} ×ˢ Set.univ

example : firstFalse = (Prod.fst '' firstFalse) ×ˢ (Prod.snd '' firstFalse) ∧
    (false, true) ∈ firstFalse ∧ (true, true) ∉ firstFalse :=
  ⟨(eq_projections_prod_iff _).mpr ⟨_, _, rfl⟩, by simp [firstFalse], by simp [firstFalse]⟩

/-- Equality on `Bool`: two rows, `(false, false)` and `(true, true)`. -/
def sameBit : Set (Bool × Bool) := {p | p.1 = p.2}

example : ¬ ∃ (A B : Set Bool), sameBit = A ×ˢ B := by
  rintro ⟨A, B, h⟩
  have h₀ : (false, false) ∈ A ×ˢ B := h ▸ (rfl : false = false)
  have h₁ : (true, true) ∈ A ×ˢ B := h ▸ (rfl : true = true)
  have : (false, true) ∈ sameBit := h ▸ ⟨h₀.1, h₁.2⟩
  simp [sameBit] at this

/-- The rectangle condition holds on the product. -/
example : ∀ a b c d, (a, b) ∈ firstFalse → (c, d) ∈ firstFalse → (a, d) ∈ firstFalse :=
  (eq_projections_prod_iff_rectangle _).mp ((eq_projections_prod_iff _).mpr ⟨_, _, rfl⟩)

/-- It fails on equality, at the witness `segment` reports for the rows `(false, false)` and
`(true, true)` over parts `{a}` and `{b}` (tests/act-behavior.test.ts): `(false, true)` is not a
row. -/
example : (false, false) ∈ sameBit ∧ (true, true) ∈ sameBit ∧ (false, true) ∉ sameBit :=
  ⟨rfl, rfl, by simp [sameBit]⟩

example : ¬ ∀ a b c d, (a, b) ∈ sameBit → (c, d) ∈ sameBit → (a, d) ∈ sameBit := fun h => by
  have := h false false true true rfl rfl
  simp [sameBit] at this

example : sameBit ≠ (Prod.fst '' sameBit) ×ˢ (Prod.snd '' sameBit) := fun h => by
  have := (eq_projections_prod_iff_rectangle _).mp h false false true true rfl rfl
  simp [sameBit] at this

example : sameBit ≠ (Prod.fst '' sameBit) ×ˢ (Prod.snd '' sameBit) := fun h => by
  obtain ⟨A, B, hAB⟩ := (eq_projections_prod_iff _).mp h
  have h₀ : (false, false) ∈ A ×ˢ B := hAB ▸ (rfl : false = false)
  have h₁ : (true, true) ∈ A ×ˢ B := hAB ▸ (rfl : true = true)
  have : (false, true) ∈ sameBit := hAB ▸ ⟨h₀.1, h₁.2⟩
  simp [sameBit] at this

/-- Parity on three bits. -/
def parity : Set (Fin 3 → Bool) := {f | f 2 = xor (f 0) (f 1)}

/-- Bits 0 and 1 range freely: every pair of values occurs. -/
example (a b : Bool) : ∃ f ∈ parity, f 0 = a ∧ f 1 = b :=
  ⟨![a, b, xor a b], rfl, rfl, rfl⟩

/-- Yet no product of single-bit sets is parity, so its projections do not compose back to it. -/
example : parity ≠ Set.univ.pi (fun i => Function.eval i '' parity) := fun h => by
  obtain ⟨A, hA⟩ := (eq_projections_pi_iff _).mp h
  have h₁ : ![true, false, true] ∈ Set.univ.pi A := hA ▸ (rfl : true = xor true false)
  have h₂ : ![false, true, true] ∈ Set.univ.pi A := hA ▸ (rfl : true = xor false true)
  have : ![true, true, true] ∈ parity := hA ▸ fun i _ => match i with
    | 0 => h₁ 0 trivial
    | 1 => h₂ 1 trivial
    | 2 => h₁ 2 trivial
  simp [parity] at this

end CategoricalTriz.Witnesses
