# Auditoria do aplicativo do motoboy (`apps/driver-app`)

Data da revisão: 24/08/2026.

Escopo: as 12 telas do aplicativo Android, os componentes e bibliotecas usados nos fluxos de sessão, presença, ofertas, operação, GPS, carteira e cadastro, os 13 arquivos Kotlin do aplicativo e os serviços da API que definem dispatch, aceite, transições e saque. A revisão encontrou **5 achados de gravidade alta, 4 de gravidade média e 1 de gravidade baixa**. Nenhum código da aplicação foi alterado nesta auditoria.

## Estado após as correções de 24/08/2026

Os achados abaixo são preservados como registro da auditoria original; as
referências de linha descrevem o código anterior à correção. O recorte foi
implementado e verificado da seguinte forma:

| Achado original | Estado atual |
| --- | --- |
| Duas ofertas concorrentes para o mesmo motoboy | Corrigido. O dispatch serializa a criação pelo registro do entregador, revalida dentro da transação que ele não possui outra oferta `PENDING` e tenta imediatamente o próximo elegível se ele ficou ocupado na corrida. |
| Bootstrap divide sessão JavaScript e nativa | Corrigido. Erros transitórios preservam a sessão; somente `401`/`403` limpam tracking, push/FCM, sessão nativa e token JavaScript. |
| Resposta perdida no aceite/claim | Corrigido. Aceite e claim são repetíveis para o mesmo entregador no backend; React Native reconcilia pelas entregas ativas, e o aceite Android repete uma vez com segurança. |
| Tracking confirma início sem provedor | Corrigido no Android. O serviço valida provedor ativo, usa GPS e rede, falha visivelmente quando nenhum está disponível e recebe do servidor o evento de presença expirada. A expiração revalida `lastSeenAt` para não sobrescrever um heartbeat concorrente. |
| Saque duplicado após resposta perdida | Corrigido. Cada tentativa lógica do app envia UUID estável; a API o escopa por usuário e reutiliza a transação existente inclusive em colisão concorrente. |
| Transições operacionais ambíguas/concorrentes | Corrigido. Coleta, insucesso, entrega e retorno usam mudança condicional de estado, não duplicam histórico/repasse e devolvem o estado já aplicado em retries. A tela reconcilia o detalhe antes de declarar falha. |
| Fila serial de posições antigas | Corrigido. O serviço mantém somente o fix mais recente enquanto envia, reduz o timeout e interrompe o lote em indisponibilidade/limite do servidor. |
| Ações irreversíveis no primeiro toque | Corrigido. Coleta, entrega e retorno pedem confirmação; a ação principal duplicada foi removida e um bloqueio síncrono impede toque duplo antes do render. |
| Cronômetro relativo e oferta local obsoleta | Corrigido. A contagem usa prazo absoluto e a retomada consulta novamente o servidor, atualizando ou removendo a oferta local. |
| Cobertura dos caminhos críticos | Melhorada. Foram adicionados testes de bootstrap, reconciliação, prazo absoluto, idempotência de saque, concorrência de dispatch e retries operacionais. |

Não houve migration: o saque reutiliza o `idempotencyKey` único já
existente no ledger e o novo campo de request é opcional para preservar
compatibilidade com clientes anteriores. Ainda dependem de validação externa
os E2E com PostgreSQL/Redis isolados e os cenários em aparelho físico com tela
bloqueada, troca de provedor de localização, rede degradada e lote grande.

### Verificação das correções

| Comando / fluxo | Resultado |
| --- | --- |
| `pnpm typecheck` | 8 projetos aprovados |
| `pnpm lint` | 8 projetos aprovados, sem avisos |
| Jest completo do Driver App | 12 suítes e 67 testes aprovados |
| Jest unitário completo da API | 59 suítes e 718 testes aprovados |
| build da API | aprovado |
| `:app:compileDebugKotlin` | aprovado; somente aviso legado de API Android depreciada |

## Achados

### [Alta] Duas ofertas concorrentes para o mesmo motoboy substituem uma à outra

