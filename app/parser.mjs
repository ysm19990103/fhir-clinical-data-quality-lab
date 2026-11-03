import { LIMITS } from './catalog.mjs';
export class ImportError extends Error {
  constructor(code,message,offset=null){super(message);this.name='ImportError';this.code=code;this.offset=offset;}
}
// A bounded JSON reader detects duplicate decoded keys before they can be overwritten.
// Errors contain positions and fixed messages, never input excerpts or filenames.
export function parseInput(text) {
  if(typeof text!=='string') throw new ImportError('input','Expected JSON text.');
  if(new TextEncoder().encode(text).length>LIMITS.bytes) throw new ImportError('limit','Input exceeds the 2 MiB limit.');
  if(text.charCodeAt(0)===0xfeff)text=text.slice(1);
  let i=0,nodes=0;
  const fail=(code,message)=>{throw new ImportError(code,message,i);};
  const space=()=>{while(/[\t\r\n ]/.test(text[i]||'~'))i++;};
  const string=()=>{
    const start=i++;let escaped=false;
    while(i<text.length){const ch=text[i++];if(ch==='"'&&!escaped){let result;try{result=JSON.parse(text.slice(start,i));}catch{fail('syntax','Invalid JSON string.');}if(result.length>LIMITS.string)fail('limit','A string exceeds the local parser limit.');return result;}if(ch==='\\'&&!escaped)escaped=true;else escaped=false;}
    fail('syntax','Unterminated JSON string.');
  };
  function value(depth){
    if(depth>LIMITS.depth)fail('limit','Input nesting exceeds the local depth limit.');
    if(++nodes>LIMITS.nodes)fail('limit','Input exceeds the local node limit.');
    space();const ch=text[i];
    if(ch==='"')return string();
    if(ch==='{'){
      i++;space();const out=Object.create(null),seen=new Set();if(text[i]==='}'){i++;return out;}
      while(i<text.length){space();if(text[i]!=='"')fail('syntax','An object key must be a JSON string.');const key=string();
        if(['__proto__','prototype','constructor'].includes(key))fail('security','A reserved object key is not accepted.');
        if(seen.has(key))fail('duplicate-key','Duplicate JSON keys are not accepted.');seen.add(key);space();if(text[i++]!==':')fail('syntax','Expected a colon after an object key.');out[key]=value(depth+1);space();const end=text[i++];if(end==='}')return out;if(end!==',')fail('syntax','Expected an object separator.');
      }fail('syntax','Unterminated JSON object.');
    }
    if(ch==='['){i++;space();const out=[];if(text[i]===']'){i++;return out;}while(i<text.length){out.push(value(depth+1));space();const end=text[i++];if(end===']')return out;if(end!==',')fail('syntax','Expected an array separator.');}fail('syntax','Unterminated JSON array.');}
    for(const [token,result] of [['true',true],['false',false],['null',null]])if(text.startsWith(token,i)){i+=token.length;return result;}
    const match=text.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if(match){const literal=match[0];i+=literal.length;const number=Number(literal);const mantissa=literal.split(/[eE]/)[0].replace(/[-.]/g,'').replace(/^0+/,'');
      if(mantissa.length>15||!Number.isFinite(number)||(number===0&&/[1-9]/.test(mantissa)))fail('precision','Number exceeds the supported finite, 15-significant-digit precision limit.');
      return number;
    }
    fail('syntax','Invalid JSON value.');
  }
  const data=value(0);space();if(i!==text.length)fail('syntax','Unexpected content after the JSON value.');
  if(!data||typeof data!=='object'||Array.isArray(data))fail('shape','The root must be a FHIR resource object.');
  return data;
}
