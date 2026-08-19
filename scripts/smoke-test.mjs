const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8787';

const request = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const jsonHeaders = { 'content-type': 'application/json' };

console.log(`Smoke testing ${base}`);

{
  const { response, payload } = await request('/api/health');
  assert(response.ok, `health returned ${response.status}`);
  assert(payload.ok === true, 'health payload is not ok');
}

{
  const { response, payload } = await request('/api/session');
  assert(response.ok, `session returned ${response.status}`);
  assert(payload.data?.tenant_id === 'tenant_demo', 'session returned wrong tenant');
  assert(payload.data?.environment === 'development', 'session returned wrong environment');
}

let catalog;
{
  const { response, payload } = await request('/api/catalog', {
    headers: { 'x-tenant-id': 'tenant_that_must_not_be_used' }
  });
  assert(response.ok, `catalog returned ${response.status}`);
  catalog = payload.data;
  assert(Array.isArray(catalog), 'catalog is not an array');
  assert(catalog.some((item) => item.id === 'item_1'), 'browser tenant header changed the selected tenant');
}

{
  const { response } = await request('/api/catalog', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ name: '' })
  });
  assert(response.status === 400, `empty catalog item should be 400, got ${response.status}`);
}

const uniqueName = `Smoke Item ${Date.now()}`;
let createdItemId;
{
  const { response, payload } = await request('/api/catalog', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      name: uniqueName,
      item_type: 'product',
      category: 'CI',
      price_cents: 1234,
      stock_control: true,
      stock_qty: 5
    })
  });
  assert(response.status === 201, `catalog create returned ${response.status}`);
  createdItemId = payload.data?.id;
  assert(typeof createdItemId === 'string' && createdItemId.startsWith('item_'), 'catalog create did not return an id');
}

const customerName = '<img src=x onerror=alert(1)> Smoke Customer';
const customerPhone = '85999990000';
let orderId;
{
  const { response, payload } = await request('/api/orders', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      customer_name: customerName,
      customer_phone: customerPhone,
      source: 'ci-smoke',
      items: [{ catalog_item_id: createdItemId, qty: 2 }]
    })
  });
  assert(response.status === 201, `order create returned ${response.status}`);
  orderId = payload.data?.id;
  assert(typeof orderId === 'string' && orderId.startsWith('ord_'), 'order create did not return an id');
  assert(payload.data?.total_cents === 2468, `unexpected order total: ${payload.data?.total_cents}`);
}

{
  const { response, payload } = await request('/api/customers');
  assert(response.ok, `customers returned ${response.status}`);
  assert(Array.isArray(payload.data), 'customers is not an array');
  const customer = payload.data.find((item) => item.phone === customerPhone);
  assert(customer, 'created customer not found');
  assert(customer.name === customerName, 'stored customer text changed unexpectedly');
  assert(Number(customer.order_count) >= 1, 'customer order count was not aggregated');
  assert(Number(customer.total_spent_cents) >= 2468, 'customer spend was not aggregated');
}

{
  const { response } = await request(`/api/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({ status: 'totally-invalid-status' })
  });
  assert(response.status === 400, `invalid order status should be 400, got ${response.status}`);
}

{
  const { response, payload } = await request(`/api/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({ status: 'confirmed' })
  });
  assert(response.ok, `order status update returned ${response.status}`);
  assert(payload.data?.status === 'confirmed', 'order status did not become confirmed');
}

{
  const { response, payload } = await request('/api/orders');
  assert(response.ok, `orders returned ${response.status}`);
  const order = payload.data?.find((item) => item.id === orderId);
  assert(order, 'created order not found');
  assert(order.status === 'confirmed', 'created order has wrong status');
  assert(order.customer_name === customerName, 'stored text changed unexpectedly');
}

{
  const { response } = await request('/api/catalog', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: '{}'
  });
  assert(response.status === 415, `non-JSON mutation should be 415, got ${response.status}`);
}

console.log('Local Worker + D1 smoke test passed.');
