# Aviso de proximidade da coleta — 2026-09-11

## Comportamento aprovado

O Company Web recebe um aviso visual e um toque curto quando o motoboy do
pedido permanece **a ate 50 m da coleta**, com **precisao de ate 20 m** e
**velocidade de ate 5 km/h durante pelo menos 20 segundos**. Somente `ACCEPTED`
(A caminho da coleta). Nao marca coletado, nao muda precos e nao interfere
em aceitar/coletar/entregar. A mensagem diz **proximo da loja**, nao afirma
presenca comprovada na porta: GPS e uma estimativa, especialmente entre edificios.

O servidor exige ao menos tres fixes distintos. Amostras antigas (>15 s), mais
de 5 s no futuro, anteriores ao aceite, sem precisao/velocidade ou fora dos
limites nao confirmam chegada. Intervalos acima de 15 s reiniciam a observacao.
Os 20 s precisam transcorrer tanto no tempo das amostras quanto no recebimento.

## Contrato e protecoes

- `POST /tracking/driver/deliveries/:id/points`: campos opcionais `sampledAt`
  (Unix epoch em milissegundos) e `speedMps` (m/s). APKs antigos continuam
  rastreando, mas nao habilitam esta deteccao. `capturedAt` conserva seu
  significado de horario de recebimento, sem alterar historico existente.
- A resposta pode incluir `pickupArrivalCheck: {lat,lng}`, coordenadas do
  snapshot `PICKUP` do pedido. Ausente se nao precisa mais observar a coleta.
- A autenticacao e a atribuicao do pedido continuam validadas na API.
- `PickupArrivalService` guarda observacoes descartaveis em memoria, com
  expiracao e limite de entradas. Reinicio ou distribuicao de amostras entre
  instancias pode atrasar/impedir o aviso; nao libera uma deteccao menos rigorosa.
- O `updateMany` exige mesmo motorista, `ACCEPTED`, mesmo `statusChangedAt` e
  `pickupArrivalNotifiedAt` nulo. Apenas quem grava publica
  `delivery:pickup-arrival` na sala autenticada da empresa proprietaria.
- O carimbo nao e zerado em reatribuicao. E **no maximo um evento por pedido**,
  inclusive depois de reiniciar a API. Nao existe garantia de entrega sonora:
  socket desconectado, navegador fechado/adormecido ou queda entre gravar e
  publicar podem perder o aviso. Nao ha replay de chegadas antigas.
- Falha do detector nao rejeita o ponto normal de rastreamento.

## App e painel

Android/iOS leem o alvo da resposta de rastreamento. A ate **150 m** desse alvo,
o app retira temporariamente o filtro de deslocamento para obter fixes novos
aproximadamente a cada 10 s, mesmo parado. **150 m nao dispara o aviso**: o
backend continua exigindo 50 m. Fora dessa area, ou depois de confirmar/coletar,
voltam os filtros anteriores. Nao reaproveita heartbeat como evidencia de parada
nem inventa velocidade zero quando o sistema operacional nao informa velocidade.

Na primeira entrada no Company, o modal **Ouça quando o motoboy chegar** oferece
**Ativar e testar som** ou **Continuar sem som**. Fechar tambem salva desativado.
A decisao fica em `motoboycity.pickup-arrival-sound.v1:<userId>` no localStorage,
por usuario/navegador, sem credenciais. O icone de volume altera a preferencia;
mudancas acompanham outras abas da conta. Limpar dados ou usar outro navegador
volta a perguntar; storage bloqueado limita a escolha a esta montagem da tela.

Ao reabrir com preferencia ativa, tenta preparar o audio sem toque de teste.
Se autoplay estiver bloqueado, tenta novamente num clique/toque/tecla normal do
painel, sem repetir chegadas antigas. Nao confundir preferencia salva com
permissao irrestrita de autoplay: o tooltip indica quando falta liberar o audio.
Som do computador/aba tambem deve estar ligado. Isso segue
a [politica de audio dos navegadores](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).
O aviso visual independe do som, possui numero/link/fechar, some na coleta ou
apos aproximadamente dois minutos. Validacao do payload e idade evita lixo/replay.
Deduplicacao sonora por conta em armazenamento local limitado e Web Locks evita
som duplicado entre abas nos navegadores que suportam ambos. Aba muda nao consome
o som de uma aba habilitada; outros aparelhos/usuarios podem receber seu aviso.

## Publicacao e reversao

1. Confirmar backup/snapshot recuperavel do banco de producao antes do rollout.
   No rollout de 11/09, backup local das 02:30 conferido por hash e leitura do
   indice do archive; job remoto `dump` em success. Nao foi ensaiado restore.
2. Aplicar `20260911120619_pickup_arrival_notification` antes de subir a API nova.
   Adiciona somente coluna nullable; existentes permanecem nulos. Sem backfill.
3. Publicar API e Company Web. Contrato continua compativel com APKs antigos.
   `7e13bce` publicado em 11/09: Render e Vercel Company/ADM em success; CI
   aprovado e health/readiness da API com PostgreSQL/Redis ok. O Render aplica
   migrations no build; nenhuma migration foi executada manualmente na producao.
4. Gerar/distribuir novo APK com este rastreamento e ensaiar em um aparelho real.
   `pilot.23`/versionCode 23 gerado, assinado e verificado; artefato e hash em
   `agent-handoff.md`. Instalacao/ensaio fisico pendentes; nenhum AAB novo.
   iOS exige compilacao e teste em macOS.
5. Testar loja em PC com som habilitado: aproximar, parar, aguardar; conferir um
   aviso; atualizar/reabrir nao pode repetir. Testar coleta antes de 20 s, passagem
   rapida, GPS impreciso, falta de rede, segundo pedido e reatribuicao.

Rollback: voltar API/web/app anteriores sem remover a coluna. O codigo antigo
ignora esse campo e os campos opcionais do contrato. Nao apagar carimbos para
reprocessar pedidos, pois isso reabriria a possibilidade de avisos duplicados.

## Validacao local

Migration gerada por Prisma `migrate dev --name pickup_arrival_notification
--skip-seed`, com `DATABASE_URL` e `DIRECT_URL` sobrescritos para um PostgreSQL
17 descartavel, exclusivo em `127.0.0.1:55439/arrival_check`; 52 migrations
anteriores aplicadas antes dela. `prisma validate` aprovado antes da edicao.

Teste de disputa real (sem AppModule, Redis, filas ou acesso externo):
`PICKUP_ARRIVAL_DB_TEST=1` e ambos os URLs apontando ao banco isolado;
`pnpm --filter @motoboycity/api exec jest --runInBand pickup-arrival.integration.spec`.
O proprio teste recusa outro host/porta/nome e e ignorado sem o opt-in.
Testes de GPS, contrato, autoria e evento em `pickup-arrival.service.spec.ts`,
`delivery-tracking.service.spec.ts`, `realtime.gateway.spec.ts`; testes de som,
duplicacao, falha de audio e UI em `pickup-arrival-alerts.test.tsx`.
Resultado final dos comandos e limitacoes registrados no changelog.
