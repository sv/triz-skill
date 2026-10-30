import Semantics

/-!
# Non-vacuity witnesses for the compositional semantics

For each theorem of `Semantics`, a concrete diagram over `Bool` on which its hypotheses hold and
its external relation relates something, so the theorem is not vacuous. For each hypothesis of
`external_glueAlong`, `external_feedbackAlong`, and `external_mono`, a counterexample: drop it,
and the conclusion fails. For `holeContext_preservesUnions`, a counterexample to what it assumes
of the hole, that it occurs once: the same relation in two holes does not preserve unions. For
`external_sub_iff_of_extends`, a part that relates strictly more than the whole, because a
downstream box rules a steady state out. The diagrams are generic; the loops are the identity and negation loops
of `tests/act-behavior.test.ts`.
-/

namespace CategoricalTriz.SemanticsWitnesses

open CategoricalTriz CategoricalTriz.Semantics CategoricalTriz.Semantics.OpenDiagram CategoryTheory

/-- One box relating its input port (`false`) to its output port (`true`) by `r`, over `Bool`. -/
def boxOf (r : Bool → Bool → Prop) : OpenDiagram Bool Unit Unit where
  Port := Bool
  Box := Unit
  Wire := Empty
  values _ := Set.univ
  behavior _ := {s | r (s false) (s true)}
  src w := w.elim
  tgt w := w.elim
  input _ := false
  output _ := true

theorem external_boxOf (r : Bool → Bool → Prop) (x y : Unit → Bool) :
    (boxOf r).external x y ↔ r (x ()) (y ()) := by
  constructor
  · rintro ⟨s, ⟨-, hb, -⟩, rfl, rfl⟩
    exact hb ()
  · intro h
    refine ⟨fun b : Bool => cond b (y ()) (x ()), ⟨fun _ => trivial, fun _ => h, fun w => w.elim⟩, ?_, ?_⟩
    · funext u
      rfl
    · funext u
      rfl

/-- Copy and negate. -/
abbrev copy : Bool → Bool → Prop := fun a b => b = a
abbrev negate : Bool → Bool → Prop := fun a b => b = !a

/-! ## `external_glueAlong`, `external_seq`

Copy, then negate, glued by one cross wire from the copy's output port to the negation's input
port: the interface is fully exposed, and the composite negates. -/

/-- The one cross wire joining the copy's output (`true`) to the negation's input (`false`). -/
def interfaceWire : Unit → (boxOf copy).Port × (boxOf negate).Port := fun _ => (true, false)

example : (glueAlong (boxOf copy) (boxOf negate) interfaceWire).external (fun _ => true) (fun _ => false) := by
  rw [external_glueAlong (c := interfaceWire) (fun _ => ⟨(), rfl⟩) fun _ => ⟨(), rfl⟩]
  exact ⟨fun _ => true, (external_boxOf _ _ _).mpr rfl, (external_boxOf _ _ _).mpr rfl⟩

example : (seq (boxOf copy) (boxOf negate)).external (fun _ => true) (fun _ => false) := by
  rw [external_seq]
  exact ⟨fun _ => true, (external_boxOf _ _ _).mpr rfl, (external_boxOf _ _ _).mpr rfl⟩

/-- A part with no input, an exposed output port `true` it leaves free, and a hidden port `false`
it holds at `false`. -/
def hiddenFalse : OpenDiagram Bool Empty Unit where
  Port := Bool
  Box := Unit
  Wire := Empty
  values _ := Set.univ
  behavior _ := {s | s false = false}
  src w := w.elim
  tgt w := w.elim
  input i := i.elim
  output _ := true

