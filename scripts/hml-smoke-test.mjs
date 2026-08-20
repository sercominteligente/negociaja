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
const sameOriginJson = { 'content-type': 'application/json', origin: base };
const unique = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

console.log(`HML adversarial smoke testing ${base}`);

// Authentication boundary.
{
  const { response } = await request('/', { auth: false });
  assert(response.status === 401, `unauthenticated HML should be 401, got ${response.status}`);
  assert((response.headers.get('www-authenticate') || '').startsWith('Basic '), 'HML challenge is missing Basic auth');
}

// Environment/session and ignored tenant injection header.
{
  const { response, payload } = await request('/api/health');
  assert(response.ok, `authenticated HML health returned ${response.status}`);
  assert(payload.environment === 'hml', `HML environment is ${payload.environment}`);
}
{
  const { response, payload } = await request('/api/session', { headers: { 'x-tenant-id': 'tenant_injected' } });
  assert(response.ok, `HML session returned ${response.status}`);
  assert(payload.data?.tenant_id === 'tenant_demo', 'x-tenant-id must not alter tenant context');
  assert(payload.data?.environment === 'hml', 'HML session returned wrong environment');
}

// Same-origin protection.
{
  const { response } = await request('/api/catalog', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'No origin' })
  });
  assert(response.status === 403, `HML mutation without same-origin header should be 403, got ${response.status}`);
}

