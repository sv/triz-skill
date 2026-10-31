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

    if (tool === "triz_matrix_multi") {
      const r = triz.matrixLookupMulti(input.improving, input.worsening);
      assert.equal(r.covered, expect.covered, "covered flag");
      if (expect.total_cells) assert.equal(r.total_cells, expect.total_cells, "total cells");
      if (expect.covered_cells !== undefined) assert.equal(r.covered_cells, expect.covered_cells, "covered cells");
      if (expect.top_principles) {
        const topCount = r.aggregated[0]?.cell_count;
        const top = r.aggregated.filter((a: any) => a.cell_count === topCount).map((a: any) => a.principle);
        assert.deepEqual(top.sort((a: number, b: number) => a - b), expect.top_principles.sort((a: number, b: number) => a - b), "top principles by cell count");
      }
      if (expect.top_cell_count) {
        assert.equal(r.aggregated[0]?.cell_count, expect.top_cell_count, "top cell count");
      }
      if (expect.principles_sorted) {
        assert.deepEqual(r.principles, expect.principles_sorted, "full frequency ordering");
      }
      if (expect.has_hint) assert.ok(r.hint, "fail-closed hint present");
      return;
    }

    if (tool === "triz_effects") {
      const r = triz.effects(input.query, input.category);
      if (expect.matched_min) assert.ok(r.matched >= expect.matched_min, `matched ${r.matched} >= ${expect.matched_min}`);
      if (expect.top_name_includes) {
        assert.ok(
          r.effects.slice(0, 5).some((e: any) => e.name.toLowerCase().includes(expect.top_name_includes.toLowerCase())),
          `top results include ${expect.top_name_includes}`,
        );
      }
      if (expect.all_category) assert.ok(r.effects.every((e: any) => e.category === expect.all_category));
      return;
    }

    assert.fail(`unknown eval tool: ${tool}`);
  });
}

test("all 39 parameters present", () => assert.equal(triz.parameters().length, 39));
test("all 40 principles present", () => assert.equal(triz.principles().length, 40));
test("all 37 routed tools present", () => assert.equal(triz.toolCatalog().length, 37));
test("effects database ships 78 curated entries with full metadata", () => {
  const { effects } = triz.effects();
  assert.equal(effects.length, 78);
  assert.ok(effects.length >= 50, "starter set is substantive");
  for (const e of effects) {
    assert.ok(e.name && e.function && e.statement, `effect ${e.id} has name/function/statement`);
    assert.ok(["physical", "chemical", "geometric"].includes(e.category), `effect ${e.id} category valid`);
    assert.ok(Array.isArray(e.hints) && e.hints.length > 0, `effect ${e.id} has hints`);
  }
  assert.deepEqual(effects.map(e => e.id), Array.from({ length: 78 }, (_, i) => i + 1), "retain original ids and append new ones");
  for (const e of effects.filter(e => typeof e.id === "number" && e.id > 60)) {
    assert.match(e.provenance.citation, /^https:\/\//);
    assert.ok(e.conditions?.length && e.limitations.length, `new effect ${e.id} declares applicability limits`);
    if (e.input) assert.ok(e.input_parameter && e.output_parameter && e.source && e.typed_from, "typed clauses retain explicit parameter references and provenance");
  }
});
test("matrix_multi aggregation equals a manual fold of single lookups", () => {
  const imp = [5, 9, 28], wor = [12, 35];
  const multi = triz.matrixLookupMulti(imp, wor);
  const manual = new Map<number, number>();
  for (const i of imp) for (const w of wor) {
    const single = triz.matrixLookup(i, w);
    if (single.covered) for (const p of single.principles) manual.set(p, (manual.get(p) ?? 0) + 1);
  }
  const manualCount = [...manual.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const multiCount = multi.aggregated.map((a: any) => [a.principle, a.cell_count] as [number, number]);
  assert.equal(multi.total_cells, imp.length * wor.length);
  assert.equal(multi.covered_cells, manualCount.length > 0 ? multi.cells.filter((c: any) => c.covered).length : 0);
  for (const [pid, count] of multiCount) assert.equal(manual.get(pid), count, `principle ${pid} count matches single lookups`);
  assert.equal(manual.size, multi.aggregated.length, "same principle set");
});

test("effects search finds release mechanisms for a deposited layer and for particles on a surface", () => {
  const top = (q: string) => triz.effects(q).effects.slice(0, 5).map((e: any) => e.name);
  for (const name of ["Vibration-assisted release", "Reverse-flow (back-pulse) cleaning", "Thermal-expansion mismatch detachment"]) {
    assert.ok(top("remove a deposited layer").includes(name), name);
  }
  for (const name of ["Vibration-assisted release", "Electrostatic repulsion", "Reverse-flow (back-pulse) cleaning"]) {
    assert.ok(top("release particles from a surface").includes(name), name);
  }
});
test("effects search ranks Seebeck for temperature-to-voltage", () => {
  const r = triz.effects("convert temperature difference into voltage");
  assert.ok(r.matched >= 1);
  assert.ok(r.effects.slice(0, 5).some((e: any) => e.name === "Seebeck effect"), "Seebeck effect in top 5");
});
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
