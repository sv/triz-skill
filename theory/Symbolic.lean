import Std

/-! Finite, stateless symbolic summaries. Only the standard Lean kernel is needed.
The generic laws do not verify TypeScript. Concrete generated certificates check the
recognizer's complete relations, typed tables, and grouped DAG edges independently. -/
namespace Symbolic

universe u v w
abbrev Rel (A : Type u) (B : Type v) := A → B → Prop

def graph {A : Type u} {B : Type v} (f : A → B) : Rel A B := fun a b => f a = b
def comp {A : Type u} {B : Type v} {C : Type w} (r : Rel A B) (s : Rel B C) : Rel A C :=
  fun a c => ∃ b, r a b ∧ s b c

/-- Recognition uses a COMPLETE finite relation, not a name or a sample of its rows. -/
theorem recognition_correct {A : Type u} {B : Type v} [DecidableEq A] [DecidableEq B]
    (rows : List (A × B)) (f : A → B)
    (complete : ∀ a b, (a, b) ∈ rows ↔ f a = b) :
    (fun a b => (a, b) ∈ rows) = graph f := by
  funext a b
  exact propext (complete a b)

/-- The shared middle TYPE is explicit. Equal cardinalities do not suffice. -/
theorem typed_composition {A : Type u} {B : Type v} {C : Type w} (f : A → B) (g : B → C) :
    comp (graph f) (graph g) = graph (g ∘ f) := by
  funext a c
  apply propext
  simp [comp, graph]

/-- Substitution in an arbitrary context, including disconnected/feedback constraints.
Nothing assumes that the rest of the model is total or acyclic. -/
theorem boundary_substitution {A : Type u} {B : Type v} {X : Type w}
    (context : X → A → B → Prop) (r s : Rel A B) (same : r = s) :
    (fun x => ∃ a b, context x a b ∧ r a b) =
    (fun x => ∃ a b, context x a b ∧ s a b) := by
  simp [same]

/-- Grouping preserves the supporting CHOICES rather than identifying their properties. -/
def grouped {Choice : Type u} {Summary : Type v} (summary : Choice → Summary)
    (supports : Choice → Prop) (s : Summary) (c : Choice) := supports c ∧ summary c = s

theorem grouped_supports_correct {Choice : Type u} {Summary : Type v}
    (summary : Choice → Summary) (supports : Choice → Prop) (target : Summary → Prop)
    (c : Choice) :
    (∃ s, grouped summary supports s c ∧ target s) ↔ supports c ∧ target (summary c) := by
  constructor
  · rintro ⟨s, ⟨hs, rfl⟩, ht⟩
    exact ⟨hs, ht⟩
  · rintro ⟨hs, ht⟩
    exact ⟨summary c, ⟨hs, rfl⟩, ht⟩

/-- A layered automaton has a distinct edge relation at each prefix. -/
def Run {S C : Type} : List (S → C → S → Prop) → List C → S → S → Prop
  | [], [], s, t => s = t
  | e :: es, c :: cs, s, t => ∃ m, e s c m ∧ Run es cs m t
  | _, _, _, _ => False

def viable {S C : Type} (es : List (S → C → S → Prop)) (target : S → Prop) (s : S) :=
  ∃ cs t, Run es cs s t ∧ target t

def backward {S C : Type} : List (S → C → S → Prop) → (S → Prop) → List (S → C → S → Prop)
  | [], _ => []
  | e :: es, target => (fun s c t => e s c t ∧ viable es target t) :: backward es target

/-- Backward pruning preserves EXACTLY every accepted concrete word, including multiplicity
from distinct choice ids. Thus counting or selecting a first word in any order is preserved. -/
theorem backward_pruning_correct {S C : Type} (es : List (S → C → S → Prop))
    (target : S → Prop) (cs : List C) (s t : S) :
    (Run es cs s t ∧ target t) ↔ (Run (backward es target) cs s t ∧ target t) := by
  induction es generalizing cs s with
  | nil => cases cs <;> simp [Run, backward]
  | cons e es ih =>
    cases cs with
    | nil => simp [Run, backward]
    | cons c cs =>
      constructor
      · rintro ⟨⟨m, he, hr⟩, ht⟩
        exact ⟨⟨m, ⟨he, cs, t, hr, ht⟩, ((ih cs m).mp ⟨hr, ht⟩).1⟩, ht⟩
      · rintro ⟨⟨m, he, hr⟩, ht⟩
        exact ⟨⟨m, he.1, ((ih cs m).mpr ⟨hr, ht⟩).1⟩, ht⟩

