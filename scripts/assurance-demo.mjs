#!/usr/bin/env node
/** Offline end-to-end examples through the transport-shared tool handlers. */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toolSpecs } from '../src/tools.ts';
import '../src/data.ts';
const examples=JSON.parse(fs.readFileSync(fileURLToPath(new URL('../examples/assurance/requests.json',import.meta.url)),'utf8'));
const specs=new Map(toolSpecs().map(s=>[s.name,s]));
for(const example of examples){
  const spec=specs.get(example.tool);if(!spec)throw new Error(`unknown tool ${example.tool}`);
  const out=JSON.parse((await spec.handler(example.args)).content[0].text);
  if(out.ok===false)throw new Error(`${example.tool}: ${JSON.stringify(out)}`);
  for(const [k,v]of Object.entries(example.expect))if(out[k]!==v)throw new Error(`${example.tool}.${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(out[k])}`);
  console.log(`${example.tool}: ${JSON.stringify(example.expect)}`);
}
console.log(`All ${examples.length} finite assurance examples passed. Certificates generated here must still be checked with Lean.`);
