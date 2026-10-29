import Mathlib.Algebra.Order.BigOperators.Group.Finset
import Mathlib.Algebra.Order.Pi
import Mathlib.CategoryTheory.ComposableArrows.Basic
import Mathlib.CategoryTheory.Functor.Currying
import Mathlib.CategoryTheory.Subfunctor.Basic
import Mathlib.Data.Real.Basic
import Mathlib.Data.Fin.VecNotation
import Mathlib.Data.Fintype.Pi
import Mathlib.Data.Fintype.Pigeonhole
import Mathlib.Data.Fintype.Prod
import Mathlib.Data.List.Destutter
import Mathlib.Data.Set.Prod
import Mathlib.Logic.Equiv.Basic
import Mathlib.Logic.Relation
import Mathlib.Order.BooleanAlgebra.Basic
import Mathlib.Order.Comparable
import Mathlib.Data.Rel
import Mathlib.Data.Finset.Card
import Mathlib.Order.GaloisConnection.Basic
import Mathlib.Order.FixedPoints
import Mathlib.Order.Iterate
import Mathlib.Order.Concept
import Mathlib.Order.Minimal
import Mathlib.Order.UpperLower.Closure
import Mathlib.Order.UpperLower.CompleteLattice
import Mathlib.Order.UpperLower.Principal

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

/-! ## Flows (`flows`, `triz_flow`, and `merge` along a flow)

A flow is a path of boxes: the order in which a carrier passes them. Its steps are the pairs of
consecutive boxes (`flowStep`). `merge` sends a group `G` of boxes to one box `m` and every other
box to itself (`mergeInto`). The merged flow is the path mapped and with repeats in a row dropped
(`List.destutter`); its steps are the images of the steps whose ends land in different boxes
(`mergedStep`), which tests check against the TypeScript. Two facts hold for any group: the merged
flow names only boxes of the merged model, and a box outside the group that reached another one
along the flow still reaches it. Neither needs the group to be adjacent on the flow, the reading of
Principle 5. Adjacency is what keeps the merge from closing a loop in the flow; `Witnesses` shows a
merge of boxes with a box between them that does. -/

section Flows

variable {β γ : Type*}

/-- Consecutive boxes along a flow path. -/
def flowStep (path : List β) (a b : β) : Prop := ∃ i : ℕ, path[i]? = some a ∧ path[i + 1]? = some b

/-- The steps of a merged flow: the images of steps whose ends land in different boxes. -/
def mergedStep (q : β → γ) (r : β → β → Prop) (x y : γ) : Prop :=
  ∃ a b, r a b ∧ q a = x ∧ q b = y ∧ x ≠ y

/-- The merge map: the group `G` goes to the merged box `m`, every other box to itself. -/
def mergeInto (G : Set β) [DecidablePred (· ∈ G)] (m : β) (b : β) : β := if b ∈ G then m else b

/-- Typing of a merged flow: every box on it is a box of the merged model, the image of the
model's boxes. -/
theorem flow_merge_typed [DecidableEq β] (G : Set β) [DecidablePred (· ∈ G)] (m : β)
    {boxes : Set β} {path : List β} (hp : ∀ b ∈ path, b ∈ boxes) :
    ∀ x ∈ (path.map (mergeInto G m)).destutter (· ≠ ·), x ∈ mergeInto G m '' boxes := by
  intro x hx
  obtain ⟨b, hb, rfl⟩ := List.mem_map.mp ((List.destutter_sublist _ _).subset hx)
  exact ⟨b, hp b hb, rfl⟩

/-- Reachability along a flow between boxes outside the group survives the merge: each step maps
to a step of the merged flow or into the merged box (`reach_quotient`). -/
theorem flow_merge_reach (G : Set β) [DecidablePred (· ∈ G)] (m : β) {r : β → β → Prop} {u v : β}
    (hu : u ∉ G) (hv : v ∉ G) (h : Relation.ReflTransGen r u v) :
    Relation.ReflTransGen (mergedStep (mergeInto G m) r) u v := by
  have e : ∀ {b}, b ∉ G → mergeInto G m b = b := fun hb => if_neg hb
  have := reach_quotient (mergeInto G m) (s := mergedStep (mergeInto G m) r)
    (fun a b hab => by
      by_cases hq : mergeInto G m a = mergeInto G m b
      · exact Or.inl hq
      · exact Or.inr ⟨a, b, hab, rfl, rfl, hq⟩) h
  rwa [e hu, e hv] at this

end Flows

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

/-! ### Double-pushout rule application (`applyRule` in `src/act-rule.ts`)

A rule `L ← K → R` is applied at a match `m : L → G` in two steps. First delete the image of
`L \ K`. Then glue `R` on, its interface `K` along the match and its new boxes, ports, and wires
under fresh ids. Here `R` is already renamed into the host's ids by that comatch, so gluing is
`overlay`: `R`'s wires, boxes, and port carriers, and `d`'s wherever `R` gives none. Lean types
ports by partial maps, so a port the rule deletes keeps its carrier here. Typing is unaffected,
because no surviving wire uses that port: the TypeScript dangling check ensures it. -/

open Classical in
/-- `R` glued over `d`: `R`'s structure where `R` defines it, `d`'s elsewhere. -/
noncomputable def overlay (R : Wiring B P W C) : Wiring B P W C where
  boxes := d.boxes ∪ R.boxes
  wires := d.wires ∪ R.wires
  src w := if w ∈ R.wires then R.src w else d.src w
  tgt w := if w ∈ R.wires then R.tgt w else d.tgt w
  carrier w := if w ∈ R.wires then R.carrier w else d.carrier w
  out b p := (R.out b p).or (d.out b p)
  inp b p := (R.inp b p).or (d.inp b p)

/-- `glue` is the overlay of the added boxes and wires with `d`'s own structure. -/
theorem glue_eq_overlay (N : Set B) (F : Set W) : d.glue N F = d.overlay { d with boxes := N, wires := F } := by
  simp only [glue, overlay, ite_self, Option.or_self]

