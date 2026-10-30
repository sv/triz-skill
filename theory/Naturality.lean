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
  simp only [OpenDiagram.steadyStates, renameDiagram, Set.mem_ofPred_eq, Function.comp_def]
  constructor
  · rintro ⟨hv, hb, hw⟩
    refine ⟨fun p => ?_, fun b => ?_, fun w => ?_⟩
    · simpa using hv (ep p)
    · have h := hb (eb b)
      change s ∘ ep ∈ d.behavior (eb.symm (eb b)) at h
      dsimp only [Function.comp_def] at h ⊢
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
    refine ⟨(fun p => s (ep p)), (steady_rename d ep eb ew ei eo s).mp hs, ?_, ?_⟩
    · funext i
      have h := congrFun hx (ei i)
      dsimp only [Function.comp_def] at h ⊢
      simpa [renameDiagram, Function.comp_def] using h
    · funext o
      have h := congrFun hy (eo o)
      dsimp only [Function.comp_def] at h ⊢
      simpa [renameDiagram, Function.comp_def] using h
  · rintro ⟨s, hs, hx, hy⟩
    refine ⟨(fun p => s (ep.symm p)), (steady_rename d ep eb ew ei eo _).mpr ?_, ?_, ?_⟩
    · change (fun p => s (ep.symm (ep p))) ∈ d.steadyStates
      simpa only [Equiv.symm_apply_apply] using hs
    · funext i
      have h := congrFun hx (ei.symm i)
      dsimp only [Function.comp_def] at h ⊢
      simpa [renameDiagram, Function.comp_def] using h
    · funext o
      have h := congrFun hy (eo.symm o)
      dsimp only [Function.comp_def] at h ⊢
      simpa [renameDiagram, Function.comp_def] using h
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
  simp only [mem_transportSet, residual, Set.mem_ofPred_eq]
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


