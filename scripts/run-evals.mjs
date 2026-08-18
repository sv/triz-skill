#!/usr/bin/env -S npx tsx
/**
 * TRIZ eval runner — LLM solver + judge harness for the reasoning and published-case
 * suites, plus a deterministic no-recall matrix-citation benchmark.
 *
 * FAIL-CLOSED ON KEY: no network call is made unless TRIZ_EVAL_API_KEY (or
 * OPENAI_API_KEY) is set. CI never runs this script. --dry-run plans a run and
 * validates data without a key and without network access.
 *
 *   node --import tsx scripts/run-evals.mjs --suite no-recall --limit 20
 *   node --import tsx scripts/run-evals.mjs --suite reasoning
 *   node --import tsx scripts/run-evals.mjs --suite published --variant solver
 *
 * Env:
 *   TRIZ_EVAL_API_KEY   required for real runs (fallback: OPENAI_API_KEY)
 *   TRIZ_EVAL_BASE_URL  OpenAI-compatible endpoint; default https://api.openai.com/v1
 *                       (e.g. https://api.deepseek.com for DeepSeek)
 *   TRIZ_EVAL_MODEL     default gpt-4o-mini
 *
 * Suites:
 *   no-recall  Deterministic: ask the model for matrix cells from memory, score the
 *              citations against the canonical table. No judge needed. This is the
 *              benchmark that quantifies why the MCP server exists.
 *   reasoning  Solver sees only the problem statement of reasoning_evals (never the
 *              rubric); an LLM judge scores the answer against the judge-only rubric.
 *   published  Solver sees naturalistic_prompt or solver_prompt (--variant, default
 *              naturalistic); judge scores against hidden_reference + rubric_anchors.
 *              Alternatives at least as credible as the published solution earn full
 *              credit, per the suite's scoring note.
 *
 * Results: evals/results/<timestamp>-<suite>[-<variant>].{json,md} (gitignored).
 */
import fs from "node:fs";
import path from "node:path";
import { matrix, parameters, evals as loadEvals } from "../src/data.js";

// ------------------------------ config ------------------------------

function parseArgs(argv) {
  const opts = { suite: null, variant: "naturalistic", limit: 0, dryRun: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--suite") opts.suite = argv[++i];
    else if (a === "--variant") opts.variant = argv[++i];
    else if (a === "--limit") opts.limit = Number(argv[++i]);
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--out") opts.out = argv[++i];
    else { console.error(`unknown flag: ${a}`); usage(2); }
  }
  if (!["no-recall", "reasoning", "published"].includes(opts.suite)) {
    console.error("--suite must be one of: no-recall, reasoning, published");
    usage(2);
  }
  if (!["naturalistic", "solver"].includes(opts.variant)) {
    console.error("--variant must be naturalistic or solver");
    usage(2);
  }
  return opts;
}

function usage(code) {
  console.error(`usage: node --import tsx scripts/run-evals.mjs --suite <no-recall|reasoning|published> [--variant naturalistic|solver] [--limit N] [--dry-run] [--out report.md]`);
  process.exit(code);
}

