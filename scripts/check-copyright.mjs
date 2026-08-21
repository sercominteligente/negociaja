/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {readdir,readFile} from 'node:fs/promises';
import {extname,join} from 'node:path';

const roots=['src','public'];
const extensions=new Set(['.ts','.js','.html','.css']);
const marker='SER Comunicação';
const missing=[];

async function walk(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,entry.name);
    if(entry.isDirectory()){await walk(path);continue;}
    if(!extensions.has(extname(entry.name)))continue;
    const content=await readFile(path,'utf8');
    if(!content.includes(marker))missing.push(path);
  }
}
for(const root of roots)await walk(root);
if(missing.length){
  console.error('Arquivos sem assinatura SER Comunicação:');
  for(const path of missing)console.error(` - ${path}`);
  process.exit(1);
}
console.log('Assinatura SER Comunicação validada em todos os fontes web/Worker.');
