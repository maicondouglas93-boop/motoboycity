# Runbook para colocar o MOTOboyCity no ar e executar um piloto de rua

> Atualizado em 2026-08-20. Este documento descreve o caminho operacional,
> técnico e de segurança para publicar um ambiente de piloto, cadastrar uma
> empresa, cadastrar um motoboy e provar uma entrega completa em aparelho real.
> `docs/business-rules.md` continua sendo a fonte das regras de negócio e
> `docs/agent-handoff.md` continua sendo a fonte do estado do código.

## Resposta curta: o que é possível hoje

Hoje é possível preparar um **piloto privado Android**, com uma empresa, um
motoboy e dados exclusivamente de teste. Não é seguro tratar o estado atual
como lançamento público em produção.

O piloto só deve começar depois de todos os portões P0 deste documento ficarem
verdes. No estado registrado em 2026-08-20 ainda existem bloqueios objetivos:

1. o último GitHub Actions está vermelho por uma chamada incorreta do Jest;
2. o driver-app aponta para `http://localhost:3333`;
3. o release Android ainda usa a chave de debug e a versão nativa diverge da
   versão JavaScript;
4. a API ainda não consome `REDIS_URL`, usuário, senha ou TLS, embora Redis
   gerenciado normalmente exija essas informações;
5. as migrations atuais não foram validadas em cópia restaurada do staging;
6. o endereço de coleta salvo pela tela da empresa não inclui coordenadas;
7. timeout de despacho e raio de retorno só podem ser configurados pela API;
8. não há push nativo; uma oferta não é garantida com o aplicativo suspenso;
9. Android/iOS, GPS em segundo plano e ciclo financeiro ainda não foram
   homologados em aparelhos e infraestrutura compartilhada reais.

Portanto, “colocar no ar hoje” significa neste runbook:

- ambiente de piloto separado de produção;
- apenas Android, instalado por APK assinado e distribuído diretamente aos
  participantes conhecidos;
- aplicativo aberto em primeiro plano enquanto aguarda a primeira oferta;
- nenhuma informação de cliente real e nenhum dinheiro real;
- uma única instância da API;
- operador acompanhando empresa, admin, logs, filas e banco durante todo o
  ensaio;
- possibilidade de interromper o teste imediatamente.

Publicação na Play Store, TestFlight/App Store, uso por clientes reais e escala
para várias instâncias são uma fase posterior.

## 1. Escolha o nível de lançamento antes de começar

### Nível A — piloto privado recomendado

Use este nível para provar o caminho dourado na rua:

1. empresa cria o pedido;
2. despacho automático envia a oferta;
3. motoboy aceita;
4. motoboy confirma coleta e entrega;
5. empresa e admin acompanham;
6. crédito financeiro aparece uma única vez;
7. cancelamentos e falhas controladas são ensaiados depois do primeiro sucesso.

Participantes: proprietário do produto, operador da empresa de teste,
administrador e um motoboy conhecido. Pode haver acúmulo de papéis, mas nunca a
pessoa pilotando a moto e operando o painel ao mesmo tempo.

### Nível B — lançamento público

Não tente fazer o Nível B no mesmo dia. Além de homologar todo o Nível A, ele
exige push em segundo plano, recuperação de senha, política de privacidade e
termos reais, disclosure de localização, monitoramento contínuo, plano de
incidente, publicação nas lojas, iOS validado, suporte ao usuário e operação de
backup/restore treinada.

