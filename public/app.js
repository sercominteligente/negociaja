const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

const money = (cents) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);

const api = async (path, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined && !headers['content-type']) headers['content-type'] = 'application/json';

  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Erro ao comunicar com o servidor.');
  return payload.data;
};

const toast = (message) => {
  const element = $('#toast');
  if (!element) return;
  element.textContent = String(message);
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 2600);
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
};

let catalog = [];
let orders = [];
let workflows = [];
let conversations = [];
let customers = [];
let metrics = {};
let session = {};

async function load() {
  try {
    const [dashboard, catalogData, ordersData, workflowData, automations, conversationData, customerData, sessionData] = await Promise.all([
      api('/api/dashboard'),
      api('/api/catalog'),
      api('/api/orders'),
      api('/api/workflows'),
      api('/api/automations'),
      api('/api/conversations'),
      api('/api/customers'),
      api('/api/session')
    ]);

    metrics = dashboard || {};
    catalog = Array.isArray(catalogData) ? catalogData : [];
    orders = Array.isArray(ordersData) ? ordersData : [];
    workflows = Array.isArray(workflowData) ? workflowData : [];
    conversations = Array.isArray(conversationData) ? conversationData : [];
    customers = Array.isArray(customerData) ? customerData : [];
    session = sessionData || {};

    $('#salesMetric').textContent = money(metrics.salesCents);
    $('#ordersMetric').textContent = String(metrics.openOrders ?? 0);
    $('#conversationsMetric').textContent = String(metrics.activeConversations ?? 0);
    $('#customersMetric').textContent = String(metrics.customers ?? customers.length);
    $('#conversationBadge').textContent = String(metrics.activeConversations ?? 0);
    $('#customerCountLabel').textContent = `${customers.length} cliente${customers.length === 1 ? '' : 's'}`;

    renderSession();
    renderCatalog();
    renderKanban();
    renderCustomers();
    renderConversations();
    renderAutomations(Array.isArray(automations) ? automations : []);
    fillSaleItems();
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Falha ao carregar o painel.');
    $$('.empty').forEach((empty) => {
      empty.replaceChildren(document.createTextNode('Não foi possível carregar os dados. Verifique autenticação, migrations e bindings.'));
    });
  }
}

function renderSession() {
  const badge = $('#userBadge');
  const environmentLabel = $('#environmentLabel');
  const environmentHint = $('#environmentHint');
  const email = String(session.email || '');
  const first = email.trim().charAt(0).toUpperCase() || 'N';

  if (badge) {
    badge.textContent = first;
    badge.title = email || 'Conta autenticada';
  }

  if (session.environment === 'hml') {
    if (environmentLabel) environmentLabel.textContent = 'Ambiente HML';
    if (environmentHint) environmentHint.textContent = 'D1 + R2 isolados';
    document.body.dataset.environment = 'hml';
    return;
  }

  if (environmentLabel) environmentLabel.textContent = 'Ambiente protegido';
  if (environmentHint) environmentHint.textContent = email || 'Cloudflare Access';
  document.body.dataset.environment = String(session.environment || 'production');
}

function renderCatalog() {
  const grid = $('#catalogGrid');
  if (!grid) return;
  grid.replaceChildren();

  for (const item of catalog) {
    const card = el('article', 'catalog-card');
    card.append(
      el('div', 'product-icon', item.item_type === 'service' ? '✦' : item.item_type === 'bundle' ? '◆' : '▣'),
      el('strong', '', item.name || 'Item'),
      el('span', '', `${item.category || item.item_type || 'Item'} • ${money(item.price_cents)}`),
      el('small', '', item.stock_control ? `Estoque: ${Number(item.stock_qty) || 0}` : 'Sem controle de estoque')
    );

    const editButton = el('button', 'touch soft-button', 'Editar');
    editButton.type = 'button';
    editButton.disabled = true;
    editButton.title = 'Edição será habilitada após a homologação do núcleo.';
    card.append(editButton);
    grid.append(card);
  }

  if (!catalog.length) grid.append(el('div', 'empty', 'Seu catálogo ainda está vazio.'));
}

