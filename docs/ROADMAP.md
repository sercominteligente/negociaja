# Roadmap NegocIAJá!

> Desenvolvido pela **SER Comunicação** — CNPJ 23.296.513/0001-97. Todos os direitos reservados.

## Legenda
- `[x]` implementado no `main`
- `[~]` implementado, mas depende de configuração externa e/ou homologação ponta a ponta
- `[ ]` evolução futura

## Fase 1 — Fundação SaaS
- [x] Worker único `negociaja`
- [x] D1 `negocia-ja-bd` e R2 `negocia-ja-files`
- [x] catálogo adaptável e CRUD visual
- [x] workflow base e automações base
- [x] criação e avanço de pedidos pelo painel
- [x] autenticação real, cookie seguro e sessão persistida por hash
- [x] isolamento multi-tenant no servidor
- [x] RBAC Super Admin, Admin e Operador
- [x] audit log de ações sensíveis
- [x] cadastro público de empresa e administrador
- [x] confirmação de e-mail e ativação automática de trial
- [~] entrega real de e-mail via Resend
- [x] onboarding da empresa
- [x] segmentos amplos + opção Outros
- [x] branding por tenant com logo, cores, login e documentos
- [x] gestão visual de equipe e convites seguros
- [x] seletor operacional de tenant no Super Admin
- [x] assinatura SER Comunicação e verificação de copyright no CI

## Fase 2 — Conversação e IA
- [x] Conversation Hub com conversas, mensagens e eventos
- [x] Inbox visual com histórico
- [x] human takeover, assignment, devolução para IA e encerramento
- [x] adapter WhatsApp/Evolution inbound e outbound
- [x] webhook por tenant com token hash e idempotência
- [x] credenciais Evolution criptografadas com AES-GCM
- [x] mídia recebida e armazenada no R2
- [x] entrega autenticada de mídia no Inbox
- [x] webchat público por tenant
- [x] transcrição de áudio via OpenAI
- [x] análise de imagem via OpenAI
- [x] Agent Tool Gateway com trilha de auditoria
- [x] ações de escrita com aprovação humana
- [x] Agent Runtime conversacional
- [x] pré-processamento multimodal automático antes do agente
- [x] processamento assíncrono preparado com jobs idempotentes
- [~] Cloudflare Queue + DLQ para produção
- [~] validação real de texto, áudio, imagem, retries e takeover com credenciais finais

## Fase 3 — Venda e Customer Commerce Loop
- [x] vitrine pública universal por tenant
- [x] catálogo e carrinho persistente
- [x] checkout conectado ao serviço auditado de pedidos
- [x] baixa transacional de estoque
- [x] timeline e histórico do pedido
- [x] repetir pedido / recompra
- [x] recuperação segura de histórico entre dispositivos
- [x] preferências de comunicação e consentimento
- [x] recuperação de carrinho preparada
- [x] pós-venda e avaliação com token seguro
- [x] Commerce Insights com conversão, abandono, recompra e satisfação
- [x] cron de lifecycle a cada 15 minutos
- [~] homologação completa com dois tenants fictícios
- [ ] orçamento comercial universal
- [ ] adicionais e variantes avançadas
- [ ] entrega/retirada com adapters por segmento

## Fase 4 — Billing e operação da plataforma
- [x] planos, trial e assinaturas no core
- [x] tela `/plano`
- [x] checkout de assinatura Mercado Pago
- [x] webhook Mercado Pago com HMAC, idempotência e reconciliação com provider
- [x] gating por status do tenant/assinatura
- [x] observabilidade operacional em `/operacoes`
- [x] saúde de canais, jobs, webhooks e billing no Super Admin
- [~] configuração das credenciais reais do Mercado Pago
- [~] teste real de ativação, renovação, atraso, cancelamento e reativação

## Fase 5 — Marca, aquisição e experiência
- [x] landing comercial responsiva
- [x] identidade oficial NegocIAJá! com assets PNG no repositório
- [x] fallback resiliente de branding
- [x] central `/marketing` no Super Admin
- [x] vídeo institucional gerenciável
- [x] celular demonstrativo gerenciável
- [x] depoimentos institucionais gerenciáveis
- [x] FAQ e CTA comerciais
- [~] publicação do vídeo, poster, celular demonstrativo e depoimentos finais
- [~] revisão visual final desktop/tablet/mobile

## Fase 6 — Segurança, CI e go-live
- [x] CI com copyright, TypeScript, JavaScript, migrations locais e Worker dry-run
- [x] limites de payload e headers de segurança
- [x] R2 privado e mídia autenticada
- [x] secrets fora do repositório
- [x] documentação de configuração final
- [x] estratégia de Worker único documentada
- [x] PRs históricos empilhados #39–#56 encerrados após consolidação do trabalho no `main`
- [x] repositório sem PRs abertos após limpeza da pilha histórica
- [~] aplicar/conferir todas as migrations no D1 remoto de produção
- [~] importar/configurar secrets e variáveis de produção
- [~] criar Queue principal + DLQ e conectar `AGENT_QUEUE`
- [~] teste de isolamento entre tenant A e tenant B
- [~] teste ponta a ponta de cadastro, e-mail, WhatsApp, IA, pedido, billing e Commerce Loop
- [~] backup/export do D1 antes do go-live
- [~] tag/SHA de release estável e procedimento de rollback validado

## Fase 7 — Próximas expansões
- [ ] Template Builder visual
- [ ] Schema Builder por segmento
- [ ] Workflow Builder visual
- [ ] templates avançados para Loja, Delivery, Comunicação Visual, Serviços, Oficina e Beleza
- [ ] CRM comportamental avançado
- [ ] campanhas segmentadas
- [ ] upsell/cross-sell orientado por IA
- [ ] “Pergunte ao seu negócio”
- [ ] API pública para parceiros
- [ ] marketplace de integrações
- [ ] multiunidade
- [ ] conectores adicionais de WhatsApp oficial / BSP

## Gate atual

O sistema já possui o núcleo funcional necessário para homologação comercial. O trabalho restante antes do go-live é predominantemente **infraestrutura externa, credenciais, migrations remotas, testes ponta a ponta, backup e validação operacional**. Consulte `docs/FINAL_CONFIGURATION.md` para o checklist de publicação.
