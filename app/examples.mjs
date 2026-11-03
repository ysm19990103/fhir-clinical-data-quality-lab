// Authored fixtures, never extracted from a patient record or private database.
export const EXAMPLES=Object.freeze({
  baseline:{title:'Baseline bundle',description:'Seven synthetic resources with linked subjects, coded concepts and explicit units.'},
  challenge:{title:'Quality challenge',description:'A deliberately flawed export: duplicate results, mixed units, broken links and incomplete records.'},
  references:{title:'Reference sandbox',description:'Contained resources, ambiguous versions and a relative reference without a server base.'},
  privacy:{title:'Privacy surfaces',description:'Synthetic text, demographics and an attachment exercise the value-free review boundary.'}
});
const base='https://example.org/fhir';
const code=c=>({coding:[{system:'https://example.org/fhir/CodeSystem/synthetic-lab',code:c}]});
const ref=(type,id)=>({reference:`${type}/${id}`});
const patient=()=>({resourceType:'Patient',id:'synthetic-patient',gender:'unknown',birthDate:'1990'});
const observation=(id='synthetic-result',extra={})=>({resourceType:'Observation',id,status:'final',code:code('analyte-a'),subject:ref('Patient','synthetic-patient'),encounter:ref('Encounter','synthetic-visit'),effectiveDateTime:'2026-01-15T09:00:00Z',valueQuantity:{value:5.2,unit:'mmol/L',system:'http://unitsofmeasure.org',code:'mmol/L'},...extra});
const entry=resource=>({fullUrl:`${base}/${resource.resourceType}/${resource.id}`,resource});
const bundle=resources=>({resourceType:'Bundle',type:'collection',entry:resources.map(entry)});
function baseline(){return bundle([
  patient(),
  {resourceType:'Encounter',id:'synthetic-visit',status:'finished',class:{system:'http://terminology.hl7.org/CodeSystem/v3-ActCode',code:'AMB'},subject:ref('Patient','synthetic-patient'),period:{start:'2026-01-15T08:45:00Z',end:'2026-01-15T10:00:00Z'}},
  observation(),
  observation('synthetic-second-result',{code:code('analyte-b'),valueQuantity:{value:140,unit:'mmol/L',system:'http://unitsofmeasure.org',code:'mmol/L'}}),
  {resourceType:'DiagnosticReport',id:'synthetic-report',status:'final',code:code('panel-a'),subject:ref('Patient','synthetic-patient'),effectiveDateTime:'2026-01-15T09:00:00Z',result:[ref('Observation','synthetic-result'),ref('Observation','synthetic-second-result')]},
  {resourceType:'Condition',id:'synthetic-condition',subject:ref('Patient','synthetic-patient'),code:code('training-condition'),recordedDate:'2026-01-15'},
  {resourceType:'MedicationRequest',id:'synthetic-order',status:'draft',intent:'proposal',subject:ref('Patient','synthetic-patient'),medicationCodeableConcept:code('training-medication'),authoredOn:'2026-01-15'}
]);}
function challenge(){
  const b=baseline();
  b.entry.push(entry(observation('synthetic-repeat')));
  b.entry.push(entry(observation('synthetic-mixed-units',{effectiveDateTime:'2026-01-16T09:00:00Z',valueQuantity:{value:94,unit:'mg/dL',system:'http://unitsofmeasure.org',code:'mg/dL'}})));
  b.entry.push(entry({resourceType:'Observation',id:'synthetic-incomplete',status:'final',code:{text:'Synthetic unmapped concept'},effectiveDateTime:'2026-02-30T09:00:00Z'}));
  b.entry[1].resource.period.end='2026-01-14T10:00:00Z';
  b.entry[4].resource.result.push(ref('Observation','synthetic-missing'));
  b.entry[6].resource.subject=ref('Observation','synthetic-result');
  b.entry[2].resource.dataAbsentReason=code('unknown');
  // Match the intentionally conflicting result too, so duplicate review remains visible.
  b.entry[7].resource.dataAbsentReason=code('unknown');
  return b;
}
function references(){
  const p1=patient();p1.meta={versionId:'1'};
  const p2=patient();p2.meta={versionId:'2'};
  const b=bundle([p1,p2,
    observation('synthetic-ambiguous',{encounter:undefined}),
    observation('synthetic-versioned',{subject:{reference:`${base}/Patient/synthetic-patient/_history/2`},encounter:undefined}),
    observation('synthetic-contained',{subject:{reference:'#local-patient'},contained:[{resourceType:'Patient',id:'local-patient',gender:'unknown'}],encounter:undefined}),
    observation('synthetic-no-base',{encounter:undefined})]);
  b.entry.at(-1).fullUrl='urn:uuid:00000000-0000-4000-8000-000000000006';
  return b;
}
function privacy(){return bundle([
  {...patient(),identifier:[{system:'https://example.org/synthetic-identifiers',value:'SYNTHETIC-ONLY'}],name:[{use:'usual',text:'Synthetic demonstration record'}],text:{status:'generated',div:'<div xmlns="http://www.w3.org/1999/xhtml">Synthetic narrative. Never rendered by the lab.</div>'},photo:[{contentType:'text/plain',data:'U1lOVEhFVElDLU9OTFk='}]},
  observation('synthetic-private-shape',{encounter:undefined,note:[{text:'Synthetic free text. Reports omit this content.'}]})
]);}
export function example(name){
  const factory={baseline,challenge,references,privacy};
  if(!Object.hasOwn(factory,name))throw new Error('Unknown synthetic example.');
  // JSON round trip removes optional undefined fields and returns a fresh fixture.
  return JSON.parse(JSON.stringify(factory[name]()));
}
