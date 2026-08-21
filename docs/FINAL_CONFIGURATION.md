# NegocIAJá! — Configuração final

> Desenvolvido pela **SER Comunicação** — CNPJ 23.296.513/0001-97. Todos os direitos reservados.

Este documento separa o que já pertence ao código do que exige credenciais/recursos externos. **Nunca versionar tokens, chaves ou segredos.**

## 1. Secrets do Worker

Configurar por ambiente com `wrangler secret put NOME_DO_SECRET` ou pelo painel Cloudflare:

- `OPENAI_API_KEY` — obrigatório para o agente IA.
- `OPENAI_AGENT_MODEL` — opcional; modelo do agente.
- `OPENAI_TRANSCRIBE_MODEL` — opcional; transcrição de áudio.
- `OPENAI_VISION_MODEL` — opcional; interpretação de imagens.
- `RESEND_API_KEY` — obrigatório para confirmação e notificações por e-mail.
- `EMAIL_FROM` — remetente verificado no Resend.
- `CREDENTIALS_KEY` — chave forte exclusiva para criptografia de credenciais de tenants.
- `MERCADOPAGO_ACCESS_TOKEN` — Access Token da conta da plataforma.
- `MERCADOPAGO_WEBHOOK_SECRET` — assinatura secreta configurada no webhook do Mercado Pago.
- `HML_BOOTSTRAP_TOKEN` — somente homologação/bootstrap administrativo.

## 2. Mercado Pago

Webhook público: `https://SEU-DOMINIO/webhooks/mercadopago`

Eventos utilizados pelo runtime:
- `subscription_preapproval`
- `payment`
- `subscription_authorized_payment`

O Worker valida `x-signature` com HMAC-SHA256 e, depois, consulta o recurso diretamente na API do Mercado Pago antes de atualizar D1.

## 3. Cloudflare Queue

Criar uma Queue principal e uma DLQ. Depois adicionar o binding `AGENT_QUEUE` ao `wrangler.jsonc` de cada ambiente. O código funciona sem a Queue para navegação/configuração, mas atendimento assíncrono de IA requer o binding.

Recomendação de nomes:
- produção: `negociaja-agent`
- DLQ produção: `negociaja-agent-dlq`
- homologação: `negociaja-hml-agent`
- DLQ homologação: `negociaja-hml-agent-dlq`

Configurar retry/dead-letter no consumer e validar em `/operacoes` que `Agent Queue = Pronta`.

## 4. WhatsApp / Evolution

Cada tenant cadastra sua conexão no cockpit de canal. Manter URL/token/instance por tenant. Não compartilhar uma credencial entre empresas. O webhook Evolution deve apontar para a rota pública configurada pelo cockpit e os eventos de mensagens devem incluir `messages.upsert`.

## 5. D1 e R2

Recursos existentes e que não devem ser recriados:
- D1: `negocia-ja-bd`
- R2: `negocia-ja-files`

Aplicar migrations primeiro em HML e somente depois em produção. O CI aplica todas as migrations localmente antes de aceitar código.

## 6. Gate final antes do go-live

1. CI verde: copyright, TypeScript, JavaScript, migrations D1 e Worker dry-run.
2. HML com migrations remotas aplicadas.
3. `/operacoes` sem jobs/webhooks presos em falha.
4. `/plano` mostrando provider pronto após inserir secrets do Mercado Pago.
5. Cadastro + confirmação de e-mail testados com Resend real.
6. Tenant fictício A e B sem vazamento cruzado de dados.
7. WhatsApp de teste recebendo texto, áudio e imagem.
8. IA criando ação e aguardando aprovação humana quando a política exigir.
9. Pedido baixando estoque uma única vez.
10. Assinatura de teste ativando e cancelando corretamente.
11. Backup/export D1 realizado antes do primeiro deploy de produção.
12. Plano de rollback: manter SHA/tag do último release estável e migrations aditivas/reversíveis sempre que possível.

## 7. Telas de verificação

- `/super-admin` — tenants e acesso administrativo.
- `/operacoes` — Queue, webhooks, canais e assinaturas.
- `/plano` — plano/ciclo/checkout do tenant.
- `/inbox` — Conversation Hub.
- `/acoes-ia` — ações que aguardam aprovação.
- `/canal-whatsapp` — conexão do canal.

Quando todos os itens acima estiverem verdes, o restante é configuração das credenciais reais e publicação controlada.
