# Handoff de engenharia — MOTOboyCity

> Fonte de continuidade para pessoas e agentes de IA. Atualize este arquivo em
> cada mudanca funcional, de contrato, infraestrutura ou validacao. Nao inclua
> secrets, valores de `.env` ou dados de clientes.

## Como usar e atualizar

Antes de alterar o projeto, leia este arquivo e `AGENTS.md`. Depois de cada
recorte de trabalho, atualize:

1. **Historico de mudancas** com decisao e arquivos relevantes;
2. **Estado atual** se o comportamento exposto mudou;
3. **Validacoes** com os comandos realmente executados e resultado;
4. **Limitacoes e proximos passos** — nao marque um item como concluido sem
   evidencia de codigo e teste.

Mantenha este documento factual e conciso. O README e documentacao de produto e
onboarding; este arquivo e o estado operacional de desenvolvimento.

## Estado atual

### Plataforma

Monorepo PNPM/Turborepo com API NestJS/Prisma/PostgreSQL/Redis-BullMQ/
Socket.IO, os paineis Next.js `company-web` e `admin-web`, e o aplicativo React
Native `driver-app`. Os contratos compartilhados vivem em `packages/types`,
`packages/validation` e `packages/api-client`.

O README ainda descreve a antiga “Fase 0” e nao representa a implementacao
atual. Nao o use como fonte de verdade para endpoints ou recursos ja
implementados.

### Fluxos ja implementados

- Autenticacao JWT e perfis de empresa, entregador e admin;
- Aprovacao de empresas e entregadores, endereco primario da empresa, tipos de
  servico e tabelas de preco;
- Criacao, listagem, detalhe e cancelamento de pedidos individuais;
- Preco calculado e congelado na criacao; despacho em BullMQ, presenca do
  entregador e oferta via Socket.IO;
- Aceite/recusa de oferta com protecao condicional contra corrida no fluxo de
  pedido individual;
- Pedidos em lote, descritos a seguir.
- Elegibilidade de dispatch por regiao, modalidade atribuida e carga
  operacional; o backfill de modalidades e manual pelo painel admin.
- Ciclo de entrega pos-aceite (`collect`/`deliver`/`complete-return`) no
  backend, incluindo o modo opcional de destino capturado por GPS na entrega
  em vez de informado na criacao — ver "Contrato do ciclo de entrega".
  Nenhuma tela consome isso ainda.

Telas que importam `mock-data` ainda nao devem ser tratadas como integradas.
Os fluxos integrados e os mocks coexistem nos paineis e no app mobile.

## Contrato de pedidos em lote

### Decisoes adotadas — 2026-08-13

1. Um lote e um grupo de **2 a 50 entregas imediatas** criadas na mesma
   chamada; agendamento de lote nao e suportado nesta versao.
2. Nao ha uma tabela `DeliveryBatch`. Um UUID gerado pela aplicacao e gravado
   em `Delivery.batchId`; `null` preserva o pedido individual existente.
3. Cada item do lote mantem destino estruturado, distancia e valores de preco
   proprios, todos calculados e congelados durante a criacao. O caminho de
   “destino definido por GPS somente na entrega” foi descartado por nao haver
   ainda maquina de estados, calculo de valor ou prova de entrega que o suporte
   com seguranca.
4. O lote e uma unidade de despacho: as entregas recebem oferta para o mesmo
   motoboy, e aceite, recusa, expiracao e cancelamento se aplicam a todos os
   itens do lote.
5. A auditoria continua granular: existe uma `DeliveryOffer` e uma entrada de
   historico de status por entrega. O payload em realtime usa a primeira oferta
   como referencia e informa `batchId`/`deliveryCount` para o aplicativo.

### API e contratos

`POST /deliveries/batch` requer autenticacao JWT de empresa e aceita:

```json
{
  "deliveries": [
    {
      "serviceTypeId": "uuid",
      "dropoffAddress": {
        "street": "Rua Exemplo",
        "number": "100",
        "city": "Lajinha",
        "state": "MG",
        "zip": "36930000"
      },
      "requiresReturn": false,
      "requiresDeliveryProof": false,
      "requiresCollectionRecipient": false,
      "pickupSurchargeChargedToDriver": false
    }
  ]
}
```

Resposta: `{ batchId, deliveries }`, em que `deliveries` usa o mesmo formato
de detalhe de pedido e inclui `batchId`.

Arquivos de contrato:

- `packages/validation/src/deliveries/create-delivery.schema.ts` — validacao
  Zod e limite do lote;
- `packages/types/src/delivery.ts` — payload e retorno do lote;
- `packages/types/src/delivery-offer.ts` — campos do evento e resultado de
  aceite de lote;
- `packages/api-client/src/deliveries.ts` — `deliveriesApi.createBatch()`.

### Persistencia e despacho

- Migration criada e validada em banco vazio:
  `apps/api/prisma/migrations/20260813195000_add_delivery_batch/migration.sql`.
  Ela adiciona `deliveries.batchId` e seu indice; nao modifica migrations ja
  aplicadas. Ainda nao foi aplicada em desenvolvimento ou staging.
- A criacao calcula Maps/preco de todos os itens antes da transacao e grava as
  entregas, enderecos e historicos em uma unica transacao.
- `DispatchService.dispatchDelivery()` identifica o grupo por `batchId`, cria
  todas as ofertas em transacao e agenda um timeout por oferta. Apenas um
  evento agregado e enviado ao motoboy.
- A criacao de oferta bloqueia as entregas, revalida o status dentro de uma
  transacao serializavel e e protegida pelo indice unico parcial de ofertas
  pendentes descrito em P1-01.
- Aceitar qualquer uma das ofertas do lote aceita, atribui e registra historico
  de todos os itens em uma transacao. Recusar ou expirar uma oferta marca todas
  as ofertas pendentes do lote e tenta despachar o grupo novamente.
- Cancelar qualquer item antes do aceite cancela todos os itens do lote e
  invalida suas ofertas/jobs.

## Contrato do ciclo de entrega

### Decisoes adotadas — 2026-08-16

1. Depois de ACCEPTED, o motoboy avanca a entrega por tres acoes novas, todas
   `PATCH`, guardadas por `DriverOnlyGuard` (sem sobreposicao de admin —
   coletar/entregar/retornar sao acoes fisicas do motoboy):
   - `PATCH /deliveries/:id/collect` — atomica pro lote inteiro
     (`ACCEPTED → COLLECTED` em todos os itens de uma vez, exige que todos
     estejam ACCEPTED).
   - `PATCH /deliveries/:id/deliver` — por item, um de cada vez. Corpo
     `{ lat?, lng? }`.
   - `PATCH /deliveries/:id/complete-return` — atomica, mas so afeta os itens
     `DELIVERED` com `requiresReturn=true` do lote (filtro, nao tudo-ou-nada).
     Corpo `{ lat, lng }` sempre obrigatorio.
2. Novo campo `Delivery.destinationKnownAtCreation` (default `true`,
   consistente em todos os itens de um lote — validado em Zod). `true`:
   comportamento de sempre, endereco e preco na criacao. `false`: pedido
   nasce so com endereco PICKUP; `distanceKm`/`totalValue`/`driverValue`/
   `platformValue` ficam nulos ate `deliver()`. Nesse modo, `lat`/`lng` no
   corpo de `deliver()` sao obrigatorios — viram o destino, criando a linha
   DROPOFF (campos estruturados nulos, so lat/lng preenchidos — sem
   geocodificacao reversa) e disparando o mesmo `GoogleMapsService`/
   `PricingService` que a criacao usaria, agora retroativamente.
3. Fechamento automatico: item sem `requiresReturn` vira `COMPLETED` sozinho
   no mesmo `deliver()` que o leva a `DELIVERED` (as duas transicoes ficam no
   historico, mesmo sendo quase simultaneas). Item com `requiresReturn=true`
   fica em `DELIVERED` ate `complete-return` aprovar a proximidade.
4. `complete-return` calcula distancia em linha reta (Haversine, novo
   `apps/api/src/common/haversine.ts` — nao rota real) entre o lat/lng
   informado e o endereco de coleta da empresa, comparando contra
   `PlatformSettings.returnProximityRadiusMeters` (novo, nullable-ate-
   configurar, mesmo padrao de `dispatchOfferTimeoutSeconds`: falha com erro
   claro em vez de usar um raio inventado). Por isso `PUT /company/address`
   passou a aceitar `lat`/`lng` opcionais — sem coordenadas cadastradas,
   `complete-return` nunca teria como validar proximidade.
5. Sem prova de entrega adicional (foto, confirmacao do cliente) nesta fase —
   decisao explicita do responsavel, aceitando o risco por ora. Fica marcado
   como debito tecnico de seguranca/fraude pra revisitar.
6. Corrigido de raspao um bug real em `cancel()`: antes, qualquer item
   `COMPLETED` no lote bloqueava cancelar os demais itens ainda ativos, pra
   sempre — inofensivo antes porque `COMPLETED` era inalcancavel, deixou de
   ser com esta feature. Agora `cancel()` ignora itens ja
   `CANCELLED`/`COMPLETED` e so falha se nao sobrar nada pra cancelar.

### Persistencia

- Migration aditiva `20260816195435_delivery_lifecycle_gps_deferred_pricing`:
  `Delivery.destinationKnownAtCreation` (novo, `NOT NULL DEFAULT true`);
  `Delivery.totalValue/driverValue/platformValue` deixam de ser obrigatorios;
  `DeliveryAddress.street/number/city/state/zip` deixam de ser obrigatorios;
  `PlatformSettings.returnProximityRadiusMeters` (novo, nullable). Tudo
  `DROP NOT NULL`/`ADD COLUMN` nullable — sem perda de dado, aplicada com
  `prisma migrate dev` direto no Postgres local (`docker-compose`).
- `Driver.lastKnownLat/lastKnownLng/lastSeenAt` continuam sem uso (nenhuma
  leitura/escrita em lugar nenhum) — nao foram usados aqui, sao um campo
  futuro separado.

## Historico de mudancas

### 2026-08-20 - detalhes administrativos reais de entregador, cliente e pedido

O painel de detalhe de entregador deixou de usar `mockDriverDetailStats`,
`mockWalletTransactions` e solicitacoes de saque ficticias. Ele agora consulta
o cadastro real, os pedidos vinculados e o ledger da carteira, com filtros de
status para pedidos e de status/periodo para o extrato. Os valores de carteira
sao sempre derivados do ledger; nao ha botoes para inserir/remover saldo sem
uma operacao financeira real por tras.

Foram adicionados `GET /admin/drivers/:id` e o detalhe administrativo da
carteira em `GET /admin/financial/driver-wallets/:driverId`. Este ultimo aceita
os mesmos filtros de `GET /driver/wallet` (`status`, `from`, `to`, `limit`) e
retorna o extrato associado ao resumo e a conferencia cache-versus-ledger.
`GET /deliveries` aceita `driverId` somente para administradores; empresa ou
motoboy que tentarem ampliar o escopo recebem 403.

O contrato de detalhe de pedido passou a expor status atualizado, metodo de
pagamento, fatura vinculada, entregador e historico de status. A nova tela
`admin-web/pedidos/[id]` usa esses dados para navegar entre pedido, entregador
e fatura e mostra valores congelados, enderecos e auditoria operacional.
Nenhuma migration foi necessaria.

Arquivos principais: `apps/admin-web/src/app/(app)/{entregadores/[id],pedidos/[id]}`,
`apps/api/src/{admin/drivers,deliveries,finance}` e contratos em
`packages/{types,validation,api-client}`.

Validacao: `pnpm typecheck` aprovado nos 8 workspaces; E2E completa da API
aprovada (17 suites, 130 testes), cobrindo detalhe administrativo de motorista,
extrato filtrado, isolamento do filtro por entregador e auditoria do pedido.

O detalhe de cliente tambem deixou de usar `mockClientDetailStats`. A tela usa
o cadastro administrativo de empresa (responsavel, praca, aprovacao), equipe e
enderecos cadastrados, alem dos pedidos e faturas daquela empresa. O admin pode
filtrar pedidos por status e faturas por status; os cards financeiros mostram
somente agregados de entregas/faturas retornados pela API, sem uma carteira
ficticia. A lista de clientes ganhou o atalho para este detalhe real.

`GET /admin/companies/:id` entrega cadastro, praca, equipe e enderecos.
`GET /deliveries?companyId=` e `GET /admin/financial/invoices?companyId=`
permitem recortar pedidos e faturas por empresa somente para administradores;
a listagem de faturas da propria empresa continua ignorando esse filtro externo
e mantem o escopo da associacao autenticada. Nenhuma migration foi necessaria.

Arquivos adicionais: `apps/admin-web/src/app/(app)/clientes/{page,[id]/page}.tsx`,
`apps/api/src/admin/companies/*`, `apps/api/src/finance/invoice.service.ts` e
os contratos de empresa, fatura e pedidos compartilhados. A E2E completa foi
executada novamente apos este recorte e permaneceu aprovada (17 suites, 130
testes), incluindo o detalhe de empresa e os filtros administrativos por
empresa.

O antigo indice mockado de relatorios foi substituido por
`GET /admin/reports/operations`. Sem periodo informado, a API usa os ultimos
30 dias; `from` e `to` restringem o periodo em UTC. O resultado separa
explicitamente pedidos criados (com distribuicao pelo status atual) de entregas
concluidas (onde valor total, repasse, receita e ticket medio fazem sentido).
Tambem agrega empresas, entregadores e modalidades, com links para os detalhes
de investigacao no painel. O endpoint e exclusivo do admin e foi coberto na
E2E com uma tentativa de acesso de empresa recebendo 403.

Arquivos adicionais: `apps/api/src/admin/reports/*`,
`packages/{validation,types,api-client}/src/{admin,report}*` e
`apps/admin-web/src/app/(app)/relatorios/page.tsx`. Nenhuma migration foi
necessaria.

O painel da empresa agora tem detalhe de pedido em `company-web/pedidos/[id]`,
com coleta/destino, status, entregador, fatura e historico real. A lista ganhou
filtro de status e links de detalhe. O filtro compartilhado de pedidos tambem
passou a aceitar `from` e `to` pela data de criacao, sempre combinado ao escopo
autenticado da empresa, entregador ou administrador.

`company-web/indicadores` e `company-web/relatorios` nao usam mais arrays
mockados: calculam pedidos, valores, cancelamentos, modalidades, distribuicao
de status e faturas diretamente das APIs. Os dois permitem periodo; o relatorio
de faturamento ainda filtra o status das faturas e abre os detalhes de pedido e
fatura. Validacao: typecheck dos 8 workspaces, build de producao do company-web
e a E2E completa da API (17 suites, 130 testes) aprovados, incluindo o filtro
de data da empresa. Nenhuma migration foi necessaria.

O dashboard inicial do admin tambem foi refeito com dados reais: pedidos por
estado operacional, entregas concluidas recentes, primeira fatura pendente ou
vencida, indicadores financeiros e disponibilidade declarada pelos entregadores.
`AdminDriverListItem` agora inclui `availability`, que e o estado registrado no
app - nao uma fila Redis ou rastreamento de mapa, dados que a API nao expoe.

Os dois painéis web nao possuem mais imports de arquivos `mock-data`: foram
removidos o dashboard administrativo, indicadores/relatorios ficticios da
empresa, identidades falsas no topo e formularios de integracao sem backend.
As paginas de integracao agora deixam claro que Aiqfome e o unico escopo e que
nao ha credencial/webhook implementado; nao simulam salvamento ou ativacao.
Configuracoes tambem mostra somente as rotas realmente operaveis (modalidades e
tabelas de preco). Nenhuma migration foi necessaria.

O perfil do driver-app passou a consultar `/auth/me` e mostra nome/e-mail reais;
os antigos campos editaveis, senha, foto e exclusao foram removidos porque nao
ha endpoints que executem essas acoes com seguranca. Validacao adicional:
typecheck completo e o teste do driver-app aprovados.

O menu lateral do driver-app tambem deixou de usar a identidade simulada: ele
consulta `/auth/me` para mostrar o entregador autenticado e o comando Sair agora
remove o token persistido e reinicia a navegacao na tela de login. O arquivo
`src/lib/mockData.ts` foi removido. A tela Ajustes nao mostra mais chaves de
mapa, sobreposicao, som ou tela sempre ligada, pois esses recursos nao sao
persistidos nem executados pelo aplicativo; ela explica essa limitacao e aponta
o seletor de disponibilidade real na tela inicial.

Arquivos: `apps/driver-app/src/components/DrawerMenu.tsx`,
`apps/driver-app/src/screens/SettingsScreen.tsx` e
`apps/driver-app/src/navigation/types.ts`. Validacao: Prettier nos tres
arquivos, `pnpm typecheck`, `pnpm --filter @motoboycity/driver-app test --
--runInBand`, `pnpm lint` e `git diff --check` aprovados. O lint do driver-app
termina sem erros e com 52 avisos pre-existentes de estilos inline e `no-void`.

A Home do entregador nao mostra mais um mapa de fase futura nem abas sem dados.
Ela informa online/offline pelo valor retornado de `GET /driver/presence`, o
estado da conexao Socket.IO, erro recuperavel de sincronizacao e entregas ativas
obtidas da API. A cada reconexao do Socket, o app consulta a presenca novamente:
isso evita continuar exibindo online quando o backend marcou o entregador como
indisponivel depois de uma queda de conexao. O menu manteve somente carteira,
historico, perfil e ajustes; escalas, desafios, suporte e listas sem API nao sao
mais oferecidos como recursos operacionais.

Arquivos: `apps/driver-app/src/screens/HomeScreen.tsx`,
`apps/driver-app/src/lib/socket.ts` e `apps/driver-app/src/components/DrawerMenu.tsx`.
Validacao: Prettier, `pnpm typecheck`, `pnpm --filter @motoboycity/driver-app
test -- --runInBand`, lint do driver-app e `git diff --check` aprovados. O lint
permanece sem erros e com 48 avisos pre-existentes.

O evento Socket.IO `delivery:offer` foi ampliado para uma decisao operacional
real: empresa, forma de pagamento, valor total, comissao da plataforma, ganho
do entregador, distancia e a lista de todos os itens do lote. Cada item inclui
modalidade, coleta e destino congelados no pedido, seus valores e a exigencia
de retorno. O app mostra esses dados antes de Aceitar/Recusar. Quando o destino
e definido somente na entrega, o contrato preserva valores e destino como nulos
e a UI deixa claro que ambos serao informados/calculados na conclusao; nao usa
zero ou endereco ficticio.

Arquivos: `packages/types/src/delivery-offer.ts`,
`apps/api/src/dispatch/dispatch.service.ts`,
`apps/driver-app/src/screens/IncomingOfferScreen.tsx` e testes de dispatch/
ciclo de entrega. Nenhuma migration foi necessaria. Validacao: `pnpm typecheck`,
teste unitario focado de dispatch (37 testes) e E2E completa da API (17 suites,
130 testes) aprovados; `pnpm lint` e o teste do driver-app tambem aprovados.

A carteira e o historico do entregador passaram a aceitar periodo por data,
reaproveitando os filtros `from` e `to` ja validados nas APIs de ledger e
entregas. Ambos validam `AAAA-MM-DD` e ordem das datas no aplicativo, permitem
limpar o filtro e mantem o link para o detalhe do pedido. A carteira tambem
inclui transacoes canceladas e esclarece que os saldos sao atuais, enquanto
somente as linhas do extrato sao filtradas. Erros de periodo nao escondem os
campos usados para corrigi-los.

Arquivos: `apps/driver-app/src/screens/{DriverWalletScreen,DriverHistoryScreen}.tsx`.
Validacao: Prettier, `pnpm typecheck`, teste do driver-app, lint do driver-app
e `git diff --check` aprovados. O lint do app termina sem erros e com 37 avisos
pre-existentes de estilo inline e `no-void`.

Durante uma entrega ativa, o entregador pode abrir a navegacao externa para a
coleta (`ACCEPTED`), destino (`COLLECTED`) ou retorno a coleta (`DELIVERED`).
O link usa coordenadas quando existentes e, caso contrario, o endereco
estruturado congelado no pedido. Destino ainda indefinido nao mostra atalho de
rota, evitando sugerir um local inexistente. Arquivo:
`apps/driver-app/src/screens/DeliveryOperationScreen.tsx`. Validacao: Prettier,
`pnpm typecheck`, teste e lint do driver-app e `git diff --check` aprovados.

As antigas rotas de "Disponiveis", "Pedidos agendados", "Minhas escalas",
"Desafios" e "Suporte" tambem foram removidas do registro de navegacao e do
tipo de rotas. Elas eram telas locais de fase zero, sem endpoint, acao de
suporte ou contrato operacional correspondente; deixa-las acessiveis criaria
uma promessa falsa de funcionalidade. O menu ja nao as oferecia e agora nao ha
rota interna para alcança-las. Arquivos removidos:
`apps/driver-app/src/screens/{AvailableOrdersScreen,ScheduledOrdersScreen,MyShiftsScreen,ChallengesScreen,SupportScreen}.tsx`
e `src/components/NotSpecifiedNotice.tsx`; o registro foi atualizado em
`apps/driver-app/App.tsx` e `src/navigation/types.ts`.

Validacao: Prettier, `pnpm typecheck` (8 workspaces) e teste do driver-app
aprovados. O lint do app segue sem erros, agora com 24 avisos de estilo
inline/no-void; `git diff --check` ainda deve ser executado apos o proximo
bloco de alteracoes.

