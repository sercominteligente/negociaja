# NegocIAJá! — Arquitetura de deploy com Worker único

> Desenvolvido pela SER Comunicação — CNPJ 23.296.513/0001-97. Todos os direitos reservados.

## Decisão oficial

O projeto usa **um único Worker Cloudflare**:

- Worker oficial: `negociaja`
- Branch oficial de publicação: `main`
- Domínios: `negociaja.com.br`, `www.negociaja.com.br`, `app.negociaja.com.br`

O antigo Worker `negociaja-hml` e a branch `hml` não devem mais ser usados como alvo de deploy. A branch pode permanecer apenas como histórico até ser removida/arquivada.

## Motivo

A coexistência de dois Workers e configurações `wrangler` divergentes permitiu que commits da linha HML aparecessem no histórico do Worker de produção enquanto o Worker HML permanecia em versão antiga. A partir desta consolidação, o projeto elimina esse eixo de ambiguidade.

## Regras obrigatórias

1. `wrangler.jsonc` deve conter `name: "negociaja"`.
2. Não criar `env.hml`, `negociaja-hml` ou uma segunda configuração de Worker.
3. `npm run deploy` passa por `scripts/assert-production-deploy.mjs`.
4. O CI executa `scripts/check-single-worker.mjs` e falha caso um segundo Worker seja reintroduzido.
5. Toda publicação deve sair de `main` após CI verde.
6. Secrets nunca são versionados.
7. D1/R2 oficiais continuam sendo os recursos já existentes e não devem ser recriados.

## Fluxo

feature branch → pull request → CI → revisão → merge em `main` → Worker `negociaja`

Para testes de novas funcionalidades, usar feature branches, testes locais/D1 local, dry-run, ambientes de preview quando suportados e tenants fictícios dentro do próprio Worker, sem criar outro Worker permanente.

## Desativação do legado

No Cloudflare, após confirmar que o Worker `negociaja` está executando a versão consolidada:

1. remover qualquer integração Git/Build associada a `negociaja-hml`;
2. remover rotas/domínios eventualmente associados ao Worker antigo;
3. excluir/desativar `negociaja-hml`;
4. confirmar que somente `negociaja` recebe novas versões;
5. manter um registro do ID da última versão antiga apenas para auditoria histórica.
