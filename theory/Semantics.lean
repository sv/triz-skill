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
- with one box left open as a hole, the external relation preserves unions in the hole's relation
  (`holeContext_preservesUnions`), the hypothesis of the residual lemmas behind the weakest
  specification; with two holes it does so in each (`holeContext₂_preservesUnions₂`);
- a part of a diagram, on some of its boxes and ports, relates at least what the whole relates on
  the part's interface (`external_sub_of_external`), and exactly that when every steady state of
  the part extends to one of the whole (`external_sub_iff_of_extends`);
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
`external` of that upstream part, not of the whole model. The upstream part is a part of the
diagram (`sub`), and the whole model relates no more on the upstream inputs
(`external_sub_of_external`); it can relate less, through a partial downstream box, a downstream
loop, or a downstream port fed by several wires. The two are equal when every box is upstream
(`external_sub_univ`), or when the rest accepts whatever the part does (`extends_of_accepts`). Nothing here needs the diagram
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

/-! ## Explicit bridges for finite certificate row tables

These theorems relate the two Lean representations: the certificates' row tables (`Rows`) and
open diagrams. They do not prove that the TypeScript encoder or evaluator implements either
representation correctly. One-hole and two-hole contexts are in "A box left open" below. -/

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

/-! ## A box left open

The weakest specification fixes every box but one and asks what that box must do. Here the open
box is a hole added to a diagram `d`: a relation `R` from its input ports `pin` to its output
ports `pout` (`withHole`). A kernel box is declared by rows over its own ports (`ofRows`), so a
kernel model with a chosen box is `d` with that box removed and put back as a hole. The context sends `R` to the external relation (`holeContext`), and it preserves
unions (`holeContext_preservesUnions`): a related pair needs exactly one row of the hole. So the
residual lemmas of `CategoricalTriz` hold for the semantics itself. With two holes it preserves
unions in each (`holeContext₂_preservesUnions₂`), the hypothesis of the two-box lemmas. -/

/-- A box declared by a relation from its input ports `pin` to its output ports `pout`: it admits
a valuation iff the pair it reads there is related. -/
def ofRel {Qi Qo P : Type*} (pin : Qi → P) (pout : Qo → P) (R : SetRel (Qi → V) (Qo → V)) :
    Set (P → V) :=
  {s | (s ∘ pin, s ∘ pout) ∈ R}

/-- `d` with one more box, the hole, declared by `R` over the ports `pin` and `pout`. -/
def withHole {Qi Qo : Type*} (d : OpenDiagram V I O) (pin : Qi → d.Port) (pout : Qo → d.Port)
    (R : SetRel (Qi → V) (Qo → V)) : OpenDiagram V I O :=
  { d with Box := Option d.Box, behavior := fun b => b.elim (ofRel pin pout R) d.behavior }

/-- The context of the hole: a relation for it goes to the diagram's external relation. -/
def holeContext {Qi Qo : Type*} (d : OpenDiagram V I O) (pin : Qi → d.Port) (pout : Qo → d.Port)
    (R : SetRel (Qi → V) (Qo → V)) : SetRel (I → V) (O → V) :=
  {p | (d.withHole pin pout R).external p.1 p.2}

/-- A steady state with the hole is a steady state of `d` whose ports at the hole read a row. -/
theorem mem_steadyStates_withHole {Qi Qo : Type*} {d : OpenDiagram V I O} {pin : Qi → d.Port}
    {pout : Qo → d.Port} {R : SetRel (Qi → V) (Qo → V)} {s : d.Port → V} :
    s ∈ (d.withHole pin pout R).steadyStates ↔ s ∈ d.steadyStates ∧ (s ∘ pin, s ∘ pout) ∈ R := by
  change (_ ∧ _ ∧ _) ↔ (_ ∧ _ ∧ _) ∧ _
  simp only [withHole, Option.forall, Option.elim_none, Option.elim_some]
  exact ⟨fun ⟨hv, ⟨hR, hb⟩, hw⟩ => ⟨⟨hv, hb, hw⟩, hR⟩, fun ⟨⟨hv, hb, hw⟩, hR⟩ => ⟨hv, ⟨hR, hb⟩, hw⟩⟩