O Google Play exige declaração, vídeo, disclosure destacado dentro do app e
política de privacidade para localização em segundo plano. Consulte a
[política oficial de localização em segundo plano](https://support.google.com/googleplay/android-developer/answer/9799150)
antes de qualquer envio à loja.

## 2. Monte a equipe e os recursos do piloto

Separe antes da janela:

- um computador para o admin e o painel da empresa;
- um Android físico com chip e dados móveis para o motoboy;
- carregador ou power bank;
- Android Studio, SDK, `adb`, JDK compatível e Node 22.18 ou superior;
- conta GitHub com acesso ao repositório e ao Actions;
- um domínio controlado por você;
- conta em um provedor de aplicação/banco/Redis;
- conta Google Cloud com faturamento ativo para Maps;
- cofre de senhas para JWT, banco, Redis, Google e assinatura Android;
- rota curta, conhecida, legal e segura;
- uma segunda pessoa monitorando o admin durante o deslocamento;
- ficha de teste com IDs, horários, resultado e evidências sem dados pessoais.

Nunca faça o piloto em movimento segurando o aparelho. Toda interação do
motoboy deve acontecer com a moto estacionada em local seguro.

## 3. Proteja pessoas e dados

O sistema trata nome, telefone, CPF, PIX e geolocalização. Para o piloto:

- use nome `TESTE INTERNO`, telefone dos próprios participantes e endereço de
  destino autorizado;
- não copie pedidos ou clientes de outro sistema;
- não use CPF, PIX ou telefone de terceiros;
- informe por escrito ao motoboy quando a localização começa, para qual
  finalidade é usada, quando para e por quanto tempo a trajetória da entrega é
  mantida;
- obtenha aceite do participante do piloto;
- mantenha o ambiente privado e as contas individualizadas;
- nunca coloque token, senha, chave PIX, telefone ou endereço completo em log,
  captura pública, issue ou mensagem de commit;
- registre responsável por acesso, incidente e exclusão dos dados de teste.

A ANPD disponibiliza um
[guia e checklist de segurança para agentes de pequeno porte](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte).
Use-o como ponto de partida e obtenha orientação jurídica para o lançamento
público. Este runbook não substitui assessoria jurídica.

## 4. Portões P0: não publique antes de corrigir

### P0.1 — deixar o CI verde

O run de 2026-08-20 falhou em `API unit tests`. A aplicação não falhou em um
teste de negócio: o comando do workflow executou `jest -- --runInBand`; o Jest
interpretou `--runInBand` como padrão de nome de teste e respondeu “No tests
found”. O [run com falha está no GitHub Actions](https://github.com/maicondouglas93-boop/motoboycity/actions/runs/32426789496).

Corrija os dois passos do workflow para uma forma sem ambiguidade, por exemplo:

```yaml
- name: API unit tests
  run: pnpm --filter @motoboycity/api exec jest --runInBand

- name: Driver app tests
  run: pnpm --filter @motoboycity/driver-app exec jest --runInBand
```

Depois rode localmente, com PostgreSQL e Redis isolados:

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm --filter @motoboycity/api exec jest --runInBand
pnpm --filter @motoboycity/driver-app exec jest --runInBand
pnpm --filter @motoboycity/api test:e2e
pnpm --filter @motoboycity/api run build
pnpm --filter @motoboycity/company-web run build
pnpm --filter @motoboycity/admin-web run build
```

Não rode E2E contra banco ou Redis compartilhados. Só avance quando o mesmo
commit passar localmente e no GitHub Actions.

### P0.2 — tornar a URL da API configurável no aplicativo

`apps/driver-app/src/lib/config.ts` contém `http://localhost:3333`. Isso só
funciona em desenvolvimento com `adb reverse`; na rua, o telefone tentaria
acessar a si mesmo.

Implemente uma configuração de build para, no mínimo:

- desenvolvimento local;
- piloto/staging;
- produção.

Regras obrigatórias:

- `pilot` deve apontar para `https://api-pilot.seudominio.com`;
- produção deve falhar no build se receber `localhost`, IP privado, URL vazia
  ou HTTP;
- a URL não é segredo, mas deve ser congelada no artefato;
- o APK precisa funcionar sem Metro, USB ou computador;
- o ambiente deve aparecer de forma discreta na tela de configurações ou
  diagnóstico.

#### Estado — implementado em 2026-08-21

As regras acima estão implementadas em `apps/driver-app/app.env.js`, que é
carregado por `babel.config.js` e `metro.config.js`. O ambiente vem de duas
variáveis:

| Variável              | Valores                                       |
| --------------------- | --------------------------------------------- |
| `MOTOBOYCITY_APP_ENV` | `development` (padrão), `pilot`, `production` |
| `MOTOBOYCITY_API_URL` | obrigatória em `pilot`/`production`           |

O valor resolvido é inlinado como literal por um plugin Babel local, então a
URL fica congelada no artefato e o APK dispensa Metro, USB e `adb reverse`.
Nenhuma dependência nova foi adicionada — em particular, `react-native-config`
continua fora, como já era a decisão registrada no código.

`pilot` e `production` exigem HTTPS e recusam `localhost`, IPs privados
(10/8, 172.16–31, 192.168/16, 127/8, 169.254/16) e hosts `.local`. A falha é
de **build**, com mensagem direta, por exemplo:

```
Error: MOTOBOYCITY_APP_ENV="production" exige HTTPS. Recebido: http://localhost:3333
```

Gerar o APK do piloto (POSIX):

```bash
MOTOBOYCITY_APP_ENV=pilot MOTOBOYCITY_API_URL=https://api-pilot.seudominio.com ./gradlew assembleRelease
```

No PowerShell, defina as duas variáveis com `$env:` antes de chamar o Gradle.

O ambiente, o servidor e a versão aparecem no bloco "Diagnóstico" da tela de
Ajustes, para o motoboy informar ao suporte.

**Pendente**: o domínio real do piloto ainda não foi decidido, por isso não
existe valor padrão para `pilot` — passar a variável é obrigatório, e um build
sem ela falha em vez de cair silenciosamente em localhost. Definir o domínio
continua sendo pré-requisito da seção 6.

### P0.3 — configurar versão e assinatura Android reais

Hoje existem três informações divergentes:

- pacote do driver-app: `0.0.1`;
- constante mostrada no app: `0.0.1`;
- Android: `versionName "1.0"` e `versionCode 1`.

Escolha uma versão de piloto e faça os metadados concordarem. Exemplo:

- versão visível: `0.1.0-pilot.1`;
- `versionCode`: inteiro crescente, nunca reutilizado;
- cada APK seguinte deve incrementar o código, inclusive um rollback.

Crie uma chave de assinatura própria fora do repositório, guarde cópia segura
e injete caminho e senhas apenas pelo ambiente/CI. O release não pode continuar
com `signingConfigs.debug`. Android exige que todo APK seja assinado e a chave
é necessária para futuras atualizações; siga a
[documentação oficial de assinatura](https://developer.android.com/studio/publish/app-signing).

#### Estado — encanamento pronto em 2026-08-21, chave ainda pendente

**Versão unificada.** As três informações agora vêm de uma fonte só: o
`version` do `package.json` do driver-app, hoje `0.1.0-pilot.1`. O bundle
JavaScript lê via `app.env.js` e o `versionName` do Android lê o mesmo arquivo
com `JsonSlurper`. Confirmado no Gradle: `versionName = 0.1.0-pilot.1`. Para
publicar uma versão nova, altere esse único campo.

**`versionCode` sempre explícito.** Não é derivado da versão — é um inteiro que
precisa crescer a cada APK e nunca ser reaproveitado, inclusive num rollback,
porque o Android recusa reinstalar um `versionCode` já usado. O padrão `1`
serve só para debug local; um release sem `MOTOBOYCITY_VERSION_CODE` falha.

**Assinatura.** `signingConfigs.debug` saiu do release. A configuração agora lê
quatro variáveis de ambiente e o build de release **falha** se qualquer uma
faltar, em vez de cair silenciosamente na chave de debug:

| Variável                        | Conteúdo                              |
| ------------------------------- | ------------------------------------- |
| `MOTOBOYCITY_KEYSTORE_FILE`     | caminho da chave, fora do repositório |
| `MOTOBOYCITY_KEYSTORE_PASSWORD` | senha do keystore                     |
| `MOTOBOYCITY_KEY_ALIAS`         | alias da chave                        |
| `MOTOBOYCITY_KEY_PASSWORD`      | senha da chave                        |
| `MOTOBOYCITY_VERSION_CODE`      | inteiro crescente                     |

As quatro travas foram verificadas com `--dry-run`, que monta o grafo de
tarefas sem compilar: sem variáveis, com caminho inexistente, sem
`versionCode`, e o caminho completo passando. Nenhuma trava dispara em build de
debug.

O `.gitignore` já cobre `*.jks` e `*.keystore` (exceto `debug.keystore`), então
uma chave largada por engano na pasta não é versionada.

**Pendente e fora do meu alcance**: gerar a chave. Ela deve ser criada por você
com `keytool`, guardada em cópia segura fora do repositório, e as senhas
mantidas no cofre — perder essa chave significa nunca mais conseguir atualizar
o app publicado. Gerar o APK do piloto:

```bash
MOTOBOYCITY_APP_ENV=pilot \
MOTOBOYCITY_API_URL=https://api-pilot.seudominio.com \
MOTOBOYCITY_KEYSTORE_FILE=/caminho/seguro/motoboycity-pilot.jks \
MOTOBOYCITY_KEYSTORE_PASSWORD=... \
MOTOBOYCITY_KEY_ALIAS=... \
MOTOBOYCITY_KEY_PASSWORD=... \
MOTOBOYCITY_VERSION_CODE=1 \
./gradlew assembleRelease
```

Prefira injetar as senhas por cofre/CI a digitá-las na linha de comando, para
não deixá-las no histórico do shell.

### P0.4 — aceitar uma conexão Redis de produção

`QueueModule` e `LiveDriverPresenceService` usam somente `REDIS_HOST` e
`REDIS_PORT`. Antes de usar Redis gerenciado, implemente uma fonte comum de
configuração que aceite:

- `REDIS_URL` como opção preferencial;
- usuário e senha;
- TLS quando a URL exigir;
- `family: 0` quando necessário em rede dual-stack;
- fallback local explícito para host/porta em desenvolvimento;
- o mesmo contrato para BullMQ e presença ao vivo.

O Redis do Railway, por exemplo, fornece `REDISUSER`, `REDISPASSWORD` e
`REDIS_URL`, e nasce privado por padrão, conforme a
[documentação oficial do Redis no Railway](https://docs.railway.com/databases/redis).
Não ignore autenticação para “fazer funcionar”.

#### Estado — implementado em 2026-08-21

Os seis requisitos acima estão implementados em
`apps/api/src/common/redis-connection.ts`. `QueueModule` e
`LiveDriverPresenceService` passaram a consumir `buildRedisConnectionOptions()`,
então fila e presença não podem mais divergir em host, autenticação ou TLS.

Precedência: `REDIS_URL` vence; sem ela, cai no par `REDIS_HOST`/`REDIS_PORT`
com padrão `localhost:6379`.

| Variável         | Uso                                                  |
| ---------------- | ---------------------------------------------------- |
| `REDIS_URL`      | preferencial; `rediss://` liga TLS sem flag separada |
| `REDIS_HOST`     | fallback local                                       |
| `REDIS_PORT`     | fallback local, padrão 6379                          |
| `REDIS_USERNAME` | também lido de `REDISUSER` (nome do Railway)         |
| `REDIS_PASSWORD` | também lido de `REDISPASSWORD`                       |
| `REDIS_TLS`      | `true` para TLS com host/porta em vez de URL         |
| `REDIS_FAMILY`   | `0`, `4` ou `6`; use `0` em rede privada só-IPv6     |

Detalhes que evitam falha silenciosa em produção:

- senha percent-encoded na URL é decodificada antes de conectar — um `%40`
  que deveria ser `@` quebraria a autenticação;
- host IPv6 vem sem colchetes para o ioredis;
- índice de banco é lido do caminho da URL (`redis://host:6379/2`);
- porta, `REDIS_FAMILY` e protocolo inválidos **falham na inicialização**, com
  mensagem direta, em vez de deixarem a API subir sem fila;
- o log de conexão usa `describeRedisTarget()`, que imprime host, porta, TLS e
  se há autenticação — nunca usuário, senha ou a URL inteira.

Validado com 25 testes unitários e, contra o Redis real, rodando o E2E de
presença e de ofertas com `REDIS_URL` no lugar de `REDIS_HOST`/`REDIS_PORT` —
exercitando o caminho novo de ponta a ponta, não só o fallback.

### P0.5 — completar as configurações operacionais

Sem estes três valores a criação ou o encerramento de pedidos pode falhar:

- percentual do motoboy;
- tempo de resposta de uma oferta;
- raio permitido para concluir retorno.

O percentual tem tela no admin. Timeout e raio ainda não têm. Para o piloto,
configure os três uma vez pela API autenticada, usando o procedimento da seção 10. Depois implemente os dois campos faltantes no painel.

Não existe percentual, timeout ou raio padrão aprovado pelo negócio. Os valores
devem ser decididos pelo responsável antes de preenchê-los.

### P0.6 — garantir coordenadas da coleta

A tela inicial de endereço da empresa envia rua, número, cidade, UF e CEP, mas
não envia `lat/lng`. Isso afeta o marcador de coleta e impede a conclusão de
um pedido com retorno.

Opções para o piloto:

1. recomendada: completar a tela com Google Places e exigir uma sugestão
   válida, salvando o par `lat/lng`;
2. provisória: salvar o par exato pela API autenticada, conforme a seção 12.

Nunca envie apenas uma coordenada e não use coordenadas aproximadas. O primeiro
pedido do caminho dourado deve ser criado **sem retorno**; ensaie retorno só
depois de confirmar a coleta no mapa e o raio configurado.

### P0.7 — validar migration, backup e restauração

As 14 migrations passam em banco vazio, mas a migration mais recente ainda não
foi aplicada e validada em uma cópia atual de staging. Antes do ambiente de
piloto:

1. gere snapshot/backup do banco de origem;
2. restaure em uma cópia ou branch separada;
3. aponte temporariamente a API apenas para a cópia;
4. confira o estado com `prisma migrate status`;
5. aplique `prisma migrate deploy`, nunca `migrate dev`;
6. execute smoke e E2E apropriados na cópia;
7. prove que consegue restaurar o backup em outra cópia;
8. compare contagens e amostras não sensíveis antes/depois;
9. só então aplique no banco novo do piloto.

Comandos, executados com `DATABASE_URL` da **cópia** injetada pelo ambiente:

```powershell
pnpm --filter @motoboycity/api exec prisma migrate status --schema prisma/schema.prisma
pnpm --filter @motoboycity/api exec prisma migrate deploy --schema prisma/schema.prisma
pnpm --filter @motoboycity/api exec prisma migrate status --schema prisma/schema.prisma
```

Se estiver usando Neon, consulte o guia oficial de
[migrations Prisma no Neon](https://neon.com/docs/guides/prisma-migrations) e a
área de Backup & Restore do plano contratado. Não teste restauração em cima do
banco que pretende preservar.

## 5. Arquitetura de piloto recomendada

Uma composição simples para o piloto é:

```text
empresa-pilot.seudominio.com  ─┐
                               ├─ HTTPS ─> API única ─> PostgreSQL privado
admin-pilot.seudominio.com    ─┘              │
                                              └────────> Redis privado

Android piloto ───────────── HTTPS/Socket.IO ──────────> API única
```

Exemplo de provedores:

- Vercel: `company-web` e `admin-web` como dois projetos;
- Railway: API, PostgreSQL e Redis no mesmo projeto/ambiente;
- Google Cloud: Maps JavaScript, Places e Routes.

É apenas uma composição de referência; outros provedores servem se entregarem
HTTPS, rede privada, backup, logs e variáveis seguras.

### Por que uma única API no piloto

O Socket.IO atual usa salas mantidas no processo e não possui Redis adapter.
Com duas réplicas, empresa, admin e motoboy podem cair em processos diferentes
e perder eventos. BullMQ também executa workers dentro da API.

Para o piloto:

- fixe uma réplica;
- não use autoscaling horizontal;
- monitore memória e reinícios;
- mantenha deploys fora da entrega ativa.

Antes de escalar, implemente adapter distribuído do Socket.IO, teste workers
separados e defina estratégia de conexão pegajosa quando necessária.

## 6. Crie domínios separados

Reserve, por exemplo:

- `api-pilot.seudominio.com`;
- `empresa-pilot.seudominio.com`;
- `admin-pilot.seudominio.com`.

Requisitos:

- HTTPS válido em todos;
- nenhum painel de banco/Redis exposto à internet;
- admin não deve ser indexado ou divulgado;
- ambiente deve ser claramente identificado como PILOTO;
- produção futura terá domínios e bancos separados.

Não use a URL de preview mutável do provedor no APK. O artefato precisa apontar
para um domínio estável.

## 7. Configure o Google Maps com chaves separadas

Crie pelo menos duas categorias de chave:

### Chave do servidor

Usada pela API em `GOOGLE_MAPS_API_KEY`:

- habilite somente Routes API;
- mantenha a chave apenas no serviço da API;
- aplique restrição por API;
- aplique restrição de IP se o provedor fornecer saída estável;
- configure orçamento, alertas e cotas.

### Chaves dos painéis

Cada painel lê `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`. Crie chaves web restritas
por HTTP referrer:

- empresa: `https://empresa-pilot.seudominio.com/*`;
- admin: `https://admin-pilot.seudominio.com/*`;
- autorize apenas Maps JavaScript API e a Places API usada pelo autocomplete;
- não use a chave do servidor no navegador;
- não coloque chave móvel ou de servidor na mesma credencial.

O Google recomenda combinar restrição de aplicação e restrição de API, além de
manter chaves diferentes por plataforma. Consulte as
[práticas oficiais de segurança do Google Maps](https://developers.google.com/maps/api-security-best-practices).

## 8. Suba PostgreSQL e Redis

No ambiente `pilot` do provedor:

1. crie PostgreSQL;
2. crie Redis no mesmo projeto/rede privada;
3. habilite persistência e backup compatíveis com o piloto;
4. não crie endpoint público para Redis;
5. configure alertas de espaço, conexão e reinício;
6. guarde as credenciais somente no gerenciador do provedor;
7. injete `DATABASE_URL` e `REDIS_URL` por referência entre serviços.

No Railway, serviços no mesmo ambiente podem usar DNS privado. A documentação
explica os [domínios privados](https://docs.railway.com/networking/domains/working-with-domains).

Não prossiga se o código ainda não tiver suporte completo a `REDIS_URL` e sua
autenticação.

## 9. Publique a API

Para um monorepo compartilhado, mantenha a raiz do repositório disponível no
build. No Railway, a importação de monorepos JavaScript é suportada, conforme a
[documentação de monorepo](https://docs.railway.com/deployments/monorepo).

Configuração de referência:

- Node: `22.18.0` ou versão compatível mais nova já validada;
- pnpm: `11.20.0`;
- build:
  `pnpm install --frozen-lockfile && pnpm --filter @motoboycity/api run build`;
- start: `pnpm --filter @motoboycity/api run start:prod`;
- pre-deploy:
  `pnpm --filter @motoboycity/api exec prisma migrate deploy --schema prisma/schema.prisma`;
- healthcheck path: `/health`;
- réplicas: `1`.

O provedor executa o pre-deploy antes de trocar a versão ativa; veja a
[documentação de pre-deploy do Railway](https://docs.railway.com/deployments/pre-deploy-command).

### Variáveis da API

Preencha no provedor, nunca em arquivo commitado:

```dotenv
DATABASE_URL=<referência privada do PostgreSQL>
REDIS_URL=<referência privada e autenticada do Redis>
JWT_SECRET=<segredo aleatório forte e exclusivo do piloto>
CORS_ORIGINS=https://empresa-pilot.seudominio.com,https://admin-pilot.seudominio.com
GOOGLE_MAPS_API_KEY=<chave Routes somente servidor>
ADMIN_SEED_EMAIL=<email individual do administrador do piloto>
ADMIN_SEED_PASSWORD=<senha forte e exclusiva definida antes do primeiro seed>
```

Não configure `API_PORT` se o provedor injeta `PORT`; `main.ts` já usa `PORT`
como fallback. Não coloque barra final nas origens CORS.

Para gerar um JWT secret no PowerShell e copiá-lo diretamente para o cofre:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Não cole o resultado em chat, issue, documentação, commit ou captura de tela.

### Limitação do healthcheck atual

`GET /health` responde `{ "status": "ok" }`, mas não consulta PostgreSQL nem
Redis. Ele prova apenas que o processo HTTP iniciou. No piloto, complemente com
smokes autenticados e observação das filas. Antes da produção pública, crie
readiness separada que verifique dependências sem expor detalhes. Railway usa
HTTP 200 para ativar um deploy, conforme a
[documentação de healthchecks](https://docs.railway.com/deployments/healthchecks).

## 10. Aplique migration, crie o admin e configure a plataforma

### 10.1 Migration

Deixe o pre-deploy aplicar as migrations. Confira no log que todas terminaram
antes de iniciar o serviço. Se uma migration falhar, o deploy deve parar.

### 10.2 Seed único

Com `ADMIN_SEED_EMAIL` e `ADMIN_SEED_PASSWORD` já configurados, execute uma vez:

```powershell
pnpm --filter @motoboycity/api run prisma:seed
```

Preferencialmente execute pelo console seguro do provedor, dentro da rede
privada. O seed cria:

- a única região padrão, se nenhuma região existir;
- o primeiro admin, se nenhum admin existir.

O seed ignora novas credenciais quando já existe um admin. Como ainda não há
troca/recuperação de senha, se o banco já contém o admin de desenvolvimento,
**pare**: não exponha o painel. Implemente um procedimento seguro de rotação ou
recrie o banco de piloto a partir de uma origem aprovada.

### 10.3 Smoke público da API

```powershell
$apiBase = 'https://api-pilot.seudominio.com'
Invoke-RestMethod -Method Get -Uri "$apiBase/health"
```

Resultado esperado:

```json
{ "status": "ok" }
```

### 10.4 Login do admin sem colocar a senha no histórico

```powershell
$adminEmail = Read-Host 'E-mail do admin'
$adminSecurePassword = Read-Host 'Senha do admin' -AsSecureString
$adminCredential = [PSCredential]::new($adminEmail, $adminSecurePassword)
$adminPasswordPlain = $adminCredential.GetNetworkCredential().Password

$adminLoginBody = @{
  email = $adminEmail
  password = $adminPasswordPlain
} | ConvertTo-Json

$adminLogin = Invoke-RestMethod `
  -Method Post `
  -Uri "$apiBase/auth/login" `
  -ContentType 'application/json' `
  -Body $adminLoginBody

Remove-Variable adminPasswordPlain, adminLoginBody
$adminHeaders = @{ Authorization = "Bearer $($adminLogin.accessToken)" }
```

Não imprima `$adminLogin` ou `$adminHeaders`.

### 10.5 Configure comissão, timeout e raio

Exemplo técnico, não decisão de negócio:

```powershell
$settingsBody = @{
  driverCommissionPercentage = 80
  dispatchOfferTimeoutSeconds = 60
  returnProximityRadiusMeters = 200
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Patch `
  -Uri "$apiBase/admin/platform-settings" `
  -Headers $adminHeaders `
  -ContentType 'application/json' `
  -Body $settingsBody

Remove-Variable settingsBody
```

Antes de executar, substitua os três exemplos pelos valores aprovados. Limites
aceitos atualmente:

- comissão: 0% a 100%;
- timeout: 10 a 600 segundos;
- raio: 10 a 2.000 metros.

## 11. Publique os dois painéis

Crie dois projetos Vercel apontando para o mesmo repositório:

### Painel da empresa

- Root Directory: `apps/company-web`;
- Framework: Next.js;
- habilite acesso a arquivos fora da Root Directory para os packages do
  workspace;
- domínio: `empresa-pilot.seudominio.com`.

Variáveis de build/produção:

```dotenv
NEXT_PUBLIC_API_URL=https://api-pilot.seudominio.com
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=<chave web restrita ao domínio da empresa>
```

### Painel administrativo

- Root Directory: `apps/admin-web`;
- Framework: Next.js;
- habilite acesso aos packages do workspace;
- domínio: `admin-pilot.seudominio.com`.

Variáveis:

```dotenv
NEXT_PUBLIC_API_URL=https://api-pilot.seudominio.com
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=<chave web restrita ao domínio do admin>
```

O Vercel recomenda um projeto por diretório do monorepo e explica a seleção de
Root Directory na [documentação de monorepos](https://vercel.com/docs/monorepos).
Variáveis `NEXT_PUBLIC_*` são incorporadas no build; qualquer alteração exige
novo deploy. Consulte também a
[documentação de variáveis do Vercel](https://vercel.com/docs/environment-variables).

### Smoke dos painéis

1. abra o admin em janela anônima;
2. faça login com o admin do piloto;
3. recarregue a página e confirme a sessão;
4. abra a empresa sem login e confirme redirecionamento correto;
5. no console do navegador, confirme ausência de erro CORS, Maps e Socket.IO;
6. confira o indicador de tempo real;
7. nunca deixe token visível durante compartilhamento de tela.

## 12. Cadastre a modalidade e a tabela de preços

No admin:

1. abra `/configuracoes/tipos-de-servico`;
2. crie uma modalidade, por exemplo código `MOTO` e nome `Motofrete`;
3. confirme que aparece como ativa;
4. abra `/configuracoes/tabela-de-precos`;
5. confirme o percentual do motoboy;
6. selecione a modalidade;
7. preencha valor base, valor por km, valor mínimo opcional e retorno opcional;
8. crie a tabela e confirme que ela está ativa.

Não escolha valores no improviso. Registre quem aprovou cada número. A fórmula
atual é:

```text
distância = valor_por_km × km da rota Google
subtotal = máximo(valor_mínimo, valor_base + distância)
total_empresa = subtotal + retorno
motoboy = percentual_do_motoboy × subtotal + 100% do retorno
plataforma = subtotal - parte_base_do_motoboy
```

O pedido congela distância e valores no momento apropriado; criar uma tabela
nova não deve reprecificar o histórico.

## 13. Cadastre e aprove a empresa

### 13.1 Cadastro

No painel da empresa:

1. abra `/register`;
2. informe nome do responsável do piloto;
3. use e-mail e telefone controlados pela equipe;
4. informe CPF/CNPJ de teste permitido para o ambiente, nunca de terceiro;
5. informe razão social e nome fantasia identificados como teste;
6. crie senha forte e exclusiva;
7. envie o cadastro;
8. confirme a tela “aguardando aprovação”.

### 13.2 Aprovação

No admin:

1. abra `/clientes`;
2. localize a empresa `PENDING_APPROVAL`;
3. confira e-mail, documento e nome;
4. clique em `Aprovar`;
5. abra o detalhe e confirme status `ACTIVE`, região e auditoria da aprovação.

### 13.3 Endereço de coleta

Entre no painel da empresa. A Home solicitará o ponto de coleta. Preencha rua,
número, complemento, cidade, UF e CEP.

Se a tela já tiver sido corrigida para Google Places, escolha uma sugestão
válida e confira o marcador. Se ainda estiver no estado atual, complete o
cadastro das coordenadas provisoriamente pela API.

Faça login da empresa sem registrar a senha no histórico:

```powershell
$companyEmail = Read-Host 'E-mail da empresa'
$companySecurePassword = Read-Host 'Senha da empresa' -AsSecureString
$companyCredential = [PSCredential]::new($companyEmail, $companySecurePassword)
$companyPasswordPlain = $companyCredential.GetNetworkCredential().Password

$companyLoginBody = @{
  email = $companyEmail
  password = $companyPasswordPlain
} | ConvertTo-Json

$companyLogin = Invoke-RestMethod `
  -Method Post `
  -Uri "$apiBase/auth/login" `
  -ContentType 'application/json' `
  -Body $companyLoginBody

Remove-Variable companyPasswordPlain, companyLoginBody
$companyHeaders = @{ Authorization = "Bearer $($companyLogin.accessToken)" }
```

Envie endereço e **o par exato** de coordenadas obtido de uma fonte confiável:

```powershell
$pickupBody = @{
  label = 'Coleta piloto'
  street = 'RUA AUTORIZADA'
  number = 'NUMERO'
  complement = 'COMPLEMENTO'
  city = 'CIDADE'
  state = 'UF'
  zip = '00000-000'
  lat = -00.000000
  lng = -00.000000
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Put `
  -Uri "$apiBase/company/address" `
  -Headers $companyHeaders `
  -ContentType 'application/json' `
  -Body $pickupBody

Remove-Variable pickupBody
```

Os números acima são placeholders: não execute sem substituí-los. Depois:

1. recarregue a Home;
2. confirme rua e número;
3. confira visualmente o marcador de coleta;
4. abra o detalhe da empresa no admin e confira `lat/lng`;
5. só então habilite um teste com retorno.

## 14. Gere e instale o aplicativo Android do piloto

Depois de concluir URL configurável, versão e assinatura:

1. injete a URL HTTPS do piloto no flavor/ambiente de build;
2. execute typecheck, lint e Jest;
3. gere o release assinado;
4. verifique certificado e assinatura;
5. instale em um aparelho limpo;
6. desligue Metro e desconecte o USB;
7. abra usando somente 4G/5G;
8. confirme que login e API continuam funcionando.

Comandos de referência para a configuração Android atual, depois de substituir
a assinatura debug por release:

```powershell
pnpm --filter @motoboycity/driver-app typecheck
pnpm --filter @motoboycity/driver-app lint
pnpm --filter @motoboycity/driver-app exec jest --runInBand

Set-Location apps/driver-app/android
./gradlew.bat clean assembleRelease
Set-Location ../../..
```

Artefato esperado:

```text
apps/driver-app/android/app/build/outputs/apk/release/app-release.apk
```

Verifique antes de instalar:

```powershell
apksigner verify --verbose --print-certs apps/driver-app/android/app/build/outputs/apk/release/app-release.apk
adb install -r apps/driver-app/android/app/build/outputs/apk/release/app-release.apk
```

Guarde o APK, checksum, commit, versão e certificado do piloto. Não envie a
keystore junto com o APK.

Uma APK assinada pode ser distribuída diretamente a participantes conhecidos;
a documentação Android descreve essa preparação em
[Prepare your app for release](https://developer.android.com/studio/publish/preparing).

### iOS

Não inclua iOS no ensaio de hoje. Distribuição para aparelhos ou TestFlight
exige macOS, Xcode, archive, assinatura e Apple Developer Program. A Apple
documenta o processo em
[Distributing your app for beta testing and releases](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases).

## 15. Cadastre, aprove e prepare o motoboy

No Android do piloto:

1. abra `Criar Conta`;
2. informe nome, e-mail e telefone controlados pelo participante;
3. informe CPF e nascimento somente se o piloto estiver autorizado a tratar
   esses dados; em um ambiente descartável, prefira dados formalmente definidos
   para teste;
4. configure chave PIX do próprio participante ou dado de teste aprovado;
5. informe se possui CNPJ;
6. crie uma senha forte;
7. confirme “cadastro aguardando aprovação”.

No admin:

1. abra `/entregadores`;
2. encontre o cadastro `PENDING`;
3. atribua a modalidade `Motofrete`;
4. salve as modalidades;
5. aprove o cadastro;
6. abra o detalhe e confirme `APPROVED`, conta `ACTIVE` e modalidade ativa.

No Android:

1. faça login;
2. verifique se o app mostra conexão com o servidor;
3. toque para ficar online;
4. conceda localização precisa em primeiro plano;
5. conceda localização em segundo plano no fluxo solicitado pelo sistema;
6. confirme a notificação permanente de rastreamento;
7. confirme no admin que o motoboy aparece online com versão, horário e GPS;
8. deixe o aplicativo aberto na Home enquanto espera a primeira oferta.

No Android 11 ou superior, a permissão “o tempo todo” é concedida pela tela de
configurações, não pelo mesmo diálogo inicial. A documentação recomenda pedir
localização de forma incremental e explicar o motivo; consulte
[Request background location](https://developer.android.com/develop/sensors-and-location/location/permissions/background).

Se a permissão for negada, o motoboy não pode permanecer online. Não altere
manualmente o banco para contornar essa regra.

## 16. Checklist de cinco minutos antes de sair

Só autorize a saída quando todos os itens forem `SIM`:

| Pergunta                                              | Esperado |
| ----------------------------------------------------- | -------- |
| O commit implantado passou no CI?                     | SIM      |
| API, empresa e admin usam HTTPS?                      | SIM      |
| `/health` responde e smokes autenticados funcionam?   | SIM      |
| PostgreSQL e Redis estão privados e com backup?       | SIM      |
| A API está em uma única réplica?                      | SIM      |
| As três configurações operacionais estão preenchidas? | SIM      |
| Modalidade e tabela ativa existem?                    | SIM      |
| Empresa está `ACTIVE` e coleta está correta?          | SIM      |
| Motoboy está `APPROVED`, `ACTIVE` e com modalidade?   | SIM      |
| Admin mostra o motoboy online e GPS recente?          | SIM      |
| APK funciona sem USB e Metro?                         | SIM      |
| App está em primeiro plano aguardando oferta?         | SIM      |
| Bateria, dados móveis e localização estão estáveis?   | SIM      |
| Rota e ponto de parada são seguros?                   | SIM      |
| Dados e pagamento são exclusivamente de teste?        | SIM      |
| Admin e empresa estão sendo monitorados?              | SIM      |

Um único `NÃO` cancela a saída até correção.

## 17. Teste de rua 1 — caminho dourado mínimo

Use um pedido avulso, destino conhecido, sem retorno e pré-pago.

### 17.1 Prepare o motoboy

1. estacione no ponto de coleta;
2. abra o app;
3. confirme `Conectado`;
4. fique online;
5. aguarde o admin mostrar GPS recente;
6. não bloqueie a tela enquanto aguarda a oferta, pois ainda não há push.

### 17.2 Crie o pedido na empresa

Na Home do painel da empresa:

1. escolha `Pedido avulso`;
2. selecione `Motofrete`;
3. mantenha `Destino conhecido`;
4. deixe `Exige retorno` desligado;
5. use destinatário `TESTE INTERNO`;
6. use telefone do operador do piloto;
7. use número externo `RUA-TESTE-001`;
8. escolha `Pré-pago`;
9. selecione uma sugestão completa do Google para o destino autorizado;
10. confira número, complemento e referência;
11. escreva `TESTE PILOTO — SEM COBRANÇA` na observação;
12. clique em `Criar pedido` uma única vez.

### 17.3 Confira o despacho

Imediatamente:

- empresa deve mostrar `Buscando motoboy`;
- admin deve mostrar o pedido e registrar atividade;
- Android deve abrir a oferta dentro do timeout;
- oferta deve mostrar coleta, destino, distância e valores;
- oferta **não** deve mostrar nome ou telefone do destinatário;
- nenhuma oferta duplicada deve aparecer.

Se o Android não receber, não recrie o pedido. Anote o ID e investigue Socket,
presença Redis, modalidade, região, fila e timeout.

### 17.4 Aceite

Com a moto parada:

1. confira empresa, coleta, destino e ganho;
2. toque `Aceitar` uma vez;
3. confirme que o pedido vai para `ACCEPTED`;
4. só agora confira destinatário, telefone, pagamento e observação;
5. confirme que empresa/admin mostram o mesmo motoboy.

### 17.5 Coleta

1. no ponto de coleta, abra a operação;
2. toque `Confirmar coleta` uma vez;
3. confira estado `COLLECTED` nos três clientes;
4. abra a rota externa para o destino;
5. só comece a dirigir depois de guardar o aparelho.

### 17.6 Entrega

1. pare com segurança no destino;
2. abra o pedido;
3. toque para concluir a entrega;
4. confirme `COMPLETED` no app, empresa e admin;
5. confirme que o rastreamento da entrega encerrou;
6. volte para a Home e confira que não existe entrega ativa escondida.

### 17.7 Financeiro imediato

No app do motoboy e no admin:

- deve existir exatamente um crédito associado ao pedido;
- o crédito nasce `PENDING`/“a liberar”;
- valor do motoboy + valor da plataforma deve conferir com o total;
- nenhum saldo disponível deve ser liberado antes do ciclo semanal;
- a empresa ainda não terá fatura fechada no mesmo dia.

Registre:

- ID e número exibido do pedido;
- horários de criação, oferta, aceite, coleta e conclusão;
- distância e valores;
- ID da transação da carteira, sem expor dados pessoais;
- resultado de cada tela.

Repita o caminho dourado três vezes antes de ensaiar falhas.

## 18. Teste de rua 2 — retorno

Só execute depois de a coleta ter coordenadas e o raio estar configurado.

1. confirme que a tabela possui `returnFee`;
2. crie pedido avulso com `Exige retorno`;
3. aceite e colete;
4. conclua a entrega no destino;
5. confirme que o estado fica `DELIVERED`, não `COMPLETED`;
6. volte ao ponto de coleta;
7. pare dentro do raio aprovado;
8. aguarde o GPS estabilizar;
9. toque `Capturar GPS e concluir retorno`;
10. confirme `COMPLETED`;
11. confira que 100% do retorno foi para o motoboy e a comissão incidiu apenas
    sobre o subtotal base.

Teste negativo, sempre parado:

1. tente concluir fora do raio;
2. espere recusa clara;
3. tente com precisão pior que o próprio raio;
4. espere recusa;
5. aproxime-se e repita com GPS estável;
6. confirme que só um crédito foi criado.

## 19. Teste de rua 3 — lote

1. escolha `Lote`;
2. mantenha todos os itens no mesmo modo de destino e retorno;
3. crie apenas dois itens na primeira vez;
4. use `RUA-LOTE-001` e `RUA-LOTE-002`;
5. confirme uma única oferta agregada;
6. aceite uma vez;
7. confira que os dois pedidos ficam com o mesmo motoboy;
8. execute as transições na ordem mostrada pelo app;
9. confira detalhes e valores de cada item;
10. confirme um crédito por entrega concluída, sem duplicidade.

Não teste 50 itens antes de o lote de dois passar completamente.

## 20. Testes controlados de falha

Faça estes testes somente depois de três caminhos dourados aprovados.

### Empresa cancela antes do aceite

1. crie pedido identificado como teste de cancelamento;
2. não aceite no app;
3. cancele pela empresa;
4. confirme que a oferta desaparece e o estado vira `CANCELLED`;
5. confirme que não existe crédito financeiro.

### Admin cancela depois do aceite

1. coordene com o motoboy, com a moto parada;
2. aceite um novo pedido de teste;
3. cancele no admin;
4. confirme remoção em tempo real do app;
5. confirme histórico e ausência de crédito indevido.

### Perda de internet/GPS

1. com o aparelho parado, desligue dados por tempo controlado;
2. confira mensagens no app e indicadores no admin;
3. religue e confira recuperação sem duplicação;
4. teste expiração da presença após o TTL de 150 segundos;
5. confirme `UNAVAILABLE` e fechamento do log de presença;
6. não altere estado diretamente no banco.

### Expiração/recusa de oferta

Com apenas um motoboy, ele pode ficar excluído das próximas tentativas daquele
pedido depois de recusar/expirar. Use dois motoboys aprovados para provar a
passagem automática ao próximo. Não use o primeiro pedido do dia para esse
teste.

## 21. Homologação financeira

O financeiro real não pode ser completamente acelerado no mesmo dia sem
adulterar relógio ou banco, o que invalidaria o teste.

Regra atual em `America/Sao_Paulo`:

- entrega concluída gera crédito pendente;
- segunda-feira às 00:00 libera repasses vencidos;
- segunda-feira às 00:05 fecha as faturas das empresas;
- motoboy solicita saque somente na segunda-feira;
- admin aprova e marca o PIX como pago manualmente;
- admin marca a fatura como paga manualmente.

### No dia do piloto

Confirme:

1. crédito pendente único por entrega;
2. valor congelado e fórmula correta;
3. carteira derivada confere com o ledger;
4. pedido aparece como faturável, mas sem fatura antecipada;
5. repetição de atualização não duplica dinheiro.

### Na segunda-feira seguinte

1. às 00:00, confirme liberação do crédito;
2. no app, solicite um saque permitido;
3. no admin `/financeiro/saques`, aprove;
4. realize o PIX fora da plataforma somente se for um teste financeiro
   autorizado; caso contrário, mantenha o valor fictício e não marque pago;
5. registre referência e marque pago;
6. às 00:05, confira a fatura em `/faturas`;
7. confira empresa, pedidos, total, parte do motoboy e plataforma;
8. marque o pagamento manual conforme a evidência do piloto;
9. confira todas as linhas do histórico.

O ciclo completo com relógio controlado deve continuar sendo provado nos E2E
isolados. Nunca mude o relógio do servidor de piloto nem edite datas/transações
no banco para antecipar segunda-feira.

## 22. O que monitorar durante o piloto

Mantenha abertas:

- Home administrativa;
- Home da empresa;
- logs da API;
- métricas de PostgreSQL;
- métricas/conexões do Redis;
- filas `dispatch`, `finance` e `live-presence`;
- Android com indicador de conexão e notificação de rastreamento.

Alertas mínimos:

- reinício ou crash da API;
- erro 5xx;
- latência elevada da Routes API;
- fila sem consumer ou jobs falhando;
- desconexão do Redis;
- presença expirada inesperadamente;
- Socket.IO reconectando continuamente;
- divergência entre cache da carteira e ledger;
- pedido ativo sem atualização;
- preço nulo ou diferente entre telas;
- localização sem atualização por mais que a cadência esperada.

O healthcheck do provedor não é monitoramento contínuo; configure um serviço de
uptime externo para a API e para os dois painéis antes de ampliar o piloto.

## 23. Critérios de aprovação do piloto

Considere o piloto aprovado apenas quando:

- três pedidos avulsos completos passaram sem intervenção no banco;
- um retorno passou dentro do raio e falhou corretamente fora dele;
- um lote de dois itens passou;
- cancelamento antes e depois do aceite respeitou as regras;
- perda e recuperação de rede não duplicou oferta ou transição;
- localização ficou atualizada e encerrou no offline/logout;
- nenhum dado do destinatário apareceu antes do aceite;
- todos os valores conferiram centavo a centavo;
- houve um único crédito por entrega;
- empresa e admin viram o mesmo estado;
- logs não contêm senha, token ou PII indevida;
- nenhum participante precisou usar USB, Metro ou rede local;
- backup, restore e rollback de aplicação foram ensaiados.

## 24. Critérios de interrupção imediata

Pare de criar pedidos se ocorrer qualquer um destes casos:

- CI vermelho ou commit implantado diferente do aprovado;
- app ainda aponta para localhost/HTTP;
- release usa assinatura debug;
- banco ou Redis público/sem autenticação;
- preço incorreto ou valor divergente;
- crédito duplicado;
- pedido preso sem possibilidade de cancelamento administrativo;
- PII aparece em oferta ou log;
- GPS mostra localização errada de forma perigosa;
- motoboy aparece online sem heartbeat válido;
- app perde oferta em primeiro plano;
- API reinicia durante operação;
- Google Maps recusa as chaves ou calcula rota incoerente;
- não há operador disponível para monitorar.

## 25. Rollback seguro

Ao interromper:

1. comunique todos os participantes;
2. impeça a empresa de criar novos pedidos;
3. coloque os motoboys offline;
4. liste pedidos ativos no admin;
5. cancele apenas os pedidos de teste que ainda permitam cancelamento;
6. não apague pedidos, históricos, ofertas ou ledger manualmente;
7. salve IDs, horários e logs técnicos sem PII;
8. reverta painéis e API para o último artefato verde;
9. mantenha migrations aditivas; não faça downgrade destrutivo no susto;
10. restaure banco somente em cenário de desastre, a partir do procedimento
    treinado e com registro da decisão;
11. rotacione imediatamente qualquer segredo que possa ter vazado;
12. abra análise de causa antes de retomar.

Para reverter o app Android, não tente instalar um `versionCode` menor. Gere um
novo APK com o código anterior e um `versionCode` maior, assinado pela mesma
chave. Preserve sempre o APK anterior e seu checksum.

## 26. Pendências antes de abrir ao público

Mesmo com o piloto aprovado, ainda faltam no mínimo:

- push FCM/APNs idempotente para oferta, cancelamento e bloqueio;
- publicação e revisão da permissão de localização em segundo plano;
- tela real de disclosure, termos e política de privacidade;
- recuperação/rotação de senha, especialmente do admin;
- mapa mobile ou experiência operacional equivalente homologada;
- Android em vários fabricantes, versões e modos de economia de bateria;
- iOS físico, assinatura e TestFlight;
- readiness de PostgreSQL/Redis;
- Redis autenticado/TLS com configuração comum;
- Socket.IO distribuído antes de mais de uma réplica;
- jobs/workers e estratégia de deploy sem interromper operações;
- monitoramento, alertas, plantão e suporte;
- testes mobile além do smoke único atual;
- resolução ou aceitação formal dos advisories altos transitivos conhecidos;
- backup automático, restore periódico e política de retenção;
- homologação financeira na segunda-feira real;
- contratos e processo operacional com empresas e motoboys;
- integração Aiqfome homologada, se for habilitada.

## 27. Checklist resumido para imprimir

### Engenharia

- [ ] CI verde no commit que será implantado
- [ ] typecheck, lint, testes, E2E e builds verdes
- [ ] URL do app configurável e HTTPS
- [ ] versão única e `versionCode` crescente
- [ ] APK assinado com chave de release
- [ ] Redis URL/autenticação/TLS suportados
- [ ] migration validada em cópia restaurada
- [ ] pickup com `lat/lng`
- [ ] comissão, timeout e raio configurados

### Infraestrutura

- [ ] três domínios HTTPS
- [ ] PostgreSQL privado com backup
- [ ] Redis privado e autenticado
- [ ] API em uma réplica
- [ ] CORS exato para empresa/admin
- [ ] chave Routes só no servidor
- [ ] chaves Maps/Places restritas por painel
- [ ] logs e métricas acessíveis ao operador

### Cadastros

- [ ] admin bootstrap seguro
- [ ] modalidade ativa
- [ ] tabela de preço ativa e aprovada
- [ ] empresa cadastrada e aprovada
- [ ] coleta conferida no mapa
- [ ] motoboy cadastrado, aprovado e com modalidade
- [ ] GPS, versão e heartbeat visíveis no admin

### Rua

- [ ] dados sintéticos e PREPAID
- [ ] rota segura e autorizada
- [ ] app aberto aguardando oferta
- [ ] operador monitorando admin e empresa
- [ ] avulso sem retorno primeiro
- [ ] repetir três vezes
- [ ] retorno depois
- [ ] lote de dois depois
- [ ] falhas/cancelamentos por último

### Financeiro

- [ ] um crédito pendente por entrega
- [ ] valores conferidos pela fórmula
- [ ] cache da carteira confere com ledger
- [ ] segunda 00:00 validada
- [ ] saque/aprovação/pagamento auditados
- [ ] segunda 00:05 e fatura validados
- [ ] pagamento manual da empresa auditado

## 28. Ordem exata recomendada

Se você começar do estado atual, siga esta sequência sem pular etapas:

1. corrigir CI;
2. implementar configuração de URL, versão e assinatura do driver-app;
3. implementar `REDIS_URL` autenticada/TLS em todos os consumidores;
4. completar pickup com coordenadas e campos administrativos faltantes;
5. rodar toda a verificação local isolada;
6. fazer commit e push;
7. esperar GitHub Actions verde;
8. criar ambiente, domínios, banco e Redis do piloto;
9. validar backup/restore e migrations em cópia;
10. publicar API em uma réplica;
11. executar seed único com credenciais fortes;
12. configurar Google e publicar os dois painéis;
13. configurar comissão, timeout, raio, modalidade e preço;
14. cadastrar/aprovar empresa e conferir coleta;
15. gerar, verificar e instalar APK assinado;
16. cadastrar/aprovar motoboy e atribuir modalidade;
17. conceder GPS, ficar online e validar o admin;
18. executar três pedidos avulsos conhecidos, sem retorno;
19. executar retorno;
20. executar lote;
21. executar cancelamentos e falhas controladas;
22. validar o financeiro imediato;
23. validar o ciclo financeiro na segunda-feira;
24. revisar evidências e decidir ampliar, corrigir ou encerrar o piloto.

Até o item 7, não existe artefato confiável para colocar na rua. Até o item
17, não existe operação pronta para receber um pedido. O primeiro deslocamento
só começa no item 18.