/-- `hc` is needed: a second cross wire joins the hidden port to the copy's output. Every cross
wire but that one is an interface pair, and every interface port is joined (`hj` holds), yet the
glued diagram rules out the output `true`, which the composite of the parts relates. -/
example : ¬ (glueAlong hiddenFalse (boxOf copy)
      (fun k : Bool => cond k ((false : Bool), (true : Bool)) ((true : Bool), (false : Bool)))).external =
    Relation.Comp hiddenFalse.external (boxOf copy).external := by
  intro h
  have hcomp : Relation.Comp hiddenFalse.external (boxOf copy).external (fun i => i.elim) (fun _ => true) :=
    ⟨fun _ => true, ⟨fun b => b, ⟨fun _ => trivial, fun _ => rfl, fun w => w.elim⟩, funext fun i => i.elim, rfl⟩,
      (external_boxOf _ _ _).mpr rfl⟩
  rw [← h] at hcomp
  obtain ⟨s, hs, -, hy⟩ := hcomp
  obtain ⟨h₁, -, hk⟩ := mem_steadyStates_glueAlong.mp hs
  have hidden : s (Sum.inl false) = false := h₁.2.1 ()
  have joined : s (Sum.inl false) = s (Sum.inr true) := hk true
  have out : s (Sum.inr true) = true := congrFun hy ()
  rw [← joined, hidden] at out
  exact Bool.false_ne_true out

/-- A part with no input whose output is held at `true`. -/
def constTrue : OpenDiagram Bool Empty Unit where
  Port := Unit
  Box := Unit
  Wire := Empty
  values _ := Set.univ
  behavior _ := {s | s () = true}
  src w := w.elim
  tgt w := w.elim
  input i := i.elim
  output _ := ()

/-- `hj` is needed: with no cross wire (`hc` holds vacuously), the copy reads any value, so the
glued diagram relates the output `false`, which the composite does not. -/
example : ¬ (glueAlong constTrue (boxOf copy) (Empty.elim : Empty → constTrue.Port × (boxOf copy).Port)).external =
    Relation.Comp constTrue.external (boxOf copy).external := by
  intro h
  have hglued : (glueAlong constTrue (boxOf copy) (Empty.elim : Empty → constTrue.Port × (boxOf copy).Port)).external
      (fun i => i.elim) (fun _ => false) :=
    ⟨Sum.elim (fun _ => true) (fun _ => false),
      mem_steadyStates_glueAlong.mpr ⟨⟨fun _ => trivial, fun _ => rfl, fun w => w.elim⟩,
        ⟨fun _ => trivial, fun _ => rfl, fun w => w.elim⟩, fun k => k.elim⟩,
      funext fun i => i.elim, rfl⟩
  rw [h] at hglued
  obtain ⟨m, ⟨s, ⟨-, hb, -⟩, -, hm⟩, hcopy⟩ := hglued
  have h₁ : m () = true := (congrFun hm ()).symm.trans (hb ())
  have h₂ : false = m () := (external_boxOf _ _ _).mp hcopy
  rw [h₁] at h₂
  exact Bool.false_ne_true h₂

/-! ## `external_par`

Copy beside negate relates `(a, b)` to `(a, !b)`. -/

example : (par (boxOf copy) (boxOf negate)).external (fun _ => true) (Sum.elim (fun _ => true) fun _ => false) :=
  (external_par _ _ _ _).mpr ⟨(external_boxOf _ _ _).mpr rfl, (external_boxOf _ _ _).mpr rfl⟩

/-! ## `external_id`

The identity relates a valuation to itself. -/

example : (OpenDiagram.id (V := Bool) Unit).external (fun _ => true) (fun _ => true) := by
  rw [external_id]

/-! ## `external_feedbackAlong`, `external_feedback`

One box with loop input `0`, loop output `1`, and delivered port `2`, which copies the loop input:
the test suite's loop. Fed back, the identity loop delivers either value; the negation loop has no
steady state. -/

