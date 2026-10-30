import { dimensionConflict } from "./act-dimensions.js";
/**
 * Abstraction between two models of one system: a detailed model (many boxes, costs, feasibility)
 * and a coarse one (few boxes, declared behaviour), linked by a typed map.
 *
 * The map sends detailed boxes to coarse boxes (several may share one), each mapped box's ports to
 * ports of its image box, and carriers to carriers. Unmapped boxes are left out (a restriction).
 * A function between two ports that both have an image is mapped. A function whose ends map into
 * one coarse box is hidden inside it, unless that box has an image function for it (a self-loop).
 * A function between boxes with different images whose port has no image is forgotten: the coarse
 * model does not see it.
 *
 * Four checks decide whether the coarse model is an abstraction of the detailed one:
 *  - total      — every mapped port's carrier has an image, and every mapped function between two
 *                 coarse boxes has an image function in the coarse model: same mapped endpoints,
 *                 mapped carrier, same class;
 *  - typed      — each mapped port lands on a port of the same side whose carrier is the image of
 *                 its own, with the same layer (typed_map);
 *  - wires      — every coarse function is the image of a mapped detailed function of its class;
 *  - harmLoops  — every coarse harm loop is the image of a detailed one: each harmful or excessive
 *                 coarse function on it has a harmful or excessive preimage whose object reaches
 *                 its performer along mapped and hidden functions, so the detailed loop maps onto
 *                 a coarse loop through it (cycle_map).
 * The polarity class is the partition harm loops read: negative (harmful, excessive) or not
 * (useful, insufficient).
 *
 * Reported besides: the functions forgotten, hidden, and left out (harms first), the detailed harm
 * loops the coarse model hides or loses, whether reachability among the mapped boxes passes to the
 * coarse model (reach_map, when nothing is forgotten), and, where a coarse box with behaviour has
 * exactly one preimage box with feasibility, whether that box's amounts read through the coarse
 * carriers' levels fall in the coarse behaviour (src/act-levels.ts). When either model declares
 * flows, each detailed flow passes along the map as through a merge: its runs inside the mapped
 * boxes, each box sent to its image, repeats in a row collapsed (reach_quotient). Each image is
 * matched against the coarse flows of the image carrier, step by step, and the coarse flow steps
 * that are no detailed step's image are listed. Flows are reported, not checked: they do not
 * change the verdict.
 */
import { z } from "zod";
import { actsOn, checkModel, harmLoops, shortestPath, type FunctionModel, type Polarity } from "./act.js";
import { rowsConsistency, READING, BAND } from "./act-levels.js";
import { mapFlows, restrictFlows, stepsOf } from "./act-flow.js";
import type { Theorem } from "./act-basis.js";
import { at, fail, issue, quoted, rebase, type Issue } from "./act-issues.js";

const Id = z.string().min(1);

export const AbstractionMap = z.strictObject({
  boxes: z.record(z.string(), Id).describe("Detailed box id → coarse box id; several detailed boxes may map to one coarse box. A detailed box left out is outside the abstraction"),
  ports: z.record(z.string(), z.record(z.string(), Id)).optional()
    .describe("Detailed box id → (detailed port id → port id on its coarse image box, same side). Default: the image box's port with the same id and side, if any; a port with no image is internal to its coarse box"),
  carriers: z.record(z.string(), Id).optional().describe("Detailed carrier id → coarse carrier id; default: the coarse carrier with the same id, if any"),
}).meta({ id: "AbstractionMap", description: "A typed map from a detailed function model onto a coarse one: boxes, ports per box, carriers" });
export type AbstractionMap = z.infer<typeof AbstractionMap>;

type Wire = FunctionModel["wires"][number];
type Box = FunctionModel["boxes"][number];
type Side = "in" | "out";

