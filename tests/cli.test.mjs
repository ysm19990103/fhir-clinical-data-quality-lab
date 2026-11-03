import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {example} from '../app/examples.mjs';
import {LIMITS} from '../app/catalog.mjs';
const script=fileURLToPath(new URL('../scripts/audit.mjs',import.meta.url));
const run=(args=[],input=JSON.stringify(example('baseline')))=>spawnSync(process.execPath,[script,...args],{input,encoding:'utf8',maxBuffer:8*1024*1024,timeout:10000});

test('CLI reads stdin, exports deterministic review date, and returns zero for baseline',()=>{
  const result=run(['--review-date','2026-11-03']);assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');
  const report=JSON.parse(result.stdout);assert.equal(report.reviewDate,'2026-11-03');assert.equal(report.counts.error,0);
});
test('CLI returns one for error-level challenge findings and still emits a report',()=>{
  const result=run([],JSON.stringify(example('challenge')));assert.equal(result.status,1);assert.equal(result.stderr,'');assert.ok(JSON.parse(result.stdout).counts.error>0);
});
test('CLI supports every documented report format',()=>{
  for(const format of ['json','csv','outcome','html']){const result=run(['--format',format]);assert.equal(result.status,0,result.stderr);assert.ok(result.stdout.length>0);if(format==='outcome')assert.equal(JSON.parse(result.stdout).resourceType,'OperationOutcome');if(format==='html')assert.ok(result.stdout.startsWith('<!doctype html>'));if(format==='csv')assert.ok(result.stdout.startsWith('"finding"'));}
});
test('CLI file input closes cleanly and omits supplied filenames from report output',()=>{
  const dir=mkdtempSync(join(tmpdir(),'fhir-lab-test-'));const filename=join(dir,'SYNTHETIC_FILENAME_CANARY_94821.json');
  try{writeFileSync(filename,JSON.stringify(example('baseline')));const result=run([filename],'');assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');assert.ok(!result.stdout.includes('SYNTHETIC_FILENAME_CANARY_94821'));}
  finally{rmSync(dir,{recursive:true,force:true});}
});
test('CLI malformed JSON, unsupported size and invalid UTF-8 fail without partial reports',()=>{
  for(const input of ['{"SYNTHETIC_CANARY_7182":"unterminated',' '.repeat(LIMITS.bytes+1),Buffer.from([0xff,0xfe,0xff])]){
    const result=run([],input);assert.equal(result.status,2);assert.equal(result.stdout,'');assert.ok(result.stderr.length>0);assert.ok(!result.stderr.includes('SYNTHETIC_CANARY_7182'));
  }
});
test('CLI rejects unknown/missing options and invalid review dates',()=>{
  for(const args of [['--unknown'],['--format'],['--format','pdf'],['--review-date'],['--review-date','2026'],['--review-date','2026-02-30'],['one','two']]){const result=run(args);assert.equal(result.status,2);assert.equal(result.stdout,'');assert.match(result.stderr,/Check arguments/);}
});
test('CLI unreadable path errors never echo filesystem paths',()=>{
  const result=run(['/missing/SYNTHETIC_PATH_CANARY_72497.json']);assert.equal(result.status,2);assert.equal(result.stdout,'');assert.ok(!result.stderr.includes('SYNTHETIC_PATH_CANARY_72497'));
});
test('CLI help documents scope and exit codes without waiting for stdin',()=>{
  const result=run(['--help'],'');assert.equal(result.status,0);assert.match(result.stdout,/Synthetic inputs only/);assert.match(result.stdout,/Exit codes/);assert.equal(result.stderr,'');
});
