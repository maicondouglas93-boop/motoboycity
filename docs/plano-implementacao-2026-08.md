# Plano de implementação — agosto/2026

Este documento é **autossuficiente**. Foi escrito para ser entregue a um agente
de IA que não participou do levantamento e não tem a conversa anterior. Tudo que
é necessário para executar está aqui ou apontado por caminho de arquivo.

As funcionalidades abaixo saíram de uma inspeção do painel do concorrente que
opera **na mesma cidade** (Lajinha/MG) — o levantamento completo está em
[`gap-analysis-plataforma-atual.md`](gap-analysis-plataforma-atual.md). Foram
filtradas para o que faz sentido numa operação de uma cidade só.

---

## Parte 0 — o que você precisa saber antes de escrever a primeira linha

### A operação

MOTOboyCity é uma plataforma B2B de motoboys em Lajinha, Minas Gerais. Lojas
lançam pedidos, motoboys aceitam e entregam, a plataforma fica com uma margem.
**Uma praça só.** Não construa nada multi-cidade.

Referência de porte, medida no concorrente da mesma cidade em 30 dias: ~105
entregas/dia, ticket médio R$ 6,65, margem da operação 9,5%, 5 motoboys ativos,
2% de cancelamento. Aceite→coleta 10 min, coleta→entrega 23 min. **100% dos
pedidos são lançados à mão no painel** — não existe volume de integração.

### O repositório

```
apps/api           NestJS 11 + Prisma 6.19 + PostgreSQL + Redis/BullMQ + Socket.IO
apps/admin-web     Next.js 16 App Router (painel do administrador)
apps/company-web   Next.js 16 App Router (portal da loja)
apps/driver-app    React Native 0.86 (bare CLI) — app do motoboy
packages/types     contratos compartilhados entre API e telas
packages/validation schemas Zod compartilhados
packages/api-client cliente HTTP tipado
```

pnpm 11.20 + Turborepo 2.10. React 19, Tailwind CSS 4, **Base UI** (não é Radix
— a API dos componentes é diferente), TanStack Query.

### Comandos

```bash
pnpm install
```

```bash
pnpm turbo typecheck lint build
```

O Turborepo **não** tem tarefa `test` — as tarefas são `build`, `dev`, `lint`,
`typecheck` e `clean`. Os testes rodam por pacote, com jest:

```bash
pnpm --filter @motoboycity/api exec jest
```

```bash
pnpm --filter @motoboycity/driver-app exec jest
```

Os testes e2e da API precisam de banco isolado e do Redis de pé. Não rode e2e
contra o banco de desenvolvimento.

### Regras que não são negociáveis

Estas saíram de erros reais já cometidos neste repositório. Ignorá-las custa
retrabalho.

1. **Tudo em português.** Interface, mensagens de erro, comentários e mensagens
   de commit. Nada de inglês em texto que uma pessoa lê.

2. **Comentário explica POR QUE, nunca o quê.** O código já diz o que faz. Um
   comentário que parafraseia a linha abaixo é ruído. Escreva comentário quando
   a decisão for não-óbvia, e escreva a razão.

3. **Fuso horário sempre por `apps/api/src/common/sao-paulo-time.ts`.** Nunca
   subtraia 3 horas na mão: o Brasil teve horário de verão até 2019 e datas
   históricas quebram. As funções prontas são `saoPauloDateParts`,
   `dateInSaoPaulo`, `saoPauloLocalToUtc`, `startOfDayInSaoPaulo`,
   `endOfDayInSaoPaulo`.

4. **`Date.UTC` tem mês base zero.** Já produziu setembro no lugar de agosto
   aqui. Ao montar datas, escreva `Date.UTC(ano, mes - 1, dia)` e teste
   virada de mês, de ano e ano bissexto.

5. **Dinheiro é `Decimal`, jamais `number` de ponto flutuante.** No Prisma é
   `@db.Decimal(10, 2)`. Arredonde em centavos, uma vez, no fim.

6. **Corrida entre dois motoboys se resolve com `updateMany` condicional +
   checagem de `count`.** O padrão já existe em
   `apps/api/src/dispatch/dispatch.service.ts` (`claimDelivery`, `acceptOffer`):
   o `where` inclui o estado esperado, e se `count` não bate, lança
   `ConflictException`. Nunca leia-depois-escreva.

