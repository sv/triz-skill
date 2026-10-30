import Semantics

/-! Semantic transport under renaming. These results concern the mathematical diagrams, not
an extraction of the capped TypeScript searches or the identity of a selected witness. -/
namespace CategoricalTriz.Semantics
open OpenDiagram
universe u
variable {V I O I' O' : Type u}

/-- Rename every index of an open diagram by a bijection. -/
def renameDiagram (d : OpenDiagram V I O) {P B W : Type u}
    (ep : d.Port ≃ P) (eb : d.Box ≃ B) (ew : d.Wire ≃ W)
    (ei : I ≃ I') (eo : O ≃ O') : OpenDiagram V I' O' where
  Port := P
  Box := B
  Wire := W
  values p := d.values (ep.symm p)
  behavior b := {s | (s ∘ ep) ∈ d.behavior (eb.symm b)}
  src w := ep (d.src (ew.symm w))
  tgt w := ep (d.tgt (ew.symm w))
  input i := ep (d.input (ei.symm i))
  output o := ep (d.output (eo.symm o))

/-- A renamed valuation is steady exactly when its pullback is steady. -/
theorem steady_rename (d : OpenDiagram V I O) {P B W : Type u}
    (ep : d.Port ≃ P) (eb : d.Box ≃ B) (ew : d.Wire ≃ W)
    (ei : I ≃ I') (eo : O ≃ O') (s : P → V) :
    s ∈ (renameDiagram d ep eb ew ei eo).steadyStates ↔ s ∘ ep ∈ d.steadyStates := by
  simp only [OpenDiagram.steadyStates, renameDiagram, Set.mem_setOf_eq, Function.comp_apply]
  constructor
  · rintro ⟨hv, hb, hw⟩
    refine ⟨fun p => ?_, fun b => ?_, fun w => ?_⟩
    · simpa using hv (ep p)
    · have h := hb (eb b)
      change s ∘ ep ∈ d.behavior (eb.symm (eb b)) at h
      simpa using h
    · simpa using hw (ew w)
  · rintro ⟨hv, hb, hw⟩
    refine ⟨fun p => ?_, fun b => ?_, fun w => ?_⟩
    · simpa using hv (ep.symm p)
    · exact hb (eb.symm b)
    · exact hw (ew.symm w)

/-- Boundary inputs and outputs are transported with their own bijections, including witnesses. -/
theorem external_rename (d : OpenDiagram V I O) {P B W : Type u}
    (ep : d.Port ≃ P) (eb : d.Box ≃ B) (ew : d.Wire ≃ W)
    (ei : I ≃ I') (eo : O ≃ O') (x : I → V) (y : O → V) :
    (renameDiagram d ep eb ew ei eo).external (x ∘ ei.symm) (y ∘ eo.symm) ↔ d.external x y := by
  constructor
  · rintro ⟨s, hs, hx, hy⟩
    refine ⟨s ∘ ep, (steady_rename d ep eb ew ei eo s).mp hs, ?_, ?_⟩
    · funext i
      have h := congrFun hx (ei i)
      simpa [renameDiagram, Function.comp_apply] using h
    · funext o
      have h := congrFun hy (eo o)
      simpa [renameDiagram, Function.comp_apply] using h
  · rintro ⟨s, hs, hx, hy⟩
    refine ⟨s ∘ ep.symm, (steady_rename d ep eb ew ei eo _).mpr ?_, ?_, ?_⟩
    · simpa [Function.comp_def] using hs
    · funext i
      have h := congrFun hx (ei.symm i)
      simpa [renameDiagram, Function.comp_apply] using h
    · funext o
      have h := congrFun hy (eo.symm o)
      simpa [renameDiagram, Function.comp_apply] using h
