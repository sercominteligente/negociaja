import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const fail = (message) => { console.error(`SECURITY CHECK FAILED: ${message}`); process.exitCode = 1; };
const requireText = (source, text, label) => { if (!source.includes(text)) fail(`${label} is missing ${JSON.stringify(text)}`); };
const forbidText = (source, text, label) => { if (source.toLowerCase().includes(text.toLowerCase())) fail(`${label} contains forbidden ${JSON.stringify(text)}`); };

const wranglerText = read('wrangler.jsonc');
const worker = read('src/index.ts');
const platform = read('src/platform.ts');
const hmlWorker = read('src/hml.ts');
const hmlBatch = read('src/hml-batch.ts');
const panel = read('public/app.js');
const support = read('public/support.js');
const landing = read('public/index.html');

const wrangler = JSON.parse(wranglerText);
if (wrangler?.main !== 'src/platform.ts') fail('Production SaaS platform gateway must remain the root Worker entry point');
if (wrangler?.assets?.run_worker_first !== true) fail('wrangler assets.run_worker_first must remain true');
if (wrangler?.d1_databases?.[0]?.binding !== 'DB') fail('D1 DB binding changed unexpectedly');
if (wrangler?.r2_buckets?.[0]?.binding !== 'FILES') fail('R2 FILES binding changed unexpectedly');
if (wrangler?.assets?.binding !== 'ASSETS') fail('ASSETS binding changed unexpectedly');

const hml = wrangler?.env?.hml;
if (!hml) fail('HML environment is missing');
if (hml?.name !== 'negociaja-hml') fail('HML Worker name changed unexpectedly');
if (hml?.main !== 'src/hml-batch.ts') fail('HML must use the isolated integrated batch gateway');
if (hml?.workers_dev !== true) fail('HML must use workers.dev until a protected custom domain is explicitly configured');
if (hml?.vars?.APP_ENVIRONMENT !== 'hml') fail('HML APP_ENVIRONMENT must be hml');
if (hml?.vars?.HML_USERNAME !== 'homologacao') fail('HML username changed unexpectedly');
if (Array.isArray(hml?.routes) && hml.routes.length !== 0) fail('HML must not inherit production routes');
if (hml?.d1_databases?.[0]?.binding !== 'DB') fail('HML D1 DB binding is missing');
if (hml?.r2_buckets?.[0]?.binding !== 'FILES') fail('HML R2 FILES binding is missing');
if (hml?.d1_databases?.[0]?.database_id === wrangler?.d1_databases?.[0]?.database_id) fail('HML must never bind the production D1 database');
if (hml?.r2_buckets?.[0]?.bucket_name === wrangler?.r2_buckets?.[0]?.bucket_name) fail('HML must never bind the production R2 bucket');

requireText(worker, 'cf-access-jwt-assertion', 'Core Worker');
requireText(worker, 'jwtVerify', 'Core Worker');
requireText(worker, 'MAX_JSON_BODY_BYTES', 'Core Worker');
requireText(worker, 'content-security-policy', 'Core Worker');
requireText(worker, 'strict-transport-security', 'Core Worker');
requireText(worker, 'HML_PASSWORD', 'Core Worker');

requireText(platform, 'tenant_memberships', 'Platform gateway');
requireText(platform, 'platform_users', 'Platform gateway');
requireText(platform, 'tenantPermission', 'Platform gateway');
requireText(platform, 'x-negociaja-context', 'Platform gateway');
requireText(platform, "globalRole === 'super_admin'", 'Platform gateway');
requireText(platform, 'cf-access-jwt-assertion', 'Platform gateway');
requireText(platform, 'jwtVerify', 'Platform gateway');

requireText(hmlWorker, 'MAX_ASSET_BYTES', 'HML experience gateway');
requireText(hmlWorker, 'image/svg+xml', 'HML experience gateway');
requireText(hmlWorker, 'validateSvg', 'HML experience gateway');
requireText(hmlWorker, '/api/support/chat', 'HML experience gateway');
requireText(hmlWorker, '/api/billing/summary', 'HML experience gateway');

requireText(hmlBatch, '/api/ops/overview', 'HML operational gateway');
requireText(hmlBatch, 'generated_documents', 'HML operational gateway');
requireText(hmlBatch, 'platform_billing_events', 'HML operational gateway');
requireText(hmlBatch, 'channels', 'HML operational gateway');
requireText(hmlBatch, 'audit_logs', 'HML operational gateway');
requireText(support, '/api/ops/overview', 'HML panel integration');
requireText(support, '/api/ops/renewal', 'HML panel integration');

forbidText(worker, 'x-tenant-id', 'Core Worker');
forbidText(platform, 'x-tenant-id', 'Platform gateway');
forbidText(hmlWorker, 'x-tenant-id', 'HML experience gateway');
forbidText(hmlBatch, 'x-tenant-id', 'HML operational gateway');
forbidText(panel, 'x-tenant-id', 'Panel');
forbidText(panel, '.innerHTML', 'Panel');
forbidText(panel, 'insertAdjacentHTML', 'Panel');
forbidText(panel, 'eval(', 'Panel');
forbidText(support, 'eval(', 'Support integration');

requireText(landing, 'O sistema se adapta ao seu negócio.', 'Landing');

if (process.exitCode) process.exit(process.exitCode);
console.log('Security regression checks passed.');
