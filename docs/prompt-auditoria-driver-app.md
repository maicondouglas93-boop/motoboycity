# Prompt — auditoria do aplicativo do motoboy (`apps/driver-app`)

Documento para colar em outro agente. Ele não precisa de contexto além daqui.

---

## O que é para fazer

Auditar `apps/driver-app` e entregar um **relatório de achados**, não um
conjunto de correções. Não altere código nesta rodada.

São **12 telas, ~8 mil linhas de TypeScript e 13 arquivos Kotlin**. React Native
0.86.2, CLI bare (não Expo), pacote `com.motoboycity.driverapp`.

---

## Por que este é o mais difícil dos três

O admin e a loja rodam num navegador, numa mesa, com Wi-Fi. Este roda **numa
moto**, e nada disso vale:

- **A rede cai.** Túnel, sombra de morro, plano acabando. A pergunta não é se
  vai cair, é o que acontece quando cair no meio de uma ação.
- **A bateria acaba.** Um erro de consumo aqui não é lentidão, é o motoboy sem
  telefone às quatro da tarde.
- **O Android mata o aplicativo.** Fabricantes brasileiros — Xiaomi, Samsung,
  Motorola — encerram processo em segundo plano de forma agressiva, e cada um do
  seu jeito.
- **O motoboy não pode ler a tela.** Ele está dirigindo, de capacete, com sol
  batendo. Toque errado custa uma corrida.
- **Ele não pede suporte, ele desinstala.** Não existe canal de reclamação; o
  sintoma é ele parar de aceitar oferta.

**Pese a gravidade por isso.** Um erro que no painel geraria uma dúvida, aqui
custa uma entrega, uma corrida perdida, ou o motoboy achando que o aplicativo
está quebrado.

---

## O produto, em três frases

MOTOboyCity é uma plataforma B2B de motoboys em Lajinha, Minas Gerais. Lojas
lançam pedidos, o despacho oferece a um motoboy por vez, ele aceita, coleta e
entrega. Este aplicativo é o lado dele: ficar online, receber oferta, executar a
entrega e ver a carteira.

---

## O que JÁ é conhecido — não gaste a auditoria nisso

Estas decisões foram tomadas com motivo, verificadas em aparelho real, e estão
comentadas no código. **Reportá-las como defeito é ruído.**

| Assunto | Situação |
| --- | --- |
| `CATEGORY_CALL` no `OfferActivity` | Correto. Android 14+ só deixa categoria de chamada ou alarme tomar a tela. `CATEGORY_EVENT` já foi tentado e quebrou. |
| Atributos de áudio antes de `setDataSource` no `OfferAlarm` | Correto e obrigatório. Invertido, o player recebe `USAGE_UNKNOWN` e toca no volume de mídia. |
| `SYSTEM_ALERT_WINDOW` não declarada | A MIUI exige que o USUÁRIO conceda. É configuração de segurança do aparelho, não do código. |
| JDK 21 fixado | JDK 24+ quebra o AGP: a JVM imprime aviso no stderr e o AGP trata como erro. Está em `~/.gradle/gradle.properties`, fora do projeto. |
| Chave de assinatura de release | **Já corrigida.** O `build.gradle` exige as variáveis de ambiente e falha o build se faltarem, em vez de cair na chave de debug. |
| `capturePresenceLocation` tolerante vs. `captureCurrentLocation` estrita | De propósito. Ficar online aceita posição imprecisa; prova de entrega, não. |
| `followsUserLocation` no mapa | É só iOS. No Android não faz nada — não "conserte" adicionando. |

---

## Hipóteses para testar

Não são conclusões. Confirme cada uma no código antes de reportar.

### Rede — o mais provável e o menos olhado

Uma varredura por `retry`, `queue`, `offline` e `fila` em `src/lib` **não
encontrou nada**. Isso sugere que toda chamada é uma tentativa só.

- **O que acontece se a rede cair entre aceitar a oferta e o servidor
  responder?** O motoboy vê erro e a corrida foi aceita mesmo assim? Ou ele
  acha que aceitou e não aceitou? Este é o cenário mais caro do aplicativo.
- **Marcar coleta ou entrega sem sinal.** A ação se perde? Dá para repetir sem
  duplicar? Há indicação de que não foi enviada?
- **Toque duplo por impaciência.** Rede lenta e o motoboy toca de novo: aceita
  duas vezes, marca entrega duas vezes?
- **A tela distingue "carregando" de "sem internet"?**