/-- The semantics preserves unions in the hole: a related pair needs exactly one row of it. So
`le_residual_iff`, `covers_iff_exists_eq`, and the other residual lemmas hold for `external`, for
every diagram and a hole declared by a relation over its own ports, as every kernel box is. -/
theorem holeContext_preservesUnions {Qi Qo : Type*} (d : OpenDiagram V I O) (pin : Qi → d.Port)
    (pout : Qo → d.Port) : PreservesUnions (d.holeContext pin pout) := by
  intro R
  ext ⟨x, y⟩
  simp only [Set.mem_iUnion]
  constructor
  · rintro ⟨s, hs, hx, hy⟩
    obtain ⟨hs, hR⟩ := mem_steadyStates_withHole.mp hs
    exact ⟨_, hR, s, mem_steadyStates_withHole.mpr ⟨hs, rfl⟩, hx, hy⟩
  · rintro ⟨p, hp, s, hs, hx, hy⟩
    obtain ⟨hs, hR⟩ := mem_steadyStates_withHole.mp hs
    exact ⟨s, mem_steadyStates_withHole.mpr ⟨hs, Set.mem_singleton_iff.mp hR ▸ hp⟩, hx, hy⟩

/-- The context of two holes, `R₁` at `pin`, `pout` and `R₂` at `pin'`, `pout'`. -/
def holeContext₂ {Qi Qo Qi' Qo' : Type*} (d : OpenDiagram V I O) (pin : Qi → d.Port)
    (pout : Qo → d.Port) (pin' : Qi' → d.Port) (pout' : Qo' → d.Port)
    (R₁ : SetRel (Qi → V) (Qo → V)) (R₂ : SetRel (Qi' → V) (Qo' → V)) : SetRel (I → V) (O → V) :=
  {p | ((d.withHole pin pout R₁).withHole pin' pout' R₂).external p.1 p.2}

/-- The semantics preserves unions in each of two holes: a related pair needs one row of each. -/
theorem holeContext₂_preservesUnions₂ {Qi Qo Qi' Qo' : Type*} (d : OpenDiagram V I O)
    (pin : Qi → d.Port) (pout : Qo → d.Port) (pin' : Qi' → d.Port) (pout' : Qo' → d.Port) :
    PreservesUnions₂ (d.holeContext₂ pin pout pin' pout') := by
  intro R₁ R₂
  ext ⟨x, y⟩
  simp only [Set.mem_iUnion]
  constructor
  · rintro ⟨s, hs, hx, hy⟩
    obtain ⟨hs, h₂⟩ := mem_steadyStates_withHole.mp hs
    obtain ⟨hs, h₁⟩ := mem_steadyStates_withHole.mp hs
    exact ⟨_, h₁, _, h₂, s, mem_steadyStates_withHole.mpr
      ⟨mem_steadyStates_withHole.mpr ⟨hs, rfl⟩, rfl⟩, hx, hy⟩
  · rintro ⟨p, hp, q, hq, s, hs, hx, hy⟩
    obtain ⟨hs, h₂⟩ := mem_steadyStates_withHole.mp hs
    obtain ⟨hs, h₁⟩ := mem_steadyStates_withHole.mp hs
    exact ⟨s, mem_steadyStates_withHole.mpr ⟨mem_steadyStates_withHole.mpr
      ⟨hs, Set.mem_singleton_iff.mp h₁ ▸ hp⟩, Set.mem_singleton_iff.mp h₂ ▸ hq⟩, hx, hy⟩

/-! ## A part of a diagram

