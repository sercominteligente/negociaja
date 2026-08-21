# O que falta fazer — NegocIAJá!

## Prioridade imediata antes das integrações externas

1. Validar visualmente o PR #36 em landing, painel e Super Admin.
2. Confirmar que não existem logos duplicados em desktop/mobile.
3. Confirmar favicon usando somente o símbolo balão+carrinho.
4. Confirmar manifest/PWA/APK usando a versão vertical com balão acima do nome.
5. Executar uma varredura das páginas e módulos internos procurando:
   - links quebrados;
   - endpoints 404/500;
   - estados vazios sem tratamento;
   - botões que não executam ação;
   - páginas que não respeitam tenant/RBAC;
   - inconsistências de mobile/PWA.
6. Consolidar qualquer drift residual de migrations/schema HML sem reescrever histórico aplicado.

## Configurações manuais de HML

### 1. OpenAI

Configurar segredo HML e validar:

- chat básico;
- uso de ferramentas;
- limites/erros;
- custo/telemetria;
- suporte inteligente;
- multimodal quando aplicável.

Gate de saída: IA Assist e suporte respondendo sem mocks em HML.

### 2. Evolution API / WhatsApp

Configurar:

- URL da Evolution;
- API key;
- instância/canal NegocIAJá HML;
- webhook de entrada;
- webhook/evento de status;
- envio de texto, mídia e áudio.

Gate de saída: mensagem real entra pelo WhatsApp, é persistida e recebe resposta.

### 3. n8n

Importar/ativar:

- `integrations/n8n/negociaja-hml-multimodal.json`;
- `integrations/n8n/negociaja-hml-outbox-dispatcher.json`.

Configurar variáveis necessárias:

- `OPENAI_API_KEY`;
- `NEGOCIAJA_HML_URL`;
- credencial Basic Auth HML;
- `EVOLUTION_API_URL`;
- `EVOLUTION_API_KEY`;
- instância Evolution;
- token de Outbox.

Homologar texto, áudio, imagem, retries e idempotência.

### 4. Outbox Dispatcher

Configurar token de serviço e validar:

- claim de eventos;
- entrega;
- retry;
- idempotência;
- dead-letter/erro final;
- logs/health.

### 5. Resend

Configurar domínio/remetente e segredo HML.

Homologar e-mails:

- adesão/cadastro da empresa;
- confirmação de e-mail;
- boas-vindas/liberação;
- cobrança;
- pagamento aprovado;
- vencimento próximo;
- licença vencida/suspensa;
- recuperação/notificações relevantes.

### 6. Mercado Pago sandbox

Homologar separadamente:

- cobrança do plano SaaS;
- Pix;
- cartão;
- webhook;
- assinatura/fatura;
- evento duplicado;
- idempotência;
- conciliação;
- cancelamento;
- estorno;
- falha/expiração;
- renovação antecipada.

Não ativar split/marketplace real sem validação jurídica e financeira.

### 7. Telegram

Conectar bot/canal HML e homologar:

- entrada;
- saída;
- identificação do tenant;
- persistência de conversa;
- IA;
- mídia quando suportada.

## Homologação de produto

### Tenant A

Usar cenário de varejo/loja:

- personalização;
- catálogo com imagens;
- variações;
- estoque;
- cliente;
- conversa;
- pedido;
- cobrança;
- documentos;
- relatórios.

### Tenant B

Usar cenário de serviço/comunicação visual ou outro segmento:

- serviços e produtos combinados;
- personalização distinta;
- equipe/operadores;
- permissões;
- fluxo de orçamento/pedido;
- IA adaptada ao negócio.

Objetivo: provar isolamento multi-tenant e adaptabilidade real.

## Mobile/PWA

Testar em largura de celular real:

- sidebar/menu;
- cabeçalhos;
- kanban horizontal;
- formulários;
- upload de imagem;
- suporte inteligente;
- pagamentos;
- onboarding;
- instalação PWA;
- ícones;
- splash/manifest quando aplicável;
- navegação sem overflow destrutivo.

## Super Admin — fechamento para 1.0

Validar:

- criação/edição/bloqueio de empresa;
- planos;
- assinaturas;
- usuários;
- agentes IA;
- canais;
- integrações;
- consumo IA;
- faturamento;
- health checks;
- logs;
- saúde detalhada;
- prontidão HML;
- diagnósticos de provider;
- visibilidade de falhas por tenant.

## Backup e rollback

Antes do go-live:

- backup D1;
- backup/manifest de R2;
- tag/commit de release;
- snapshot de configuração;
- ensaio de rollback do Worker;
- ensaio de rollback/migration compatível;
- checklist de validação após rollback.

## Go-live 1.0

Só promover após:

- CI verde;
- HML estável;
- dois tenants ponta a ponta;
- WhatsApp real homologado;
- e-mail homologado;
- Mercado Pago sandbox homologado;
- logs e health sem bloqueadores;
- mobile/PWA aprovado;
- backup e rollback ensaiados;
- segredos de produção separados dos de HML;
- checklist final assinado.

## Ordem recomendada de execução

1. Fechamento interno de páginas/módulos.
2. OpenAI.
3. Evolution + WhatsApp.
4. n8n multimodal.
5. Outbox.
6. Resend.
7. Mercado Pago sandbox.
8. Telegram.
9. Dois tenants ponta a ponta.
10. Mobile/PWA completo.
11. Backup/rollback final.
12. Go-live 1.0.
