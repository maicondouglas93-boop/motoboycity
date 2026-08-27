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

## Atualização — 2026-08-22: desempenho do entregador

Segundo item da fila, e a pergunta que eu tinha feito estava errada.

Eu perguntei qual critério de "performance" usar — volume, tempo ou taxa de
conclusão. **Escolher um número único embute um incentivo**, e essa escolha não
deveria estar no código: ranquear por volume faz o motoboy correr e recusar
corrida ruim; por tempo, idem. A resposta certa é mostrar as medidas lado a
lado, com colunas ordenáveis, e devolver a escolha para quem opera.

### As quatro medidas

| Coluna      | O que mede                                                     |
| ----------- | -------------------------------------------------------------- |
| Concluídas  | volume, sem juízo de valor                                     |
| Conclusão   | das que ele assumiu e encerraram, quantas terminaram entregues |
| Aceite      | das ofertas recebidas, quantas ele aceitou                     |
| Tempo médio | do aceite até a conclusão, com o denominador à vista           |

### Três decisões que mudam o número

**Entrega em andamento não conta como falha.** O denominador da taxa de
conclusão são as corridas que encerraram — concluída, não entregue, cancelada
depois do aceite. Contar o que está na rua puniria quem está trabalhando no
instante do relatório.

**Nulo não é zero.** Sem corrida encerrada, a taxa de conclusão é `—`, não 0%.
Zero por cento diria que ele falhou em tudo; o travessão diz que não houve o que
medir. A diferença importa para quem vai cobrar alguém por esse número.

**Quem só recusa aparece.** Um entregador sem entrega nenhuma mas com ofertas
recebidas entra na lista com 0% de aceite — é justamente o caso que o relatório
existe para revelar.

O tempo médio mostra entre parênteses quantas entregas entraram na conta, para
ninguém confundir média com cobertura.

Onze testes no módulo puro. Na tela, ordenar por coluna diferente reordena de
verdade — conferido no navegador, inclusive com o tempo médio invertendo o
sentido (menor é melhor) e os nulos indo para o fim em qualquer ordenação.

## Atualização — 2026-08-22: histórico de entregas

Último item da fila de relatórios, e o menor deles — porque o backend já
existia.

`GET /deliveries` já aceitava período, status, empresa e entregador, e o admin
já tinha acesso. Não entrou endpoint novo: a lacuna era só a tela. Vale como
lembrete de olhar o que existe antes de construir.

### O que faltava mesmo era exportar

O painel não tinha exportação em lugar nenhum, e é isso que separa um relatório
de uma tela. `apps/admin-web/src/lib/csv.ts` resolve os três detalhes que
decidem se o arquivo abre ou vira uma coluna só no Excel brasileiro:

1. **separador ponto e vírgula** — o Excel em português usa a vírgula como
   separador decimal, então um CSV com vírgula abre tudo numa coluna;
2. **BOM no início** — sem ele o Excel lê como Latin-1 e "João" vira "JoÃ£o";
3. **aspas dobradas** — um campo com aspas quebra a linha inteira sem isso.

Os números vão com vírgula decimal e **sem** "R$": com o símbolo na célula, a
planilha trata como texto e nenhuma soma funciona do outro lado.

Conferido no navegador com campos que quebram um CSV ingênuo: empresa com ponto
e vírgula no nome, observação com aspas, e texto com quebra de linha.

### Um campo que passou a aparecer

`DeliveryListItem` ganhou `surchargeLabel` e `surchargeValue`. Eles já estavam
congelados na entrega desde as taxas configuráveis, mas não eram expostos na
listagem — e são justamente o que explica por que aquele pedido custou mais.

## Atualização — 2026-08-22: acompanhamento ao vivo, primeira leva

Da lista do concorrente, os dois itens de melhor valor por custo.

### Horário de criação ao lado do cronômetro

São duas medidas de tempo que respondem perguntas diferentes: a **hora** diz
quando o pedido entrou, o **cronômetro** diz há quanto tempo ele está parado
neste estado. Só o cronômetro não deixa remontar a fila; só a hora não mostra
pressão. Entrou nos dois painéis.

`src/lib/operation-clock.ts` formata em `America/Sao_Paulo` fixo, e não no fuso
do navegador: relatórios, janelas de taxa e horário de funcionamento são todos
avaliados nesse fuso, e um operador acessando de outro lugar veria a fila com
um horário que não bate com o resto do sistema.

### Fila agrupada por empresa

A fila do admin agrupava só por status. As duas lentes respondem perguntas
diferentes:

- **por status** — o que está travado agora;
- **por empresa** — algum cliente está sendo mal atendido.

A segunda é a que faz o telefone tocar, e a lista por status não a mostra porque
espalha os pedidos de uma mesma loja por várias seções. Virou uma alternância,
não uma substituição.

Os grupos vêm ordenados por tamanho da fila — a loja com mais pedidos é a que
corre mais risco de atraso, e precisa estar no alto sem ninguém procurar. Cada
grupo traz contadores por status, coloridos pelo **mesmo mapa** dos chips: a cor
ali significa a mesma coisa que na fila, ou vira decoração e o olho para de
confiar nela.

Dentro do grupo, a linha deixa de repetir o nome da empresa — que já está no
cabeçalho — e mostra o motoboy no lugar. Numa tela densa, essa largura vale
mais.

### O menu de ações NÃO é barato, e vale registrar por quê

O concorrente tem onze ações por pedido. Cruzando com os endpoints existentes:

| Ação                                              | Situação                                                   |
| ------------------------------------------------- | ---------------------------------------------------------- |
| Abrir completo, Ver mapa                          | já existem como link                                       |
| Cancelar                                          | endpoint existe                                            |
| Clonar                                            | existe, mas no painel da empresa — o admin não cria pedido |
| Copiar link de rastreio                           | **não existe** rastreio público                            |
| Alterar valores, tipo de serviço, entregador      | **nenhum endpoint**                                        |
| Remover entregador, Voltar para aceito, Finalizar | **nenhum endpoint**                                        |

Sete das onze precisam de endpoint novo, com regras de transição de estado e
auditoria — não cabem na fatia "barato e de alto uso". Ficam para uma decisão
própria sobre quais transições manuais a operação realmente quer permitir: cada
uma delas é o admin sobrescrevendo o que aconteceu na rua.

## Atualização — 2026-08-22: intervenções manuais do admin

Das sete ações que o concorrente tem e nós não tínhamos, foram feitas as duas
que cobrem os casos reais: **trocar entregador** e **finalizar manualmente**.

### O limite de ambas é o mesmo: dinheiro já creditado

O repasse nasce em `COMPLETED`, com chave de idempotência por entrega. Isso
define exatamente o que é permitido:

- **trocar entregador** só em `ACCEPTED`, `COLLECTED`, `DELIVERED` e `FAILED` —
  estados em que a entrega tem motoboy e o repasse ainda não existe. Em
  `COMPLETED` o crédito já está na carteira do antigo, e trocar o nome no pedido
  deixaria o dinheiro com quem não fez a entrega;
- **finalizar manualmente** só em `DELIVERED` e `FAILED` — os estados que estão
  esperando uma confirmação que o motoboy não deu.

Desfazer ou transferir um crédito lançado é outra operação, com estorno e trilha
própria, e não cabe num menu de contexto.

### Os casos que elas resolvem

**Trocar entregador**: o motoboy quebrou a moto, passou mal ou sumiu. Cancelar e
recriar destruiria o número do pedido e a hora de criação — que é o que a loja
usa para conversar com o cliente.

**Finalizar manualmente**: ele entregou e não apertou "voltei à loja". O pedido
fica parado em `DELIVERED` para sempre e **o repasse dele fica preso junto**.
Faz o mesmo que `completeReturn`, inclusive creditar, mas sem a checagem de
proximidade — o ponto é justamente que ninguém confirmou no lugar certo.

### Motivo obrigatório

As duas exigem uma justificativa de pelo menos cinco caracteres, gravada no
histórico com o nome de quem fez. Sem isso a auditoria mostra que alguém mudou o
pedido e não mostra por quê, que é a pergunta de quem for conferir depois.

Por causa disso elas ficam **na página do pedido**, não num menu de contexto na
fila: uma ação que pede justificativa escrita não cabe num menu que some quando
o mouse sai de cima.

### Um detalhe do histórico

A troca de entregador grava `fromStatus` igual a `toStatus` de propósito. Não
foi uma transição de estado — foi uma intervenção dentro do mesmo estado, e a
trilha precisa dizer isso.

`publishDeliveryUpdate` deixou de ser privado: as intervenções vivem em outro
módulo e precisam avisar as telas do mesmo jeito. Duplicar a publicação criaria
dois caminhos para o mesmo evento, e um deles envelheceria.

### Verificação

Vinte e um testes cobrindo cada estado permitido e recusado nas duas ações, o
não-crédito na troca, o crédito na finalização, e a chave de idempotência
virando conflito legível quando dois admins apertam ao mesmo tempo.

## Atualização — 2026-08-22: vitrine de pedidos disponíveis

O responsável explicou como funciona no concorrente: _"um pedido que ninguém
aceitou fica lá, para alguém entrar e aceitar"_. É o complemento do empurrão,
não um substituto — e fecha um buraco real do nosso despacho.

### O buraco que existia

`dispatchDelivery` oferta a um motoboy por vez, com prazo. Quando todo elegível
já recebeu, ele faz `if (!nextDriverId) return;` — **retorna em silêncio**.

Pior: `excludeDriverIds` tira da próxima rodada quem já recebeu. Então o pedido
só voltava a se mexer se aparecesse um motoboy **novo**; quem deixou a oferta
expirar às 11h nunca mais o via. O botão "chamar de novo" que eu tinha feito era
um contorno manual disso.

### Como a vitrine resolve

`GET /delivery-offers/available` lista os pedidos em `AWAITING_DRIVER`, sem
entregador e **sem oferta pendente** — se alguém está com o pedido na mão agora,
ele ainda não está livre. Filtra por região e pelas modalidades do motoboy, e
não aparece para quem já está com uma corrida, que é a mesma regra do despacho
automático.

`PATCH /delivery-offers/available/:id/claim` assume. A proteção contra dois
assumindo ao mesmo tempo é a mesma do aceite de oferta: `updateMany` condicional
e checagem de `count` — quem chega em segundo recebe conflito, em vez de os dois
acharem que pegaram. Lote é assumido inteiro ou nenhum.

De propósito, a exclusão **não** se aplica aqui: deixar uma oferta passar não é
recusar aquele pedido para sempre.

### Na tela do motoboy

`AvailableDeliveriesScreen`, no menu logo abaixo da Carteira — é o que ele abre
quando quer trabalhar e não chegou oferta nenhuma. Puxar para atualizar, e o
conflito ao assumir vira aviso com recarga da lista, não erro.

Pedido sem destino conhecido mostra "destino definido na entrega" e "valor
calculado na entrega" em vez de zero: mostrar zero mentiria sobre quanto rende.

### Não verificado no aparelho

A tela **não foi testada num dispositivo**. O app instalado no celular é uma
compilação antiga, e subir Metro e recompilar seria um desvio longo. O backend
tem oito testes cobrindo filtro, corrida entre dois motoboys e lote parcial; a
tela segue os padrões das telas vizinhas, mas isso é argumento, não prova.

## Atualização — 2026-08-23: acabamento premium do painel administrativo

O responsável pediu uma revisão exclusivamente visual do `admin-web`: as telas
internas ainda pareciam preto e branco mesmo depois da primeira aplicação da
marca. O recorte preservou consultas, contratos, estado, handlers e regras de
negócio; foram alterados apenas tokens, classes e composição visual.

### Direção visual

- Azul-petróleo passou a estruturar navegação, foco, links e ações
  administrativas. O laranja oficial continua reservado para entregas em
  movimento e seus gráficos, sem perder o significado operacional registrado
  anteriormente.
- O fundo ganhou profundidade com gradientes e uma malha muito sutil; cards usam
  borda clara, sombra em camadas e uma linha de luz, mantendo leitura clara em
  telas densas.
- `Card`, `Button`, `Input`, `Select`, `Table`, `Badge`, `Checkbox`, `Tabs` e
  menus foram refinados na fonte. Isso aplica o mesmo acabamento a clientes,
  entregadores, pedidos, financeiro, faturas, relatórios e configurações sem
  duplicar estilos por rota.
- Métricas receberam uma superfície própria, números tabulares e acento de
  marca. Fichas de clientes/entregadores, filas, mapas, cards de configuração e
  o widget de atividade receberam estados de hover, foco e profundidade
  específicos.
- Login e topbar usam o mesmo gradiente grafite/azul-petróleo. O layout continua
  fluido; os breakpoints e a segunda linha de navegação existentes foram
  preservados.

Arquivos principais: `apps/admin-web/src/app/globals.css`, layout autenticado,
login, home, listas de clientes/entregadores/pedidos, componentes de layout,
operações, relatórios, `stat-card` e os primitives em `components/ui/`.

### Verificação

| Comando / fluxo                                           | Resultado                          |
| --------------------------------------------------------- | ---------------------------------- |
| `pnpm --filter @motoboycity/admin-web typecheck`          | aprovado                           |
| `pnpm --filter @motoboycity/admin-web lint`               | aprovado                           |
| `pnpm --filter @motoboycity/admin-web run build`          | aprovado; 23 rotas geradas         |
| `pnpm typecheck`                                          | aprovado nos 8 workspaces          |
| `pnpm lint`                                               | aprovado nos 8 workspaces          |
| Hot reload e GET das rotas principais em `localhost:3001` | compilação aprovada; respostas 200 |
| `git diff --check -- apps/admin-web`                      | aprovado                           |

### Limitação e próximo passo

O navegador integrado não estava disponível nesta sessão. As capturas enviadas
pelo responsável foram a referência de antes; não foi possível produzir uma
captura automatizada de depois. Próximo passo concreto: conferir visualmente em
desktop, tablet e celular com uma sessão autenticada e ajustar somente detalhes
de densidade/contraste apontados pelo responsável, sem misturar alterações de
lógica neste recorte.

## Atualização — 2026-08-23: acabamento premium do painel da empresa

Depois do `admin-web`, o responsável pediu a mesma evolução exclusivamente
visual no `company-web`. Consultas, mutations, contratos, estado, handlers,
rotas e regras de negócio foram preservados; o recorte altera tokens, classes e
composição visual.

### Direção visual

- Azul-petróleo/verde estrutura navegação, títulos, links, filtros e superfícies.
  O laranja oficial continua reservado à ação principal que põe o motoboy em
  movimento e aos estados em que ele está na rua.
- O workspace ganhou malha discreta, luz ambiente e superfícies em camadas.
  Cards, métricas, formulários, listas, tabelas, menus, selects e modais usam
  bordas claras, sombras graduais, foco visível e cantos mais refinados.
- A topbar recebeu gradiente grafite/petróleo, navegação ativa estrutural e CTA
  laranja com maior presença. Os breakpoints e a navegação móvel em duas linhas
  foram mantidos.
- Login, cadastro e aprovação pendente agora compartilham um painel de marca com
  gradientes, textura sutil e formulário translúcido, sem alterar validação ou
  envio.
- Central operacional, filas, busca, seleção de pedido, formulário rápido,
  mapas, detalhe, indicadores, relatórios e faturas receberam acabamento
  específico. Marcadores e rotas dos mapas foram alinhados aos tokens do tema.
- O autocomplete injetado pelo Google também recebeu o mesmo tratamento visual.

Arquivos principais: `apps/company-web/src/app/globals.css`, layouts e páginas
públicas/autenticadas, componentes de layout/operação/pedidos, `stat-card` e os
primitives em `apps/company-web/src/components/ui/`.

### Verificação

| Comando / fluxo                                                                                        | Resultado                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @motoboycity/company-web typecheck`                                                     | aprovado                                                                                                                                                                           |
| `pnpm --filter @motoboycity/company-web lint`                                                          | aprovado                                                                                                                                                                           |
| `pnpm --filter @motoboycity/company-web run build`                                                     | aprovado; 11 rotas geradas                                                                                                                                                         |
| `pnpm lint`                                                                                            | aprovado nos 8 workspaces                                                                                                                                                          |
| `pnpm typecheck`                                                                                       | falhou apenas em alteração concorrente de `driver-app/src/lib/push.ts`: import de `@react-native-firebase/messaging` sem export default; o `company-web` foi aprovado isoladamente |
| GET de `/`, login, cadastro, aprovação, pedidos, indicadores, relatórios e faturas em `localhost:3000` | respostas 200                                                                                                                                                                      |
| API, admin e Metro (`3333`, `3001`, `8081`)                                                            | respostas 200 após reinício                                                                                                                                                        |
| `git diff --check -- apps/company-web`                                                                 | aprovado                                                                                                                                                                           |
| Guarda de diff para consultas, mutations, handlers, sessão e fetch                                     | nenhuma alteração lógica detectada                                                                                                                                                 |

### Limitação e próximo passo

O navegador integrado continuou indisponível, então a validação visual
automatizada não pôde ser feita. Os servidores estão ativos para conferência
manual. Próximo passo concreto: revisar com sessão autenticada em desktop e
celular e ajustar somente densidade/contraste a partir do feedback do
responsável.

## Atualização — 2026-08-23: refinamento da fila operacional do admin

O responsável comparou a fila agrupada por empresa com a interface de um
concorrente e apontou o problema principal no recorte estreito: cabeçalho
comprimido, cronômetro quebrando em várias linhas e excesso de cards aninhados.
O ajuste continuou estritamente na apresentação e usa somente campos que já
chegavam em `OperationalDeliveryItem`.

### O que mudou

- O cabeçalho da fila ganhou resumo de volume e alternância em largura inteira;
  a lente ativa agora usa o azul-petróleo estrutural, não o laranja reservado a
  entregas em movimento.
- Grupos por empresa ficaram mais legíveis, com ícone, quantidade de pedidos,
  contadores por status e um único contêiner para as linhas.
- Cada pedido ganhou trilho lateral na cor do status, horário de criação,
  cronômetro em pílula sem quebra, status, empresa/motoboy, modalidade, destino,
  distância, valor e indicação de retorno.
- A seleção existente do mapa/painel lateral passou a ter destaque visual na
  própria fila. Nenhuma consulta, mutation, handler ou contrato foi alterado.

Arquivos afetados:
`apps/admin-web/src/app/(app)/page.tsx` e
`apps/admin-web/src/components/operations/company-queues.tsx`.

### Verificação

| Comando / fluxo                                  | Resultado                         |
| ------------------------------------------------ | --------------------------------- |
| `pnpm --filter @motoboycity/admin-web typecheck` | aprovado                          |
| `pnpm --filter @motoboycity/admin-web lint`      | aprovado                          |
| `pnpm --filter @motoboycity/admin-web run build` | aprovado                          |
| Hot reload e GET de `localhost:3001/`            | compilação aprovada; resposta 200 |

O navegador integrado não estava conectado, então não houve captura
automatizada na largura de referência. O admin foi reiniciado em
`localhost:3001` para conferência manual. Próximo passo: validar a densidade
com dados reais nas duas lentes (`Por status` e `Por empresa`) e ajustar apenas
espaçamento ou truncamento se o responsável apontar algum caso extremo.

## Atualização — 2026-08-23: retenção terminal da fila operacional do admin

O responsável definiu uma política própria para a fila da página inicial do
`admin-web`: pedidos concluídos devem sair assim que o status mudar; cancelados
permanecem visíveis por 15 minutos; os demais estados continuam na fila até se
tornarem concluídos ou cancelados.

### Implementação

- `AdminOperationsService.overview()` solicita somente `CANCELLED` na janela
  terminal, com `statusChangedAt >= agora - 15 minutos` e sem teto por
  quantidade. Assim, um pico com mais de 20 cancelamentos não remove itens antes
  do prazo.
- `DeliveriesService.operations()` ganhou uma opção interna de janela terminal.
  O padrão existente — concluídos/cancelados, limitados aos 20 mais recentes —
  foi preservado para o endpoint consumido pelo `company-web`.
- Os contadores do admin agora zeram `COMPLETED` e contam em `CANCELLED` somente
  os itens ainda dentro da janela, acompanhando exatamente a fila visível.
- A lente `Por status` deixou de criar uma seção para concluídos e passou a
  listar todos os estados operacionais, incluindo cancelados ainda dentro dos
  15 minutos. O filtro também não oferece mais `COMPLETED`, pois esse estado não
  pertence à fila operacional.
- Não houve mudança de rota, payload, tipo compartilhado, schema Prisma ou
  persistência. Os registros continuam disponíveis no histórico; apenas a fila
  operacional do admin aplica a nova retenção.

Arquivos afetados:
`apps/api/src/admin/operations/admin-operations.service.ts`,
`apps/api/src/admin/operations/admin-operations.service.spec.ts`,
`apps/api/src/deliveries/deliveries.service.ts` e
`apps/api/src/deliveries/deliveries.service.spec.ts`, além de
`apps/admin-web/src/app/(app)/page.tsx`.

### Verificação

| Comando                                                                                                                                                | Resultado                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `pnpm --filter @motoboycity/api exec jest --runInBand src/admin/operations/admin-operations.service.spec.ts src/deliveries/deliveries.service.spec.ts` | aprovado; 2 suítes e 57 testes |
| `pnpm --filter @motoboycity/api typecheck`                                                                                                             | aprovado                       |
| `pnpm --filter @motoboycity/api lint`                                                                                                                  | aprovado                       |
| `pnpm --filter @motoboycity/admin-web typecheck`                                                                                                       | aprovado                       |
| `pnpm --filter @motoboycity/admin-web lint`                                                                                                            | aprovado                       |

Próximo passo concreto: confirmar manualmente, com sessão administrativa, que
um concluído sai no evento de atualização e que um cancelado desaparece ao
completar 15 minutos.

## Atualização — 2026-08-23: tabela de preços personalizada por empresa

O responsável pediu que o admin pudesse selecionar uma empresa e configurar
preços diferentes dos valores gerais. A regra confirmada ficou: uma tabela
ativa vinculada à empresa e modalidade tem prioridade; sem tabela própria, o
cálculo cai explicitamente para a tabela geral ativa da região da empresa.

### Persistência e migração

- `PricingTable.companyId` é opcional. Registros existentes permanecem com
  `null` e, portanto, continuam sendo tabelas gerais sem conversão de dados.
- A relation usa `ON DELETE RESTRICT`: apagar uma empresa não pode transformar
  silenciosamente seu preço personalizado em preço geral.
- Migration aditiva gerada pelo Prisma:
  `20260823210000_company_specific_pricing`. Ela adiciona a coluna nullable,
  dois índices e a foreign key; não altera nem remove dados existentes.
- A migration foi revisada e aplicada somente no Postgres local
  `motoboycity_dev` em `localhost:5434`. Nenhum ambiente compartilhado foi
  alterado.

Ordem segura para ambiente compartilhado: backup verificável, restauração em
cópia isolada de staging, `prisma migrate deploy`, deploy da API e depois do
admin-web. O schema é retrocompatível porque `companyId` nasce nullable.

Rollback de aplicação pode manter a coluna sem uso. Para rollback de banco,
primeiro desative/exporte e remova as linhas personalizadas; só então remova FK,
índices e coluna. Dropar apenas a coluna com linhas personalizadas ativas faria
esses valores perderem o escopo e não é um rollback seguro.

### Contrato e cálculo

- `CreatePricingTablePayload` aceita `companyId` opcional; o filtro de listagem
  também aceita empresa.
- `PricingTableItem` expõe `companyId` e `companyName`, sincronizados entre
  types, API client, controller e service.
- `PricingService.quote()` agora exige o `companyId`: consulta primeiro a
  tabela personalizada ativa da empresa e modalidade; se não encontrar,
  consulta a tabela geral (`companyId=null`) da mesma região e modalidade.
- Criação avulsa, lote e precificação tardia por GPS enviam a empresa dona da
  entrega ao cálculo. `totalValue`, `driverValue`, `platformValue` e retorno
  continuam passando pelo mesmo calculador e sendo congelados em `Delivery`.
- Criar uma nova versão desativa somente a tabela ativa do mesmo escopo. Uma
  tabela personalizada não desativa a geral nem a tabela de outra empresa.

### Admin web

Em `/configuracoes/tabela-de-precos`, o admin escolhe `Tabela geral` ou uma
empresa. O formulário cria os mesmos campos de preço no escopo escolhido e o
histórico abaixo mostra somente aquele escopo. A tela explica o fallback geral
quando a modalidade da empresa ainda não tem valor personalizado.

Arquivos principais: schema e migration Prisma; validações de create/list;
`packages/types/src/pricing.ts`; API client de pricing tables; controller,
service e testes administrativos; `PricingService`; três chamadas de cotação em
`DeliveriesService`; e a página de tabela de preços do admin.

### Verificação

| Comando / fluxo                                                                                                                                                                                    | Resultado                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `pnpm --filter @motoboycity/api exec prisma validate`                                                                                                                                              | aprovado antes e depois da mudança         |
| `pnpm --filter @motoboycity/validation build`                                                                                                                                                      | aprovado                                   |
| `pnpm --filter @motoboycity/api exec jest --runInBand src/admin/pricing-tables/admin-pricing-tables.service.spec.ts src/pricing/pricing.service.spec.ts src/deliveries/deliveries.service.spec.ts` | aprovado; 3 suítes e 75 testes             |
| `pnpm typecheck`                                                                                                                                                                                   | aprovado nos 8 workspaces                  |
| `pnpm lint`                                                                                                                                                                                        | aprovado nos 8 workspaces                  |
| `pnpm --filter @motoboycity/api run build`                                                                                                                                                         | aprovado                                   |
| `pnpm --filter @motoboycity/admin-web run build`                                                                                                                                                   | aprovado; 23 rotas                         |
| `prisma migrate deploy` no banco local                                                                                                                                                             | migration aplicada com sucesso             |
| GET de company, página de preços do admin, API e Metro                                                                                                                                             | HTTP 200 nos quatro serviços               |
| GET de `/admin/pricing-tables` sem token                                                                                                                                                           | HTTP 401, guarda administrativa preservada |
| `prisma migrate status` após reinício                                                                                                                                                              | 23 migrations; banco local atualizado      |

O navegador integrado não estava disponível (nenhuma instância conectada),
então ainda falta conferir o seletor com uma sessão administrativa real. Também
falta validar a migration por backup/restore em uma cópia de staging antes de
qualquer aplicação compartilhada.

## Atualização — 2026-08-23: fluxo visual progressivo para preços personalizados

A página administrativa de tabela de preços foi reorganizada sem mudanças de
API, persistência ou regra de cálculo. O primeiro passo agora apresenta duas
opções visuais: `Tabela geral` e `Criar preços personalizados`. Ao escolher a
segunda opção, a tela abre o seletor de empresa; os campos de modalidade e
valores aparecem somente depois que uma empresa é selecionada.

O formulário foi disposto em grade, identifica a empresa selecionada e usa a
ação explícita `Salvar preços personalizados`. Enquanto nenhuma empresa estiver
selecionada, o formulário e o histórico ficam ocultos para evitar que uma tabela
geral seja criada por engano. A tabela geral continua disponível e preserva o
mesmo comportamento anterior.

Arquivo afetado:
`apps/admin-web/src/app/(app)/configuracoes/tabela-de-precos/page.tsx`.

### Verificação

| Comando / fluxo                                                              | Resultado          |
| ---------------------------------------------------------------------------- | ------------------ |
| `pnpm --filter @motoboycity/admin-web typecheck`                             | aprovado           |
| `pnpm --filter @motoboycity/admin-web lint`                                  | aprovado           |
| compilação incremental do Next.js e GET de `/configuracoes/tabela-de-precos` | aprovado; HTTP 200 |

Próximo passo concreto: conferir visualmente a seleção da empresa e o estado
responsivo com uma sessão administrativa no navegador.

## Atualização — 2026-08-23: Secretária Virtual administrativa, somente leitura

Foi adicionada ao `admin-web` a rota `/secretaria-virtual`, com chat em linguagem
natural e atalhos para resumo diário, faturamento, cancelamentos e motoboys
online. O contrato compartilhado usa `POST /admin/virtual-secretary/chat`, exige
JWT + `AdminOnlyGuard`, aceita uma mensagem de até 2.000 caracteres e no máximo
oito mensagens de histórico. Há limite específico de 10 requisições por minuto.

A integração com Gemini roda exclusivamente na API usando `@google/genai`. A
chave é lida de `GEMINI_API_KEY`; modelo e timeout são configuráveis e os padrões
são `gemini-3.6-flash` e 12 segundos. Sem chave, somente a rota do chat responde
`503`; o restante da API continua operacional. A chave fornecida na conversa
foi tratada como exposta: não foi repetida, testada nem salva e precisa ser
revogada antes de uma nova ser configurada no secret manager.

Toda resposta factual é obrigada a selecionar uma ferramenta allowlisted antes
de responder. Há ferramentas de resumo, relatório por período, operação atual,
busca de pedidos, empresas e motoboys. Elas reutilizam services do domínio e
devolvem no máximo 5/10 itens reduzidos, sem CPF, telefone, e-mail, endereço,
coordenadas, destinatário ou observações. Não existe ferramenta de escrita;
pedidos de alteração usam a resposta institucional de modo somente leitura.

A auditoria append-only usa `virtual_secretary_audits`. Ela registra
administrador, request id, ferramenta, parâmetros/resultados já reduzidos,
status e duração. O chat guarda apenas comprimentos e nomes das ferramentas;
nenhum texto de conversa ou secret é persistido.

### Persistência e migration

`20260823161747_virtual_secretary_audit` cria enum, tabela, índices e FK. Ao
gerar essa migration no banco local, o Prisma detectou que o default histórico
de `surcharges.updatedAt` existia no SQL, mas não no schema, e incluiu um `DROP
DEFAULT` fora do recorte. A migration já aplicada não foi editada. O schema foi
alinhado ao comportamento histórico e a migration compensatória
`20260823162007_preserve_surcharge_updated_at_default` restaura imediatamente
`DEFAULT CURRENT_TIMESTAMP`. Ambas foram aplicadas apenas em
`motoboycity_dev`; nenhum ambiente compartilhado foi alterado.

Ordem segura de deploy: rotacionar/configurar o secret, backup verificável,
restore em staging isolado, `prisma migrate deploy`, API e admin-web. Rollback da
aplicação pode manter a tabela sem uso; rollback do banco deve preservar o
default de `surcharges.updatedAt`.

Arquivos principais: `apps/api/src/ai/`,
`apps/api/src/admin/virtual-secretary/`, services administrativos com exports e
buscas reduzidas, `packages/{types,validation,api-client}`, migration/schema
Prisma, página/nav do admin e `docs/SECRETARIA_VIRTUAL.md`.

### Verificação executada até este registro

| Comando                                                                    | Resultado                                                                                                                                                 |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma format`, `prisma validate`, `prisma generate`                      | aprovados; generate exigiu parar temporariamente a API no Windows                                                                                         |
| `pnpm --filter @motoboycity/validation build`                              | aprovado                                                                                                                                                  |
| typecheck de types, validation, api-client, API e admin-web                | aprovado                                                                                                                                                  |
| Jest focado em período, allowlist/PII, guardas, service e Gemini sem chave | 5 suítes, 10 testes aprovados                                                                                                                             |
| lint de API e admin-web                                                    | aprovado                                                                                                                                                  |
| build da API e do admin-web                                                | aprovado; rota `/secretaria-virtual` incluída                                                                                                             |
| HTTP sem token / admin sem chave nova                                      | `401` / `503` controlado                                                                                                                                  |
| health de admin-web, company-web, API e Metro                              | HTTP 200 nos quatro serviços após reinício do Metro travado                                                                                               |
| inspeção visual automatizada                                               | pendente; nenhum navegador estava conectado à sessão                                                                                                      |
| `pnpm typecheck`                                                           | aprovado nos 8 workspaces                                                                                                                                 |
| `pnpm lint`                                                                | API, webs e pacotes aprovados; falhou apenas no driver-app por configuração preexistente do ESLint 8 (`jest/globals` desconhecido)                        |
| `pnpm audit --prod --audit-level high`                                     | encontrou 3 altos e 2 moderados em dependências transitivas preexistentes de React Native/Metro, Prisma e Firebase; nenhum caminho vem de `@google/genai` |

Próximo passo concreto: rotacionar a chave exposta, configurar a nova no backend
e então executar uma consulta real supervisionada. A revisão visual em navegador
também fica pendente até uma instância estar conectada.

## Atualização — 2026-08-23: modelo Gemini atualizado e diagnóstico de créditos

Após o usuário configurar uma nova chave diretamente em `apps/api/.env`, a API
foi reiniciada e o provedor foi consultado sem expor o secret. O modelo anterior,
`gemini-2.5-flash`, respondeu `404` informando que não está mais disponível para
novos usuários e recomendando `gemini-3.6-flash`.

Com autorização explícita, somente a linha `GEMINI_MODEL` do ambiente local foi
alterada para `gemini-3.6-flash`; a linha da chave não foi modificada nem exibida.
O mesmo padrão foi atualizado no fallback do `GeminiService`, nos dois arquivos
`.env.example` e em `docs/SECRETARIA_VIRTUAL.md`. A API foi reiniciada e o health
permaneceu em HTTP 200.

A chamada direta com `gemini-3.6-flash` confirmou que a chave chega ao Google,
mas o projeto respondeu `429 RESOURCE_EXHAUSTED`: os créditos pré-pagos estão
esgotados. Por isso, o chat administrativo ainda devolve o `502` controlado até
que créditos sejam adicionados no Google AI Studio ou seja configurada uma chave
de outro projeto elegível com cota. O arquivo temporário usado no diagnóstico
seguro foi removido.

### Verificação

| Comando / fluxo                                                                | Resultado                                                                               |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `GET /health` após reinício                                                    | HTTP 200                                                                                |
| login administrativo + `POST /admin/virtual-secretary/chat`                    | autenticação aprovada; provedor devolveu `429` e a rota converteu para `502` controlado |
| `pnpm --filter @motoboycity/api run typecheck`                                 | aprovado                                                                                |
| Jest focado em `src/admin/virtual-secretary` e `src/ai/gemini.service.spec.ts` | 5 suítes e 10 testes aprovados                                                          |

Próximo passo concreto: regularizar os créditos/prepay do projeto Gemini ou
configurar uma chave de projeto com cota e repetir a consulta real. Nenhuma nova
alteração de código é necessária para esse reteste.

## Atualização — 2026-08-23: nova chave Gemini validada

O usuário substituiu diretamente `GEMINI_API_KEY` no ambiente local da API. O
processo NestJS foi reiniciado sem ler, registrar ou exibir o secret. Após o
reinício, `GET /health` respondeu HTTP 200 e uma consulta administrativa real em
`POST /admin/virtual-secretary/chat` respondeu HTTP 200, retornou texto e chamou
a ferramenta allowlisted `gerar_resumo_administrativo`.

O erro anterior de créditos esgotados não se repetiu com a nova chave. Nenhum
arquivo de código, contrato ou banco foi alterado neste reteste; somente o
processo da API foi reiniciado e o resultado operacional foi validado.

## Atualização — 2026-08-23: timeout ampliado e cota Gemini novamente esgotada

Uma pergunta real de cancelamentos executou `consultar_relatorio_periodo` em 9
ms, mas a segunda chamada ao Gemini ultrapassou o limite local anterior de 12
segundos. Com autorização explícita, somente `GEMINI_TIMEOUT_MS` no
`apps/api/.env` local foi alterado para 30 segundos; a chave não foi lida,
modificada nem exibida. A API foi reiniciada e `GET /health` permaneceu em HTTP 200.

No reteste seguinte, o provedor recusou a chamada antes da execução da ferramenta.
Um diagnóstico direto e sanitizado confirmou `429 RESOURCE_EXHAUSTED` com a
mensagem de que os créditos pré-pagos do projeto estão esgotados. Portanto, o
timeout local está corrigido, mas o chat continuará retornando o `502` controlado
até que o saldo/prepay desse projeto seja regularizado ou uma chave de projeto
com cota seja configurada. O arquivo temporário de diagnóstico foi removido e
nenhum secret foi persistido ou impresso.

