import Mathlib.Algebra.Order.BigOperators.Group.Finset
import Mathlib.Data.Fintype.Card
import Mathlib.Data.Rat.Defs
import Mathlib.Tactic.Linarith

/- Finite cycle bounds, independent of a graph-search algorithm. A permutation
   closes the successor vertices, including repeated vertices and disjoint cycles. -/
namespace MeanCost
open Finset

theorem telescope {V : Type*} {n : ℕ} (v : Fin n → V)
    (σ : Equiv.Perm (Fin n)) (p : V → ℚ) :
    ∑ i, (p (v i) - p (v (σ i))) = 0 := by
  rw [sum_sub_distrib]
  have h : ∑ i, p (v (σ i)) = ∑ i, p (v i) := Equiv.sum_comp σ (p ∘ v)
  rw [h, sub_self]

theorem cycle_lower {V : Type*} {n : ℕ} (v : Fin n → V)
    (σ : Equiv.Perm (Fin n)) (c : V → V → ℚ) (p : V → ℚ) (bound : ℚ)
    (h : ∀ i, bound ≤ c (v i) (v (σ i)) + p (v i) - p (v (σ i))) :
    (n : ℚ) * bound ≤ ∑ i, c (v i) (v (σ i)) := by
  have hs := sum_le_sum (s := univ) (fun i _ => h i)
  have ht := telescope v σ p
  simp only [sum_sub_distrib, sum_add_distrib, sum_const, card_fin, nsmul_eq_mul] at hs ht
  linarith

theorem cycle_upper {V : Type*} {n : ℕ} (v : Fin n → V)
    (σ : Equiv.Perm (Fin n)) (c : V → V → ℚ) (p : V → ℚ) (bound : ℚ)
    (h : ∀ i, c (v i) (v (σ i)) + p (v i) - p (v (σ i)) ≤ bound) :
    ∑ i, c (v i) (v (σ i)) ≤ (n : ℚ) * bound := by
  have hs := sum_le_sum (s := univ) (fun i _ => h i)
  have ht := telescope v σ p
  simp only [sum_sub_distrib, sum_add_distrib, sum_const, card_fin, nsmul_eq_mul] at hs ht
  linarith

theorem attains_bound {n : ℕ} (hn : 0 < n) (total bound : ℚ)
    (h : total = (n : ℚ) * bound) : total / (n : ℚ) = bound := by
  have nz : (n : ℚ) ≠ 0 := by exact_mod_cast (Nat.ne_of_gt hn)
  rw [h, mul_div_cancel_left₀ bound nz]
def Bounds {n m : ℕ} (src tgt : Fin m → Fin n) (cost : Fin m → ℚ)
    (lower upper : Fin n → ℚ) (lo hi : ℚ) : Prop :=
  (∀ e, lo ≤ cost e + lower (src e) - lower (tgt e)) ∧
  (∀ e, cost e + upper (src e) - upper (tgt e) ≤ hi)

instance {n m : ℕ} (src tgt : Fin m → Fin n) (cost : Fin m → ℚ)
    (lower upper : Fin n → ℚ) (lo hi : ℚ) :
    Decidable (Bounds src tgt cost lower upper lo hi) := inferInstanceAs (Decidable (_ ∧ _))

def CycleWitness {n m : ℕ} (src tgt : Fin m → Fin n) (cost : Fin m → ℚ)
    (bound : ℚ) (w : List (Fin m)) : Prop :=
  w ≠ [] ∧ (∀ e ∈ w.zip (w.rotate 1), tgt e.1 = src e.2) ∧
    (w.map cost).sum = (w.length : ℚ) * bound

instance {n m : ℕ} (src tgt : Fin m → Fin n) (cost : Fin m → ℚ)
    (bound : ℚ) (w : List (Fin m)) : Decidable (CycleWitness src tgt cost bound w) :=
  inferInstanceAs (Decidable (_ ∧ _ ∧ _))
end MeanCost
