# NegocIAJá! — Arquitetura do Produto

## Princípio

O NegocIAJá! é independente do SERhub. O produto usa um núcleo multitenant e multissegmento que converte conversa em transação e transação em operação.

## Fluxo universal

Cliente → Canal → Conversation Engine → Agent Engine → Catalog Engine → Order/Quote/Schedule → Payment → Workflow → Fulfillment → Pós-venda → CRM.

## Motores

1. **Conversation Engine**: WhatsApp, web, Telegram e futuros canais.
2. **Agent Engine**: interpretação multimodal, ferramentas e regras de autorização.
3. **Catalog Engine**: produto, serviço, combo, variantes, adicionais, medidas e preço dinâmico.
4. **Transaction Engine**: pedido, orçamento, reserva, agendamento e assinatura.
5. **Workflow Engine**: etapas configuráveis por segmento/tenant.
6. **Payment Engine**: PIX, links, cartão e confirmações por webhook.
7. **Event/Automation Engine**: recuperação de vendas, status, cobrança e pós-venda.
8. **CRM/Intelligence**: histórico, segmentação, recorrência e oportunidades.

## Segurança operacional

- Toda ação pertence a um tenant.
- Agente consulta ferramentas; não recebe acesso irrestrito ao banco.
- Ações sensíveis exigem aprovação humana configurável.
- Toda ação relevante gera audit log.
- Segredos de integrações não devem ser armazenados em texto puro no D1.
- Uploads ficam em R2 e metadados no D1.

## UX

Mobile-first, interface clean, alta legibilidade, alvo touch mínimo de 44px, feedback visual em todas as ações, cores fortes usadas para hierarquia e conversão.
