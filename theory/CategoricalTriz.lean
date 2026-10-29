import Mathlib.Algebra.Order.BigOperators.Group.Finset
import Mathlib.Algebra.Order.Pi
import Mathlib.CategoryTheory.ComposableArrows.Basic
import Mathlib.CategoryTheory.Functor.Currying
import Mathlib.CategoryTheory.Subfunctor.Basic
import Mathlib.Data.Real.Basic
import Mathlib.Data.Fin.VecNotation
import Mathlib.Data.Fintype.Prod
import Mathlib.Data.Set.Prod
import Mathlib.Logic.Equiv.Basic
import Mathlib.Logic.Relation
import Mathlib.Order.BooleanAlgebra.Basic
import Mathlib.Order.Comparable

/-!
# Categorical TRIZ: the statements behind the kernel's checks

Each section states, over Mathlib, the fact that one check in `src/act*.ts` relies on. This is
not a formal model of TRIZ: it pins down what the deterministic checks decide and why they are
sound. See `skills/triz-innovation/references/categorical-model.md`.

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
extraction; a single `checkModel` verdict can also be certified (see Certificates below). -/

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

/-- Every diagram is supported on all boxes. -/
theorem restrict_univ : d.restrict Set.univ = d := by
  simp only [restrict, Set.inter_univ, Set.mem_univ, and_self, and_true, Set.setOf_mem_eq]

/-- A typed diagram whose boxes lie in `A` is its own restriction to `A`. Typing is needed: an
untyped wire may leave the boxes, and restriction drops it. -/
theorem restrict_eq_self {A : Set B} (h : d.Typed) (hA : d.boxes ⊆ A) : d.restrict A = d := by
  simp only [restrict, Set.inter_eq_left.mpr hA]
  congr 1
  ext w
  exact ⟨fun hw => hw.1, fun hw => ⟨hw, hA (h w hw).1, hA (h w hw).2.1⟩⟩

/-! ### Rewrites along the level axis (the 9 windows' time steps)

A rewrite step deletes boxes `del` and wires `cut`, then glues boxes `new` and wires `add`, as
`rewrite` in `src/act-rewrite.ts`. Restriction commutes with every such step once the step is
restricted too: its additions outside `A` or across `A`'s boundary are dropped. No hypothesis is
needed. When its additions lie inside `A`, the step applies to the subsystem verbatim.

Wires here have fixed endpoints, so a step never moves one. The kernel encodes a wire re-added
under the same id with new endpoints, or a box re-added with new ports, as a deleted element and
a glued one: its ids are labels, not elements. -/

/-- A rewrite step's data. -/
structure Rule (B W : Type*) where
  del : Set B
  cut : Set W
  new : Set B
  add : Set W

/-- Delete, then glue. -/
def rewrite (r : Rule B W) : Wiring B P W C := (d.delete r.del r.cut).glue r.new r.add

/-- The part of a step inside `A`: boxes in `A`, and wires with both ends in `A`. -/
def restrictRule (r : Rule B W) (A : Set B) : Rule B W where
  del := r.del ∩ A
  cut := {w | w ∈ r.cut ∧ (d.src w).1 ∈ A ∧ (d.tgt w).1 ∈ A}
  new := r.new ∩ A
  add := {w | w ∈ r.add ∧ (d.src w).1 ∈ A ∧ (d.tgt w).1 ∈ A}

theorem restrict_delete (D : Set B) (E : Set W) (A : Set B) :
    (d.delete D E).restrict A = (d.restrict A).delete D E := by
  simp only [restrict, delete, mk.injEq, and_true]
  constructor
  · ext b
    simp only [Set.mem_inter_iff, Set.mem_sdiff]
    tauto
  · ext w
    simp only [Set.mem_setOf_eq, Set.mem_sdiff]
    tauto

theorem restrict_glue (N : Set B) (F : Set W) (A : Set B) :
    (d.glue N F).restrict A =
      (d.restrict A).glue (N ∩ A) {w | w ∈ F ∧ (d.src w).1 ∈ A ∧ (d.tgt w).1 ∈ A} := by
  simp only [restrict, glue, mk.injEq, and_true]
  constructor
  · exact Set.union_inter_distrib_right _ _ _
  · ext w
    simp only [Set.mem_setOf_eq, Set.mem_union]
    tauto

