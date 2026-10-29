/**
 * Per-instance Lean certificates over finite declarations; nothing is extracted from Lean.
 * Structural typing, separation, reachable traces, inductive safety, behavior comparisons,
 * and every weakness pair are independently decided on the encoded tables. A manifest binds
 * the authoritative request, scope, schema, generator and theory pins. --request additionally
 * checks normalized correspondence with a separate direct encoder and detects stale output;
 * neither check establishes encoder correctness. State-only safety invariants include every
 * valuation of each selected state, since Sync.Step leaves successor valuations unrestricted.
 * Saturated unreachable certificates exclude admitted unsafe configurations (Sync.target).
 * Time inputs and negative claims unsupported by an invariant fail closed. Ids remain escaped
 * string literals. This module is pure and works in the hosted Worker.
 */
import { Axis, baseOf, checkModel, harmLoops, separationCheck, type FunctionModel, type PhysicalContradiction } from "./act.js";
import { at, fail, issue, quoted, type Failure } from "./act-issues.js";
import { alignment, compareBehavior, deliverablePorts, plan as behaviorPlan, portVariables, weaknessRanking, type Acceptable, type BehaviorScope, type JointPriorRow, type Prior } from "./act-behavior.js";
import { applyTrim } from "./act-rewrite.js";
import { boundedDynamics, reachedStates, type DynamicsSpec } from "./act-dynamics.js";

/** Cap on cells × demands × values per contradiction; at the cap `decide` takes about ten seconds. */
export const MAX_CERT_WORK = 100_000;
/** Cap on functions × ports, which bounds the work of deciding `typed`. */
export const MAX_CERT_WIRING = 250_000;
export const DEFAULT_NAMESPACE = "TrizCertificate";

export interface Certified { theorem: string; verdict: string; }
/** Exact source pins; refresh deliberately when the theory or model schema changes. */
export const CERTIFICATE_THEORY_SOURCE = "4f454df65878905dd9699e724c45298293803cd76d6d256344c7ce5f9c102893";
export const CERTIFICATE_SCHEMA_SOURCE = "c03fa5c1ed1c426bea0a087c839fbc7184d84f3484f3d43234ad7c484b8769eb";
export interface CertificateManifest {
  format: "triz-certificate-v2"; kind: CertificateRequest["kind"]; namespace: string;
  source: string; schema: "function-model-v1"; generator: "triz-cert-2";
  theory: "CategoricalTriz/v2"; theorySource: string; schemaSource: string; lean: "4.32.2"; mathlib: "v4.32.2";
  scope: "structural" | BehaviorScope | "dynamics-upstream";
}
export type CertificateRequest =
  | { kind: "model"; model: FunctionModel }
  | { kind: "separation"; contradiction: PhysicalContradiction }
  | { kind: "dynamics"; model: FunctionModel; spec: DynamicsSpec }
  | { kind: "weakness"; concepts: Array<{ id: string; model: FunctionModel }>; acceptable: Acceptable[]; scope?: BehaviorScope; maxStates?: number; priors?: Prior[]; jointPrior?: JointPriorRow[] }
  | { kind: "behavior"; baseline: FunctionModel; concept: FunctionModel; scope?: BehaviorScope; maxStates?: number; boxMap?: Record<string, string> };
export type Certificate = { ok: true; namespace: string; content: string; certifies: Certified[]; manifest: CertificateManifest } | Failure;

/** Canonical JSON binds the supplied request, including its array order and all declared metadata. */
export function canonicalRequest(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((x) => canonicalRequest(x) ?? "null").join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalRequest(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
/** Portable SHA-256: generation is synchronous and also runs in the hosted Worker. */
export function requestDigest(value: unknown): string {
  const bytes = new TextEncoder().encode(canonicalRequest(value));
  const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64); padded.set(bytes); padded[bytes.length] = 128;
  const view = new DataView(padded.buffer); view.setUint32(padded.length - 4, bytes.length * 8); view.setUint32(padded.length - 8, Math.floor(bytes.length / 0x20000000));
  const rotate = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    const w = Array<number>(64); for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + 4 * i);
    for (let i = 16; i < 64; i++) { const a = w[i-15], b = w[i-2]; w[i] = (w[i-16] + (rotate(a,7)^rotate(a,18)^(a>>>3)) + w[i-7] + (rotate(b,17)^rotate(b,19)^(b>>>10))) >>> 0; }
    let [a,b,c,d,e,f,g,j] = h;
    for (let i = 0; i < 64; i++) { const t = (j + (rotate(e,6)^rotate(e,11)^rotate(e,25)) + ((e&f)^(~e&g)) + k[i] + w[i]) >>> 0; const u = ((rotate(a,2)^rotate(a,13)^rotate(a,22)) + ((a&b)^(a&c)^(b&c))) >>> 0; j=g; g=f; f=e; e=(d+t)>>>0; d=c; c=b; b=a; a=(t+u)>>>0; }
    [a,b,c,d,e,f,g,j].forEach((x,i) => h[i] = (h[i] + x) >>> 0);
  }
  return h.map((x) => x.toString(16).padStart(8,"0")).join("");
}
function certified(request: CertificateRequest, namespace: string, content: string, certifies: Certified[]): Certificate {
  const scope = request.kind === "model" || request.kind === "separation" ? "structural" : request.kind === "dynamics" ? "dynamics-upstream" : request.scope ?? "upstream";
  const manifest: CertificateManifest = { format: "triz-certificate-v2", kind: request.kind, namespace, source: requestDigest(request), schema: "function-model-v1", generator: "triz-cert-2", theory: "CategoricalTriz/v2", theorySource: CERTIFICATE_THEORY_SOURCE, schemaSource: CERTIFICATE_SCHEMA_SOURCE, lean: "4.32.2", mathlib: "v4.32.2", scope };
  return { ok: true, namespace, content: content.replace("open CategoricalTriz\n", `open CategoricalTriz\n\ndef certificateManifest : String := ${leanString(JSON.stringify(manifest))}\n`), certifies, manifest };
}


const AXES: Axis[] = Axis.options;
const NAMESPACE = /^[A-Z][A-Za-z0-9]*$/;
/**
 * Capitalised alphanumeric tokens in Lean's token table at the pin, with all of Mathlib imported
 * (as AXLE does): `namespace Type` does not parse. scripts/certify.mjs rejects the same names.
 */
export const RESERVED_NAMESPACES: ReadonlySet<string> = new Set(["GL", "PiType", "Prop", "Sort", "StateRefT", "Type"]);

/**
 * Lean string literal. Quotes, backslashes, and control or invisible characters are escaped, so
 * an id can neither end the literal nor hide text. Lean's `\u` takes four hex digits, so anything
 * outside the BMP that needs escaping, and any lone surrogate, becomes U+FFFD. The id tables
 * only document the encoding; no proof reads them.
 */
export function leanString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === "\\" || ch === '"') out += "\\" + ch;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\r") out += "\\r";
    else if (/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u.test(ch)) {
      out += code > 0xffff || (code >= 0xd800 && code <= 0xdfff) ? "\\ufffd" : `\\u${code.toString(16).padStart(4, "0")}`;
    } else out += ch;
  }
  return out + '"';
}

const vec = (xs: Array<string | number | boolean>) => `![${xs.join(", ")}]`;
const fin = (n: number) => `Fin ${n}`;
/** A verdict theorem: the statement stays on one line, so a reader (and the tamper tests) can find it. */
const theorem = (doc: string, name: string, statement: string, proof: string) =>
  [`/-- ${doc} -/`, `theorem ${name} : ${statement} :=`, `  ${proof}`, ""];

const HEADER = (what: string) => [
  "import CategoricalTriz",
  "",
  "/-!",
  `# Lean certificate: ${what}`,
  "",
  "Generated by triz-mcp from the kernel's verdicts. Each theorem states one verdict about the finite",
  "data in this file, in the terms of `theory/CategoricalTriz.lean`, and Lean checks the proof. This",
  "certifies these verdicts for this one instance; nothing is extracted from Lean. The id tables are",
  "the encoding. Use --request with the original request JSON to verify binding and correspondence.",
  "",
  "Check with `node scripts/certify.mjs <file>` in a checkout of github.com/sv/triz-skill: Lean",
  "against `theory/` once it is built. `--remote` sends this file to the AXLE service instead.",
  "-/",
  "",
];

