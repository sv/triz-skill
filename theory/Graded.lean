import CategoricalTriz
import Mathlib.Algebra.Order.Quantale
import Mathlib.Data.ENat.Lattice

/-! Generic quantale residuation, and its Boolean and min-plus instances.
This is an algebraic construction; finite minimum-cost row coverage is a separate problem. -/

namespace Graded

open Quantale

variable {Q : Type*} [CommSemigroup Q] [CompleteLattice Q] [IsQuantale Q]

/-- The greatest grade whose product with `a` lies below `b`. -/
def residual (a b : Q) : Q := rightMulResiduation a b

theorem le_residual_iff (a b x : Q) : x ≤ residual a b ↔ a * x ≤ b :=
  rightMulResiduation_le_iff_mul_le

/-- The context sends a graded row relation to its graded target relation. -/
noncomputable def applyContext {R Y : Type*} (C : R → Y → Q) (φ : R → Q) (y : Y) : Q :=
  ⨆ r, C r y * φ r

/-- Greatest row grades whose context stays below the target. -/
noncomputable def gradedResidual {R Y : Type*} (C : R → Y → Q) (t : Y → Q) (r : R) : Q :=
  ⨅ y, residual (C r y) (t y)

/-- The relation-level adjunction, pointwise in all rows and targets. -/
theorem context_le_iff {R Y : Type*} (C : R → Y → Q) (φ : R → Q) (t : Y → Q) :
    φ ≤ gradedResidual C t ↔ applyContext C φ ≤ t := by
  simp only [Pi.le_def, gradedResidual, applyContext, le_iInf_iff, iSup_le_iff, le_residual_iff]
  exact ⟨fun h y r => h r y, fun h r y => h y r⟩

/-- The Boolean quantale, with conjunction as multiplication. -/
instance boolSemigroup : CommSemigroup Prop where
  mul := And
  mul_assoc := fun _ _ _ => propext and_assoc
  mul_comm := fun _ _ => propext and_comm

instance : IsQuantale Prop where
  mul_sSup_distrib := by
    intro x s
    apply propext
    simp only [sSup_eq_iSup, iSup_Prop_eq, HMul.hMul, Mul.mul]
    aesop
  sSup_mul_distrib := by
    intro s x
    apply propext
    simp only [sSup_eq_iSup, iSup_Prop_eq, HMul.hMul, Mul.mul]
    aesop

/-- Boolean residual is implication. -/
theorem prop_residual (a b : Prop) : residual a b ↔ (a → b) := by
  have h := le_residual_iff a b True
  change (True → residual a b) ↔ (a ∧ True → b) at h
  simpa using h

/-- For propositions, a row is safe precisely when all of its outputs satisfy the target. -/
theorem prop_gradedResidual {R Y : Type*} (C : R → Y → Prop) (t : Y → Prop) (r : R) :
    gradedResidual C t r ↔ ∀ y, C r y → t y := by
  simp only [gradedResidual, iInf_Prop_eq, prop_residual]

/-- The Boolean matrix built from singleton composites recovers the existing relational residual. -/
theorem singleton_context_residual {α β γ δ : Type*}
    (C : SetRel α β → SetRel γ δ) (T : SetRel γ δ) (r : α × β) :
    gradedResidual (fun row output => output ∈ C {row}) (fun output => output ∈ T) r ↔
      r ∈ CategoricalTriz.residual C T := by
  rw [prop_gradedResidual]
  rfl

/-- Min-plus costs have the reversed order, so joins are numerical infima. -/
abbrev Cost := OrderDual ℕ∞

instance : IsAddQuantale Cost where
  add_sSup_distrib := by
    intro x s
    have h : sSup s + x = ⨆ y ∈ s, y + x := by
      apply OrderDual.ofDual.injective
      simp only [ofDual_iSup]
      exact ENat.sInf_add
    simpa only [add_comm] using h
  sSup_add_distrib := by
    intro s x
    apply OrderDual.ofDual.injective
    simp only [ofDual_iSup]
    exact ENat.sInf_add

/-- A min-plus residual is the largest grade in reversed cost order satisfying the bound. -/
noncomputable def costResidual (a b : Cost) : Cost := AddQuantale.rightAddResiduation a b

theorem cost_residual_iff (a b x : Cost) : x ≤ costResidual a b ↔ a + x ≤ b :=
  AddQuantale.rightAddResiduation_le_iff_add_le

/-- The min-plus context uses numerical infimum of path costs. -/
noncomputable def costContext {R Y : Type*} (C : R → Y → Cost) (φ : R → Cost) (y : Y) : Cost :=
  ⨆ r, C r y + φ r

/-- The corresponding pointwise min-plus residual. -/
noncomputable def costContextResidual {R Y : Type*} (C : R → Y → Cost) (t : Y → Cost) (r : R) : Cost :=
  ⨅ y, costResidual (C r y) (t y)

theorem cost_context_le_iff {R Y : Type*} (C : R → Y → Cost) (φ : R → Cost) (t : Y → Cost) :
    φ ≤ costContextResidual C t ↔ costContext C φ ≤ t := by
  simp only [Pi.le_def, costContextResidual, costContext, le_iInf_iff, iSup_le_iff, cost_residual_iff]
  exact ⟨fun h y r => h r y, fun h r y => h y r⟩

/-- In ordinary numerical order this bound reads `b ≤ a + x`. -/
theorem cost_residual_numerical (a b x : ℕ∞) :
    (show Cost from x) ≤ costResidual a b ↔ b ≤ a + x := cost_residual_iff a b x

/-- For min-plus grades, the residual is truncated subtraction in numerical order. -/
theorem costResidual_eq_tsub (a b : ℕ∞) : costResidual a b = (b - a : ℕ∞) := by
  apply le_antisymm
  · change b - a ≤ (costResidual a b : ℕ∞)
    apply tsub_le_iff_left.mpr
    exact (cost_residual_numerical a b (costResidual a b)).mp le_rfl
  · apply (cost_residual_numerical a b (b - a)).mpr
    exact tsub_le_iff_left.mp le_rfl

/-- A finite path with cost 2 needs at least 3 more to meet bound 5. -/
example : costResidual (2 : ℕ∞) (5 : ℕ∞) = (3 : ℕ∞) := by
  rw [costResidual_eq_tsub]
  exact (ENat.natCast_sub 5 2).symm

/-- An impossible path has infinite cost, and imposes no extra cost on the row. -/
example : costResidual (⊤ : ℕ∞) (5 : ℕ∞) = (0 : ℕ∞) := by
  rw [costResidual_eq_tsub]
  simp
  rfl

/-- An unbounded target cannot be reached by a finite path without infinite row cost. -/
example : costResidual (2 : ℕ∞) (⊤ : ℕ∞) = (⊤ : ℕ∞) := by
  rw [costResidual_eq_tsub]
  simp
  rfl

example : costContext (fun (_ : Unit) (_ : Unit) => (2 : ℕ∞))
    (fun _ => (3 : ℕ∞)) () = (5 : ℕ∞) := by
  simp only [costContext, iSup_unique]
  exact (ENat.natCast_add 2 3).symm

example : costContext (fun (_ : Unit) (_ : Unit) => (⊤ : ℕ∞))
    (fun _ => (3 : ℕ∞)) () = (⊤ : ℕ∞) := by
  simp only [costContext, iSup_unique]
  change (⊤ : ℕ∞) + 3 = ⊤
  simp

end Graded
