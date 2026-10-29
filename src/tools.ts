/**
 * Tool definitions shared by every transport: stdio (MCP SDK v1, npm package)
 * and the hosted Workers entry (MCP SDK v2 via agents/mcp/server).
 *
 * Transport-neutral: toolSpecs() returns plain specs; bindV1()/bindV2() attach
 * them to the respective SDK server classes. The graph tools (project
 * extension, fs-backed) are only specced when a graph module is provided.
 */
import { z } from "zod";
import * as triz from "./core.js";
import * as act from "./act.js";
import type { McpServer as McpServerV1 } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer as McpServerV2 } from "@modelcontextprotocol/server";

type GraphModule = typeof import("./graph.js");

export interface ToolSpec {
  name: string;
  description: string;
  shape: Record<string, any>;
  handler: (args: any) => Promise<{ content: { type: "text"; text: string }[] }>;
}

function text(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

export function toolSpecs(opts: { graph?: GraphModule } = {}): ToolSpec[] {
  const { graph } = opts;
  const specs: ToolSpec[] = [
    {
      name: "triz_parameter",
      description: "Get a canonical TRIZ engineering parameter (1-39). Omit id to list all 39.",
      shape: { id: z.number().int().min(1).max(39).optional().describe("Parameter number 1-39; omit to list all") },
      handler: async ({ id }: { id?: number }) => text(id == null ? triz.parameters() : triz.getParameter(id) ?? { error: "no parameter " + id }),
    },
    {
      name: "triz_principle",
      description: "Get a canonical TRIZ inventive principle (1-40). Omit id to list all 40. Look up principle numbers instead of recalling them from memory.",
      shape: { id: z.number().int().min(1).max(40).optional().describe("Principle number 1-40; omit to list all") },
      handler: async ({ id }: { id?: number }) => text(id == null ? triz.principles() : triz.getPrinciple(id) ?? { error: "no principle " + id }),
    },
    {
      name: "triz_matrix",
      description: "Look up the canonical contradiction matrix for an improving and worsening engineering parameter. Blank and diagonal cells fail closed; never guess a recommendation.",
      shape: {
        improving: z.number().int().min(1).max(39).describe("Parameter to improve (1-39)"),
        worsening: z.number().int().min(1).max(39).describe("Parameter that worsens (1-39)"),
      },
      handler: async ({ improving, worsening }: { improving: number; worsening: number }) => text(triz.matrixLookup(improving, worsening)),
    },
    {
      name: "triz_matrix_multi",
      description: "Multi-parameter contradiction lookup: every (improving x worsening) matrix cell with the principles aggregated by how many cells recommend each (ties broken by mean position). Use when a conflict involves several parameters on either side; per-cell detail is returned so nothing is hidden. All-blank or diagonal-only results fail closed like triz_matrix.",
      shape: {
        improving: z.array(z.number().int().min(1).max(39)).min(1).describe("Parameters to improve (1-39), e.g. [9, 14]"),
        worsening: z.array(z.number().int().min(1).max(39)).min(1).describe("Parameters that worsen (1-39), e.g. [25, 33]"),
      },
      handler: async ({ improving, worsening }: { improving: number[]; worsening: number[] }) =>
        text(triz.matrixLookupMulti(improving, worsening)),
    },
    {
      name: "triz_resolve",
      description: "Look up a contradiction-matrix cell and expand its recommended principles and both engineering parameters. Fails closed on blank cells.",
      shape: {
        improving: z.number().int().min(1).max(39).describe("Parameter to improve (1-39)"),
        worsening: z.number().int().min(1).max(39).describe("Parameter that worsens (1-39)"),
      },
      handler: async ({ improving, worsening }: { improving: number; worsening: number }) => text(triz.resolve(improving, worsening)),
    },
    {
      name: "triz_tool_catalog",
      description: "List the domain-neutral TRIZ tool catalog, optionally restricted to problem analysis, task modeling, or solution synthesis.",
      shape: { stage: z.enum(["analysis", "modeling", "synthesis"]).optional().describe("Optional workflow stage") },
      handler: async ({ stage }: { stage?: triz.ToolStage }) => text(triz.toolCatalog(stage)),
    },
    {
      name: "triz_effects",
      description: "Search the curated effects database by required function (e.g. 'convert temperature difference into voltage', 'store heat', 'sense strain') or list by category: physical, chemical, geometric. Effects are classical textbook phenomena; selecting and substantiating one remains a synthesis step, never a lookup verdict.",
      shape: {
        query: z.string().optional().describe("Function keywords to search for, e.g. 'store heat' or 'sense magnetic field'"),
        category: z.enum(["physical", "chemical", "geometric"]).optional().describe("Restrict results to one category"),
      },
      handler: async ({ query, category }: { query?: string; category?: "physical" | "chemical" | "geometric" }) =>
        text(triz.effects(query, category)),
    },
    {
      name: "triz_route",
      description: "Route a problem stage and optional observable signals to candidate TRIZ tools. Routing is deterministic and returns only tools registered for that stage.",
      shape: {
        stage: z.enum(["analysis", "modeling", "synthesis"]).describe("Current workflow stage"),
        signals: z.array(z.string()).optional().describe("Problem signals such as bottleneck, stakeholder conflict, or harmful interaction"),
      },
      handler: async ({ stage, signals }: { stage: triz.ToolStage; signals?: string[] }) => text(triz.routeTools(stage, signals)),
    },
    {
      name: "triz_function_model",
      description: "Check a TRIZ function model written as a typed wiring diagram (boxes with typed ports, wires carrying one carrier and a polarity) and analyse it: harm loops (closed loops containing a harmful or excessive function, with witness cycles), an ideality profile per resource dimension (never summed; a scalar ratio only with explicit weights), separation checks for embedded physical contradictions, and, given compare_to, a componentwise baseline-vs-concept comparison. Any dangling, mis-directed, or mistyped wire, or an invalid embedded contradiction, fails closed with ok:false. Loops are hypotheses about mechanism to substantiate, not findings.",
      shape: {
        model: act.FunctionModel.describe("The model to analyse (the concept, when compare_to is given)"),
        compare_to: act.FunctionModel.optional().describe("Baseline model of the same system with stable box ids"),
      },
      handler: async ({ model, compare_to }: { model: act.FunctionModel; compare_to?: act.FunctionModel }) => text(act.analyseModel(model, compare_to)),
    },
    {
      name: "triz_trim",
      description: "Screen a trimming of one or more boxes by the TRIZ trimming rules: A (object trimmed too, function no longer needed), B (the object performs the function itself), C (another remaining box or supersystem resource has an output of the same carrier). Returns per-function absorbers, orphaned functions that block the trim, harms and costs removed, and one trimming problem per absorber. A carrier match is a necessary condition only; every absorber is a hypothesis to solve and substantiate.",
      shape: {
        model: act.FunctionModel,
        trim: z.array(z.string().min(1)).min(1).describe("Ids of the boxes to remove"),
      },
      handler: async ({ model, trim }: { model: act.FunctionModel; trim: string[] }) => text(act.trimCandidates(model, trim)),
    },
    {
      name: "triz_separate",
      description: "Decide whether a physical contradiction's demands can be met piecewise over a finite space x time x condition x direction x level base (the MATRIZ separation types). Each demand lists admissible values and the cells where it applies (omitted axis = whole axis). Returns per-pair status (compatible: not a physical contradiction; separated: the separating axes; irreducible: overlap on every axis) and the conflict cells where no value satisfies every active demand.",
      shape: { contradiction: act.PhysicalContradiction },
      handler: async ({ contradiction }: { contradiction: act.PhysicalContradiction }) => text(act.separationCheck(contradiction)),
    },
    {
      name: "triz_evals",
      description: "Return the domain-neutral TRIZ lookup regressions and cross-domain reasoning cases.",
      shape: {},
      handler: async () => text(triz.evals()),
    },
  ];

  if (graph) {
    specs.push(
      {
        name: "triz_graph",
        description: "Optional project extension: analyse an OTSM Network of Problems (contradiction graph) and its verifier-backed purpose gates. Requires a project graph via TRIZ_GRAPH; not part of the neutral skill core.",
        shape: {},
        handler: async () => text(graph.analyse()),
      },
      {
        name: "triz_purpose",
        description: "Optional project extension: inspect the invariant and purpose gate for one contradiction node of the project graph.",
        shape: { id: z.string().describe("Node id as used in the project graph, e.g. S1") },
        handler: async ({ id }: { id: string }) => {
          const node = graph.loadGraph().nodes.find((n) => n.id === id);
          if (!node) return text({ error: "no node " + id });
          return text({ id, purpose: node.purpose, refs: node.refs, gate: graph.purposeGate(node, graph.loadRegistryById()) });
        },
      },
    );
  }

  return specs;
}

/** Attach specs to an MCP SDK v1 server (stdio npm package). */
export function bindV1(server: McpServerV1, specs: ToolSpec[]) {
  for (const s of specs) server.tool(s.name, s.description, s.shape, s.handler);
}

/** Attach specs to an MCP SDK v2 server (hosted Workers entry via agents/mcp/server). */
export function bindV2(server: McpServerV2, specs: ToolSpec[]) {
  for (const s of specs) server.registerTool(s.name, { description: s.description, inputSchema: s.shape }, s.handler);
}