/-- The loop box: `r` from port `0` to port `1`, and port `2` copies port `0`. No external input;
the loop is the right summand `Unit`. -/
def loopBox (r : Bool → Bool → Prop) : OpenDiagram Bool (Empty ⊕ Unit) (Unit ⊕ Unit) where
  Port := Fin 3
  Box := Unit
  Wire := Empty
  values _ := Set.univ
  behavior _ := {s | r (s 0) (s 1) ∧ s 2 = s 0}
  src w := w.elim
  tgt w := w.elim
  input := Sum.elim Empty.elim fun _ => 0
  output := Sum.elim (fun _ => 2) fun _ => 1

/-- The loop wire from loop output `1` back to loop input `0`. -/
def loopWire (r : Bool → Bool → Prop) : Unit → (loopBox r).Port × (loopBox r).Port :=
  fun _ => ((1 : Fin 3), (0 : Fin 3))

theorem openRel_loopBox (r : Bool → Bool → Prop) (v w : Bool) (hr : r v w) :
    (loopBox r).openRel (Empty.elim, fun _ => v) (fun _ => v, fun _ => w) := by
  refine ⟨![v, w, v], ⟨fun _ => trivial, fun _ => ⟨hr, rfl⟩, fun w => w.elim⟩, ?_, ?_⟩
  · funext i
    cases i with
    | inl i => exact i.elim
    | inr _ => rfl
  · funext o
    cases o <;> rfl

theorem feedback_loopBox_iff (r : Bool → Bool → Prop) (x : Empty → Bool) (y : Unit → Bool) :
    (feedbackAlong (loopBox r) (loopWire r)).external x y ↔ r (y ()) (y ()) := by
  rw [external_feedbackAlong (c := loopWire r) (fun _ => ⟨(), rfl⟩) fun _ => ⟨(), rfl⟩]
  constructor
  · rintro ⟨u, s, ⟨-, hb, -⟩, hx, hy⟩
    obtain ⟨hr, h2⟩ := hb ()
    have h0 : s (0 : Fin 3) = u () := congrFun hx (Sum.inr ())
    have h1 : s (1 : Fin 3) = u () := congrFun hy (Sum.inr ())
    have hz : s (2 : Fin 3) = y () := congrFun hy (Sum.inl ())
    rw [h0, h1] at hr
    rw [h0, hz] at h2
    rwa [h2]
  · intro h
    obtain ⟨s, hs, hx, hy⟩ := openRel_loopBox r (y ()) (y ()) h
    refine ⟨fun _ => y (), s, hs, ?_, ?_⟩
    · rw [hx]
      congr 1
      exact funext fun i => i.elim
    · rw [hy]

/-- The identity loop delivers both values: two steady states. -/
example : (feedbackAlong (loopBox copy) (loopWire copy)).external Empty.elim (fun _ => true) ∧
    (feedbackAlong (loopBox copy) (loopWire copy)).external Empty.elim (fun _ => false) :=
  ⟨(feedback_loopBox_iff _ _ _).mpr rfl, (feedback_loopBox_iff _ _ _).mpr rfl⟩

/-- The negation loop has no steady state: its external relation is empty. -/
example (y : Unit → Bool) : ¬ (feedbackAlong (loopBox negate) (loopWire negate)).external Empty.elim y := by
  rw [feedback_loopBox_iff]
  cases h : y () <;> simp

example : (feedback (loopBox copy)).external Empty.elim (fun _ => true) := by
  rw [external_feedback]
  exact ⟨fun _ => true, openRel_loopBox copy true true rfl⟩

/-- The identity loop with a hidden port `3` held at `false`. -/
def loopHidden : OpenDiagram Bool (Empty ⊕ Unit) (Unit ⊕ Unit) where
  Port := Fin 4
  Box := Unit
  Wire := Empty
  values _ := Set.univ
  behavior _ := {s | s 1 = s 0 ∧ s 2 = s 0 ∧ s 3 = false}
  src w := w.elim
  tgt w := w.elim
  input := Sum.elim Empty.elim fun _ => 0
  output := Sum.elim (fun _ => 2) fun _ => 1

