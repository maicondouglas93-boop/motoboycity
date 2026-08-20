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

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @motoboycity/api exec prisma validate --schema prisma/schema.prisma` | aprovado antes da migration |
| `pnpm --filter @motoboycity/api exec prisma migrate dev --name withdrawal_request_audit` | migration aditiva aplicada no Postgres local |
| `pnpm --filter @motoboycity/validation build` | aprovado |
| `pnpm typecheck` | aprovado nos 8 workspaces |
| testes unitários focados de `finance-release`, `financial-payout` e `finance-ledger` | 3 suítes / 7 testes aprovados |
| `apps/api/test/withdrawal-payout.e2e-spec.ts` | 2 testes E2E aprovados: concorrência, aprovação, pagamento, rejeição e saldo derivado conferido |
| `pnpm --filter @motoboycity/driver-app lint` e `pnpm --filter @motoboycity/admin-web lint` | aprovados |
| `pnpm --filter @motoboycity/api test:e2e` | 18 suítes / 132 testes aprovados |
| `pnpm lint` | aprovado nos 8 workspaces |
| builds de `@motoboycity/admin-web` e `@motoboycity/company-web` | aprovados; rotas de saque incluídas no admin |
| `git diff --check` | aprovado (avisos de CRLF preexistentes no worktree) |

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

| Comando | Resultado |
| --- | --- |
| `prisma validate` antes da migration | aprovado |
| `prisma migrate dev --name delivery_location_tracking` | migration aplicada no PostgreSQL local; SQL aditivo revisado |
| `pnpm --filter @motoboycity/{validation,api,api-client} typecheck` | aprovado |
| `pnpm --filter @motoboycity/{driver-app,admin-web,company-web,api} typecheck` | aprovado |
| `apps/api/src/tracking/delivery-tracking.service.spec.ts` | 3 testes aprovados: registro/emissão, escopo de empresa e retenção |
| `pnpm --filter @motoboycity/driver-app test -- --runInBand` | 1 suíte / 1 teste aprovado |
| lints específicos de driver, admin, empresa e API | aprovados |
| `pnpm typecheck` | aprovado nos 8 workspaces |
| `pnpm lint` | aprovado nos 8 workspaces |
| `pnpm --filter @motoboycity/api test:e2e` | 18 suítes / 132 testes aprovados |
| `git diff --check` | aprovado (somente avisos CRLF já presentes no worktree) |

Não foi executado build nativo Android/iOS nesta sessão. Antes de publicar,
validar em dispositivo físico as permissões, a notificação Android e o fluxo
Core Location em segundo plano; em iOS, encerramento forçado pelo usuário é
uma limitação do sistema operacional e não pode ser contornado pelo app.