/** The model's wiring as finite tables and a `Wiring`, then `typed` and one witness per reported harm cycle. */
function wiringSection(model: FunctionModel, certifies: Certified[], ns: string): string[] | Failure {
  const boxIndex = new Map(model.boxes.map((b, i) => [b.id, i]));
  const ports: Array<{ box: number; id: string; output: boolean; carrier: number }> = [];
  const portIndex = new Map<string, number>();
  const carrierIndex = new Map(model.carriers.map((c, i) => [c.id, i]));
  const key = (box: string, side: "in" | "out", port: string) => JSON.stringify([box, side, port]);
  model.boxes.forEach((b, i) => {
    for (const [side, list] of [["in", b.inputs ?? []], ["out", b.outputs ?? []]] as const) {
      for (const p of list) {
        portIndex.set(key(b.id, side, p.id), ports.length);
        ports.push({ box: i, id: p.id, output: side === "out", carrier: carrierIndex.get(p.carrier)! });
      }
    }
  });
  if (model.wires.length * ports.length > MAX_CERT_WIRING) {
    return fail([issue("cap-exceeded", "$.model", `${model.wires.length} functions × ${ports.length} ports exceeds the certificate limit of ${MAX_CERT_WIRING}`,
      "Certify a smaller model (restrict it to a subsystem), or export it as dot or hypergraph, which have no such limit.")]);
  }
  const end = (box: string, side: "in" | "out", port: string) => `(${boxIndex.get(box)}, ${portIndex.get(key(box, side, port))})`;
  const lines = [
    "/-! ## The model as finite data -/",
    "",
    `abbrev Box := ${fin(model.boxes.length)}`,
    `abbrev Port := ${fin(ports.length)}`,
    `abbrev Fn := ${fin(model.wires.length)}`,
    `abbrev Carrier := ${fin(model.carriers.length)}`,
    "",
    `def boxId : Box → String := ${vec(model.boxes.map((b) => leanString(b.id)))}`,
    "/-- Port ids are unique within their box (`portBox`). -/",
    `def portId : Port → String := ${vec(ports.map((p) => leanString(p.id)))}`,
    `def fnId : Fn → String := ${vec(model.wires.map((w) => leanString(w.id)))}`,
    `def carrierId : Carrier → String := ${vec(model.carriers.map((c) => leanString(c.id)))}`,
    "",
    `def portBox : Port → Box := ${vec(ports.map((p) => p.box))}`,
    "/-- `true` for an output port, `false` for an input port. -/",
    `def portIsOutput : Port → Bool := ${vec(ports.map((p) => p.output))}`,
    `def portCarrier : Port → Carrier := ${vec(ports.map((p) => p.carrier))}`,
    "",
    "/-- Every box and every function of the model; `out` and `inp` read the port tables. -/",
    "def diagram : Wiring Box Port Fn Carrier where",
    "  boxes := Set.univ",
    "  wires := Set.univ",
    `  src := ${vec(model.wires.map((w) => end(w.from.box, "out", w.from.port)))}`,
    `  tgt := ${vec(model.wires.map((w) => end(w.to.box, "in", w.to.port)))}`,
    `  carrier := ${vec(model.wires.map((w) => carrierIndex.get(w.carrier)!))}`,
    "  out b p := if portBox p = b ∧ portIsOutput p = true then some (portCarrier p) else none",
    "  inp b p := if portBox p = b ∧ portIsOutput p = false then some (portCarrier p) else none",
    "",
    `def rating : Fn → Rating := ${vec(model.wires.map((w) => `.${w.polarity}`))}`,
    "",
    "/-! ## Verdicts -/",
    "",
    ...theorem("`checkModel`: every function runs from an output port to an input port, both of its carrier.",
      "typed", "diagram.Typed", "by intro w hw; clear hw; refine ⟨trivial, trivial, ?_⟩; revert w; decide +kernel"),
  ];
  certifies.push({ theorem: `${ns}.typed`, verdict: "checkModel: the wiring type-checks" });

  const wireIndex = new Map(model.wires.map((w, i) => [w.id, i]));
  let k = 0;
  for (const loop of harmLoops(model)) {
    for (const cycle of loop.cycles) {
      const w = wireIndex.get(cycle.via)!;
      // path = [performer, object, …, performer]; the return path runs from path[1] to the end.
      const steps: string[] = [];
      for (let s = 1; s + 1 < cycle.path.length; s++) {
        const [a, b] = [cycle.path[s], cycle.path[s + 1]];
        const step = model.wires.findIndex((x) => x.from.box === a && x.to.box === b);
        if (step < 0) return fail([issue("internal-error", "$.model", `harmLoops witness for '${cycle.via}': no function from '${a}' to '${b}'`, "Report this with the model; the kernel's witness and its certificate disagree.")]);
        steps.push(`.head (b := ${boxIndex.get(b)}) ⟨${step}, Set.mem_univ _, rfl, rfl⟩`);
      }
      // The kernel compares each endpoint with a literal box index, never two table lookups with
      // each other: that comparison is slow when it unfolds both sides.
      const [u, v] = [boxIndex.get(cycle.path[0]), boxIndex.get(cycle.path[1])];
      const back = `show Relation.ReflTransGen diagram.Acts ${v} ${u} from ${steps.length ? `${steps.join(" <| ")} <| .refl` : ".refl"}`;
      lines.push(
        ...theorem(`\`harmLoops\` witness ${k}: the return path of function ${w}, from its object back to its performer.`,
          `back_${k}`, `Relation.ReflTransGen diagram.Acts (diagram.tgt ${w}).1 (diagram.src ${w}).1`, back),
        ...theorem(`\`harmLoops\`: function ${w} is harmful or excessive, its object reaches its performer, so a closed loop runs through it (\`edge_on_cycle\`).`,
          `loop_${k}`, `(rating ${w}).Negative ∧ Relation.ReflTransGen diagram.Acts (diagram.tgt ${w}).1 (diagram.src ${w}).1 ∧ Relation.TransGen diagram.Acts (diagram.src ${w}).1 (diagram.src ${w}).1`,
          `⟨by decide +kernel, back_${k}, edge_on_cycle ⟨${w}, Set.mem_univ _, rfl, rfl⟩ back_${k}⟩`),
      );
      certifies.push({ theorem: `${ns}.loop_${k}`, verdict: `harmLoops: function '${cycle.via}' lies on the loop ${cycle.path.join(" → ")}` });
      k++;
    }
  }
  return lines;
}

