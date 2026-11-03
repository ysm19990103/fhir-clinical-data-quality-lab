import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInput,ImportError} from '../app/parser.mjs';
import {LIMITS} from '../app/catalog.mjs';
const rejects=(text,code)=>assert.throws(()=>parseInput(text),e=>e instanceof ImportError&&e.code===code);

test('parser accepts BOM, JSON whitespace and escaped characters without changing values',()=>{
  const original={resourceType:'Patient',id:'example-1',note:'quotes " and \\ and \n tab\t',active:false};
  const parsed=parseInput('\ufeff  '+JSON.stringify(original)+'\r\n');
  assert.equal(JSON.stringify(parsed),JSON.stringify(original));
  assert.equal(Object.getPrototypeOf(parsed),null);
});
test('parser rejects duplicate decoded keys, including Unicode escape aliases',()=>{
  rejects('{"resourceType":"Patient","resourceType":"Observation"}','duplicate-key');
  rejects('{"resourceType":"Patient","id":"a","\\u0069d":"b"}','duplicate-key');
});
test('parser rejects prototype-sensitive keys at every nesting level',()=>{
  for(const key of ['__proto__','constructor','prototype'])rejects(`{"resourceType":"Patient","nested":{"${key}":"canary"}}`,'security');
  assert.equal({}.polluted,undefined);
});
test('parser rejects malformed JSON and trailing data',()=>{
  for(const text of ['{"x":1,}','{"x":01}','{"x":NaN}','{"x":Infinity}','{"x":+1}','{"x":1.}','{"x":true false}','{"x":"a\nb"}','{} []','{"x":[1,]}'])rejects(text,'syntax');
});
test('parser requires a single object root',()=>{
  for(const text of ['null','true','[]','"Patient"','15'])rejects(text,'shape');
  assert.throws(()=>parseInput({}),e=>e.code==='input');
});
test('parser accepts finite 15-significant-digit numbers and rejects unsafe precision/underflow',()=>{
  assert.equal(parseInput('{"x":123456789012345}').x,123456789012345);
  assert.equal(parseInput('{"x":1e-308}').x,1e-308);
  for(const text of ['{"x":1234567890123456}','{"x":0.1234567890123456}','{"x":1e999}','{"x":1e-999}'])rejects(text,'precision');
});
test('parser limits encoded bytes, decoded strings, nodes and nesting',()=>{
  rejects(' '.repeat(LIMITS.bytes+1),'limit');
  rejects(JSON.stringify({x:'x'.repeat(LIMITS.string+1)}),'limit');
  rejects('{"x":'+ '['.repeat(LIMITS.depth+1)+'0'+']'.repeat(LIMITS.depth+1)+'}','limit');
  rejects('{"x":['+Array(LIMITS.nodes).fill('0').join(',')+']}','limit');
});
test('parser errors contain fixed explanations and offsets, never input excerpts',()=>{
  const canary='PRIVATE_CANARY_82713';
  try{parseInput(`{"${canary}":"unterminated`);assert.fail('should reject');}
  catch(error){assert.ok(error instanceof ImportError);assert.ok(Number.isInteger(error.offset));assert.ok(!JSON.stringify({message:error.message,...error}).includes(canary));}
});
