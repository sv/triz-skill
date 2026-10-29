import CategoricalTriz
import Mathlib.CategoryTheory.Category.RelCat
import Mathlib.Data.Setoid.Basic
import Mathlib.Logic.Equiv.Prod

/-!
# Compositional semantics of declared behaviour (`externalBehavior`)

`triz_behavior` composes each box's declared finite relation into an external relation from the
boundary inputs to the deliverables. This module defines that semantics for an open diagram and
proves that it is compositional:

- a diagram's steady states are the valuations of all its ports that every box relation, every
  wire equality, and every port's declared values admit (`steadyStates`); its external relation
  is their projection onto the input and output interfaces (`external`);
- gluing two diagrams in series gives the relational composite of their external relations when
  the interface is fully exposed: the cross wires join exactly the matching interface ports
  (`external_glueAlong`). `seq` glues that way by construction (`external_seq`, no hypothesis);
- a disjoint union gives the product relation (`external_par`);
- feeding outputs back to inputs gives the relational trace of the open relation when the loop
  wires join exactly the matching loop ports (`external_feedbackAlong`); `feedback` does so by
  construction (`external_feedback`);
- widening a box's relation widens the external relation (`external_mono`);
- series composition and the identity make open diagrams, identified when their external relations
  agree, a category, with a faithful functor to Mathlib's `RelCat` (`semantics`). The functor laws
  are `external_seq` and `external_id`. Diagrams side by side are sent to the product of relations
  (`semantics_tensorHom`). No monoidal category is built: associators, unitors, and their
  coherence are not stated.

None of these needs a restriction on the diagram: fan-in, fan-out, loops, and partial or
several-valued relations are all covered, since a wire is an equality and a box a set of
valuations.

The kernel's evaluator is not extracted from these definitions. `tests/act-semantics.test.ts`
transcribes `steadyStates` and `external` into a brute-force reference and checks
`externalBehavior` against it.

How the kernel's models read here: ports are the kernel's (box, side, port) triples; a box that
declares `behavior` admits a valuation iff its own ports read one of its rows (`ofRows`); a wire
equates its two ports, so a port on several wires needs them all to agree (fan-in and fan-out need
no special case); `values` are the carriers' declared values. The inputs are the unwired input
ports and the outputs the deliverables. The evaluator composes only the boxes that can reach a
deliverable, with their ports, the deliverables, and the wires into those ports: it computes
`external` of that upstream part, not of the whole model. That the whole model relates no more on
the upstream inputs is tested, not stated here; it can relate less, through a partial downstream
box, a downstream loop, or a downstream port fed by several wires. Nothing here needs the diagram
to be finite; the kernel's diagrams are.
-/

namespace CategoricalTriz.Semantics

open CategoryTheory

universe u

/-- An open diagram with declared relations, from interface `I` to interface `O`, over values `V`.
Each port ranges over its carrier's declared values (`values`); each box admits a set of
valuations of the ports (`behavior`); each wire equates its two ports (`src`, `tgt`). `input` and
`output` name the interface ports. -/
structure OpenDiagram (V I O : Type u) where
  Port : Type u
  Box : Type u
  Wire : Type u
  values : Port → Set V
  behavior : Box → Set (Port → V)
  src : Wire → Port
  tgt : Wire → Port
  input : I → Port
  output : O → Port

variable {V I J O U K : Type u}

namespace OpenDiagram

/-- A box declared by rows over its own ports `ports`: it admits a valuation iff its ports read
one of the rows. Every box of a kernel model is of this form. -/
def ofRows {Q P : Type*} (ports : Q → P) (rows : Set (Q → V)) : Set (P → V) :=
  {s | s ∘ ports ∈ rows}

@[simp]
theorem mem_ofRows {Q P : Type*} {ports : Q → P} {rows : Set (Q → V)} {s : P → V} :
    s ∈ ofRows ports rows ↔ s ∘ ports ∈ rows :=
  Iff.rfl