/-- `hc` is needed: a second loop wire joins the hidden port to the loop input. Every loop value is
joined (`hu` holds), yet the result delivers only `false`, while the trace delivers `true` too. -/
example : ¬ (feedbackAlong loopHidden fun k : Bool => cond k ((3 : Fin 4), (0 : Fin 4)) ((1 : Fin 4), (0 : Fin 4))).external =
    relTrace loopHidden.openRel := by
  intro h
  have htrace : relTrace loopHidden.openRel Empty.elim (fun _ => true) := by
    refine ⟨fun _ => true, ![true, true, true, false], ⟨fun _ => trivial, fun _ => ⟨rfl, rfl, rfl⟩,
      fun w => w.elim⟩, ?_, ?_⟩
    · funext i
      cases i with
      | inl i => exact i.elim
      | inr _ => rfl
    · funext o
      cases o <;> rfl
  rw [← h] at htrace
  obtain ⟨s, hs, -, hy⟩ := htrace
  obtain ⟨⟨-, hb, -⟩, hk⟩ := mem_steadyStates_feedbackAlong.mp hs
  obtain ⟨-, h2, h3⟩ := hb ()
  have joined : s (3 : Fin 4) = s (0 : Fin 4) := hk true
  have hz : s (2 : Fin 4) = true := congrFun hy ()
  rw [h2, ← joined, h3] at hz
  exact Bool.false_ne_true hz

/-- `hu` is needed: with no loop wire (`hc` holds vacuously), the negation loop's input is free and
it delivers a value, while its trace is empty. -/
example : ¬ (feedbackAlong (loopBox negate) (Empty.elim : Empty → (loopBox negate).Port × (loopBox negate).Port)).external =
    relTrace (loopBox negate).openRel := by
  intro h
  have hopen : (feedbackAlong (loopBox negate) (Empty.elim : Empty → (loopBox negate).Port × (loopBox negate).Port)).external
      Empty.elim (fun _ => true) := by
    obtain ⟨s, hs, hx, hy⟩ := openRel_loopBox negate true false rfl
    refine ⟨s, mem_steadyStates_feedbackAlong.mpr ⟨hs, fun k => k.elim⟩, ?_, ?_⟩
    · funext i
      exact i.elim
    · funext o
      exact congrFun hy (Sum.inl o)
  rw [h] at hopen
  obtain ⟨u, s, ⟨-, hb, -⟩, hx, hy⟩ := hopen
  obtain ⟨hr, -⟩ := hb ()
  have h0 : s (0 : Fin 3) = u () := congrFun hx (Sum.inr ())
  have h1 : s (1 : Fin 3) = u () := congrFun hy (Sum.inr ())
  rw [h0, h1] at hr
  cases hu : u () <;> simp [hu] at hr

/-! ## `external_mono`

Widening the copy box to every valuation strictly widens its relation: it now relates `true` to
`false`. Narrowing, which drops `h`, loses that pair. -/

/-- The copy box's relation, and every valuation. -/
def copyRows : (boxOf copy).Box → Set ((boxOf copy).Port → Bool) := fun _ => {s | s true = s false}
def anyRows : (boxOf copy).Box → Set ((boxOf copy).Port → Bool) := fun _ => Set.univ

theorem anyRows_relates : ((boxOf copy).withBehavior anyRows).external (fun _ => true) (fun _ => false) :=
  ⟨fun b => !b, ⟨fun _ => trivial, fun _ => trivial, fun w => w.elim⟩, rfl, rfl⟩

example : ((boxOf copy).withBehavior copyRows).external ≤ ((boxOf copy).withBehavior anyRows).external ∧
    ¬ ((boxOf copy).withBehavior copyRows).external (fun _ => true) (fun _ => false) := by
  refine ⟨external_mono _ fun _ _ _ => trivial, ?_⟩
  rintro ⟨s, ⟨-, hb, -⟩, hx, hy⟩
  have h₁ : s false = true := congrFun hx ()
  have h₂ : s true = false := congrFun hy ()
  have : s true = s false := hb ()
  rw [h₁, h₂] at this
  exact Bool.false_ne_true this