/-- Engineering predicates stay indexed by concrete choices and are unaffected by grouping. -/
theorem engineering_preserved {S C : Type} (es : List (S → C → S → Prop))
    (target : S → Prop) (engineering : List C → Prop) (cs : List C) (s t : S) :
    (Run es cs s t ∧ target t ∧ engineering cs) ↔
    (Run (backward es target) cs s t ∧ target t ∧ engineering cs) := by
  have h := backward_pruning_correct es target cs s t
  constructor
  · rintro ⟨hr, ht, he⟩
    exact ⟨(h.mp ⟨hr, ht⟩).1, ht, he⟩
  · rintro ⟨hr, ht, he⟩
    exact ⟨(h.mpr ⟨hr, ht⟩).1, ht, he⟩

/-- The same ordered list of concrete accepted implementations survives pruning. Its length,
head and enumeration order are consequently identical; resource predicates remain per word. -/
theorem accepted_words_preserved {S C : Type} (es : List (S → C → S → Prop))
    (target : S → Prop) (engineering : List C → Prop) (words : List (List C)) (s t : S) :
    words.filter (fun cs => @decide (Run es cs s t ∧ target t ∧ engineering cs)
      (Classical.propDecidable _)) =
    words.filter (fun cs => @decide (Run (backward es target) cs s t ∧ target t ∧ engineering cs)
      (Classical.propDecidable _)) := by
  apply List.filter_congr
  intro cs _
  exact congrArg (fun p => @decide p (Classical.propDecidable p)) (propext (engineering_preserved es target engineering cs s t))

/-- Under a proved involution law, every copy/involution prefix is one of TWO maps. -/
def toggle {A : Type} (f : A → A) (b : Bool) (x : A) := if b then f x else x

theorem toggle_comp {A : Type} (f : A → A) (inv : ∀ x, f (f x) = x) (a b : Bool) (x : A) :
    toggle f b (toggle f a x) = toggle f (Bool.xor a b) x := by
  cases a <;> cases b <;> simp [toggle, inv]

def runToggles {A : Type} (f : A → A) : List Bool → A → A
  | [], x => x
  | b :: bs, x => runToggles f bs (toggle f b x)

def parity : List Bool → Bool
  | [] => false
  | b :: bs => Bool.xor b (parity bs)

theorem chain_parity {A : Type} (f : A → A) (inv : ∀ x, f (f x) = x) (bs : List Bool) (x : A) :
    runToggles f bs x = toggle f (parity bs) x := by
  induction bs generalizing x with
  | nil => simp [runToggles, parity, toggle]
  | cons b bs ih => rw [runToggles, ih, toggle_comp f inv]; rfl

theorem chain_two_maps {A : Type} (f : A → A) (inv : ∀ x, f (f x) = x) (bs : List Bool) :
    runToggles f bs = (fun x => x) ∨ runToggles f bs = f := by
  have h := funext (chain_parity f inv bs)
  cases hp : parity bs with
  | false => exact Or.inl (funext fun x => by simpa [hp, toggle] using congrFun h x)
  | true => exact Or.inr (funext fun x => by simpa [hp, toggle] using congrFun h x)

theorem two_maps_distinct {A : Type} (f : A → A) (nontrivial : ∃ x, f x ≠ x) :
    (fun x => x) ≠ f := by
  intro h
  obtain ⟨x, hx⟩ := nontrivial
  exact hx (congrFun h x).symm

