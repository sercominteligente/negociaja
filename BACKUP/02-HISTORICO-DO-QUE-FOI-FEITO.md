# Histórico do que já foi feito — NegocIAJá!

Este documento resume a evolução técnica e de produto consolidada até 2026-08-20.

## Fase 1 — Conceito e posicionamento

- Projeto definido como SaaS independente, não subordinado ao SERhub.
- Nome final aprovado: **NegocIAJá!**.
- Slogan principal aprovado: **Quer vender mais? NegocIAJá!**.
- Conceito publicitário complementar aprovado: **Quer vender mais? AnuncIA Já!!!**.
- Público definido como multissegmento, inicialmente focado em pequenos e médios negócios.
- Identidade visual aprovada com balão, carrinho, barras de crescimento, seta, wordmark 3D e paleta azul/ciano/amarelo/laranja.

## Fase 2 — Fundação Cloudflare/GitHub

- Repositório `sercominteligente/negociaja` criado.
- Cloudflare Worker da plataforma criado.
- Ambiente HML isolado criado como `negociaja-hml`.
- D1 e R2 separados para homologação.
- GitHub Actions configurado para CI e deploy HML com Wrangler.
- Secrets de deploy foram configurados no GitHub sem necessidade do PC local.
- Cloudflare Access/Basic Auth usados para proteger ambientes administrativos e HML.

## Fase 3 — Banco e SaaS multi-tenant

Foram criadas migrations cobrindo:

- estrutura inicial;
- seed demo;
- núcleo de plataforma;
- billing/SaaS;
- governança;
- personalização de tenant;
- gateway multimodal;
- defaults por tenant;
- operação/financeiro/estoque;
- ferramentas de catálogo/pedido;
- aprovações IA;
- execução de ações/Outbox;
- PDFs/R2;
- protocolo de dispatch de Outbox;
- camadas adicionais de operação, saúde, privacidade e release conforme evolução.

Existe histórico de duas migrations `0004` com modelos diferentes; a HML ganhou compatibilidade para tolerar drift histórico enquanto o schema é consolidado.

## Fase 4 — Perfis e painéis

### Super Admin

Foi criado cockpit com módulos para:

- visão geral;
- empresas;
- planos;
- assinaturas;
- usuários;
- agentes IA;
- canais;
- integrações;
- consumo IA;
- faturamento;
- saúde;
- logs;
- configurações;
- saúde detalhada;
- prontidão HML.

### Painel da empresa

Foi criado painel com:

- resumo;
- pedidos por status;
- vendas;
- clientes;
- caixa de entrada;
- catálogo;
- financeiro;
- relatórios;
- IA Assist;
- aprovações IA;
- personalização;
- equipe/integrações;
- suporte inteligente;
- onboarding;
- catálogo avançado;
- central operacional;
- documentos.

### Operadores

RBAC e conceito de permissões limitadas foram implementados para separar Super Admin, Admin de empresa e operadores.

## Fase 5 — Personalização/white label do tenant

- Tela “Minha Empresa” criada.
- Dados empresariais editáveis.
- Aparência e preview.
- Logo do tenant via R2.
- Cores e slogan.
- Catálogo e documentos comerciais.
- Portal personalizado.
- Regras de upload e validação preparadas.
- PDFs/documentos ligados à identidade da empresa.

## Fase 6 — Catálogo, pedidos e operação

- Produtos/serviços.
- SKU.
- Estoque.
- Variações.
- Preço adicional por variação.
- Estoque por variação.
- Upload/gestão de imagens em R2.
- Pedidos por status.
- Central operacional.
- Financeiro/inventário básicos.
- Ferramentas de catálogo/pedidos preparadas para IA.

## Fase 7 — IA e automação

- IA Assist criada no painel.
- Suporte inteligente interno concebido em dois modos: Técnico e Empreendedor.
- Ações IA com aprovação humana para operações sensíveis.
- Outbox para execução assíncrona/retries.
- Workflows n8n HML criados para fluxo multimodal e dispatcher.
- Gateway multimodal preparado para texto, áudio e imagem.