O painel administrativo tambem deixou de oferecer os atalhos "IAGo", "Lancar
Pedido" e "Ver mais", que levavam a telas sem fluxo ou itens definidos. As
duas paginas de fase zero foram removidas e a navegacao agora lista somente
modulos com dados e operacoes reais. O unico item do menu da conta e `Sair`,
que limpa o token da sessao e redireciona para `/login`. Arquivos:
`apps/admin-web/src/components/layout/top-nav.tsx` e remocao de
`src/app/(app)/{iago,lancar-pedido}/page.tsx`.

Validacao: Prettier, `pnpm typecheck` (8 workspaces), lint e build de producao
do `@motoboycity/admin-web` aprovados. A exclusao de rotas exigiu regenerar os
tipos de rota do Next antes da validacao, pois o cache local de desenvolvimento
mantinha as entradas removidas.

No painel da empresa, o item decorativo `Suporte` e o item `Perfil` sem tela
foram retirados da barra. `Sair` passou a limpar a sessao do lojista e a
redirecionar para `/login`, deixando o menu de conta com uma unica operacao
executavel. Arquivo: `apps/company-web/src/components/layout/top-nav.tsx`.
Validacao: Prettier, `pnpm typecheck` (8 workspaces), lint e build de producao
do `@motoboycity/company-web` aprovados.

Na pagina inicial do lojista tambem foi removido o card de "Mapa" marcado como fase
futura. Ela agora concentra o fluxo existente: consultar/configurar o endereco
de coleta e lancar pedido, sem representar visualmente uma integracao de mapa
ou rastreamento que nao existe. Arquivo: `apps/company-web/src/app/(app)/page.tsx`.
Validacao: Prettier, `pnpm typecheck` (8 workspaces), lint e novo build de
producao do `@motoboycity/company-web` aprovados.

`InvoiceService.markPaid()` passou a fazer a transicao financeira de modo
condicional no banco: tenta `PENDING -> PAID` e `OVERDUE -> PAID`, gravando o
historico somente quando uma das atualizacoes afetar exatamente uma fatura.
Uma segunda confirmacao concorrente agora recebe conflito e nao cria uma linha
`PAID` duplicada nem sobrescreve a origem da transicao. Arquivos:
`apps/api/src/finance/invoice.service.ts` e
`apps/api/test/delivery-lifecycle.e2e-spec.ts`.

Validacao: Prettier, E2E focado de ciclo de entrega (17 testes, incluindo duas
confirmacoes simultaneas de pagamento), `pnpm typecheck` nos 8 workspaces e
lint da API aprovados.

As tabelas de pedidos dentro do detalhe de fatura, nos paineis administrativo
e da empresa, agora ligam cada numero ao detalhe do pedido correspondente.
Isso permite conferir endereco, entregador, transicoes de status e valores
congelados sem perder o contexto financeiro da fatura. Arquivos:
`apps/{admin-web,company-web}/src/app/(app)/faturas/[id]/page.tsx`.
Validacao: Prettier, `pnpm typecheck` (8 workspaces), lint e build de producao
dos dois paineis aprovados.

Os filtros financeiros do admin passaram a validar o intervalo antes de chamar
a API e permitem limpar o periodo aplicado. A listagem de faturas tambem limpa
status e datas, enquanto a busca de carteiras limpa o texto aplicado. Assim o
operador nao fica preso a um recorte anterior ou recebe apenas um erro generico
da consulta para datas invertidas. Arquivos:
`apps/admin-web/src/app/(app)/{financeiro,faturas}/page.tsx`.
Validacao: Prettier, `pnpm typecheck` (8 workspaces), lint e build de producao
do `@motoboycity/admin-web` aprovados.

As rotas de integracao dos paineis admin e empresa foram removidas porque so
exibiam um aviso de que Aiqfome, credenciais e webhook ainda nao existem. Sem
consulta ou operacao real, mante-las no menu contrariava o criterio de nao
oferecer recursos simulados. O fluxo manual de pedidos continua intacto;
integracao deve voltar apenas com contrato, armazenamento seguro de credenciais
e auditoria de webhook ponta a ponta. Arquivos removidos:
`apps/{admin-web,company-web}/src/app/(app)/integracoes/page.tsx`; a barra da
empresa foi atualizada em `apps/company-web/src/components/layout/top-nav.tsx`.
Validacao: Prettier, regeneracao dos tipos de rota, `pnpm typecheck` (8
workspaces), lint e build de producao dos dois paineis aprovados.

Relatorios e indicadores passaram a usar o mesmo comportamento de filtros do
financeiro: datas invertidas sao informadas antes da consulta e `Limpar`
restaura o recorte completo. No relatorio da empresa, o status da fatura agora
e aplicado junto com o periodo, em vez de disparar uma consulta diferente ao
alterar somente o seletor. Arquivos:
`apps/admin-web/src/app/(app)/relatorios/page.tsx` e
`apps/company-web/src/app/(app)/{relatorios,indicadores}/page.tsx`.
Validacao: Prettier, `pnpm typecheck` (8 workspaces), lint e build de producao
dos dois paineis aprovados.

Regressao integrada apos os recortes financeiros e de navegacao: `pnpm --filter
@motoboycity/api test:e2e` passou com 17 suites e 130 testes; `pnpm lint` da
raiz passou nos 8 workspaces. O Jest ainda informa o aviso conhecido de handles
abertos ao encerrar a suite E2E, sem teste pendente ou falha. O lint permanece
sem erros, com 24 avisos de estilos inline/no-void no driver-app.

O detalhe de pedido do driver-app deixou de mostrar o status fixo "Concluido"
e passou a consumir todo o detalhe ja retornado pela API: status atual, data de
criacao e atualizacao, valores total/repasse/comissao/retorno, distancia,
enderecos e referencia, empresa/modalidade, obrigacao de retorno, cobranca,
fatura e trilha de transicoes com ator e nota. Os estilos claro/escuro foram
consolidados em `StyleSheet`, sem avisos inline nessa tela. Arquivo:
`apps/driver-app/src/screens/DriverOrderDetailScreen.tsx`.
Validacao: Prettier, `pnpm typecheck` (8 workspaces), teste do driver-app e
lint do driver-app aprovados; o lint segue sem erros e agora totaliza 11 avisos
remanescentes em outros arquivos.

Ao concluir uma entrega no fluxo operacional, o motoboy agora recebe o atalho
`Ver detalhes e histórico` antes de voltar ao inicio. Ele abre o registro
detalhado da mesma entrega, preservando a auditoria de status e os valores que
acabaram de ser calculados. Arquivo:
`apps/driver-app/src/screens/DeliveryOperationScreen.tsx`.
Validacao: Prettier, `pnpm typecheck` (8 workspaces), teste e lint do
driver-app aprovados; o lint continua sem erros e com 11 avisos remanescentes.

Os avisos remanescentes do lint do driver-app foram eliminados sem alterar
fluxos: estilos condicionais de botao, carregamento, login/cadastro, carteira
e operacao passaram a usar estilos nomeados. Arquivos:
`apps/driver-app/{App.tsx,src/components/PrimaryButton.tsx,src/screens/{LoginScreen,RegisterScreen,DriverWalletScreen,DeliveryOperationScreen}.tsx}`.
Validacao: Prettier, `pnpm typecheck` (8 workspaces), teste e lint do
driver-app aprovados; lint sem avisos ou erros.

Limitacao operacional importante: o app captura GPS real apenas pontualmente
para destino indefinido e retorno. Nao ha rastreamento continuo, atualizacao em
segundo plano, mapa de rota ou notificacao push nativa; o mapa de fase futura
foi removido da Home para nao aparentar cobertura GPS que nao existe. A proxima
decisao de produto precisa definir a politica de rastreamento (somente durante
entrega ativa ou tambem enquanto online), permissao de segundo plano e retencao
da localizacao antes de implementar esse fluxo.

Limitacao: liberacao de repasse, solicitacao/pagamento de saque e antecipacao
continuam sem regras ou operacoes implementadas; o painel mostra os estados
existentes sem inferir que qualquer valor pendente foi pago.

### 2026-08-20 — Faturas auditáveis para empresa e administrador

Implementadas rotas reais de fatura: o admin fecha, somente em segunda-feira,
todas as entregas `COMPLETED`, `BILLED` e ainda sem `invoiceId`, agrupadas por
empresa. Os valores total, repasse e plataforma são congelados na emissão e os
pedidos são vinculados condicionalmente na mesma transação para não entrar em
duas faturas concorrentes. O admin também pode marcar uma fatura `PENDING` ou
`OVERDUE` como paga de forma manual; a empresa só lista/detalha as próprias
faturas.

Nova tabela append-only `InvoiceStatusHistory` registra emissão, vencimento
automático na consulta financeira e confirmação de pagamento, incluindo o
usuário quando a mudança é humana. Migration aditiva local aplicada:
`20260820123825_invoice_status_history`.

Rotas: `POST/GET/PATCH /admin/financial/invoices`,
`GET /company/invoices` e `GET /company/invoices/:id`. Arquivos centrais:
`apps/api/src/finance/invoice.{service,controller}.ts`, contratos Zod/types e
a migration acima.

Validação: `prisma validate`, `prisma migrate status`, typecheck da API e E2E
do ciclo de entrega aprovados (17 testes). A E2E cria repasse, fecha a fatura,
consulta como empresa e a marca como paga, verificando o histórico
`PENDING → PAID`.

As telas `company-web/faturas` e `admin-web/faturas` agora usam as rotas reais:
ambas têm filtro por status/período e detalhe de valores, pedidos e trilha de
auditoria. O admin fecha o ciclo selecionando uma segunda-feira e confirma o
pagamento manual no detalhe; a empresa só visualiza, sem qualquer ação de
cobrança. Builds dos dois Next.js e a suíte E2E completa da API (17 suítes,
130 testes) foram aprovados após a integração.

Pendente: substituir os detalhes mockados de cliente/entregador no admin por
dados financeiros reais e ampliar os relatórios por período. Saque, liberação
de repasse e antecipação ainda não possuem operação financeira.

### 2026-08-20 — Base financeira real para o motoboy

Ao concluir uma entrega, a mesma transacao que grava `COMPLETED` agora cria um
`WalletTransaction` `CREDIT_REPASSE` em `PENDING` e soma o valor congelado em
`Wallet.cachedBlockedBalance`. A chave unica `idempotencyKey` garante que duas
finalizacoes concorrentes nao gerem dois repasses; a segunda recebe conflito e
o unico credito confirmado permanece no ledger.

Nova rota autenticada de motorista: `GET /driver/wallet`, com filtros por
status e periodo, retorna saldo disponivel, saldo a liberar, reserva de saque,
checagem cache-versus-ledger e extrato com referencia da entrega. O app trocou
a carteira mockada por essa rota, mostra os tres estados de extrato, permite
filtrar e abrir o pedido associado. As telas de saque e antecipacao eram apenas
formularios ficticios; foram removidas da navegacao ate haver as regras e
operacoes reais.

Migration aditiva aplicada somente no PostgreSQL local:
`20260820121751_wallet_transaction_idempotency` adiciona
`wallet_transactions.idempotencyKey` e indice unico. O SQL foi obtido com
`prisma migrate diff`, pois `prisma migrate dev --create-only` nao pode abrir
o prompt interativo neste ambiente; o resultado foi inspecionado antes do
`prisma migrate deploy` local.

Arquivos principais: `apps/api/src/finance/*`,
`apps/api/src/deliveries/deliveries.service.ts`,
`packages/{types,validation,api-client}/src/finance*`,
`apps/driver-app/src/screens/DriverWalletScreen.tsx` e a migration acima.

Validacao: `prisma validate`, `prisma migrate status`, `pnpm typecheck`, tres
suites unitarias de API (50 testes) e `pnpm --filter @motoboycity/api test:e2e`
(17 suites, 130 testes) aprovados. A e2e cobre o credito pendente no endpoint
e duas finalizacoes concorrentes gerando exatamente um repasse.

Limitacoes/proximo passo: ainda nao existem as acoes financeiras para liberar
repasse, solicitar/pagar saque, antecipar ou faturar empresas. Logo o saldo
disponivel continuara em zero para novos creditos; isso e exibido como
"a liberar", sem prometer pagamento ao motoboy. A proxima fase deve definir a
regra de liberacao e ligar faturas/controles auditaveis do admin e da empresa.

### 2026-08-20 — Historico e detalhe reais no driver-app

As rotas `History` e `OrderDetail` do app nao usam mais os pedidos e valores
ficticios de `mockData`. O historico consulta somente entregas `COMPLETED` do
motoboy autenticado e mostra a soma de `driverValue` como **ganhos por
entregas**, nao como saldo, carteira ou repasse. O detalhe busca o pedido por
ID e exibe valores congelados, coleta, destino, empresa e modalidade reais.

`mockData` mantem somente as telas que ainda nao tem backend (carteira,
perfil/configuracoes); os mocks de historico e detalhe foram removidos para
nao reaparecerem acidentalmente em producao.

Arquivos: `apps/driver-app/src/screens/{DriverHistoryScreen,DriverOrderDetailScreen}.tsx`,
`apps/driver-app/App.tsx` e `apps/driver-app/src/lib/mockData.ts`.

Validacao: typecheck e teste do driver-app aprovados. O lint nao tem erros e
reporta 79 warnings de estilo no app, incluindo estilos inline das telas novas.

Limitacao: `driverValue` e a remuneracao congelada da entrega, mas nao existe
carteira, credito ou estado de repasse no backend ainda; por isso esta tela nao
declara pagamento recebido.

### 2026-08-20 — Realtime para cancelamento e conta impedida no app

Cancelamento administrativo de entrega ja aceita/coletada/em retorno agora
notifica o motoboy por `delivery:cancelled`, com todos os IDs do lote afetado.
O evento e emitido apenas apos a transacao de cancelamento e o app remove esses
pedidos do estado ativo, informa o motivo e volta para a home. Isso evita manter
uma tela operacional cujo proximo CTA inevitavelmente falharia em conflito.

O socket do app tambem passou a tratar o evento ja existente
`driver:account-status-changed`: ao receber `SUSPENDED` ou `BLOCKED`, remove a
oferta pendente, marca a presenca local como indisponivel e encerra a tela de
operacao com orientacao para suporte. `ACTIVE` nao muda disponibilidade, como
define a regra de negocio.

Arquivos: `apps/api/src/deliveries/{deliveries.module,deliveries.service}.ts`,
`apps/driver-app/src/lib/socket.ts` e `apps/driver-app/src/screens/HomeScreen.tsx`.

Validacao: `pnpm typecheck` aprovado nos 8 workspaces e teste unitario de
`DeliveriesService` aprovado (46 testes), incluindo emissao para o motorista
afetado pelo cancelamento.

### 2026-08-20 — Ciclo operacional no driver-app

O app agora consome o ciclo de entrega ja existente na API. Depois de aceitar
uma oferta, ele abre o pedido atribuido e mostra uma acao por estado:
`ACCEPTED` confirma coleta, `COLLECTED` marca a entrega e `DELIVERED` conclui
o retorno quando exigido. Pedido sem destino conhecido captura um fix GPS para
definir o destino e o preco; retorno sempre captura um fix para a validacao de
proximidade. Pedido com destino conhecido nao envia coordenada desnecessaria.

- Adicionado `@react-native-community/geolocation` (3.x), permissao precisa no
  Android e texto de permissao no iOS. A captura e pontual, em primeiro plano,
  com alta precisao, timeout de 20 s e sem rastreamento em segundo plano.
  Fix marcado pelo sistema como simulado e recusado no app antes da chamada.
- `GET /deliveries` passou a aceitar motoboy, sempre filtrando por `driverId`
  no servidor. Isso permite recuperar os pedidos `ACCEPTED`, `COLLECTED` e
  `DELIVERED` ao reabrir o app; nenhuma entrega de outro motoboy e exposta.
- Ao concluir um item sem retorno, o app avanca para o proximo pedido ativo,
  quando existir. Enquanto uma entrega esta operacional, a tela nao permite
  voltar acidentalmente para a home e perder o acesso a ela.
- O Jest do app passou a mockar AsyncStorage e geolocalizacao; antes, o unico
  teste de renderizacao falhava por tentar acessar o modulo nativo real.

Arquivos principais: `apps/api/src/deliveries/deliveries.service.ts`,
`apps/driver-app/src/screens/DeliveryOperationScreen.tsx`,
`apps/driver-app/src/lib/{location,activeDeliveries}.ts` e permissoes nativas.

Validacao: `pnpm typecheck` aprovado nos 8 workspaces;
`pnpm --filter @motoboycity/driver-app test -- --runInBand` aprovado;
`pnpm --filter @motoboycity/api exec jest src/deliveries/deliveries.service.spec.ts --runInBand`
aprovado (46 testes); e E2E focado de ofertas aprovado (8 testes), incluindo
listagem isolada por motoboy. Lint do driver-app sem erros, com 75 warnings de
estilos inline/no-void preexistentes ou ja adotados pelo padrao atual.

Limitacao: nao ha mapa, navegacao externa, rastreamento continuo, segundo plano
ou foreground service neste recorte; isso continua fora do contrato atual de
captura pontual de GPS.

### 2026-08-19 — Precisao do GPS nas acoes que valem dinheiro

Preparacao para as telas do driver-app, feita ANTES delas de proposito: o
contrato aceitava `lat`/`lng` e nada mais, e nesses dois fluxos a coordenada nao e
informativa. Na entrega sem endereco ela DEFINE destino, distancia e preco; no
retorno ela decide se o motoboy esta de volta na loja. Sem saber a precisao, o
servidor nao distinguia um GPS travado no satelite de uma triangulacao de antena
com centenas de metros de erro — e as duas viravam valor cobrado.

`accuracy` (metros, opcional) entrou nos dois schemas e payloads. O app manda o
que o aparelho reportar; quem decide se serve e o servico.

Dois criterios, porque protegem coisas diferentes:

- **Entrega sem destino:** `MAX_LOCATION_ACCURACY_METERS` = 100 m, constante em
  `deliveries.service.ts`. Nao virou campo de `PlatformSettings` de proposito —
  e piso tecnico de qualidade do dado, nao politica comercial. Ajustavel pelo
  painel, alguem subiria para 5 km no dia em que o GPS estivesse ruim, e o efeito
  seria cobrar preco de uma rota inventada.
- **Fechamento de retorno:** criterio RELATIVO — precisao maior que o proprio
  `returnProximityRadiusMeters` torna a checagem vazia (raio de 200 m com fix de
  800 m faz "voltei na loja" ser verdade em qualquer lugar do bairro).

Nos dois casos a acao e recusada sem gravar nada; o motoboy repete com o sinal
estabilizado.

Arquivos: `packages/validation/src/deliveries/{mark-delivered,complete-return}.schema.ts`,
`packages/types/src/delivery.ts`, `apps/api/src/deliveries/deliveries.service.ts`,
`apps/api/test/delivery-lifecycle.e2e-spec.ts`.

Validacao: `tsc --noEmit` limpo; unit 217/217; e2e 129/129 (era 127). Removendo as
duas travas, os dois testes novos falham (conferido).

**Decidido para a proxima fase:** biblioteca de GPS do driver-app sera
`@react-native-community/geolocation` — o app e RN CLI puro (0.86.2), essa e a
oficial da comunidade, mantida, e usa o fused provider do Play Services. O fluxo
precisa so de captura PONTUAL (marcar entregue, fechar retorno): sem rastreamento
continuo, sem localizacao em segundo plano, sem foreground service. Permissao
necessaria: `ACCESS_FINE_LOCATION` em uso.

### 2026-08-19 — Seletor de destino no company-web

O modo "destino informado na entrega" existia na API desde 16/08 e nenhuma tela
alcancava: o formulario de pedido so sabia criar com endereco. A empresa agora
escolhe entre informar o endereco na criacao (padrao, comportamento de sempre) ou
deixar o motoboy definir na entrega.

No modo sem destino os campos de endereco somem e o payload **nao** inclui
`dropoffAddress` — o contrato recusa o pedido se ele vier junto de
`destinationKnownAtCreation: false`, para nao existir pedido meio definido. A
validacao do formulario tambem deixa de exigir endereco. Os rotulos dizem a
consequencia (o pedido fica sem valor ate a entrega), nao o nome do campo.

O padrao continua destino conhecido, para nao mudar sem aviso o que a empresa ja
conhece.

Cobertura: o modo GPS so tinha prova e2e no LOTE. O caminho que esta tela dispara
e o pedido INDIVIDUAL, que tinha apenas os dois casos de recusa. Foi adicionado o
ciclo completo do individual sem destino (nasce sem DROPOFF e sem valor; preco e
distancia aparecem na entrega por GPS).

Arquivos: `apps/company-web/src/components/orders/create-order-form.tsx`,
`apps/api/test/delivery-lifecycle.e2e-spec.ts`.

Validacao: `tsc --noEmit` do company-web limpo; `next build` limpo; e2e da API
127/127 (era 126).

**Pendente:** a tela de LOTE no company-web continua nao existindo, entao o modo
sem destino em lote segue sem interface. O aviso de "sem valor ate a entrega" nao
aparece na lista de pedidos — la o valor nulo ja e exibido como "a calcular na
entrega", texto que existia antes desta fase.

### 2026-08-19 — Bloqueio/suspensao com efeito real (P1-03)

`setAccountStatus` so trocava o enum. Na pratica o motoboy suspenso ou bloqueado
seguia marcado como `AVAILABLE`, com o log de presenca aberto contando tempo
online, e as ofertas que ja estavam na mao dele ficavam paradas ate expirar
sozinhas — durante esse tempo o pedido nao ia para mais ninguem, mesmo havendo
motoboy livre. E o aceite nao olhava `accountStatus`: quem fosse bloqueado
segurando uma oferta ainda conseguia assumir o pedido.

