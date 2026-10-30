import CategoricalTriz
import Mathlib.Algebra.BigOperators.Fin
import Mathlib.Algebra.BigOperators.Pi
import Mathlib.Data.ENat.Lattice
import Mathlib.Data.Fintype.Order

/-!
# Non-vacuity witnesses

A lemma whose hypotheses can never hold together proves nothing. For each `Wiring` lemma in
`CategoricalTriz`, and for the behaviour, co-design, dynamics, and flow lemmas with hypotheses, this
module gives:

- a concrete diagram, relation, or step relation on which all its hypotheses hold while
  something survives (a wire, a related pair, a reached state), so the lemma is not vacuous;
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

/-! ### `flow_merge_typed`, `flow_merge_reach`

The flow 0 → 1 → 2 → 3. Merging boxes 1 and 2, adjacent on it, into 1 keeps 0 →* 3, and the
merged flow is 0 → 1 → 3, with no loop. Each hypothesis is needed: box 2 is merged and no longer
reaches 3, nothing reaches it any more, and a flow through a box the model lacks names a box the
merged model lacks. Merging 1 and 3, with box 2 between them, closes the loop 1 → 2 → 1, which the
flow did not have: why `merge` refuses it under the adjacent reading. -/

/-- The flow 0 → 1 → 2 → 3. -/
abbrev flow4 : List (Fin 4) := [0, 1, 2, 3]

theorem flow4_step_lt {a b : Fin 4} (h : flowStep flow4 a b) : a < b := by
  obtain ⟨i, ha, hb⟩ := h
  rcases i with _ | _ | _ | _ | i <;> simp at ha hb <;> subst ha <;> subst hb <;> decide

/-- A step relation that only goes up has no cycle. -/
theorem acyclic_of_lt {r : Fin 4 → Fin 4 → Prop} (h : ∀ a b, r a b → a < b) (x : Fin 4) :
    ¬ Relation.TransGen r x x := by
  have up : ∀ a b, Relation.TransGen r a b → a < b := by
    intro a b hab
    induction hab with
    | single hab => exact h _ _ hab
    | tail _ hbc ih => exact ih.trans (h _ _ hbc)
  exact fun hx => lt_irrefl x (up x x hx)

theorem flow4_0_3 : Relation.ReflTransGen (flowStep flow4) 0 3 :=
  ((Relation.ReflTransGen.single ⟨0, rfl, rfl⟩).tail ⟨1, rfl, rfl⟩).tail ⟨2, rfl, rfl⟩

/-- Boxes 1 and 2, adjacent on the flow. -/
abbrev g12 : Set (Fin 4) := {b | b = 1 ∨ b = 2}

/-- Boxes 1 and 3, with box 2 between them. -/
abbrev g13 : Set (Fin 4) := {b | b = 1 ∨ b = 3}

example : Relation.ReflTransGen (mergedStep (mergeInto g12 1) (flowStep flow4)) 0 3 :=
  flow_merge_reach g12 1 (by decide) (by decide) flow4_0_3

example : (flow4.map (mergeInto g12 1)).destutter (· ≠ ·) = [0, 1, 3] := by decide

example (x : Fin 4) : ¬ Relation.TransGen (mergedStep (mergeInto g12 1) (flowStep flow4)) x x := by
  refine acyclic_of_lt (fun x y => ?_) x
  rintro ⟨a, b, hab, rfl, rfl, hne⟩
  have := flow4_step_lt hab
  fin_cases a <;> fin_cases b <;> revert hne this <;> decide

/-- Nothing maps to box 2 when 1 and 2 merge into 1. -/
theorem not_image_2 (a : Fin 4) : mergeInto g12 1 a ≠ 2 := by
  fin_cases a <;> decide

example : ¬ Relation.ReflTransGen (mergedStep (mergeInto g12 1) (flowStep flow4)) 2 3 := by
  intro h
  rcases Relation.ReflTransGen.cases_head h with h | ⟨c, ⟨a, b, -, ha, -, -⟩, -⟩
  · exact absurd h (by decide)
  · exact not_image_2 a ha

example : ¬ Relation.ReflTransGen (mergedStep (mergeInto g12 1) (flowStep flow4)) 0 2 := by
  intro h
  rcases Relation.ReflTransGen.cases_tail h with h | ⟨c, -, ⟨a, b, -, -, hb, -⟩⟩
  · exact absurd h (by decide)
  · exact not_image_2 b hb

example : ∀ x ∈ (flow4.map (mergeInto g12 1)).destutter (· ≠ ·), x ∈ mergeInto g12 1 '' Set.univ :=
  flow_merge_typed g12 1 (fun _ _ => Set.mem_univ _)

example : ¬ ∀ x ∈ (flow4.map (mergeInto g12 1)).destutter (· ≠ ·), x ∈ mergeInto g12 1 '' {b | b ≠ 3} := by
  intro h
  obtain ⟨b, hb, he⟩ := h 3 (by decide)
  revert hb he
  fin_cases b <;> decide

example : ¬ ∀ x : Fin 4, ¬ Relation.TransGen (flowStep flow4) x x → ¬ Relation.TransGen (mergedStep (mergeInto g13 1) (flowStep flow4)) x x :=
  fun h => h 1 (acyclic_of_lt (fun _ _ => flow4_step_lt) 1)
    ((Relation.TransGen.single (show mergedStep (mergeInto g13 1) (flowStep flow4) 1 2 from
      ⟨1, 2, ⟨1, rfl, rfl⟩, by decide, by decide, by decide⟩)).tail
      (show mergedStep (mergeInto g13 1) (flowStep flow4) 2 1 from ⟨2, 3, ⟨2, rfl, rfl⟩, by decide, by decide, by decide⟩))

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

/-! ### The finest factorisation

`exists_isFinest` needs finitely many ports and at least one; drop either and no finest
factorisation need exist. `Factors.inf` has a common refinement strictly finer than both
partitions. `IsFinest.addPort`'s hypotheses hold on parity's first two bits. Parity's finest
factorisation is one block, and two equalities split into two blocks although each port is coupled
to all the others: merging every coupled port with the rest would lose that split, so the kernel
tests each new port against the ports before it, on their projection. -/

/-- Parity factors finest over one block. -/
example : IsFinest parity ⊤ := by
  classical
  refine ⟨factors_top parity, fun t ht => ?_⟩
  have h := factors_split_iff.mp (ht.split_block 0)
  have h0 : (0 : Fin 3) ∈ {b | t 0 b} := t.refl' 0
  have h2 : t 0 2 := by
    have := h ![true, false, true] rfl ![false, false, false] rfl
    by_contra hc
    simp [parity, Set.piecewise, h0, show (2 : Fin 3) ∉ {b | t 0 b} from hc] at this
  have h1 : t 0 1 := by
    have := h ![false, true, true] rfl ![false, false, false] rfl
    by_contra hc
    simp [parity, Set.piecewise, h0, show (2 : Fin 3) ∈ {b | t 0 b} from h2,
      show (1 : Fin 3) ∉ {b | t 0 b} from hc] at this
  intro i j _
  have hi : t 0 i := by fin_cases i <;> first | exact t.refl' 0 | exact h1 | exact h2
  have hj : t 0 j := by fin_cases j <;> first | exact t.refl' 0 | exact h1 | exact h2
  exact t.trans' (t.symm' hi) hj

/-- Two equalities, `a = b` and `c = d`, over four bits. -/
def twoEq : Set (Fin 4 → Bool) := {f | f 0 = f 1 ∧ f 2 = f 3}

/-- They factor finest over `{a, b} | {c, d}`. -/
example : IsFinest twoEq (split {0, 1}) := by
  classical
  refine ⟨factors_split_iff.mpr fun f ⟨hf₁, _⟩ g ⟨_, hg₂⟩ => ?_, fun t ht => ?_⟩
  · simp [twoEq, Set.piecewise, hf₁, hg₂]
  have h01 : t 0 1 := by
    have := factors_split_iff.mp (ht.split_block 0) ![true, true, false, false] ⟨rfl, rfl⟩
      ![false, false, false, false] ⟨rfl, rfl⟩
    by_contra hc
    simp [twoEq, Set.piecewise, show (0 : Fin 4) ∈ {b | t 0 b} from t.refl' 0,
      show (1 : Fin 4) ∉ {b | t 0 b} from hc] at this
  have h23 : t 2 3 := by
    have := factors_split_iff.mp (ht.split_block 2) ![false, false, true, true] ⟨rfl, rfl⟩
      ![false, false, false, false] ⟨rfl, rfl⟩
    by_contra hc
    simp [twoEq, Set.piecewise, show (2 : Fin 4) ∈ {b | t 2 b} from t.refl' 2,
      show (3 : Fin 4) ∉ {b | t 2 b} from hc] at this
  intro i j hij
  fin_cases i <;> fin_cases j <;> simp [split_apply] at hij ⊢ <;>
    first | exact h01 | exact t.symm' h01 | exact h23 | exact t.symm' h23

