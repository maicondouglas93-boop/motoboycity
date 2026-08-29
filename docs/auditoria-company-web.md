# Auditoria do painel da empresa (`apps/company-web`)

> **Documento de época — leia com data.** Registra o auditoria de 2026-08-24. O
> sistema andou bastante desde então: itens aqui podem já estar prontos,
> descartados ou superados. Para o estado atual use `agent-handoff.md` e
> `architecture.md`, e **confirme no código** antes de agir.

Data da revisão: 24/08/2026.

Escopo: as 17 rotas do painel da empresa, seus componentes de operação e financeiro, os clientes compartilhados usados por elas e os serviços da API que definem autorização, isolamento, pedidos, faturas, relatórios e rastreamento. A revisão encontrou **2 achados de gravidade alta, 7 de gravidade média e 3 de gravidade baixa**. Nenhum código da aplicação foi alterado nesta auditoria.

## Achados

### [Alta] Um vínculo de empresa desativado continua autorizado nas rotas REST
**Onde:** apps/api/src/auth/auth.service.ts:331, apps/api/src/auth/company-only.guard.ts:14, apps/api/src/deliveries/deliveries.service.ts:1496, apps/api/src/finance/invoice.service.ts:514

**O que acontece:** `CompanyTeamMember` possui o campo `active`, mas o login e os resolvedores de empresa usados por pedidos, endereço, relatórios, financeiro, faturas e avisos de pagamento procuram somente por `userId`. O `CompanyOnlyGuard` confere apenas `User.type`. Assim, uma linha com `active = false` ainda permite login e acesso REST; ela também passa pelas verificações de dono usadas para criar e cancelar pedidos. O Socket e o rastreamento, em contraste, filtram `active: true`.

**Por que importa PARA A LOJA:** um ex-funcionário cujo vínculo foi desativado pode continuar vendo pedidos, faturas e dados financeiros da loja e ainda agir sobre a operação enquanto possuir a senha ou um token válido. É quebra de isolamento da conta da loja, não apenas uma inconsistência visual.

**Como confirmei:** comparei os `findFirst({ where: { userId } })` dos fluxos REST com `apps/api/src/realtime/realtime.gateway.ts:96` e `apps/api/src/tracking/delivery-tracking.service.ts:218`, que exigem explicitamente `active: true`. Não há essa condição no login nem nos resolvedores REST, e `GET /auth/me` também não revalida o vínculo.

### [Alta] Retentar a criação após uma resposta perdida pode duplicar pedidos e cobrança
**Onde:** packages/api-client/src/deliveries.ts:141, apps/api/src/deliveries/deliveries.service.ts:209, apps/api/src/deliveries/deliveries.service.ts:358, apps/api/src/deliveries/deliveries.service.ts:519

**O que acontece:** as criações avulsa e em lote enviam apenas o payload do pedido, sem chave de idempotência. A API grava o pedido em transação e só depois chama o despacho e monta a resposta. Se a conexão cair depois do `commit`, ou se uma etapa posterior falhar, a loja recebe erro apesar de o pedido existir. Ao tentar novamente, uma nova entrega é criada; `externalOrderNumber` possui apenas índice, não unicidade por empresa.

**Por que importa PARA A LOJA:** o atendente pode chamar dois motoboys e gerar dois pedidos faturáveis para a mesma entrega justamente ao seguir a instrução natural de “tentar novamente”. No balcão, não existe uma forma confiável de distinguir “não criou” de “criou e a resposta se perdeu”.

**Como confirmei:** os `POST /deliveries` e `POST /deliveries/batch` não enviam cabeçalho nem campo idempotente; o schema `Delivery` não possui chave de idempotência de criação. No service, `dispatchDelivery` ocorre depois da transação que cria as linhas. A única `idempotencyKey` do Prisma pertence ao ledger financeiro, não ao pedido.

### [Média] O detalhe da fatura expõe repasse do motoboy e margem interna da plataforma
**Onde:** apps/company-web/src/app/(app)/faturas/[id]/page.tsx:102, apps/company-web/src/app/(app)/faturas/[id]/page.tsx:166, apps/api/src/finance/invoice.service.ts:410

**O que acontece:** a rota de empresa recebe e renderiza `driverValueSum`, `platformValueSum`, `driverValue` e `platformValue`, tanto no resumo quanto pedido a pedido. Esses números revelam quanto o motoboy recebe e quanto fica para a plataforma.

**Por que importa PARA A LOJA:** a loja passa a enxergar dados comerciais internos que não fazem parte da dívida dela e pode inferir margem e remuneração por corrida. Além da exposição, a tela contradiz os demais relatórios da empresa, que anunciam mostrar apenas o custo cobrado da loja.