7. **Nunca devolva objeto cru do Prisma pela API.** Mapeie para o tipo declarado
   em `packages/types`. Campo interno vazado vira contrato acidental, e
   `Decimal` serializa de um jeito que o app não espera.

8. **Transações de carteira precisam de chave de idempotência.** O padrão em uso
   é `` `driver-repasse:${deliveryId}` ``. Sem isso, uma retentativa credita
   duas vezes.

9. **Os testes e2e usam `toEqual` estrito de propósito.** Se você adicionar um
   campo na resposta, o e2e quebra — isso é o teste funcionando, não um
   estorvo. Atualize o e2e junto, no mesmo commit. **Não** troque para
   `toMatchObject` para "consertar".

10. **Pare o servidor da API antes de rodar migração do Prisma.** No Windows a
    DLL do engine fica travada (EPERM) enquanto houver processo segurando.
    Processos órfãos de jest já causaram isso; confira antes de culpar o banco.

11. **Não use `--forceExit` no jest.** Se a suíte pendurar, a causa é um
    `afterAll` que lançou antes do `app.close()`. Envolva em `try/finally` e
    apague filhos antes de pais.

12. **O repositório é público.** Nenhuma chave, token, senha ou dado pessoal
    entra em commit — nem em teste, nem em fixture, nem em comentário.

13. **Regra de lint `react-hooks/set-state-in-effect`.** Não semeie estado de
    formulário dentro de `useEffect` a partir de query. Separe em um componente
    externo que faz a query e um interno que recebe os dados prontos. Além de
    passar no lint, evita que uma revalidação apague o que a pessoa digitou.

14. **`<Select.Value>` do Base UI mostra o valor cru.** Passe `items` no `Root`
    para exibir o rótulo, senão a tela mostra `st-1` no lugar de "Padrão".

### Máquina de estados atual

```prisma
enum DeliveryStatus {
  SCHEDULED
  AWAITING_DRIVER
  ACCEPTED
  COLLECTED
  DELIVERED
  FAILED            // coletou e não entregou; a loja paga; fecha por retorno
  COMPLETED
  CANCELLED
  AWAITING_PAYMENT
}
```

`COMPLETED` é onde o repasse ao motoboy é creditado, com chave de idempotência.
Esse é o ponto que define quais intervenções manuais são seguras: mexer depois
de `COMPLETED` mexe em dinheiro já creditado.

### Modelos relevantes

Todos em `apps/api/prisma/schema.prisma`:

- `Delivery` (linha ~512), `DeliveryStatusHistory` (~654), `DeliveryOffer` (~673)
- `DeliveryLocationPoint` (~606) — `deliveryId`, `driverId`, `lat`, `lng`,
  `accuracy`, `capturedAt`. Já tem índice em `capturedAt`.
- `PlatformSettings` (~961) — tabela de linha única, id fixo `"global"`.
  Campos nulos significam "ainda não configurado", e o código **falha com erro
  claro** em vez de inventar default. Mantenha essa convenção.
- `Invoice` (~830), `Wallet` (~698), `WalletTransaction` (~723)
- `Notification` (~1083) com `NotificationType` e `NotificationChannel`
  (`PUSH`, `REALTIME`, `EMAIL` — **não existe WhatsApp**)

### Padrão de tarefa agendada

Use `apps/api/src/finance/financial-release.scheduler.ts` como modelo. Ele usa
`queue.upsertJobScheduler` do BullMQ com `tz: 'America/Sao_Paulo'` e, no
`onModuleInit`, **recupera o que ficou atrasado** enquanto o servidor esteve
fora. Copie os dois comportamentos: agendar e recuperar.

---

## Parte 1 — as funcionalidades, em ordem de execução

A ordem é por valor sobre custo e por dependência. Faça uma de cada vez, com
teste, e feche em commit próprio.

---

### 1. Devolver a entrega à fila ✅ FEITO

**Entregue em 2026-08-23.** `PATCH /deliveries/:id/return-to-queue`, botão
"Devolver para a fila" no app do motoboy e a contagem de devoluções de 7 dias na
ficha do motoboy no painel. Três decisões que só apareceram na construção:

- **a exclusão do redespacho é só da rodada.** `dispatchDelivery` ganhou um
  `excludeDriverIds` opcional para não devolver o pedido à mesma pessoa em
  segundos. Não virou registro permanente de recusa: se daqui a meia hora ele
  estiver de volta e o pedido continuar parado, ofertar de novo é o certo;