## Atualização — 2026-08-23: Secretária Virtual migrada de Gemini para Groq

A integração da Secretária Virtual foi migrada integralmente para a Groq após o
usuário configurar `GROQ_API_KEY` diretamente em `apps/api/.env`. O valor do
secret não foi exibido, copiado nem alterado pelo agente; foi verificada somente
a presença de um valor não vazio.

`@google/genai` foi removido e `groq-sdk@1.5.0` foi adicionado. O novo
`GroqService` usa Chat Completions com `openai/gpt-oss-120b` como modelo padrão,
timeout padrão de 30 segundos, retries automáticos desabilitados e logs do SDK
desligados. Logs próprios registram somente etapa, modelo, status, classe do erro
e duração. `429`, timeout, autenticação/modelo e falhas gerais são convertidos em
respostas controladas sem incluir pergunta, resultado ou detalhe do provedor.

A política de segurança foi preservada: a primeira rodada exige ferramenta com
`tool_choice: required`; rodadas adicionais são sequenciais, chamadas paralelas
ficam desabilitadas e o total continua limitado a três ferramentas. Argumentos
JSON passam por parsing defensivo e pela validação Zod/allowlist existente. Não
foi adicionada ferramenta de escrita, e rota, payload, resposta, auditoria,
contratos compartilhados e persistência não mudaram. Não há migration associada
a esta troca.

As declarações das ferramentas agora usam o tipo interno e neutro
`AiToolDeclaration`. Injeção, testes e selo visual foram atualizados para Groq;
os exemplos usam `GROQ_API_KEY`, `GROQ_MODEL=openai/gpt-oss-120b` e
`GROQ_TIMEOUT_MS=30000`. A documentação inclui rate limits, tratamento de erros
e recomendação de avaliar Zero Data Retention em ambientes com exigência maior
de privacidade.

### Verificação

| Comando / fluxo                                                 | Resultado                                                                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm --filter @motoboycity/api run typecheck`                  | aprovado                                                                                                                                                           |
| Jest focado em `src/ai` e `src/admin/virtual-secretary`         | 5 suítes e 14 testes aprovados                                                                                                                                     |
| ESLint focado na API e página da Secretária                     | aprovado, zero warnings                                                                                                                                            |
| `pnpm --filter @motoboycity/admin-web run typecheck`            | aprovado                                                                                                                                                           |
| `pnpm typecheck`                                                | aprovado nos 8 workspaces                                                                                                                                          |
| `pnpm lint`                                                     | aprovado nos 8 workspaces                                                                                                                                          |
| builds de API e admin-web                                       | aprovados; 20 rotas no admin, incluindo `/secretaria-virtual`                                                                                                      |
| `GET /health` após reinício                                     | HTTP 200                                                                                                                                                           |
| login + saudação neutra em `POST /admin/virtual-secretary/chat` | HTTP 200; Groq chamou `responder_sem_consulta` e devolveu a resposta esperada, sem enviar dados operacionais                                                       |
| health final dos serviços                                       | company-web 200, admin-web 200, API 200 e Metro 200; uma árvore antiga `react-native start` travada foi identificada por PID/command line, encerrada e substituída |
| `pnpm audit --prod --audit-level high`                          | continuam 3 altos e 2 moderados transitivos preexistentes em React Native/Metro e Prisma; `groq-sdk@1.5.0` não adiciona dependências transitivas                   |
| limpeza pós-validação                                           | cache regenerável `.turbo` de aproximadamente 27 GB removido após o disco chegar a zero bytes livres; cerca de 27,2 GB liberados, sem remover código ou dados      |

O navegador integrado continuou indisponível (nenhuma instância conectada), mas
o build contém o novo selo `Groq` e o admin local responde HTTP 200. A API ficou
rodando em modo desenvolvimento na porta 3333. Próximo passo concreto: validar
visualmente a página em uma sessão administrativa e, mediante decisão explícita
sobre envio de dados operacionais ao provedor, executar uma consulta factual
supervisionada. Para produção, configurar o secret no gerenciador do ambiente e
avaliar a política Zero Data Retention da organização Groq.

## Atualização — 2026-08-23: cadastro de entregador pelo painel administrativo

A aba **Entregadores** do admin agora possui o fluxo “Cadastrar entregador”. O
formulário coleta dados pessoais, PIX, senha inicial, região e modalidades. A
confirmação da senha existe somente na interface e nunca é enviada; o backend
recebe o contrato estrito `CreateAdminDriverPayload`.

Foi criada a rota `POST /admin/drivers`, protegida por `JwtAuthGuard` e
`AdminOnlyGuard`, e a rota auxiliar
`GET /admin/drivers/registration-options`, que devolve somente regiões ativas.
O cliente continua buscando as modalidades pelo endpoint administrativo já
existente. Após sucesso, o painel invalida apenas a query da lista de
entregadores e mostra a confirmação do cadastro.

O modal usa validação Zod uniforme (`noValidate`), associa cada mensagem ao
campo correspondente, move o foco para o primeiro erro e traduz `issues` da
API para erros por campo. Falhas ao carregar regiões ou modalidades oferecem
“Tentar novamente”. Durante o envio, cancelar e fechar ficam desabilitados para
evitar estado ambíguo.

`AuthService.registerDriver` passou a aceitar opções internas de região e
modalidades sem mudar o payload da rota pública do aplicativo. Região ativa,
modalidades ativas e unicidade são revalidadas no servidor. `User`, `Driver` e
`DriverServiceType` são gravados numa transação `SERIALIZABLE`; a primeira
modalidade é principal. Corrida de unicidade `P2002` vira HTTP 409 e conflito de
serialização `P2034` tem até três tentativas controladas.

O cadastro administrativo não autoaprova: mantém os defaults `PENDING`,
`ACTIVE` e `UNAVAILABLE`, e a aprovação permanece separada. Não foram incluídos
veículo ou documentos, pois esses uploads/revisões ainda não fazem parte do
cadastro atual. Também não foi criada auditoria persistente do administrador que
originou o cadastro; fazer isso exige decisão de produto e migration aditiva
própria. Não houve alteração de schema Prisma nem migration neste recorte.

Arquivos principais: `packages/validation/src/admin/create-driver.schema.ts`,
`packages/types/src/driver.ts`, `packages/api-client/src/admin-drivers.ts`,
`apps/api/src/auth/auth.service.ts`, `apps/api/src/admin/drivers/`,
`apps/admin-web/src/components/drivers/create-driver-dialog.tsx`,
`apps/admin-web/src/components/ui/dialog.tsx` e
`apps/admin-web/src/app/(app)/entregadores/page.tsx`.

### Verificação

| Comando / fluxo                                                         | Resultado                                                                                                                                            |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| typecheck de types, validation, api-client, API e admin-web             | aprovado                                                                                                                                             |
| ESLint focado nos arquivos alterados da API e do admin-web              | aprovado                                                                                                                                             |
| Jest focado em `auth.service.spec.ts` e `admin-drivers.service.spec.ts` | 2 suítes e 40 testes aprovados                                                                                                                       |
| build da API                                                            | aprovado                                                                                                                                             |
| build do admin-web                                                      | aprovado; rota `/entregadores` gerada                                                                                                                |
| E2E de `admin-drivers.e2e-spec.ts`                                      | cobertura ampliada para guardas, criação, hash, configuração inválida e duplicidade; não executado localmente por exigir PostgreSQL e Redis isolados |
| API/admin após reinício                                                 | `GET /health` 200, `/entregadores` 200 e as duas rotas novas sem token retornaram 401                                                                |
| inspeção visual automatizada                                            | pendente; nenhuma instância de navegador estava conectada à sessão                                                                                   |

Próximo passo concreto: executar esse E2E no ambiente isolado da CI e validar o
modal visualmente com sessão administrativa antes do deploy conjunto de
validation, types, api-client, API e admin-web.

### Correção de compatibilidade — região ausente no cache do admin

Depois da inclusão de `region` em `AdminDriverListItem`, o Fast Refresh podia
preservar no TanStack Query uma resposta de `GET /admin/drivers` obtida antes da
mudança. Esses itens antigos não possuíam `region`, e o acesso direto a
`driver.region.name` derrubava toda a página antes do refetch terminar.

A renderização agora usa `driver.region?.name ?? 'Região não informada'`. O
contrato compartilhado continua exigindo região porque a relação é obrigatória
no Prisma e a API atual sempre a devolve; o fallback existe somente para cache,
rolling deploy ou resposta antiga. Typecheck, ESLint focado e build do admin-web
passaram. API e `/entregadores` responderam HTTP 200 depois da correção.

## Atualização — 2026-08-23: app do entregador alinhado às referências visuais

As treze referências enviadas foram comparadas com navegação, telas, API,
Socket.IO, push e rastreamento existentes. O recorte implementado aproxima a
experiência visual sem transformar produtos ausentes em botões fictícios.

### Fluxos reais refinados

- A Home mantém mapa + folha inferior, abas **Em andamento/Pendentes**, seletor
  Ativo/Inativo, avisos de conexão, pull-to-refresh, entregas ativas e a vitrine
  de pedidos livres. A abertura deixou de redirecionar automaticamente para a
  primeira corrida: entregas em andamento ficam visíveis e o motoboy escolhe
  qual abrir, enquanto rastreamento e socket continuam sincronizados.
- O menu passou a usar o painel inferior arredondado da referência, com perfil,
  saldo real, ajustes no topo, carteira, pedidos disponíveis, histórico, perfil
  e saída. Agendados, escalas, desafios e suporte não aparecem porque ainda não
  possuem contrato ou operação real.
- A vitrine de pedidos disponíveis foi redesenhada sem alterar o endpoint nem a
  proteção concorrente do `claim`: atualização, dados de empresa/modalidade,
  distância/valor conhecidos e aceite continuam reais.
- Carteira e histórico foram migrados para o tema claro único. A carteira usa
  os saldos, lançamentos, filtros e solicitações reais de `GET /driver/wallet`.
  **Solicitar saque** agora abre `WithdrawalScreen`, que usa o endpoint existente
  `POST /driver/wallet/withdrawals`, valida o saldo e espelha na interface a
  regra de segunda-feira de São Paulo; o servidor continua sendo a autoridade.
  Nenhum campo bancário foi inventado: o texto informa que o pagamento usa a
  chave PIX validada no cadastro.
- O histórico agrupa visualmente por dia de conclusão e soma `driverValue`. O
  texto deixa explícito que `from/to` do endpoint atual filtram `createdAt`, não
  `statusChangedAt`, evitando prometer um recorte que a API não faz.
- Perfil permanece somente leitura (`/auth/me` expõe nome, e-mail e tipo). Ajustes
  oferece uma ação real para abrir as permissões do sistema, disponibilidade e
  diagnóstico; controles de overlay, tela ligada, som e nomes do mapa não são
  simulados.

### Limites deliberados

`MapBackdrop` ganhou acabamento cartográfico para reproduzir a composição das
referências, mas ainda é uma superfície ilustrativa. GPS, presença e tracking
funcionam; tiles, câmera e marcador georreferenciado dependem de um SDK de mapas,
chave mobile restrita e rebuild nativo. Nenhuma dependência nativa ou chave foi
adicionada neste recorte.

Antecipação, escalas, desafios, aceite antecipado de pedidos agendados, suporte
integrado e edição de foto/telefone/documentos/senha/PIX continuam fora da UI
porque exigem regra, persistência e contratos próprios. O modelo Prisma possui
vestígios de antecipação financeira, mas não existe controller/service/cliente
para oferecê-la com segurança.

O Manifest Android usava `${usesCleartextTraffic}` sem declarar o placeholder.
`android/app/build.gradle` agora o define como `true` somente em
`development` e `false` em piloto/produção. Isso corrige o merge do Manifest sem
liberar HTTP nos artefatos distribuídos.

Arquivos principais: `apps/driver-app/App.tsx`, `src/theme/colors.ts`,
`src/components/{MapBackdrop,DrawerMenu,ScreenHeader,Card,EmptyState}.tsx`,
as telas `Home`, `AvailableDeliveries`, `DriverWallet`, `Withdrawal`,
`DriverHistory`, `Profile` e `Settings`, `src/lib/withdrawal.ts`,
`android/app/build.gradle` e `__tests__/withdrawal.test.ts`.

### Verificação

| Comando / fluxo                                                        | Resultado                                                                                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `corepack pnpm --filter @motoboycity/driver-app typecheck`             | aprovado                                                                                                                                                                 |
| `corepack pnpm --filter @motoboycity/driver-app lint`                  | aprovado, zero avisos                                                                                                                                                    |
| `corepack pnpm --filter @motoboycity/driver-app exec jest --runInBand` | 5 suítes e 45 testes aprovados                                                                                                                                           |
| `gradlew.bat :app:processDebugMainManifest --offline`                  | aprovado; 43 tarefas, Manifest processado                                                                                                                                |
| `git diff --check -- apps/driver-app`                                  | aprovado; somente avisos de normalização LF/CRLF                                                                                                                         |
| serviços locais após a validação                                       | company-web 200, admin-web 200, API 200 e Metro 200; uma árvore antiga do Metro que ocupava 8081 sem responder foi confirmada pelo command line, encerrada e substituída |
| inspeção em aparelho/emulador                                          | não executada: `adb` não está instalado/disponível nesta máquina                                                                                                         |

Os comandos pnpm precisaram rodar fora do sandbox local porque os junctions do
`node_modules/.pnpm` retornavam `EPERM` dentro dele; a mesma instalação passou
normalmente fora do isolamento. Nenhum `.env`, secret, migration, schema Prisma,
rota ou contrato compartilhado foi alterado nesta etapa.

Próximo passo concreto: validar visualmente em aparelho Android e iPhone os
breakpoints, teclado e permissões; depois decidir/configurar o provedor de mapa
nativo. Funcionalidades ausentes devem ser priorizadas separadamente, começando
por uma regra de produto e contrato próprio, não por telas estáticas.

## Atualização — 2026-08-23: notificação nativa de oferta como requisito operacional P0

Foi confirmada a decisão de produto de que a notificação nativa não é um
fallback opcional: ela precisa permanecer acionável com o app aberto, funcionar
em segundo plano e solicitar tela cheia com o aparelho bloqueado. O motoboy não
pode ficar `AVAILABLE` sem Firebase/token registrado, permissão de notificação,
canal `ofertas` em `IMPORTANCE_HIGH` e, no Android 14+, acesso especial de tela
cheia. Ao abrir/reconectar, um motoboy que perdeu essa capacidade é retirado da
fila e recebe o atalho para o ajuste correto.

O conflito entre dois serviços `MESSAGING_EVENT` do aplicativo foi eliminado.
`OfferMessagingService` agora herda o serviço do React Native Firebase,
preservando a propagação de renovação do token, e a declaração concorrente da
biblioteca é removida no merge do Manifest. O Manifest final mantém esse serviço
do app e somente o fallback interno do Firebase com prioridade `-500`.

A oferta FCM continua data-only e de prioridade alta, mas deixou de usar TTL
zero: recebe `expiresAtEpochMs` e pode sobreviver a uma troca curta de rede sem
ultrapassar o prazo real. Aceite, recusa, expiração e cancelamento emitem um
push data-only `offer-resolved`, que fecha a notificação/Activity em todos os
aparelhos mesmo sem socket. No primeiro plano, a tela React e a notificação
nativa acionável coexistem; em segundo plano/tela bloqueada, o
`fullScreenIntent` abre `OfferActivity`.

Os botões nativos agora só removem o cartão depois de confirmação da API; falha
de rede preserva a possibilidade de nova tentativa. A chamada cabe na janela
do `BroadcastReceiver` por `callTimeout` de oito segundos. Um aceite confirmado
inicia/atualiza `DeliveryLocationTrackingService` com `deliveryId` ou
`deliveryIds`, inclusive com o React Native suspenso. Loading/erro da Activity
também obedecem ao prazo absoluto e não mantêm a tela acesa indefinidamente.

Arquivos deste recorte: `apps/api/src/push/push.service.ts` e spec,
`apps/api/src/dispatch/dispatch.service.ts` e spec,
`apps/driver-app/src/{lib/push.ts,screens/HomeScreen.tsx}`, `index.js`, teste de
push, Manifest e os arquivos Kotlin `OfferMessagingService`,
`OfferActionReceiver`, `OfferNativeClient`, `OfferActivity`,
`OfferSession{Module,Store}`, `DeliveryLocationTrackingService` e
`LocationTrackingModule`. A documentação de push e o runbook do piloto também
foram atualizados. Nenhum `.env`, secret, schema Prisma, migration ou contrato
compartilhado foi alterado neste recorte.

### Verificação

| Comando / fluxo                           | Resultado                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| typecheck do driver-app                   | aprovado                                                                                         |
| lint do driver-app                        | aprovado, zero erros                                                                             |
| Jest `__tests__/push.test.ts --runInBand` | 1 suíte e 12 testes aprovados                                                                    |
| Jest completo do driver-app               | 5 suítes e 48 testes aprovados                                                                   |
| typecheck da API                          | aprovado                                                                                         |
| Jest focado em push + dispatch da API     | 2 suítes e 65 testes aprovados                                                                   |
| `gradlew.bat :app:assembleDebug`          | aprovado; APK novo gerado                                                                        |
| inspeção do Manifest mesclado             | serviço RNFB concorrente ausente; serviço do app ativo e fallback Firebase em prioridade `-500`  |
| instalação `adb install -r`               | aprovada no aparelho conectado, preservando dados                                                |
| inspeção do aparelho                      | `POST_NOTIFICATIONS` e `USE_FULL_SCREEN_INTENT` concedidas; canal `ofertas` em `IMPORTANCE_HIGH` |

Limitações honestas: uma parada forçada explícita bloqueia mensagens até o
usuário reabrir o app; o aplicativo recupera a oferta pendente nessa abertura.
A política do Google Play restringe o uso automático de tela cheia e precisa ser
avaliada antes da publicação. iOS/APNs ainda não está implementado.

Próximo passo concreto: com o aparelho já atualizado, criar três ofertas reais
controladas e validar gravação de tela/logs em (1) app aberto, (2) app em segundo
plano e (3) tela bloqueada, cobrindo aceitar, recusar, expirar e cancelar. Essa
homologação fim a fim não deve ser declarada concluída apenas pelos testes e
pela inspeção de permissões.

## Atualização — 2026-08-23: telas operacionais pós-aceite

As quatro referências do fluxo Aceito/Coletado foram aplicadas à tela
operacional real do driver-app. `DeliveryOperationScreen` agora usa a composição
mapa + folha branca, cabeçalho do pedido, data/hora do estado atual, status,
ação principal em destaque, seções de valores, pagamento, endereços e cliente,
timeline da rota e rodapé fixo. O telefone do destinatário abre `tel:`, as rotas
continuam abrindo o Google Maps e os botões permanecem ligados aos endpoints
reais de coleta, entrega, insucesso, retorno e devolução à fila. A seta permite
voltar para a Home sem abandonar a corrida, que continua listada em andamento.

O sucesso da coleta exibe o banner “O pedido foi marcado como coletado!”. O
estado `ACCEPTED` mostra **tempo decorrido desde o aceite**, atualizado a cada
segundo, e não uma contagem regressiva inventada: o produto ainda não possui um
deadline/SLA de coleta. `driverValue=null` aparece como “A calcular na entrega”,
nunca como `R$ 0,00`. Endereços passaram a incluir complemento, CEP e referência
quando presentes.

Para pedido sem destino conhecido, a confirmação de entrega explica e aciona a
captura GPS já confirmada nas regras de negócio. O modal de rua/número da
referência não foi copiado porque o contrato atual proíbe endereço estruturado
nesse modo e usa a coordenada para definir destino, distância e preço. “Falar
com a loja” também não foi simulado: `DeliveryDetail` não expõe telefone
operacional canônico da empresa. Esses dois itens exigem decisões e contratos
novos se forem priorizados.

Foi corrigida uma perda de continuidade existente: `FAILED` agora faz parte de
`getActiveDeliveries`, pois a mercadoria ainda precisa ser devolvida e fechada
por `complete-return`. Assim ela não desaparece da Home nem do tracking após
reiniciar. Ao voltar do segundo plano, a Home também recarrega os ativos; se um
novo `ACCEPTED` surgiu pelo aceite na notificação/tela cheia Android, abre a
tela operacional correspondente. Isso preserva a notificação nativa P0 e fecha
o elo entre o aceite fora do React Native e o pós-aceite.

Arquivos deste recorte:
`apps/driver-app/src/screens/{DeliveryOperationScreen,HomeScreen}.tsx`,
`apps/driver-app/src/lib/{deliveryOperation,activeDeliveries}.ts`,
`apps/driver-app/__tests__/{deliveryOperation,activeDeliveries}.test.ts`.
Nenhum `.env`, secret, schema Prisma, migration, rota HTTP, contrato
compartilhado ou arquivo nativo foi alterado.

### Verificação

| Comando / fluxo                                            | Resultado                                                                                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm --filter @motoboycity/driver-app typecheck` | aprovado                                                                                                                            |
| `corepack pnpm --filter @motoboycity/driver-app lint`      | aprovado, zero erros                                                                                                                |
| Jest focado em pós-aceite                                  | 2 suítes e 7 testes aprovados                                                                                                       |
| Jest completo do driver-app                                | 7 suítes e 55 testes aprovados                                                                                                      |
| aparelho Android conectado                                 | bundle carregado e Home inspecionada; não havia pedido ativo e nenhum pedido real foi criado/mutado apenas para produzir screenshot |

Lacuna preexistente encontrada na auditoria e mantida fora deste recorte: a
rota genérica `PATCH /deliveries/:id/cancel` usa `assertCanAccess`, que também
autoriza o motoboy atribuído, enquanto a restrição de estado no service é
aplicada apenas a `COMPANY_MEMBER`. O app não oferece esse botão, mas o backend
deve ganhar teste e guarda explícita para impedir cancelamento direto por
motoboy; o fluxo permitido para ele continua sendo `return-to-queue` antes da
coleta ou `fail` depois dela.

Próximo passo concreto: homologar com ofertas controladas os estados
`ACCEPTED → COLLECTED → COMPLETED` e `COLLECTED → FAILED → COMPLETED` no aparelho
conectado, incluindo aceite pela notificação com app aberto, em segundo plano e
tela bloqueada. Em paralelo, decidir separadamente (1) se existe SLA de coleta,
(2) qual contato da loja é canônico e (3) se a regra GPS-only será substituída
por endereço estruturado no momento da entrega.

## Atualização — 2026-08-23: referências ampliadas do aplicativo do motoboy

Foram revisadas as quatro páginas de
`imagensderefencia/appmotoboy/app do motoboy.pdf` e as sete imagens JPEG da
mesma pasta. A comparação cobriu cadastro, Home, menu, carteira, saque,
histórico, pedidos disponíveis, oferta recebida, operação pós-aceite,
configurações e pedidos agendados. Home, menu, carteira, saque, histórico,
oferta em tela cheia e operação pós-aceite já estavam próximos da composição
visual de referência; este recorte fechou os desvios compatíveis com os
contratos atuais.

Os cards de pedidos livres agora mostram a linha do tempo real de coleta,
entrega e retorno, tanto na Home quanto em `AvailableDeliveriesScreen`. Quando
o destino é definido somente na entrega, a interface informa isso em vez de
inventar um endereço. Valor e distância nulos também aparecem como pendentes
de cálculo, nunca como zero. Os cards de entregas em andamento na Home passaram
a exibir horário do último estado, pagamento, distância e valor com os mesmos
tratamentos honestos.

`DriverOrderDetailScreen`, aberto pelo histórico, foi refeito com mapa e folha
branca, cabeçalho do pedido, data, estado, valores, pagamento, timeline dos
endereços, cliente, faturamento e histórico operacional. A rota completa abre
o Google Maps somente quando coleta e entrega estão disponíveis; entregas com
retorno usam a entrega como parada intermediária e voltam à coleta. O telefone
real do destinatário abre o discador.

Não foram simulados recursos que ainda não têm regra ou contrato: chat com
cliente/loja, antecipação de saldo, escalas, pedidos agendados do motoboy e os
campos/documentos extras do cadastro da referência. Pedidos da vitrine também
não ganharam contagem regressiva, pois esse contrato não expõe prazo de oferta.
O fluxo de destino dinâmico continua GPS-only conforme a decisão vigente.

Arquivos deste recorte:
`apps/driver-app/src/screens/{AvailableDeliveriesScreen,HomeScreen,DriverOrderDetailScreen}.tsx`,
`apps/driver-app/src/lib/deliveryOperation.ts` e
`apps/driver-app/__tests__/deliveryOperation.test.ts`. A notificação nativa P0,
os arquivos Android/iOS, `.env`, secrets, API, schema Prisma, migrations e
contratos compartilhados não foram alterados.

### Verificação

| Comando / fluxo                                            | Resultado                                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `corepack pnpm --filter @motoboycity/driver-app typecheck` | aprovado                                                                |
| `corepack pnpm --filter @motoboycity/driver-app lint`      | aprovado, zero erros                                                    |
| Jest focado em `deliveryOperation.test.ts`                 | 1 suíte e 6 testes aprovados                                            |
| Jest completo do driver-app                                | 7 suítes e 56 testes aprovados                                          |
| `git diff --check` nos arquivos do recorte                 | aprovado; apenas avisos de normalização LF/CRLF do Git                  |
| aparelho Android conectado em retrato                      | Home inspecionada com mapa, folha, abas e estado vazio sem sobreposição |

Lacuna de validação: não havia pedido livre nem histórico com dados adequados no
aparelho, e nenhum pedido real foi criado ou alterado apenas para produzir
screenshot. O próximo passo concreto é homologar com dados controlados um
pedido livre com destino conhecido, um com destino dinâmico e um concluído com
retorno, conferindo quebra de texto e rolagem em tela pequena. A homologação P0
da notificação nativa nos três estados do app continua sendo um fluxo separado
e prioritário.

## Atualização — 2026-08-23: cards compactos na aba Pendentes

A aba **Pendentes** da Home agora suporta visualmente vários pedidos livres em
uma lista de cards compactos. Cada card mostra número, horário, empresa,
modalidade, distância, valor e uma timeline reduzida de coleta/entrega/retorno,
com somente a ação **Aceitar pedido**. Não há botão Recusar: o pedido continua
na lista até deixar de ser retornado por `GET /delivery-offers/available`.

Enquanto a Home está focada, a aba Pendentes sincroniza a vitrine a cada dez
segundos, somente com o app ativo. Assim, um pedido assumido ou oferecido a
outro motoboy desaparece sem exigir que o usuário tente aceitá-lo. Pull-to-refresh
continua disponível. O aceite usa o contrato existente
`PATCH /delivery-offers/available/:id/claim`; conflito recarrega a lista e
informa que o pedido ficou indisponível.

Há uma trava síncrona além do estado visual dos botões para impedir dois
aceites concorrentes em toques rápidos sobre cards diferentes. Depois de um
aceite confirmado, todos os pendentes são retirados da tela, os ativos e o
rastreamento são sincronizados e a operação aceita é aberta. Isso preserva a
regra do backend de que um motoboy com corrida em andamento não pode assumir
outra vitrine. Lotes continuam identificados no card e são aceitos como a
unidade operacional já definida pelo backend.

Arquivos deste recorte:
`apps/driver-app/src/screens/HomeScreen.tsx`,
`apps/driver-app/src/components/{PendingDeliveryCard,RouteTimeline}.tsx` e
`apps/driver-app/__tests__/PendingDeliveryCard.test.tsx`. Nenhum endpoint,
contrato compartilhado, schema Prisma, migration, `.env`, secret ou arquivo
nativo de notificação foi alterado.

### Verificação

| Comando / fluxo               | Resultado                                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| typecheck do driver-app       | aprovado                                                                                                                                                               |
| lint do driver-app            | aprovado, zero erros                                                                                                                                                   |
| Jest focado no card pendente  | 1 suíte e 2 testes aprovados                                                                                                                                           |
| Jest completo do driver-app   | 8 suítes e 58 testes aprovados                                                                                                                                         |
| `git diff --check` no recorte | aprovado; somente aviso de normalização LF/CRLF já existente                                                                                                           |
| abertura no Android conectado | aplicativo carregou sem tela de erro, mas a sessão estava expirada e permaneceu no login; não foram reutilizadas credenciais nem criados pedidos reais para a inspeção |

Próximo passo concreto: autenticar uma conta de homologação e disponibilizar
ao menos dois pedidos controlados ao mesmo tempo para conferir densidade,
rolagem, desaparecimento automático e aceite do segundo card em aparelho real.

## Atualização — 2026-08-23: UX das configurações de operação do admin

A página `/configuracoes/operacao` foi reorganizada para reduzir a densidade e
separar claramente leitura, edição e salvamento. O formulário deixou de usar
uma única linha flexível e agora agrupa os campos em quatro blocos responsivos:
despacho e retorno, validação de horários, alertas operacionais e capacidade da
operação. Cada campo exibe unidade, faixa permitida, explicação curta e o valor
atualmente ativo.

Em telas largas, um resumo fixo lateral reúne os valores vigentes e uma área de
ação separada concentra **Limpar** e **Salvar**. Em larguras menores, os blocos
e o resumo voltam ao fluxo vertical. Foram adicionados estados explícitos de
carregamento, falha de consulta e sucesso ao salvar. O botão Salvar permanece
desabilitado até haver ao menos uma mudança, e o reset após sucesso agora limpa
também os campos de capacidade e raio de entrega.

O contrato existente foi preservado: a tela continua usando
`GET/PATCH /admin/platform-settings`, envia somente campos preenchidos e mantém
a mesma validação local. Nenhuma rota, payload, autorização, schema Prisma,
migration, dependência, `.env`, secret, cliente mobile ou notificação nativa foi
alterado.

Arquivo funcional deste recorte:
`apps/admin-web/src/app/(app)/configuracoes/operacao/page.tsx`.

### Verificação

| Comando / fluxo                                           | Resultado                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `corepack pnpm --filter @motoboycity/admin-web typecheck` | aprovado                                                                   |
| `corepack pnpm --filter @motoboycity/admin-web lint`      | aprovado, zero erros                                                       |
| `git diff --check` no arquivo da tela                     | aprovado; somente aviso de normalização LF/CRLF do Git                     |
| `GET http://localhost:3001/configuracoes/operacao`        | HTTP 200 com o servidor local ativo                                        |
| inspeção pelo navegador integrado                         | não executada; nenhuma sessão de navegador estava disponível no aplicativo |

Lacuna de validação: o admin web não possui teste automatizado de interface e
a sessão autenticada não pôde ser inspecionada visualmente nesta execução. O
próximo passo concreto é abrir a rota com uma conta admin, conferir a composição
em desktop e mobile e fazer uma alteração controlada para validar as mensagens
de sucesso e erro sem mudar configurações de produção.

## Atualização — 2026-08-23: filas recolhíveis no painel administrativo

Os cards da visão **Por status** em **Filas operacionais** agora podem ser
abertos e recolhidos individualmente pelo cabeçalho. A seta comunica o estado,
o contador permanece visível mesmo com o conteúdo fechado e os controles usam
`aria-expanded`/`aria-controls` para preservar a navegação assistiva.

Enquanto não houver uma escolha manual do administrador, filas vazias começam
recolhidas para reduzir a altura da coluna e uma fila abre automaticamente ao
receber pedido. Depois de aberta ou recolhida manualmente, a escolha permanece
durante a sessão da página. A visão **Por empresa** já possuía colapso próprio e
foi preservada.

Arquivo funcional deste recorte: `apps/admin-web/src/app/(app)/page.tsx`.
Nenhum endpoint, payload, estado do servidor, autorização, schema Prisma,
migration, `.env`, secret, cliente mobile ou notificação nativa foi alterado.

### Verificação

| Comando / fluxo                                           | Resultado                           |
| --------------------------------------------------------- | ----------------------------------- |
| `corepack pnpm --filter @motoboycity/admin-web typecheck` | aprovado                            |
| `corepack pnpm --filter @motoboycity/admin-web lint`      | aprovado, zero erros                |
| `GET http://localhost:3001/`                              | HTTP 200 com o servidor local ativo |

Lacuna de validação: o admin web ainda não possui teste automatizado de
interface para esse painel. O próximo passo concreto é conferir com uma sessão
admin a abertura e o recolhimento de filas vazias e cheias em desktop e em uma
largura estreita.

## Atualização — 2026-08-23: paginação dos pedidos no detalhe do cliente

A seção **Pedidos do cliente** em `/clientes/:id` deixou de renderizar toda a
lista de uma vez e passou a consumir a paginação real já disponível em
`GET /deliveries/search`. O padrão é 10 pedidos por página, com opções de 10,
25 ou 50, total encontrado, intervalo visível e controles **Anterior** e
**Próxima**. A troca de status ou de tamanho da página retorna à página 1.

O filtro por empresa continua obrigatório na consulta e a autorização segue no
backend. O contrato existente de busca foi apenas reutilizado; nenhum endpoint,
payload, validação Zod, tipo compartilhado, schema Prisma ou migration mudou.
A consulta sem paginação usada pelos indicadores superiores foi preservada para
não alterar os cálculos já exibidos nesta mesma tela.

Arquivo funcional deste recorte:
`apps/admin-web/src/app/(app)/clientes/[id]/page.tsx`. Nenhum `.env`, secret,
cliente mobile ou notificação nativa foi alterado.

### Verificação

| Comando / fluxo                                           | Resultado            |
| --------------------------------------------------------- | -------------------- |
| `corepack pnpm --filter @motoboycity/admin-web typecheck` | aprovado             |
| `corepack pnpm --filter @motoboycity/admin-web lint`      | aprovado, zero erros |

Lacuna de validação: o admin web não possui teste automatizado de interface
para essa lista. O próximo passo concreto é conferir com uma sessão admin uma
empresa com mais de dez pedidos, validando troca de página, tamanho e status.

## Atualização — 2026-08-23: central e detalhamento de relatórios do admin

A rota `/relatorios` foi transformada em uma central inspirada nas referências
visuais enviadas, com cards amplos, ícones, títulos e descrições agrupados em
**Visão geral**, **Pedidos e clientes**, **Entregadores** e **Financeiro**.
Somente análises já suportadas pelo produto foram apresentadas: nenhum card de
relatório futuro ou sem endpoint foi simulado.

O relatório operacional existente foi movido para
`/relatorios/operacional` e reorganizado em blocos com mais respiro: filtro de
período, visão geral, composição financeira, situação dos pedidos, histórico,
horários de pico, desempenho por cliente, ranking de entregadores e modalidades
de serviço. Uma navegação interna facilita saltar entre as seções; os atalhos da
central também aguardam o carregamento dos dados antes de posicionar a seção
solicitada. O histórico detalhado continua em `/relatorios/historico`.

A consulta real `GET /admin/reports/operations`, filtros, comparações, tabelas,
gráficos e exportação existentes foram preservados. Nenhum endpoint, payload,
autorização, validação, tipo compartilhado, schema Prisma, migration, `.env`,
secret, cliente mobile ou notificação nativa foi alterado.

Arquivos funcionais deste recorte:
`apps/admin-web/src/app/(app)/relatorios/page.tsx` e
`apps/admin-web/src/app/(app)/relatorios/operacional/page.tsx`.

### Verificação

| Comando / fluxo                                           | Resultado                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| `corepack pnpm --filter @motoboycity/admin-web typecheck` | aprovado                                                   |
| `corepack pnpm --filter @motoboycity/admin-web lint`      | aprovado, zero erros                                       |
| `GET http://localhost:3001/relatorios`                    | HTTP 200                                                   |
| `GET http://localhost:3001/relatorios/operacional`        | HTTP 200                                                   |
| navegador integrado                                       | nenhuma sessão disponível para inspeção visual autenticada |

