/**
 * Per-instance Lean certificates: translation validation of kernel verdicts.
 *
 * The kernel (src/act.ts) is TypeScript. Tests check it against theory/CategoricalTriz.lean, and
 * nothing is extracted from Lean. A certificate checks one run instead. It encodes one model as
 * finite tables, states the kernel's verdicts about those tables in the theory's terms, and
 * proves each by `decide` and the theorem the verdict cites. Lean then checks that instance.
 *
 *  - checkModel ok       — `Wiring.Typed` of the encoded diagram: every function runs from an
 *                          output port to an input port, both of its carrier. Duplicate ids and
 *                          behaviour rows are not encoded.
 *  - harmLoops witnesses — for each reported cycle, the function is negative, its return path is
 *                          checked step by step, and `edge_on_cycle` closes the loop. That the
 *                          list of loops is complete is not certified.
 *  - separationCheck     — whether one value meets every demand; each pair's status (compatible: a
 *                          shared value; separated: disjoint values, the exact separating axes,
 *                          and `glue_of_disjoint_regions`; irreducible: disjoint values, a shared
 *                          cell, and `no_section_of_overlap`); gluable or not, by
 *                          `exists_section_iff`.
 *  - boundedDynamics     — a reachable escalation: the composed boxes' rows as a `Sync` table,
 *                          the initial and unsafe sets as Bool tables, and the kernel's shortest
 *                          trace; `reach_of_trace` with each step and the end decided on the
 *                          tables. Only reachability is certified, never its absence.
 *  - weaknessRanking     — each strictly ordered pair: both concepts' rows as `Rows` tables, the
 *                          relation each composes, strict inclusion of what they admit
 *                          (`AtLeastAsWeak` one way and not the other), and the strictly larger
 *                          count (`card_lt_of_strictly_weaker`), all decided over every valuation.
 *
 * Statements come from the kernel's result, not from a second implementation. The generator only
 * finds witnesses (the wire behind a step, a shared cell) and fails closed when one is missing.
 * Ids appear only inside escaped string literals, so model text cannot inject Lean. Pure: the
 * hosted Worker bundles it.
 */
import { Axis, baseOf, checkModel, harmLoops, separationCheck, type FunctionModel, type PhysicalContradiction } from "./act.js";
import { plan as behaviorPlan, portVariables, weaknessRanking } from "./act-behavior.js";
import { boundedDynamics, type DynamicsSpec } from "./act-dynamics.js";

/** Cap on cells × demands × values per contradiction; at the cap `decide` takes about ten seconds. */
export const MAX_CERT_WORK = 100_000;
/** Cap on functions × ports, which bounds the work of deciding `typed`. */
export const MAX_CERT_WIRING = 250_000;
export const DEFAULT_NAMESPACE = "TrizCertificate";

