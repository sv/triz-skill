/** Domain-independent catalogue definitions and explicit type instantiation. */
import { z } from "zod";
import {
  Box,
  Carrier,
  carrierDeclarationKey,
  checkModel,
  type FunctionModel,
} from "./act.js";
import { allocated } from "./act-effect-insert.js";
import { fail, issue } from "./act-issues.js";

const Id = z.string().min(1);
export const CatalogueSource = z.strictObject({ citation: Id, license: Id });
const metadata = {
  tags: z.array(Id).max(100).optional(),
  domains: z.array(Id).max(100).optional(),
  source: CatalogueSource.optional(),
};
export const ConcreteComponentEntry = z.strictObject({
  id: Id,
  component: Box,
  max_instances: z.number().int().min(1).max(8).default(1),
  ...metadata,
});
const PortableEntry = z.union([
  ConcreteComponentEntry.extend({
    component: Box.omit({ inner: true }),
    source: CatalogueSource,
  }),
  z.strictObject({
    id: Id,
    primitive: z.enum(["identity", "fanout"]),
    carrier: Id,
    max_instances: z.number().int().min(1).max(8).default(1),
    ...metadata,
    source: CatalogueSource,
  }),
]);
export const ComponentCatalogue = z
  .strictObject({
    format: z.literal("triz-component-catalogue-v1"),
    id: Id,
    parameters: z.array(Id).max(100).default([]),
    carriers: z.array(Carrier).max(100).default([]),
    entries: z.array(PortableEntry).max(100),
  })
  .meta({
    id: "ComponentCatalogue",
    description:
      "Reusable domain-independent typed components; tags/domains organize entries without constraining compatibility",
  });
export const CatalogueSelection = z.strictObject({
  catalogue: z.union([z.literal("general"), ComponentCatalogue]),
  bindings: z.record(Id, Id).default({}),
});
export type CatalogueEntry = z.infer<typeof ConcreteComponentEntry>;
export const GENERAL_CATALOGUE: z.input<typeof ComponentCatalogue> = {
  format: "triz-component-catalogue-v1",
  id: "general",
  parameters: ["T"],
  carriers: [],
  entries: [
    {
      id: "identity",
      primitive: "identity",
      carrier: "T",
      tags: ["abstract", "relation"],
      source: {
        citation: "src/act-component-catalogue.ts: identity relation out = in",
        license: "MIT",
      },
    },
    {
      id: "fanout",
      primitive: "fanout",
      carrier: "T",
      tags: ["abstract", "relation"],
      source: {
        citation:
          "src/act-component-catalogue.ts: diagonal relation left = right = in",
        license: "MIT",
      },
    },
  ],
};
export const catalogueJsonSchema = () => ({
  ...z.toJSONSchema(ComponentCatalogue),
  title: "Reusable component catalogue",
});

