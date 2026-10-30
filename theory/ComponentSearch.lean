import Mathlib.Logic.Relation

/-! Generic serial relation laws for declared component chains. The TypeScript
enumerator and empirical component declarations are not extracted or verified here. -/
namespace ComponentSearch

def chain {A : Type*} : List (A → A → Prop) → A → A → Prop
  | [] => Eq
  | r :: rs => fun x z => ∃ y, r x y ∧ chain rs y z

theorem chain_nil {A : Type*} : chain ([] : List (A → A → Prop)) = Eq := by
  simp [chain]

/-- Splitting an effect chain into two pieces preserves its relational composition. -/
theorem chain_append {A : Type*} (xs ys : List (A → A → Prop)) (x z : A) :
    chain (xs ++ ys) x z ↔ ∃ y, chain xs x y ∧ chain ys y z := by
  induction xs generalizing x with
  | nil => simp [chain]
  | cons r rs ih =>
    simp only [List.cons_append, chain, ih]
    grind

/-- A declared property preserved by every chosen component is preserved by the chain. -/
theorem chain_preserves {A : Type*} (P : A → Prop) (rs : List (A → A → Prop))
    (steps : ∀ r ∈ rs, ∀ x y, P x → r x y → P y)
    {x y : A} (hx : P x) (run : chain rs x y) : P y := by
  induction rs generalizing x with
  | nil => simpa [chain] using run ▸ hx
  | cons r rs ih =>
    obtain ⟨middle, first, rest⟩ := run
    exact ih (by grind) (steps r (by simp) x middle hx first) rest

end ComponentSearch
