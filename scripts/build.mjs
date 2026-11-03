import {readFile,writeFile,mkdir,rm,copyFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename,resolve} from 'node:path';
const source=resolve('app'),out=resolve('dist');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const hash=text=>createHash('sha256').update(text).digest('hex').slice(0,12);
const built=new Map(),building=new Set();
async function moduleFile(name){
  if(built.has(name))return built.get(name);
  if(building.has(name))throw new Error('Circular module dependency in static build.');building.add(name);
  let text=await readFile(resolve(source,name),'utf8');
  const imports=[...text.matchAll(/from\s+['"]\.\/([^'"]+\.mjs)['"]/g)];
  for(const match of imports){const dep=await moduleFile(match[1]);text=text.replaceAll(`'./${match[1]}'`,`'./${dep}'`).replaceAll(`"./${match[1]}"`,`"./${dep}"`);}
  const target=`${basename(name,'.mjs')}.${hash(text)}.mjs`;await writeFile(resolve(out,target),text);built.set(name,target);building.delete(name);return target;
}
const entry=await moduleFile('ui.mjs'),css=await readFile(resolve(source,'styles.css'),'utf8'),cssName=`styles.${hash(css)}.css`;
await writeFile(resolve(out,cssName),css);
const html=(await readFile(resolve(source,'index.html'),'utf8')).replace('./ui.mjs',`./${entry}`).replace('./styles.css',`./${cssName}`);
await writeFile(resolve(out,'index.html'),html);await copyFile(resolve(source,'icon.svg'),resolve(out,'icon.svg'));await writeFile(resolve(out,'.nojekyll'),'');
console.log(`Built ${built.size} content-addressed modules, CSS, HTML and icon. No data files or credentials are included.`);
console.log((await readdir(out)).join('\n'));
