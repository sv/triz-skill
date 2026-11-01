import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import{z}from'zod';
import {toolSpecs} from '../src/tools.js';import '../src/data.js';
test('documented finite assurance requests parse and execute through shared transport tools',async()=>{
 const specs=new Map(toolSpecs().map(s=>[s.name,s]));
 const examples=JSON.parse(fs.readFileSync(new URL('../examples/assurance/requests.json',import.meta.url),'utf8'));
 for(const example of examples){const spec=specs.get(example.tool)!;assert.ok(spec,example.tool);const parsed=z.strictObject(spec.shape).parse(example.args);const out=JSON.parse((await spec.handler(parsed)).content[0].text);assert.notEqual(out.ok,false,`${example.tool}: ${JSON.stringify(out)}`);for(const[k,v]of Object.entries(example.expect))assert.equal(out[k],v,`${example.tool}.${k}`);}
});