/-! Executable certificate encoding. UTF-16 code-unit lists preserve explicit carrier/value identity;
all indices are local to those domains. No native_decide/bv_decide is used. -/
structure MapTable where
  source : List Nat
  target : List Nat
  inputs : List (List Nat)
  outputs : List (List Nat)
  image : List Nat
  deriving DecidableEq, Inhabited, Repr

structure Primitive where
  map : MapTable
  rows : List (Nat × Nat)
  deriving DecidableEq, Inhabited, Repr

structure Edge where
  src : Nat
  dst : Nat
  primitive : Nat
  choices : List Nat
  deriving DecidableEq, Repr

structure Stage where
  box : List Nat
  hole : Option Nat
  choiceCount : Nat
  primitives : List Primitive
  edges : List Edge
  deriving DecidableEq, Inhabited, Repr

def validMap (m : MapTable) : Prop :=
  m.inputs ≠ [] ∧ m.outputs ≠ [] ∧ m.inputs.Nodup ∧ m.outputs.Nodup ∧
    m.image.length = m.inputs.length ∧ ∀ y ∈ m.image, y < m.outputs.length
instance (m : MapTable) : Decidable (validMap m) := by unfold validMap; infer_instance

def graphRows (m : MapTable) := (List.range m.inputs.length).map (fun x => (x, m.image[x]!))
def primitiveOK (p : Primitive) : Prop := validMap p.map ∧
  (∀ r ∈ p.rows, r ∈ graphRows p.map) ∧ (∀ r ∈ graphRows p.map, r ∈ p.rows)
instance (p : Primitive) : Decidable (primitiveOK p) := by unfold primitiveOK; infer_instance

theorem checked_recognition (p : Primitive) (h : primitiveOK p) (r : Nat × Nat) :
    r ∈ p.rows ↔ r ∈ graphRows p.map := ⟨h.2.1 r, h.2.2 r⟩

theorem checked_total (p : Primitive) (h : primitiveOK p) (x : Nat)
    (hx : x < p.map.inputs.length) : (x, p.map.image[x]!) ∈ p.rows := by
  apply h.2.2
  exact List.mem_map.mpr ⟨x, List.mem_range.mpr hx, rfl⟩

theorem checked_deterministic (p : Primitive) (h : primitiveOK p) (x y z : Nat)
    (hy : (x, y) ∈ p.rows) (hz : (x, z) ∈ p.rows) : y = z := by
  obtain ⟨a, _, ha⟩ := List.mem_map.mp (h.2.1 _ hy)
  obtain ⟨b, _, hb⟩ := List.mem_map.mp (h.2.1 _ hz)
  have ax : a = x := congrArg Prod.fst ha
  have bx : b = x := congrArg Prod.fst hb
  subst a; subst b
  exact (congrArg Prod.snd ha).symm.trans (congrArg Prod.snd hb)

def compositionOK (a b c : MapTable) : Prop :=
  a.target = b.source ∧ a.outputs = b.inputs ∧ a.source = c.source ∧ b.target = c.target ∧
    a.inputs = c.inputs ∧ b.outputs = c.outputs ∧
    ∀ x ∈ List.range a.inputs.length, c.image[x]? = a.image[x]?.bind (fun y => b.image[y]?)
instance (a b c : MapTable) : Decidable (compositionOK a b c) := by unfold compositionOK; infer_instance

theorem checked_composition (a b c : MapTable) (h : compositionOK a b c)
    (x : Nat) (hx : x ∈ List.range a.inputs.length) :
    c.image[x]? = a.image[x]?.bind (fun y => b.image[y]?) := h.2.2.2.2.2.2 x hx

theorem checked_composition_relation (a b c : MapTable) (h : compositionOK a b c)
    (x z : Nat) (hx : x ∈ List.range a.inputs.length) :
    c.image[x]? = some z ↔ ∃ y, a.image[x]? = some y ∧ b.image[y]? = some z := by
  rw [checked_composition a b c h x hx]
  cases a.image[x]? <;> simp

