# Arquitetura — MOTOboyCity

> Como o sistema é organizado e por quê. Descreve o estado **atual**; quando
> mudar, este arquivo muda junto.
>
> Para o que está valendo em produção hoje, veja `agent-handoff.md`. Para o
> histórico de cada recorte, `changelog.md`. Para decisões de negócio,
> `business-rules.md`.

## 1. O mapa

Monorepo PNPM/Turborepo com quatro aplicações e três pacotes compartilhados.

| Onde | O quê |
|---|---|
| `apps/api` | NestJS, Prisma/PostgreSQL, Redis/BullMQ, Socket.IO |
| `apps/company-web` | painel da empresa (Next.js) |
| `apps/admin-web` | painel administrativo (Next.js) |
| `apps/driver-app` | aplicativo do motoboy (React Native CLI) |
| `packages/validation` | schemas Zod — a fronteira de entrada |
| `packages/types` | formatos de resposta e payload |
| `packages/api-client` | chamadas HTTP tipadas, usadas pelos três clientes |

## 2. A cadeia de contratos

Toda mudança de contrato percorre a mesma sequência, e o compilador cobra cada
elo:

```
packages/validation  (o que é aceito)
  → packages/types   (o que é devolvido)
    → packages/api-client
      → controller + ZodValidationPipe
        → service + Prisma
          → web / mobile
            → fila, push e realtime quando aplicável
```

**A regra que sustenta isso:** um tipo só é `optional` quando "ausente" é um
estado real do domínio — nunca por conveniência. Em 2026-08-28 um
`payload?: CompleteReturnPayload` derrubou a conclusão de retorno de todos os
motoboys, e o TypeScript aprovou o esquecimento. Ao tornar obrigatório, o
compilador acusou quatro chamadas com o mesmo defeito.

`@motoboycity/validation` é o único pacote cujo `main` aponta para `dist/`;
`types` e `api-client` apontam para `src/`. Por isso um build do aplicativo
exige `pnpm --filter @motoboycity/validation build` antes.

### O transporte é compartilhado, a política é de cada aplicativo

Toda rota tipada passa por `apiFetch` e `parseJsonOrThrow` (`api-client/http.ts`
e `api-error.ts`). Ali vivem duas decisões que não podem ser tomadas por tela:

- **timeout por requisição** — `fetch` não tem prazo padrão, e uma rede móvel que
  conecta sem trafegar deixa a chamada pendurada para sempre. O padrão do pacote
  é **sem prazo**, para não mudar telas de painel que ninguém pediu para tocar;
  cada aplicativo escolhe o seu em `configureApiClient`. O aplicativo do motoboy
  usa 15 s. O prazo é local: encerra a espera, não a requisição no servidor — só
  é seguro porque toda escrita já é idempotente na retentativa;
- **401 tem uma única reação** em todo o aplicativo. **Somente 401**: nesta API o
  403 é decisão de negócio — motoboy em punição, oferta de outra pessoa — e
  tratá-lo como sessão inválida deslogaria alguém no meio do expediente por uma
  regra funcionando como deveria.

## 3. A máquina de estados da entrega

```
SCHEDULED ──▶ AWAITING_DRIVER ──▶ ACCEPTED ──▶ COLLECTED ──┬─▶ DELIVERED ──▶ COMPLETED
                    ▲                  │                    └─▶ FAILED ─────▶ COMPLETED
                    └──────────────────┘                              (retorno à loja)
                     devolver à fila            CANCELLED em qualquer ponto antes de fechar
```

As três ações do motoboy, todas `PATCH` e guardadas por `DriverOnlyGuard` —
coletar, entregar e retornar são atos físicos, sem sobreposição do admin:

| Rota | Escopo |
|---|---|
| `/deliveries/:id/collect` | atômica para o lote inteiro |
| `/deliveries/:id/deliver` | por item |
| `/deliveries/:id/fail` | por item, só depois da coleta |
| `/deliveries/:id/complete-return` | filtra os itens do lote que exigem retorno |

A proximidade do retorno é medida em **linha reta** (Haversine, não rota real)
entre a posição informada e o endereço de coleta da empresa.

Regras que valem em toda transição:

- grava uma linha em `DeliveryStatusHistory` com `fromStatus`/`toStatus`/autor —
  é a fonte de auditoria, não é redundância do campo `status`;
- usa escrita condicional (`updateMany` com checagem de `count`), porque outro
  ator pode disputar a mesma transição;
- é idempotente na retentativa: repetir uma ação já aplicada devolve o estado
  atual em vez de erro.

