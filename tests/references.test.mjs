import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveReference,restIdentity,referencesAt} from '../app/references.mjs';
const rec=(alias,type,id,fullUrl,parent=null,versionId)=>({alias,resource:{resourceType:type,id,...(versionId?{meta:{versionId}}:{})},fullUrl,parent});
const a='https://example.org/fhir',b='https://other.example.org/fhir';

test('relative references resolve using the source server base, not just type/id',()=>{
  const source=rec('R001','Observation','o1',a+'/Observation/o1');
  const records=[source,rec('R002','Patient','p1',a+'/Patient/p1'),rec('R003','Patient','p1',b+'/Patient/p1')];
  assert.deepEqual(resolveReference('Patient/p1',source,records).targets,['R002']);
});
test('relative reference from URN or standalone source stays unresolved without a server base',()=>{
  const target=rec('R002','Patient','p1',a+'/Patient/p1');
  for(const fullUrl of [null,'urn:uuid:synthetic-observation'])assert.equal(resolveReference('Patient/p1',rec('R001','Observation','o1',fullUrl),[target]).status,'no-base');
});
test('missing URNs and contained references differ from unknown external existence',()=>{
  const source=rec('R001','Observation','o1',a+'/Observation/o1');
  assert.equal(resolveReference('urn:uuid:missing',source,[source]).status,'missing-internal');
  assert.equal(resolveReference('#missing',source,[source]).status,'missing-internal');
  assert.equal(resolveReference(a+'/Patient/missing',source,[source]).status,'not-in-bundle');
});
test('contained references are scoped to the containing resource and # points to the owner',()=>{
  const one=rec('R001','Observation','o1',a+'/Observation/o1'),two=rec('R003','Observation','o2',a+'/Observation/o2');
  const c1=rec('R002','Patient','local',null,'R001'),c2=rec('R004','Patient','local',null,'R003');
  const records=[one,c1,two,c2];
  assert.deepEqual(resolveReference('#local',one,records).targets,['R002']);
  assert.deepEqual(resolveReference('#local',c2,records).targets,['R004']);
  assert.deepEqual(resolveReference('#',c1,records).targets,['R001']);
  assert.equal(resolveReference('#',one,records).status,'missing-internal');
});
test('version references select meta.versionId; an unversioned match can be ambiguous',()=>{
  const source=rec('R001','Observation','o1',a+'/Observation/o1');
  const records=[source,rec('R002','Patient','p1',a+'/Patient/p1',null,'1'),rec('R003','Patient','p1',a+'/Patient/p1',null,'2')];
  assert.equal(resolveReference('Patient/p1',source,records).status,'ambiguous');
  assert.deepEqual(resolveReference('Patient/p1/_history/2',source,records).targets,['R003']);
  assert.deepEqual(resolveReference(a+'/Patient/p1/_history/1',source,records).targets,['R002']);
  assert.equal(resolveReference('Patient/p1/_history/3',source,records).status,'not-in-bundle');
});
test('malformed reference strings are not resolved or fetched',()=>{
  const source=rec('R001','Observation','o1',a+'/Observation/o1');
  for(const reference of ['',null,15,' Patient/p1','Patient/p1 extra','Patient','../Patient/p1'])assert.equal(resolveReference(reference,source,[]).status,'malformed');
});
test('REST identity rejects userinfo, search, fragments, and trailing slashes',()=>{
  assert.deepEqual(restIdentity(a+'/Patient/p1'),{base:a,type:'Patient',id:'p1'});
  for(const value of ['urn:uuid:x','https://name'+'@'+'example.org/fhir/Patient/p1',a+'/Patient/p1?x=y',a+'/Patient/p1#x',a+'/Patient/p1/'])assert.equal(restIdentity(value),null);
});
test('reference paths retain repeating ancestor indices',()=>{
  const r={diagnosis:[{condition:{reference:'Condition/a'}},{condition:{reference:'Condition/b'}}]};
  assert.deepEqual(referencesAt(r,'diagnosis.condition').map(x=>x.path),['diagnosis[0].condition','diagnosis[1].condition']);
});
test('malformed absolute URL and fragment references cannot be treated as local targets',()=>{
  const source=rec('R001','Observation','o1',a+'/Observation/o1');
  for(const reference of ['https:///Patient/p1','https://','https://example.org/Patient/p%ZZ','https://example.org/Patient/p\\1','#bad/id','#bad%20id'])assert.equal(resolveReference(reference,source,[]).status,'malformed',reference);
});
test('uppercase HTTP authority spelling still provides its original server base',()=>{
  const base='HTTPS://EXAMPLE.ORG/fhir';
  const source=rec('R001','Observation','o1',base+'/Observation/o1');
  const target=rec('R002','Patient','p1',base+'/Patient/p1');
  assert.deepEqual(resolveReference('Patient/p1',source,[source,target]).targets,['R002']);
});