The kernel's default scope composes only the boxes that can reach a deliverable. Here such a part
is a sub-diagram (`sub`): the boxes `B` kept, over the ports `P` kept, with every wire whose two
ends are kept. A wire with one end outside `P` is dropped, so a kept port it fed becomes an open
input of the part, free to take any declared value. A kept box admits a valuation of the kept ports
iff some valuation of all ports it admits reads it there. The part has its own interface among the
kept ports.

Every steady state of the whole diagram restricts to one of the part
(`restrict_mem_steadyStates_sub`). So the whole relates no more on the part's interface: when the
part's inputs and outputs are inputs and outputs of the whole, each pair of the whole, read at them,
is a pair of the part (`external_sub_of_external`). It can relate strictly less, through a box or a
wire outside the part that rules a steady state out (`SemanticsWitnesses`). The two are equal when
every steady state of the part extends to one of the whole (`external_sub_iff_of_extends`). That
holds for the whole diagram taken as its own part (`extends_sub_univ`, `external_sub_univ`), and
when each kept box reads only kept ports and the rest of the diagram accepts whatever the part does
(`extends_of_accepts`): every steady state of the part extends to all ports so that every box
outside it, every wire not inside it, and every port's declared values are met. That is the
assumption the kernel states for its upstream scope. -/

