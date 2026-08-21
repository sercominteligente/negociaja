# Briefing mestre — NegocIAJá!

## 1. Visão do produto

NegocIAJá! é uma plataforma SaaS multi-tenant de atendimento, vendas e operação conversacional para pequenos e médios negócios. A inspiração de fluxo veio de plataformas como Anota AI, mas o posicionamento é mais amplo: o sistema deve se adaptar a diversos segmentos, conectando atendimento, catálogo, pedidos, clientes, IA, cobrança, financeiro e operação em um único ambiente.

### Proposta central

**Quer vender mais? NegocIAJá!**

A plataforma transforma conversas em pedidos e pedidos em operação, com IA conversacional e integração com canais como WhatsApp e Telegram.

### Público-alvo

- pequenos e médios lojistas;
- delivery e alimentação;
- comunicação visual e gráficas;
- prestadores de serviços;
- oficinas;
- beleza/acessórios;
- negócios personalizados por segmento.

## 2. Identidade visual aprovada

A identidade oficial usa:

- balão de mensagem circular azul;
- carrinho de compras dentro do balão;
- barras de crescimento e seta ascendente em amarelo/laranja;
- wordmark 3D “NegocIAJá!” com `Negoc` branco/navy, `IA` azul/ciano e `Já!` amarelo/laranja;
- slogan oficial: **Quer vender mais? NegocIAJá!**;
- conceito publicitário complementar: **Quer vender mais? AnuncIA Já!!!**.

Diretriz de aplicação técnica:

- logo horizontal principal: assinatura padrão em áreas institucionais;
- versão vertical com balão acima do nome: ícone/apresentação de app/PWA/APK;
- símbolo balão+carrinho: favicon e pequenos ícones;
- versão reversa: fundos escuros;
- versão com slogan: materiais promocionais e apresentações.

## 3. Perfis do sistema

### Super Admin NegocIAJá

Controla toda a plataforma:

- empresas/tenants;
- planos;
- assinaturas;
- usuários;
- agentes IA;
- canais WhatsApp/Telegram;
- integrações;
- consumo de IA;
- uso por empresa;
- faturamento SaaS;
- saúde das integrações;
- logs;
- homologação;
- bloqueio/ativação de contas;
- configurações globais;
- prontidão HML/release/backup/rollback.

### Admin da empresa

Painel operacional do tenant:

- resumo;
- caixa de entrada/conversas;
- pedidos;
- catálogo;
- clientes;
- vendas;
- financeiro;
- relatórios;
- IA Assist;
- aprovações IA;
- documentos;
- personalização da empresa;
- equipe e integrações;
- suporte inteligente;
- primeiros passos/onboarding;
- catálogo avançado;
- central operacional.

### Operadores/atendentes

Acesso limitado por RBAC conforme permissões definidas pelo Admin da empresa.

## 4. Personalização por empresa

Cada tenant precisa controlar sua própria identidade e operação:

- razão social, nome fantasia, CNPJ/CPF, IE, endereço, contatos;
- logo próprio;
- cores;
- slogan;
- portal/catálogo;
- documentos comerciais;
- pedidos, recibos, orçamentos e outros modelos;
- instruções de pagamento;
- produtos e serviços;
- imagens de produtos;
- variações/SKU/estoque;
- equipe/permissões;
- canais e integrações.

## 5. Catálogo e operação

Catálogo deve suportar:

- produtos e serviços;
- SKU;
- preço;
- estoque;
- variações;
- preço adicional por variação;
- controle de estoque por variação;
- imagens em R2;
- criação/edição/baixa;
- uso do catálogo pelo atendimento IA.

Operação deve ligar:

- conversa → cliente → carrinho/pedido → pagamento → status → estoque → financeiro → relatórios.

## 6. IA

### IA comercial/operacional

Objetivo: atender cliente, consultar catálogo, montar pedidos, responder dúvidas e acionar ferramentas do sistema.

O núcleo suporta conceito de ações de IA com aprovação humana para operações sensíveis.

### Suporte inteligente interno

Dois modos planejados:

- **Suporte Técnico**: dúvidas de uso, configuração e integrações;
- **Suporte ao Empreendedor**: orientação comercial, operacional e de vendas.

## 7. Assinaturas/licença

A plataforma deve mostrar de forma discreta o estado do plano:

- plano atual;
- vencimento;
- aviso “Seu plano vence em X dias”;
- opção de antecipar pagamento;
- Pix/cartão pelo Mercado Pago;
- notificação por e-mail/WhatsApp;
- licença vencida com tela apropriada e acesso controlado;
- trial/homologação/active/past_due/suspended/cancelled.

## 8. Pagamentos

Existem dois domínios financeiros distintos:

1. cobrança da assinatura do SaaS NegocIAJá;
2. pagamentos das vendas dos próprios tenants.

A arquitetura evita ativar split/marketplace real antes de validação jurídica e financeira. HML deve usar sandbox e mocks antes de movimentação real.

## 9. Canais e integrações prioritárias

- OpenAI;
- Evolution API / WhatsApp;
- n8n;
- Resend;
- Mercado Pago;
- Telegram;
- Cloudflare Access;
- D1;
- R2;
- Workers/Pages.

## 10. Fluxo multimodal desejado

WhatsApp precisa aceitar e processar:

- texto;
- áudio;
- imagem;
- resposta da IA;
- ferramentas/ações;
- criação ou consulta de clientes/pedidos;
- retries e Outbox para entregas confiáveis.

## 11. Infraestrutura

### Cloudflare

Produção e homologação são separadas.

Recursos HML já previstos/associados:

- Worker `negociaja-hml`;
- D1 HML dedicado;
- R2 HML dedicado;
- assets públicos;
- Basic Auth/controles HML;
- deploy via GitHub Actions/Wrangler.

Produção não deve ser alterada durante testes de HML sem promoção deliberada.

## 12. Meta de qualidade

Antes do go-live 1.0, o sistema precisa:

- não depender do PC local;
- ter deploy remoto reprodutível;
- migrations remotas seguras;
- backup e rollback testados;
- páginas e APIs tolerantes a falhas parciais;
- mobile/PWA homologados;
- dois tenants de segmentos diferentes testados ponta a ponta;
- integrações externas homologadas com credenciais HML;
- logs e health checks operacionais.
