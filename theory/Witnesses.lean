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

/-! ## Behaviour

Reserved for the witnesses of the behaviour lemmas, added with them. -/

end CategoricalTriz.Witnesses