**Como confirmei:** o `getDetail` compartilhado seleciona os quatro campos e o controller da empresa devolve esse mesmo DTO. A página os imprime diretamente. O contrato documentado em `docs/plano-relatorios-company-web.md:66` e `:337` diz explicitamente que a empresa nunca deve receber `driverValue` ou `platformValue`.

### [Média] Datas civis de fatura são deslocadas na exibição e no filtro
**Onde:** apps/company-web/src/app/(app)/faturas/[id]/page.tsx:21, apps/company-web/src/app/(app)/faturas/[id]/page.tsx:122, apps/api/src/finance/invoice.service.ts:373, apps/api/prisma/schema.prisma:929

**O que acontece:** `issueDate`, `dueDate` e `paymentDate` são colunas `@db.Date` e a API corretamente as serializa como `AAAA-MM-DD`. O detalhe as passa para `new Date()` e para um formatador com hora e sem fuso. Em São Paulo, `2026-08-24` vira 23/08 às 21h. Na listagem, o filtro converte o início do dia para 03:00 UTC; por isso uma fatura armazenada como 24/08 00:00 UTC fica fora do filtro de 24/08, enquanto a de 25/08 00:00 UTC pode entrar.

**Por que importa PARA A LOJA:** emissão, vencimento e pagamento podem aparecer um dia antes, e filtrar “24/08” pode ocultar a fatura do próprio dia e trazer a seguinte. Isso prejudica cobrança, conferência e comprovação de pagamento.

**Como confirmei:** reproduzi a transformação conceitualmente com o contrato retornado por `civilDateFromDbDate`: ISO sem hora é interpretado pelo JavaScript como meia-noite UTC. Comparei também o valor `@db.Date` (meia-noite UTC) com `startOfDayInSaoPaulo`, que começa às 03:00 UTC. O helper já existente `formatarData` trata exatamente essa diferença, mas não é usado no detalhe.

### [Média] Falhas de consulta viram mensagens positivas de “sem movimento” ou “tudo em dia”
**Onde:** apps/company-web/src/app/(app)/page.tsx:99, apps/company-web/src/app/(app)/page.tsx:243, apps/company-web/src/components/finance/pedidos-tab.tsx:41, apps/company-web/src/components/finance/pedidos-tab.tsx:60, apps/company-web/src/components/finance/faturas-tab.tsx:172

**O que acontece:** a central não trata `isError` das consultas de endereço, modalidades e operações. Uma falha no endereço abre o cadastro como se ele não existisse; uma falha operacional resulta em zero pedidos ativos. No financeiro, o erro é mostrado, mas a mesma renderização também entra no estado vazio e afirma “Tudo em dia” ou “Nenhuma fatura encontrada”.

**Por que importa PARA A LOJA:** durante uma oscilação da API, o atendente pode acreditar que não há entrega em andamento, tentar recadastrar o ponto de coleta ou concluir que não existe valor pendente. A interface mente justamente quando a loja precisa decidir se chama suporte ou continua operando.

**Como confirmei:** as três consultas da página inicial convertem `data` ausente em `null`, lista vazia ou contagem zero sem ramo de erro. Nos dois componentes financeiros, `data ?? []` alimenta o estado vazio porque a condição exclui apenas `isLoading`, não `isError`.

### [Média] O acompanhamento de um lote pode declarar que todos foram aceitos sem ter os pedidos
**Onde:** apps/company-web/src/components/operations/call-driver-dialog.tsx:79, apps/company-web/src/components/operations/call-driver-dialog.tsx:224, apps/api/src/deliveries/deliveries.service.ts:594

**O que acontece:** o modal acompanha os IDs procurando-os em `operations.active + operations.recent`. A API limita `recent` a 20. Se um lote maior tiver todos os itens cancelados, apenas 20 retornam; `pendingCount` fica zero e, como `cancelledCount !== trackedIds.length`, o texto cai em “Todos os pedidos foram aceitos”. Durante erro da consulta, `tracked` também fica vazio e a mesma afirmação aparece acima de um “Carregando...” permanente.

**Por que importa PARA A LOJA:** o atendente pode informar que há motoboys a caminho quando o lote foi cancelado ou quando o painel nem conseguiu consultar o estado. Isso leva a promessas erradas ao cliente e a recriação desnecessária de pedidos.

**Como confirmei:** segui as condições do JSX com 50 IDs e 20 cancelados devolvidos pelo limite padrão: `pendingCount = 0`, `cancelledCount = 20`, `trackedIds.length = 50`; o resultado literal é “Todos os pedidos foram aceitos”. Não existe ramo `operationsQuery.isError`.

### [Média] O detalhe aberto antes do aceite não acompanha a evolução do pedido
**Onde:** apps/company-web/src/app/(app)/pedidos/[id]/page.tsx:69, apps/company-web/src/app/(app)/pedidos/[id]/page.tsx:78