const NEGATIVE: ReadonlySet<Polarity> = new Set(["harmful", "excessive"]);
const polarityClass = (p: Polarity) => (NEGATIVE.has(p) ? "negative" as const : "non-negative" as const);
const label = (e: { box: string; port: string }) => `${e.box}.${e.port}`;
const ports = (b: Box) => [...(b.inputs ?? []).map((p) => ({ ...p, side: "in" as Side })), ...(b.outputs ?? []).map((p) => ({ ...p, side: "out" as Side }))];
const byId = <X extends { id: string }>(xs: X[]) => new Map(xs.map((x) => [x.id, x]));

/** Typing of the map itself: every id it names exists. Fails closed; paths are into `$.map`. */
function mapIssues(detailed: FunctionModel, coarse: FunctionModel, map: AbstractionMap): Issue[] {
  const dBoxes = byId(detailed.boxes), cBoxes = byId(coarse.boxes);
  const dCarriers = new Set(detailed.carriers.map((c) => c.id)), cCarriers = new Set(coarse.carriers.map((c) => c.id));
  const issues: Issue[] = [];
  const push = (code: Issue["code"], path: string, message: string, hint: string) => issues.push(issue(code, path, message, hint));
  if (!Object.keys(map.boxes).length) push("empty-set", "$.map.boxes", "map.boxes is empty: map at least one detailed box onto a coarse box", `Map detailed boxes (${quoted(dBoxes.keys())}) onto coarse boxes (${quoted(cBoxes.keys())}).`);
  for (const [d, c] of Object.entries(map.boxes)) {
    if (!dBoxes.has(d)) push("unknown-box", at("$.map.boxes", d), `map.boxes: '${d}' is not a box of the detailed model`, `map.boxes keys are detailed box ids: ${quoted(dBoxes.keys())}.`);
    if (!cBoxes.has(c)) push("unknown-box", at("$.map.boxes", d), `map.boxes: '${c}' is not a box of the coarse model`, `map.boxes values are coarse box ids: ${quoted(cBoxes.keys())}.`);
  }
  for (const [d, pm] of Object.entries(map.ports ?? {})) {
    if (!Object.hasOwn(map.boxes, d)) { push("unmapped-box", at("$.map.ports", d), `map.ports: box '${d}' is not mapped in map.boxes`, `Map '${d}' onto a coarse box in map.boxes first, or drop its entry from map.ports.`); continue; }
    const box = dBoxes.get(d), image = cBoxes.get(map.boxes[d]);
    if (!box || !image) continue;
    for (const [p, q] of Object.entries(pm)) {
      if (!ports(box).some((x) => x.id === p)) push("unknown-port", at("$.map.ports", d, p), `map.ports: box '${d}' has no port '${p}'`, `Key map.ports.${d} by ports of '${d}': ${quoted(ports(box).map((x) => x.id))}.`);
      if (!ports(image).some((x) => x.id === q)) push("unknown-port", at("$.map.ports", d, p), `map.ports: '${d}.${p}' maps to '${image.id}.${q}', but coarse box '${image.id}' has no port '${q}'`, `Map '${d}.${p}' to a port of '${image.id}': ${quoted(ports(image).map((x) => x.id))}.`);
    }
  }
  for (const [d, c] of Object.entries(map.carriers ?? {})) {
    if (!dCarriers.has(d)) push("unknown-carrier", at("$.map.carriers", d), `map.carriers: '${d}' is not a carrier of the detailed model`, `map.carriers keys are detailed carrier ids: ${quoted(dCarriers)}.`);
    if (!cCarriers.has(c)) push("unknown-carrier", at("$.map.carriers", d), `map.carriers: '${c}' is not a carrier of the coarse model`, `map.carriers values are coarse carrier ids: ${quoted(cCarriers)}.`);
  }
  return issues;
}

