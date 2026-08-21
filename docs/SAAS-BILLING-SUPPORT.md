# NegocIAJa SaaS, cobranca e suporte

## Dois trilhos financeiros

1. **Billing da plataforma**: assinatura/licenca paga pela empresa ao NegocIAJa. Mercado Pago e o primeiro provider previsto.
2. **Pagamentos da empresa**: vendas do cliente final pertencem ao tenant. A arquitetura prevista usa conexao OAuth da conta do proprio estabelecimento. Split/marketplace fica fora da primeira homologacao.

## Ciclo do tenant

`pending_email -> trial -> active -> past_due -> suspended -> cancelled`

Nenhum dado e apagado quando a assinatura vence. Suspensao restringe operacoes, mantendo acesso ao fluxo de renovacao.

## Cadastro

1. Criar tenant e usuario administrador em estado pendente.
2. Criar verificacao de email com token armazenado apenas como hash.
3. Confirmar email.
4. Ativar trial ou assinatura.
5. Executar onboarding da empresa.

## Regua de renovacao

- D-15: lembrete discreto.
- D-7: banner no painel e CTA de renovacao.
- D-3: alerta prioritario.
- D0: fatura vencendo/vencida e notificacoes.
- Grace period configuravel por plano.
- Apos grace: `suspended`, preservando dados e tela de pagamento.

## Suporte IA

O painel da empresa tera dois modos:

- **Suporte Tecnico**: ajuda de uso, configuracoes, integracoes, erros e abertura de ticket.
- **Suporte ao Empreendedor**: vendas, operacao, atendimento, estoque, precificacao e indicadores do proprio tenant.

Ferramentas de consulta devem ser read-only por padrao. Acoes destrutivas, financeiras, descontos, disparos em massa e mudancas operacionais exigem permissao/autorizacao apropriada.

## Seguranca

- Nunca armazenar tokens OAuth em texto puro no D1.
- Webhooks precisam de validacao de origem/assinatura e idempotencia.
- `payment_events` registra eventos antes do processamento.
- IDs externos de pagamento/evento possuem protecao contra duplicidade.
- Toda mudanca sensivel deve gerar `audit_logs`.

## HML

A migration 0004 cria a fundacao de dados. Integracoes reais de Mercado Pago, email e WhatsApp devem permanecer separadas por ambiente e usar segredos do Worker, nunca valores versionados no Git.