type Model = FunctionModel;
/** Carrier aliases preserve structure, ignoring only local ids and display labels. */
function compatible(
  a: Model["carriers"][number],
  b: Model["carriers"][number],
) {
  return (
    carrierDeclarationKey({ ...a, id: b.id, dimension: b.dimension }) ===
    carrierDeclarationKey(b)
  );
}
export function instantiateCatalogues(
  model: Model,
  legacy: CatalogueEntry[],
  selections: z.infer<typeof CatalogueSelection>[],
  spend: (n: number) => boolean,
) {
  const carriersAdded: Model["carriers"] = [],
    entries = [...legacy],
    bindings: Array<{ catalogue: string; types: Record<string, string> }> = [];
  const origins: Record<
    string,
    {
      catalogue: string;
      entry: string;
      source: z.infer<typeof CatalogueSource>;
      tags?: string[];
      domains?: string[];
      abstract: boolean;
    }
  > = Object.create(null);
  const entryPaths: Record<string, string> = Object.create(null),
    carrierPaths: Record<string, string> = Object.create(null);
  const nextCarrier = allocated(
      "catalogue-carrier-",
      model.carriers.map((c) => c.id),
    ),
    nextEntry = allocated(
      "catalogue-entry-",
      legacy.map((e) => e.id),
    );
  const reject = (path: string, message: string, hint: string) =>
    fail([issue("invalid-argument", path, message, hint)]);
  const cap = () => ({
    ok: true as const,
    verdict: "undecided" as const,
    reason: "work-cap" as const,
    complete: false as const,
  });
  for (const [index, selection] of selections.entries()) {
    const root = `$.catalogues[${index}]`,
      bundle = ComponentCatalogue.parse(
        selection.catalogue === "general"
          ? GENERAL_CATALOGUE
          : selection.catalogue,
      );
    if (
      !spend(
        1 +
          bundle.parameters.length +
          bundle.carriers.length +
          bundle.entries.length,
      )
    )
      return cap();
    const carrierCheck = checkModel(
      { domain: model.domain, carriers: bundle.carriers, boxes: [], wires: [] },
      `${root}.catalogue`,
    );
    if (!carrierCheck.ok) return fail(carrierCheck.issues);
    const names = [...bundle.parameters, ...bundle.carriers.map((c) => c.id)];
    if (
      new Set(names).size !== names.length ||
      new Set(bundle.entries.map((e) => e.id)).size !== bundle.entries.length
    )
      return reject(
        `${root}.catalogue`,
        "Catalogue type and entry ids must be distinct",
        "Use one local name per parameter/carrier and one id per entry.",
      );
    for (const name of Object.keys(selection.bindings))
      if (!names.includes(name))
        return reject(
          `${root}.bindings`,
          "A binding names an undeclared catalogue type",
          "Bind only this catalogue's declared parameter and carrier ids.",
        );
    const resolved: Record<string, string> = Object.create(null);
    // Parameters require an explicit binding. They never acquire a type from a name or tag.
    for (const name of bundle.parameters) {
      const target = model.carriers.find(
        (c) => c.id === selection.bindings[name],
      );
      if (!target)
        return reject(
          `${root}.bindings`,
          `Unbound type parameter '${name}'`,
          "Bind every parameter to an existing model carrier id.",
        );
      resolved[name] = target.id;
    }
    for (const [i, c] of bundle.carriers.entries()) {
      if (
        !spend(
          1 +
            model.carriers.length +
            carriersAdded.length +
            (c.values?.length ?? 0) +
            (c.levels?.length ?? 0),
        )
      )
        return cap();
      const explicit = selection.bindings[c.id];
      if (explicit !== undefined) {
        const target = model.carriers.find((t) => t.id === explicit);
        if (!target || !compatible(c, target))
          return reject(
            `${root}.bindings`,
            "A carrier binding changes its declared type",
            "Keep quantity, SI, layer, finite values, levels and resource-combination declarations compatible; no conversion is inferred.",
          );
        resolved[c.id] = target.id;
        continue;
      }
      const matching = [...model.carriers, ...carriersAdded].filter(
        (t) => c.effect_quantity !== undefined && compatible(c, t),
      );
      if (matching.length > 1)
        return reject(
          `${root}.bindings`,
          "A catalogue carrier has multiple compatible model declarations",
          "Choose its model carrier explicitly in bindings.",
        );
      if (matching.length === 1) resolved[c.id] = matching[0].id;
      else {
        const fresh = { ...c, id: nextCarrier() };
        carriersAdded.push(fresh);
        carrierPaths[fresh.id] = `${root}.catalogue.carriers[${i}]`;
        resolved[c.id] = fresh.id;
      }
    }
    for (const [i, entry] of bundle.entries.entries()) {
      if (entries.length >= 100)
        return reject(
          "$.catalogues",
          "Combined catalogue exceeds 100 entries",
          "Select a smaller finite library.",
        );
      if (!spend(1)) return cap();
      let component: Model["boxes"][number];
      if ("primitive" in entry) {
        const type = resolved[entry.carrier],
          carrier = [...model.carriers, ...carriersAdded].find(
            (c) => c.id === type,
          );
        if (!carrier)
          return reject(
            `${root}.catalogue.entries[${i}].carrier`,
            "Primitive names an undeclared type",
            "Use a declared catalogue parameter or carrier.",
          );
        const outputs =
          entry.primitive === "identity" ? ["out"] : ["left", "right"];
        const rowWork = (carrier.values?.length ?? 0) * (1 + outputs.length);
        if (!spend(rowWork)) return cap();
        // These are mathematical relations only. No resource mode, construction
        // cost, physical conservation or realizability is silently asserted.
        component = {
          id: entry.id,
          name: entry.primitive,
          role: "tool",
          inputs: [{ id: "in", carrier: type }],
          outputs: outputs.map((id) => ({ id, carrier: type })),
          ...(carrier.values
            ? {
                behavior: carrier.values.map((v) => ({
                  in: { in: v },
                  out: Object.fromEntries(outputs.map((id) => [id, v])),
                })),
              }
            : {}),
        };
      } else {
        const ports = [
          ...(entry.component.inputs ?? []),
          ...(entry.component.outputs ?? []),
        ];
        if (!spend(ports.length + (entry.component.behavior?.length ?? 0)))
          return cap();
        if (ports.some((p) => resolved[p.carrier] === undefined))
          return reject(
            `${root}.catalogue.entries[${i}].component`,
            "Component port names an undeclared catalogue type",
            "Declare each local carrier or type parameter and supply required bindings.",
          );
        component = {
          ...entry.component,
          inputs: entry.component.inputs?.map((p) => ({
            ...p,
            carrier: resolved[p.carrier],
          })),
          outputs: entry.component.outputs?.map((p) => ({
            ...p,
            carrier: resolved[p.carrier],
          })),
        };
      }
      const id = nextEntry();
      entryPaths[id] =
        selection.catalogue === "general"
          ? root
          : `${root}.catalogue.entries[${i}].${"primitive" in entry ? "primitive" : "component"}`;
      entries.push({
        id,
        component,
        max_instances: entry.max_instances,
        ...(entry.tags ? { tags: entry.tags } : {}),
        ...(entry.domains ? { domains: entry.domains } : {}),
        source: entry.source,
      });
      origins[id] = {
        catalogue: bundle.id,
        entry: entry.id,
        source: entry.source,
        ...(entry.tags ? { tags: entry.tags } : {}),
        ...(entry.domains ? { domains: entry.domains } : {}),
        abstract: "primitive" in entry,
      };
    }
    bindings.push({ catalogue: bundle.id, types: { ...resolved } });
  }
  return {
    ok: true as const,
    model: { ...model, carriers: [...model.carriers, ...carriersAdded] },
    entries,
    carriersAdded,
    bindings,
    origins,
    entryPaths,
    carrierPaths,
  };
}
