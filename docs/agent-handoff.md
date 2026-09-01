# Handoff de engenharia — MOTOboyCity

> **O que está valendo agora.** Este arquivo é reescrito quando o estado muda —
> ele não acumula histórico e não deve passar de algumas centenas de linhas.
>
> - histórico de cada recorte → `changelog.md` (append-only)
> - como o sistema é organizado → `architecture.md`
> - decisões de negócio confirmadas → `business-rules.md`
> - fluxo de trabalho e armadilhas → `ai-agent-guide.md`
>
> Última revisão: **2026-09-01**, depois de gerar e verificar o release
> `pilot.19` com a recuperação silenciosa da fila local de finalizações.

## Como atualizar

Depois de cada recorte funcional, de contrato, de infraestrutura ou de
validação:

1. **acrescente uma entrada em `changelog.md`** com decisão, motivo, arquivos,
   comandos executados e resultado honesto;
2. **atualize aqui** apenas o que deixou de ser verdade;
3. **atualize `architecture.md`** se a organização do sistema mudou.

Não marque item como concluído sem evidência de código e teste. Não registre
secrets nem conteúdo de `.env` em nenhum dos três.

## O que está em produção

| | |
|---|---|
| Commit publicado | `main` publicado em 01/09/2026 até o recorte do `pilot.19`; o APK continua com distribuição manual |
| API | Render, deploy automático no push, `prisma migrate deploy` no build |
| Painéis | Vercel, mesmo monorepo, deploy no push |
| Banco | PostgreSQL gerenciado; 51 migrations no repositório, aplicadas pelo Render no build |
| APK nos aparelhos | **`pilot.16`** distribuído em 31/08/2026. Quem ainda não abriu o app pode estar no `pilot.15`: confirme por motoboy no painel, não nesta linha (veja abaixo) |

**Não confie nesta tabela para saber a versão do aplicativo.** Esta linha é
escrita à mão e já esteve errada: dizia `pilot.12` enquanto os aparelhos rodavam
`pilot.15`. A fonte confiável é o próprio aparelho — ele manda a versão em todo
heartbeat, a API grava em `Driver.appVersion`, e o painel mostra em **Home →
Fila de despacho → clique no motoboy**, na linha `App <versão>`. Só aparece para
quem está online.

**Atenção ao publicar:** o Render publica no push, **sem esperar o CI**. As duas
coisas correm em paralelo.

**Job novo na fila de despacho:** `dispatch-sweep-every-minute`, registrado com
`upsertJobScheduler` no boot. Ele reativa agendado vencido, reagenda job perdido e
varre a fila. Não duplica entre reinícios nem entre instâncias; se sumir do Redis,
volta no próximo boot da API.

### APK pronto para distribuição

`I:\MOTOboyCity\releases\motoboycity-0.1.0-pilot.19-vc19.apk`
SHA-256 `A11B46BEF80FA4D4003FE748F5A7F753C0265CA7D19E779A3F37199D63EB80B7`,
75.163.801 bytes, `versionCode` 19, minSdk 24, targetSdk 36, assinatura v2 /
RSA 4096, certificado oficial
`BD42D61D35819B86CB9D1FF784D3E64340C0CE153E21B0332AE97B4CF51D50B9` — o mesmo dos
anteriores, então ele atualiza por cima de `pilot.16`, `pilot.17` ou `pilot.18`.

O bundle carrega `motoboycity-api.onrender.com` e **não** carrega
URL HTTP/HTTPS/WebSocket em `localhost`, `127.0.0.1` ou `10.0.2.2`. As correções
foram conferidas por texto dentro do bundle, e não só pelo commit.

O `pilot.19` mantém a carteira e a solicitação de saque obedecendo ao dia financeiro
escolhido pelo ADM, recebido da API, em vez de fixarem segunda-feira no aparelho.
No servidor, esse mesmo dia agora libera os repasses às 00:00; `null` significa
liberação diária às 00:00. O servidor continua sendo a autoridade da regra.
Também liga o toque insistente e a vibração quando a oferta abre dentro da tela
React Native, com o aplicativo em primeiro plano. Ele reutiliza o `OfferAlarm`
nativo, para ao responder, expirar, trocar de oferta ou desmontar a tela e
identifica a oferta para uma resolução atrasada não silenciar a próxima.

O `pilot.19` também autorrepara a fila local quando
existe uma finalização `DELIVER`, mas a API confirma que o pedido ainda está em
`ACCEPTED`. A tentativa incompatível e qualquer retorno que dependia dela saem
silenciosamente, sem contar como entrega ou bloquear **Pedido coletado**. Toda
mutação confere também a geração (`queuedAt`), para uma sincronização antiga
não tocar numa tentativa nova com o mesmo ID. Finalizações válidas em
`COLLECTED` continuam preservadas.