/-- The commuting square: restricting after a step is stepping the restriction by the step's
part inside `A`. -/
theorem restrict_rewrite (r : Rule B W) (A : Set B) :
    (d.rewrite r).restrict A = (d.restrict A).rewrite (d.restrictRule r A) := by
  simp only [rewrite, restrictRule, delete, glue, restrict, mk.injEq, and_true]
  constructor
  · ext b
    simp only [Set.mem_union, Set.mem_sdiff, Set.mem_inter_iff]
    tauto
  · ext w
    simp only [Set.mem_union, Set.mem_sdiff, Set.mem_setOf_eq]
    tauto

/-- A step whose additions lie inside `A` applies verbatim to the subsystem. -/
theorem restrict_rewrite_of_inside {r : Rule B W} {A : Set B} (hN : r.new ⊆ A)
    (hF : ∀ w ∈ r.add, (d.src w).1 ∈ A ∧ (d.tgt w).1 ∈ A) :
    (d.rewrite r).restrict A = (d.restrict A).rewrite r := by
  simp only [rewrite, restrict_glue, restrict_delete, Set.inter_eq_left.mpr hN]
  congr 2
  ext w
  exact ⟨fun hw => hw.1, fun hw => ⟨hw, hF w hw⟩⟩

/-- Wires with exactly one end in `A`: the subsystem view's boundary. -/
def boundary (A : Set B) : Set W := {w | w ∈ d.wires ∧ ¬((d.src w).1 ∈ A ↔ (d.tgt w).1 ∈ A)}

/-- A step changes the boundary by the boundary wires it cuts and the crossing wires it adds. -/
theorem boundary_rewrite (r : Rule B W) (A : Set B) :
    (d.rewrite r).boundary A =
      d.boundary A \ r.cut ∪ {w | w ∈ r.add ∧ ¬((d.src w).1 ∈ A ↔ (d.tgt w).1 ∈ A)} := by
  ext w
  simp only [boundary, rewrite, glue, delete, Set.mem_setOf_eq, Set.mem_union, Set.mem_sdiff]
  tauto

/-- Box `a` acts on box `b`: some wire runs from `a` to `b`. `harmLoops` searches this graph. -/
def Acts (a b : B) : Prop := ∃ w ∈ d.wires, (d.src w).1 = a ∧ (d.tgt w).1 = b

end Wiring

/-! ## The level axis as a presheaf, and the restriction rows over time as a functor

