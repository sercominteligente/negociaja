# NegocIAJá — handoff mestre

Atualizado em 19 de agosto de 2026. Este é o primeiro arquivo que qualquer novo chat deve ler antes de alterar o projeto.

## Instrução para retomada

1. Leia `AGENTS.md`, este arquivo, `docs/CLOUDFLARE.md` e `docs/HML.md`.
2. Preserve os IDs e nomes Cloudflare de produção registrados abaixo. Não recrie nem substitua D1, R2, Worker, Access ou domínios de produção.
3. Consulte a produção antes de qualquer mutação e mantenha a versão anterior disponível para rollback.
4. Execute `npm.cmd install` apenas quando necessário e depois `npm.cmd run check`.
5. Exija CI verde e homologação HML antes de merge/deploy de produção.

## Objetivo do produto

NegocIAJá é uma plataforma SaaS multissegmento para atendimento conversacional, catálogo, pedidos, vendas, automações e operação. A landing é pública; o painel e a API de produção são privados e protegidos pelo Cloudflare Access.

## Repositório

- Repositório: `https://github.com/sercominteligente/negociaja`
- Branch principal: `main`
- Branch de recuperação/evolução: `agent/recovery-foundation`
- Draft PR: `#1`

O PR deve permanecer Draft até a primeira homologação Cloudflare isolada e revisão explícita antes de produção.

## Recuperação do checkout perdido em 19/08/2026

O usuário localizou no PC o arquivo `negociaja.rar`. A inspeção confirmou que ele é uma cópia praticamente completa do checkout local que produziu a versão publicada manualmente.

O arquivo recuperado contém, entre outros:

- `src/index.ts` original;
- `wrangler.jsonc` original de produção;
- `package.json` e `package-lock.json`;
- `worker-configuration.d.ts` gerado pelo Wrangler;
- `docs/PROJECT_HANDOFF.md` e `docs/CLOUDFLARE.md` originais;
- migrations `0001`, `0002` e `0003`;
- `dist/` da build;
- `public/brand.css`, `manifest.webmanifest` e `_headers`;
- os três PNGs oficiais da marca;
- favicon e ícones 16, 32, 180, 192 e 512 px.

Os binários oficiais recuperados são:

- `public/brand/logo-primary.png`;
- `public/brand/logo-primary-with-slogan.png`;
- `public/brand/logo-reverse-dark-bg.png`.

Não substituir esses arquivos por aproximações geradas. O RAR é referência histórica da versão publicada; a branch atual preserva também melhorias posteriores de segurança, CI, HML e produto. Fazer fusão seletiva, nunca sobrescrever a branch inteira pelo snapshot antigo.

Foi gerada também uma cópia de segurança limpa: `NegocIAJa-Recovered-2026-08-19.zip`.

## Produção conhecida

- Landing: `https://negociaja.com.br/`
- Landing alternativa: `https://www.negociaja.com.br/`
- Painel: `https://app.negociaja.com.br/`
- Worker: `negociaja`
- Versão ativa registrada no handoff recuperado: `1bfd75f2-f9c9-479c-8e91-de53767ea2db`
- Versão anterior estável: `8a0f607e-712f-4347-b48a-81a86142443a`
- Deployment anterior do template: `73c168b8-594b-4e59-b7d7-e2d19c38224e`
- Versão do template: `a36459f4-1275-4d8c-9540-00d829c8692c`

A produção foi publicada manualmente por Wrangler e validada visualmente. Ela permanece intocada durante a recuperação/evolução da branch.

## Inventário Cloudflare de produção

- Account ID: `d750711fce41908fe354fa2e7284d6be`
- Zona `negociaja.com.br`: `4b4b88175763980e9079b0f063a78348`
- D1 `negocia-ja-bd`: `25ad2242-5226-467d-9f69-bbdd244fb2ca`
- R2: `negocia-ja-files`
- Access app `NegocIAJá — Painel`: `5968e554-56ee-4739-bfb8-92e2b0f5287c`
- Access AUD: `f10e7d76c9531823e695b17cb3c938b5ff6584e68663ec2e65a820d3be85e218`
- Access team domain: `https://bitter-cell-31bf.cloudflareaccess.com`

