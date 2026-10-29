import { test } from 'node:test';
import assert from 'node:assert/strict';
import { semanticIsomorphism } from '../src/act-semantic-iso.js';
import { FunctionModel } from '../src/act.js';
const model = () => FunctionModel.parse({ domain:'software', carriers:[{id:'bit',layer:'information',dimension:'bit',values:['0','1']}], boxes:[{id:'a',name:'A',role:'tool',outputs:[{id:'out',carrier:'bit'}],behavior:[{in:{},out:{out:'0'}}]},{id:'b',name:'B',role:'tool',outputs:[{id:'out',carrier:'bit'}],behavior:[{in:{},out:{out:'1'}}]}], wires:[] });
test('semantic search continues past first structural automorphism', () => {
  const source=model(),target=model(); target.boxes.reverse();
  const r=semanticIsomorphism({source,target}); assert.ok(r.ok && 'aligned' in r && r.aligned);
});
test('semantic search maps values, ignores row ordering, and rejects incompatible rows', () => {
  const source=model(), target=model(); target.carriers[0].values=['yes','no'];
  target.boxes[0].behavior![0].out.out='yes';target.boxes[1].behavior![0].out.out='no';
  let r=semanticIsomorphism({source,target}); assert.ok(r.ok && 'aligned' in r && r.aligned);
  target.boxes[1].behavior![0].out.out='yes';
  r=semanticIsomorphism({source,target});assert.ok(r.ok && 'aligned' in r && !r.aligned);
});
test('semantic search exhaustion is undecided',()=>{
  const r=semanticIsomorphism({source:model(),target:model(),max_steps:1});
  assert.ok(r.ok && 'decided' in r && !r.decided);
});
test('returned entry-list mapping roundtrips prototype-like value and box ids',()=>{
  const source=FunctionModel.parse({domain:'software',carriers:[{id:'__proto__',layer:'information',dimension:'bit',values:['__proto__']}],boxes:[{id:'__proto__',name:'A',role:'tool',outputs:[{id:'o',carrier:'__proto__'}],behavior:[{in:{},out:{o:'__proto__'}}]}],wires:[]});
  const found=semanticIsomorphism({source,target:source});assert.ok(found.ok&&'mapping'in found&&found.mapping);
  if(found.ok&&'mapping'in found&&found.mapping){const checked=semanticIsomorphism({source,target:source,mapping:found.mapping as any});assert.ok(checked.ok&&'aligned'in checked&&checked.aligned);}
});