function renderKanban() {
  const kanban = $('#kanban');
  if (!kanban) return;

  const steps = workflows
    .filter((item) => item && item.step_key)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

  kanban.replaceChildren();

  const visibleSteps = steps.length
    ? steps
    : [{ step_key: 'new', label: 'Novos', color: '#169CFF' }];

  for (const step of visibleSteps) {
    const column = el('section', 'kanban-col');
    const header = el('header');
    header.style.setProperty('--step', step.color || '#169CFF');
    header.append(
      el('span', '', step.label || step.step_key),
      el('b', '', orders.filter((order) => order.status === step.step_key).length)
    );

    const deals = el('div', 'deals');
    for (const order of orders.filter((entry) => entry.status === step.step_key)) {
      const card = el('article', 'deal');
      card.append(
        el('strong', '', order.public_code || 'Pedido'),
        el('span', '', `${order.customer_name || 'Cliente'} • ${order.source || 'painel'}`),
        el('b', '', money(order.total_cents)),
        el('small', '', order.payment_status || 'pending')
      );
      deals.append(card);
    }

    column.append(header, deals);
    kanban.append(column);
  }

  if (!orders.length) kanban.prepend(el('div', 'kanban-note', 'Crie a primeira venda para movimentar o fluxo.'));
}

function renderCustomers() {
  const grid = $('#customerGrid');
  if (!grid) return;
  grid.replaceChildren();

  for (const customer of customers) {
    const card = el('article', 'catalog-card');
    const initials = String(customer.name || 'C')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'C';
    const contact = customer.phone || customer.email || 'Contato não informado';
    const ordersLabel = `${Number(customer.order_count || 0)} pedido${Number(customer.order_count || 0) === 1 ? '' : 's'}`;

    card.append(
      el('div', 'product-icon', initials),
      el('strong', '', customer.name || 'Cliente'),
      el('span', '', contact),
      el('small', '', `${ordersLabel} • ${money(customer.total_spent_cents)}`)
    );
    grid.append(card);
  }

  if (!customers.length) grid.append(el('div', 'empty', 'Os clientes aparecerão aqui assim que as vendas começarem.'));
}

function conversationStatus(status) {
  if (status === 'human') return 'Humano';
  if (status === 'ai') return 'IA';
  if (status === 'closed') return 'Encerrada';
  return status || 'Sem status';
}

function renderConversations() {
  const list = $('#conversationList');
  if (!list) return;
  list.replaceChildren();

  for (const conversation of conversations) {
    const row = el('article');
    const info = el('div');
    const channel = conversation.channel_name || conversation.channel_type || 'Canal';
    const person = conversation.customer_name || conversation.customer_phone || conversation.external_id || 'Contato';
    info.append(
      el('strong', '', person),
      el('span', '', `${channel} • ${conversation.customer_phone || 'sem telefone'}`)
    );

    const state = el('b', conversation.status === 'human' || conversation.status === 'ai' ? 'on' : '', conversationStatus(conversation.status));
    row.append(info, state);

    if (conversation.status === 'human' || conversation.status === 'ai') {
      const action = el('button', 'touch soft-button', conversation.status === 'human' ? 'Devolver à IA' : 'Assumir');
      action.type = 'button';
      action.addEventListener('click', async () => {
        action.disabled = true;
        try {
          await api(`/api/conversations/${encodeURIComponent(conversation.id)}/takeover`, {
            method: 'POST',
            body: JSON.stringify({ mode: conversation.status === 'human' ? 'ai' : 'human' })
          });
          toast(conversation.status === 'human' ? 'Conversa devolvida à IA' : 'Atendimento assumido');
          await load();
        } catch (error) {
          toast(error instanceof Error ? error.message : 'Não foi possível alterar o atendimento.');
          action.disabled = false;
        }
      });
      row.append(action);
    }

    list.append(row);
  }

  if (!conversations.length) list.append(el('div', 'empty', 'Nenhuma conversa ativa ou histórica encontrada.'));
}

function renderAutomations(items) {
  const list = $('#automationList');
  if (!list) return;
  list.replaceChildren();

  for (const item of items) {
    const row = el('article');
    const info = el('div');
    info.append(
      el('strong', '', item.name || 'Automação'),
      el('span', '', `${item.trigger_type || 'evento'} → ${item.action_type || 'ação'}`)
    );

    const state = el('b', item.active ? 'on' : '', item.active ? 'Ativa' : 'Pausada');
    row.append(info, state);
    list.append(row);
  }

  if (!items.length) list.append(el('div', 'empty', 'Nenhuma automação cadastrada.'));
}

function fillSaleItems() {
  const select = $('#saleItem');
  if (!select) return;
  select.replaceChildren();

  for (const item of catalog) {
    const option = document.createElement('option');
    option.value = String(item.id || '');
    option.textContent = `${item.name || 'Item'} • ${money(item.price_cents)}`;
    select.append(option);
  }

  if (!catalog.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Cadastre um item primeiro';
    option.disabled = true;
    option.selected = true;
    select.append(option);
  }
}

