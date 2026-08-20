# NegocIAJa 1.0 — checklist mestre

Estados: `[ ]` não iniciado, `[~]` implementado/parcial, `[x]` integrado e homologado por CI/HML local. Itens que dependem de provider externo permanecem parciais até teste real.

## A. Fundação e HML
- [x] Worker HML separado da produção
- [x] D1/R2 HML separados por binding
- [x] CI: TypeScript, JS, segurança, migrations e smoke autenticado
- [x] Laboratório HML com rastreio de eventos/conversas/mensagens/outbox
- [x] Guard de migrations impede novas duplicidades e preserva o par legado 0004 sem reescrever histórico
- [ ] Exercício documentado de rollback HML remoto

## B. Identidade, tenants e acesso
- [x] Multi-tenant e sessão sem `x-tenant-id` controlado pelo navegador
- [x] RBAC base
- [x] Perfis granulares editáveis por tenant para Gerente/Operador/Leitura
- [x] Equipe e papéis Owner/Admin/Gerente/Operador/Leitura
- [~] Adesão + confirmação de e-mail + trial; fluxo interno pronto, confirmação real depende do Resend HML
- [ ] Recuperação de senha/autenticação própria do tenant para produção
- [x] Testes sistemáticos de isolamento com segundo tenant em pedido, catálogo, documento, IA e exportação

## C. White label
- [x] Perfil empresarial e tema por tenant
- [x] Upload R2 para logo/favicon/banner/fundo de login
- [x] Validação PNG/JPG/WebP/SVG até 5 MB
- [x] Identidade aplicada em desktop/mobile, título, favicon, cores e mensagens do tenant
- [x] Configurações e numeração de catálogo/documentos por tenant
- [x] PDF binário real de ORC/PED/REC/FAT gerado no Worker e persistido no R2
- [~] Revisão visual humana final dos templates para diferentes marcas/segmentos

## D. Operação
- [x] Clientes, catálogo, pedidos e status base
- [x] Estoque transacional, baixa manual, movimentações e venda externa
- [x] Variações de catálogo com SKU, preço adicional, estoque e ativação
- [x] Contas a receber, baixa parcial/total e histórico financeiro base
- [x] Edição de pedido, histórico e cancelamento controlado
- [~] Estorno financeiro real depende do provider de pagamento
- [~] Relatórios operacionais base; faltam exportações e revisão histórica ampliada
- [x] Documentos comerciais, snapshots, sequências por tenant e PDFs no R2

## E. Conversas e IA
- [x] Gateway inbound multimodal
- [x] Persistência de eventos, conversas, mensagens e outbox
- [x] Workflow n8n importável para texto/áudio/imagem
- [x] Ferramentas de leitura da IA para cliente, pedido, recebíveis e catálogo com escopo do tenant
- [x] Fila de Aprovações IA com revisão humana obrigatória
- [x] Execução controlada de ações aprovadas
- [x] Outbox transacional para ações externas
- [x] Protocolo seguro claim/ACK/retry para n8n/providers
- [x] Dispatcher n8n importável para WhatsApp/Evolution e Telegram, desativado por padrão
- [x] Suporte Técnico e Suporte ao Empreendedor base
- [ ] Credenciais OpenAI/Evolution HML
- [ ] Teste WhatsApp real texto
- [ ] Teste WhatsApp real áudio
- [ ] Teste WhatsApp real imagem
- [ ] Teste Telegram real
- [~] Handoff humano/IA existe na base; falta homologação externa com atendente real
- [ ] Medição real de tokens/custos por tenant com provider conectado

## F. Billing SaaS
- [x] Planos/assinaturas/faturas/pagamentos/eventos no modelo
- [x] Aviso de validade e renovação no painel
- [x] Ciclo trial/active/past_due/grace/suspended com bloqueio operacional e dados preservados
- [x] Pagamento/suporte permanecem acessíveis durante suspensão
- [~] Mercado Pago Pix preparado com idempotência
- [~] Webhook de pagamento preparado
- [ ] Credenciais Mercado Pago HML
- [ ] Pagamento sandbox aprovado/recusado/duplicado homologado
- [~] Reativação automática está preparada, mas depende do webhook real do provider para homologação ponta a ponta
- [ ] Cartão/recorrência homologados

## G. Vendas dos tenants
- [~] Modelo de conta de pagamento por tenant/OAuth
- [ ] OAuth Mercado Pago real por empresa
- [ ] Pix/cartão do consumidor final em provider real
- [~] Recebível/conciliação interna por pedido implementados; conciliação externa depende do provider
- [~] Cancelamento interno implementado; estorno externo pendente
- [ ] Split Payments somente após validação comercial/jurídica

## H. Notificações
- [~] Resend preparado para confirmação de e-mail
- [~] Preferências e entregas persistidas
- [x] Ações externas aprovadas contam com Outbox, claim, ACK, falha e retry
- [ ] Credencial Resend HML
- [ ] Cadastro, cobrança, pagamento, vencimento e recuperação por e-mail homologados
- [~] WhatsApp/Telegram preparados como canais de entrega; consentimento e provider real ainda precisam de homologação

## I. Super Admin
- [x] Tenants, planos, usuários, agentes, canais e integrações base
- [x] SaaS Pulse com MRR, ARR, receita recente, trials, inadimplência, suspensões e churn recente
- [~] Consumo IA, faturamento, logs e saúde; consumo real depende do provider conectado
- [~] Bloqueio/ativação e diagnóstico
- [x] Fila de governança das ações da IA e auditoria de revisão/execução
- [ ] Ferramentas seguras de suporte/impersonação auditada

## J. Segurança, LGPD e produção
- [x] Origem/JSON/body limit em mutations críticas
- [x] Auditoria base
- [x] Segredos fora do Git
- [x] Rate limiting persistente por tenant/método/grupo de rota com 429 + Retry-After
- [x] Política-base de retenção por tenant
- [x] Exportação LGPD segregada por tenant e persistida no R2
- [x] Solicitação de exclusão com confirmação explícita, janela de 7 dias e cancelamento
- [~] Exclusão destrutiva automática deliberadamente não habilitada antes da política final de retenção/legal hold
- [ ] Backup/export D1 remoto antes de promoção
- [x] Testes adversariais locais: tenant errado, webhook/evento repetido, payload inválido/grande, idempotência, provider/outbox retry
- [~] Revisão mobile/PWA funcional em várias telas; falta inspeção humana final ampla
- [ ] Duas empresas reais/de homologação de segmentos diferentes ponta a ponta
- [ ] Go-live 1.0 e rollback ensaiado

## Dependências externas que exigem ação humana/credencial
1. `OPENAI_API_KEY` no n8n HML.
2. `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e instância HML.
3. `OUTBOX_SERVICE_TOKEN` no Worker HML e o mesmo valor como `NEGOCIAJA_OUTBOX_TOKEN` no n8n.
4. URL e Basic Auth da HML no n8n.
5. `TELEGRAM_BOT_TOKEN` quando homologarmos Telegram.
6. `RESEND_API_KEY` e remetente/domínio validado.
7. `MERCADOPAGO_ACCESS_TOKEN` HML/teste e secret de webhook.

## Regra de promoção
Nenhum item passa de `[~]` para `[x]` apenas porque existe código. Precisa estar integrado, testado no ambiente correto e ter evidência de homologação. Teste local/CI não substitui homologação externa para OpenAI, Evolution, Telegram, Resend ou Mercado Pago.