/-- `h` is needed: narrowing every valuation to the copy loses a related pair. -/
example : ¬ ((boxOf copy).withBehavior anyRows).external ≤ ((boxOf copy).withBehavior copyRows).external := by
  intro hle
  obtain ⟨s, ⟨-, hb, -⟩, hx, hy⟩ := hle _ _ anyRows_relates
  have h₁ : s false = true := congrFun hx ()
  have h₂ : s true = false := congrFun hy ()
  have : s true = s false := hb ()
  rw [h₁, h₂] at this
  exact Bool.false_ne_true this

/-! ## `holeContext_preservesUnions`, `holeContext₂_preservesUnions₂`

A bare diagram, an input port `false` and an output port `true` with no box (`bare`), with the
hole between them: the context is the hole's relation itself, so the copy relation is inside its
own residual and its composite relates `true` to `true`. Three ports in a row (`chain`) take two
holes in series; copy in both relates `true` to `true`. The hole must occur once: the same relation
in both holes of `chain` does not preserve unions. Each row of `{true ↦ false, false ↦ true}` in
both holes relates nothing, the two rows together relate `true` to `true`. -/

/-- An input port `false` and an output port `true`, with no box. -/
def bare : OpenDiagram Bool Unit Unit where
  Port := Bool
  Box := Empty
  Wire := Empty
  values _ := Set.univ
  behavior b := b.elim
  src w := w.elim
  tgt w := w.elim
  input _ := false
  output _ := true

/-- The hole reads the input port and writes the output port. -/
def holeIn : Unit → bare.Port := fun _ => false
def holeOut : Unit → bare.Port := fun _ => true

theorem holeContext_bare (R : SetRel (Unit → Bool) (Unit → Bool)) :
    bare.holeContext holeIn holeOut R = R := by
  ext ⟨x, y⟩
  constructor
  · rintro ⟨s, hs, rfl, rfl⟩
    exact (mem_steadyStates_withHole.mp hs).2
  · intro h
    refine ⟨fun b : Bool => cond b (y ()) (x ()), mem_steadyStates_withHole.mpr
      ⟨⟨fun _ => trivial, fun b => b.elim, fun w => w.elim⟩, h⟩, rfl, rfl⟩

/-- The copy relation on the hole's interface. -/
def copyRel : SetRel (Unit → Bool) (Unit → Bool) := {p | p.2 = p.1}

example : copyRel ⊆ residual (bare.holeContext holeIn holeOut) copyRel ∧
    (fun _ => true, fun _ => true) ∈ bare.holeContext holeIn holeOut copyRel :=
  ⟨(le_residual_iff (holeContext_preservesUnions bare holeIn holeOut)).2 (holeContext_bare _).le,
    (holeContext_bare _).symm ▸ rfl⟩

/-- Three ports in a row, with no box: input `0`, output `2`. -/
def chain : OpenDiagram Bool Unit Unit where
  Port := Fin 3
  Box := Empty
  Wire := Empty
  values _ := Set.univ
  behavior b := b.elim
  src w := w.elim
  tgt w := w.elim
  input _ := 0
  output _ := 2

/-- The first hole runs from port `0` to port `1`, the second from port `1` to port `2`. -/
def chainContext : SetRel (Unit → Bool) (Unit → Bool) → SetRel (Unit → Bool) (Unit → Bool) →
    SetRel (Unit → Bool) (Unit → Bool) :=
  chain.holeContext₂ (fun _ => (0 : Fin 3)) (fun _ => (1 : Fin 3)) (fun _ => (1 : Fin 3))
    (fun _ => (2 : Fin 3))

/-- A valuation of `chain`'s ports is a steady state. -/
theorem chain_steady (s : Fin 3 → Bool) : s ∈ chain.steadyStates :=
  ⟨fun _ => trivial, fun b => b.elim, fun w => w.elim⟩