/** One physical contradiction in its own namespace: the base and demands as tables, then each verdict. */
function separationSection(pc: PhysicalContradiction, sub: string, certifies: Certified[], ns: string, root = "$"): string[] | Failure {
  const r = separationCheck(pc, root);
  if (!r.ok) return r;
  const { universe, region } = baseOf(pc);
  const axes = AXES.filter((a) => universe[a].length);
  const values = [...new Set(pc.demands.flatMap((d) => d.values))].sort();
  const cells = axes.reduce((n, a) => n * universe[a].length, 1);
  const work = cells * pc.demands.length * values.length;
  if (work > MAX_CERT_WORK) {
    return fail([issue("cap-exceeded", root, `contradiction '${pc.id}': ${cells} cells × ${pc.demands.length} demands × ${values.length} values exceeds the certificate limit of ${MAX_CERT_WORK}`,
      "Declare fewer cells or values, or certify a coarser contradiction; the separation verdicts without a certificate have a higher limit.")]);
  }
  const demand = new Map(pc.demands.map((d, i) => [d.id, i]));
  const value = (v: string) => values.indexOf(v);
  const cellIn = (a: Axis, c: string) => universe[a].indexOf(c);
  const tuple = (xs: number[]) => (xs.length === 0 ? "()" : xs.length === 1 ? `${xs[0]}` : `(${xs.join(", ")})`);
  const q = (name: string) => `${ns}.${sub}.${name}`;

  const lines = [
    `/-! ## ${sub}: the contradiction named by \`contradictionId\` -/`,
    "",
    `namespace ${sub}`,
    "",
    `def contradictionId : String := ${leanString(pc.id)}`,
    `def parameter : String := ${leanString(pc.parameter)}`,
    `abbrev Demand := ${fin(pc.demands.length)}`,
    `abbrev Val := ${fin(values.length)}`,
    `def demandId : Demand → String := ${vec(pc.demands.map((d) => leanString(d.id)))}`,
    `def valueId : Val → String := ${vec(values.map(leanString))}`,
    ...axes.map((a) => `def ${a}Cell : ${fin(universe[a].length)} → String := ${vec(universe[a].map(leanString))}`),
    "",
    `/-- The base: one coordinate per axis with cells${axes.length ? ` (${axes.join(", ")})` : "; with none, a single cell"}. -/`,
    `abbrev Cell := ${axes.length ? axes.map((a) => fin(universe[a].length)).join(" × ") : "Unit"}`,
    `def valueTable : Demand → Val → Bool := ${vec(pc.demands.map((d) => vec(values.map((v) => d.values.includes(v)))))}`,
    ...axes.map((a) => `def ${a}Table : Demand → ${fin(universe[a].length)} → Bool := ${vec(pc.demands.map((d) => vec(universe[a].map((c) => region(d, a).includes(c)))))}`),
    "abbrev values (i : Demand) : Set Val := ofTable (valueTable i)",
    ...axes.map((a) => `abbrev ${a} (i : Demand) : Set (${fin(universe[a].length)}) := ofTable (${a}Table i)`),
    "/-- Where a demand applies: the product of its regions (an omitted axis is the whole axis). -/",
    axes.length ? `abbrev support (i : Demand) : Set Cell := ${axes.map((a) => `${a} i`).join(" ×ˢ ")}` : "abbrev support (_ : Demand) : Set Cell := Set.univ",
    "",
  ];

  if (r.contradiction) {
    lines.push(...theorem("`separationCheck`: no single value meets every demand, so this is a physical contradiction.",
      "contradiction", "¬ ∃ v : Val, ∀ i, v ∈ values i", "by decide +kernel"));
    certifies.push({ theorem: q("contradiction"), verdict: `separationCheck '${pc.id}': no single value meets every demand` });
  } else {
    lines.push(...theorem(`\`separationCheck\`: value ${value(r.sharedValues[0])} meets every demand, so this is not a physical contradiction.`,
      "sharedValue", "∃ v : Val, ∀ i, v ∈ values i", `⟨${value(r.sharedValues[0])}, by decide +kernel⟩`));
    certifies.push({ theorem: q("sharedValue"), verdict: `separationCheck '${pc.id}': '${r.sharedValues[0]}' meets every demand` });
  }

  /** Disjoint supports from one disjoint axis: `separated_iff_axis` once per product layer above it. */
  const lift = (m: number, k: number, h: string): string =>
    k === 1 ? h : m === 0 ? `(separated_iff_axis.mpr (.inl ${h}))` : `(separated_iff_axis.mpr (.inr ${lift(m - 1, k - 1, h)}))`;
  const pairSection = (i: number, j: number) =>
    `∃ s : Cell → Val, (∀ c ∈ support ${i}, s c ∈ values ${i}) ∧ (∀ c ∈ support ${j}, s c ∈ values ${j})`;

  for (const p of r.pairs) {
    const [i, j] = p.demands.map((id) => demand.get(id)!);
    const [di, dj] = [pc.demands[i], pc.demands[j]];
    const name = `pair_${i}_${j}`;
    const label = `'${p.demands[0]}' and '${p.demands[1]}'`;
    if (p.status === "compatible") {
      lines.push(...theorem(`\`separationCheck\`: demands ${i} and ${j} share value ${value(p.sharedValues[0])} (compatible).`,
        name, `(values ${i} ∩ values ${j}).Nonempty`, `⟨${value(p.sharedValues[0])}, by decide +kernel⟩`));
      certifies.push({ theorem: q(name), verdict: `separationCheck '${pc.id}': ${label} are compatible` });
      continue;
    }
    lines.push(...theorem(`Demands ${i} and ${j} admit no common value.`,
      `${name}_values`, `Disjoint (values ${i}) (values ${j})`, "Set.disjoint_left.mpr (by decide +kernel)"));
    const shared: number[] = [];
    for (const a of axes) {
      if (p.separatingAxes.includes(a)) {
        lines.push(...theorem(`Axis ${a} separates demands ${i} and ${j}.`,
          `${name}_${a}`, `Disjoint (${a} ${i}) (${a} ${j})`, "Set.disjoint_left.mpr (by decide +kernel)"));
        continue;
      }
      const c = region(di, a).find((x) => region(dj, a).includes(x));
      if (c === undefined) return fail([issue("internal-error", root, `separationCheck witness for ${label}: no shared ${a} cell`, "Report this with the contradiction; the kernel's verdict and its certificate disagree.")]);
      shared.push(cellIn(a, c));
      lines.push(...theorem(`Axis ${a} does not separate demands ${i} and ${j}: they share cell ${cellIn(a, c)}.`,
        `${name}_${a}`, `(${a} ${i} ∩ ${a} ${j}).Nonempty`, `⟨${cellIn(a, c)}, by decide +kernel⟩`));
    }
    if (p.status === "separated") {
      const m = axes.indexOf(p.separatingAxes[0]);
      lines.push(...theorem(`\`separationCheck\`: demands ${i} and ${j} are separated (on ${p.separatingAxes.join(", ")}), so they glue (\`glue_of_disjoint_regions\`).`,
        name, pairSection(i, j),
        `glue_of_disjoint_regions ⟨${value(di.values[0])}, by decide +kernel⟩ ⟨${value(dj.values[0])}, by decide +kernel⟩ ${lift(m, axes.length, `${name}_${p.separatingAxes[0]}`)}`));
      certifies.push({ theorem: q(name), verdict: `separationCheck '${pc.id}': ${label} are separated on ${p.separatingAxes.join(", ")}` });
    } else {
      lines.push(...theorem(`\`separationCheck\`: demands ${i} and ${j} overlap on every axis, so no assignment meets both (\`no_section_of_overlap\`).`,
        name, `¬ ${pairSection(i, j)}`, `no_section_of_overlap ${name}_values (c := ${tuple(shared)}) (by decide +kernel) (by decide +kernel)`));
      certifies.push({ theorem: q(name), verdict: `separationCheck '${pc.id}': ${label} are irreducible` });
    }
  }

  if (r.gluable) {
    lines.push(...theorem("`separationCheck`: every cell's demands share a value, so the demands glue (`exists_section_iff`).",
      "gluable", "∃ s, IsSection support values s",
      "(exists_section_iff support values).mpr (by unfold admissible Set.Nonempty; decide +kernel)"));
    certifies.push({ theorem: q("gluable"), verdict: `separationCheck '${pc.id}': gluable` });
  } else {
    const c = r.conflictCells[0].cell;
    const cell = tuple(axes.map((a) => cellIn(a, c[a]!)));
    lines.push(...theorem(`\`separationCheck\`: the demands active at cell ${cell} share no value, so they do not glue (\`exists_section_iff\`).`,
      "notGluable", "¬ ∃ s, IsSection support values s",
      `fun h => absurd ((exists_section_iff support values).mp h ${cell}) (by unfold admissible Set.Nonempty; decide +kernel)`));
    certifies.push({ theorem: q("notGluable"), verdict: `separationCheck '${pc.id}': not gluable` });
  }
  lines.push(`end ${sub}`, "");
  return lines;
}

function assemble(what: string, ns: string, sections: string[][]) {
  return [...HEADER(what), `namespace ${ns}`, "", "open CategoricalTriz", "", ...sections.flat(), `end ${ns}`, ""].join("\n");
}

function namespaceOf(opts: { namespace?: string }): string | Failure {
  const ns = opts.namespace ?? DEFAULT_NAMESPACE;
  if (!NAMESPACE.test(ns)) return fail([issue("invalid-namespace", "$.namespace", `namespace '${ns}' must be a capitalised alphanumeric Lean identifier`, `Use a capitalised alphanumeric name such as '${DEFAULT_NAMESPACE}'.`)]);
  return RESERVED_NAMESPACES.has(ns) ? fail([issue("invalid-namespace", "$.namespace", `namespace '${ns}' is a Lean keyword`, `Pick a name that is not a Lean keyword, such as '${DEFAULT_NAMESPACE}'.`)]) : ns;
}

/** Certificate for a model: typing, harm-loop witnesses, and each embedded contradiction. Fails closed. */
export function modelCertificate(model: FunctionModel, opts: { namespace?: string } = {}): Certificate {
  const ns = namespaceOf(opts);
  if (typeof ns !== "string") return ns;
  const check = checkModel(model, "$.model");
  if (!check.ok) return fail(check.issues);
  const certifies: Certified[] = [];
  const wiring = wiringSection(model, certifies, ns);
  if (!Array.isArray(wiring)) return wiring;
  const sections = [wiring];
  for (const [k, pc] of (model.contradictions ?? []).entries()) {
    const s = separationSection(pc, `Separation${k}`, certifies, ns, at("$.model", "contradictions", k));
    if (!Array.isArray(s)) return { ok: false, errors: s.errors.map((e) => (e.startsWith("contradiction ") ? e : `contradiction '${pc.id}': ${e}`)), issues: s.issues.map((i) => (i.message.startsWith("contradiction ") ? i : { ...i, message: `contradiction '${pc.id}': ${i.message}` })) };
    sections.push(s);
  }
  return certified({ kind: "model", model }, ns, assemble("one function model", ns, sections), certifies);
}

/** Certificate for one physical contradiction's separation verdicts. Fails closed. */
export function separationCertificate(pc: PhysicalContradiction, opts: { namespace?: string; root?: string } = {}): Certificate {
  const ns = namespaceOf(opts);
  if (typeof ns !== "string") return ns;
  const certifies: Certified[] = [];
  const s = separationSection(pc, "Separation0", certifies, ns, opts.root);
  if (!Array.isArray(s)) return s;
  return certified({ kind: "separation", contradiction: pc }, ns, assemble("one physical contradiction", ns, [s]), certifies);
}

/** Cap on the work of deciding a dynamics, weakness, or behaviour certificate; see `rowWork`. An invariant near the cap takes Lean about six seconds. */
export const MAX_CERT_ROWS = 2_000_000;

