import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer as McpServerV2, InMemoryTransport as InMemoryTransportV2 } from "@modelcontextprotocol/server";
import { bindV1, bindV2, toolSpecs } from "../src/tools.js";

const args = () => ({ model: { domain: "software", carriers: [], boxes: [{ id: "h", name: "H", role: "tool", inner: {
  model: { domain: "software", carriers: [], boxes: [], wires: [] }, inputs: [], outputs: [],
} }], wires: [] }, box: "h", mode: "declared", contract: { behavior: [], assumptions: [{}],
  resources: { inputs: {}, outputs: {}, budget: { constructor: 0 } }, operating_envelope: "test" } });

test("contract guard rejects prototype keys at tool and actual MCP validation boundaries", async () => {
  const spec = toolSpecs().find(s => s.name === "triz_subsystem_contract")!;
  const raw = args(); Object.defineProperty(raw.contract.resources.budget, "__proto__", { value: 7, enumerable: true });
  const inputSchema = z.strictObject(spec.shape);
  assert.equal(inputSchema.safeParse(raw).success, false);
  await assert.rejects(spec.handler(raw), /__proto__/);
  const allowed = inputSchema.parse(args());
  assert.equal(JSON.parse((await spec.handler(allowed)).content[0].text).status, "declared-unverified");
  const server = new McpServer({ name: "contract-test", version: "1" });
  const client = new Client({ name: "contract-client", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  bindV1(server, [spec]);
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const listed = await client.listTools(); assert.equal(listed.tools[0].name, "triz_subsystem_contract");
    const schema = listed.tools[0].inputSchema as unknown as { properties: { contract: { properties: { assumptions: { items: { propertyNames: { pattern: string } } } } } } };
    assert.equal(schema.properties.contract.properties.assumptions.items.propertyNames.pattern, "^(?!__proto__$)");
    const overWire = JSON.parse(JSON.stringify(raw));
    const bad = await client.callTool({ name: spec.name, arguments: overWire });
    assert.equal(bad.isError, true);
    assert.match(JSON.stringify(bad.content), /__proto__/);
    const good = await client.callTool({ name: spec.name, arguments: args() });
    assert.notEqual(good.isError, true);
    assert.match(JSON.stringify(good.content), /declared-unverified/);
  } finally { await client.close(); await server.close(); }
});


test("hosted SDK v2 also rejects prototype keys before dispatch", async () => {
  const spec = toolSpecs().find(s => s.name === "triz_subsystem_contract")!;
  const server = new McpServerV2({ name: "contract-test-v2", version: "1" });
  const client = new Client({ name: "contract-client-v1", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransportV2.createLinkedPair();
  bindV2(server, [spec]);
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const listed = await client.listTools(); assert.equal(listed.tools[0].name, spec.name);
    const raw = args(); Object.defineProperty(raw.contract.resources.budget, "__proto__", { value: 7, enumerable: true });
    const result = await client.callTool({ name: spec.name, arguments: JSON.parse(JSON.stringify(raw)) });
    assert.equal(result.isError, true); assert.match(JSON.stringify(result.content), /__proto__/);
    const good = await client.callTool({ name: spec.name, arguments: args() });
    assert.notEqual(good.isError, true); assert.match(JSON.stringify(good.content), /declared-unverified/);
  } finally { await client.close(); await server.close(); }
});