/-- The steady states: valuations of all ports, each in its carrier's declared values, that every
box relation and every wire admits. -/
def steadyStates (d : OpenDiagram V I O) : Set (d.Port → V) :=
  {s | (∀ p, s p ∈ d.values p) ∧ (∀ b, s ∈ d.behavior b) ∧ ∀ w, s (d.src w) = s (d.tgt w)}

/-- The external relation: the steady states projected onto the inputs and the outputs. `x` and
`y` are related iff some steady state reads `x` at the inputs and `y` at the outputs. -/
def external (d : OpenDiagram V I O) (x : I → V) (y : O → V) : Prop :=
  ∃ s ∈ d.steadyStates, s ∘ d.input = x ∧ s ∘ d.output = y

/-! ## Series -/

/-- Glue `d₁` to `d₂` by cross wires: wire `k` equates port `(c k).1` of `d₁` with port `(c k).2`
of `d₂`. The ports, boxes, and wires are those of both parts; the inputs are `d₁`'s and the
outputs `d₂`'s. -/
def glueAlong (d₁ : OpenDiagram V I J) (d₂ : OpenDiagram V J O) (c : K → d₁.Port × d₂.Port) :
    OpenDiagram V I O where
  Port := d₁.Port ⊕ d₂.Port
  Box := d₁.Box ⊕ d₂.Box
  Wire := d₁.Wire ⊕ d₂.Wire ⊕ K
  values := Sum.elim d₁.values d₂.values
  behavior := Sum.elim (fun b => ofRows Sum.inl (d₁.behavior b)) (fun b => ofRows Sum.inr (d₂.behavior b))
  src := Sum.elim (Sum.inl ∘ d₁.src) (Sum.elim (Sum.inr ∘ d₂.src) fun k => Sum.inl (c k).1)
  tgt := Sum.elim (Sum.inl ∘ d₁.tgt) (Sum.elim (Sum.inr ∘ d₂.tgt) fun k => Sum.inr (c k).2)
  input := Sum.inl ∘ d₁.input
  output := Sum.inr ∘ d₂.output

/-- A steady state of a glued diagram is a steady state of each part that every cross wire
admits. -/
theorem mem_steadyStates_glueAlong {d₁ : OpenDiagram V I J} {d₂ : OpenDiagram V J O}
    {c : K → d₁.Port × d₂.Port} {s : d₁.Port ⊕ d₂.Port → V} :
    s ∈ (glueAlong d₁ d₂ c).steadyStates ↔ s ∘ Sum.inl ∈ d₁.steadyStates ∧
      s ∘ Sum.inr ∈ d₂.steadyStates ∧ ∀ k, s (Sum.inl (c k).1) = s (Sum.inr (c k).2) := by
  change (_ ∧ _ ∧ _) ↔ (_ ∧ _ ∧ _) ∧ (_ ∧ _ ∧ _) ∧ _
  simp only [glueAlong, Sum.forall, Sum.elim_inl, Sum.elim_inr, Function.comp_apply]
  tauto

