# Autenticação, tenant e RBAC — NegocIAJá!

## Objetivo

A aplicação não confia mais em `x-tenant-id` enviado por um usuário comum. O tenant é resolvido pela sessão autenticada no Worker.

## Perfis

- `super_admin`: administração da plataforma. Pode futuramente selecionar tenants explicitamente para suporte/operação global.
- `admin`: administrador da empresa. Pode gerenciar catálogo e operação do próprio tenant.
- `operator`: operador da empresa. Pode consultar dados, criar pedidos, avançar workflow e assumir/devolver conversas, sem alterar catálogo.

## Senhas

- PBKDF2-SHA256
- salt aleatório por usuário
- 210.000 iterações
- senha em texto puro nunca é persistida

## Sessão

- cookie `negociaja_session`
- `HttpOnly`
- `Secure`
- `SameSite=Lax`
- duração inicial: 12 horas
- somente SHA-256 do token de sessão é armazenado no D1
- logout revoga a sessão no banco

## Bootstrap de homologação

Nenhuma senha padrão é versionada no GitHub.

Antes do primeiro acesso em HML, configure um segredo do Worker:

```bash
wrangler secret put HML_BOOTSTRAP_TOKEN
```

Depois, o endpoint `POST /api/auth/bootstrap` pode criar/atualizar um administrador da empresa ou Super Admin, desde que o request contenha o mesmo segredo em `x-bootstrap-token`.

### Administrador de tenant

Payload esperado:

```json
{
  "scope": "tenant",
  "tenant_slug": "demo",
  "name": "Administrador",
  "email": "admin@exemplo.com",
  "password": "senha-com-10-ou-mais-caracteres"
}
```

### Super Admin

```json
{
  "scope": "platform",
  "name": "Super Admin",
  "email": "admin@plataforma.com",
  "password": "senha-com-10-ou-mais-caracteres"
}
```

## APIs de autenticação

- `POST /api/auth/bootstrap`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

## Auditoria

A migration `0005_auth_tenant_rbac.sql` cria `audit_logs`. Login, logout, alterações de catálogo, criação/avanço de pedido e takeover de conversa geram eventos de auditoria.

## Regra de produção

`HML_BOOTSTRAP_TOKEN` deve existir somente onde bootstrap controlado for necessário. Em produção, o bootstrap deve permanecer desabilitado após o provisionamento inicial ou ser substituído pelo fluxo formal de onboarding/confirmação de e-mail.