**Onde:** `apps/api/src/dispatch/dispatch.service.ts:702`, `apps/api/src/dispatch/dispatch.service.ts:751`, `apps/api/src/dispatch/dispatch.service.ts:1032`, `apps/api/src/dispatch/dispatch.service.ts:1083`, `apps/driver-app/src/screens/HomeScreen.tsx:363`, `apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/OfferMessagingService.kt:143`, `apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/OfferActionReceiver.kt:105`

**O que acontece:** o dispatch exclui motoboys que já possuem oferta pendente em uma leitura anterior à transação. Duas chamadas simultâneas podem fazer essa leitura antes de qualquer uma inserir, escolher o mesmo motoboy e depois criar ofertas de pedidos diferentes: a transação revalida pedido, elegibilidade e limite de entregas aceitas, mas não volta a conferir oferta pendente do entregador. O app tem um único `incomingOffer`, o endpoint de recuperação devolve só a mais recente e a notificação usa o ID fixo `1001`; assim, a oferta nova substitui visualmente a anterior.

**O que custa AO MOTOBOY:** ele pode nunca enxergar uma corrida que estava disponível para ele. A loja anterior também fica esperando o timeout antes de o despacho procurar outro entregador, e o motoboy tende a interpretar o desaparecimento como falha aleatória do aplicativo.

**Como confirmei:** `findNextEligibleDriverId` consulta os `driverId` ocupados antes de `createPendingOffers`; dentro da transação seguinte não existe filtro ou lock por motoboy, e o índice parcial do banco garante somente um `PENDING` por entrega. Em seguida comparei com os três consumidores: Zustand guarda um único objeto, `findPendingOfferForDriver` usa `findFirst` ordenado pela oferta mais recente e o Android sempre publica no mesmo ID de notificação.

### [Alta] Uma falha de rede na abertura divide a sessão JavaScript da sessão nativa

**Onde:** `apps/driver-app/App.tsx:51`, `apps/driver-app/App.tsx:57`, `apps/driver-app/App.tsx:60`, `apps/driver-app/src/components/DrawerMenu.tsx:68`, `apps/driver-app/src/lib/offerSession.ts:30`, `apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/OfferSessionStore.kt:27`

**O que acontece:** na inicialização, qualquer rejeição de `GET /auth/me` — 401, 500 ou internet indisponível — apaga o token do AsyncStorage e abre o login. Esse caminho não limpa o token espelhado no `SharedPreferences`, não desregistra o FCM, não fica indisponível na API e não para o serviço de GPS. O logout explícito executa todas essas etapas, mas a falha de bootstrap não.

**O que custa AO MOTOBOY:** ele pode ver a tela de login enquanto continua online para o servidor e ainda recebe ou aceita uma oferta pela tela Android com a credencial antiga. Depois do aceite, não consegue abrir a operação sem entrar de novo; além de perder tempo de coleta, sua localização pode continuar sendo enviada apesar de a interface parecer desconectada.

**Como confirmei:** comparei o `catch` de `resolveInitialRoute`, que chama somente `session.clearToken`, com a sequência completa de `signOut`: disponibilidade `UNAVAILABLE`, parada do tracking, desregistro do push, limpeza da sessão nativa e limpeza do AsyncStorage. Os `fetch` compartilhados também não possuem deadline de aplicação, então uma rede degradada pode manter o splash aguardando a pilha de rede antes de cair nesse tratamento.

### [Alta] Resposta perdida no aceite deixa uma corrida aceita parecendo indisponível

**Onde:** `apps/driver-app/src/screens/IncomingOfferScreen.tsx:119`, `apps/driver-app/src/screens/IncomingOfferScreen.tsx:128`, `apps/driver-app/src/screens/AvailableDeliveriesScreen.tsx:101`, `apps/driver-app/src/screens/HomeScreen.tsx:248`, `apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/OfferNativeClient.kt:91`, `apps/api/src/dispatch/dispatch.service.ts:444`

**O que acontece:** os três aceites React Native e o aceite Android fazem uma chamada única, sem chave idempotente nem reconciliação do estado após falha. Se a API confirmar a transação e a resposta se perder, o cliente mostra erro. Repetir não recupera o sucesso: o backend exige `PENDING` e devolve conflito porque a oferta já virou `ACCEPTED`. No caminho nativo, o tracking só começa depois de interpretar a resposta bem-sucedida; uma resposta perdida deixa a corrida atribuída sem iniciar o GPS até o app voltar ao primeiro plano e consultar entregas ativas.