O que passou a acontecer ao suspender/bloquear:

1. `availability` cai para `UNAVAILABLE` e o `DriverPresenceLog` aberto e
   fechado, na mesma transacao da troca de status (mesmo caminho de ficar
   offline);
2. as ofertas pendentes voltam para a fila via
   `DispatchService.releasePendingOffersForDriver()`, que reaproveita
   `handleOfferExpired` — ela ja trata lote, cancela o job de timeout, avisa o
   app e redespacha, entao nao existe um segundo fluxo para manter em acordo;
3. o app do motoboy recebe `driver:account-status-changed`, para nao continuar
   exibindo uma oferta que ja nao e dele.

Reativar devolve o direito de trabalhar, mas **nao** a disponibilidade: ficar
online e escolha do motoboy, e reativar sozinho o colocaria para receber pedido
sem ter pedido.

A guarda de aceite entrou em `DeliveryOffersService.findDriverForUser()`, ponto
unico de aceite e recusa; recusar tambem fica bloqueado, para o motoboy impedido
nao operar a fila de nenhum lado.

Sem mudanca de schema e sem migration. `AdminDriversModule` passou a importar
`DispatchModule` e `RealtimeModule`.

Arquivos: `apps/api/src/dispatch/dispatch.service.ts`,
`apps/api/src/delivery-offers/delivery-offers.service.ts` (+spec),
`apps/api/src/admin/drivers/admin-drivers.service.ts` (+spec e module).

Validacao: `npx tsc --noEmit` limpo; `npx jest --runInBand` 217/217;
`npx jest --config test/jest-e2e.json --runInBand` 126/126. Removendo a guarda
de aceite, os tres testes novos de conta impedida falham (conferido).

**Pendente:** nao ha cobertura e2e do bloqueio ponta a ponta (admin bloqueia →
oferta volta para a fila → aceite recusado). Os testes acima sao unitarios.

### 2026-08-19 — Preco por regiao da empresa (P1-06)

`PricingService.quote()` escolhia a praca sozinho, com
`region.findFirst({ active: true })` — a primeira regiao ativa numa ordem que o
Postgres nao garante. Com uma praca cadastrada isso acertava por acidente; na
segunda, uma empresa passaria a ser cobrada pela tabela de outra cidade,
silenciosamente e sem erro nenhum. `Company.regionId` ja existia, obrigatorio, e
era simplesmente ignorado.

Decisao: `regionId` virou parametro **obrigatorio** de `PricingQuoteInput`, e
nao opcional com fallback. Quem cota precisa dizer de qual praca esta falando;
assim nao sobra caminho de volta ao palpite e o compilador cobra isso em
qualquer chamada nova. A regiao informada e conferida (`id` + `active`): praca
desativada interrompe a cotacao com 409 proprio, em vez de cair para outra —
cair seria cobrar o cliente por uma tabela que nao e a dele. O erro anterior era
500 "nenhuma regiao configurada", que descrevia um problema de plataforma.

Os tres pontos de cotacao passaram a informar a praca da empresa dona do pedido:
criacao individual e em lote via `company.regionId` (que `findCompanyForUser`
passou a carregar), e `markDelivered` — onde o preco nasce na entrega, no modo
GPS — via `delivery.company.regionId`, incluido na consulta. Ali importa a praca
da EMPRESA, nao a de quem entrega: o motoboy pode atender fora da regiao dela.

Sem mudanca de schema e sem migration.

Arquivos: `apps/api/src/pricing/pricing.service.ts`,
`apps/api/src/pricing/pricing.service.spec.ts`,
`apps/api/src/deliveries/deliveries.service.ts`.

Validacao: `npx tsc --noEmit` limpo; `npx jest --runInBand` 211/211;
`npx jest --config test/jest-e2e.json --runInBand` 126/126. Revertendo a selecao
para a antiga, o teste novo falha (conferido).

### 2026-08-16 — Ciclo de entrega (backend) + destino capturado por GPS

Implementado o ciclo pos-aceite completo (item 7 da lista de prioridades) e a
opcao de pedido/lote sem endereco na criacao, com preco calculado
retroativamente a partir da localizacao do motoboy na entrega. So backend
nesta fase — decisao explicita do responsavel, dado que nao existe biblioteca
de GPS nem tela pos-aceite no driver-app hoje.

Arquivos principais:

- `apps/api/prisma/schema.prisma` e a migration
  `20260816195435_delivery_lifecycle_gps_deferred_pricing`;
- `apps/api/src/deliveries/deliveries.service.ts` (`collect`, `markDelivered`,
  `completeReturn`, fix em `cancel()`, `create`/`createBatch` com o novo
  ramo sem destino) e `.controller.ts`;
- `apps/api/src/dispatch/dispatch.service.ts` (payload de oferta com
  `driverValue`/`distanceKm` nulos quando o destino nao e conhecido —
  `Number(null)` seria silenciosamente `0`, nao `null`);
- `apps/api/src/common/haversine.ts` (novo);
- `apps/api/src/admin/platform-settings/` e
  `apps/api/src/company/company-address.*` (novos campos);
- contratos de `packages/validation` (`mark-delivered.schema.ts` e
  `complete-return.schema.ts`, novos; `create-delivery.schema.ts` e
  `update-platform-settings.schema.ts` e `upsert-company-address.schema.ts`,
  editados), `packages/types` e `packages/api-client`;
- `apps/api/test/delivery-lifecycle.e2e-spec.ts` (novo, 13 testes).

Consumidores de `@motoboycity/types` fora do backend foram checados e
corrigidos por causa da mudanca de `totalValue`/`driverValue`/`platformValue`
pra `number | null`: `apps/company-web` (lista de pedidos e mensagem de
sucesso da criacao) e `apps/admin-web` (lista de pedidos) mostram
"A calcular na entrega" quando nulo; `apps/driver-app`
(`IncomingOfferScreen`) mostra "A calcular" no lugar do valor da oferta.
Nenhuma dessas telas tem UI pra _criar_ um pedido sem destino ainda — so
passaram a exibir corretamente o caso quando ele existir via API.

### 2026-08-13 — pedidos em lote

Implementado o contrato completo de lote solicitado apos a auditoria P0-01.

Arquivos principais alterados:

- `apps/api/prisma/schema.prisma`;
- `apps/api/prisma/migrations/20260813195000_add_delivery_batch/migration.sql`;
- `apps/api/src/deliveries/deliveries.controller.ts`;
- `apps/api/src/deliveries/deliveries.service.ts`;
- `apps/api/src/dispatch/dispatch.service.ts`;
- contratos de `packages/validation`, `packages/types` e `packages/api-client`;
- `apps/driver-app/src/screens/IncomingOfferScreen.tsx`;
- testes unitarios de deliveries e dispatch.

O app mobile apenas identifica visualmente a oferta como lote. Ainda nao ha
tela para criar lote no company-web nem visualizacao detalhada do grupo no app
ou admin-web.

### 2026-08-13 — P1-01: oferta pendente unica sob concorrencia

Implementada a primeira correcao do nucleo operacional de dispatch.

- Nova migration aditiva:
  `apps/api/prisma/migrations/20260813210000_enforce_one_pending_offer_per_delivery/migration.sql`.
  Ela falha antes de criar o indice se uma base existente tiver mais de uma
  oferta `PENDING` para a mesma entrega; esse e o impacto de dados que precisa
  ser verificado antes do deploy em staging.
- O indice parcial unico
  `delivery_offers_one_pending_per_delivery_key` garante no PostgreSQL que
  cada `deliveryId` tenha no maximo uma oferta `PENDING`.
- `DispatchService` passou a bloquear as entregas com `FOR UPDATE`, revalidar
  que todas seguem `AWAITING_DRIVER` e verificar oferta pendente dentro de
  transacao `Serializable` antes de inserir. Isto sincroniza dispatch com
  cancelamento e protege lotes como uma unica unidade.
- Corridas esperadas de banco (`P2002` por unicidade e `P2034` por serializacao)
  sao tratadas como resultado idempotente: nao ha job ou evento duplicado.
- Rollback manual da migration: remover apenas o indice parcial. O banco de
  teste foi descartado apos essa verificacao.

Arquivos principais:

- `apps/api/src/dispatch/dispatch.service.ts`;
- `apps/api/src/dispatch/dispatch.service.spec.ts`;
- `apps/api/prisma/migrations/20260813210000_enforce_one_pending_offer_per_delivery/migration.sql`.

### 2026-08-13 — P1-02: elegibilidade formal e backfill controlado de modalidades

Implementada a decisao de produto de atribuir modalidades explicitamente pelo
admin, sem habilitacao em massa dos entregadores existentes. Nao foi criada
migration: a relacao `DriverServiceType` ja existia no schema e passa a ser
usada pelo fluxo operacional.

- Novo contrato administrativo `PUT /admin/drivers/:id/service-types` com
  `{ serviceTypeIds: uuid[] }` (1 a 20 IDs unicos). Ele aceita apenas
  modalidades existentes e ativas e substitui os vinculos em uma transacao;
  o primeiro ID informado e marcado como `isPrimary`.
- `GET /admin/drivers` agora retorna as modalidades atribuidas. O
  `admin-web` permite selecionar e salvar as modalidades por entregador e
  identifica explicitamente quem ainda nao recebera ofertas.
- O dispatch exige que o entregador esteja na mesma `company.regionId`, tenha
  conta `APPROVED`/`ACTIVE`/`AVAILABLE`, possua **todas** as modalidades dos
  pedidos de um lote (e que elas ainda estejam ativas) e nao possua entrega em
  estado operacional `ACCEPTED`, `COLLECTED` ou `DELIVERED`.
- A consulta escolhe o candidato mais antigo online e a criacao revalida os
  mesmos criterios na transacao serializavel antes de inserir a oferta. Uma
  alteracao de conta, modalidade, regiao ou carga entre as duas leituras nao
  gera oferta.
- Entregadores antigos sem vinculos nao sao elegiveis ate que um admin os
  configure no painel. Isso e o backfill controlado; nao ha script que infira
  ou atribua capacidades automaticamente.

Arquivos principais:

- `packages/validation/src/admin/replace-driver-service-types.schema.ts`;
- `packages/types/src/driver.ts` e `packages/api-client/src/admin-drivers.ts`;
- `apps/api/src/admin/drivers/admin-drivers.controller.ts` e
  `apps/api/src/admin/drivers/admin-drivers.service.ts`;
- `apps/admin-web/src/app/(app)/entregadores/page.tsx`;
- `apps/api/src/dispatch/dispatch.service.ts` e os testes correspondentes.

### 2026-08-16 — E2E de lote/dispatch e correcoes de isolamento de teste

Implementado o item 2 da lista de prioridades (cobertura E2E do lote e do
dispatch sob concorrencia). No caminho, tres problemas reais e independentes
foram encontrados e corrigidos — nenhum deles introduzido por este trabalho,
todos pre-existentes e descobertos por serem bloqueadores diretos da tarefa:

1. **Postgres local (docker-compose) estava com schema desatualizado.** As
   duas migrations de 2026-08-13 (lote e indice unico de oferta pendente)
   nunca haviam sido aplicadas no banco de desenvolvimento local — só no Neon
   (ver secao de staging). Isso fazia `POST /deliveries` retornar 500 em
   qualquer E2E que tocasse `deliveries.batchId`. Aplicado
   `prisma migrate deploy` no Postgres local (`docker-compose.yml`,
   porta 5434); as 2 migrations pendentes foram aplicadas com sucesso.
2. **`delivery-offers.e2e-spec.ts` estava quebrado pela elegibilidade P1-02.**
   O motoboy de teste nunca recebia `DriverServiceType`, entao nenhuma oferta
   era criada e 3 dos 8 testes falhavam. Corrigido adicionando a chamada
   `PUT /admin/drivers/:id/service-types` no `beforeAll`. Isso expos um
   segundo problema: os testes de aceite bem-sucedido nunca liberavam o
   motoboy depois (uma entrega `ACCEPTED` torna o motoboy inelegivel sob
   P1-02), travando os testes seguintes que dependiam dele — corrigido com um
   cancelamento por admin apos cada aceite bem-sucedido. Tambem corrigida a
   ordem de limpeza do `afterAll` (excluir `DriverServiceType` antes de
   `ServiceType`, por causa da FK).
3. **Suites de E2E rodando em paralelo corrompiam o estado umas das outras.**
   `jest --config ./test/jest-e2e.json` sem `--runInBand` roda arquivos de
   teste em workers paralelos; como `DispatchService` usa checagens globais
   (ex.: "algum motoboy com oferta pendente em qualquer lugar do banco" em
   `findNextEligibleDriverId`), dois arquivos de teste manipulando motoboys
   reais ao mesmo tempo contra o mesmo Postgres/Redis produziam falhas
   nao-deterministicas (motoboy errado recebendo a oferta, oferta
   inexistente). Corrigido adicionando `--runInBand` ao script `test:e2e` em
   `apps/api/package.json` — suite inteira roda serial agora. Validado: 16
   suites / 110 testes passando de forma repetida com essa flag; sem ela, o
   mesmo lote de arquivos falhava de forma intermitente.

Arquivos principais:

- `apps/api/test/delivery-batch-dispatch.e2e-spec.ts` (novo);
- `apps/api/test/delivery-offers.e2e-spec.ts` (corrigido);
- `apps/api/package.json` (`test:e2e` com `--runInBand`).

Cada teste de lote que nao leva a entrega a um estado terminal (`ACCEPTED`
por aceite de verdade) fecha o lote via cancelamento por admin no fim —
necessario porque `driver-presence.service` chama
`dispatchService.dispatchAvailableDeliveries()` sempre que um motoboy fica
disponivel, varrendo TODAS as entregas `AWAITING_DRIVER` do banco; um lote
orfao de um teste anterior pode ser redespachado pro motoboy do teste
seguinte de forma inesperada.

## Validacoes mais recentes

Executadas em 2026-08-13, apos a implementacao de lote:

| Comando                                                                                                                | Resultado                                           |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `pnpm --filter @motoboycity/api exec prisma validate --schema prisma/schema.prisma`                                    | aprovado                                            |
| `pnpm typecheck`                                                                                                       | aprovado nos 8 workspaces (P1-02)                   |
| `pnpm --filter @motoboycity/api test -- --runInBand`                                                                   | 17 suites, 186 testes aprovados (P1-02)             |
| testes focados de drivers + dispatch                                                                                   | 2 suites, 51 testes aprovados (P1-02)               |
| `pnpm --filter @motoboycity/api lint`                                                                                  | aprovado (P1-02)                                    |
| `pnpm --filter @motoboycity/admin-web lint`                                                                            | aprovado (P1-02)                                    |
| Prettier nos arquivos alterados e `git diff --check`                                                                   | aprovados (P1-02)                                   |
| `pnpm --filter @motoboycity/driver-app lint`                                                                           | aprovado com 74 warnings preexistentes              |
| `git diff --check`                                                                                                     | aprovado                                            |
| `prisma migrate deploy` em PostgreSQL temporario vazio                                                                 | 7 migrations aplicadas com sucesso                  |
| `prisma migrate status` no banco temporario                                                                            | schema atualizado                                   |
| rollback manual da migration no banco temporario                                                                       | indice e coluna removidos com sucesso               |
| `prisma migrate deploy` em PostgreSQL temporario vazio (P1-01)                                                         | 8 migrations aplicadas com sucesso                  |
| duas insercoes `PENDING` concorrentes para a mesma entrega (P1-01)                                                     | uma confirmada, outra rejeitada; total 1            |
| rollback manual da migration P1-01 no banco temporario                                                                 | indice parcial removido com sucesso                 |
| `prisma migrate status` no Neon Postgres (staging, 2026-08-16)                                                         | banco vazio, 0/8 migrations aplicadas               |
| `prisma migrate deploy` no Neon Postgres (staging, 2026-08-16)                                                         | 8/8 migrations aplicadas com sucesso                |
| `prisma migrate status` no Neon apos o deploy (2026-08-16)                                                             | "Database schema is up to date!"                    |
| `prisma migrate deploy` no Postgres local `docker-compose` (2026-08-16)                                                | 2 migrations pendentes aplicadas                    |
| `pnpm --filter @motoboycity/api exec jest --config test/jest-e2e.json --runInBand` (2026-08-16)                        | 16 suites, 110 testes aprovados                     |
| mesmo comando sem `--runInBand` (2026-08-16)                                                                           | 3 falhas intermitentes por corrida entre arquivos   |
| `pnpm --filter @motoboycity/api exec eslint test/delivery-batch-dispatch.e2e-spec.ts test/delivery-offers.e2e-spec.ts` | aprovado                                            |
| `pnpm --filter @motoboycity/api exec tsc --noEmit` (2026-08-16)                                                        | aprovado                                            |
| `prisma migrate dev` (ciclo de entrega, 2026-08-16)                                                                    | migration aditiva aplicada no Postgres local        |
| `pnpm --filter @motoboycity/api exec jest --runInBand` (ciclo de entrega, 2026-08-16)                                  | 18 suites, 210 testes aprovados                     |
| `pnpm --filter @motoboycity/api exec jest --config test/jest-e2e.json --runInBand` (ciclo de entrega, 2026-08-16)      | 17 suites, 126 testes aprovados                     |
| `pnpm typecheck` (raiz, 8 workspaces, ciclo de entrega, 2026-08-16)                                                    | aprovado                                            |
| `pnpm lint` (raiz, 8 workspaces, ciclo de entrega, 2026-08-16)                                                         | aprovado (driver-app com 74 warnings preexistentes) |

Nao foram executados:

- backup/restore/anonimizacao antes do deploy no Neon — dispensado porque o
  banco estava genuinamente vazio (0/8 migrations, confirmado por
  `migrate status` antes de aplicar), nao uma copia com dado real a proteger;
- consulta de preflight de ofertas `PENDING` duplicadas no Neon — dispensada
  pelo mesmo motivo (banco vazio, sem oferta nenhuma pra colidir);
- E2E da API contra o Neon;
- build de producao ou build Android.

A migration foi exercitada primeiro em um PostgreSQL 17 temporario (vazio e
descartado, sem tocar no banco de desenvolvimento) e depois aplicada de fato
no Neon Postgres reservado para staging/producao (`NEON_DATABASE_URL_FUTURE`
em `apps/api/.env`, ainda comentado por padrao — usar via override de
`DATABASE_URL` na hora do comando, nao editar `.env` para nao repontar o dev
local). O Neon agora tem o schema completo aplicado e pode servir como
staging real daqui pra frente. `DATABASE_URL` do dev local nao foi alterado.

## Limitacoes e proximos passos priorizados

1. ~~Validar as migrations em copia de staging~~ — feito em 2026-08-16: Neon
   estava vazio, migrations aplicadas direto (ver Validacoes). Meta original
   (backup/restore/anonimizacao) nao se aplicava por nao haver dado real
   ainda. Se o Neon acumular dado real no futuro, qualquer proxima migration
   volta a exigir esse processo completo.
2. ~~Cobertura E2E/realtime do lote e do dispatch.~~ — feito em 2026-08-16:
   novo `apps/api/test/delivery-batch-dispatch.e2e-spec.ts` cobre criacao por
   endpoint, duas chamadas simultaneas a `dispatchDelivery`, aceite vs.
   cancelamento simultaneos, aceite vs. expiracao simultaneos, recusa em lote
   com redespacho, e aceite de lote via HTTP. Realtime e verificado via
   `RealtimeGateway` mockado (spies em `emitToDriver`/`emitAdminActivity`),
   nao um cliente Socket.IO real — decisao deliberada para evitar depender de
   `socket.io-client` (ausente do projeto) e de timing de rede; ver Historico
   de mudancas para o motivo completo.
3. **Operar o backfill controlado de modalidades.** Antes de esperar ofertas
   para entregadores existentes, o admin deve atribuir pelo menos uma
   modalidade ativa a cada perfil apto. A mudanca nao requer migration nem
   habilita capacidades automaticamente. O vinculo ainda nao registra quem o
   alterou nem quando; se auditoria administrativa for requisito, adicionar
   esses campos por migration aditiva antes de depender deles em suporte.
4. ~~Bloqueio/suspensao (P1-03).~~ — feito em 2026-08-19: retira
   disponibilidade e fecha a presenca, devolve as ofertas pendentes para a fila,
   impede aceite/recusa e emite `driver:account-status-changed`. Ver Historico
   de mudancas. **Falta** cobertura e2e ponta a ponta desse fluxo.
5. **Presenca multi-sessao (P1-04)** e **timeout configuravel no contrato
   admin (P1-05)** continuam pendentes de confirmacao/validacao ponta a ponta.
6. ~~Preco regional (P1-06).~~ — feito em 2026-08-19: `PricingService.quote()`
   passou a exigir `regionId` (parametro obrigatorio, sem fallback) e os tres
   pontos de cotacao informam a praca da empresa dona do pedido. Ver Historico
   de mudancas.
7. ~~Ciclo de entrega (Fase 2) — backend.~~ — feito em 2026-08-16: maquina de
   estados `ACCEPTED → COLLECTED → DELIVERED → COMPLETED` implementada, com
   destino capturado por GPS na entrega como modo opcional por pedido/lote.
   Ver "Contrato do ciclo de entrega" e Historico de mudancas. **Ainda
   pendente**: telas do driver-app (nenhuma existe hoje — nem biblioteca de
   GPS, nem tela pos-aceite) e o seletor "com/sem destino" no formulario de
   criacao do company-web (que hoje so cria pedido com endereco). Financeiro/
   credito em carteira tambem nao foi tocado — COMPLETED e so um status
   terminal por enquanto, sem nenhum movimento de dinheiro associado.
