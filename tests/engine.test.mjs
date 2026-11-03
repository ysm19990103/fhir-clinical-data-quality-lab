import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze} from '../app/engine.mjs';
import {parseInput,ImportError} from '../app/parser.mjs';
import {LIMITS,RULES} from '../app/catalog.mjs';
const BASE='https://example.org/fhir';
const OPTIONS={reviewDate:'2026-11-03'};
const coded={coding:[{system:'http://loinc.org',code:'2345-7'}]};
const patient=(extra={})=>({resourceType:'Patient',id:'p1',...extra});
const observation=(extra={})=>({resourceType:'Observation',id:'o1',status:'final',code:structuredClone(coded),subject:{reference:'Patient/p1'},effectiveDateTime:'2024-02-01T12:00:00Z',valueQuantity:{value:5,system:'http://unitsofmeasure.org',code:'mmol/L',unit:'mmol/L'},...extra});
const bundle=(...resources)=>({resourceType:'Bundle',type:'collection',entry:resources.map(r=>({fullUrl:`${BASE}/${r.resourceType}/${r.id}`,resource:r}))});
const review=(input,options={})=>analyze(input,{...OPTIONS,...options});
const codes=a=>a.findings.map(f=>f.rule);
const has=(a,c)=>codes(a).includes(c);