/** Decide whether `coarse` is an abstraction of `detailed` under `map`. */
export function checkAbstraction(detailed: FunctionModel, coarse: FunctionModel, map: AbstractionMap) {
  for (const [side, m] of [["detailed", detailed], ["coarse", coarse]] as const) {
    const check = checkModel(m, `$.${side}`);
    if (!check.ok) return rebase(fail(check.issues), [], `${side}: `);
  }
  const malformed = mapIssues(detailed, coarse, map);
  if (malformed.length) return fail(malformed);

  const dBoxes = byId(detailed.boxes), cBoxes = byId(coarse.boxes);
  const dCarriers = byId(detailed.carriers), cCarriers = byId(coarse.carriers);
  // Ids are user data: read only own keys, never inherited ones such as `__proto__` or `constructor`.
  const boxImage = (b: string) => (Object.hasOwn(map.boxes, b) ? map.boxes[b] : undefined);
  const explicitPort = (b: string, p: string) => {
    const pm = map.ports && Object.hasOwn(map.ports, b) ? map.ports[b] : undefined;
    return pm && Object.hasOwn(pm, p) ? pm[p] : undefined;
  };
  const defaulted: string[] = [];
  /** The image of a port: explicit, or the image box's port with the same id and side. */
  const portImage = (b: string, side: Side, p: string) => {
    const image = boxImage(b);
    if (image === undefined) return undefined;
    const explicit = explicitPort(b, p);
    if (explicit !== undefined) return ports(cBoxes.get(image)!).find((x) => x.id === explicit)!;
    return ports(cBoxes.get(image)!).find((x) => x.id === p && x.side === side);
  };
  const carrierImage = (c: string) => (map.carriers && Object.hasOwn(map.carriers, c) ? map.carriers[c] : cCarriers.has(c) ? c : undefined);

  // Every mapped port: its image, side, and carrier (typed), and whether its carrier maps (total).
  const total: string[] = [], typed: string[] = [];
  const mappedPorts: Array<{ box: string; port: string; side: Side; image: { box: string; port: string } }> = [];
  for (const b of detailed.boxes) {
    const image = boxImage(b.id);
    if (image === undefined) continue;
    for (const p of ports(b)) {
      const q = portImage(b.id, p.side, p.id);
      if (!q) continue;
      if (explicitPort(b.id, p.id) === undefined) defaulted.push(`${b.id}.${p.id}`);
      mappedPorts.push({ box: b.id, port: p.id, side: p.side, image: { box: image, port: q.id } });
      if (q.side !== p.side) typed.push(`port '${b.id}.${p.id}' is an ${p.side === "in" ? "input" : "output"}, but its image '${image}.${q.id}' is an ${q.side === "in" ? "input" : "output"}`);
      const c = carrierImage(p.carrier);
      if (c === undefined) { total.push(`port '${b.id}.${p.id}' maps to '${image}.${q.id}', but its carrier '${p.carrier}' has no image: add it to map.carriers`); continue; }
      if (q.carrier !== c) typed.push(`port '${b.id}.${p.id}' carries '${p.carrier}', whose image is '${c}', but its image port '${image}.${q.id}' carries '${q.carrier}'`);
      const [x, y] = [dCarriers.get(p.carrier)!, cCarriers.get(c)!];
      if (x.layer !== y.layer && !typed.some((e) => e.startsWith(`carrier '${x.id}'`))) typed.push(`carrier '${x.id}' (${x.layer}) maps to '${y.id}' (${y.layer}): the layers differ`);
    }
  }

  // Classify the detailed functions; each mapped one needs an image of its class.
  const outside: Wire[] = [], hidden: Wire[] = [], forgotten: Wire[] = [];
  const images = new Map<string, string[]>(), preimages = new Map<string, string[]>();
  const endOf = (w: Wire) => ({ from: portImage(w.from.box, "out", w.from.port), to: portImage(w.to.box, "in", w.to.port) });
  for (const w of detailed.wires) {
    const [a, b] = [boxImage(w.from.box), boxImage(w.to.box)];
    if (a === undefined || b === undefined) { outside.push(w); continue; }
    const { from, to } = endOf(w);
    if (!from || !to) { (a === b ? hidden : forgotten).push(w); continue; }
    const c = carrierImage(w.carrier);
    if (c === undefined) { total.push(`function '${w.id}' carries '${w.carrier}', which has no image: add it to map.carriers`); continue; }
    const same = coarse.wires.filter((v) => v.from.box === a && v.from.port === from.id && v.to.box === b && v.to.port === to.id);
    const hits = same.filter((v) => v.carrier === c && polarityClass(v.polarity) === polarityClass(w.polarity));
    // Within one coarse box, a function with no image there stays inside it.
    if (!hits.length && a === b) { hidden.push(w); continue; }
    images.set(w.id, hits.map((v) => v.id));
    for (const v of hits) preimages.set(v.id, [...(preimages.get(v.id) ?? []), w.id]);
    if (!hits.length) {
      total.push(`function '${w.id}' (${label(w.from)} → ${label(w.to)}, ${w.polarity}) maps to ${a}.${from.id} → ${b}.${to.id}, where the coarse model has `
        + (same.length ? `only ${same.map((v) => `'${v.id}' (${v.carrier}, ${v.polarity})`).join(", ")}: no function of carrier '${c}' in the ${polarityClass(w.polarity)} class` : "no function"));
    }
  }

  // Every coarse function is the image of a mapped detailed function of its class.
  const wires: string[] = [];
  for (const v of coarse.wires) {
    if (preimages.has(v.id)) continue;
    const near = detailed.wires.filter((w) => {
      if (boxImage(w.from.box) !== v.from.box || boxImage(w.to.box) !== v.to.box) return false;
      const { from, to } = endOf(w);
      return from?.id === v.from.port && to?.id === v.to.port && carrierImage(w.carrier) === v.carrier;
    });
    wires.push(`coarse function '${v.id}' (${label(v.from)} → ${label(v.to)}, ${v.polarity}) is the image of no mapped detailed function`
      + (near.length ? ` of its class: its preimages ${near.map((w) => `'${w.id}' (${w.polarity})`).join(", ")} are ${polarityClass(near[0].polarity)}` : ""));
  }

  // The detailed graph whose loops map onto coarse loops: mapped functions with an image, and hidden ones.
  const visible = detailed.wires.filter((w) => (images.get(w.id)?.length ?? 0) > 0 || hidden.includes(w));
  // Neighbours in declaration order, as harmLoops reads them, so tied detailed cycles break the same way.
  const adj = actsOn(detailed, visible);
  const mappedBoxes = new Set(detailed.boxes.filter((b) => boxImage(b.id) !== undefined).map((b) => b.id));
  const detailedLoops = harmLoops(detailed);
  const onDetailedLoop = new Set(detailedLoops.flatMap((l) => l.negative));
  const loopErrors: string[] = [];
  const coarseLoops = harmLoops(coarse).map((loop) => ({
    boxes: loop.boxes,
    negative: loop.negative,
    images: loop.negative.map((id) => {
      const candidates = (preimages.get(id) ?? []).map((w) => detailed.wires.find((x) => x.id === w)!).filter((w) => NEGATIVE.has(w.polarity));
      for (const w of candidates) {
        const back = shortestPath(w.to.box, w.from.box, adj, mappedBoxes);
        if (back.length) return { coarse: id, detailed: w.id, cycle: [w.from.box, ...back], basis: ["cycle_map"] as Theorem[] };
      }
      const reason = !candidates.length ? "it has no harmful or excessive preimage"
        : candidates.some((w) => onDetailedLoop.has(w.id)) ? `its preimage ${candidates.filter((w) => onDetailedLoop.has(w.id)).map((w) => `'${w.id}'`).join(", ")} lies on a detailed harm loop only through functions the abstraction forgets or leaves out`
        : `its preimage ${candidates.map((w) => `'${w.id}'`).join(", ")} lies on no loop of the detailed model`;
      loopErrors.push(`coarse harm loop [${loop.boxes.join(", ")}] through '${id}' is not the image of a detailed harm loop: ${reason}`);
      return { coarse: id, detailed: null, reason };
    }),
  }));

  // Detailed harm loops seen from the coarse model.
  const seen = detailedLoops.flatMap((l) => l.negative.map((id) => {
    const w = detailed.wires.find((x) => x.id === id)!;
    if (outside.includes(w)) return { wire: id, status: "outside" as const };
    if (hidden.includes(w)) return { wire: id, status: "hidden" as const, inside: boxImage(w.from.box)! };
    if (forgotten.includes(w)) return { wire: id, status: "forgotten" as const };
    const img = images.get(id) ?? [];
    if (!img.length) return { wire: id, status: "no-image" as const };
    const back = shortestPath(w.to.box, w.from.box, adj, mappedBoxes);
    return back.length ? { wire: id, status: "image" as const, coarse: img, basis: ["cycle_map"] as Theorem[] } : { wire: id, status: "broken" as const, coarse: img };
  }));

  // Numeric to qualitative across the map: a coarse box with behaviour and one preimage box with feasibility.
  type Checked = ReturnType<typeof rowsConsistency>;
  const levels = coarse.boxes.filter((c) => c.behavior).flatMap((c): Array<Checked | { box: string; skipped: string }> => {
    const pre = detailed.boxes.filter((b) => boxImage(b.id) === c.id && b.feasibility);
    if (!pre.length) return [];
    if (pre.length > 1) return [{ box: c.id, skipped: `several detailed boxes with feasibility map onto it (${pre.map((b) => `'${b.id}'`).join(", ")}): their rows compose, which this check does not do` }];
    const b = pre[0];
    const r = rowsConsistency({
      box: b.id, feasibility: b.feasibility!, behaviorBox: c.id, behavior: c.behavior!,
      read: (side, port) => {
        const q = portImage(b.id, side, port);
        const l = q && q.side === side ? cCarriers.get(q.carrier)?.levels : undefined;
        return q && l ? { port: q.id, levels: l } : undefined;
      },
    });
    return r.checked ? [r] : [];
  });
  const levelFindings = levels.flatMap((l) => ("inconsistencies" in l ? l.inconsistencies : []));

  const dimensionWarnings = mappedPorts.flatMap(p => {
    const b = dBoxes.get(p.box)!;
    const port = ports(b).find(q => q.id === p.port && q.side === p.side)!;
    const image = cBoxes.get(p.image.box)!;
    const target = cCarriers.get(ports(image).find(q => q.id === p.image.port)!.carrier)!;
    return dimensionConflict(dCarriers.get(port.carrier)?.si, target?.si) ? [{ code: "dimension-mismatch" as const, path: "$.map.carriers", severity: "warning" as const, message: "Mapped carriers have conflicting SI dimensions; level readings are not comparable", hint: "Map amounts and levels with the same SI dimension." }] : [];
  });
  const checks = {
    total: { ok: !total.length, errors: total },
    typed: { ok: !typed.length, errors: typed, ...(typed.length ? {} : { basis: ["typed_restrict", "typed_map"] as Theorem[] }) },
    wires: { ok: !wires.length, errors: wires },
    harmLoops: { ok: !loopErrors.length, errors: loopErrors, loops: coarseLoops },
  };
  const failed = Object.entries(checks).filter(([, c]) => !c.ok).map(([k]) => k);
  const harms = (ws: Wire[]) => ws.filter((w) => NEGATIVE.has(w.polarity)).map((w) => w.id);
  // Flows along the map: the runs inside the mapped boxes, sent through the box map like a merge.
  const step = (c: string, a: string, b: string) => JSON.stringify([c, a, b]);
  const coarseSteps = new Set((coarse.flows ?? []).flatMap((f) => stepsOf(f.path).map(([a, b]) => step(f.carrier, a, b))));
  const imaged = new Set<string>();
  const flowImages = (detailed.flows ?? []).map((f) => {
    const runs = restrictFlows([f], mappedBoxes).flows;
    const sent = mapFlows(runs, (id) => boxImage(id) ?? null);
    const carrier = carrierImage(f.carrier) ?? null;
    const images = sent.flows.map((g) => {
      const missing = stepsOf(g.path).filter(([a, b]) => carrier === null || !coarseSteps.has(step(carrier, a, b)));
      if (carrier !== null) for (const [a, b] of stepsOf(g.path)) imaged.add(step(carrier, a, b));
      return { path: g.path, ...(g.medium !== undefined ? { medium: g.medium } : {}), matched: !missing.length, ...(missing.length ? { missingSteps: missing.map(([a, b]) => [a, b]) } : {}) };
    });
    return { flow: f.id, carrier, images, ...(sent.gone.length ? { hiddenRuns: sent.gone.length } : {}), ...(runs.length ? {} : { outside: true }) };
  });
  const unbacked = (coarse.flows ?? []).flatMap((f) => {
    const steps = stepsOf(f.path).filter(([a, b]) => !imaged.has(step(f.carrier, a, b))).map(([a, b]) => [a, b]);
    return steps.length ? [{ flow: f.id, steps }] : [];
  });
  const flowReport = (detailed.flows ?? []).length || (coarse.flows ?? []).length ? {
    images: flowImages,
    unbacked,
    basis: ["reach_quotient"] as Theorem[],
    note: "Each detailed flow's runs inside the mapped boxes pass to the coarse model as through a merge, so a box that reaches another along a run still does along its image. matched: every step of the image is a step of a coarse flow of the image carrier. unbacked: coarse flow steps that are no detailed step's image. Flows do not change the verdict.",
  } : undefined;
  const reaches = !forgotten.length && checks.total.ok;
  return {
    ok: true as const,
    warnings: dimensionWarnings,
    verdict: failed.length ? "not-an-abstraction" as const : "abstraction" as const,
    failed,
    checks,
    map: {
      boxes: map.boxes,
      ports: mappedPorts.map((p) => ({ box: p.box, port: p.port, side: p.side, image: label(p.image) })),
      defaultedPorts: defaulted,
      carriers: Object.fromEntries([...new Set(detailed.carriers.map((c) => c.id))].flatMap((c) => (carrierImage(c) === undefined ? [] : [[c, carrierImage(c)!]]))),
    },
    functions: {
      mapped: [...images.keys()].filter((id) => images.get(id)!.length).map((id) => ({ wire: id, image: images.get(id)! })),
      hidden: hidden.map((w) => ({ wire: w.id, inside: boxImage(w.from.box)! })),
      forgotten: forgotten.map((w) => w.id),
      outside: outside.map((w) => w.id),
      hiddenHarms: harms(hidden), forgottenHarms: harms(forgotten), outsideHarms: harms(outside),
    },
    unmappedBoxes: detailed.boxes.filter((b) => boxImage(b.id) === undefined).map((b) => b.id),
    coarseWithoutPreimage: coarse.boxes.filter((c) => !detailed.boxes.some((b) => boxImage(b.id) === c.id)).map((c) => c.id),
    detailedLoops: seen,
    reachability: reaches
      ? { preserved: true as const, basis: ["reach_map"] as Theorem[], note: "Every function between mapped boxes stays inside one coarse box or maps to a coarse function, so whatever one mapped box reaches in the detailed model, its image reaches in the coarse one." }
      : { preserved: false as const, note: forgotten.length ? `The coarse model forgets ${forgotten.length} function(s) between mapped boxes (functions.forgotten): paths through them have no image.` : "Some mapped function has no image (checks.total), so its paths have none." },
    ...(flowReport ? { flows: flowReport } : {}),
    ...(levels.length ? { levels: { consistent: !levelFindings.length, boxes: levels.map((l) => ("inconsistencies" in l ? (({ inconsistencies: _i, ...rest }) => rest)(l) : l)), inconsistencies: levelFindings, basis: [...READING, ...BAND] } } : {}),
    note: (failed.length ? `Not an abstraction: the ${failed.join(", ")} check(s) fail; see checks.` : "The coarse model is an abstraction of the mapped part of the detailed model: every coarse function and harm loop is the image of a detailed one.")
      + (harms(forgotten).length || harms(hidden).length ? ` The coarse model does not show ${[...harms(forgotten), ...harms(hidden)].map((id) => `'${id}'`).join(", ")}, harmful or excessive in the detailed model (functions.forgottenHarms, hiddenHarms): verdicts on the coarse model say nothing about them.` : "")
      + " The map is checked as data; whether the coarse boxes' declared rows are true of their preimages is substantiated outside the kernel.",
  };
}