8. **Clientes.** Falta a tela de lote no company-web e a tela de ciclo de
   entrega no driver-app (coletar / marcar entregue com GPS / fechar retorno).
   ~~Seletor de destino conhecido/desconhecido~~ — feito em 2026-08-19 no
   formulario de pedido individual. Trocar mocks apenas quando as respectivas
   APIs existirem e forem testadas.
9. **Release.** Criar CI, corrigir README/arquitetura operacional, configurar
   staging, backup/restore, logs e rollback.

## Estado do worktree

As mudancas de lote, a nova cobertura E2E, as correcoes de teste, o ciclo de
entrega/GPS descritos acima e este handoff ainda estao sem commit. Ha tambem
arquivos locais nao rastreados (`.agents/`, `.codex/` e `AGENTS.md`) que nao
devem ser removidos ou incluidos em commit sem decisao explicita do
responsavel.

O Postgres local do `docker-compose` agora tem as 8 migrations aplicadas
(igual ao Neon); nao esta mais atrasado em relacao ao `schema.prisma`.

## Ambiente de staging (Neon)

Desde 2026-08-16 o Neon Postgres reservado (`NEON_DATABASE_URL_FUTURE` em
`apps/api/.env`) tem o schema completo aplicado (8/8 migrations) e pode ser
usado como staging real. Continua comentado no `.env` de proposito — o dev
local segue no Postgres do `docker-compose.yml`. Para rodar qualquer comando
Prisma contra o Neon, use override de `DATABASE_URL` na propria chamada em
vez de editar o `.env` compartilhado.

## Atualização — 2026-08-20: ciclo semanal de repasse e saques auditáveis

Decisão de produto confirmada: o crédito do entregador nasce `PENDING` ao
concluir a entrega e recebe a data da **próxima segunda-feira**. A fila BullMQ
`finance` agenda a liberação semanal às 00:00 de `America/Sao_Paulo`; na
inicialização, créditos cuja data já venceu também são liberados de forma
idempotente. Créditos antigos sem `releaseAt` são incluídos somente no job
semanal de transição. A entrega concluída numa segunda entra no ciclo seguinte.

O saque é permitido ao motoboy somente na segunda-feira, sem taxa nem valor
mínimo. A solicitação reserva saldo disponível por meio de um lançamento
`DEBIT_WITHDRAWAL` pendente. O administrador pode aprovar, marcar como pago
com referência opcional de comprovante/protocolo, ou rejeitar com motivo
obrigatório; a rejeição cancela o débito e devolve o saldo. Cada transição
(`PENDING → APPROVED → PAID` ou `PENDING/APPROVED → REJECTED`) gera uma linha
append-only de auditoria, com responsável, data e nota. As mutações usam
transação serializável com retentativa de `P2034` e atualização condicional;
as corridas de solicitação, aprovação e pagamento não duplicam dinheiro.

Foi criada e aplicada **somente no PostgreSQL local** a migration aditiva
`20260820173418_withdrawal_request_audit`: adiciona `paymentReference` opcional
em `withdrawal_requests` e cria `withdrawal_request_status_history` com FKs e
índice. O SQL foi revisado: não remove nem altera colunas existentes. Não foi
executada contra staging/Neon.

Principais arquivos:

- `apps/api/src/finance/financial-payout.service.ts`,
  `financial-payout.processor.ts`, `financial-release.scheduler.ts`,
  `financial-clock.service.ts` e `finance-release.utils.ts`;
- `apps/api/src/finance/withdrawal.controller.ts`, `finance.module.ts`,
  `finance-ledger.service.ts` e `apps/api/src/app.module.ts` (o
  `FinanceModule` passou a ser registrado no módulo principal; antes disso as
  rotas financeiras não eram carregadas em execução);
- contratos em `packages/validation/src/finance/withdrawal.schema.ts`,
  `packages/types/src/finance.ts` e os clientes financeiros tipados;
- `apps/driver-app/src/screens/DriverWalletScreen.tsx`: pedido, saldo
  reservado e linha do tempo de cada saque;
- `apps/admin-web/src/app/(app)/financeiro/saques/`: fila filtrável e detalhe
  de pagamento com PIX, referência e auditoria.

Validações desta fase:

| Comando                                                                                    | Resultado                                                                                       |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `pnpm --filter @motoboycity/api exec prisma validate --schema prisma/schema.prisma`        | aprovado antes da migration                                                                     |
| `pnpm --filter @motoboycity/api exec prisma migrate dev --name withdrawal_request_audit`   | migration aditiva aplicada no Postgres local                                                    |
| `pnpm --filter @motoboycity/validation build`                                              | aprovado                                                                                        |
| `pnpm typecheck`                                                                           | aprovado nos 8 workspaces                                                                       |
| testes unitários focados de `finance-release`, `financial-payout` e `finance-ledger`       | 3 suítes / 7 testes aprovados                                                                   |
| `apps/api/test/withdrawal-payout.e2e-spec.ts`                                              | 2 testes E2E aprovados: concorrência, aprovação, pagamento, rejeição e saldo derivado conferido |
| `pnpm --filter @motoboycity/driver-app lint` e `pnpm --filter @motoboycity/admin-web lint` | aprovados                                                                                       |
| `pnpm --filter @motoboycity/api test:e2e`                                                  | 18 suítes / 132 testes aprovados                                                                |
| `pnpm lint`                                                                                | aprovado nos 8 workspaces                                                                       |
| builds de `@motoboycity/admin-web` e `@motoboycity/company-web`                            | aprovados; rotas de saque incluídas no admin                                                    |
| `git diff --check`                                                                         | aprovado (avisos de CRLF preexistentes no worktree)                                             |

Próximo passo concreto: executar a suíte E2E e os lints completos após esta
fase; a próxima decisão de produto ainda em aberto é rastreamento GPS contínuo
durante entrega ativa (permissão, retenção e visibilidade), que não deve ser
implementado sem essa política explícita.

## Atualização — 2026-08-20: rastreamento GPS contínuo durante entrega ativa

Política de produto confirmada pelo responsável: o rastreamento começa no
aceite e termina em `COMPLETED`/`CANCELLED`; deve continuar com a tela bloqueada
ou o aplicativo em segundo plano; admin acompanha todas as entregas ativas e a
empresa somente as suas; a trajetória bruta é removida após 30 dias; GPS serve
para acompanhamento, sem alterar status nem aplicar punições automaticamente.

Persistência e contrato:

- Migration aditiva local `20260820175719_delivery_location_tracking` cria
  `delivery_location_points`, com FKs de pedido/motoboy e índices por
  entrega/data e data. Foi aplicada **somente no PostgreSQL local** após
  revisão do SQL; não altera dados nem migrations anteriores.
- `POST /tracking/driver/deliveries/:deliveryId/points` aceita ponto somente
  do motoboy atribuído a uma entrega em `ACCEPTED`, `COLLECTED` ou `DELIVERED`.
  Além do ponto, atualiza a última posição do perfil e emite
  `delivery:location` para o admin e a empresa dona do pedido.
- `GET /tracking/active` aplica o escopo no servidor (todas as entregas para
  admin; empresas ativas do membro para empresa; próprias para motoboy).
  `GET /tracking/deliveries/:deliveryId` entrega a trajetória por pedido para
  quem tem acesso. A fila BullMQ `tracking` remove pontos mais antigos que 30
  dias diariamente às 03:00 de `America/Sao_Paulo` e também na inicialização.

Aplicativo do motoboy:

- Android: `DeliveryLocationTrackingService` é um foreground service visível
  com atualização GPS por intervalo/distância (20 s / 50 m), enviando os
  pontos diretamente à API para cada entrega ativa. Inclui permissões precisa,
  background, foreground-location e notificação.
- iOS: `LocationTrackingModule` usa Core Location com autorização “Sempre”,
  `UIBackgroundModes=location`, distância de 50 m e envio direto à API.
- O app sincroniza o serviço no aceite, na reabertura, após cada transição de
  status e no cancelamento; para no logout e sem nenhuma entrega ativa. A tela
  operacional explica o uso e a interrupção automática ao motoboy.

Painéis:

- As listas de pedidos administrativa e da empresa exibem rastreamento ao
  vivo, com atualização Socket.IO e link da última posição para o mapa. Os
  detalhes do pedido exibem a última posição e a sequência de pontos
  disponíveis, deixando explícita a retenção máxima de 30 dias.

Arquivos principais: `apps/api/src/tracking/`,
`apps/api/src/realtime/realtime.gateway.ts`,
`apps/driver-app/{android,ios,src/lib/deliveryTracking.ts}`, detalhes/listas de
`pedidos` dos dois painéis e contratos em `packages/{validation,types,api-client}`.

Validações já executadas nesta fase:

| Comando                                                                       | Resultado                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `prisma validate` antes da migration                                          | aprovado                                                           |
| `prisma migrate dev --name delivery_location_tracking`                        | migration aplicada no PostgreSQL local; SQL aditivo revisado       |
| `pnpm --filter @motoboycity/{validation,api,api-client} typecheck`            | aprovado                                                           |
| `pnpm --filter @motoboycity/{driver-app,admin-web,company-web,api} typecheck` | aprovado                                                           |
| `apps/api/src/tracking/delivery-tracking.service.spec.ts`                     | 3 testes aprovados: registro/emissão, escopo de empresa e retenção |
| `pnpm --filter @motoboycity/driver-app test -- --runInBand`                   | 1 suíte / 1 teste aprovado                                         |
| lints específicos de driver, admin, empresa e API                             | aprovados                                                          |
| `pnpm typecheck`                                                              | aprovado nos 8 workspaces                                          |
| `pnpm lint`                                                                   | aprovado nos 8 workspaces                                          |
| `pnpm --filter @motoboycity/api test:e2e`                                     | 18 suítes / 132 testes aprovados                                   |
| `git diff --check`                                                            | aprovado (somente avisos CRLF já presentes no worktree)            |

Não foi executado build nativo Android/iOS nesta sessão. Antes de publicar,
validar em dispositivo físico as permissões, a notificação Android e o fluxo
Core Location em segundo plano; em iOS, encerramento forçado pelo usuário é
uma limitação do sistema operacional e não pode ser contornado pelo app.

## Atualização — 2026-08-20: centrais operacionais, presença e GPS online

Foram implementadas as centrais operacionais da empresa e do administrador,
junto com o contrato de presença necessário para que o mapa administrativo
mostre somente motoboys realmente online. A Home da empresa agora combina
criação individual ou em lote (2–50 itens), destino conhecido ou capturado na
entrega, busca, operação ativa/recente e mapa. A Home administrativa passou a
ser um mapa global filtrável de pedidos e motoboys, com filas operacionais,
atividade auditável, resumo do item selecionado e cancelamento dentro das
regras existentes. As rotas reais de clientes, entregadores, financeiro,
faturas, saques, relatórios e configurações foram preservadas.

### Dados, contratos e segurança operacional

- A migration aditiva `20260820211800_delivery_operational_metadata` cria o
  enum `CustomerPaymentMethod`, adiciona a `Delivery` os campos opcionais
  `recipientName`, `recipientPhone`, `externalOrderNumber`, `driverNote` e
  `customerPaymentMethod`, e cria índice não único por empresa/número externo.
  Não existe backfill, remoção de coluna ou alteração de migrations antigas.
- Endereços de criação aceitam `lat/lng` somente em par e com limites
  geográficos válidos. Dados antigos sem coordenadas continuam aceitos; o
  formulário novo exige seleção válida do Google em destinos conhecidos.
- Foram adicionados os contratos tipados `GET /deliveries/operations`,
  `GET /deliveries/search`, `GET /deliveries/:id/group`,
  `GET /admin/operations`, `GET /admin/operations/activity` e
  `GET /admin/operations/deliveries/:id/dispatch-audit`, com escopo de empresa
  aplicado no servidor. A busca administrativa aceita os filtros globais.
- Os eventos `delivery:updated` e `admin:activity` agora são estruturados;
  `driver:location` e `driver:presence` são emitidos somente para a sala de
  administradores. As ofertas de dispatch permanecem sem os novos dados
  pessoais do destinatário; esses metadados só aparecem ao motoboy após o
  aceite.
- A presença online vive no Redis com TTL de 150 segundos. Ativar
  `AVAILABLE` exige posição inicial, versão do aplicativo e capacidade
  `BACKGROUND_V1`; `POST /driver/presence/heartbeat` renova o estado. O
  reconciliador por minuto fecha o `DriverPresenceLog` expirado e marca o
  perfil offline. Dispatch e mapa administrativo exigem presença Redis
  válida. Uma desconexão Socket.IO isolada não encerra outras sessões.

### Aplicativo e interfaces

- O driver-app solicita permissão e posição antes de ficar disponível, faz
  rollback para offline se o serviço nativo não iniciar e encerra presença e
  rastreamento em offline, logout ou bloqueio. Sem entrega ativa usa cerca de
  60 s/100 m; com entrega ativa usa 20 s/50 m e reaproveita o mesmo fix no
  heartbeat e nos pedidos ativos. Android mantém foreground service e iOS usa
  Core Location em segundo plano. Os dados do destinatário aparecem na tela
  operacional somente após o aceite.
- Os dois painéis usam `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, que deve receber
  uma chave web separada e restrita aos domínios publicados. A central da
  empresa usa Places Autocomplete e invalida texto digitado que não tenha uma
  sugestão válida. Detalhes de empresa e admin exibem mapa, lote, tempos por
  etapa e linha do tempo; o detalhe admin também exibe a auditoria das ofertas.

Principais arquivos afetados: migration e `apps/api/prisma/schema.prisma`;
`apps/api/src/{deliveries,driver-presence,live-presence,dispatch,realtime}`;
`apps/api/src/admin/operations`; contratos em
`packages/{validation,types,api-client}`; componentes em
`apps/{company-web,admin-web}/src/components/operations`; Homes e detalhes dos
dois painéis; e rastreamento/presença em `apps/driver-app/{src,android,ios}`.

Validações desta entrega:

| Comando                                                                               | Resultado                                                       |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm typecheck`                                                                      | aprovado nos 8 workspaces                                       |
| `pnpm lint` e lints específicos de API, painéis e driver-app                          | aprovados                                                       |
| `pnpm --filter @motoboycity/api test -- --runInBand`                                  | 24 suítes / 235 testes aprovados                                |
| `pnpm --filter @motoboycity/api test:e2e` com PostgreSQL/Redis temporários e isolados | 18 suítes / 133 testes aprovados; containers removidos ao final |
| `pnpm --filter @motoboycity/driver-app test -- --runInBand`                           | 1 suíte / 1 teste aprovado                                      |
| builds de API, company-web e admin-web                                                | aprovados                                                       |
| `gradlew.bat :app:compileDebugKotlin`                                                 | aprovado no Android, somente avisos de dependências/depreciação |
| `prisma validate` e aplicação das 14 migrations em banco vazio isolado                | aprovados                                                       |
| `git diff --check`                                                                    | aprovado; somente avisos de normalização CRLF do worktree       |

A nova migration foi aplicada no PostgreSQL local e validada também em banco
vazio isolado. Ela **não foi aplicada nem validada em cópia atual de
staging/Neon**, e não houve backup/restore de dados reais nesta entrega. Antes
de qualquer ambiente compartilhado, executar backup, restaurar uma cópia de
staging, aplicar a migration nessa cópia e validar consultas/rollback.

Também permanecem obrigatórios antes da publicação: teste Android e iOS em
aparelhos reais (permissão negada, segundo plano, reinício, logout e bloqueio),
smoke visual dos mapas com chave Google web restrita e sessão com dados reais,
e coordenação do rollout API/contratos → driver-app → central da empresa →
exigência de heartbeat/central administrativa. O código já exige GPS para
`AVAILABLE`; portanto API e app incompatíveis não devem ser publicados em
ordem invertida. `apps/driver-app/src/lib/appVersion.ts` acompanha por enquanto
a versão `0.0.1` do pacote e precisa ser atualizado junto com cada release.

## Atualização — 2026-08-20: corte financeiro automático e CI do caminho dourado

Horário confirmado pelo responsável: o fechamento semanal das faturas ocorre
na segunda-feira às **00:05 de `America/Sao_Paulo`**, cinco minutos após a
liberação dos repasses. O pagamento da fatura e do saque continua manual e
auditável, sem gateway.

O scheduler da fila `finance` agora mantém dois jobs idempotentes: repasses às
00:00 e faturas às 00:05. No boot, além de liberar créditos vencidos, a API
recupera o último corte de faturas que já deveria ter ocorrido. Se iniciar na
segunda antes de 00:05, usa o corte da semana anterior; se iniciar depois do
horário ou em outro dia, recupera a segunda mais recente. O corte usa o
instante exato de 00:05 no fuso operacional, portanto entregas concluídas
depois dele ficam para a semana seguinte mesmo em uma recuperação tardia.

`InvoiceService.closeScheduledInvoices()` registra `changedByUserId=null` e
nota explícita de fechamento automático. O fechamento manual foi preservado,
mas não aceita antecipação antes do corte. A atualização de `PENDING` para
`OVERDUE` passou a usar a data civil de São Paulo, evitando vencimento
antecipado por diferença entre UTC e o fuso operacional. Não houve alteração
de schema Prisma nem migration nesta fase.

O contrato Zod de faturas agora rejeita datas civis inexistentes, como
`2026-02-30`, no fechamento, confirmação de pagamento e filtros. Isso impede
que a normalização automática de `Date` gere número de fatura e auditoria com
datas divergentes. Payloads e respostas não mudaram; somente entradas antes
aceitas incorretamente passam a retornar 400.

O E2E de ciclo de entrega foi estendido para provar o caminho dourado sem saldo
artificial: empresa cria, motoboy aceita/coleta/conclui, o crédito nasce
`PENDING`, o job o libera, o motoboy solicita o saque, o admin aprova e marca o
PIX pago, o scheduler fecha a fatura da empresa e o admin confirma o pagamento
de forma concorrente/idempotente. Ao final, saldos derivados conferem com o
ledger e as trilhas de saque e fatura permanecem completas.

Foi criado `.github/workflows/ci.yml` com permissão somente de leitura,
cancelamento de execução obsoleta, PostgreSQL 17 e Redis 7 isolados. O workflow
aplica as 14 migrations, executa seed de teste, typecheck, lint, testes da API
e driver-app, E2E e builds da API/company-web/admin-web. Usa Node 22.18 e pnpm
11.20. O README raiz foi atualizado do texto obsoleto de “Fase 0” para o estado
real do MVP e seus portões de verificação.

Arquivos principais: `apps/api/src/finance/{finance-release.utils,
financial-release.scheduler,financial-payout.processor,invoice.service}.ts` e
seus specs; `apps/api/test/delivery-lifecycle.e2e-spec.ts`;
`packages/validation/src/finance/invoice.schema.ts`; `.github/workflows/ci.yml`;
e `README.md`.

Validações executadas:

| Comando                                                           | Resultado                                                                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| testes unitários focados do scheduler, processor, datas e faturas | 5 suítes / 12 testes aprovados                                                                                                  |
| `pnpm --filter @motoboycity/validation build`                     | aprovado                                                                                                                        |
| `pnpm typecheck`                                                  | aprovado nos 8 workspaces                                                                                                       |
| `pnpm lint`                                                       | aprovado nos 8 workspaces                                                                                                       |
| `pnpm --filter @motoboycity/api test -- --runInBand`              | 28 suítes / 244 testes aprovados                                                                                                |
| `pnpm --filter @motoboycity/driver-app test -- --runInBand`       | 1 suíte / 1 teste aprovado                                                                                                      |
| E2E focado `delivery-lifecycle.e2e-spec.ts`                       | 1 suíte / 17 testes aprovados em PostgreSQL/Redis isolados                                                                      |
| `pnpm --filter @motoboycity/api test:e2e`                         | 18 suítes / 133 testes aprovados no mesmo ambiente isolado                                                                      |
| builds de API, company-web e admin-web                            | aprovados                                                                                                                       |
| `prettier --check .github/workflows/ci.yml`                       | aprovado                                                                                                                        |
| `pnpm audit --audit-level high`                                   | falhou por 3 alertas altos transitivos conhecidos: dois em `image-size@1.2.1` (Metro) e um em `deepmerge-ts@7.1.5` (Prisma CLI) |

Limitações: o workflow foi validado localmente quanto a formato e todos os
comandos que ele executa passaram, mas a execução dentro do GitHub Actions só
ocorrerá depois de commit/push. Build nativo Android/iOS continua fora deste
workflow e deve ganhar jobs próprios em fase posterior. Nenhum ambiente de
staging/Neon foi alterado. Próximo passo concreto: publicar esta branch para
exercitar o CI e, depois, homologar o caminho dourado em staging com aparelho
real e conferência manual dos valores financeiros.

Risco de dependências: os dois advisories de `image-size` indicam correção em
`2.0.3`, mas essa versão ainda não está publicada; além disso, a linha 2.x
removeu a API síncrona atualmente usada pelo Metro 0.84/React Native 0.86. O
alerta de `deepmerge-ts` chega por `@prisma/config` 6.19.3 e a correção exige
8.x; override de major não foi aplicado sem validação do Prisma. Os caminhos
afetados são ferramentas de bundling/configuração, não entrada HTTP da API,
mas o audit continua vermelho e deve ser acompanhado até existir atualização
upstream compatível. Não adicionar `pnpm audit` como portão bloqueante do CI
enquanto não houver versão corrigida instalável; registrar e revisar o risco a
cada atualização de React Native/Metro e Prisma.