Não existem atualmente Pages, KV, Queues, Durable Objects, Vectorize ou AI Gateway no núcleo do projeto. Não criar esses recursos sem caso de uso implementado.

## Arquitetura decidida

Produção usa um único Cloudflare Worker com Static Assets, D1 e R2. Landing, painel e API compartilham o deploy. D1 guarda dados relacionais; R2 fica reservado a anexos.

Queues só entram quando houver trabalho assíncrono real. Durable Objects só entram para coordenação forte/WebSockets. Workers AI, AI Gateway e Vectorize só entram quando houver inferência/RAG real.

## Bindings e variáveis de produção

- `DB` → D1 `negocia-ja-bd`.
- `FILES` → R2 `negocia-ja-files`.
- `ASSETS` → `public/`.
- `assets.run_worker_first=true` para que autenticação/roteamento ocorram antes dos arquivos estáticos.
- `APP_ENVIRONMENT=production`.
- `DEFAULT_TENANT_ID=tenant_demo`.
- `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD` são identificadores públicos, não secrets.
- A branch usa `compatibility_date=2026-08-18`, data comprovada no runtime CI. O snapshot original usava `2026-08-19`; só avançar a data depois de CI e smoke tests verdes com a versão de Wrangler escolhida.

Nunca versionar tokens OAuth/API ou `HML_PASSWORD`.

## Ambiente HML preparado

`wrangler.jsonc` agora possui um ambiente nomeado `hml` que deve publicar como Worker separado `negociaja-hml`.

Características:

- `workers_dev=true` e `preview_urls=true`;
- nenhuma rota/custom domain de produção;
- `APP_ENVIRONMENT=hml`;
- `DEFAULT_TENANT_ID=tenant_demo`;
- `HML_USERNAME=homologacao`;
- `DB` e `FILES` declarados como bindings de HML sem IDs/nomes de produção, permitindo provisioning separado pelo Wrangler;
- `HML_PASSWORD` obrigatório como secret do Worker;
- sem senha, a HML falha fechada com 401;
- autenticação HTTP Basic adicional no próprio Worker;
- mutations HML exigem Origin igual à própria origem;
- respostas HML recebem headers privados/noindex/no-store.

O CI já executa o ambiente HML localmente e comprovou:

- acesso sem credenciais retorna 401;
- autenticação Basic correta libera o ambiente;
- mutation sem Origin same-origin retorna 403;
- mutation autenticada e same-origin funciona;
- migrations HML são executadas somente em D1 local separado no runner.

O primeiro deploy remoto HML ainda não foi executado. Consultar `docs/HML.md`.

## Banco remoto de produção

Migrations já aplicadas e registradas no D1 remoto de produção:

1. `0001_initial.sql`
2. `0002_seed_demo.sql`
3. `0003_platform_core.sql`

Não reaplicar nem recriar o banco de produção. Antes de migration futura, listar pendentes e fazer export remoto.

## Segurança reconstruída/evoluída

- JWT do Cloudflare Access validado no Worker com JWKS, issuer e AUD usando `jose`.
- Worker executa antes dos Static Assets, evitando bypass da autenticação por arquivo estático.
- API em raiz/`www` responde 404.
- `/app` em raiz/`www` redireciona para `app.negociaja.com.br`.
- Tenant não é aceito por `x-tenant-id`; por enquanto vem de `DEFAULT_TENANT_ID` no servidor.
- Mutations de produção exigem origem válida, JSON e corpo máximo de 64 KiB.
- Mutations HML exigem a própria origem HML.
- Entradas, enums, quantidades, estoque, status e valores são validados.
- Status de pedido precisa existir no workflow do tenant, exceto `cancelled`.
- Painel renderiza dados dinâmicos com DOM APIs/`textContent`, não `innerHTML` com dados do D1.
- CSP, HSTS, `noindex` privado, `nosniff`, frame denial, referrer policy e permissions policy são aplicados pelo Worker.
- `.gitignore` bloqueia `.env`, `.dev.vars`, `.wrangler` e estados locais sensíveis.
- `scripts/security-check.mjs` impede regressões críticas, inclusive reutilização acidental de D1/R2 de produção na HML.