Lacuna de validação: o admin web não possui testes automatizados de interface e
as rotas não puderam ser inspecionadas em uma sessão autenticada nesta execução.
O próximo passo concreto é abrir a central em desktop e largura estreita,
percorrer cada card e conferir o posicionamento nas seções do relatório.

## Atualização — 2026-08-23: primeiro conjunto de relatórios dedicados

A central `/relatorios` agora abre páginas próprias e completas para o primeiro
recorte priorizado:

- `/relatorios/geral`: indicadores, comparação com janela anterior, composição
  financeira e distribuição pelo estado atual;
- `/relatorios/pedidos`: busca por número/UUID/número externo, filtros por
  status, cliente, entregador e período, paginação real no servidor, detalhe e
  exportação explicitamente limitada à página visível;
- `/relatorios/tempos-sla`: média, mediana, p90 e amostras de aceite, coleta,
  entrega e ciclo total, comparadas aos alertas operacionais configurados;
- `/relatorios/clientes`: indicadores, busca, ordenação, paginação local,
  ranking e CSV do recorte filtrado;
- `/relatorios/entregadores`: indicadores, busca, ranking ordenável e CSV com
  volume, conclusão, aceite, tempo e repasse em métricas separadas.

Filtros, cabeçalhos, resumo de período, estados de carregamento/erro e paginação
foram padronizados em componentes de `apps/admin-web/src/components/reports/`.
A central deixou de promover o histórico antigo sem paginação e manteve
`/relatorios/operacional` como visão consolidada para horários de pico,
modalidades e composição financeira enquanto esses próximos relatórios ainda
não possuem página dedicada.

O endpoint de tempos já aceitava `excludeRetroactive`; o cliente compartilhado
agora expõe e serializa o filtro. Nenhuma rota, validação ou tabela de banco foi
criada. A tela inicia esse relatório em 30 dias para não consultar todo o
histórico por acidente. Os limites de SLA são apresentados como referência do
p90: o contrato atual não devolve percentual de pedidos dentro da meta e a UI
não inventa esse dado.

O ranking operacional foi corrigido no serviço para incluir a união de
entregadores com corrida encerrada ou oferta recebida, inclusive quem recusou
todas e não concluiu nenhuma. Antes, a etapa de agregação calculava esses casos,
mas a resposta só criava linhas no loop de entregas concluídas. O teste unitário
trava esse cenário. Em clientes, `cancelledCount` foi documentado e rotulado de
forma precisa: são pedidos criados no recorte cujo estado atual é cancelado,
não cancelamentos ocorridos necessariamente dentro da janela.

O helper compartilhado de CSV agora neutraliza texto iniciado por caracteres
de fórmula de planilha, protegendo os relatórios novos e as exportações já
existentes contra CSV injection. Números negativos legítimos continuam
calculáveis.

Arquivos principais deste recorte:

- `apps/admin-web/src/app/(app)/relatorios/{page.tsx,geral,pedidos,tempos-sla,clientes,entregadores}`;
- `apps/admin-web/src/components/reports/{report-filter-card,report-layout,report-pagination,driver-ranking}.tsx`;
- `apps/admin-web/src/lib/csv.ts`;
- `apps/api/src/admin/reports/{admin-reports.service.ts,admin-reports.service.spec.ts}`;
- `packages/api-client/src/deliveries.ts`;
- `packages/types/src/report.ts`.

### Verificação

| Comando / fluxo                                           | Resultado                                               |
| --------------------------------------------------------- | ------------------------------------------------------- |
| `corepack pnpm --filter @motoboycity/admin-web typecheck` | aprovado                                                |
| `corepack pnpm --filter @motoboycity/admin-web lint`      | aprovado, zero erros                                    |
| `corepack pnpm --filter @motoboycity/api typecheck`       | aprovado                                                |
| `corepack pnpm --filter @motoboycity/api lint`            | aprovado, zero erros                                    |
| Jest focado em `admin-reports.service.spec.ts`            | 1 suíte e 11 testes aprovados                           |
| typecheck/lint de `@motoboycity/api-client`               | aprovados                                               |
| typecheck/lint de `@motoboycity/types`                    | aprovados                                               |
| `corepack pnpm typecheck`                                 | 8 pacotes aprovados                                     |
| `corepack pnpm lint`                                      | 8 pacotes aprovados                                     |
| `git diff --check`                                        | aprovado; somente avisos de normalização LF/CRLF do Git |
| navegador integrado                                       | indisponível; nenhuma sessão de navegador conectada     |
| HTTP de `/relatorios` e das cinco rotas dedicadas         | HTTP 200 nas seis rotas com o servidor local ativo      |

Nenhuma migration, alteração de Prisma, `.env`, secret, cliente mobile ou
notificação nativa foi tocada. A próxima validação concreta é percorrer as cinco
páginas com uma sessão admin em desktop e largura estreita. O próximo recorte
funcional recomendado é separar Horários de pico, Modalidades e Financeiro em
páginas dedicadas, seguido dos relatórios que exigem novas agregações no
backend.

## Atualização — 2026-08-23: pico, modalidades e financeiro dedicados

O segundo recorte da central de relatórios foi concluído com três páginas
próprias, todas alimentadas por dados reais já existentes:

- `/relatorios/horarios-pico`: resumo da demanda, pico por hora e dia da
  semana, gráfico, tabelas completas com médias normalizadas e CSV. A interface
  explicita que todos os pedidos criados entram na base, inclusive os que foram
  cancelados depois, pois também ocuparam capacidade operacional;
- `/relatorios/modalidades`: indicadores, busca, ordenação, participação no
  volume criado e no valor concluído e CSV por tipo de serviço. Criados e
  concluídos continuam apresentados como coortes temporais separadas, sem uma
  taxa de conclusão artificial;
- `/relatorios/financeiro`: valor concluído no período, comparação com a janela
  anterior, divisão entre repasse e receita da plataforma, reconciliação da
  composição, CSV e posição de caixa atual.

No financeiro, a posição de caixa foi deliberadamente isolada do filtro de
datas. `GET /admin/financial/cash-position` representa o estado do instante:
trabalho antigo ainda não faturado, faturas abertas e obrigações com
entregadores não podem desaparecer quando o operador seleciona outro mês. O
CSV também identifica cada linha como “período filtrado” ou “sem filtro de
período”.

A central `/relatorios` agora aponta diretamente para as três rotas. A visão
`/relatorios/operacional` permanece disponível como consolidado legado. Nenhum
endpoint, payload, validação, pacote compartilhado, schema Prisma, migration,
`.env`, secret, cliente mobile ou notificação nativa foi alterado neste recorte.

Arquivos funcionais deste recorte:

- `apps/admin-web/src/app/(app)/relatorios/page.tsx`;
- `apps/admin-web/src/app/(app)/relatorios/horarios-pico/page.tsx`;
- `apps/admin-web/src/app/(app)/relatorios/modalidades/page.tsx`;
- `apps/admin-web/src/app/(app)/relatorios/financeiro/page.tsx`.

### Verificação

| Comando / fluxo                                           | Resultado                                                       |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| `corepack pnpm --filter @motoboycity/admin-web typecheck` | aprovado                                                        |
| `corepack pnpm --filter @motoboycity/admin-web lint`      | aprovado, zero erros                                            |
| `corepack pnpm --filter @motoboycity/admin-web run build` | aprovado; 29 páginas geradas                                    |
| rotas das três páginas no manifesto do build              | registradas como páginas estáticas                              |
| `git diff --check`                                        | bloqueado por linha em branco em arquivo financeiro concorrente |

Lacuna de validação: não havia servidor local ativo nem sessão de navegador
autenticada nesta execução. O próximo passo concreto é percorrer as três rotas
em desktop e largura estreita com dados reais, validar o download dos CSVs e,
depois, priorizar novos relatórios que exigem agregações específicas no backend.

## Atualização — 2026-08-23: contas a receber e aging por cliente

O primeiro recorte de controle financeiro avançado foi implementado em
`/relatorios/contas-a-receber`. A página apresenta a posição atual de contas a
receber, separando pedidos concluídos ainda sem fatura, faturas a vencer e
faturas vencidas nas faixas de 1–7, 8–15, 16–30 e mais de 30 dias. Também
consolida a exposição por cliente, com busca, filtro por tipo, ordenação,
paginação local, CSV do resultado filtrado e links para cliente e faturas.

O novo `GET /admin/financial/receivables-aging` é somente leitura, protegido
pelos mesmos `JwtAuthGuard` e `AdminOnlyGuard` do restante da área financeira.
Não aceita período de propósito: dívida antiga continua existindo hoje. A data
de referência é calculada no fuso de São Paulo; vencimento no próprio dia ainda
fica em “a vencer”. Pedidos pagos online não entram como dívida e “sem fatura”
considera somente entrega `COMPLETED`, cobrança `BILLED` e `invoiceId: null`.

As agregações de pedidos sem fatura, faturas abertas e nomes de empresas são
lidas numa transação `RepeatableRead`. Isso impede que um fechamento semanal
concorrente faça o mesmo valor aparecer simultaneamente como sem fatura e já
faturado. Valores são somados em centavos e cada item entra em exatamente uma
faixa, permitindo reconciliar total geral, buckets e empresas.

Arquivos funcionais deste recorte:

- `apps/api/src/finance/admin-financial.{controller,service,spec}.ts`;
- `packages/types/src/finance.ts`;
- `packages/api-client/src/admin-financial.ts`;
- `apps/admin-web/src/app/(app)/relatorios/contas-a-receber/page.tsx`;
- `apps/admin-web/src/app/(app)/relatorios/page.tsx`.

Não houve alteração de schema Prisma, migration, dados existentes, regra de
pagamento, `.env`, secret, cliente mobile ou notificação nativa.

### Verificação

| Comando / fluxo                                           | Resultado                                    |
| --------------------------------------------------------- | -------------------------------------------- |
| Jest focado em `admin-financial.service.spec.ts`          | 1 suíte e 15 testes aprovados                |
| `corepack pnpm typecheck`                                 | 8 pacotes aprovados                          |
| `corepack pnpm lint`                                      | 8 pacotes aprovados                          |
| `corepack pnpm --filter @motoboycity/api run build`       | aprovado                                     |
| `corepack pnpm --filter @motoboycity/admin-web run build` | aprovado; nova rota entre 30 páginas geradas |
| typecheck/lint final de `@motoboycity/api`                | aprovados                                    |

Lacuna de validação: não havia sessão administrativa com massa financeira
controlada para inspeção visual e conferência centavo a centavo. O próximo
passo concreto é homologar a rota com empresas contendo dívida em cada faixa e,
depois, criar o relatório de repasses e saques com idade das solicitações.

## Atualização — 2026-08-23: repasses, saques e conciliação por entregador

O segundo recorte de controle financeiro avançado foi concluído em
`/relatorios/repasses-saques`. A página apresenta a obrigação atual da operação
com os entregadores, separando saldo disponível, saldo bloqueado e valor já
reservado para saques. Também mostra solicitações aguardando análise ou já
aprovadas, idade das solicitações abertas e posição detalhada por entregador,
com busca, filtros, ordenação, paginação local, CSV e links para o cadastro do
entregador e a área financeira.

O novo `GET /admin/financial/payouts-aging` é somente leitura e usa os mesmos
`JwtAuthGuard` e `AdminOnlyGuard` da área financeira. O relatório é uma
fotografia atual e não aceita período: a obrigação permanece existente até a
liberação, pagamento ou reversão correspondente. O total é calculado como
`saldo disponível + saldo bloqueado + valor reservado em saques`. A reserva é
somada de volta porque o débito pendente já a retirou do disponível, mas ainda
representa dinheiro devido ao entregador.

Carteiras, grupos do ledger e solicitações `PENDING`/`APPROVED` são lidos em
uma transação `RepeatableRead`, evitando misturar estados anteriores e
posteriores a uma aprovação, pagamento ou rejeição concorrente. O relatório
também confere o saldo em cache contra o ledger e compara o total reservado no
ledger com o valor solicitado em saques abertos, tanto no consolidado quanto
por entregador.

As faixas de 0–1, 2–3, 4–7 e 8 dias ou mais são estritamente descritivas. Não
existe SLA confirmado para pagamento de saques, então a interface usa “aberto
há” e deixa explícito que idade não significa atraso. Nenhum limite de negócio
foi inventado.

Arquivos funcionais deste recorte:

- `apps/api/src/finance/admin-financial.{controller,service,spec}.ts`;
- `packages/types/src/finance.ts`;
- `packages/api-client/src/admin-financial.ts`;
- `apps/admin-web/src/app/(app)/relatorios/repasses-saques/page.tsx`;
- `apps/admin-web/src/app/(app)/relatorios/page.tsx`.

Não houve alteração de schema Prisma, migration, regra de saque, dados
existentes, `.env`, secret, cliente mobile ou notificação nativa.

### Verificação

| Comando / fluxo                                           | Resultado                                    |
| --------------------------------------------------------- | -------------------------------------------- |
| Jest focado em `admin-financial.service.spec.ts`          | 1 suíte e 18 testes aprovados                |
| `corepack pnpm typecheck`                                 | 8 pacotes aprovados                          |
| `corepack pnpm lint`                                      | 8 pacotes aprovados                          |
| `corepack pnpm --filter @motoboycity/api run build`       | aprovado                                     |
| `corepack pnpm --filter @motoboycity/admin-web run build` | aprovado; nova rota entre 31 páginas geradas |
| `git diff --check`                                        | aprovado; somente avisos LF/CRLF do Git      |

Lacuna de validação: falta abrir a página com uma sessão administrativa e uma
massa que contenha solicitações nos dois estados e divergências controladas,
para conferir visualmente os alertas e os valores centavo a centavo. O próximo
recorte financeiro recomendado é um demonstrativo de resultado por cliente e
modalidade, separando valor cobrado, repasse, receita da plataforma, ajustes e
margem operacional sem misturar caixa com competência.

## Atualização — 2026-08-23: resultado por competência e margem de contribuição

O terceiro recorte de controle financeiro avançado foi implementado em
`/relatorios/resultado-operacional`. A página apresenta o resultado gerencial
das entregas concluídas, com valor cobrado, repasse direto, receita da
plataforma, margem de contribuição e ticket médio. Também inclui comparação
com a janela imediatamente anterior, ponte de reconciliação, ajustes de
carteira separados, busca/ordenação/paginação por cliente, modalidades, formas
de cobrança, evolução diária e CSV completo.

O novo `GET /admin/financial/financial-statement` é somente leitura, protegido
por `JwtAuthGuard` e `AdminOnlyGuard`, e exige `from`/`to`. O contrato limita o
intervalo a 366 dias porque a API lê as entregas concluídas para montar as
dimensões e a série diária. As pontas são interpretadas no fuso de São Paulo e
usam intervalos semiabertos (`gte`/`lt`), evitando que o instante de fronteira
seja contado simultaneamente no período atual e no anterior.

A competência é a data em que a entrega chegou a `COMPLETED`, representada por
`statusChangedAt`. Somente entregas com `totalValue`, `driverValue` e
`platformValue` simultaneamente preenchidos entram nos valores e no ticket
médio. Entrega concluída com composição incompleta continua na contagem
operacional e aparece como `unpricedCount`; não é transformada silenciosamente
em R$ 0,00.

`platformValue` é apresentado como margem de contribuição antes de despesas
operacionais e impostos, e não como lucro líquido. O relatório reconcilia
`totalValue - driverValue - platformValue` no total, em clientes,
modalidades, formas de cobrança e dias. Ajustes `CREDIT_ADJUSTMENT`,
`DEBIT_ADJUSTMENT` e `CREDIT_REFUND` não cancelados são agrupados por tipo e
status, mas permanecem fora da margem: o ledger atual informa direção e valor,
porém não possui classificação contábil suficiente para afirmar que todo
ajuste é receita ou despesa da plataforma. Saques, liberações e créditos de
repasse também não são somados novamente, pois representam caixa ou mudança de
disponibilidade de uma obrigação já reconhecida.

Entregas atuais, comparação e ajustes são lidos numa transação
`RepeatableRead`. Nenhuma tabela ou coluna nova foi necessária.

Arquivos funcionais deste recorte:

- `packages/validation/src/finance/admin-financial-query.schema.ts`;
- `packages/types/src/finance.ts`;
- `packages/api-client/src/admin-financial.ts`;
- `apps/api/src/finance/admin-financial.{controller,service,spec}.ts`;
- `apps/admin-web/src/app/(app)/relatorios/resultado-operacional/page.tsx`;
- `apps/admin-web/src/app/(app)/relatorios/page.tsx`.

Não houve alteração de schema Prisma, migration, dados existentes, regra de
preço, `.env`, secret, cliente mobile ou notificação nativa.

### Verificação

| Comando / fluxo                                           | Resultado                                    |
| --------------------------------------------------------- | -------------------------------------------- |
| `corepack pnpm --filter @motoboycity/validation build`    | aprovado                                     |
| Jest focado em `admin-financial.service.spec.ts`          | 1 suíte e 21 testes aprovados                |
| `corepack pnpm typecheck`                                 | 8 pacotes aprovados                          |
| `corepack pnpm lint`                                      | 8 pacotes aprovados                          |
| `corepack pnpm --filter @motoboycity/api run build`       | aprovado                                     |
| `corepack pnpm --filter @motoboycity/admin-web run build` | aprovado; nova rota entre 32 páginas geradas |
| `git diff --check`                                        | aprovado; somente avisos LF/CRLF do Git      |

Lacuna de validação: não havia servidor local ativo nem sessão admin com massa
financeira controlada para inspeção visual e conferência centavo a centavo. O
próximo passo de homologação é abrir o demonstrativo com entregas em todas as
dimensões, uma composição divergente e um ajuste em cada direção. O próximo
recorte funcional recomendado é um extrato financeiro unificado que relacione
competência, faturamento, recebimento e movimentação de carteira sem misturar
as quatro datas contábeis.

## Atualização — 2026-08-24: extrato financeiro unificado por pedido

O quarto recorte de controle financeiro avançado foi implementado em
`/relatorios/extrato-financeiro`. A página liga cada entrega concluída à
fatura, ao recebimento e aos lançamentos de repasse correspondentes, com busca,
filtros por pendência, paginação, links para pedido/cliente/entregador/fatura e
CSV auditável. Ajustes de carteira aparecem numa seção separada com valor,
direção, status, motivo e autor.

O novo `GET /admin/financial/financial-cycle` é somente leitura, protegido por
`JwtAuthGuard` e `AdminOnlyGuard`, e exige `from`/`to`. O intervalo aceita no
máximo 93 dias porque a resposta lê relações detalhadas de cada entrega, em vez
de apenas agregados. As datas são interpretadas no fuso de São Paulo e usam
intervalo semiaberto (`gte`/`lt`).

O filtro seleciona a competência pela data de conclusão (`statusChangedAt`). A
fatura, o pagamento e o repasse mostram o estado atual daquelas mesmas
entregas, mesmo quando foram criados depois do fim da competência. Essa escolha
é deliberada: o objetivo é localizar onde o ciclo de cada pedido parou, e não
atribuir artificialmente todas as etapas à mesma data.

O relatório distingue sem dupla contagem:

- valor reconhecido na competência;
- valor das entregas já vinculadas a fatura;
- valor das entregas em faturas pagas com `paymentDate` confirmado;
- créditos de repasse ativos no ledger;
- pedidos online, que não usam fatura e hoje não possuem data de recebimento
  persistida;
- ajustes criados dentro do período selecionado, separados das entregas porque
  não possuem vínculo obrigatório com um pedido.

Cada pedido pode sinalizar preço incompleto, entregador ausente, fatura ausente
ou cancelada, fatura paga sem data, fatura inesperada em pagamento online,
repasse ausente, divergente, duplicado ou cancelado. O valor de repasse é
comparado em centavos com `driverValue`. Pedidos e ajustes são lidos numa
transação `RepeatableRead`, evitando alertas formados por estados de instantes
diferentes.

Arquivos funcionais deste recorte:

- `packages/validation/src/finance/admin-financial-query.schema.ts`;
- `packages/types/src/finance.ts`;
- `packages/api-client/src/admin-financial.ts`;
- `apps/api/src/finance/admin-financial.{controller,service,spec}.ts`;
- `apps/admin-web/src/app/(app)/relatorios/extrato-financeiro/page.tsx`;
- `apps/admin-web/src/app/(app)/relatorios/page.tsx`.

Não houve alteração de schema Prisma, migration, dados existentes, regra de
faturamento, `.env`, secret, cliente mobile ou notificação nativa.

### Verificação

| Comando / fluxo                                           | Resultado                                    |
| --------------------------------------------------------- | -------------------------------------------- |
| `corepack pnpm --filter @motoboycity/validation build`    | aprovado                                     |
| Jest focado em `admin-financial.service.spec.ts`          | 1 suíte e 29 testes aprovados                |
| `corepack pnpm typecheck`                                 | 8 pacotes aprovados                          |
| `corepack pnpm lint`                                      | 8 pacotes aprovados                          |
| `corepack pnpm --filter @motoboycity/api run build`       | aprovado                                     |
| `corepack pnpm --filter @motoboycity/admin-web run build` | aprovado; nova rota entre 33 páginas geradas |
| `git diff --check`                                        | aprovado; somente avisos LF/CRLF do Git      |

Lacuna de validação: não havia servidor local ativo nem sessão admin com massa
controlada para conferir visualmente um ciclo pago, um não faturado e cada tipo
de divergência de repasse. O próximo recorte financeiro recomendado é um fluxo
de caixa projetado, separando recebimentos previstos por vencimento, obrigações
com entregadores por liberação/saque e movimentos efetivamente realizados.

## Atualização — 2026-08-24: previsão e compromissos de caixa

O quinto recorte de controle financeiro avançado foi implementado em
`/relatorios/fluxo-caixa`. O relatório abre por padrão em hoje e nos 29 dias
seguintes, aceita até 93 dias, exporta CSV e organiza uma agenda diária com
quatro colunas que não se misturam: faturas a vencer, repasses que ficarão
sacáveis, recebimentos confirmados e saques efetivamente pagos.

O novo `GET /admin/financial/cash-flow-forecast` é protegido por `JwtAuthGuard`
e `AdminOnlyGuard`, exige `from`/`to` e devolve tanto os totais quanto as linhas
que os explicam. A leitura usa uma transação `RepeatableRead` depois de atualizar
o estado das faturas vencidas. Nenhuma migration ou nova coluna foi necessária.

A semântica evita apresentar um saldo futuro fictício:

- fatura `PENDING`/`OVERDUE` com vencimento no período é expectativa de entrada,
  não recebimento garantido;
- repasse `CREDIT_REPASSE/PENDING` com `releaseAt` no período é obrigação que se
  torna disponível ao entregador, não transferência bancária;
- saques `PENDING`/`APPROVED` ficam numa fila sem data porque o sistema não
  persiste prazo prometido de pagamento;
- recebimento realizado exige fatura `PAID` e `paymentDate` no período;
- saída realizada usa a entrada `PAID` no histórico append-only do saque;
- pedidos faturáveis ainda sem fatura, faturas vencidas antes do período,
  repasses atrasados e repasses legados sem `releaseAt` aparecem como pontos de
  ação separados da agenda.

`Invoice.dueDate` e `Invoice.paymentDate` são `@db.Date` e, portanto, os filtros
usam os limites civis armazenados em meia-noite UTC. `releaseAt`, `changedAt` e
demais timestamps continuam usando os limites do dia operacional de São Paulo.
Essa separação impede excluir o primeiro dia do intervalo ou deslocar eventos
com horário.

A página não calcula saldo projetado: hoje não existem saldo bancário inicial,
despesas operacionais classificadas, data prometida para saque nem data de
recebimento dos pedidos online. O painel explica essas limitações e mantém os
valores fora de uma conta que pareceria precisa sem ter base persistida.

Arquivos funcionais deste recorte:

- `packages/validation/src/finance/admin-financial-query.schema.ts`;
- `packages/types/src/finance.ts`;
- `packages/api-client/src/admin-financial.ts`;
- `apps/api/src/finance/admin-financial.{controller,service,spec}.ts`;
- `apps/admin-web/src/app/(app)/relatorios/fluxo-caixa/page.tsx`;
- `apps/admin-web/src/app/(app)/relatorios/page.tsx`.

Não houve alteração de schema Prisma, migration, dados existentes, regra de
faturamento/saque, `.env`, secret, cliente mobile ou notificação nativa.

### Verificação

| Comando / fluxo                                           | Resultado                                    |
| --------------------------------------------------------- | -------------------------------------------- |
| `corepack pnpm --filter @motoboycity/validation build`    | aprovado                                     |
| Jest focado em `admin-financial.service.spec.ts`          | 1 suíte e 32 testes aprovados                |
| `corepack pnpm typecheck`                                 | 8 pacotes aprovados                          |
| `corepack pnpm lint`                                      | 8 pacotes aprovados                          |
| `corepack pnpm --filter @motoboycity/api run build`       | aprovado                                     |
| `corepack pnpm --filter @motoboycity/admin-web run build` | aprovado; nova rota entre 34 páginas geradas |
| `git diff --check`                                        | aprovado; somente avisos LF/CRLF do Git      |

Lacuna de validação: não havia servidor local ativo nem sessão admin com massa
financeira controlada para conferir visualmente faturas, repasses e saques
reais. O próximo passo de homologação é abrir a página com uma fatura a vencer,
uma vencida anterior, um repasse de cada classificação e um saque pago. Para
evoluir de agenda conhecida para saldo futuro e DRE completo, o próximo recorte
exige decisão de produto e persistência de saldo bancário inicial, despesas e
centros de custo; esses valores não devem ser inferidos do ledger do motoboy.

## Atualização — 2026-08-24: auditoria financeira unificada

Depois do commit `1984fd7` (`feat(admin): add financial cycle and cash forecast
reports`), o sexto recorte de controle financeiro avançado foi implementado em
`/relatorios/auditoria-financeira`. A página reúne em uma cronologia única os
eventos append-only que o produto já persistia separadamente:

- ajustes de carteira (`CREDIT_ADJUSTMENT`, `DEBIT_ADJUSTMENT` e
  `CREDIT_REFUND`), com entregador, direção, estado atual, valor, motivo e autor;
- mudanças de status de fatura, com transição, empresa, valor congelado, nota e
  responsável;
- mudanças de status de saque, com transição, entregador, valor líquido, nota e
  responsável.

O novo `GET /admin/financial/audit-trail` é protegido por `JwtAuthGuard` e
`AdminOnlyGuard`, exige `from`/`to` e limita cada consulta a 31 dias, pois retorna
eventos individuais. As três trilhas são lidas numa transação `RepeatableRead` e
ordenadas juntas por instante. Autor nulo continua apresentado como `Sistema`;
o relatório não atribui uma pessoa quando a origem não registrou usuário.

Os totais de crédito/débito de carteira excluem ajustes atualmente cancelados,
mas esses eventos permanecem visíveis na linha do tempo. Confirmações de
pagamento são calculadas pelas transições para `PAID`, tanto em faturas quanto
em saques. A tela permite filtrar por tipo de evento, origem pessoa/sistema,
buscar referência/pessoa/motivo, paginar e exportar exatamente o recorte visível
para CSV.

Arquivos funcionais deste recorte:

- `packages/validation/src/finance/admin-financial-query.schema.ts`;
- `packages/types/src/finance.ts`;
- `packages/api-client/src/admin-financial.ts`;
- `apps/api/src/finance/admin-financial.{controller,service,spec}.ts`;
- `apps/admin-web/src/app/(app)/relatorios/auditoria-financeira/page.tsx`;
- `apps/admin-web/src/app/(app)/relatorios/page.tsx`.

Não houve alteração de schema Prisma, migration, dados existentes, `.env`,
secret, regra financeira, cliente mobile ou notificação nativa. As mudanças
paralelas em `apps/admin-web/src/components/finance/carteiras-tab.tsx`,
`payouts-aging.tsx` e `demonstrativo-tab.tsx` foram preservadas; as duas primeiras
não pertencem a este recorte e a última é documentada abaixo.

### Verificação

| Comando / fluxo                                              | Resultado                       |
| ------------------------------------------------------------ | ------------------------------- |
| `corepack pnpm --filter @motoboycity/validation build`       | aprovado                        |
| Jest focado em `admin-financial.service.spec.ts`             | 1 suíte e 35 testes aprovados   |
| Jest focado em `admin-financial` e `invoice.service.spec.ts` | 2 suítes e 42 testes aprovados  |
| `corepack pnpm typecheck`                                    | 8 pacotes aprovados             |
| `corepack pnpm lint`                                         | 8 pacotes aprovados, sem avisos |
| `corepack pnpm --filter @motoboycity/api run build`          | aprovado                        |
| `corepack pnpm --filter @motoboycity/admin-web run build`    | aprovado; 35 páginas geradas    |
| HTTP `/relatorios/auditoria-financeira`                      | `200` no servidor local         |
| HTTP `/admin/financial/audit-trail` sem autenticação         | `401`; proteção confirmada      |

Lacuna de validação: não havia sessão administrativa com massa controlada para
inspeção visual dos três tipos de evento. O próximo passo de homologação é gerar
um ajuste, uma confirmação de fatura e o ciclo completo de um saque, conferir a
ordem/autores na tela e comparar o CSV. Conciliação bancária real, saldo futuro
e DRE completo continuam dependendo de contrato novo para saldo bancário,
despesas e centros de custo; não devem ser simulados com o ledger do entregador.

## Atualização — 2026-08-24: demonstrativo por competência consolidado

O commit `e4384ad` adicionou a quinta aba `Demonstrativo` em
`/financeiro?aba=demonstrativo`. A interface consome o contrato real já existente
de `adminFinancialApi.financialStatement`, sem mock e sem criar uma segunda fonte
de cálculo. O período selecionado apresenta pedidos concluídos por competência,
receita bruta, repasse de entregadores, resultado da plataforma, ticket/margem,
pedidos sem preço e ajustes de carteira em bloco separado. Também detalha o
resultado por empresa e modalidade de serviço.

Arquivos funcionais:

- `apps/admin-web/src/app/(app)/financeiro/page.tsx`;
- `apps/admin-web/src/components/finance/demonstrativo-tab.tsx`.

A rota `/financeiro?aba=demonstrativo` respondeu `200` no servidor local e foi
incluída no build aprovado do painel. A inspeção visual autenticada com massa
financeira ainda depende de um navegador conectado e de uma sessão administrativa
controlada. O único item do plano financeiro que permanece é antecipação de saldo,
explicitamente condicionada a decisão/piloto de produto; não deve ser implementada
por inferência.

Durante a validação combinada, o teste novo de cancelamento de fatura expunha
`InvoiceService.getDetail`, que é privado, diretamente ao `jest.spyOn` e quebrava o
typecheck. `apps/api/src/finance/invoice.service.spec.ts` passou a acessar esse seam
somente por uma tipagem interna do teste. Não houve alteração na implementação nem
na regra de cancelamento; as 2 suítes financeiras focadas fecharam com 42 testes
aprovados.

## Atualização — 2026-08-24: limpeza dos marcadores na home da empresa

O mapa da central do Company Web recebia a união de `operations.active` com os
20 pedidos de `operations.recent`. Por isso, pedidos já `COMPLETED` ou
`CANCELLED` continuavam desenhando o destino e, quando disponível, também a
última posição do motoboy. A lista lateral “Recentes” é útil; os mesmos itens no
mapa operacional apenas acumulavam pontos antigos.

`apps/company-web/src/app/(app)/page.tsx` agora mantém dois recortes explícitos:

- `visibleOrders`, com ativos + recentes, preserva seleção, clonagem e a lista
  lateral;
- `mapDeliveries`, somente com `operations.active`, alimenta
  `CompanyOperationsMap`.

Ao concluir ou cancelar um pedido, `delivery:updated` invalida a query e o ponto
sai do mapa quando a nova resposta chega. Se o evento em tempo real for perdido,
o `refetchInterval` de 30 segundos continua como segurança. `FAILED`,
`DELIVERED` e demais estados não terminais permanecem no mapa porque ainda há
motoboy/mercadoria em operação. Não houve alteração de API, contrato, banco,
status, preço, dispatch, GPS ou Socket.IO.

### Verificação

| Comando                                                     | Resultado                    |
| ----------------------------------------------------------- | ---------------------------- |
| `corepack pnpm --filter @motoboycity/company-web typecheck` | aprovado                     |
| `corepack pnpm --filter @motoboycity/company-web lint`      | aprovado, sem avisos         |
| `corepack pnpm --filter @motoboycity/company-web run build` | aprovado; 11 páginas geradas |
| `git diff --check`                                          | aprovado no recorte          |

Lacuna de validação: o Company Web não possui teste automatizado de interface.
Na homologação autenticada, concluir e cancelar um pedido devem removê-lo do
mapa sem removê-lo imediatamente da lista “Recentes”; simular perda do socket
deve confirmar a remoção pelo polling em até 30 segundos.

## Atualização — 2026-08-24: Fase 1 dos relatórios do Company Web

Foi iniciada a execução de `docs/plano-relatorios-company-web.md` pelo recorte
que não exige contrato novo. A antiga tela única de `/relatorios`, que baixava
entregas e faturas completas para somar no navegador, foi substituída por uma
central de cards. A central anuncia somente os dois destinos já concluídos:

- `/relatorios/pedidos`: usa `GET /deliveries/search`, com busca por
  número/UUID/número externo, status, período padrão de 30 dias, filtros na URL,
  paginação real de 10/25/50/100 itens e links para o pedido. O resumo deixa
  explícito que custo e pedidos sem preço pertencem apenas à página visível;
- `/relatorios/tempos-sla`: usa `GET /deliveries/stage-times` duas vezes, para
  o período atual e a janela imediatamente anterior com a mesma duração. Exibe
  média, mediana, p90, amostras e a opção de excluir horários retroativos.

O Company não possui acesso aos limites administrativos de SLA. Por isso a
tela faz comparação descritiva e não classifica um resultado como aprovado ou
reprovado sem uma meta contratual exposta à empresa. `/indicadores` foi mantido
por enquanto; o redirecionamento só entra depois de `/relatorios/geral`.

Foram criados componentes próprios em
`apps/company-web/src/components/reports/` para cabeçalho, filtros, estados de
consulta e paginação. Os filtros aplicados são a fonte de verdade na URL e o
formulário é remontado em Voltar/Avançar, sem sincronizar estado em efeito. Erros
de servidor preservam a mensagem de `ApiError`.

Arquivos funcionais:

- `apps/company-web/src/app/(app)/relatorios/page.tsx`;
- `apps/company-web/src/app/(app)/relatorios/pedidos/page.tsx`;
- `apps/company-web/src/app/(app)/relatorios/tempos-sla/page.tsx`;
- `apps/company-web/src/components/reports/{report-filter-card,report-layout,report-pagination}.tsx`;
- `apps/company-web/src/lib/report-period.ts`.

Não houve alteração de endpoint, backend, validação compartilhada, Prisma,
migration, `.env`, secret, status, dispatch, preço, mobile ou notificação. A API
já deriva o escopo da empresa pelo token e rejeita `companyId`/`driverId` para
usuário não administrador.

### Verificação

| Comando / fluxo                                                      | Resultado                    |
| -------------------------------------------------------------------- | ---------------------------- |
| `corepack pnpm --filter @motoboycity/company-web typecheck`          | aprovado                     |
| `corepack pnpm --filter @motoboycity/company-web lint`               | aprovado, sem avisos         |
| `corepack pnpm --filter @motoboycity/company-web run build`          | aprovado; 14 páginas geradas |
| HTTP `/relatorios`, `/relatorios/pedidos` e `/relatorios/tempos-sla` | `200` nas três rotas         |
| APIs `deliveries/search` e `deliveries/stage-times` sem token        | `401` nas duas rotas         |

Lacunas conhecidas:

- o Company Web não possui teste automatizado de interface nem havia sessão
  autenticada disponível para percorrer filtros, paginação e Voltar/Avançar;
