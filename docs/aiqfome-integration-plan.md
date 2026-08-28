# Plano de integração aiqfome → MOTOboyCity

> Pesquisa realizada em 2026-08-20, exclusivamente na documentação oficial do
> aiqfome. Este documento é um plano de implementação; nenhum endpoint, banco,
> credencial ou loja foi alterado. A documentação externa pode mudar e deve ser
> reconferida antes da homologação.

## Objetivo

Receber pedidos de entrega das lojas parceiras do aiqfome, transformá-los em
entregas normais do MOTOboyCity e reaproveitar o caminho já existente:

```text
loja autoriza o MOTOboyCity no aiqfome
  → aiqfome envia evento da loja
    → MOTOboyCity autentica, registra e busca o pedido completo
      → valida loja, modalidade, destino, pagamento e duplicidade
        → calcula rota e preço do frete pelas regras do MOTOboyCity
          → cria Delivery + histórico uma única vez
            → dispatch automático existente
              → oferta Socket.IO/push no driver-app
                → motoboy aceita, coleta e entrega
                  → status logístico volta ao aiqfome
```

Pedidos manuais da empresa continuam funcionando em paralelo. A integração não
deve criar um segundo mecanismo de dispatch, preço, oferta, carteira ou fatura.

## Conclusão da pesquisa oficial

### API escolhida