example : (fun _ => true, fun _ => true) ∈ chainContext copyRel copyRel ∧
    PreservesUnions₂ chainContext :=
  ⟨⟨fun _ => true, mem_steadyStates_withHole.mpr ⟨mem_steadyStates_withHole.mpr
    ⟨chain_steady _, rfl⟩, rfl⟩, rfl, rfl⟩, holeContext₂_preservesUnions₂ _ _ _ _ _⟩

/-- The rows `true ↦ false` and `false ↦ true`. -/
def swapRows : SetRel (Unit → Bool) (Unit → Bool) :=
  {(fun _ => true, fun _ => false), (fun _ => false, fun _ => true)}

/-- The same relation in both holes does not preserve unions. -/
example : ¬ PreservesUnions fun R => chainContext R R := by
  intro h
  have hall : (fun _ => true, fun _ => true) ∈ chainContext swapRows swapRows :=
    ⟨![true, false, true], mem_steadyStates_withHole.mpr ⟨mem_steadyStates_withHole.mpr
      ⟨chain_steady _, Or.inl rfl⟩, Or.inr rfl⟩, rfl, rfl⟩
  have hu := h swapRows
  simp only at hu
  rw [hu, Set.mem_iUnion₂] at hall
  obtain ⟨p, hp, s, hs, -, -⟩ := hall
  obtain ⟨hs, h₂⟩ := mem_steadyStates_withHole.mp hs
  obtain ⟨-, h₁⟩ := mem_steadyStates_withHole.mp hs
  -- Both holes read row `p`, so its input and output are both port `1`'s value.
  have hp' : p.1 () = p.2 () :=
    (congrFun (Prod.ext_iff.mp (Set.mem_singleton_iff.mp h₂)).1 ()).symm.trans
      (congrFun (Prod.ext_iff.mp (Set.mem_singleton_iff.mp h₁)).2 ())
  rcases hp with rfl | rfl <;> exact Bool.noConfusion hp'

/-! ## The category and the functor

Morphisms are diagrams up to the semantics: copy-then-negate, two boxes, is the same morphism as the
one negation box, though their ports differ. The functor sends it to the negation relation. -/

example : Interface.hom (V := Bool) (I := .of Unit) (O := .of Unit) (seq (boxOf copy) (boxOf negate)) =
    Interface.hom (boxOf negate) := by
  rw [Interface.hom_eq_hom_iff, external_seq]
  funext x y
  apply propext
  constructor
  · rintro ⟨m, h₁, h₂⟩
    rw [external_boxOf] at h₁ h₂ ⊢
    rw [h₂, h₁]
  · intro h
    exact ⟨x, (external_boxOf _ _ _).mpr rfl, h⟩

example : ((fun _ => true, fun _ => false) : (Unit → Bool) × (Unit → Bool)) ∈
    ((semantics (V := Bool)).map
      (Interface.hom (I := .of Unit) (O := .of Unit) (boxOf copy) ≫
        Interface.hom (I := .of Unit) (O := .of Unit) (boxOf negate))).rel := by
  rw [Interface.hom_comp, semantics_map, external_seq]
  exact ⟨fun _ => true, (external_boxOf _ _ _).mpr rfl, (external_boxOf _ _ _).mpr rfl⟩

example : ((fun _ => true, Sum.elim (fun _ => true) fun _ => false) : (Unit ⊕ Unit → Bool) × (Unit ⊕ Unit → Bool)) ∈
    ((semantics (V := Bool)).map
      (tensorHom (Interface.hom (I := .of Unit) (O := .of Unit) (boxOf copy))
        (Interface.hom (I := .of Unit) (O := .of Unit) (boxOf negate)))).rel :=
  (semantics_tensorHom _ _ _ _).mpr ⟨(external_boxOf _ _ _).mpr rfl, (external_boxOf _ _ _).mpr rfl⟩

