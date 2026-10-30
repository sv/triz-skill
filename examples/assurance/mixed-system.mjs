#!/usr/bin/env node
/** Run: node --import tsx examples/assurance/mixed-system.mjs
 * All behaviors, costs and service conditions are synthetic declarations. */
import assert from 'node:assert/strict';
import { toolSpecs } from '../../src/tools.ts';
import '../../src/data.ts';

const modes = ['available', 'outage', 'quota'];
const carrier = (id, values) => ({ id, layer: 'information', dimension: id, effect_quantity: id, si: {}, values });
const port = (id, carrier) => ({ id, carrier });
const base = {
  domain: 'physical',
  carriers: [carrier('sample', ['sample']), carrier('service-status', modes), carrier('result', ['usable', 'blocked'])],
  boxes: [
    { id: 'sensor', name: 'Hardware sensor (synthetic)', role: 'tool', outputs: [port('sample', 'sample')],
      behavior: [{ in: {}, out: { sample: 'sample' } }], feasibility: [{ provides: { sample: 1 }, cost: { money: 2, energy: 1 } }] },
    { id: 'provider', name: 'Ecosystem service provider (synthetic)', role: 'environment',
      inputs: [port('condition', 'service-status')], outputs: [port('status', 'service-status')],
      behavior: modes.map(status => ({ in: { condition: status }, out: { status } })), feasibility: [{ provides: { status: 1 } }] },
    { id: 'product', name: 'Required usable report', role: 'product', inputs: [port('result', 'result')],
      behavior: ['usable', 'blocked'].map(result => ({ in: { result }, out: {} })), feasibility: [{ requires: { result: 1 } }] },
  ],
  wires: [],
};
const processor = mode => ({ id: 'processor', name: `${mode} software (synthetic)`, role: 'mediator',
  inputs: [port('sample', 'sample'), port('status', 'service-status')], outputs: [port('result', 'result')],
  behavior: modes.map(status => ({ in: { sample: 'sample', status }, out: { result: mode === 'edge' || status === 'available' ? 'usable' : 'blocked' } })),
  feasibility: [{ requires: { sample: 1, status: 1 }, provides: { result: 1 },
    cost: mode === 'cloud' ? { money: 1, energy: 1, maintenance: 3 } : { money: 4, energy: 3, maintenance: 1 } }],
});
const model = mode => ({ ...structuredClone(base), boxes: [...structuredClone(base.boxes), processor(mode)], wires: [
  { id: 'sample', from: { box: 'sensor', port: 'sample' }, to: { box: 'processor', port: 'sample' }, carrier: 'sample', polarity: 'useful' },
  { id: 'status', from: { box: 'provider', port: 'status' }, to: { box: 'processor', port: 'status' }, carrier: 'service-status', polarity: 'useful' },
  { id: 'result', from: { box: 'processor', port: 'result' }, to: { box: 'product', port: 'result' }, carrier: 'result', polarity: 'useful' },
] });
const acceptable = [{ box: 'product', port: 'result', values: ['usable'] }];
const envelope = 'Synthetic: one sensor sample; provider available/outage/quota; edge processing is declared to work in every provider condition';
const metadata = { contract: { operating_envelope: envelope, resource_binding: 'all-behavior-rows' }, declared_harms: [],
  evidence: [{ claim: 'All behavior and cost rows are synthetic assumptions', source: 'Synthetic finite example; no measured hardware, software or provider data', operating_envelope: envelope }] };
const contract = { target: model('edge'), acceptable, budget: { money: 8, energy: 5, maintenance: 5 } };
const search = { model: base, resources: [{ box: 'sensor', port: 'sample' }, { box: 'provider', port: 'status' }],
  targets: [{ box: 'product', port: 'result' }], catalogue: ['cloud', 'edge'].map(mode => ({ id: mode, component: processor(mode) })),
  max_components: 1, contract, implementation: metadata };
const cases = [
  { id: 'cloud-adequacy', tool: 'triz_adequacy', args: { model: model('cloud'), acceptable, scope: 'whole' }, expect: 'inadequate' },
  { id: 'edge-adequacy', tool: 'triz_adequacy', args: { model: model('edge'), acceptable, scope: 'whole' }, expect: 'adequate' },
  { id: 'joint-implementations', tool: 'triz_implementations', args: { contract,
    alternatives: ['cloud', 'edge'].map(id => ({ id, model: model(id), ...metadata })) }, expect: 'satisfied' },
  { id: 'discover', tool: 'triz_component_search', args: search, expect: 'synthesized' },
  { id: 'tight-money', tool: 'triz_component_search', args: { ...search,
    contract: { ...contract, budget: { ...contract.budget, money: 4 } } }, expect: 'impossible-in-library' },
];
const tools = new Map(toolSpecs().map(s => [s.name, s]));
const call = async (tool, args) => JSON.parse((await tools.get(tool).handler(args)).content[0].text);
const snapshot = JSON.stringify(cases);
for (const c of cases) {
  const r = await call(c.tool, c.args);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.verdict, c.expect, JSON.stringify(r));
  if (c.id.endsWith('-adequacy')) {
    assert.equal(r.requiredSituationCount, 3);
    assert.equal(r.unacceptableInputCount, c.id === 'cloud-adequacy' ? 2 : 0);
    if (c.id === 'cloud-adequacy') assert.deepEqual(
      r.unacceptableOutputs.map(x => x.input[0].value).sort(), ['outage', 'quota']);
  }
  if (c.id === 'joint-implementations') {
    assert.deepEqual(r.satisfying, ['edge']);
    assert.deepEqual(r.results.map(x => x.reason), ['behavior-changed', 'joint-witness']);
    assert.deepEqual(r.results[1].resources.minimal[0].resources, { money: 6, energy: 4, maintenance: 1 });
  }
  if (c.id === 'discover' || c.id === 'tight-money') {
    assert.equal(r.complete, true);
    assert.equal(r.allDecided, true);
    assert.equal(r.checkedCount, 2);
    assert.equal(r.satisfyingCount, c.id === 'discover' ? 1 : 0);
    if (r.candidates.length) assert.deepEqual(r.candidates[0].components.map(x => x.template), ['edge']);
  }
  console.log(JSON.stringify({ id: c.id, verdict: r.verdict,
    ...(r.requiredSituationCount !== undefined ? { situations: r.requiredSituationCount } : {}),
    ...(r.unacceptableInputCount !== undefined ? { unacceptable: r.unacceptableInputCount } : {}),
    ...(r.checkedCount !== undefined ? { checked: r.checkedCount } : {}),
    ...(r.satisfying !== undefined ? { satisfying: r.satisfying } : {}),
    ...(r.satisfyingCount !== undefined ? { satisfyingCount: r.satisfyingCount } : {}),
    ...(r.work !== undefined ? { work: r.work } : {}) }));
}
// Cross-domain compatibility uses declared interfaces and constraints, not this label.
for (const domain of ['software', 'business']) {
  const renamed = structuredClone(search);
  renamed.model.domain = domain;
  renamed.contract.target.domain = domain;
  const r = await call('triz_component_search', renamed);
  assert.equal(r.verdict, 'synthesized');
  assert.equal(r.satisfyingCount, 1);
  assert.deepEqual(r.candidates[0].components.map(x => x.template), ['edge']);
}
assert.equal(JSON.stringify(cases), snapshot, 'tool evaluation mutated the declared requests');