/-- Gluing a typed `R` keeps typing when `R` gives no port a carrier other than the one `d`
gives it: the comatch maps interface ports to themselves with their carrier, and new ports are
fresh. `R`'s own wires are typed because `R` is. -/
theorem typed_overlay {R : Wiring B P W C} (h : d.Typed) (hR : R.Typed)
    (hout : ∀ b p c c', R.out b p = some c → d.out b p = some c' → c = c')
    (hinp : ∀ b p c c', R.inp b p = some c → d.inp b p = some c' → c = c') :
    (d.overlay R).Typed := by
  have keep : ∀ (o o' : Option C) (c : C), o' = some c → (∀ c₁ c₂, o = some c₁ → o' = some c₂ → c₁ = c₂) →
      o.or o' = some c := by
    rintro (_ | c₁) o' c rfl hc
    · rfl
    · simp [hc c₁ c rfl rfl]
  rintro w (hw | hw)
  · by_cases hwR : w ∈ R.wires
    · obtain ⟨hs, ht, ho, hi⟩ := hR w hwR
      simp only [overlay, if_pos hwR]
      exact ⟨Or.inr hs, Or.inr ht, by simp [ho], by simp [hi]⟩
    · obtain ⟨hs, ht, ho, hi⟩ := h w hw
      simp only [overlay, if_neg hwR]
      exact ⟨Or.inl hs, Or.inl ht, keep _ _ _ ho (hout _ _), keep _ _ _ hi (hinp _ _)⟩
  · obtain ⟨hs, ht, ho, hi⟩ := hR w hw
    simp only [overlay, if_pos hw]
    exact ⟨Or.inr hs, Or.inr ht, by simp [ho], by simp [hi]⟩

/-- A typed rule applied under the no-dangling condition keeps typing. `D` and `E` are the boxes
and wires the match sends `L \ K` to, and `R` is the right-hand side renamed by the comatch.
Only `R`'s typing is needed. The no-identification condition (Bonchi et al. 2022, Prop. 3.17)
is what makes the result a pushout; typing does not depend on it, so it is checked in
TypeScript only. -/
theorem typed_dpo {R : Wiring B P W C} {D : Set B} {E : Set W} (h : d.Typed) (hR : R.Typed)
    (hd : ∀ w ∈ d.wires, w ∉ E → (d.src w).1 ∉ D ∧ (d.tgt w).1 ∉ D)
    (hout : ∀ b p c c', R.out b p = some c → d.out b p = some c' → c = c')
    (hinp : ∀ b p c c', R.inp b p = some c → d.inp b p = some c' → c = c') :
    ((d.delete D E).overlay R).Typed :=
  (d.delete D E).typed_overlay (d.typed_delete h hd) hR hout hinp

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

/-! ### Abstraction maps (`checkAbstraction` in `src/act-abstraction.ts`)

A detailed diagram `d` and a coarse diagram `e` of the same system are linked by a map on boxes
`fB`, a map on each box's ports `fP`, and a map on carriers `fC`. Several detailed boxes may map
to one coarse box, so these are not bijections and `typed_rename` does not apply. The kernel
checks the map on the mapped part of `d`: the boxes it maps, and the functions between ports it
maps. Unmapped boxes are a restriction (`typed_restrict`); a function with an unmapped port is
forgotten, and listed. -/

/-- The image of `d` along an abstraction map: each wire keeps its identity and runs between the
images of its ports, with the image of its carrier; ports are typed by the coarse `out'` and
`inp'`. -/
def map {B' P' C' : Type*} (fB : B → B') (fP : B → P → P') (fC : C → C')
    (out' inp' : B' → P' → Option C') : Wiring B' P' W C' where
  boxes := fB '' d.boxes
  wires := d.wires
  src w := (fB (d.src w).1, fP (d.src w).1 (d.src w).2)
  tgt w := (fB (d.tgt w).1, fP (d.tgt w).1 (d.tgt w).2)
  carrier w := fC (d.carrier w)
  out := out'
  inp := inp'

/-- Typing survives an abstraction map that commutes with port typing: a detailed output (input)
port of carrier `c` maps to a coarse output (input) port of carrier `fC c`. This is the kernel's
`typed` check; the map need not be injective on boxes, ports, or carriers. -/
theorem typed_map {B' P' C' : Type*} {fB : B → B'} {fP : B → P → P'} {fC : C → C'}
    {out' inp' : B' → P' → Option C'} (h : d.Typed)
    (ho : ∀ b p c, d.out b p = some c → out' (fB b) (fP b p) = some (fC c))
    (hi : ∀ b p c, d.inp b p = some c → inp' (fB b) (fP b p) = some (fC c)) :
    (d.map fB fP fC out' inp').Typed := by
  intro w hw
  obtain ⟨hs, ht, hso, hti⟩ := h w hw
  exact ⟨⟨_, hs, rfl⟩, ⟨_, ht, rfl⟩, ho _ _ _ hso, hi _ _ _ hti⟩

/-- Reachability passes along an abstraction map when every function of `d` stays inside one
coarse box or maps to a function of `e`: `reach_quotient` on the box map. -/
theorem reach_map {B' P' W' C' : Type*} {e : Wiring B' P' W' C'} (fB : B → B')
    (h : ∀ a b, d.Acts a b → fB a = fB b ∨ e.Acts (fB a) (fB b)) {u v : B}
    (huv : Relation.ReflTransGen d.Acts u v) : Relation.ReflTransGen e.Acts (fB u) (fB v) :=
  reach_quotient fB h huv

/-- A detailed loop maps to a coarse loop: when a coarse function runs from the image of `a` to
the image of `b`, and `b` reaches `a` in `d`, the image of `a` lies on a cycle of `e`. The kernel
reads a coarse harm loop as the image of a detailed one this way. -/
theorem cycle_map {B' P' W' C' : Type*} {e : Wiring B' P' W' C'} (fB : B → B')
    (h : ∀ a b, d.Acts a b → fB a = fB b ∨ e.Acts (fB a) (fB b)) {a b : B} {w' : W'}
    (hw' : w' ∈ e.wires) (hs : (e.src w').1 = fB a) (ht : (e.tgt w').1 = fB b)
    (hback : Relation.ReflTransGen d.Acts b a) : Relation.TransGen e.Acts (fB a) (fB a) :=
  edge_on_cycle ⟨w', hw', hs, ht⟩ (d.reach_map fB h hback)

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
so a certificate defines data, not meaning. Certificates of dynamics and weakness verdicts read
declared rows through the row tables at the end of this file. -/

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
either way (`Relation.comp_assoc`, which verdicts cite), and which an identity mediator leaves
unchanged (`Relation.comp_eq`, cited too). The statements below add that series composition is
monotone, that adding rows never removes a steady state, and they pin down the trace on the
loops the tests check: semantic sanity lemmas, which no verdict cites. The last three
characterise when a box's relation splits over a segmentation of its ports, which `segment`
cites. The TypeScript evaluator is checked against them by tests, not by extraction.

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

/-- An identity mediator changes nothing: composing a relation with equality gives it back.
Mathlib's lemma, which an interpose result with an identity mediator cites. -/
example (R : α → β → Prop) : Relation.Comp R (· = ·) = R := Relation.comp_eq

/-- A relation over two groups of ports is the product of its two projections iff it is a
product at all. `segment` checks the left side for each part against the rest of the parts: when
it fails, no relations on the two sides compose back to `R`. Mathlib has the inclusion
(`Set.subset_fst_image_prod_snd_image`), not this characterisation. -/
theorem eq_projections_prod_iff (R : Set (α × β)) :
    R = (Prod.fst '' R) ×ˢ (Prod.snd '' R) ↔ ∃ (A : Set α) (B : Set β), R = A ×ˢ B := by
  refine ⟨fun h => ⟨_, _, h⟩, ?_⟩
  rintro ⟨A, B, rfl⟩
  refine Set.Subset.antisymm Set.subset_fst_image_prod_snd_image ?_
  rintro ⟨a, b⟩ ⟨⟨p, hp, rfl⟩, ⟨q, hq, rfl⟩⟩
  exact ⟨hp.1, hq.2⟩

/-- The rectangle condition: a relation over two groups of ports is the product of its two
projections iff, whenever `(a, b)` and `(c, d)` are rows, so is `(a, d)`. `segment` cites it for
both verdicts, one part against the rest: a split, and a coupling, whose witness is a failing
quadruple: rows `(a, b)` and `(c, d)` with `(a, d)` not a row. -/
theorem eq_projections_prod_iff_rectangle (R : Set (α × β)) :
    R = (Prod.fst '' R) ×ˢ (Prod.snd '' R) ↔
      ∀ a b c d, (a, b) ∈ R → (c, d) ∈ R → (a, d) ∈ R := by
  constructor
  · intro h a b c d hab hcd
    rw [h]
    exact ⟨⟨_, hab, rfl⟩, ⟨_, hcd, rfl⟩⟩
  · intro h
    refine Set.Subset.antisymm Set.subset_fst_image_prod_snd_image ?_
    rintro ⟨a, d⟩ ⟨⟨⟨_, b⟩, hab, rfl⟩, ⟨⟨c, _⟩, hcd, rfl⟩⟩
    exact h _ _ _ _ hab hcd

/-- The same over any family of parts: `segment`'s check over all the parts at once. When it
holds, each part's projection is that part's behaviour. -/
theorem eq_projections_pi_iff {ι : Type*} {X : ι → Type*} (R : Set (∀ i, X i)) :
    R = Set.univ.pi (fun i => Function.eval i '' R) ↔ ∃ A : ∀ i, Set (X i), R = Set.univ.pi A := by
  refine ⟨fun h => ⟨_, h⟩, ?_⟩
  rintro ⟨A, rfl⟩
  refine Set.Subset.antisymm (Set.subset_pi_eval_image _ _) fun f hf i _ => ?_
  obtain ⟨g, hg, hgi⟩ := hf i (Set.mem_univ i)
  exact hgi ▸ hg i (Set.mem_univ i)

end Behaviour

/-! ## Weakest box specification (`weakestSpec`): the residual in Rel

Fix every box of a model but one, `m`, and a target relation `T`. The context `C` sends a relation
for `m` to the model's input→deliverable relation. Series composition and the trace preserve
unions in each argument, so a context in which `m` occurs once sends a union of rows to the union
of their composites (`PreservesUnions`; the semantics of `Semantics.lean` is such a context for
every box declared by rows over its own ports, as kernel boxes are, `holeContext_preservesUnions`). Then the rows whose composite stays inside `T` form the
largest relation that keeps the composite inside `T` (`le_residual_iff`, a Galois connection).
Every relation achieving `T` is contained in it, so it commits to the fewest constraints. The
empty relation is always inside (its composite is empty), so staying inside `T` is not enough:
`T` is achievable iff the residual's composite covers `T` (`covers_iff_exists_eq`). The kernel
computes every row's composite in one search, grouping steady states by `m`'s row. That the
grouping computes `external` is tested; nothing is extracted. Two unknown boxes do not split into
two such problems: the residual for one depends on the relation chosen for the other (see
`Two unknown boxes` below). -/

section Residual

variable {α β γ δ υ : Type*} {ι : Sort*}

/-- Series composition preserves unions in its first argument. -/
theorem relation_comp_iSup_left (R : ι → α → β → Prop) (S : β → γ → Prop) :
    Relation.Comp (⨆ i, R i) S = ⨆ i, Relation.Comp (R i) S := by
  funext a c
  simp only [Relation.Comp, iSup_apply, iSup_Prop_eq]
  exact propext ⟨fun ⟨b, ⟨i, h⟩, hs⟩ => ⟨i, b, h, hs⟩, fun ⟨i, b, h, hs⟩ => ⟨b, ⟨i, h⟩, hs⟩⟩

/-- Series composition preserves unions in its second argument. -/
theorem relation_comp_iSup_right (R : α → β → Prop) (S : ι → β → γ → Prop) :
    Relation.Comp R (⨆ i, S i) = ⨆ i, Relation.Comp R (S i) := by
  funext a c
  simp only [Relation.Comp, iSup_apply, iSup_Prop_eq]
  exact propext ⟨fun ⟨b, h, ⟨i, hs⟩⟩ => ⟨i, b, h, hs⟩, fun ⟨i, b, h, hs⟩ => ⟨b, h, ⟨i, hs⟩⟩⟩

/-- The relational trace preserves unions. -/
theorem relTrace_iSup (R : ι → α × υ → β × υ → Prop) : relTrace (⨆ i, R i) = ⨆ i, relTrace (R i) := by
  funext a b
  simp only [relTrace, iSup_apply, iSup_Prop_eq]
  exact propext ⟨fun ⟨u, i, h⟩ => ⟨i, u, h⟩, fun ⟨i, u, h⟩ => ⟨u, i, h⟩⟩

/-- A context sends every relation to the union of its rows' composites. -/
def PreservesUnions (C : SetRel α β → SetRel γ δ) : Prop := ∀ R, C R = ⋃ p ∈ R, C {p}

/-- The weakest specification for the unknown box: every row whose composite stays inside `T`. -/
def residual (C : SetRel α β → SetRel γ δ) (T : SetRel γ δ) : SetRel α β := {p | C {p} ⊆ T}

variable {C : SetRel α β → SetRel γ δ}

/-- A relation keeps the composite inside `T` iff it is contained in the residual. -/
theorem le_residual_iff (hC : PreservesUnions C) {R : SetRel α β} {T : SetRel γ δ} :
    R ⊆ residual C T ↔ C R ⊆ T := by
  rw [hC R, Set.iUnion₂_subset_iff]
  rfl

/-- The context and the residual form a Galois connection. -/
theorem gc_residual (hC : PreservesUnions C) : GaloisConnection C (residual C) :=
  fun _ _ => (le_residual_iff hC).symm

/-- The residual's composite stays inside `T`. -/
theorem map_residual_subset (hC : PreservesUnions C) (T : SetRel γ δ) : C (residual C T) ⊆ T :=
  (gc_residual hC).l_u_le T

/-- The empty relation's composite is empty, so it is always inside the target. -/
theorem map_empty (hC : PreservesUnions C) : C ∅ = ∅ := by
  rw [hC ∅]
  simp

/-- Every relation achieving `T` is contained in the residual: the residual is the weakest. -/
theorem subset_residual_of_eq (hC : PreservesUnions C) {R : SetRel α β} {T : SetRel γ δ}
    (h : C R = T) : R ⊆ residual C T :=
  (le_residual_iff hC).2 h.le

/-- Some relation achieves `T` iff the residual's composite covers `T`. -/
theorem covers_iff_exists_eq (hC : PreservesUnions C) {T : SetRel γ δ} :
    (∃ R, C R = T) ↔ T ⊆ C (residual C T) := by
  refine ⟨fun ⟨R, h⟩ => ?_, fun h => ⟨_, (map_residual_subset hC T).antisymm h⟩⟩
  rw [← h]
  exact (gc_residual hC).monotone_l (subset_residual_of_eq hC rfl)

/-- When the residual's composite misses part of `T`, no relation for the box achieves `T`. -/
theorem not_covers_iff (hC : PreservesUnions C) {T : SetRel γ δ} :
    ¬ T ⊆ C (residual C T) ↔ ∀ R, C R ≠ T := by
  rw [← covers_iff_exists_eq hC, not_exists]

/-- With the rows `F` the box can produce: some relation within `F` achieves `T` iff the
composite of the residual cut down to `F` covers `T`. With `F` everything, this is
`covers_iff_exists_eq`. -/
theorem covers_feasible_iff (hC : PreservesUnions C) {T : SetRel γ δ} {F : SetRel α β} :
    (∃ R ⊆ F, C R = T) ↔ T ⊆ C (residual C T ∩ F) := by
  refine ⟨fun ⟨R, hRF, h⟩ => ?_, fun h => ⟨residual C T ∩ F, Set.inter_subset_right, ?_⟩⟩
  · have hR : R ⊆ residual C T ∩ F := Set.subset_inter (subset_residual_of_eq hC h) hRF
    exact h.symm.subset.trans ((gc_residual hC).monotone_l hR)
  · exact (((gc_residual hC).monotone_l Set.inter_subset_left).trans (map_residual_subset hC T)).antisymm h

/-- When the producible part of the residual misses part of `T`, no relation the box can produce
achieves `T`, even where the whole residual covers it. -/
theorem not_covers_feasible_iff (hC : PreservesUnions C) {T : SetRel γ δ} {F : SetRel α β} :
    ¬ T ⊆ C (residual C T ∩ F) ↔ ∀ R ⊆ F, C R ≠ T := by
  rw [← covers_feasible_iff hC]
  simp only [not_exists, not_and]

/-- A relation that achieves `T` holds, for each pair of `T`, a row of the residual whose
composite delivers that pair. So when no producible row of the residual delivers it, every
relation achieving `T` contains one of the residual's rows that cannot be produced. -/
theorem required_row_of_eq (hC : PreservesUnions C) {R : SetRel α β} {T : SetRel γ δ}
    (h : C R = T) {q : γ × δ} (hq : q ∈ T) : ∃ p ∈ R, p ∈ residual C T ∧ q ∈ C {p} := by
  rw [← h, hC R] at hq
  simp only [Set.mem_iUnion] at hq
  obtain ⟨p, hp, hq⟩ := hq
  exact ⟨p, hp, subset_residual_of_eq hC h hp, hq⟩

end Residual

/-! ### Two unknown boxes

With two boxes left open, the context preserves unions in each (`PreservesUnions₂`; the semantics
does, `holeContext₂_preservesUnions₂` in `Semantics.lean`). A pair of relations keeps the composite
inside `T` iff every row of the first forms a safe pair with every row of the second
(`le_safeRows_iff`). So the safe pairs of relations are the rectangles inside the safe pairs of
rows. Every safe pair lies inside a formal concept of that relation, Mathlib's `Concept`, a
complete lattice (`safe_iff_le_concept`); every concept is safe (`concept_safe`); and a safe pair
containing a concept is that concept (`concept_maximal`). So the maximal safe pairs are exactly the
concepts. `T` is achievable iff some concept's composite covers it (`exists_eq₂_iff`). Two concepts
can be incomparable (`Witnesses.lean`), so there may be no weakest pair, and no product of two
residuals stands for them. The kernel enumerates the concepts of the safe row pairs up to a cap and
returns those that cover `T`; that its enumeration and grouping compute them is tested, not proved.
Three or more boxes are not stated, and the kernel answers `undecided` (`several-holes`). -/

section Holes

variable {α β α' β' γ δ : Type*}

/-- A context with two unknown boxes preserves unions in each: a composite pair needs one row of
each box. -/
def PreservesUnions₂ (C : SetRel α β → SetRel α' β' → SetRel γ δ) : Prop :=
  ∀ R₁ R₂, C R₁ R₂ = ⋃ p ∈ R₁, ⋃ q ∈ R₂, C {p} {q}

/-- The safe pairs of rows: a row of each box whose composite stays inside `T`. -/
def SafeRows (C : SetRel α β → SetRel α' β' → SetRel γ δ) (T : SetRel γ δ) (p : α × β)
    (q : α' × β') : Prop :=
  C {p} {q} ⊆ T

variable {C : SetRel α β → SetRel α' β' → SetRel γ δ}

/-- More rows in either box never remove a composite pair. -/
theorem PreservesUnions₂.mono (hC : PreservesUnions₂ C) {R₁ S₁ : SetRel α β}
    {R₂ S₂ : SetRel α' β'} (h₁ : R₁ ⊆ S₁) (h₂ : R₂ ⊆ S₂) : C R₁ R₂ ⊆ C S₁ S₂ := by
  rw [hC R₁, hC S₁]
  exact Set.biUnion_subset_biUnion_left h₁ |>.trans' (Set.iUnion₂_mono fun _ _ =>
    Set.biUnion_subset_biUnion_left h₂)

/-- A pair of relations keeps the composite inside `T` iff the second lies in the upper polar of
the first along the safe pairs of rows. -/
theorem le_safeRows_iff (hC : PreservesUnions₂ C) {R₁ : SetRel α β} {R₂ : SetRel α' β'}
    {T : SetRel γ δ} : C R₁ R₂ ⊆ T ↔ R₂ ⊆ upperPolar (SafeRows C T) R₁ := by
  rw [hC R₁ R₂]
  simp only [Set.iUnion₂_subset_iff]
  exact ⟨fun h q hq p hp => h p hp q hq, fun h p hp q hq => h hq hp⟩

/-- A pair of relations keeps the composite inside `T` iff it lies inside a formal concept of the
safe pairs of rows (Mathlib's `Concept`): the one its first relation generates. -/
theorem safe_iff_le_concept (hC : PreservesUnions₂ C) {R₁ : SetRel α β} {R₂ : SetRel α' β'}
    {T : SetRel γ δ} :
    C R₁ R₂ ⊆ T ↔
      ∃ c : Concept (α × β) (α' × β') (SafeRows C T), R₁ ⊆ c.extent ∧ R₂ ⊆ c.intent := by
  rw [le_safeRows_iff hC]
  refine ⟨fun h => ⟨Concept.ofObjects _ R₁, subset_lowerPolar_upperPolar _ R₁, h⟩, ?_⟩
  rintro ⟨c, h₁, h₂⟩
  exact h₂.trans (c.upperPolar_extent ▸ upperPolar_anti _ h₁)

/-- Every concept of the safe pairs of rows keeps the composite inside `T`. -/
theorem concept_safe (hC : PreservesUnions₂ C) {T : SetRel γ δ}
    (c : Concept (α × β) (α' × β') (SafeRows C T)) : C c.extent c.intent ⊆ T :=
  (safe_iff_le_concept hC).2 ⟨c, subset_rfl, subset_rfl⟩

/-- Concepts are the maximal safe pairs: a safe pair containing a concept is that concept. -/
theorem concept_maximal (hC : PreservesUnions₂ C) {T : SetRel γ δ}
    (c : Concept (α × β) (α' × β') (SafeRows C T)) {R₁ : SetRel α β} {R₂ : SetRel α' β'}
    (h : C R₁ R₂ ⊆ T) (h₁ : c.extent ⊆ R₁) (h₂ : c.intent ⊆ R₂) : R₁ = c.extent ∧ R₂ = c.intent := by
  have hR₂ : R₂ ⊆ c.intent := (le_safeRows_iff hC).1 h |>.trans (c.upperPolar_extent ▸ upperPolar_anti _ h₁)
  have hR₁ : R₁ ⊆ c.extent := by
    rw [← c.lowerPolar_intent]
    exact (subset_upperPolar_iff_subset_lowerPolar.1 ((le_safeRows_iff hC).1 h)).trans
      (lowerPolar_anti _ h₂)
  exact ⟨hR₁.antisymm h₁, hR₂.antisymm h₂⟩

/-- Some pair of relations achieves `T` iff some concept's composite covers `T`. -/
theorem exists_eq₂_iff (hC : PreservesUnions₂ C) {T : SetRel γ δ} :
    (∃ R₁ R₂, C R₁ R₂ = T) ↔
      ∃ c : Concept (α × β) (α' × β') (SafeRows C T), T ⊆ C c.extent c.intent := by
  refine ⟨fun ⟨R₁, R₂, h⟩ => ?_, fun ⟨c, h⟩ => ⟨_, _, (concept_safe hC c).antisymm h⟩⟩
  obtain ⟨c, h₁, h₂⟩ := (safe_iff_le_concept hC).1 h.le
  exact ⟨c, h.ge.trans (hC.mono h₁ h₂)⟩

end Holes

/-! ## Weakness ranking (`weaknessRanking`)

A concept admits a situation (a valuation of the boundary inputs) when it has a steady state there
and every deliverable output there is acceptable. Concepts are ordered by inclusion of what they
admit (`AtLeastAsWeak`, a preorder). The order is not total (`admits_incomparable`). A strict
inclusion of finite admitted sets gives a strictly larger count (`card_lt_of_strictly_weaker`),
but a larger count does not give an inclusion, so the count is a secondary figure. -/

section Weakness

variable {α β : Type*}

/-- The situations a concept admits: some steady state, and every output there is acceptable. -/
def admits (R : α → β → Prop) (ok : β → Prop) : Set α := {u | (∃ y, R u y) ∧ ∀ y, R u y → ok y}

/-- `R` is at least as weak as `S`: it admits every situation `S` admits. -/
def AtLeastAsWeak (ok : β → Prop) (R S : α → β → Prop) : Prop := admits S ok ⊆ admits R ok

theorem atLeastAsWeak_refl (ok : β → Prop) (R : α → β → Prop) : AtLeastAsWeak ok R R :=
  subset_rfl

theorem atLeastAsWeak_trans {ok : β → Prop} {R S U : α → β → Prop}
    (h₁ : AtLeastAsWeak ok R S) (h₂ : AtLeastAsWeak ok S U) : AtLeastAsWeak ok R U :=
  h₂.trans h₁

/-- A concept with no steady state admits nothing: an empty concept is not weak by vacuity. -/
theorem admits_bot (ok : β → Prop) : admits (⊥ : α → β → Prop) ok = ∅ :=
  Set.eq_empty_of_forall_notMem fun _ ⟨⟨_, h⟩, _⟩ => h

/-- A more permissive acceptability predicate never removes an admitted situation. -/
theorem admits_mono_ok {R : α → β → Prop} {ok ok' : β → Prop} (h : ∀ y, ok y → ok' y) :
    admits R ok ⊆ admits R ok' :=
  fun _ ⟨hu, hy⟩ => ⟨hu, fun y hr => h y (hy y hr)⟩

/-- Delivering the input and delivering its negation, with `true` acceptable: each concept admits
a situation the other rejects, so the inclusion order is not total. -/
theorem admits_incomparable :
    ¬ AtLeastAsWeak (· = true) (fun u y : Bool => y = u) (fun u y => y = !u) ∧
      ¬ AtLeastAsWeak (· = true) (fun u y : Bool => y = !u) (fun u y => y = u) := by
  refine ⟨fun h => ?_, fun h => ?_⟩
  · have := (h (a := false) ⟨⟨true, rfl⟩, fun y hy => by simp [hy]⟩).2 false rfl
    exact Bool.false_ne_true this
  · have := (h (a := true) ⟨⟨true, rfl⟩, fun y hy => hy⟩).2 false rfl
    exact Bool.false_ne_true this

/-- Strictly more admitted situations, of finitely many, is a strictly larger count. -/
theorem card_lt_of_strictly_weaker {s t : Finset α} (h : s ⊂ t) : s.card < t.card :=
  Finset.card_lt_card h

end Weakness

/-! ## Declared dynamics (`boundedDynamics`)

A box that declares state and transition rows is a nondeterministic Mealy machine: a relation
from (state, input) to (next state, output), a map `S × I → Set (S × O)`. A lens or optic with a
residual is such a machine with the residual as its state; nothing more is claimed. One step
under the admissible inputs forgets the input and the output. The kernel composes the boxes
synchronously and searches the step relation on configurations breadth first, up to a horizon.
The statements below hold for any step relation `r`, so they cover that configuration graph. A
trace is a sequence `τ : ℕ → σ` whose first `n` steps are admitted. The TypeScript search is
checked against them by tests, not by extraction.

The one link to the behaviour section: read as behaviour, with its state fed back through the
trace, a machine's steady states are its fixed points under a held input (`relTrace_mealyRel_iff`),
each a self-loop of the step (`relTrace_mealyRel_fixed`). Whether a run reaches one, and which, is
not stated. The kernel does not read transition rows as behaviour. -/

section Dynamics

variable {S I O σ : Type*}

/-- A nondeterministic Mealy machine: `T s i s' o` admits moving from `s` to `s'` on input `i`,
emitting `o`. -/
abbrev Mealy (S I O : Type*) := S → I → S → O → Prop

/-- One step under the admissible inputs `X`: some admissible input and some output. -/
def mealyStep (T : Mealy S I O) (X : Set I) : S → S → Prop := fun s s' => ∃ i ∈ X, ∃ o, T s i s' o

/-- More rows, or more admissible inputs, never remove a step. -/
theorem mealyStep_mono {T T' : Mealy S I O} {X X' : Set I} (hT : T ≤ T') (hX : X ⊆ X') :
    mealyStep T X ≤ mealyStep T' X' :=
  fun _ _ ⟨i, hi, o, h⟩ => ⟨i, hX hi, o, hT _ _ _ _ h⟩

/-- A machine read as a steady-state relation, its state fed back as the loop value: from
(input, state) to (output, next state). -/
def mealyRel (T : Mealy S I O) : I × S → O × S → Prop := fun p q => T p.2 p.1 q.2 q.1

/-- Read as behaviour with its state fed back through the trace, a machine relates an input to an
output iff some state stays fixed on that input, emitting that output: a steady state is a fixed
point of the dynamics under a held input, nothing more. -/
theorem relTrace_mealyRel_iff {T : Mealy S I O} {i : I} {o : O} :
    relTrace (mealyRel T) i o ↔ ∃ s, T s i s o :=
  Iff.rfl

/-- Such a state is a self-loop of one step on that input, so a run that reaches it can stay there
(`fixed_on_cycle`). Whether a run reaches it is not stated. -/
theorem relTrace_mealyRel_fixed {T : Mealy S I O} {i : I} {o : O} (h : relTrace (mealyRel T) i o) :
    ∃ s, mealyStep T {i} s s :=
  let ⟨s, hs⟩ := h
  ⟨s, i, rfl, o, hs⟩

/-- Reachable in exactly `n` steps. -/
def reachIn (r : σ → σ → Prop) : ℕ → σ → σ → Prop
  | 0 => Eq
  | n + 1 => Relation.Comp (reachIn r n) r

/-- Reachable within `n` steps. -/
def reachWithin (r : σ → σ → Prop) (n : ℕ) (a b : σ) : Prop := ∃ k ≤ n, reachIn r k a b

variable {r r' : σ → σ → Prop}

/-- More admissible steps never remove a configuration reachable in exactly `n` steps. -/
theorem reachIn_mono (h : r ≤ r') (n : ℕ) : reachIn r n ≤ reachIn r' n := by
  induction n with
  | zero => exact le_rfl
  | succ n ih => exact relation_comp_mono ih h

/-- More admissible steps never remove a configuration reachable within `n` steps. -/
theorem reachWithin_mono (h : r ≤ r') (n : ℕ) : reachWithin r n ≤ reachWithin r' n :=
  fun _ _ ⟨k, hk, hr⟩ => ⟨k, hk, reachIn_mono h k _ _ hr⟩

/-- Reachable in exactly `n` steps iff some trace of `n` admitted steps runs from `a` to `b`. -/
theorem reachIn_iff_trace {n : ℕ} {a b : σ} :
    reachIn r n a b ↔ ∃ τ : ℕ → σ, τ 0 = a ∧ τ n = b ∧ ∀ i < n, r (τ i) (τ (i + 1)) := by
  induction n generalizing b with
  | zero =>
    constructor
    · intro h
      exact ⟨fun _ => a, rfl, h, fun i hi => absurd hi (Nat.not_lt_zero i)⟩
    · rintro ⟨τ, h0, h1, -⟩
      exact h0.symm.trans h1
  | succ n ih =>
    constructor
    · rintro ⟨c, hac, hcb⟩
      obtain ⟨τ, h0, hn, hτ⟩ := ih.mp hac
      refine ⟨fun i => if i ≤ n then τ i else b, by simp [h0], by simp, fun i hi => ?_⟩
      rcases Nat.lt_succ_iff_lt_or_eq.mp hi with hi | rfl
      · simp only [hi.le, Nat.succ_le_of_lt hi, if_true]
        exact hτ i hi
      · simp only [le_refl, if_true, Nat.not_succ_le_self, if_false]
        exact hn ▸ hcb
    · rintro ⟨τ, h0, hn, hτ⟩
      exact ⟨τ n, ih.mpr ⟨τ, h0, rfl, fun i hi => hτ i (Nat.lt_succ_of_lt hi)⟩, hn ▸ hτ n (Nat.lt_succ_self n)⟩

/-- Reachable within `n` steps iff some trace of at most `n` admitted steps runs from `a` to `b`:
a search that exhausts the configurations within `n` steps rules out every such trace. -/
theorem reachWithin_iff_trace {n : ℕ} {a b : σ} :
    reachWithin r n a b ↔ ∃ k ≤ n, ∃ τ : ℕ → σ, τ 0 = a ∧ τ k = b ∧ ∀ i < k, r (τ i) (τ (i + 1)) :=
  exists_congr fun _ => and_congr_right fun _ => reachIn_iff_trace

/-- Every point of one trace is reached at its own time, along that one run: a witness that
visits two target sets at two times is a single run (separation in time). -/
theorem reachIn_of_trace {n i : ℕ} {τ : ℕ → σ} (hτ : ∀ j < n, r (τ j) (τ (j + 1))) (hi : i ≤ n) :
    reachIn r i (τ 0) (τ i) :=
  reachIn_iff_trace.mpr ⟨τ, rfl, rfl, fun j hj => hτ j (by omega)⟩

/-- Counterexample soundness: a trace of at most `n` admitted steps that ends in `U` makes `U`
reachable within `n` steps. -/
theorem reach_of_trace {U : Set σ} {n k : ℕ} {τ : ℕ → σ} (hτ : ∀ i < k, r (τ i) (τ (i + 1)))
    (hk : k ≤ n) (hU : τ k ∈ U) : ∃ b ∈ U, reachWithin r n (τ 0) b :=
  ⟨τ k, hU, k, hk, reachIn_iff_trace.mpr ⟨τ, rfl, rfl, hτ⟩⟩

/-- Saturation: if every configuration reachable in `k + 1` steps from the initial set `A` is
already reachable within `k`, then the configurations within `k` steps are all the reachable
ones, at any horizon. -/
theorem reachWithin_saturated {A : Set σ} {k : ℕ}
    (h : ∀ b, (∃ a ∈ A, reachIn r (k + 1) a b) → ∃ a ∈ A, reachWithin r k a b) (n : ℕ) (b : σ) :
    (∃ a ∈ A, reachWithin r n a b) → ∃ a ∈ A, reachWithin r k a b := by
  rintro ⟨a, ha, m, -, hm⟩
  induction m generalizing b with
  | zero => exact ⟨a, ha, 0, Nat.zero_le k, hm⟩
  | succ m ih =>
    obtain ⟨c, hac, hcb⟩ := hm
    obtain ⟨a', ha', j, hj, hj'⟩ := ih c hac
    rcases Nat.lt_or_eq_of_le hj with hj | rfl
    · exact ⟨a', ha', j + 1, hj, c, hj', hcb⟩
    · exact h b ⟨a', ha', c, hj', hcb⟩

/-! ### Loop classification

The kernel classifies the closed strongly connected components of the reachable state graph. A
component is closed when no step leaves it. Its configurations form a closed set of the
configuration graph: a trapped component is one inside the unsafe set (`trapped_reachIn`), a
recurrent one meets the unsafe set without lying inside it. Its states reach each other, so from
every state a run reaches inside it, an unsafe and a safe state both stay reachable
(`recurrent_reach`): the run can recover and can relapse, at any number of steps. Whether it does
is not stated; that needs a fairness assumption. -/

/-- No step leaves `C`. -/
def Closed (r : σ → σ → Prop) (C : Set σ) : Prop := ∀ a ∈ C, ∀ b, r a b → b ∈ C

/-- A fixed point lies on a cycle: the run can stay there forever. -/
theorem fixed_on_cycle {s : σ} (h : r s s) : Relation.TransGen r s s :=
  Relation.TransGen.single h

/-- A run that enters a closed set never leaves it, at any number of steps (a trap). -/
theorem closed_reachIn {C : Set σ} (hC : Closed r C) {a : σ} (ha : a ∈ C) (n : ℕ) {b : σ}
    (h : reachIn r n a b) : b ∈ C := by
  induction n generalizing b with
  | zero => exact (show a = b from h) ▸ ha
  | succ n ih =>
    obtain ⟨c, hac, hcb⟩ := h
    exact hC c (ih hac) b hcb

/-- A closed set inside the unsafe set is an absorbing trap: from any of its states, every state
reachable at any number of steps is unsafe. A closed set that only meets the unsafe set holds the
run too, but may reach safe states again (recurrent, not trapped). -/
theorem trapped_reachIn {C U : Set σ} (hC : Closed r C) (hCU : C ⊆ U) {a : σ} (ha : a ∈ C) (n : ℕ)
    {b : σ} (h : reachIn r n a b) : b ∈ U :=
  hCU (closed_reachIn hC ha n h)

/-- A recurrent component: a closed set whose states all reach each other, holding a state of `U`
(an unsafe configuration there) and a state of `S` (a safe one). From every state a run reaches
from inside it, at any number of steps, both stay reachable: the run can recover and can relapse,
but need not do either. -/
theorem recurrent_reach {C U S : Set σ} (hC : Closed r C)
    (hSC : ∀ a ∈ C, ∀ b ∈ C, Relation.ReflTransGen r a b) (hU : (C ∩ U).Nonempty)
    (hS : (C ∩ S).Nonempty) {a : σ} (ha : a ∈ C) (n : ℕ) {b : σ} (h : reachIn r n a b) :
    (∃ u ∈ U, Relation.ReflTransGen r b u) ∧ ∃ s ∈ S, Relation.ReflTransGen r b s :=
  have hb := closed_reachIn hC ha n h
  let ⟨u, huC, huU⟩ := hU
  let ⟨s, hsC, hsS⟩ := hS
  ⟨⟨u, huU, hSC b hb u huC⟩, ⟨s, hsS, hSC b hb s hsC⟩⟩

/-- Without a fixed point, a return to the start takes at least two steps: an oscillation's
cycles have length two or more. -/
theorem return_ge_two (h : ∀ s, ¬ r s s) {s : σ} {n : ℕ} (hn : 0 < n) (hc : reachIn r n s s) :
    2 ≤ n := by
  rcases n with _ | _ | n
  · exact absurd hn (lt_irrefl 0)
  · obtain ⟨c, hsc, hcs⟩ := hc
    obtain rfl : s = c := hsc
    exact (h s hcs).elim
  · omega

end Dynamics

/-! ## Co-design feasibility (`feasibility`, `trimFeasibility`)

Censi's monotone design problems (A Mathematical Theory of Co-Design, arXiv:1512.08055): a
feasibility relation `d f r` says resources `r` suffice for functionality `f`. It is monotone when
providing less never needs more and more resources never hurt. Series, parallel, and feedback
composition keep that property (Censi, Props. 2–4), so a model whose boxes declare monotone rows
has a monotone composite. Feedback is the relational trace of the behaviour section.

The kernel solves the composite as a least fixpoint. A configuration is a demanded level per port
and a cost vector, in a finite join-semilattice `P`; `h s x` says that some row selection
provides what `s` demands and places the demand and cost `x`. One step maps an upper set `U` of
configurations to the configurations above some `x ⊔ s` with `s ∈ U` and `h s x` (`kleeneStep`,
Censi's eq. 26). The kernel represents an upper set by its antichain of minimal elements and
computes the step on that antichain, which `kleeneStep_upperClosure` justifies when requirements
only shrink as demands do. Iterating from `⊥` (every configuration) reaches the least fixpoint on
a finite lattice (`kleene_lfp`), and that fixpoint is the upward closure of the feasible
configurations (`codesign_lfp`): its minimal elements are exactly the minimal feasible ones.

Behaviour, above, equates values and has no order to iterate in, so it takes the trace of
steady states and not a least fixpoint. The TypeScript solver is checked against these
statements by tests, including a brute-force comparison, not by extraction. -/

section Feasibility

variable {F M R υ : Type*} [Preorder F] [Preorder M] [Preorder R] [Preorder υ]

/-- Censi's monotone design problem as a relation: providing less never needs more, and more
resources never hurt. -/
def MonotoneFeasibility (d : F → R → Prop) : Prop :=
  ∀ ⦃f f' r r'⦄, f' ≤ f → r ≤ r' → d f r → d f' r'

/-- Series composition (Mathlib's `Relation.Comp`): one box's required resource is the next
box's functionality. -/
theorem feasibility_comp {d : F → M → Prop} {e : M → R → Prop}
    (hd : MonotoneFeasibility d) (he : MonotoneFeasibility e) :
    MonotoneFeasibility (Relation.Comp d e) := by
  rintro f f' r r' hf hr ⟨m, h₁, h₂⟩
  exact ⟨m, hd hf le_rfl h₁, he le_rfl hr h₂⟩

/-- Parallel composition: two boxes side by side, their resources combined by `op` (costs add,
port demands take the larger) and compared with `≤`. -/
theorem feasibility_par {F₂ R₂ : Type*} [Preorder F₂] [Preorder R₂] {d : F → R → Prop}
    {e : F₂ → R₂ → Prop} (op : R → R₂ → R) (hd : MonotoneFeasibility d) (he : MonotoneFeasibility e) :
    MonotoneFeasibility (fun (f : F × F₂) (r : R) => ∃ r₁ r₂, d f.1 r₁ ∧ e f.2 r₂ ∧ op r₁ r₂ ≤ r) := by
  rintro f f' r r' hf hr ⟨r₁, r₂, h₁, h₂, hle⟩
  exact ⟨r₁, r₂, hd hf.1 le_rfl h₁, he hf.2 le_rfl h₂, hle.trans hr⟩

/-- Feedback: the trace of a monotone feasibility relation is monotone. -/
theorem feasibility_trace {d : F × υ → R × υ → Prop} (hd : MonotoneFeasibility d) :
    MonotoneFeasibility (relTrace d) := by
  rintro f f' r r' hf hr ⟨u, hu⟩
  exact ⟨u, hd (Prod.mk_le_mk.mpr ⟨hf, le_rfl⟩) (Prod.mk_le_mk.mpr ⟨hr, le_rfl⟩) hu⟩

end Feasibility

section Kleene

/-- Kleene's ascent on a finite complete lattice: iterating a monotone map from `⊥` as many times
as the lattice has elements gives its least fixpoint. -/
theorem kleene_lfp {α : Type*} [CompleteLattice α] [Fintype α] (f : α →o α) :
    f^[Fintype.card α] ⊥ = f.lfp := by
  set a : ℕ → α := fun n => f^[n] ⊥ with ha
  have hmono : Monotone a := Monotone.monotone_iterate_of_le_map f.monotone bot_le
  have hsucc : ∀ n, a (n + 1) = f (a n) := fun n => by simp only [ha, Function.iterate_succ_apply']
  have hle : ∀ n, a n ≤ f.lfp := by
    intro n
    induction n with
    | zero => exact bot_le
    | succ n ih => rw [hsucc]; exact f.map_le_lfp ih
  -- Two equal iterates make the chain stall, and a stalled value is a fixpoint.
  have key : ∀ i j : ℕ, i < j → a i = a j → a i = f.lfp := by
    intro i j hij heq
    have hfix : f (a i) = a i := le_antisymm
      (by rw [← hsucc]; exact (hmono (by omega : i + 1 ≤ j)).trans heq.ge)
      (by rw [← hsucc]; exact hmono (Nat.le_succ i))
    exact le_antisymm (hle i) (f.lfp_le_fixed hfix)
  obtain ⟨i, j, hij, heq⟩ := Fintype.exists_ne_map_eq_of_card_lt
    (fun k : Fin (Fintype.card α + 1) => a k) (by simp)
  have hi := i.isLt
  have hj := j.isLt
  have hne : (i : ℕ) ≠ j := Fin.val_injective.ne hij
  obtain ⟨k, hk, hak⟩ : ∃ k ≤ Fintype.card α, a k = f.lfp := by
    rcases lt_or_gt_of_ne hne with h | h
    · exact ⟨i, by omega, key i j h heq⟩
    · exact ⟨j, by omega, key j i h heq.symm⟩
  exact le_antisymm (hle _) (hak ▸ hmono hk)

end Kleene

section CoDesign

variable {P : Type*} [SemilatticeSup P]

/-- One step of the co-design ascent on upper sets of configurations (Censi's eq. 26):
everything above `x ⊔ s` for a configuration `s` in `U` and a requirement `x` of `s`. Upper sets
are ordered by reverse inclusion, so `⊥` is every configuration. -/
def kleeneStep (h : P → P → Prop) : UpperSet P →o UpperSet P where
  toFun U := ⟨{t | ∃ s ∈ U, ∃ x, h s x ∧ x ⊔ s ≤ t}, by
    rintro a b hab ⟨s, hs, x, hx, hle⟩
    exact ⟨s, hs, x, hx, hle.trans hab⟩⟩
  monotone' U V hUV := by
    rw [← UpperSet.coe_subset_coe] at hUV ⊢
    rintro t ⟨s, hs, x, hx, hle⟩
    exact ⟨s, hUV hs, x, hx, hle⟩

/-- Membership in one step, unfolded. -/
theorem mem_kleeneStep {h : P → P → Prop} {U : UpperSet P} {t : P} :
    t ∈ kleeneStep h U ↔ ∃ s ∈ U, ∃ x, h s x ∧ x ⊔ s ≤ t := Iff.rfl

/-- The step can be computed on generators, such as an antichain of minimal configurations, when
a smaller demand never needs more (`hmono`). -/
theorem kleeneStep_upperClosure {h : P → P → Prop}
    (hmono : ∀ ⦃s s' x⦄, s ≤ s' → h s' x → ∃ y ≤ x, h s y) (A : Set P) :
    kleeneStep h (upperClosure A) = upperClosure {y | ∃ s ∈ A, ∃ x, h s x ∧ y = x ⊔ s} := by
  ext t
  simp only [SetLike.mem_coe, mem_kleeneStep, mem_upperClosure, Set.mem_setOf_eq]
  constructor
  · rintro ⟨s, ⟨a, ha, has⟩, x, hx, hle⟩
    obtain ⟨y, hyx, hy⟩ := hmono has hx
    exact ⟨y ⊔ a, ⟨a, ha, y, hy, rfl⟩, (sup_le_sup hyx has).trans hle⟩
  · rintro ⟨_, ⟨a, ha, x, hx, rfl⟩, hle⟩
    exact ⟨a, ⟨a, ha, le_rfl⟩, x, hx, hle⟩

/-- On a finite set of configurations, the least fixpoint of the step is the upward closure of the
feasible configurations: those with a requirement below themselves. Its minimal elements are
the minimal feasible configurations. -/
theorem codesign_lfp [Finite P] (h : P → P → Prop) :
    ((kleeneStep h).lfp : Set P) = upperClosure {s | ∃ x, h s x ∧ x ≤ s} := by
  ext t
  simp only [SetLike.mem_coe, mem_upperClosure, Set.mem_setOf_eq]
  constructor
  · -- A minimal element of a fixpoint is reached from itself, so it is feasible.
    intro ht
    obtain ⟨m, hmt, hmin⟩ := exists_minimal_le_of_wellFoundedLT (· ∈ (kleeneStep h).lfp) t ht
    have hm : m ∈ kleeneStep h (kleeneStep h).lfp := by rw [OrderHom.map_lfp]; exact hmin.prop
    obtain ⟨s, hs, x, hx, hle⟩ := hm
    have hsm : s ≤ m := le_sup_right.trans hle
    obtain rfl : s = m := le_antisymm hsm (hmin.2 hs hsm)
    exact ⟨s, ⟨x, hx, le_sup_left.trans hle⟩, hmt⟩
  · -- Everything above a feasible configuration is a post-fixpoint, so the lfp contains it.
    rintro ⟨s, ⟨x, hx, hxs⟩, hst⟩
    have hlfp : (kleeneStep h).lfp ≤ UpperSet.Ici s := by
      refine OrderHom.lfp_le _ ?_
      rw [← UpperSet.coe_subset_coe]
      intro u hu
      exact ⟨s, UpperSet.mem_Ici_iff.mpr le_rfl, x, hx, (sup_le hxs le_rfl).trans hu⟩
    exact UpperSet.coe_subset_coe.mpr hlfp (UpperSet.mem_Ici_iff.mpr hst)

end CoDesign

/-! ## Levels: numeric amounts read as qualitative values (`levels` in `src/act-levels.ts`)

A carrier's `levels` give some of its values a threshold each, `t v`. An amount reads as the
largest value whose threshold it reaches (`level`). The kernel requires the thresholds to
increase along the levels' order and the first to be `0`, the least amount (`t ⊥ = ⊥`). Then the
reading is a Galois connection: an amount reaches `t v` exactly when it reads as `v` or above
(`level_gc`). That is what lets a numeric requirement, such as "at least `t v`", become a set of
acceptable values, `v` and above, with nothing lost or added. `level_band` is what the
consistency check between feasibility amounts and behaviour values reads: an amount lies in the
band of the value it reads as. -/

section Levels

variable {V α : Type*} [LinearOrder V] [OrderBot V] [Fintype V] [LinearOrder α]

/-- The value an amount reads as: the largest value whose threshold it reaches. -/
def level (t : V → α) (a : α) : V := (Finset.univ.filter fun v => t v ≤ a).sup id

/-- More of an amount never reads as less, whatever the thresholds. -/
theorem level_monotone (t : V → α) : Monotone (level t) := fun _ _ hab =>
  Finset.sup_mono fun v hv => Finset.mem_filter.mpr
    ⟨Finset.mem_univ v, (Finset.mem_filter.mp hv).2.trans hab⟩

/-- With the first threshold at the least amount, every amount lies in the band of the value it
reads as: it reaches that value's threshold and no higher value's. -/
theorem level_band [OrderBot α] {t : V → α} (h0 : t ⊥ = ⊥) (a : α) :
    t (level t a) ≤ a ∧ ∀ w, level t a < w → a < t w := by
  have hne : (Finset.univ.filter fun v => t v ≤ a).Nonempty := ⟨⊥, by simp [h0]⟩
  obtain ⟨m, hm, hsup⟩ := Finset.exists_mem_eq_sup _ hne id
  refine ⟨?_, fun w hw => not_le.mp fun hwa => ?_⟩
  · rw [level, hsup]
    exact (Finset.mem_filter.mp hm).2
  · exact absurd (Finset.le_sup (f := id) (Finset.mem_filter.mpr ⟨Finset.mem_univ w, hwa⟩))
      (not_le.mpr hw)

/-- With increasing thresholds starting at the least amount, reading amounts as values is a
Galois connection: an amount reaches `t v` iff it reads as `v` or above. -/
theorem level_gc [OrderBot α] {t : V → α} (ht : Monotone t) (h0 : t ⊥ = ⊥) : GaloisConnection t (level t) :=
  fun v a => ⟨fun h => Finset.le_sup (f := id) (Finset.mem_filter.mpr ⟨Finset.mem_univ v, h⟩),
    fun h => (ht h).trans (level_band h0 a).1⟩

end Levels

/-! ## Row tables: certificates of dynamics and weakness verdicts

A certificate of a `triz_dynamics` escalation trace, or of a `triz_weakness` strict inclusion,
encodes the composed boxes' declared rows, not the kernel's results. Every port is a variable
and every function between two encoded ports says its ends carry the same value. A row of a box
fixes each of that box's ports to one value (`fixes`, `val`). A transition row also names its
machine, its current state, and its next state. The definitions below read these tables as the
kernel's semantics: a steady state is a valuation every function and every box admits; one
synchronous step goes from a configuration (global state, valuation) every box admits to the
next states its picked rows name; the input→deliverable relation is the steady states projected
onto the inputs a concept reads and its deliverables. The certificate then states the verdict
with `reachWithin` and `reach_of_trace`, or `AtLeastAsWeak` and `card_lt_of_strictly_weaker`,
and Lean decides it on the tables. -/

section RowTables

/-- Declared stateless rows over port variables, with the functions joining ports. Row `k` belongs
to box `box k` and fixes each port `x` with `fixes k x` to `val k x`. -/
structure Rows (Bx Rw Vr Wr Val : Type*) where
  box : Rw → Bx
  fixes : Rw → Vr → Bool
  val : Rw → Vr → Val
  src : Wr → Vr
  tgt : Wr → Vr

/-- Declared rows with state: a transition row (`mach k = some m`) also fixes machine `m`'s
state to `state k` and its next state to `next k`; a behaviour row has `mach k = none`. -/
structure Sync (Bx Rw Vr Mc Wr St Val : Type*) where
  box : Rw → Bx
  fixes : Rw → Vr → Bool
  val : Rw → Vr → Val
  mach : Rw → Option Mc
  state : Rw → St
  next : Rw → St
  src : Wr → Vr
  tgt : Wr → Vr

variable {Bx Rw Vr Mc Wr St Val In Dl : Type*}

namespace Rows

variable (t : Rows Bx Rw Vr Wr Val)

/-- A steady state: every function's ends agree, and every box has a row the valuation fits. -/
def Steady (v : Vr → Val) : Prop :=
  (∀ w, v (t.src w) = v (t.tgt w)) ∧ ∀ b, ∃ k, t.box k = b ∧ ∀ x, t.fixes k x = true → v x = t.val k x

/-- The input→deliverable relation over the situations `dom` allows (each input at one of its
declared values): a steady state that reads `u` on the inputs the concept reads
(`reads j = some x`) and delivers `y`. -/
def relation (dom : In → Val → Bool) (reads : In → Option Vr) (delivers : Dl → Vr) (u : In → Val)
    (y : Dl → Val) : Prop :=
  (∀ j, dom j (u j) = true) ∧ ∃ v, t.Steady v ∧ (∀ j x, reads j = some x → v x = u j) ∧ ∀ d, v (delivers d) = y d

instance [Fintype Bx] [Fintype Rw] [Fintype Vr] [Fintype Wr] [DecidableEq Bx] [DecidableEq Val]
    (v : Vr → Val) : Decidable (t.Steady v) :=
  inferInstanceAs (Decidable ((∀ w, v (t.src w) = v (t.tgt w)) ∧
    ∀ b, ∃ k, t.box k = b ∧ ∀ x, t.fixes k x = true → v x = t.val k x))

instance [Fintype Bx] [Fintype Rw] [Fintype Vr] [Fintype Wr] [Fintype Val] [Fintype In]
    [DecidableEq Bx] [DecidableEq Vr] [DecidableEq Val] (dom : In → Val → Bool) (reads : In → Option Vr)
    (delivers : Dl → Vr) [Fintype Dl] : DecidableRel (t.relation dom reads delivers) := fun u y =>
  inferInstanceAs (Decidable ((∀ j, dom j (u j) = true) ∧
    ∃ v, t.Steady v ∧ (∀ j x, reads j = some x → v x = u j) ∧ ∀ d, v (delivers d) = y d))

end Rows

namespace Sync

variable (t : Sync Bx Rw Vr Mc Wr St Val)

/-- Row `k` fits a configuration: its values, and its machine's current state. -/
def Fits (k : Rw) (c : (Mc → St) × (Vr → Val)) : Prop :=
  (∀ x, t.fixes k x = true → c.2 x = t.val k x) ∧ ∀ m, t.mach k = some m → c.1 m = t.state k

/-- A configuration every function and every box admits. -/
def Consistent (c : (Mc → St) × (Vr → Val)) : Prop :=
  (∀ w, c.2 (t.src w) = c.2 (t.tgt w)) ∧ ∀ b, ∃ k, t.box k = b ∧ t.Fits k c

/-- One synchronous step: `c` is admitted, and every box has a row that fits `c` and names the
next state its machine takes in `c'`. -/
def Step (c c' : (Mc → St) × (Vr → Val)) : Prop :=
  (∀ w, c.2 (t.src w) = c.2 (t.tgt w)) ∧
    ∀ b, ∃ k, t.box k = b ∧ t.Fits k c ∧ ∀ m, t.mach k = some m → c'.1 m = t.next k

/-- The configurations that start each machine in a state `init` allows. -/
def starts (_t : Sync Bx Rw Vr Mc Wr St Val) (init : Mc → St → Bool) : Set ((Mc → St) × (Vr → Val)) :=
  {c | ∀ m, init m (c.1 m) = true}

/-- The admitted configurations where every machine's state and every port's value is one a
target allows. -/
def target (st : Mc → St → Bool) (vl : Vr → Val → Bool) : Set ((Mc → St) × (Vr → Val)) :=
  {c | t.Consistent c ∧ (∀ m, st m (c.1 m) = true) ∧ ∀ x, vl x (c.2 x) = true}

variable [Fintype Bx] [Fintype Rw] [Fintype Vr] [Fintype Mc] [Fintype Wr]
  [DecidableEq Bx] [DecidableEq Mc] [DecidableEq St] [DecidableEq Val]

instance (k : Rw) (c : (Mc → St) × (Vr → Val)) : Decidable (t.Fits k c) :=
  inferInstanceAs (Decidable ((∀ x, t.fixes k x = true → c.2 x = t.val k x) ∧ ∀ m, t.mach k = some m → c.1 m = t.state k))

instance : DecidableRel t.Step := fun c c' =>
  inferInstanceAs (Decidable ((∀ w, c.2 (t.src w) = c.2 (t.tgt w)) ∧
    ∀ b, ∃ k, t.box k = b ∧ t.Fits k c ∧ ∀ m, t.mach k = some m → c'.1 m = t.next k))

instance (init : Mc → St → Bool) : DecidablePred (· ∈ t.starts init) := fun c =>
  inferInstanceAs (Decidable (∀ m, init m (c.1 m) = true))

instance (st : Mc → St → Bool) (vl : Vr → Val → Bool) : DecidablePred (· ∈ t.target st vl) := fun c =>
  inferInstanceAs (Decidable (((∀ w, c.2 (t.src w) = c.2 (t.tgt w)) ∧ ∀ b, ∃ k, t.box k = b ∧ t.Fits k c) ∧
    (∀ m, st m (c.1 m) = true) ∧ ∀ x, vl x (c.2 x) = true))

end Sync

/-- A trace given as a table over times `0` to `k`, read at every time (it stays at time `k`
after it), so `reach_of_trace` takes it. -/
def traceOf {σ : Type*} {k : ℕ} (τ : Fin (k + 1) → σ) (i : ℕ) : σ :=
  τ ⟨min i k, Nat.lt_succ_of_le (Nat.min_le_right i k)⟩

/-- Every deliverable's value is one the table accepts. -/
def accepts (ok : Dl → Val → Bool) (y : Dl → Val) : Prop := ∀ d, ok d (y d) = true

instance [Fintype Dl] (ok : Dl → Val → Bool) : DecidablePred (accepts ok) := fun y =>
  inferInstanceAs (Decidable (∀ d, ok d (y d) = true))

instance {α β : Type*} [Fintype β] (R : α → β → Prop) [DecidableRel R] (ok : β → Prop) [DecidablePred ok] :
    DecidablePred (· ∈ admits R ok) := fun u =>
  inferInstanceAs (Decidable ((∃ y, R u y) ∧ ∀ y, R u y → ok y))

instance {α β : Type*} [Fintype α] [Fintype β] (ok : β → Prop) [DecidablePred ok] (R S : α → β → Prop)
    [DecidableRel R] [DecidableRel S] : Decidable (AtLeastAsWeak ok R S) :=
  inferInstanceAs (Decidable (∀ u, u ∈ admits S ok → u ∈ admits R ok))

/-- The situations a concept admits, as a finite set, so they can be counted. -/
def admitted {α β : Type*} [Fintype α] [Fintype β] (ok : β → Prop) [DecidablePred ok] (R : α → β → Prop)
    [DecidableRel R] : Finset α :=
  Finset.univ.filter (· ∈ admits R ok)

end RowTables

end CategoricalTriz