`COMPLETED` credita o repasse do motoboy. `FAILED` **não** é cancelamento: a
mercadoria volta para a loja, a empresa paga a corrida normal e o retorno é
cobrado.

## 4. Os dois modos de destino — o ponto de ramificação que mais custou

Esta é a divisão que explica quase todo incidente do sistema até hoje.

### Destino conhecido na criação (`destinationKnownAtCreation = true`)

O endereço vem no pedido. Distância e preço são calculados e **congelados** na
criação. Na entrega, o GPS serve só para conferir proximidade — e essa
conferência é opcional, governada pelo raio.

### Destino definido na entrega (`false`)

O pedido nasce só com o endereço de coleta; `distanceKm`, `totalValue`,
`driverValue` e `platformValue` ficam nulos. Na entrega, **a posição do motoboy
vira o endereço e o preço**: cria a linha `DROPOFF` e dispara Google Maps e
`PricingService` retroativamente.

**Por isso as exigências são diferentes, e não incoerentes:**

| | Destino conhecido | Destino definido na entrega |
|---|---|---|
| Raio de proximidade | conferido | **não se aplica** — não há destino contra o que comparar |
| Precisão do GPS | limitada pelo raio | limite próprio, mais rígido (padrão 100 m) |
| lat/lng | opcional se o raio estiver desligado | **obrigatório** |
| Falha do Google | não impede concluir | impede — sem rota não há preço |

A mensagem de recusa por precisão **explica** essa diferença ao motoboy. Sem
isso, ele lê "800 m é demais" com um raio de 5000 m configurado na tela e conclui,
com razão, que o sistema se contradiz.

### A assimetria que já produziu três incidentes

**Criar aceita macio; concluir exige duro.** A geocodificação do destino falha em
silêncio na criação (`resolverCoordenadaDoDestino` devolve `null` e o pedido
nasce com o endereço em texto), e a conclusão precisava daquele dado.

Cada vez que essa assimetria apareceu, o motoboy é quem ficava preso — sem
nenhuma ação disponível, porque o defeito estava no cadastro, não nele. A
resposta adotada é sempre a mesma: **degradar com auditoria em vez de recusar**,
e avisar quem pode corrigir. Quem não pode corrigir o cadastro não deve ser
bloqueado por ele.

Isto é um *padrão a vigiar*, não um bug resolvido: qualquer dado novo que a
criação aceite frouxo e a conclusão exija rígido reproduz a família inteira.

**O endereço salvo do cliente carrega coordenada, e é aí que ela deve nascer.**
O painel resolve pelo Google Places, que só devolve resultado com ponto; a API
geocodifica como rede de segurança quando a coordenada não vem, para nenhum
outro cliente da API conseguir gravar um endereço sem ela. Falha do Google não
impede o cadastro — a agenda de clientes não pode depender dele estar de pé, e
quem decide se a coordenada faz falta é a regra de proximidade, na entrega.
`deliveryAddressInputSchema`, reusado pelo endereço de cliente, aceita
`lat`/`lng` opcionais e **pareados**, e `resolverCoordenadaDoDestino` usa o que
vier em vez de geocodificar de novo: o endereço já conferido uma vez não volta a
depender do Google a cada pedido.

## 5. Onde o dinheiro passa

**Todo preço sai de `PricingService.quote()`.** Não existe cálculo de valor fora
dele — nem em intervenção administrativa, onde o admin informa a *distância* e a
tabela decide o *preço*.

A invariante `driverValue + platformValue === totalValue` é garantida por
construção em `pricing-calculator.ts`: `platformValue` é **derivado** de
`totalValue - driverValue`, então nenhum arredondamento pode quebrá-la.

O repasse tem `idempotencyKey = driver-repasse:{deliveryId}` com índice único.
Duas finalizações concorrentes: a segunda esbarra em P2002 e vira conflito
legível — a proteção funcionando, não um erro a esconder.

Uma corrida de 0 km é cobrada pela **taxa base** da tabela, e o histórico
registra que ela fechou no mesmo ponto da coleta — cobrança legítima, mas também
o sintoma de um toque errado, e a fatura precisa poder ser explicada.

## 6. Despacho e concorrência

A oferta pendente única por pedido é a garantia central, e tem três camadas:

1. `SELECT ... FOR UPDATE` no motoboy e nas entregas;
2. transação `Serializable`;
3. índice parcial único no banco, como última defesa.

`P2002` e `P2034` são tratados como no-op idempotente — corrida detectada, não
erro. **Esse padrão não pode ser enfraquecido para "simplificar"**: é a única
proteção real contra duas ofertas para o mesmo pedido.