def edgeOK (before after : List MapTable) (s : Stage) (e : Edge) : Prop :=
  e.src < before.length ∧ e.dst < after.length ∧ e.primitive < s.primitives.length ∧
  e.choices ≠ [] ∧ e.choices.Nodup ∧
  compositionOK before[e.src]! s.primitives[e.primitive]!.map after[e.dst]! ∧
  ∀ c ∈ e.choices, c < s.primitives.length ∧ s.primitives[c]!.map = s.primitives[e.primitive]!.map
instance (before after : List MapTable) (s : Stage) (e : Edge) : Decidable (edgeOK before after s e) := by
  unfold edgeOK; infer_instance

def supports (s : Stage) (src choice : Nat) :=
  s.edges.filter (fun e => e.src == src && e.choices.contains choice)

def stageOK (before after : List MapTable) (s : Stage) : Prop :=
  s.primitives ≠ [] ∧ after ≠ [] ∧ after.Nodup ∧
  (∀ m ∈ before, validMap m) ∧ (∀ m ∈ after, validMap m) ∧
  (∀ p ∈ s.primitives, primitiveOK p) ∧ (∀ e ∈ s.edges, edgeOK before after s e) ∧
  (∀ f ∈ List.range before.length, ∀ c ∈ List.range s.primitives.length, (supports s f c).length = 1) ∧
  (∀ t ∈ List.range after.length, t ∈ s.edges.map Edge.dst) ∧
  s.choiceCount = s.primitives.length ∧ (s.hole = none → s.choiceCount = 1)
instance (before after : List MapTable) (s : Stage) : Decidable (stageOK before after s) := by
  unfold stageOK; infer_instance

/-- Coverage and uniqueness of grouped choice supports are checked, rather than assumed. -/
theorem checked_supports (before after : List MapTable) (s : Stage) (h : stageOK before after s)
    (f c : Nat) (hf : f ∈ List.range before.length) (hc : c ∈ List.range s.primitives.length) :
    (supports s f c).length = 1 := h.2.2.2.2.2.2.2.1 f hf c hc

/-- Every checked grouped edge composes the map of EACH concrete choice on that edge. -/
theorem checked_edge_relation (before after : List MapTable) (s : Stage)
    (h : stageOK before after s) (e : Edge) (he : e ∈ s.edges)
    (c : Nat) (hc : c ∈ e.choices) (x z : Nat)
    (hx : x ∈ List.range before[e.src]!.inputs.length) :
    after[e.dst]!.image[x]? = some z ↔
      ∃ y, before[e.src]!.image[x]? = some y ∧ s.primitives[c]!.map.image[y]? = some z := by
  have ok := h.2.2.2.2.2.2.1 e he
  have same := (ok.2.2.2.2.2.2 c hc).2
  rw [same]
  exact checked_composition_relation _ _ _ ok.2.2.2.2.2.1 x z hx

/-- A whole region must connect EVERY layer to a checked stage. Prefix-only certificates,
extra unchecked terminal layers, and repeated concrete holes are rejected. -/
def regionOK (layers : List (List MapTable)) (stages : List Stage) : Prop :=
  stages ≠ [] ∧ layers.length = stages.length + 1 ∧ layers[0]!.length = 1 ∧
  validMap layers[0]![0]! ∧ layers[0]![0]!.source = layers[0]![0]!.target ∧
  layers[0]![0]!.inputs = layers[0]![0]!.outputs ∧
  layers[0]![0]!.image = List.range layers[0]![0]!.inputs.length ∧
  (stages.map Stage.box).Nodup ∧ (stages.filterMap Stage.hole).Nodup ∧
  ∀ i ∈ List.range stages.length, stageOK layers[i]! layers[i + 1]! stages[i]!
instance (layers : List (List MapTable)) (stages : List Stage) : Decidable (regionOK layers stages) := by
  unfold regionOK; infer_instance

theorem checked_region_stage (layers : List (List MapTable)) (stages : List Stage)
    (h : regionOK layers stages) (i : Nat) (hi : i ∈ List.range stages.length) :
    stageOK layers[i]! layers[i + 1]! stages[i]! := h.2.2.2.2.2.2.2.2.2 i hi

end Symbolic
