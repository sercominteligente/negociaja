# NegocIAJá HML - Outbox Dispatcher

Workflow: `negociaja-hml-outbox-dispatcher.json`

## Objetivo

Consumir somente ações externas que já passaram pela aprovação humana no NegocIAJá!, enviá-las pelo provedor adequado e confirmar o resultado na Outbox.

O workflow não cria nem aprova ações. Ele é apenas o transportador entre a Outbox e os canais externos.

## Variáveis de ambiente do n8n

- `NEGOCIAJA_HML_URL`: URL base do Worker HML, sem barra final.
- `NEGOCIAJA_OUTBOX_TOKEN`: mesmo valor configurado como secret `OUTBOX_SERVICE_TOKEN` no Worker HML.
- `EVOLUTION_API_URL`: URL base da Evolution API.
- `EVOLUTION_API_KEY`: API key da Evolution.
- `EVOLUTION_INSTANCE`: nome da instância WhatsApp usada para a HML.
- `TELEGRAM_BOT_TOKEN`: token do bot Telegram, somente quando o canal Telegram for ativado.

Nenhum desses valores deve ser gravado dentro do JSON do workflow ou versionado no Git.

## Fluxo

1. A cada minuto, o n8n chama `/api/integrations/outbox/claim` e recebe até 10 itens disponíveis.
2. Cada item fica em `dispatching` com um `claim_token`, impedindo outro worker de despachar a mesma mensagem.
3. O Switch direciona `whatsapp` para Evolution e `telegram` para Telegram Bot API.
4. Depois do aceite do provedor, o n8n chama `/api/integrations/outbox/:id/ack` com `status: sent`.
5. Canais não suportados são encerrados como falha permanente.
6. Claims abandonados por mais de 15 minutos voltam automaticamente para `queued` no próximo claim.

## Falhas e retry

Para falhas transitórias, o endpoint de ACK aceita:

```json
{
  "status": "failed",
  "claim_token": "claim_...",
  "retryable": true,
  "retry_after_minutes": 5,
  "error": "descrição resumida"
}
```

O item volta para `queued` e só poderá ser reclamado quando `next_attempt_at` vencer. Para erro definitivo, use `retryable: false`.

## Homologação

Antes de ativar o workflow, valide separadamente as credenciais Evolution/Telegram. O workflow vem `active: false` propositalmente. Ative somente depois que `OUTBOX_SERVICE_TOKEN`, Evolution e, se aplicável, Telegram estiverem configurados no ambiente HML.
