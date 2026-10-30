import CategoricalTriz
import Semantics

/-! A trim records each reattachment in the right-hand-side wiring. The retained host is
embedded unchanged provided its wire IDs do not collide with the right-hand side. Typing
alone says nothing about preservation of external behaviour. -/

namespace CategoricalTriz.ControlledTrim

open CategoricalTriz.Wiring

variable {B P W C : Type*} (host : Wiring B P W C)

/-- `reattach` associates each selected cut wire with its replacement. The interface explicitly
records the absorber endpoint, unchanged target and carrier in the rule's RHS. -/
structure Rule where
  deletedBoxes : Set B
  deletedWires : Set W
  rhs : Wiring B P W C
  boundary : Set W
  reattach : W → W
  absorber : W → B × P
  boundary_exact : ∀ w, w ∈ boundary ↔ w ∈ host.wires ∧
    (host.src w).1 ∈ deletedBoxes ∧ (host.tgt w).1 ∉ deletedBoxes
  incident_cut : ∀ w ∈ host.wires,
    (host.src w).1 ∈ deletedBoxes ∨ (host.tgt w).1 ∈ deletedBoxes → w ∈ deletedWires
  absorber_retained : ∀ w ∈ boundary, (absorber w).1 ∈ host.boxes ∧
    (absorber w).1 ∉ deletedBoxes
  absorber_output : ∀ w ∈ boundary,
    host.out (absorber w).1 (absorber w).2 = some (host.carrier w)
  rhs_retained : rhs.boxes ⊆ host.boxes \ deletedBoxes
  no_override : ∀ w ∈ host.wires, w ∉ deletedWires → w ∉ rhs.wires
  output_agrees : ∀ b p c c', rhs.out b p = some c → host.out b p = some c' → c = c'
  input_agrees : ∀ b p c c', rhs.inp b p = some c → host.inp b p = some c' → c = c'
  replacement_present : ∀ w ∈ boundary, reattach w ∈ rhs.wires
  replacement_source : ∀ w ∈ boundary, rhs.src (reattach w) = absorber w
  replacement_target : ∀ w ∈ boundary, rhs.tgt (reattach w) = host.tgt w
  replacement_carrier : ∀ w ∈ boundary, rhs.carrier (reattach w) = host.carrier w

noncomputable def result (r : Rule host) : Wiring B P W C :=
  (host.delete r.deletedBoxes r.deletedWires).overlay r.rhs

/-- No wire left after the cut touches a deleted box. -/
theorem no_dangling (r : Rule host) {w : W} (hw : w ∈ host.wires)
    (hcut : w ∉ r.deletedWires) :
    (host.src w).1 ∉ r.deletedBoxes ∧ (host.tgt w).1 ∉ r.deletedBoxes := by
  constructor <;> intro h
  · exact hcut (r.incident_cut w hw (Or.inl h))
  · exact hcut (r.incident_cut w hw (Or.inr h))

/-- The structural typing guarantee follows from the rule's own interface conditions. -/
theorem typed (r : Rule host) (hh : host.Typed) (hr : r.rhs.Typed) :
    (result host r).Typed :=
  host.typed_dpo hh hr (fun _ hw hcut => no_dangling host r hw hcut)
    r.output_agrees r.input_agrees

/-- Every uncut wire embeds with its endpoints and carrier intact. -/
theorem retained_wire (r : Rule host) {w : W} (hw : w ∈ host.wires)
    (hcut : w ∉ r.deletedWires) :
    w ∈ (result host r).wires ∧ (result host r).src w = host.src w ∧
      (result host r).tgt w = host.tgt w ∧ (result host r).carrier w = host.carrier w := by
  have hfresh := r.no_override w hw hcut
  simp [result, Wiring.overlay, Wiring.delete, hw, hcut, hfresh]

/-- Every declared host output or input port retains its carrier through gluing. -/
theorem retained_output (r : Rule host) {b : B} {p : P} {c : C}
    (hp : host.out b p = some c) : (result host r).out b p = some c := by
  simp only [result, Wiring.overlay, Wiring.delete]
  cases h : r.rhs.out b p with
  | none => simp [hp]
  | some c' =>
    have he := r.output_agrees b p c' c h hp
    simp [he]

theorem retained_input (r : Rule host) {b : B} {p : P} {c : C}
    (hp : host.inp b p = some c) : (result host r).inp b p = some c := by
  simp only [result, Wiring.overlay, Wiring.delete]
  cases h : r.rhs.inp b p with
  | none => simp [hp]
  | some c' =>
    have he := r.input_agrees b p c' c h hp
    simp [he]

/-- Retained boxes remain present. Deleted boxes stay absent if the RHS does not reintroduce them. -/
theorem retained_box (r : Rule host) {b : B} (hb : b ∈ host.boxes)
    (hkeep : b ∉ r.deletedBoxes) : b ∈ (result host r).boxes := by
  exact Or.inl ⟨hb, hkeep⟩