### Bateria e segundo plano

`DeliveryLocationTrackingService.kt` envia posição a cada **20 s com entrega
ativa** e **60 s ocioso**.

- Esse intervalo cai quando a tela apaga? Quanto custa numa jornada de 8 horas?
- O serviço em primeiro plano sobrevive ao Android matar o aplicativo? E ao
  aparelho reiniciar?
- Quando o motoboy fica offline, o rastreamento **para de verdade**? Continuar
  enviando posição de quem saiu do turno é problema de privacidade, não só de
  bateria.
- As 8 permissões declaradas são todas usadas? `ACCESS_BACKGROUND_LOCATION` é
  das mais recusadas pelo usuário e das mais escrutinadas pela Play Store — o
  aplicativo funciona se ele negar?

### A oferta — o caminho crítico

`OfferActivity`, `OfferAlarm`, `OfferActionReceiver`, `OfferMessagingService`,
`OfferSessionStore`. É onde o dinheiro entra.

- **Duas ofertas ao mesmo tempo.** O que a tela mostra? O alarme para?
- **A oferta expira enquanto ele olha.** Ele descobre, ou toca em aceitar e
  recebe erro?
- **Aceitar direto da notificação** (`OfferActionReceiver`) com o aplicativo
  fechado: e se o token estiver expirado?
- **O alarme sempre para?** Um som que não cessa é o tipo de coisa que faz
  desinstalar. Procure caminhos de saída sem `stop`.

### Tela e execução

`DeliveryOperationScreen.tsx` tem **1104 linhas** e `HomeScreen.tsx` tem 847 —
são as duas telas onde ele passa o dia.

- Alvo de toque grande o bastante para dedo com luva, em movimento?
- Ações irreversíveis (marcar entregue, declarar insucesso) pedem confirmação?
- O que a tela mostra quando o GPS não pega — que é o normal dentro de prédio?
- Texto legível sob sol forte; contraste, não só tamanho.

### Segurança e dados

- Token guardado onde, e o que acontece quando expira no meio de uma entrega?
- Alguma coisa sensível vai para o log? `console.log` sobrevive em release?
- O aplicativo mostra dado do cliente que o motoboy não precisa ver?

---

## Testes

Este aplicativo **tem teste**, ao contrário dos dois painéis: 8 arquivos em
`__tests__/`, e `pnpm --filter @motoboycity/driver-app test` roda.

Então a pergunta aqui não é "adicionar testes", é:

- Os 8 cobrem o quê? Sobra alguma regra de dinheiro ou de estado sem cobertura?
- **Nada em Kotlin é testado.** Vale? O quê, se sim?
- Rode a suíte e diga se passa. Se não passar, isso é achado.

---

## O que NÃO é para reportar

- Qualquer item da tabela "já é conhecido".
- Preferência de estilo — o `eslint` já cuida.
- "Migrar para Expo", "trocar de biblioteca de mapa", "adotar arquitetura X".
- "Adicionar testes" genérico.
- Achado que você não confirmou lendo o código.
- Problema de layout do iOS: **só existe build de Android hoje**, e o aparelho
  de teste é Android.

---

## Formato do relatório

Grave em `docs/auditoria-driver-app.md`. Para cada achado:

```
### [Gravidade] Título curto do defeito

**Onde:** caminho/do/arquivo:linha

**O que acontece:** uma ou duas frases, concretas.

**O que custa AO MOTOBOY:** corrida perdida, bateria, entrega errada,
desinstalar. Se não conseguir escrever esta linha, o achado provavelmente não
vale reportar.

**Como confirmei:** o que você leu ou rodou.
```

Gravidade, pelo critério:

- **Alta** — perde corrida, perde dinheiro dele, deixa o aplicativo inutilizável
  em campo, ou vaza dado.
- **Média** — gasta bateria demais, confunde em situação comum, quebra sem sinal.
- **Baixa** — atrito e manutenção.

Ordene por gravidade. **Não infle a lista.**

No fim, uma seção **"O que eu olhei e estava certo"** com as hipóteses testadas
e descartadas.

---

## Ambiente

- `pnpm --filter @motoboycity/driver-app typecheck` e `lint` e `test` rodam.
- **Não tente compilar o Android** sem necessidade: o build exige JDK 21 e
  ferramentas nativas, e falhar nisso não é achado da auditoria.
- Há alterações não commitadas na árvore, de outro agente. Rode `git status` e
  não conte como defeito o que estiver visivelmente pela metade.
