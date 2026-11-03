import {open} from 'node:fs/promises';
import {parseInput,ImportError} from '../app/parser.mjs';
import {analyze} from '../app/engine.mjs';
import {reportJSON,findingsCSV,operationOutcome,reportHTML} from '../app/exports.mjs';
import {LIMITS} from '../app/catalog.mjs';
import {temporal} from '../app/dates.mjs';
const HELP='Usage: node scripts/audit.mjs [file] [--format json|csv|outcome|html] [--review-date YYYY-MM-DD]\nReads stdin when no file is supplied. Synthetic inputs only. Writes a value-free report to stdout.\nExit codes: 0 no error-level findings; 1 error-level findings; 2 unsupported input or usage error.\n';
async function main(){
  const args=process.argv.slice(2);let path=null,format='json',reviewDate;
  if(args.length===1&&args[0]==='--help'){process.stdout.write(HELP);return;}
  for(let i=0;i<args.length;i++){
    const a=args[i];
    if(a==='--format'){format=args[++i];if(!['json','csv','outcome','html'].includes(format))throw new Error('usage');}
    else if(a==='--review-date'){reviewDate=args[++i];if(!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate||'')||!temporal(reviewDate,'date').valid)throw new Error('usage');}
    else if(a.startsWith('-')||path!==null)throw new Error('usage');else path=a;
  }
  const chunks=[];let bytes=0,handle;
  try{
    const stream=path?(handle=await open(path,'r')).createReadStream():process.stdin;
    for await(const chunk of stream){bytes+=chunk.length;if(bytes>LIMITS.bytes)throw new ImportError('limit','Input exceeds the 2 MiB limit.');chunks.push(chunk);}
  }finally{await handle?.close();}
  const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
  const report=analyze(parseInput(text),{reviewDate});
  const output=format==='csv'?findingsCSV(report):format==='outcome'?JSON.stringify(operationOutcome(report),null,2)+'\n':format==='html'?reportHTML(report):reportJSON(report);
  process.stdout.write(output);process.exitCode=report.counts.error?1:0;
}
main().catch(error=>{
  process.stderr.write(error instanceof ImportError?`Import not completed: ${error.message}\n`:'Review not completed. Check arguments, input readability and UTF-8 JSON encoding. Run --help for usage.\n');
  process.exitCode=2;
});