/-- Renaming a context with an open hole transports its declared relation and both boundary
valuation witnesses. The `Option` equivalence preserves the distinguished hole. -/
theorem hole_external_rename (d : OpenDiagram V I O) {P B W Qi Qo : Type u}
    (ep : d.Port ≃ P) (eb : d.Box ≃ B) (ew : d.Wire ≃ W)
    (ei : I ≃ I') (eo : O ≃ O') (pin : Qi → d.Port) (pout : Qo → d.Port)
    (r : SetRel (Qi → V) (Qo → V)) (x : I → V) (y : O → V) :
    (renameDiagram (d.withHole pin pout r) ep (Equiv.optionCongr eb) ew ei eo).external
      (x ∘ ei.symm) (y ∘ eo.symm) ↔ (x, y) ∈ d.holeContext pin pout r := by
  exact external_rename (d.withHole pin pout r) ep (Equiv.optionCongr eb) ew ei eo x y

/-- Transport a set and each of its witnesses along a bijection. -/
def transportSet {A A' : Type u} (e : A ≃ A') (s : Set A) : Set A' :=
  {x | e.symm x ∈ s}

@[simp] theorem transportSet_singleton {A A' : Type u} (e : A ≃ A') (x : A) :
    transportSet e {x} = {e x} := by
  ext y
  simp [transportSet, Equiv.symm_apply_eq]

/-- Transporting a set preserves membership, with the witness carried by the bijection. -/
@[simp] theorem mem_transportSet {A A' : Type u} (e : A ≃ A') (s : Set A) (x : A) :
    e x ∈ transportSet e s ↔ x ∈ s := by simp [transportSet]

/-- The output relation of a renamed hole diagram is exactly the transported hole context.
Hole port labels are held fixed; external input and output labels may both change. -/
theorem hole_context_transport (d : OpenDiagram V I O) {P B W Qi Qo : Type u}
    (ep : d.Port ≃ P) (eb : d.Box ≃ B) (ew : d.Wire ≃ W)
    (ei : I ≃ I') (eo : O ≃ O') (pin : Qi → d.Port) (pout : Qo → d.Port)
    (r : SetRel (Qi → V) (Qo → V)) :
    {p | (renameDiagram (d.withHole pin pout r) ep (Equiv.optionCongr eb) ew ei eo).external p.1 p.2} =
      transportSet (Equiv.prodCongr (Equiv.arrowCongr ei (Equiv.refl V))
        (Equiv.arrowCongr eo (Equiv.refl V))) (d.holeContext pin pout r) := by
  ext ⟨x, y⟩
  have h := hole_external_rename d ep eb ew ei eo pin pout r (x ∘ ei) (y ∘ eo)
  simpa [transportSet, Function.comp_def, Equiv.arrowCongr, Equiv.prodCongr] using h

/-- Reachability transports both the start and target; no particular trace is selected. -/
theorem reachability_rename {S S' : Type u} (e : S ≃ S') (step : S → S → Prop)
    (start : S) (targetStates : Set S) :
    (∃ finish ∈ targetStates, Relation.TransGen step start finish) ↔
      ∃ finish ∈ transportSet e targetStates,
        Relation.TransGen (fun a b => step (e.symm a) (e.symm b)) (e start) finish := by
  constructor
  · rintro ⟨finish, hu, hr⟩
    exact ⟨e finish, (mem_transportSet e targetStates finish).2 hu, (CategoricalTriz.transGen_equiv e).1 hr⟩
  · rintro ⟨finish, hu, hr⟩
    obtain ⟨finish, rfl⟩ := e.surjective finish
    exact ⟨finish, (mem_transportSet e targetStates finish).1 hu, (CategoricalTriz.transGen_equiv e).2 hr⟩