theorem deleted_box_absent (r : Rule host) {b : B} (hdel : b ∈ r.deletedBoxes)
    : b ∉ (result host r).boxes := by
  have hnot : b ∉ r.rhs.boxes := fun hb => (r.rhs_retained hb).2 hdel
  simp [result, Wiring.overlay, Wiring.delete, hdel, hnot]

/-- The declared replacement is present in the result with precisely the specified attachment. -/
theorem attachment (r : Rule host) {w : W} (hw : w ∈ r.boundary) :
    r.reattach w ∈ (result host r).wires ∧
    (result host r).src (r.reattach w) = r.absorber w ∧
    (result host r).tgt (r.reattach w) = host.tgt w ∧
    (result host r).carrier (r.reattach w) = host.carrier w := by
  have hp := r.replacement_present w hw
  simp [result, Wiring.overlay, hp, r.replacement_source w hw,
    r.replacement_target w hw, r.replacement_carrier w hw]

end CategoricalTriz.ControlledTrim

namespace CategoricalTriz.ControlledTrim.Example

open CategoricalTriz.Semantics CategoricalTriz.Semantics.OpenDiagram

/-- The test fixture: boxes 0, 1, 2 emit a, a, b; box 3 is the product. -/
def host : Wiring (Fin 4) Unit Unit Unit where
  boxes := Set.univ
  wires := Set.univ
  src _ := (0, ())
  tgt _ := (3, ())
  carrier _ := ()
  out b _ := if b = 3 then none else some ()
  inp b _ := if b = 3 then some () else none

/-- The same wire is cut and reintroduced with the chosen absorber at its source. -/
def rhs (absorber : Fin 4) : Wiring (Fin 4) Unit Unit Unit where
  boxes := {absorber, 3}
  wires := Set.univ
  src _ := (absorber, ())
  tgt _ := (3, ())
  carrier _ := ()
  out b _ := if b = 3 then none else some ()
  inp b _ := if b = 3 then some () else none

def rule (absorber : Fin 4) (h0 : absorber ≠ 0) (h3 : absorber ≠ 3) : Rule host where
  deletedBoxes := {0}
  deletedWires := Set.univ
  rhs := rhs absorber
  boundary := Set.univ
  reattach := id
  absorber := fun _ => (absorber, ())
  boundary_exact := by simp [host]
  incident_cut := by simp
  absorber_retained := by simp [host, h0]
  absorber_output := by simp [host, h3]
  rhs_retained := by
    intro b hb
    simp only [rhs, Set.mem_insert_iff, Set.mem_singleton_iff] at hb
    rcases hb with rfl | rfl
    · simpa [host] using h0
    · simp [host]
  no_override := by simp
  output_agrees := by intros; simp_all [rhs, host]
  input_agrees := by intros; simp_all [rhs, host]
  replacement_present := by simp [rhs]
  replacement_source := by simp [rhs]
  replacement_target := by simp [rhs, host]
  replacement_carrier := by simp [rhs, host]

/-- Interpret the retained source rows and product port as an open diagram, using the
actual source selected by the structural rewrite. Values false and true stand for a and b. -/
noncomputable def diagram (absorber : Fin 4) (h0 : absorber ≠ 0) (h3 : absorber ≠ 3) : OpenDiagram Bool Empty Unit where
  Port := Fin 4
  Box := Unit
  Wire := Unit
  values _ := Set.univ
  behavior _ := {s | s 1 = false ∧ s 2 = true}
  src w := ((result host (rule absorber h0 h3)).src w).1
  tgt w := ((result host (rule absorber h0 h3)).tgt w).1
  input := Empty.elim
  output _ := 3

theorem compatible : host.Typed ∧ (rhs 1).Typed ∧ (rhs 2).Typed := by
  simp [Wiring.Typed, host, rhs]

theorem results_typed : (result host (rule 1 (by decide) (by decide))).Typed ∧
    (result host (rule 2 (by decide) (by decide))).Typed :=
  ⟨typed host _ compatible.1 compatible.2.1, typed host _ compatible.1 compatible.2.2⟩

/-- Two carrier-compatible absorbers in the same fixture deliver different product values. -/
theorem absorber_changes_behavior :
    (diagram 1 (by decide) (by decide)).external (Empty.elim) (fun _ => false) ∧
    ¬ (diagram 2 (by decide) (by decide)).external (Empty.elim) (fun _ => false) := by
  constructor
  · refine ⟨(fun i : Fin 4 => if i = 2 then true else false), ?_, ?_, ?_⟩
    · simp [diagram, OpenDiagram.steadyStates, result, rule, rhs, Wiring.overlay]
      change (false = false ∧ true = true) ∧ false = false
      exact ⟨⟨rfl, rfl⟩, rfl⟩
    · funext i; exact nomatch i
    · funext i; cases i; rfl
  · rintro ⟨s, hs, _, ho⟩
    have h := congrFun ho ()
    simp [diagram, OpenDiagram.steadyStates, result, rule, rhs, Wiring.overlay] at hs h
    exact Bool.noConfusion (hs.1.2.symm.trans (hs.2.trans h))

end CategoricalTriz.ControlledTrim.Example