Usar a **API aiqfome V2** como caminho principal. A documentação informa que a
V2 passou a ser a API oficial e unificada em 05/01/2026, com autorização
individual por loja; a V1 teve descontinuação prevista para 07/04/2026.
[Fonte oficial: versões da API](https://developer.aiqfome.com/docs/api/versions).

A camada Open Delivery continua documentada como compatibilidade paralela para
ERPs/PDVs. Ela oferece webhook, busca de pedido e polling com retenção de 48
horas, mas não será a base inicial porque a V2 possui vínculo por loja, webhook
com segredo e endpoints logísticos próprios. Open Delivery fica como
contingência somente se o time do aiqfome exigir durante a homologação.
[Fonte oficial: gestão de pedidos Open Delivery](https://developer.aiqfome.com/docs/guides/opendelivery/order-lifecycle).

### Tipo de aplicativo e autorização

Cadastrar o MOTOboyCity como **Aplicativo de Integração**, não como Aplicativo
Marketplace. O aiqfome exige OAuth 2.0, vínculo individual de cada loja e os
escopos de Gestão de Loja e Pedidos. Cada loja gera seu próprio access token e
refresh token; o access token documentado expira em duas horas.
[Fonte oficial: autenticação, credenciamento e vínculo](https://developer.aiqfome.com/docs/guides/opendelivery/authentication).

O lojista inicia o vínculo no painel Geraldo/ID Magalu. O retorno OAuth contém
`code` e `state`, e o backend troca o código de uso único no endpoint do ID
Magalu. Tokens renovados incluem um novo refresh token que deve substituir o
anterior de forma atômica.
[Fonte oficial: geração do token](https://developer.aiqfome.com/docs/guides/get-started/step-2)
e [renovação](https://developer.aiqfome.com/docs/guides/get-started/step-3).

### Webhooks V2

Os IDs dos eventos não devem ser fixados no código: são consultados por
`GET /auxiliary/webhook-events`. Para cada loja autorizada, cadastrar URL,
`secret_key` e evento em `POST /store/{store_id}/webhooks`. O aiqfome envia o
segredo no header `Authorization` e documenta os eventos `new-order`,
`read-order`, `ready-order`, `cancel-order`, `order-refund` e
`order-logistic`.
[Fonte oficial: cadastro de webhooks](https://developer.aiqfome.com/docs/guides/v2/stores/webhooks).

### Pedidos e logística

O detalhe de pedido V2 fornece cliente, endereço, pagamento, loja, flags de
retirada/agendamento e indicação `is_aiqentrega_delivery`. Pedidos atendidos
pelo MOTOboyCity devem ser de entrega, não agendados nesta versão e não podem
estar atribuídos ao AiqEntrega.
[Fonte oficial: consulta de pedidos](https://developer.aiqfome.com/docs/guides/v2/orders/get-orders).

A API V2 publica seis marcos para logística de terceiros:

- `POST /api/v2/logistic/:order_id/pickup-ongoing`;
- `POST /api/v2/logistic/:order_id/arrived-at-merchant`;
- `POST /api/v2/logistic/:order_id/delivery-ongoing`;
- `POST /api/v2/logistic/:order_id/arrived-at-customer`;
- `POST /api/v2/logistic/:order_id/order-delivered`;
- `POST /api/v2/logistic/:order_id/delivery-canceled`.

Os endpoints exigem escopo de escrita de pedidos.
[Fonte oficial: referência logística V2](https://developer.aiqfome.com/docs/api/v2/mark-as-order-delivered).

O módulo AiqEntrega chama entregadores do próprio ecossistema aiqfome. Ele não
faz parte desta integração e nenhuma rota `ride/call`, `new-ride` ou
`standalone-orders` deve ser usada: queremos nossos motoboys e nosso dispatch.
[Fonte oficial: gestão AiqEntrega](https://developer.aiqfome.com/docs/guides/v2/aiqentrega).

### Homologação, sigilo e dados pessoais

Os termos oficiais condicionam produção à homologação pelo aiqfome, exigem
sigilo das chaves, uso do conteúdo somente para a finalidade contratada,
proteção contra acesso não autorizado e tratamento de dados pessoais pelo
tempo necessário, em conformidade com a LGPD.
[Fonte oficial: Termos de Uso da API](https://developer.aiqfome.com/assets/files/TermosDeUsoAiqfome-4a56225d540a868c117041781846c935.pdf).

## Escopo funcional da primeira versão

### Incluído

- conexão OAuth individual por empresa/loja;
- cadastro e rotação dos webhooks necessários;
- recepção autenticada de pedido novo, lido, pronto e cancelado;
- busca do detalhe completo na API V2;
- importação idempotente de uma entrega por pedido aiqfome;
- preço de frete calculado pelo MOTOboyCity;
- despacho automático para os nossos motoboys;
- número externo e origem visíveis nos painéis e no app após o aceite;
- sincronização assíncrona de coleta, saída para entrega, conclusão e
  cancelamento logístico;
- fila de erros/reprocessamento auditável para empresa e admin;
- reconciliação de pedidos recentes para cobrir perda de webhook;
- desconexão segura por loja.

### Fora da primeira versão

- AiqEntrega e qualquer chamada de entregador do aiqfome;
- importação de retirada na loja;
- pedidos agendados;
- alteração de cardápio, produtos, preços ou operação da loja;
- cancelamento/substituição de itens do carrinho;
- criação de pedido avulso dentro do aiqfome;
- agrupamento automático de pedidos aiqfome em lote;
- copiar itens do carrinho, CPF, e-mail ou documento fiscal para o app do
  motoboy;
- antecipação financeira;
- suportar pagamento offline antes de definir a custódia e a conciliação do
  dinheiro/cartão/Pix recebido na entrega.

## Regras de elegibilidade do pedido

Um evento só pode gerar `Delivery` quando todas as condições forem verdadeiras:

1. a integração está `CONNECTED` e pertence a uma empresa `ACTIVE`;
2. o `store_id` do evento é exatamente o autorizado para aquela integração;
3. o detalhe consultado pertence à mesma loja;
4. é entrega, não retirada;
5. não é pedido agendado;
6. `is_aiqentrega_delivery` é `false`;
7. o pedido não está cancelado nem entregue;
8. endereço de destino e coordenadas são válidos;
9. existe endereço principal de coleta da empresa, modalidade ativa e tabela
   de preço para a região;
10. não existe outra entrega para o mesmo par integração/pedido externo;
11. o método de pagamento está dentro do escopo habilitado no piloto;
12. o evento alcançou o gatilho de dispatch configurado.

Qualquer falha de regra deve levar o pedido para uma fila de revisão com código
de erro estável; nunca criar pedido parcial, preço zero ou destino inventado.

## Gatilho recomendado para o dispatch

Processar os eventos em etapas:

| Evento aiqfome | Ação no MOTOboyCity                                                                      |
| -------------- | ---------------------------------------------------------------------------------------- |
| `new-order`    | Registrar/importar os dados mínimos e consultar o detalhe; ainda não oferecer ao motoboy |
| `read-order`   | Marcar que a loja recebeu/aceitou o pedido                                               |
| `ready-order`  | Criar a `Delivery` e iniciar o dispatch automático                                       |
| `cancel-order` | Cancelar a importação ou a entrega conforme a política confirmada                        |
| `order-refund` | Registrar para auditoria; não alterar frete ou carteira automaticamente                  |

O `ready-order` é o padrão recomendado porque a própria documentação o aponta
como referência para logística de terceiros. Algumas lojas podem precisar que
o motoboy seja chamado já em `read-order`; se isso for aprovado, usar uma
configuração explícita por integração (`READ_ORDER` ou `READY_ORDER`), nunca uma
heurística por tempo.

Se a loja não operar corretamente o status “pronto”, ela não entra no piloto
até o processo ser corrigido ou o gatilho `READ_ORDER` ser escolhido
conscientemente.

## Mapeamento para `Delivery`

| aiqfome                       | MOTOboyCity                         | Regra                                            |
| ----------------------------- | ----------------------------------- | ------------------------------------------------ |
| `store_id`                    | `Integration.config.aiqfomeStoreId` | Deve coincidir com a loja autorizada             |
| ID técnico do pedido          | novo `Delivery.externalOrderId`     | Usado para unicidade/idempotência                |
| número exibido                | `Delivery.externalOrderNumber`      | Apenas exibição e busca                          |
| loja autorizada               | `Delivery.companyId`                | Nunca confiar somente no payload do webhook      |
| modalidade configurada        | `Delivery.serviceTypeId`            | Definida na integração, não inferida pelos itens |
| cliente nome/telefone         | `recipientName`/`recipientPhone`    | Visíveis ao motoboy somente após aceite          |
| endereço do cliente           | `DeliveryAddress` `DROPOFF`         | Snapshot estruturado com lat/lng                 |
| endereço principal da empresa | `DeliveryAddress` `PICKUP`          | Snapshot do cadastro verificado no onboarding    |
| observação operacional        | `driverNote`                        | Somente conteúdo necessário à entrega            |
| pagamento do cliente          | `customerPaymentMethod`             | Mapeamento validado abaixo                       |
| cobrança do frete             | `paymentMethod=BILLED`              | Empresa continua faturada pelo MOTOboyCity       |
| origem                        | `integrationId`                     | Origem derivada da relação, sem string livre     |
| retorno                       | `requiresReturn=false`              | aiqfome não informa retorno ao local de coleta   |
| destino                       | `destinationKnownAtCreation=true`   | Pedido aiqfome já possui destino                 |

Não usar o total do carrinho nem a taxa de entrega do aiqfome como
`Delivery.totalValue`. O frete cobrado da empresa, repasse do motoboy e receita
da plataforma continuam saindo de `GoogleMapsService` +
`PricingService.quote()`, preservando os valores congelados e a regra
`driverValue + platformValue = totalValue`.

### Pagamento do cliente

Mapeamento inicial:

- totalmente pago online → `PREPAID`;
- pendente em dinheiro → `CASH`;
- pendente em crédito/débito → `CARD`;
- pendente em Pix → `PIX`;
- misto, `OTHER` ou combinação ambígua → revisão manual, sem dispatch.

Para o piloto, a recomendação é aceitar somente pedidos `PREPAID`. O sistema
atual informa a forma de pagamento, mas ainda não controla custódia de dinheiro,
maquininha, Pix recebido pelo motoboy, troco ou acerto com a loja. Habilitar
pagamento offline sem esse contrato produziria um financeiro aparentemente
completo, mas sem conciliação real.

## Persistência proposta

Todas as mudanças devem ser migrations aditivas. Nomes finais podem ser
ajustados ao implementar, mas os invariantes abaixo são obrigatórios.

### Reutilizar `Integration`

Usar a linha `provider=AIQFOME` já existente, com:

- `companyId` obrigatório quando conectada;
- `status`: `DISCONNECTED`, `CONNECTED` ou `ERROR`;
- `config` validado por schema Zod, contendo somente dados não sensíveis:
  `aiqfomeStoreId`, nome da loja, versão `V2`, `serviceTypeId`, gatilho de
  dispatch, IDs dos webhooks, escopos, último evento e códigos de erro;
- `credentialsRef` apontando para o registro cifrado separado;
- `connectedAt` e `lastSyncAt` atualizados apenas depois de operações reais.

Adicionar unicidade para uma integração aiqfome por empresa. Antes da migration,
consultar duplicidades existentes; não aplicar a constraint cegamente.

### Credenciais

No `IntegrationCredential` referenciado por `credentialsRef`, por loja:

- access token;
- refresh token;
- instante de expiração;
- versão para rotação atômica.

O payload é cifrado com AES-256-GCM e contexto vinculado ao ID da integração.
A chave mestra de 32 bytes fica somente no ambiente da API. Banco, respostas e
logs nunca recebem access token ou refresh token em texto puro.

`client_id`, `client_secret` e redirect URI são configuração global do backend,
nunca `NEXT_PUBLIC_*`. O segredo do webhook é gerado aleatoriamente; guardar
somente um digest para validação, salvo se o cofre exigir o valor para rotação.

### Vincular pedido externo

Adicionar a `Delivery`:

- `integrationId` opcional;
- `externalOrderId` opcional;
- relação com `Integration`;
- índice único composto `[integrationId, externalOrderId]`.

`externalOrderNumber` continua não único porque é um número de exibição. A
constraint nova é a última defesa contra dois webhooks concorrentes criarem
duas entregas para o mesmo pedido.

### Auditoria de entrada

Criar uma tabela append-only de recebimentos com, no mínimo:

- integração, tipo de evento, loja e pedido externo;
- chave idempotente e hash do payload;
- recebido/processado em;
- estado `RECEIVED`, `PROCESSING`, `PROCESSED`, `IGNORED` ou `FAILED`;
- tentativas, código de erro e resumo sem PII;
- referência à `Delivery`, quando criada.

Não guardar header `Authorization`, tokens, CPF, e-mail ou corpo completo em
logs. Se um payload bruto for necessário para suporte/homologação, criptografar,
restringir acesso e definir retenção curta aprovada; por padrão, persistir apenas
os campos operacionais mapeados.

### Outbox de saída

Criar outbox persistente para sincronizar marcos locais com o aiqfome. Chave
única por integração, entrega e ação externa. Estados mínimos: `PENDING`,
`PROCESSING`, `SENT`, `FAILED_RETRYABLE`, `FAILED_FINAL`.

A transição local nunca pode ser desfeita porque o aiqfome ficou indisponível.
O evento é gravado na mesma transação da mudança de status e enviado depois por
worker com retentativa.

## Contratos e endpoints do MOTOboyCity

### Empresa autenticada

- `GET /company/integrations/aiqfome` — estado sanitizado da conexão;
- `POST /company/integrations/aiqfome/connect` — cria `state` opaco e retorna a
  URL de autorização;
- `POST /company/integrations/aiqfome/disconnect` — remove webhooks externos,
  apaga credenciais e desativa novos imports;
- `PATCH /company/integrations/aiqfome/settings` — modalidade e gatilho;
- `GET /company/integrations/aiqfome/imports` — fila própria, sem dados de
  outras empresas;
- `POST /company/integrations/aiqfome/imports/:id/retry` — somente erros
  recuperáveis e sem duplicar entrega.

Conectar, alterar ou desconectar deve exigir proprietário/gestor da empresa ou
admin, conforme o papel real disponível no código. Não basta esconder botão na
interface.

### Callbacks públicos

- `GET /integrations/aiqfome/callback` — valida `state` de uso único e
  troca o `code` no servidor;
- `POST /integrations/aiqfome/webhooks/:publicId` — recebe eventos V2.

O callback OAuth usa `state` aleatório, com TTL no Redis e vínculo server-side
com empresa, usuário e redirect permitido. Não colocar apenas o UUID previsível
da empresa no parâmetro.

O webhook não usa JWT do MOTOboyCity. Ele deve:

1. limitar tamanho do corpo;
2. localizar a integração pelo identificador público aleatório;
3. validar o digest do `Authorization` em tempo constante;
4. validar Zod estrito para o tipo de evento;
5. conferir `store_id`;
6. persistir o recebimento/idempotência;
7. enfileirar processamento usando o ID do recebimento como `jobId`;
8. responder rapidamente somente depois da aceitação durável.

Segredo inválido ou loja divergente recebe erro de autenticação e gera alerta
sem registrar PII. Banco/fila indisponível deve responder erro recuperável para
permitir nova tentativa do provedor.

### Administração

- `GET /admin/integrations/aiqfome` — conexões, saúde e último evento;
- `GET /admin/integrations/aiqfome/:id` — auditoria de imports/outbox;
- `POST /admin/integrations/aiqfome/:id/retry` — reprocessamento controlado;
- `POST /admin/integrations/aiqfome/:id/disable` — kill switch sem apagar
  histórico.

Não oferecer edição direta de token, saldo ou pedido. Credenciais nunca voltam
na resposta.

## Serviços e filas

Criar `apps/api/src/integrations/aiqfome/` com responsabilidades separadas:

- `AiqfomeOAuthService`: state, code, token e refresh;
- `AiqfomeClient`: HTTP tipado com base URL fixa e timeouts;
- `AiqfomeWebhookController`: autenticação e aceitação rápida;
- `AiqfomeInboundProcessor`: detalhe, validação, mapeamento e criação;
- `AiqfomeOutboundProcessor`: outbox de status;
- `AiqfomeReconciliationService`: recuperação de lacunas;
- `AiqfomeIntegrationService`: conexão, configuração e desligamento;
- schemas Zod e tipos internos de todos os payloads externos.

Usar filas BullMQ independentes, por exemplo `integration-aiqfome-inbound` e
`integration-aiqfome-outbound`, com `jobId` determinístico, backoff exponencial
com jitter e limite de tentativas. Respeitar `Retry-After` quando informado.

Uma resposta 401 pode renovar o token sob lock distribuído e repetir a chamada
uma única vez. A rotação grava access e refresh token juntos. Várias requisições
simultâneas não podem usar o mesmo refresh token em paralelo.

GETs podem ser repetidos sob falha transitória. Para comandos logísticos cujo
resultado ficou incerto por timeout, consultar primeiro o detalhe/status do
pedido antes de reenviar; a documentação não promete idempotency key externa.

## Criação da entrega sem duplicar lógica

Refatorar `DeliveriesService` apenas o necessário para extrair um método de
domínio que receba empresa, payload normalizado e ator de auditoria. Os dois
caminhos devem convergir nele:

- criação manual autenticada;
- importação aiqfome autenticada como sistema.

Esse método continua responsável por:

- snapshot da coleta/destino;
- Google Maps Routes API;
- `PricingService.quote()`;
- `Delivery` e `DeliveryStatusHistory` na mesma transação;
- valores congelados;
- publicação realtime depois do commit;
- disparo pelo `DispatchService` existente.

O importador não pode chamar o endpoint HTTP de empresa com um JWT artificial,
nem duplicar o cálculo de preço e a criação em outro service.

Criar a entrega e marcar o recebimento como processado na mesma transação
serializável, apoiada pela constraint `[integrationId, externalOrderId]`.
Dispatch ocorre depois do commit e deve ser recuperável se a fila estiver
temporariamente indisponível.

## Sincronização de status para o aiqfome

Mapeamento inicial sem inventar eventos que o domínio não possui:

| Evento local confirmado        | Comando V2          |
| ------------------------------ | ------------------- |
| oferta aceita / `ACCEPTED`     | `pickup-ongoing`    |
| `COLLECTED`                    | `delivery-ongoing`  |
| histórico `toStatus=DELIVERED` | `order-delivered`   |
| cancelamento local confirmado  | `delivery-canceled` |

Não enviar `arrived-at-merchant` nem `arrived-at-customer` na primeira versão,
pois o MOTOboyCity não possui transições confiáveis correspondentes.

Para entrega com retorno, enviar `order-delivered` quando o cliente recebe o
pedido (`DELIVERED`), não quando o motoboy conclui o retorno (`COMPLETED`). Para
pedido sem retorno, o mesmo marco aparece no histórico mesmo que a entrega vá a
`COMPLETED` na mesma transação.

Receber `cancel-order` do aiqfome e enviar `delivery-canceled` são direções
diferentes. Um não deve gerar loop no outro; guardar origem e ação externa na
auditoria/outbox.

## Cancelamento externo: decisão obrigatória antes de implementar

A regra atual permite à empresa cancelar somente antes do aceite e ao admin
cancelar depois. Um `cancel-order` do aiqfome pode chegar após aceite ou coleta,
situação ainda não coberta pelas regras confirmadas.

Recomendação técnica e operacional:

- antes do aceite: cancelar pelo fluxo existente;
- depois do aceite: permitir cancelamento por ator `SYSTEM_INTEGRATION`, com a
  mesma atomicidade do admin, notificar o motoboy imediatamente e não aplicar
  penalidade automática;
- depois da coleta: interromper a entrega somente após definir com a loja se há
  retorno do produto e como o motoboy será remunerado;
- após `DELIVERED`/`COMPLETED`: registrar divergência; não desfazer entrega nem
  ledger automaticamente.

Essa recomendação muda uma sub-regra de cancelamento e precisa de aprovação do
responsável antes de virar schema ou código.

## Reconciliação e observabilidade

Webhook é o caminho primário, mas não a única fonte de recuperação. Criar job
periódico por integração que consulte pedidos recentes/abertos/cancelados na V2
e compare com os recebimentos locais. O intervalo e os limites dependem da
confirmação de rate limit pelo aiqfome; não iniciar polling agressivo.

Indicadores mínimos:

- integrações conectadas, expiradas e em erro;
- idade do último webhook por loja;
- latência webhook → `Delivery` → primeira oferta;
- duplicidades evitadas;
- imports em revisão por motivo;
- chamadas externas, 401, 429, 5xx e timeout;
- outbox pendente/definitivamente falha;
- pedidos aiqfome sem entrega local e entregas locais sem confirmação externa;
- PII ou segredo nunca incluídos em métrica/log.

Alertar admin quando uma loja ficar sem webhook, token não puder ser renovado,
pedido elegível falhar antes do dispatch ou outbox ultrapassar o tempo
operacional definido.

## Interface web

Recriar a rota de integração somente depois dos endpoints reais existirem.

### Empresa

- estado `Desconectado`, `Conectando`, `Conectado`, `Ação necessária` ou
  `Erro`;
- botão “Conectar com aiqfome” iniciando OAuth;
- loja vinculada, modalidade, gatilho e último evento;
- instruções para vínculo no Geraldo;
- lista de imports: aguardando loja, aguardando pedido pronto, criado,
  ignorado, cancelado ou em revisão;
- desconectar com confirmação e explicação do efeito;
- nenhum campo para colar access/refresh token.

### Admin

- visão global de saúde;
- filtros por empresa, loja, estado e erro;
- auditoria de webhook/import/outbox sem corpo com PII;
- retry e kill switch explícitos;
- links para empresa e entrega criada.

### Pedidos e app

- badge de origem “aiqfome” nos painéis;
- busca pelo número externo;
- oferta ao motoboy permanece sem destinatário/telefone;
- depois do aceite, exibir número externo, cliente, telefone, endereço,
  pagamento e observação necessários;
- tocar/alertar em segundo plano depende do push nativo previsto no roadmap do
  driver-app; Socket.IO sozinho não garante alerta com app suspenso.

## Segurança

- TLS obrigatório em OAuth, webhook e API externa;
- allowlist fixa de hosts aiqfome/ID Magalu no client; nunca buscar URL arbitrária
  recebida em webhook;
- `state` OAuth opaco, aleatório, de uso único e com TTL;
- client secret e tokens somente no backend/cofre;
- webhook secret diferente por loja, digest e comparação em tempo constante;
- rotação de token e segredo auditável;
- limite de corpo, rate limit e proteção contra replay;
- autorização e escopo por empresa em todas as rotas internas;
- respostas e logs sem credenciais, documento, e-mail, carrinho ou endereço
  completo;
- dados do destinatário fora de ofertas;
- retenção e exclusão definidas antes da homologação, incluindo desligamento da
  parceria;
- nenhuma credencial real em fixture, screenshot, documento ou Git.

## Fases de implementação

### Fase 0 — credenciamento e decisões de produto

- criar conta no Portal do Desenvolvedor/ID Magalu;
- cadastrar Aplicativo de Integração de teste com escopos de loja e pedidos;
- obter loja sandbox/teste e documentação de homologação;
- confirmar com o aiqfome que o aplicativo pode operar **somente a logística**,
  sem assumir o aceite/PDV da loja;
- confirmar eventos, rate limits, retries, timeouts e ambientes/base URLs;
- confirmar se `ready-order` funciona em lojas Cardápio e Catálogo no fluxo
  contratado;
- aprovar regra de cancelamento externo;
- aprovar piloto somente PREPAID ou definir conciliação offline;
- definir quem pode conectar/desconectar uma loja.

Saída: respostas registradas neste documento/business rules, credenciais de
teste no cofre e nenhuma loja real ativada.

### Fase 1 — contratos, schema e client externo

- schemas Zod dos payloads aiqfome;
- tipos e client HTTP V2;
- migration aditiva de vínculo, recebimentos, outbox e unicidade;
- abstração de cofre/credentialsRef;
- testes de migration em banco vazio e cópia de staging;
- sem webhook público nem dispatch ativado ainda.

### Fase 2 — OAuth e conexão da loja

- state Redis, callback, troca e refresh atômico;
- validação da loja via `GET /store`;
- comparação orientada entre loja autorizada, empresa e endereço de coleta;
- descoberta dinâmica dos IDs de evento;
- cadastro/rotação/remoção de webhooks;
- tela real de conexão da empresa e monitor administrativo;
- auditoria sem secrets.

Estado em 2026-08-27: o recorte inicial implementa state opaco no Redis,
callback, troca do code, validação de escopos, loja e CNPJ, persistência cifrada,
consulta/desconexão pela empresa e a tela real do Company Web. Refresh atômico,
cadastro de webhooks e monitor administrativo permanecem para o próximo recorte;
nenhum pedido é importado ou despachado ainda.

Cada tentativa OAuth recebe também um identificador persistido na integração.
Desconectar ou iniciar outra tentativa invalida o callback anterior, e a gravação
final usa update condicional na mesma transação das credenciais. Um erro ao
reautorizar uma loja já conectada preserva a conexão válida anterior. A tela
explicita que este recorte prepara apenas o vínculo e ainda não importa pedidos.

### Fase 3 — ingestão em modo sombra

- webhook autenticado e fila inbound;
- consulta de detalhe, mapeamento e validações;
- recebimentos/idempotência/revisão;
- reconciliação controlada;
- **não criar Delivery nem ofertar ao motoboy**;
- comparar pedidos do sandbox com Geraldo e confirmar campos.

### Fase 4 — criação e dispatch no sandbox

- extrair criação de domínio compartilhada;
- criar uma Delivery no `ready-order`;
- preço normal do MOTOboyCity;
- dispatch existente, realtime e origem nos painéis;
- aceitar somente entrega imediata, sem AiqEntrega e PREPAID;
- testar duplicidade, corrida, Maps fora e recuperação da fila.

### Fase 5 — sincronização logística

- outbox na mesma transação dos status;
- `pickup-ongoing`, `delivery-ongoing`, `order-delivered` e
  `delivery-canceled`;
- refresh token sob concorrência;
- retry/reconciliação sem rollback local;
- evitar loops de cancelamento.

### Fase 6 — cancelamento e financeiro ampliado

- implementar somente a política externa aprovada;
- decidir retorno/remuneração após coleta;
- se necessário, modelar custódia e conciliação de pagamento offline antes de
  habilitar CASH/CARD/PIX;
- provar que carrinho e taxa aiqfome não contaminam ledger/fatura do frete.

### Fase 7 — homologação e piloto

- suíte automatizada completa;
- testes em loja oficial de homologação;
- submissão e aprovação do aiqfome;
- canário com uma loja parceira e kill switch;
- operação assistida e conferência manual de pedidos/valores/status;
- expansão loja por loja somente depois das métricas do piloto.

## Testes obrigatórios

### OAuth e credenciais

- state ausente, expirado, repetido ou pertencente a outra empresa;
- code reutilizado/expirado;
- loja diferente da selecionada;
- access token expirado e refresh rotacionado;
- duas renovações simultâneas;
- cofre indisponível;
- desconexão parcial com remoção de webhook falhando.

### Webhook

- segredo correto/incorreto e comparação em tempo constante;
- publicId desconhecido;
- `store_id` divergente;
- payload inválido, grande ou evento não suportado;
- mesmo webhook repetido e duas cópias concorrentes;
- eventos fora de ordem (`ready` antes de `read`, cancel antes/depois de ready);
- fila/DB indisponível;
- nenhum secret/PII em logs.

### Importação e dispatch

- entrega imediata PREPAID elegível;
- retirada, agendado e AiqEntrega ignorados;
- endereço/coordenação inválidos;
- pagamento misto/OTHER em revisão;
- modalidade/tabela/preço ausentes;
- Maps 429/timeout/erro;
- dois workers gerando exatamente uma `Delivery`;
- webhook concorrente com cancelamento;
- falha entre commit e dispatch recuperada;
- empresa B não consulta import/credencial da empresa A;
- oferta não contém PII e detalhe pós-aceite contém apenas o necessário.

### Saída para o aiqfome

- mapeamento de cada transição;
- entrega com e sem retorno;
- timeout com resultado externo incerto;
- 401 com um refresh/retry;
- 429/5xx com backoff;
- outbox duplicada bloqueada por unicidade;
- falha definitiva visível ao admin sem desfazer status local;
- cancelamento externo não gera loop.

### E2E

- servidor stub do aiqfome com OAuth, pedidos, webhooks e logística;
- PostgreSQL e Redis isolados;
- vínculo → webhook → ready → criação → oferta → aceite → coleta → entrega →
  outbox confirmada;
- cancelamento antes e durante o dispatch;
- restart de API/workers no meio do fluxo;
- fixtures oficiais sanitizadas, sem dados reais.

## Rollout e rollback

Ordem:

1. schema/client/observabilidade sem ativação;
2. OAuth e webhook em sandbox;
3. modo sombra;
4. dispatch em sandbox;
5. homologação oficial;
6. uma loja canário PREPAID;
7. expansão controlada.

Feature flags por integração:

- `receiveWebhooks`;
- `importOrders`;
- `dispatchOrders`;
- `syncOutboundStatus`;
- `allowOfflinePayment`.

Rollback não apaga dados nem migration:

- desligar `dispatchOrders` primeiro;
- continuar registrando ou pausar webhooks conforme o incidente;
- remover webhooks externos ao desconectar;
- manter recebimentos/outbox para auditoria;
- pedidos já criados continuam pelas regras locais ou são tratados pelo fluxo
  de cancelamento aprovado;
- nunca excluir `Delivery`, histórico, oferta, ledger ou fatura para “desfazer”
  uma importação.

## Portões para considerar pronto

- integração homologada formalmente pelo aiqfome;
- nenhuma credencial em Postgres puro, cliente web, log ou Git;
- uma entrega por pedido externo provada sob concorrência;
- webhook autenticado e reconciliador funcionando;
- cancelamento externo aprovado e testado;
- status local/externo convergem após falhas;
- mapas, preço, ledger e fatura conferidos manualmente;
- empresa/admin conseguem investigar e reprocessar sem editar dados;
- driver recebe oferta em primeiro e segundo plano;
- piloto real sem duplicidade, pedido órfão ou divergência financeira.

## Decisões confirmadas e pendentes

Confirmado em 2026-08-27:

1. `ready-order` é o gatilho padrão.
2. O piloto aceita somente `PREPAID`; pagamentos offline ficam desabilitados.
3. Somente `OWNER` ativo conecta ou desconecta a loja.
4. `cancel-order` depois do aceite ou da coleta entra em revisão e não cancela
   automaticamente a entrega local.
5. Tokens por loja ficam cifrados no servidor e nunca são enviados ao browser.

Ainda pendente de confirmação externa/operacional:

1. rate limits, retries e disponibilidade do `ready-order` no tipo da loja de
   teste;
2. retenção do recebimento bruto e dos dados importados após desligamento;
3. processo humano para concluir a revisão de cancelamentos pós-aceite/coleta.

## Próximo passo exato

Antes de qualquer deploy, consultar duplicidades legadas em `integrations`,
aplicar a migration em cópia de staging e configurar a chave mestra de cifra no
Render. Em seguida, publicar API e Company Web, conectar somente a loja de teste
e validar OAuth/CNPJ. Depois disso, implementar refresh atômico e webhooks em
modo sombra, sem criar `Delivery` nem chamar motoboy.
