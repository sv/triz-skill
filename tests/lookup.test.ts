/**
 * Runs the hard `lookup_evals` from data/evals.json through the pure lookup layer.
 * This is the deterministic regression gate for the TRIZ knowledge core.
 *
 *   node --import tsx --test tests/*.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as triz from "../src/data.js";
import { version } from "../src/version.js";

const suite = triz.evals();

for (const ev of suite.lookup_evals) {
  test(ev.name, () => {
    const { tool, input, expect } = ev;

    if (tool === "triz_matrix") {
      const r = triz.matrixLookup(input.improving, input.worsening);
      assert.equal(r.covered, expect.covered, "covered flag");
      if (expect.principles) assert.deepEqual(r.principles, expect.principles, "principles");
      if (expect.source) assert.equal(r.source, expect.source, "source");
      if (expect.status) assert.equal(r.status, expect.status, "status");
      return;
    }

    if (tool === "triz_principle") {
      const p = triz.getPrinciple(input.id);
      assert.ok(p, `principle ${input.id} exists`);
      if (expect.name) assert.equal(p!.name, expect.name, "name");
      if (expect.classic_includes) assert.ok(p!.classic.toLowerCase().includes(expect.classic_includes.toLowerCase()), `classic text mentions '${expect.classic_includes}'`);
      return;
    }

    if (tool === "triz_parameter") {
      const p = triz.getParameter(input.id);
      assert.ok(p, `parameter ${input.id} exists`);
      if (expect.name) assert.equal(p!.name, expect.name, "name");
      return;
    }

    if (tool === "triz_resolve") {
      const r = triz.resolve(input.improving, input.worsening);
      assert.equal(r.covered, expect.covered, "covered flag");
      if (expect.principle_ids) assert.deepEqual(r.principles, expect.principle_ids, "principle ids");
      if (expect.expands_to_names) {
        assert.equal(r.principles_detail.length, r.principles.length, "every principle expanded");
        assert.ok(r.principles_detail.every((p: any) => p && typeof p.name === "string"), "expansions carry names");
      }
      return;
    }

    if (tool === "triz_route") {
      const r = triz.routeTools(input.stage, input.signals);
      if (expect.tool_ids_include) {
        const ids = new Set(r.tools.map((candidate) => candidate.id));
        for (const id of expect.tool_ids_include) assert.ok(ids.has(id), `route includes tool ${id}`);
      }
      if (expect.all_match_stage) assert.ok(r.tools.every((candidate) => candidate.stages.includes(input.stage)));
      return;
    }

    assert.fail(`unknown eval tool: ${tool}`);
  });
}

test("all 39 parameters present", () => assert.equal(triz.parameters().length, 39));
test("all 40 principles present", () => assert.equal(triz.principles().length, 40));
test("all 34 routed tools present", () => assert.equal(triz.toolCatalog().length, 34));
test("matrix is canonical-only", () => {
  const cells = Object.values(triz.matrix().cells);
  assert.equal(cells.length, 1248);
  assert.ok(cells.every((cell) => cell.source === "altshuller"));
});
test("every matrix cell references valid principles", () => {
  const ok = new Set(triz.principles().map((p) => p.id));
  for (const [key, cell] of Object.entries(triz.matrix().cells)) {
    for (const pid of cell.principles) assert.ok(ok.has(pid), `cell ${key} principle ${pid} valid`);
  }
});

const publishedSuite = JSON.parse(
  fs.readFileSync(path.join(triz.resolveDataDir(), "published-case-evals.json"), "utf8"),
);
test("published benchmark is separate from runtime eval context", () => {
  assert.equal("cases" in suite, false);
  assert.equal("published_case_evals" in suite, false);
});

test("published benchmark has sourced, judge-only ground truth", () => {
  assert.ok(publishedSuite.cases.length >= 6);
  const ids = new Set<string>();

  for (const ev of publishedSuite.cases) {
    assert.match(ev.id, /^matriz-\d{4}-/);
    assert.equal(ids.has(ev.id), false, `unique case id ${ev.id}`);
    ids.add(ev.id);

    assert.ok(ev.naturalistic_prompt.length >= 140, `${ev.id} has a substantive sparse prompt`);
    assert.doesNotMatch(
      ev.naturalistic_prompt,
      /three (distinct )?mechanisms|contradiction\/IFR|falsifiable pilot|guardrails/i,
      `${ev.id} sparse prompt does not prescribe the scored answer`,
    );
    assert.ok(ev.solver_prompt.length >= 300, `${ev.id} has a substantive structured prompt`);
    assert.ok(ev.source.title);
    assert.ok(ev.source.authors.length > 0);
    assert.ok(ev.source.publication);
    assert.ok(ev.source.pages);
    assert.match(ev.source.url, /^https:\/\/matriz\.org\//);

    assert.ok(ev.hidden_reference.diagnosis);
    assert.ok(ev.hidden_reference.triz_models.length > 0);
    assert.ok(ev.hidden_reference.reported_mechanisms.length > 0);
    assert.ok(ev.hidden_reference.reported_outcome);
    assert.ok(ev.hidden_reference.caveats);
    assert.ok(ev.rubric_anchors.length >= 4);
  }
});

test("server version tracks package.json (no drift)", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(version, pkg.version);
});

test("published benchmark spans implementation maturity and nontechnical domains", () => {
  const maturity = new Set(publishedSuite.cases.map((ev: any) => ev.evidence_maturity));
  const domains = publishedSuite.cases.map((ev: any) => ev.domain).join(" ");
  assert.ok(maturity.has("implemented-with-quantified-outcome"));
  assert.ok(maturity.has("implemented-with-experimental-validation"));
  assert.ok(maturity.has("diagnosed-and-proposed"));
  assert.match(domains, /demand/);
  assert.match(domains, /supply/);
  assert.match(domains, /engagement/);
  assert.match(domains, /public-relations/);
});