/-- Yet each port is coupled to all the others. -/
example (i : Fin 4) : ¬ Factors twoEq (split {i}) := by
  classical
  intro h
  have h := factors_split_iff.mp h ![true, true, true, true] ⟨rfl, rfl⟩
    ![false, false, false, false] ⟨rfl, rfl⟩
  fin_cases i <;> simp [twoEq, Set.piecewise] at h

/-- `a = b` over four bits, `c` and `d` free. -/
def eqAB : Set (Fin 4 → Bool) := {f | f 0 = f 1}

/-- A common refinement strictly finer than both: `eqAB` factors over `{a, b, c} | {d}` and over
`{a, b, d} | {c}`, so over `{a, b} | {c} | {d}`, which separates `a` from `c`. -/
example : Factors eqAB (split {0, 1, 2} ⊓ split {0, 1, 3}) ∧
    ¬ (split {0, 1, 2} ⊓ split {0, 1, 3} : Setoid (Fin 4)) 0 2 ∧
    (split {0, 1, 2} : Setoid (Fin 4)) 0 2 := by
  classical
  have h : ∀ S : Set (Fin 4), (0 ∈ S ↔ 1 ∈ S) → Factors eqAB (split S) := fun S hS =>
    factors_split_iff.mpr fun f hf g hg => by
      by_cases h0 : (0 : Fin 4) ∈ S <;> simp_all [eqAB, Set.piecewise]
  refine ⟨(h _ (by simp)).inf (h _ (by simp)), fun h' => ?_, by simp [split_apply]⟩
  simp [Setoid.inf_iff_and, split_apply] at h'

/-- A coarser partition need not be refinable: parity factors over one block, not over single
bits (the example above), so `Factors.mono` has no converse. -/
example : Factors parity ⊤ ∧ ¬ Factors parity ⊥ := by
  refine ⟨factors_top parity, fun h => ?_⟩
  have := factors_iff.mp h (show ![true, true, true] ∈ blockProd parity ⊥ from fun i => by
    fin_cases i
    · exact ⟨![true, false, true], rfl, fun j hj => hj ▸ rfl⟩
    · exact ⟨![false, true, true], rfl, fun j hj => hj ▸ rfl⟩
    · exact ⟨![true, false, true], rfl, fun j hj => hj ▸ rfl⟩)
  simp [parity] at this

/-- Over no ports the empty relation factors over no partition, so it has no finest one: the
product over no blocks has one valuation. -/
example (s : Setoid (Fin 0)) : ¬ Factors (∅ : Set (Fin 0 → Bool)) s := fun h =>
  (factors_iff.mp h (fun i => i.elim0 :
    ∀ i : Fin 0, ∃ f ∈ (∅ : Set (Fin 0 → Bool)), ∀ j, s i j → f j = Fin.elim0 j) :
    (Fin.elim0 : Fin 0 → Bool) ∈ (∅ : Set _))

/-- The sequences of bits that are eventually `false`. -/
def eventuallyFalse : Set (ℕ → Bool) := {f | ∃ n, ∀ m ≥ n, f m = false}

/-- Over infinitely many ports no finest factorisation need exist: these sequences factor over
every split into a finite head and the tail, whose common refinement is the single ports, over
which they do not factor. -/
example : ¬ ∃ s, IsFinest eventuallyFalse s := by
  classical
  rintro ⟨s, hs, hle⟩
  have hsplit : ∀ n, Factors eventuallyFalse (split (Set.Iio n)) := fun n =>
    factors_split_iff.mpr fun f _ g ⟨N, hN⟩ => ⟨max N n, fun m hm => by
      rw [Set.piecewise_eq_of_notMem _ _ _ (by simp; omega)]; exact hN m (by omega)⟩
  have hbot : s ≤ ⊥ := fun i j hij => by
    have hi := split_apply.mp (hle _ (hsplit (i + 1)) hij)
    have hj := split_apply.mp (hle _ (hsplit (j + 1)) hij)
    simp at hi hj
    show i = j
    omega
  have := factors_iff.mp (hs.mono hbot) (show (fun _ => true) ∈ blockProd eventuallyFalse ⊥ from
    fun i => ⟨fun k => decide (k = i), ⟨i + 1, fun m hm => by simp; omega⟩,
      fun j hij => by simp [show i = j from hij]⟩)
  obtain ⟨N, hN⟩ := this
  simpa using hN N le_rfl

/-- `IsFinest.addPort`'s hypotheses hold: parity's first two bits range freely, so seen on them it
factors finest over single bits, and bit 2 is outside them. Adding it couples both, and by
uniqueness the result is parity's one block. -/
example : IsFinest (onPorts {0, 1} parity) ⊥ ∧ (2 : Fin 3) ∉ ({0, 1} : Set (Fin 3)) := by
  refine ⟨⟨factors_iff.mpr fun g _ => ?_, fun _ _ => bot_le⟩, by decide⟩
  exact ⟨![g 0, g 1, xor (g 0) (g 1)], rfl, fun j hj => by rcases hj with rfl | rfl <;> rfl⟩

/-! ## Weakest box specification

Every residual lemma assumes the context preserves unions (`hC`). `deliver Φ` is the shape of the
kernel's context: a composite pair needs exactly one row of the unknown box, so it preserves
unions. On it, the residual covers a target the box can reach, and is empty on a target that
depends on an input the box cannot see: there the empty relation stays inside the target while no
relation achieves it. A monotone context that does not preserve unions breaks `le_residual_iff`,
and, into `SetRel Unit Bool`, `covers_iff_exists_eq` and `not_covers_iff`: `hC` is needed. -/

/-- Each composite pair is produced by one row of the box. -/
def deliver {α β γ δ : Type*} (Φ : α × β → γ × δ → Prop) (R : SetRel α β) : SetRel γ δ :=
  {q | ∃ p ∈ R, Φ p q}

theorem deliver_preservesUnions {α β γ δ : Type*} (Φ : α × β → γ × δ → Prop) :
    PreservesUnions (deliver Φ) := by
  intro R
  ext q
  simp [deliver]

/-- The box's output is delivered. -/
def passOn : Unit × Bool → Unit × Bool → Prop := fun p q => q.2 = p.2

/-- Target `{true}`: the residual is the one row delivering `true`; its composite covers the
target, and that row achieves it (`subset_residual_of_eq` with `h` holding). -/
example : residual (deliver passOn) {((), true)} = {((), true)} ∧
    ({((), true)} : SetRel Unit Bool) ⊆ deliver passOn (residual (deliver passOn) {((), true)}) ∧
    deliver passOn {((), true)} = {((), true)} := by
  have hW : residual (deliver passOn) {((), true)} = {((), true)} := by
    ext ⟨u, b⟩
    cases u
    cases b <;> simp [residual, deliver, passOn, Set.subset_def, Prod.ext_iff]
  have hC : deliver passOn {((), true)} = {((), true)} := by
    ext ⟨u, b⟩
    cases u
    cases b <;> simp [deliver, passOn]
  exact ⟨hW, by rw [hW, hC], hC⟩

/-- Without `h`: the full relation delivers `false` too, so it is not inside the residual. -/
example : ¬ (Set.univ : SetRel Unit Bool) ⊆ residual (deliver passOn) {((), true)} := by
  intro h
  have := (h (Set.mem_univ ((), false)) : deliver passOn {((), false)} ⊆ _)
    (show ((), false) ∈ deliver passOn {((), false)} from ⟨((), false), rfl, rfl⟩)
  simp at this

/-- The box's output is delivered whatever the boundary input. -/
def ignoreInput : Unit × Bool → Bool × Bool → Prop := fun p q => q.2 = p.2

/-- The target delivers the boundary input itself, which the box cannot see: every row breaks it,
so the residual is empty. The empty relation stays inside the target, yet nothing achieves it. -/
example : residual (deliver ignoreInput) {q | q.2 = q.1} = ∅ ∧
    deliver ignoreInput ∅ ⊆ {q | q.2 = q.1} ∧
    ∀ R, deliver ignoreInput R ≠ {q | q.2 = q.1} := by
  have hW : residual (deliver ignoreInput) {q | q.2 = q.1} = ∅ := by
    ext ⟨u, b⟩
    simp only [residual, Set.mem_ofPred_eq, Set.mem_empty_iff_false, iff_false]
    intro h
    have := @h (!b, b) ⟨(u, b), rfl, rfl⟩
    cases b <;> simp at this
  refine ⟨hW, by simp [map_empty (deliver_preservesUnions ignoreInput)], ?_⟩
  refine (not_covers_iff (deliver_preservesUnions ignoreInput)).1 ?_
  rw [hW, map_empty (deliver_preservesUnions ignoreInput)]
  intro h
  exact h (show ((true, true) : Bool × Bool) ∈ {q : Bool × Bool | q.2 = q.1} from rfl)

/-- Monotone, but not union-preserving: only the full relation has a non-empty composite. -/
noncomputable def allOrNothing (R : SetRel Unit Bool) : SetRel Unit Unit :=
  open Classical in if R = Set.univ then Set.univ else ∅