/-- A relabelled hole context transports its residual and its target together. The hypothesis
is semantic naturality of the actual contexts, not a claim about capped search. -/
theorem residual_rename {A B C D A' B' C' D' : Type u}
    (e : A × B ≃ A' × B') (f : C × D ≃ C' × D')
    (ctx : SetRel A B → SetRel C D) (ctx' : SetRel A' B' → SetRel C' D')
    (h : ∀ R, ctx' (transportSet e R) = transportSet f (ctx R))
    (target : SetRel C D) :
    residual ctx' (transportSet f target) = transportSet e (residual ctx target) := by
  ext p
  rcases e.surjective p with ⟨q, rfl⟩
  simp only [mem_transportSet, residual, Set.mem_setOf_eq]
  rw [← transportSet_singleton e q, h]
  constructor
  · intro hs x hx
    have hx' : f x ∈ transportSet f (ctx {q}) := (mem_transportSet f _ x).2 hx
    exact (mem_transportSet f _ x).1 (hs hx')
  · intro hs x hx
    obtain ⟨x, rfl⟩ := f.surjective x
    exact (mem_transportSet f _ x).2 (hs ((mem_transportSet f _ x).1 hx))

/-- An adequate candidate remains adequate after both the candidate and target are transported. -/
theorem adequate_rename {A B C D A' B' C' D' : Type u}
    (e : A × B ≃ A' × B') (f : C × D ≃ C' × D')
    (ctx : SetRel A B → SetRel C D) (ctx' : SetRel A' B' → SetRel C' D')
    (h : ∀ R, ctx' (transportSet e R) = transportSet f (ctx R))
    (candidate : SetRel A B) (target : SetRel C D) :
    ctx' (transportSet e candidate) = transportSet f target ↔ ctx candidate = target := by
  rw [h]
  constructor
  · intro equal
    ext x
    have hmem := congrArg (fun s : Set (C' × D') => f x ∈ s) equal
    simpa using hmem
  · intro equal
    rw [equal]

/-- The residual of a concrete renamed hole diagram is unchanged on its fixed hole-port
coordinates when its external target is transported. -/
theorem hole_residual_rename (d : OpenDiagram V I O) {P B W Qi Qo : Type u}
    (ep : d.Port ≃ P) (eb : d.Box ≃ B) (ew : d.Wire ≃ W)
    (ei : I ≃ I') (eo : O ≃ O') (pin : Qi → d.Port) (pout : Qo → d.Port)
    (target : SetRel (I → V) (O → V)) :
    let f := Equiv.prodCongr (Equiv.arrowCongr ei (Equiv.refl V))
      (Equiv.arrowCongr eo (Equiv.refl V))
    residual (fun r : SetRel (Qi → V) (Qo → V) =>
      {p | (renameDiagram (d.withHole pin pout r) ep (Equiv.optionCongr eb) ew ei eo).external p.1 p.2})
      (transportSet f target) = residual (d.holeContext pin pout) target := by
  dsimp only
  have h := residual_rename (Equiv.refl ((Qi → V) × (Qo → V)))
    (Equiv.prodCongr (Equiv.arrowCongr ei (Equiv.refl V)) (Equiv.arrowCongr eo (Equiv.refl V)))
    (d.holeContext pin pout)
    (fun r => {p | (renameDiagram (d.withHole pin pout r) ep (Equiv.optionCongr eb) ew ei eo).external p.1 p.2})
    (fun r => by simpa [transportSet] using hole_context_transport d ep eb ew ei eo pin pout r) target
  simpa [transportSet] using h

/-- Adequacy of a chosen hole relation is preserved by concrete diagram and target renaming. -/
theorem hole_adequate_rename (d : OpenDiagram V I O) {P B W Qi Qo : Type u}
    (ep : d.Port ≃ P) (eb : d.Box ≃ B) (ew : d.Wire ≃ W)
    (ei : I ≃ I') (eo : O ≃ O') (pin : Qi → d.Port) (pout : Qo → d.Port)
    (candidate : SetRel (Qi → V) (Qo → V)) (target : SetRel (I → V) (O → V)) :
    {p | (renameDiagram (d.withHole pin pout candidate) ep (Equiv.optionCongr eb) ew ei eo).external p.1 p.2} =
      transportSet (Equiv.prodCongr (Equiv.arrowCongr ei (Equiv.refl V))
        (Equiv.arrowCongr eo (Equiv.refl V))) target ↔
      d.holeContext pin pout candidate = target := by
  rw [hole_context_transport]
  constructor
  · intro h
    ext p
    have hm := congrArg (fun s => (Equiv.prodCongr (Equiv.arrowCongr ei (Equiv.refl V))
      (Equiv.arrowCongr eo (Equiv.refl V))) p ∈ s) h
    exact (mem_transportSet _ _ p).symm.trans ((iff_of_eq hm).trans (mem_transportSet _ _ p))
  · intro h
    rw [h]

end CategoricalTriz.Semantics