const opts = parseArgs(process.argv.slice(2));
const apiKey = process.env.TRIZ_EVAL_API_KEY || process.env.OPENAI_API_KEY || "";
const baseUrl = (process.env.TRIZ_EVAL_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const model = process.env.TRIZ_EVAL_MODEL || "gpt-4o-mini";

if (!apiKey && !opts.dryRun) {
  console.error(
    "[triz-evals] disabled: no API key. Set TRIZ_EVAL_API_KEY (or OPENAI_API_KEY) to enable; " +
    "TRIZ_EVAL_BASE_URL and TRIZ_EVAL_MODEL select the endpoint and model. " +
    "Use --dry-run to plan a run without a key.",
  );
  process.exit(2);
}

const RESULTS_DIR = path.resolve("evals/results");

// ------------------------------ LLM client ------------------------------

async function chat(messages, { maxTokens = 3000 } = {}) {
  const body = JSON.stringify({ model, messages, temperature: 0, max_tokens: maxTokens });
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body,
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      lastErr = err;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tolerant JSON extraction: strips code fences, grabs the outermost object. */
function extractJson(text) {
  const stripped = text.replace(/```[a-zA-Z]*\n?/g, "").replace(/```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in judge output");
  return JSON.parse(stripped.slice(start, end + 1));
}

// ------------------------------ prompts ------------------------------

const SOLVER_SYSTEM = `You are an expert TRIZ practitioner applying the methodology end to end.
Produce a compact decision record: (1) frame and evidence, (2) key problem and causal chain,
(3) contradiction model — technical contradiction, physical contradiction, and Ideal Final
Result, (4) at least three distinct candidate mechanisms, each naming the resource used, the
assumption made, the expected benefit, the displaced harm, and the fastest falsifying test,
(5) a substantiation plan with validation metrics, guardrails, and remaining uncertainty.
Keep fact, inference, and hypothesis visibly separate. Do not use external tools or lookups;
reason from the problem statement alone. Stay under 900 words.`;

const JUDGE_SYSTEM = `You are a strict TRIZ evaluation judge. Score only what the solver's answer
actually supports. Quote evidence verbatim from the answer; an empty quote means unsupported.
Never reward named TRIZ vocabulary without a causal mechanism. Output ONLY a JSON object —
no prose outside it.`;

// ------------------------------ suites ------------------------------

function paramName(id) {
  return parameters().find((p) => p.id === id)?.name ?? `parameter ${id}`;
}

/** Evenly spaced deterministic sample over the 1248 canonical cells. */
function sampleCells(limit) {
  const entries = Object.values(matrix().cells);
  if (!limit || limit >= entries.length) return entries;
  const step = Math.floor(entries.length / limit);
  return entries.filter((_, i) => i % step === 0).slice(0, limit);
}

async function suiteNoRecall() {
  const cells = sampleCells(opts.limit);
  const items = [];
  for (const cell of cells) {
    items.push({
      improving: cell.improving_id,
      worsening: cell.worsening_id,
      canonical: cell.principles,
      question:
        `From the classical Altshuller 39x39 TRIZ contradiction matrix, recalled from memory: when improving engineering parameter ${cell.improving_id} "${paramName(cell.improving_id)}" worsens parameter ${cell.worsening_id} "${paramName(cell.worsening_id)}", which inventive principles does that matrix cell recommend? Recall the cell exactly. Reply with ONLY a JSON object: {"principles": [list of 1-4 principle numbers]}`,
    });
  }
  const results = [];
  for (const item of items) {
    if (opts.dryRun) { results.push({ ...item, dryRun: true }); continue; }
    try {
      const raw = await chat([
        { role: "system", content: "Answer from your knowledge of the classical TRIZ contradiction matrix. Output only the requested JSON." },
        { role: "user", content: item.question },
      ], { maxTokens: 200 });
      const answered = extractJson(raw).principles ?? [];
      const canon = new Set(item.canonical);
      const exact = answered.length === item.canonical.length && answered.every((p) => canon.has(p));
      const contained = answered.every((p) => canon.has(p)) && answered.length > 0;
      const overlap = answered.filter((p) => canon.has(p)).length;
      const fabricated = answered.filter((p) => !canon.has(p));
      results.push({ ...item, answered, exact, contained, overlap, fabricated });
      process.stderr.write(`no-recall ${item.improving}-${item.worsening}: ${exact ? "exact" : contained ? "contained" : overlap + "/" + item.canonical.length + " overlap"}\n`);
    } catch (err) {
      results.push({ ...item, error: String(err.message || err) });
    }
  }
  return { suite: "no-recall", items: results };
}

async function suiteReasoning() {
  const suite = loadEvals();
  const cases = suite.reasoning_evals;
  const results = [];
  for (const ev of cases) {
    if (opts.dryRun) { results.push({ name: ev.name, domain: ev.domain, dryRun: true }); continue; }
    try {
      const answer = await chat([
        { role: "system", content: SOLVER_SYSTEM },
        { role: "user", content: ev.problem },
      ]);
      const judgeRaw = await chat([
        { role: "system", content: JUDGE_SYSTEM },
        { role: "user", content:
`Problem: ${ev.problem}

Judge-only rubric (never shown to the solver):
${JSON.stringify(ev.rubric, null, 2)}

Solver answer:
${answer}

Return ONLY JSON with exactly these keys — must_model, separation_candidates, tools_include, validation_metrics_include — each {"satisfied": boolean, "evidence": "verbatim quote or empty string"}.` },
      ], { maxTokens: 1500 });
      const verdict = extractJson(judgeRaw);
      const satisfied = Object.values(verdict).filter((v) => v && v.satisfied).length;
      results.push({ name: ev.name, domain: ev.domain, answer, verdict, satisfied: `${satisfied}/4` });
      process.stderr.write(`reasoning "${ev.name}": ${satisfied}/4\n`);
    } catch (err) {
      results.push({ name: ev.name, domain: ev.domain, error: String(err.message || err) });
    }
  }
  return { suite: "reasoning", variant: null, items: results };
}

async function suitePublished() {
  const suitePath = path.resolve("skills/triz-innovation/data/published-case-evals.json");
  const suite = JSON.parse(fs.readFileSync(suitePath, "utf8"));
  const results = [];
  for (const ev of suite.cases) {
    if (opts.dryRun) { results.push({ id: ev.id, variant: opts.variant, dryRun: true }); continue; }
    try {
      const answer = await chat([
        { role: "system", content: SOLVER_SYSTEM },
        { role: "user", content: ev[`${opts.variant}_prompt`] },
      ]);
      const judgeRaw = await chat([
        { role: "system", content: JUDGE_SYSTEM },
        { role: "user", content:
`Problem given to the solver (${opts.variant} variant):
${ev[`${opts.variant}_prompt`]}

Judge-only hidden reference (the published solution; NOT a required answer):
${JSON.stringify(ev.hidden_reference, null, 2)}

Rubric anchors:
${ev.rubric_anchors.map((a, i) => `${i + 1}. ${a}`).join("\n")}

Scoring note: do not require reproduction of the published solution. Award an alternative
full credit when its causal mechanism and validation plan are at least as credible.

Solver answer:
${answer}

Return ONLY JSON: {"anchors": [{"anchor": <1-based number>, "score": 0|1|2, "evidence": "verbatim quote or empty string"}], "comment": "one sentence"}` },
      ], { maxTokens: 2000 });
      const verdict = extractJson(judgeRaw);
      const total = verdict.anchors?.reduce((s, a) => s + (a.score || 0), 0) ?? 0;
      const max = (verdict.anchors?.length ?? ev.rubric_anchors.length) * 2;
      results.push({ id: ev.id, variant: opts.variant, evidence_maturity: ev.evidence_maturity, answer, verdict, score: `${total}/${max}` });
      process.stderr.write(`published ${ev.id} [${opts.variant}]: ${total}/${max}\n`);
    } catch (err) {
      results.push({ id: ev.id, variant: opts.variant, error: String(err.message || err) });
    }
  }
  return { suite: "published", variant: opts.variant, items: results };
}

// ------------------------------ reports ------------------------------

function summarize(result) {
  if (result.suite === "no-recall") {
    const scored = result.items.filter((i) => !i.error && !i.dryRun);
    const n = scored.length || 1;
    const exact = scored.filter((i) => i.exact).length;
    const contained = scored.filter((i) => i.contained).length;
    const fabricated = scored.reduce((s, i) => s + (i.fabricated?.length ?? 0), 0);
    const avgOverlap = scored.reduce((s, i) => s + (i.overlap ?? 0), 0) / n;
    return { cells: scored.length, exact, exactPct: pct(exact, n), contained: contained, containedPct: pct(contained, n), fabricatedCitations: fabricated, avgCanonicalOverlap: round2(avgOverlap), errors: result.items.filter((i) => i.error).length };
  }
  const scored = result.items.filter((i) => !i.error && !i.dryRun);
  return { cases: scored.length, errors: result.items.filter((i) => i.error).length,
    perCase: scored.map((i) => ({ name: i.name ?? i.id, score: i.satisfied ?? i.score, domain: i.domain ?? i.evidence_maturity })) };
}

const pct = (a, b) => `${Math.round((100 * a) / b)}%`;
const round2 = (x) => Math.round(x * 100) / 100;

function toMarkdown(result, summary) {
  const head = [
    `# TRIZ eval report — ${result.suite}${result.variant ? ` (${result.variant} variant)` : ""}`,
    ``,
    `- model: ${model}`,
    `- endpoint: ${baseUrl}`,
    `- generated: ${new Date().toISOString()}`,
    `- summary: ${JSON.stringify(summary)}`,
    ``,
  ].join("\n");
  const body = result.items.map((i) => {
    if (i.error) return `## ${i.name ?? i.id ?? `${i.improving}-${i.worsening}`}

ERROR: ${i.error}
`;
    if (result.suite === "no-recall") {
      return `## cell ${i.improving}-${i.worsening}

- canonical: [${i.canonical.join(", ")}]
- answered: [${(i.answered ?? []).join(", ")}]
- exact: ${i.exact} | contained: ${i.contained} | overlap: ${i.overlap ?? "-"}${i.fabricated?.length ? ` | fabricated: [${i.fabricated.join(", ")}]` : ""}
`;
    }
    const label = i.name ? `${i.name} (${i.domain})` : `${i.id} [${i.variant}]`;
    return `## ${label}

score: ${i.satisfied ?? i.score}

verdict:

\`\`\`json
${JSON.stringify(i.verdict, null, 2)}
\`\`\`

<details><summary>solver answer</summary>

${i.answer}

</details>
`;
  }).join("\n");
  return head + body;
}

// ------------------------------ main ------------------------------

async function main() {
  const result = opts.suite === "no-recall" ? await suiteNoRecall()
    : opts.suite === "reasoning" ? await suiteReasoning()
    : await suitePublished();

  const summary = summarize(result);
  const markdown = toMarkdown(result, summary);

  if (opts.dryRun) {
    console.log(`[dry-run] suite=${result.suite} variant=${result.variant ?? "-"} cases=${result.items.length}`);
    console.log(`[dry-run] would call ${baseUrl}/chat/completions as ${model}; set TRIZ_EVAL_API_KEY to run for real.`);
    console.log(markdown.split("\n").slice(0, 8).join("\n"));
    return;
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `${stamp}-${result.suite}${result.variant ? `-${result.variant}` : ""}`;
  fs.writeFileSync(path.join(RESULTS_DIR, `${base}.json`), JSON.stringify({ model, baseUrl, generated: new Date().toISOString(), summary, result }, null, 2) + "\n");
  const mdPath = opts.out ?? path.join(RESULTS_DIR, `${base}.md`);
  fs.writeFileSync(mdPath, markdown + "\n");
  console.log(`summary: ${JSON.stringify(summary)}`);
  console.log(`wrote ${mdPath}`);
}

main().catch((err) => { console.error("[triz-evals] Fatal:", err.message || err); process.exit(1); });