function openModal(selector) {
  const modal = $(selector);
  if (!modal) return;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('open'));
}

function closeModals() {
  $$('.modal').forEach((modal) => {
    modal.classList.remove('open');
    setTimeout(() => {
      modal.hidden = true;
    }, 140);
  });
}

$('#menuBtn')?.addEventListener('click', () => $('#sidebar')?.classList.toggle('open'));

$$('.sidebar a').forEach((anchor) =>
  anchor.addEventListener('click', () => {
    $$('.sidebar a').forEach((item) => item.classList.remove('active'));
    anchor.classList.add('active');
    $('#sidebar')?.classList.remove('open');
  })
);

$('#searchBtn')?.addEventListener('click', () => {
  $('#assistant')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => $('#askInput')?.focus(), 300);
});

$('#userBadge')?.addEventListener('click', () => {
  toast(session.email ? `Conectado como ${session.email}` : `Ambiente ${session.environment || 'protegido'}`);
});

$('#refreshBtn')?.addEventListener('click', async () => {
  await load();
  toast('Painel atualizado');
});

$('#newSaleBtn')?.addEventListener('click', () => openModal('#saleModal'));
$('#newItemBtn')?.addEventListener('click', () => openModal('#itemModal'));
$$('[data-close]').forEach((button) => button.addEventListener('click', closeModals));

$$('.modal').forEach((modal) =>
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModals();
  })
);

$('#itemForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const price = Number(data.get('price'));

  if (!Number.isFinite(price) || price < 0) {
    toast('Informe um preço válido.');
    return;
  }

  try {
    await api('/api/catalog', {
      method: 'POST',
      body: JSON.stringify({
        name: data.get('name'),
        item_type: data.get('item_type'),
        category: data.get('category'),
        price_cents: Math.round(price * 100)
      })
    });
    closeModals();
    form.reset();
    toast('Item criado');
    await load();
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Não foi possível criar o item.');
  }
});

$('#saleForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const itemId = String(data.get('catalog_item_id') || '');
  const qty = Number(data.get('qty'));

  if (!itemId) {
    toast('Cadastre um item antes de criar uma venda.');
    return;
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    toast('Informe uma quantidade válida.');
    return;
  }

  try {
    const order = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        customer_name: data.get('customer_name'),
        customer_phone: data.get('customer_phone'),
        source: 'panel',
        items: [{ catalog_item_id: itemId, qty }]
      })
    });

    closeModals();
    form.reset();
    toast(`Pedido ${order.public_code} criado`);
    await load();
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Não foi possível criar o pedido.');
  }
});

function answer(question) {
  const message = $('#aiMessage');
  if (!message) return;

  const normalized = String(question || '').toLowerCase();
  if (normalized.includes('pedido')) {
    message.textContent = `Existem ${orders.filter((order) => !['done', 'cancelled'].includes(order.status)).length} pedidos em aberto no fluxo atual.`;
  } else if (normalized.includes('cat')) {
    message.textContent = `O catálogo possui ${catalog.length} itens ativos. Posso ajudar a organizar produtos, serviços e combos.`;
  } else if (normalized.includes('cliente')) {
    message.textContent = `Há ${customers.length} clientes cadastrados. O valor acumulado exibido em cada cartão desconsidera pedidos cancelados.`;
  } else if (normalized.includes('conversa') || normalized.includes('atendimento')) {
    message.textContent = `Há ${Number(metrics.activeConversations ?? 0)} conversas ativas. Você pode assumir ou devolver atendimentos à IA na Caixa de entrada.`;
  } else if (normalized.includes('prior')) {
    const newOrders = orders.filter((order) => order.status === 'new').length;
    const humanConversations = conversations.filter((conversation) => conversation.status === 'human').length;
    message.textContent = `Prioridade agora: ${newOrders} pedido(s) novo(s) e ${humanConversations} conversa(s) em atendimento humano. Depois, revise negociações sem avanço.`;
  } else {
    message.textContent = `Nesta ${session.environment === 'hml' ? 'homologação' : 'sessão'} eu já consulto dados do D1 do ambiente. A próxima camada conecta inferência de IA apenas às ações autorizadas.`;
  }
}

$$('.quick button').forEach((button) =>
  button.addEventListener('click', () => answer(button.dataset.question || ''))
);

$('#askForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#askInput');
  answer(input?.value || '');
  if (input) input.value = '';
});

if (document.body.classList.contains('dashboard')) load();
