const ID=/^[A-Za-z0-9.-]{1,64}$/;
export function restIdentity(uri){
  if(typeof uri!=='string'||!/^https?:\/\//i.test(uri))return null;
  let url;try{url=new URL(uri);}catch{return null;}
  if(url.search||url.hash||url.username||url.password||uri.endsWith('/'))return null;
  const last=uri.lastIndexOf('/'),previous=uri.lastIndexOf('/',last-1);
  const type=uri.slice(previous+1,last),id=uri.slice(last+1),base=uri.slice(0,previous);
  if(!/^[A-Z][A-Za-z0-9]+$/.test(type)||!ID.test(id)||!url.hostname)return null;
  return {base,type,id};
}
export function absoluteURI(value){
  if(typeof value!=='string'||! /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$/.test(value)||/[\u0000-\u0020<>"{}|\\^`]/.test(value)||/%(?![0-9a-f]{2})/i.test(value))return false;
  if(/^https?:/i.test(value)){
    if(!/^https?:\/\/[^/?#]+/i.test(value))return false;
    try{return Boolean(new URL(value).hostname);}catch{return false;}
  }
  return true;
}
export function resolveReference(reference,source,records){
  if(typeof reference!=='string'||!reference||/\s/.test(reference))return {status:'malformed',targets:[]};
  if(reference.startsWith('#')){
    if(reference!=='#'&&!ID.test(reference.slice(1)))return {status:'malformed',targets:[]};
    const owner=source.parent||source.alias;
    const candidates=reference==='#'?(source.parent?records.filter(r=>r.alias===source.parent):[]):records.filter(r=>r.parent===owner&&r.resource.id===reference.slice(1));
    return finish(candidates,'contained','missing-internal');
  }
  let uri=reference,version=null;
  const history=uri.match(/\/_history\/([A-Za-z0-9.-]{1,64})$/);
  if(history){version=history[1];uri=uri.slice(0,history.index);}
  if(!absoluteURI(uri)){
    if(!/^[A-Z][A-Za-z0-9]+\/[A-Za-z0-9.-]{1,64}$/.test(uri))return {status:'malformed',targets:[]};
    // A contained resource resolves external references in its container's entry context.
    const context=source.parent?records.find(r=>r.alias===source.parent):source;
    const base=restIdentity(context?.fullUrl)?.base;
    if(!base)return {status:'no-base',targets:[]};
    uri=base+'/'+uri;
  }
  const candidates=records.filter(r=>!r.parent&&r.fullUrl===uri&&(version===null||r.resource.meta?.versionId===version));
  return finish(candidates,version===null?'literal':'versioned',uri.startsWith('urn:')?'missing-internal':'not-in-bundle');
}
function finish(candidates,kind,empty){return {status:candidates.length===1?'resolved':candidates.length>1?'ambiguous':empty,kind,targets:candidates.map(r=>r.alias)};}
export const REFERENCE_FIELDS={
  Patient:{generalPractitioner:['Practitioner','Organization','PractitionerRole'],managingOrganization:['Organization'],'link.other':['Patient','RelatedPerson']},
  Observation:{subject:['Patient','Group','Device','Location'],encounter:['Encounter'],performer:['Practitioner','PractitionerRole','Organization','CareTeam','Patient','RelatedPerson'],specimen:['Specimen'],device:['Device','DeviceMetric'],hasMember:['Observation','QuestionnaireResponse','MolecularSequence'],derivedFrom:['DocumentReference','ImagingStudy','Media','QuestionnaireResponse','Observation','MolecularSequence'],focus:[]},
  Encounter:{subject:['Patient','Group'],partOf:['Encounter'],serviceProvider:['Organization'],'diagnosis.condition':['Condition','Procedure'],'participant.individual':['Practitioner','PractitionerRole','RelatedPerson'],'location.location':['Location']},
  Condition:{subject:['Patient','Group'],encounter:['Encounter'],recorder:['Practitioner','PractitionerRole','Patient','RelatedPerson'],asserter:['Practitioner','PractitionerRole','Patient','RelatedPerson'],'evidence.detail':[]},
  DiagnosticReport:{subject:['Patient','Group','Device','Location'],encounter:['Encounter'],result:['Observation'],specimen:['Specimen'],performer:['Practitioner','PractitionerRole','Organization','CareTeam'],resultsInterpreter:['Practitioner','PractitionerRole','Organization','CareTeam'],imagingStudy:['ImagingStudy'],'media.link':['Media']},
  MedicationRequest:{subject:['Patient','Group'],encounter:['Encounter'],medicationReference:['Medication'],requester:['Practitioner','PractitionerRole','Organization','Patient','RelatedPerson','Device'],performer:['Practitioner','PractitionerRole','Organization','Patient','Device','RelatedPerson','CareTeam'],recorder:['Practitioner','PractitionerRole'],reasonReference:['Condition','Observation'],priorPrescription:['MedicationRequest']}
};
// Repeating ancestors are traversed without reordering their arrays.
export function referencesAt(resource,path){
  const out=[],parts=path.split('.');
  function walk(value,index,location){
    if(Array.isArray(value)){value.forEach((item,i)=>walk(item,index,`${location}[${i}]`));return;}
    if(index===parts.length){if(value!==undefined)out.push({value,path:location});return;}
    if(value&&typeof value==='object')walk(value[parts[index]],index+1,location?`${location}.${parts[index]}`:parts[index]);
  }
  walk(resource,0,'');return out;
}