type Failure = { ok: false; errors: string[] };
export interface Certified { theorem: string; verdict: string; }
export type Certificate = { ok: true; namespace: string; content: string; certifies: Certified[] } | Failure;

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
  "the encoding: read them to see that the data is the model you meant.",
  "",
  "Check with `node scripts/certify.mjs <file>` in a checkout of github.com/sv/triz-skill: Lean",
  "against `theory/` when it is built, otherwise the AXLE service.",
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
    return { ok: false, errors: [`${model.wires.length} functions × ${ports.length} ports exceeds the certificate limit of ${MAX_CERT_WIRING}`] };
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
        if (step < 0) return { ok: false, errors: [`harmLoops witness for '${cycle.via}': no function from '${a}' to '${b}'`] };
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
function separationSection(pc: PhysicalContradiction, sub: string, certifies: Certified[], ns: string): string[] | Failure {
  const r = separationCheck(pc);
  if (!r.ok) return r;
  const { universe, region } = baseOf(pc);
  const axes = AXES.filter((a) => universe[a].length);
  const values = [...new Set(pc.demands.flatMap((d) => d.values))].sort();
  const cells = axes.reduce((n, a) => n * universe[a].length, 1);
  const work = cells * pc.demands.length * values.length;
  if (work > MAX_CERT_WORK) {
    return { ok: false, errors: [`contradiction '${pc.id}': ${cells} cells × ${pc.demands.length} demands × ${values.length} values exceeds the certificate limit of ${MAX_CERT_WORK}`] };
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
      if (c === undefined) return { ok: false, errors: [`separationCheck witness for ${label}: no shared ${a} cell`] };
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
  if (!NAMESPACE.test(ns)) return { ok: false, errors: [`namespace '${ns}' must be a capitalised alphanumeric Lean identifier`] };
  return RESERVED_NAMESPACES.has(ns) ? { ok: false, errors: [`namespace '${ns}' is a Lean keyword`] } : ns;
}

/** Certificate for a model: typing, harm-loop witnesses, and each embedded contradiction. Fails closed. */
export function modelCertificate(model: FunctionModel, opts: { namespace?: string } = {}): Certificate {
  const ns = namespaceOf(opts);
  if (typeof ns !== "string") return ns;
  const check = checkModel(model);
  if (!check.ok) return { ok: false, errors: check.errors };
  const certifies: Certified[] = [];
  const wiring = wiringSection(model, certifies, ns);
  if (!Array.isArray(wiring)) return wiring;
  const sections = [wiring];
  for (const [k, pc] of (model.contradictions ?? []).entries()) {
    const s = separationSection(pc, `Separation${k}`, certifies, ns);
    if (!Array.isArray(s)) return { ok: false, errors: s.errors.map((e) => (e.startsWith("contradiction ") ? e : `contradiction '${pc.id}': ${e}`)) };
    sections.push(s);
  }
  return { ok: true, namespace: ns, content: assemble("one function model", ns, sections), certifies };
}

/** Certificate for one physical contradiction's separation verdicts. Fails closed. */
export function separationCertificate(pc: PhysicalContradiction, opts: { namespace?: string } = {}): Certificate {
  const ns = namespaceOf(opts);
  if (typeof ns !== "string") return ns;
  const certifies: Certified[] = [];
  const s = separationSection(pc, "Separation0", certifies, ns);
  if (!Array.isArray(s)) return s;
  return { ok: true, namespace: ns, content: assemble("one physical contradiction", ns, [s]), certifies };
}

/** Cap on the work of deciding a dynamics or weakness certificate; see `rowWork`. */
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
 * Certificate of a `triz_dynamics` escalation: from an initial state, a run reaches the unsafe set
 * within the trace's length. The composed boxes' rows are the data; the kernel's shortest trace
 * is the witness. Fails closed on anything else: an unreachable or undecided escalation (whose
 * claim is universal), a trace that ends blocked, and an input sequence.
 */
export function dynamicsCertificate(model: FunctionModel, spec: DynamicsSpec, opts: { namespace?: string } = {}): Certificate {
  const ns = namespaceOf(opts);
  if (typeof ns !== "string") return ns;
  if (spec.inputs) return { ok: false, errors: ["an input sequence indexes the runs by time; a certificate covers runs without inputs"] };
  if (!spec.unsafe) return { ok: false, errors: ["pass unsafe: the certificate states an escalation into it"] };
  const r = boundedDynamics(model, spec);
  if (!r.ok) return r;
  if (!r.decided) return { ok: false, errors: [r.note] };
  const esc = r.escalation!;
  if (esc.verdict !== "reachable") return { ok: false, errors: [`the escalation is ${esc.verdict}: only a reachable escalation, which a trace witnesses, is certified`] };
  const last = esc.trace[esc.trace.length - 1];
  if (!last.values) return { ok: false, errors: ["the trace ends in a blocked state, which has no valuation to certify"] };

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
  const work = rowWork(esc.trace.length + 2, rows.length, ports.length, wires.length);
  if (work > MAX_CERT_ROWS) return { ok: false, errors: [`deciding the trace reads ${work} table entries, past the certificate limit of ${MAX_CERT_ROWS}`] };

  // Targets as Bool tables: a condition on a box's state or a port's value; several on one intersect.
  const stateOk = machines.map((m) => Array.from({ length: states }, (_, s) => s < m.states.length));
  const valueOk = ports.map((_, p) => Array.from({ length: values }, (_, v) => v < names(p).length));
  for (const c of spec.unsafe) {
    if ("state" in c) {
      const k = machines.findIndex((m) => m.box === c.box);
      stateOk[k] = stateOk[k].map((ok, s) => ok && c.state.includes(machines[k].states[s]));
    } else {
      const p = ports.findIndex((q) => q.box === c.box && q.port === c.port);
      valueOk[p] = valueOk[p].map((ok, v) => ok && c.values.includes(names(p)[v]));
    }
  }
  const initial = machines.map((m) => Array.from({ length: states }, (_, s) => s < m.states.length && m.initial.includes(m.states[s])));
  const config = (step: { state: string[]; values?: string[] }) => {
    const st = machines.map((m, k) => m.states.indexOf(step.state[k]));
    const vl = ports.map((q, p) => names(p).indexOf(step.values![vars.at(q.box, q.side, q.port)]));
    return `(${vec(st)}, ${vec(vl)})`;
  };
  // Every step of the trace except the last steps on; the last is the unsafe configuration.
  if (esc.trace.slice(0, -1).some((st) => !st.values)) return { ok: false, errors: ["the trace blocks before its end"] };
  const k = esc.time;
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
    "/-- The kernel's shortest trace: each machine's state and each port's value, at times 0 to the end. -/",
    `def trace : ${fin(esc.trace.length)} → (Machine → State) × (Port → Value) := ${vec(esc.trace.map(config))}`,
    "",
    "/-! ## Verdicts -/",
    "",
    ...theorem(`\`boundedDynamics\`: from an initial state, a run reaches the unsafe set within ${k} steps (\`reach_of_trace\`).`,
      "escalation", `∃ a ∈ system.starts initial, ∃ b ∈ system.target unsafeState unsafeValue, reachWithin system.Step ${k} a b`,
      "⟨traceOf trace 0, by decide +kernel, reach_of_trace (τ := traceOf trace) (by decide +kernel) le_rfl (by decide +kernel)⟩"),
  ];
  const certifies = [{ theorem: `${ns}.escalation`, verdict: `boundedDynamics: a run reaches the unsafe set at time ${k}` }];
  return { ok: true, namespace: ns, content: assemble("one escalation trace", ns, [lines]), certifies };
}