## APIs e produto já funcionais na branch

- `/api/health`;
- `/api/session` com tenant, ambiente e identidade autenticada disponível;
- `/api/dashboard`;
- `/api/catalog` leitura/criação;
- `/api/orders` leitura/criação;
- alteração validada de status do pedido;
- `/api/workflows`;
- `/api/automations`;
- `/api/conversations`;
- takeover IA↔humano;
- `/api/customers` com quantidade de pedidos e gasto acumulado sem cancelados.

Painel atual:

- métricas D1;
- kanban de pedidos;
- criação de item;
- criação de venda;
- caixa de entrada de conversas;
- assumir/devolver conversa à IA;
- clientes reais vindos da tabela `customers`;
- identificação visual do ambiente HML/produção e conta autenticada;
- NegocIA Assist com respostas operacionais locais baseadas nos dados carregados;
- ajustes mobile e controles ainda não implementados explicitamente desabilitados.

## Build e CI

`.github/workflows/ci.yml` valida sem publicar Worker remoto.

O CI atual conclui com sucesso:

- instalação de dependências;
- TypeScript;
- sintaxe do painel;
- regressões de segurança;
- `wrangler deploy --dry-run`;
- migrations 0001/0002/0003 no D1 local de desenvolvimento;
- Worker local e smoke test de sessão, catálogo, clientes, pedido, total, status, Content-Type e isolamento de tenant;
- migrations HML em D1 local separado;
- Worker HML local;
- desafio Basic 401;
- autenticação HML;
- proteção same-origin HML;
- mutation HML autenticada.

Nenhuma validação CI escreve no D1/R2 remoto ou publica Worker.

## Identidade visual

A identidade oficial foi recuperada do `negociaja.rar` e corresponde ao mini brand board aprovado.

Paleta oficial:

- `#0B2B7C` navy;
- `#169CFF` blue;
- `#25D9FF` cyan;
- `#FFC107` yellow;
- `#FF9800` orange;
- `#FFFFFF` white.

Ativos oficiais recuperados:

- logo principal horizontal;
- logo principal com slogan;
- versão reversa para fundo escuro;
- favicon e ícones PWA.

`brand.css`, `manifest.webmanifest` e `_headers` já foram recuperados como texto na branch. Os binários permanecem preservados no checkout/ZIP recuperado até serem inseridos no GitHub por caminho binário seguro.

A frase aprovada da landing permanece: `O sistema se adapta ao seu negócio.`

## Ponto exato de continuidade

1. Inserir os PNGs/favicon/ícones oficiais recuperados no GitHub por caminho binário seguro, sem recompressão destrutiva.
2. Assim que o acesso operacional Cloudflare estiver exposto à sessão, executar o primeiro `wrangler deploy --env hml`.
3. Confirmar que foram provisionados D1/R2 HML separados e que nenhum binding aponta para produção.
4. Configurar `HML_PASSWORD` como secret e aplicar 0001/0002/0003 somente ao D1 HML.
5. Abrir a URL HML, homologar desktop/celular, catálogo, clientes, pedidos e conversas.
6. Depois criar hostname dedicado HML protegido por Cloudflare Access.
7. Implementar associação Access usuário↔tenant antes de múltiplas empresas reais.
8. Continuar evolução de clientes, conversas, pedidos, catálogo, automações e integrações.
9. Somente depois decidir merge em `main` e retomada do pipeline automático de produção.
10. Concluir branding da tela de login do Cloudflare Access de produção sem alterar a política Allow.

## Branding desejado do Access de produção

- Logo: `https://negociaja.com.br/brand/logo-primary.png`
- Background: `#F7FAFF`
- Texto: `#071A43`
- Cabeçalho: `Bem-vindo ao NegocIAJá!`
- Rodapé: `Atendimento, vendas e operação em um único fluxo.`

## Rollback de produção

```powershell
npx wrangler rollback 8a0f607e-712f-4347-b48a-81a86142443a
```

Rollback de Worker não reverte D1.
