# NegocIAJá — Homologação Cloudflare

Este documento descreve o ambiente HML isolado. A produção não deve ser alterada durante a criação ou uso da HML.

## Objetivo

Criar um Worker separado chamado `negociaja-hml`, acessível inicialmente apenas pela URL `workers.dev`, com:

- Static Assets herdados do projeto;
- D1 próprio, nunca o D1 `negocia-ja-bd` de produção;
- R2 próprio, nunca o bucket `negocia-ja-files` de produção;
- `APP_ENVIRONMENT=hml`;
- autenticação HTTP Basic adicional no próprio Worker;
- tenant demo apenas para homologação;
- migrations 0001, 0002 e 0003 aplicadas somente no D1 HML.

## Configuração declarada

`wrangler.jsonc` possui `env.hml` com:

- Worker `negociaja-hml`;
- `workers_dev=true`;
- `preview_urls=true`;
- nenhuma rota/custom domain de produção;
- `HML_USERNAME=homologacao`;
- bindings `DB` e `FILES` sem IDs/nomes de produção.

Os bindings sem IDs são intencionais: o Wrangler moderno pode provisionar automaticamente recursos separados no primeiro deploy do ambiente.

## Segurança HML

O Worker trata `APP_ENVIRONMENT=hml` como ambiente privado.

- Sem `HML_PASSWORD`, toda a HML responde 401.
- Com senha configurada, o navegador solicita autenticação Basic.
- Mutations exigem `Origin` igual à própria origem HML.
- Respostas HML usam `noindex`, `no-store`, CSP e demais headers privados.
- A senha nunca deve entrar em `wrangler.jsonc`, GitHub, documentação ou screenshots.

## Primeiro deploy

Executar somente com Wrangler autenticado na conta Cloudflare correta:

```powershell
npm.cmd install
npm.cmd run check
npx wrangler deploy --env hml
```

O primeiro deploy deve criar/provisionar os recursos HML separados. Não altere manualmente os IDs de produção para "fazer funcionar".

Logo após o deploy, configure a senha HML:

```powershell
npx wrangler secret put HML_PASSWORD --env hml
```

Use uma senha exclusiva para homologação.

## Banco HML

Depois que o binding `DB` HML existir, liste as migrations:

```powershell
npx wrangler d1 migrations list DB --remote --env hml
```

Aplique somente no ambiente HML:

```powershell
npx wrangler d1 migrations apply DB --remote --env hml
```

Confirme que 0001, 0002 e 0003 foram registradas no D1 HML.

Nunca rode o comando sem `--env hml` durante esta etapa.

## R2 HML

O binding `FILES` da HML deve apontar para um bucket provisionado especificamente para `negociaja-hml`. O bucket de produção `negocia-ja-files` não pode ser reutilizado.

## Validação

Ao abrir a URL `workers.dev` da HML:

1. sem credenciais, deve aparecer desafio de autenticação;
2. usuário: `homologacao`;
3. após autenticar, landing/painel devem carregar;
4. `/api/health` deve indicar `environment: hml`;
5. criar item/pedido deve alterar somente o D1 HML;
6. produção em `negociaja.com.br` e `app.negociaja.com.br` deve continuar inalterada.

## CI

O GitHub Actions testa localmente tanto o ambiente de desenvolvimento quanto `env.hml`:

- migrations HML em D1 local isolado;
- HML sem credenciais retorna 401;
- credenciais Basic corretas liberam acesso;
- mutation sem Origin correto retorna 403;
- mutation autenticada e same-origin funciona.

O CI não publica Worker nem escreve no D1 remoto.

## Próxima etapa

Depois da homologação funcional, criar um hostname dedicado como `hml.negociaja.com.br` e protegê-lo com Cloudflare Access. Somente então avaliar a retirada do Basic Auth adicional.

Não alterar a aplicação Access de produção `NegocIAJá — Painel` durante essa etapa.