// Real write path.
{
  const { response, payload } = await request('/api/catalog', {
    method: 'POST',
    headers: sameOriginJson,
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

// Team/RBAC surface and owner protection.
let ownerMembershipId = '';
{
  const { response, payload } = await request('/api/team');
  assert(response.ok, `team list returned ${response.status}`);
  assert(Array.isArray(payload.data), 'team response must be an array');
  const owner = payload.data.find((member) => member.role === 'owner');
  assert(owner?.membership_id, 'HML owner membership missing');
  ownerMembershipId = owner.membership_id;
}
{
  const { response } = await request(`/api/team/${encodeURIComponent(ownerMembershipId)}`, {
    method: 'PATCH',
    headers: sameOriginJson,
    body: JSON.stringify({ role: 'operator' })
  });
  assert(response.status === 409, `owner downgrade must be rejected with 409, got ${response.status}`);
}
{
  const email = `${unique('operator')}@example.invalid`;
  const { response, payload } = await request('/api/team', {
    method: 'POST',
    headers: sameOriginJson,
    body: JSON.stringify({ name: 'Operador CI', email, role: 'operator' })
  });
  assert(response.status === 201, `team member creation returned ${response.status}`);
  assert(payload.data?.role === 'operator', 'new member must be operator');
}

// Diagnostics/readiness surfaces.
{
  const { response, payload } = await request('/api/ops/diagnostics');
  assert(response.ok, `diagnostics returned ${response.status}`);
  assert(payload.data?.readiness?.d1 === true, 'D1 readiness should be true in HML');
  assert(payload.data?.readiness?.r2 === true, 'R2 readiness should be true in HML');
}
{
  const { response, payload } = await request('/api/ops/health/run', {
    method: 'POST',
    headers: sameOriginJson,
    body: '{}'
  });
  assert(response.ok, `manual health run returned ${response.status}`);
  assert(Array.isArray(payload.data), 'manual health result must be an array');
}

// Multimodal inbound idempotency and modality persistence.
const eventId = unique('evt');
let conversationId = '';
let messageId = '';
const inbound = {
  provider: 'ci-hml',
  external_event_id: eventId,
  channel_type: 'whatsapp',
  channel_name: 'WhatsApp CI',
  external_conversation_id: '5585999990000@s.whatsapp.net',
  customer_name: 'Cliente CI',
  phone: '5585999990000',
  content_type: 'text',
  body: 'Mensagem de teste idempotente'
};
{
  const { response, payload } = await request('/api/integrations/inbound', {
    method: 'POST', headers: sameOriginJson, body: JSON.stringify(inbound)
  });
  assert(response.status === 201, `first inbound returned ${response.status}`);
  assert(payload.data?.duplicate === false, 'first inbound must not be duplicate');
  conversationId = payload.data?.conversation_id;
  messageId = payload.data?.message_id;
  assert(conversationId && messageId, 'first inbound must return conversation/message ids');
}
{
  const { response, payload } = await request('/api/integrations/inbound', {
    method: 'POST', headers: sameOriginJson, body: JSON.stringify(inbound)
  });
  assert(response.status === 200, `duplicate inbound returned ${response.status}`);
  assert(payload.data?.duplicate === true, 'duplicate inbound must be detected');
  assert(payload.data?.conversation_id === conversationId, 'duplicate must keep conversation id');
  assert(payload.data?.message_id === messageId, 'duplicate must keep message id');
}
{
  const { response } = await request('/api/integrations/inbound', {
    method: 'POST', headers: sameOriginJson,
    body: JSON.stringify({ ...inbound, external_event_id: unique('audio'), content_type: 'audio', body: '', transcript: 'Áudio transcrito no CI' })
  });
  assert(response.status === 201, `audio inbound returned ${response.status}`);
}
{
  const { response } = await request('/api/integrations/inbound', {
    method: 'POST', headers: sameOriginJson,
    body: JSON.stringify({ ...inbound, external_event_id: unique('image'), content_type: 'image', body: 'Legenda da imagem' })
  });
  assert(response.status === 201, `image inbound returned ${response.status}`);
}

// Gateway validation failures.
{
  const { response } = await request('/api/integrations/inbound', {
    method: 'POST', headers: sameOriginJson, body: '{'
  });
  assert(response.status === 400, `invalid JSON should be 400, got ${response.status}`);
}
{
  const { response } = await request('/api/integrations/inbound', {
    method: 'POST', headers: { origin: base, 'content-type': 'text/plain' }, body: 'x'
  });
  assert(response.status === 415, `wrong content type should be 415, got ${response.status}`);
}
{
  const { response } = await request('/api/integrations/inbound', {
    method: 'POST', headers: sameOriginJson, body: JSON.stringify({ external_event_id: unique('big'), body: 'x'.repeat(270000) })
  });
  assert(response.status === 413, `oversized integration payload should be 413, got ${response.status}`);
}

// Outbound persistence path.
{
  const { response, payload } = await request('/api/integrations/outbound', {
    method: 'POST', headers: sameOriginJson,
    body: JSON.stringify({ conversation_id: conversationId, provider: 'ci-hml', destination: '5585999990000', content_type: 'text', body: 'Resposta CI', provider_reference: unique('provider') })
  });
  assert(response.status === 201, `outbound log returned ${response.status}`);
  assert(payload.data?.conversation_id === conversationId, 'outbound must keep conversation id');
}

// Lab trace must expose internal persistence without external send.
{
  const { response, payload } = await request('/api/hml-lab/simulate', {
    method: 'POST', headers: sameOriginJson,
    body: JSON.stringify({ phone: '5585999991111', content_type: 'text', body: 'Simulação pelo laboratório' })
  });
  assert(response.status === 201, `HML lab simulation returned ${response.status}`);
  assert(payload.data?.external_event_id, 'HML lab simulation did not return event id');
}
{
  const { response, payload } = await request('/api/hml-lab/trace');
  assert(response.ok, `HML lab trace returned ${response.status}`);
  assert(Array.isArray(payload.data?.events), 'trace events must be an array');
  assert(Array.isArray(payload.data?.messages), 'trace messages must be an array');
  assert(Array.isArray(payload.data?.conversations), 'trace conversations must be an array');
  assert(Array.isArray(payload.data?.outbox), 'trace outbox must be an array');
}

// Billing must fail safely before a real provider secret is configured in CI.
{
  const { response, payload } = await request('/api/billing/pix', {
    method: 'POST', headers: sameOriginJson, body: '{}'
  });
  assert(response.status === 503, `unconfigured Mercado Pago should return 503, got ${response.status}`);
  assert(payload.code === 'provider_not_configured', 'billing should expose provider_not_configured code');
}

console.log('Authenticated HML adversarial smoke test passed.');