The box subsets form a poset, hence a category (Mathlib's `Preorder.smallCategory`). Restriction
makes diagrams a presheaf on it: `supportedOn` sends `A` to the diagrams that `restrict A`
fixes, and `A' ⊆ A` to `restrict A'`. Typed diagrams form a sub-presheaf, `typedOn`. A rewrite
step acts on every level as "rewrite, then restrict back", and `restrict_rewrite` makes that
natural in the level. Two steps (past → present → future) then give a functor from the time
chain `Fin 3` times the opposite subset poset to sets. It holds the 9 windows' subsystem rows
(restriction to `A`) and system row (restriction to all boxes, `restrict_univ`) with their
transitions. The supersystem row is a collapse, a quotient rather than a restriction, and is not
part of it.

Typing is not part of that functor along time. A step keeps typing only under its no-dangling and
typed-gluing conditions (`typed_delete`, `typed_glue`), which hold for one diagram, not for all;
the kernel checks them on the model it is given. No Grothendieck construction is built here. -/

section Presheaf

open CategoryTheory Opposite

universe uB uP uW uC

variable (B : Type uB) (P : Type uP) (W : Type uW) (C : Type uC)

/-- The level axis: diagrams supported on `A` (fixed by `restrict A`), restricted along `A' ⊆ A`. -/
def Wiring.supportedOn : (Set B)ᵒᵖ ⥤ Type (max uB uP uW uC) where
  obj A := {d : Wiring B P W C // d.restrict A.unop = d}
  map {_ A'} _ := TypeCat.ofHom fun d =>
    ⟨d.1.restrict A'.unop, by rw [Wiring.restrict_restrict, Set.inter_self]⟩
  map_id _ := by
    ext d
    exact d.2
  map_comp _ g := by
    ext d
    exact (d.1.restrict_of_subset g.unop.le).symm

/-- Restriction keeps typing, so typed diagrams form a sub-presheaf. -/
def Wiring.typedOn : Subfunctor (Wiring.supportedOn B P W C) where
  obj _ := {d | d.1.Typed}
  map _ d h := d.1.typed_restrict h _

/-- A typed diagram is supported on `A` exactly when its boxes lie in `A`. -/
theorem Wiring.supported_iff_of_typed {d : Wiring B P W C} (h : d.Typed) {A : Set B} :
    d.restrict A = d ↔ d.boxes ⊆ A := by
  refine ⟨fun hA => ?_, d.restrict_eq_self h⟩
  rw [← hA]
  exact Set.inter_subset_right

variable {B P W C}

/-- A rewrite step on every level: rewrite, then restrict back to the level. -/
def Wiring.rewriteOn (r : Wiring.Rule B W) :
    Wiring.supportedOn B P W C ⟶ Wiring.supportedOn B P W C where
  app A := TypeCat.ofHom fun d =>
    ⟨(d.1.rewrite r).restrict A.unop, by rw [Wiring.restrict_restrict, Set.inter_self]⟩
  naturality A A' f := by
    ext d
    apply Subtype.ext
    change ((d.1.restrict A'.unop).rewrite r).restrict A'.unop =
      ((d.1.rewrite r).restrict A.unop).restrict A'.unop
    rw [Wiring.restrict_of_subset _ f.unop.le, Wiring.restrict_rewrite, Wiring.restrict_rewrite,
      Wiring.restrict_restrict, Set.inter_self]
    rfl

/-- On level `A` the step is the step's part inside `A` (`restrict_rewrite`). -/
theorem Wiring.rewriteOn_app (r : Wiring.Rule B W) (A : (Set B)ᵒᵖ)
    (d : (Wiring.supportedOn B P W C).obj A) :
    ((Wiring.rewriteOn r).app A d).1 = d.1.rewrite (d.1.restrictRule r A.unop) := by
  change (d.1.rewrite r).restrict A.unop = _
  rw [Wiring.restrict_rewrite, d.2]

/-- The restriction rows of the 9 windows over time: past → present → future by steps `r₁` and
`r₂` along `Fin 3`, and restriction along the opposite subset poset. -/
def Wiring.restrictionGrid (r₁ r₂ : Wiring.Rule B W) : Fin 3 × (Set B)ᵒᵖ ⥤ Type (max uB uP uW uC) :=
  Functor.uncurry.obj
    (ComposableArrows.mk₂ (Wiring.rewriteOn (P := P) (C := C) r₁) (Wiring.rewriteOn r₂))

end Presheaf

/-! ## Certificates

`triz_export` format `lean` writes one model's verdicts as a Lean file that imports this one.
The file encodes the model as finite tables and states each verdict about them in the terms
above: `Wiring.Typed`, `Wiring.Acts` with `edge_on_cycle`, and `IsSection` with
`exists_section_iff`, `glue_of_disjoint_regions`, `no_section_of_overlap`. Lean checks each
verdict for that one instance; nothing is extracted. The vocabulary those files share is here,
so a certificate defines data, not meaning. -/

section Certificates

/-- The set a Bool table picks out: how a certificate writes a region or a set of values. -/
def ofTable {α : Type*} (t : α → Bool) : Set α := {a | t a = true}

instance {α : Type*} (t : α → Bool) : DecidablePred (· ∈ ofTable t) :=
  fun a => inferInstanceAs (Decidable (t a = true))

/-- A TRIZ function rating, as in the model's `polarity`. -/
inductive Rating | useful | insufficient | excessive | harmful
  deriving DecidableEq

/-- Harmful and excessive functions are the ones `harmLoops` reports. -/
def Rating.Negative (r : Rating) : Prop := r = .harmful ∨ r = .excessive

instance : DecidablePred Rating.Negative := fun _ => inferInstanceAs (Decidable (_ ∨ _))

end Certificates

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

/-! ## Declared behaviour (`externalBehavior`, `trimPreservesBehavior`)

A box that declares behaviour is a relation from input values to output values. Wiring boxes in
series composes their relations. A feedback wire takes the relational trace: `x` and `y` are
related iff some loop value `u` is consistent. This is steady-state semantics, not dynamics. The
kernel computes the composite of a finite model by a backtracking join. Series wiring is
Mathlib's `Relation.Comp` (some middle value links the two relations), which can be bracketed
either way (`Relation.comp_assoc`, which verdicts cite). The statements below add that series
composition is monotone, that adding rows never removes a steady state, and they pin down the
trace on the loops the tests check. The TypeScript evaluator is checked against them by tests,
not by extraction.

For a model that declares behaviour, `trimPreservesBehavior` decides whether a trim keeps the
input→deliverable relation equal to the baseline's. Its verdict depends on the absorber chosen,
not only on the boxes trimmed, so no statement about what remains after deleting the trimmed
boxes can stand for it. -/

section Behaviour

variable {α β γ δ υ : Type*}

/-- Series composition can be bracketed either way: Mathlib's lemma, which verdicts cite. -/
example (R : α → β → Prop) (S : β → γ → Prop) (T : γ → δ → Prop) :
    Relation.Comp (Relation.Comp R S) T = Relation.Comp R (Relation.Comp S T) := Relation.comp_assoc

/-- Feedback on the second component: some loop value is consistent (the relational trace). -/
def relTrace (R : α × υ → β × υ → Prop) : α → β → Prop := fun a b => ∃ u, R (a, u) (b, u)

/-- More admissible rows in either box never remove a series-composed pair. -/
theorem relation_comp_mono {R R' : α → β → Prop} {S S' : β → γ → Prop} (hR : R ≤ R') (hS : S ≤ S') :
    Relation.Comp R S ≤ Relation.Comp R' S' :=
  fun a c ⟨b, hab, hbc⟩ => ⟨b, hR a b hab, hS b c hbc⟩

/-- More admissible rows never remove a steady state. -/
theorem relTrace_mono {R R' : α × υ → β × υ → Prop} (h : R ≤ R') : relTrace R ≤ relTrace R' :=
  fun _ _ ⟨u, hu⟩ => ⟨u, h _ _ hu⟩

/-- Yanking: feeding a value back through a swap gives the identity relation. -/
theorem relTrace_swap : relTrace (fun (p q : α × α) => q = (p.2, p.1)) = fun a b => a = b := by
  funext a b
  apply propext
  constructor
  · rintro ⟨u, hu⟩
    simp only [Prod.mk.injEq] at hu
    exact hu.2.symm.trans hu.1.symm
  · rintro rfl
    exact ⟨a, rfl⟩

/-- The loop values consistent at `(a, b)`: the steady states the trace ranges over.
`relTrace R a b` is, by definition, `(loopStates R a b).Nonempty`. -/
def loopStates (R : α × υ → β × υ → Prop) (a : α) (b : β) : Set υ := {u | R (a, u) (b, u)}

/-- An identity self-loop is consistent at every loop value (the tests' identity loop). -/
theorem loopStates_id : loopStates (fun (p q : PUnit × υ) => q = p) PUnit.unit PUnit.unit = Set.univ :=
  Set.eq_univ_of_forall fun _ => rfl

/-- A loop that negates its value has no steady state: the trace is empty (the tests' negation loop). -/
theorem relTrace_not_loop : ¬ relTrace (fun (p q : PUnit × Bool) => q.2 = !p.2) PUnit.unit PUnit.unit := by
  rintro ⟨u, hu⟩
  cases u <;> simp at hu

end Behaviour

end CategoricalTriz