- o DTO genérico de `GET /deliveries/search` ainda transporta `driverValue` e
  `platformValue` para qualquer consumidor. As novas telas nunca renderizam
  esses campos, mas o próximo recorte de contrato deve criar/usar uma resposta
  Company minimizada para que repasse e margem interna nem cheguem ao navegador;
- CSV operacional permanece para a fase de exportação no servidor; não foi
  criado download parcial no cliente;
- a Fase 2 (`GET /company/reports/operations` + `/relatorios/geral`) deve começar
  somente depois que o recorte financeiro concorrente encerrar as alterações em
  `packages/types`, `packages/validation`, `packages/api-client` e FinanceModule.

## Atualização — 2026-08-24: Fase 2 dos relatórios do Company Web

O recorte financeiro foi estabilizado no commit `89c9fb6` e a Fase 2 de
`docs/plano-relatorios-company-web.md` foi implementada. A central agora publica
o card `Analítico geral`, que abre `/relatorios/geral` com filtros de data na
URL, comparação com a janela anterior, distribuição por status, série diária,
valores concluídos, pedidos sem preço, retornos e lotes. A página também liga a
área operacional ao `/financeiro`, sem duplicar posição em aberto ou faturas.

Foi criado `GET /company/reports/operations?from&to`. O endpoint:

- exige `from` e `to`, com limite de 366 dias;
- usa `JwtAuthGuard` + `CompanyOnlyGuard` e resolve `companyId` exclusivamente
  pelo vínculo do usuário autenticado;
- trata pedidos criados (`createdAt`) e entregas concluídas
  (`statusChangedAt`) como coortes independentes;
- soma valores em centavos, separa `unpricedCount` e calcula ticket somente com
  entregas concluídas que possuem preço;
- agrupa dias e horários em `America/Sao_Paulo`, incluindo dias zerados na
  série diária;
- devolve modalidade, retorno e lote, mas nunca `driverValue`,
  `platformValue`, carteira, oferta ou dados de outra empresa.

`/indicadores` agora redireciona para `/relatorios/geral` e o item duplicado
“Indicadores” foi removido da navegação. Links antigos continuam válidos.

Arquivos funcionais deste recorte:

- `packages/types/src/report.ts`;
- `packages/validation/src/reports/company-operations-report-query.schema.ts`;
- `packages/api-client/src/company-reports.ts`;
- `apps/api/src/company/reports/company-reports.{module,controller,service,spec}.ts`;
- `apps/api/src/app.module.ts`;
- `apps/company-web/src/lib/api-client.ts`;
- `apps/company-web/src/app/(app)/relatorios/geral/page.tsx`;
- `apps/company-web/src/app/(app)/indicadores/page.tsx`;
- `apps/company-web/src/components/layout/top-nav.tsx`;
- `apps/company-web/src/app/(app)/relatorios/page.tsx`.

Não houve schema Prisma, migration, alteração de dados, `.env`, secret, preço,
dispatch, GPS, mobile ou notificação nativa.

### Verificação

| Comando / fluxo                                             | Resultado                       |
| ----------------------------------------------------------- | ------------------------------- |
| `corepack pnpm typecheck`                                   | 8 pacotes aprovados             |
| `corepack pnpm lint`                                        | 8 pacotes aprovados, sem avisos |
| Jest `company-reports.service.spec.ts`                      | 1 suíte e 8 testes aprovados    |
| `corepack pnpm --filter @motoboycity/validation build`      | aprovado                        |
| `corepack pnpm --filter @motoboycity/api run build`         | aprovado                        |
| `corepack pnpm --filter @motoboycity/company-web run build` | aprovado; 15 páginas geradas    |

Lacunas conhecidas: ainda falta homologação visual com sessão Company e massa
controlada; o endpoint genérico `GET /deliveries/search`, usado pelo Histórico,
ainda transporta campos internos no DTO embora a tela não os renderize; não há
E2E com duas empresas; e a exportação operacional minimizada continua pendente.
O próximo passo concreto é a Fase 3: criar as páginas `/relatorios/horarios` e
`/relatorios/modalidades` consumindo `peakHours` e `serviceTypes` já entregues
pelo novo contrato, sem novo endpoint.

## Atualização — 2026-08-24: Fase 3 dos relatórios do Company Web

A Fase 3 de `docs/plano-relatorios-company-web.md` foi implementada sem novo
endpoint, schema ou contrato. As duas páginas consomem o
`GET /company/reports/operations` já protegido e publicado na Fase 2:

- `/relatorios/horarios`: mostra demanda nas 24 horas, média por dia civil,
  faixas exclusivas de madrugada/manhã/tarde/noite, três horários de maior
  movimento e dias da semana normalizados pela quantidade de ocorrências no
  calendário. Pedidos cancelados continuam na demanda porque foram criados e
  exigiram operação;
- `/relatorios/modalidades`: oferece busca e ordenação persistidas na URL,
  participação em volume criado e custo concluído, ticket médio, preço ausente,
  retorno, cards comparativos e tabela com denominadores. A tela soma em
  centavos e sinaliza se o total por modalidade não reconciliar com o total do
  Analítico geral.

Os cards `Horários e demanda` e `Modalidades e custos` só foram publicados na
central depois que seus destinos ficaram funcionais. Foi criado o hook local
`useCompanyOperationsReport` para manter período, limite de 366 dias, URL,
sessão, TanStack Query e `ApiError` iguais nas páginas desta fase. A comparação
com a janela anterior é exibida apenas para os totais entregues pelo contrato;
o cliente não inventa séries anteriores por hora ou modalidade.

Arquivos funcionais deste recorte:

- `apps/company-web/src/app/(app)/relatorios/horarios/page.tsx`;
- `apps/company-web/src/app/(app)/relatorios/modalidades/page.tsx`;
- `apps/company-web/src/app/(app)/relatorios/page.tsx`;
- `apps/company-web/src/components/reports/report-layout.tsx`;
- `apps/company-web/src/components/reports/use-company-operations-report.ts`;
- `docs/plano-relatorios-company-web.md`.

Não houve alteração de API, Prisma, migration, dado, `.env`, secret, preço,
financeiro, dispatch, GPS, app mobile ou notificação nativa. A migration e os
contratos de aviso de pagamento presentes em paralelo no worktree foram
preservados e não fazem parte desta fase.

### Verificação

| Comando / fluxo                                             | Resultado                    |
| ----------------------------------------------------------- | ---------------------------- |
| `corepack pnpm --filter @motoboycity/company-web typecheck` | aprovado                     |
| `corepack pnpm --filter @motoboycity/company-web lint`      | aprovado, sem avisos         |
| `corepack pnpm --filter @motoboycity/company-web run build` | aprovado; 17 páginas geradas |

Lacunas conhecidas: falta inspeção visual com uma sessão Company e massa que
tenha pedidos em vários horários/modalidades; comparação detalhada por bucket
anterior exigiria extensão aditiva do contrato; CSV permanece reservado à Fase 6. O próximo passo concreto é a Fase 4: ampliar de forma aditiva os filtros da
busca e implementar `/relatorios/retornos-lotes`, sem tocar no aviso de
pagamento concorrente.

## Atualização — 2026-08-24: aviso de pagamento da empresa com confirmação administrativa

Foi concluída a etapa 10 de `docs/plano-financeiro-company-web.md`. A empresa
agora pode usar **Já paguei** em uma fatura aberta para informar valor, data e
observação. Essa ação cria `InvoicePaymentNotice` e não altera a fatura. O
admin recebeu a aba **Avisos de pagamento** no Financeiro, com fila de
pendentes/confirmados/recusados, diferença contra o total, confirmação e recusa
com motivo. Ao reabrir **Já paguei**, a empresa vê se já existe aviso pendente
ou o motivo da última recusa; a consulta só roda quando o diálogo abre, evitando
uma requisição adicional por linha da tabela.

A baixa continua tendo um único núcleo: `InvoiceService.markPaid`. Ele foi
extraído para `markPaidWithinTransaction`, usado tanto pela rota manual quanto
pela confirmação do aviso. Na confirmação, reservar o aviso, marcar a fatura
como paga e escrever `InvoiceStatusHistory` ocorrem na mesma transação. Uma
falha em qualquer passo mantém o aviso pendente e a fatura no estado anterior.
Confirmação e recusa usam atualização condicional para impedir duas decisões
concorrentes.

A migration aditiva `20260824105857_aviso_de_pagamento_da_loja` cria enum,
tabela, relações e índices. Foi acrescentado um índice único parcial para
garantir no PostgreSQL no máximo um aviso `PENDING` por fatura; avisos recusados
ou confirmados permanecem no histórico e não impedem um novo envio. A API
também traduz a violação concorrente para HTTP 409. Data civil inválida, valor
com mais de dois centavos e status de fila desconhecido retornam HTTP 400.

Arquivos principais deste recorte:

- `apps/api/prisma/schema.prisma` e
  `apps/api/prisma/migrations/20260824105857_aviso_de_pagamento_da_loja/migration.sql`;
- `apps/api/src/finance/{payment-notice.controller,payment-notice.service,payment-notice.service.spec,invoice.service,finance.module}.ts`;
- `apps/api/test/payment-notice.e2e-spec.ts`;
- `packages/types/src/finance.ts`;
- `packages/validation/src/finance/payment-notice.schema.ts` e seu export;
- `packages/api-client/src/payment-notice.ts` e seu export;
- `apps/company-web/src/components/finance/{payment-notice-dialog,faturas-tab}.tsx`;
- `apps/admin-web/src/components/finance/avisos-tab.tsx` e
  `apps/admin-web/src/app/(app)/financeiro/page.tsx`;
- clientes locais dos dois painéis;
- `docs/business-rules.md` e `docs/plano-financeiro-company-web.md`.

### Verificação

| Comando / fluxo                                                        | Resultado                                                   |
| ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| `prisma validate`                                                      | schema válido                                               |
| `prisma generate`                                                      | Client 6.19.3 gerado                                        |
| build de `@motoboycity/validation`                                     | aprovado                                                    |
| TypeScript da API                                                      | aprovado                                                    |
| TypeScript de `company-web` e `admin-web`                              | aprovados                                                   |
| lint focado nos 6 pacotes afetados                                     | aprovado, sem avisos                                        |
| Jest `invoice.service.spec.ts` + `payment-notice.service.spec.ts`      | 2 suítes e 27 testes aprovados                              |
| migration deploy em `motoboycity_e2e_local`                            | 6 migrations pendentes aplicadas; banco de dev não alterado |
| Jest `payment-notice.e2e-spec.ts` com PostgreSQL isolado e Redis DB 15 | 1 suíte e 13 testes aprovados                               |

O E2E comprova explicitamente: a empresa não quita a própria dívida; empresa B
não acessa a fatura da A; duas criações simultâneas resultam em 201/409 e uma
única linha pendente; confirmação concorrente não duplica baixa; falha da baixa
desfaz a confirmação; recusa exige motivo e permite novo aviso.

Nenhuma migration foi aplicada em banco compartilhado, staging ou produção;
antes disso continuam obrigatórios backup/restore, validação em cópia de
staging e plano de rollback. Nenhum `.env` ou secret foi editado ou exibido. A
árvore local de dependências precisou ser restaurada em modo `node-linker=hoisted`
porque a instalação isolada do pnpm ficou presa no Windows; isso alterou apenas
`node_modules`, não o lockfile. O próximo passo concreto é homologar visualmente
o diálogo da empresa e a fila do admin com sessões reais e, depois, seguir a
Fase 4 dos relatórios Company Web.

## Atualização — 2026-08-24: avatar no ImageKit e perfil do entregador

Foi implementado o primeiro recorte de foto de perfil com armazenamento no
ImageKit. A nova rota autenticada `POST /profile/avatar` recebe o campo
multipart `file`, limita o upload a 5 MB e valida os bytes reais de JPEG, PNG
ou WebP, a estrutura e dimensões de até 4096 x 4096 antes de chamar o provedor.
A rota tem limite dedicado de cinco tentativas por minuto. Depois do upload,
a API ainda exige que o ImageKit devolva tipo `image`, largura e altura válidas;
caso contrário remove o arquivo e rejeita a requisição. A API nunca persiste o
binário: atualiza somente `User.avatarExternalFileId` e `User.avatarUrl`, campos que já existiam
no schema e na migration inicial; portanto não houve mudança Prisma nem nova
migration.

A substituição preserva consistência entre os dois sistemas. A imagem é
enviada primeiro, a referência do usuário é trocada em transação
`Serializable` com retry de `P2034`, e a imagem anterior é removida depois do
commit em modo best effort. Se a transação falhar, a API tenta remover a
imagem recém-enviada para evitar arquivo órfão. `GET /auth/me` e o resultado de
login agora incluem `avatarUrl`, e o contrato `AuthUser` e o cliente HTTP
compartilhado foram atualizados no mesmo recorte.

No app do entregador, a tela **Perfil** permite escolher uma foto da galeria,
com redução para no máximo 1024 x 1024, qualidade 0,8, validação local de 5 MB,
estado de envio e mensagens de erro. A foto também aparece no menu lateral.
O iOS recebeu a descrição de acesso à biblioteca; o Android usa o seletor de
fotos fornecido por `react-native-image-picker`, sem permissão ampla de
armazenamento. Para Android 24–29 foram acrescentados AndroidX Activity 1.9.3
e o gatilho oficial de instalação do Photo Picker por Google Play Services.

Arquivos principais:

- `apps/api/src/media/{imagekit.module,imagekit.service,imagekit.service.spec}.ts`;
- `apps/api/src/profile/{profile.module,profile.controller,profile.service,profile.service.spec}.ts`;
- `apps/api/src/auth/{auth.controller,auth.service,auth.service.spec}.ts`;
- `packages/types/src/user.ts` e `packages/api-client/src/auth.ts`;
- `apps/driver-app/src/screens/ProfileScreen.tsx`;
- `apps/driver-app/src/components/DrawerMenu.tsx`;
- `apps/driver-app/ios/DriverApp/Info.plist`;
- `apps/driver-app/android/app/build.gradle` e `android/app/src/main/AndroidManifest.xml`;
- manifests, `pnpm-lock.yaml` e `apps/api/.env.example`.

Com autorização explícita do usuário, somente as quatro variáveis já
existentes do ImageKit foram descomentadas em `apps/api/.env`; os valores não
foram exibidos, copiados para documentação nem versionados. O exemplo mantém
apenas nomes com valores vazios. As dependências novas são
`@imagekit/nodejs@7.11.0` e `react-native-image-picker@8.2.1`.

Durante a inclusão filtrada das dependências, o pnpm 11.20.0 reescreveu
contextos de peer dependencies de Jest sem o snapshot correspondente e deixou
links antigos inacessíveis no Windows. O lockfile original foi preservado em
backup temporário, regenerado a partir dos manifests e corrigido para manter os
contextos já válidos; `node_modules` foi reconstruído com o linker padrão
`isolated` e com scripts desativados. Nenhum `postinstall`, migration, seed,
Docker ou build nativo foi executado.

### Verificação

| Comando / fluxo                                    | Resultado                               |
| -------------------------------------------------- | --------------------------------------- |
| instalação com lock congelado e `--ignore-scripts` | aprovada; 9 projetos, linker `isolated` |
| typecheck completo do monorepo                     | aprovado nos 8 projetos                 |
| lint de API, driver-app, api-client e types        | aprovado nos 4 projetos                 |
| Jest focado em ImageKit, perfil e autenticação     | 3 suítes e 29 testes aprovados          |
| Jest unitário completo da API                      | 57 suítes e 652 testes aprovados        |
| Jest completo do driver-app                        | 8 suítes e 58 testes aprovados          |
| build da API                                       | aprovado                                |
| `git diff --check`                                 | aprovado                                |

Não foi feito upload real no ImageKit para não criar mídia externa durante a
validação automatizada, nem build Android/iOS. O próximo passo concreto é
homologar em aparelho Android com a API local: selecionar JPEG/PNG/WebP,
confirmar persistência após novo login, verificar a foto no menu e testar
arquivo inválido/maior que 5 MB. A página de perfil da empresa com interface
de foto continua sendo um recorte posterior e poderá reutilizar a mesma rota.
Se a exclusão best effort de um avatar antigo falhar após o commit, o arquivo
pode permanecer órfão no ImageKit; uma rotina assíncrona de reconciliação ainda
é melhoria futura, sem reverter a foto nova já confirmada ao usuário.

## Atualização — 2026-08-24: perfil do usuário da empresa no Company Web

O backend e o app do entregador do recorte anterior foram salvos no commit
`7da5a23` (`feat(profile): add ImageKit avatar uploads`). Em seguida, o Company
Web recebeu a rota autenticada `/perfil`, que reutiliza `GET /auth/me` e
`POST /profile/avatar`. A tela mostra nome e e-mail somente para leitura,
iniciais quando não existe foto, imagem atual do ImageKit e escolha de JPEG,
PNG ou WebP com limite local de 5 MB. O arquivo é enviado imediatamente como
`FormData` no campo `file`; a validação estrutural e de dimensões continua sendo
responsabilidade definitiva da API.

O avatar do topo passou a mostrar a mesma consulta TanStack Query usada pela
página, então a nova foto aparece no menu assim que a API confirma o upload.
O menu da conta agora identifica o usuário e oferece **Meu perfil** e **Sair**.
Estados de carregamento, erro, excesso de tentativas e sucesso são explícitos;
o controle de arquivo informa formatos/limite para tecnologia assistiva e a
imagem decorativa do gatilho não duplica seu nome acessível.

Durante a revisão foi fechado um risco preexistente de troca de empresa no
mesmo navegador. O `AuthGate` preenche o cache da identidade somente enquanto
continua montado, e login, logout, token ausente ou autenticação inválida limpam
todo o `QueryClient`. Assim pedidos, financeiro, relatórios e dados de uma
empresa não sobrevivem no cache ao entrar com outra. Uma resposta de upload
atrasada também só atualiza o avatar se o token que iniciou a operação ainda for
o token da sessão.

Esta é a foto do `User` autenticado da empresa, não um logotipo compartilhado
entre todos os membros. Um logo corporativo continua exigindo um campo e um
contrato próprios em `Company`.

Arquivos funcionais:

- `apps/company-web/src/app/(app)/perfil/page.tsx`;
- `apps/company-web/src/lib/auth-user-query.ts`;
- `apps/company-web/src/components/layout/top-nav.tsx`;
- `apps/company-web/src/components/auth/auth-gate.tsx`;
- `apps/company-web/src/app/login/page.tsx`;
- `docs/business-rules.md`.

Não houve nova rota de API, contrato compartilhado, Prisma, migration,
dependência, `.env`, secret, preço, dispatch, GPS ou alteração de notificação.

### Verificação

| Comando / fluxo                                                                                   | Resultado                    |
| ------------------------------------------------------------------------------------------------- | ---------------------------- |
| `corepack pnpm --config.verify-deps-before-run=false --filter @motoboycity/company-web typecheck` | aprovado                     |
| `corepack pnpm --config.verify-deps-before-run=false --filter @motoboycity/company-web lint`      | aprovado, sem avisos         |
| `corepack pnpm --config.verify-deps-before-run=false --filter @motoboycity/company-web run build` | aprovado; 18 páginas geradas |
| revisão independente de sessão, upload e acessibilidade                                           | sem bloqueador remanescente  |

Não foi realizado upload real para evitar criar mídia externa durante a
validação automatizada. A inspeção visual também ficou pendente porque não
havia navegador conectado nem servidor local ativo. O próximo passo concreto é
homologar `/perfil` com uma sessão Company real: trocar a foto, recarregar,
sair/entrar, alternar entre duas empresas e testar formato inválido e arquivo
maior que 5 MB.

## Atualização — 2026-08-24: cadastro de empresa, redefinição de senha e WhatsApp de fatura

Foram adicionados ao Admin Web os três fluxos administrativos solicitados. A
aba **Empresas** agora abre um diálogo de cadastro com razão social, nome
fantasia, CPF/CNPJ, região ativa, responsável, e-mail, WhatsApp e senha
inicial. A API expõe `GET /admin/companies/registration-options` e
`POST /admin/companies`, ambos protegidos por JWT + `AdminOnlyGuard`. A criação
reutiliza a transação de autenticação, agora com região explícita, isolamento
`Serializable`, retry de conflito e tradução de duplicidade. Empresa e
responsável são gravados juntos e o status inicial permanece
`PENDING_APPROVAL`.

As páginas de detalhe do entregador e da empresa passaram a oferecer
**Alterar senha**. As novas rotas são
`PATCH /admin/drivers/:id/password` e
`PATCH /admin/companies/:id/team-members/:memberId/password`. No caso da
empresa, somente um `OWNER` ativo e pertencente ao `companyId` informado pode
ser alvo. A API recebe apenas `{ password }`, aplica bcrypt e devolve somente o
`userId`; senha e hash não entram na resposta ou em eventos.

Tokens novos carregam `credentialVersion`, um SHA-256 do hash bcrypt atual.
`JwtStrategy` e o handshake Socket.IO comparam essa impressão com a credencial
persistida; a troca do hash revoga os tokens anteriores sem migration e a API
derruba sockets já conectados ao usuário. Tokens legados sem a claim também
são rejeitados, produzindo um logout único após a implantação desta versão.
Não houve alteração na decisão de JWT em `localStorage`, prazo de sete dias ou
ausência de refresh token.

No reset de motoboy, a API também grava `availability=UNAVAILABLE`, fecha logs
de presença, remove a presença viva do Redis e devolve ofertas pendentes para o
dispatch. Hash novo, `UNAVAILABLE` e fechamento do log pertencem à mesma
transação. Redis e fila são limpos depois do commit, com até três tentativas;
uma falha externa não transforma um reset já confirmado em resposta enganosa de
erro. A expiração de oferta é idempotente também quando `EXPIRED` já foi
persistido: ela retoma o redespacho, e o job de timeout só é removido ao final.
Ao criar uma oferta, todos os jobs de timeout precisam ser confirmados; se
qualquer `queue.add` falhar, todas as ofertas recém-criadas são movidas
condicionalmente de `PENDING` para `EXPIRED`, jobs parciais são removidos em
best effort e o erro original é relançado. Assim uma falha do Redis não deixa
pedido bloqueado por uma oferta sem prazo.

O handshake Socket.IO registra o usuário antes da consulta da credencial,
permitindo que um reset encerre também uma conexão ainda em autenticação.
`setAvailability` e `heartbeat` usam escrita condicional pelo hash que
autenticou a requisição, fechando a corrida em que um request antigo poderia
religar a presença depois da troca.

No detalhe administrativo da fatura, o painel consulta os membros da empresa,
seleciona somente responsáveis ativos com telefone brasileiro válido e abre
`wa.me` com mensagem revisável. Havendo mais de um responsável, o admin escolhe
explicitamente o contato antes de liberar o botão. Falha ao carregar os contatos
é mostrada como erro recuperável, e não como telefone ausente. A mensagem inclui
somente empresa, número, valor, vencimento e quantidade de pedidos; inclusive a
saudação não leva o nome pessoal. Não há token ou link autenticado. O WhatsApp
exige confirmação manual do envio e não anexa PDF. Refetch em segundo plano
mantém o botão disponível quando já existem contatos em cache; o estado de
carregamento bloqueia a ação somente quando ainda não há dados utilizáveis.

Cadastro de empresa e redefinições de senha registram nos logs da API o ID do
administrador e os IDs dos alvos, sem senha ou hash. O schema ainda não possui
uma trilha genérica append-only para ações de segurança; criar essa persistência
exige decisão de retenção e uma migration aditiva separada.

Os dois recortes de avatar pedidos nesta mesma sequência já estavam completos:
`/perfil` no Company Web e upload/visualização no app do entregador, ambos via
`POST /profile/avatar` e ImageKit. Não foram duplicados nem alterados aqui.

Arquivos principais deste recorte:

- `apps/api/src/admin/{companies,drivers}/`;
- `apps/api/src/auth/{auth.service,credential-fingerprint,jwt.strategy}.ts`;
- `apps/api/src/realtime/realtime.gateway.ts`;
- `apps/api/src/driver-presence/driver-presence.service.ts`;
- `packages/validation/src/admin/{create-company,change-password}.schema.ts`;
- `packages/types/src/{company,user}.ts` e clientes HTTP administrativos;
- `apps/admin-web/src/components/companies/create-company-dialog.tsx`;
- `apps/admin-web/src/components/users/change-password-dialog.tsx`;
- `apps/admin-web/src/components/finance/invoice-whatsapp-dialog.tsx`;
- `apps/admin-web/src/lib/whatsapp.ts`.

### Verificação

| Comando / fluxo                               | Resultado                        |
| --------------------------------------------- | -------------------------------- |
| typecheck completo do monorepo                | 8 projetos aprovados             |
| lint completo do monorepo                     | 8 projetos aprovados             |
| Jest unitário completo da API                 | 58 suítes e 677 testes aprovados |
| testes de normalização/mensagem WhatsApp      | 3 testes aprovados               |
| build da API e build de produção do Admin Web | aprovado                         |
| `git diff --check`                            | aprovado                         |

Foram acrescentados E2E para guards, criação administrativa, região inválida
sem resíduo, troca de senha, rejeição da senha anterior e revogação do token.
Eles não foram executados nesta sessão porque PostgreSQL e Redis isolados não
foram provisionados. Nenhuma migration, seed, Docker, `.env` ou secret foi
alterado. A API local foi reiniciada e voltou a escutar na porta 3333; os dois
painéis permaneceram nas portas 3000 e 3001. O próximo passo concreto é
homologar os três diálogos com uma sessão administrativa real e executar os
dois E2E em banco/Redis isolados.

## Atualização — 2026-08-24: Blueprint de infraestrutura para o Render

O arquivo raiz `render.yaml`, criado em sessão concorrente e incluído no mesmo
push a pedido do usuário, descreve PostgreSQL 15, Redis com política
`noeviction` e a API NestJS no plano gratuito do Render. O build parte da raiz
do monorepo, instala com lockfile congelado, gera o Prisma Client, executa
`prisma migrate deploy` e compila a API; o processo de execução reutiliza o
script `start:prod` do pacote. Os dois painéis web continuam fora do Blueprint
e estão destinados à Vercel.

`DATABASE_URL` e `REDIS_URL` são ligados pelos serviços do próprio Blueprint,
e `JWT_SECRET` é gerado pelo Render. CORS, Google Maps, Groq, Firebase,
ImageKit e credenciais do administrador inicial aparecem apenas como
`sync: false`: os valores precisam ser preenchidos manualmente no painel e não
foram adicionados ao repositório público. Os únicos valores persistidos no YAML
são configurações não secretas, como `NODE_ENV`, throttling, modelo e timeout
do Groq.

O Blueprint não foi aplicado nesta sessão e nenhum recurso externo, banco,
migration ou seed foi criado. Se ele já estiver conectado ao repositório, um
push em `main` pode iniciar o fluxo automático configurado no Render; antes de
usar dados compartilhados continuam obrigatórios backup/restore e validação da
migration em cópia de staging. Após o primeiro provisionamento ainda será
necessário informar `CORS_ORIGINS`, preencher os segredos no painel e executar
o seed administrativo uma única vez.

## Atualização — 2026-08-24: isolamento do E2E de cadastro de entregador

O primeiro CI após o recorte administrativo chegou aos E2E com migrations e
seed aprovados, mas `admin-drivers.e2e-spec.ts` assumia que existia uma
modalidade ativa criada pelo seed. O seed mínimo cria somente a região padrão e
o administrador; por isso cinco casos da mesma suíte falharam em cascata,
enquanto as outras 21 suítes passaram.

A suíte agora cria uma modalidade exclusiva no próprio `beforeAll`, usa seu ID
nos casos de cadastro e configuração inválida e a remove no `afterAll`, depois
de apagar os vínculos dos entregadores de teste. A mudança é somente de fixture
E2E: não altera schema, rota, regra de negócio ou dado de produção. A validação
definitiva continua no workflow com PostgreSQL e Redis isolados; nenhum banco
local ou compartilhado foi usado para reproduzir o teste.

O segundo CI confirmou a correção da modalidade (os cinco casos anteriores
avançaram), mas o último login da suíte recebeu `429`: os dois logins usados
apenas para montar os tokens de admin e entregador já consumiam parte do limite
dedicado de cinco chamadas por minuto do `AuthController`. O setup passou a
obter esses dois tokens diretamente pelo `AuthService`; as verificações HTTP de
senha anterior, senha nova e login bloqueado por rejeição continuam passando
pela rota real. Os testes próprios de login permanecem em suítes separadas.

## Atualização — 2026-08-24: vínculo ativo e criação idempotente de pedidos

O acesso de `COMPANY_MEMBER` agora exige um `CompanyTeamMember` ativo. A
checagem ocorre no login, na validação de todo JWT e nos resolvedores de empresa
usados por pedidos, endereço, relatórios, financeiro, faturas e avisos de
pagamento. Assim, desativar o vínculo invalida também sessões já emitidas e não
deixa rotas antigas dependerem apenas do guard de tipo de usuário. Nenhum
status, papel ou regra de aprovação da empresa foi alterado.

As criações `POST /deliveries` e `POST /deliveries/batch` aceitam agora o campo
opcional `idempotencyKey`, validado como UUID. Os dois formulários do Company
Web geram uma chave por tentativa lógica, reutilizam a mesma chave quando o
usuário repete o mesmo formulário após erro e geram outra quando o conteúdo
muda. A API deriva IDs UUID v8 determinísticos, com escopo por empresa e por
tipo de criação. Portanto, o banco resolve cliques simultâneos pela chave
primária existente, sem migration, e o retry devolve o pedido ou lote vencedor
sem criar novos endereços ou entradas de histórico.

Quando o commit ocorreu mas a resposta, o dispatch ou o agendamento falhou, o
retry retoma somente o efeito externo. `dispatchDelivery` já é idempotente e o
job de ativação já usa `jobId` baseado no pedido. Uma repetição não republica
`DELIVERY_CREATED`; a tela invalida suas consultas ao receber a resposta e lê o
estado persistido atual. O campo permanece opcional para preservar clientes
existentes, mas os fluxos atuais do Company Web sempre o enviam.

Arquivos principais deste recorte:

- `apps/api/src/auth/{auth.service,jwt.strategy}.ts`;
- resolvedores de empresa em `apps/api/src/{company,deliveries,finance}/`;
- `apps/api/src/deliveries/deliveries.service.ts`;
- `packages/validation/src/deliveries/create-delivery.schema.ts`;
- `packages/types/src/delivery.ts`;
- formulários de operação e `apps/company-web/src/lib/idempotency.ts`.

### Verificação

| Comando / fluxo                                 | Resultado                                   |
| ----------------------------------------------- | ------------------------------------------- |
| build de `@motoboycity/validation`              | aprovado                                    |
| typecheck completo do monorepo                  | 8 projetos aprovados                        |
| lint completo do monorepo                       | 8 projetos aprovados                        |
| Jest unitário completo da API                   | 58 suítes e 687 testes aprovados            |
| build da API e build de produção do Company Web | aprovado                                    |
| `git diff --check`                              | aprovado antes da atualização deste handoff |

Os testes cobrem vínculo inativo no login e em token existente, retry após
resposta perdida, reativação de pedido agendado e colisão concorrente `P2002`
para pedido avulso e lote. E2E não foi executado porque PostgreSQL e Redis
isolados não foram provisionados. Nenhuma migration, seed, Docker, `.env` ou
secret foi alterado. Próximo passo concreto: executar os E2E em serviços
isolados e então seguir pelos achados médios registrados em
`docs/auditoria-company-web.md`.

## Atualização — 2026-08-24: conclusão da auditoria do Company Web

Os achados médios e baixos de `docs/auditoria-company-web.md` foram corrigidos
sem alterar migrations ou regras de cobrança. A resposta de faturas da empresa
agora usa contratos públicos próprios e não contém repasse do entregador nem
margem da plataforma, inclusive no JSON. As rotas administrativas continuam
recebendo o contrato financeiro completo. Emissão, vencimento e pagamento são
tratados como datas civis; o filtro da API compara diretamente os dias
`@db.Date`, sem deslocamento pelo fuso de São Paulo. Horários operacionais, como
conclusão e histórico, continuam formatados como instante.

Os estados de erro do endereço, modalidades, central, rastreamento, pedidos e
faturas não caem mais em mensagens positivas de vazio. Uma falha transitória em
`/auth/me` preserva a credencial e oferece nova tentativa; o token só é removido
em `401` ou `403`. Os três cancelamentos do painel pedem confirmação, e o modal
explicita quando a ação alcança todo o lote.

O acompanhamento logo após criar um pedido consulta somente o `batchId` ou o
`deliveryId` gerado. Esses filtros são UUIDs validados na rota de operações e
sempre se combinam com o escopo da empresa. Nesse recorte a API devolve todos os
terminais recentes, sem o limite global de vinte; por isso um lote de até
cinquenta itens não pode declarar aceite enquanto faltarem pedidos. O modal
também distingue erro, carregamento incompleto, cancelamento e aceite parcial.
O detalhe de pedido atualiza o status principal a cada dez segundos até chegar
a `COMPLETED` ou `CANCELLED`, permitindo que uma tela aberta antes do aceite
ative o rastreamento assim que o motoboy assumir a entrega.

A lista `/pedidos` passou a usar busca paginada no servidor, com 25 itens por
página e filtros de texto/status aplicados na API. A central operacional obtém
contagens por `groupBy`, em vez de carregar todos os status históricos. O
endpoint legado `GET /deliveries` permanece sem paginação para compatibilidade,
mas a tela atual não o usa para o histórico. Relatórios operacionais e a série
financeira percorrem lotes de quinhentas linhas mantendo somente agregados; o
SLA também percorre históricos em páginas, guarda apenas amostras necessárias
ao cálculo exato e limita o intervalo a 366 dias.

As duas somas monetárias apontadas na auditoria passaram a operar em centavos
inteiros: custo conhecido no relatório e fechamento da fatura. Há testes para
o caso `0,1 + 0,2`, isolamento do DTO público da fatura, data civil, paginação,
agregação, limite de SLA, estados operacionais e lote terminal sem truncamento.

Arquivos principais deste recorte:

- `apps/api/src/{deliveries,finance,company/reports}/`;
- `apps/company-web/src/app/(app)/{pedidos,faturas,relatorios}/`;
- `apps/company-web/src/components/{auth,finance,operations}/`;
- `packages/{types,validation,api-client}/`.

### Verificação

| Comando / fluxo                    | Resultado                        |
| ---------------------------------- | -------------------------------- |
| build de `@motoboycity/validation` | aprovado                         |
| typecheck completo do monorepo     | 8 projetos aprovados             |
| lint completo do monorepo          | 8 projetos aprovados, sem avisos |
| Jest unitário completo da API      | 58 suítes e 699 testes aprovados |
| build da API                       | aprovado                         |
| build de produção do Company Web   | aprovado, 18 rotas               |

E2E não foi executado porque PostgreSQL e Redis isolados não foram
provisionados. Nenhuma migration, seed, Docker, `.env` ou secret foi alterado.
O próximo passo concreto é executar os E2E nos serviços isolados e fazer um
smoke test das rotas de pedidos, faturas e relatórios com uma sessão real de
empresa e lotes de tamanhos 1, 20 e 50.

## Atualização — 2026-08-24: acabamento do widget e da fatura administrativa

O widget “Atividade ao vivo” do Admin Web recolhido ocupa agora somente um
botão circular de 44 px, com estado de conexão visível e rótulo acessível. O
conteúdo principal reserva espaço inferior para o botão, evitando que paginação
e ações de rodapé fiquem cobertas. Aberto, o painel conserva a largura e o feed
anteriores. A alteração é somente visual e não muda conexão Socket.IO nem a
lógica do feed.

O detalhe administrativo da fatura marca pedidos que possuem retorno e exibe o
valor desse componente ao lado do número do pedido. O campo permanece exclusivo
do contrato administrativo; o contrato público da empresa continua sem repasse
ou margem interna.

Validação final deste recorte: typecheck, lint e build de produção do Admin Web
aprovados; o build gerou 35 páginas. Nenhum `.env`, secret ou arquivo de sessão
Kotlin faz parte do conjunto preparado para commit.