type Box = FunctionModel["boxes"][number];
type Side = "in" | "out";
interface EncodedPort { box: string; side: Side; port: string; carrier: string; }

/** Every port of `boxes` (inputs, then outputs, box by box), then the `extra` input ports, once each. */
function encodedPorts(boxes: Box[], extra: Array<{ box: string; port: string; carrier: string }> = []): EncodedPort[] {
  const out: EncodedPort[] = [];
  const seen = new Set<string>();
  const add = (p: EncodedPort) => { const k = JSON.stringify([p.box, p.side, p.port]); if (!seen.has(k)) { seen.add(k); out.push(p); } };
  for (const b of boxes) {
    for (const q of b.inputs ?? []) add({ box: b.id, side: "in", port: q.id, carrier: q.carrier });
    for (const q of b.outputs ?? []) add({ box: b.id, side: "out", port: q.id, carrier: q.carrier });
  }
  for (const d of extra) add({ box: d.box, side: "in", port: d.port, carrier: d.carrier });
  return out;
}

const portKeyOf = (box: string, side: Side, port: string) => JSON.stringify([box, side, port]);

/** The functions whose two ends are both encoded ports. Every function into an encoded port comes from one. */
function encodedWires(model: FunctionModel, at: Map<string, number>) {
  return model.wires.filter((w) => at.has(portKeyOf(w.to.box, "in", w.to.port)))
    .map((w) => ({ id: w.id, src: at.get(portKeyOf(w.from.box, "out", w.from.port)), tgt: at.get(portKeyOf(w.to.box, "in", w.to.port))! }));
}

/** A box's rows as tables over the encoded ports: which ports each row fixes, and to which value index. */
function rowTables(boxes: Box[], ports: EncodedPort[], at: Map<string, number>, index: (p: number, value: string) => number) {
  const rows: Array<{ box: number; fixes: boolean[]; values: number[]; mach?: number; state: number; next: number }> = [];
  boxes.forEach((b, bi) => {
    const own = [...(b.inputs ?? []).map((q) => ["in", q.id] as const), ...(b.outputs ?? []).map((q) => ["out", q.id] as const)];
    const fixes = ports.map((_, p) => own.some(([side, id]) => at.get(portKeyOf(b.id, side, id)) === p));
    const valuesOf = (r: { in: Record<string, string>; out: Record<string, string> }) => ports.map((q, p) => (fixes[p] ? index(p, q.side === "in" ? r.in[q.port] : r.out[q.port]) : 0));
    for (const r of b.behavior ?? []) rows.push({ box: bi, fixes, values: valuesOf(r), state: 0, next: 0 });
    for (const r of b.transition ?? []) rows.push({ box: bi, fixes, values: valuesOf(r), mach: -1, state: b.state!.indexOf(r.state), next: b.state!.indexOf(r.next) });
  });
  return rows;
}

const nested = <T>(rows: T[][], cell: (x: T) => string) => `![${rows.map((r) => vec(r.map(cell))).join(", ")}]`;
/** Lean string literals, padded with empty ones to `n`. */
const padded = (xs: string[], n: number) => [...xs, ...Array<string>(n - xs.length).fill(leanString(""))];

/** The declarations every row-table certificate shares: ids, then the rows and functions as tables. */
function rowSection(ids: { boxes: string[]; ports: EncodedPort[]; wires: string[] }, rows: ReturnType<typeof rowTables>, wires: Array<{ src?: number; tgt: number }>, valueNames: (p: number) => string[], values: number) {
  return [
    `abbrev Box := ${fin(ids.boxes.length)}`,
    `abbrev Port := ${fin(ids.ports.length)}`,
    `abbrev Fn := ${fin(wires.length)}`,
    `abbrev Row := ${fin(rows.length)}`,
    "",
    `def boxId : Box → String := ${vec(ids.boxes.map(leanString))}`,
    "/-- Each port's box and id. -/",
    `def portOwner : Port → String := ${vec(ids.ports.map((p) => leanString(p.box)))}`,
    `def portId : Port → String := ${vec(ids.ports.map((p) => leanString(p.port)))}`,
    `def fnId : Fn → String := ${vec(ids.wires.map(leanString))}`,
    "/-- The value each index stands for, per port. -/",
    `def portValueId : Port → Value → String := ${nested(ids.ports.map((_, p) => padded(valueNames(p).map(leanString), values)), (x) => x)}`,
    "",
    `def rowBox : Row → Box := ${vec(rows.map((r) => r.box))}`,
    `def rowFixes : Row → Port → Bool := ${nested(rows.map((r) => r.fixes), String)}`,
    `def rowValue : Row → Port → Value := ${nested(rows.map((r) => r.values), String)}`,
    `def fnSource : Fn → Port := ${vec(wires.map((w) => w.src!))}`,
    `def fnTarget : Fn → Port := ${vec(wires.map((w) => w.tgt))}`,
  ];
}

/**
 * Work of deciding over row tables: configurations or valuations checked, times the rows and ports
 * each check reads. Above MAX_CERT_ROWS generation fails closed.
 */
const rowWork = (checks: number, rows: number, ports: number, wires: number) => checks * (rows * (ports + 1) + wires);

/**
 * A reachable dynamics verdict is checked by its row-derived trace. A saturated unreachable
 * verdict uses the reached global states to exclude every admitted unsafe configuration.
 * State-only safety and independently provable negative verdicts use a reconstructed state
 * closure. Unsupported bounded-only and time-varying claims fail closed.
 */