**O que acontece:** a consulta principal do pedido não possui polling nem assinatura Socket. O polling do rastreamento só é ativado se o status dessa consulta principal já for `ACCEPTED`, `COLLECTED` ou `DELIVERED`. Se a página abrir em `AWAITING_DRIVER`, ela nunca aprende que houve aceite e nunca inicia o rastreamento.

**Por que importa PARA A LOJA:** uma tela deixada aberta no balcão continua mostrando “buscando motoboy” depois do aceite, da coleta ou até da conclusão. O atendente precisa voltar para outra página e abrir de novo para enxergar o estado real.

**Como confirmei:** o `deliveryQuery` tem apenas `queryKey`, `queryFn` e `enabled`; só a mutação de cancelamento invalida essa chave. O `refetchInterval` de tracking depende diretamente do status potencialmente obsoleto desse query.

### [Média] As telas operacionais fazem consultas sem limite que pioram a cada pedido criado
**Onde:** apps/company-web/src/app/(app)/pedidos/page.tsx:47, apps/company-web/src/app/(app)/pedidos/page.tsx:73, apps/api/src/deliveries/deliveries.service.ts:546, apps/api/src/deliveries/deliveries.service.ts:614

**O que acontece:** `/pedidos` baixa todo o histórico da empresa e só então filtra no navegador; `GET /deliveries` não usa `take` nem paginação. Além disso, cada chamada da central operacional busca o status de todas as entregas históricas para reduzir contagens em memória. Essa central é consultada a cada 30 segundos na página principal e a cada 3 segundos no modal de chamada.

**Por que importa PARA A LOJA:** o painel funciona com dezenas de pedidos, mas fica progressivamente mais lento e caro conforme a loja usa o produto. Em celular e conexão móvel, abrir pedidos transfere histórico desnecessário; manter o modal aberto repete uma varredura crescente no banco.

**Como confirmei:** a UI chama `deliveriesApi.list()` sem recorte e executa `.filter()` local. O service usa `findMany` sem `skip/take`. Para as contagens operacionais, há outro `findMany({ select: { status: true } })` sem limite seguido de `reduce`, em vez de `groupBy`.

### [Média] Relatórios agregados ainda carregam entregas individuais na memória
**Onde:** apps/api/src/company/reports/company-reports.service.ts:71, apps/api/src/finance/company-financial.service.ts:195, apps/api/src/deliveries/deliveries.service.ts:1443

**O que acontece:** o relatório operacional aceita até 366 dias, mas busca todas as entregas criadas e concluídas para agrupar dias, modalidades e valores no processo Node. O resumo financeiro também baixa todas as linhas do período para a série diária. Tempos/SLA busca todo o histórico de status das entregas e nem limita a duração máxima do intervalo.

**Por que importa PARA A LOJA:** uma empresa com volume real pode receber timeout ou erro de memória justamente ao abrir um relatório anual; ampliar o período de SLA pode degradar a API para os demais atendentes. É um limite de escala visível ao usuário, não apenas preferência de implementação.

**Como confirmei:** os três serviços usam `delivery.findMany` e depois `for`, `map` ou agrupamento em `Map`. Contagens e somas que cabem em `aggregate/groupBy` só são feitas no banco para partes dos relatórios; as séries principais continuam materializando cada entrega.

### [Baixa] Cancelar um pedido — ou o lote inteiro — não pede confirmação
**Onde:** apps/company-web/src/components/operations/call-driver-dialog.tsx:310, apps/company-web/src/app/(app)/pedidos/page.tsx:205, apps/company-web/src/app/(app)/pedidos/[id]/page.tsx:139

**O que acontece:** os três botões chamam a mutação diretamente no primeiro clique. No modal, cancelar um item de lote cancela todos os irmãos, embora não exista uma segunda etapa que confirme a quantidade.

**Por que importa PARA A LOJA:** um toque acidental no celular remove da fila uma entrega ainda não aceita e, em lote, pode remover dezenas. O risco é limitado porque a API permite à empresa cancelar apenas `SCHEDULED` ou `AWAITING_DRIVER`, mas ainda há retrabalho e atraso.

**Como confirmei:** os `onClick` chamam `cancelMutation.mutate` sem diálogo intermediário. A API reúne os irmãos pelo `batchId` e aplica o cancelamento ao lote enquanto nenhum foi aceito.

### [Baixa] Qualquer falha em `/auth/me` apaga a sessão local
**Onde:** apps/company-web/src/components/auth/auth-gate.tsx:31, apps/company-web/src/components/auth/auth-gate.tsx:38

