const base = process.env.HML_SMOKE_BASE_URL || 'http://127.0.0.1:8788';
const username = process.env.HML_SMOKE_USERNAME || 'homologacao';
const password = process.env.HML_SMOKE_PASSWORD || 'ci-hml-secret';
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

const request = async (path, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (options.auth !== false) headers.authorization = authorization;
  const response = await fetch(`${base}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

console.log(`HML smoke testing ${base}`);

{
  const { response } = await request('/', { auth: false });
  assert(response.status === 401, `unauthenticated HML should be 401, got ${response.status}`);
  assert((response.headers.get('www-authenticate') || '').startsWith('Basic '), 'HML challenge is missing Basic auth');
}

{
  const { response, payload } = await request('/api/health');
  assert(response.ok, `authenticated HML health returned ${response.status}`);
  assert(payload.environment === 'hml', `HML environment is ${payload.environment}`);
}

{
  const { response, payload } = await request('/api/session');
  assert(response.ok, `HML session returned ${response.status}`);
  assert(payload.data?.tenant_id === 'tenant_demo', 'HML session returned wrong tenant');
  assert(payload.data?.environment === 'hml', 'HML session returned wrong environment');
}

{
  const { response } = await request('/api/catalog', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'No origin' })
  });
  assert(response.status === 403, `HML mutation without same-origin header should be 403, got ${response.status}`);
}

{
  const { response, payload } = await request('/api/catalog', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: base
    },
    body: JSON.stringify({
      name: `HML Smoke ${Date.now()}`,
      item_type: 'service',
      category: 'CI-HML',
      price_cents: 2500
    })
  });
  assert(response.status === 201, `HML same-origin mutation returned ${response.status}`);
  assert(typeof payload.data?.id === 'string', 'HML mutation did not return an item id');
}

console.log('Authenticated HML smoke test passed.');
