import Mathlib.Algebra.Order.BigOperators.Group.Finset
import Mathlib.Algebra.Order.Pi
import Mathlib.CategoryTheory.Functor.KanExtension.Basic
import Mathlib.Data.Real.Basic
import Mathlib.Data.Fin.VecNotation
import Mathlib.Data.Set.Prod
import Mathlib.Logic.Relation
import Mathlib.Order.BooleanAlgebra.Basic
import Mathlib.Order.Comparable

/-!
# Categorical TRIZ: the statements behind the kernel's checks

Each section states, over Mathlib, the fact that one check in `src/act.ts` relies on. This is
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

end Loops

/-! ## Ideality as a componentwise comparison (`idealityProfile`, `compareIdeality`)

Costs are vectors over resource dimensions, ordered componentwise. -/

section Resources

variable {ι D : Type*}

/-- Removing boxes with non-negative cost vectors never raises any cost dimension. -/
theorem trim_lowers_cost (cost : ι → D → ℝ) (hc : ∀ i, 0 ≤ cost i) {kept all : Finset ι}
    (h : kept ⊆ all) : ∑ i ∈ kept, cost i ≤ ∑ i ∈ all, cost i :=
  Finset.sum_le_sum_of_subset_of_nonneg h fun i _ _ => hc i

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