export function dynamicsCertificate(model: FunctionModel, spec: DynamicsSpec, opts: { namespace?: string } = {}): Certificate {
  const ns = namespaceOf(opts);
  if (typeof ns !== "string") return ns;
  if (spec.inputs) {
    return fail([issue("certificate-input-sequence", "$.inputs", "an input sequence indexes the runs by time; a certificate covers runs without inputs",
      "Drop inputs to certify the escalation over every boundary value, or keep inputs and read the verdict without a certificate.")]);
  }
  if (!spec.unsafe && !spec.safe) {
    return fail([issue("certificate-needs-unsafe", "$.unsafe", "pass unsafe or safe: the certificate states supported reachability or safety claims",
      "Pass unsafe, the target set whose reachability the certificate states, e.g. [{ box, state: [...] }].")]);
  }
  const r = boundedDynamics(model, spec);
  if (!r.ok) return r;
  if (!r.decided) {
    return fail([issue("not-certifiable", "$.model", r.note, `Declare behavior or transition for ${quoted(r.missingBehavior)}; the runs depend on them, so nothing is decided to certify.`)]);
  }
  const esc = r.escalation;
  const stateOnly = [...spec.unsafe ?? [], ...spec.safe ?? []].every((c) => "state" in c);
  if (!esc || (esc.verdict !== "reachable" && stateOnly) || esc.verdict === "unreachable-within-horizon") return dynamicsInvariantCertificate(model, spec, ns, r);
  if (esc.verdict !== "reachable" && esc.verdict !== "unreachable") {
    return fail([issue("not-certifiable", "$.unsafe", `the escalation is ${esc.verdict}: only a reachable escalation, which a trace witnesses, or an unreachable one, which an invariant witnesses, is certified`,
      "Declare the rows the blocked state lacks (the trace ends there), so the verdict is decided.")]);
  }
  if (esc.verdict === "reachable" && !esc.trace[esc.trace.length - 1].values) {
    return fail([issue("not-certifiable", "$.unsafe", "the trace ends in a blocked state, which has no valuation to certify",
      "Declare the rows the blocked state lacks (blocked.first names it), so the run has a valuation there.")]);
  }

  const byId = new Map(model.boxes.map((b) => [b.id, b]));
  const composed = r.composed.map((id) => byId.get(id)!);
  const vars = portVariables(model, composed);
  const ports = encodedPorts(composed);
  const at = new Map(ports.map((p, i) => [portKeyOf(p.box, p.side, p.port), i]));
  const carrierValues = new Map(model.carriers.map((c) => [c.id, c.values ?? []]));
  const names = (p: number) => carrierValues.get(ports[p].carrier)!;
  const values = Math.max(1, ...ports.map((_, p) => names(p).length));
  const machines = r.machines;
  const states = Math.max(1, ...machines.map((m) => m.states.length));
  const rows = rowTables(composed, ports, at, (p, v) => names(p).indexOf(v));
  for (const row of rows) if (row.mach !== undefined) row.mach = machines.findIndex((m) => m.box === composed[row.box].id);
  const wires = encodedWires(model, at);
  // The witness: the trace, or the reached global states. Deciding the invariant enumerates every
  // valuation of the ports at each listed state, and every global state once per admitted one.
  const reached = esc.verdict === "unreachable" ? reachedStates(model, spec) : undefined;
  if (esc.verdict === "unreachable" && !reached) {
    return fail([issue("cap-exceeded", "$.max_states", "reconstructing the invariant exceeds the reached-state exploration cap", "Raise max_states within its limit, or certify a smaller model; invariant reconstruction also counts blocked global states.")]);
  }
  const globals = states ** machines.length;
  const work = rowWork(esc.verdict === "reachable" ? esc.trace.length + 2 : reached!.length * values ** ports.length * (globals + 2) + globals, rows.length, ports.length, wires.length);
  if (!Number.isFinite(work) || work > MAX_CERT_ROWS) {
    return fail([issue("cap-exceeded", "$.model", `deciding the ${reached ? "invariant" : "trace"} reads ${work} table entries, past the certificate limit of ${MAX_CERT_ROWS}`,
      reached
        ? "Declare fewer ports, values, or states on the composed boxes, or certify a smaller part of the model: the invariant is decided over every valuation of their ports."
        : "Remove repeated rows, declare fewer ports or rows on the composed boxes, or certify a smaller part of the model.")]);
  }

  // Targets as Bool tables: a condition on a box's state or a port's value; several on one intersect.
  const stateOk = machines.map((m) => Array.from({ length: states }, (_, s) => s < m.states.length));
  const valueOk = ports.map((_, p) => Array.from({ length: values }, (_, v) => v < names(p).length));
  for (const c of spec.unsafe!) {
    if ("state" in c) {
      const k = machines.findIndex((m) => m.box === c.box);
      stateOk[k] = stateOk[k].map((ok, s) => ok && c.state.includes(machines[k].states[s]));
    } else {
      const p = ports.findIndex((q) => q.box === c.box && q.port === c.port);
      valueOk[p] = valueOk[p].map((ok, v) => ok && c.values.includes(names(p)[v]));
    }
  }
  const initial = machines.map((m) => Array.from({ length: states }, (_, s) => s < m.states.length && m.initial.includes(m.states[s])));
  const stateIndices = (state: string[]) => vec(machines.map((m, k) => m.states.indexOf(state[k])));
  const lines = [
    "/-! ## The composed boxes as finite data -/",
    "",
    `abbrev Machine := ${fin(machines.length)}`,
    `abbrev State := ${fin(states)}`,
    `abbrev Value := ${fin(values)}`,
    ...rowSection({ boxes: composed.map((b) => b.id), ports, wires: wires.map((w) => w.id) }, rows, wires, names, values),
    `def machineId : Machine → String := ${vec(machines.map((m) => leanString(m.box)))}`,
    `def stateId : Machine → State → String := ${nested(machines.map((m) => padded(m.states.map(leanString), states)), (x) => x)}`,
    `def rowMachine : Row → Option Machine := ${vec(rows.map((row) => (row.mach === undefined ? "none" : `some ${row.mach}`)))}`,
    `def rowState : Row → State := ${vec(rows.map((row) => row.state))}`,
    `def rowNext : Row → State := ${vec(rows.map((row) => row.next))}`,
    "",
    "/-- The composed boxes' rows, read as one synchronous step (`Sync.Step`). -/",
    "def system : Sync Box Row Port Machine Fn State Value := ⟨rowBox, rowFixes, rowValue, rowMachine, rowState, rowNext, fnSource, fnTarget⟩",
    "",
    "/-- The states each machine may start in. -/",
    `def initial : Machine → State → Bool := ${nested(initial, String)}`,
    "/-- The unsafe set: the states and values it allows, per machine and per port. -/",
    `def unsafeState : Machine → State → Bool := ${nested(stateOk, String)}`,
    `def unsafeValue : Port → Value → Bool := ${nested(valueOk, String)}`,
  ];
  if (esc.verdict === "unreachable") {
    lines.push(
      "/-- The global states the kernel's search reached, blocked ones included: each machine's state. -/",
      `def invariant : ${fin(reached!.length)} → Machine → State := ${vec(reached!.map(stateIndices))}`,
      "",
      "/-! ## Verdicts -/",
      "",
      ...theorem("`boundedDynamics`: no run from an initial state reaches the unsafe set, at any horizon. The reached states hold every start, every step from them names one of them, and none meets the unsafe set (`unreachable_of_invariant`).",
        "unreachable", "∀ n, ∀ a ∈ system.starts initial, ∀ b ∈ system.target unsafeState unsafeValue, ¬ reachIn system.Step n a b",
        "unreachable_of_invariant (system.starts_subset_holding (inv := invariant) (by decide +kernel)) (system.closed_holding (inv := invariant) (by decide +kernel)) (system.disjoint_holding_target (inv := invariant) (by decide +kernel))"),
    );
    const certifies = [{ theorem: `${ns}.unreachable`, verdict: "boundedDynamics: no run reaches an admitted unsafe configuration, at any horizon" }];
    return certified({ kind: "dynamics", model, spec }, ns, assemble("one unreachable escalation", ns, [lines]), certifies);
  }
  const config = (step: { state: string[]; values?: string[] }) =>
    `(${stateIndices(step.state)}, ${vec(ports.map((q, p) => names(p).indexOf(step.values![vars.at(q.box, q.side, q.port)])))})`;
  // Every step of the trace except the last steps on; the last is the unsafe configuration.
  if (esc.trace.slice(0, -1).some((st) => !st.values)) {
    return fail([issue("internal-error", "$.unsafe", "the trace blocks before its end", "Report this: a returned trace blocks only at its last step.")]);
  }
  const k = esc.time;
  lines.push(
    "/-- The kernel's shortest trace: each machine's state and each port's value, at times 0 to the end. -/",
    `def trace : ${fin(esc.trace.length)} → (Machine → State) × (Port → Value) := ${vec(esc.trace.map(config))}`,
    "",
    "/-! ## Verdicts -/",
    "",
    ...theorem(`\`boundedDynamics\`: from an initial state, a run reaches the unsafe set within ${k} steps (\`reach_of_trace\`).`,
      "escalation", `∃ a ∈ system.starts initial, ∃ b ∈ system.target unsafeState unsafeValue, reachWithin system.Step ${k} a b`,
      "⟨traceOf trace 0, by decide +kernel, reach_of_trace (τ := traceOf trace) (by decide +kernel) le_rfl (by decide +kernel)⟩"),
  );
  const certifies = [{ theorem: `${ns}.escalation`, verdict: `boundedDynamics: a run reaches the unsafe set at time ${k}` }];
  return certified({ kind: "dynamics", model, spec }, ns, assemble("one escalation trace", ns, [lines]), certifies);
}

/**
 * Certificate of all pairs in a weakness ranking. Strict inclusion also certifies a larger count;
 * equality compares admitted sets; incomparability records opposed admitted/rejected witnesses.
 * Admission requires existence AND acceptance of every output. Rows are encoded independently
 * of the verdict and checked over every valuation, subject to MAX_CERT_ROWS.
 */
