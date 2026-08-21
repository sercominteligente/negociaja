# Customer Commerce Loop — NegocIAJá!

> SER Comunicação — CNPJ 23.296.513/0001-97 — Todos os direitos reservados.

O Customer Commerce Loop é o ciclo universal da experiência do comprador. O core não contém regras exclusivas de restaurante, delivery, varejo ou serviços.

## Ciclo

1. **Descobrir** — catálogo público por tenant, busca e disponibilidade.
2. **Negociar** — Conversation Hub e IA consultam dados reais.
3. **Comprar/contratar** — carrinho converte para o mesmo `order-service` usado por painel e IA.
4. **Acompanhar** — pedido segue `workflow_templates`/`workflow_steps`, configuráveis por empresa.
5. **Repetir** — pedidos vinculados à sessão podem reconstruir o carrinho com preços/estoque atuais no checkout.
6. **Reconquistar** — etapa futura usa abandono, recorrência e comportamento com consentimento e limites de frequência.

## O que está nesta primeira entrega

- rota pública `/loja/:tenant_slug`;
- branding e ativação da vitrine por tenant;
- sessão anônima com token armazenado somente como hash no D1;
- catálogo ativo isolado por tenant;
- carrinho persistente da sessão;
- validação de estoque antes e durante a criação do pedido;
- checkout para o `order-service` auditado;
- histórico de pedidos da própria sessão;
- repetir pedido sem acessar pedidos de outra sessão;
- personalização de login por empresa;
- landing institucional com mídia gerenciada pelo Super Admin.

## Próximas camadas do Loop

- timeline pública detalhada dos eventos do workflow;
- magic link/OTP para histórico em outro dispositivo;
- notificações automáticas de mudança de etapa;
- recuperação de carrinho abandonado;
- favoritos/listas de recompra;
- cupons, fidelidade e benefícios;
- avaliações e pós-venda;
- públicos comportamentais para integração futura com AnuncIAJá.

## Regra arquitetural

Nunca adicionar ao core um campo ou estado que só faça sentido para um vertical. Particularidades devem viver em templates, schema configurável, campos customizados ou adapters.