**A guarda vai na escrita, nunca só na leitura.** Toda transição confere o
estado esperado no `where` do `updateMany` e olha o `count`. Entre uma leitura e
a escrita cabe outro ator — e coube: a expiração de oferta e a ativação do
agendado checavam numa leitura anterior e escreviam direto, o que sobrescrevia a
recusa do motoboy (contando-a duas vezes) e ressuscitava pedido cancelado.
Remover um job da fila **não interrompe** um job que já começou; ele continua
com o retrato que leu antes, e só o `where` o detém.

Elegibilidade do motoboy: região, `approvalStatus`, `accountStatus`,
`availability`, modalidade atribuída, presença viva no Redis, teto de entregas
simultâneas, punição ativa e ausência de `DriverCompanyBlock` para a empresa do
pedido. Quem já tem oferta pendente e quem está punido entram pela mesma porta
de exclusão — `eligibleDriverWhere` descreve quem *pode* atender, enquanto a
punição descreve quem está temporariamente fora.

O bloqueio seletivo é uma relação persistente `(driverId, companyId)` com
unicidade no banco. Ele é revalidado ao criar e aceitar oferta, ao assumir pela
vitrine e ao reatribuir pelo admin; não depende de a tela estar atualizada. A
mudança usa o mesmo lock de linha do motoboy que a emissão de oferta. Bloquear
remove apenas ofertas pendentes da empresa escolhida; nunca altera uma entrega
que já está em andamento.

A vitrine (`claimDelivery`) é o único caminho de atribuição que não passa por
oferta, então **repete as checagens por conta própria**: região, modalidade,
punição, bloqueio por empresa e teto, estes últimos dentro da transação e sob o
mesmo `FOR UPDATE` no motoboy. A listagem filtra, mas a listagem pode estar velha
na tela.

O teto de entregas simultâneas pergunta "cabe o que estou prestes a entregar?",
recebendo a **quantidade** — não "cabe mais uma?". Com a pergunta antiga, um lote
de dez passava para quem tinha duas de teto três.

A ordem da fila vive no Redis; uma oferta válida consome a vez do motoboy e o
move para o fim, tornando a fila circular.

**A varredura de minuto em minuto é a rede de segurança** (`DispatchScheduler`).
O despacho já foi 100% orientado a evento, e o pedido agendado tinha um gatilho
só: o job no Redis, criado depois do commit. Um `queue.add` que falhasse deixava
o pedido esperando para sempre, porque nada olhava para `SCHEDULED`. A varredura
ativa o agendado vencido, reagenda o job que sumiu **antes de o pedido atrasar**,
e varre a fila. Cada passo reusa um caminho que já confere o estado, então rodar
duas vezes junto não duplica nada.

## 7. Contrato de lote

Um lote é um grupo de **2 a 50 entregas imediatas** criadas na mesma chamada, por
`POST /deliveries/batch`. Não há tabela `DeliveryBatch`: um UUID da aplicação vai
em `Delivery.batchId`, e `null` é o pedido individual.

- **É uma unidade de despacho**: todos os itens são ofertados ao mesmo motoboy, e
  aceite, recusa, expiração e cancelamento valem para o grupo.
- **A auditoria continua granular**: uma `DeliveryOffer` e um histórico por
  entrega. O realtime manda um evento agregado com `batchId`.
- **Atômico para o lote**: coleta, cancelamento, devolução à fila e **troca de
  entregador**. **Por item**: entrega e insucesso.
- **Filtrado**: o retorno afeta só os itens que o exigem.
- A recusa de um lote conta como **uma** recusa, não N — o lote é ofertado e
  respondido como unidade.

**Um lote nunca pode ter dois donos.** A coleta exige `driverId` em todos os
irmãos, então um lote dividido trava dos dois lados: cada motoboy esbarra no item
do outro, e a mensagem que ele recebe fala de outra coisa. A única porta que
dividia era a troca de entregador pelo painel, que operava sobre um item só;
hoje ela move o lote inteiro ou recusa.

Divergir de status é legítimo **a partir da entrega** — é quando o motoboy passa
a fechar um endereço de cada vez. Antes disso, os itens andam juntos. Por isso o
cancelamento **não arrasta** um irmão já `DELIVERED`/`FAILED`: aquela corrida
aconteceu, tem repasse a pagar, e fecha pelo retorno. Cancelar diretamente um
pedido nesse estado continua permitido — é regra de negócio, não descuido.

O teto de 50 é do formato. `maxDeliveriesPerBatch = 1` desliga o lote.

## 8. Configuração operacional