## Atualização — 2026-08-20: auditoria do app de referência e roadmap mobile

O aplicativo de referência instalado em aparelho Android foi navegado em modo
somente leitura. Foram observados: mapa e lista na Home, disponibilidade
destacada, modal de oferta, execução da entrega, carteira/extrato, histórico,
agendamentos, escalas, desafios, suporte e perfil. Nenhum pedido, presença,
saldo ou perfil da conta de referência foi alterado. Dados pessoais e valores
vistos durante a análise não foram copiados para o repositório.

A comparação confirmou que o núcleo do MOTOboyCity já está implementado, mas o
driver-app ainda não é distribuível: `src/lib/config.ts` aponta para
`http://localhost:3333`, a versão JavaScript `0.0.1` diverge do Android `1.0`,
o release Android ainda usa assinatura debug, não há mapa móvel nem push nativo
para ofertas em segundo plano, e a cobertura automatizada do app continua em
um único smoke test. O build debug atual foi instalado e abriu com Metro em um
aparelho Android; typecheck, lint e o smoke Jest do driver-app passaram nessa
verificação. O fluxo autenticado do nosso app não foi executado porque a API
local não estava ativa, e iOS não foi testado.

Foi criado `docs/driver-app-roadmap.md` com a definição do caminho dourado,
estado de partida, decisões extraídas da referência, fases, critérios de
aceite, matriz de testes, rollout, rollback e instruções para retomada. O
escopo prioritário é: preservar/publicar o checkpoint financeiro/CI atual;
configurar ambiente, versão e assinatura; evoluir Home/oferta/operação; criar
push seguro; polir carteira/histórico; homologar o ciclo completo; e publicar
de forma controlada. Agendamentos, escalas, desafios, chat e antecipação sem
regra permanecem fora desta versão.

Validação final antes do checkpoint: build de `@motoboycity/validation`,
`pnpm typecheck` e `pnpm lint` aprovados nos oito workspaces; cinco suítes
financeiras focadas, com 12 testes, aprovadas; Prettier aprovado no novo roadmap
e nos demais arquivos do recorte; `git diff --check` aprovado. O arquivo
histórico `docs/agent-handoff.md` ainda não passa no Prettier quando verificado
por inteiro por formatação antiga fora deste recorte; ele não foi reformatado
em massa para evitar um diff não relacionado.

Esta atualização é somente documentação; nenhum código, banco, ambiente ou
conta foi modificado. Próximo passo concreto: revisar e, mediante pedido
expresso, commitar/pushar separadamente o recorte financeiro/CI que já está no
worktree; em seguida iniciar a Fase 1 do roadmap pela configuração de ambiente
e versionamento do driver-app.

## Atualização — 2026-08-20: pesquisa oficial e plano de integração aiqfome

Foi pesquisada a documentação oficial atual do aiqfome para receber pedidos de
lojas parceiras e despachá-los aos motoboys do MOTOboyCity. A API V2 é o caminho
principal recomendado: OAuth 2.0/ID Magalu e tokens são individuais por loja;
os webhooks V2 são cadastrados por estabelecimento com segredo enviado no
header `Authorization`; e existem eventos de pedido e endpoints próprios para
informar os marcos da logística de terceiros. A camada Open Delivery permanece
como alternativa de compatibilidade/contingência sujeita à homologação. O módulo
AiqEntrega foi explicitamente excluído, pois ele chama entregadores do próprio
aiqfome, não a frota do MOTOboyCity.

O plano completo está em `docs/aiqfome-integration-plan.md`, com fontes
oficiais, escopo, elegibilidade, mapeamento de dados e pagamentos, persistência
aditiva, OAuth, webhook, filas inbound/outbound, outbox, idempotência,
observabilidade, interfaces, segurança, fases, testes, homologação, rollout e
rollback. A integração deve convergir no `DeliveriesService`,
`PricingService` e `DispatchService` existentes; não haverá segundo fluxo de
preço, oferta ou financeiro. Pedidos manuais continuam em paralelo.

Decisões ainda obrigatórias antes do schema/código: confirmar com o aiqfome que
a aplicação pode atuar somente na logística sem assumir o PDV/aceite da loja;
escolher `ready-order` (recomendado) ou `read-order` como gatilho; definir
cancelamento externo após aceite/coleta; decidir o piloto somente PREPAID ou
modelar custódia/conciliação de pagamento offline; definir permissão de conexão
e retenção dos dados. Essas decisões não foram adicionadas a
`docs/business-rules.md` porque ainda não foram confirmadas pelo responsável.

Nenhum código, migration, credencial, ambiente ou loja foi alterado. Próximo
passo concreto: cadastrar Aplicativo de Integração e loja de teste no Portal do
Desenvolvedor, obter as respostas de homologação acima e registrar as decisões
antes de implementar a Fase 1.

Validação documental: `pnpm exec prettier --check
docs/aiqfome-integration-plan.md` e `git diff --check` aprovados. Não foram
executados typecheck, testes ou builds porque o recorte contém somente
documentação.

## Atualização — 2026-08-20: runbook de publicação e piloto de rua

Foi criado `docs/go-live-pilot-runbook.md` com o procedimento detalhado para
publicar um ambiente de piloto, cadastrar e aprovar empresa/motoboy, configurar
operação e preço, gerar um APK Android assinado, executar o caminho dourado na
rua, conferir o financeiro, monitorar, interromper e fazer rollback. O runbook
separa explicitamente um piloto Android privado — possível após fechar os
portões P0 — de um lançamento público, que ainda não deve ser prometido no
estado atual.

A inspeção do primeiro GitHub Actions publicado confirmou a causa exata da
falha: o run `32426789496`, no commit `34d2c5e`, executou
`jest -- --runInBand`; o Jest interpretou `--runInBand` como padrão e encerrou
com “No tests found”. Typecheck, lint, migrations e seed haviam passado antes
disso. Enquanto o workflow não for corrigido e reexecutado, o CI permanece um
portão vermelho, mesmo não sendo uma falha de regra de negócio. O runbook
recomenda chamadas inequívocas via `pnpm --filter <pacote> exec jest
--runInBand` para API e driver-app.

Outros bloqueios objetivos documentados: URL mobile fixa em localhost; versão
inconsistente e release Android assinado com debug; ausência de push para
ofertas com app suspenso; falta de homologação física Android/iOS; Redis de
produção sem suporte atual a URL/usuário/senha/TLS; healthcheck apenas de
liveness; Socket.IO sem adapter distribuído, exigindo uma réplica no piloto;
migration mais recente ainda não validada em cópia restaurada de staging; e
necessidade de completar configuração operacional antes de criar pedidos.

Foram identificadas duas lacunas de interface relevantes para o ensaio. A tela
`AddressSetupForm` não envia `lat/lng`, embora `complete-return` exija
coordenadas da coleta; o runbook prioriza corrigir a tela com Places e fornece
um PUT autenticado provisório somente para piloto. O percentual do motoboy tem
UI, mas `dispatchOfferTimeoutSeconds` e `returnProximityRadiusMeters` não têm;
o runbook fornece PATCH autenticado provisório e registra que os dois campos
precisam entrar no admin antes da abertura pública. Nenhum valor de comissão,
timeout, raio ou preço foi decidido — os números mostrados são exemplos
técnicos e continuam dependentes da decisão do responsável.

O caminho de rua começa com dados sintéticos, pagamento PREPAID, destino
conhecido e sem retorno. Depois de três execuções bem-sucedidas, o runbook
orienta testar retorno, lote de dois itens, cancelamentos, perda de rede/GPS e
expiração/recusa com dois motoboys. O ciclo financeiro não deve ser acelerado
alterando relógio ou banco: no dia do piloto valida-se o crédito pendente; a
liberação, saque e fatura são conferidos na segunda-feira às 00:00/00:05 de
`America/Sao_Paulo`, mantendo o E2E isolado como prova com relógio controlado.

Fontes oficiais atuais foram incorporadas para segurança das chaves Google,
monorepos/variáveis Vercel, deploy/pre-deploy/health/Redis/rede privada
Railway, assinatura e localização Android, política Google Play, distribuição
Apple/TestFlight, migrations Neon e orientação de segurança da ANPD.

Esta atualização é somente documentação. Nenhum código, migration, banco,
segredo, conta, deploy ou dado externo foi alterado. Próximo passo concreto:
corrigir as duas chamadas Jest em `.github/workflows/ci.yml`, repetir as
validações e obter CI verde; em seguida executar os portões P0 mobile, Redis,
pickup/configurações e migration antes de provisionar o piloto.

## Atualização — 2026-08-21: portão P0.1 (CI) corrigido e todos os gates validados

O bug do CI foi reproduzido localmente antes da correção, não apenas assumido a
partir do log do GitHub. Rodar `pnpm --filter @motoboycity/driver-app test --
--runInBand` faz o pnpm repassar `jest "--" "--runInBand"`; o Jest trata o que
vem depois de `--` como posicional, ou seja `testPathPattern`. A saída mostra
`Pattern: --runInBand - 0 matches` e encerra com "No tests found, exiting with
code 1". A causa é o `--` extra, não o `--runInBand` em si, e vale para
qualquer script cujo comando seja apenas `jest` (é o caso de `test` na API e no
driver-app). `test:e2e` nunca foi afetado porque já embute as flags no próprio
script e é chamado sem argumentos extras.

Correção aplicada nas três ocorrências do padrão quebrado, não só na do CI:

- `.github/workflows/ci.yml` — passos "API unit tests" e "Driver app tests"
  agora usam `pnpm --filter <pacote> exec jest --runInBand`;
- `AGENTS.md` — bloco de comandos (a linha do driver-app também passou a fixar
  `--runInBand`, antes rodava sem);
- `README.md` — bloco "Verificação contínua".

### Banco isolado para E2E

Os E2E não tinham ambiente isolado local e o `test/jest-e2e.json` não
sobrescreve `DATABASE_URL`, então herdariam o banco de desenvolvimento. A
limpeza dos specs é escopada (`deleteMany` por e-mail/documento/código), mas
`test/admin-platform-settings.e2e-spec.ts` apaga a linha `platformSettings` de
id `global` — ou seja, comissão, timeout de oferta e raio de retorno do
ambiente. Rodar E2E contra o dev destruiria essa configuração.

Foi criado o banco `motoboycity_e2e_local` no mesmo container PostgreSQL do
`docker-compose`, espelhando o `motoboycity_ci` do workflow. `motoboycity_dev`
não foi tocado em nenhum momento; a URL de destino é derivada da de dev por
substituição do nome do banco e o comando aborta se o resultado não contiver
`motoboycity_e2e_local`. Use override de `DATABASE_URL` na própria chamada, não
edite `apps/api/.env`. O banco foi mantido para reuso; se for descartado, basta
recriar com `CREATE DATABASE`, `prisma migrate deploy` e o seed.

### Validações executadas (2026-08-21)

| Comando                                                                    | Resultado                                  |
| -------------------------------------------------------------------------- | ------------------------------------------ |
| `pnpm --filter @motoboycity/driver-app test -- --runInBand` (forma antiga) | falhou: "No tests found" — bug reproduzido |
| `pnpm --filter @motoboycity/driver-app exec jest --runInBand`              | 1 suíte, 1 teste aprovado                  |
| `pnpm --filter @motoboycity/api exec jest --runInBand`                     | 28 suítes, 244 testes aprovados            |
| `pnpm typecheck`                                                           | aprovado nos 8 workspaces                  |
| `pnpm lint`                                                                | aprovado nos 8 workspaces                  |
| `prisma migrate deploy` no `motoboycity_e2e_local` (banco vazio)           | 14 migrations aplicadas                    |
| `prisma:seed` no `motoboycity_e2e_local`                                   | aprovado                                   |
| `pnpm --filter @motoboycity/api run test:e2e` no banco isolado             | 18 suítes, 133 testes aprovados            |
| `pnpm --filter @motoboycity/api run build`                                 | aprovado                                   |
| `pnpm --filter @motoboycity/company-web run build`                         | aprovado (11 rotas)                        |
| `pnpm --filter @motoboycity/admin-web run build`                           | aprovado (17 rotas)                        |
| `pnpm exec prettier --check` nos arquivos do recorte                       | aprovado                                   |
| `git diff --check`                                                         | aprovado                                   |

Todos os passos do workflow foram exercitados localmente na mesma ordem do CI.
Os passos posteriores aos testes unitários (E2E e os três builds) nunca tinham
rodado no GitHub, porque o job morria antes; agora existe evidência local de que
passam. A contagem de E2E subiu de 126 (2026-08-16) para 133, e a de unitários
de 210 para 244, refletindo os recortes financeiro e operacional intermediários.

A aplicação das 14 migrations do zero num banco vazio ficou comprovada. Isso
**não** substitui o item P0.7 do runbook: continua faltando validar a migration
mais recente contra uma cópia restaurada com dado real, que é um cenário
diferente de banco vazio.

### Estado e próximo passo

Nenhum código de aplicação, contrato, schema Prisma ou migration foi alterado —
o recorte é workflow e documentação, mais a criação de um banco local isolado.
Nenhum secret foi lido, impresso ou versionado; `.env` não foi editado.

O CI só pode ser declarado verde depois de um run real no GitHub. Próximo passo
concreto: mediante pedido expresso, commitar e pushar este recorte para
disparar o workflow e confirmar o run verde de ponta a ponta; em seguida seguir
para o P0.2 (URL da API configurável no driver-app, hoje fixa em
`http://localhost:3333` em `apps/driver-app/src/lib/config.ts`).

## Atualização — 2026-08-21: portão P0.2 (URL da API configurável no app)

`API_BASE_URL` era a constante `http://localhost:3333` em
`apps/driver-app/src/lib/config.ts`, o que só funciona com `adb reverse` — na
rua o telefone tentaria acessar a si mesmo. Agora a URL é resolvida em tempo de
build por ambiente e congelada no artefato.

### Como funciona

`apps/driver-app/app.env.js` (CommonJS, carregado por `babel.config.js` e
`metro.config.js`) resolve e valida duas variáveis:

| Variável              | Valores                                       |
| --------------------- | --------------------------------------------- |
| `MOTOBOYCITY_APP_ENV` | `development` (padrão), `pilot`, `production` |
| `MOTOBOYCITY_API_URL` | obrigatória em `pilot`/`production`           |

Um plugin Babel local em `babel.config.js` substitui os identificadores
`__MOTOBOYCITY_APP_ENV__` e `__MOTOBOYCITY_API_URL__` por literais. Verificado
na saída compilada: `exports.API_BASE_URL="http://localhost:3333"` em
development e `"https://api-pilot.exemplo.com"` em pilot.

**Nenhuma dependência nova.** O comentário antigo do `config.ts` registrava a
decisão de não adotar `react-native-config` só por causa disso; essa decisão
foi preservada. Também não foi necessário
`babel-plugin-transform-inline-environment-variables`: o preset
`@react-native/babel-preset` 0.86.2 não inlina `process.env` (confirmado no
fonte instalado), mas `babel.config.js` aceita um plugin como função e
`@babel/core` já era devDependency.

`pilot` e `production` exigem HTTPS e recusam `localhost`, IPs privados
(10/8, 172.16–31, 192.168/16, 127/8, 169.254/16), `::1`, `0.x` e hosts
`.local`. A falha é de build, no escopo do módulo, antes de gerar bundle.
`development` mantém o padrão localhost e aceita override (ex.: `10.0.2.2` no
emulador). A URL é normalizada sem barra final, porque o `api-client`
concatena `${baseUrl}/rota`.

### Duas armadilhas encontradas na implementação

1. **Cache do Metro.** A chave de cache do Metro deriva do conteúdo dos
   arquivos de configuração, não das variáveis de ambiente que eles leem. Sem
   tratamento, trocar `MOTOBOYCITY_APP_ENV` reaproveitaria transformações em
   cache e o APK de piloto sairia apontando para localhost — exatamente a falha
   que este portão existe para impedir. `metro.config.js` agora define
   `cacheVersion` derivado do ambiente e da URL.
2. **Lookup por objeto literal no plugin Babel.** A primeira versão usava
   `constants[path.node.name]`, que para identificadores chamados `toString` ou
   `constructor` — ambos presentes no fonte do React — retornava o método
   herdado de `Object.prototype` e tentava inliná-lo como string. Isso quebrava
   o bundle inteiro, não só um teste. Corrigido com `Map`. O `App.test.tsx`
   pegou a regressão.

### Arquivos

- `apps/driver-app/app.env.js` (novo) — resolução e validação;
- `apps/driver-app/babel.config.js` — plugin local de inline;
- `apps/driver-app/metro.config.js` — `cacheVersion` por ambiente;
- `apps/driver-app/src/lib/config.ts` — exporta `API_BASE_URL` (nome
  preservado, os três consumidores não mudaram), `APP_ENV` e `APP_ENV_LABEL`;
- `apps/driver-app/src/screens/SettingsScreen.tsx` — bloco "Diagnóstico" com
  ambiente, servidor e versão;
- `apps/driver-app/__tests__/appEnv.test.js` (novo) — 21 testes.

### Validações executadas (2026-08-21)

| Comando                                                          | Resultado                               |
| ---------------------------------------------------------------- | --------------------------------------- |
| `pnpm --filter @motoboycity/driver-app exec jest --runInBand`    | 2 suítes, 22 testes aprovados           |
| inline verificado na saída do Babel (development e pilot)        | literal congelado nos dois casos        |
| build com production + URL vazia / HTTP / localhost / IP privado | falhou nos quatro, com mensagem legível |
| build com pilot + URL vazia                                      | falhou, como esperado                   |
| `pnpm typecheck`                                                 | aprovado nos 8 workspaces               |
| `pnpm lint`                                                      | aprovado nos 8 workspaces               |
| `pnpm exec prettier --check` nos 6 arquivos do recorte           | aprovado                                |

### Limitações

- O domínio real do piloto **não foi decidido**, então `pilot` não tem URL
  padrão de propósito: passar `MOTOBOYCITY_API_URL` é obrigatório e a ausência
  falha o build em vez de cair em localhost silenciosamente.
- Nenhum APK release foi gerado nem instalado nesta sessão; a verificação do
  inline foi feita pela saída do Babel, não por build Android. O portão P0.3
  (versão e assinatura) continua aberto e é pré-requisito para gerar o APK de
  piloto — `DRIVER_APP_VERSION` segue `0.0.1` contra `versionName "1.0"` no
  Android, divergência que esta sessão não tocou.
- iOS não foi verificado.

Próximo passo concreto: P0.3 — alinhar versão visível, `versionName` e
`versionCode`, e substituir `signingConfigs.debug` no release Android por uma
chave real fora do repositório, com caminho e senhas injetados por ambiente.

## Atualização — 2026-08-21: portão P0.3 (versão e assinatura Android)

Existiam três versões divergentes: `package.json` `0.0.1`, a constante
`DRIVER_APP_VERSION` `0.0.1` e o Android com `versionName "1.0"`. E o release
Android assinava com `signingConfigs.debug`.

### Versão com fonte única

O `version` do `package.json` do driver-app passou a ser a única fonte, hoje
`0.1.0-pilot.1`. O bundle lê via `resolveAppVersion()` em `app.env.js` e o
`versionName` do Android lê o mesmo arquivo com `JsonSlurper`. Reaproveitei o
plugin Babel do P0.2 em vez de criar um segundo mecanismo: `appVersion.ts`
agora só reexporta o literal inlinado `__MOTOBOYCITY_APP_VERSION__`.

Confirmado nos dois lados: `DRIVER_APP_VERSION="0.1.0-pilot.1"` na saída do
Babel e `versionName = 0.1.0-pilot.1` consultando o Gradle.

`versionCode` **não** deriva da versão, de propósito: é um inteiro que precisa
crescer a cada APK e nunca ser reaproveitado, inclusive num rollback, porque o
Android recusa reinstalar um `versionCode` já usado. Vem de
`MOTOBOYCITY_VERSION_CODE` (ou da propriedade Gradle `motoboycity.versionCode`),
com padrão `1` apenas para debug local.

### Assinatura

`signingConfigs.debug` saiu do buildType de release. Existe um `signingConfigs.release`
que lê `MOTOBOYCITY_KEYSTORE_FILE`, `MOTOBOYCITY_KEYSTORE_PASSWORD`,
`MOTOBOYCITY_KEY_ALIAS` e `MOTOBOYCITY_KEY_PASSWORD` do ambiente. Um
`gradle.taskGraph.whenReady` derruba o build de release se faltar qualquer
variável, se o keystore não existir no caminho informado, ou se o `versionCode`
não for explícito. A checagem filtra por tarefas de release do próprio módulo,
então build de debug não é afetado.

O motivo de falhar em vez de avisar: a chave de debug é pública e conhecida, e
o Android só aceita atualizar um app se a assinatura for a mesma — publicar com
ela inviabiliza qualquer atualização futura do app.

### Validações executadas (2026-08-21)

