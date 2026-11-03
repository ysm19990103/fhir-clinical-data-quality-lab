import { readdir, readFile } from 'node:fs/promises';
import { resolve, extname, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
const root=resolve('.');
const files=[];
async function walk(dir) {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    if(['.git','.openai','node_modules','coverage','test-results'].includes(entry.name)) continue;
    const path=resolve(dir,entry.name);if(entry.isDirectory()) await walk(path);else files.push(path);
  }
}
await walk(root);
const failures=[];
const patterns=[
  /\bsk-[A-Za-z0-9_-]{24,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\bAKIA[A-Z0-9]{16}\b/g
];
for(const path of files) {
  const name=relative(root,path);
  if(/(?:^|\/)\.env(?:$|\.)|\.(?:db|sqlite3?|xlsx?|dcm|pem|key|csv|sql|parquet|rds|RData|zip)$/i.test(name)) failures.push(`${name}: prohibited data or credential file`);
  if(['.mjs','.js'].includes(extname(path))) {try { execFileSync(process.execPath,['--check',path],{stdio:'pipe'}); } catch {failures.push(`${name}: JavaScript syntax error`);} }
  if(['.mjs','.js','.html','.css','.md','.json','.yml','.svg','.webmanifest'].includes(extname(path)) || name==='LICENSE') {
    const text=await readFile(path,'utf8');
    if(patterns.some(p=>{p.lastIndex=0;return p.test(text);})) failures.push(`${name}: credential-like content detected`);
    const emails=text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)||[];
    if(emails.some(email=>!email.endsWith('@users.noreply.github.com'))) failures.push(`${name}: email address detected`);
    if((name.startsWith('app/') || name.startsWith('dist/')) && /\b(?:localStorage|sessionStorage|indexedDB|XMLHttpRequest|WebSocket|sendBeacon)\b/.test(text)) failures.push(`${name}: unexpected persistence or transport API`);
    if((name.startsWith('app/') || name.startsWith('dist/')) && /\bfetch\s*\(/.test(text)) failures.push(`${name}: unexpected application network request`);
  }
}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log(`Checked ${files.length} source/build files: valid JavaScript; no detected credentials, contact emails, databases, patient-data file formats, telemetry or case-persistence APIs.`);
console.log('This heuristic check supplements manual review; it does not prove the absence of all sensitive data.');