/**
 * Certificate of every strictly ordered pair of a `triz_weakness` ranking: the weaker concept admits
 * every situation the other admits and one more, so its count is strictly larger. Each concept's
 * rows are the data, in its own namespace. Fails closed when no pair is strictly ordered, and past
 * MAX_CERT_ROWS: deciding enumerates every valuation of each concept's ports.
 */
export function weaknessCertificate(concepts: Array<{ id: string; model: FunctionModel }>, acceptable: Array<{ box: string; port: string; values: string[] }>, opts: { namespace?: string; maxStates?: number } = {}): Certificate {
  const ns = namespaceOf(opts);
  if (typeof ns !== "string") return ns;
  const r = weaknessRanking(concepts, acceptable, { maxStates: opts.maxStates });
  if (!r.ok) return r;
  if (r.verdict !== "ranked") return { ok: false, errors: [`the ranking is ${r.verdict}: ${r.note}`] };
  const strict = r.pairs.filter((p) => p.order === "first-weaker" || p.order === "second-weaker");
  if (!strict.length) return { ok: false, errors: ["no pair is strictly ordered: only a strict inclusion (first-weaker or second-weaker) is certified"] };

  // Value indices: a situation input or a deliverable over the union of its values in every concept, sorted; any other port over its carrier's.
  const situations = r.situations, deliverables = r.deliverables;
  const unionOf = (match: (q: { box: string; port: string }) => boolean, carrier: string) =>
    [...new Set(concepts.flatMap((c) => c.model.carriers.find((x) => x.id === carrier)?.values ?? []))].sort()
      .filter((v) => concepts.some((c) => c.model.boxes.some((b) => (b.inputs ?? []).some((q) => match({ box: b.id, port: q.id }) && q.carrier === carrier)) && (c.model.carriers.find((x) => x.id === carrier)?.values ?? []).includes(v)));
  const same = (a: { box: string; port: string }) => (q: { box: string; port: string }) => q.box === a.box && q.port === a.port;
  const inputValues = situations.map((q) => unionOf(same(q), q.carrier));
  const deliverableValues = deliverables.map((d) => unionOf(same(d), d.carrier));

  const encoded = concepts.map((c) => {
    const composed = behaviorPlan(c.model, deliverables).composed;
    const ports = encodedPorts(composed, deliverables);
    const at = new Map(ports.map((p, i) => [portKeyOf(p.box, p.side, p.port), i]));
    const wires = encodedWires(c.model, at);
    const fed = new Set(wires.map((w) => w.tgt));
    const carrierValues = new Map(c.model.carriers.map((x) => [x.id, x.values ?? []]));
    const names = ports.map((q, p) => {
      const s = q.side === "in" && !fed.has(p) ? situations.findIndex(same(q)) : -1;
      const d = q.side === "in" ? deliverables.findIndex(same(q)) : -1;
      return s >= 0 ? inputValues[s] : d >= 0 ? deliverableValues[d] : carrierValues.get(q.carrier)!;
    });
    const rows = rowTables(composed, ports, at, (p, v) => names[p].indexOf(v));
    const reads = situations.map((q) => ports.findIndex((p, i) => p.side === "in" && !fed.has(i) && same(q)(p)));
    const delivers = deliverables.map((d) => at.get(portKeyOf(d.box, "in", d.port))!);
    return { id: c.id, composed, ports, wires, names, rows, reads, delivers };
  });
  const values = Math.max(1, ...encoded.flatMap((e) => e.names.map((n) => n.length)), ...inputValues.map((n) => n.length), ...deliverableValues.map((n) => n.length));
  for (const p of strict) {
    const pair = p.concepts.map((id) => encoded.find((e) => e.id === id)!);
    const work = pair.reduce((n, e) => n + rowWork(values ** (situations.length + deliverables.length + e.ports.length), e.rows.length, e.ports.length, e.wires.length), 0);
    if (work > MAX_CERT_ROWS) return { ok: false, errors: [`concepts '${p.concepts[0]}' and '${p.concepts[1]}': deciding their inclusion reads ${work} table entries, past the certificate limit of ${MAX_CERT_ROWS}`] };
  }

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
    `def inputDomain : Input → Value → Bool := ${nested(inputValues.map((n) => Array.from({ length: values }, (_, v) => v < n.length)), String)}`,
    "/-- The acceptable values of each deliverable. -/",
    `def acceptable : Deliverable → Value → Bool := ${nested(deliverables.map((d, i) => Array.from({ length: values }, (_, v) => v < deliverableValues[i].length && acceptable.find(same(d))!.values.includes(deliverableValues[i][v]))), String)}`,
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
  for (const p of strict) {
    const [a, b] = p.concepts.map((id) => concepts.findIndex((c) => c.id === id));
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
  return { ok: true, namespace: ns, content: assemble("strict inclusions of a weakness ranking", ns, [lines]), certifies };
}
