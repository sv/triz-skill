import Mathlib.Algebra.Order.BigOperators.Group.Finset
import Mathlib.Data.Fintype.Card
import Mathlib.Data.Rat.Defs
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.Ring
import Mathlib.Algebra.Order.BigOperators.Group.List
import Mathlib.Data.List.Rotate
import Mathlib.Data.List.Zip

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
private theorem sum_expand {E : Type*} (w : List E) (c p q : E → ℚ) :
    (w.map (fun e => c e + p e - q e)).sum = (w.map c).sum + (w.map p).sum - (w.map q).sum := by
  induction w with
  | nil => simp
  | cons a xs ih => simp only [List.map_cons, List.sum_cons]; rw [ih]; ring
private theorem sum_constant {E : Type*} (w : List E) (a : ℚ) :
    (w.map (fun _ => a)).sum = (w.length : ℚ) * a := by
  induction w with
  | nil => simp
  | cons x xs ih => simp only [List.map_cons, List.sum_cons, List.length_cons]; rw [ih]; push_cast; ring
theorem Bounds.walk_mean {n m : ℕ} {src tgt : Fin m → Fin n} {cost : Fin m → ℚ}
    {lower upper : Fin n → ℚ} {lo hi : ℚ} (h : Bounds src tgt cost lower upper lo hi)
    (w : List (Fin m)) (closed : ∀ e ∈ w.zip (w.rotate 1), tgt e.1 = src e.2) :
    (w.length : ℚ) * lo ≤ (w.map cost).sum ∧ (w.map cost).sum ≤ (w.length : ℚ) * hi := by
  have balance (p : Fin n → ℚ) : (w.map (fun e => p (src e))).sum = (w.map (fun e => p (tgt e))).sum := by
    have fst := List.map_fst_zip (l₁ := w) (l₂ := w.rotate 1) (by simp)
    have snd := List.map_snd_zip (l₁ := w) (l₂ := w.rotate 1) (by simp)
    have eq : ((w.zip (w.rotate 1)).map (fun e => p (tgt e.1))) =
        ((w.zip (w.rotate 1)).map (fun e => p (src e.2))) :=
      List.map_congr_left (fun e he => congrArg p (closed e he))
    have eq' := congrArg List.sum eq
    have left : ((w.zip (w.rotate 1)).map (fun e => p (tgt e.1))) = w.map (fun e => p (tgt e)) := by
      simpa only [List.map_map, Function.comp_def] using congrArg (List.map (fun e => p (tgt e))) fst
    have right : ((w.zip (w.rotate 1)).map (fun e => p (src e.2))) = (w.rotate 1).map (fun e => p (src e)) := by
      simpa only [List.map_map, Function.comp_def] using congrArg (List.map (fun e => p (src e))) snd
    rw [left, right, ((w.rotate_perm 1).map (fun e => p (src e))).sum_eq] at eq'
    exact eq'.symm
  have lowerSum := List.sum_le_sum (l := w) (fun e _ => h.1 e)
  have upperSum := List.sum_le_sum (l := w) (fun e _ => h.2 e)
  have sumShift (p : Fin n → ℚ) :
      (w.map (fun e => cost e + p (src e) - p (tgt e))).sum = (w.map cost).sum := by
    rw [sum_expand, balance p]
    ring
  rw [sum_constant] at lowerSum
  rw [sum_constant] at upperSum
  rw [sumShift lower] at lowerSum
  rw [sumShift upper] at upperSum
  exact ⟨lowerSum, upperSum⟩
end MeanCost
