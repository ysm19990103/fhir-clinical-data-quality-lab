import {VERSION,FHIR_VERSION,RULESET,LIMITS,TYPES,RULES,STATUS_CODES,INTENTS,UCUM_TOKENS,DEFAULT_POLICY} from './catalog.mjs';
import {temporal,definitelyBefore} from './dates.mjs';
import {absoluteURI,restIdentity,resolveReference,REFERENCE_FIELDS,referencesAt} from './references.mjs';
import {ImportError} from './parser.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const has=(o,k)=>Object.hasOwn(o,k);
const nonempty=v=>typeof v==='string'&&v.length>0;
const extensionValue=v=>object(v)&&Array.isArray(v.extension)&&v.extension.some(e=>object(e)&&nonempty(e.url));
const PRIMITIVES=new Set(('status intent type code system birthDate deceasedBoolean deceasedDateTime multipleBirthBoolean multipleBirthInteger effectiveDateTime effectiveInstant onsetDateTime onsetString abatementDateTime abatementString valueString valueBoolean valueInteger valueTime valueDateTime').split(' '));
const present=(o,k)=>has(o,k)||(PRIMITIVES.has(k)&&extensionValue(o['_'+k]));
const safeType=t=>TYPES.includes(t)?t:t==='Bundle'?'Bundle':'Other';
const SAFE_KEYS=new Set(('resourceType id meta versionId lastUpdated profile implicitRules language text status div contained extension modifierExtension url valueString valueBoolean valueInteger valueDecimal valueDateTime valueTime valuePeriod valueQuantity valueCodeableConcept valueRange valueRatio valueSampledData valueAttachment valueReference identifier name given family prefix suffix use telecom system value code display address line city district state postalCode country contact birthDate deceasedBoolean deceasedDateTime gender active multipleBirthBoolean multipleBirthInteger photo period start end effectiveDateTime effectivePeriod effectiveTiming effectiveInstant issued component dataAbsentReason interpretation referenceRange low high comparator subject encounter performer focus specimen device hasMember derivedFrom coding category class intent medicationReference medicationCodeableConcept authoredOn recorder requester reasonReference priorPrescription statusHistory classHistory participant individual location diagnosis condition serviceProvider partOf onsetDateTime onsetAge onsetPeriod onsetRange onsetString abatementDateTime abatementAge abatementPeriod abatementRange abatementString clinicalStatus verificationStatus severity bodySite recordedDate asserter evidence detail result resultsInterpreter imagingStudy media link presentedForm conclusion conclusionCode note authorString time attachment data contentType title hash size creation type generalPractitioner managingOrganization other basedOn').split(' '));
const safeKey=k=>SAFE_KEYS.has(k)?k:k.startsWith('_')&&SAFE_KEYS.has(k.slice(1))?k:'[field]';
const shape=v=>Array.isArray(v)?`array (${v.length})`:v===null?'null':typeof v;
const valueChoices=['valueQuantity','valueCodeableConcept','valueString','valueBoolean','valueInteger','valueRange','valueRatio','valueSampledData','valueTime','valueDateTime','valuePeriod'];
const effectiveChoices=['effectiveDateTime','effectivePeriod','effectiveTiming','effectiveInstant'];
const sourceFor={Patient:'patient',Observation:'observation',Encounter:'encounter',Condition:'condition',DiagnosticReport:'report',MedicationRequest:'medication',Bundle:'bundle'};
const typedFields={
  Patient:{birthDate:'string',gender:'string',active:'boolean',deceasedBoolean:'boolean',multipleBirthBoolean:'boolean',multipleBirthInteger:'number',name:'array',identifier:'array',address:'array',telecom:'array'},
  Observation:{code:'object',subject:'object',encounter:'object',component:'array',hasMember:'array',dataAbsentReason:'object',effectivePeriod:'object',valueQuantity:'object'},
  Encounter:{class:'object',subject:'object',period:'object',statusHistory:'array',diagnosis:'array'},
  Condition:{subject:'object',code:'object',clinicalStatus:'object',verificationStatus:'object',onsetPeriod:'object',abatementPeriod:'object'},
  DiagnosticReport:{code:'object',subject:'object',result:'array',effectivePeriod:'object'},
  MedicationRequest:{subject:'object',medicationCodeableConcept:'object',medicationReference:'object',intent:'string'}
};
export function analyze(input,options={}){
  if(!object(input))throw new ImportError('shape','The root must be a resource object.');
  const policy={...DEFAULT_POLICY};for(const k of Object.keys(policy))if(typeof options[k]==='boolean')policy[k]=options[k];
  const reviewDate=typeof options.reviewDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(options.reviewDate)&&temporal(options.reviewDate,'date').valid?options.reviewDate:new Date().toISOString().slice(0,10);
  const findings=[],records=[],links=[];let truncated=false,walkCount=0;
  const root={alias:input.resourceType==='Bundle'?'B000':'R001',resource:input,path:input.resourceType==='Bundle'?'Bundle':'Resource',expression:input.resourceType==='Bundle'?'Bundle':'$this',fullUrl:null,parent:null};
  function add(code,rec,path='',related=[]){
    if(findings.length>=LIMITS.findings){truncated=true;return;}
    const rule=RULES[code];
    const location=rec.path+(path?'.'+path:'');
    if(findings.some(f=>f.rule===code&&f.resource===rec.alias&&f.path===location&&f.related.join()===related.join()))return;
    findings.push({id:`F${String(findings.length+1).padStart(4,'0')}`,rule:code,resource:rec.alias,resourceType:safeType(rec.resource?.resourceType),path:location,expression:rec.expression,related:[...related],...rule,source:code==='STR-003'||code==='STR-005'?(has(sourceFor,rec.resource?.resourceType)?sourceFor[rec.resource.resourceType]:rule.source):rule.source});
  }
  function collect(resource,path,expression,fullUrl,parent=null){
    if(records.length>=LIMITS.resources)throw new ImportError('limit','More than 500 resources, including contained resources, are outside this lab’s limit.');
    const rec={alias:`R${String(records.length+1).padStart(3,'0')}`,resource,path,expression,fullUrl,parent};records.push(rec);
    if(Array.isArray(resource.contained))resource.contained.forEach((r,i)=>{
      if(!object(r)){add('STR-004',rec,`contained[${i}]`);return;}
      if(parent){add('STR-013',rec,`contained[${i}]`);return;}
      collect(r,`${path}.contained[${i}]`,`${expression}.contained[${i}]`,null,rec.alias);
    });
    else if(has(resource,'contained'))add('STR-004',rec,'contained');
    return rec;
  }
  if(input.resourceType==='Bundle'){
    if(!present(input,'type'))add('STR-003',root,'type');
    if(!['collection','searchset'].includes(input.type)){
      add('BND-001',root,'type');
      scan(input,root);return output();
    }
    if(has(input,'entry')&&!Array.isArray(input.entry))add('STR-004',root,'entry');
    if(input.type==='collection'&&has(input,'total'))add('BND-006',root,'total');
    if(input.type==='searchset'&&has(input,'total')&&(!Number.isInteger(input.total)||input.total<0||input.total>2147483647))add('STR-004',root,'total');
    const entries=Array.isArray(input.entry)?input.entry:[];
    if(entries.length>LIMITS.resources)throw new ImportError('limit','More than 500 entries are outside this lab’s limit.');
    entries.forEach((entry,i)=>{
      const path=`entry[${i}]`;
      if(!object(entry)){add('STR-004',root,path);return;}
      for(const k of ['request','response'])if(has(entry,k))add('BND-006',root,`${path}.${k}`);
      if(input.type==='collection'&&has(entry,'search'))add('BND-006',root,`${path}.search`);
      if(!object(entry.resource)){add('STR-003',root,`${path}.resource`);return;}
      const rec=collect(entry.resource,`Bundle.${path}.resource`,`Bundle.${path}.resource`,entry.fullUrl);
      if(!nonempty(entry.fullUrl))add('BND-002',rec,'[entry].fullUrl');
      else if(!absoluteURI(entry.fullUrl)||entry.fullUrl.includes('/_history/'))add('BND-003',rec,'[entry].fullUrl');
      const identity=restIdentity(entry.fullUrl);
      if(identity&&(identity.type!==entry.resource.resourceType||(nonempty(entry.resource.id)&&identity.id!==entry.resource.id)))add('BND-004',rec,'id');
    });
    const seen=new Map();for(const rec of records.filter(r=>!r.parent&&nonempty(r.fullUrl))){const key=JSON.stringify([rec.fullUrl,rec.resource.meta?.versionId??null]);if(seen.has(key))add('BND-005',rec,'[entry].fullUrl',[seen.get(key)]);else seen.set(key,rec.alias);}
    // Bundle wrapper is checked separately; source resources are scanned below.
    const wrapper={...input};delete wrapper.entry;scan(wrapper,root);
  }else collect(input,'Resource','$this',null);
  for(const rec of records){scan(rec.resource,rec);checkResource(rec);}
  for(const rec of records)checkReferences(rec);
  if(policy.chronology)checkChronology();
  if(policy.consistency)checkConsistency();
  return output();

  function scan(resource,rec){
    const privacy=new Set();
    function walk(value,path,depth,parent=null,key=null){
      if(++walkCount>LIMITS.nodes*2||depth>LIMITS.depth)throw new ImportError('limit','The review traversal exceeds local limits.');
      if(value===null){add('STR-008',rec,path);return;}
      if(typeof value==='string'){if(value==='')add('STR-008',rec,path);return;}
      if(Array.isArray(value)){
        if(value.length===0)add('STR-008',rec,path);
        value.forEach((item,i)=>{
          if(item===null){
            const counterpart=parent&&typeof key==='string'?parent[key.startsWith('_')?key.slice(1):'_'+key]:null;
            const other=Array.isArray(counterpart)?counterpart[i]:undefined;
            const isPrimitive=x=>x!==null&&['string','number','boolean'].includes(typeof x);
            const paired=key?.startsWith('_')?isPrimitive(other):extensionValue(other)&&value.every(x=>x===null||isPrimitive(x));
            if(!paired)add('STR-008',rec,`${path}[${i}]`);
          }else walk(item,`${path}[${i}]`,depth+1);
        });return;
      }
      if(!object(value))return;
      if(Object.keys(value).length===0)add('STR-008',rec,path);
      for(const [k,v] of Object.entries(value)){
        if(k==='contained'&&value===resource)continue;
        const at=path?`${path}.${safeKey(k)}`:safeKey(k);
        if(['identifier','name','telecom','address','contact','birthDate'].includes(k))privacy.add('PRV-001');
        if(['text','div','note','display','description','conclusion','authorString'].includes(k))privacy.add('PRV-002');
        if(['photo','presentedForm','attachment','data'].includes(k))privacy.add('PRV-003');
        if(k==='modifierExtension'||k==='implicitRules')add('STR-010',rec,at);
        if(k==='profile'&&path==='meta')add('STR-011',rec,at);
        walk(v,at,depth+1,value,k);
      }
    }
    walk(resource,'',0);for(const code of privacy)add(code,rec);
  }
  function requireField(rec,key,kind='object'){
    const r=rec.resource;
    if(!present(r,key)){add('STR-003',rec,key);return;}
    if(!has(r,key)&&extensionValue(r['_'+key])){if(kind==='string')add('STR-012',rec,'_'+key);else add('STR-003',rec,key);return;}
    const valid=kind==='object'?object(r[key]):typeof r[key]===kind;
    if(!valid)add('STR-004',rec,key);
  }
  function checkChoice(o,names,rec,path='',required=false){
    const parentPath=path.includes('.')?path.slice(0,path.lastIndexOf('.')+1):'';
    for(const k of names)if(!PRIMITIVES.has(k)&&has(o,'_'+k))add('STR-004',rec,parentPath+'_'+k);
    const active=names.filter(k=>present(o,k));
    if(active.length>1)add('STR-006',rec,path||names[0].replace(/[A-Z].*$/,'')+'[x]');
    if(required&&!active.length)add('STR-003',rec,path||'medication[x]');
    return active;
  }
  function checkDate(o,key,type,rec,path=key){
    if(!has(o,key))return;
    const t=temporal(o[key],type);if(!t.valid)add('STR-007',rec,path);else if(!t.bounds&&type!=='time')add('TIM-004',rec,path);
  }
  function checkPeriod(p,rec,path){
    if(!object(p)){add('STR-004',rec,path);return;}
    checkDate(p,'start','dateTime',rec,path+'.start');checkDate(p,'end','dateTime',rec,path+'.end');
    if(definitelyBefore(temporal(p.end),temporal(p.start)))add('TIM-001',rec,path);
  }
  function concept(cc,rec,path){
    if(!object(cc))return;
    if(has(cc,'coding')&&!Array.isArray(cc.coding)){add('STR-004',rec,path+'.coding');return;}
    if(policy.completeness&&!(cc.coding||[]).some(c=>object(c)&&nonempty(c.system)&&nonempty(c.code)))add('DQ-004',rec,path);
    for(const [i,c] of (cc.coding||[]).entries())if(!object(c)||['system','code','display'].some(k=>has(c,k)&&typeof c[k]!=='string'))add('STR-004',rec,`${path}.coding[${i}]`);
  }
  function quantity(q,rec,path){
    if(!object(q)){add('STR-004',rec,path);return;}
    if(has(q,'value')&&(typeof q.value!=='number'||!Number.isFinite(q.value)))add('STR-004',rec,path+'.value');
    for(const k of ['unit','system','code','comparator'])if(has(q,k)&&typeof q[k]!=='string')add('STR-004',rec,path+'.'+k);
    if(present(q,'code')&&!present(q,'system'))add('OBS-002',rec,path+'.system');
    if(has(q,'comparator')&&!['<','<=','>=','>'].includes(q.comparator))add('STR-005',rec,path+'.comparator');
    if(policy.completeness&&typeof q.value==='number'&&!nonempty(q.unit)&&!(nonempty(q.system)&&nonempty(q.code)))add('DQ-008',rec,path);
    if(policy.consistency&&q.system==='http://unitsofmeasure.org'&&UCUM_TOKENS.has(q.unit)&&UCUM_TOKENS.has(q.code)&&q.unit!==q.code)add('DQ-007',rec,path+'.unit');
  }
  function checkedValue(o,rec,path=''){
    const choices=checkChoice(o,valueChoices,rec,path?path+'.value[x]':'value[x]');
    if(choices.length&&present(o,'dataAbsentReason'))add('OBS-001',rec,path?path+'.dataAbsentReason':'dataAbsentReason');
    for(const key of choices){
      const v=o[key],at=path?path+'.'+key:key;if(!has(o,key))continue;
      const expected=key==='valueBoolean'?'boolean':key==='valueInteger'?'number':['valueString','valueDateTime','valueTime'].includes(key)?'string':'object';
      if(expected==='object'?!object(v):typeof v!==expected)add('STR-004',rec,at);
      if(key==='valueInteger'&&(!Number.isInteger(v)||v< -2147483648||v>2147483647))add('STR-004',rec,at);
      if(key==='valueQuantity')quantity(v,rec,at);
      if(key==='valuePeriod')checkPeriod(v,rec,at);
      if(key==='valueCodeableConcept')concept(v,rec,at);
      if(key==='valueDateTime'||key==='valueTime')checkDate(o,key,key==='valueTime'?'time':'dateTime',rec,at);
    }
  }
  function checkResource(rec){
    const r=rec.resource,t=r.resourceType;
    if(!nonempty(t)){add('STR-001',rec,'resourceType');return;}
    if(!TYPES.includes(t))add('STR-002',rec,'resourceType');
    if(has(r,'id')&&(typeof r.id!=='string'||!/^[A-Za-z0-9.-]{1,64}$/.test(r.id)))add('STR-009',rec,'id');
    if(object(r.meta))checkDate(r.meta,'lastUpdated','instant',rec,'meta.lastUpdated');
    if(!TYPES.includes(t))return;
    for(const [key,expected] of Object.entries(typedFields[t]||{})){
      if(['array','object'].includes(expected)&&has(r,'_'+key))add('STR-004',rec,'_'+key);
      if(!has(r,key))continue;
      const valid=expected==='array'?Array.isArray(r[key]):expected==='object'?object(r[key]):typeof r[key]===expected;
      if(!valid)add('STR-004',rec,key);
    }
    if(STATUS_CODES[t]){requireField(rec,'status','string');if(has(r,'status')&&!STATUS_CODES[t].includes(r.status))add('STR-005',rec,'status');}
    if(['Observation','DiagnosticReport'].includes(t))requireField(rec,'code');
    if(['Condition','MedicationRequest'].includes(t))requireField(rec,'subject');
    if(t==='Encounter')requireField(rec,'class');
    if(t==='MedicationRequest'){
      requireField(rec,'intent','string');if(has(r,'intent')&&!INTENTS.includes(r.intent))add('STR-005',rec,'intent');
      checkChoice(r,['medicationCodeableConcept','medicationReference'],rec,'medication[x]',true);
      checkDate(r,'authoredOn','dateTime',rec);
      if(object(r.medicationCodeableConcept))concept(r.medicationCodeableConcept,rec,'medicationCodeableConcept');
    }
    if(t==='Patient'){
      checkDate(r,'birthDate','date',rec);checkDate(r,'deceasedDateTime','dateTime',rec);
      checkChoice(r,['deceasedBoolean','deceasedDateTime'],rec,'deceased[x]');checkChoice(r,['multipleBirthBoolean','multipleBirthInteger'],rec,'multipleBirth[x]');
      if(has(r,'multipleBirthInteger')&&(!Number.isInteger(r.multipleBirthInteger)||r.multipleBirthInteger< -2147483648||r.multipleBirthInteger>2147483647))add('STR-004',rec,'multipleBirthInteger');
      if(has(r,'gender')&&!['male','female','other','unknown'].includes(r.gender))add('STR-005',rec,'gender');
      if(policy.chronology&&definitelyBefore(temporal(reviewDate,'date'),temporal(r.birthDate,'date')))add('TIM-003',rec,'birthDate');
    }
    if(t==='Condition'){
      checkChoice(r,['onsetDateTime','onsetAge','onsetPeriod','onsetRange','onsetString'],rec,'onset[x]');
      checkChoice(r,['abatementDateTime','abatementAge','abatementPeriod','abatementRange','abatementString'],rec,'abatement[x]');
      for(const k of ['onsetDateTime','abatementDateTime','recordedDate'])checkDate(r,k,'dateTime',rec);
    }
    if(['Observation','DiagnosticReport'].includes(t)){
      checkChoice(r,t==='Observation'?effectiveChoices:['effectiveDateTime','effectivePeriod'],rec,'effective[x]');
      checkDate(r,'effectiveDateTime','dateTime',rec);checkDate(r,'effectiveInstant','instant',rec);checkDate(r,'issued','instant',rec);
    }
    for(const k of ['period','effectivePeriod','onsetPeriod','abatementPeriod'])if(has(r,k))checkPeriod(r[k],rec,k);
    if(has(r,'code'))concept(r.code,rec,'code');
    if(t==='Observation'){
      checkedValue(r,rec);
      if(Array.isArray(r.component))r.component.forEach((c,i)=>{if(!object(c)){add('STR-004',rec,`component[${i}]`);return;}if(!object(c.code))add('STR-003',rec,`component[${i}].code`);else concept(c.code,rec,`component[${i}].code`);checkedValue(c,rec,`component[${i}]`);});
      if(policy.completeness&&['final','amended','corrected'].includes(r.status)&&!valueChoices.some(k=>present(r,k))&&!present(r,'dataAbsentReason')&&!(Array.isArray(r.component)&&r.component.length)&&!(Array.isArray(r.hasMember)&&r.hasMember.length))add('DQ-003',rec,'value[x]');
    }
    if(policy.completeness&&['Observation','DiagnosticReport','Encounter'].includes(t)&&!present(r,'subject'))add('DQ-001',rec,'subject');
    if(policy.completeness&&['Observation','DiagnosticReport'].includes(t)&&!effectiveChoices.some(k=>present(r,k)))add('DQ-002',rec,'effective[x]');
    if(policy.completeness&&t==='Encounter'&&!present(r,'period'))add('DQ-002',rec,'period');
  }
  function checkReferences(rec){
    for(const [field,allowed] of Object.entries(typeof rec.resource.resourceType==='string'&&has(REFERENCE_FIELDS,rec.resource.resourceType)?REFERENCE_FIELDS[rec.resource.resourceType]:{}))for(const ref of referencesAt(rec.resource,field)){
      const obj=ref.value;
      if(!object(obj)){add('REF-001',rec,ref.path);continue;}
      if(has(obj,'type')&&typeof obj.type!=='string'){add('REF-001',rec,ref.path+'.type');continue;}
      const declared=typeof obj.type==='string'?obj.type.split('/').at(-1):null;
      if(declared&&allowed.length&&!allowed.includes(declared))add('REF-005',rec,ref.path+'.type');
      if(!has(obj,'reference')){
        if(object(obj.identifier)||nonempty(obj.display)||extensionValue(obj._reference)||Array.isArray(obj.extension))add('REF-006',rec,ref.path);
        else add('REF-001',rec,ref.path);
        links.push({source:rec.alias,target:null,status:'nonliteral',kind:'logical',path:ref.path});continue;
      }
      const resolved=resolveReference(obj.reference,rec,records);
      const code={malformed:'REF-001','missing-internal':'REF-002','not-in-bundle':'REF-003',ambiguous:'REF-004','no-base':'REF-007'}[resolved.status];
      if(code)add(code,rec,ref.path,resolved.targets);
      const target=resolved.status==='resolved'?records.find(r=>r.alias===resolved.targets[0]):null;
      if(target&&((allowed.length&&!allowed.includes(target.resource.resourceType))||(declared&&declared!==target.resource.resourceType)))add('REF-005',rec,ref.path,[target.alias]);
      links.push({source:rec.alias,target:target?.alias||null,status:resolved.status,kind:resolved.kind||'literal',path:ref.path});
    }
  }
  function eventTime(r){return r.effectiveDateTime||r.effectiveInstant||r.effectivePeriod?.start||r.period?.start||r.onsetDateTime||r.onsetPeriod?.start||r.authoredOn;}
  function checkChronology(){
    for(const rec of records){
      if(!object(rec.resource.subject)||typeof rec.resource.subject.reference!=='string')continue;
      const link=resolveReference(rec.resource.subject.reference,rec,records);if(link.status!=='resolved')continue;
      const patient=records.find(r=>r.alias===link.targets[0]);if(patient?.resource.resourceType!=='Patient')continue;
      if(definitelyBefore(temporal(eventTime(rec.resource)),temporal(patient.resource.birthDate,'date')))add('TIM-002',rec,'[clinical-time]',[patient.alias]);
    }
  }
  function checkConsistency(){
    const unitGroups=new Map(),duplicates=new Map();
    for(const rec of records){
      const r=rec.resource;if(r.resourceType!=='Observation'||['entered-in-error','cancelled'].includes(r.status))continue;
      const codings=Array.isArray(r.code?.coding)?r.code.coding.filter(c=>object(c)&&nonempty(c.system)&&nonempty(c.code)):[];
      const coded=codings.map(c=>JSON.stringify([c.system,c.code])).sort();
      if(!coded.length)continue;
      const q=r.valueQuantity;
      if(object(q)&&nonempty(q.system)&&nonempty(q.code))for(const code of coded){const items=unitGroups.get(code)||[];items.push({rec,unit:JSON.stringify([q.system,q.code])});unitGroups.set(code,items);}
      const literal=r.subject?.reference;if(typeof literal!=='string')continue;
      const subject=resolveReference(literal,rec,records);if(subject.status!=='resolved')continue;
      const choices=valueChoices.filter(k=>has(r,k));
      const times=effectiveChoices.filter(k=>has(r,k));
      if(choices.length!==1||times.length!==1)continue;
      const value=r[choices[0]];
      // Deliberately conservative: exact selected fields; comparator and context are retained.
      const key=canonical([subject.targets[0],coded,r.status,times[0],r[times[0]],choices[0],value,r.specimen??null,r.method??null,r.bodySite??null,r.encounter??null,r.component??null,r.dataAbsentReason??null]);
      const prior=duplicates.get(key);
      if(prior&&!(rec.fullUrl&&rec.fullUrl===prior.fullUrl))add('DQ-006',rec,'[comparison-fields]',[prior.alias]);else if(!prior)duplicates.set(key,rec);
    }
    for(const items of unitGroups.values())if(new Set(items.map(i=>i.unit)).size>1){const first=items[0].rec;add('DQ-005',first,'valueQuantity',[...new Set(items.slice(1).map(i=>i.rec.alias))]);}
  }
  function output(){
    const resourceSummary=records.map(rec=>({alias:rec.alias,type:safeType(rec.resource.resourceType),supported:TYPES.includes(rec.resource.resourceType),contained:Boolean(rec.parent),path:rec.path,fields:Object.keys(rec.resource).filter(k=>SAFE_KEYS.has(k)).map(k=>({field:k,shape:shape(rec.resource[k])})),findingCount:findings.filter(f=>f.resource===rec.alias).length}));
    const counts={error:0,warning:0,information:0};for(const f of findings)counts[f.severity]++;
    return {schema:'fhir-quality-report.v1',version:VERSION,fhirVersion:FHIR_VERSION,ruleset:RULESET,reviewDate,policy,scope:'Focused R4 subset and local quality rules; not full FHIR or profile validation.',counts,resources:resourceSummary,links,findings,truncated,coveredTypes:resourceSummary.filter(r=>r.supported).length,rootKind:input.resourceType==='Bundle'?'Bundle':'Resource'};
  }
}
function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(object(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
