import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const fail = (message) => {
  console.error(`SECURITY CHECK FAILED: ${message}`);
  process.exitCode = 1;
};
const requireText = (source, text, label) => {
  if (!source.includes(text)) fail(`${label} is missing ${JSON.stringify(text)}`);
};
const forbidText = (source, text, label) => {
  if (source.toLowerCase().includes(text.toLowerCase())) fail(`${label} contains forbidden ${JSON.stringify(text)}`);
};

const wranglerText = read('wrangler.jsonc');
const worker = read('src/index.ts');
const panel = read('public/app.js');
const landing = read('public/index.html');

const wrangler = JSON.parse(wranglerText);
if (wrangler?.assets?.run_worker_first !== true) {
  fail('wrangler assets.run_worker_first must remain true');
}
if (wrangler?.d1_databases?.[0]?.binding !== 'DB') fail('D1 DB binding changed unexpectedly');
if (wrangler?.r2_buckets?.[0]?.binding !== 'FILES') fail('R2 FILES binding changed unexpectedly');
if (wrangler?.assets?.binding !== 'ASSETS') fail('ASSETS binding changed unexpectedly');

const hml = wrangler?.env?.hml;
if (!hml) fail('HML environment is missing');
if (hml?.name !== 'negociaja-hml') fail('HML Worker name changed unexpectedly');
if (hml?.workers_dev !== true) fail('HML must use workers.dev until a protected custom domain is explicitly configured');
if (hml?.vars?.APP_ENVIRONMENT !== 'hml') fail('HML APP_ENVIRONMENT must be hml');
if (hml?.vars?.HML_USERNAME !== 'homologacao') fail('HML username changed unexpectedly');
if (Array.isArray(hml?.routes) && hml.routes.length !== 0) fail('HML must not inherit production routes');
if (hml?.d1_databases?.[0]?.binding !== 'DB') fail('HML D1 DB binding is missing');
if (hml?.r2_buckets?.[0]?.binding !== 'FILES') fail('HML R2 FILES binding is missing');
if (hml?.d1_databases?.[0]?.database_id === wrangler?.d1_databases?.[0]?.database_id) {
  fail('HML must never bind the production D1 database');
}
if (hml?.r2_buckets?.[0]?.bucket_name === wrangler?.r2_buckets?.[0]?.bucket_name) {
  fail('HML must never bind the production R2 bucket');
}

requireText(worker, 'cf-access-jwt-assertion', 'Worker');
requireText(worker, 'jwtVerify', 'Worker');
requireText(worker, 'ACCESS_AUD', 'Worker');
requireText(worker, 'ACCESS_TEAM_DOMAIN', 'Worker');
requireText(worker, "origin !== `https://${APP_HOST}`", 'Worker');
requireText(worker, 'MAX_JSON_BODY_BYTES', 'Worker');
requireText(worker, 'content-security-policy', 'Worker');
requireText(worker, 'strict-transport-security', 'Worker');
requireText(worker, 'x-robots-tag', 'Worker');
requireText(worker, 'HML_PASSWORD', 'Worker');
requireText(worker, 'hmlAuthorized', 'Worker');
requireText(worker, 'www-authenticate', 'Worker');
requireText(worker, "env.APP_ENVIRONMENT === 'hml'", 'Worker');

forbidText(worker, 'x-tenant-id', 'Worker');
forbidText(panel, 'x-tenant-id', 'Panel');
forbidText(panel, '.innerHTML', 'Panel');
forbidText(panel, 'insertAdjacentHTML', 'Panel');
forbidText(panel, 'eval(', 'Panel');

requireText(landing, 'O sistema se adapta ao seu negócio.', 'Landing');

if (process.exitCode) process.exit(process.exitCode);
console.log('Security regression checks passed.');
