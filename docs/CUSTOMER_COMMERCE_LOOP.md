# Customer Commerce Loop — NegocIAJá!

> SER Comunicação — CNPJ 23.296.513/0001-97 — Todos os direitos reservados.

O Customer Commerce Loop é o ciclo universal da experiência do comprador. O core não contém regras exclusivas de restaurante, delivery, varejo ou serviços.

## Ciclo

1. **Descobrir** — catálogo público por tenant, busca e disponibilidade.
2. **Negociar** — Conversation Hub e IA consultam dados reais.
3. **Comprar/contratar** — carrinho converte para o mesmo `order-service` usado por painel e IA.
4. **Acompanhar** — pedido segue `workflow_templates`/`workflow_steps`, configuráveis por empresa.
5. **Repetir** — pedidos vinculados à sessão podem reconstruir o carrinho com preços/estoque atuais no checkout.
6. **Reconquistar** — abandono, recorrência e comportamento podem alimentar automações do próprio NegocIAJá!, sempre com consentimento e limites de frequência.

## O que está nesta entrega

- rota pública `/loja/:tenant_slug`;
- branding e ativação da vitrine por tenant;
- sessão anônima com token armazenado somente como hash no D1;
- catálogo ativo isolado por tenant;
- carrinho persistente da sessão;
- validação de estoque antes e durante a criação do pedido;
- checkout para o `order-service` auditado;
- histórico de pedidos da própria sessão;
- timeline pública protegida dos eventos do pedido;
- repetir pedido sem acessar pedidos de outra sessão;
- eventos de jornada para métricas, recuperação e retenção;
- base de identidade para recuperação segura entre dispositivos;
- personalização de login por empresa;
- landing institucional com mídia gerenciada pelo Super Admin.

## Próximas camadas do Loop

- magic link/OTP para histórico em outro dispositivo;
- notificações automáticas de mudança de etapa;
- recuperação de carrinho abandonado;
- favoritos/listas de recompra;
- cupons, fidelidade e benefícios;
- avaliações e pós-venda;
- segmentação comportamental e campanhas internas do próprio NegocIAJá!;
- métricas de conversão, recompra, abandono e retenção por tenant.

## Regra arquitetural

Nunca adicionar ao core um campo ou estado que só faça sentido para um vertical. Particularidades devem viver em templates, schema configurável, campos customizados ou adapters.