| Comando                                                       | Resultado                                 |
| ------------------------------------------------------------- | ----------------------------------------- |
| `pnpm --filter @motoboycity/driver-app exec jest --runInBand` | 2 suítes, 25 testes aprovados             |
| versão inlinada conferida na saída do Babel                   | `DRIVER_APP_VERSION="0.1.0-pilot.1"`      |
| `./gradlew help`                                              | configuração válida, trava não dispara    |
| `assembleRelease --dry-run` sem variáveis                     | falhou listando as quatro faltantes       |
| `assembleRelease --dry-run` com keystore inexistente          | falhou apontando o caminho                |
| `assembleRelease --dry-run` sem `MOTOBOYCITY_VERSION_CODE`    | falhou explicando o inteiro crescente     |
| `assembleRelease --dry-run` com tudo definido                 | passou a trava                            |
| `versionName`/`versionCode` consultados via init script       | `0.1.0-pilot.1` / `1` padrão, `7` por env |
| `pnpm typecheck` e `pnpm lint`                                | aprovados nos 8 workspaces                |
| `pnpm exec prettier --check` nos arquivos do recorte          | aprovado                                  |

`--dry-run` monta o grafo de tarefas sem compilar, então as travas foram
exercitadas sem nenhum build nativo real e sem nenhuma chave verdadeira: o
teste usou um arquivo descartável no scratchpad e valores obviamente fictícios,
que `--dry-run` nunca chega a usar para assinar.

### Limitações

- **Nenhuma chave de assinatura foi criada.** Isso é deliberado: gerar e
  guardar a chave de produção é do responsável, não de um agente. Perder essa
  chave significa nunca mais atualizar o app publicado. O encanamento está
  pronto e aguarda a chave.
- **Nenhum APK foi gerado ou instalado.** A verificação foi de configuração
  (`--dry-run` e consulta de propriedades), não de build real. O primeiro
  `assembleRelease` de verdade ainda pode revelar problemas de compilação,
  ProGuard ou empacotamento que este recorte não cobre.
- `0.1.0-pilot.1` veio do exemplo do runbook; se preferir outra numeração,
  agora é um campo só no `package.json`.
- iOS não foi tocado — continua sem tratamento de versão ou assinatura.

Próximo passo concreto: P0.4 — `QueueModule` e `LiveDriverPresenceService` só
usam `REDIS_HOST`/`REDIS_PORT`, e Redis gerenciado normalmente exige URL,
usuário, senha e TLS.

## Atualização — 2026-08-21: portão P0.4 (Redis gerenciado)

`QueueModule` e `LiveDriverPresenceService` montavam cada um o seu objeto de
conexão, ambos lendo só `REDIS_HOST`/`REDIS_PORT`. Isso impede usar qualquer
Redis gerenciado — eles exigem autenticação e normalmente TLS — e deixava as
duas conexões livres para divergirem.

### Fonte única

Novo `apps/api/src/common/redis-connection.ts`, seguindo o padrão de
`common/cors.ts` (função pura sobre `process.env`, com spec ao lado). Os dois
consumidores passaram a usar `buildRedisConnectionOptions()`, então fila e
presença não podem mais apontar para Redis diferentes.

Precedência: `REDIS_URL` vence; sem ela, cai em `REDIS_HOST`/`REDIS_PORT` com
padrão `localhost:6379`. Variáveis aceitas: `REDIS_URL`, `REDIS_HOST`,
`REDIS_PORT`, `REDIS_USERNAME` (ou `REDISUSER`), `REDIS_PASSWORD` (ou
`REDISPASSWORD`), `REDIS_TLS` e `REDIS_FAMILY`.

Optei por `process.env` em vez de `ConfigService` porque a função é chamada de
uma fábrica de módulo e de um construtor de serviço, e o `ConfigModule` é
global sem `load` próprio — ou seja, `ConfigService` apenas reflete
`process.env`. Mesmo raciocínio já registrado em `cors.ts`.

Detalhes que evitam falha silenciosa em produção:

- senha percent-encoded na URL é decodificada antes de conectar (um `%40` que
  deveria ser `@` quebraria a autenticação);
- host IPv6 vem sem colchetes, que é o que o ioredis espera;
- índice de banco lido do caminho (`redis://host:6379/2`);
- `rediss://` liga TLS sem flag separada;
- porta, protocolo e `REDIS_FAMILY` inválidos falham na inicialização, com
  mensagem direta, em vez de deixarem a API subir sem fila;
- `describeRedisTarget()` monta o log de conexão com host, porta, TLS e se há
  autenticação — nunca usuário, senha ou a URL inteira.

`LiveDriverPresenceService` deixou de injetar `ConfigService` (era usado só
para o Redis). Nenhum teste instanciava o serviço diretamente, então a mudança
de construtor não quebrou nada.

### Validações executadas (2026-08-21)

| Comando                                                          | Resultado                       |
| ---------------------------------------------------------------- | ------------------------------- |
| `pnpm --filter @motoboycity/api exec jest --runInBand`           | 29 suítes, 269 testes aprovados |
| E2E completo no banco isolado                                    | 18 suítes, 133 testes aprovados |
| E2E de presença e ofertas com `REDIS_URL` no lugar de host/porta | 2 suítes, 16 testes aprovados   |
| `pnpm typecheck` e `pnpm lint`                                   | aprovados nos 8 workspaces      |
| `pnpm exec prettier --check` nos arquivos do recorte             | aprovado                        |

Os unitários subiram de 244 para 269 (25 testes novos). O terceiro item é o
que importa de verdade: exercita o caminho novo contra um Redis real, não só o
fallback — sem ele, `REDIS_URL` estaria coberta apenas por teste de unidade.

### Limitações

- **Não foi testado contra um Redis gerenciado real.** A prova de conexão usou
  `redis://localhost:6379` do `docker-compose`, que valida o parsing e a
  conexão, mas não exercita TLS real, `rediss://` com certificado de provedor,
  nem `family: 0` numa rede só-IPv6. Esses três só se provam no provedor
  escolhido.
- `apps/api/.env.example` foi atualizado com as variáveis novas; o `.env` local
  não foi tocado.
- O workflow de CI continua usando `REDIS_HOST`/`REDIS_PORT`, que segue sendo
  o caminho de fallback e passou nos E2E.

Próximo passo concreto: P0.5 — `dispatchOfferTimeoutSeconds` e
`returnProximityRadiusMeters` não têm tela no admin (só o percentual do motoboy
tem), e os três valores precisam ser decididos pelo responsável antes do
piloto.

## Atualização — 2026-08-21: portão P0.5 (telas de configuração operacional)

O runbook pedia "implemente os dois campos faltantes no painel". A investigação
mostrou que a lacuna era maior: **o contrato compartilhado estava mais estreito
que o backend**.

`updatePlatformSettingsSchema`, o service e o controller já aceitavam e
devolviam os três campos, mas:

- `PlatformSettingsItem` em `packages/types` declarava só
  `driverCommissionPercentage`;
- `adminPlatformSettingsApi.update()` tipava o payload como
  `{ driverCommissionPercentage: number }`;
- `AdminPlatformSettingsService` mantinha uma cópia local da interface, com os
  três campos — foi essa duplicata que permitiu o tipo compartilhado ficar para
  trás sem ninguém perceber.

### O que mudou

- `packages/types/src/pricing.ts`: `PlatformSettingsItem` ganhou
  `dispatchOfferTimeoutSeconds` e `returnProximityRadiusMeters`; novo
  `UpdatePlatformSettingsInput` espelhando o schema Zod (parcial, sem `null` —
  limpar um valor configurado pararia a operação e não é suportado);
- `packages/api-client`: `update()` passou a aceitar `UpdatePlatformSettingsInput`;
- `apps/api`: o service passou a reexportar o tipo de `@motoboycity/types` em
  vez de manter cópia local, eliminando a origem da divergência;
- `apps/admin-web`: nova rota `/configuracoes/operacao` com os dois campos, e
  um card apontando para ela no índice de configurações.

A tela ficou fora de `tabela-de-precos` de propósito: timeout de oferta e raio
de retorno são operacionais, não de precificação, e o índice de configurações
já é uma lista de subpáginas.

### Validações executadas (2026-08-21)

| Comando                                              | Resultado                                        |
| ---------------------------------------------------- | ------------------------------------------------ |
| `pnpm typecheck`                                     | aprovado nos 8 workspaces                        |
| `pnpm lint`                                          | aprovado nos 8 workspaces                        |
| testes de `platform-settings`                        | 5 testes aprovados                               |
| `pnpm --filter @motoboycity/admin-web run build`     | aprovado; rota `/configuracoes/operacao` gerada  |
| smoke no navegador, autenticado                      | tela renderiza os dois estados "não configurado" |
| validação de faixa no cliente (valor 5, mínimo 10)   | bloqueou com mensagem; nenhum PATCH na rede      |
| `pnpm exec prettier --check` nos arquivos do recorte | aprovado                                         |

O smoke usou o admin de seed local (credenciais são placeholder público
versionado em `prisma/seed.ts`) contra a API e o banco de desenvolvimento. O
token foi descartado depois. **Nenhum valor foi gravado** em
`PlatformSettings`: os três seguem `null` no banco de dev, porque comissão,
timeout e raio são decisão do responsável, não do agente.

### Correção de um registro anterior

As atualizações do P0.1 e do P0.4 descrevem os E2E como rodando "contra banco
isolado". Isso vale para o **PostgreSQL** (`motoboycity_e2e_local`), mas **não
para o Redis**: nenhum comando sobrescreveu `REDIS_HOST`/`REDIS_PORT`, então os
E2E usaram o mesmo Redis (db0) do desenvolvimento. Resíduo de presença de
motoboys de teste ficou visível no widget "Atividade ao Vivo" do admin.

Não é destrutivo — `listActive()` executa `zremrangebyscore` e `get()` remove
membro cuja chave expirou, então o índice se limpa sozinho na próxima leitura.
Mas contraria a regra do `AGENTS.md` de rodar E2E só com Redis isolado.

Correção para as próximas execuções: acrescentar um índice de banco separado ao
comando, agora que `REDIS_URL` existe (P0.4):

```
DATABASE_URL=<banco isolado> REDIS_URL=redis://localhost:6379/1 pnpm --filter @motoboycity/api run test:e2e
```

### Limitações

- **O caminho de gravação não foi exercitado pelo navegador**, só a validação
  que barra antes da rede. A mutação em si está coberta por
  `admin-platform-settings.e2e-spec.ts` e pelos unitários, incluindo update
  parcial de cada campo isolado.
- Os três valores continuam `null`. O piloto não pode criar pedido nem fechar
  retorno até o responsável decidir e preencher — a tela agora existe, os
  números não.
- Nenhum teste automatizado cobre a nova tela; o `admin-web` não tem suíte de
  componentes, e criar uma está fora deste recorte.

Próximo passo concreto: P0.6 — `AddressSetupForm` no company-web não envia
`lat/lng`, embora `complete-return` exija coordenadas da coleta.

## Atualização — 2026-08-21: portão P0.6 (coordenadas da coleta)

`AddressSetupForm` no company-web enviava rua, número, cidade, UF e CEP por
digitação livre, sem `lat`/`lng`. Como `complete-return` mede a distância em
linha reta entre o motoboy e o ponto de coleta, a empresa terminava o cadastro
com um endereço aparentemente completo e o retorno só falhava na rua.

### O que mudou

O componente necessário **já existia**: `GoogleAddressAutocomplete`, usado pelo
`operational-order-form` para o destino. Ele devolve rua, número, cidade, UF,
CEP e o par de coordenadas, e zera a seleção se a pessoa digitar sem escolher
uma sugestão. O trabalho foi ligá-lo ao formulário de coleta, seguindo o mesmo
padrão do formulário de pedido (autocomplete + número editável + complemento).

O botão de salvar fica desabilitado sem uma sugestão selecionada, e cidade/UF/
CEP/coordenadas aparecem para conferência antes de salvar.

Fechada também uma brecha no `upsertCompanyAddressSchema`: `lat` e `lng` eram
opcionais **independentes**, então a API aceitava meia coordenada — um valor
inutilizável que só apareceria como falha no `complete-return`. Um `refine`
passou a exigir as duas juntas ou nenhuma.

Optei por **não** tornar as coordenadas obrigatórias: `company-address.e2e-spec.ts`
cobre explicitamente que são opcionais ("aceita e devolve lat/lng opcionais"),
há endereço já salvo sem elas, e a opção provisória do runbook (gravar o par
pela API) depende desse comportamento. Tornar obrigatório seria uma mudança de
contrato que o runbook não pediu.

### Validações executadas (2026-08-21)

| Comando                                                | Resultado                              |
| ------------------------------------------------------ | -------------------------------------- |
| `pnpm --filter @motoboycity/api exec jest --runInBand` | 30 suítes, 274 testes aprovados        |
| novo `company-address-validation.spec.ts`              | 5 testes cobrindo o par de coordenadas |
| E2E completo, Postgres **e Redis** isolados            | 18 suítes, 133 testes aprovados        |
| `pnpm --filter @motoboycity/company-web run build`     | aprovado                               |
| `pnpm typecheck` e `pnpm lint`                         | aprovados nos 8 workspaces             |
| `pnpm exec prettier --check` nos arquivos do recorte   | aprovado                               |

Este E2E já usou a isolação corrigida registrada no P0.5
(`REDIS_URL=redis://localhost:6379/1`). Conferido depois: 30 chaves no db1 e o
db0 do desenvolvimento intocado — a correção funciona.

### Limitações

- **O caminho feliz do Places não foi exercitado.** Não existe
  `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` no ambiente de desenvolvimento; sem
  chave o componente mostra "Mapa indisponível". A tela precisa de uma
  verificação manual com chave de navegador real antes do piloto. Não
  provisionei chave por conta própria: envolve conta Google Cloud com
  faturamento e é decisão do responsável.
- Endereços já salvos sem coordenadas continuam sem elas. Nada foi migrado —
  a empresa precisa reabrir a tela e selecionar o endereço de novo, ou usar a
  opção provisória da seção 12 do runbook.
- O `admin-web`/`company-web` seguem sem suíte de componentes, então a tela não
  tem teste automatizado.

Próximo passo concreto: P0.7 — validar a migration mais recente em cópia
restaurada com dado real. Hoje o Neon está vazio, então na prática ainda não há
o que restaurar; o portão só se fecha de verdade quando existir um banco com
dado real para copiar.

## Atualização — 2026-08-22: identidade visual do painel da empresa

