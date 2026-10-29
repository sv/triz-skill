import Mathlib.Algebra.Order.BigOperators.Group.Finset
import Mathlib.Algebra.Order.Pi
import Mathlib.CategoryTheory.Functor.KanExtension.Basic
import Mathlib.Data.Real.Basic
import Mathlib.Data.Fin.VecNotation
import Mathlib.Data.Set.Prod
import Mathlib.Logic.Equiv.Basic
import Mathlib.Logic.Relation
import Mathlib.Order.BooleanAlgebra.Basic
import Mathlib.Order.Comparable

/-!
# Categorical TRIZ: the statements behind the kernel's checks

Each section states, over Mathlib, the fact that one check in `src/act*.ts` relies on. This is
not a formal model of TRIZ: it pins down what the deterministic checks decide and why they are
sound, and names the one statement (trimming as a Kan extension) the kernel does *not* decide.
See `skills/triz-innovation/references/categorical-model.md`.

No `sorry`: `lake build --wfail` in `theory/` checks every proof and fails on any `sorry`.
-/

namespace CategoricalTriz

/-! ## Separation as gluing (`separationCheck`)

A physical contradiction gives demands `i`, each admitting a set `values i` of parameter values
on a region `support i` of a base of cells (space × time × condition × level). -/

section Gluing

variable {Cell V ι : Type*} (support : ι → Set Cell) (values : ι → Set V)

/-- Values admissible at a cell: those every demand active there allows. -/
def admissible (c : Cell) : Set V := {v | ∀ i, c ∈ support i → v ∈ values i}

/-- A parameter assignment over the whole base that meets every demand where it applies. -/
def IsSection (s : Cell → V) : Prop := ∀ i c, c ∈ support i → s c ∈ values i

/-- The demands can be met piecewise iff every cell's active demands share a value. On a
discrete base gluing is cellwise, so `separationCheck` decides it by scanning cells. -/
theorem exists_section_iff :
    (∃ s, IsSection support values s) ↔ ∀ c, (admissible support values c).Nonempty := by
  constructor
  · rintro ⟨s, hs⟩ c
    exact ⟨s c, fun i hc => hs i c hc⟩
  · intro h
    choose s hs using h
    exact ⟨s, fun i c hc => hs c i hc⟩

end Gluing

section Pair

variable {Cell V : Type*} {d₁ d₂ : Set Cell} {A B : Set V}

/-- Separated demands glue: disjoint regions admit a piecewise assignment, whatever the values. -/
theorem glue_of_disjoint_regions (hA : A.Nonempty) (hB : B.Nonempty) (hd : Disjoint d₁ d₂) :
    ∃ s : Cell → V, (∀ c ∈ d₁, s c ∈ A) ∧ (∀ c ∈ d₂, s c ∈ B) := by
  classical
  refine ⟨fun c => if c ∈ d₁ then hA.some else hB.some, fun c hc => ?_, fun c hc => ?_⟩
  · simp [hc, hA.some_mem]
  · have : c ∉ d₁ := fun h => Set.disjoint_left.mp hd h hc
    simp [this, hB.some_mem]

/-- Irreducible demands do not: opposing values on a shared cell admit no assignment. -/
theorem no_section_of_overlap (hv : Disjoint A B) {c : Cell} (h₁ : c ∈ d₁) (h₂ : c ∈ d₂) :
    ¬ ∃ s : Cell → V, (∀ c ∈ d₁, s c ∈ A) ∧ (∀ c ∈ d₂, s c ∈ B) := by
  rintro ⟨s, hs₁, hs₂⟩
  exact Set.disjoint_left.mp hv (hs₁ c h₁) (hs₂ c h₂)