- **nenhuma oferta sintética foi criada** para conseguir essa exclusão. Seria o
  atalho óbvio — a exclusão já se apoia na tabela de ofertas —, mas inventaria
  uma oferta que nunca existiu e sujaria a métrica de aceite/recusa, que é a
  razão de a tabela existir;
- **a cópia local de `AdminDriverListItem` na API foi apagada.** Havia duas
  definições idênticas por sorte; bastou acrescentar um campo para uma ficar
  para trás. O painel lê a de `packages/types`, então a da API era justamente a
  que envelheceria sem ninguém notar.

**O problema.** Um pedido já aceito por um motoboy que travou — moto quebrou,
loja não tinha o produto, ele passou mal — não tem caminho de volta. Só sai pela
mão do administrador. O motoboy fica segurando um pedido que não vai entregar, e
a loja espera.

Isto é o par que falta da **vitrine de pedidos disponíveis** (commit `f4e8c2d`),
que já está pronta: pedido sem dono aparece para todos assumirem. Falta o
caminho que devolve um pedido para lá.

**Escopo.**

API, em `apps/api/src/dispatch/dispatch.service.ts` (onde já vivem
`listAvailableForDriver` e `claimDelivery`):

```
releaseDelivery(deliveryId, driverId, motivo)
```

Regras:

- **Só de `ACCEPTED`.** Depois de `COLLECTED` a mercadoria está com o motoboy —
  devolver à fila deixaria o pacote órfão. Nesse caso o caminho correto já
  existe e é `FAILED` (volta para a loja). De `ACCEPTED`, volta para
  `AWAITING_DRIVER` com `driverId = null`.
- **Motivo obrigatório**, texto livre com limite. Sem motivo isto vira porta de
  fuga silenciosa de corrida ruim.
- Use `updateMany` condicional (`where: { id, driverId, status: 'ACCEPTED' }`) e
  cheque `count`. Se não bater, `ConflictException`.
- Grave em `DeliveryStatusHistory` com o motivo e quem fez.
- **Não redispare o despacho automático imediatamente para o mesmo motoboy.**
  Ele acabou de dizer que não consegue. Coloque-o na exclusão daquela rodada.
- Se for lote, devolva o lote inteiro — o mesmo tudo-ou-nada de `claimDelivery`.

Endpoint: `PATCH /delivery-offers/:id/release`, autenticado como motoboy.
Contrato em `packages/types`, cliente em `packages/api-client`.

App do motoboy: botão "Não consigo entregar" na tela da entrega em andamento,
com campo de motivo e confirmação. Depois de soltar, navega de volta para a
lista.

**Limite de abuso.** Registre quantas devoluções o motoboy fez nos últimos 7
dias e mostre no painel do administrador, na ficha dele. Não bloqueie
automaticamente — numa operação de 5 motoboys, bloquear um é perder 20% da
frota. Dê o número para a pessoa decidir.

**Testes.** Devolução feliz; tentativa a partir de `COLLECTED` (deve recusar);
dois pedidos de devolução simultâneos; lote; motivo vazio; devolução por motoboy
que não é o dono do pedido.

---

### 2. Marcar coleta e entrega esquecidas — com tempo mínimo ✅ FEITO

**Entregue em 2026-08-23**, com **duas das três** ações. O que a construção
mostrou:

**O "retorno esquecido" não pode existir como ação do motoboy.** `completeReturn`
exige estar fisicamente dentro do raio da loja — essa proximidade _é_ a prova, e
é ela que dispara o repasse. Se ele esqueceu de tocar e já foi embora, não há
forma honesta de ele mesmo declarar: ou o app aceita um GPS de outro lugar, ou
aceita a palavra dele sobre dinheiro. Esse buraco já está fechado pelo lado
certo — o `forceComplete` do admin (commit `99fa5f3`) faz exatamente isso, a
partir de `DELIVERED|FAILED`, exigindo motivo e gravando quem fez.

**A entrega com preço definido por GPS também recusa.** Quando
`destinationKnownAtCreation = false`, a coordenada do momento vira destino,
distância e preço. Declarar só o horário deixaria o valor saindo de uma rota que
nunca existiu. O botão nem aparece nesse caso, e o servidor recusa antes de
validar horário — "não dá para marcar depois" é a informação útil, enquanto
reclamar do horário mandaria a pessoa corrigir um campo que nunca seria aceito.

