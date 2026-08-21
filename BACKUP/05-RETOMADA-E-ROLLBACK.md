# Retomada e rollback — NegocIAJá!

## Como retomar o projeto

1. Leia `BACKUP/00-LEIA-ME-PRIMEIRO.md`.
2. Leia `BACKUP/01-BRIEFING-MESTRE.md`.
3. Leia `BACKUP/03-O-QUE-FALTA-E-PROXIMOS-PASSOS.md`.
4. Consulte `docs/PROJECT_HANDOFF.md`, `docs/HML.md` e `docs/NEGOCIAJA-1.0-CHECKLIST.md`.
5. Confirme a branch/commit de referência antes de qualquer alteração.
6. Nunca recrie D1/R2 existentes sem verificar IDs/configuração do ambiente.
7. Nunca copie credenciais HML para produção.

## Restaurar código a partir do ZIP

O ZIP contém um snapshot do repositório na data de geração. Extraia em uma pasta nova e use-o como base de comparação ou restauração.

O pacote também deve conter um `.bundle` Git quando a geração do artefato conseguir buscar o histórico completo. Com ele é possível reconstruir o histórico localmente:

```bash
git clone negociaja-history.bundle negociaja-restored
cd negociaja-restored
git branch -a
```

Caso o bundle não esteja presente, o snapshot continua suficiente para restaurar o código daquela revisão, mas sem todos os objetos históricos.

## Validação mínima após restauração

- instalar dependências;
- executar CI/testes locais disponíveis;
- validar `wrangler.jsonc`;
- confirmar bindings D1/R2;
- validar migrations aplicadas no ambiente alvo;
- testar `/`;
- testar `/app`;
- testar `/super-admin`;
- testar `/api/session`;
- testar health endpoints;
- testar leitura de catálogo/pedidos/clientes;
- nunca executar movimentação financeira real em HML.

## Estratégia de rollback de Worker

Antes de release:

1. registrar commit SHA aprovado;
2. registrar versão/deployment do Worker;
3. manter D1/R2 sem alterações destrutivas na mesma janela;
4. se ocorrer regressão, promover novamente a versão anterior do Worker ou reaplicar o commit/tag anterior;
5. validar sessão, painel, Super Admin, APIs críticas e health.

## Rollback de banco

Migrations devem ser tratadas como histórico imutável depois de aplicadas. Evitar editar migration antiga em produção/HML já aplicada.

Para mudanças destrutivas:

- criar migration nova;
- preferir estratégia expand/contract;
- manter compatibilidade de leitura durante transição;
- fazer backup D1 antes da mudança;
- testar rollback lógico.

O histórico possui duas migrations `0004`, portanto qualquer consolidação futura deve respeitar o estado real do D1 e não presumir ordem pelo nome apenas.

## Backup D1

Antes do go-live ou mudança de schema relevante:

- exportar banco HML/produção conforme ferramenta Cloudflare disponível;
- registrar timestamp e commit correspondente;
- armazenar export fora do Worker;
- testar importação em ambiente isolado quando possível.

## Backup R2

- gerar inventário de objetos;
- preservar logos de tenants, imagens de catálogo e documentos;
- não apagar objetos em massa sem versionamento/manifest;
- verificar chaves usadas pelo banco antes de limpeza.

## Checklist pós-rollback

- landing abre;
- login/acesso funciona;
- `/app` abre;
- `/super-admin` abre;
- tenant correto é resolvido;
- catálogo carrega;
- pedidos carregam;
- licença é respeitada;
- R2 entrega imagens/documentos;
- health não tem erro crítico novo;
- webhooks ficam pausados até validação quando necessário.

## Segredos

O backup não deve conter:

- API keys;
- tokens Cloudflare;
- senhas HML;
- chaves OpenAI;
- credenciais Evolution;
- tokens n8n;
- secrets Resend;
- access tokens Mercado Pago;
- tokens Telegram.

Esses valores devem ser recriados/reconfigurados nos serviços correspondentes após uma restauração.