## Atualização — 2026-08-24: auditoria do aplicativo do motoboy

A auditoria de `apps/driver-app` foi concluída e registrada em
`docs/auditoria-driver-app.md`. O escopo incluiu as 12 telas React Native, os 13
arquivos Kotlin, os clientes compartilhados e os serviços de API diretamente
ligados a sessão, presença, dispatch, transições e saque. Nenhum código da
aplicação, contrato, schema, migration ou configuração foi alterado; esta rodada
produziu somente documentação.

Foram confirmados cinco achados altos: uma corrida entre dois dispatches pode
criar ofertas simultâneas do mesmo motoboy, que se substituem nos três
apresentadores do app; falha
transitória em `/auth/me` limpa somente a sessão JavaScript e pode deixar push,
tracking e sessão nativa ativos; aceite confirmado com resposta perdida não é
reconciliado; o serviço pode confirmar início do tracking apesar de usar somente
`GPS_PROVIDER` e não receber posições; saque não possui identidade idempotente e
pode ser solicitado duas vezes após perda de resposta.

Os achados médios cobrem ambiguidade e concorrência nas transições de coleta e
entrega, acúmulo serial de envios de GPS em lotes sob rede ruim, ações principais
irreversíveis no primeiro toque e cronômetro React Native relativo que envelhece
durante suspensão. A lacuna baixa é específica de cobertura: as oito suítes não
exercitam os lifecycles e falhas acima, apesar de estarem verdes.

### Verificação

| Comando / fluxo                        | Resultado                        |
| -------------------------------------- | -------------------------------- |
| typecheck de `@motoboycity/driver-app` | aprovado                         |
| lint de `@motoboycity/driver-app`      | aprovado                         |
| Jest do Driver App                     | 8 suítes e 58 testes aprovados   |
| build Android                          | não executado, conforme o escopo |

As primeiras execuções dentro do sandbox não conseguiram atravessar os junctions
do PNPM (`EPERM`/módulos ausentes); os mesmos três comandos foram repetidos fora
do isolamento e passaram. Alterações paralelas já existentes em Admin Web,
pricing da API e API client não foram tocadas nem avaliadas como parte desta
auditoria. Próximo passo concreto: corrigir primeiro a exclusividade/apresentação
de ofertas por motoboy e a reconciliação idempotente do aceite; em seguida alinhar
sessão JavaScript/nativa e validar o tracking em aparelho com GPS e rede
controladamente indisponíveis.

## Atualização — 2026-08-24: correção dos achados do aplicativo do motoboy

Os dez achados registrados em `docs/auditoria-driver-app.md` foram tratados no
app Android e nos serviços de API que sustentam o fluxo. O documento de
auditoria agora mantém o diagnóstico original e uma tabela de estado pós-correção.

### Dispatch e aceite

- A criação de oferta passou a bloquear o registro do motoboy dentro da
  transação serializável e revalidar a ausência de outra oferta pendente. O
  lock das entregas continua protegendo o outro eixo da concorrência. Se o
  candidato ficou ocupado entre seleção e commit, o mesmo dispatch tenta o
  próximo elegível em vez de deixar o pedido parado.
- Aceitar oferta ou assumir pedido livre agora devolve o resultado persistido
  quando a mesma atribuição já pertence ao motoboy. Em corrida entre requests,
  o serviço relê a oferta/entrega depois da operação condicional falhar.
- Home, vitrine e tela de oferta consultam entregas ativas quando uma resposta
  de aceite/claim se perde. O cliente Android nativo repete somente `ACCEPT` uma
  vez; `DECLINE` permanece sem repetição automática.

### Sessão, oferta e tracking

- O bootstrap preserva a credencial em indisponibilidade da API. Apenas
  `401`/`403` executam a limpeza coordenada de tracking, registro/token FCM,
  sessão nativa e AsyncStorage, nesta ordem para permitir o desregistro.
- O cronômetro da oferta React Native usa deadline absoluto. A retomada da Home
  sempre consulta a oferta pendente e atualiza ou remove o estado local, sem
  trocar de tela quando a mesma oferta apenas recebeu um prazo atualizado.
- O foreground service Android valida se GPS ou rede está ativo antes de
  iniciar, registra ambos os provedores disponíveis e para ao falhar o registro.
  O envio coalesce fixes, mantendo somente o mais recente, usa timeout de oito
  segundos e interrompe o lote em erro de rede, `5xx` ou `429`.
- Quando o TTL de presença expira, a API emite também
  `driver:presence-expired`. A Home sincroniza o seletor para indisponível, para
  o tracking e orienta o motoboy a verificar a localização. O update de
  expiração volta a validar `lastSeenAt`, portanto um heartbeat recebido entre
  a busca e a gravação vence a corrida e permanece online.

### Dinheiro e operação

- `POST /driver/wallet/withdrawals` aceita `idempotencyKey` UUID opcional. O app
  sempre cria uma chave por tentativa lógica e a conserva ao repetir o mesmo
  valor. A API prefixa a chave com o usuário, grava no
  `WalletTransaction.idempotencyKey` já existente e recupera a solicitação em
  retry ou colisão `P2002`. Não houve alteração de schema nem migration.
- Coleta, insucesso, entrega e conclusão de retorno mudam o estado com
  `updateMany` condicionado ao estado anterior e ao motoboy. Resposta perdida e
  request concorrente retornam o detalhe/grupo já aplicado sem duplicar
  histórico, endereço de destino ou repasse.
- A tela operacional usa trava síncrona contra toque duplo, permanece aberta em
  erro transitório, relê o estado antes de declarar resultado ambíguo e pede
  confirmação para coleta, entrega e retorno. A segunda ação principal foi
  removida.

Arquivos principais deste recorte:

- `apps/api/src/{dispatch,deliveries,finance,live-presence}/`;
- `apps/driver-app/{App.tsx,src/lib,src/screens,__tests__,android/app/src/main/java}/`;
- `packages/{validation,api-client}/`;
- `docs/{auditoria-driver-app.md,agent-handoff.md}`.

### Verificação

| Comando / fluxo                    | Resultado                                                            |
| ---------------------------------- | -------------------------------------------------------------------- |
| build de `@motoboycity/validation` | aprovado                                                             |
| typecheck completo do monorepo     | 8 projetos aprovados                                                 |
| lint completo do monorepo          | 8 projetos aprovados, sem avisos                                     |
| Jest completo do Driver App        | 12 suítes e 67 testes aprovados                                      |
| Jest unitário completo da API      | 59 suítes e 718 testes aprovados                                     |
| build da API                       | aprovado                                                             |
| `:app:compileDebugKotlin`          | aprovado; um aviso preexistente de `Notification.Builder` depreciado |
| `git diff --check`                 | aprovado antes da atualização final deste handoff                    |

E2E não foi executado porque PostgreSQL e Redis isolados não foram
provisionados. Nenhum seed, Docker, `.env`, secret ou arquivo de sessão Kotlin
foi alterado. O passo concreto seguinte é instalar o build em aparelho Android
e validar: aceite com resposta cortada; notificação com tela bloqueada,
desbloqueada e app aberto; sessão expirada; GPS desligado/trocando para rede; e
lote grande sob rede degradada. Depois, executar os E2E com banco e Redis
isolados antes de promover o recorte.

## Atualização — 2026-08-24: nome de instalação do app do motoboy

O nome visível do aplicativo instalado passou a ser `motoboycity`. A alteração
foi aplicada ao `displayName` do React Native, ao rótulo do launcher Android e
ao nome e tela inicial do iOS.

O nome interno `DriverApp`, o `applicationId`/bundle identifier, o componente
React Native e a configuração Firebase foram preservados. Portanto, a mudança
não cria um aplicativo separado e não altera sessão, dados ou lógica.

Arquivos afetados:

- `apps/driver-app/app.json`;
- `apps/driver-app/android/app/src/main/res/values/strings.xml`;
- `apps/driver-app/ios/DriverApp/{Info.plist,LaunchScreen.storyboard}`.

Verificação executada:

- typecheck e lint de `@motoboycity/driver-app`: aprovados;
- Jest do Driver App: 12 suítes e 67 testes aprovados;
- Gradle `:app:processDebugResources`: aprovado;
- `git diff --check`: aprovado.

Próximo passo concreto: gerar/instalar uma nova versão nativa para que o novo
rótulo apareça no launcher; a instalação anterior não muda sem recompilação.

## Atualização — 2026-08-24: Render com PostgreSQL no Neon

A infraestrutura de produção foi consolidada como Vercel para os dois painéis,
Render para API e Redis/BullMQ, e Neon para PostgreSQL. O `render.yaml` não
provisiona mais um Postgres no Render: `DATABASE_URL` e `DIRECT_URL` passaram a
ser segredos `sync: false`, preenchidos com as URLs pooled e direta do mesmo
banco Neon. `REDIS_URL` continua ligado automaticamente ao Key Value do Render.
Como o Neon configurado está em `sa-east-1` e o Render não oferece região no
Brasil, API e Redis foram alinhados em `virginia`, evitando ainda uma conexão
privada entre serviços Render de regiões diferentes.

O datasource Prisma 6 agora usa `DATABASE_URL` para o runtime e `DIRECT_URL`
para migrations e ferramentas administrativas. Os exemplos de ambiente e o CI
foram atualizados; em desenvolvimento e CI, ambas podem apontar para o mesmo
PostgreSQL isolado/local. Nenhuma migration nova é necessária porque essa
mudança altera somente a forma de conexão, não o schema persistido.

Nenhuma conexão, migration, seed, limpeza ou escrita foi executada no Neon. O
banco local continua sendo `motoboycity_dev` no Docker. Antes do primeiro
deploy, preencher as duas URLs no Render, aplicar `prisma migrate deploy` pelo
build e executar o seed uma única vez depois de configurar credenciais fortes
para o administrador inicial.

Arquivos afetados: `render.yaml`, `.env.example`, `apps/api/.env.example`,
`apps/api/prisma/schema.prisma`, `.github/workflows/ci.yml` e este handoff.

Verificação executada:

- parse estrutural do `render.yaml`: aprovado, sem Postgres Render, com API e
  Redis em `virginia` e as duas URLs do Neon como `sync: false`;
- `prisma validate` e `prisma generate`: aprovados;
- `prisma migrate status`: 31 migrations, banco local `motoboycity_dev` em
  `localhost:5434` atualizado; nenhuma conexão ao Neon;
- typecheck e lint completos: 8/8 workspaces aprovados;
- build da API: aprovado;
- `git diff --check`: aprovado.

## Atualização — 2026-08-24: contexto do menu da conta no Company Web

O menu da conta no topo do painel da empresa usava `DropdownMenuLabel`
diretamente dentro do popup. No Base UI, esse componente representa
`Menu.GroupLabel` e exige o contexto de um `Menu.Group`; abrir o menu causava o
erro de runtime `MenuGroupContext is missing`.

O label e a ação **Meu perfil** foram agrupados com `DropdownMenuGroup`, sem
alterar consulta de usuário, navegação, logout ou estilo. A busca global
confirmou que este era o único uso de `DropdownMenuLabel` nos dois painéis.

No reteste manual do responsável, **Meu perfil** ainda não navegava. A causa
era outro resíduo da API Radix: os itens usavam `onSelect`, mas o `Menu.Item` do
Base UI executa a ação por `onClick`. Perfil e logout do Company Web e logout
do Admin Web foram alinhados ao evento correto.

Arquivos funcionais afetados:
`apps/{company-web,admin-web}/src/components/layout/top-nav.tsx`.

Validação: typecheck e lint completos aprovados em 8/8 workspaces; builds de
produção do Company Web (18 rotas) e Admin Web (35 rotas) aprovados. A
validação manual por clique não foi executada porque nenhum navegador
integrado estava disponível nesta sessão. Próximo passo concreto: recarregar o
painel da empresa, abrir o avatar da conta e testar **Meu perfil** e **Sair**.

## Atualização — 2026-08-24: edição dos dados da empresa no perfil

A rota `/perfil` do Company Web agora permite ao responsável ativo editar nome
fantasia, razão social, nome completo e WhatsApp. E-mail e CPF/CNPJ permanecem
visíveis somente para conferência, e senha/foto continuam em seus fluxos já
existentes. A atualização bem-sucedida também troca imediatamente o nome do
usuário no cache compartilhado do topo do painel.

A API passou a expor `GET /company/profile` para qualquer membro ativo e
`PUT /company/profile` para membros ativos com papel `OWNER`. Operadores podem
consultar os dados, mas recebem os campos bloqueados na interface e também são
impedidos no backend de alterá-los. O `PUT` atualiza `Company.legalName`,
`Company.tradeName`, `User.name` e `User.phone` na mesma transação. Assim, o
WhatsApp novo também passa a ser o contato usado pelo fluxo administrativo de
envio de fatura.

Os quatro campos já existiam no schema e na migration inicial; não houve
alteração Prisma nem migration, e os dados existentes não precisam de
backfill. O novo schema Zod normaliza o WhatsApp para 10 ou 11 dígitos e limita
os tamanhos dos nomes. Contrato compartilhado, API client, controller, service
e consumidor web foram atualizados juntos.

Arquivos principais:

- `apps/api/src/company/profile/` e `apps/api/src/app.module.ts`;
- `packages/validation/src/company/update-company-profile.schema.ts`;
- `packages/types/src/company.ts`;
- `packages/api-client/src/company-profile.ts`;
- `apps/company-web/src/components/profile/company-data-form.tsx`;
- `apps/company-web/src/app/(app)/perfil/page.tsx`.

Verificação executada:

- build de `@motoboycity/validation`: aprovado;
- testes focados de serviço/autorização e validação: 2 suítes e 6 testes
  aprovados;
- suíte unitária completa da API antes do último teste de validação: 60 suítes
  e 722 testes aprovados;
- typecheck e lint completos: 8/8 workspaces aprovados;
- builds da API e do Company Web: aprovados; o painel gerou 18 rotas;
- `git diff --check`: aprovado antes desta atualização do handoff.

E2E não foi executado porque PostgreSQL e Redis isolados não foram
provisionados. Nenhuma migration, seed, Docker, `.env` ou secret foi alterado.
Próximo passo concreto: homologar com uma sessão real de `OWNER`, salvar os
quatro campos e confirmar o novo telefone no diálogo de WhatsApp da fatura;
depois entrar como `OPERATOR` e confirmar visualização sem permissão de edição.

## Atualização — 2026-08-24: bootstrap do primeiro deploy no Render

O Blueprint da API passou a usar `initialDeployHook` para executar o seed
mínimo depois do primeiro deploy bem-sucedido. Isso resolve a incompatibilidade
do procedimento anterior com o plano gratuito do Render, que não oferece Shell:
a região padrão e o primeiro administrador são criados uma única vez pelo hook,
com `ADMIN_SEED_EMAIL` e `ADMIN_SEED_PASSWORD` fornecidos como segredos no
painel. O seed continua idempotente e não sobrescreve região ou administrador
existentes.

Nenhum deploy, migration, seed ou conexão com o Neon foi executado nesta
alteração. O `prisma migrate deploy` permanece no build porque o comando de
pré-deploy não está disponível no plano gratuito. Antes de criar o Blueprint,
é obrigatório confirmar o alvo Neon e preencher `DATABASE_URL`, `DIRECT_URL`,
`CORS_ORIGINS` e as credenciais fortes do administrador.

Verificação deste recorte: schema Prisma válido e build da API aprovado fora
do sandbox do Windows. A execução atual do GitHub Actions continua vermelha em
quatro expectativas E2E após as mudanças de idempotência; isso precisa ser
alinhado antes de considerar o backend pronto para produção. Próximo passo
concreto: validar o Blueprint, confirmar autorização para aplicar as 31
migrations no Neon limpo e acompanhar o primeiro deploy/health check.

## Atualização — 2026-08-24: correção do primeiro build no Render

O primeiro sync do Blueprint criou `motoboycity-redis`, mas o build da API
parou antes da instalação de dependências: `corepack enable` tentou substituir
`/usr/bin/pnpm` no filesystem somente leitura do runtime (`EROFS`). Nenhuma
migration ou seed chegou a executar.

O Blueprint passou a invocar `corepack pnpm` diretamente no build, start e
hook inicial, sem criar ou sobrescrever links globais. `NODE_VERSION` foi
fixado em `22.18.0`, a mesma versão usada no CI; a faixa aberta `>=20` do
`package.json` havia feito o Render selecionar Node 26.7.0 automaticamente.

Próximo passo concreto: validar a formatação, commitar/pushar a correção e
acompanhar o sync automático do Blueprint até migrations, build, seed e
`GET /health` concluírem.

## Atualização — 2026-08-24: build dos contratos antes da API no Render

O segundo build do Render avançou além da instalação e falhou no `nest build`
porque um clone limpo ainda não possui `packages/validation/dist`. O pacote
`@motoboycity/validation` publica JavaScript e declarações por esse diretório,
portanto os imports da API não podiam ser resolvidos mesmo com as dependências
do workspace instaladas.

O `buildCommand` do Blueprint agora compila `@motoboycity/validation` antes de
gerar o Prisma Client, aplicar migrations e compilar a API. A migration fica
antes do build final no comando; por isso o deploy que apresentou o erro pode
ter alcançado o Neon antes de falhar. A próxima execução de `prisma migrate
deploy` é idempotente e deve apenas confirmar migrations que já tenham sido
aplicadas. O `initialDeployHook` ainda não executou, pois depende do primeiro
deploy bem-sucedido.

Próximo passo concreto: validar os builds de `validation` e da API, commitar e
pushar a correção quando autorizado e acompanhar o novo sync até o health check
e o seed inicial concluírem.

## Atualização — 2026-08-24: saída compilada da API no diretório correto

O build seguinte do Render terminou, mas o processo não iniciou porque
`apps/api/dist/main.js` não existia. O `outDir` vinha apenas do preset
compartilhado `packages/config/typescript/nestjs.json`; como caminhos de
`tsconfig` são resolvidos a partir do arquivo que os declara, o TypeScript
estava emitindo a API indevidamente em `packages/config/typescript/dist`.

`apps/api/tsconfig.json` agora define explicitamente `outDir: "./dist"`. Isso
mantém toda a saída dentro de `apps/api/dist` e deixa o script existente
`start:prod` (`node dist/main`) coerente, sem acoplar o Render a um caminho
incorreto do pacote compartilhado.

Próximo passo concreto: confirmar que um novo build gera
`apps/api/dist/main.js`, testar o processo de produção localmente e, quando
autorizado, commitar e enviar a correção para um novo deploy.

## Atualização — 2026-08-24: recuperação do administrador inicial no Neon

Depois do primeiro deploy saudável, `GET /health` respondeu `200` e o CORS
aceitou os dois domínios da Vercel, mas o login administrativo retornou `401`.
Uma consulta somente leitura no Neon confirmou que não existia nenhuma linha
`ADMIN` em `users`; portanto o `initialDeployHook` não havia criado o bootstrap.

Como o plano gratuito não oferece Shell e o hook inicial não se repete em
deploys comuns, o `buildCommand` executa temporariamente o seed idempotente logo
após `prisma migrate deploy`. As credenciais continuam vindo exclusivamente de
`ADMIN_SEED_EMAIL` e `ADMIN_SEED_PASSWORD` no Render; nenhum segredo foi
adicionado ao repositório. O seed cria a região e o administrador apenas quando
eles não existem e não redefine contas existentes.

Próximo passo concreto: acompanhar o deploy, confirmar no log a criação do
administrador, testar o login e então remover `prisma db seed` do build para que
o bootstrap volte a ser exclusivamente uma operação de inicialização.

## Atualização — 2026-08-24: bootstrap de produção concluído

O deploy de recuperação executou o seed com as credenciais armazenadas no
Render, criou o administrador ausente no Neon e o login no Admin Web foi
confirmado manualmente pelo responsável. O comando temporário `prisma db seed`
foi removido do `buildCommand`; os próximos deploys continuam aplicando apenas
migrations pendentes e compilando a API, sem repetir o bootstrap.

O usuário administrador e a região criados permanecem no Neon. O
`initialDeployHook` continua documentando a intenção para novas instâncias do
Blueprint, mas não é necessário para a instância atual já inicializada.

Próximo passo concreto: acompanhar o deploy de limpeza, confirmar novamente
`GET /health` e então validar login e navegação essenciais nos dois painéis da
Vercel contra a API de produção.

## Atualização — 2026-08-24: primeiro APK Android de produção assinado

Foi gerado o APK `release` do `apps/driver-app` para o piloto de produção com
`applicationId` `com.motoboycity.driverapp`, `versionName`
`0.1.0-pilot.1`, `versionCode` `1`, `minSdk` 24 e `targetSdk` 36. O bundle
embarcado aponta para `https://motoboycity-api.onrender.com`, não contém a URL
local `localhost:3333`, desabilita cleartext e inclui a configuração do
Firebase Messaging.

O PNPM não expunha o compilador transitivo do Hermes no caminho esperado pelo
React Native Gradle Plugin. `hermes-compiler@250829098.0.16`, exatamente a
versão usada por `react-native@0.86.2`, foi adicionado como dependência direta
de desenvolvimento do app. Em Windows, o build também excedia o limite de
caminhos no diretório original; a compilação foi executada em uma cópia física
temporária curta (`C:\mbc`) sem alterar o código-fonte usado pelo artefato.

A chave de release foi criada fora do repositório no pendrive removível em
`I:\MOTOboyCity\signing\motoboycity-release.jks`, alias `motoboycity`. As
senhas permanecem somente no arquivo local ignorado e não foram registradas
neste documento. Certificado SHA-256:
`BD:42:D6:1D:35:81:9B:86:CB:9D:1F:F7:84:D3:E6:43:40:C0:CE:15:3E:21:B0:33:2A:E9:7B:4C:F5:1D:50:B9`.

O APK final foi copiado para
`I:\MOTOboyCity\releases\motoboycity-0.1.0-pilot.1-vc1.apk`, tem 71,49 MiB e
SHA-256
`2BDED57889B02FBE758E218F3E8D6C9FA595A5F2EA4A25AAC4BBDAB3C1D8369F`.
`apksigner` confirmou um assinante RSA 4096 e APK Signature Scheme v2; `aapt`
confirmou pacote, versão, label `motoboycity` e SDKs. Antes do build nativo,
typecheck, lint e 67 testes Jest em 12 suítes do driver-app passaram, e a API
de produção respondeu saudável.

Como redundância local, a mesma chave protegida por senha também foi copiada
para três discos físicos distintos em
`C:\MOTOboyCity-Backup\signing\motoboycity-release.jks`,
`D:\MOTOboyCity-Backup\signing\motoboycity-release.jks` e
`F:\MOTOboyCity-Backup\signing\motoboycity-release.jks`. Todas as cópias foram
conferidas com o SHA-256 do arquivo original:
`51083392535AB3B59CAF2872112E25DD90FAAEB316A27773C75455614ABA3D61`.
Nenhuma senha foi copiada junto com os arquivos.

Um aparelho Android conectado já possuía o mesmo pacote assinado por um
certificado antigo/diferente. O release novo não foi instalado para evitar uma
desinstalação que apagaria dados locais. Próximo passo concreto: guardar as
senhas em um cofre independente e manter ao menos uma cópia da chave fora deste
computador, autorizar uma instalação limpa no aparelho de teste e executar o
smoke test real de login, permissões, mapa/GPS, presença, ofertas,
aceite/recusa e push em foreground, background e tela bloqueada.

## Atualização — 2026-08-24: copiar acesso do painel da empresa no Admin

A página `/clientes` do Admin Web ganhou a ação `Copiar link do painel` ao
lado de `Cadastrar empresa`. A ação copia
`https://motoboycity-company-web.vercel.app/login` para a área de transferência,
troca o rótulo para `Link copiado` quando conclui e mostra um erro acessível se
o navegador bloquear a cópia. O botão não navega, não altera contratos e não
modifica dados das empresas.

Validação deste recorte: typecheck e lint de `@motoboycity/admin-web`
concluíram com sucesso. Próximo passo concreto: revisar visualmente em desktop
e mobile e publicar o Admin Web quando o commit for autorizado.

## Atualização — 2026-08-24: mapa Android bloqueado pela autorização do Google

No aparelho real, o APK `0.1.0-pilot.1`/versionCode 1 abre o `MapView` e mostra
a marca Google, mas não recebe os blocos do mapa. O `logcat` confirmou
`Authorization failure` e `Error requesting API token. StatusCode=INVALID_ARGUMENT`.
A chave está presente no APK e a configuração local/Firebase existe; portanto
o defeito não está no layout nem na injeção da chave pelo Gradle.
Uma comparação sem expor valores confirmou que a chave Android local não é a
mesma chave configurada localmente para API, Admin Web, Company Web ou raiz do
monorepo, então ela pode receber restrições específicas de aplicativo Android
sem afetar esses consumidores locais.

O próprio SDK informou a identidade Android que precisa ser autorizada no
Google Cloud: pacote `com.motoboycity.driverapp` e SHA-1 de release
`F5:92:B4:10:39:95:42:CC:AA:36:AD:A8:91:62:74:35:49:17:FF:DC`. O certificado
instalado foi conferido diretamente com `apksigner` e corresponde à chave de
release criada para o piloto.

Nenhuma configuração externa foi alterada nesta sessão porque não havia uma
sessão autenticada do Google Cloud disponível. Próximo passo concreto: no
projeto que possui a chave usada pelo app, confirmar faturamento, habilitar
`Maps SDK for Android` e restringir a chave para aplicativo Android usando o
pacote e SHA-1 acima; em `Restrições de API`, permitir `Maps SDK for Android`.
Depois de salvar e aguardar a propagação, forçar o encerramento e reabrir o app
para repetir o teste no aparelho.

A configuração foi salva pelo responsável no Google Cloud e retestada no mesmo
aparelho. Após reiniciar apenas o processo do app, o `logcat` não apresentou
mais `Authorization failure`/`INVALID_ARGUMENT`, e a captura de tela confirmou
o carregamento dos blocos, nomes de ruas, pontos de interesse e posição atual.
O mapa Android do APK piloto está operacional; não foi necessário recompilar o
APK porque a chave embutida permaneceu a mesma.

## Atualizacao — 2026-08-24: Admin lanca pedido para empresa selecionada

O Admin Web ganhou a acao `Lancar pedido` em `/clientes`. O modal lista todas
as empresas cadastradas, deixa pendentes e suspensas visiveis mas indisponiveis
e, depois da escolha de uma empresa ativa, carrega seu endereco principal de
coleta e as modalidades ativas. O formulario cria um pedido avulso imediato ou
agendado, com destino informado ou capturado pelo GPS, dados opcionais do
destinatario/pagamento e as exigencias de retorno, confirmacao de coleta e
comprovante.

A API expoe `POST /admin/deliveries/company/:companyId`, protegida por
`JwtAuthGuard` e `AdminOnlyGuard` e validada pelo mesmo `createDeliverySchema`
da empresa. `DeliveriesService.createForCompany` resolve a empresa diretamente,
recusa alvos inexistentes ou nao ativos e reutiliza o nucleo de criacao. Assim,
o pedido usa o endereco, a regiao e a tabela personalizada da empresa escolhida,
mas `DeliveryStatusHistory.changedByUserId` registra o administrador. A chave
idempotente continua isolada por empresa e o mesmo despacho/agendamento e
realtime sao executados.

Arquivos principais: `apps/api/src/deliveries/deliveries.service.ts`,
`apps/api/src/admin/deliveries/*`,
`packages/api-client/src/admin-deliveries.ts`,
`apps/admin-web/src/components/deliveries/create-company-delivery-dialog.tsx`
e `apps/admin-web/src/app/(app)/clientes/page.tsx`. Nao houve alteracao Prisma
nem migration.

Validacao executada: 105 testes unitarios focados da API passaram; typecheck de
API, API Client e Admin Web passou; lint de API e Admin Web passou; os builds de
producao da API e do Admin Web tambem passaram. Proximo passo concreto: revisar
visualmente o modal com uma empresa ativa que tenha endereco e fazer um smoke
test real de criacao contra um ambiente controlado antes de publicar.

## Atualizacao — 2026-08-24: oferta nativa sobre outros apps e presenca estacionaria

O teste no Xiaomi `24095PCADG`, Android 16/API 36, confirmou que a faixa com
`Recusar`/`Aceitar` era a notificacao nativa criada pelo app, nao um push
generico. `USE_FULL_SCREEN_INTENT` estava concedida, mas o Android 13+ prefere
heads-up quando o aparelho esta desbloqueado. Para reproduzir de forma opt-in o
cartao completo da referencia nesse estado, o app passou a declarar
`SYSTEM_ALERT_WINDOW`, consultar `Settings.canDrawOverlays`, abrir a tela
oficial de autorizacao e tentar trazer a `OfferActivity` quando uma oferta FCM
chega com o app minimizado. A notificacao acionavel e publicada primeiro e
permanece como fallback se a autorizacao estiver negada ou o fabricante
bloquear a abertura. No Android 14+, o `PendingIntent` tambem declara o opt-in
do criador para background activity launch exigido por apps target 35+.

A Home impede ficar disponivel somente quando detecta que a permissao basica de
notificacao do Android esta desativada. Falha temporaria ao registrar o token
FCM, sobreposicao negada e tela cheia negada nao retiram mais o motoboy da fila:
o socket e a notificacao comum continuam como degradacao segura. A tela Ajustes
mostra separadamente o estado de sobreposicao e o de tela cheia/bloqueada. O uso
de `SYSTEM_ALERT_WINDOW` e sensivel para revisao da Play Store e precisa ser
homologado por fabricante; ele foi adotado aqui para o APK piloto solicitado.

A segunda captura revelou um defeito independente de presenca: a API expira o
motoboy depois de 150 segundos sem heartbeat, enquanto o servico Android so
enviava heartbeat dentro de `onLocationChanged` e exigia deslocamento minimo de
100 m sem corrida ou 50 m em corrida. Um motoboy parado podia, portanto, ser
marcado offline com GPS, internet e servico ativos. O servico nativo agora
mantem a ultima coordenada valida e envia somente o heartbeat de presenca a
cada 60 segundos. Pontos de rota continuam ligados a uma nova localizacao, sem
duplicar historico quando o aparelho esta parado. Falta homologar esse fluxo
por mais de 3 minutos com o aparelho estacionario.

Arquivos principais alterados:

- `apps/driver-app/android/app/src/main/AndroidManifest.xml`;
- `apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/OfferMessagingService.kt`;
- `apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/OfferSessionModule.kt`;
- `apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/DeliveryLocationTrackingService.kt`;
- `apps/driver-app/src/lib/offerSession.ts`;
- `apps/driver-app/src/screens/HomeScreen.tsx` e `SettingsScreen.tsx`;
- mocks/testes de push do driver-app e `apps/driver-app/package.json`.

O release foi promovido para `0.1.0-pilot.2`, `versionCode` 2, targetSdk 36.
Como o caminho original excede 260 caracteres no CMake do Windows, o build de
producao foi concluido numa copia fisica temporaria curta `C:\m2`, com
`@motoboycity/validation` compilado antes do Metro. `assembleRelease`, lint
vital, assinatura e empacotamento passaram. `apksigner` confirmou APK Signature
Scheme v2 e o mesmo certificado SHA-256 do piloto anterior. O APK tem
74.967.361 bytes e SHA-256
`2F1ADE3EE1097465141FD2CE9CC0526AA91B2301ED94BB1F1BDAFC57DA4542E4`.
Ele foi instalado com `adb install -r` sem apagar dados e copiado para
`I:\MOTOboyCity\releases\motoboycity-0.1.0-pilot.2-vc2.apk`.

No reteste, o FCM retornou `FCM Registration failed` e a regra anterior impediu
o toggle apesar de todas as permissoes Android estarem concedidas. O registro
de push passou a ser best-effort e deixou de bloquear presenca. Um novo release
assinado foi compilado e reinstalado; a Home confirmou `Ativo` e o Android
confirmou `DeliveryLocationTrackingService` em foreground com
`startRequested=true`. O hotfix foi preservado em
`I:\MOTOboyCity\releases\motoboycity-0.1.0-pilot.2-vc2-online-hotfix.apk`,
SHA-256
`74790177140CA48D859F8F4BAABCA8E4ADD75FA14062A49EDCED2726B3AC33A0`.

Proximo passo concreto: conceder manualmente `Exibir sobre outros apps`, ficar
online parado por mais de 3 minutos e gerar uma oferta controlada com o app
minimizado; confirmar o cartao completo, aceitar/recusar, repetir com a tela
bloqueada e guardar logcat se o HyperOS aplicar uma restricao adicional.

## Atualizacao — 2026-08-24: Render no workspace Hobby com servicos Starter

Depois de o proprietario cancelar o plano Pro do workspace, o Blueprint foi
ajustado para manter o workspace no plano Hobby e cobrar somente os recursos da
aplicacao. Em `render.yaml`, `motoboycity-api` e `motoboycity-redis` passaram de
`free` para `starter`. A politica Redis `noeviction`, exigida pelo BullMQ para
nao descartar jobs de despacho e financeiro, foi preservada.

O custo-base esperado no Render passa a ser USD 17 por mes: USD 7 da API
Starter e USD 10 do Key Value Starter, sem os USD 25 do workspace Pro. Trafego,
overages ou outros recursos externos nao estao incluidos nessa soma. A promocao
do Key Value gratuito pode recriar a instancia e perder os dados temporarios
existentes, com uma breve indisponibilidade; neste momento esses dados sao filas
e estados efemeros de teste. PostgreSQL continua no Neon e nao e alterado por
essa promocao.

Validacao executada: revisao do diff, `git diff --check` e confirmacao de que os
dois servicos continuam na mesma regiao, com a ligacao automatica de
`REDIS_URL`, health check `/health` e sem qualquer segredo versionado. Proximo
passo concreto: acompanhar o sync do Blueprint, confirmar API e Key Value como
`Live`, habilitar a persistencia oferecida pelo plano pago no painel do Redis e
fazer smoke test de login, presenca e criacao/despacho de pedido.

## Atualizacao — 2026-08-24: camera estavel no mapa da Home do Admin

O mapa da operacao global executava `fitBounds` toda vez que os dados de
`admin/operations` mudavam. Como os eventos Socket.IO `driver:location`,
`driver:presence` e `delivery:updated` invalidam essa consulta, cada nova
posicao recriava os marcadores e reenquadrava a camera. A combinacao entre
`fitBounds` e o teto de zoom no evento `idle` causava o ciclo visual de
aproximar e voltar relatado em producao.

`AdminOperationsMap` agora separa atualizacao dos marcadores de controle da
camera: pedidos e motoboys continuam se movendo em tempo real, mas o
enquadramento automatico ocorre somente na primeira carga ou quando o operador
altera modo, busca, empresa, motoboy ou status. Se a primeira resposta estiver
vazia, o primeiro marcador que aparecer ainda recebe enquadramento. O listener
de `idle` anterior tambem e cancelado antes de um novo enquadramento para evitar
ajustes atrasados concorrentes.

Arquivos alterados: `apps/admin-web/src/components/operations/admin-operations-map.tsx`
e `apps/admin-web/src/app/(app)/page.tsx`. Nao houve mudanca de endpoint,
contrato ou regra operacional. Typecheck, lint e build de producao do Admin Web
passaram. Proximo passo concreto: manter um motoboy online e parado/movendo por
alguns minutos, ajustar o zoom manualmente e confirmar que os marcadores
atualizam sem a camera mudar; depois alternar filtros e confirmar um unico
reenquadramento intencional.

## Atualizacao — 2026-08-24: pedidos do Admin em grid de cards

A listagem paginada de `/pedidos` deixou de usar linhas horizontais largas e
passou a usar cards compactos. Cada card preserva os dados e acoes existentes:
numero, empresa, status, modalidade, distancia, retorno, valor, detalhe e
cancelamento com confirmacao. Uma faixa lateral usa a mesma semantica de cor do
status aplicada no restante do painel.

