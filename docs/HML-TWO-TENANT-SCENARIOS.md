# HML — homologação com dois tenants

## Tenant A — Loja/Varejo
Nome fictício: **Loja Horizonte HML**

Fluxo obrigatório:
1. criar empresa e Owner;
2. personalizar logo/cores;
3. cadastrar categoria, 3 produtos, uma variação e estoque;
4. cadastrar cliente;
5. criar pedido pelo painel;
6. emitir PED e REC;
7. criar/baixar recebível;
8. abrir ação de IA para cobrança e aprovar;
9. comprovar item na Outbox;
10. consultar pedido/cliente/recebível pelas ferramentas da IA.

## Tenant B — Serviços
Nome fictício: **Studio Norte HML**

Fluxo obrigatório:
1. criar empresa e Owner;
2. personalizar identidade;
3. cadastrar 3 serviços sem controle de estoque;
4. cadastrar cliente;
5. criar pedido de serviço;
6. emitir ORC e FAT;
7. registrar recebível parcial;
8. alterar status do pedido;
9. usar suporte Técnico e Empreendedor;
10. gerar ação externa sujeita a aprovação humana.

## Provas de isolamento
- Tenant A não lê clientes, pedidos, arquivos, documentos, recebíveis, catálogo ou ferramentas do Tenant B.
- Tenant B não lê recursos do Tenant A.
- tentativa explícita de usar ID pertencente ao outro tenant retorna 403/404 sem revelar metadados.
- uploads R2 são segregados por tenant.
- exportação LGPD contém somente o tenant autenticado.

## Gate para testes externos
Os dois cenários internos precisam passar antes de conectar WhatsApp, Resend ou Mercado Pago sandbox. Depois, repetir o fluxo do Tenant A via WhatsApp texto, áudio e imagem.
