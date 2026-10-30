import Mathlib.Algebra.Order.BigOperators.Group.Finset
import Mathlib.Data.Fintype.Card
import Mathlib.Data.Rat.Cast.Order
import Mathlib.Tactic.Linarith
import Mathlib.Probability.Kernel.Invariance
import Mathlib.MeasureTheory.Measure.Dirac.Basic

namespace Lifecycle
open Finset

/-- A finite rational stochastic matrix; no global instances are introduced. -/
structure Chain (S : Type*) [Fintype S] where
  matrix : S → S → ℚ
  nonnegative : ∀ i j, 0 ≤ matrix i j
  stochastic : ∀ i, ∑ j, matrix i j = 1

def Stationary {S : Type*} [Fintype S] (P : S → S → ℚ) (pi : S → ℚ) : Prop :=
  (∀ j, ∑ i, pi i * P i j = pi j) ∧ (∑ i, pi i = 1) ∧ ∀ i, 0 ≤ pi i

instance {S : Type*} [Fintype S] [DecidableEq S] (P : S → S → ℚ) (pi : S → ℚ) :
    Decidable (Stationary P pi) := inferInstanceAs (Decidable (_ ∧ _ ∧ _))

/-- A bridge from a rational matrix certificate to Kernel.Invariant. The mass and
    pushforward equations explicitly state the encoding compatibility required. -/
theorem stationary_invariant {S : Type*} [Fintype S] [MeasurableSpace S]
    [MeasurableSingletonClass S] (P : S → S → ℚ) (pi : S → ℚ)
    (h : Stationary P pi) (kernel : ProbabilityTheory.Kernel S S)
    (mu : MeasureTheory.Measure S)
    (mass : ∀ j, mu {j} = ENNReal.ofReal (pi j : ℝ))
    (push : ∀ j, (mu.bind kernel) {j} = ENNReal.ofReal ((∑ i, pi i * P i j : ℚ) : ℝ)) :
    kernel.Invariant mu := by
  apply MeasureTheory.Measure.ext_of_singleton
  intro j
  rw [push, h.1 j, mass]

/-- Summing the gain/bias inequality against any stationary competitor cancels
    the bias. This is a stationary expected-cost statement, not an ergodic theorem. -/
theorem stationary_cost_lower {S : Type*} [Fintype S]
    (P : S → S → ℚ) (pi cost bias : S → ℚ) (gain : ℚ)
    (stat : Stationary P pi)
    (bound : ∀ i, gain + bias i ≤ cost i + ∑ j, P i j * bias j) :
    gain ≤ ∑ i, pi i * cost i := by
  have hb := sum_le_sum (s := univ) (fun i _ => mul_le_mul_of_nonneg_left (bound i) (stat.2.2 i))
  have cancel : ∑ i, pi i * (∑ j, P i j * bias j) = ∑ j, pi j * bias j := by
    simp_rw [mul_sum, ← mul_assoc]
    rw [sum_comm]
    simp_rw [← sum_mul, stat.1]
  simp_rw [mul_add, sum_add_distrib] at hb
  rw [← sum_mul, stat.2.1, one_mul, cancel] at hb
  linarith

theorem policy_attains_gain {S : Type*} [Fintype S]
    (P : S → S → ℚ) (pi cost bias : S → ℚ) (gain : ℚ)
    (stat : Stationary P pi)
    (eqn : ∀ i, gain + bias i = cost i + ∑ j, P i j * bias j) :
    (∑ i, pi i * cost i) = gain := by
  apply le_antisymm
  · have h := stationary_cost_lower P pi (fun i => -cost i) (fun i => -bias i) (-gain) stat
    have b : ∀ i, -gain + -bias i ≤ -cost i + ∑ j, P i j * -bias j := by
      intro i
      simp only [mul_neg, sum_neg_distrib]
      linarith [eqn i]
    have hh := h b
    simp only [mul_neg, sum_neg_distrib] at hh
    linarith
  · exact stationary_cost_lower P pi cost bias gain stat (fun i => le_of_eq (eqn i))
def Optimality {n a : ℕ} (P : Fin n → Fin n → ℚ) (cost bias : Fin n → ℚ)
    (gain : ℚ) (owner : Fin a → Fin n) (alternatives : Fin a → Fin n → ℚ)
    (alternativeCost : Fin a → ℚ) (policy : Fin n → Fin a) : Prop :=
  (∀ i, owner (policy i) = i ∧ P i = alternatives (policy i) ∧ cost i = alternativeCost (policy i)) ∧
  (∀ i, gain + bias i = cost i + ∑ j, P i j * bias j) ∧
  (∀ a, (∀ j, 0 ≤ alternatives a j) ∧ (∑ j, alternatives a j = 1) ∧
    gain + bias (owner a) ≤ alternativeCost a + ∑ j, alternatives a j * bias j)

instance {n a : ℕ} (P : Fin n → Fin n → ℚ) (cost bias : Fin n → ℚ)
    (gain : ℚ) (owner : Fin a → Fin n) (alternatives : Fin a → Fin n → ℚ)
    (alternativeCost : Fin a → ℚ) (policy : Fin n → Fin a) :
    Decidable (Optimality P cost bias gain owner alternatives alternativeCost policy) :=
  inferInstanceAs (Decidable (_ ∧ _ ∧ _))

theorem optimality_stationary {n a : ℕ} (P : Fin n → Fin n → ℚ)
    (cost bias : Fin n → ℚ) (gain : ℚ) (owner : Fin a → Fin n)
    (alternatives : Fin a → Fin n → ℚ) (alternativeCost : Fin a → ℚ)
    (policy choose : Fin n → Fin a) (pi : Fin n → ℚ)
    (cert : Optimality P cost bias gain owner alternatives alternativeCost policy)
    (enabled : ∀ i, owner (choose i) = i)
    (stat : Stationary (fun i => alternatives (choose i)) pi) :
    gain ≤ ∑ i, pi i * alternativeCost (choose i) := by
  apply stationary_cost_lower (fun i => alternatives (choose i)) pi
    (fun i => alternativeCost (choose i)) bias gain stat
  intro i
  simpa [enabled i] using (cert.2.2 (choose i)).2.2
end Lifecycle
