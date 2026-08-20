# HML Super Admin recovery

Em homologação, a autenticação HTTP Basic já é a barreira de acesso do ambiente. O Super Admin não deve depender da existência de um registro `local@negociaja.invalid` em `platform_users`, porque esse usuário sintético não representa uma conta real e pode não existir no D1 remoto.

A recuperação faz o gateway construir uma identidade sintética `super_admin` somente quando `APP_ENVIRONMENT === 'hml'`, somente depois da validação do Basic Auth, e somente para rotas de plataforma (`allowPlatform=true`). Produção continua exigindo Cloudflare Access + usuário real no banco.