export function weaknessCertificate(concepts: Array<{ id: string; model: FunctionModel }>, acceptable: Acceptable[], opts: { namespace?: string; maxStates?: number; scope?: BehaviorScope; priors?: Prior[]; jointPrior?: JointPriorRow[] } = {}): Certificate {
  const ns = namespaceOf(opts);
  if (typeof ns !== "string") return ns;
  const r = weaknessRanking(concepts, acceptable, { maxStates: opts.maxStates, scope: opts.scope, priors: opts.priors, jointPrior: opts.jointPrior });
  if (!r.ok) return r;
  if (r.verdict !== "ranked") {
    return fail([issue("not-certifiable", "$.concepts", `the ranking is ${r.verdict}: ${r.note}`, "Decide the ranking first (declare the missing behaviour, or reduce the values below the cap); only a decided ranking is certified.")]);
  }
  const pairs = r.pairs;

  // Value indices: one order per carrier id, the sorted union of its values in every concept. A
  // function's two ends share a carrier, and a situation or deliverable is read the same way in
  // every concept, so every equality the tables state compares indices of one order.
  const situations = r.situations, deliverables = r.deliverables;
  const orders = new Map<string, string[]>();
  const order = (carrier: string) => orders.get(carrier)
    ?? orders.set(carrier, [...new Set(concepts.flatMap((c) => c.model.carriers.find((x) => x.id === carrier)?.values ?? []))].sort()).get(carrier)!;
  const same = (a: { box: string; port: string }) => (q: { box: string; port: string }) => q.box === a.box && q.port === a.port;
  const inputValues = situations.map((q) => order(q.carrier));
  const deliverableValues = deliverables.map((d) => order(d.carrier));

  const encoded = concepts.map((c) => {
    const composed = behaviorPlan(c.model, deliverables, { scope: opts.scope }).composed;
    const ports = encodedPorts(composed, deliverables);
    const at = new Map(ports.map((p, i) => [portKeyOf(p.box, p.side, p.port), i]));
    const wires = encodedWires(c.model, at);
    const fed = new Set(wires.map((w) => w.tgt));
    const names = ports.map((q) => order(q.carrier));
    const rows = rowTables(composed, ports, at, (p, v) => names[p].indexOf(v));
    const reads = situations.map((q) => ports.findIndex((p, i) => p.side === "in" && !fed.has(i) && same(q)(p)));
    const delivers = deliverables.map((d) => at.get(portKeyOf(d.box, "in", d.port))!);
    return { id: c.id, composed, ports, wires, names, rows, reads, delivers };
  });
  const values = Math.max(1, ...encoded.flatMap((e) => e.names.map((n) => n.length)), ...inputValues.map((n) => n.length), ...deliverableValues.map((n) => n.length));
  // A situation input ranges over the values its carrier declares in a concept that reads it as a boundary input (the readers agree).
  const declaredInput = situations.map((q, j) => {
    const k = encoded.findIndex((e) => e.reads[j] >= 0);
    return concepts[k].model.carriers.find((x) => x.id === q.carrier)!.values ?? [];
  });
  for (const p of pairs) {
    const pair = p.concepts.map((id) => encoded.find((e) => e.id === id)!);
    const work = pair.reduce((n, e) => n + rowWork(values ** (situations.length + deliverables.length + e.ports.length), e.rows.length, e.ports.length, e.wires.length), 0);
    if (!Number.isFinite(work) || work > MAX_CERT_ROWS) {
      return fail([issue("cap-exceeded", "$.concepts", `concepts '${p.concepts[0]}' and '${p.concepts[1]}': deciding their inclusion reads ${work} table entries, past the certificate limit of ${MAX_CERT_ROWS}`,
        "Certify smaller concepts: fewer ports or values on the composed boxes. The decision enumerates every valuation of each concept's ports.")]);
    }
  }

  // The acceptable values the ranking used: derived from a threshold (listed in the result), else given for the port, else for its carrier.
  const accepted = (d: { box: string; port: string; carrier: string }) => (r.acceptable?.find(same(d))?.values
    ?? (acceptable.find((a) => a.box === d.box && a.port === d.port) ?? acceptable.find((a) => a.carrier === d.carrier))?.values ?? []);
  const relation = (i: number) => `(Concept${i}.rows.relation inputDomain Concept${i}.reads Concept${i}.delivers)`;
  const lines = [
    "/-! ## The situations and the deliverables -/",
    "",
    `abbrev Input := ${fin(situations.length)}`,
    `abbrev Deliverable := ${fin(deliverables.length)}`,
    `abbrev Value := ${fin(values)}`,
    `def inputId : Input → String := ${vec(situations.map((q) => leanString(`${q.box}.${q.port}`)))}`,
    `def deliverableId : Deliverable → String := ${vec(deliverables.map((d) => leanString(`${d.box}.${d.port}`)))}`,
    `def inputValueId : Input → Value → String := ${nested(inputValues.map((n) => padded(n.map(leanString), values)), (x) => x)}`,
    `def deliverableValueId : Deliverable → Value → String := ${nested(deliverableValues.map((n) => padded(n.map(leanString), values)), (x) => x)}`,
    "/-- The situations: each input at one of its declared values. -/",
    `def inputDomain : Input → Value → Bool := ${nested(inputValues.map((n, j) => Array.from({ length: values }, (_, v) => v < n.length && declaredInput[j].includes(n[v]))), String)}`,
    "/-- The acceptable values of each deliverable. -/",
    `def acceptable : Deliverable → Value → Bool := ${nested(deliverables.map((d, i) => Array.from({ length: values }, (_, v) => v < deliverableValues[i].length && accepted(d).includes(deliverableValues[i][v]))), String)}`,
    "",
  ];
  encoded.forEach((e, i) => {
    lines.push(
      `/-! ## Concept${i}: the concept named by \`conceptId\` -/`,
      "",
      `namespace Concept${i}`,
      "",
      `def conceptId : String := ${leanString(e.id)}`,
      ...rowSection({ boxes: e.composed.map((b) => b.id), ports: e.ports, wires: e.wires.map((w) => w.id) }, e.rows, e.wires, (p) => e.names[p], values),
      "/-- The port each situation input is, where the concept reads it. -/",
      `def reads : Input → Option Port := ${vec(e.reads.map((p) => (p < 0 ? "none" : `some ${p}`)))}`,
      `def delivers : Deliverable → Port := ${vec(e.delivers)}`,
      "/-- The composed boxes' rows; `rows.relation inputDomain reads delivers` is the concept's input→deliverable relation. -/",
      "def rows : Rows Box Row Port Fn Value := ⟨rowBox, rowFixes, rowValue, fnSource, fnTarget⟩",
      "",
      `end Concept${i}`,
      "",
    );
  });
  lines.push("/-! ## Verdicts -/", "");
  const certifies: Certified[] = [];
  for (const p of pairs) {
    const [a, b] = p.concepts.map((id) => concepts.findIndex((c) => c.id === id));
    if (p.order === "equal") {
      lines.push(...theorem("The two concepts admit exactly the same situations (existence and all outputs acceptable).",
        `equal_${a}_${b}`, `admits ${relation(a)} (accepts acceptable) = admits ${relation(b)} (accepts acceptable)`, "by ext u; revert u; decide +kernel"));
      certifies.push({ theorem: `${ns}.equal_${a}_${b}`, verdict: `weaknessRanking: '${concepts[a].id}' and '${concepts[b].id}' admit equal situations` });
      continue;
    }
    if (p.order === "incomparable") {
      const witness = (input: Array<{ box: string; port: string; value: string }>) => vec(situations.map((q, j) => inputValues[j].indexOf(input.find(same(q))!.value)));
      lines.push(`def firstOnly${a}X${b} : Input → Value := ${witness(p.onlyFirst!)}`, `def secondOnly${a}X${b} : Input → Value := ${witness(p.onlySecond!)}`, "",
        ...theorem("A situation admitted only by the first concept.", `firstOnly_${a}_${b}`, `firstOnly${a}X${b} ∈ admits ${relation(a)} (accepts acceptable) ∧ firstOnly${a}X${b} ∉ admits ${relation(b)} (accepts acceptable)`, "by decide +kernel"),
        ...theorem("A situation admitted only by the second concept.", `secondOnly_${a}_${b}`, `secondOnly${a}X${b} ∈ admits ${relation(b)} (accepts acceptable) ∧ secondOnly${a}X${b} ∉ admits ${relation(a)} (accepts acceptable)`, "by decide +kernel"),
        ...theorem("Neither concept admits every situation the other admits.", `incomparable_${a}_${b}`, `¬ AtLeastAsWeak (accepts acceptable) ${relation(a)} ${relation(b)} ∧ ¬ AtLeastAsWeak (accepts acceptable) ${relation(b)} ${relation(a)}`, `incomparable_of_witnesses firstOnly_${a}_${b}.1 firstOnly_${a}_${b}.2 secondOnly_${a}_${b}.1 secondOnly_${a}_${b}.2`));
      certifies.push({ theorem: `${ns}.incomparable_${a}_${b}`, verdict: `weaknessRanking: '${concepts[a].id}' and '${concepts[b].id}' are incomparable` });
      continue;
    }
    const [w, s] = p.order === "first-weaker" ? [a, b] : [b, a];
    lines.push(
      ...theorem(`\`weaknessRanking\`: concept ${w} admits every situation concept ${s} admits, and one it does not.`,
        `weaker_${w}_${s}`, `AtLeastAsWeak (accepts acceptable) ${relation(w)} ${relation(s)} ∧ ¬ AtLeastAsWeak (accepts acceptable) ${relation(s)} ${relation(w)}`,
        "by decide +kernel"),
      ...theorem(`\`weaknessRanking\`: so concept ${w} admits strictly more situations (\`card_lt_of_strictly_weaker\`).`,
        `count_${w}_${s}`, `(admitted (accepts acceptable) ${relation(s)}).card < (admitted (accepts acceptable) ${relation(w)}).card`,
        "card_lt_of_strictly_weaker (by decide +kernel)"),
    );
    certifies.push(
      { theorem: `${ns}.weaker_${w}_${s}`, verdict: `weaknessRanking: '${concepts[w].id}' is strictly weaker than '${concepts[s].id}'` },
      { theorem: `${ns}.count_${w}_${s}`, verdict: `weaknessRanking: '${concepts[w].id}' admits strictly more situations than '${concepts[s].id}'` },
    );
  }
  return certified({ kind: "weakness", concepts, acceptable, scope: opts.scope ?? "upstream", ...(opts.maxStates !== undefined ? { maxStates: opts.maxStates } : {}), ...(opts.priors !== undefined ? { priors: opts.priors } : {}), ...(opts.jointPrior !== undefined ? { jointPrior: opts.jointPrior } : {}) }, ns, assemble("all pairs of a weakness ranking", ns, [lines]), certifies);
}

