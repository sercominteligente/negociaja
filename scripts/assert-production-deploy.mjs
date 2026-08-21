/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const wrangler=fs.readFileSync('wrangler.jsonc','utf8');
if(!/"name"\s*:\s*"negociaja"/.test(wrangler)||/negociaja-hml/i.test(wrangler)||/"hml"\s*:/.test(wrangler)){
  console.error('Deploy bloqueado: configuração não corresponde ao Worker único oficial "negociaja".');
  process.exit(1);
}
const result=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['wrangler','deploy'],{stdio:'inherit'});
process.exit(result.status??1);