**O que custa AO MOTOBOY:** ele pode guardar o telefone achando que perdeu a oferta, enquanto o pedido já está sob responsabilidade dele. A coleta atrasa, o trajeto fica sem posição inicial e outra tentativa pode dizer apenas que a entrega “não está mais disponível”, exatamente o oposto do que aconteceu.

**Como confirmei:** o aceite do servidor é atomicamente protegido — oferta `PENDING -> ACCEPTED` e pedido `AWAITING_DRIVER -> ACCEPTED` na mesma transação —, mas uma nova chamada do mesmo motoboy cai no `ConflictException`. Nos `catch` dos clientes não há consulta por oferta aceita nem busca das entregas ativas antes de afirmar falha; as telas de pedidos livres apenas recarregam a vitrine.

### [Alta] O app pode confirmar tracking mesmo sem conseguir receber nenhuma posição GPS

**Onde:** `apps/driver-app/src/lib/location.ts:140`, `apps/driver-app/src/lib/location.ts:150`, `apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/LocationTrackingModule.kt:32`, `apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/DeliveryLocationTrackingService.kt:74`, `apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/DeliveryLocationTrackingService.kt:87`, `apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/DeliveryLocationTrackingService.kt:270`, `apps/api/src/live-presence/live-driver-presence.service.ts:11`

**O que acontece:** ficar online deliberadamente aceita um fix da rede/célula quando o GPS fino não fecha, mas o serviço contínuo solicita exclusivamente `LocationManager.GPS_PROVIDER`. O bridge resolve `start()` assim que conseguiu iniciar o serviço; falha ao registrar o provedor ocorre depois e fica só no Logcat. Sem callbacks, o heartbeat vence em 150 segundos e o servidor tira o motoboy do dispatch, enquanto o seletor local pode continuar mostrando “Ativo”.

**O que custa AO MOTOBOY:** dentro de casa, loja ou área com GPS fraco ele consegue aparentemente iniciar o turno, mas deixa de receber corridas sem uma indicação persistente de que ficou offline. Com pedido ativo existe um alerta Socket de localização perdida; sem pedido, o sintoma é apenas passar o dia sem oferta.

**Como confirmei:** o fallback de `capturePresenceLocation` usa `enableHighAccuracy: false`, mas o serviço não registra `NETWORK_PROVIDER` nem devolve ao JavaScript o resultado de `requestLocationUpdates`. `startOrUpdate` retorna `true` após `startForegroundService`, e a reconciliação do backend expira a presença pelo TTL. O handler de perda da Home alerta somente quando o servidor informa pedido ativo e não sincroniza o seletor para indisponível.

### [Alta] Retentar um saque após resposta perdida pode solicitar o valor duas vezes

**Onde:** `apps/driver-app/src/screens/WithdrawalScreen.tsx:69`, `apps/driver-app/src/screens/WithdrawalScreen.tsx:84`, `packages/api-client/src/driver-wallet.ts:38`, `apps/api/src/finance/financial-payout.service.ts:139`, `apps/api/src/finance/financial-payout.service.ts:168`, `apps/api/src/finance/financial-payout.service.ts:176`

**O que acontece:** o pedido de saque envia somente `{ amount }`. Se a transação for confirmada e a resposta cair, a tela mostra “não foi possível” e libera nova tentativa. Cada repetição cria outro débito e outra `WithdrawalRequest`; não existe chave de idempotência nem reconciliação automática pela lista de solicitações. Havendo saldo para duas parcelas iguais, as duas passam.

**O que custa AO MOTOBOY:** ao seguir a instrução natural de tentar novamente, ele pode bloquear o dobro do saldo e gerar dois pagamentos para análise. Isso afeta diretamente o dinheiro dele e exige intervenção administrativa para descobrir qual solicitação era a pretendida.

**Como confirmei:** o cliente não envia identificador da tentativa lógica. No serviço, cada chamada serializável recalcula o saldo, cria `WalletTransaction(DEBIT_WITHDRAWAL)`, cria `WithdrawalRequest` e decrementa o cache; a única proteção é o saldo restante, que não impede duplicação quando o valor pedido é menor ou igual à metade do disponível.