/-- Product regions are disjoint iff they are disjoint on some axis: the kernel's
`separatingAxes` (applied axis by axis, as Mathlib's `Set.disjoint_prod`). -/
theorem separated_iff_axis {α β : Type*} {s₁ s₂ : Set α} {t₁ t₂ : Set β} :
    Disjoint (s₁ ×ˢ t₁) (s₂ ×ˢ t₂) ↔ Disjoint s₁ s₂ ∨ Disjoint t₁ t₂ :=
  Set.disjoint_prod

end Pair

/-! ## Separation on condition

In a Boolean algebra of requirements, any requirement `P` splits into disjoint parts under a
condition `C` and its complement. -/

section Condition

variable {α : Type*} [BooleanAlgebra α]

theorem separation_on_condition (P C : α) :
    P ⊓ C ⊔ P ⊓ Cᶜ = P ∧ Disjoint (P ⊓ C) (P ⊓ Cᶜ) :=
  ⟨sup_inf_inf_compl, disjoint_compl_right.mono inf_le_right inf_le_right⟩

end Condition

/-! ## Harm loops (`harmLoops`)

A function `u → v` lies on a closed loop iff `v` reaches back to `u`. So every function inside a
strongly connected region lies on a cycle, which is why the kernel searches strongly connected
components and builds each witness as `u, v, …, u`. -/

section Loops

variable {β : Type*} {r : β → β → Prop}

theorem edge_on_cycle {u v : β} (huv : r u v) (hvu : Relation.ReflTransGen r v u) :
    Relation.TransGen r u u :=
  Relation.TransGen.head' huv hvu

/-- Reachability passes to a quotient: when every edge maps to an edge or into one class, every
path maps to a path. `merge` (Principle 5) is such a quotient of the boxes; it can close new
loops, which is why the kernel lists them. -/
theorem reach_quotient {γ : Type*} {s : γ → γ → Prop} (q : β → γ)
    (h : ∀ a b, r a b → q a = q b ∨ s (q a) (q b)) {u v : β} (huv : Relation.ReflTransGen r u v) :
    Relation.ReflTransGen s (q u) (q v) := by
  induction huv with
  | refl => exact .refl
  | tail _ hbc ih =>
    rcases h _ _ hbc with heq | hs
    · exact heq ▸ ih
    · exact ih.tail hs

end Loops

/-! ## Label blindness

The kernel's verdicts read only the wiring shape. For harm loops this is the fact that a closed
loop survives transport along any relabelling of the boxes. The tests check every verdict of the
TypeScript kernel under random relabellings; this states the abstract fact behind the loop one. -/

section Relabel

theorem transGen_equiv {β γ : Type*} (e : β ≃ γ) {r : β → β → Prop} {u v : β} :
    Relation.TransGen r u v ↔ Relation.TransGen (fun a b => r (e.symm a) (e.symm b)) (e u) (e v) := by
  constructor
  · intro h
    induction h with
    | single hab => exact .single (by simpa using hab)
    | tail _ hbc ih => exact ih.tail (by simpa using hbc)
  · have back : ∀ x y, Relation.TransGen (fun a b => r (e.symm a) (e.symm b)) x y →
        Relation.TransGen r (e.symm x) (e.symm y) := by
      intro x y hxy
      induction hxy with
      | single hab => exact .single hab
      | tail _ hbc ih => exact ih.tail hbc
    simpa using back (e u) (e v)

end Relabel

/-! ## Wiring typing and rewriting (`checkModel`, `rewrite`, `restrict`)

A wiring diagram: boxes and wires drawn from types `B` and `W`. Each wire has a source and a
target `(box, port)`, and a carrier. `out b p = some c` says box `b` has an output port `p` of
carrier `c`; `inp` does the same for input ports. `Typed` is `checkModel`'s condition. The
statements below say that typing does not depend on labels, and that the rewrite steps the
constructions are built from keep it. The TypeScript is checked against them by tests, not by
extraction. -/

structure Wiring (B P W C : Type*) where
  boxes : Set B
  wires : Set W
  src : W → B × P
  tgt : W → B × P
  carrier : W → C
  out : B → P → Option C
  inp : B → P → Option C

namespace Wiring

variable {B P W C : Type*} (d : Wiring B P W C)

/-- Every wire runs from an output port to an input port of present boxes, and both ports carry
the wire's carrier. -/
def Typed : Prop :=
  ∀ w ∈ d.wires, (d.src w).1 ∈ d.boxes ∧ (d.tgt w).1 ∈ d.boxes ∧
    d.out (d.src w).1 (d.src w).2 = some (d.carrier w) ∧
    d.inp (d.tgt w).1 (d.tgt w).2 = some (d.carrier w)

/-- Relabel boxes, ports (per box), wires, and carriers along bijections. -/
def rename {B' P' W' C' : Type*} (eB : B ≃ B') (eP : B → P ≃ P') (eW : W ≃ W') (eC : C ≃ C') :
    Wiring B' P' W' C' where
  boxes := eB.symm ⁻¹' d.boxes
  wires := eW.symm ⁻¹' d.wires
  src w := (eB (d.src (eW.symm w)).1, eP (d.src (eW.symm w)).1 (d.src (eW.symm w)).2)
  tgt w := (eB (d.tgt (eW.symm w)).1, eP (d.tgt (eW.symm w)).1 (d.tgt (eW.symm w)).2)
  carrier w := eC (d.carrier (eW.symm w))
  out b p := (d.out (eB.symm b) ((eP (eB.symm b)).symm p)).map eC
  inp b p := (d.inp (eB.symm b) ((eP (eB.symm b)).symm p)).map eC

/-- Typing is label-blind: it holds after relabelling exactly when it held before. -/
theorem typed_rename {B' P' W' C' : Type*} (eB : B ≃ B') (eP : B → P ≃ P') (eW : W ≃ W')
    (eC : C ≃ C') : (d.rename eB eP eW eC).Typed ↔ d.Typed := by
  have key : ∀ (o : Option C) (c : C), o.map eC = some (eC c) ↔ o = some c := fun o c => by
    rw [← Option.map_some, (Option.map_injective eC.injective).eq_iff]
  constructor
  · intro h w hw
    have := h (eW w) (by simpa [rename] using hw)
    simpa [rename, key] using this
  · intro h w hw
    have := h (eW.symm w) hw
    simpa [rename, key] using this

/-- The deletion half of a rewrite: remove boxes `D` and wires `E`. -/
def delete (D : Set B) (E : Set W) : Wiring B P W C :=
  { d with boxes := d.boxes \ D, wires := d.wires \ E }

/-- Under the no-dangling condition (no remaining wire touches a deleted box), deletion keeps a
typed diagram typed. -/
theorem typed_delete {D : Set B} {E : Set W} (h : d.Typed)
    (hd : ∀ w ∈ d.wires, w ∉ E → (d.src w).1 ∉ D ∧ (d.tgt w).1 ∉ D) : (d.delete D E).Typed := by
  rintro w ⟨hw, hwE⟩
  obtain ⟨hs, ht, ho, hi⟩ := h w hw
  obtain ⟨hsD, htD⟩ := hd w hw hwE
  exact ⟨⟨hs, hsD⟩, ⟨ht, htD⟩, ho, hi⟩

/-- The gluing half: add boxes `N` and wires `F`. -/
def glue (N : Set B) (F : Set W) : Wiring B P W C :=
  { d with boxes := d.boxes ∪ N, wires := d.wires ∪ F }

/-- Gluing keeps typing when each added wire is typed in the result. -/
theorem typed_glue {N : Set B} {F : Set W} (h : d.Typed)
    (hF : ∀ w ∈ F, (d.src w).1 ∈ d.boxes ∪ N ∧ (d.tgt w).1 ∈ d.boxes ∪ N ∧
      d.out (d.src w).1 (d.src w).2 = some (d.carrier w) ∧
      d.inp (d.tgt w).1 (d.tgt w).2 = some (d.carrier w)) : (d.glue N F).Typed := by
  rintro w (hw | hw)
  · obtain ⟨hs, ht, ho, hi⟩ := h w hw
    exact ⟨Or.inl hs, Or.inl ht, ho, hi⟩
  · exact hF w hw

/-- Re-attach wire `w₀` to output port `q` of box `a` (an applied trim's absorber). -/
def reroute [DecidableEq W] (w₀ : W) (a : B) (q : P) : Wiring B P W C :=
  { d with src := Function.update d.src w₀ (a, q) }

/-- Typing survives the re-attachment when the absorber is present and its port carries the
wire's carrier: the carrier screen of `triz_trim` is exactly what this needs. -/
theorem typed_reroute [DecidableEq W] {w₀ : W} {a : B} {q : P} (h : d.Typed) (ha : a ∈ d.boxes)
    (hq : d.out a q = some (d.carrier w₀)) : (d.reroute w₀ a q).Typed := by
  intro w hw
  obtain ⟨hs, ht, ho, hi⟩ := h w hw
  by_cases hw₀ : w = w₀
  · subst hw₀
    simp only [reroute, Function.update_self]
    exact ⟨ha, ht, hq, hi⟩
  · simp only [reroute, Function.update_of_ne hw₀]
    exact ⟨hs, ht, ho, hi⟩

/-- Re-attach wire `w₀` to input port `q` of box `a`: the other end of `reroute`. -/
def retarget [DecidableEq W] (w₀ : W) (a : B) (q : P) : Wiring B P W C :=
  { d with tgt := Function.update d.tgt w₀ (a, q) }

/-- Typing survives moving a wire's target to a present box whose input port carries the wire's
carrier (`retarget`, Principle 22). -/
theorem typed_retarget [DecidableEq W] {w₀ : W} {a : B} {q : P} (h : d.Typed) (ha : a ∈ d.boxes)
    (hq : d.inp a q = some (d.carrier w₀)) : (d.retarget w₀ a q).Typed := by
  intro w hw
  obtain ⟨hs, ht, ho, hi⟩ := h w hw
  by_cases hw₀ : w = w₀
  · subst hw₀
    simp only [retarget, Function.update_self]
    exact ⟨hs, ha, ho, hq⟩
  · simp only [retarget, Function.update_of_ne hw₀]
    exact ⟨hs, ht, ho, hi⟩

/-- Reversing a wire (`reverse`, Principle 13): its source moves to output `q` of its old target
box and its target to input `p` of its old source box. Typing survives when both ports carry the
wire's carrier. -/
theorem typed_reverse [DecidableEq W] {w₀ : W} {p q : P} (h : d.Typed)
    (hq : d.out (d.tgt w₀).1 q = some (d.carrier w₀))
    (hp : d.inp (d.src w₀).1 p = some (d.carrier w₀)) :
    ((d.reroute w₀ (d.tgt w₀).1 q).retarget w₀ (d.src w₀).1 p).Typed := by
  by_cases hw₀ : w₀ ∈ d.wires
  · obtain ⟨hs, ht, -, -⟩ := h w₀ hw₀
    exact (d.reroute w₀ (d.tgt w₀).1 q).typed_retarget (d.typed_reroute h ht hq) hs hp
  · intro w hw
    have hne : w ≠ w₀ := fun e => hw₀ (e ▸ hw)
    simp only [retarget, reroute, Function.update_of_ne hne]
    exact h w hw

/-- Declaring more ports keeps typing: every port a wire uses keeps its carrier (`reverse` adding
a named port). -/
theorem typed_extend {out' inp' : B → P → Option C}
    (ho : ∀ b p c, d.out b p = some c → out' b p = some c)
    (hi : ∀ b p c, d.inp b p = some c → inp' b p = some c) (h : d.Typed) :
    ({ d with out := out', inp := inp' } : Wiring B P W C).Typed := by
  intro w hw
  obtain ⟨hs, ht, hso, hti⟩ := h w hw
  exact ⟨hs, ht, ho _ _ _ hso, hi _ _ _ hti⟩

/-- The subsystem view on boxes `A`: wires with both ends in `A`. -/
def restrict (A : Set B) : Wiring B P W C :=
  { d with boxes := d.boxes ∩ A, wires := {w | w ∈ d.wires ∧ (d.src w).1 ∈ A ∧ (d.tgt w).1 ∈ A} }

theorem typed_restrict (h : d.Typed) (A : Set B) : (d.restrict A).Typed := by
  rintro w ⟨hw, hsA, htA⟩
  obtain ⟨hs, ht, ho, hi⟩ := h w hw
  exact ⟨⟨hs, hsA⟩, ⟨ht, htA⟩, ho, hi⟩

/-- Restriction composes. -/
theorem restrict_restrict (A A' : Set B) : (d.restrict A).restrict A' = d.restrict (A ∩ A') := by
  simp only [restrict, mk.injEq, Set.inter_assoc, true_and, and_true]
  ext w
  simp only [Set.mem_setOf_eq, Set.mem_inter_iff]
  tauto

/-- Zooming into `A'` inside `A` is zooming into `A'` directly (the property the tests check). -/
theorem restrict_of_subset {A A' : Set B} (hA : A' ⊆ A) : (d.restrict A).restrict A' = d.restrict A' := by
  rw [restrict_restrict, Set.inter_eq_right.mpr hA]

end Wiring

/-! ## Ideality as a componentwise comparison (`idealityProfile`, `compareIdeality`)

Costs are vectors over resource dimensions, ordered componentwise. -/

section Resources

variable {ι D : Type*}

/-- Removing boxes with non-negative cost vectors never raises any cost dimension. -/
theorem trim_lowers_cost (cost : ι → D → ℝ) (hc : ∀ i, 0 ≤ cost i) {kept all : Finset ι}
    (h : kept ⊆ all) : ∑ i ∈ kept, cost i ≤ ∑ i ∈ all, cost i :=
  Finset.sum_le_sum_of_subset_of_nonneg h fun i _ _ => hc i

/-- Replacing one part's cost vector by a componentwise lower one raises no dimension of the
total (`cheap_copy`, Principles 26 and 27). -/
theorem cheaper_part_lowers_cost [DecidableEq ι] (cost : ι → D → ℝ) (s : Finset ι) {i₀ : ι}
    {c : D → ℝ} (hc : c ≤ cost i₀) : ∑ i ∈ s, Function.update cost i₀ c i ≤ ∑ i ∈ s, cost i :=
  Finset.sum_le_sum fun i _ => by
    by_cases hi : i = i₀
    · subst hi
      simpa using hc
    · simp [Function.update_of_ne hi]

/-- A trade-off: two cost vectors neither of which dominates the other (Mathlib's `IncompRel`),
which `compareIdeality` reports as `trade-off`. -/
theorem pareto_incomparable : IncompRel (· ≤ ·) (![0, 1] : Fin 2 → ℝ) ![1, 0] := by
  refine ⟨fun h => ?_, fun h => absurd (h 0) (by simp)⟩
  have := h 1
  simp at this
  exact absurd this (not_le.mpr zero_lt_one)

/-- The componentwise order is not total, so a scalar ideality needs weights the user chooses. -/
theorem pareto_not_total : ¬ ∀ x y : Fin 2 → ℝ, x ≤ y ∨ y ≤ x := fun h =>
  (h ![0, 1] ![1, 0]).elim pareto_incomparable.1 pareto_incomparable.2

end Resources

/-! ## Trimming as a Kan extension (stated, not decided)

Let `ι : J' ⥤ J` include the shape of the trimmed diagram into the original and `D : J ⥤ C` be
the original system. The system is recoverable from what remains when `D` is a left Kan
extension of its restriction `ι ⋙ D` along `ι`, with identity unit. `trimCandidates` does not
decide this: it checks only the carrier-typing condition any such factorization needs. -/

section Trimming

open CategoryTheory

variable {J' J C : Type*} [Category J'] [Category J] [Category C]

/-- `D` is recoverable from its restriction along `ι`. -/
abbrev Recoverable (ι : J' ⥤ J) (D : J ⥤ C) : Prop :=
  D.IsLeftKanExtension (𝟙 (ι ⋙ D))

/-- Sanity check: trimming nothing loses nothing. -/
theorem recoverable_id (D : J ⥤ C) : Recoverable (𝟭 J) D :=
  Functor.isLeftKanExtensionId D

end Trimming

end CategoricalTriz
