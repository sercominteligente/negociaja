# NegocIAJá HML — configuração manual dos providers

Este runbook começa somente depois que CI e deploy da HML estiverem verdes. Nunca copie credenciais de produção para HML sem necessidade.

## Ordem recomendada
1. OpenAI
2. Evolution + WhatsApp
3. n8n multimodal
4. Outbox Dispatcher
5. Resend
6. Mercado Pago sandbox
7. Telegram

## 1. OpenAI no n8n
Variável no ambiente do n8n:
- `OPENAI_API_KEY`

Validação:
- executar separadamente o node `OpenAI Responses`;
- executar `Transcribe Audio` com um áudio de teste;
- não registrar a chave em JSON, logs ou Git.

## 2. Evolution / WhatsApp HML
Variáveis no n8n:
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE`

Na instância Evolution:
- conectar um número dedicado de homologação;
- ativar entrega de mídia/base64;
- apontar o webhook para o endpoint de produção do workflow `NegocIAJá HML - Evolution Multimodal`;
- validar eventos de texto, áudio e imagem separadamente.

## 3. NegocIAJá HML no n8n
Variáveis:
- `NEGOCIAJA_HML_URL=https://negociaja-hml.sercomvisual.workers.dev`
- `NEGOCIAJA_HML_BASIC_AUTH` com o header Authorization completo usado pela HML.

O workflow multimodal usa essas variáveis para registrar inbound/outbound sem gravar segredo no JSON.

## 4. Outbox Dispatcher
Worker HML:
- secret `OUTBOX_SERVICE_TOKEN`.

n8n:
- `NEGOCIAJA_OUTBOX_TOKEN` com exatamente o mesmo valor.

O dispatcher permanece desativado até o teste individual dos providers. Depois de ativado, o fluxo é `claim -> provider -> ack/retry`.

## 5. Resend
Worker HML:
- `RESEND_API_KEY` como secret;
- domínio/remetente de HML previamente validado.

Homologar, nesta ordem:
1. confirmação de adesão;
2. boas-vindas;
3. cobrança/renovação;
4. pagamento confirmado;
5. aviso de vencimento/suspensão.

## 6. Mercado Pago sandbox
Worker HML:
- `MERCADOPAGO_ACCESS_TOKEN` de teste;
- secret de assinatura/webhook conforme aplicação de sandbox.

Homologar:
1. criação de Pix;
2. pagamento aprovado;
3. pagamento recusado;
4. webhook repetido/idempotência;
5. reativação de licença;
6. cancelamento/estorno quando disponível no fluxo testado.

Nunca usar movimentação real enquanto a HML estiver em homologação.

## 7. Telegram
n8n:
- `TELEGRAM_BOT_TOKEN`.

Ativar apenas depois do WhatsApp, pois o WhatsApp é o canal prioritário do projeto.

## Gate de saída
A integração só muda para HOMOLOGADA quando houver evidência ponta a ponta no Cockpit de Saúde: último sucesso, ausência de erro crítico, persistência no D1 e evento correspondente no histórico/outbox.