## Fase 8 — Billing/licença

- Estrutura de planos e assinaturas.
- Estados de ciclo de vida de assinatura.
- Faturas/pagamentos do SaaS.
- Eventos de pagamento idempotentes.
- Avisos de vencimento.
- UI de antecipação/renovação.
- Comportamento de licença suspensa com redirect para `license.html`.
- Mercado Pago previsto para sandbox antes de produção.

## Fase 9 — E-mail e confirmação

- Fundação de confirmação de e-mail.
- Preferências de notificação.
- Entregas de notificações.
- Fluxos previstos para cadastro, confirmação, cobrança, pagamento e vencimento.
- Resend reservado para homologação real.

## Fase 10 — Segurança, privacidade e saúde

- Cloudflare Access/Basic Auth em HML.
- RBAC.
- Guard de Origin para mutações humanas.
- Rotas máquina-a-máquina mantêm autenticação própria.
- LGPD/Privacy recebeu tratamento de roteamento separado.
- Integration Health ganhou rotas próprias e compatibilidade HML.
- Logs e health checks incorporados ao cockpit.

## Fase 11 — Recuperação dos erros HML

### Erro 1101 / Worker threw exception

O `/app` e o `/super-admin` chegaram a lançar Error 1101. A causa arquitetural era que páginas estáticas atravessavam uma cadeia profunda de wrappers antes de chegar aos assets.

Correção aplicada:

- páginas/assets passam por caminho leve;
- APIs de negócio mantêm os gateways necessários;
- autenticação máquina-a-máquina preservada;
- regra de licença foi recolocada sem reintroduzir a cadeia pesada.

### HTTP 500 do Super Admin

A HML dependia de identidade técnica/seed no D1 para abrir o cockpit. Foram adicionadas recuperação e compatibilidade HML para impedir que drift de seed/schema derrubasse a interface.

### Falha parcial das APIs do painel

Leituras do painel passaram a usar camada HML compatível, evitando que um endpoint defeituoso derrubasse toda a interface.

## Fase 12 — Identidade visual no código

- Tokens oficiais de marca registrados.
- PNG original do logo principal enviado diretamente para `public/brand/logo-primary.png`.
- Referências quebradas ao WebP foram compatibilizadas com o PNG original.
- Bug de logos duplicados identificado: havia `<img>` explícito mais injeção antiga por CSS/pseudo-elemento.
- PR #36 foi mesclado para deduplicar branding e preparar slots de favicon/PWA.
- Diretriz final: símbolo balão+carrinho para favicon; versão vertical com balão acima do nome para ícone PWA/APK.

## Fase 13 — Homologação interna

- Cenários de dois tenants fictícios documentados.
- Matriz de testes HML criada.
- Checklist 1.0 criado.
- Documentação de deploy e configuração manual HML criada.
- Procedimentos de recovery do Super Admin documentados.
- CI cobre suites de segurança, RBAC, licença, catálogo, variações, pedidos, IA, R2, onboarding, aprovações, Outbox e outros módulos.

## PRs de referência nesta etapa final

Entre os PRs importantes da recuperação/acabamento estão:

- #28: recuperação de identidade Super Admin HML;
- #29: compatibilidade HML do cockpit;
- #30: isolamento de assets/runtime e correções de entrypoint;
- #31: estabilização de APIs, saúde e privacidade;
- #32: documentação de prontidão/identidade/configuração manual;
- #33–#35: incorporação e recuperação do logo oficial;
- #36: deduplicação de branding e preparação favicon/PWA.

## Estado funcional resumido

Na data do backup:

- landing HML abre;
- painel da empresa abre e lê dados demo;
- Super Admin abre e lê métricas demo;
- D1/R2 estão ligados em HML;
- catálogo/pedido demo aparecem;
- identidade principal está servida por asset local;
- runtime 1101 foi removido da navegação principal;
- ainda falta concluir integração externa real e homologação ponta a ponta antes do go-live.
