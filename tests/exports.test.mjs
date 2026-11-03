import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze} from '../app/engine.mjs';
import {example,EXAMPLES} from '../app/examples.mjs';
import {reportJSON,findingsCSV,operationOutcome,reportHTML} from '../app/exports.mjs';
const review=input=>analyze(input,{reviewDate:'2026-11-03'});
const codes=a=>a.findings.map(f=>f.rule);

test('built-in examples are fresh synthetic objects and unknown names are rejected',()=>{
  assert.deepEqual(Object.keys(EXAMPLES).sort(),['baseline','challenge','privacy','references']);
  const a=example('baseline'),b=example('baseline');a.entry[0].resource.id='changed';assert.notEqual(a.entry[0].resource.id,b.entry[0].resource.id);
  for(const name of ['unknown','constructor','__proto__'])assert.throws(()=>example(name),/Unknown synthetic example/);
});
test('baseline covers all focused types without error-level findings',()=>{
  const a=review(example('baseline'));assert.equal(a.counts.error,0);
  for(const type of ['Patient','Observation','Encounter','Condition','DiagnosticReport','MedicationRequest'])assert.ok(a.resources.some(r=>r.type===type));
});
test('challenge demonstrates structural, chronology, unit, completeness and duplicate findings',()=>{
  const a=review(example('challenge'));
  for(const rule of ['OBS-001','STR-007','TIM-001','DQ-005','DQ-006','DQ-001','REF-003','REF-005'])assert.ok(codes(a).includes(rule),rule);
});
test('reference sandbox demonstrates contained, versioned, ambiguous and no-base resolution',()=>{
  const a=review(example('references'));
  assert.ok(a.links.some(l=>l.kind==='contained'&&l.status==='resolved'));
  assert.ok(a.links.some(l=>l.kind==='versioned'&&l.status==='resolved'));
  assert.ok(a.links.some(l=>l.status==='ambiguous'));
  assert.ok(a.links.some(l=>l.status==='no-base'));
});
test('privacy example exposes field-presence findings without its source strings',()=>{
  const a=review(example('privacy'));
  for(const rule of ['PRV-001','PRV-002','PRV-003'])assert.ok(codes(a).includes(rule));
  const output=reportJSON(a);assert.ok(!output.includes('SYNTHETIC-ONLY'));assert.ok(!output.includes('Synthetic demonstration record'));
});
test('all four export formats omit raw imported strings, identifiers, narratives, keys and attachments',()=>{
  const canary='SYNTHETIC_PRIVATE_CANARY_29348';
  const input={resourceType:'Patient',id:canary,name:[{family:canary}],birthDate:canary,text:{status:'generated',div:`<div>${canary}</div>`},photo:[{url:`https://example.org/${canary}`,data:canary}],[canary]:null};
  const a=review(input);
  for(const output of [reportJSON(a),findingsCSV(a),JSON.stringify(operationOutcome(a)),reportHTML(a)]){
    assert.ok(!output.includes(canary));assert.ok(output.includes('PRV-001'));assert.match(output,/not full FHIR|Not full FHIR/i);
  }
});
test('JSON report round-trips findings, policy and fixed scope notice',()=>{
  const a=review(example('challenge')),parsed=JSON.parse(reportJSON(a));
  assert.deepEqual(parsed.findings,a.findings);assert.deepEqual(parsed.policy,a.policy);assert.match(parsed.reportNotice,/structural findings can still be sensitive/);
});
test('OperationOutcome uses R4 severities and codes with valid resource-level expressions',()=>{
  const a=review(example('challenge')),o=operationOutcome(a);
  assert.equal(o.resourceType,'OperationOutcome');assert.ok(o.issue.length>0);
  for(const i of o.issue){assert.ok(['fatal','error','warning','information'].includes(i.severity));assert.ok(typeof i.code==='string');for(const e of i.expression||[])assert.match(e,/^(?:\$this|Bundle(?:\.entry\[\d+\]\.resource)?)(?:\.contained\[\d+\])*$/);}
  assert.ok(o.issue.every(i=>i.severity!=='success'));
});
test('empty reports still disclose limited scope and OperationOutcome has at least one issue',()=>{
  const a=review({resourceType:'Patient'});assert.equal(a.findings.length,0);
  const o=operationOutcome(a);assert.ok(o.issue.length>=1);assert.equal(o.issue[0].severity,'information');assert.equal(o.issue[0].code,'informational');
  assert.match(reportHTML(a),/does not establish FHIR conformance/);assert.match(findingsCSV(a),/summary/);
});
test('truncated reviews are explicitly marked in every export',()=>{
  const a={...review({resourceType:'Patient'}),truncated:true};
  assert.equal(JSON.parse(reportJSON(a)).truncated,true);
  assert.match(findingsCSV(a),/Review truncated/);assert.match(reportHTML(a),/review is incomplete/);
  assert.ok(operationOutcome(a).issue.some(i=>i.severity==='warning'&&i.code==='incomplete'));
});
test('HTML export escapes data and is script-free with restrictive content security policy',()=>{
  const a=review(example('challenge'));
  a.findings[0].title='<img src=x onerror="alert(1)">';
  const html=reportHTML(a);assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));
  assert.ok(!/<script|<iframe|<object|<link/i.test(html));assert.ok(html.includes("default-src 'none'"));
});
test('CSV quotes commas, quotes and line breaks and neutralizes formula-leading text',()=>{
  const a=review(example('challenge'));a.findings=[{...a.findings[0],title:'=1+1',message:'line one, "quoted"\nline two'}];
  const csv=findingsCSV(a);assert.ok(csv.includes('"\'=1+1"'));assert.ok(csv.includes('"line one, ""quoted""\nline two"'));
});