example : Monotone allOrNothing ∧
    ¬ ((Set.univ : SetRel Unit Bool) ⊆ residual allOrNothing ∅ ↔ allOrNothing Set.univ ⊆ ∅) := by
  have single : ∀ p : Unit × Bool, ({p} : SetRel Unit Bool) ≠ Set.univ := fun p h => by
    have := h ▸ Set.mem_univ ((), !p.2)
    simp [Prod.ext_iff] at this
  refine ⟨fun R S hRS => ?_, fun h => ?_⟩
  · unfold allOrNothing
    by_cases hR : R = Set.univ
    · have hS : S = Set.univ := Set.univ_subset_iff.1 (hR ▸ hRS)
      simp [hR, hS]
    · simp [hR]
  · have hu : (Set.univ : SetRel Unit Bool) ⊆ residual allOrNothing ∅ := fun p _ => by
      simp only [residual, allOrNothing, Set.mem_ofPred_eq, ite_eq_right (single p), subset_rfl]
    exact h.1 hu (show ((), ()) ∈ allOrNothing Set.univ by simp [allOrNothing])

/-- The same shape into `SetRel Unit Bool`: the context takes only the values ∅ and everything. -/
noncomputable def allOrNothingBool (R : SetRel Unit Bool) : SetRel Unit Bool :=
  open Classical in if R = Set.univ then Set.univ else ∅

/-- Without `hC`, `covers_iff_exists_eq` and `not_covers_iff` fail as well: the residual of
`{((), true)}` is everything and its composite covers the target, yet no relation gives it. -/
example : ¬ ((∃ R, allOrNothingBool R = {((), true)}) ↔
      {((), true)} ⊆ allOrNothingBool (residual allOrNothingBool {((), true)})) ∧
    ¬ (¬ {((), true)} ⊆ allOrNothingBool (residual allOrNothingBool {((), true)}) ↔
      ∀ R, allOrNothingBool R ≠ {((), true)}) := by
  have single : ∀ p : Unit × Bool, ({p} : SetRel Unit Bool) ≠ Set.univ := fun p h => by
    have := h ▸ Set.mem_univ ((), !p.2)
    simp [Prod.ext_iff] at this
  have hW : residual allOrNothingBool {((), true)} = Set.univ := Set.eq_univ_of_forall fun p => by
    simp only [residual, allOrNothingBool, Set.mem_ofPred_eq, ite_eq_right (single p), Set.empty_subset]
  have hcov : ({((), true)} : SetRel Unit Bool) ⊆
      allOrNothingBool (residual allOrNothingBool {((), true)}) := by
    rw [hW]
    simp [allOrNothingBool]
  have hne : ∀ R, allOrNothingBool R ≠ {((), true)} := fun R h => by
    unfold allOrNothingBool at h
    split_ifs at h
    · have := (Set.ext_iff.mp h ((), false)).1 trivial
      simp at this
    · exact (Set.ext_iff.mp h ((), true)).2 rfl
  exact ⟨fun h => let ⟨R, hR⟩ := h.2 hcov; hne R hR, fun h => h.2 hne hcov⟩

/-! ### Producible rows: `covers_feasible_iff`, `not_covers_feasible_iff`, `required_row_of_eq`

On `passOn` with target `{true}`, the residual is the one row delivering `true`. When the box can
produce that row (`F` everything), the producible residual covers the target and that row
achieves it. When it can produce only the row delivering `false`, the residual still covers the
target, but its producible part is empty: no producible relation achieves the target, and the row
delivering `true` is the required, unproducible one. Without `hC`, `allOrNothingBool` breaks the
iff with `F` everything, as it breaks `covers_iff_exists_eq`. -/

/-- The residual of `passOn` for the target `{true}` is the row delivering `true`. -/
theorem passOn_residual : residual (deliver passOn) {((), true)} = {((), true)} := by
  ext ⟨u, b⟩
  cases u
  cases b <;> simp [residual, deliver, passOn, Set.subset_def, Prod.ext_iff]

theorem passOn_single : deliver passOn {((), true)} = {((), true)} := by
  ext ⟨u, b⟩
  cases u
  cases b <;> simp [deliver, passOn]

example : ({((), true)} : SetRel Unit Bool) ⊆ deliver passOn (residual (deliver passOn) {((), true)} ∩ Set.univ) ∧
    ∃ R ⊆ (Set.univ : SetRel Unit Bool), deliver passOn R = {((), true)} := by
  have h : ({((), true)} : SetRel Unit Bool) ⊆ deliver passOn (residual (deliver passOn) {((), true)} ∩ Set.univ) := by
    rw [Set.inter_univ, passOn_residual, passOn_single]
  exact ⟨h, (covers_feasible_iff (deliver_preservesUnions passOn)).2 h⟩

/-- Only the row delivering `false` is producible: the residual covers the target, its producible
part does not, and no producible relation achieves the target. -/
example : ({((), true)} : SetRel Unit Bool) ⊆ deliver passOn (residual (deliver passOn) {((), true)}) ∧
    ¬ ({((), true)} : SetRel Unit Bool) ⊆ deliver passOn (residual (deliver passOn) {((), true)} ∩ {((), false)}) ∧
    ∀ R ⊆ ({((), false)} : SetRel Unit Bool), deliver passOn R ≠ {((), true)} := by
  have hF : residual (deliver passOn) {((), true)} ∩ {((), false)} = ∅ := by
    rw [passOn_residual]
    ext ⟨u, b⟩
    simp [Prod.ext_iff]
  have hn : ¬ ({((), true)} : SetRel Unit Bool) ⊆ deliver passOn (residual (deliver passOn) {((), true)} ∩ {((), false)}) := by
    rw [hF, map_empty (deliver_preservesUnions passOn)]
    exact fun h => h rfl
  exact ⟨by rw [passOn_residual, passOn_single], hn, (not_covers_feasible_iff (deliver_preservesUnions passOn)).1 hn⟩

/-- The row delivering `true` is required: any relation achieving `{true}` holds it, and it is in
the residual. -/
example : ∃ p ∈ ({((), true)} : SetRel Unit Bool), p ∈ residual (deliver passOn) {((), true)} ∧
    ((), true) ∈ deliver passOn {p} :=
  required_row_of_eq (deliver_preservesUnions passOn) passOn_single rfl

/-- Without `h`: the empty relation does not achieve `{true}`, and holds no row. -/
example : deliver passOn ∅ ≠ {((), true)} ∧ ¬ ∃ p ∈ (∅ : SetRel Unit Bool), ((), true) ∈ deliver passOn {p} := by
  rw [map_empty (deliver_preservesUnions passOn)]
  exact ⟨fun h => by simpa using (Set.ext_iff.mp h ((), true)).2 rfl, fun ⟨_, hp, _⟩ => hp⟩

/-- Without `hq`: the pair `false` is outside the target, and the achieving row does not deliver it. -/
example : ((), false) ∉ ({((), true)} : SetRel Unit Bool) ∧
    ¬ ∃ p ∈ ({((), true)} : SetRel Unit Bool), ((), false) ∈ deliver passOn {p} := by
  refine ⟨by simp, fun ⟨p, hp, hq⟩ => ?_⟩
  rw [Set.mem_singleton_iff.mp hp, passOn_single] at hq
  simp at hq

/-- Without `hC`: `allOrNothingBool` with `F` everything breaks `covers_feasible_iff`, since the
residual of `{true}` is everything and its composite covers the target, yet nothing achieves it;
and it breaks `required_row_of_eq`, since everything achieves everything with no single row
delivering anything. -/
example : ¬ ((∃ R ⊆ (Set.univ : SetRel Unit Bool), allOrNothingBool R = {((), true)}) ↔
      {((), true)} ⊆ allOrNothingBool (residual allOrNothingBool {((), true)} ∩ Set.univ)) ∧
    allOrNothingBool Set.univ = Set.univ ∧
    ¬ ∃ p ∈ (Set.univ : SetRel Unit Bool), p ∈ residual allOrNothingBool Set.univ ∧
      ((), true) ∈ allOrNothingBool {p} := by
  have single : ∀ p : Unit × Bool, ({p} : SetRel Unit Bool) ≠ Set.univ := fun p h => by
    have := h ▸ Set.mem_univ ((), !p.2)
    simp [Prod.ext_iff] at this
  have hW : residual allOrNothingBool {((), true)} = Set.univ := Set.eq_univ_of_forall fun p => by
    simp only [residual, allOrNothingBool, Set.mem_ofPred_eq, ite_eq_right (single p), Set.empty_subset]
  have hne : ∀ R, allOrNothingBool R ≠ {((), true)} := fun R h => by
    unfold allOrNothingBool at h
    split_ifs at h
    · have := (Set.ext_iff.mp h ((), false)).1 trivial
      simp at this
    · exact (Set.ext_iff.mp h ((), true)).2 rfl
  refine ⟨fun h => ?_, by simp [allOrNothingBool], fun ⟨p, _, _, hq⟩ => ?_⟩
  · obtain ⟨R, -, hR⟩ := h.2 (by rw [Set.inter_univ, hW]; simp [allOrNothingBool])
    exact hne R hR
  · simp [allOrNothingBool] at hq