O grid responde de uma coluna no celular ate sete colunas em telas com pelo
menos 1800 px; os pontos intermediarios usam duas, tres, quatro e cinco colunas
para manter leitura e toque confortaveis. Rastreamento ao vivo, filtro lateral,
paginacao de 25 itens e consultas reais da API nao foram alterados. Arquivo
alterado: `apps/admin-web/src/app/(app)/pedidos/page.tsx`. Typecheck, lint e
build de producao do Admin Web passaram junto da correcao da camera do mapa.
Proximo passo concreto: conferir `/pedidos` em 1920 px e em largura mobile com
pedidos cancelaveis e concluidos, garantindo que status e botoes nao estourem o
card.

## Atualizacao — 2026-08-24: detalhe do pedido mais compacto no Admin

A rota `/pedidos/[id]` foi reorganizada para eliminar os grandes vazios sem
alterar consultas, contratos ou acoes. Destinatario, operacao e faturamento
agora ocupam tres paineis na mesma linha em desktop, com campos internos em
grade e hierarquia visual consistente. O mapa divide a linha com os cards de
coleta e entrega, incluindo atalhos das coordenadas para o Google Maps.

Rastreamento GPS e auditoria de despacho passaram a usar duas colunas. O
historico deixou de renderizar um card de largura total por evento e virou uma
grade cronologica compacta de ate cinco etapas por linha, preservando transicao,
horario, duracao, autor e observacao. Em telas menores todas as secoes continuam
empilhando de forma responsiva. Arquivo alterado:
`apps/admin-web/src/app/(app)/pedidos/[id]/page.tsx`. Typecheck, lint e build de
producao do Admin Web passaram. Proximo passo concreto: abrir pedidos com e sem
destino, entregador, fatura, lote e historico longo para uma verificacao visual
final nas larguras desktop e mobile.

## Atualizacao — 2026-08-25: autonomia operacional do motoboy

O fluxo da entrega no aplicativo foi simplificado para que confirmacoes de
operacao nao dependam de horario retroativo, justificativa digitada ou GPS de
proximidade. O seletor "Ha quanto tempo aconteceu?" e os links de marcacao
retroativa foram removidos. "Devolver a fila" agora pede apenas confirmacao e
grava uma nota padrao no historico.

O botao amarelo do rodape passou a abrir "Opcoes da entrega". O motoboy pode
cancelar o proprio pedido em qualquer etapa operacional exibida pelo app
(`ACCEPTED`, `COLLECTED`, `DELIVERED` ou `FAILED`). Antes da coleta, "Problema
na entrega" devolve o pedido para a fila; depois da coleta, registra `FAILED` e
mantem o fluxo de devolucao da mercadoria. As acoes continuam auditadas e as
transicoes condicionais/idempotentes existentes foram preservadas.

No contrato, coordenadas de `fail` e `complete-return` passaram a ser
opcionais. A API nao confere mais raio ou precisao para entrega com destino ja
conhecido nem para concluir retorno. GPS permanece obrigatorio somente na
entrega com `destinationKnownAtCreation=false`, porque nesse caso a coordenada
e o proprio destino usado para calcular distancia e preco. Nao houve alteracao
de schema Prisma nem migration.

Arquivos principais alterados:
`apps/driver-app/src/screens/DeliveryOperationScreen.tsx`,
`apps/driver-app/src/lib/activeDeliveries.ts`,
`apps/api/src/deliveries/deliveries.service.ts`,
`apps/api/src/deliveries/deliveries.service.spec.ts`,
`packages/validation/src/deliveries/mark-failed.schema.ts`,
`packages/validation/src/deliveries/complete-return.schema.ts`,
`packages/validation/src/deliveries/cancel-delivery.schema.ts`,
`packages/api-client/src/deliveries.ts`, `packages/types/src/delivery.ts` e
`docs/business-rules.md`.

Validacoes executadas: build e typecheck de `@motoboycity/validation`;
typecheck de API, driver-app, types e api-client; lint de API e driver-app;
`deliveries.service.spec.ts` com 88 testes; suite do driver-app com 67 testes.
Tudo passou. Proximo passo concreto: instalar um novo APK e validar em aparelho
os quatro cenarios: devolver a fila antes da coleta, cancelar antes e depois da
coleta, informar problema depois da coleta e concluir retorno com GPS ruim ou
desligado.

## Atualizacao — 2026-08-25: voltar protegido durante entrega no Android

O botao fisico de voltar agora respeita a pilha operacional do aplicativo. Na
tela de uma entrega, cada toque fecha primeiro a confirmacao ou o menu que
estiver aberto e somente depois retorna a tela anterior. Se a tela da entrega
tiver sido aberta como raiz, por notificacao ou substituicao de rota, a pilha e
recriada na Home em vez de permitir que o Android encerre o aplicativo.

Na Home, enquanto `activeDeliveries` contiver ao menos uma entrega em andamento,
o botao fisico e consumido e o aplicativo permanece aberto. Se o menu lateral
estiver visivel, o primeiro toque apenas o fecha. Sem entrega ativa e sem menu
aberto, o comportamento normal do Android foi preservado.

Arquivos alterados: `apps/driver-app/src/screens/DeliveryOperationScreen.tsx` e
`apps/driver-app/src/screens/HomeScreen.tsx`. Nao houve mudanca de status,
contrato de API, persistencia ou configuracao nativa. Validacoes executadas:
typecheck e lint de `@motoboycity/driver-app`, alem da suite Jest do app com 12
suites e 67 testes; tudo passou. Proximo passo concreto: instalar o APK e testar
o botao fisico com o menu amarelo, cada confirmacao, a tela da entrega e a Home,
confirmando que a entrega continua ativa e o aplicativo nao fecha.

## Atualizacao — 2026-08-25: acoes administrativas nas filas operacionais

Cada card das filas da Home do Admin ganhou um botao de tres pontos. O balao
exibe as cinco intervencoes solicitadas e habilita cada uma conforme o status:
alterar entregador, marcar como coletado, marcar como entregue, finalizar e
cancelar. A acao abre um dialogo compacto com consequencia, motivo obrigatorio
e, na troca, selecao entre entregadores aprovados e ativos. O clique no menu nao
interfere com o clique existente que seleciona o pedido no mapa.

As rotas `PATCH /admin/deliveries/:id/collect` e
`PATCH /admin/deliveries/:id/deliver` foram acrescentadas com guarda de Admin e
payload Zod compartilhado. A coleta manual preserva a atomicidade do lote e usa
updates condicionais dentro de transacao. A entrega manual aceita somente
`COLLECTED` com destino e preco ja conhecidos; sem retorno ela cria as duas
etapas de historico, conclui e credita o repasse, enquanto com retorno permanece
em `DELIVERED`. Repeticoes concorrentes sao tratadas de forma idempotente. Nao
houve mudanca Prisma nem migration.

Pedidos com `destinationKnownAtCreation=false` nao podem ser marcados como
entregues pelo Admin: a opcao fica desabilitada com explicacao, pois a
coordenada do app e o dado que gera distancia, preco e repasse. Inventar ou usar
uma posicao aproximada alteraria dinheiro. Cancelamento reutiliza a rota
existente; troca de entregador e finalizacao reutilizam as intervencoes ja
auditadas do Admin.

Arquivos principais: `apps/admin-web/src/app/(app)/page.tsx`,
`apps/admin-web/src/components/operations/delivery-actions-menu.tsx`,
`apps/api/src/admin/deliveries/admin-deliveries.controller.ts`,
`apps/api/src/admin/deliveries/admin-deliveries.service.ts`, seu spec,
`packages/validation/src/admin/delivery-override.schema.ts`,
`packages/api-client/src/admin-deliveries.ts` e `docs/business-rules.md`.

Validacoes executadas: build de `@motoboycity/validation`; spec focado do
AdminDeliveriesService com 30 testes; typecheck e lint dos oito workspaces;
builds de producao da API e do Admin Web. Tudo passou. Proximo passo concreto:
publicar API e Admin juntos e fazer smoke test com pedidos em `ACCEPTED`,
`COLLECTED`, `DELIVERED` e `FAILED`, incluindo lote e entrega com destino por
GPS.

## Atualizacao — 2026-08-25: atividade auditavel com empresa e motoboy

As mensagens da atividade auditavel do Admin passaram a identificar o pedido,
a empresa e, nos eventos operacionais pertinentes, o motoboy. Coleta e entrega,
por exemplo, agora aparecem como `Pedido #12 da empresa Drogaria Nova Farma foi
coletado por Maicon Douglas.` e `... foi entregue por Maicon Douglas.`. Aceites,
conclusoes, insucessos e respostas de oferta seguem a mesma redacao clara.

A formatacao ficou centralizada na API e e usada tanto pelos eventos Socket.IO
quanto pela reconstrução do feed a partir de `DeliveryStatusHistory` e
`DeliveryOffer`; assim a frase nao volta a ficar generica depois de atualizar a
pagina. No historico, o motoboy que gravou a transicao tem prioridade sobre o
entregador atualmente atribuido, evitando trocar o autor de uma coleta ou
entrega antiga depois de uma reatribuicao. Quando a transicao foi registrada por
outro perfil, o entregador atribuido e usado como contexto operacional.

Cancelamentos exibem empresa e pedido, mas deliberadamente nao dizem que foram
feitos "por" um motoboy: empresa, administrador e motoboy podem executar essa
acao. O nome continua no payload/link quando havia entregador atribuido. Nao
houve mudanca de schema Prisma, rota ou contrato compartilhado.

Arquivos principais alterados:
`apps/api/src/common/status-labels.ts` e seu novo spec,
`apps/api/src/admin/operations/admin-operations.service.ts` e seu spec,
`apps/api/src/deliveries/deliveries.service.ts`,
`apps/api/src/dispatch/dispatch.service.ts` e o spec de dispatch.

Validacoes executadas: 163 testes focados em quatro suites; typecheck e lint dos
oito workspaces; build de producao da API; `git diff --check`. Tudo passou.
Proximo passo concreto: publicar a API e observar no Admin um pedido passando
por aceite, coleta e entrega, confirmando que eventos novos e o feed recarregado
mostram a mesma frase com empresa e motoboy.

## Atualizacao — 2026-08-25: rua do destino capturado por GPS

O detalhe de pedido do Admin agora tenta converter a coordenada final de uma
entrega com destino definido por GPS em endereco legivel. Quando o `DROPOFF`
possui latitude/longitude e ainda nao tem rua, a API usa geocodificacao reversa
do Google em portugues do Brasil, separa rua, numero, cidade, UF e CEP e grava
esses campos no `DeliveryAddress`. Assim, registros antigos tambem sao
enriquecidos na primeira abertura do detalhe e a interface existente passa a
mostrar o endereco sem precisar alterar seu contrato.

A consulta e deliberadamente de melhor esforco e acontece somente no detalhe
acessado por Admin. Falta de chave, timeout, negativa do Google, coordenada sem
resultado ou falha ao salvar nao impedem a abertura do pedido: a tela continua
mostrando as coordenadas originais. O endereco resolvido e somente descritivo;
nao participa de distancia, preco, repasse ou transicao de status. Nao houve
mudanca de schema Prisma, migration, rota ou contrato compartilhado.

Arquivos alterados neste recorte:
`apps/api/src/maps/google-maps.service.ts`, seu spec,
`apps/api/src/deliveries/deliveries.service.ts` e seu spec. Validacoes
executadas: 107 testes focados em Maps e Deliveries, typecheck e lint da API e
build de producao da API; tudo passou. Proximo passo concreto: publicar a API,
abrir no Admin um pedido concluido com destino por GPS e confirmar rua e
coordenadas no card de entrega. A chave de producao precisa permitir a
Geocoding API do Google Maps Platform.

## Atualizacao — 2026-08-25: grids nos pedidos de cliente e entregador

As secoes `Pedidos do cliente` em `/clientes/[id]` e `Pedidos do entregador`
em `/entregadores/[id]` deixaram de usar linhas horizontais largas e passaram
a usar o mesmo padrao compacto de cards da listagem geral de pedidos. Os cards
possuem faixa lateral com a cor do status, cabecalho com numero e status,
informacoes operacionais agrupadas, valor ou repasse destacado e botao de
detalhe em largura total.

O grid e responsivo: uma coluna no celular e crescimento progressivo ate sete
colunas a partir de 1800 px. Na empresa foram preservados modalidade, data,
distancia, valor, filtros e paginacao no servidor. No entregador foram
preservados empresa, modalidade, distancia, retorno, repasse e filtro de
status. Consultas TanStack Query, endpoints, contratos e regras financeiras
nao foram alterados.

Arquivos alterados neste recorte:
`apps/admin-web/src/app/(app)/clientes/[id]/page.tsx` e
`apps/admin-web/src/app/(app)/entregadores/[id]/page.tsx`. Validacoes
executadas: typecheck, lint e build de producao do Admin Web; tudo passou.
Proximo passo concreto: abrir um cliente e um entregador com pedidos em varios
status nas larguras mobile, desktop e 1920 px para conferir truncamento de
nomes longos e a densidade de sete cards.

## Atualizacao — 2026-08-25: fila de despacho editavel na Home do Admin

A Home do Admin passou a expor a fila real usada pelo despacho. O card `Fila de
despacho` identifica o primeiro como `Na vez`, o segundo como `Proximo` e mostra
as demais posicoes, foto/iniciais, quantidade de pedidos ativos, tempo online e
saude do GPS. Setas permitem subir ou descer cada motoboy; `Salvar ordem` grava
a nova sequencia e `Desfazer` restaura o estado recebido da API. Outros paineis
Admin abertos invalidam a consulta pelo evento Socket.IO
`dispatch:queue-updated`.

A prioridade foi implementada como sorted set operacional no Redis. Na ausencia
de ordem persistida, o fallback continua sendo `wentOnlineAt ASC`; motoboys que
entram depois sao anexados ao fim e sair do online remove a posicao. O
`DispatchService` aplica essa prioridade somente depois de filtrar regiao,
modalidade, conta, heartbeat, oferta pendente e capacidade, preservando os
locks, a transacao serializable e a idempotencia ja existentes. Reordenar nao
toca em oferta ja enviada nem em pedido aceito: vale para os proximos despachos.
Depois que uma oferta nasce com timeout valido, a vez e consumida e o motoboy e
movido para o fim da fila circular; falha isolada nessa atualizacao de prioridade
nao cancela a oferta ja protegida pelo timeout.

Foi adicionada a rota Admin protegida
`PATCH /admin/operations/dispatch-queue`, o schema Zod
`reorderDispatchQueueSchema`, o campo `queuePosition` em
`AdminOnlineDriverItem` e o metodo correspondente no api-client. Se um motoboy
da tela ficar offline antes do salvamento, a API devolve conflito para impedir
uma decisao sobre fila antiga; quem ficar online durante a edicao e preservado
no fim. A alteracao tambem gera atividade em tempo real com o nome do Admin.
Nao houve schema Prisma nem migration.

Arquivos principais deste recorte:
`apps/api/src/live-presence/live-driver-presence.service.ts`,
`apps/api/src/dispatch/dispatch.service.ts`,
`apps/api/src/admin/operations/`,
`apps/api/src/realtime/realtime.gateway.ts`,
`packages/validation/src/admin/reorder-dispatch-queue.schema.ts`,
`packages/types/src/operations.ts`,
`packages/api-client/src/admin-operations.ts`,
`apps/admin-web/src/components/operations/dispatch-queue.tsx` e
`apps/admin-web/src/app/(app)/page.tsx`.

Validacoes executadas: build de `@motoboycity/validation`; 80 testes focados de
dispatch, operacoes Admin e presenca Redis; typecheck dos oito workspaces;
lint de API e Admin; builds de producao da API e do Admin Web. Tudo passou.
Proximo passo concreto: homologar com tres motoboys online, alterar a ordem e
criar um pedido compativel, confirmando que a oferta vai ao primeiro elegivel e
que uma oferta que ja estava pendente nao muda de destinatario.

## Atualizacao — 2026-08-25: release Android pilot.3 e publicacao do controle operacional

O conjunto de alteracoes de autonomia do motoboy, acoes administrativas sobre
pedidos, fila operacional editavel, mensagens de atividade mais completas,
geocodificacao reversa do destino final e grids de pedidos nos detalhes de
clientes e entregadores foi consolidado para publicacao. O driver-app foi
promovido para `0.1.0-pilot.3`; o APK usa `versionCode` `3` para atualizar os
pilotos anteriores.

Antes do build passaram `pnpm typecheck`, `pnpm lint`, os 62 suites/757 testes
unitarios da API, os 12 suites/67 testes do driver-app e os builds de producao
da API e do Admin Web. O release Android foi compilado em uma worktree fisica
curta fora do repositorio para evitar o limite de caminhos do CMake no Windows,
com a chave de assinatura copiada temporariamente para um caminho curto; chave,
senhas, `local.properties` e `google-services.json` continuaram fora do Git.

O `assembleRelease` concluiu com lint vital e Firebase Messaging incluído. O
artefato verificado tem pacote `com.motoboycity.driverapp`, label `motoboycity`,
`versionName` `0.1.0-pilot.3`, `versionCode` `3`, 74.968.521 bytes e SHA-256
`C8F20CF6C97335E1793DAC2071CBA8CBC8DBAA3E0F0D0A1A22AE5343BFB5152F`.
`apksigner` confirmou APK Signature Scheme v2 e o mesmo certificado oficial do
piloto anterior. A inspecao do bundle confirmou
`https://motoboycity-api.onrender.com`, ausencia de `localhost` e metadado do
Google Maps. O APK foi preservado em
`apps/driver-app/android/app/build/outputs/apk/release/motoboycity-0.1.0-pilot.3-vc3.apk`
e em `I:\MOTOboyCity\releases\motoboycity-0.1.0-pilot.3-vc3.apk`.

O artefato ainda nao foi instalado nem submetido a smoke test em aparelho nesta
sessao. Proximo passo concreto: instalar com atualizacao sobre o piloto 2 e
validar login, mapa/GPS, presenca parada por mais de 3 minutos, push/oferta em
foreground/background/tela bloqueada e o fluxo completo de aceitar, devolver,
cancelar, registrar problema, coletar e concluir.

## Atualizacao — 2026-08-25: manutencao administrativa de empresas

O responsavel pelo produto confirmou que o sistema nao tera funcionarios no
painel: existe somente o administrador com acesso total. Por isso, gestao de
administradores, cargos e permissoes saiu do roadmap deste recorte.

O detalhe de cliente no Admin ganhou `Editar empresa`, com duas gravacoes
independentes. O Admin pode alterar nome fantasia, razao social, nome e WhatsApp
do responsavel ativo; tambem pode cadastrar ou atualizar o endereco principal.
Alterar o texto do endereco remove coordenadas antigas para impedir que uma
coleta continue apontando para o local anterior. CNPJ, e-mail de login, regiao
e equipe nao sao editados neste lote.

Empresas ativas podem ser suspensas e empresas suspensas podem ser reativadas,
sempre com confirmacao que explica o efeito e informa que nenhum dado sera
excluido. A troca usa update condicional para recusar concorrencia. Suspender
desconecta os membros ativos do Socket.IO; alem disso, a estrategia JWT passou
a consultar o status da empresa em toda requisicao, invalidando tambem uma
sessao que ja estava aberta. Pedidos, faturas, enderecos e historico ficam
preservados; nao existe hard delete.

Foram adicionadas as rotas Admin protegidas `PUT /admin/companies/:id/profile`,
`PUT /admin/companies/:id/address`, `PATCH /admin/companies/:id/suspend` e
`PATCH /admin/companies/:id/reactivate`. Elas reutilizam os schemas Zod ja
existentes do perfil e endereco da empresa; nao houve alteracao Prisma nem
migration.

Arquivos principais: `apps/api/src/admin/companies/`,
`apps/api/src/auth/jwt.strategy.ts`, `packages/api-client/src/admin-companies.ts`,
`apps/admin-web/src/components/companies/edit-company-dialog.tsx`,
`apps/admin-web/src/components/companies/company-status-dialog.tsx` e
`apps/admin-web/src/app/(app)/clientes/[id]/page.tsx`.

Validacoes executadas: 20 testes focados de empresas e JWT; typecheck e lint
dos oito workspaces; builds de producao da API e do Admin Web; tudo passou. O
navegador integrado nao estava disponivel, portanto ainda falta smoke test
manual do dialogo contra uma API segura. Proximo passo concreto: implementar a
geracao manual e seletiva de faturas por empresa, mantendo cancelamento e
estorno em vez de exclusao financeira.

## Atualizacao - 2026-08-25: fatura personalizada e seletiva por empresa

A aba `Financeiro > Faturas` ganhou a acao `Criar fatura personalizada`. O
Admin seleciona uma empresa, escolhe um ou mais pedidos, informa data de emissao
e vencimento, solicita uma previa calculada pela API e so depois confirma a
emissao. A previa mostra total da empresa, repasse aos entregadores e receita da
plataforma usando os valores monetarios ja congelados em cada pedido.

Somente pedidos `COMPLETED`, com cobranca `BILLED`, valores completos e
`invoiceId` nulo aparecem na selecao. A API recusa IDs repetidos, selecao vazia,
vencimento anterior a emissao e emissao futura. Na confirmacao, ela rele todos
os pedidos dentro de transacao `Serializable`, cria uma unica fatura para a
empresa, vincula os pedidos com `updateMany` condicional e grava o autor na
trilha `InvoiceStatusHistory`. Se qualquer pedido for faturado por outra tela
entre a previa e a confirmacao, toda a operacao falha sem deixar fatura parcial
ou dupla cobranca.

O fechamento automatico semanal e o botao de recuperacao de segunda-feira nao
foram alterados. Pedidos nao selecionados continuam abertos para o proximo
fechamento. Tambem nao existe hard delete: a fatura continua usando o fluxo de
cancelamento auditavel, que devolve seus pedidos para cobranca. Nao houve
alteracao de schema Prisma nem migration.

Foram adicionadas as rotas Admin protegidas
`GET /admin/financial/invoices/manual/candidates`,
`POST /admin/financial/invoices/manual/preview` e
`POST /admin/financial/invoices/manual`, com contratos sincronizados em
`packages/validation`, `packages/types` e `packages/api-client`.

Arquivos principais: `apps/api/src/finance/invoice.controller.ts`,
`apps/api/src/finance/invoice.service.ts`, seus specs,
`packages/validation/src/finance/invoice.schema.ts`,
`packages/types/src/finance.ts`, `packages/api-client/src/invoices.ts`,
`apps/admin-web/src/components/finance/manual-invoice-dialog.tsx` e
`apps/admin-web/src/components/finance/faturas-tab.tsx`.

Validacoes executadas: 20 testes focados de fatura e validacao e, depois, os 62
suites/767 testes unitarios completos da API; typecheck e lint dos oito
workspaces; builds de producao da API e do Admin Web; tudo passou. O smoke test
autenticado ainda nao foi executado. Proximo passo concreto: publicar
primeiro a API no Render e depois o Admin Web na Vercel; em seguida emitir uma
fatura de homologacao com um pedido e confirmar detalhe, cancelamento e retorno
do pedido para a lista de disponiveis.

## Atualizacao - 2026-08-25: alteracao auditavel do vencimento de fatura

O detalhe de fatura no Admin ganhou a acao `Alterar vencimento`. Ela fica
disponivel somente para faturas `PENDING` ou `OVERDUE` e exige nova data e um
motivo de 10 a 300 caracteres. Faturas pagas ou canceladas sao imutaveis por
essa rota; o vencimento nao pode anteceder a emissao nem repetir a data atual.

Ao salvar, a API recalcula o status armazenado pela data civil de Sao Paulo:
vencimento anterior a hoje resulta em `OVERDUE`; hoje ou futuro resulta em
`PENDING`. Assim, prorrogar uma fatura vencida tambem a reabre corretamente.
O update usa `updateMany` condicionado ao status e vencimento lidos para
recusar duas alteracoes concorrentes. A trilha `InvoiceStatusHistory` registra
data anterior, nova data, motivo e Admin autor, inclusive quando o status nao
muda. Nesses casos, os detalhes de fatura dos paineis Admin e Empresa e o
relatorio de auditoria exibem `Vencimento alterado`, em vez de uma transicao
como `Pendente -> Pendente`.

Foi adicionada a rota Admin protegida
`PATCH /admin/financial/invoices/:id/due-date` e o contrato
`updateInvoiceDueDateSchema`, sincronizado com o api-client. Nao houve alteracao
de schema Prisma nem migration.

Arquivos principais: `apps/api/src/finance/invoice.controller.ts`,
`apps/api/src/finance/invoice.service.ts` e seus specs,
`packages/validation/src/finance/invoice.schema.ts`,
`packages/api-client/src/invoices.ts`,
`apps/admin-web/src/components/finance/update-invoice-due-date-dialog.tsx`,
`apps/admin-web/src/app/(app)/faturas/[id]/page.tsx`,
`apps/admin-web/src/app/(app)/relatorios/auditoria-financeira/page.tsx` e
`apps/company-web/src/app/(app)/faturas/[id]/page.tsx`.

Validacoes executadas: 62 suites/775 testes unitarios completos da API;
typecheck e lint dos oito workspaces; builds de producao da API, Admin Web e
Company Web. Tudo passou. O smoke test autenticado ainda nao foi executado.
Proximo passo concreto: publicar primeiro a API, depois Admin Web e Company Web;
em homologacao, prorrogar uma fatura vencida e antecipar outra para uma data
passada, conferindo status, motivo e autor nos detalhes e na auditoria.

## Atualizacao - 2026-08-25: cancelamento no detalhe da fatura

O detalhe da fatura no Admin passou a oferecer `Cancelar` para faturas
`PENDING` e `OVERDUE`, ao lado da alteracao de vencimento. A acao reutiliza o
mesmo dialogo auditavel da listagem: exige motivo, preserva numero e historico
e explica que os pedidos vinculados voltam para o proximo fechamento. Faturas
pagas ou ja canceladas continuam sem a opcao.

O dialogo tambem passou a invalidar a consulta especifica
`['admin', 'invoice', invoiceId]` depois do sucesso. Assim, quando usado no
detalhe, status, historico e acoes mudam imediatamente sem recarregar a pagina.
Nao houve rota, contrato, logica financeira, schema Prisma ou migration novos.

Arquivos alterados:
`apps/admin-web/src/components/finance/cancel-invoice-dialog.tsx` e
`apps/admin-web/src/app/(app)/faturas/[id]/page.tsx`. Validacoes executadas:
typecheck, lint e build de producao do Admin Web; tudo passou. O smoke test
autenticado ainda nao foi executado. Proximo passo concreto: abrir uma fatura
pendente no Admin, cancelar pelo detalhe e confirmar a troca imediata de status,
o motivo na auditoria e o retorno dos pedidos ao fechamento seguinte.

## Atualizacao - 2026-08-25: E2E alinhado a autonomia e idempotencia do motoboy

O primeiro pipeline do deploy do cancelamento no detalhe da fatura revelou
expectativas E2E antigas no ciclo de entrega. A logica de producao ja havia sido
alterada para dar autonomia ao motoboy: repetir aceite, coleta, entrega ou
confirmacao de retorno devolve o resultado ja aplicado sem duplicar transicao
ou repasse; a confirmacao de retorno tambem nao e bloqueada por distancia ou
precisao do GPS, que permanecem apenas como informacao de auditoria.

Foram atualizados somente os testes ponta a ponta para afirmar essas regras e
continuar provando que existe uma unica transicao e um unico credito financeiro.
O teste de motoboy sem posicao nao foi afrouxado: ele falhava por contaminacao
do proprio conjunto, pois o teste anterior parava antes da limpeza ao esperar
um `409` obsoleto na segunda coleta. Com o aceite idempotente esperado como
`200`, a entrega de teste volta a ser encerrada no `cleanup` e o detector segue
validado com a regra original.

Arquivos alterados: `apps/api/test/delivery-lifecycle.e2e-spec.ts` e
`apps/api/test/delivery-offers.e2e-spec.ts`. Nao houve alteracao de API,
contrato, banco, migration ou logica de producao. Proximo passo concreto:
publicar o ajuste e confirmar o E2E completo no PostgreSQL e Redis isolados da
CI. Antes da publicacao passaram o typecheck e o lint dos oito workspaces; a
descoberta das 22 suites E2E pelo Jest tambem passou sem abrir conexao com banco.

## Atualizacao - 2026-08-25: primeiro lote de autonomia administrativa concluido

Foi concluido o primeiro lote de autonomia do unico administrador do sistema.
O detalhe da empresa agora permite editar nome fantasia, razao social, CNPJ e
regiao; manter varios enderecos com escolha do principal; e criar, editar,
desativar, reativar e redefinir a senha de responsaveis. A regra de pelo menos
um proprietario ativo impede deixar a empresa sem acesso. A geracao manual e
seletiva de faturas, com previa e datas personalizadas, ja estava concluida no
lote anterior e foi preservada.

O detalhe do entregador passou a editar dados pessoais, contato, CPF,
nascimento, regiao, PIX e CNPJ, alem de enviar, revisar, rejeitar ou remover
documentos. Os arquivos aceitos sao imagem ou PDF, com limite de 8 MB, enviados
ao ImageKit e removidos do provedor quando o registro e excluido. Acoes antigas
de aprovacao, conta, senha e modalidades continuam disponiveis.

O Admin ganhou CRUD de regioes em `Configuracoes > Regioes`, incluindo limite
maximo de distancia. Uma regiao so pode ser desativada depois que empresas e
motoboys ativos forem movidos ou suspensos; nao existe hard delete.

Pedidos avulsos `SCHEDULED` ou `AWAITING_DRIVER` podem ser editados no detalhe
antes do aceite. Modalidade, agendamento, destino, destinatario, pagamento,
instrucoes e exigencias operacionais podem mudar; distancia e valores sao
recalculados e congelados novamente. A API bloqueia lote, pedido aceito e
pedido com oferta pendente para que o motoboy nunca decida sobre dados que
foram alterados enquanto a oferta estava na tela. A gravacao tambem e
condicional ao status e a ausencia de oferta no instante da transacao, evitando
que uma oferta concorrente passe entre a leitura e a edicao. O job de
agendamento antigo e removido somente depois da gravacao bem-sucedida e o
pedido e reagendado ou despachado conforme o novo horario.

Foi criada a pagina `Relatorios > Historico administrativo`, com filtros,
links para os registros e exportacao CSV. Ela combina a nova trilha generica
com os historicos existentes de pedidos e faturas. Criacao, edicao, aprovacao,
suspensao/bloqueio, reativacao, senha, modalidades, documentos e regioes
registram autor e resumo; senhas e conteudo de arquivos nunca sao gravados na
auditoria.

Foi adicionada a tabela append-only `administrative_audits` e a migration
aditiva `20260825103000_administrative_audits`. A migration foi validada pelo
Prisma, mas **nao foi aplicada ao Neon nem a qualquer banco compartilhado**.
Antes do deploy da API, ela precisa passar pelo fluxo normal de backup/staging
e `prisma migrate deploy`; publicar o Admin antes da API/migration deixaria as
novas telas sem suporte.

Arquivos principais: `apps/api/src/admin/{audit,companies,drivers,regions}`,
`apps/api/src/deliveries/deliveries.service.ts`,
`apps/api/prisma/schema.prisma`, os contratos em
`packages/{validation,types,api-client}` e as telas relacionadas de clientes,
entregadores, pedidos, configuracoes e relatorios em `apps/admin-web`.

Validacoes executadas: `prisma generate`, `prisma validate`, typecheck e lint
dos oito workspaces; 62 suites/778 testes unitarios completos da API; builds de
producao da API, Admin Web e Company Web. O upload administrativo de documentos
agora tambem confere a assinatura real de JPG, PNG, WEBP e PDF, alem do MIME e
do limite de tamanho. O smoke test autenticado e a aplicacao da migration
continuam pendentes. Proximo passo concreto: validar a migration em copia de
staging, publicar API e depois Admin Web; em homologacao, percorrer cada CRUD,
editar um pedido agendado e confirmar a trilha administrativa gerada.

## Atualizacao - 2026-08-25: configuracoes administrativas auditaveis e confirmacoes

O segundo lote de autonomia administrativa fechou a lacuna de auditoria das
configuracoes operacionais. Criacao e alteracao de modalidades, criacao,
desativacao e reativacao de tabelas de preco, todas as mutacoes de taxas
adicionais, substituicao dos horarios de funcionamento e alteracao dos
parametros globais agora gravam autor, entidade e resumo em
`administrative_audits`. A mutacao e a auditoria ficam na mesma transacao para
que uma falha nunca deixe configuracao sem historico ou historico de uma
configuracao que nao foi salva.

O `AdminPlatformSettingsService` tambem foi corrigido no primeiro cadastro dos
parametros: `maxConcurrentDeliveriesPerDriver`, `maxDeliveriesPerBatch` e
`deliveryProximityRadiusMeters` eram aceitos pelo contrato, mas eram omitidos
no ramo `create` do upsert. O update agora monta uma unica carga parcial usada
nos dois ramos, preservando todos os campos nao enviados e registrando no
historico somente os nomes dos campos alterados.

No Admin Web, aprovar empresa; aprovar, rejeitar, suspender, bloquear e reativar
entregador; ativar ou desativar modalidade e tabela de preco; e ativar,
desativar ou excluir taxa adicional exigem confirmacao explicando o efeito
operacional. O interruptor manual `Ligar agora/Desligar agora` da taxa permanece
deliberadamente em um clique, pois e um comando operacional reversivel e de
resposta imediata. O historico administrativo ganhou filtros e links para
modalidades, tabelas, taxas, horarios e parametros operacionais.

Nao houve alteracao de schema Prisma nem nova migration neste lote. O enum do
filtro de auditoria foi ampliado em `packages/validation`; rotas e formatos de
resposta existentes foram preservados. Arquivos principais:
`apps/api/src/admin/{service-types,pricing-tables,surcharges,business-hours,platform-settings}`,
`packages/validation/src/admin/administrative-audit.schema.ts`,
`apps/admin-web/src/components/admin/confirm-action-dialog.tsx` e as paginas de
clientes, entregadores, configuracoes e historico administrativo.

Validacoes executadas: 64 suites/783 testes unitarios completos da API;
typecheck e lint dos oito workspaces; builds de producao da API, Admin Web e
Company Web. Tudo passou. O smoke test autenticado dos novos dialogos ainda nao
foi executado. Proximo passo concreto: em homologacao, confirmar cada acao
critica e verificar o evento correspondente no historico; depois revisar a
autonomia financeira restante, especialmente conferencia e processamento de
saques, sem criar exclusao destrutiva de lancamentos.

## Atualizacao - 2026-08-25: decisoes administrativas de saque protegidas

A conferencia e o processamento de saques no Admin foram reforcados sem
alterar o ledger, o schema Prisma ou criar migration. Aprovar, marcar como pago
e rejeitar agora exigem motivo auditavel com no minimo 10 caracteres tanto no
contrato compartilhado quanto na API. Os fallbacks que geravam justificativas
genericas no servidor foram removidos; toda decisao financeira passa a guardar
o contexto escrito pelo administrador e o autor autenticado ja registrado no
historico de status.

A tela de detalhe do saque passou a bloquear as acoes enquanto o motivo nao e
valido e a pedir confirmacao explicita. A aprovacao explica que ainda nao houve
transferencia; o pagamento orienta confirmar somente depois do PIX; a rejeicao
avisa que o lancamento pendente sera cancelado e o valor retornara ao saldo
disponivel. A referencia ou comprovante continua opcional. Depois de qualquer
acao, todo o namespace financeiro do cache e invalidado para atualizar fila,
carteiras, indicadores, aging e relatorios. Datas do detalhe e do historico
agora sao exibidas explicitamente no fuso `America/Sao_Paulo`.

