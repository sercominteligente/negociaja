/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import fs from 'node:fs';

const wrangler=fs.readFileSync('wrangler.jsonc','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const failures=[];

if(!/"name"\s*:\s*"negociaja"/.test(wrangler)) failures.push('wrangler.jsonc deve usar exclusivamente name="negociaja".');
if(/negociaja-hml/i.test(wrangler)) failures.push('wrangler.jsonc não pode referenciar negociaja-hml.');
if(/"env"\s*:\s*\{/.test(wrangler) && /"hml"\s*:/.test(wrangler)) failures.push('env.hml não é permitido: o projeto usa Worker único.');
if(/workers_dev"\s*:\s*true/.test(wrangler)) failures.push('workers_dev=true não é permitido na configuração oficial.');
if(!/negociaja\.com\.br/.test(wrangler)) failures.push('rotas oficiais do NegocIAJá! não encontradas.');
if(String(pkg.scripts?.deploy||'')!=='node scripts/assert-production-deploy.mjs') failures.push('npm run deploy deve passar pelo guard de produção.');

if(failures.length){console.error('Single Worker Guard falhou:\n- '+failures.join('\n- '));process.exit(1)}
console.log('Single Worker Guard OK: apenas Worker oficial negociaja.');