/-! ## Finite row bridge

A copy table has actual steady states, and its row relation agrees with the open-diagram semantics. -/
def copyTable : Rows Unit Bool Bool Empty Bool where
  box _ := ()
  fixes _ _ := true
  val row _ := row
  src w := w.elim
  tgt w := w.elim

example : copyTable.Steady (fun _ => true) :=
  ⟨fun w => w.elim, fun _ => ⟨true, rfl, fun _ _ => rfl⟩⟩

example : (rowsDiagram copyTable (fun _ : Unit => false) (fun _ : Unit => true)).external
    (fun _ => true) (fun _ => true) := by
  exact ((rows_relation_iff_external copyTable (fun _ _ => true)
    (fun _ : Unit => false) (fun _ : Unit => true) (fun _ => true) (fun _ => true)).mp
     ⟨fun _ => rfl, (fun _ => true), ⟨fun w => w.elim, fun _ => ⟨true, rfl, fun _ _ => rfl⟩⟩,
      fun _ _ h => by cases h; rfl, fun _ => rfl⟩).2

/-! ## A part: `external_sub_of_external`, `external_sub_iff_of_extends`, `extends_of_accepts`

A copy whose output (port 1, the deliverable) is wired to a downstream box (port 2) that admits only
`false`. The upstream part is the copy on ports 0 and 1; it drops the wire. The whole relates
`false` to `false`, so the part does (`external_sub_of_external`). The part also relates `true` to
`true`, and the whole relates `true` to nothing: the downstream box rules it out. So the extension
hypothesis of `external_sub_iff_of_extends` is needed, and so is `hrest` of `extends_of_accepts`.
With every box and port kept, the part relates what the whole does (`external_sub_univ`). With a
downstream box that accepts whatever reaches it, both hypotheses of `extends_of_accepts` hold, and
the part's pair `true` to `true` is one the whole relates. -/

/-- Port 0 is the input, port 1 the copy's output and the deliverable, port 2 the downstream box's
input. Box `false` copies, box `true` admits only `false`, and the one wire joins port 1 to 2. -/
abbrev withDownstream : OpenDiagram Bool Unit Unit where
  Port := Fin 3
  Box := Bool
  Wire := Unit
  values _ := Set.univ
  behavior b := cond b {s | s 2 = false} {s | s 1 = s 0}
  src _ := 1
  tgt _ := 2
  input _ := 0
  output _ := 1

/-- The upstream part: ports 0 and 1, and the copy box. -/
abbrev upstream : OpenDiagram Bool Unit Unit :=
  withDownstream.sub {p : Fin 3 | p ≠ 2} {false} (fun _ => ⟨0, by decide⟩) (fun _ => ⟨1, by decide⟩)

/-- The whole relates `false` to `false`, so the part does. -/
example : upstream.external (fun _ => false) (fun _ => false) := by
  have h : withDownstream.external (fun _ => false) (fun _ => false) :=
    ⟨fun _ => false, ⟨fun _ => trivial, fun b => by cases b <;> rfl, fun _ => rfl⟩, rfl, rfl⟩
  exact external_sub_of_external (fI := _root_.id) (fO := _root_.id) (fun _ => rfl) (fun _ => rfl) h

/-- The part relates `true` to `true`, and the whole relates `true` to nothing. -/
example : upstream.external (fun _ => true) (fun _ => true) ∧
    ∀ y, ¬ withDownstream.external (fun _ => true) y := by
  refine ⟨⟨fun _ => true, ⟨fun _ => trivial, fun ⟨b, hb⟩ => ⟨fun _ => true, ?_, rfl⟩,
    fun w => (w.2.2 rfl).elim⟩, rfl, rfl⟩, ?_⟩
  · rw [Set.mem_singleton_iff] at hb
    subst hb
    rfl
  · rintro y ⟨s, ⟨-, hb, hw⟩, hx, -⟩
    have h₀ : s 0 = true := congrFun hx ()
    have h₁ : s 1 = s 0 := hb false
    have h₂ : s 2 = false := hb true
    have h₃ : s 1 = s 2 := hw ()
    rw [h₁, h₀, h₂] at h₃
    exact Bool.noConfusion h₃

