# NegocIAJá! — Backup mestre

Data do backup: 2026-08-20
Branch de origem: `hml`
Commit-base do snapshot: `6eb66fbd23da35a3322498ec32ced0327fec2c5a`
Projeto: NegocIAJá!
Slogan principal: **Quer vender mais? NegocIAJá!**

Este diretório transforma o snapshot técnico em um pacote de continuidade. A intenção é permitir que outro desenvolvedor, outro computador ou outro chat retome o projeto sem depender da memória da conversa original.

## Conteúdo deste backup

- `01-BRIEFING-MESTRE.md`: visão total do produto, público, proposta de valor, perfis, módulos e arquitetura.
- `02-HISTORICO-DO-QUE-FOI-FEITO.md`: linha de evolução do projeto e principais decisões já implementadas.
- `03-O-QUE-FALTA-E-PROXIMOS-PASSOS.md`: pendências reais para homologação, integrações e go-live.
- `04-ARQUITETURA-E-INTEGRACOES.md`: Cloudflare, D1, R2, Workers, n8n, Evolution, OpenAI, Resend, Mercado Pago e Telegram.
- `05-RETOMADA-E-ROLLBACK.md`: como restaurar, validar e continuar.
- O próprio repositório contém documentação complementar em `docs/`, migrations, workflows n8n e código do Worker.

## Estado na data do backup

A HML está operacional e os principais problemas de runtime 1101/HTTP 500 foram estabilizados. O painel da empresa e o Super Admin carregam dados de homologação. A identidade visual oficial foi incorporada e, no commit mais recente, o bug de duplicação de marca foi corrigido e foram preparados os slots técnicos de favicon/PWA.

A próxima fase prioritária é terminar a homologação funcional interna de páginas/módulos e, na sequência, conectar credenciais reais de homologação na ordem: OpenAI → Evolution/WhatsApp → n8n multimodal → Outbox → Resend → Mercado Pago sandbox → Telegram.

## Importante

Não gravar credenciais reais neste pacote. Tokens, senhas, chaves de API, segredos do Cloudflare, OpenAI, Evolution, n8n, Resend e Mercado Pago devem existir apenas nos secrets/variáveis dos ambientes correspondentes.