O administrador governa a operação por `PlatformSettings`. A distinção que
importa é **o que pode ser desligado**:

| Campo | `null` significa |
|---|---|
| Raios de coleta, entrega e retorno | regra desligada |
| Prazo de coleta | sem devolução automática à fila |
| Teto de entregas simultâneas | sem limite |
| **Tempo de resposta da oferta** | **não configurado — despacho congelado** |
| **Comissão do entregador** | **não configurado — impossível precificar** |
| **Precisão do destino por GPS** | **o padrão de 100 m, nunca "sem limite"** |

Os três de baixo **não aceitam `null` no contrato**. Ali o nulo não desligaria
uma regra: pararia a plataforma ou removeria uma proteção de dinheiro.

Os cinco de cima são desligáveis **pela tela**, com ação explícita — não por
campo em branco, que significa "mantenha como está". Isso existe porque houve uma
noite em que um raio configurado travou a operação e não havia caminho de volta
pelo painel.

**Nenhum limite que governe a operação deve morar como constante de código.** Se
o operador não alcança, ele não opera.

## 9. A fila offline do aplicativo

Coleta, entrega e retorno são salvos no aparelho antes de subir. A fila é local
por usuário (`ownerUserId`) e sobrevive a fechar o app.

Classificação da resposta do servidor — é ela que decide o comportamento:

| Resposta | Estado | Efeito |
|---|---|---|
| rede, timeout, 5xx | `PENDING` | retenta sozinho |
| 401 | — | sessão expirada, ação preservada |
| 409 já aplicado | removido | reconciliado, sem duplicar |
| 4xx (422 inclusive) | `NEEDS_REVIEW` | **para de retentar**, exige toque |

Confundir 422 com 503 foi o que deixou um motoboy retentando a noite inteira uma
operação que nunca ia passar. Item em `NEEDS_REVIEW` **não sincroniza sozinho**,
por desenho — e todo caminho que o conserta precisa devolvê-lo a `PENDING`.

**Revisão só existe para o que o motoboy ainda pode resolver.** Depois de uma
recusa definitiva, a fila consulta o pedido de verdade e separa três desfechos:
já aplicado (sai como sincronizado), **obsoleto** — o pedido foi cancelado e a
ação perdeu o objeto — ou não resolvido, que é o único que vira revisão. Sem essa
distinção, uma entrega marcada offline num pedido que o admin cancelou ficava em
revisão para sempre: o banner não saía da tela e tocar nele repetia a mesma
recusa. O obsoleto sai da fila com aviso único e **não** conta como sincronizado,
porque nada foi.

O aviso de espera só aparece depois de seis segundos, ou de imediato se o
servidor recusou. Um aviso que aparece sempre deixa de ser aviso.

## 10. Auditoria

Três trilhas, com propósitos distintos:

- `DeliveryStatusHistory` — toda transição de status, com autor e nota;
- `AdministrativeAudit` — intervenções do admin, com **motivo obrigatório**;
- `WalletTransaction` — todo movimento de dinheiro, append-only, com o saldo
  como cache derivado e nunca como fonte da verdade.

Intervenção manual do administrador sempre exige motivo. Sem ele, a trilha mostra
que alguém mudou o pedido e não mostra por quê — que é exatamente a pergunta de
quem for conferir depois.

**Escrita sem guarda estraga a trilha, não só o dado.** Dois admins trocando o
entregador ao mesmo tempo gravavam duas linhas, cada uma nomeando um "anterior"
já obsoleto: a auditoria deixava de permitir reconstruir a ordem. É outro motivo,
além da corrida em si, para a condição viver no `where`.

## 11. Dívidas estruturais conhecidas

Registradas para não serem redescobertas:

1. **`deliveries.service.ts` tem ~3.400 linhas** e concentra criação, preço,
   transições, intervenções e consultas. Todo incidente recente passou por ele.
2. **A assimetria criar/concluir** (seção 4) não tem um dono: o rigor é decidido
   por ponto de chamada, não por dado.
3. **O E2E `delivery-lifecycle` depende do estado do banco** — `platform_settings`
   deixada por um run anterior derruba testes que rodam antes. A correção
   definitiva é cada suíte criar a própria região.
4. **Não há prova de entrega** — nem foto, nem confirmação do destinatário.
   Decisão explícita do responsável, com o risco aceito; fica como débito de
   segurança/fraude a revisitar.
5. **A criação não tem os fallbacks da conclusão** e responde "tente novamente em
   instantes" mesmo para endereço irroteável — afirma uma causa temporária que
   não sabe ser temporária.
