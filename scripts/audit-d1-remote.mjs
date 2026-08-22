/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {spawnSync} from 'node:child_process';

const database='negocia-ja-bd';
const runner=process.platform==='win32'?'npx.cmd':'npx';

function run(label,args){
  console.log(`\n=== ${label} ===`);
  const result=spawnSync(runner,['wrangler',...args],{stdio:'inherit'});
  if((result.status??1)!==0){
    console.error(`\nFalha em: ${label}`);
    process.exitCode=1;
  }
}

run('Migrations ainda não aplicadas',['d1','migrations','list',database,'--remote']);
run('Integridade rápida',['d1','execute',database,'--remote','--command=PRAGMA quick_check']);
run('Objetos do banco',['d1','execute',database,'--remote','--command=SELECT name,type FROM sqlite_schema WHERE type IN (\'table\',\'trigger\',\'index\') ORDER BY type,name']);
run('Histórico de migrations',['d1','execute',database,'--remote','--command=SELECT * FROM d1_migrations ORDER BY id']);

for(const table of ['tenants','tenant_settings','users','platform_plans','tenant_subscriptions','email_verifications','notification_deliveries','audit_logs','auth_sessions']){
  run(`Schema: ${table}`,['d1','execute',database,'--remote',`--command=PRAGMA table_info('${table}')`]);
}

run('Contagens operacionais',['d1','execute',database,'--remote','--command=SELECT (SELECT COUNT(*) FROM tenants) tenants,(SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM tenant_subscriptions) subscriptions,(SELECT COUNT(*) FROM email_verifications) verifications']);

console.log('\nAuditoria concluída. Não aplica migrations nem altera dados.');