O APK foi compilado e verificado, mas ainda não foi instalado nem distribuído.
Por isso a tabela acima continua registrando `pilot.16` nos aparelhos. O toque e
a vibração em primeiro plano ainda exigem um teste com oferta real no aparelho.

A reconciliação dos repasses pendentes é processada em transações de até 25
lançamentos. Isso preserva a atualização condicional por status e impede que o
acúmulo de saldo bloqueado estoure o prazo do Prisma/Neon e deixe créditos
vencidos em `PENDING`.

Os `pilot.13` e `pilot.14` foram compilados, verificados e **descartados** sem
chegar a nenhum aparelho.

## Fluxos implementados

Autenticação e os três perfis; aprovação de empresas e entregadores; regiões,
modalidades e tabelas de preço; criação de pedido individual e em lote, imediato
ou agendado; despacho por fila com oferta, aceite, recusa, expiração e reoferta
manual; ciclo completo de coleta, entrega, insucesso e retorno, com destino
conhecido ou definido na entrega; punição automática por recusa; carteira,
repasse semanal, saque e faturamento; rastreamento público por link; integração
aiqfome (importação e ciclo logístico); central de avisos nos dois painéis.

O perfil da empresa permite que qualquer membro ativo altere a própria senha
confirmando a credencial atual. O
sucesso revoga tokens e sockets antigos, limpa a sessão do painel e exige novo
login; nenhuma migration foi necessária.

O mapa da central operacional mantém o zoom e o arraste da empresa durante
atualizações de GPS. O enquadramento automático continua na abertura e quando a
composição da operação ou um endereço realmente muda. Nos mapas do ADM e da
empresa, cada pedido e motoboy conserva a mesma instância de marcador; eventos
realtime apenas atualizam posição e aparência, sem apagar e recriar todos os
ícones nem repetir o carregamento do retrato.

A agenda da empresa possui um Top 10 real por entregas concluídas. Os três
primeiros aparecem em um pódio e os demais continuam numa lista; a consulta
agregada é isolada pela empresa e não exigiu migration.

O faturamento publicado possui cobrança Pix Asaas: a empresa gera e copia o QR
Code no detalhe da fatura, enquanto a API reutiliza o cliente, reconcilia timeout
pela referência externa e só dá baixa por `PAYMENT_RECEIVED` autenticado e
validado. A homologação Sandbox concluiu QR, pagamento simulado, webhook HTTP
`200` e baixa automática. A migration
`20260831155700_asaas_environment_isolation` classifica esses IDs como Sandbox
e separa customer, cobrança, QR e evento do futuro ambiente real. A habilitação
da Produção ainda depende da chave `$aact_prod_`, webhook próprio, troca conjunta
das três variáveis `ASAAS_*` e smoke real controlado conforme
`docs/asaas-pix.md`; os segredos não são verificáveis pelo repositório.

O sino do admin cobra dois silêncios. O de **repasse vencido e não liberado**
(`admin:repasses:overdue`): crédito de motoboy que já deveria estar disponível e
continua `PENDING` há mais de 6 h vira alerta, e 2 dias vira crítico — a régua é
o resultado, não o erro, então ele pega também o caso de o job parar de rodar. E
o **silêncio do backup**: o workflow avisa a API em
`POST /ops/check-in/backup-banco` depois de subir o arquivo, e a ausência desse
aviso vira alerta em 36 h e crítico em 7 dias. Depende de dois segredos no
GitHub (`API_URL`, `JOB_CHECK_IN_TOKEN`) e da mesma variável no ambiente da API
— sem eles o sino diz, corretamente, que o backup nunca confirmou.

Chamar entregador abre o mesmo **acompanhamento com radar** nos três pontos de
criação (atalho da barra, formulário da central e lançamento pela
administração). O radar recebe `delivery:updated` por Socket.IO, reconcilia ao
conectar e usa consulta de 30 s somente como segurança enquanto ainda houver
pedido procurando entregador; depois do aceite ou cancelamento, o polling para.
Eventos em rajada de um lote são coalescidos em uma única consulta.

E a loja passa a ver que o atendimento está fechado antes de
digitar o pedido: `GET /company/business-hours` responde com a mesma regra que
bloqueia a criação, pela região **da empresa**.