Foram adicionados testes de contrato para motivo ausente, curto e valido, alem
de cenarios E2E que comprovam que entradas invalidas retornam `400` sem mudar o
status nem o saldo. Arquivos principais:
`packages/validation/src/finance/withdrawal.schema.ts`,
`packages/api-client/src/admin-financial.ts`,
`apps/api/src/finance/financial-payout.service.ts`,
`apps/api/src/finance/withdrawal-validation.spec.ts`,
`apps/api/test/withdrawal-payout.e2e-spec.ts` e
`apps/admin-web/src/app/(app)/financeiro/saques/[id]/page.tsx`.

Validacoes executadas: build do pacote de validacao; 2 suites/9 testes
direcionados da API; typecheck e lint dos oito workspaces; builds de producao
da API e do Admin Web. Tudo passou. O E2E alterado nao foi executado localmente
porque depende de PostgreSQL e Redis isolados; deve rodar na CI preparada para
esse fim. Proximo passo concreto: em homologacao, aprovar, pagar e rejeitar
saques de teste, conferindo carteira, aging e trilha auditavel; a antecipacao
de saldo permanece fora do escopo ate existir demanda confirmada no piloto.

## Atualizacao - 2026-08-25: pedidos da empresa em grid de cards

A listagem de `Company Web > Pedidos` foi convertida de linhas horizontais
para um grid responsivo de cards, com uma coluna no celular e ate cinco em
telas grandes. Cada card preserva o trilho de cor do status e mostra numero,
modalidade, referencia externa, criacao ou agendamento, distancia, retorno,
forma de cobranca e valor. As acoes existentes de abrir detalhes e cancelar
continuam usando os mesmos endpoints e regras; busca, filtro, rastreamento ao
vivo e paginacao tambem foram preservados.

Nao houve mudanca de contrato, API, autorizacao, banco ou logica operacional.
O horario exibido na listagem e no rastreamento passou a declarar
`America/Sao_Paulo` explicitamente. Arquivo alterado:
`apps/company-web/src/app/(app)/pedidos/page.tsx`.

Validacoes executadas: formatacao do arquivo alterado, typecheck, lint e build
de producao do Company Web. Tudo passou. O smoke visual autenticado nao foi
executado nesta sessao. Proximo passo concreto: abrir `/pedidos` com uma conta
de empresa em desktop e celular, conferir cards com e sem retorno, pedidos
agendados e o cancelamento dos estados permitidos.

## Atualizacao - 2026-08-25: atalho flutuante do app do motoboy

O aplicativo Android ganhou um atalho flutuante opcional para o motoboy voltar
ao MOTOboyCity com um toque enquanto trabalha em outro aplicativo. A opcao fica
em `Ajustes > Operacao > Botao flutuante` e depende da autorizacao explicita
`Exibir sobre outros apps`, que ja era usada pela apresentacao nativa de
ofertas. Ao retornar dos ajustes do Android, a tela atualiza o estado da
permissao automaticamente.

A bolha usa o icone redondo existente, pode ser arrastada e encaixa na lateral;
a posicao e a preferencia de ativacao ficam somente no aparelho. Ela aparece
apenas quando o motoboy esta online e o aplicativo esta minimizado. Ao abrir a
Activity principal ou o cartao nativo de oferta, ficar offline, sair da conta,
perder o rastreamento ou encerrar o servico, a bolha e removida. O toque traz a
`MainActivity` `singleTask` existente para frente e preserva a navegacao atual.

A implementacao reaproveita o `DeliveryLocationTrackingService`, que ja e um
foreground service de localizacao enquanto o motoboy esta online. Assim nao
foi criado um segundo servico persistente, uma segunda notificacao nem o tipo
`specialUse`. A permissao continua opcional: nega-la nao altera localizacao,
push, ofertas ou o ciclo de entregas. Nao houve mudanca de API, contrato,
banco, schema Prisma, migration ou dependencia.

Arquivos principais:
`apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/{FloatingLauncherOverlay,FloatingShortcutStore,FloatingShortcutModule,FloatingShortcutPackage,DriverAppVisibility}.kt`,
`DeliveryLocationTrackingService.kt`, `MainApplication.kt`,
`apps/driver-app/src/lib/floatingShortcut.ts` e
`apps/driver-app/src/screens/SettingsScreen.tsx`.

Validacoes executadas: typecheck e lint do Driver App; 13 suites/71 testes
Jest; `:app:compileDebugKotlin` com target SDK 36. Tudo passou. Ainda falta o
smoke test em aparelho real, principalmente no Xiaomi/HyperOS: autorizar a
sobreposicao, ativar o atalho, ficar online, minimizar, arrastar para ambos os
lados, tocar para reabrir, exibir uma oferta e ficar offline. Proximo passo
concreto: executar esse roteiro antes de gerar o proximo APK de piloto e
documentar o uso ampliado de `SYSTEM_ALERT_WINDOW` na publicacao da Play Store.

## Atualizacao - 2026-08-25: release Android pilot.4 com atalho flutuante

O Driver App foi promovido para `0.1.0-pilot.4`, com `versionCode` `4`, e o
APK release foi gerado para atualizar os pilotos anteriores. O artefato inclui
o atalho flutuante opcional documentado acima, usa `applicationId`
`com.motoboycity.driverapp`, `minSdk` 24, `targetSdk` 36 e label
`motoboycity`.

O build foi executado em uma copia fisica temporaria curta em
`C:\Users\Pichau\m4`, porque o caminho normal ultrapassa o limite de 260
caracteres do CMake/Ninja no Windows. A chave oficial foi copiada somente para
`C:\Users\Pichau\m4\k.jks` durante a compilacao; a copia temporaria e suas
credenciais foram removidas ao final. O pacote `@motoboycity/validation` foi
compilado antes da segunda passagem do Metro, conforme a regra do monorepo.

O APK final tem 75.017.145 bytes e SHA-256
`8D542F4EAC7AB487BA3A3D06515A7F5E4F5B37E848CB518E9502D88454B0C00E`.
O `apksigner` confirmou o mesmo certificado oficial dos releases anteriores,
com SHA-256
`BD42D61D35819B86CB9D1FF784D3E64340C0CE153E21B0332AE97B4CF51D50B9`.
O bundle contem `https://motoboycity-api.onrender.com`, nao contem
`localhost:3333` e inclui o metadado do Google Maps. O artefato foi preservado
em
`apps/driver-app/android/app/build/outputs/apk/release/motoboycity-0.1.0-pilot.4-vc4.apk`
e em `I:\MOTOboyCity\releases\motoboycity-0.1.0-pilot.4-vc4.apk`.

Validacoes executadas: typecheck e lint do Driver App; 13 suites/71 testes
Jest; build de `@motoboycity/validation`; `:app:compileDebugKotlin` e
`assembleRelease`; verificacao de assinatura, certificado, versao, SDKs, URL
de producao e ausencia de localhost. Tudo passou. Nenhum aparelho estava
conectado ao ADB, portanto a instalacao e o smoke test Xiaomi/HyperOS continuam
pendentes. Proximo passo concreto: instalar o pilot.4 sobre o pilot.3 e testar
permissao, ativacao, arraste, reabertura, oferta nativa e remocao da bolha ao
ficar offline.

## Atualizacao - 2026-08-25: detalhe do pedido da empresa em grid compacto

A pagina `Company Web > Pedidos > Detalhes` foi reorganizada para aproveitar
melhor telas largas sem alterar os dados ou as acoes do pedido. Destinatario,
operacao e faturamento agora formam um grid de tres cards compactos, com os
campos internos em duas colunas quando houver espaco. Coleta e entrega foram
posicionadas ao lado do mapa, mantendo endereco, referencia e link das
coordenadas. No celular, todos esses blocos continuam empilhados.

O historico do pedido tambem passou de uma lista de cards em largura total para
um grid responsivo de ate cinco colunas. Cada etapa mostra sequencia, transicao
de status, horario, duracao, observacao e autor, preservando a mesma ordem e os
mesmos valores recebidos da API. Rastreamento GPS, cancelamento, atualizacao em
tempo real e consultas existentes nao foram modificados.

Nao houve mudanca de contrato, API, autorizacao, banco ou logica operacional.
Arquivo funcional alterado:
`apps/company-web/src/app/(app)/pedidos/[id]/page.tsx`.

Validacoes executadas: formatacao do arquivo alterado, typecheck e lint do
Company Web e build de producao do Company Web. Tudo passou. A conferencia
visual autenticada nao foi executada porque nenhum navegador controlavel estava
disponivel nesta sessao. Proximo passo concreto: abrir um pedido com historico,
coordenadas, fatura e instrucao ao entregador em desktop e celular para conferir
quebras de texto e o empilhamento responsivo.

## Atualizacao - 2026-08-25: divisao personalizada por empresa e modalidade

As tabelas de preco personalizadas agora versionam tambem a divisao do subtotal
base + distancia entre motoboy e plataforma. Ao criar uma tabela para uma
empresa, o admin informa o percentual do motoboy entre 0% e 100%; a plataforma
recebe automaticamente o complemento. Preco e divisao entram na mesma nova
versao e a anterior do mesmo escopo empresa + modalidade continua sendo
desativada atomicamente.

A tabela geral continua usando
`PlatformSettings.driverCommissionPercentage`. Tabelas personalizadas antigas
ficam com `PricingTable.driverCommissionPercentage = null` e tambem continuam
herdando o global, sem backfill e sem mudar pedidos existentes. Quando a tabela
personalizada tem override, a cotacao nao depende da configuracao global. O
retorno permanece 100% do motoboy e cada taxa adicional preserva seu proprio
`driverSharePercentage`. Os valores calculados continuam congelados em
`Delivery`.

O contrato de criacao exige o percentual quando `companyId` existe e o recusa
em uma tabela geral, mantendo uma unica fonte de verdade para cada escopo. O
valor aceita no maximo duas casas decimais, coerente com `DECIMAL(5,2)`, e o
service repete a guarda de escopo/presenca mesmo quando chamado sem o
controller. A listagem passou a expor o campo nullable. No Admin Web, a selecao
de empresa abre os campos `Motoboy (%)` e `Plataforma (%)`; o segundo e
calculado e somente leitura. Trocar de empresa limpa a divisao digitada para
nao copiar um acordo por engano. A tabela historica mostra a divisao propria ou
informa que a versao herda o global.

Schema e migration aditiva:
`apps/api/prisma/migrations/20260825162135_company_pricing_commission_override/migration.sql`.
A migration adiciona somente `DECIMAL(5,2) NULL`, sem default nem backfill. O
`prisma migrate dev` nao pode concluir porque o PostgreSQL local em
`localhost:5434` estava indisponivel; o SQL foi entao gerado pelo Prisma com
`migrate diff`, comparando o schema do `HEAD` com o schema novo, e revisado. Ela
nao foi aplicada em Neon nem em outro banco compartilhado.

Arquivos principais: `apps/api/prisma/schema.prisma`, a migration acima,
`packages/validation/src/admin/create-pricing-table.schema.ts`,
`packages/types/src/pricing.ts`,
`packages/api-client/src/admin-pricing-tables.ts`,
`apps/api/src/{admin/pricing-tables,pricing}` e
`apps/admin-web/src/app/(app)/configuracoes/tabela-de-precos/page.tsx`.
`docs/business-rules.md` foi atualizado para registrar a nova decisao de
produto.

Validacoes executadas: `prisma generate` e `prisma validate`; 65 suites/795
testes unitarios completos da API; typecheck e lint dos oito workspaces; builds
de producao da API e do Admin Web. Tudo passou. O E2E alterado nao foi
executado, pois PostgreSQL e Redis isolados nao estavam disponiveis. Deploy seguro:
validar backup/restauracao em staging, aplicar a migration, publicar a API e
logo depois o Admin Web; testar uma cotacao geral, uma personalizada nova e
uma personalizada antiga. Em rollback, manter a coluna. Depois que overrides
forem usados, voltar para uma API antiga faria novas cotacoes ignorarem a
divisao; prefira correcao para frente ou pause temporariamente as empresas
afetadas.

## Atualizacao - 2026-08-25: problema na entrega preserva o valor normal

O fluxo de insucesso depois da coleta foi corrigido para manter o pedido com o
mesmo motoboy, exigir a devolucao da mercadoria a empresa e contabilizar o
valor normal da corrida. Antes da coleta, a acao continua sendo apenas
`Devolver a fila`; o menu `Problema na entrega` deixou de aparecer nessa etapa
para nao sugerir que uma mercadoria ainda nao coletada precisa ser devolvida.

Em pedidos cujo destino ja era conhecido, o valor congelado na criacao
continua intacto. Em pedidos cujo destino seria definido pelo GPS, o app agora
captura a posicao no momento em que o motoboy informa o problema. A API calcula
a rota desde a coleta, aplica a tabela e a divisao vigentes, grava o DROPOFF e
congela `distanceKm`, `totalValue`, `driverValue`, `platformValue`, retorno e
taxa adicional na mesma transicao condicional `COLLECTED -> FAILED`. Sem GPS
valido, a transicao e recusada e o pedido permanece coletado; assim nao nasce
outra devolucao sem valor.

O repasse nao e criado no registro do problema. Ele continua saindo uma unica
vez pelo fluxo idempotente `complete-return`, quando o mesmo motoboy confirma a
devolucao na loja. O insucesso nao desconta nem acrescenta valor; a taxa de
retorno so permanece quando o pedido ja tinha `requiresReturn=true`. O GPS da
devolucao nao altera o preco nem bloqueia o fechamento.

Arquivos funcionais principais:
`apps/api/src/deliveries/deliveries.service.ts` e
`apps/driver-app/src/screens/DeliveryOperationScreen.tsx`. Cobertura adicionada
em `apps/api/src/deliveries/deliveries.service.spec.ts` e
`apps/api/test/delivery-lifecycle.e2e-spec.ts`; a validacao compartilhada de
`mark-failed` ja aceitava `lat`, `lng` e `accuracy`, portanto nao houve mudanca
de rota, contrato, banco ou migration para este ajuste.

Validacoes executadas: 96 testes unitarios focados de `DeliveriesService`;
typecheck, lint e build de producao da API; typecheck, lint e 13 suites/71
testes do Driver App. Tudo passou. O E2E alterado nao foi executado nesta
sessao porque PostgreSQL e Redis isolados nao foram disponibilizados. Como o
ambiente ainda e de testes, pedidos `FAILED` antigos que ja ficaram sem valor
nao serao recuperados automaticamente: podem ser cancelados e recriados. Essa
decisao evita precificar uma tentativa antiga usando a posicao posterior na
loja ou um ponto de rastreamento inferido. Proximo passo concreto: publicar API
e novo APK em conjunto e testar em aparelho real um pedido com destino
conhecido e outro por GPS, do problema ate a confirmacao da devolucao e o
credito na carteira.

## Atualizacao - 2026-08-25: release Android pilot.5 para problema na entrega

O Driver App foi promovido para `0.1.0-pilot.5`, com `versionCode` `5`, para
distribuir o fluxo corrigido de problema na entrega descrito acima. O APK usa
`applicationId` `com.motoboycity.driverapp`, `minSdk` 24, `targetSdk` 36 e
label `motoboycity`.

Para evitar o limite de caminho do CMake/Ninja no Windows, o build foi feito
em uma copia fisica curta em `C:\m5`; a chave oficial foi copiada apenas para
`C:\m5\k.jks` durante a compilacao. Depois da preservacao e conferencia do
artefato, a copia temporaria e a chave foram removidas; `C:\m5` nao existe
mais. O pacote
`@motoboycity/validation` foi compilado antes do `assembleRelease`.

O APK final tem 75.018.469 bytes e SHA-256
`FFF8A42C64D343945787716A02EF60BA06FA32575F5081577219A9BC22129010`.
O `apksigner` confirmou APK Signature Scheme v2 e o certificado oficial com
SHA-256
`BD42D61D35819B86CB9D1FF784D3E64340C0CE153E21B0332AE97B4CF51D50B9`.
O bundle contem `https://motoboycity-api.onrender.com` e nao contem endpoint
de desenvolvimento (`localhost:3333`, `127.0.0.1` ou `10.0.2.2`); existe uma
unica palavra generica `localhost` trazida pelo codigo empacotado, sem URL ou
porta. O manifesto inclui o metadado do Google Maps. O artefato foi preservado
em
`apps/driver-app/android/app/build/outputs/apk/release/motoboycity-0.1.0-pilot.5-vc5.apk`
e em `I:\MOTOboyCity\releases\motoboycity-0.1.0-pilot.5-vc5.apk`.

Validacoes executadas: typecheck e lint do Driver App; 13 suites/71 testes
Jest; build de `@motoboycity/validation`; `clean assembleRelease`; verificacao
de assinatura, certificado, package, versao, SDKs, label, URL de producao,
endpoints locais e metadado do Google Maps. Tudo passou. O primeiro disparo
paralelo do Jest encontrou uma contencao `EPERM` na DLL do Prisma durante
instalacoes PNPM simultaneas; a repeticao isolada passou integralmente e nao
indicou regressao do aplicativo. O APK ainda nao foi instalado nesta sessao.
Proximo passo concreto: instalar o pilot.5 sobre o pilot.4 e testar em aparelho
real um pedido com destino conhecido e outro definido por GPS, desde
`Problema na entrega` ate a devolucao na loja e o credito correto na carteira.

## Atualizacao - 2026-08-25: ferramenta protegida para limpar dados de teste

Foi preparada uma rotina administrativa de pre-producao para remover o
movimento operacional e financeiro de teste antes da entrada das empresas
reais. A rotina preserva usuarios, administradores, empresas, membros,
motoboys, documentos, veiculos, tokens do app, regioes, modalidades, tabelas
de preco, taxas e configuracoes. Ela remove pedidos e filhos, faturas e
filhos, saques, antecipacoes, lancamentos de carteira, notificacoes/auditorias
diretamente relacionadas e logs de presenca; as carteiras ficam zeradas e os
motoboys offline. No Redis, somente a fila `dispatch` e as chaves efemeras de
presenca sao limpas.

O comando `data:reset:preproduction` e dry-run por padrao. A escrita exige
confirmacao textual, declaracao de backup, API/workers parados, confirmacao do
reset financeiro, alvo exato do PostgreSQL e do Redis (protocolo TLS, host,
porta, banco/schema ou indice) e fingerprints separados dos dois snapshots. A fila e pausada,
revalidada, obliterada sem `force` e sempre reativada em `finally`; qualquer
corrida interrompe a operacao. Existe `--redis-only` para recuperacao seletiva
se o PostgreSQL tiver sido efetivado e a etapa Redis falhar. O reinicio da
numeracao visual para `#1` continua opcional e ocorre dentro da transacao do
banco.

Arquivos: `apps/api/scripts/reset-preproduction-data.cjs`, seu teste Node,
scripts em `apps/api/package.json`, o runbook
`docs/runbooks/preproduction-data-reset.md` e uma etapa dedicada em
`.github/workflows/ci.yml`. Validacoes executadas: `node --check` nos dois
scripts; 11/11 testes de seguranca (incluindo corrida, limpeza seletiva,
ausencia de `force` e retomada da fila); comando pelo PNPM; Prettier; `git diff
--check`; typecheck da API; e verificacao local dos metodos usados pela versao
instalada do BullMQ. Tudo passou. Nao houve conexao, dry-run nem exclusao no
Neon/Redis de producao nesta sessao. O dry-run foi tentado com a configuracao
local, mas parou antes de qualquer leitura/escrita porque ela aponta para
`localhost:6379`, que estava indisponivel. O tratamento de erro do ioredis e
BullMQ foi endurecido para essa falha terminar de forma controlada, sem uma
segunda excecao nao tratada. Tambem nao houve teste integrado destrutivo, pois ele
exige PostgreSQL e Redis descartaveis. Proximo passo concreto: criar e validar
um restore point/branch no Neon, parar API, workers e apps de teste, executar o
dry-run contra producao e revisar alvos, contagens e hashes antes de solicitar
separadamente a execucao destrutiva.

## Atualizacao - 2026-08-25: filtro por empresa nos pedidos do Admin

A pagina `Admin Web > Pedidos` agora permite selecionar uma empresa ou voltar
para `Todas as empresas`. O filtro usa a listagem administrativa real de
empresas e envia `companyId` para a busca paginada existente no servidor. Ao
trocar a empresa, a navegacao retorna para a primeira pagina para evitar uma
pagina vazia fora do novo universo filtrado.

O mesmo recorte tambem e aplicado ao bloco de rastreamento ao vivo exibido no
topo da pagina, para que os cards e o contador nao misturem entregas de outra
empresa enquanto o filtro estiver ativo. Empresas suspensas ou pendentes
continuam disponiveis no seletor, pois seus pedidos historicos ainda precisam
ser consultados. Falhas ao carregar o seletor sao mostradas ao administrador.

Nao houve mudanca de API, contrato, autorizacao, banco ou schema: o endpoint
`GET /deliveries/search` e o cliente compartilhado ja aceitavam `companyId`
para usuarios `ADMIN`. Arquivo funcional alterado:
`apps/admin-web/src/app/(app)/pedidos/page.tsx`.

Validacoes executadas: Prettier no arquivo alterado; typecheck, lint e build de
producao do Admin Web. Tudo passou. O smoke visual autenticado nao foi
executado nesta sessao. Proximo passo concreto: abrir `/pedidos`, alternar
entre duas empresas com pedidos e combinar o seletor com os filtros de status,
conferindo cards, contador de rastreamento e paginacao.

## Atualizacao - 2026-08-25: primeiro lote da auditoria de UX do Admin

O primeiro lote da auditoria de UX foi aplicado nas telas mais operacionais do
Admin Web. Em `Pedidos`, os filtros de empresa, status e pagina agora vivem na
URL (`empresa`, `status` e `pagina`). Isso corrige o atalho da home que ja abria
`/pedidos?status=...`, mas antes era ignorado pela listagem, e preserva o
contexto ao atualizar, voltar pelo navegador ou compartilhar o link. O status
`FAILED` tambem passou a existir no filtro. Os controles foram movidos para o
topo da pagina, antes da grade, para permanecerem acessiveis no celular.

A pagina de Pedidos ganhou hierarquia visual e cores semanticas: cabecalho
operacional em azul-petroleo, status em cinza/ambar/verde/vermelho/azul conforme
o ciclo real, rastreamento em verde e valores em azul informativo. O grid de ate
sete cards foi preservado. Textos funcionais de 10 px foram elevados para 12 px
nos cards alterados. Carregamento, erro e vazio agora usam um componente comum
com rotulo explicito, icone, cor e acao de nova tentativa; falha no rastreamento
deixou de parecer simplesmente uma operacao sem entregas ativas.

O mesmo componente foi aplicado a `Clientes` e `Entregadores`. Seus indicadores
deixaram de mostrar zero quando a consulta falha e os cards receberam fundos
suaves conforme situacao ativa, pendente/suspensa ou bloqueada. A central de
Configuracoes agora avisa quando uma ou mais consultas falham, permite tentar
novamente e usa um trilho colorido por area sem bloquear os atalhos restantes.

Arquivos funcionais:
`apps/admin-web/src/app/(app)/{pedidos,clientes,entregadores,configuracoes}/page.tsx`
e `apps/admin-web/src/components/ui/query-state.tsx`. Nao houve mudanca de API,
contrato, autorizacao, banco, schema Prisma ou regra de negocio.

Validacoes executadas: Prettier nos cinco arquivos; typecheck e lint do Admin
Web; build de producao do Admin Web com 37 paginas geradas. Tudo passou. As
primeiras tentativas de typecheck/lint no sandbox foram bloqueadas pelo Windows
ao ler `node_modules`; a repeticao autorizada fora do sandbox passou. O smoke
visual autenticado continua pendente porque nenhum navegador controlavel estava
disponivel nesta sessao. Proximo passo concreto: conferir `/pedidos` em desktop
e celular, inclusive um link vindo da fila da home, e depois seguir para o lote
de navegacao mobile e padronizacao dos cabecalhos.

## Atualizacao - 2026-08-25: segundo lote da auditoria de UX do Admin

A navegacao principal do Admin Web deixou de ser uma faixa horizontal rolavel
em telas pequenas. No desktop, os oito destinos continuam visiveis na barra
superior. Abaixo de `xl`, um menu compacto mostra a area atual e organiza os
destinos em quatro grupos: Operacao, Comercial, Analise e Sistema. Cada grupo
usa uma cor semantica e a pagina ativa permanece identificada visualmente e por
`aria-current`. Os rotulos do componente Base UI foram mantidos dentro de
`DropdownMenuGroup`, evitando a regressao conhecida de contexto ausente.

Tambem foi criado um cabecalho administrativo comum com icone, contexto,
titulo, descricao, acao opcional e cinco tons por dominio. Ele foi aplicado a
Operacao global, Empresas, Entregadores, Financeiro, Central de relatorios e
Configuracoes. As cores agora ajudam a reconhecer a area sem mudar logica:
ambar para operacao, verde para clientes, azul para financeiro, teal para
analise e azul-petroleo/teal para configuracoes. Botoes e indicadores que ja
existiam foram preservados como acoes do cabecalho.

Arquivos funcionais: `apps/admin-web/src/components/layout/top-nav.tsx`,
`apps/admin-web/src/components/layout/admin-page-header.tsx` e as paginas
principais em `apps/admin-web/src/app/(app)/{page.tsx,clientes,entregadores,
financeiro,relatorios,configuracoes}`. Nao houve mudanca de API, contrato,
autorizacao, banco, schema Prisma ou regra de negocio.

Validacoes executadas: Prettier nos arquivos alterados; typecheck, lint e build
de producao do Admin Web com 37 paginas geradas. A primeira execucao do
typecheck encontrou somente uma inferencia heterogenea no `flatMap` do menu; os
tipos `NavItem` e `NavGroup` foram explicitados e a repeticao passou. O smoke
visual autenticado continua pendente porque nenhum navegador controlavel estava
disponivel nesta sessao. Proximo passo concreto: validar o menu em larguras de
celular e tablet e seguir para o terceiro lote, padronizando feedback de acoes,
confirmacoes e formularios nas telas administrativas mais densas.

## Atualizacao - 2026-08-25: terceiro lote da auditoria de UX do Admin

O Admin Web agora possui dois componentes comuns para a resposta visual de
acoes. `ActionFeedback` apresenta sucesso, erro, aviso e informacao com icone,
cor semantica, titulo opcional, regiao `aria-live` adequada e fechamento
opcional. `PendingButtonLabel` mantem um indicador animado e texto consistente
enquanto uma mutacao esta em andamento. Erros continuam exibindo a mensagem
real de `ApiError` quando o fluxo ja a fornecia; nenhuma falha foi ocultada ou
transformada em sucesso local.

O padrao foi aplicado primeiro aos fluxos administrativos mais sensiveis:
cadastro e aprovacao de empresas, cadastro e gestao de entregadores, criacao de
pedido em nome da empresa, edicao de empresa/endereco, troca de senha e dialogo
generico de confirmacao. No financeiro, passou a cobrir fechamento e
cancelamento de fatura, baixa de pagamento, alteracao de vencimento e ajuste
manual de carteira. Consequencias antes exibidas em caixas isoladas agora usam
aviso/informacao; falhas possuem titulo contextual; sucessos usam regiao de
status; botoes assincronos mostram spinner alem do texto. A ancora de foco do
erro no cadastro de entregador foi preservada por `id` e `tabIndex`.

Arquivos comuns:
`apps/admin-web/src/components/ui/{action-feedback,pending-button-label}.tsx`.
Consumidores principais em `components/{admin,companies,drivers,deliveries,
users,finance}` e nas paginas `clientes` e `entregadores`. Nao houve mudanca de
API, contrato, autorizacao, banco, schema Prisma, invalidacao de query ou regra
de negocio.

Validacoes executadas: Prettier nos arquivos alterados; typecheck, lint e build
de producao do Admin Web com 37 paginas geradas. Tudo passou. O navegador
controlavel foi consultado para smoke visual, mas nenhuma instancia estava
disponivel nesta sessao; portanto a verificacao autenticada de abertura,
submissao com erro e sucesso dos dialogos continua manual. Proximo passo
concreto: testar em `/clientes`, `/entregadores`, detalhe de fatura e carteiras
um erro real e uma acao bem-sucedida, conferindo foco, spinner e fechamento; o
quarto lote pode compactar formularios longos e padronizar estados de consulta
restantes no financeiro.

## Atualizacao - 2026-08-25: quarto lote da auditoria de UX do Admin

As consultas principais do Financeiro agora diferenciam explicitamente
carregamento, falha e ausencia real de dados. O componente comum `QueryState`
foi aplicado ao painel financeiro, movimento por periodo, faturas, avisos de
pagamento, carteiras, historico de saques, demonstrativo, recebimentos e aos
quadros de idade de contas a receber e repasses. Cada falha oferece `Tentar
novamente` usando o `refetch` da consulta existente.

Foi corrigida uma ambiguidade operacional importante: falhas em avisos de
pagamento e no historico de saques podiam cair tambem no estado vazio, fazendo
uma consulta indisponivel parecer uma fila sem trabalho. Indicadores financeiros
continuam aparecendo somente quando os dados foram retornados; em caso de erro,
uma mensagem informa que os numeros foram ocultados para nao parecerem `R$ 0,00`
por engano. Nenhuma query key, endpoint, permissao, mutacao ou regra financeira
foi alterada.

Arquivos funcionais: `apps/admin-web/src/components/finance/{painel-tab,
carteiras-tab,faturas-tab,avisos-tab,demonstrativo-tab,recebimentos-tab,
payouts-aging,receivables-aging}.tsx`. Validacoes executadas: Prettier nos oito
componentes; typecheck, lint e build de producao do Admin Web, com 37 paginas
geradas; `git diff --check` sem erro de whitespace. O smoke visual autenticado
continua manual porque nao ha navegador controlavel nesta sessao. Proximo passo
concreto: simular uma falha de rede em cada aba de `/financeiro`, acionar
`Tentar novamente` e conferir que nenhum total ou fila aparece como zero/vazio
durante a falha; o proximo lote pode compactar os formularios financeiros mais
longos e levar o mesmo estado de consulta aos dialogos auxiliares.

## Atualizacao - 2026-08-25: quinto lote da auditoria de UX do Admin

O fluxo `Criar fatura personalizada` foi compactado para aproveitar melhor a
largura do desktop sem perder a disposicao vertical no celular. O dialogo agora
usa largura ampliada, agrupa empresa, emissao e vencimento na mesma grade
responsiva e mantem a lista de pedidos com rolagem propria. Textos operacionais
foram revisados e os botoes de previa/emissao exibem progresso com spinner.

As duas consultas internas do dialogo agora diferenciam carregamento, falha e
resultado vazio. Falha ao buscar empresas bloqueia somente o seletor e oferece
nova tentativa; falha ao buscar pedidos faturaveis nao aparece mais como empresa
sem entregas. A selecao de pedidos usa feedback informativo e erros de previa ou
emissao preservam a mensagem real de `ApiError` em um alerta dispensavel.

Os detalhes administrativos de fatura e saque tambem receberam `QueryState`
para carregamento e falha, com `refetch` e caminho de volta para a lista. No
saque, falhas de aprovar, pagar ou rejeitar passaram a usar `ActionFeedback`,
sem alterar confirmacoes, motivos obrigatorios, invalidacao de queries ou
mutacoes. O fallback de `Suspense` da area Financeiro segue o mesmo padrao
visual. Nao houve mudanca de API, contrato, autorizacao, banco, schema ou regra
financeira.

Arquivos funcionais: `apps/admin-web/src/components/finance/
manual-invoice-dialog.tsx`, `apps/admin-web/src/app/(app)/faturas/[id]/
page.tsx`, `apps/admin-web/src/app/(app)/financeiro/saques/[id]/page.tsx` e
`apps/admin-web/src/app/(app)/financeiro/page.tsx`. Validacoes executadas:
Prettier nos quatro arquivos; typecheck, lint e build de producao do Admin Web,
com 37 paginas geradas; `git diff --check` sem erro de whitespace. O smoke
visual autenticado continua manual porque nao ha navegador controlavel nesta
sessao. Proximo passo concreto: abrir uma fatura personalizada em desktop e
celular, testar empresa sem pedidos e falha de rede; depois seguir para os
detalhes de empresa/entregador, onde ainda existem listas financeiras com
estados de texto simples.

## Atualizacao - 2026-08-25: filas e indicadores mais legiveis na Home do Admin

A visao `Por status` das Filas operacionais recebeu uma apresentacao mais
compacta para facilitar a leitura em uma coluna estreita. Cada etapa agora tem
icone e cor de reconhecimento proprios, contador em formato de pilula e a seta
de expansao alinhada a direita. As oito filas, as abas `Por status` e `Por
empresa`, a abertura automatica de filas com pedidos, a selecao do pedido e os
links para itens excedentes foram preservados.

Abaixo do mapa foi adicionada uma faixa responsiva com cinco indicadores reais:
pedidos ativos, motoboys online, pedidos criados hoje, taxa de conclusao e tempo
medio de entrega. Os dois primeiros usam o panorama operacional ja carregado;
os tres seguintes reutilizam `GET /admin/reports/operations` com o dia civil de
Sao Paulo. A taxa considera somente corridas encerradas com entregador
(concluidas, insucessos e cancelamentos depois do aceite), e o tempo medio e
ponderado pela quantidade real de amostras de cada motoboy. Sem amostra o texto
explica a ausencia; falha ou carregamento mostram traco, nunca zero falso.

O relatorio do dia atualiza a cada minuto e tambem quando chega
`delivery:updated`. Eventos frequentes de localizacao continuam invalidando
somente o panorama operacional, evitando consultar o relatorio a cada ponto de
GPS. A mudanca esta concentrada em
`apps/admin-web/src/app/(app)/page.tsx`; nao houve novo endpoint, contrato,
permissao, banco ou regra operacional. Validacoes executadas: Prettier,
typecheck e lint do Admin Web, todos aprovados. O lint detectou inicialmente o
uso impuro de `Date.now()` no render; a data passou a ser derivada de
`generatedAt` devolvido pela API e a repeticao passou. As primeiras validacoes
da etapa visual no sandbox tambem haviam sido bloqueadas pelo Windows ao ler
`node_modules`; a repeticao autorizada fora do sandbox passou. O smoke visual
autenticado permanece manual. Proximo passo concreto: conferir na Home a
expansao de filas e a faixa abaixo do mapa em desktop e celular, validando
contraste, quebra responsiva e numeros contra o relatorio do dia.

## Atualizacao - 2026-08-25: realtime e atividade da Home sem consultas duplicadas

O evento frequente `driver:location` da Home deixou de invalidar e buscar todo o
panorama operacional. A posicao, precisao e horario do motoboy agora sao
aplicados diretamente ao cache das consultas `admin/operations`; o refetch de
30 segundos continua como reconciliacao de seguranca. Entrada/saida de
motoboys, mudanca de pedido e reordenacao da fila continuam invalidando a
consulta, pois alteram mais dados que uma coordenada.

O feed de atividade passou a ser provido uma unica vez pelo layout autenticado.
A Home e o botao flutuante antes abriam dois sockets e repetiam a consulta
inicial; agora compartilham os mesmos 100 eventos e uma unica conexao. Na Home,
o admin pode alternar entre `Operacao`, `Presenca` e `Tudo`; o padrao evita que
eventos de online/offline escondam alteracoes de pedidos. O widget flutuante
tambem abre em `Operacao` e permite incluir tudo quando necessario. Eventos de
perda de localizacao continuam na operacao por serem alertas relevantes, nao
simples mudancas de presenca.

Arquivos funcionais: `apps/admin-web/src/app/(app)/page.tsx`,
`apps/admin-web/src/app/(app)/layout.tsx`,
`apps/admin-web/src/components/layout/live-activity-widget.tsx` e
`apps/admin-web/src/lib/use-admin-activity-feed.tsx` (substitui o arquivo
`.ts`). Nao houve alteracao de endpoint, contrato, permissao, banco ou regra de
negocio. Validacoes executadas: Prettier, typecheck e lint do Admin Web, todos
aprovados. O typecheck dentro do sandbox nao conseguiu seguir as junctions de
`node_modules` no Windows; a repeticao autorizada fora do sandbox passou. O
smoke autenticado continua manual. Proximo passo concreto: validar na Home um
motoboy se deslocando sem requisicoes repetidas de `GET /admin/operations` e,
depois, seguir para paginacao/resumos nos detalhes de empresa e entregador.