**O que acontece:** o `catch` de `authApi.me()` trata 401, timeout, rede offline e 500 da mesma forma: apaga o token, limpa todo o cache e redireciona para login.

**Por que importa PARA A LOJA:** uma oscilação curta da internet no celular expulsa o atendente do painel e o obriga a digitar a senha novamente, mesmo que a credencial continue válida.

**Como confirmei:** o `catch` não verifica `ApiError.status`; não existe tela de falha com “Tentar novamente”. A remoção da sessão ocorre para qualquer rejeição da promessa.

### [Baixa] Duas somas monetárias não usam centavos inteiros
**Onde:** apps/company-web/src/app/(app)/relatorios/pedidos/page.tsx:139, apps/api/src/finance/invoice.service.ts:160

**O que acontece:** o “Custo conhecido nesta página” soma `number` diretamente com `reduce`. O fechamento de faturas faz o mesmo para total, repasse e plataforma antes de persistir os valores. Esses caminhos abandonam a regra já materializada em `somarDinheiro` e nas agregações por centavos.

**Por que importa PARA A LOJA:** a formatação e o `Decimal(10,2)` normalmente escondem o resíduo binário em volumes atuais, por isso a gravidade é baixa; ainda assim, uma soma grande pode não reconciliar exatamente com as linhas e a fatura é o pior lugar para depender de arredondamento implícito.

**Como confirmei:** ambos os reducers fazem `sum + number` sem `Math.round(valor * 100)`. Os demais totais novos usam centavos inteiros, e o helper do próprio painel documenta o caso `0.1 + 0.2` que esses dois pontos reintroduzem.

## Validações executadas

- `pnpm --filter @motoboycity/company-web run typecheck` — passou.
- `pnpm --filter @motoboycity/company-web run lint` — passou.
- `pnpm --filter @motoboycity/company-web run build` — passou; 18 rotas geradas.
- Jest direcionado a entregas, relatórios da empresa, financeiro, faturas e avisos de pagamento — 5 suítes e 126 testes passaram.

Os resultados verdes não invalidam os achados: as coberturas atuais não exercitam vínculo inativo, resposta perdida/idempotência, lote terminal acima de 20 itens, datas civis no navegador ou estados de erro combinados com estados vazios.

## O que eu olhei e estava certo

- A empresa **não consegue dar baixa na própria fatura**. Ela só cria um aviso de pagamento; confirmação/rejeição e `mark-paid` estão atrás de `AdminOnlyGuard`.
- Nos fluxos normais, a empresa não escolhe `companyId`: relatórios e financeiro resolvem a empresa pelo token; pedidos rejeitam filtros de empresa/motoboy para não administradores; detalhe de pedido, fatura e rastreamento verificam o dono.
- O relatório geral protege divisão por zero e não inventa `+100%` sem base anterior. Taxas também guardam denominador zero.
- Os novos totais de relatório e financeiro usam centavos inteiros na maior parte dos caminhos; valores `null` permanecem distinguíveis de zero. As exceções estão registradas acima.
- Os formatadores monetários diretos encontrados usam BRL e não furam máscara, porque o painel da empresa deliberadamente não mascara dinheiro.
- Os relatórios novos usam o período civil e o fuso `America/Sao_Paulo`; a série de pico conta dias sem movimento. O problema de data ficou concentrado nos caminhos citados de fatura e nos formatadores antigos de pedido.
- A busca histórica de relatórios possui paginação real no servidor, e o CSV financeiro é gerado no servidor com escopo da empresa e proteção básica contra fórmula.
- Login, cadastro, perfil, relatórios e o resumo financeiro possuem tratamento explícito de erro. O login não sofre da hipótese de `isError` ausente.
- Os componentes Base UI usam `render`, não `asChild`, e não encontrei acesso direto inseguro semelhante ao antigo `driver.region.name` sem guarda.

## Onde começariam os testes

1. **Membro inativo é recusado em todo o painel:** criar `CompanyTeamMember(active=false)`, autenticar e chamar `/auth/me`, criação/cancelamento de pedido, financeiro, relatório e fatura. É o primeiro teste porque fecha a quebra de autorização mais grave e força uma política única para todos os resolvedores.
2. **Retentativa idempotente de pedido avulso e lote:** simular commit bem-sucedido seguido de perda da resposta e repetir com a mesma chave, verificando um único pedido/lote e um único despacho. É o segundo porque protege a ação mais frequente da loja contra duplicação operacional e cobrança.
3. **Fatura usa dia civil ponta a ponta:** armazenar faturas em 24 e 25/08, filtrar exatamente 24/08 e renderizar emissão, vencimento e pagamento sob `America/Sao_Paulo`, esperando apenas 24/08 e nunca 23/08 21h. É o terceiro porque cobre simultaneamente o filtro e a apresentação usados na conferência financeira.