Também está publicado o bloqueio seletivo motoboy × empresa pelo detalhe do
entregador no ADM (commit `8c3edfd`). O vínculo é persistente e auditado; filtra
despacho automático, reoferta, vitrine, aceite e reatribuição, solta oferta
pendente da empresa escolhida e preserva entregas já em andamento. A migration
aditiva é `20260829120000_driver_company_blocks`.

O `README.md` descreve uma "Fase 0" que não corresponde à implementação. **Não
use o README como fonte de verdade.**

A API possui um baseline local de performance sem dependência externa. Cada
resposta recebe `X-Request-Id`; requests lentos/5xx continuam em log sem dados
pessoais e snapshots por instância registram média, p50, p95 e p99 por handler.
`GET /health` continua sendo liveness; `GET /health/ready` confere PostgreSQL e
Redis sem expor a causa interna. O Render **ainda não foi apontado** para a nova
readiness. Esta etapa não instrumenta celular, Socket ou T0–T17 completos; o
procedimento e os limites estão em `docs/performance-baseline.md`.

## Configuração que precisa estar preenchida

Sem estes valores a operação não roda, e a falha aparece longe da causa:

- **tempo de resposta da oferta** — nulo congela o despacho inteiro;
- **comissão do entregador** — nulo impede precificar;
- **tabela de preço ativa** por região e modalidade, com `returnFee` onde houver
  retorno;
- **coordenadas do endereço principal** de cada empresa — sem elas, coleta e
  retorno passam sem validação de proximidade e o painel é avisado;
- **modalidade atribuída** a cada motoboy — sem ela ele nunca recebe oferta, em
  silêncio.

Ver `architecture.md` §8 para o que pode e o que não pode ser desligado.

## Limitações e próximos passos

### Pendente de ação humana

1. **Instalar e testar o `pilot.19` em aparelho real.** Além de conferir que a
   tela e o botão de saque obedecem ao dia escolhido no ADM, permanecem os dois
   cenários ainda não exercitados: **negar "Permitir o tempo todo"** num
   Android 11+ e num Android 10, conferindo que o alerta oferece "Abrir ajustes"
   e que o atalho abre a tela certa; e **matar a rede no meio de uma
   finalização**, conferindo que a espera termina em 15 s com mensagem em vez de
   ficar girando. Confirmar também que uma oferta recebida com o aplicativo
   aberto toca e vibra até ser respondida ou expirar e que o fluxo normal
   **aceitar → coletar → entregar** não mostra o aviso antigo do pedido #547.
2. **Smoke autenticado do OAuth aiqfome** — falta confirmar que o provedor
   devolve `state` junto com o `code`. A proteção não deve ser removida se ele
   omitir.