Trabalho de design solicitado pelo responsável ("está muito feio, quero deixar
bonito antes do deploy"). Escopo escolhido por ele: painel da empresa primeiro;
marca proposta do zero, porque não existia nenhuma no repositório.

### Um bug, não uma escolha de design

Os dois painéis renderizavam **tudo em Times New Roman**. Causa:
`--font-sans: var(--font-sans)` no `@theme inline` — referência circular, que
resolve para vazio e derruba no serif padrão do navegador. O `layout.tsx` cria
a Geist sob `--font-geist-sans`, e a linha vizinha (`--font-mono`) já apontava
certo, o que mascarava o erro. Corrigido em `company-web` e `admin-web`.

Segundo achado: **todas as cores do tema tinham croma zero**
(`oklch(0.205 0 0)` e afins, inclusive os cinco `--chart-*`). As 104 variáveis
eram um sistema de tokens completo e nunca pintado — shadcn neutro de fábrica.

### Direção visual

Paleta nomeada pelo mundo do produto, em `company-web/globals.css`: `asfalto`,
`concreto`, `papel`, `colete` (#FF9E00), `placa`, `alerta`.

**Regra do âmbar**: significa uma coisa só — motoboy em movimento, ou a ação
que põe alguém em movimento. Por isso o item ativo da navegação **não** é
âmbar (seria decoração), e `--primary` é âmbar com `--primary-foreground`
escuro (branco sobre âmbar daria ~2:1 e reprovaria em contraste).

Tipografia: Archivo (display, eixo `wdth`) + Geist (interface) + Geist Mono
(números e IDs) — três papéis, duas famílias, uma já carregada.

### `StatusChip` — fonte única de status

Havia **cinco arquivos com mapas de status duplicados e divergentes**: o mesmo
`DELIVERED` aparecia como "Retorno" na home e "Entregue" na lista;
`AWAITING_DRIVER` como "Buscando motoboy" num lugar e "Buscando entregador"
noutro. `components/orders/status-chip.tsx` passou a ser a única fonte de
rótulo, cor e da marcação `inMotion`. Convertidos: home, lista de pedidos,
detalhe do pedido, relatórios e o mapa da central.

O mapa merecia atenção própria: os marcadores usavam rosa, ciano e roxo
(`#db2777`, `#0891b2`, `#7c3aed`) — um esquema sem relação nenhuma com a
paleta, bem no centro da tela operacional. Como o Google Maps não lê variável
CSS, `statusHex()` expõe o hex cru da mesma fonte, para marcador e chip nunca
discordarem sobre a cor do mesmo pedido.

`indicadores` mantém um mapa próprio de propósito: são contagens, e o plural
lê melhor ali. O vocabulário foi alinhado ao compartilhado.

`OrderRow` saiu da página e virou componente próprio, com o trilho colorido na
borda — a assinatura da interface: dá para varrer a lista e ver quais pedidos
têm motoboy na rua sem ler texto.

### Verificação

Login verificado em desktop e mobile. Navegação, chips e linhas de pedido
verificados com um harness temporário em `app/zz-preview-temp/`, criado para
renderizar os oito status sem depender de login — **e removido depois**. Optei
por ele em vez de criar empresa de teste: criar conta e digitar senha é uma
ação vedada, mesmo com autorização, e o harness cobre mais (os oito estados de
uma vez, não só o que o banco tem).

| Medida                     | Resultado             |
| -------------------------- | --------------------- |
| Texto do botão sobre âmbar | 8.75:1 (AAA)          |
| Corpo sobre fundo          | 16.31:1               |
| Os 8 chips de status       | 4.83 a 6.70 (AA)      |
| Foco de teclado            | visível, cor da marca |
| `prefers-reduced-motion`   | pulsos desligam       |
| typecheck / lint / build   | verdes                |

Dois defeitos de responsividade encontrados e corrigidos no processo: a faixa
de marca do login ocupava 250px vazios no celular, e o botão "Chamar
entregador" estava `hidden sm:inline-flex` — ou seja, **a ação principal do
produto sumia no telefone**. A navegação passou a cair para uma segunda linha
no celular, em vez de espremer contra o botão e desaparecer.

### Limitações

- **Nenhuma tela autenticada foi vista com dados reais.** Central operacional,
  detalhe do pedido, faturas, indicadores e relatórios estão compilando mas
  nunca foram renderizados com conteúdo de verdade.
- Removi do login o link "Esqueceu a senha" (apontava para `href="#"`) e o
  checkbox "Lembrar-me" (sem estado nem handler). Os dois mentiam para o
  usuário; recuperação de senha está na lista de Nível B do runbook.
- `admin-web` recebeu **apenas a correção de fonte**. A paleta não foi
  aplicada lá, então os dois painéis estão visualmente divergentes.
- Os PDFs em `imagensderefencia/` não puderam ser lidos (`pdftoppm` ausente);
  a única referência visual usada foi o PNG da área da empresa, de onde veio o
  vocabulário ("Chamar entregador", "Coleta", "Pagamento Faturado").

Próximo passo concreto: aplicar a direção nas telas autenticadas restantes e
converter os três arquivos que ainda duplicam o mapa de status.

## Atualização — 2026-08-22: identidade visual estendida ao painel admin

Continuação do recorte de design. O `admin-web` tinha recebido só a correção de
fonte, então os dois painéis pareciam produtos diferentes.

### Base compartilhada

O bloco `:root` do `admin-web` é agora **idêntico** ao do `company-web` —
mesma paleta, mesmos tokens de status, mesmo raio — e Archivo entrou como face
de display. Os componentes `brand/wordmark`, `brand/route-diagram` e
`orders/status-chip` foram copiados para o admin.

Vale registrar por que copiados e não compartilhados: os dois apps já
duplicavam todos os 12 componentes de `components/ui/` antes deste trabalho.
Criar um pacote de UI compartilhado é uma refatoração de estrutura que não cabia
neste recorte; a duplicação segue a convenção existente. **Consequência a
vigiar**: `status-chip.tsx` existe em dois lugares e precisa mudar nos dois.

### Decisões que mantêm a regra do âmbar

- **Sem botão âmbar no admin.** O painel fiscaliza a operação, não põe motoboy
  na rua. A cor só aparece nos status.
- **Item ativo da navegação não é âmbar** em nenhum dos dois painéis — seria
  decoração, e o olho pararia de encontrar a entrega em movimento.
- Avisos de bloqueio ("nenhuma modalidade atribuída", "GPS parado") usam
  `alerta`, não âmbar. Nos dois casos o motoboy não pode operar, então é
  bloqueio, não recado. A paleta segue com seis cores; nenhuma cor de "atenção"
  foi criada, justamente para não competir com o âmbar.
- Etiqueta `ADMIN` ao lado da marca: os dois painéis passaram a dividir o mesmo
  wordmark, e quem estiver com as duas abas abertas precisa saber onde está.

### Defeitos encontrados e corrigidos

- **A navegação do admin não cabia em 1024px.** Sete itens forçavam rolagem
  horizontal e cortavam "Relatórios". O ponto de quebra do layout de linha
  única subiu para `xl`; abaixo disso a navegação usa duas linhas. O
  `company-web` não tinha o problema por ter quatro itens.
- **`LiveActivityWidget` era `fixed` e permanente**, cobrindo o canto inferior
  direito de todas as telas sem forma de fechar — justamente sobre as tabelas.
  Agora recolhe.
- **Vocabulário divergente**: os filtros do admin diziam "Buscando Entregador"
  e "Aguardando Pagamento" em Title Case, ao lado de "Aceitos" em caixa de
  sentença. Alinhados ao `status-chip`.
- O mapa do admin repetia o esquema rosa/ciano/roxo do company-web; passou a
  usar `statusHex()`.

### Estado da consistência

| Métrica                                 | company-web | admin-web |
| --------------------------------------- | ----------- | --------- |
| Cores fora da paleta                    | 0           | 0         |
| Mapas de status duplicados (eram 5 e 7) | 1           | 1         |

O que sobra nos dois é intencional: `indicadores` (company) e `relatorios`
(admin) mantêm rótulos no plural, porque são contagens e não o estado de um
pedido. O vocabulário deles acompanha a fonte compartilhada.

### Validações

typecheck e lint verdes nos 8 workspaces; build dos dois painéis aprovado.
Telas do admin verificadas logadas no navegador (visão geral, pedidos,
configurações) com o admin de seed — placeholder público documentado no README,
em localhost, só para leitura. Nenhuma conta foi criada e nenhum dado foi
gravado.

### Limitações

- **Telas do admin não redesenhadas individualmente**: clientes, entregadores,
  financeiro e faturas herdaram a paleta e a navegação, mas o layout interno
  delas não foi tocado.
- As telas autenticadas do **company-web** continuam sem verificação com dados
  reais — a lacuna registrada na atualização anterior permanece.
- O banco de dev não tem pedidos ativos, então listas e mapas foram vistos
  majoritariamente em estado vazio.

## Atualização — 2026-08-22: levantamento da plataforma atual e botão de insucesso

### Levantamento

Navegação **somente leitura** no sistema em produção que este projeto
substitui, com autorização do responsável. Resultado em
`docs/gap-analysis-plataforma-atual.md`.

Contexto que muda o enquadramento: `motoboycity.app.br` é o portal de uma
instância white-label da **Plataforma Entregas Expressas** — o MOTOboyCity
opera hoje alugando um SaaS de terceiro. Os clientes que precisam migrar já
usam tudo o que está catalogado ali, então funcionalidade ausente vira motivo
concreto para a loja não trocar de sistema.

**Dado que resolve uma decisão pendente**: a comissão praticada na operação
real é de **~9,5%** (entregador fica com ~90,5%), medida pelos agregados do
painel financeiro. `driverCommissionPercentage` continua sendo decisão do
responsável, mas agora tem referência. Ticket médio de R$ 5,98 e tempo médio de
entrega de ~31 min completam a ordem de grandeza.

**Dois estados que faltam na máquina**: `Em preparo` e `Chegou na coleta`. O
segundo importa para o SLA implementado hoje — sem ele, a etapa "do aceite até
a coleta" mistura o tempo do motoboy chegando com o tempo da loja preparando, e
não responde de quem é o atraso.

Nenhum dado pessoal, endereço de cliente, nome de entregador ou valor
individual foi copiado para o repositório.

### Botão de insucesso no driver-app

Fecha a lacuna registrada na atualização anterior: a rota `/fail` existia e
estava testada, mas era inalcançável na rua.

`DeliveryOperationScreen` ganhou um botão secundário "Não consegui entregar",
visível **apenas em COLLECTED** — antes disso não há mercadoria em posse do
motoboy, então não existe o que devolver. Ele abre um modal com os quatro
motivos; "Outro" exige descrição, espelhando a validação do servidor.

O GPS é capturado no registro do insucesso: é a única prova de que o motoboy
chegou ao destino antes de declarar que não conseguiu entregar.

Em `FAILED`, a ação principal vira "Confirmar devolução na loja" — o mesmo
`completeReturn` — e a rota externa passa a apontar para a coleta, não para o
destino.

### Validações

| Comando                                           | Resultado           |
| ------------------------------------------------- | ------------------- |
| `pnpm --filter @motoboycity/driver-app exec jest` | 2 suítes, 25 testes |
| typecheck e lint do driver-app                    | aprovados           |

### Limitações

- **A tela não foi vista rodando.** O driver-app é React Native e não há
  emulador nesta sessão; o modal, o seletor de motivo e o fluxo em `FAILED`
  foram verificados por typecheck e lint, não visualmente. Precisa de uma
  passada em aparelho antes do piloto.
- O app continua com um único smoke test de renderização; não há teste
  automatizado cobrindo o novo fluxo.
- As seções Gestão e Suporte da plataforma atual, e os submenus de Financeiro
  e Relatórios do admin, não foram abertos em profundidade.

## Atualização — 2026-08-22: cronômetro ao vivo na fila de pedidos

Primeiro item da lista de prioridade em `docs/gap-analysis-plataforma-atual.md`.
Cada pedido na fila passa a mostrar há quanto tempo está no estado atual —
`20s`, `4m 21s`, `1h 12m` — nos dois painéis.

**Nenhuma mudança de API**: `statusChangedAt` já vinha em `DeliveryListItem`.

### Duas decisões

**Um relógio para a tela inteira.** Uma central com trinta pedidos criaria
trinta `setInterval` se cada linha cuidasse do próprio tempo. Há um único
intervalo com assinantes; como todos leem o mesmo instante, os contadores não
piscam fora de sincronia.

**Sem cor de alerta.** "Demorado" depende de um limite que ninguém decidiu, e
pintar de vermelho um número arbitrário treina o operador a ignorar a cor. O
tempo em si é a informação.

### O lint corrigiu a primeira versão

A implementação inicial usava `useEffect` + `setState` para capturar o relógio
na montagem, e o lint recusou: setState síncrono dentro de efeito provoca
render em cascata. A regra estava certa — reescrito com
`useSyncExternalStore`, que é o primitivo do React para assinar fonte externa e
já resolve o SSR pelo `getServerSnapshot`.

### Verificação

O painel do navegador não estava compondo frames, então a prova veio de leitura
do DOM em vez de captura de tela — para um cronômetro, é evidência melhor:

```
antes:  20s · 4m 17s · 1h 00m
depois: 24s · 4m 21s · 1h 00m
```

Escalas de segundo avançaram, escalas de hora ficaram paradas. A formatação foi
conferida nos limites: 59s→"59s", 60s→"1m 00s", 3599s→"59m 59s",
3600s→"1h 00m", 86399s→"23h 59m".

typecheck, lint e build dos dois painéis aprovados. O harness usado na
verificação foi removido e confirmado fora do build.

### Limitação

`elapsed-time.tsx` existe em dois lugares, pelo mesmo motivo já registrado para
`status-chip.tsx`: os apps duplicam componentes por convenção do repositório.
Precisa mudar nos dois.

## Atualização — 2026-08-22: marca oficial aplicada

O responsável forneceu o logo e o ícone do app. Até aqui a identidade era uma
proposta minha, feita porque não havia marca nenhuma no repositório.

### A cor inventada estava quase certa

A cor foi **extraída dos arquivos**, não estimada a olho: o gradiente da marca
vai de `#EA5505` a `#FDA02E`. O `--colete` que eu havia proposto partindo do
colete de segurança era `#FF9E00` — praticamente o extremo claro do gradiente
real.

Adotado `#FDA02E` com base em contraste medido contra o asfalto: 8.84:1 (AAA),
contra 6.54:1 da mediana e 5.00:1 do extremo escuro. Os três passariam em AA,
mas o claro é o único AAA e é quase idêntico ao que já estava no ar — nada
regrediu. O gradiente completo ficou reservado ao logo.

### Os arquivos vinham com preto queimado

Ambos eram RGB sem canal alfa. Sobre o painel asfalto apareceria um retângulo
preto puro, visivelmente mais escuro. O fundo foi removido tratando a
**luminância como alfa** e dividindo a cor por ela, não por limiar — limiar
deixaria franja escura nas bordas. Resultado medido: 66,7% transparente, 20,4%
branco opaco, 12,9% laranja, **0% de franja**.

### O que foi instalado

- `public/brand/motoboycity-logo.png` (507x164) nos dois painéis, consumido
  pelo componente `Wordmark`, que passou de texto para imagem;
- `src/app/icon.png` como favicon nos dois painéis, e o `favicon.ico` padrão do
  `create-next-app` foi **removido** — era o logo do Next;
- ícones do Android nas cinco densidades, quadrado e redondo, gerados do
  monograma MC.

O ícone exigiu tratamento próprio: o monograma é 3:1 e ícone de app é quadrado,
então foi centralizado num quadrado com margem justa e recorte circular suave na
variante redonda.

### Restrição registrada

O logo tem conteúdo branco, então **só funciona sobre fundo escuro**. Por isso
aparece no painel asfalto e na navegação, nunca sobre o fundo claro das telas.
Uma variante para fundo claro ainda não existe; está documentado no componente.

### Validações

Builds dos dois painéis, 25 testes do driver-app, typecheck e lint verdes.
Confirmado no navegador que o logo carrega (zero imagens quebradas) e que o
botão renderiza `rgb(253, 160, 46)`.

### Levantamento refinado

`docs/gap-analysis-plataforma-atual.md` ganhou o detalhamento das três
configurações inspecionadas. O achado que muda prioridade: **tarifa dinâmica é
um upsell que a operação não contrata** (R$ 199/mês), logo não é paridade nem
bloqueio de migração — e é a mais cara da lista.

## Atualização — 2026-08-22: horários de pico, e o fuso que apareceu junto

Primeiro item tirado do levantamento da plataforma concorrente. O dado já
estava em `createdAt`, como o levantamento previa — mas construir o relatório
expôs dois erros que ele não previa.

### O fuso estava errado em seis serviços

O recorte por data usava `T00:00:00.000Z` e `T23:59:59.999Z`, copiado em
`deliveries`, `admin-financial`, `driver-wallet`, `financial-payout`,
`delivery-tracking`, `invoice` e no próprio relatório. Numa operação em UTC-03,
isso joga **três horas de todo dia no dia errado**: o pedido das 22h de terça
entrava no recorte de quarta.

Para um total mensal isso passava despercebido. Para horários de pico não
passaria — o pico do almoço apareceria às 15h.

`apps/api/src/common/sao-paulo-time.ts` passou a ser a fonte única. A regra de
fuso vem do `Intl`, e não de uma constante `-3`, porque o Brasil teve horário de
verão até 2019 e uma subtração fixa erraria a meia-noite em todo o histórico
anterior. O fim do dia é calculado como o começo do dia seguinte menos um
milissegundo, que é sempre um instante único mesmo em dia de virada.

`finance-release.utils.ts` foi reescrito em cima desse módulo e seus cinco
testes continuam passando sem alteração.

**Uma exceção deliberada:** `invoice.service.dateOnly` continua em meia-noite
UTC. Ela não é só filtro — grava `issueDate` e `paymentDate`, que são datas
civis armazenadas e comparadas com linhas já existentes. Movê-la mudaria dado
gravado, não o recorte de uma consulta. Só o filtro da listagem virou local.

### O calendário inflava dia da semana

Uma janela de 30 dias quase nunca tem o mesmo número de segundas e de domingos.
Somar pedidos por dia da semana daria 25% a mais de volume ao dia que caísse
cinco vezes em vez de quatro — efeito de calendário lido como demanda.

Por isso `byWeekday` reporta **média por ocorrência**, e é dela que sai o dia de
pico. Na conferência visual isso apareceu bem: sábado com 58 pedidos perde para
sexta com 56, porque houve cinco sábados e quatro sextas.

### O que ficou

- `apps/api/src/common/sao-paulo-time.ts` + spec (7 testes)
- `apps/api/src/admin/reports/delivery-peak-hours.ts` + spec (6 testes)
- `apps/api/src/admin/reports/admin-reports.service.spec.ts` (6 testes) — o
  serviço não tinha nenhum teste antes
- `PeakHoursChart` no painel admin, sem biblioteca de gráfico: 24 barras não
  justificam uma dependência
- os tipos foram para `@motoboycity/types` e o serviço parou de declarar cópia
  local — era a mesma armadilha que já deixou o contrato de configurações
  divergir

O laranja da marca marca só a barra de pico. Gastá-lo nas 24 barras o tornaria
decoração e o olho pararia de achar o que importa, que aqui é uma barra só.

Os gráficos são `aria-hidden` e os números vivem num `<details>` — barra não é
legível por leitor de tela, nem serve para quem precisa do valor exato para
montar escala.

### Um teste que ia ficar instável

`delivery-lifecycle.e2e-spec.ts` montava `today` com `toISOString()`, ou seja em
UTC. Depois da correção de fuso ele falharia sempre que o CI rodasse entre 21h e
meia-noite de Brasília — o filtro pediria um dia em que a entrega do teste ainda
não existe. Passou a usar `dateInSaoPaulo`.

### Armadilha de ambiente: e2e local pode apontar para o banco de dev

Tentando rodar a suíte e2e localmente, descobri um risco que vale registrar
antes que alguém repita.

O `apps/api/.env` aponta para `motoboycity_dev` na porta **5434** (contêiner
Docker, não a porta padrão). E **o CLI do Prisma carrega esse `.env` por cima**
da variável exportada no shell: `prisma migrate deploy` com `DATABASE_URL`
exportado apontando para `motoboycity_e2e_local` mesmo assim reportou
`Datasource "db": PostgreSQL database "motoboycity_dev"`.

Para o Jest o comportamento é o oposto — `process.env` vence — mas eu não
consegui **confirmar** para qual banco a suíte tinha conectado: o
`pg_stat_activity` mostrava 8 conexões em `motoboycity_dev`, que são o servidor
de desenvolvimento na porta 3333, e nenhuma em `motoboycity_e2e_local`. Sem
conseguir distinguir as duas coisas, interrompi a execução em vez de arriscar
uma suíte que limpa tabelas rodando no banco errado.

Conferido depois que o banco de dev está íntegro: 33 usuários e 12 empresas.
As entregas estão em zero, mas isso é o estado de repouso dele — o
`pg_stat_user_tables` mostra 1085 inserções e 1140 remoções acumuladas em
`deliveries`, ou seja, esse banco já serviu de alvo de e2e em sessões
anteriores e sempre termina vazio.

**Resolvido em 2026-08-22.** O e2e roda localmente agora, e a causa da falha
original era outra do que parecia.

**A senha deste ambiente contém a string `motoboycity_dev`.** Qualquer script
que troque o nome do banco por substituição de texto na URL acerta a senha em
vez do banco — `replace` troca só a primeira ocorrência, que está na senha, e
uma troca global corrompe a autenticação. Era essa a causa do "Authentication
failed" que eu tinha atribuído a outra coisa.

O jeito certo é trocar `pathname` pelo parser de `URL`, nunca por texto:

```js
const alvo = new URL(process.env.DATABASE_URL);
alvo.pathname = '/motoboycity_e2e_local';
```

Vale para qualquer ferramenta que mexa nessa URL, não só para o e2e.

Continua valendo que **o CLI do Prisma carrega o `.env` por cima da variável do
shell** — `migrate deploy` ignora o `DATABASE_URL` exportado. O Jest não: ele
respeita `process.env`, então a suíte roda no banco isolado sem problema. Para
migrar o banco de e2e, aplicar o SQL direto por `psql` e registrar a linha em
`_prisma_migrations`.

Vale também considerar mudar o `.env` de desenvolvimento para não ser o padrão
que qualquer ferramenta pega sozinha.

## Atualização — 2026-08-22: clonar entrega

Segundo item do levantamento. O botão vive no card do pedido selecionado da
central, ao lado de "Abrir detalhes" — que é o único lugar onde ele cabe sem
aninhar `<button>` dentro de `<button>`, já que a linha da fila inteira é um
botão de seleção.

### Duas coisas que o clone não copia, de propósito

**O número externo.** Ele identifica UM pedido no sistema da própria loja, e é
por ele que a conciliação acontece depois. Copiá-lo criaria duas entregas
alegando ser o mesmo pedido.

**Endereço sem coordenadas.** O formulário exige uma sugestão escolhida no
Google porque o despacho mede distância pelo par lat/lng. Copiar rua e número
sem as coordenadas montaria um destino que parece completo e só falha no
cálculo — a tela avisa e pede que a pessoa reescolha. É a mesma regra que a
coleta já adotou em `ffa7dbf`.

Há um terceiro aviso, para quando a modalidade do pedido original foi desativada
desde então: o campo cai no padrão em vez de ficar em branco sem explicação.

### Um bug pré-existente que apareceu junto

Com o clone pronto, a modalidade aparecia como `st-2` em vez de "Expresso".
Conferido que **não era do clone**: sem clonar nada, o campo já mostrava
`st-1`. Em produção seria um UUID cru no lugar do nome, no formulário mais usado
do painel.

A causa é o contrato do Base UI: `<Select.Value>` mostra o **valor** do item
selecionado, e o valor ali é o id. O próprio componente resolve isso com a prop
`items` no Root — "When specified, `<Select.Value>` renders the label of the
selected item instead of the raw value". Corrigido nos três lugares que tinham
o mesmo padrão: os dois formulários de pedido da empresa e a tabela de preços
do admin.

### Contrato

`DeliveryListItem` ganhou `serviceTypeId`. O id precisa acompanhar o nome porque
clonar reseleciona a modalidade, e casar por nome quebraria numa renomeação ou
com nomes repetidos. O `serviceType` já vinha por `include`, então não houve
consulta nova.

### Sem teste, e por quê

`buildCloneSeed` é função pura e as decisões acima mereciam teste, mas
**`apps/company-web` não tem runner de teste nenhum** — o CI roda só os testes
da API e do driver-app. Introduzir Jest ou Vitest no painel é uma decisão à
parte, que muda o CI. A lógica ficou isolada em `clone-delivery.ts` justamente
para ser testável no dia em que houver runner.

A verificação foi por página temporária, exercitando os três casos: clone
completo, destino sem coordenadas e modalidade desativada.

## Atualização — 2026-08-22: chave do Google Maps no navegador

O painel exibia "Configure NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY". Investigando,
eram três problemas diferentes, e só um deles é "falta a chave".

### O impacto é maior do que "o mapa não aparece"

Sem a chave, `loadGoogleMaps()` rejeita e o autocomplete nunca devolve endereço.
Como `OperationalOrderForm` exige uma sugestão escolhida no Google para
submeter, e `AddressSetupForm` desabilita o botão de salvar sem ela, ficam
bloqueados **a criação de pedido com destino conhecido e o cadastro do endereço
de coleta** — ou seja, uma empresa nova não termina o onboarding.

A chave de servidor (`GOOGLE_MAPS_API_KEY`, usada pelo Routes na API) **está**
configurada em `apps/api/.env`. É outra credencial e não substitui a do
navegador: `NEXT_PUBLIC_` é embutido no pacote JavaScript e fica visível para
qualquer visitante, então a chave do navegador precisa ser restrita por
referrer.

### 1. A variável não estava documentada onde se procura

Nenhum dos dois `.env.example` dos painéis mencionava
`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` — só o runbook de go-live. Quem clona o
repositório e copia o `.env.example` descobria a variável batendo no erro em
tempo de execução. Ambos ganharam a entrada, com o motivo e a restrição de
referrer de desenvolvimento.

### 2. Chave recusada vazava um TypeError na tela

Testado de verdade, com uma chave inválida de propósito: o Google devolve um
script que **executa normalmente** — `onload` dispara — mas não preenche
`google.maps.places`, e só registra `InvalidKey` como aviso no console. O
`new maps.maps.places.Autocomplete(...)` então lançava, e o `.catch` mostrava a
mensagem crua na interface:

> Cannot read properties of undefined (reading 'Autocomplete')

O `onload` passou a verificar se as bibliotecas realmente vieram antes de
resolver. O mesmo caminho cobre API não habilitada e faturamento desligado, que
falham igual.

### 3. `gm_authFailure` não estava ligado

O hook oficial do Google para chave recusada não era tratado. Ele **não** cobre
o caso acima — dispara depois, ao desenhar o mapa com referrer não autorizado —
então os dois caminhos são necessários. Os quatro mapas e o autocomplete se
inscrevem nele agora.

### Verificação

Os dois caminhos foram exercitados no navegador contra a resposta real do
Google: chave ausente e chave inválida. O `.env.local` usado no teste foi
restaurado a partir de backup, com hash conferido.

### Correção do próprio conserto: `onload` não serve de sinal

Ao configurar a chave real, a tela acusou "O Google recusou a chave" com uma
chave **válida**. O falso negativo era meu: o guarda que eu tinha acabado de
escrever rodava no `script.onload`, e ali o Google ainda não terminou de
inicializar.

Medido no navegador, não deduzido: no `onload` nem `google.maps.importLibrary`
existe ainda — quanto mais `google.maps.places`. Qualquer verificação de
presença naquele ponto reprova toda chave boa.

O sinal correto é o parâmetro `callback` da URL, que é o "API inicializada" do
próprio Google. Só depois dele faz sentido perguntar se `places` chegou. Foi
acrescentado também um timeout de 15s como rede de segurança: se o callback
nunca disparar, a promessa ficaria pendente para sempre e a tela mostraria um
campo inerte sem erro nenhum — pior que a mensagem errada que isso corrigiu.

### O `gm_authFailure` provou seu valor no primeiro uso real

Com o callback certo, o carregamento passou limpo — e então a mensagem
reapareceu **ao digitar**. Essa é a assinatura da restrição de referrer, e foi
o `gm_authFailure` que a capturou.

Evidência de rede: os 7 scripts carregaram (`places_impl.js` incluso), houve
`AuthenticationService.Authenticate` com referrer
`http://localhost:3000/zz-preview-temp`, nenhum `InvalidKey` no console — e
`getPlacePredictions` nunca chama de volta.

Ou seja, a chave é válida e o que falta é autorizar `http://localhost:3000/*` e
`http://localhost:3001/*` nas restrições da credencial. Sem os dois caminhos
tratados, isso apareceria como um campo que simplesmente não sugere nada.

### Enquadramento dos mapas

O mapa abria em zoom 12 (admin) e 13 (empresa) centrado em `-20.153, -41.622`,
mostrando mata e municípios vizinhos onde nunca há entrega.

O centro foi confirmado pelo geocoder do próprio Google em vez de estimado:
`Lajinha, MG, 36980-000, Brasil` responde `-20.15221, -41.62322` — praticamente
o valor que já estava lá. O problema era só o zoom, que subiu para 15 nos dois.
Nessa escala aparecem os nomes de rua e os comércios que são origem e destino
real: Supermercado Juvenil, Padaria Elite, Show de Compras.

**O `fitBounds` era o problema maior.** Ele roda sempre que há marcador, e com
um único ponto recebe bordas de tamanho zero — o Google responde com o zoom
máximo. Na prática o mapa da empresa caía nisso **sempre**, porque ele marca o
ponto de coleta mesmo sem nenhuma entrega: a loja abria o painel na calçada dela
em vez de ver a cidade.

Agora o enquadramento automático só entra com dois marcadores ou mais. Com um,
o mapa centraliza e mantém o zoom, o que também respeita quem já tinha ajustado
a vista. Um teto de 16 cobre o caso de duas entregas quase no mesmo ponto.

O mapa da empresa também passou a abrir centrado na própria loja quando ela tem
coordenadas, e não no centro genérico da cidade — uma loja na periferia se via
na borda do mapa.

Verificado no navegador nos três casos: só a loja, duas entregas coladas
(a ~30 m) e entregas em pontas opostas da cidade.

### Autocomplete: sugerir Lajinha primeiro, e a lista que descolava

Duas correções no mesmo componente — ele é único e serve tanto o formulário de
pedido quanto o cadastro do endereço de coleta.

**Ordenação.** Digitar "aven" trazia avenidas do Rio, de Recife e de Campo
Grande antes de qualquer coisa daqui. Só `componentRestrictions: { country: 'br' }`
não basta: o Google ordena por relevância global e cidade maior ganha sempre.

O raio do viés foi medido contra o Google, não escolhido por intuição:

| configuração     | resultado ao digitar "aven"             |
| ---------------- | --------------------------------------- |
| viés de 20 km    | Lajinha em 5º, atrás de Iúna e Ibatiba  |
| **viés de 5 km** | **as cinco sugestões são de Lajinha**   |
| restrito a 30 km | Avenida Paulista em 1º, Lajinha ausente |

A última linha é o achado contraintuitivo: `strictBounds` saiu **pior** que o
viés apertado — filtra a área mas mantém a ordenação global. Além de inferior,
travaria o pedido para outra cidade, já que o formulário exige uma sugestão do
Google para submeter. Confirmado que o viés não bloqueia: "Avenida Paulista Sao
Paulo" e "Rua Sete de Setembro Ibatiba" continuam achando o que se pediu.

`LAJINHA_CENTER` estava duplicado nos dois mapas e agora o autocomplete também
precisava dele — virou `src/lib/operation-area.ts` em cada painel.

**A lista descolava do campo.** O Google prende o `.pac-container` no `body` e o
posiciona em coordenadas do documento, calculadas uma vez, quando a lista abre.
O formulário vive num painel com rolagem própria, então rolar o painel deixava a
lista para trás — 157px medidos, exatamente a altura rolável.

A saída foi `position: fixed` sincronizado com o retângulo do campo na viewport.
O detalhe que faz funcionar é a fase de captura no listener de scroll: sem ela,
a rolagem de um ancestral nunca chega ao componente. Não é preciso associar
container a input (o Google não permite) porque só uma lista abre por vez, a do
campo em foco.

Medido depois: desalinhamento 0 tanto na rolagem do painel quanto na da página.

## Atualização — 2026-08-22: bandeirada na tabela de preços

O modelo era `baseFee + perKmFee × distância`, com o por-quilômetro incidindo
desde o metro zero. Não havia como dizer "até 3 km custa R$ 8".

`PricingTable` ganhou `includedDistanceKm`, e a fórmula virou:

```
subtotal = max(baseFee + perKmFee × max(0, distância − includedDistanceKm), minimumFee)
```

**Interpretação assumida:** o enunciado pedia "valor fixo até X km" e "a partir
de quantos km começa a cobrar por km" — são a mesma fronteira, expressa duas
vezes, então virou um campo só. Se a intenção for duas fronteiras distintas (uma
faixa de carência entre o fim do fixo e o início da cobrança), isso muda o
modelo e ainda não está feito.

O `Math.max(0, …)` não é defensivo por hábito: sem ele, entrega mais curta que a
bandeirada daria distância negativa e o `perKmFee` viraria desconto, cobrando
menos que a própria taxa base. Há teste cobrindo isso.

`includedDistanceKm` é **obrigatório** em `PricingCalculatorInput`, não
opcional. Num cálculo de dinheiro, um campo esquecido que assume zero sozinho
cobra menos do que devia e ninguém percebe — melhor o compilador exigir a
decisão de quem chama. O resultado ganhou `chargeableDistanceKm` para a tela
poder mostrar quanto da distância foi efetivamente cobrado.

Compatibilidade: a coluna entra com `DEFAULT 0`, que reproduz exatamente o
comportamento anterior. Confirmado no banco de desenvolvimento — a tabela
existente ficou com `0.00`. E os dez testes originais da calculadora passam sem
alteração nenhuma, o que é a prova de que a fórmula antiga é um caso particular
da nova.

`minimumFee` continua sendo piso e não foi tocado. Com bandeirada configurada
ele fica quase redundante, já que a taxa base é o piso natural de trajeto curto,
mas remover seria mudança incompatível.

## Atualização — 2026-08-22: modal "Chamar entregador"

O botão do topo era um `<Link href="/">` que só navegava para a central. Virou o
caminho curto que a plataforma concorrente tem: coleta já salva, destino por
GPS, uma ou várias entregas de uma vez.

Ele **não substitui** o formulário completo — quem já sabe o endereço continua
usando "Novo pedido", que exige a sugestão do Google e calcula o preço na hora.
Aqui o preço fica nulo até a distância existir, que é o comportamento já
desenhado para `destinationKnownAtCreation: false`.

Uma entrega usa `create`; duas ou mais usam `createBatch`, cujo mínimo no schema
é dois. O limite de cima é 50, o mesmo da validação.

### Três coisas do original que não foram copiadas

**"Obrigatório anexar comprovante de entrega"** — a pedido. Vale notar que
`requiresDeliveryProof` já existe no payload e no schema; falta só a tela no app
do entregador.

**"Salvar local de coleta para o próximo pedido"** — aqui o ponto de coleta é o
endereço da própria empresa, já salvo e reutilizado sempre. A caixa não teria o
que controlar, então virou o endereço em leitura com um link para alterar.

**Fotos nos cartões de tipo de serviço** — `ServiceType` não guarda imagem.
Inventar uma ilustração genérica ocuparia espaço sem ajudar a distinguir as
modalidades, então os cartões têm ícone e nome.

E o cartão "Pagamento Faturado" virou linha informativa, não escolha: a API
grava `paymentMethod: 'BILLED'` em toda entrega. Um cartão clicável prometeria
uma opção que não existe.

### Dialog novo no painel

Não havia primitivo de modal. `components/ui/dialog.tsx` embrulha o Dialog do
Base UI seguindo o mesmo padrão dos outros wrappers. O corpo rola por dentro com
`max-h` em `dvh`: o formulário passa da altura da janela em tela baixa, e sem
isso o botão de enviar ficaria fora de alcance.

### Verificado no navegador

Criação avulsa e lote de duas, confirmados no banco: `destinationKnownAtCreation`
falso, `paymentMethod` BILLED, status AWAITING_DRIVER, e o `requiresReturn`
chegando certo em ambos.

### O modal não fecha mais ao chamar — ele vira acompanhamento

Fechar no sucesso jogava a pessoa de volta para a central justamente no momento
em que ela mais quer olhar a tela: o da espera. Agora o modal troca de papel —
título vira "Acompanhando" e o corpo passa a listar as entregas criadas.

Enquanto não há entregador, cada linha mostra o chip "Buscando motoboy", o
cronômetro do estado e um spinner. Quando alguém aceita, o spinner dá lugar ao
nome e ao telefone clicável, e o chip vira âmbar — a mesma cor que na fila
significa motoboy na rua.

O texto do topo acompanha: "acompanhe até um entregador aceitar" enquanto todas
estão pendentes, "N de M ainda procurando" no meio do caminho, e "entregador a
caminho" quando acabou. Um texto que continuasse dizendo "até aceitar" depois de
aceito seria a tela mentindo para quem está olhando justamente para saber disso.

**Sondagem, não socket.** A consulta reaproveita a chave `['company',
'operations']` da central: uma requisição para todas as entregas em vez de uma
por id, e cache compartilhado. Abrir um segundo socket aqui duplicaria a conexão
que a central já mantém, e o painel não tem hook compartilhado de tempo real.
Três segundos é imperceptível para "alguém aceitou?", e o TanStack usa o menor
intervalo entre observadores ativos — então isso só acelera enquanto o modal
está aberto.

Fechar encerra o acompanhamento; as entregas seguem na central, que é onde elas
vivem depois de criadas. "Chamar outro" devolve o formulário limpo.

Verificado no navegador: pedido #1163 criado pelo modal, painel mostrando
"Procurando um entregador disponível...", e a transição para "Motoboy Aprovado
E2E · 33999887766" acontecendo **sozinha**, sem recarregar. O aceite foi
simulado por UPDATE direto no banco de desenvolvimento, já que não há motoboy
online ali — a linha ficou em ACCEPTED sem registro de oferta correspondente.

### Cancelar e chamar de novo na tela de acompanhamento

Duas ações por pedido, com regras que vieram da API e não de escolha de layout.

**Cancelar** só aparece em `AWAITING_DRIVER`. A API restringe o cancelamento da
empresa a `SCHEDULED` e `AWAITING_DRIVER` — mostrar o botão depois do aceite
ofereceria uma ação que volta erro.

E no lote o cancelamento **pega todos os irmãos**, não só a linha clicada. Por
isso o texto vira "Cancelar os N". Um "Cancelar" seco faria a pessoa acreditar
que perde um pedido só, e ela descobriria o contrário depois de clicar.

**Chamar de novo** existe porque a varredura automática (`dispatchAvailableDeliveries`)
roda quando um motoboy fica disponível, **não em temporizador**. Um pedido cuja
oferta expirou e para o qual nenhum motoboy novo entrou desde então fica parado
sem oferta pendente, e nada o move. O botão destrava isso sem cancelar e
recriar, o que perderia o número do pedido e a hora de criação.

Endpoint novo: `PATCH /deliveries/:id/redispatch`. Ele reusa
`dispatchService.dispatchDelivery`, que já é seguro de repetir — não faz nada se
já há oferta pendente, se o pedido saiu de `AWAITING_DRIVER`, ou se não há
motoboy elegível. Apertar duas vezes não duplica oferta.

Oito testes cobrindo: 404, empresa de fora, e a recusa em cada um dos cinco
estados não elegíveis. O que importa nesse último é que um pedido já aceito não
seja reofertado, ou dois motoboys apareceriam para a mesma entrega.

**Um bug que a verificação pegou:** o painel usava "tem entregador?" como sinal
de "ainda procurando". Pedido cancelado também não tem entregador, então ele
continuava girando o spinner e o cabeçalho seguia dizendo "acompanhe até um
entregador aceitar". O sinal correto é o status, não a ausência de motorista.

## Atualização — 2026-08-22: taxas adicionais configuráveis

Substitui a "taxa de chuva" fixa que o levantamento tinha listado. A mesma
mecânica serve para chuva, feriado, madrugada e alta demanda, com o nome que o
admin escolher — sem depender de uma migração a cada motivo novo.

**Existia um esqueleto.** `Surcharge` estava no schema desde a Fase 0, com
`regionId`, `type` (enum RAIN/PEAK_HOUR/OTHER), `value` e `active`, sem uma
única referência em código e sem nenhuma linha gravada. Foi evoluído em vez de
duplicado: o enum de MOTIVO virou enum de CÁLCULO (PERCENTAGE/FIXED) e o motivo
passou a ser nome livre.

### Duas formas de valer, e basta uma

O **interruptor manual** é o que o admin liga quando começa a chover. As
**janelas agendadas** cobrem o previsível: dia da semana com faixa de horário,
período de datas, ou os dois.

`apps/api/src/pricing/surcharge-window.ts` decide se uma taxa está valendo num
instante. Módulo puro, 17 testes, com os casos que enganam:

- **atravessa a meia-noite** — fim antes do início significa madrugada;
- **"sexta à noite" continua sexta à 1h da manhã** — uma janela de sexta 22h–2h
  pertence à noite de sexta, mesmo já sendo sábado no calendário;
- **faixa fechada no início e aberta no fim** — sem isso, 18h–23h e 23h–2h se
  sobreporiam exatamente às 23h;
- **tudo no relógio da operação** — janela de sexta em UTC cairia parcialmente
  no sábado, e feriado começaria três horas cedo.

### Uma decisão de risco: no máximo UMA taxa aplica

Somar seria perigoso: numa sexta feriado chovendo, três regras se empilhariam e
o cliente pagaria um acréscimo que ninguém configurou de propósito. Com uma só,
o pior caso é a taxa mais recente — um número que o admin escolheu. O critério
de desempate é a criação mais recente, e a tela mostra qual está valendo.

### O que fica congelado

`Delivery` ganhou `surchargeLabel` e `surchargeValue` — nome e valor, **não**
chave estrangeira. Renomear ou excluir a taxa depois não pode reescrever o que a
fatura já emitida dizia. É a mesma regra que congela o preço.

O adicional incide sobre o **subtotal**, não sobre o total: cobrar percentual em
cima do retorno faria a mesma entrega custar mais só por exigir volta, o que já
é cobrado à parte.

`platformValue` passou a ser o resíduo de `totalValue - driverValue`. Somar três
parcelas arredondadas separadamente deixaria centavos sobrando, e a invariante
`driverValue + platformValue === totalValue` quebraria em alguma combinação —
há teste cobrindo comissão e repasse fracionados juntos.

### Detalhes do CRUD

Editar **substitui as janelas por inteiro**. Casar janelas antigas com novas
exigiria que o painel devolvesse ids, e o primeiro id perdido viraria uma janela
órfã cobrando sozinha.

Desativar **também desliga o interruptor manual**. Sem isso, uma taxa arquivada
com o manual esquecido em ligado voltaria a cobrar no instante da reativação.

`activeNow` vem resolvido do servidor. Uma segunda cópia da regra no navegador
divergiria da que cobra de verdade.

### Verificação, e o que não deu para verificar

350 testes unitários, typecheck, lint e os 4 builds. Um e2e novo cobre o CRUD
inteiro — incluindo a recusa de ligar taxa desativada e a substituição das
janelas — mas **roda só no CI**, pela armadilha de ambiente já registrada.

A tela foi conferida em página temporária com dados injetados no cache, porque a
sessão do admin caiu e eu não faço login. Ficou visível o que importa: badge
"Valendo agora", a anotação "(vira o dia)" nas janelas de madrugada, e a taxa
desativada sem botão de interruptor.

### Fora de escopo, e vale registrar

A plataforma concorrente tem **lista de clientes isentos** por taxa. Não entrou
aqui — é outro eixo, e o pedido foi nome, regra, ativar, desativar e editar.

### Nada de inglês na tela

Sobravam valores de enum crus onde deveria haver português. O mais visível
estava na "Atividade auditável" do admin, imprimindo `Pedido #1163: CANCELLED.`
para quem opera a loja e não lê código.

Corrigidos cinco pontos:

| Onde                         | Antes                            |
| ---------------------------- | -------------------------------- |
| Atividade auditável (API)    | `Pedido #1163: CANCELLED.`       |
| Ofertas na atividade (API)   | `Oferta do pedido #X: DECLINED.` |
| Trilha de despacho no pedido | `DECLINED`                       |
| Linha do tempo da fatura     | `PENDING → OVERDUE`              |
| Selo de status da fatura     | `OVERDUE`                        |

`apps/api/src/common/status-labels.ts` guarda os rótulos do lado do servidor,
que é onde as frases de auditoria são montadas — traduzir no painel exigiria
devolver o enum junto com o texto e remontar a frase do outro lado.

A redação ali é de **evento**, no particípio, e não de estado: a linha do tempo
diz o que aconteceu naquele instante, enquanto o chip da fila diz onde o pedido
está agora. "Voltando à loja" é um bom chip e uma péssima entrada de log — no
histórico ele vira "entregue".

## Fila de implementação

Pedidos do responsável, em ordem de chegada:

1. **Horário de funcionamento** — bloquear envio de pedido fora da faixa.
2. **Ranking de entregadores** — depende de definir o que é "performance";
   volume, tempo médio e taxa de conclusão levam a comportamentos diferentes na
   rua, e a escolha é de negócio.
3. **Histórico de entregas** — como relatório, não só por pedido.
4. **Acompanhamento ao vivo mais próximo do concorrente** — ver abaixo.

### O que o concorrente tem no acompanhamento ao vivo

Das telas enviadas, o que dá para aproveitar:

- **agrupamento por empresa** com contadores coloridos por status, e a fila
  recolhível por grupo;
- **cronômetro por pedido** ao lado do horário de criação (já temos o
  cronômetro; falta o horário e o agrupamento);
- **"chegando..." / "menos de 1 min"** — estimativa de chegada, que exige rota e
  não só distância em linha reta;
- **menu de ações por pedido**: clonar, abrir completo, ver mapa, copiar link de
  rastreio, alterar valores, alterar tipo de serviço, alterar entregador,
  remover entregador, voltar para aceito, finalizar, cancelar;
- **filtros** por cliente, entregador e status, com ordenação;
- **painel de atividade ao vivo** sobreposto ao mapa, com o texto já em
  português e ligado ao pedido;
- **rotulagem no mapa** com o número do pedido no marcador.

Vale registrar o que **não** dá para copiar direto: o "Roteirizador" deles é
otimização de rota multi-parada, um problema de porte próprio, e está marcado
como BETA na tela deles.

## Atualização — 2026-08-22: horário de funcionamento

Primeiro item da fila. Fora do horário, a loja não consegue enviar pedido.

**Uma faixa por intervalo.** Um dia com pausa de almoço tem duas linhas —
08:00–12:00 e 13:30–18:00 — e é assim que se fecha o meio do dia sem inventar um
campo de "intervalo". Dia sem faixa nenhuma é dia fechado.

**Lista vazia significa ABERTA, não fechada.** Quem ainda não configurou não
pode ter os pedidos recusados por omissão. Quem liga o bloqueio é um interruptor
próprio em `PlatformSettings`, desligado por padrão, e ele existe justamente
para essa decisão ser explícita.

### A janela virou módulo compartilhado

A lógica de "esta faixa cobre este minuto?" já existia nas taxas adicionais, com
a parte difícil — a virada da meia-noite — resolvida e testada. Foi extraída
para `apps/api/src/common/time-window.ts` antes de escrever a segunda cópia. Os
17 testes das taxas passam sem alteração, o que é a prova de que a extração
preservou o comportamento.

### A recusa vira instrução

Uma mensagem que diz só "estamos fechados" deixa a loja adivinhando. O erro
informa quando abre: _"A operação está fora do horário de funcionamento. Abre
amanhã às 08:00."_ A varredura anda sete dias a partir de hoje e devolve a
primeira abertura à frente, dizendo "hoje", "amanhã" ou o nome do dia.

### Pedido agendado é avaliado pelo horário AGENDADO

Não pelo de agora. Uma loja que marca entrega para amanhã às 10h precisa
conseguir fazer isso hoje à noite — que é justamente quando ela tem tempo de
programar.

### Um bug que o teste pegou

Ao acrescentar `businessHoursEnabled` ao upsert de configurações, a linha caiu
no ramo errado: atualizar só o raio de retorno passava a **desligar o horário de
funcionamento** junto. O teste de atualização parcial acusou na hora.

### Verificação

365 testes unitários (15 novos só do horário), typecheck, lint e os 4 builds. Um
e2e novo cobre o CRUD e o bloqueio de ponta a ponta — a janela do teste é
montada a partir do instante atual, com uma faixa de um minuto no dia seguinte,
para não depender da hora em que o CI roda.

A tela ainda **não foi conferida no navegador**: a sessão do admin caiu e eu não
faço login.

### O que travava o CI: `app.close()` que nunca rodava

O passo de e2e ficou pendurado por mais de vinte minutos em `ac924e8`, sem
falhar nem terminar. A causa estava no `afterAll` do teste novo: a limpeza de
dados lançava — chave estrangeira impedindo apagar uma entrega que ainda tinha
oferta e histórico apontando para ela — e `app.close()` nunca era alcançado.

Sem o fechamento, o Jest fica esperando para sempre pelo servidor Nest, pelo
Socket.IO e pelas filas do BullMQ. O sintoma é um passo de CI que não termina,
não um teste vermelho, e por isso é mais difícil de ler.

A correção tem duas partes:

1. **`app.close()` vai em `finally`.** Qualquer erro na limpeza deixa de
   sequestrar o encerramento. Vale como regra para todo e2e novo.
2. **Apagar filhos antes dos pais** — histórico, ofertas e endereços da entrega
   antes da entrega.

Confirmado localmente: a suíte do horário passa em 3,7s e o Jest encerra
sozinho, **sem `--forceExit`**. Um `--forceExit` teria escondido o problema em
vez de resolvê-lo.