/-! ### Two unknown boxes: `le_safeRows_iff`, `safe_iff_le_concept`, `concept_maximal`, `exists_eq₂_iff`

Two boxes side by side, each delivering one bit (`bothBits`), preserve unions in each box. With
the target that the bits differ, a box delivering `true` beside one delivering `false` is safe,
and so is the swap. The concepts these generate are incomparable, so no pair of relations is the
weakest. Each is maximal: a safe pair containing `true` beside `false` is exactly that pair, and
without `h` the full relations contain it too. No pair achieves that target: it is not a rectangle, and the boxes would have to
coordinate. The target "the first bit is `true`" is achieved, so a concept covers it. Without
`hC`: one box whose relation is used for both bits (`twiceBits`) does not preserve unions in each,
and on the target that the bits agree every pair of rows is safe while the full relations are
not. -/

/-- Two boxes side by side: the composite delivers the bit of each. -/
def bothBits (R₁ R₂ : SetRel Unit Bool) : SetRel Unit (Bool × Bool) :=
  {q | ((), q.2.1) ∈ R₁ ∧ ((), q.2.2) ∈ R₂}

theorem bothBits_preservesUnions₂ : PreservesUnions₂ bothBits := by
  intro R₁ R₂
  ext ⟨u, a, b⟩
  simp [bothBits]

/-- The bits differ. -/
def differ : SetRel Unit (Bool × Bool) := {q | q.2.1 ≠ q.2.2}

/-- A concept holding the same row in both boxes is not safe for `differ`. -/
theorem differ_clash (c : Concept (Unit × Bool) (Unit × Bool) (SafeRows bothBits differ)) (b : Bool)
    (h₁ : ((), b) ∈ c.extent) (h₂ : ((), b) ∈ c.intent) : False :=
  concept_safe bothBits_preservesUnions₂ c (show ((), (b, b)) ∈ bothBits c.extent c.intent from ⟨h₁, h₂⟩) rfl

