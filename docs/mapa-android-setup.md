# Mapa do aplicativo do motoboy (Android)

O app usa **Google Maps** via `react-native-maps`. O mapa e o fundo da tela
principal e das telas de oferta e operacao.

## Por que a chave nao esta no repositorio

Este repositorio e **publico**. Chave commitada e chave exposta.

A chave mora em `apps/driver-app/android/local.properties`, que ja esta no
`.gitignore` do app. O Gradle le esse arquivo e injeta o valor no Manifest por
placeholder, entao a chave nunca aparece no codigo-fonte.

**Consequencia:** quem clonar o projeto em outra maquina precisa criar o proprio
`local.properties`. Sem ele o app compila e roda normalmente — o mapa so aparece
em branco, e o Gradle avisa no log.

## Criando o arquivo

```properties
# apps/driver-app/android/local.properties
MAPS_API_KEY=AIza...
```

Em maquina de build (CI), a variavel de ambiente `MAPS_API_KEY` funciona no
lugar do arquivo.

## Restricoes da chave no Google Cloud

A chave precisa de duas restricoes, senao qualquer um pode usa-la na sua conta:

| Restricao | Valor |
| --- | --- |
| Apps Android — nome do pacote | `com.motoboycity.driverapp` |
| Apps Android — SHA-1 (debug) | `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` |
| APIs permitidas | Somente **Maps SDK for Android** |

Com as duas, a chave so funciona dentro deste app assinado por esta chave. Se
vazar, nao serve para nada.

### O SHA-1 e do keystore DO PROJETO

O SHA-1 acima vem de `apps/driver-app/android/app/debug.keystore`, que e o
keystore versionado do projeto — **nao** o `~/.android/debug.keystore` padrao do
Android. Conferir o keystore errado e um erro facil de cometer, e o sintoma e
mapa cinza com tudo o mais aparentemente correto.

Para conferir:

```bash
keytool -J-Duser.language=en -list -v \
  -keystore apps/driver-app/android/app/debug.keystore \
  -alias androiddebugkey -storepass android
```

### Ao publicar na Play Store

O artefato de release e assinado com outra chave, que tem **outro SHA-1**. Ele
precisa ser adicionado na mesma credencial do Google Cloud.

Se a Play Store estiver com **assinatura gerenciada** (Play App Signing), o
SHA-1 que vale e o que aparece no console da Play em *Configuracao > Integridade
do app*, e nao o da chave de upload.

Sem isso, o mapa funciona no aparelho de teste e aparece cinza **so na versao
publicada** — que e o pior momento para descobrir.

## Escolhas de implementacao

**O ponto azul e desenhado pelo Google** (`showsUserLocation`), nao por um
marcador nosso. E o mesmo ponto que a pessoa ve no Google Maps, com a mesma
suavizacao de movimento; um marcador proprio ficaria pulando a cada leitura do
GPS.

**O mapa so aceita toque na tela principal.** Nas telas de oferta e de operacao
ele e pano de fundo, e ali um mapa interativo roubaria o toque de quem esta
tentando aceitar o pedido.

**Transito e pontos comerciais ficam desligados.** O mapa e leitura de apoio na
moto; poluicao visual atrapalha mais do que ajuda.

## Custo

O Maps SDK for Android exige conta de faturamento ativa no projeto, mesmo dentro
da cota gratuita. Vale criar um orcamento com alerta em **Faturamento >
Orcamentos e alertas** — nao bloqueia o servico, mas avisa por e-mail se o
consumo disparar.