/-- Rename values as well as diagram and boundary coordinates. -/
def renameDiagramValues {V' P B W : Type u} (d : OpenDiagram V I O)
    (ev : V ≃ V') (ep : d.Port ≃ P) (eb : d.Box ≃ B) (ew : d.Wire ≃ W)
    (ei : I ≃ I') (eo : O ≃ O') : OpenDiagram V' I' O' where
  Port := P
  Box := B
  Wire := W
  values p := {v | ev.symm v ∈ d.values (ep.symm p)}
  behavior b := {s | (ev.symm ∘ s ∘ ep) ∈ d.behavior (eb.symm b)}
  src w := ep (d.src (ew.symm w))
  tgt w := ep (d.tgt (ew.symm w))
  input i := ep (d.input (ei.symm i))
  output o := ep (d.output (eo.symm o))

/-- Steady valuations transport in both directions under value and index equivalences. -/
theorem steady_values_rename {V' P B W : Type u} (d : OpenDiagram V I O)
    (ev : V ≃ V') (ep : d.Port ≃ P) (eb : d.Box ≃ B) (ew : d.Wire ≃ W)
    (ei : I ≃ I') (eo : O ≃ O') (s : P → V') :
    s ∈ (renameDiagramValues d ev ep eb ew ei eo).steadyStates ↔
      ev.symm ∘ s ∘ ep ∈ d.steadyStates := by
  simp only [OpenDiagram.steadyStates, renameDiagramValues, Set.mem_ofPred_eq, Function.comp_def]
  constructor
  · rintro ⟨hv, hb, hw⟩
    refine ⟨fun p => ?_, fun b => ?_, fun w => ?_⟩
    · simpa using hv (ep p)
    · have h := hb (eb b)
      change ev.symm ∘ s ∘ ep ∈ d.behavior (eb.symm (eb b)) at h
      dsimp only [Function.comp_def] at h ⊢
      simpa using h
    · have h := hw (ew w)
      simpa using congrArg ev.symm h
  · rintro ⟨hv, hb, hw⟩
    refine ⟨fun p => ?_, fun b => ?_, fun w => ?_⟩
    · simpa using hv (ep.symm p)
    · exact hb (eb.symm b)
    · apply ev.symm.injective
      exact hw (ew.symm w)

/-- External witnesses are transported along boundary and value equivalences. -/
theorem external_values_rename {V' P B W : Type u} (d : OpenDiagram V I O)
    (ev : V ≃ V') (ep : d.Port ≃ P) (eb : d.Box ≃ B) (ew : d.Wire ≃ W)
    (ei : I ≃ I') (eo : O ≃ O') (x : I → V) (y : O → V) :
    (renameDiagramValues d ev ep eb ew ei eo).external (ev ∘ x ∘ ei.symm) (ev ∘ y ∘ eo.symm) ↔ d.external x y := by
  constructor
  · rintro ⟨s, hs, hx, hy⟩
    refine ⟨(fun p => ev.symm (s (ep p))), (steady_values_rename d ev ep eb ew ei eo s).mp hs, ?_, ?_⟩
    · funext i
      have h := congrArg ev.symm (congrFun hx (ei i))
      dsimp only [Function.comp_def] at h ⊢
      simpa [renameDiagramValues, Function.comp_def] using h
    · funext o
      have h := congrArg ev.symm (congrFun hy (eo o))
      dsimp only [Function.comp_def] at h ⊢
      simpa [renameDiagramValues, Function.comp_def] using h
  · rintro ⟨s, hs, hx, hy⟩
    refine ⟨(fun p => ev (s (ep.symm p))), (steady_values_rename d ev ep eb ew ei eo _).mpr ?_, ?_, ?_⟩
    · change (fun p => ev.symm (ev (s (ep.symm (ep p))))) ∈ d.steadyStates
      simpa only [Equiv.symm_apply_apply] using hs
    · funext i
      have h := congrArg ev (congrFun hx (ei.symm i))
      dsimp only [Function.comp_def] at h ⊢
      simpa [renameDiagramValues, Function.comp_def] using h
    · funext o
      have h := congrArg ev (congrFun hy (eo.symm o))
      dsimp only [Function.comp_def] at h ⊢
      simpa [renameDiagramValues, Function.comp_def] using h


/-- Renaming the hole and external coordinates, including values, commutes with the concrete
hole context: it is proved from the diagram's steady states, not assumed for a generic context. -/
theorem hole_context_values_rename {V' P B W Qi Qo Qi' Qo' : Type u}
    (d : OpenDiagram V I O) (ev : V ≃ V') (ep : d.Port ≃ P) (eb : d.Box ≃ B)
    (ew : d.Wire ≃ W) (ei : I ≃ I') (eo : O ≃ O')
    (ehi : Qi ≃ Qi') (eho : Qo ≃ Qo') (pin : Qi → d.Port) (pout : Qo → d.Port)
    (r : SetRel (Qi → V) (Qo → V)) :
    (renameDiagramValues d ev ep eb ew ei eo).holeContext
      (ep ∘ pin ∘ ehi.symm) (ep ∘ pout ∘ eho.symm)
      (transportSet (Equiv.prodCongr (Equiv.arrowCongr ehi ev) (Equiv.arrowCongr eho ev)) r) =
    transportSet (Equiv.prodCongr (Equiv.arrowCongr ei ev) (Equiv.arrowCongr eo ev))
      (d.holeContext pin pout r) := by
  let D := renameDiagramValues d ev ep eb ew ei eo
  let ri := Equiv.arrowCongr ehi ev
  let ro := Equiv.arrowCongr eho ev
  let re := Equiv.prodCongr ri ro
  let ex := Equiv.arrowCongr ei ev
  let ey := Equiv.arrowCongr eo ev
  have hsteady (s : P → V') :
      s ∈ (D.withHole (ep ∘ pin ∘ ehi.symm) (ep ∘ pout ∘ eho.symm) (transportSet re r)).steadyStates ↔
      ev.symm ∘ s ∘ ep ∈ (d.withHole pin pout r).steadyStates := by
    have hnew := mem_steadyStates_withHole (d := D) (pin := ep ∘ pin ∘ ehi.symm)
      (pout := ep ∘ pout ∘ eho.symm) (R := transportSet re r) (s := s)
    have hold := mem_steadyStates_withHole (d := d) (pin := pin) (pout := pout)
      (R := r) (s := ev.symm ∘ s ∘ ep)

    have hr : (s ∘ (ep ∘ pin ∘ ehi.symm), s ∘ (ep ∘ pout ∘ eho.symm)) ∈ transportSet re r ↔
        ((ev.symm ∘ s ∘ ep) ∘ pin, (ev.symm ∘ s ∘ ep) ∘ pout) ∈ r := by
      simp [transportSet, re, ri, ro, Equiv.arrowCongr, Equiv.prodCongr, Function.comp_def]
    exact hnew.trans ((and_congr (steady_values_rename d ev ep eb ew ei eo s) hr).trans hold.symm)
  ext ⟨x, y⟩
  obtain ⟨x, rfl⟩ := ex.surjective x
  obtain ⟨y, rfl⟩ := ey.surjective y
  change (D.withHole _ _ _).external (ex x) (ey y) ↔
    (ex x, ey y) ∈ transportSet (Equiv.prodCongr ex ey) (d.holeContext pin pout r)
  have hmem := mem_transportSet (Equiv.prodCongr ex ey) (d.holeContext pin pout r) (x, y)
  change (ex x, ey y) ∈ _ ↔ _ at hmem
  rw [hmem]
  change (D.withHole _ _ _).external (ex x) (ey y) ↔ (d.withHole pin pout r).external x y
  constructor
  · rintro ⟨s, hs, hx, hy⟩
    refine ⟨(fun p => ev.symm (s (ep p))), (hsteady s).mp hs, ?_, ?_⟩
    · funext i
      have h := congrArg ev.symm (congrFun hx (ei i))
      dsimp only [Function.comp_def] at h ⊢
      simpa [D, ex, Equiv.arrowCongr, renameDiagramValues, withHole, Function.comp_def] using h
    · funext o
      have h := congrArg ev.symm (congrFun hy (eo o))
      dsimp only [Function.comp_def] at h ⊢
      simpa [D, ey, Equiv.arrowCongr, renameDiagramValues, withHole, Function.comp_def] using h
  · rintro ⟨s, hs, hx, hy⟩
    refine ⟨(fun p => ev (s (ep.symm p))), (hsteady _).mpr ?_, ?_, ?_⟩
    · change (fun p => ev.symm (ev (s (ep.symm (ep p))))) ∈ (d.withHole pin pout r).steadyStates
      simpa only [Equiv.symm_apply_apply, withHole] using hs
    · funext i
      have h := congrArg ev (congrFun hx (ei.symm i))
      dsimp only [Function.comp_def] at h ⊢
      simpa [D, ex, Equiv.arrowCongr, renameDiagramValues, withHole, Function.comp_def] using h
    · funext o
      have h := congrArg ev (congrFun hy (eo.symm o))
      dsimp only [Function.comp_def] at h ⊢
      simpa [D, ey, Equiv.arrowCongr, renameDiagramValues, withHole, Function.comp_def] using h


/-- Residual transport for the actual renamed diagram, including hole and value coordinates. -/
theorem hole_residual_values_rename {V' P B W Qi Qo Qi' Qo' : Type u}
    (d : OpenDiagram V I O) (ev : V ≃ V') (ep : d.Port ≃ P) (eb : d.Box ≃ B)
    (ew : d.Wire ≃ W) (ei : I ≃ I') (eo : O ≃ O')
    (ehi : Qi ≃ Qi') (eho : Qo ≃ Qo') (pin : Qi → d.Port) (pout : Qo → d.Port)
    (target : SetRel (I → V) (O → V)) :
    residual ((renameDiagramValues d ev ep eb ew ei eo).holeContext
      (ep ∘ pin ∘ ehi.symm) (ep ∘ pout ∘ eho.symm))
      (transportSet (Equiv.prodCongr (Equiv.arrowCongr ei ev) (Equiv.arrowCongr eo ev)) target) =
    transportSet (Equiv.prodCongr (Equiv.arrowCongr ehi ev) (Equiv.arrowCongr eho ev))
      (residual (d.holeContext pin pout) target) :=
  residual_rename _ _ _ _ (hole_context_values_rename d ev ep eb ew ei eo ehi eho pin pout) target

/-- Transport preserves subset relations, including the strict and incomparable cases. -/
theorem transport_subset_iff {A A' : Type u} (e : A ≃ A') (s t : Set A) :
    transportSet e s ⊆ transportSet e t ↔ s ⊆ t := by
  constructor
  · intro h x hx
    exact (mem_transportSet e t x).1 (h ((mem_transportSet e s x).2 hx))
  · intro h x hx
    obtain ⟨x, rfl⟩ := e.surjective x
    exact (mem_transportSet e t x).2 (h ((mem_transportSet e s x).1 hx))

theorem transport_eq_iff {A A' : Type u} (e : A ≃ A') (s t : Set A) :
    transportSet e s = transportSet e t ↔ s = t := by
  simp only [Set.Subset.antisymm_iff, transport_subset_iff]

theorem transport_incomparable_iff {A A' : Type u} (e : A ≃ A') (s t : Set A) :
    (¬ transportSet e s ⊆ transportSet e t ∧ ¬ transportSet e t ⊆ transportSet e s) ↔
      (¬ s ⊆ t ∧ ¬ t ⊆ s) := by simp only [transport_subset_iff]

/-- Admitted inputs require a nonblocking output and that every possible output is acceptable.
This is the operational `admits` predicate, not equality with a target relation. -/
theorem admits_rename {A B A' B' : Type u} (e : A ≃ A') (f : B ≃ B')
    (R : A → B → Prop) (ok : B → Prop) :
    CategoricalTriz.admits (fun x y => R (e.symm x) (f.symm y)) (fun y => ok (f.symm y)) =
      transportSet e (CategoricalTriz.admits R ok) := by
  ext x
  obtain ⟨x, rfl⟩ := e.surjective x
  simp only [mem_transportSet, CategoricalTriz.admits, Set.mem_ofPred_eq, Equiv.symm_apply_apply]
  constructor
  · rintro ⟨⟨y, hy⟩, all⟩
    exact ⟨⟨f.symm y, hy⟩, fun y hy => by simpa using all (f y) (by simpa using hy)⟩
  · rintro ⟨⟨y, hy⟩, all⟩
    exact ⟨⟨f y, by simpa using hy⟩, fun y hy => all (f.symm y) hy⟩

/-- Operational adequacy on required inputs transports with the same bijections. -/
theorem operational_adequacy_rename {A B A' B' : Type u} (e : A ≃ A') (f : B ≃ B')
    (R : A → B → Prop) (ok : B → Prop) (required : Set A) :
    transportSet e required ⊆ CategoricalTriz.admits
      (fun x y => R (e.symm x) (f.symm y)) (fun y => ok (f.symm y)) ↔
    required ⊆ CategoricalTriz.admits R ok := by
  rw [admits_rename, transport_subset_iff]


/-- Weakness preorder transports its full admitted-situation inclusion. -/
theorem weakness_rename {A B A' B' : Type u} (e : A ≃ A') (f : B ≃ B')
    (R S : A → B → Prop) (ok : B → Prop) :
    CategoricalTriz.AtLeastAsWeak (fun y => ok (f.symm y))
      (fun x y => R (e.symm x) (f.symm y)) (fun x y => S (e.symm x) (f.symm y)) ↔
    CategoricalTriz.AtLeastAsWeak ok R S := by
  simp only [CategoricalTriz.AtLeastAsWeak, admits_rename, transport_subset_iff]

/-- For an actual diagram, admitted inputs transport with nonblocking and universal acceptance. -/
theorem diagram_admits_values_rename {V' P B W : Type u} (d : OpenDiagram V I O)
    (ev : V ≃ V') (ep : d.Port ≃ P) (eb : d.Box ≃ B) (ew : d.Wire ≃ W)
    (ei : I ≃ I') (eo : O ≃ O') (ok : (O → V) → Prop) :
    CategoricalTriz.admits (renameDiagramValues d ev ep eb ew ei eo).external
      (fun y => ok ((Equiv.arrowCongr eo ev).symm y)) =
    transportSet (Equiv.arrowCongr ei ev) (CategoricalTriz.admits d.external ok) := by
  have h : (renameDiagramValues d ev ep eb ew ei eo).external =
      (fun x y => d.external ((Equiv.arrowCongr ei ev).symm x) ((Equiv.arrowCongr eo ev).symm y)) := by
    funext x y
    obtain ⟨x, rfl⟩ := (Equiv.arrowCongr ei ev).surjective x
    obtain ⟨y, rfl⟩ := (Equiv.arrowCongr eo ev).surjective y
    apply propext
    simpa [Equiv.arrowCongr, Function.comp_def] using external_values_rename d ev ep eb ew ei eo x y
  rw [h, admits_rename]

/-- A small diagram with a shared two-coordinate input/output interface. -/
def naturalityWitness : OpenDiagram Bool Bool Bool where
  Port := Bool
  Box := Empty
  Wire := Empty
  values _ := Set.univ
  behavior b := nomatch b
  src w := nomatch w
  tgt w := nomatch w
  input := id
  output := id

/-- The witness changes both coordinate labels and values. -/
theorem complement_swap_witness :
    Equiv.arrowCongr (Equiv.swap false true) (Equiv.swap false true) (fun b : Bool => b) =
      (fun b : Bool => b) ∧
    Equiv.arrowCongr (Equiv.swap false true) (Equiv.swap false true) (fun _ : Bool => false) =
      (fun _ : Bool => true) := by
  constructor <;> funext b <;> cases b <;> decide

def witnessPortSwap : naturalityWitness.Port ≃ Bool := by
  change Bool ≃ Bool
  exact Equiv.swap false true

/-- A real hole context on the witness diagram satisfies the full transport square. -/
theorem witness_hole_transport (r : SetRel (Bool → Bool) (Bool → Bool)) :
    (renameDiagramValues naturalityWitness (Equiv.swap false true) witnessPortSwap
      (Equiv.refl Empty) (Equiv.refl Empty) (Equiv.swap false true) (Equiv.swap false true)).holeContext
      (witnessPortSwap ∘ id ∘ (Equiv.swap false true).symm)
      (witnessPortSwap ∘ id ∘ (Equiv.swap false true).symm)
      (transportSet (Equiv.prodCongr
        (Equiv.arrowCongr (Equiv.swap false true) (Equiv.swap false true))
        (Equiv.arrowCongr (Equiv.swap false true) (Equiv.swap false true))) r) =
    transportSet (Equiv.prodCongr
      (Equiv.arrowCongr (Equiv.swap false true) (Equiv.swap false true))
      (Equiv.arrowCongr (Equiv.swap false true) (Equiv.swap false true)))
      (naturalityWitness.holeContext id id r) :=
  hole_context_values_rename naturalityWitness (Equiv.swap false true) witnessPortSwap
    (Equiv.refl Empty) (Equiv.refl Empty) (Equiv.swap false true) (Equiv.swap false true)
    (Equiv.swap false true) (Equiv.swap false true) id id r


/-- Strict inclusion is invariant too, without asserting a particular selected witness. -/
theorem transport_strict_subset_iff {A A' : Type u} (e : A ≃ A') (s t : Set A) :
    transportSet e s ⊂ transportSet e t ↔ s ⊂ t := by
  simp only [ssubset_iff_subset_not_subset, transport_subset_iff]

/-- Required input adequacy for a concrete renamed diagram, with all outputs checked. -/
theorem diagram_operational_adequacy_values_rename {V' P B W : Type u} (d : OpenDiagram V I O)
    (ev : V ≃ V') (ep : d.Port ≃ P) (eb : d.Box ≃ B) (ew : d.Wire ≃ W)
    (ei : I ≃ I') (eo : O ≃ O') (ok : (O → V) → Prop) (required : Set (I → V)) :
    transportSet (Equiv.arrowCongr ei ev) required ⊆
      CategoricalTriz.admits (renameDiagramValues d ev ep eb ew ei eo).external
        (fun y => ok ((Equiv.arrowCongr eo ev).symm y)) ↔
    required ⊆ CategoricalTriz.admits d.external ok := by
  rw [diagram_admits_values_rename, transport_subset_iff]

/-- The witness hole actually has a steady state, so its context is not an empty relation. -/
theorem witness_hole_nonempty :
    ((id : Bool → Bool), (id : Bool → Bool)) ∈
      naturalityWitness.holeContext id id {((id : Bool → Bool), (id : Bool → Bool))} := by
  change (naturalityWitness.withHole id id {((id : Bool → Bool), (id : Bool → Bool))}).external id id
  refine ⟨id, ?_, rfl, rfl⟩
  apply mem_steadyStates_withHole.mpr
  constructor
  · simp [naturalityWitness, OpenDiagram.steadyStates]
    exact Set.mem_univ _
  · exact Set.mem_singleton _

end CategoricalTriz.Semantics