### [Média] Coleta, entrega e retorno não reconciliam uma transição de estado ambígua

**Onde:** `apps/driver-app/src/screens/DeliveryOperationScreen.tsx:155`, `apps/driver-app/src/screens/DeliveryOperationScreen.tsx:249`, `apps/driver-app/src/screens/DeliveryOperationScreen.tsx:256`, `packages/api-client/src/deliveries.ts:195`, `apps/api/src/deliveries/deliveries.service.ts:996`, `apps/api/src/deliveries/deliveries.service.ts:1013`

**O que acontece:** as transições operacionais também são chamadas únicas, sem timeout controlado, outbox ou identidade da ação. Depois de qualquer erro, a tela tenta recarregar o pedido; se a rede continua ruim, `loadDelivery` mostra outro erro e volta para a tela anterior. Um toque duplo muito rápido ainda pode entrar duas vezes antes de o estado React `operation` renderizar como ocupado. No caso da coleta, o servidor lê o estado antes da transação e atualiza cada item por `id`, sem condição `status = ACCEPTED`, permitindo que duas requisições concorrentes gravem dois históricos `ACCEPTED -> COLLECTED`.

**O que custa AO MOTOBOY:** em um ponto sem sinal ele não sabe se ainda precisa coletar/entregar ou se a ação já foi aplicada, e pode ser expulso da tela usada para trabalhar. Em toque duplo, o histórico pode ficar contraditório e exigir conferência do administrador.

**Como confirmei:** não há `AbortController`, retry persistido ou consulta por resultado da tentativa nos métodos `collect`, `deliver`, `fail` e `completeReturn`. O bloqueio é apenas estado de componente. No backend, a coleta valida os irmãos antes de abrir a transação e depois usa `tx.delivery.update({ where: { id } })`, ao contrário dos aceites condicionais por estado.

### [Média] Rede ruim com lote acumula até minutos de trabalho de GPS por posição

**Onde:** `apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/DeliveryLocationTrackingService.kt:100`, `apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/DeliveryLocationTrackingService.kt:107`, `apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/DeliveryLocationTrackingService.kt:121`, `apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/DeliveryLocationTrackingService.kt:156`, `apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/DeliveryLocationTrackingService.kt:238`, `packages/validation/src/deliveries/create-delivery.schema.ts:69`

**O que acontece:** cada fix agenda uma tarefa em um executor de uma thread; a tarefa envia primeiro o heartbeat e depois uma requisição sequencial para cada entrega ativa. Cada chamada pode esperar 15 segundos, e o contrato aceita lotes de até 50 pedidos. Sem internet, um único fix de lote máximo pode ocupar aproximadamente 12 minutos e 45 segundos, enquanto novos fixes entram a cada 20 segundos. Não há coalescência para manter só a posição mais recente nem persistência explícita dos pontos pendentes.

**O que custa AO MOTOBOY:** a fila em memória continua acordando rádio/GPS, aumenta consumo, atrasa a recuperação quando a rede volta e deixa buracos no trajeto se o processo morrer. Em vez de retomar com a posição atual, o serviço pode passar tempo processando leituras antigas.

**Como confirmei:** somei o heartbeat e até 50 envios de entrega pelo mesmo `NETWORK_TIMEOUT_MS = 15_000` dentro do `newSingleThreadExecutor`, contra o intervalo ativo de 20 segundos. O `catch` apenas registra a falha e descarta aquele envio; não há banco, arquivo, limite ou substituição do trabalho já enfileirado.

### [Média] Ações irreversíveis avançam no primeiro toque em dois botões diferentes

**Onde:** `apps/driver-app/src/screens/DeliveryOperationScreen.tsx:328`, `apps/driver-app/src/screens/DeliveryOperationScreen.tsx:388`, `apps/driver-app/src/screens/DeliveryOperationScreen.tsx:519`