## Atualizacao - 2026-08-25: detalhes de empresa e entregador sem historico ilimitado

Os detalhes administrativos de empresa e entregador deixaram de baixar todo o
historico de pedidos para calcular contagens e valores. Foi criado
`GET /deliveries/summary`, com filtros opcionais de empresa, entregador e
periodo, que agrega no PostgreSQL as contagens por status, o valor total e os
valores concluidos da entrega, do motoboy e da plataforma. O endpoint reutiliza
o mesmo escopo de `list/search`: filtros explicitos por empresa ou entregador
continuam restritos ao administrador; empresa e motoboy sem filtro permanecem
limitados ao proprio cadastro. Nao houve alteracao de schema, migration,
persistencia ou regra financeira.

O contrato foi adicionado em `packages/validation/src/deliveries/
delivery-summary-query.schema.ts`, `packages/types/src/delivery.ts` e
`packages/api-client/src/deliveries.ts`. Controller, service e testes foram
atualizados em `apps/api/src/deliveries`. O detalhe da empresa usa o resumo para
os indicadores e mantem a grade paginada existente. O detalhe do entregador
passou de duas chamadas ilimitadas para um resumo e uma busca paginada, com 10,
25 ou 50 pedidos por pagina. Indicadores de pedido e carteira mostram traco
enquanto nao existe resposta e exibem erro recuperavel no resumo, evitando que
falha de rede pareca zero real. O mesmo cuidado foi aplicado aos indicadores de
fatura da empresa.

Validacoes executadas: build de `@motoboycity/validation`; teste unitario focado
de `DeliveriesService` com 99 testes aprovados; `pnpm typecheck` e `pnpm lint`
na raiz, cobrindo os oito workspaces; `git diff --check` sem erro. As primeiras
tentativas dentro do sandbox falharam somente porque o Windows bloqueou as
junctions de `node_modules`; as repeticoes autorizadas fora do sandbox passaram.
O smoke autenticado continua manual. Proximo passo concreto: paginar tambem a
lista de faturas da empresa e o extrato de carteira do entregador, que ainda
podem crescer sem limite, e validar visualmente os detalhes em desktop e celular.

## Atualizacao - 2026-08-26: primeiro lote de reducao de carga sem perder realtime

Foi adotado cache seletivo somente no navegador para cadastros pouco volateis.
No Admin Web, regioes ficam frescas por 5 minutos e modalidades, tabelas de
preco e configuracoes da plataforma por 1 minuto. No Company Web, modalidades
ficam frescas por 1 minuto e o perfil por 5 minutos. Pedidos, filas, GPS,
operacao, financeiro, relatorios, endereco de coleta, dispatch e ofertas nao
receberam `staleTime` novo. Os tempos de descarte sao limitados a 15 ou 30
minutos, e o Admin agora limpa integralmente o cache ao trocar de sessao,
deslogar ou detectar uma sessao invalida, evitando dados entre administradores.

Na Home da empresa, cada evento `delivery:location` passou a atualizar apenas
o ponto do pedido correspondente no cache local. Ele nao dispara mais duas
consultas completas a cada coordenada. `delivery:updated` continua invalidando
operacao e busca de pedidos, e a reconciliacao por polling de 30 segundos foi
preservada. Assim, o ponto recebido pelo socket aparece imediatamente e uma
eventual perda de evento ainda e corrigida automaticamente.

A API recebeu observabilidade global de baixa cardinalidade. O interceptor
registra somente respostas 5xx e operacoes acima de
`SLOW_REQUEST_THRESHOLD_MS` (750 ms por padrao), identificadas por metodo e
`Controller.handler`. URL, parametros, query string, corpo, token e mensagem de
erro nao entram no log, e uma falha do proprio logger nunca altera a resposta.
A variavel foi documentada nos exemplos e no Blueprint do Render. Nao foi
adicionado cache de resposta na API nem uso adicional do Redis: a instancia
atual de 256 MB com politica `noeviction` continua reservada para BullMQ,
presenca e dispatch, evitando que cache concorra com operacoes criticas.

Arquivos principais: providers do TanStack Query e fluxo de sessao dos dois
paineis, Home da empresa, `apps/api/src/common/request-performance.interceptor.*`,
`apps/api/src/app.module.ts`, exemplos de ambiente e `render.yaml`. Nao houve
schema, migration, endpoint, payload, calculo financeiro ou transicao de status
alterados. Validacoes aprovadas: teste unitario focado do interceptor (4/4),
typecheck, lint e build de producao de API, Admin Web e Company Web. E2E nao foi
executado porque esta mudanca nao toca banco/Redis e a suite exige servicos
isolados. Proximo passo concreto: observar por pelo menos 7 dias os logs lentos,
metricas do Render e uso/latencia do Neon antes de decidir por indices ou cache
de relatorios historicos; nenhum cache adicional deve usar o Redis operacional.

## Atualizacao - 2026-08-26: cache de catalogos administrativos e perfil mobile

O segundo lote reduziu apenas consultas de baixa volatilidade. No Admin Web,
as opcoes de regiao usadas nos cadastros de empresa e entregador agora ficam
frescas por 5 minutos e sao descartadas em 30 minutos. Criar, editar, ativar ou
desativar uma regiao invalida imediatamente a lista de regioes e os dois
catalogos combinados. A lista de modalidades ativas da pagina de entregadores
passou a usar a mesma chave estruturada dos demais consumidores, eliminando um
cache paralelo. Login administrativo bem-sucedido com uma conta nao-admin
tambem limpa token e cache anteriores antes de mostrar a recusa.

No app do entregador, `GET /auth/me` recebeu cache somente em memoria, por token
e com TTL de 5 minutos. Chamadas concorrentes sao deduplicadas; login, cold
start validado e upload de avatar semeiam ou atualizam o perfil, enquanto troca
de token, logout e sessao invalida limpam o dado. Nada e persistido no aparelho.
O cold start continua usando `force: true`, portanto sempre valida a credencial
na API antes de abrir a Home. O retry manual da tela de perfil tambem ignora o
cache. Carteira, ofertas, presenca, GPS, pedidos, historico e realtime nao usam
esse cache e mantiveram o comportamento anterior.

Foi avaliada instrumentacao por evento de consulta do Prisma, mas ela ficou
deliberadamente fora deste lote: o Prisma precisaria materializar SQL e
parametros em JavaScript para toda consulta antes do filtro, adicionando
overhead justamente no caminho que se deseja baratear. Primeiro devem ser
observados os logs de endpoint lento ja adicionados, junto das metricas do Neon;
instrumentacao de query ou indices so entram com um gargalo comprovado.

Arquivos principais: provider e paginas cadastrais do Admin Web,
`apps/driver-app/src/lib/driverProfileCache.ts`, sessao/bootstrap mobile, menu,
login e perfil do entregador, mais o teste unitario do cache. Nao houve endpoint,
contrato, schema, migration, Redis, dispatch ou regra financeira alterados.
Validacoes aprovadas ate este ponto: testes focados de cache/bootstrap (9/9),
suite completa do Driver App (76/76), typecheck e lint do Driver App e Admin
Web, build de producao do Admin Web, alem de typecheck e lint na raiz cobrindo
os oito workspaces. Proximo passo concreto: observar no painel de rede que abrir
repetidamente os formularios cadastrais e o menu mobile nao repete as consultas
dentro do TTL; depois coletar sete dias de metricas reais.

## Atualizacao - 2026-08-26: encerramento offline no aplicativo do motoboy

O Driver App passou a persistir uma outbox operacional em `AsyncStorage` para
as duas acoes que encerram uma corrida: marcar a entrega (`DELIVER`) e concluir
o retorno (`COMPLETE_RETURN`). A acao e gravada antes da primeira tentativa de
rede e fica vinculada ao ID do usuario, nunca ao token. Logout ou 401 removem a
sessao, mas preservam a outbox; ela so reaparece e sincroniza quando o mesmo
motoboy autentica novamente. O login e o bootstrap validado agora espelham esse
ID na sessao local.

Para entregas cujo destino nasce no local da entrega, latitude, longitude e
precisao sao capturadas e congeladas antes de enfileirar. A sincronizacao e
FIFO, deduplicada por entrega (ou lote no retorno), serial por conta e
idempotente com os endpoints existentes. Uma segunda acao criada enquanto a
primeira esta em voo provoca nova leitura da fila ao final; isso permite salvar
`DELIVER` e depois `COMPLETE_RETURN` durante a mesma queda de conexao. Em lote,
somente itens `DELIVERED` com retorno ou `FAILED` saem da lista local; irmaos
`ACCEPTED`/`COLLECTED` continuam ativos e rastreados.

A tela espera no maximo 2,5 segundos pela confirmacao imediata e depois libera
o motoboy com aviso explicito de sincronizacao pendente. Cada request da outbox
tem limite de 15 segundos para uma conexao degradada nao prender o mutex; uma
resposta tardia continua segura pela idempotencia do backend. Rede/5xx mantem a
acao pendente, 401 conduz ao login sem apagar a outbox e recusas de negocio que
nao puderem ser reconciliadas ficam em `NEEDS_REVIEW`, identificadas por pedido
e empresa. Tentativas acontecem no bootstrap, reconexao do socket, retorno ao
primeiro plano, pull-to-refresh e toque manual.

Nenhum endpoint, schema Prisma, migration, payload compartilhado ou dependencia
nativa foi alterado. Status, historico, horario oficial, calculo financeiro e
repasse continuam existindo somente depois da confirmacao da API; o horario
oficial e o da sincronizacao no servidor. Arquivos principais:
`apps/driver-app/src/lib/{session,bootstrapSession,clearExpiredDriverSession,
deliveryCompletionOutbox}.ts`, `apps/driver-app/src/screens/{LoginScreen,
HomeScreen,DeliveryOperationScreen}.tsx` e os testes de bootstrap/outbox.

Validacoes executadas: Prettier nos arquivos alterados; suite completa do
Driver App com 15 suites e 90 testes aprovados; typecheck e lint do Driver App
aprovados; `git diff --check` sem erro de whitespace. Build Android nativo nao
foi executado porque esta mudanca nao adiciona dependencia nativa e a geracao
de APK nao foi solicitada neste recorte.

Limitacao conhecida: uma acao ja enfileirada sobrevive ao encerramento do app,
mas um cold start inteiramente offline ainda nao consegue reconstruir e abrir
uma corrida ativa que nunca foi salva como snapshot. Dentro da tela ja aberta,
entrega e retorno podem ser registrados em sequencia offline. Proximo passo
concreto: validar em aparelho real destino conhecido, destino por GPS, retorno
em lote misto, kill/reabertura, troca de conta e cancelamento administrativo
concorrente antes de gerar o APK de producao.

## Atualizacao - 2026-08-26: release Android pilot.6 com encerramento offline

O encerramento offline foi publicado na `main` no commit `036f80c` e o Driver
App foi promovido para `0.1.0-pilot.6`, com `versionCode` `6`. Antes do release
passaram typecheck, lint e a suite completa do aplicativo, com 15 suites e 90
testes aprovados.

Para evitar o limite de caminho do CMake/Ninja no Windows, o build foi feito em
uma copia fisica curta em `C:\m6`, com a chave oficial copiada temporariamente
para `C:\m6\k.jks`. O pacote `@motoboycity/validation` foi compilado antes de
`clean assembleRelease`. A compilacao terminou com lint vital e assinatura de
release; a copia temporaria, incluindo a chave, foi removida depois da
preservacao e verificacao do artefato.

O APK final tem 75.062.045 bytes e SHA-256
`30513E45D1D186AA6C0EF80627D02CC6087B5B83DFD98BF3BB1497EC24612349`.
O `apksigner` confirmou APK Signature Scheme v2 e o certificado oficial com
SHA-256
`BD42D61D35819B86CB9D1FF784D3E64340C0CE153E21B0332AE97B4CF51D50B9`.
O `aapt` confirmou pacote `com.motoboycity.driverapp`, label `motoboycity`,
`minSdk` 24, `targetSdk` 36, `versionName` `0.1.0-pilot.6` e `versionCode` 6.
O bundle contem `https://motoboycity-api.onrender.com`, nao contem
`localhost:3333`, `127.0.0.1` ou `10.0.2.2`, e o manifesto inclui o metadado
do Google Maps.

O artefato foi preservado em
`apps/driver-app/android/app/build/outputs/apk/release/motoboycity-0.1.0-pilot.6-vc6.apk`
e em `I:\MOTOboyCity\releases\motoboycity-0.1.0-pilot.6-vc6.apk`; os dois
arquivos foram conferidos pelo mesmo hash. O APK ainda nao foi instalado nesta
sessao. Proximo passo concreto: instalar sobre o pilot.5 e testar, em aparelho
real, encerramento offline com destino conhecido, destino por GPS, retorno,
kill/reabertura e sincronizacao depois de recuperar a internet.

## Atualizacao - 2026-08-26: politicas de faturamento por empresa

O faturamento deixou de usar um unico fechamento global. Cada empresa agora
possui `invoiceClosingMode` manual ou automatico. No automatico, a frequencia
pode ser semanal, com dia da semana de 0 a 6, ou mensal, com dia de 1 a 31; nos
meses curtos, os dias 29, 30 e 31 sao ajustados para o ultimo dia civil. O job
`daily-company-billing` roda diariamente as 00:05 de `America/Sao_Paulo`,
calcula o ultimo ciclo devido por empresa e reserva
`lastAutomaticInvoiceClosingDate` dentro de transacao serializavel. A reserva e
feita mesmo quando nao existem pedidos, impedindo repeticao do mesmo ciclo em
boot, retry ou depois do cancelamento de uma fatura.

Empresas existentes recebem os defaults `AUTOMATIC`, `WEEKLY` e segunda-feira,
preservando o comportamento anterior. O modo manual limpa frequencia e dias; o
admin pode fechar a empresa em qualquer dia pelo detalhe de Clientes, e a API
confirma novamente que ela continua em modo manual. O endpoint existente de
fechamento passou a receber `companyId` e retorna uma unica fatura. A emissao e
o vencimento continuam na mesma data civil. A criacao de fatura personalizada,
com selecao de pedidos e datas, foi preservada como fluxo separado.

O admin ganhou `PUT /admin/companies/:id/billing-settings`, validacao Zod,
contratos compartilhados e um formulario para modo, frequencia, dia e prazo de
bloqueio. O detalhe da empresa mostra a politica e oferece `Fechar fatura
agora` somente em modo manual. O Company Web passou a exibir a proxima data da
politica automatica ou informar que o fechamento e manual. O dialogo global de
fechamento semanal foi removido para nao atingir empresas com politicas
diferentes.

`invoiceOverdueBlockAfterDays` aceita de 1 a 365 dias; nulo mantem o bloqueio
desativado, inclusive para todas as empresas existentes. A rotina diaria marca
faturas vencidas por data civil de Sao Paulo e suspende uma empresa `ACTIVE`
quando alguma fatura atinge o limite. A transicao grava
`CompanyStatusHistory` com autor de sistema nulo, preenche
`invoiceOverdueBlockedAt` e desconecta os membros ativos. Pagamento nao reativa
automaticamente: o admin precisa reativar, e transicoes manuais tambem ficam no
historico. Enquanto a divida permanecer no limite, uma empresa reativada sera
suspensa novamente no proximo processamento diario.

O schema e a migration aditiva estao em `apps/api/prisma/schema.prisma` e
`apps/api/prisma/migrations/20260826100000_company_billing_policies/`. A
migration foi gerada com `prisma migrate diff`, sem conexao nem aplicacao em
banco. Foram atualizados os modulos financeiros e administrativos da API, os
contratos em `packages/{validation,types,api-client}`, o detalhe de Clientes e
Faturas do Admin Web, as telas financeiras do Company Web, as regras de negocio
e o runbook do piloto.

Validacoes aprovadas: `prisma validate`; build de
`@motoboycity/validation`; `pnpm typecheck` e `pnpm lint` nos oito workspaces;
suite unitaria completa da API com 67 suites e 817 testes; builds de producao
da API, Admin Web e Company Web; `git diff --check`. Os testes novos cobrem
payloads condicionais, fechamento manual por empresa em qualquer dia,
idempotencia do ciclo, dias semanais arbitrarios, meses curtos e ano bissexto,
empresa manual sem proxima data e bloqueio exatamente no limite com historico
e desconexao.

E2E e aplicacao da migration nao foram executados porque exigem PostgreSQL e
Redis isolados. Tambem nao houve smoke autenticado no navegador. Proximo passo
concreto: validar backup/restore e a migration em copia restaurada de staging,
testar rollback operacional e executar um smoke autenticado configurando duas
empresas com politicas diferentes, emitindo manualmente apenas uma delas e
confirmando bloqueio, sessao recusada e reativacao administrativa.

## Atualizacao - 2026-08-26: controles do botao flutuante e da tela no Android

A tela `Ajustes` do Driver App passou a oferecer quatro preferencias Android:
mostrar o botao flutuante com o app minimizado, mostra-lo com o app aberto,
ajustar seu tamanho entre 48 e 96 dp em passos de 4 dp e manter a tela ligada
enquanto a `MainActivity` estiver aberta. O tamanho padrao continua 64 dp. A
chave local antiga `enabled` agora representa o modo minimizado, preservando a
escolha dos pilotos que ja tinham ativado o atalho; as opcoes novas nascem
desligadas.

O atalho continua existindo somente enquanto o motoboy esta online e o
`DeliveryLocationTrackingService` esta ativo. Os dois modos de visibilidade
sao independentes. Mesmo com `app aberto` habilitado, a bolha e removida sobre
a `OfferActivity`, evitando cobrir o cartao nativo e seus botoes. A alteracao de
tamanho e aplicada ao vivo, mantem o encaixe lateral e limita novamente a
posicao aos limites uteis da tela. `Manter tela ligada` usa somente
`FLAG_KEEP_SCREEN_ON`, e reaplica a preferencia local em cada `onResume`; ela
nao acende a tela em segundo plano nem modifica a tela de bloqueio.

Preferencias e posicao continuam somente em `SharedPreferences`, sem token ou
dado operacional. Nao foi criada permissao, dependencia, API, schema,
migration, servico ou notificacao: a implementacao reutiliza
`SYSTEM_ALERT_WINDOW`, a ponte `FloatingShortcut` e o foreground service ja
existentes. No iOS as secoes permanecem ocultas, pois o sistema nao oferece uma
sobreposicao equivalente sobre outros aplicativos.

Arquivos principais:
`apps/driver-app/src/screens/SettingsScreen.tsx`,
`apps/driver-app/src/lib/floatingShortcut.ts`,
`apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/{FloatingShortcutStore,FloatingShortcutModule,FloatingLauncherOverlay,DriverAppVisibility,DeliveryLocationTrackingService,MainActivity}.kt`,
o mock Jest e `__tests__/floatingShortcut.test.ts`.

Validacoes aprovadas: teste focado da ponte com 6 casos; suite completa do
Driver App com 15 suites e 92 testes; typecheck e lint na raiz cobrindo os oito
workspaces; `:app:compileDebugKotlin` com target SDK 36; `git diff --check`.
Nao houve instalacao nem smoke visual em aparelho real. Proximo passo concreto:
em um Android fisico, testar as quatro combinacoes de app aberto/minimizado,
arrastar e redimensionar a bolha nos dois lados, receber uma oferta com a bolha
ativa, alternar online/offline, reiniciar o app e conferir o consumo de bateria
com `Manter tela ligada`, incluindo ao menos um Xiaomi/HyperOS.

## Atualizacao - 2026-08-26: release Android oficial pilot.7

O Driver App foi promovido para `0.1.0-pilot.7`, com `versionCode` 7. O release
foi compilado em uma copia fisica curta temporaria em `C:\m7`, contornando o
limite de caminho do CMake/Ninja no Windows. A chave oficial foi copiada apenas
para esse ambiente durante o build; a copia temporaria completa foi removida
depois da verificacao e preservacao do artefato.

O APK oficial tem 75.075.309 bytes e SHA-256
`AECDB701BF08B373D72766F1025AAE7721CA5DB27B5F06E5EF4F0BE48BA81513`.
`apksigner` confirmou APK Signature Scheme v2 e o mesmo certificado oficial do
`pilot.6`, com SHA-256
`BD42D61D35819B86CB9D1FF784D3E64340C0CE153E21B0332AE97B4CF51D50B9`.
`aapt` confirmou pacote `com.motoboycity.driverapp`, `minSdk` 24, `targetSdk`
36, `versionName` `0.1.0-pilot.7` e `versionCode` 7. O bundle contem
`https://motoboycity-api.onrender.com` e nao contem `localhost:3333`,
`127.0.0.1` ou `10.0.2.2`.

O artefato foi preservado em
`apps/driver-app/android/app/build/outputs/apk/release/motoboycity-0.1.0-pilot.7-vc7.apk`
e em `I:\MOTOboyCity\releases\motoboycity-0.1.0-pilot.7-vc7.apk`; as duas
copias possuem o mesmo hash. O APK nao foi instalado nesta sessao. Proximo
passo concreto: instalar sobre o `pilot.6` em um aparelho real e validar login,
online/offline, ofertas e as novas opcoes de botao flutuante e tela antes da
distribuicao ampla.

## Atualizacao - 2026-08-26: protocolo operacional para agentes de IA

Foi adicionado `AI_INSTRUCTIONS.md` como complemento operacional, sem substituir
`AGENTS.md`, as regras de negocio ou o handoff. O protocolo define precedencia
das fontes, investigacao baseada em evidencias, profundidade proporcional ao
risco, roteamento das cinco skills do projeto, limites para subagentes somente
leitura, validacao proporcional e criterio objetivo de conclusao. Referencias a
ferramentas exclusivas de um agente especifico foram removidas para o documento
funcionar com diferentes assistentes.

`AGENTS.md` passou a exigir a leitura desse protocolo antes de alteracoes. Nao
houve mudanca de aplicacao, contrato, schema, migration, dependencia ou
configuracao de runtime. Validacao prevista: revisao do diff e
`git diff --check`. Proximo passo concreto: observar o protocolo na proxima
tarefa real e ajustar somente regras que produzirem ambiguidade comprovada.

## Atualizacao - 2026-08-26: testes iniciais automatizados do Company Web

O Company Web passou a ter uma base de testes com Vitest, jsdom e React
Testing Library. Os comandos locais sao `pnpm --filter
@motoboycity/company-web test` para uma execucao unica e `test:watch` durante
o desenvolvimento. A configuracao usa o alias `@` existente, limpeza de DOM e
`localStorage` entre casos e matchers acessiveis do Testing Library.

A primeira suite cobre o `AuthGate`: ausencia de token, validacao bem-sucedida
com preenchimento do cache do TanStack Query, respostas 401/403 com limpeza da
sessao e redirecionamento, e falha temporaria com nova tentativa sem desconectar
o usuario. Tambem cobre persistencia/limpeza do token em `session` e a aplicacao
de eventos `delivery:location` ao cache operacional, incluindo entregas ativas,
recentes, coordenada invalida e entrega ausente.

A regra de atualizacao de localizacao foi extraida de
`apps/company-web/src/app/(app)/page.tsx` para
`apps/company-web/src/lib/delivery-location-cache.ts`. O socket continua
atualizando diretamente `['company', 'operations']`, sem requisicao HTTP; a
funcao agora preserva a referencia do cache quando o evento e invalido ou nao
encontra uma entrega carregada. Nao houve mudanca de API, contrato persistido,
schema, migration, autenticacao ou ambiente de runtime.

Validacoes aprovadas: 3 arquivos e 11 testes; typecheck e lint do Company Web;
build de producao do Company Web com 18 paginas geradas; `git diff --check`. O
primeiro build isolado falhou somente porque o sandbox nao podia baixar as
fontes Google ja usadas pela aplicacao; com acesso de rede, o mesmo build
passou. `pnpm audit` nao apontou alerta alto ou moderado pelos pacotes novos;
ele continua falhando por 5 avisos transitivos preexistentes no React Native,
Prisma e dependencias opcionais do Google Cloud (2 moderados e 3 altos). Nao
houve smoke autenticado no navegador. Proximo passo concreto:
expandir a cobertura para os formularios de login/cadastro, criacao de pedido
em lote, faturamento e estados de erro/carregamento das paginas operacionais.

## Atualizacao - 2026-08-26: contencao de largura da Home administrativa no mobile

A Home do Admin Web podia nascer com a largura correta e ultrapassar a lateral
da tela depois que empresas, motoboys e a operacao eram carregados. A grade
principal usava uma coluna implicita `auto` abaixo de `2xl`, enquanto selects e
os tres blocos operacionais ainda conservavam largura minima intrinseca. Uma
opcao ou conteudo assincrono mais longo podia aumentar a faixa da grade e, por
consequencia, alargar todos os cards da coluna de filtros.

`apps/admin-web/src/app/(app)/page.tsx` agora usa uma faixa mobile explicita
`minmax(0,1fr)`, aplica `min-w-0` ao contêiner e aos tres blocos da operacao e
limita os selects a largura disponivel. As duas colunas de status tambem usam
faixas que podem encolher e seus rotulos quebram linha dentro da propria
celula. `AdminOperationsMap` recebeu a mesma contencao de largura para o Google
Maps nao voltar a impor tamanho intrinseco depois de inicializar.

Nao houve alteracao de API, contrato, autenticacao, consulta, realtime, regra
operacional, dependencia ou desktop `2xl`. Typecheck e lint do Admin Web
passaram. O build de producao passou com 37 rotas; a primeira tentativa isolada
falhou somente porque o sandbox nao podia baixar as fontes Google ja usadas e
passou ao repetir com rede. O navegador de teste integrado nao estava
disponivel nesta sessao, portanto o smoke visual autenticado permanece manual.
Proximo passo concreto: depois do deploy, abrir a Home em 360-430 px, aguardar
empresas, motoboys, mapa e filas carregarem e confirmar que `scrollWidth`
permanece igual a largura visivel e que o botao de atividade continua no canto.

## Atualizacao - 2026-08-26: cadastro de clientes da empresa

O Company Web ganhou uma agenda privada de destinatarios em `/clientes`. Cada
registro pertence a uma empresa e guarda nome, CPF, telefone e endereco
estruturado com coordenadas opcionais. CPF e telefone sao normalizados sem
mascara; o telefone tambem aceita entrada brasileira em E.164. O CPF passa pelo
algoritmo dos digitos verificadores. Indices unicos por `(companyId, cpf)` e
`(companyId, phone)` evitam duplicidade inclusive em criacoes concorrentes,
sem impedir que duas empresas diferentes cadastrem a mesma pessoa.

A API nova vive em `company/customers` e oferece listagem/pesquisa paginada,
detalhe, correspondencia exata, criacao, atualizacao e exclusao. Todas as rotas
usam `JwtAuthGuard` e `CompanyOnlyGuard`; o service resolve `companyId` somente
pelo membro ativo da sessao. Detalhe e atualizacao primeiro consultam
simultaneamente `id` e `companyId`, e exclusao usa `deleteMany` com os dois no
mesmo filtro atomico. Um ID de outra empresa retorna 404 e nao revela se o
registro existe. A busca usa nome normalizado sem acentos ou digitos do
telefone.

Selecionar um cliente no `OperationalOrderForm` preenche destinatario,
telefone e o snapshot do destino, inclusive em lote. Nao foi adicionada FK na
entrega: editar ou excluir o cadastro nunca reescreve pedidos historicos. O
pedido manual continua permitido e com o mesmo payload. Somente depois de uma
criacao bem-sucedida o painel verifica o telefone dos rascunhos manuais; se nao
encontrar correspondencia, oferece `Cadastrar cliente` ou `Agora nao`. O
formulario abre com nome, telefone e endereco preenchidos e exige completar o
CPF. Em lote, telefones repetidos sao deduplicados e revisados em sequencia.
Ignorar ou fechar o convite nao faz nova chamada de criacao da entrega.

A pagina permite pesquisar com debounce de 300 ms, cadastrar, visualizar,
editar e excluir com confirmacao. A exclusao remove apenas a entrada da agenda;
os snapshots das entregas permanecem. O novo cliente compartilhado esta em
`packages/{validation,types,api-client}`, o modulo Nest em
`apps/api/src/company/customers`, a UI em
`apps/company-web/src/{app/(app)/clientes,components/customers}` e a integracao
da Home em `app/(app)/page.tsx` e `operational-order-form.tsx`.

O schema Prisma recebeu somente `CompanyCustomer`; a migration aditiva
`20260826210000_company_customers` foi gerada pelo `prisma migrate diff` entre
o schema anterior e o novo, sem conexao ou aplicacao em banco. O SQL contem
somente criacao da tabela, quatro indices e a FK com cascade na remocao da
empresa. Nao houve backfill nem alteracao de tabela existente.

Validacoes aprovadas: `prisma validate`; build de `@motoboycity/validation`;
suite unitaria completa da API com 69 suites e 831 testes; Company Web com 7
arquivos e 20 testes; typecheck e lint na raiz cobrindo os oito workspaces;
builds de producao da API e do Company Web, que gerou 19 paginas incluindo
`/clientes`. O E2E novo `company-customers.e2e-spec.ts` cobre dados invalidos,
duplicidade, busca, match, CRUD e isolamento por ID entre duas empresas, mas nao
foi executado porque PostgreSQL e Redis isolados nao foram provisionados.
Tambem nao houve smoke autenticado: a migration nao foi aplicada em ambiente
seguro nesta sessao.

Proximo passo concreto: validar backup/restore e a migration em copia isolada
de staging, executar o E2E novo, aplicar pelo deploy controlado e homologar com
duas empresas: cadastrar o mesmo CPF nas duas, pesquisar, selecionar na Home,
criar pedido avulso e lote, salvar um destinatario manual depois do sucesso e
confirmar que `Agora nao` nao altera nem repete a entrega.

## Atualizacao - 2026-08-26: CPF opcional no cadastro de clientes

Por decisao do responsavel do produto, o CPF deixou de ser obrigatorio na agenda
privada de clientes da empresa. Nome, telefone e endereco continuam obrigatorios.
Quando informado, o CPF ainda e normalizado, validado pelos digitos verificadores
e unico dentro da empresa; registros sem CPF armazenam `null`, e o telefone
permanece sempre normalizado e unico por empresa. Clientes existentes nao sao
alterados.

Como a migration de criacao da agenda ja havia sido publicada, ela foi preservada
imutavel. A migration nova
`20260826223500_company_customer_optional_cpf` foi gerada por `prisma migrate
diff` entre o schema commitado e o schema novo e contem somente `ALTER COLUMN
"cpf" DROP NOT NULL`. O rollback exige preencher todos os valores nulos antes de
restaurar `NOT NULL`; nenhuma migration foi aplicada em banco nesta sessao.

O contrato de entrada aceita CPF ausente ou string vazia e transforma ambos em
ausencia. A resposta compartilhada usa `string | null`. O service ignora CPF na
consulta de duplicidade quando ele nao foi informado e grava `null` em criacao e
edicao. No Company Web, o campo aparece como `CPF (opcional)`, o card informa
`CPF: Nao informado`, e o convite pos-entrega nao pede mais que a empresa complete
o documento antes de salvar.

Arquivos principais: `apps/api/prisma/schema.prisma`, a migration nova,
`packages/{validation,types}`, `apps/api/src/company/customers`,
`apps/company-web/src/{components/customers,lib/company-customer.ts}`, as telas de
Clientes e Home, testes e `docs/business-rules.md`.

Validacoes aprovadas: `prisma validate`; build de `@motoboycity/validation`;
geracao local do Prisma Client; 2 suites focadas da API com 16 testes; suite
unitaria completa da API com 69 suites e 833 testes; Company Web com 7 arquivos e
22 testes; typecheck e lint da raiz nos oito workspaces; builds de producao da API
e do Company Web com 19 rotas; formatacao Prettier dos arquivos alterados. O E2E
foi atualizado para criar um cliente sem CPF, mas nao foi executado porque requer
PostgreSQL e Redis isolados. Nao houve smoke autenticado no navegador.

Proximo passo concreto: revisar o diff, commitar e enviar quando autorizado; o
deploy normal do Render aplicara a migration antes da nova API. Depois, cadastrar
dois clientes sem CPF e telefones diferentes, editar um deles adicionando CPF e
confirmar que CPF invalido ou repetido continua recusado.

## Atualizacao - 2026-08-27: multiplos enderecos e estatisticas por cliente

A agenda privada de clientes passou a aceitar varios enderecos nomeados, como
Casa, Trabalho e Loja. O endereco criado com o cliente continua espelhado nos
campos antigos de `CompanyCustomer` para compatibilidade e passa a existir tambem
como endereco principal. Ele pode ser editado, mas nao excluido; enderecos
adicionais possuem CRUD proprio. O nome normalizado e unico dentro de cada
cliente.

Ao pesquisar um cliente durante a criacao do pedido, o Company Web abre a escolha
de endereco quando existe mais de um. A selecao preenche somente o rascunho do
pedido. A entrega continua guardando o snapshot imutavel de destinatario e
destino, portanto editar ou excluir dados da agenda nao altera pedidos antigos.

Foi adicionada uma referencia analitica opcional `Delivery.companyCustomerId`.
Pedidos novos e atualizacoes administrativas resolvem o cliente pelo telefone
normalizado dentro da mesma empresa; criacao em lote resolve todos os telefones
em uma unica consulta. A exclusao do cliente usa `ON DELETE SET NULL`. O detalhe
`/clientes/[id]` mostra total, ultima entrega, contagens em andamento, concluidas
e canceladas, os cinco destinos mais usados e todos os enderecos salvos. As
consultas sempre filtram a empresa da sessao. `COMPLETED` conta como concluida,
`CANCELLED` como cancelada e os demais status contam como andamento.

O schema recebeu `CompanyCustomerSavedAddress` e a FK opcional da entrega. A
migration aditiva `20260827103000_company_customer_addresses_statistics` foi
gerada por diff entre o schema commitado e o atual. Alem das estruturas geradas,
ela cria um endereco `Principal` para cada cliente existente e vincula entregas
anteriores por empresa e telefone normalizado, sem alterar os snapshots. Ela foi
aplicada apenas em PostgreSQL 17 isolado: primeiro em banco vazio e depois sobre
uma copia do schema anterior com cliente, entrega e destino preexistentes. O
backfill preservou o endereco embutido, criou um principal com UUID valido e
vinculou corretamente um telefone brasileiro com prefixo `+55`. Nenhum banco
compartilhado foi alterado durante essa validacao.

Arquivos principais: `apps/api/prisma/{schema.prisma,migrations}`, os modulos de
clientes e entregas da API, `packages/{validation,types,api-client}`, a pagina
`apps/company-web/src/app/(app)/clientes/[id]`, os componentes de clientes e o
formulario operacional. `docs/business-rules.md` registra as regras confirmadas.

Validacoes aprovadas: `prisma format`, `prisma validate` e geracao local do
Prisma Client; suite completa da API com 69 suites e 839 testes; Company Web com
8 arquivos e 25 testes; typecheck dos oito workspaces; lint da raiz e lint final
do Company Web; builds de producao da API e do Company Web, incluindo a rota
dinamica `/clientes/[id]`. O E2E `company-customers.e2e-spec.ts` passou com 7
cenarios contra PostgreSQL 17 e Redis 7 isolados, cobrindo enderecos, estatisticas
vazias, isolamento entre empresas e protecao do principal. Os containers e o
worktree temporario foram removidos depois da prova. Nao houve smoke autenticado
no navegador.

Proximo passo concreto: confirmar a janela de restore do Neon, aplicar pelo
deploy controlado e homologar com um cliente com Casa e Trabalho, confirmando a
escolha do destino no pedido e as estatisticas depois de entregas concluidas,
canceladas e em andamento.
