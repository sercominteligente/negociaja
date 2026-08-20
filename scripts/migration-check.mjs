import fs from 'node:fs';
import path from 'node:path';

const dir='migrations';
const files=fs.readdirSync(dir).filter((name)=>/^\d{4}_.+\.sql$/.test(name)).sort();
const allowedLegacyDuplicate=new Set(['0004_saas_billing_support.sql','0004_saas_governance.sql']);
const groups=new Map();
for(const file of files){const prefix=file.slice(0,4);const list=groups.get(prefix)||[];list.push(file);groups.set(prefix,list);const text=fs.readFileSync(path.join(dir,file),'utf8');if(!text.trim())throw new Error(`Migration vazia: ${file}`);}
for(const [prefix,list] of groups){if(list.length<=1)continue;const legacy=prefix==='0004'&&list.length===2&&list.every((file)=>allowedLegacyDuplicate.has(file));if(!legacy)throw new Error(`Número de migration duplicado ${prefix}: ${list.join(', ')}`);}
const prefixes=[...groups.keys()].map(Number).sort((a,b)=>a-b);
if(prefixes[0]!==1)throw new Error('A sequência de migrations deve começar em 0001.');
console.log(`Migration guard passed (${files.length} files). Legacy 0004 pair is frozen and explicitly allowlisted.`);