test('minimal Patient and complete synthetic Observation have no structural errors',()=>{
  const a=review(bundle(patient(),observation()));
  assert.equal(a.counts.error,0);
  assert.equal(a.resources.length,2);
  assert.equal(a.links[0].target,'R001');
  assert.equal(a.rootKind,'Bundle');
  assert.equal(a.reviewDate,'2026-11-03');
});
test('findings and inventory never include imported values, identifiers, unknown keys or resource types',()=>{
  const canary='SYNTHETIC_SECRET_CANARY_82713';
  const r=patient({id:canary,birthDate:'2099-02-01',name:[{family:canary}],text:{status:'generated',div:`<div>${canary}</div>`},photo:[{data:canary}],meta:{profile:[canary]},[canary]:{[canary]:null}});
  const a=review(bundle(r,observation({subject:{reference:canary},valueString:canary})));
  const serialized=JSON.stringify(a);
  assert.ok(!serialized.includes(canary));
  assert.ok(has(a,'PRV-001'));assert.ok(has(a,'PRV-002'));assert.ok(has(a,'PRV-003'));
  assert.ok(a.findings.some(f=>f.path.includes('[field]')));
  assert.ok(a.resources.every(r=>/^R\d{3}$/.test(r.alias)));
  const unknown=review({resourceType:canary,id:canary,[canary]:null});
  assert.equal(unknown.resources[0].type,'Other');assert.ok(!JSON.stringify(unknown).includes(canary));
});
test('hostile resourceType values cannot access inherited registry properties or crash review',()=>{
  for(const resourceType of ['constructor','__proto__','toString','hasOwnProperty']){
    let result;assert.doesNotThrow(()=>{result=review(parseInput(JSON.stringify({resourceType,status:'final'})));},resourceType);
    assert.ok(has(result,'STR-002'));assert.equal(result.resources[0].type,'Other');
    assert.ok(result.findings.every(f=>typeof f.source==='string'));
  }
});
test('resource type and selected required fields are checked separately from local completeness',()=>{
  assert.ok(has(review({id:'example'}),'STR-001'));
  const a=review({resourceType:'Observation'},{completeness:false});
  assert.equal(a.findings.filter(f=>f.rule==='STR-003').length,2);
  assert.ok(!codes(a).some(c=>c.startsWith('DQ-')));
  assert.ok(!has(review({resourceType:'Condition',subject:{identifier:{value:'synthetic'}}}),'STR-003'));
});
test('unknown types expose generic limitations without claiming complete validation',()=>{
  const a=review({resourceType:'Device',id:'invalid id',meta:{lastUpdated:'2024'}});
  assert.ok(has(a,'STR-002'));assert.ok(has(a,'STR-009'));assert.ok(has(a,'STR-007'));
  assert.equal(a.coveredTypes,0);assert.match(a.scope,/not full FHIR/);
});
test('required primitive extension is retained as a coverage limit without a false missing-status error',()=>{
  const r=observation();delete r.status;r._status={extension:[{url:'https://example.org/absent',valueCode:'unknown'}]};
  const a=review(r);
  assert.ok(has(a,'STR-012'));
  assert.ok(!a.findings.some(f=>['STR-003','STR-005'].includes(f.rule)&&f.path.endsWith('.status')));
});
test('id-only primitive metadata cannot satisfy a missing required scalar',()=>{
  const r=observation();delete r.status;r._status={id:'metadata-id'};
  const a=review(r);assert.ok(a.findings.some(f=>f.rule==='STR-003'&&f.path.endsWith('.status')));
});
test('choice elements count false and zero values, but a value and its own metadata count once',()=>{
  assert.ok(has(review(observation({valueQuantity:undefined,valueBoolean:false,valueInteger:0})),'STR-006'));
  const r=observation();delete r.valueQuantity;r.valueBoolean=false;r._valueBoolean={id:'primitive-id'};
  assert.ok(!has(review(r),'STR-006'));
  assert.ok(has(review(patient({deceasedBoolean:false,deceasedDateTime:'2024'})),'STR-006'));
});
test('underscore metadata for a complex choice cannot replace a required medication choice',()=>{
  const a=review({resourceType:'MedicationRequest',status:'active',intent:'order',subject:{display:'Synthetic'},_medicationReference:{extension:[{url:'https://example.org/absent',valueCode:'unknown'}]}});
  assert.ok(a.findings.some(f=>f.rule==='STR-003'&&f.path.endsWith('medication[x]')));
});
test('Patient boolean and integer choices reject incompatible types and integer overflow',()=>{
  for(const extra of [{deceasedBoolean:'false'},{multipleBirthBoolean:0},{multipleBirthInteger:1.5},{multipleBirthInteger:2147483648}])assert.ok(has(review(patient(extra)),'STR-004'),JSON.stringify(extra));
});
test('Observation value and absent-data reason conflict, including component choices',()=>{
  const absent={coding:[{system:'http://terminology.hl7.org/CodeSystem/data-absent-reason',code:'unknown'}]};
  const a=review(observation({dataAbsentReason:absent,component:[{code:structuredClone(coded),valueInteger:0,dataAbsentReason:absent}]}));
  assert.equal(a.findings.filter(f=>f.rule==='OBS-001').length,2);
});
test('panel Observations with components or hasMember do not receive a missing-result policy finding',()=>{
  for(const extra of [{component:[{code:structuredClone(coded),valueInteger:2}]},{hasMember:[{reference:BASE+'/Observation/member'}]}]){
    const r=observation(extra);delete r.valueQuantity;assert.ok(!has(review(r),'DQ-003'));
  }
});
test('FHIR JSON empty values and unpaired nulls are rejected',()=>{
  const a=review(patient({name:[],gender:'',active:null,address:[null],meta:{}}));
  assert.ok(a.findings.filter(f=>f.rule==='STR-008').length>=5);
});
test('paired repeating primitive arrays permit meaningful null placeholders',()=>{
  const a=review(patient({name:[{given:[null,'Synthetic'],_given:[{extension:[{url:'https://example.org/absent',valueCode:'unknown'}]},null]}]}));
  assert.ok(!has(a,'STR-008'));
});
test('null placeholders cannot use an empty or id-only extension element without a scalar',()=>{
  for(const metadata of [{},{id:'metadata-id'}]){
    const a=review(patient({name:[{given:[null],_given:[metadata]}]}));
    assert.ok(has(a,'STR-008'));
  }
});
test('FHIR and local unit checks distinguish code/system invariants from optional policy',()=>{
  assert.ok(has(review(observation({valueQuantity:{value:5,code:'mmol/L'}})),'OBS-002'));
  assert.ok(has(review(observation({valueQuantity:{value:5,comparator:'='}})),'STR-005'));
  assert.ok(has(review(observation({valueQuantity:{value:5}})),'DQ-008'));
  assert.ok(!has(review(observation({valueQuantity:{value:5}}),{completeness:false}),'DQ-008'));
  assert.ok(has(review(observation({valueQuantity:{value:5,system:'http://unitsofmeasure.org',code:'mmol/L',unit:'mg/dL'}})),'DQ-007'));
});
test('mixed unit codes create review signals without modifying values',()=>{
  const source=bundle(patient(),observation(),observation({id:'o2',valueQuantity:{value:90,unit:'mg/dL',code:'mg/dL',system:'http://unitsofmeasure.org'}}));
  const before=JSON.stringify(source),a=review(source);
  assert.ok(has(a,'DQ-005'));assert.equal(JSON.stringify(source),before);
  assert.match(a.findings.find(f=>f.rule==='DQ-005').message,/not proof of incompatibility/);
  assert.ok(!has(review(source,{consistency:false}),'DQ-005'));
});
test('potential duplicate detection matches selected context and retains both resources',()=>{
  const a=review(bundle(patient(),observation(),observation({id:'o2'})));
  assert.ok(has(a,'DQ-006'));assert.equal(a.resources.length,3);
  assert.deepEqual(a.findings.find(f=>f.rule==='DQ-006').related,['R002']);
});
test('different period ends, comparators, methods and statuses do not falsely match exact selected context',()=>{
  const first=observation({effectivePeriod:{start:'2024-02-01',end:'2024-02-02'}});delete first.effectiveDateTime;
  const second=structuredClone(first);second.id='o2';second.effectivePeriod.end='2024-02-03';
  assert.ok(!has(review(bundle(patient(),first,second)),'DQ-006'));
  for(const extra of [{status:'amended'},{method:{coding:[{system:'https://example.org/method',code:'different'}]}},{valueQuantity:{value:5,system:'http://unitsofmeasure.org',code:'mmol/L',unit:'mmol/L',comparator:'<'}}])assert.ok(!has(review(bundle(patient(),observation(),observation({id:'o2',...extra}))),'DQ-006'));
});
test('separate versions of one fullUrl are not treated as duplicate identities or observations',()=>{
  const a=review(bundle(patient(),observation({meta:{versionId:'1'}}),observation({meta:{versionId:'2'}})));
  assert.ok(!has(a,'BND-005'));assert.ok(!has(a,'DQ-006'));
});
test('missing and ambiguous reference outcomes never choose a target',()=>{
  const p=patient(),a=review(bundle(p,structuredClone(p),observation()));
  assert.ok(has(a,'BND-005'));assert.ok(has(a,'REF-004'));assert.equal(a.links[0].target,null);
  const missing=review(bundle(observation({subject:{reference:'urn:uuid:11111111-1111-4111-8111-111111111111'}})));
  assert.ok(has(missing,'REF-002'));assert.equal(missing.links[0].target,null);
});
test('resolved and declared incompatible target types are reported',()=>{
  const enc={resourceType:'Encounter',id:'e1',status:'finished',class:{system:'http://terminology.hl7.org/CodeSystem/v3-ActCode',code:'AMB'}};
  assert.ok(has(review(bundle(enc,observation({subject:{reference:'Encounter/e1'}}))),'REF-005'));
  assert.ok(has(review(observation({subject:{type:'Encounter',identifier:{value:'synthetic'}}})),'REF-005'));
});
test('logical/display-only references are coverage limits and not malformed literals',()=>{
  const a=review(observation({subject:{identifier:{system:'https://example.org/id',value:'synthetic'}}}));
  assert.ok(has(a,'REF-006'));assert.ok(!has(a,'REF-001'));assert.equal(a.links[0].status,'nonliteral');
});
test('relative references from contained resources inherit their owner server base',()=>{
  const r=patient({contained:[observation()]});
  const a=review(bundle(r));
  const link=a.links.find(l=>l.source==='R002');assert.equal(link.status,'resolved');assert.equal(link.target,'R001');
});
test('partial dates avoid false birth/event chronology claims',()=>{
  const a=review(bundle(patient({birthDate:'2024'}),observation({effectiveDateTime:'2024-02-01T12:00:00Z'})));
  assert.ok(!has(a,'TIM-002'));
  const b=review(bundle(patient({birthDate:'2024'}),observation({effectiveDateTime:'2023-01-01T12:00:00Z'})));
  assert.ok(has(b,'TIM-002'));assert.ok(!has(review(bundle(patient({birthDate:'2024'}),observation({effectiveDateTime:'2023-01-01T12:00:00Z'})),{chronology:false}),'TIM-002'));
});
test('Period reversal is a structural temporal check and equal or overlapping bounds are accepted',()=>{
  for(const period of [{start:'2024-03',end:'2024-02'},{start:'2024-01-01T10:00:00Z',end:'2024-01-01T10:00:00+02:00'}])assert.ok(has(review({resourceType:'Encounter',status:'finished',class:{code:'AMB'},period},{chronology:false}),'TIM-001'));
  for(const period of [{start:'2024',end:'2024-02'},{start:'2024-01-01T10:00:00Z',end:'2024-01-01T10:00:00Z'}])assert.ok(!has(review({resourceType:'Encounter',status:'finished',class:{code:'AMB'},period}),'TIM-001'));
});
test('review date is a full UTC calendar date and future birth finding respects policy',()=>{
  assert.ok(has(review(patient({birthDate:'2099'})),'TIM-003'));
  assert.ok(!has(review(patient({birthDate:'2099'}),{chronology:false}),'TIM-003'));
  assert.match(review(patient(),{reviewDate:'2026'}).reviewDate,/^\d{4}-\d{2}-\d{2}$/);
});
test('syntactically valid but unmodeled timestamp precision is visible as a coverage limit',()=>{
  assert.ok(has(review(observation({effectiveDateTime:'2016-12-31T23:59:60Z'})),'TIM-004'));
});
test('collection/searchset wrapper rules and unsignedInt range are checked',()=>{
  const c=bundle(patient());c.total=1;c.entry[0].request={method:'GET'};c.entry[0].search={mode:'match'};
  assert.ok(review(c).findings.filter(f=>f.rule==='BND-006').length>=3);
  const s=bundle(patient());s.type='searchset';s.total=2147483647;assert.ok(!has(review(s),'STR-004'));
  s.total=2147483648;assert.ok(has(review(s),'STR-004'));
});
test('fullUrl requirements, identity mismatch and version-specific URLs are surfaced',()=>{
  const a=bundle(patient());delete a.entry[0].fullUrl;assert.ok(has(review(a),'BND-002'));
  a.entry[0].fullUrl=BASE+'/Patient/other';assert.ok(has(review(a),'BND-004'));
  a.entry[0].fullUrl=BASE+'/Patient/p1/_history/2';assert.ok(has(review(a),'BND-003'));
});
test('unsupported bundle workflows stop resource-specific review and disclose coverage limit',()=>{
  const a=review({resourceType:'Bundle',type:'transaction',entry:[{resource:observation()}]});
  assert.ok(has(a,'BND-001'));assert.equal(a.resources.length,0);
});
test('profile and modifier declarations do not silently imply successful interpretation',()=>{
  const a=review(patient({meta:{profile:['https://example.org/profile']},modifierExtension:[{url:'https://example.org/modifier',valueBoolean:true}]}));
  assert.ok(has(a,'STR-010'));assert.ok(has(a,'STR-011'));
});
test('resource limits reject oversized reviews and findings limits explicitly flag truncation',()=>{
  assert.throws(()=>review({resourceType:'Bundle',type:'collection',entry:Array.from({length:LIMITS.resources+1},(_,i)=>({fullUrl:`${BASE}/Patient/p${i}`,resource:patient({id:`p${i}`})}))}),e=>e instanceof ImportError&&e.code==='limit');
  const a=review(patient({name:Array(LIMITS.findings+1).fill(null)}));
  assert.equal(a.findings.length,LIMITS.findings);assert.equal(a.truncated,true);
});
test('counts agree with findings and every finding uses known fixed rule metadata',()=>{
  const a=review(bundle(patient({birthDate:'2099'}),observation({status:'invalid',valueQuantity:{code:'mmol/L'}})));
  for(const severity of ['error','warning','information'])assert.equal(a.counts[severity],a.findings.filter(f=>f.severity===severity).length);
  for(const finding of a.findings){assert.ok(RULES[finding.rule]);assert.equal(finding.message,RULES[finding.rule].message);assert.ok(!finding.expression.includes('[field]'));}
});
test('nonstring resourceType values and null metadata cannot crash registry access',()=>{
  for(const resourceType of [null,12,false,[],{}, {value:'synthetic'}]){
    const input=parseInput(JSON.stringify({resourceType,meta:null,status:'final'}));
    let a;assert.doesNotThrow(()=>{a=review(input);});assert.ok(has(a,'STR-001'));assert.equal(a.resources[0].type,'Other');
  }
});
test('nested contained resources are rejected explicitly instead of silently counted as checked',()=>{
  const a=review(patient({contained:[{resourceType:'Patient',id:'inner',contained:[{resourceType:'Patient',id:'nested'}]}]}));
  assert.ok(has(a,'STR-013'));assert.equal(a.resources.length,2);
});
test('malformed JSON field shapes across focused resources stay bounded and produce no raw-value output',()=>{
  const canary='SYNTHETIC_SHAPE_CANARY_67218';
  const base=[patient(),observation(),{resourceType:'Encounter',status:'finished',class:{code:'AMB'}},{resourceType:'Condition',subject:{display:canary}},{resourceType:'DiagnosticReport',status:'final',code:structuredClone(coded)},{resourceType:'MedicationRequest',status:'active',intent:'order',subject:{display:canary},medicationCodeableConcept:structuredClone(coded)}];
  const keys=['meta','subject','code','period','effectivePeriod','status','component','valueQuantity'];
  const values=[null,false,0,canary,[],{},[null],{coding:canary}];
  for(const r of base)for(const key of keys)for(const value of values){
    const parsed=parseInput(JSON.stringify({...r,[key]:value}));let a;
    assert.doesNotThrow(()=>{a=review(parsed);},`${r.resourceType}.${key}`);
    assert.ok(!JSON.stringify(a).includes(canary));
  }
});