type DecidedDynamics = Extract<ReturnType<typeof boundedDynamics>, { decided: true }>;
/** Independently enumerate the step relation from rows, then prove state-only inductive safety.
Successor valuations are arbitrary in Sync.Step, so the invariant deliberately contains ALL
valuations of each selected global state; a BFS list of valid configurations would not be closed. */
function dynamicsInvariantCertificate(model: FunctionModel, spec: DynamicsSpec, ns: string, r: DecidedDynamics): Certificate {
  const targets = [...spec.unsafe ?? [], ...spec.safe ?? []];
  if (targets.some((c) => !("state" in c))) return fail([issue("not-certifiable", "$.model", "this safety-invariant certificate requires state-only targets", "Port-target unreachability requires a saturated escalation without safe predicates; bounded-only port safety is not certified.")]);
  if (r.escalation?.verdict === "undecided" || r.invariance?.verdict === "violated" || r.invariance?.verdict === "undecided") return fail([issue("not-certifiable", "$.model", "no negative dynamics verdict can be certified", "Provide a state-only invariant or an unreachable unsafe target.")]);
  const composed = r.composed.map((id) => model.boxes.find((b) => b.id === id)!);
  const ports = encodedPorts(composed), at = new Map(ports.map((p, i) => [portKeyOf(p.box, p.side, p.port), i]));
  const names = (p: number) => model.carriers.find((c) => c.id === ports[p].carrier)!.values!;
  const values = Math.max(1, ...ports.map((_, p) => names(p).length)), machines = r.machines;
  const states = Math.max(1, ...machines.map((m) => m.states.length));
  const rows = rowTables(composed, ports, at, (p, v) => names(p).indexOf(v));
  for (const row of rows) if (row.mach !== undefined) row.mach = machines.findIndex((m) => m.box === composed[row.box].id);
  const wires = encodedWires(model, at);
  const stateCount = states ** machines.length, valueCount = values ** ports.length;
  const work = rowWork(stateCount ** 2 * valueCount, rows.length, ports.length, wires.length);
  if (!Number.isFinite(work) || work > MAX_CERT_ROWS) return fail([issue("cap-exceeded", "$.model", `deciding inductive closure reads ${work} table entries, past the certificate limit of ${MAX_CERT_ROWS}`, "Use fewer stateful boxes, ports, values, or rows.")]);
  const tuples = (width: number, count: number) => Array.from({ length: width ** count }, (_, n) => { let k = n; return Array.from({ length: count }, () => { const x = k % width; k = Math.floor(k / width); return x; }); });
  const ss = tuples(states, machines.length), vv = tuples(values, ports.length);
  const fits = (row: typeof rows[number], st: number[], vl: number[], next: number[]) => row.fixes.every((fixed, p) => !fixed || vl[p] === row.values[p]) && (row.mach === undefined || (st[row.mach] === row.state && next[row.mach] === row.next));
  const step = (st: number[], next: number[]) => vv.some((vl) => wires.every((w) => vl[w.src!] === vl[w.tgt]) && composed.every((_, b) => rows.some((row) => row.box === b && fits(row, st, vl, next))));
  const initial = machines.map((m) => Array.from({ length: states }, (_, s) => s < m.states.length && m.initial.includes(m.states[s])));
  const reached = new Set(ss.flatMap((st, i) => st.every((s, m) => initial[m][s]) ? [i] : []));
  const queue = [...reached]; for (let i = 0; i < queue.length; i++) for (let j = 0; j < ss.length; j++) if (!reached.has(j) && step(ss[queue[i]], ss[j])) { reached.add(j); queue.push(j); }
  const table = (conditions: NonNullable<DynamicsSpec["safe"]>) => machines.map((m) => Array.from({ length: states }, (_, s) => conditions.filter((c) => c.box === m.box && "state" in c).every((c) => "state" in c && c.state.includes(m.states[s]))));
  const unsafe = spec.unsafe && table(spec.unsafe), safe = spec.safe && table(spec.safe);
  if ((unsafe && [...reached].some((i) => ss[i].every((s, m) => unsafe[m][s]))) || (safe && [...reached].some((i) => ss[i].some((s, m) => !safe[m][s])))) return fail([issue("not-certifiable", "$.horizon", "the independently closed state set does not establish an invariant; only the bounded horizon verdict holds", "Bounded-layer certificates are not implemented; increase the horizon to find the later counterexample, or read the bounded verdict without a certificate.")]);
  const lines = ["/-! ## Independently derived state invariant -/", "", `abbrev Machine := ${fin(machines.length)}`, `abbrev State := ${fin(states)}`, `abbrev Value := ${fin(values)}`,
    ...rowSection({ boxes: composed.map((b) => b.id), ports, wires: wires.map((w) => w.id) }, rows, wires, names, values),
    `def machineId : Machine → String := ${vec(machines.map((m) => leanString(m.box)))}`,
    `def stateId : Machine → State → String := ${nested(machines.map((m) => padded(m.states.map(leanString), states)), (x) => x)}`,
    `def rowMachine : Row → Option Machine := ${vec(rows.map((row) => row.mach === undefined ? "none" : `some ${row.mach}`))}`,
    `def rowState : Row → State := ${vec(rows.map((row) => row.state))}`, `def rowNext : Row → State := ${vec(rows.map((row) => row.next))}`,
    "def system : Sync Box Row Port Machine Fn State Value := ⟨rowBox, rowFixes, rowValue, rowMachine, rowState, rowNext, fnSource, fnTarget⟩",
    `def initial : Machine → State → Bool := ${nested(initial, String)}`,
    `def invariantStates : List (Machine → State) := [${[...reached].sort((a,b) => a-b).map((i) => vec(ss[i])).join(", ")}]`,
    "abbrev invariant : Set ((Machine → State) × (Port → Value)) := {c | c.1 ∈ invariantStates}", "",
    ...theorem("Every initial configuration is in the invariant.", "invariantInitial", "system.starts initial ⊆ invariant", "by intro a ha; revert a; decide +kernel"),
    ...theorem("The actual row-derived step relation preserves the invariant, including every successor valuation.", "invariantClosed", "Closed system.Step invariant", "by rintro ⟨s, v⟩ hs ⟨t, w⟩ h; exact (show ∀ s v t, s ∈ invariantStates → system.Step (s, v) (t, v) → t ∈ invariantStates from by decide +kernel) s v t hs h")];
  const certifies: Certified[] = [];
  if (unsafe) {
    lines.push(`def unsafeState : Machine → State → Bool := ${nested(unsafe, String)}`, "",
      ...theorem("The invariant misses every unsafe state.", "invariantDisjoint", "Disjoint invariant {c | ∀ m, unsafeState m (c.1 m) = true}", "Set.disjoint_left.mpr (by decide +kernel)"),
      ...theorem("No initial run reaches an unsafe state at any finite time.", "unreachable", "∀ a ∈ system.starts initial, ∀ n b, reachIn system.Step n a b → ¬ (∀ m, unsafeState m (b.1 m) = true)", "by intro a ha n b h hb; exact unreachable_of_invariant invariantInitial invariantClosed invariantDisjoint n a ha b hb h"));
    certifies.push({ theorem: `${ns}.unreachable`, verdict: "boundedDynamics: the state-only unsafe target is unreachable at every horizon" });
  }
  if (safe) {
    lines.push(`def safeState : Machine → State → Bool := ${nested(safe, String)}`, "",
      ...theorem("Every invariant state meets the safe state conditions.", "invariantSafe", "∀ b ∈ invariant, ∀ m, safeState m (b.1 m) = true", "by decide +kernel"),
      ...theorem("Every initial run meets the safe state conditions at every finite time.", "safetyInvariant", "∀ a ∈ system.starts initial, ∀ n b, reachIn system.Step n a b → ∀ m, safeState m (b.1 m) = true", "by intro a ha n b h; exact invariantSafe b (closed_reachIn invariantClosed (invariantInitial ha) n h)"));
    certifies.push({ theorem: `${ns}.safetyInvariant`, verdict: "boundedDynamics: the state-only safe conditions are invariant at every horizon" });
  }
  return certified({ kind: "dynamics", model, spec }, ns, assemble("state-only inductive safety", ns, [lines]), certifies);
}

type Comparison = Extract<ReturnType<typeof compareBehavior>, { ok: true }>;

/** Relation equality (including nonemptiness), or a member/nonmember witness, over aligned row tables.
 * Models retain their own ids; inputs use baseline ids, and only baseline deliverables are observed.
 * Scope, box-map transport, one-sided input domains and the exact request are bound in the manifest.
 */
export function behaviorCertificate(baseline: FunctionModel, concept: FunctionModel, opts: { boxMap?: Record<string, string>; maxStates?: number; scope?: BehaviorScope; namespace?: string } = {}): Certificate {
  const ns = namespaceOf(opts);
  if (typeof ns !== "string") return ns;
  const r = compareBehavior(baseline, concept, opts);
  return r.ok ? comparisonCertificate(baseline, concept, opts, r, ns) : r;
}