**O que acontece:** somente a entrega cujo destino será definido pelo GPS abre confirmação. “Pedido coletado”, entrega com endereço conhecido e conclusão de retorno executam imediatamente; a mesma ação principal aparece no corpo e no rodapé. A entrega conhecida possui checagem de proximidade no servidor, mas a coleta — que altera o lote inteiro e encerra a opção de devolver à fila — não possui confirmação nem prova de proximidade.

**O que custa AO MOTOBOY:** um toque com luva, tela molhada ou telefone em movimento pode declarar que toda a mercadoria foi coletada antes da hora. A correção deixa de estar nas mãos dele e passa a depender do administrador, enquanto a loja enxerga um estado operacional falso.

**Como confirmei:** `handlePrimaryAction` abre modal apenas quando `action === 'deliver' && !destinationKnownAtCreation`; nos demais estados chama `runOperation` diretamente. Os caminhos de insucesso e devolução à fila, em contraste, possuem modal, motivo e validação antes de enviar.

### [Média] O cronômetro React Native fica incorreto após suspensão do JavaScript

**Onde:** `apps/driver-app/src/screens/IncomingOfferScreen.tsx:89`, `apps/driver-app/src/screens/IncomingOfferScreen.tsx:98`, `apps/driver-app/src/screens/HomeScreen.tsx:444`, `apps/driver-app/src/screens/HomeScreen.tsx:487`

**O que acontece:** a tela React Native inicializa a contagem com `expiresInSeconds` e subtrai um por execução de `setInterval`, em vez de guardar um prazo absoluto. Quando o Android suspende o JavaScript, os segundos não necessariamente executam um a um. Ao voltar, a Home se recusa a consultar a oferta pendente se ainda existe um `incomingOffer`, então não corrige o prazo nem descobre que a oferta já sumiu.

**O que custa AO MOTOBOY:** ele pode voltar ao app e ver tempo restante que não existe, tocar em aceitar e receber conflito, ou manter um cartão expirado sobre a operação. É uma quebra comum de segundo plano, embora a Activity nativa use prazo absoluto corretamente.

**Como confirmei:** o efeito depende apenas do contador relativo e encerra a oferta quando o estado local chega a zero. O listener de `AppState` chama `mostrarOfertaPendente`, mas essa função retorna antes da API quando o store já contém uma oferta. O Android nativo, em comparação, calcula `expiresAtEpochMs - System.currentTimeMillis()`.

### [Baixa] Os 58 testes verdes não exercitam os caminhos que mais custam em campo

**Onde:** `apps/driver-app/__tests__/App.test.tsx:9`, `apps/driver-app/__tests__/push.test.ts:31`, `apps/driver-app/__tests__/deliveryOperation.test.ts:25`, `apps/driver-app/__tests__/withdrawal.test.ts:1`, `apps/driver-app/android/app/src/main/java/com/motoboycity/driverapp/`

**O que acontece:** a suíte cobre formatação, parsing de valor/data, componente compacto, bridge de push mockado e um smoke render do `App`. Ela não monta Home, oferta ou operação para testar chamadas reais e não possui teste Kotlin para receiver, Activity, deduplicação, timeout, token nativo ou serviço de localização.

**O que custa AO MOTOBOY:** regressões em aceite com resposta perdida, oferta concorrente, dupla transição e tracking em rede ruim podem passar pelo CI e aparecer somente durante uma corrida. A gravidade é baixa porque é lacuna de proteção, não falha executada por si só.

**Como confirmei:** executei as oito suítes e li os 58 casos. `App.test` apenas renderiza, `deliveryOperation.test` valida helpers puros e `withdrawal.test` valida dia/formato; nenhum caso injeta perda de resposta depois do commit, concorrência, mudança de `AppState`, expiração de JWT ou lifecycle Android.

## Validações executadas

- `pnpm --filter @motoboycity/driver-app run typecheck` — passou.
- `pnpm --filter @motoboycity/driver-app run lint` — passou.
- `pnpm --filter @motoboycity/driver-app exec jest --runInBand` — 8 suítes e 58 testes passaram.
- Build Android não foi executado, conforme o escopo da auditoria.

Os resultados verdes não invalidam os achados: a cobertura atual não simula commit seguido de resposta perdida, duas ofertas simultâneas, rede/GPS indisponível, toque concorrente, processo Android ou repetição de saque.

## O que eu olhei e estava certo