3. **Rotação dos segredos** registrada no changelog da integração aiqfome.
4. **Cópia do keystore fora desta máquina.** É o único risco irreversível do
   projeto: existem duas cópias (`I:\MOTOboyCity\signing\` e
   `D:\MOTOboyCity-Backup\signing\`), mas as duas no mesmo computador. Um
   incêndio, um furto ou um ransomware levam as duas — e sem o keystore o
   aplicativo instalado **nunca mais recebe atualização**, porque o Android
   recusa APK assinado por outra chave. Se for para a nuvem, tem que ir
   criptografado. Tudo o mais neste documento tem conserto; isto não tem.

### Dívida técnica priorizada

1. **Criação sem os fallbacks da conclusão**: responde "tente novamente em
   instantes" mesmo quando o endereço é irroteável. Não trava ninguém — a empresa
   vê o erro na hora.
2. **`deliveries.service.ts` com ~3.400 linhas** — candidato a fatiamento por
   ciclo de vida, sem mudar comportamento.
3. **Lacunas que a auditoria do aplicativo deixou abertas**:
   `getActiveDeliveries` custa 8+ requisições por evento; token em AsyncStorage
   sem criptografia, com `allowBackup="false"` como única barreira; e
   `HomeScreen` e `DeliveryOperationScreen` (~3.000 linhas somadas) seguem sem
   teste nenhum.
4. **Lacunas que a auditoria de concorrência deixou abertas**: webhook aiqfome
   entregue duas vezes (a idempotência tem só teste unitário), dois admins na
   mesma intervenção, e o resgate de `PROCESSING` travado do outbound — que
   existe e funciona, mas nunca foi exercitado em teste.
5. **`reassignDriver` não confere punição.** Defensável como intervenção
   deliberada do admin, mas não está escrito em lugar nenhum — decidir e
   registrar.
6. **Presença multi-sessão (P1-04)** e **cobertura E2E do bloqueio/suspensão**
   continuam pendentes.
7. **iOS nunca compilado.** Todo o aplicativo foi validado só em Android.
8. **O CI não roda suíte de front-end nenhuma.** O `ci.yml` cobre API,
   driver-app e E2E; os testes do `company-web` (vitest) e do `admin-web`
   (`node --test`) só rodam na mão. Escrever teste de painel hoje é escrever
   algo que nenhum PR vai executar — são duas linhas no workflow para mudar
   isso.

## Ambiente de desenvolvimento

### Bancos

| Banco | Uso |
|---|---|
| `motoboycity_dev` (docker-compose, porta 5434) | desenvolvimento |
| `motoboycity_e2e_local` (mesmo container) | E2E isolado |
| Neon | staging, `NEON_DATABASE_URL_FUTURE` comentado no `.env` |

### Comandos

```sh
pnpm typecheck
pnpm lint
pnpm --filter @motoboycity/api exec jest --runInBand
pnpm --filter @motoboycity/driver-app exec jest --runInBand
pnpm --filter @motoboycity/company-web test
```

Cobertura atual: **84 suítes / 1045** testes unitários da API, **25 / 155** do
Driver App, **24 arquivos / 99** da Company Web, **25 / 247** E2E.

### E2E

Exige PostgreSQL e Redis isolados **e** `THROTTLE_LIMIT=100000` — sem ele a suíte
inteira sai de um IP só, estoura o limite de 30/min e o 429 aparece como falha
num teste qualquer, longe da causa.

`delivery-lifecycle` depende do estado do banco: se um run anterior abortou,
apague `platform_settings` antes de repetir.

**O banco de E2E pode ficar para trás de uma migration.** Já aconteceu: um
recorte publicado em paralelo criou `driver_company_blocks`, o
`motoboycity_e2e_local` não acompanhou, e a suíte passou a dar 500 em toda
criação de pedido — sintoma longe da causa. Antes de investigar uma quebra
estranha, confira se a tabela nova existe lá. O CLI do Prisma ignora
`DATABASE_URL` da linha de comando, então aplique com
`prisma db execute --url` e registre a linha em `_prisma_migrations`.

### Armadilhas do ambiente

**O CLI do Prisma ignora `DATABASE_URL` da linha de comando** — ele lê
`apps/api/.env` e esse valor vence. Para mirar outro banco use `--url` /
`--shadow-database-url`. O Jest/Nest respeita o override.

**`prisma migrate dev` está travado**: a migration
`20260824105857_aviso_de_pagamento_da_loja` foi editada depois de aplicada, e o
Prisma exige `migrate reset` — que apagaria o banco. **Nunca aceite esse reset.**
Gere a migration com `prisma migrate diff` contra um PostgreSQL temporário e
aplique com `migrate deploy`, que não confere checksum.

**JDK**: o build usa o `JAVA_HOME`, hoje em `C:\Program Files\java\jdk-21.0.5`. O
AGP não suporta JDK 24+.

### Compilar o APK

1. o build **não roda** na pasta do projeto — o `ninja` falha com "Filename
   longer than 260 characters". Use worktree curta: `git worktree add C:\mNN`;
2. copie `android/app/google-services.json` e `android/local.properties`, que o
   Git não leva;
3. `pnpm install` e `pnpm --filter @motoboycity/validation build` — sem o
   `dist/`, o bundle JS falha;
4. `assembleRelease` com `-Pmotoboycity.versionCode=NN`,
   `MOTOBOYCITY_APP_ENV=production` e
   `MOTOBOYCITY_API_URL=https://motoboycity-api.onrender.com`;
5. verifique com `apksigner` e `aapt`, e confirme que o bundle **não** contém
   `localhost:3333`, `127.0.0.1` nem `10.0.2.2`;
6. `git worktree remove` também falha por caminho longo — use `rmdir /s /q`.

Keystore oficial em `I:\MOTOboyCity\signing\motoboycity-release.jks`, alias
`motoboycity`, com cópia em `D:\MOTOboyCity-Backup\signing\`. As senhas são
lidas apenas de arquivos DPAPI criados pelo responsável em `%TEMP%`, usadas no
processo e **nunca exibidas** nem versionadas. Os valores em memória e as
variáveis do processo são limpos ao final do build.

## Estado do worktree

Limpo depois dos commits do `pilot.19`. Podem existir arquivos locais não
rastreados (`.codex/`, `temp*.tsx`) deixados por outras sessões — **não os
inclua em commit** e não os remova sem decisão do responsável. O repositório é
**público**: toda alteração exige varredura de segredo antes do push.