/** Apply the declared trim, then certify its exact baseline/concept comparison in the selected scope. */
export function trimCertificate(model: FunctionModel, spec: { trim: string[]; absorb?: Record<string, { box: string; port: string }>; maxStates?: number; scope?: BehaviorScope }, opts: { namespace?: string } = {}): Certificate {
  const applied = applyTrim(model, spec);
  if (!applied.ok) return applied;
  return behaviorCertificate(model, applied.model, { ...opts, maxStates: spec.maxStates, scope: spec.scope });
}

function comparisonCertificate(baseline: FunctionModel, concept: FunctionModel, opts: { boxMap?: Record<string, string>; maxStates?: number; scope?: BehaviorScope }, r: Comparison, ns: string): Certificate {
  if (r.verdict === "undecided" || (r.verdict === "changed" && r.reason !== "counterexample")) {
    return fail([issue("not-certifiable", "$.model", `the verdict is ${r.verdict} (${r.reason}): no row-relation verdict can be certified`,
      "Declare missing behavior and preserve the compared deliverable interface; equality of empty relations is not a preserved verdict.")]);
  }
  const boxMap = opts.boxMap ?? {};
  const align = alignment(baseline, concept, boxMap);
  if (!align.ok) return align;
  const situations = r.inputs, deliverables = r.deliverables;
  const key = (d: { box: string; port: string; carrier: string }) => JSON.stringify([d.box, d.port, d.carrier]);
  const offered = new Map(deliverablePorts(concept).map((d) => [key(align.toBaseline(d)), d]));
  const observed = deliverables.map((d) => offered.get(key(d)));
  if (observed.some((d) => !d)) return fail([issue("internal-error", "$.model", "a compared concept lacks a baseline deliverable", "Report this with the models; the kernel's verdict and its certificate disagree.")]);

  // Value indices: one order per carrier id, the sorted union of its values in both models, so a
  // situation or deliverable is read the same way in both and every equality compares one order.
  const orders = new Map<string, string[]>();
  const order = (carrier: string) => orders.get(carrier)
    ?? orders.set(carrier, [...new Set([baseline, concept].flatMap((m) => m.carriers.find((x) => x.id === carrier)?.values ?? []))].sort()).get(carrier)!;
  const sides = [
    { name: "Baseline", doc: "the baseline (`compare_to`, or the model before its trim)", model: baseline, observe: deliverables, toBaseline: (box: string) => box },
    { name: "Concept", doc: "the concept (`model`, or the model after its trim)", model: concept, observe: observed.map((d) => d!), toBaseline: (box: string) => align.toBaseline({ box, port: "", carrier: "" }).box },
  ].map((side) => {
    const composed = behaviorPlan(side.model, side.observe, { scope: opts.scope }).composed;
    const ports = encodedPorts(composed, side.observe);
    const at = new Map(ports.map((p, i) => [portKeyOf(p.box, p.side, p.port), i]));
    const wires = encodedWires(side.model, at);
    const fed = new Set(wires.map((w) => w.tgt));
    const names = ports.map((q) => order(q.carrier));
    const rows = rowTables(composed, ports, at, (p, v) => names[p].indexOf(v));
    const reads = situations.map((q) => ports.findIndex((p, i) => p.side === "in" && !fed.has(i) && side.toBaseline(p.box) === q.box && p.port === q.port));
    const delivers = side.observe.map((d) => at.get(portKeyOf(d.box, "in", d.port))!);
    return { ...side, composed, ports, wires, names, rows, reads, delivers };
  });
  if (situations.some((_, j) => sides.every((s) => s.reads[j] < 0))) {
    return fail([issue("internal-error", "$.model", "a compared input is read by neither model", "Report this with the models; the kernel's inputs and the certificate's disagree.")]);
  }
  const inputValues = situations.map((q) => order(q.carrier));
  const deliverableValues = deliverables.map((d) => order(d.carrier));
  const values = Math.max(1, ...sides.flatMap((s) => s.names.map((n) => n.length)), ...inputValues.map((n) => n.length), ...deliverableValues.map((n) => n.length));
  // An input ranges over the values its carrier declares in the baseline when the baseline reads it, else in the concept.
  const declaredInput = situations.map((q, j) => sides.find((s) => s.reads[j] >= 0)!.model.carriers.find((x) => x.id === q.carrier)!.values ?? []);
  const work = sides.reduce((n, s) => n + rowWork(values ** (situations.length + deliverables.length + s.ports.length), s.rows.length, s.ports.length, s.wires.length), 0);
  if (!Number.isFinite(work) || work > MAX_CERT_ROWS) {
    return fail([issue("cap-exceeded", "$.model", `deciding the ${r.verdict === "preserved" ? "equality" : "relation comparison"} reads ${work} table entries, past the certificate limit of ${MAX_CERT_ROWS}`,
      "Certify smaller models: fewer ports or values on the composed boxes. The decision enumerates every valuation of each model's ports.")]);
  }

  const relation = (side: string) => `${side}.rows.relation inputDomain ${side}.reads ${side}.delivers`;
  const lines = [
    "/-! ## The situations and the deliverables -/",
    "",
    `abbrev Input := ${fin(situations.length)}`,
    `abbrev Deliverable := ${fin(deliverables.length)}`,
    `abbrev Value := ${fin(values)}`,
    "/-- Inputs and deliverables in the baseline's box ids. -/",
    `def inputId : Input → String := ${vec(situations.map((q) => leanString(`${q.box}.${q.port}`)))}`,
    `def deliverableId : Deliverable → String := ${vec(deliverables.map((d) => leanString(`${d.box}.${d.port}`)))}`,
    `def inputValueId : Input → Value → String := ${nested(inputValues.map((n) => padded(n.map(leanString), values)), (x) => x)}`,
    `def deliverableValueId : Deliverable → Value → String := ${nested(deliverableValues.map((n) => padded(n.map(leanString), values)), (x) => x)}`,
    "/-- The situations: each input at one of its declared values. -/",
    `def inputDomain : Input → Value → Bool := ${nested(inputValues.map((n, j) => Array.from({ length: values }, (_, v) => v < n.length && declaredInput[j].includes(n[v]))), String)}`,
    "",
  ];
  for (const s of sides) {
    lines.push(
      `/-! ## ${s.name}: ${s.doc}, in its own box ids -/`,
      "",
      `namespace ${s.name}`,
      "",
      ...rowSection({ boxes: s.composed.map((b) => b.id), ports: s.ports, wires: s.wires.map((w) => w.id) }, s.rows, s.wires, (p) => s.names[p], values),
      "/-- The port each situation input is, where this model reads it. -/",
      `def reads : Input → Option Port := ${vec(s.reads.map((p) => (p < 0 ? "none" : `some ${p}`)))}`,
      `def delivers : Deliverable → Port := ${vec(s.delivers)}`,
      "/-- The composed boxes' rows; `rows.relation inputDomain reads delivers` is the model's input→deliverable relation. -/",
      "def rows : Rows Box Row Port Fn Value := ⟨rowBox, rowFixes, rowValue, fnSource, fnTarget⟩",
      "",
      `end ${s.name}`,
      "",
    );
  }
  lines.push("/-! ## Verdicts -/", "");
  const certifies: Certified[] = [];
  if (r.verdict === "preserved") {
    lines.push(
      ...theorem("`compareBehavior`: the concept relates every situation to exactly the deliverable values the baseline does, decided over every situation and valuation.",
        "preserved", `${relation("Baseline")} = ${relation("Concept")}`, "by funext u y; apply propext; revert u y; decide +kernel"),
      ...theorem("`compareBehavior`: the relations are not empty: some situation has a steady state, so the equality is not vacuous.",
        "nonempty", `∃ u y, ${relation("Baseline")} u y`, "by decide +kernel"),
    );
    certifies.push(
      { theorem: `${ns}.preserved`, verdict: "compareBehavior: preserved, the input→deliverable relations are equal" },
      { theorem: `${ns}.nonempty`, verdict: "compareBehavior: the relations are not empty" },
    );
  } else {
    const [a, b] = r.counterexample.onlyBaseline.length ? ["Baseline", "Concept"] : ["Concept", "Baseline"];
    lines.push(...theorem("A pair belongs to one relation and does not belong to the other.", "behaviorChanged", `∃ u y, ${relation(a)} u y ∧ ¬ ${relation(b)} u y`, "by decide +kernel"));
    certifies.push({ theorem: `${ns}.behaviorChanged`, verdict: "compareBehavior: a pair belongs to only one declared input-output relation" });
  }
  const request: CertificateRequest = { kind: "behavior", baseline, concept, scope: opts.scope ?? "upstream", ...(opts.maxStates !== undefined ? { maxStates: opts.maxStates } : {}), ...(opts.boxMap !== undefined ? { boxMap: opts.boxMap } : {}) };
  return certified(request, ns, assemble("one behavior comparison", ns, [lines]), certifies);
}