- O aceite no backend protege a corrida real: oferta e pedido mudam de estado na mesma transação, com `updateMany` condicional. Dois motoboys não conseguem assumir o mesmo pedido pelo caminho normal.
- O `OfferAlarm` configura atributos antes de `setDataSource`, usa foco transitório e para em `onDestroy`; os caminhos de resposta, expiração e resolução encerram a Activity. Não encontrei um caminho confirmado de alarme infinito.
- `CATEGORY_CALL`, `USE_FULL_SCREEN_INTENT`, a ausência de `SYSTEM_ALERT_WINDOW` e o acesso manual do Android 14/MIUI estão coerentes com a decisão já validada em aparelho. Não foram tratados como defeito.
- O cartão Android usa prazo absoluto, busca endereços e valores da API autenticada e recebe pelo FCM somente IDs e texto mínimo. Push atrasado da mesma oferta possui janela de deduplicação.
- Token expirado no aceite nativo é distinguido de falha de rede e gera instrução para entrar novamente. O problema encontrado está na limpeza/reconciliação da sessão, não em uma aceitação silenciosa sem credencial.
- A sessão nativa fica em `SharedPreferences` privado, `allowBackup` está desativado, receiver e services são `exported=false`, cleartext só é permitido em desenvolvimento e não encontrei `console.log` nem logs verbosos com token, endereço ou payload.
- O tracking é um foreground service, usa `START_REDELIVER_INTENT` para recriação do serviço e para de verdade no logout, ao ficar indisponível, em bloqueio de conta e ao encerrar as entregas. Não há receiver de boot; depois de reiniciar o aparelho, o TTL leva o servidor a indisponível em vez de continuar rastreando escondido.
- Negar localização em segundo plano impede ficar online e o fluxo tenta reverter a disponibilidade. As oito permissões do Manifest têm consumidor identificado; nenhuma permissão de overlay foi adicionada.
- `capturePresenceLocation` tolerante e `captureCurrentLocation` estrita estão coerentes com os dois usos. Entrega conhecida valida proximidade e precisão no servidor; entrega por GPS usa o fix atual para distância e preço.
- Oferta React Native e Activity nativa têm botões de 76–84 dp; as ações principais de operação usam 58–64 dp; menu e toggle também têm alvos amplos. Não encontrei o problema generalizado de botões minúsculos no caminho crítico.
- Insucesso e devolução à fila pedem confirmação e motivo. Os dados de destinatário completos aparecem somente depois do aceite e as rotas da API verificam que o pedido pertence ao motoboy autenticado.
- As telas de carteira, histórico, perfil, cadastro, pedidos livres e detalhe diferenciam carregamento, erro e vazio e oferecem nova tentativa. A falha operacional ficou concentrada nos caminhos citados acima.
- A decisão de usar somente Android hoje foi respeitada; `followsUserLocation` não foi sugerido para Android e nenhum problema de layout iOS foi incluído.

## Onde começariam os testes

1. **Oferta concorrente para o mesmo motoboy:** despachar dois pedidos ao mesmo tempo e provar que ambos ficam apresentáveis/respondíveis, ou que a API mantém somente um pendente por entregador. Cobrir Socket, `pending` e substituição do ID `1001`.
2. **Aceite com commit e resposta perdida:** confirmar a transação, cortar a resposta e repetir nos quatro caminhos (Socket, duas vitrines e Android), esperando reconciliação para a mesma corrida e início do tracking uma única vez.
3. **Bootstrap offline com sessão nativa ativa:** simular falha de rede em `/auth/me` e verificar que JS, FCM, presença, tracking e `OfferSessionStore` não entram em estados contraditórios.
4. **Tracking sem GPS e lote sob rede caída:** negar callbacks do `GPS_PROVIDER`, usar fallback de presença e depois executar um lote grande com timeouts, verificando estado visível, coalescência e consumo de trabalho.
5. **Saque idempotente:** confirmar o débito, perder a resposta e repetir a mesma tentativa lógica, esperando uma única transação e uma única solicitação.
6. **Transição operacional concorrente:** disparar coleta e entrega duas vezes antes da primeira resposta e garantir um único histórico por mudança de estado, inclusive com a resposta perdida.