/-- The part of `d` on the ports `P` and the boxes `B`, with its interface `inp` and `out` among
the kept ports. A wire is kept iff both its ends are; a kept box admits the valuations of the kept
ports that some valuation it admits reads there. -/
def sub {I' O' : Type u} (d : OpenDiagram V I O) (P : Set d.Port) (B : Set d.Box) (inp : I' → P)
    (out : O' → P) : OpenDiagram V I' O' where
  Port := P
  Box := B
  Wire := {w : d.Wire // d.src w ∈ P ∧ d.tgt w ∈ P}
  values p := d.values p
  behavior b := (· ∘ Subtype.val) '' d.behavior b
  src w := ⟨d.src w, w.2.1⟩
  tgt w := ⟨d.tgt w, w.2.2⟩
  input := inp
  output := out

variable {I' O' : Type u} {d : OpenDiagram V I O} {P : Set d.Port} {B : Set d.Box} {inp : I' → P}
  {out : O' → P}

/-- Every steady state of the whole diagram restricts to a steady state of the part. -/
theorem restrict_mem_steadyStates_sub {s : d.Port → V} (hs : s ∈ d.steadyStates) :
    s ∘ Subtype.val ∈ (d.sub P B inp out).steadyStates :=
  ⟨fun p => hs.1 p.1, fun b => ⟨s, hs.2.1 b.1, rfl⟩, fun w => hs.2.2 w.1⟩

/-- The whole relates no more on the part's interface: when the part's inputs and outputs are the
whole's inputs `fI` and outputs `fO` (`hI`, `hO`), every pair the whole relates, read there, is a
pair the part relates. -/
theorem external_sub_of_external {fI : I' → I} {fO : O' → O}
    (hI : ∀ i, (inp i : d.Port) = d.input (fI i)) (hO : ∀ o, (out o : d.Port) = d.output (fO o))
    {x : I → V} {y : O → V} (h : d.external x y) : (d.sub P B inp out).external (x ∘ fI) (y ∘ fO) := by
  obtain ⟨s, hs, rfl, rfl⟩ := h
  refine ⟨s ∘ Subtype.val, restrict_mem_steadyStates_sub hs, ?_, ?_⟩
  · funext i
    exact congrArg s (hI i)
  · funext o
    exact congrArg s (hO o)

/-- When every steady state of the part extends to one of the whole, the part relates exactly the
whole's pairs read at the part's interface. -/
theorem external_sub_iff_of_extends {fI : I' → I} {fO : O' → O}
    (hI : ∀ i, (inp i : d.Port) = d.input (fI i)) (hO : ∀ o, (out o : d.Port) = d.output (fO o))
    (hext : ∀ t ∈ (d.sub P B inp out).steadyStates, ∃ s ∈ d.steadyStates, s ∘ Subtype.val = t)
    {x' : I' → V} {y' : O' → V} :
    (d.sub P B inp out).external x' y' ↔ ∃ x y, d.external x y ∧ x ∘ fI = x' ∧ y ∘ fO = y' := by
  constructor
  · rintro ⟨t, ht, rfl, rfl⟩
    obtain ⟨s, hs, rfl⟩ := hext t ht
    refine ⟨s ∘ d.input, s ∘ d.output, ⟨s, hs, rfl, rfl⟩, ?_, ?_⟩
    · funext i
      exact congrArg s (hI i).symm
    · funext o
      exact congrArg s (hO o).symm
  · rintro ⟨x, y, h, rfl, rfl⟩
    exact external_sub_of_external hI hO h

/-- The whole diagram taken as its own part: every steady state of the part extends. -/
theorem extends_sub_univ {inp : I' → (Set.univ : Set d.Port)} {out : O' → (Set.univ : Set d.Port)} :
    ∀ t ∈ (d.sub Set.univ Set.univ inp out).steadyStates, ∃ s ∈ d.steadyStates,
      s ∘ Subtype.val = t := by
  rintro t ⟨hv, hb, hw⟩
  refine ⟨fun p => t ⟨p, trivial⟩, ⟨fun p => hv ⟨p, trivial⟩, fun b => ?_,
    fun w => hw ⟨w, trivial, trivial⟩⟩, rfl⟩
  obtain ⟨s', hs', he⟩ := hb ⟨b, trivial⟩
  have : s' = fun p => t ⟨p, trivial⟩ := funext fun p => congrFun he ⟨p, trivial⟩
  exact this ▸ hs'

/-- The whole diagram taken as its own part has the whole's relation. -/
theorem external_sub_univ :
    (d.sub Set.univ Set.univ (fun i => ⟨d.input i, trivial⟩) (fun o => ⟨d.output o, trivial⟩)).external =
      d.external := by
  funext x y
  apply propext
  rw [external_sub_iff_of_extends (fI := _root_.id) (fO := _root_.id) (fun _ => rfl) (fun _ => rfl)
    extends_sub_univ]
  exact ⟨fun ⟨_, _, h, hx, hy⟩ => hx ▸ hy ▸ h, fun h => ⟨x, y, h, rfl, rfl⟩⟩

/-- When each kept box reads only kept ports (`hloc`), and every steady state of the part extends
to all ports so that each box outside it, each wire not inside it, and each port's declared values
are met (`hrest`: the rest accepts whatever the part does), every steady state of the part extends
to one of the whole. -/
theorem extends_of_accepts
    (hloc : ∀ b ∈ B, ∀ s s' : d.Port → V, s ∘ Subtype.val = s' ∘ (Subtype.val : P → d.Port) →
      s ∈ d.behavior b → s' ∈ d.behavior b)
    (hrest : ∀ t ∈ (d.sub P B inp out).steadyStates, ∃ s : d.Port → V, s ∘ Subtype.val = t ∧
      (∀ p, s p ∈ d.values p) ∧ (∀ b ∉ B, s ∈ d.behavior b) ∧
        ∀ w, ¬ (d.src w ∈ P ∧ d.tgt w ∈ P) → s (d.src w) = s (d.tgt w)) :
    ∀ t ∈ (d.sub P B inp out).steadyStates, ∃ s ∈ d.steadyStates, s ∘ Subtype.val = t := by
  intro t ht
  obtain ⟨s, rfl, hv, hout, hw⟩ := hrest t ht
  refine ⟨s, ⟨hv, fun b => ?_, fun w => ?_⟩, rfl⟩
  · by_cases hb : b ∈ B
    · obtain ⟨s', hs', he⟩ := ht.2.1 ⟨b, hb⟩
      exact hloc b hb s' s he hs'
    · exact hout b hb
  · by_cases hP : d.src w ∈ P ∧ d.tgt w ∈ P
    · exact ht.2.2 ⟨w, hP⟩
    · exact hw w hP

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
