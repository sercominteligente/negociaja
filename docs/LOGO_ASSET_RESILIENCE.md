# Resiliência dos assets institucionais

As rotas públicas de logo do NegocIAJá! não podem depender da disponibilidade do D1 para responder. O fluxo obrigatório é:

1. tentar resolver a chave institucional no D1;
2. se houver chave, tentar buscar o asset original no R2;
3. se D1/R2 falharem ou o arquivo não existir, responder um fallback gráfico válido;
4. nunca devolver erro 500 para `logo-full` ou `logo-icon`.

O logotipo original configurado no Super Admin permanece como fonte de verdade e sempre tem prioridade sobre o fallback.