**Onde o horário declarado é gravado.** `DeliveryStatusHistory.occurredAt`, novo
e nulável. `changedAt` continua sendo quando a linha foi **escrita** — é a prova
do registro, e a distância entre os dois números é o que denuncia declaração
esticada. O relatório de etapas usa `occurredAt ?? changedAt` e ganhou
`excludeRetroactive`, desligado por padrão: no dia a dia o declarado é a melhor
aproximação disponível; para cobrar meta de alguém, só serve o que o servidor
carimbou.

**O carimbo do pedido passa a ser o declarado.** `statusChangedAt` é o relógio
operacional — é o que a fila ao vivo mostra e o piso da próxima declaração. Sem
isso, quem declarasse coleta às 14h não conseguiria declarar entrega às 14h30,
porque o piso seria o instante do toque.

**Na tela do motoboy: "há quantos minutos?", não seletor de data.** É como a
pessoa lembra de verdade, resolve em um toque, sem teclado, de moto — e não abre
a porta para digitar o dia errado.

**Uma regressão que o e2e pegou.** Acrescentar um campo **opcional** ao corpo do
`collect` quebrou toda coleta feita na hora: `@Body()` do Nest entrega
`undefined` num PATCH sem corpo, e `z.object` recusa `undefined`. Resolvido com
`.default({})`. O sintoma era `400` sem pista nenhuma, e derrubou 26 testes em
cascata — o primeiro travava o motoboy e nenhum pedido seguinte achava alguém
elegível.

**O runner local de e2e passou a aplicar migrações** antes de rodar. Sem isso,
uma migração aplicada só no banco de desenvolvimento faz a suíte inteira falhar
com `500`, e o erro aponta para o lado errado.

---

### 2. Marcar coleta, entrega e retorno esquecidos — com tempo mínimo

**O problema.** O motoboy esquece de tocar o botão. A entrega aconteceu no mundo
real e o sistema acha que está parada. Isso contamina o SLA, o relatório de
tempo por etapa e o repasse.

**Escopo.**

Três ações no app do motoboy que avançam o estado com carimbo de tempo
retroativo declarado — "coletei às 14:20", não "coletei agora".

O que impede virar fraude é o **tempo mínimo**: um intervalo configurável entre
uma etapa e a seguinte. Sem ele, dá para marcar coletado e entregue no mesmo
segundo e faturar sem sair do lugar.

Em `PlatformSettings`, três campos novos, todos `Int?` (nulo = sem restrição,
seguindo a convenção da tabela):

```prisma
minMinutesBeforeCollect  Int?   /// entre aceitar e poder marcar coleta esquecida
minMinutesBeforeDeliver  Int?   /// entre coletar e poder marcar entrega esquecida
minMinutesBeforeReturn   Int?   /// entre entregar e poder marcar retorno esquecido
```

Sugestão de valor inicial para a tela do administrador: 2, 5 e 2 minutos.
**Não coloque default no schema** — deixe o administrador definir, como o resto
da tabela faz.

Regras:

- O horário informado não pode ser **futuro** nem **anterior à etapa anterior**.
- A diferença para a etapa anterior tem que respeitar o tempo mínimo.
- Marque na `DeliveryStatusHistory` que foi **marcação retroativa**, com o
  horário declarado e o horário real do toque. Os dois números importam: o
  declarado alimenta o SLA, o real prova o que aconteceu.
- Relatórios de tempo por etapa devem poder **excluir** entregas com marcação
  retroativa. Um SLA calculado sobre horário declarado pelo próprio interessado
  não é medição.

Tela do administrador: os três campos em Configurações, junto com os outros
parâmetros da operação.

**Testes.** Horário futuro; horário antes da etapa anterior; abaixo do tempo
mínimo; exatamente no tempo mínimo (deve passar — use intervalo semiaberto);
tempo mínimo nulo; efeito no relatório de etapas.

---

### 3. Aviso de motoboy sem localização ✅ FEITO

**Entregue em 2026-08-23.** O detector no servidor roda de 2 em 2 minutos e o
resultado aparece em dois lugares — mas os dois **não** valem o mesmo:

**Não existe infraestrutura de push neste sistema.** Nem Firebase, nem FCM, nem
`expo-notifications` — o único canal para o motoboy é o Socket.IO, que exige o
app vivo. Ou seja: **quando o app morre de vez, não há como avisá-lo**. É
exatamente por isso que o concorrente usa WhatsApp aqui.

O que sobra, e que foi construído:

- **o bloco no painel do admin é a parte que sempre funciona.** "Fulano está com
  2 pedidos (#1001, #1002) e sem posição há 14 min" — é a resposta pronta para a
  ligação da loja. Fica no topo da tela e some sozinho quando não há ninguém em
  silêncio, para não virar ruído permanente;
- **o aviso ao motoboy cobre o subconjunto real** de app aberto com rastreamento
  quebrado: permissão revogada, GPS desligado, economia de bateria matando o
  serviço de localização. Se a mensagem chegou, o app está vivo — por isso o
  texto pede para conferir permissão e GPS, e não "reabra o app".

**Alcançar app encerrado continua em aberto** e exige push (FCM) ou WhatsApp.
É projeto próprio, não um ajuste.

**Quatro decisões da construção:**

- **a varredura olha quatro status, não dois.** O plano dizia `ACCEPTED` e
  `COLLECTED`; entraram também `DELIVERED` (só fica parado aí quando exige
  retorno — ele está voltando para a loja) e `FAILED` (mercadoria voltando). Nos
  quatro o motoboy está na rua e a loja ainda espera;
- **quem nunca mandou posição conta desde que assumiu o pedido.** É o caso mais
  grave — aceitou e o rastreamento nunca subiu — e sem esse piso ele não
  apareceria em varredura nenhuma;
- **um aviso por episódio**, decidido comparando o carimbo do último aviso com a
  posição mais recente. Se chegou posição depois do aviso, ele voltou e sumiu de
  novo: episódio novo. Isso evita qualquer escrita a mais no caminho do ping, que
  é quente;
- **o painel mostra o estado, não o log.** Quem já foi avisado continua na lista
  enquanto o silêncio durar — esconder deixaria o admin sem o número justamente
  durante o problema.

---

### 3. Aviso de motoboy sem localização

**O problema.** O rastreamento morre em segundo plano — otimização de bateria,
app fechado, sinal ruim — e ninguém sabe. O pedido parece parado no mapa e a
loja liga perguntando.

**A solução que o concorrente usa, e por que é a certa.** Eles **não** checam
otimização de bateria no aparelho. O **servidor** percebe que o motoboy tem
pedido em andamento e parou de mandar posição, e avisa o próprio motoboy pedindo
para reabrir o app. Isso funciona qualquer que seja a causa — bateria, app
morto, sem sinal, GPS desligado. Uma checagem no aparelho só pega uma das
causas, e só quando o app está vivo para checar.

**Escopo.**

Tarefa agendada rodando a cada 2 minutos (padrão do
`financial-release.scheduler.ts`). Para cada motoboy com pedido em
`ACCEPTED` ou `COLLECTED`:

- último `DeliveryLocationPoint.capturedAt` mais velho que o limite
  configurado → dispara aviso.

Em `PlatformSettings`:

```prisma
locationSilenceAlertMinutes Int?   /// nulo = detector desligado
```

Sugestão para a tela: 10 minutos. Nulo desliga o recurso inteiro — uma operação
que não configurou não pode começar a mandar aviso sozinha.

Regras:

- **Não repita.** Um aviso por episódio de silêncio. Guarde quando o último
  aviso foi mandado e só mande de novo depois que a localização voltar e sumir
  outra vez. Mandar de 2 em 2 minutos treina o motoboy a ignorar.
- Avise **também o administrador**, em um bloco na tela de operações: "Fulano
  está com 2 pedidos e sem posição há 14 min". É o número que responde a ligação
  da loja.
- Canal: `Notification` com `type: ADMIN_ALERT` para o administrador e `PUSH`
  para o motoboy. **Não existe canal de WhatsApp neste sistema** — não invente
  um; se for necessário depois, é projeto próprio.
- Motoboy sem nenhum pedido em andamento **não** gera aviso. Ele pode
  legitimamente estar com o app fechado entre corridas.

**Testes.** Silêncio acima do limite com pedido ativo; silêncio sem pedido
ativo (nada); aviso não repetido dentro do mesmo episódio; aviso novo depois da
localização voltar e sumir de novo; limite nulo (detector desligado); motoboy
que nunca mandou posição nenhuma desde que aceitou.

---

### 4. Painel de caixa ✅ FEITO

**Entregue em 2026-08-23.** `GET /admin/financial/cash-position` e a seção
"Posição de caixa — agora" no topo do Financeiro.

**Metade dos números já existia — mal.** A tela de Financeiro já mostrava
"Concluído sem fatura", faturas e carteiras, mas com as semânticas trocadas:

- **"Concluído sem fatura" era filtrado por período**, o que o tornava inútil
  como número de caixa. Trabalho de junho nunca faturado sumia ao filtrar
  agosto — justamente o dinheiro que se quer enxergar;
- **faturas e carteiras NÃO eram filtradas**, mas ficavam logo abaixo do
  seletor de datas, sem nada indicando isso. Ninguém conseguia dizer a que
  recorte cada número pertencia.

Agora o caixa é uma seção própria, acima e fora do filtro, com o aviso "não muda
com o filtro de período abaixo". O bloco do período ficou só com o que é
genuinamente do período.

**Um defeito silencioso corrigido no caminho.** "Vencida" é status
**armazenado**, atualizado por `refreshOverdueInvoices` — que só rodava ao abrir
a lista de faturas. Quem abrisse o Financeiro direto podia ver "faturas
vencidas: 0" com dinheiro atrasado de verdade. O método virou público e o caixa
o chama antes de somar.

**Duas decisões:**

- **"sem fatura" conta só `paymentMethod: BILLED`.** Pedido pago online nunca
  vira fatura, então nunca seria "sem fatura" — entraria como dívida que não
  existe;
- **só carteiras de motoboy.** A carteira de empresa existe no schema e não é
  usada; misturar as duas daria um número que não é dívida com ninguém.

Cada número leva à lista que o compõe, e os cartões ganharam uma linha de
explicação — "R$ 7.951" sozinho não conta que são entregas já feitas e ainda não
cobradas, que é a informação que faz alguém agir.

---

### 4. Painel de caixa

**O problema.** Não existe nenhuma tela que responda "quanto eu tenho a
receber e quanto eu devo, agora". Em especial, **trabalho já feito e ainda não
faturado** não aparece em lugar nenhum — no concorrente esse número era R$ 7.951
de um faturamento mensal de R$ 21 mil, ou seja, mais de um terço.

**Escopo.**

Um bloco no painel do administrador com sete números, todos do instante atual
(não do período filtrado — isto é posição de caixa, não relatório):

| Número                  | De onde sai                                 |
| ----------------------- | ------------------------------------------- |
| Concluídos sem fatura   | `Delivery` em `COMPLETED` sem `invoiceId`   |
| Faturas a vencer        | `Invoice` pendente com `dueDate` no futuro  |
| Faturas vencidas        | `Invoice` pendente com `dueDate` no passado |
| **Total a receber**     | soma dos três acima                         |
| Disponível em carteiras | soma dos saldos de motoboy liberados        |
| Bloqueado em carteiras  | soma do que ainda não liberou               |
| Saques pendentes        | `WithdrawalRequest` aguardando              |

Cuidados:

- "Vencida" se resolve em `America/Sao_Paulo`, pela função pronta. Uma fatura
  que vence hoje **não** está vencida às 22h do dia anterior em UTC.
- Some no banco (agregação), não trazendo linhas para a memória. Isso vai rodar
  a cada abertura de tela.
- Cada número deve levar à lista que o compõe. Número que não abre é número que
  ninguém confia.

**Testes.** Cada agregado com dado semeado; fatura vencendo hoje na virada do
dia; carteira sem transação nenhuma; ausência de entrega concluída.

---

### 5. Ocultar valores ✅ FEITO

**Entregue em 2026-08-23.** Botão de olho no cabeçalho, ao lado da conta. Troca
todo valor em dinheiro por `R$ ••••`, guardado no navegador.

**A parte difícil não era o botão — era garantir que nada escapasse.** O plano
avisava que meia solução é pior que nenhuma, e o painel tinha **treze cópias**
de formatador de dinheiro: cada página com a sua, várias chamando
`Intl.NumberFormat` direto. Wireá-las uma a uma deixaria qualquer tela nova
vazando por padrão.

A solução foi unificar: um único `useMoney()` em `lib/money.tsx`, com a máscara
dentro dele. Nenhuma tela pode esquecer de esconder porque nenhuma tela formata
sozinha. A prova é um grep — `Intl.NumberFormat.*BRL` não casa em mais nada fora
de `money.tsx`.

**Duas decisões:**

- **`useSyncExternalStore`, não `useState` + `useEffect`.** `localStorage` é
  estado externo ao React, e semeá-lo num efeito é o que a regra
  `react-hooks/set-state-in-effect` barra — a mesma que já mordeu antes neste
  repositório. Com o hook certo, o React cuida do SSR: `getServerSnapshot`
  responde "visível" e a leitura real acontece na hidratação. De quebra, dispensa
  o Provider: qualquer componente chama o hook e todos ficam em sincronia;
- **texto de ausência não é mascarado.** "A calcular na entrega" e "—" não
  revelam valor nenhum, e escondê-los só tiraria informação de quem olha.

**Não verificado visualmente:** as telas com dinheiro exigem login, que eu não
faço. Typecheck, lint, build e a checagem estrutural dos 14 pontos de uso
passaram; o clique no botão não foi exercido.

---

### 5. Ocultar valores

Um botão no cabeçalho do painel que substitui todo número em dinheiro por
`R$ ••••`. O dono mostra o painel para outras pessoas — motoboys, lojistas,
visitas.

É estado de interface, guardado em `localStorage`, sem ida ao servidor. Custa
pouco e resolve um constrangimento real.

Cuidado: esconda **todos** os valores da tela, inclusive os de dentro de tabela
e gráfico. Meia solução é pior que nenhuma, porque dá falsa sensação de estar
coberto.

---

### 6. Fila ao vivo por status, com SLA configurável ✅ FEITO (parcial, ver abaixo)

**Entregue em 2026-08-23.** Três limites configuráveis
(`slaAlertMinutesToAccept` / `ToCollect` / `ToDeliver`) e o cronômetro de cada
pedido acendendo em vermelho quando passa do limite da etapa em que ele está.

**As "colunas por status" não foram feitas — e de propósito.** A fila já tem
duas lentes, uma delas exatamente "por status", com seção e contador para cada
um. O que o plano pedia era transformá-las em colunas horizontais, e isso
pioraria: no concorrente o kanban ocupa uma página inteira, enquanto aqui a fila
divide a tela com o mapa e o feed ao vivo, numa coluna de 300px. Seções
verticais cabem; colunas não. O agrupamento por status, que é o valor real,
já existe.

**Três decisões:**

- **a comparação acontece no cliente**, junto do relógio que já bate a cada
  segundo. Se o servidor resolvesse o alerta, a linha só acenderia na próxima
  consulta — e a hora de acender é justamente enquanto alguém está olhando;
- **o `ElapsedTime` tinha um comentário dizendo por que não havia cor:**
  _"depende de um limite que ninguém decidiu ainda, e pintar de vermelho um
  número arbitrário treinaria o operador a ignorar a cor"_. Este item é o que
  destrava aquilo, e o comentário foi atualizado para dizer isso;
- **sem sinalização fora das três etapas de espera.** Concluído e cancelado não
  estão parados esperando nada; agendado está parado de propósito.

A tela de configuração diz a média real da cidade em cada campo (10 min até a
coleta, 23 até a entrega) para o admin escolher um limite acima dela — abaixo, a
fila fica vermelha o tempo todo e a cor deixa de significar alguma coisa.

**Não verificado visualmente:** exige login.

---

### 6. Fila ao vivo por status, com SLA configurável

**O que existe hoje.** A fila do painel já mostra há quanto tempo cada pedido
está no estado atual (cronômetro ao vivo) e agrupa por empresa.

**O que falta.** Colunas por status e **sinalização por limite de tempo
configurável**. No concorrente: sem aceite após 5 min, sem coleta após 15 min,
sem entrega após 30 min — ajustáveis.

Em `PlatformSettings`, três campos `Int?`:

```prisma
slaAlertMinutesToAccept   Int?
slaAlertMinutesToCollect  Int?
slaAlertMinutesToDeliver  Int?
```

Nulo = sem sinalização para aquela etapa.

Referência real da cidade, para a tela sugerir: aceite ~0 min, aceite→coleta 10
min, coleta→entrega 23 min. Os limites de alerta têm que ficar **acima** da
média, ou tudo fica vermelho o tempo todo e a cor perde o sentido.

Use o `apps/api/src/common/time-window.ts` e o cálculo de etapas já existente em
`apps/api/src/deliveries/delivery-stage-times.ts` — não escreva uma segunda
cópia dessa aritmética.

---

### 7. Comparação honesta de período, e o rótulo de histórico

Duas correções nos relatórios que já existem. Baratas e evitam decisão errada.

**Comparação "até agora".** Todo indicador comparado com o período anterior deve
comparar até o **mesmo ponto do dia**: os últimos 30 dias até este instante
contra os 30 anteriores até o mesmo instante. Sem isso, o dia corrente pela
metade faz todo indicador parecer em queda, todo dia, até a noite.

**Rótulo HISTÓRICO.** Quando o filtro de período não for "hoje", a tela avisa em
destaque que os dados não atualizam em tempo real, e qualquer feed ao vivo é
escondido. Evita que alguém decida olhando número parado achando que é atual.

Atenção ao que já foi aprendido no relatório de horários de pico: uma janela de
30 dias quase nunca tem o mesmo número de segundas e de domingos. Média por
ocorrência, nunca soma crua.

---

## Parte 2 — o que ficou de fora, e por quê

Não implemente. Cada item abaixo foi avaliado e recusado por uma razão.

**Régua de cobrança automática por WhatsApp.** O concorrente dispara 5
mensagens (ao gerar, 1 dia antes, no dia, 1 dia depois, 5 dias vencida). Faz
sentido, mas **não existe canal de WhatsApp neste sistema** — `Notification` só
tem `PUSH`, `REALTIME` e `EMAIL`. Construir a integração é projeto próprio, com
custo e homologação. Se for fazer só por e-mail e push, a régua em si é simples;
decida antes se o canal disponível resolve o problema de cobrança.

⚠️ **Se for fazer, um alerta de segurança.** O painel do concorrente exibe, em
texto puro e por meses, o link de acesso à conta do cliente que foi enviado na
cobrança — junto com a chave PIX e o nome do titular. Quem abrir aquele histórico
entra na conta de qualquer cliente. Se implementarmos link de pagamento: **uso
único, validade curta, e o histórico não reexibe o token**. Copiar o formato
deles copiaria a falha junto.

**Tarifa dinâmica (zonas desenhadas no mapa).** O próprio concorrente não usa —
a tela é uma página de venda de R$ 199/mês. Nenhum cliente depende disso, e é a
funcionalidade mais cara da lista.

**Múltiplas praças.** Contradiz a regra de praça única registrada em
`business-rules.md`. Não mexer sem decisão do dono.

**Prova de entrega com foto ou assinatura.** Foi deliberadamente adiada, com o
risco aceito por escrito em `business-rules.md`. Reabrir é decisão de produto
nova, não correção de falha.

**Integrações além do aiqfome.** Decisão registrada do dono. E o dado confirma
que não custa nada: no concorrente, 100% dos pedidos são lançados à mão.

**Desafios, escalas, punição de entregadores.** Gestão de frota, escopo próprio.
Além disso, bônus por volume é exatamente o incentivo que faz correr e recusar
corrida ruim — foi o mesmo motivo que levou o relatório de desempenho daqui a
não ter nota única.

**Oportunidades e Marketing.** Não são funcionalidades da operação: são do dono
da plataforma concorrente. Roteamento de leads por região e conteúdo pronto para
redes sociais são mecanismos de retenção do fornecedor. Uma operação de uma
cidade não constrói isso.

---

## Parte 3 — como entregar cada item

1. Um item por commit. Mensagem em português, explicando **o problema que
   resolve**, não a lista de arquivos tocados.
2. Teste junto, no mesmo commit. Cada seção acima já lista os casos.
3. Antes de cada commit: `pnpm turbo typecheck lint test build`, e os e2e da API
   se você mexeu em resposta de endpoint.
4. Se mudou resposta de endpoint, **atualize o e2e no mesmo commit** — o
   `toEqual` estrito vai quebrar, e é para isso que ele existe.
5. Migração de banco: pare o servidor da API antes, ou a DLL do engine trava.
6. Nada de chave, token ou dado pessoal em commit — **o repositório é público**.

### Sobre o app do motoboy

Os itens 1 e 2 mexem no `apps/driver-app`. A tela mais recente
(`src/screens/AvailableDeliveriesScreen.tsx`, a vitrine) **nunca foi verificada
em aparelho** — passa em typecheck e teste, mas ninguém a viu rodando. Quem
retomar o app deve conferi-la junto.

Dois erros já cometidos ali, para não repetir: a paleta em `src/theme/colors.ts`
é **plana com sufixo `Dark`** (`colors.textDark`), não aninhada em
`colors.dark.text`; e o componente `EmptyState` aceita **só** a prop `message`.
Confira a assinatura real antes de usar qualquer componente compartilhado.
