# HML — matriz de homologação e falhas

## Multi-tenant / RBAC
| Cenário | Esperado |
|---|---|
| Operador tenta editar identidade | 403 |
| Operador tenta administrar equipe | 403 |
| Admin tenta remover Owner | 403 |
| Tenant A tenta acessar recurso de B | 403/404 sem vazamento |
| Request injeta `x-tenant-id` | ignorado/bloqueado |

## Gateway conversacional
| Cenário | Esperado |
|---|---|
| Mesmo `external_event_id` duas vezes | apenas um evento/mensagem |
| Texto válido | conversa + mensagem + evento |
| Áudio com transcript | persistir como áudio/transcrição |
| Imagem com legenda | persistir metadados e legenda |
| JSON inválido | 400 |
| Content-Type incorreto | 415 |
| Body > limite | 413 |
| Origem inválida em mutation web | 403 |

## Billing
| Cenário | Esperado |
|---|---|
| Duplo clique em Pagar | idempotência, sem duas cobranças |
| Webhook repetido | processado uma vez |
| Pagamento aprovado | invoice paid + assinatura renovada |
| Pagamento recusado | assinatura não renovada |
| Assinatura vencida em grace | alerta, dados preservados |
| Grace encerrado | suspensão operacional, pagamento disponível |
| Pagamento após suspensão | reativação automática |

## Uploads
| Cenário | Esperado |
|---|---|
| PNG/JPG/WebP/SVG <=5 MB | aceitar |
| >5 MB | rejeitar |
| extensão falsa/MIME inválido | rejeitar |
| SVG com script/event handler | sanitizar/rejeitar |
| arquivo de outro tenant | inacessível |

## Integrações externas
| Falha | Comportamento esperado |
|---|---|
| Evolution offline | registrar health/error e preservar outbox |
| n8n offline | evento persistido e diagnóstico acionável |
| IA indisponível | conversa preservada + fallback/handoff |
| Resend indisponível | entrega pendente/falha registrável e retry futuro |
| Mercado Pago indisponível | não marcar pago, permitir nova tentativa segura |

## Critério 1.0
Dois tenants de segmentos distintos devem concluir: adesão → confirmação → personalização → catálogo → conversa multimodal → pedido → pagamento → documento → financeiro → relatório → renovação, sem acessar dados um do outro.