# NegocIAJa 1.0 — checklist mestre

Estados: `[ ]` não iniciado, `[~]` implementado/parcial, `[x]` integrado e homologado.

## A. Fundação e HML
- [x] Worker HML separado da produção
- [x] D1/R2 HML separados por binding
- [x] CI: TypeScript, JS, segurança, migrations e smoke autenticado
- [x] Laboratório HML com rastreio de eventos/conversas/mensagens/outbox
- [~] Revisar/normalizar numeração das migrations sem reescrever histórico aplicado
- [ ] Exercício documentado de rollback HML

## B. Identidade, tenants e acesso
- [x] Multi-tenant e sessão sem `x-tenant-id` controlado pelo navegador
- [x] RBAC base
- [x] Equipe e papéis Owner/Admin/Gerente/Operador/Leitura
- [~] Adesão + confirmação de e-mail + trial
- [ ] Recuperação de senha/autenticação própria do tenant para produção
- [ ] Testes sistemáticos de isolamento entre dois tenants

## C. White label
- [x] Perfil empresarial e tema por tenant
- [x] Upload R2 para logo/favicon/banner/fundo de login
- [x] Validação PNG/JPG/WebP/SVG até 5 MB
- [~] Aplicar identidade em todas as telas do painel
- [~] Configurações de catálogo/documentos
- [ ] Preview final e templates PDF homologados

## D. Operação
- [x] Clientes, catálogo, pedidos e status base
- [~] Financeiro operacional
- [~] Relatórios operacionais
- [~] Documentos comerciais e sequências por tenant
- [ ] Estoque/baixa/variações/adicionais completos
- [ ] Cancelamento/estorno e histórico de mudanças

## E. Conversas e IA
- [x] Gateway inbound multimodal
- [x] Persistência de eventos, conversas, mensagens e outbox
- [x] Workflow n8n para texto/áudio/imagem
- [x] Suporte Técnico e Suporte ao Empreendedor base
- [ ] Credenciais OpenAI/Evolution HML
- [ ] Teste WhatsApp real texto
- [ ] Teste WhatsApp real áudio
- [ ] Teste WhatsApp real imagem
- [ ] Handoff humano/IA e atribuição de atendente homologados
- [ ] Medição real de tokens/custos por tenant

## F. Billing SaaS
- [x] Planos/assinaturas/faturas/pagamentos/eventos no modelo
- [x] Aviso de validade e renovação no painel
- [~] Mercado Pago Pix preparado com idempotência
- [~] Webhook de pagamento preparado
- [ ] Credenciais Mercado Pago HML
- [ ] Pagamento sandbox aprovado/recusado/duplicado homologado
- [ ] Grace period, suspensão e reativação ponta a ponta
- [ ] Cartão/recorrência homologados

## G. Vendas dos tenants
- [~] Modelo de conta de pagamento por tenant/OAuth
- [ ] OAuth Mercado Pago real por empresa
- [ ] Pix/cartão do consumidor final
- [ ] Conciliação por pedido
- [ ] Cancelamento/estorno
- [ ] Split Payments somente após validação comercial/jurídica

## H. Notificações
- [~] Resend preparado para confirmação de e-mail
- [~] Preferências e entregas persistidas
- [ ] Credencial Resend HML
- [ ] Cadastro, cobrança, pagamento, vencimento e recuperação por e-mail homologados
- [ ] WhatsApp como canal de notificação com consentimento/preferências

## I. Super Admin
- [x] Tenants, planos, usuários, agentes, canais e integrações base
- [~] Consumo IA, faturamento, logs e saúde
- [~] Bloqueio/ativação e diagnóstico
- [ ] Métricas SaaS finais: MRR, churn, trial conversion, inadimplência
- [ ] Ferramentas seguras de suporte/impersonação auditada

## J. Segurança, LGPD e produção
- [x] Origem/JSON/body limit em mutations críticas
- [x] Auditoria base
- [x] Segredos fora do Git
- [ ] Rate limiting por tenant/canal
- [ ] Política de retenção/exportação/exclusão LGPD
- [ ] Backup/export D1 antes de promoção
- [ ] Testes adversariais: tenant errado, webhook repetido, payload gigante, provider offline
- [ ] Revisão mobile/PWA
- [ ] Duas empresas de segmentos diferentes homologadas ponta a ponta
- [ ] Go-live 1.0 e rollback ensaiado

## Dependências externas que exigem ação humana/credencial
1. `OPENAI_API_KEY` no n8n HML.
2. `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` no n8n HML.
3. URL e Basic Auth da HML no n8n.
4. `RESEND_API_KEY` e remetente/domínio validado.
5. `MERCADOPAGO_ACCESS_TOKEN` HML/teste e secret de webhook.
6. Contas reais de WhatsApp/Telegram quando chegar a homologação externa.

## Regra de promoção
Nenhum item passa de `[~]` para `[x]` apenas porque existe código. Precisa estar integrado, testado no ambiente correto e ter evidência de homologação.