/-- Each orientation is safe, and the concepts the two generate are incomparable. -/
example : ∃ c c' : Concept (Unit × Bool) (Unit × Bool) (SafeRows bothBits differ), ¬ c ≤ c' ∧ ¬ c' ≤ c := by
  have safe : ∀ a : Bool, bothBits {((), a)} {((), !a)} ⊆ differ := by
    rintro a ⟨u, x, y⟩ ⟨hx, hy⟩
    simp only [Set.mem_singleton_iff, Prod.mk.injEq, true_and] at hx hy
    subst hx hy
    cases x <;> simp [differ]
  obtain ⟨c, hc₁, hc₂⟩ := (safe_iff_le_concept bothBits_preservesUnions₂).1 (safe true)
  obtain ⟨c', hc₁', hc₂'⟩ := (safe_iff_le_concept bothBits_preservesUnions₂).1 (safe false)
  refine ⟨c, c', fun h => ?_, fun h => ?_⟩
  · exact differ_clash c' true (Concept.extent_subset_extent_iff.2 h (hc₁ rfl)) (hc₂' rfl)
  · exact differ_clash c false (Concept.extent_subset_extent_iff.2 h (hc₁' rfl)) (hc₂ rfl)

/-- `true` beside `false` is a maximal safe pair: no safe pair strictly contains it. Without `h`,
the full relations contain it and are not it. -/
example : (∀ R₁ R₂, bothBits R₁ R₂ ⊆ differ → {((), true)} ⊆ R₁ → {((), false)} ⊆ R₂ →
      R₁ = {((), true)} ∧ R₂ = {((), false)}) ∧
    (Set.univ : SetRel Unit Bool) ≠ {((), true)} := by
  have safe : bothBits {((), true)} {((), false)} ⊆ differ := by
    rintro ⟨u, x, y⟩ ⟨hx, hy⟩
    simp only [Set.mem_singleton_iff, Prod.mk.injEq, true_and] at hx hy
    subst hx hy
    simp [differ]
  obtain ⟨c, hc₁, hc₂⟩ := (safe_iff_le_concept bothBits_preservesUnions₂).1 safe
  have he : c.extent = {((), true)} := by
    refine Set.Subset.antisymm (fun ⟨u, b⟩ hb => ?_) hc₁
    cases b
    · exact (differ_clash c false hb (hc₂ rfl)).elim
    · exact rfl
  have hi : c.intent = {((), false)} := by
    refine Set.Subset.antisymm (fun ⟨u, b⟩ hb => ?_) hc₂
    cases b
    · exact rfl
    · exact (differ_clash c true (hc₁ rfl) hb).elim
  refine ⟨fun R₁ R₂ h h₁ h₂ => ?_, fun h => ?_⟩
  · have := concept_maximal bothBits_preservesUnions₂ c h (he ▸ h₁) (hi ▸ h₂)
    rwa [he, hi] at this
  · have : ((), false) ∈ ({((), true)} : SetRel Unit Bool) := h ▸ Set.mem_univ _
    simp at this

/-- No pair achieves `differ`, so no concept covers it. -/
example : ¬ ∃ c : Concept (Unit × Bool) (Unit × Bool) (SafeRows bothBits differ),
    differ ⊆ bothBits c.extent c.intent := by
  rw [← exists_eq₂_iff bothBits_preservesUnions₂]
  rintro ⟨R₁, R₂, h⟩
  have h₁ : ((), (true, false)) ∈ bothBits R₁ R₂ := by rw [h]; simp [differ]
  have h₂ : ((), (false, true)) ∈ bothBits R₁ R₂ := by rw [h]; simp [differ]
  have : ((), (true, true)) ∈ bothBits R₁ R₂ := ⟨h₁.1, h₂.2⟩
  rw [h] at this
  simp [differ] at this

/-- The first bit is `true`: achieved, so a concept covers it. -/
example : ∃ c : Concept (Unit × Bool) (Unit × Bool) (SafeRows bothBits {q | q.2.1 = true}),
    {q | q.2.1 = true} ⊆ bothBits c.extent c.intent :=
  (exists_eq₂_iff bothBits_preservesUnions₂).1
    ⟨{((), true)}, Set.univ, by ext ⟨u, a, b⟩; simp [bothBits]⟩

/-- One box's relation used for both bits. -/
def twiceBits (R₁ _ : SetRel Unit Bool) : SetRel Unit (Bool × Bool) := bothBits R₁ R₁

/-- Without `hC`: on the target that the bits agree, every pair of rows is safe, yet the full
relations are not. -/
example : ¬ (twiceBits Set.univ Set.univ ⊆ {q | q.2.1 = q.2.2} ↔
    (Set.univ : SetRel Unit Bool) ⊆ upperPolar (SafeRows twiceBits {q | q.2.1 = q.2.2}) Set.univ) := by
  intro h
  have hsafe : (Set.univ : SetRel Unit Bool) ⊆
      upperPolar (SafeRows twiceBits {q | q.2.1 = q.2.2}) Set.univ := by
    rintro q - p - ⟨u, a, b⟩ ⟨ha, hb⟩
    exact congrArg Prod.snd ((Set.mem_singleton_iff.mp ha).trans (Set.mem_singleton_iff.mp hb).symm)
  have := h.2 hsafe (show ((), (true, false)) ∈ twiceBits Set.univ Set.univ from ⟨trivial, trivial⟩)
  simp at this

/-! ### Producible rows: `safe_feasible_iff`, `exists_eq₂_feasible_iff`

With the target "the first bit is `true`", which the uncut boxes achieve (above), a first box that
can produce only `false` leaves no producible pair that achieves it, and one that can produce
`true` has a concept of the safe pairs of producible rows that covers it. Without `h₁`, a safe pair
whose first relation lies outside `F₁` is not inside the intersected relation. -/

/-- The first box produces only `false`: no concept of the safe pairs of producible rows covers
"the first bit is `true`". -/
example : ¬ ∃ c : Concept ({((), false)} : SetRel Unit Bool) (Set.univ : SetRel Unit Bool)
    (SafeRows (cut bothBits {((), false)} Set.univ) {q | q.2.1 = true}),
    {q | q.2.1 = true} ⊆ bothBits (Subtype.val '' c.extent) (Subtype.val '' c.intent) := by
  rw [← exists_eq₂_feasible_iff bothBits_preservesUnions₂]
  rintro ⟨R₁, h₁, R₂, -, h⟩
  have : ((), (true, true)) ∈ bothBits R₁ R₂ := by rw [h]; rfl
  simpa using h₁ this.1

/-- The first box can produce `true`: a concept of the safe pairs of producible rows covers it. -/
example : ∃ c : Concept ({((), true)} : SetRel Unit Bool) (Set.univ : SetRel Unit Bool)
    (SafeRows (cut bothBits {((), true)} Set.univ) {q | q.2.1 = true}),
    {q | q.2.1 = true} ⊆ bothBits (Subtype.val '' c.extent) (Subtype.val '' c.intent) :=
  (exists_eq₂_feasible_iff bothBits_preservesUnions₂).1
    ⟨{((), true)}, subset_rfl, Set.univ, subset_rfl, by ext ⟨u, a, b⟩; simp [bothBits]⟩

/-- Without `h₁`: `true` beside every row keeps the first bit `true`, but with nothing producible in
the first box the pair is not inside the intersected relation. -/
example : bothBits {((), true)} Set.univ ⊆ {q | q.2.1 = true} ∧
    ¬ ({((), true)} : SetRel Unit Bool) ×ˢ (Set.univ : SetRel Unit Bool) ⊆
      {x | SafeRows bothBits {q | q.2.1 = true} x.1 x.2} ∩ (∅ : SetRel Unit Bool) ×ˢ Set.univ := by
  refine ⟨?_, fun h => (h (Set.mk_mem_prod rfl (Set.mem_univ ((), true)))).2.1⟩
  rintro ⟨u, a, b⟩ ⟨ha, -⟩
  simpa using ha

/-! ## Weakness ranking

`admits_mono_ok`: a predicate that also accepts `false` admits the situation `false` as well;
reversed, the larger admitted set is not inside the smaller, so `h` is needed. `AtLeastAsWeak` is
transitive, and each hypothesis of `atLeastAsWeak_trans` is needed: with the incomparable pair of
`admits_incomparable`, keeping one hypothesis by reflexivity does not give the conclusion.
`card_lt_of_strictly_weaker` holds on a strict inclusion, fails on an equality, and a larger count
alone gives no inclusion, which is why the ranking rests on inclusion and reports the count second. -/

example : false ∉ admits (fun u y : Bool => y = u) (· = true) ∧
    false ∈ admits (fun u y : Bool => y = u) (fun _ => True) ∧
    admits (fun u y : Bool => y = u) (· = true) ⊆ admits (fun u y : Bool => y = u) (fun _ => True) :=
  ⟨fun h => Bool.false_ne_true (h.2 false rfl), ⟨⟨false, rfl⟩, fun _ _ => trivial⟩,
    admits_mono_ok fun _ _ => trivial⟩

example : ¬ admits (fun u y : Bool => y = u) (fun _ => True) ⊆ admits (fun u y : Bool => y = u) (· = true) :=
  fun h => Bool.false_ne_true ((h ⟨⟨false, rfl⟩, fun _ _ => trivial⟩).2 false rfl)

example : AtLeastAsWeak (· = true) (fun u y : Bool => y = u) (fun u y => y = u) :=
  atLeastAsWeak_trans (atLeastAsWeak_refl _ _) (atLeastAsWeak_refl _ _)

/-- Without `h₁`: `S` and `U` agree, but `R` is incomparable with them. -/
example : AtLeastAsWeak (· = true) (fun u y : Bool => y = u) (fun u y => y = u) ∧
    ¬ AtLeastAsWeak (· = true) (fun u y : Bool => y = !u) (fun u y => y = u) :=
  ⟨atLeastAsWeak_refl _ _, admits_incomparable.2⟩

/-- Without `h₂`: `R` and `S` agree, but `U` is incomparable with them. -/
example : AtLeastAsWeak (· = true) (fun u y : Bool => y = u) (fun u y => y = u) ∧
    ¬ AtLeastAsWeak (· = true) (fun u y : Bool => y = u) (fun u y => y = !u) :=
  ⟨atLeastAsWeak_refl _ _, admits_incomparable.1⟩

example : ({0} : Finset ℕ).card < ({0, 1} : Finset ℕ).card :=
  card_lt_of_strictly_weaker (by decide)

example : ({0} : Finset ℕ) ⊆ {0} ∧ ¬ ({0} : Finset ℕ).card < ({0} : Finset ℕ).card :=
  ⟨subset_rfl, lt_irrefl _⟩

example : ({0} : Finset ℕ).card < ({1, 2} : Finset ℕ).card ∧ ¬ ({0} : Finset ℕ) ⊆ {1, 2} := by
  decide

/-! ## Dynamics

Each dynamics lemma with hypotheses holds on a concrete machine or step relation, and dropping
any one hypothesis breaks it. Lemmas without hypotheses (`reachIn_iff_trace`,
`reachWithin_iff_trace`) need no witness. -/

/-- One step from each number to the next. -/
def succStep : ℕ → ℕ → Prop := fun a b => b = a + 1

/-- Negation on `Bool`: from `false`, the reachable set `{false, true}` is complete after one step. -/
def negStep : Bool → Bool → Prop := fun a b => b = !a

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

/-! ### `relTrace_mealyRel_iff`, `relTrace_mealyRel_fixed`

A machine that holds its state has a steady state, a fixed point the run can stay at. One that
toggles its state has none and no self-loop, though it steps forever: the trace sees no
oscillation. -/

example : relTrace (mealyRel fun (s : Bool) (_ : Unit) s' (_ : Unit) => s' = s) () () ∧
    ∃ s, mealyStep (fun (s : Bool) (_ : Unit) s' (_ : Unit) => s' = s) {()} s s :=
  ⟨relTrace_mealyRel_iff.mpr ⟨true, rfl⟩,
    relTrace_mealyRel_fixed (o := ()) (relTrace_mealyRel_iff.mpr ⟨true, rfl⟩)⟩

example : ¬ relTrace (mealyRel fun (s : Bool) (_ : Unit) s' (_ : Unit) => s' = !s) () () ∧
    (¬ ∃ s, mealyStep (fun (s : Bool) (_ : Unit) s' (_ : Unit) => s' = !s) {()} s s) ∧
    mealyStep (fun (s : Bool) (_ : Unit) s' (_ : Unit) => s' = !s) {()} true false := by
  refine ⟨fun h => ?_, fun ⟨s, _, _, _, hs⟩ => ?_, ⟨(), rfl, (), rfl⟩⟩
  · obtain ⟨s, hs⟩ := relTrace_mealyRel_iff.mp h
    cases s <;> simp at hs
  · cases s <;> simp at hs

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

example : (∀ b, (∃ a ∈ ({false} : Set Bool), reachIn negStep 2 a b) → ∃ a ∈ ({false} : Set Bool), reachWithin negStep 1 a b) ∧
    ∃ a ∈ ({false} : Set Bool), reachWithin negStep 5 a true := by
  refine ⟨?_, false, Set.mem_singleton _, 1, by norm_num, false, rfl, rfl⟩
  rintro b ⟨a, ha, c, ⟨d, hd, hdc⟩, hcb⟩
  rw [Set.mem_singleton_iff] at ha
  subst ha hd
  refine ⟨false, Set.mem_singleton _, 0, Nat.zero_le _, ?_⟩
  show false = b
  simp only [negStep] at hdc hcb
  rw [hcb, hdc]
  rfl

example : (∃ a ∈ ({0} : Set ℕ), reachWithin succStep 1 a 1) ∧
    ¬ ∃ a ∈ ({0} : Set ℕ), reachWithin succStep 0 a 1 := by
  refine ⟨⟨0, Set.mem_singleton _, 1, le_rfl, 0, rfl, rfl⟩, ?_⟩
  rintro ⟨a, ha, h⟩
  rw [Set.mem_singleton_iff] at ha
  subst ha
  exact absurd (reachWithin_succStep h) (by norm_num)

/-! ### `fixed_on_cycle`

A self-loop is a cycle; without the self-loop hypothesis, the empty relation has no cycle. -/

example : Relation.TransGen (fun a b : Bool => a = b) true true := fixed_on_cycle rfl

example : ¬ Relation.TransGen (fun _ _ : Unit => False) () () := by
  intro h
  cases h with
  | single h => exact h
  | tail _ h => exact h

/-! ### `closed_reachIn`

`{true}` is closed under the identity step and holds the run. Without closedness, negation leaves
`{false}` in one step. Without the start in the set, a closed set says nothing about the run. -/

example : true ∈ ({true} : Set Bool) ∧ Closed (fun a b : Bool => a = b) {true} :=
  ⟨Set.mem_singleton _, fun (a : Bool) ha (b : Bool) (hb : a = b) => hb ▸ ha⟩

example : reachIn (fun a b : Bool => a = b) 3 true true ∧ true ∈ ({true} : Set Bool) :=
  ⟨⟨true, ⟨true, ⟨true, rfl, rfl⟩, rfl⟩, rfl⟩,
    closed_reachIn (C := {true}) (fun (a : Bool) ha (b : Bool) (hb : a = b) => hb ▸ ha) (Set.mem_singleton true) 3 ⟨true, ⟨true, ⟨true, rfl, rfl⟩, rfl⟩, rfl⟩⟩

example : false ∈ ({false} : Set Bool) ∧ reachIn negStep 1 false true ∧ true ∉ ({false} : Set Bool) :=
  ⟨Set.mem_singleton _, ⟨false, rfl, rfl⟩, by simp⟩

example : Closed (fun a b : Bool => a = b) {true} ∧ reachIn (fun a b : Bool => a = b) 0 false false ∧
    false ∉ ({true} : Set Bool) :=
  ⟨fun (a : Bool) ha (b : Bool) (hb : a = b) => hb ▸ ha, rfl, by simp⟩

/-! ### `trapped_reachIn`

A two-state wear model: `false` is thin, `true` is thick, and the unsafe set is `{true}`. When
thick is absorbing (`wearOnly`), `{true}` is closed and inside the unsafe set, and the run stays
unsafe. Each hypothesis is needed: without closedness, the recoverable step (`wearOrRenew`)
leaves `{true}` for the safe `false`; without `C ⊆ U`, the closed set `Set.univ` holds the safe
`false`; without the start in `C`, a run from `false` stays safe. A closed set that meets `U`
without lying inside it is recurrent, not trapped: under `wearOrRenew`, `Set.univ` is closed,
meets `{true}`, and reaches the safe `false` from `true`. -/

/-- Wear only: thin may stay thin or wear thick; thick stays thick. -/
def wearOnly : Bool → Bool → Prop := fun s t => s = true → t = true

/-- Wear or renew: thick may also return to thin. -/
def wearOrRenew : Bool → Bool → Prop := fun _ _ => True

example : Closed wearOnly {true} ∧ ({true} : Set Bool) ⊆ {true} ∧ reachIn wearOnly 2 true true ∧
    true ∈ ({true} : Set Bool) :=
  have hC : Closed wearOnly {true} := fun _ ha _ hb => hb ha
  have hr : reachIn wearOnly 2 true true := ⟨true, ⟨true, rfl, fun _ => rfl⟩, fun _ => rfl⟩
  ⟨hC, subset_rfl, hr, trapped_reachIn hC subset_rfl (Set.mem_singleton true) 2 hr⟩

example : ¬ Closed wearOrRenew {true} ∧ reachIn wearOrRenew 1 true false ∧ false ∉ ({true} : Set Bool) :=
  ⟨fun h => by simpa using h true rfl false trivial, ⟨true, rfl, trivial⟩, by simp⟩

example : Closed wearOnly Set.univ ∧ ¬ (Set.univ : Set Bool) ⊆ {true} ∧ reachIn wearOnly 0 false false ∧
    false ∉ ({true} : Set Bool) :=
  ⟨fun _ _ _ _ => trivial, fun h => by simpa using h (Set.mem_univ false), rfl, by simp⟩

example : Closed wearOnly {true} ∧ false ∉ ({true} : Set Bool) ∧ reachIn wearOnly 1 false false :=
  ⟨fun _ ha _ hb => hb ha, by simp, ⟨false, rfl, fun h => absurd h Bool.false_ne_true⟩⟩

/-- Recurrent, not trapped: a closed set that meets the unsafe set and reaches a safe state. -/
example : Closed wearOrRenew Set.univ ∧ (Set.univ ∩ {true} : Set Bool).Nonempty ∧
    reachIn wearOrRenew 1 true false ∧ false ∉ ({true} : Set Bool) :=
  ⟨fun _ _ _ _ => trivial, ⟨true, trivial, rfl⟩, ⟨true, rfl, trivial⟩, by simp⟩

/-! ### `recurrent_reach`

Under `wearOrRenew`, `Set.univ` is closed and its states reach each other; it holds the unsafe
thick state and the safe thin one, so from a run's state thick, both stay reachable. Each
hypothesis is needed. Under `wearOnly`, thick is absorbing (`wearOnly_stays`): without
closedness, `{false}` is left for thick, which never returns; without the states reaching each
other, the closed `Set.univ` holds thin but thick never returns to it. Without `hU`, an empty
unsafe set is never reached. Without the start in `C`, a run that holds its state outside the
closed `{true}` never enters it. -/

/-- Under `wearOnly`, thick stays thick. -/
theorem wearOnly_stays {t : Bool} (h : Relation.ReflTransGen wearOnly true t) : t = true := by
  induction h with
  | refl => rfl
  | tail _ hbc ih => exact hbc ih

example : (∃ u ∈ ({true} : Set Bool), Relation.ReflTransGen wearOrRenew true u) ∧
    ∃ s ∈ ({false} : Set Bool), Relation.ReflTransGen wearOrRenew true s :=
  recurrent_reach (r := wearOrRenew) (C := Set.univ) (U := {true}) (S := {false}) (b := true)
    (fun _ _ _ _ => trivial)
    (fun _ _ _ _ => Relation.ReflTransGen.single trivial) ⟨true, trivial, rfl⟩ ⟨false, trivial, rfl⟩
    (Set.mem_univ false) 1 (⟨false, rfl, trivial⟩ : reachIn wearOrRenew 1 false true)

example : ¬ Closed wearOnly {false} ∧ reachIn wearOnly 1 false true ∧
    ¬ ∃ u ∈ ({false} : Set Bool), Relation.ReflTransGen wearOnly true u :=
  ⟨fun h => by simpa using h false rfl true (fun h => absurd h Bool.false_ne_true),
    ⟨false, rfl, fun h => absurd h Bool.false_ne_true⟩,
    fun ⟨u, hu, hr⟩ => absurd ((Set.mem_singleton_iff.mp hu).symm.trans (wearOnly_stays hr)) Bool.false_ne_true⟩

example : Closed wearOnly Set.univ ∧ ¬ Relation.ReflTransGen wearOnly true false :=
  ⟨fun _ _ _ _ => trivial, fun h => Bool.false_ne_true (wearOnly_stays h)⟩

example : ¬ ∃ u ∈ (∅ : Set Bool), Relation.ReflTransGen wearOrRenew true u :=
  fun ⟨_, hu, _⟩ => hu

example : Closed (fun (s t : Bool) => t = s) {true} ∧ false ∉ ({true} : Set Bool) ∧
    ¬ Relation.ReflTransGen (fun (s t : Bool) => t = s) false true := by
  refine ⟨fun a ha b hb => hb ▸ ha, by simp, fun h => ?_⟩
  have : ∀ t, Relation.ReflTransGen (fun (s t : Bool) => t = s) false t → t = false := fun t h => by
    induction h with
    | refl => rfl
    | tail _ hbc ih => exact hbc.trans ih
  exact Bool.noConfusion (this true h)

/-! ### `unreachable_of_invariant`

Under wear only, `{true}` holds the start `true`, is closed, and misses `{false}`: no run from
thick returns to thin, though the run goes on (`true` to `true` in two steps). Each hypothesis is
needed: without `A ⊆ I`, a start `false` outside the invariant is in the target at time zero;
without closedness, negation leaves the invariant `{false}` for the target `{true}` in one step;
without disjointness, the start `true` is in the target `{true}` at time zero. -/

example : (∀ n, ∀ a ∈ ({true} : Set Bool), ∀ b ∈ ({false} : Set Bool), ¬ reachIn wearOnly n a b) ∧
    reachIn wearOnly 2 true true :=
  ⟨unreachable_of_invariant subset_rfl (fun _ ha _ hb => hb ha) (by simp),
    ⟨true, ⟨true, rfl, fun _ => rfl⟩, fun _ => rfl⟩⟩

example : Closed wearOnly {true} ∧ Disjoint ({true} : Set Bool) {false} ∧ ¬ ({false} : Set Bool) ⊆ {true} ∧
    reachIn wearOnly 0 false false :=
  ⟨fun _ ha _ hb => hb ha, by simp, by simp, rfl⟩

example : ({false} : Set Bool) ⊆ {false} ∧ ¬ Closed negStep {false} ∧ Disjoint ({false} : Set Bool) {true} ∧
    reachIn negStep 1 false true :=
  ⟨subset_rfl, fun h => by simpa [negStep] using h false rfl true rfl, by simp, ⟨false, rfl, rfl⟩⟩

example : Closed wearOnly {true} ∧ ¬ Disjoint ({true} : Set Bool) {true} ∧ reachIn wearOnly 0 true true :=
  ⟨fun _ ha _ hb => hb ha, by simp, rfl⟩

/-! ### `Sync.starts_subset_holding`, `Sync.closed_holding`, `Sync.disjoint_holding_target`

`wearSync` is one box with one machine on states `0` (thin) and `1` (thick), one port with one
value, and no function: row 0 wears thin to thick, row 1 keeps thick. Each bridge's table check
holds on it while its set is not empty (a start, a step, a target configuration), and fails, with
the conclusion, when the table lists the wrong state: thick misses the start thin; thin is left
for thick in one step; thin is the target. -/

/-- One box, one machine on `Fin 2`, one port with one value, no function. -/
def wearSync : Sync (Fin 1) (Fin 2) (Fin 1) (Fin 1) (Fin 0) (Fin 2) (Fin 1) :=
  ⟨fun _ => 0, fun _ _ => true, fun _ _ => 0, fun _ => some 0, ![0, 1], ![1, 1], Fin.elim0, Fin.elim0⟩

/-- The one configuration with the machine in state `s`. -/
def wearAt (s : Fin 2) : (Fin 1 → Fin 2) × (Fin 1 → Fin 1) := (fun _ => s, fun _ => 0)

example : wearAt 0 ∈ wearSync.starts ![![true, false]] ∧
    wearSync.starts ![![true, false]] ⊆ wearSync.holding ![fun _ => (0 : Fin 2)] :=
  ⟨by decide, wearSync.starts_subset_holding (by decide)⟩

example : wearAt 1 ∈ wearSync.starts ![![false, true]] ∧
    ¬ wearSync.starts ![![false, true]] ⊆ wearSync.holding ![fun _ => (0 : Fin 2)] :=
  ⟨by decide, fun h => absurd (h (show wearAt 1 ∈ wearSync.starts ![![false, true]] by decide)) (by
    rintro ⟨i, hi⟩
    have := congrFun hi 0
    simp [wearAt] at this)⟩

example : wearSync.Step (wearAt 1) (wearAt 1) ∧ Closed wearSync.Step (wearSync.holding ![fun _ => (1 : Fin 2)]) :=
  ⟨by decide, wearSync.closed_holding (by decide)⟩

example : wearSync.Step (wearAt 0) (wearAt 1) ∧ ¬ Closed wearSync.Step (wearSync.holding ![fun _ => (0 : Fin 2)]) :=
  ⟨by decide, fun h => absurd (h (wearAt 0) ⟨0, rfl⟩ (wearAt 1) (by decide)) (by
    rintro ⟨i, hi⟩
    have := congrFun hi 0
    simp [wearAt] at this)⟩

example : wearAt 0 ∈ wearSync.target ![![true, false]] ![![true]] ∧
    Disjoint (wearSync.holding ![fun _ => (1 : Fin 2)]) (wearSync.target ![![true, false]] ![![true]]) :=
  ⟨by decide, wearSync.disjoint_holding_target (by decide)⟩

example : ¬ Disjoint (wearSync.holding ![fun _ => (0 : Fin 2)]) (wearSync.target ![![true, false]] ![![true]]) :=
  fun h => Set.disjoint_left.mp h ⟨0, rfl⟩ (show wearAt 0 ∈ wearSync.target ![![true, false]] ![![true]] by decide)

/-! ### `return_ge_two`

Negation on `Bool` has no fixed point and returns in two steps. Without `h`, the identity returns
in one step. Without `hn`, every state returns in zero steps. Without `hc`, there is no return in
one step to bound. -/

example : (∀ s, ¬ negStep s s) ∧ reachIn negStep 2 false false ∧ 2 ≤ 2 :=
  ⟨fun s h => by cases s <;> simp [negStep] at h, ⟨true, ⟨false, rfl, rfl⟩, rfl⟩,
    return_ge_two (r := negStep) (fun s h => by cases s <;> simp [negStep] at h) (by norm_num) ⟨true, ⟨false, rfl, rfl⟩, rfl⟩⟩

example : reachIn (fun a b : Bool => a = b) 1 true true ∧ ¬ 2 ≤ 1 := ⟨⟨true, rfl, rfl⟩, by norm_num⟩

example : reachIn negStep 0 false false ∧ ¬ 2 ≤ 0 := ⟨rfl, by norm_num⟩

example : (∀ s, ¬ negStep s s) ∧ ¬ reachIn negStep 1 false false :=
  ⟨fun s h => by cases s <;> simp [negStep] at h, fun ⟨c, hc, h⟩ => by
    subst hc
    simp [negStep] at h⟩

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
      change (m : ℕ∞) + 1 = m at h
      norm_cast at h
      omega
  intro k
  have hk : enatSucc^[k] ⊥ = k := by
    induction k with
    | zero => simp
    | succ k ih => rw [Function.iterate_succ_apply', ih]; change (k : ℕ∞) + 1 = ((k+1 : ℕ) : ℕ∞); exact (ENat.natCast_add k 1).symm
  rw [hk, hlfp]
  exact ENat.natCast_ne_top k

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

/-! ### `selection_mono`, `extensive_demand_mono`

A selection admitted at every demand up to 5 meets `kleeneStep_upperClosure`'s hypothesis,
whatever it places. Admitted only at demand 3 (no `hok`), it is not admitted at the smaller demand
0, and the hypothesis fails. Two consumers' summed demand grows with either of them. -/

example : ∀ ⦃s s' x : ℕ⦄, s ≤ s' → (∃ σ : Bool, s' ≤ 5 ∧ (if σ then 2 else 1) = x) →
    ∃ y ≤ x, ∃ σ : Bool, s ≤ 5 ∧ (if σ then 2 else 1) = y :=
  selection_mono (fun σ : Bool => if σ then 2 else 1) fun _ _ _ h h' => h.trans h'

example : ¬ ∀ ⦃s s' x : ℕ⦄, s ≤ s' → (∃ _ : Unit, s' = 3 ∧ (2 : ℕ) = x) →
    ∃ y ≤ x, ∃ _ : Unit, s = 3 ∧ (2 : ℕ) = y := fun h => by
  obtain ⟨_, _, _, h0, _⟩ := h (Nat.zero_le 3) ⟨(), rfl, rfl⟩
  exact absurd h0 (by decide)

example (d : Fin 2 → ℝ) : ∑ i, d i ≤ ∑ i, (d i + 1) :=
  extensive_demand_mono _ fun _ _ => le_add_of_nonneg_right zero_le_one

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

/-! ## Abstraction maps

### `typed_map`

`d3` (wire 0 → 1, box 2 a spare output) maps onto two coarse boxes: boxes 0 and 2 to coarse box
0, box 1 to coarse box 1. Under the coarse typing that gives coarse box 0 an output and coarse
box 1 an input, the image is typed and keeps its wire. A coarse typing without that output
(`ho` fails) or that input (`hi` fails) gives an untyped image, and so does an untyped detailed
diagram (`h` fails) whose wire starts at box 1, which has no output, though `ho` and `hi` hold. -/

/-- Boxes 0 and 2 map to coarse box 0, box 1 to coarse box 1. -/
abbrev coarse2 (b : Fin 3) : Fin 2 := if b = 1 then 1 else 0

/-- Coarse typing: box 0 has an output, box 1 an input. -/
abbrev outC (b : Fin 2) (_ : Unit) : Option Unit := if b = 0 then some () else none
abbrev inpC (b : Fin 2) (_ : Unit) : Option Unit := if b = 1 then some () else none

theorem d3_ho : ∀ b p c, d3.out b p = some c → outC (coarse2 b) p = some (id c) := by decide
theorem d3_hi : ∀ b p c, d3.inp b p = some c → inpC (coarse2 b) p = some (id c) := by decide

example : (d3.map coarse2 (fun _ p => p) id outC inpC).Typed ∧
    () ∈ (d3.map coarse2 (fun _ p => p) id outC inpC).wires :=
  ⟨d3.typed_map d3_typed d3_ho d3_hi, by simp [Wiring.map, d3]⟩

example : ¬ (d3.map coarse2 (fun _ p => p) id (fun _ _ => none) inpC).Typed := by
  intro h
  have := (h () (by simp [Wiring.map, d3])).2.2.1
  simp [Wiring.map] at this

example : ¬ (d3.map coarse2 (fun _ p => p) id outC (fun _ _ => none)).Typed := by
  intro h
  have := (h () (by simp [Wiring.map, d3])).2.2.2
  simp [Wiring.map] at this

/-- `d3` with its wire starting at box 1, which has no output: untyped. -/
def d3from1 : Wiring (Fin 3) Unit Unit Unit := { d3 with src := fun _ => (1, ()) }

example : ¬ d3from1.Typed ∧ (∀ b p c, d3from1.out b p = some c → outC (coarse2 b) p = some (id c)) ∧
    ¬ (d3from1.map coarse2 (fun _ p => p) id outC inpC).Typed := by
  refine ⟨fun h => ?_, d3_ho, fun h => ?_⟩
  · have := (h () (by simp [d3from1, d3])).2.2.1
    simp [d3from1, d3] at this
  · have := (h () (by simp [Wiring.map, d3from1, d3])).2.2.1
    simp [Wiring.map, d3from1, d3] at this

/-! ### `reach_map`, `cycle_map`

The chain 0 → 1 → 2 maps onto one coarse function 0 → 1 when boxes 0 and 1 merge: the function
0 → 1 stays inside coarse box 0 and 1 → 2 maps to the coarse function, so `h` holds and the path
0 →* 2 has an image path. Against a coarse model with no functions, `h` fails and there is none.

The ring 0 → 1 → 2 → 0 maps onto the coarse loop 0 → 1 → 0 the same way, and the coarse
function 0 → 1, the image of 1 → 2, lies on a coarse cycle because 2 reaches 1 in the ring.
Mapping the chain instead, where 2 reaches nothing (`hback` fails), onto the single coarse
function gives no coarse cycle; neither does mapping the ring onto it, where the function 2 → 0
has no image (`h` fails). -/

/-- The chain 0 → 1 → 2: wire `false` runs 0 → 1, wire `true` 1 → 2. -/
def chain3 : Wiring (Fin 3) Unit Bool Unit where
  boxes := Set.univ
  wires := Set.univ
  src w := (if w then 1 else 0, ())
  tgt w := (if w then 2 else 1, ())
  carrier _ := ()
  out _ _ := some ()
  inp _ _ := some ()

/-- The ring 0 → 1 → 2 → 0: wire `i` runs `i → i + 1`. -/
def ring3 : Wiring (Fin 3) Unit (Fin 3) Unit where
  boxes := Set.univ
  wires := Set.univ
  src w := (w, ())
  tgt w := (w + 1, ())
  carrier _ := ()
  out _ _ := some ()
  inp _ _ := some ()

/-- One coarse function, 0 → 1. -/
def edge2 : Wiring (Fin 2) Unit Unit Unit where
  boxes := Set.univ
  wires := Set.univ
  src _ := (0, ())
  tgt _ := (1, ())
  carrier _ := ()
  out _ _ := some ()
  inp _ _ := some ()

/-- The coarse loop 0 → 1 → 0: wire `false` runs 0 → 1, wire `true` 1 → 0. -/
def loop2 : Wiring (Fin 2) Unit Bool Unit where
  boxes := Set.univ
  wires := Set.univ
  src w := (if w then 1 else 0, ())
  tgt w := (if w then 0 else 1, ())
  carrier _ := ()
  out _ _ := some ()
  inp _ _ := some ()

theorem chain3_maps : ∀ a b, chain3.Acts a b → merge01 a = merge01 b ∨ edge2.Acts (merge01 a) (merge01 b) := by
  rintro a b ⟨w, -, rfl, rfl⟩
  cases w
  · exact Or.inl (by decide)
  · exact Or.inr ⟨(), Set.mem_univ _, by decide, by decide⟩

theorem ring3_maps : ∀ a b, ring3.Acts a b → merge01 a = merge01 b ∨ loop2.Acts (merge01 a) (merge01 b) := by
  rintro a b ⟨w, -, rfl, rfl⟩
  fin_cases w
  · exact Or.inl (by decide)
  · exact Or.inr ⟨false, Set.mem_univ _, by decide, by decide⟩
  · exact Or.inr ⟨true, Set.mem_univ _, by decide, by decide⟩

theorem chain3_0_2 : Relation.ReflTransGen chain3.Acts 0 2 :=
  (Relation.ReflTransGen.single (show chain3.Acts 0 1 from ⟨false, Set.mem_univ _, by decide, by decide⟩)).tail
    (show chain3.Acts 1 2 from ⟨true, Set.mem_univ _, by decide, by decide⟩)

theorem ring3_2_1 : Relation.ReflTransGen ring3.Acts 2 1 :=
  (Relation.ReflTransGen.single (show ring3.Acts 2 0 from ⟨2, Set.mem_univ _, by decide, by decide⟩)).tail
    (show ring3.Acts 0 1 from ⟨0, Set.mem_univ _, by decide, by decide⟩)

/-- The single coarse function closes no cycle. -/
theorem edge2_acyclic : ¬ Relation.TransGen edge2.Acts 0 0 := by
  intro h
  obtain ⟨_, -, w, -, -, ht⟩ := Relation.TransGen.tail'_iff.mp h
  cases w
  exact absurd ht (by decide)

example : Relation.ReflTransGen edge2.Acts (merge01 0) (merge01 2) :=
  chain3.reach_map merge01 chain3_maps chain3_0_2

/-- `edge2` without its function. -/
def none2 : Wiring (Fin 2) Unit Unit Unit := { edge2 with wires := ∅ }

example : ¬ (∀ a b, chain3.Acts a b → merge01 a = merge01 b ∨ none2.Acts (merge01 a) (merge01 b)) ∧
    ¬ Relation.ReflTransGen none2.Acts (merge01 0) (merge01 2) := by
  refine ⟨fun h => ?_, fun h => ?_⟩
  · rcases h 1 2 ⟨true, Set.mem_univ _, by decide, by decide⟩ with h | ⟨_, hw, _⟩
    · exact absurd h (by decide)
    · exact hw
  · have := (Relation.reflTransGen_iff_eq (fun _ ⟨_, hw, _⟩ => hw)).mp h
    exact absurd this (by decide)

example : Relation.TransGen loop2.Acts (merge01 1) (merge01 1) :=
  ring3.cycle_map merge01 ring3_maps (w' := false) (Set.mem_univ _) (by decide) (by decide) ring3_2_1

example : ¬ Relation.ReflTransGen chain3.Acts 2 1 ∧ ¬ Relation.TransGen edge2.Acts (merge01 1) (merge01 1) := by
  refine ⟨fun h => ?_, edge2_acyclic⟩
  have := (Relation.reflTransGen_iff_eq (fun b ⟨w, _, hs, _⟩ => by
    cases w <;> exact absurd hs (by decide))).mp h
  exact absurd this (by decide)

example : ¬ (∀ a b, ring3.Acts a b → merge01 a = merge01 b ∨ edge2.Acts (merge01 a) (merge01 b)) := by
  intro h
  rcases h 2 0 ⟨2, Set.mem_univ _, by decide, by decide⟩ with h | ⟨w, -, hs, -⟩
  · exact absurd h (by decide)
  · cases w
    exact absurd hs (by decide)

/-! ## Levels

### `level_monotone`, `level_band`, `level_gc`

Thresholds 0 and 20 on two values: 25 reads as the upper value and 5 as the lower, each amount
lies in its value's band, and the reading is a Galois connection. Thresholds 0, 20, 10 do not
increase (`ht` fails): 15 reads as the top value without reaching the middle one's threshold, so
the Galois connection fails, though the reading stays monotone (`level_monotone` has no
hypotheses) and every amount still lies in its band. Thresholds 5 and 20 do not start at the least
amount (`h0` fails): 3 reaches no threshold, reads as the bottom value anyway, and lies outside
its band, so both `level_band` and the Galois connection fail. -/

abbrev t2 : Fin 2 → ℕ := ![0, 20]
abbrev t3 : Fin 3 → ℕ := ![0, 20, 10]
abbrev t5 : Fin 2 → ℕ := ![5, 20]

example : level t2 25 = 1 ∧ level t2 5 = 0 := by decide

example : GaloisConnection t2 (level t2) ∧ (t2 (level t2 5) ≤ 5 ∧ ∀ w, level t2 5 < w → 5 < t2 w) :=
  ⟨level_gc (by decide) rfl, level_band rfl 5⟩

example : level t3 15 = 2 ∧ ¬ GaloisConnection t3 (level t3) ∧ level t3 9 ≤ level t3 15 := by
  refine ⟨by decide, fun h => ?_, level_monotone t3 (by decide)⟩
  have := (h 1 15).mpr (by decide)
  exact absurd this (by decide)

example : ¬ (t5 (level t5 3) ≤ 3) ∧ ¬ GaloisConnection t5 (level t5) := by
  refine ⟨by decide, fun h => ?_⟩
  have := (h 0 3).mpr bot_le
  exact absurd this (by decide)

/-! ## Port classes: `WireClasses.Ok`, `eq_root`, `admitted_ssubset`

Three ports and one function, from port 0 to port 1; port 2 is unwired. The witness with classes
`{0, 1}` and `{2}` checks, and `eq_root` then reads port 1 at port 0. One that also puts port 2 in
the first class fails the check, and it must: a valuation every function respects takes two values
in that class, so no valuation of the classes gives it. `admitted_ssubset` holds on a relation that
admits everything against one that admits nothing, and without `h'` (one relation against itself)
the strict inclusion fails. -/

def goodClasses : WireClasses (Fin 3) (Fin 1) (Fin 2) := ⟨![0, 0, 1], ![0, 2], ![none, some 0, none], ![0, 1, 0]⟩
def joinedClasses : WireClasses (Fin 3) (Fin 1) (Fin 1) := ⟨![0, 0, 0], ![0], ![none, some 0, none], ![0, 1, 0]⟩

example : goodClasses.Ok ![0] ![1] ∧ ¬ joinedClasses.Ok ![0] ![1] := by decide

example (v : Fin 3 → Bool) (hv : ∀ w, v (![0] w) = v (![1] w)) : v 1 = v 0 :=
  WireClasses.eq_root (q := goodClasses) (by decide) hv 1

example : (∀ w, (![true, true, false] : Fin 3 → Bool) (![0] w) = ![true, true, false] (![1] w)) ∧
    ¬ ∃ c : Fin 1 → Bool, ∀ x, (![true, true, false] : Fin 3 → Bool) x = c (joinedClasses.cls x) := by
  decide

example : admitted (fun _ : Bool => True) (fun _ _ : Bool => False) ⊂
    admitted (fun _ : Bool => True) (fun u y : Bool => y = u) :=
  admitted_ssubset (by decide) (by decide)

example : ¬ admitted (fun _ : Bool => True) (fun u y : Bool => y = u) ⊂
    admitted (fun _ : Bool => True) (fun u y : Bool => y = u) :=
  lt_irrefl _

/-! ## Generic opposed witnesses -/
example :
    ¬ AtLeastAsWeak (· = true) (fun u y : Bool => y = u) (fun u y => y = !u) ∧
      ¬ AtLeastAsWeak (· = true) (fun u y : Bool => y = !u) (fun u y => y = u) :=
  incomparable_of_witnesses (u := true) (v := false)
    (by decide) (by decide) (by decide) (by decide)

end CategoricalTriz.Witnesses
