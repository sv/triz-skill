import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { type FunctionModel, checkModel } from "../src/act.js";
import {
  ComponentCatalogue,
  GENERAL_CATALOGUE,
  catalogueJsonSchema,
} from "../src/act-component-catalogue.js";
import { searchComponents } from "../src/act-component-search.js";
import { rewrite } from "../src/act-rewrite.js";
import { toolSpecs } from "../src/tools.js";
import {
  componentRequest,
  converter,
  contract,
  metadata,
  interfaceModel,
} from "./support/component-search.js";

const portable = () => ({
  format: "triz-component-catalogue-v1" as const,
  id: "shared",
  parameters: [] as string[],
  carriers: interfaceModel()
    .carriers.filter((c) => ["a", "b", "d"].includes(c.id))
    .map((c) => ({ ...c, id: `local-${c.id}` })),
  entries: [
    {
      id: "ab",
      component: converter("ab", "local-a", "local-b"),
      source: { citation: "synthetic finite relation", license: "MIT" },
    },
    {
      id: "bd",
      component: converter("bd", "local-b", "local-d"),
      source: { citation: "synthetic finite relation", license: "MIT" },
    },
  ],
});
const request = () => ({
  ...componentRequest(),
  catalogue: [],
  catalogues: [{ catalogue: portable() }],
});

test("portable catalogue types bind by explicit quantities and structure across different local ids", () => {
  const r = searchComponents(request());
  assert.ok(r.ok && "catalogueBindings" in r, JSON.stringify(r));
  assert.equal(r.verdict, "candidates");
  assert.equal(r.satisfyingCount, 1);
  assert.deepEqual(r.catalogueBindings[0].types, {
    "local-a": "a",
    "local-b": "b",
    "local-d": "d",
  });
  assert.deepEqual(r.carriersAdded, []);
  assert.equal(
    r.candidates[0].components[0].catalogueOrigin?.source.license,
    "MIT",
  );
});

test("domain names and tags do not gate cross-domain reuse or change verdicts", () => {
  const a = request(),
    b = structuredClone(a);
  b.model.domain = "physical";
  b.catalogues[0].catalogue.entries = b.catalogues[0].catalogue.entries.map(
    (e) => ({ ...e, tags: ["arbitrary-label"], domains: ["different-domain"] }),
  );
  const r = searchComponents(a),
    t = searchComponents(b);
  assert.ok(r.ok && "candidates" in r && t.ok && "candidates" in t);
  assert.equal(r.verdict, t.verdict);
  assert.equal(r.satisfyingCount, t.satisfyingCount);
  assert.equal(r.work, t.work);
  assert.deepEqual(r.candidates[0].model.wires, t.candidates[0].model.wires);
});

test("catalogue-internal carrier types are imported with collision-safe ids and preserve rewrite replay", () => {
  const a = request();
  a.model.carriers = a.model.carriers.filter((c) => c.id !== "b");
  a.model.carriers.push({ ...a.model.carriers[1], id: "catalogue-carrier-0" });
  const r = searchComponents(a);
  assert.ok(r.ok && "catalogueBindings" in r, JSON.stringify(r));
  assert.equal(r.satisfyingCount, 1);
  assert.equal(r.carriersAdded.length, 1);
  assert.equal(r.carriersAdded[0].id, "catalogue-carrier-1");
  const replay = rewrite(
    { ...a.model, carriers: [...a.model.carriers, ...r.carriersAdded] },
    r.candidates[0].rewrite,
  );
  assert.ok(replay.ok);
  assert.deepEqual(replay.model, r.candidates[0].model);
  assert.ok(checkModel(replay.model).ok);
});

test("ambiguous and incompatible type bindings fail closed instead of matching by SI alone", () => {
  const a = request();
  a.model.carriers.push({ ...a.model.carriers[0], id: "second-a" });
  assert.equal(searchComponents(a).ok, false);
  const explicit = searchComponents({
    ...a,
    catalogues: [{ catalogue: portable(), bindings: { "local-a": "a" } }],
  });
  assert.ok(
    explicit.ok && "candidates" in explicit && explicit.satisfyingCount === 1,
  );
  assert.equal(
    searchComponents({
      ...request(),
      catalogues: [{ catalogue: portable(), bindings: { "local-a": "d" } }],
    }).ok,
    false,
  );
  assert.equal(
    searchComponents({
      ...request(),
      catalogues: [{ catalogue: portable(), bindings: { undeclared: "a" } }],
    }).ok,
    false,
  );
});