/-- Every box and port kept: the part relates `false` to `false`, as the whole does. -/
example : (withDownstream.sub (I' := Unit) (O' := Unit) Set.univ Set.univ (fun _ => ⟨0, trivial⟩)
    (fun _ => ⟨1, trivial⟩)).external (fun _ => false) (fun _ => false) := by
  rw [external_sub_univ]
  exact ⟨fun _ => false, ⟨fun _ => trivial, fun b => by cases b <;> rfl, fun _ => rfl⟩, rfl, rfl⟩

/-- The same copy, its downstream box accepting whatever reaches it. -/
abbrev withAccepting : OpenDiagram Bool Unit Unit where
  Port := Fin 3
  Box := Bool
  Wire := Unit
  values _ := Set.univ
  behavior b := cond b Set.univ {s | s 1 = s 0}
  src _ := 1
  tgt _ := 2
  input _ := 0
  output _ := 1

/-- Its upstream part: ports 0 and 1, and the copy box. -/
abbrev acceptingUpstream : OpenDiagram Bool Unit Unit :=
  withAccepting.sub {p : Fin 3 | p ≠ 2} {false} (fun _ => ⟨0, by decide⟩) (fun _ => ⟨1, by decide⟩)

/-- `extends_of_accepts`: the copy reads only kept ports, and the rest accepts whatever the part
does, so the part's pair `true` to `true` is one the whole relates
(`external_sub_iff_of_extends`). -/
example : withAccepting.external (fun _ => true) (fun _ => true) := by
  have hext : ∀ t ∈ acceptingUpstream.steadyStates, ∃ s ∈ withAccepting.steadyStates,
      s ∘ Subtype.val = t := by
    apply extends_of_accepts
    · intro b hb s s' h hs
      rw [Set.mem_singleton_iff] at hb
      subst hb
      have h₀ : s 0 = s' 0 := congrFun h ⟨0, by decide⟩
      have h₁ : s 1 = s' 1 := congrFun h ⟨1, by decide⟩
      have hs' : s 1 = s 0 := hs
      show s' 1 = s' 0
      rw [← h₀, ← h₁, hs']
    · intro t _
      refine ⟨fun p => if h : p = 2 then t ⟨1, by decide⟩ else t ⟨p, h⟩, ?_, fun _ => trivial,
        fun b hb => ?_, fun _ _ => ?_⟩
      · funext ⟨p, hp⟩
        exact dif_neg hp
      · cases b
        · exact absurd rfl hb
        · trivial
      · show (if h : (1 : Fin 3) = 2 then t ⟨1, by decide⟩ else t ⟨1, h⟩) =
          (if h : (2 : Fin 3) = 2 then t ⟨1, by decide⟩ else t ⟨2, h⟩)
        rw [dif_neg (by decide), dif_pos rfl]
  have hpart : acceptingUpstream.external (fun _ => true) (fun _ => true) := by
    refine ⟨fun _ => true, ⟨fun _ => trivial, fun ⟨b, hb⟩ => ⟨fun _ => true, ?_, rfl⟩,
      fun w => (w.2.2 rfl).elim⟩, rfl, rfl⟩
    rw [Set.mem_singleton_iff] at hb
    subst hb
    rfl
  obtain ⟨x, y, h, hx, hy⟩ := (external_sub_iff_of_extends (fI := _root_.id) (fO := _root_.id)
    (fun _ => rfl) (fun _ => rfl) hext).1 hpart
  have hx' : x = fun _ => true := hx
  have hy' : y = fun _ => true := hy
  subst hx' hy'
  exact h

end CategoricalTriz.SemanticsWitnesses
