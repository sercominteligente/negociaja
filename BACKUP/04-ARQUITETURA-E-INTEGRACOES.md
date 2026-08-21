# Arquitetura e integrações — NegocIAJá!

## Ambientes

### Produção

- domínio público: `negociaja.com.br`;
- Worker/rotas de produção separados de HML;
- produção não deve receber mudanças de homologação sem promoção explícita.

### Homologação

- Worker: `negociaja-hml`;
- URL usada durante os testes: `https://negociaja-hml.sercomvisual.workers.dev`;
- D1 HML dedicado;
- R2 HML dedicado;
- Basic Auth/controles próprios de HML;
- deploy via GitHub Actions + Wrangler.

## Repositório

- GitHub: `sercominteligente/negociaja`;
- branch operacional de homologação: `hml`;
- CI principal: `.github/workflows/ci.yml`;
- deploy HML: `.github/workflows/deploy-hml.yml`.

## Cloudflare

### Workers

Responsabilidades:

- gateway HTTP;
- autenticação/autorização;
- APIs de negócio;
- assets públicos;
- health checks;
- integração D1/R2;
- suporte a webhooks e chamadas máquina-a-máquina.

Uma decisão arquitetural importante da recuperação foi separar páginas/assets estáticos da cadeia profunda de gateways para evitar Error 1101.

### D1

Armazena domínio multi-tenant, usuários, RBAC, catálogo, clientes, pedidos, assinaturas, integrações, logs/eventos, aprovações IA, outbox e demais entidades.

### R2

Usado para:

- logos de tenants;
- imagens de produtos;
- PDFs/documentos binários;
- outros assets comerciais.

## Segurança

- HML protegida por autenticação própria;
- produção deve usar Cloudflare Access/identidade real conforme configuração final;
- RBAC separa `super_admin`, admin/owner e operadores;
- mutações humanas usam validação de Origin;
- endpoints máquina-a-máquina usam tokens próprios;
- secrets não devem ser commitados.

## Camadas de integração

### OpenAI

Usos planejados/implementados:

- IA Assist;
- suporte técnico;
- suporte ao empreendedor;
- interpretação de mensagens;
- multimodal;
- tool calling/ações;
- telemetria de uso/custo.

### Evolution API

Responsável pela conectividade WhatsApp.

Necessidades HML:

- URL;
- API key;
- instância;
- webhooks;
- envio/recebimento de texto e mídia;
- eventos de conexão/entrega.

### n8n

Workflows versionados em `integrations/n8n/`.

Principais fluxos:

- multimodal HML;
- Outbox Dispatcher.

O n8n deve orquestrar entradas externas, OpenAI, Evolution e APIs internas sem transformar segredos em código versionado.

### Outbox

Objetivo: confiabilidade de efeitos externos.

Características:

- eventos persistidos;
- claim;
- retry;
- idempotência;
- token de serviço;
- logs;
- health.

### Resend

Responsável pelos e-mails transacionais de cadastro, confirmação, cobrança, pagamento, vencimento e notificações.

### Mercado Pago

Primeira etapa: sandbox.

Dois contextos devem permanecer separados:

- assinatura do NegocIAJá;
- pagamentos das vendas do tenant.

Split/marketplace real é etapa posterior à validação jurídica/financeira.

### Telegram

Canal adicional de atendimento. Deve respeitar tenant, persistência de conversa, IA e permissões.

## Fluxo de atendimento alvo

1. Mensagem chega por WhatsApp/Telegram.
2. Canal identifica tenant e cliente.
3. Conversa é persistida.
4. Conteúdo é normalizado (texto/áudio/imagem).
5. IA recebe contexto do tenant, catálogo e regras.
6. IA responde ou solicita execução de ferramenta.
7. Ações sensíveis podem exigir aprovação humana.
8. Pedido/cliente/estoque/financeiro são atualizados quando aplicável.
9. Resposta externa é entregue via Outbox/canal.
10. Logs, health e consumo IA são registrados.

## Fluxo de assinatura SaaS alvo

1. Empresa se cadastra.
2. E-mail de adesão/confirmação é enviado.
3. Conta é liberada após confirmação.
4. Trial/plano é associado.
5. Sistema exibe prazo de uso de forma discreta.
6. Próximo ao vencimento, gera cobrança e avisos.
7. Usuário pode antecipar pagamento.
8. Mercado Pago processa Pix/cartão.
9. Webhook idempotente atualiza assinatura/fatura.
10. Em suspensão/vencimento, acesso operacional é controlado e opções de pagamento continuam disponíveis.

## Observabilidade

O Super Admin deve ser o cockpit de:

- saúde de integrações;
- alertas;
- consumo IA;
- falhas por tenant;
- logs;
- billing SaaS;
- prontidão de release.

## Arquivos de referência no repositório

- `docs/ARCHITECTURE.md`
- `docs/CLOUDFLARE.md`
- `docs/HML.md`
- `docs/HML-MANUAL-CONFIG.md`
- `docs/HML-TEST-MATRIX.md`
- `docs/NEGOCIAJA-1.0-CHECKLIST.md`
- `docs/PROJECT_HANDOFF.md`
- `integrations/n8n/*`
- `migrations/*`
- `wrangler.jsonc`
