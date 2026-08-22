/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Env} from './lib';

let ready=false;
let pending:Promise<void>|null=null;

async function columns(env:Env,table:string){
  try{const r=await env.DB.prepare(`PRAGMA table_info(${table})`).all<{name:string}>();return new Set((r.results||[]).map(x=>x.name));}catch{return new Set<string>();}
}

async function ensureColumn(env:Env,table:string,column:string,definition:string){
  const current=await columns(env,table);if(current.has(column))return;
  try{await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();}
  catch(error){const after=await columns(env,table);if(!after.has(column))throw error;}
}

async function repair(env:Env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS platform_plans (
    id TEXT PRIMARY KEY,slug TEXT NOT NULL UNIQUE,name TEXT NOT NULL,price_cents INTEGER NOT NULL DEFAULT 0,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly',trial_days INTEGER NOT NULL DEFAULT 7,grace_days INTEGER NOT NULL DEFAULT 3,
    limits_json TEXT NOT NULL DEFAULT '{}',features_json TEXT NOT NULL DEFAULT '{}',active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();

  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS platform_users (
    id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,role TEXT NOT NULL DEFAULT 'super_admin',status TEXT NOT NULL DEFAULT 'active',
    password_hash TEXT,password_salt TEXT,password_iterations INTEGER NOT NULL DEFAULT 210000,last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();

  await ensureColumn(env,'users','password_hash','TEXT');
  await ensureColumn(env,'users','password_salt','TEXT');
  await ensureColumn(env,'users','password_iterations','INTEGER NOT NULL DEFAULT 210000');
  await ensureColumn(env,'users','last_login_at','TEXT');
  await ensureColumn(env,'users','email_verified_at','TEXT');

  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL UNIQUE,plan_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending_email',provider TEXT,
    provider_subscription_id TEXT,trial_ends_at TEXT,current_period_start TEXT,current_period_end TEXT,grace_until TEXT,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,last_payment_status TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,FOREIGN KEY (plan_id) REFERENCES platform_plans(id)
  )`).run();

  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS email_verifications (
    id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,user_id TEXT,email TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,
    purpose TEXT NOT NULL DEFAULT 'signup',expires_at TEXT NOT NULL,verified_at TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();

  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS notification_deliveries (
    id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,channel TEXT NOT NULL,template_key TEXT NOT NULL,destination TEXT,status TEXT NOT NULL DEFAULT 'pending',
    provider_reference TEXT,payload_json TEXT NOT NULL DEFAULT '{}',sent_at TEXT,last_error TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  )`).run();

  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,user_id TEXT,platform_user_id TEXT,tenant_id TEXT,role TEXT NOT NULL,
    expires_at TEXT NOT NULL,revoked_at TEXT,ip_hash TEXT,user_agent TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK ((user_id IS NOT NULL AND platform_user_id IS NULL) OR (user_id IS NULL AND platform_user_id IS NOT NULL)),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY (platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  )`).run();

  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_users_email ON platform_users(email)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token_hash,expires_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_email_verifications_token_purpose ON email_verifications(token_hash,purpose,expires_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_notifications_tenant_template ON notification_deliveries(tenant_id,template_key,created_at)`).run();

  await env.DB.prepare(`INSERT OR IGNORE INTO platform_plans
    (id,slug,name,price_cents,billing_cycle,trial_days,grace_days,limits_json,features_json,active)
    VALUES ('plan_hml','hml','Teste grátis',0,'monthly',7,3,'{}','{"trial":true}',1)`).run();
}

export async function ensureAuthSchema(env:Env){
  if(ready)return;
  if(!pending)pending=repair(env).then(()=>{ready=true;}).finally(()=>{pending=null;});
  await pending;
}
