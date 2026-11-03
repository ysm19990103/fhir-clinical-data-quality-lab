const leap=y=>y%4===0&&(y%100!==0||y%400===0);
const days=(y,m)=>[31,leap(y)?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
const utc=(y,m,d)=>{const date=new Date(0);date.setUTCFullYear(y,m-1,d);date.setUTCHours(0,0,0,0);return BigInt(date.getTime())*1000000n;};
const DAY=86400000000000n;
export function temporal(value,type='dateTime'){
  if(typeof value!=='string')return {valid:false};
  if(type==='time')return {valid:/^(?:[01]\d|2[0-3]):[0-5]\d:(?:[0-5]\d|60)(?:\.\d+)?$/.test(value),bounds:null};
  const match=value.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2}))?)?)?$/);
  if(!match)return {valid:false};
  const [,ys,ms,ds,hs,mins,secs,fraction='',zone]=match;
  const y=Number(ys),m=Number(ms||1),d=Number(ds||1),h=Number(hs||0),min=Number(mins||0),sec=Number(secs||0);
  if(y<1||m<1||m>12||d<1||d>days(y,m)||h>23||min>59||sec>60||(type==='date'&&hs!==undefined)||(type==='instant'&&hs===undefined))return {valid:false};
  if(zone&&zone!=='Z'){const hours=Number(zone.slice(1,3)),minutes=Number(zone.slice(4));if(hours>14||minutes>59||(hours===14&&minutes!==0))return {valid:false};}
  if(hs===undefined){
    const lo=utc(y,m,d);const hi=ds?lo+DAY-1n:ms?(m===12?utc(y+1,1,1):utc(y,m+1,1))-1n:utc(y+1,1,1)-1n;
    // Date-only values have no timezone. Wide bounds prevent false ordering against zoned instants.
    return {valid:true,bounds:{lo,hi},precision:ds?'day':ms?'month':'year',zoned:false};
  }
  if(sec===60||fraction.length>9)return {valid:true,bounds:null,precision:'unmodeled',zoned:true};
  const offset=zone==='Z'?0:(Number(zone.slice(1,3))*60+Number(zone.slice(4)))*(zone[0]==='-'?-1:1);
  const point=utc(y,m,d)+BigInt((h*60+min-offset)*60+sec)*1000000000n+BigInt(fraction.padEnd(9,'0')||0);
  return {valid:true,bounds:{lo:point,hi:point},precision:'instant',zoned:true};
}
export function definitelyBefore(a,b){
  if(!a?.valid||!b?.valid||!a.bounds||!b.bounds)return false;
  const pad=14n*3600000000000n;
  const aHi=a.bounds.hi+(!a.zoned&&b.zoned?pad:0n),bLo=b.bounds.lo-(!b.zoned&&a.zoned?pad:0n);
  return aHi<bLo;
}