test("the shared general catalogue instantiates mathematical relations for any declared type", () => {
  for (const domain of ["physical", "software"] as const) {
    const a = componentRequest();
    a.model.domain = domain;
    a.model.boxes[1].inputs![0].carrier = "a";
    const r = searchComponents({
      ...a,
      catalogue: [],
      catalogues: [{ catalogue: "general", bindings: { T: "a" } }],
      max_components: 1,
      max_work: 1000000,
    });
    assert.ok(
      r.ok && "catalogueBindings" in r && r.complete,
      JSON.stringify(r),
    );
    const identities = r.candidates.filter(
      (c) => c.components[0]?.catalogueOrigin?.entry === "identity",
    );
    assert.ok(identities.length);
    const component = identities[0].model.boxes.find(
      (b) => b.id === identities[0].components[0].box,
    )!;
    assert.deepEqual(component.behavior, [
      { in: { in: "0" }, out: { out: "0" } },
      { in: { in: "1" }, out: { out: "1" } },
    ]);
    assert.equal(component.feasibility, undefined);
    assert.equal(component.cost, undefined);
    assert.equal(identities[0].components[0].catalogueOrigin?.abstract, true);
  }
});

test("general fan-out preserves the joint equality relation and stays an unimplemented abstract component", () => {
  const a = componentRequest();
  a.model.boxes[1].inputs = [
    { id: "in", carrier: "a" },
    { id: "second", carrier: "a" },
  ];
  a.model.boxes[1].behavior = undefined;
  a.model.boxes[1].feasibility = undefined;
  const r = searchComponents({
    ...a,
    catalogue: [],
    catalogues: [{ catalogue: "general", bindings: { T: "a" } }],
    targets: [
      { box: "product", port: "in" },
      { box: "product", port: "second" },
    ],
    max_components: 1,
    max_work: 1000000,
    limit: 100,
  });
  assert.ok(r.ok && "candidates" in r && r.complete, JSON.stringify(r));
  const fan = r.candidates.find(
    (c) => c.components[0]?.catalogueOrigin?.entry === "fanout",
  );
  assert.ok(fan);
  const box = fan.model.boxes.find((b) => b.id === fan.components[0].box)!;
  assert.deepEqual(box.behavior, [
    { in: { in: "0" }, out: { left: "0", right: "0" } },
    { in: { in: "1" }, out: { left: "1", right: "1" } },
  ]);
  assert.equal(box.feasibility, undefined);
});

test("parameters require explicit bindings; generic rows are not invented when finite values are absent", () => {
  const a = componentRequest();
  a.model.boxes[1].inputs![0].carrier = "a";
  assert.equal(
    searchComponents({
      ...a,
      catalogue: [],
      catalogues: [{ catalogue: "general" }],
    }).ok,
    false,
  );
  delete a.model.carriers[0].values;
  delete a.model.boxes[0].behavior;
  delete a.model.boxes[1].behavior;
  const r = searchComponents({
    ...a,
    catalogue: [],
    catalogues: [{ catalogue: "general", bindings: { T: "a" } }],
    max_components: 1,
    max_work: 1000000,
  });
  assert.ok(r.ok && "candidates" in r);
  const identity = r.candidates.find(
    (c) => c.components[0]?.catalogueOrigin?.entry === "identity",
  );
  assert.ok(identity);
  assert.equal(identity.model.boxes.at(-1)!.behavior, undefined);
});

test("concrete reusable catalogue components retain finite property checking", () => {
  const r = searchComponents({
    ...request(),
    contract: contract(),
    implementation: metadata,
    max_work: 1000000,
  });
  assert.ok(r.ok && "candidates" in r, JSON.stringify(r));
  assert.equal(r.verdict, "synthesized");
  assert.equal(r.satisfyingCount, 1);
});