/-- Series composition (the interface fully exposed): when the cross wires join exactly the
matching interface ports, so that each joins `d₁`'s output `j` to `d₂`'s input `j` for some `j`
(`hc`) and every `j` is joined (`hj`), the glued diagram's external relation is the relational
composite of the parts' (Mathlib's `Relation.Comp`). A cross wire at a port that a part's external
relation hides, or an interface port left unjoined, breaks it (`SemanticsWitnesses`). -/
theorem external_glueAlong {d₁ : OpenDiagram V I J} {d₂ : OpenDiagram V J O}
    {c : K → d₁.Port × d₂.Port} (hc : ∀ k, ∃ j, c k = (d₁.output j, d₂.input j))
    (hj : ∀ j, ∃ k, c k = (d₁.output j, d₂.input j)) :
    (glueAlong d₁ d₂ c).external = Relation.Comp d₁.external d₂.external := by
  funext x z
  apply propext
  constructor
  · rintro ⟨s, hs, rfl, rfl⟩
    obtain ⟨h₁, h₂, hk⟩ := mem_steadyStates_glueAlong.mp hs
    refine ⟨s ∘ Sum.inl ∘ d₁.output, ⟨s ∘ Sum.inl, h₁, rfl, rfl⟩, s ∘ Sum.inr, h₂, ?_, rfl⟩
    funext j
    obtain ⟨k, hk'⟩ := hj j
    have := hk k
    rw [hk'] at this
    exact this.symm
  · rintro ⟨y, ⟨s₁, h₁, rfl, rfl⟩, s₂, h₂, hy, rfl⟩
    refine ⟨Sum.elim s₁ s₂, mem_steadyStates_glueAlong.mpr ⟨h₁, h₂, fun k => ?_⟩, rfl, rfl⟩
    obtain ⟨j, hj'⟩ := hc k
    rw [hj']
    exact (congrFun hy j).symm

/-- Series composition along the matching interface: one cross wire per interface port `j`,
joining `d₁`'s output `j` to `d₂`'s input `j`. -/
def seq (d₁ : OpenDiagram V I J) (d₂ : OpenDiagram V J O) : OpenDiagram V I O :=
  glueAlong d₁ d₂ fun j => (d₁.output j, d₂.input j)

/-- Series composition is the relational composite. -/
theorem external_seq (d₁ : OpenDiagram V I J) (d₂ : OpenDiagram V J O) :
    (seq d₁ d₂).external = Relation.Comp d₁.external d₂.external :=
  external_glueAlong (fun j => ⟨j, rfl⟩) fun j => ⟨j, rfl⟩

/-! ## Identity -/

/-- The identity on interface `I`: its ports are the interface ports, over every value, with no
box and no wire. -/
def id (I : Type u) : OpenDiagram V I I where
  Port := I
  Box := PEmpty
  Wire := PEmpty
  values _ := Set.univ
  behavior b := b.elim
  src w := w.elim
  tgt w := w.elim
  input := _root_.id
  output := _root_.id

/-- The identity diagram relates each valuation to itself only. -/
theorem external_id (I : Type u) : (OpenDiagram.id I : OpenDiagram V I I).external = (· = ·) := by
  funext x y
  apply propext
  constructor
  · rintro ⟨s, -, rfl, rfl⟩
    rfl
  · rintro rfl
    exact ⟨x, ⟨fun _ => trivial, fun b => b.elim, fun w => w.elim⟩, rfl, rfl⟩

/-! ## Parallel -/

/-- The disjoint union of two diagrams: no wire between them, interfaces side by side. -/
def par {I₁ O₁ I₂ O₂ : Type u} (d₁ : OpenDiagram V I₁ O₁) (d₂ : OpenDiagram V I₂ O₂) :
    OpenDiagram V (I₁ ⊕ I₂) (O₁ ⊕ O₂) where
  Port := d₁.Port ⊕ d₂.Port
  Box := d₁.Box ⊕ d₂.Box
  Wire := d₁.Wire ⊕ d₂.Wire
  values := Sum.elim d₁.values d₂.values
  behavior := Sum.elim (fun b => ofRows Sum.inl (d₁.behavior b)) (fun b => ofRows Sum.inr (d₂.behavior b))
  src := Sum.map d₁.src d₂.src
  tgt := Sum.map d₁.tgt d₂.tgt
  input := Sum.map d₁.input d₂.input
  output := Sum.map d₁.output d₂.output

/-- The product of two relations: pairs related componentwise. -/
def relProd {α β γ δ : Type*} (R : α → β → Prop) (S : γ → δ → Prop) : α × γ → β × δ → Prop :=
  fun p q => R p.1 q.1 ∧ S p.2 q.2

theorem mem_steadyStates_par {I₁ O₁ I₂ O₂ : Type u} {d₁ : OpenDiagram V I₁ O₁}
    {d₂ : OpenDiagram V I₂ O₂} {s : d₁.Port ⊕ d₂.Port → V} :
    s ∈ (par d₁ d₂).steadyStates ↔ s ∘ Sum.inl ∈ d₁.steadyStates ∧ s ∘ Sum.inr ∈ d₂.steadyStates := by
  change (_ ∧ _ ∧ _) ↔ (_ ∧ _ ∧ _) ∧ (_ ∧ _ ∧ _)
  simp only [par, Sum.forall, Sum.elim_inl, Sum.elim_inr, Sum.map_inl, Sum.map_inr,
    Function.comp_apply]
  tauto

/-- Parallel composition is the product relation: the disjoint union relates `x` to `y` iff each
part relates its own components. Interface valuations of a sum split as pairs
(`Equiv.sumArrowEquivProdArrow`). -/
theorem external_par {I₁ O₁ I₂ O₂ : Type u} (d₁ : OpenDiagram V I₁ O₁) (d₂ : OpenDiagram V I₂ O₂)
    (x : I₁ ⊕ I₂ → V) (y : O₁ ⊕ O₂ → V) :
    (par d₁ d₂).external x y ↔ relProd d₁.external d₂.external
      (Equiv.sumArrowEquivProdArrow _ _ _ x) (Equiv.sumArrowEquivProdArrow _ _ _ y) := by
  change _ ↔ d₁.external (x ∘ Sum.inl) (y ∘ Sum.inl) ∧ d₂.external (x ∘ Sum.inr) (y ∘ Sum.inr)
  constructor
  · rintro ⟨s, hs, rfl, rfl⟩
    obtain ⟨h₁, h₂⟩ := mem_steadyStates_par.mp hs
    exact ⟨⟨_, h₁, rfl, rfl⟩, ⟨_, h₂, rfl, rfl⟩⟩
  · rintro ⟨⟨s₁, h₁, hx₁, hy₁⟩, ⟨s₂, h₂, hx₂, hy₂⟩⟩
    refine ⟨Sum.elim s₁ s₂, mem_steadyStates_par.mpr ⟨h₁, h₂⟩, ?_, ?_⟩
    · funext i
      cases i with
      | inl i => exact congrFun hx₁ i
      | inr i => exact congrFun hx₂ i
    · funext o
      cases o with
      | inl o => exact congrFun hy₁ o
      | inr o => exact congrFun hy₂ o

/-! ## Feedback -/

/-- Add loop wires to `d`: wire `k` equates port `(c k).1` with port `(c k).2`. The interface keeps
the left summands of `d`'s; the right summands `U` are the loop. -/
def feedbackAlong (d : OpenDiagram V (I ⊕ U) (O ⊕ U)) (c : K → d.Port × d.Port) :
    OpenDiagram V I O where
  Port := d.Port
  Box := d.Box
  Wire := d.Wire ⊕ K
  values := d.values
  behavior := d.behavior
  src := Sum.elim d.src fun k => (c k).1
  tgt := Sum.elim d.tgt fun k => (c k).2
  input := d.input ∘ Sum.inl
  output := d.output ∘ Sum.inl

/-- The open relation of `d`, its loop interface split off: from (input, loop value in) to
(output, loop value out). -/
def openRel (d : OpenDiagram V (I ⊕ U) (O ⊕ U)) : (I → V) × (U → V) → (O → V) × (U → V) → Prop :=
  fun a b => d.external (Sum.elim a.1 a.2) (Sum.elim b.1 b.2)

theorem mem_steadyStates_feedbackAlong {d : OpenDiagram V (I ⊕ U) (O ⊕ U)}
    {c : K → d.Port × d.Port} {s : d.Port → V} :
    s ∈ (feedbackAlong d c).steadyStates ↔ s ∈ d.steadyStates ∧ ∀ k, s (c k).1 = s (c k).2 := by
  change (_ ∧ _ ∧ _) ↔ (_ ∧ _ ∧ _) ∧ _
  simp only [feedbackAlong, Sum.forall, Sum.elim_inl, Sum.elim_inr]
  tauto

/-- Feedback (the loop fully exposed): when the loop wires join exactly each loop output `u` to
loop input `u` (`hc`, `hu`), the external relation is the relational trace of the open relation:
`x` and `y` are related iff some loop value is consistent. A loop wire at a hidden port, or a loop
value left unjoined, breaks it (`SemanticsWitnesses`). -/
theorem external_feedbackAlong {d : OpenDiagram V (I ⊕ U) (O ⊕ U)} {c : K → d.Port × d.Port}
    (hc : ∀ k, ∃ u, c k = (d.output (Sum.inr u), d.input (Sum.inr u)))
    (hu : ∀ u, ∃ k, c k = (d.output (Sum.inr u), d.input (Sum.inr u))) :
    (feedbackAlong d c).external = relTrace d.openRel := by
  funext x y
  apply propext
  constructor
  · rintro ⟨s, hs, rfl, rfl⟩
    obtain ⟨hd, hk⟩ := mem_steadyStates_feedbackAlong.mp hs
    refine ⟨s ∘ d.input ∘ Sum.inr, s, hd, ?_, ?_⟩
    · funext i
      cases i <;> rfl
    · funext o
      cases o with
      | inl o => rfl
      | inr u =>
        obtain ⟨k, hk'⟩ := hu u
        have := hk k
        rw [hk'] at this
        exact this
  · rintro ⟨u, s, hs, hx, hy⟩
    refine ⟨s, mem_steadyStates_feedbackAlong.mpr ⟨hs, fun k => ?_⟩, ?_, ?_⟩
    · obtain ⟨v, hv⟩ := hc k
      rw [hv]
      exact (congrFun hy (Sum.inr v)).trans (congrFun hx (Sum.inr v)).symm
    · funext i
      exact congrFun hx (Sum.inl i)
    · funext o
      exact congrFun hy (Sum.inl o)

/-- Feed every loop output `u` back to loop input `u`, one wire each. -/
def feedback (d : OpenDiagram V (I ⊕ U) (O ⊕ U)) : OpenDiagram V I O :=
  feedbackAlong d fun u : U => (d.output (Sum.inr u), d.input (Sum.inr u))

/-- Feedback is the relational trace of the open relation (`relTrace`, the steady states). -/
theorem external_feedback (d : OpenDiagram V (I ⊕ U) (O ⊕ U)) :
    (feedback d).external = relTrace d.openRel :=
  external_feedbackAlong (fun u => ⟨u, rfl⟩) fun u => ⟨u, rfl⟩

/-! ## Monotonicity -/

/-- The same diagram with box relations `A`. -/
def withBehavior (d : OpenDiagram V I O) (A : d.Box → Set (d.Port → V)) : OpenDiagram V I O :=
  { d with behavior := A }

/-- Widening box relations widens the external relation: more admissible rows never remove a
related pair. Dropping a box's constraint is widening its relation to every valuation. -/
theorem external_mono (d : OpenDiagram V I O) {A A' : d.Box → Set (d.Port → V)}
    (h : ∀ b, A b ⊆ A' b) : (d.withBehavior A).external ≤ (d.withBehavior A').external := by
  rintro x y ⟨s, ⟨hv, hb, hw⟩, hx, hy⟩
  exact ⟨s, ⟨hv, fun b => h b (hb b), hw⟩, hx, hy⟩

/-! ## Explicit bridges for finite certificate row tables and one-hole contexts

These theorems relate the two Lean representations. They do not prove that the TypeScript
encoder or evaluator implements either representation correctly. -/

/-- A row table as an open diagram over the encoded values. -/
def rowsDiagram {Bx Rw Vr Wr : Type u} (t : Rows Bx Rw Vr Wr V)
    (input : I → Vr) (output : O → Vr) : OpenDiagram V I O where
  Port := Vr
  Box := Bx
  Wire := Wr
  values _ := Set.univ
  behavior b := {v | ∃ k, t.box k = b ∧ ∀ x, t.fixes k x = true → v x = t.val k x}
  src := t.src
  tgt := t.tgt
  input := input
  output := output

/-- The certificate steady relation agrees with the open diagram steady states. -/
theorem rows_steady_iff {Bx Rw Vr Wr : Type u} (t : Rows Bx Rw Vr Wr V)
    (input : I → Vr) (output : O → Vr) (v : Vr → V) :
    v ∈ (rowsDiagram t input output).steadyStates ↔ t.Steady v := by
  constructor
  · rintro ⟨_, hb, hw⟩
    exact ⟨hw, hb⟩
  · rintro ⟨hw, hb⟩
    exact ⟨fun _ => trivial, hb, hw⟩

/-- Total interface reads identify Rows.relation with the external relation restricted to the
situation domain. Optional unread inputs require projection, outside this theorem's hypotheses. -/
theorem rows_relation_iff_external {Bx Rw Vr Wr : Type u} (t : Rows Bx Rw Vr Wr V)
    (dom : I → V → Bool) (input : I → Vr) (output : O → Vr) (x : I → V) (y : O → V) :
    t.relation dom (fun i => some (input i)) output x y ↔
      (∀ i, dom i (x i) = true) ∧ (rowsDiagram t input output).external x y := by
  constructor
  · rintro ⟨hd, v, hv, hi, ho⟩
    refine ⟨hd, v, (rows_steady_iff t input output v).mpr hv, ?_, ?_⟩
    · funext i
      exact hi i (input i) rfl
    · funext o
      exact ho o
  · rintro ⟨hd, v, hv, hi, ho⟩
    refine ⟨hd, v, (rows_steady_iff t input output v).mp hv, ?_, ?_⟩
    · intro i p hp
      have h : input i = p := Option.some.inj hp
      rw [← h]
      exact congrFun hi i
    · intro o
      exact congrFun ho o

/-- Replace one box relation, keeping every other constraint fixed. -/
def oneHole (d : OpenDiagram V I O) (hole : d.Box) [DecidableEq d.Box]
    (R : Set (d.Port → V)) : OpenDiagram V I O :=
  d.withBehavior (fun b => if b = hole then R else d.behavior b)

/-- An actual one-hole diagram context preserves arbitrary unions of its hole rows.
The witness valuation uses one row of the hole, including in feedback and fan-in diagrams. -/
theorem external_oneHole_union (d : OpenDiagram V I O) (hole : d.Box) [DecidableEq d.Box]
    (R : Set (d.Port → V)) :
    {p : (I → V) × (O → V) | (d.oneHole hole R).external p.1 p.2} =
      ⋃ v ∈ R, {p : (I → V) × (O → V) | (d.oneHole hole {v}).external p.1 p.2} := by
  ext p
  simp only [Set.mem_setOf_eq, oneHole, withBehavior, external, steadyStates]
  constructor
  · rintro ⟨v, ⟨hv, hb, hw⟩, hi, ho⟩
    have hr : v ∈ R := by
      have h := hb hole
      rw [if_pos rfl] at h
      exact h
    refine Set.mem_iUnion.mpr ⟨v, Set.mem_iUnion.mpr ⟨hr, v, ⟨hv, ?_, hw⟩, hi, ho⟩⟩
    intro b
    by_cases h : b = hole
    · rw [if_pos h]
      exact Set.mem_singleton v
    · rw [if_neg h]
      have h' := hb b
      rw [if_neg h] at h'
      exact h'
  · intro hp
    obtain ⟨v, hv⟩ := Set.mem_iUnion.mp hp
    obtain ⟨hr, s, ⟨hs, hb, hw⟩, hi, ho⟩ := Set.mem_iUnion.mp hv
    refine ⟨s, ⟨hs, ?_, hw⟩, hi, ho⟩
    intro b
    by_cases h : b = hole
    · rw [if_pos h]
      have h' := hb b
      rw [if_pos h] at h'
      exact (Set.mem_singleton_iff.mp h') ▸ hr
    · rw [if_neg h]
      have h' := hb b
      rw [if_neg h] at h'
      exact h'

/-- A one-hole context acting on a local input-output relation. `readIn` and `readOut`
project a global valuation to that hole's local row; the rest of the diagram is fixed. -/
def oneHoleContext {A B : Type u} (d : OpenDiagram V I O) (hole : d.Box) [DecidableEq d.Box]
    (readIn : (d.Port → V) → A) (readOut : (d.Port → V) → B) :
    SetRel A B → SetRel (I → V) (O → V) := fun R =>
  {p | (d.oneHole hole {v | (readIn v, readOut v) ∈ R}).external p.1 p.2}

/-- The concrete one-hole context satisfies the exact union-preservation hypothesis used by
the residual theorems in CategoricalTriz, for arbitrary local input/output projections. -/
theorem oneHoleContext_preservesUnions {A B : Type u} (d : OpenDiagram V I O) (hole : d.Box)
    [DecidableEq d.Box] (readIn : (d.Port → V) → A) (readOut : (d.Port → V) → B) :
    PreservesUnions (d.oneHoleContext hole readIn readOut) := by
  intro R
  ext p
  simp only [Set.mem_setOf_eq, oneHoleContext, oneHole, withBehavior, external, steadyStates]
  constructor
  · rintro ⟨v, ⟨hv, hb, hw⟩, hi, ho⟩
    have hr : (readIn v, readOut v) ∈ R := by
      have h := hb hole
      rw [if_pos rfl] at h
      exact h
    refine Set.mem_iUnion.mpr ⟨(readIn v, readOut v), Set.mem_iUnion.mpr ⟨hr, v, ⟨hv, ?_, hw⟩, hi, ho⟩⟩
    intro b
    by_cases h : b = hole
    · rw [if_pos h]
      exact Set.mem_singleton _
    · rw [if_neg h]
      have h' := hb b
      rw [if_neg h] at h'
      exact h'
  · intro hp
    obtain ⟨q, hq⟩ := Set.mem_iUnion.mp hp
    obtain ⟨hr, v, ⟨hv, hb, hw⟩, hi, ho⟩ := Set.mem_iUnion.mp hq
    refine ⟨v, ⟨hv, ?_, hw⟩, hi, ho⟩
    intro b
    by_cases h : b = hole
    · rw [if_pos h]
      have h' := hb b
      rw [if_pos h] at h'
      change (readIn v, readOut v) ∈ R
      rw [Set.mem_singleton_iff.mp h']
      exact hr
    · rw [if_neg h]
      have h' := hb b
      rw [if_neg h] at h'
      exact h'

end OpenDiagram

/-! ## Open diagrams up to the semantics form a category; the semantics is a functor to `RelCat`

The objects are interfaces. A morphism from `I` to `O` is an open diagram from `I` to `O`, two
diagrams identified when their external relations agree. Composition is `seq` and the identity is
`OpenDiagram.id`; both are well defined on the classes because `external_seq` computes a
composite's relation from its parts'. The functor sends a class to its external relation, so its
laws are `external_seq` and `external_id`, and it is faithful by construction. -/

/-- An interface: the type indexing its ports, over values `V`. -/
structure Interface (V : Type u) where
  of ::
  ports : Type u

open OpenDiagram

/-- Diagrams with the same interfaces are identified when their external relations agree. -/
abbrev semanticSetoid (V I O : Type u) : Setoid (OpenDiagram V I O) :=
  Setoid.ker external

/-- The category of open diagrams up to the semantics. -/
instance category : Category.{u + 1} (Interface.{u} V) where
  Hom I O := Quotient (semanticSetoid V I.ports O.ports)
  id I := ⟦OpenDiagram.id I.ports⟧
  comp f g := Quotient.map₂ seq (fun _ _ h₁ _ _ h₂ => by
    change external _ = external _
    rw [external_seq, external_seq, show external _ = external _ from h₁,
      show external _ = external _ from h₂]) f g
  id_comp := by
    rintro _ _ ⟨d⟩
    exact Quotient.sound (by
      change external _ = external _
      rw [external_seq, external_id, Relation.eq_comp])
  comp_id := by
    rintro _ _ ⟨d⟩
    exact Quotient.sound (by
      change external _ = external _
      rw [external_seq, external_id, Relation.comp_eq])
  assoc := by
    rintro _ _ _ _ ⟨f⟩ ⟨g⟩ ⟨h⟩
    exact Quotient.sound (by
      change external _ = external _
      rw [external_seq, external_seq, external_seq, external_seq, Relation.comp_assoc])

/-- The class of a diagram, as a morphism. -/
def Interface.hom {I O : Interface.{u} V} (d : OpenDiagram V I.ports O.ports) : I ⟶ O := ⟦d⟧

theorem Interface.hom_comp {I J O : Interface.{u} V} (d₁ : OpenDiagram V I.ports J.ports)
    (d₂ : OpenDiagram V J.ports O.ports) : Interface.hom d₁ ≫ Interface.hom d₂ = Interface.hom (seq d₁ d₂) :=
  rfl

/-- Two diagrams are the same morphism iff their external relations agree. -/
theorem Interface.hom_eq_hom_iff {I O : Interface.{u} V} {d d' : OpenDiagram V I.ports O.ports} :
    Interface.hom d = Interface.hom d' ↔ d.external = d'.external :=
  Quotient.eq

/-- A morphism's external relation, read off any diagram in its class. -/
def Interface.external {I O : Interface.{u} V} (f : I ⟶ O) : (I.ports → V) → (O.ports → V) → Prop :=
  Quotient.lift (s := semanticSetoid V I.ports O.ports) OpenDiagram.external (fun _ _ h => h) f

@[simp]
theorem Interface.external_hom {I O : Interface.{u} V} (d : OpenDiagram V I.ports O.ports) :
    Interface.external (Interface.hom d) = d.external :=
  rfl

/-- The semantics: each interface goes to its valuations, each diagram to its external relation.
Functoriality is `external_seq` (composition) and `external_id` (identities). -/
def semantics : Interface.{u} V ⥤ RelCat.{u} where
  obj I := (I.ports → V : Type u)
  map f := .ofRel {p | Interface.external f p.1 p.2}
  map_id I := by
    ext ⟨x, y⟩
    change OpenDiagram.external (OpenDiagram.id I.ports) x y ↔ x = y
    rw [external_id]
  map_comp := by
    rintro _ _ _ ⟨f⟩ ⟨g⟩
    ext ⟨x, z⟩
    change (seq f g).external x z ↔ _
    rw [external_seq]
    rfl

@[simp]
theorem semantics_map {I O : Interface.{u} V} (d : OpenDiagram V I.ports O.ports) (x : I.ports → V)
    (y : O.ports → V) : ((x, y) ∈ ((semantics (V := V)).map (Interface.hom d)).rel) ↔ d.external x y :=
  Iff.rfl

/-- The semantics is faithful: two diagrams are the same morphism iff their external relations
agree. This holds by construction of the morphisms. -/
instance : (semantics (V := V)).Faithful where
  map_injective {I O} f g h := by
    induction f using Quotient.inductionOn
    induction g using Quotient.inductionOn
    apply Quotient.sound
    funext x y
    exact propext (Set.ext_iff.mp congr(($h).rel) (x, y))

/-! ### Side by side

Parallel composition on the classes, and the functor sends it to the product of relations. This is
the monoidal-functor shape for the tensor on objects and morphisms only. -/

/-- Interfaces side by side. -/
abbrev tensorObj (I J : Interface.{u} V) : Interface.{u} V := .of (I.ports ⊕ J.ports)

/-- Diagrams side by side, on the classes. -/
def tensorHom {I₁ O₁ I₂ O₂ : Interface.{u} V} (f : I₁ ⟶ O₁) (g : I₂ ⟶ O₂) :
    tensorObj I₁ I₂ ⟶ tensorObj O₁ O₂ :=
  Quotient.map₂ par (fun a a' ha b b' hb => by
    change external _ = external _
    funext x y
    rw [eq_iff_iff, external_par, external_par, show external _ = external _ from ha,
      show external _ = external _ from hb]) f g

/-- The semantics sends diagrams side by side to the product of their relations: a pair of
valuations of `I₁ ⊕ I₂` and `O₁ ⊕ O₂` is related iff each side's components are. -/
theorem semantics_tensorHom {I₁ O₁ I₂ O₂ : Interface.{u} V} (f : I₁ ⟶ O₁) (g : I₂ ⟶ O₂)
    (x : I₁.ports ⊕ I₂.ports → V) (y : O₁.ports ⊕ O₂.ports → V) :
    (x, y) ∈ ((semantics (V := V)).map (tensorHom f g)).rel ↔
      relProd (Interface.external f) (Interface.external g)
        (Equiv.sumArrowEquivProdArrow _ _ _ x) (Equiv.sumArrowEquivProdArrow _ _ _ y) := by
  induction f using Quotient.inductionOn
  induction g using Quotient.inductionOn
  exact external_par _ _ x y

end CategoricalTriz.Semantics