test("polymorphic abstract relations do not acquire physical resource modes", () => {
  const r = searchComponents({
    ...componentRequest(),
    catalogue: [],
    catalogues: [{ catalogue: "general", bindings: { T: "d" } }],
    max_components: 1,
    contract: contract(),
    implementation: metadata,
    max_work: 1000000,
  });
  assert.ok(r.ok && "candidates" in r, JSON.stringify(r));
  assert.equal(r.verdict, "undecided");
  assert.ok(r.results.length);
  assert.ok(
    r.results.every(
      (x) => x.result.ok && x.result.reason === "missing-resource-mode",
    ),
  );
});

test("renaming a catalogue's type parameters and metadata preserves instantiation verdicts", () => {
  const a = componentRequest();
  a.model.boxes[1].inputs![0].carrier = "a";
  const renamed = structuredClone(GENERAL_CATALOGUE);
  renamed.id = "neutral";
  renamed.parameters = ["U"];
  renamed.entries = renamed.entries.map((e) =>
    "primitive" in e
      ? {
          ...e,
          carrier: "U",
          tags: ["neutral-tag"],
          domains: ["neutral-domain"],
        }
      : e,
  );
  const r = searchComponents({
      ...a,
      catalogue: [],
      catalogues: [{ catalogue: "general", bindings: { T: "a" } }],
      max_components: 1,
      max_work: 1000000,
    }),
    t = searchComponents({
      ...a,
      catalogue: [],
      catalogues: [{ catalogue: renamed, bindings: { U: "a" } }],
      max_components: 1,
      max_work: 1000000,
    });
  assert.ok(r.ok && "candidates" in r && t.ok && "candidates" in t);
  assert.equal(r.verdict, t.verdict);
  assert.equal(r.satisfyingCount, t.satisfyingCount);
  assert.equal(r.work, t.work);
  assert.deepEqual(
    r.candidates.map((c) => c.model.wires),
    t.candidates.map((c) => c.model.wires),
  );
});

test("instantiation shares the search work cap and validates portable schemas and namespace collisions", () => {
  const capped = searchComponents({ ...request(), max_work: 1 });
  assert.ok(capped.ok && "candidates" in capped);
  assert.equal(capped.verdict, "undecided");
  assert.equal(capped.complete, false);
  assert.deepEqual(capped.candidates, []);
  const duplicate = portable();
  duplicate.parameters = ["local-a"];
  assert.equal(
    searchComponents({
      ...request(),
      catalogues: [{ catalogue: duplicate, bindings: { "local-a": "a" } }],
    }).ok,
    false,
  );
  const unknown = portable();
  unknown.entries[0].component.inputs![0].carrier = "missing";
  assert.equal(
    searchComponents({ ...request(), catalogues: [{ catalogue: unknown }] }).ok,
    false,
  );
  const r = searchComponents({
    ...request(),
    catalogue: [
      { id: "catalogue-entry-0", component: converter("extra", "a", "d") },
    ],
    max_components: 2,
    max_work: 1000000,
  });
  assert.ok(r.ok && "candidates" in r);
  assert.equal(r.satisfyingCount, 2);
  assert.equal(
    ComponentCatalogue.safeParse({ ...GENERAL_CATALOGUE, unknown: true })
      .success,
    false,
  );
});

test("malformed instantiated behavior points into the original portable component declaration", () => {
  const bundle = portable();
  bundle.entries[0].component.behavior![0].out.out = "not-declared";
  const r = searchComponents({
    ...request(),
    catalogues: [{ catalogue: bundle }],
  });
  assert.equal(r.ok, false);
  if (!r.ok)
    assert.ok(
      r.issues.some((i) =>
        i.path.startsWith(
          "$.catalogues[0].catalogue.entries[0].component.behavior",
        ),
      ),
      JSON.stringify(r),
    );
});

test("shared catalogue and portable JSON schema are exposed by the MCP and schema generator", async () => {
  const spec = toolSpecs().find((s) => s.name === "triz_component_catalogue")!;
  const r = JSON.parse((await spec.handler({})).content[0].text);
  assert.ok(ComponentCatalogue.safeParse(r.catalogue).success);
  assert.equal(r.catalogue.id, "general");
  assert.deepEqual(
    JSON.parse(
      fs.readFileSync(
        new URL(
          "../skills/triz-innovation/schemas/component-catalogue.schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    catalogueJsonSchema(),
  );
});
