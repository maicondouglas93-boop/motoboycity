# Handoff de engenharia — MOTOboyCity

> **O que está valendo agora.** Este arquivo é reescrito quando o estado muda —
> ele não acumula histórico e não deve passar de algumas centenas de linhas.
>
> - histórico de cada recorte → `changelog.md` (append-only)
> - como o sistema é organizado → `architecture.md`
> - decisões de negócio confirmadas → `business-rules.md`
> - fluxo de trabalho e armadilhas → `ai-agent-guide.md`
>
> Última revisão: **2026-09-11**, aviso GPS de proximidade da coleta publicado
> em `7e13bce`: Render, Vercel (Company/ADM) e CI confirmados em success.
> APK `pilot.23` assinado e pronto para distribuicao, com verificacoes abaixo;
> o app instalado precisa ser atualizado para participar da deteccao.
> Mini-ilustrações Company e ADM enviadas em `1fa0a1f`; conferir rollout.
> Marca aiqfome enviada em `1d9ae85`; conferir rollout.
> Cupom de entrega de 80 mm enviado em `3d2dd41`, com 126 testes e
> build/typecheck/lint aprovados; rollout e ensaio físico na Elgin ainda
> não verificados. Recortes climáticos anteriores preservados.

## Como atualizar

Depois de cada recorte funcional, de contrato, de infraestrutura ou de
validação:

1. **acrescente uma entrada em `changelog.md`** com decisão, motivo, arquivos,
   comandos executados e resultado honesto;
2. **atualize aqui** apenas o que deixou de ser verdade;
3. **atualize `architecture.md`** se a organização do sistema mudou.

Não marque item como concluído sem evidência de código e teste. Não registre
secrets nem conteúdo de `.env` em nenhum dos três.

## Publicado — aviso de chegada para a empresa

Limites confirmados: `ACCEPTED`, raio 50 m, precisao ate 20 m, velocidade ate
5 km/h, permanencia 20 s. Backend verifica fixes novos e faz claim condicional
em `pickupArrivalNotifiedAt` antes de evento exclusivo para a empresa. Nao muda
coleta/preco. Company tem botao de volume para habilitar/testar som e aviso
visual. Android/iOS precisam desta nova versao para informar velocidade/tempo
do fix e observar parada proximo da coleta. Visual do Driver App preservado.

Migration `20260911120619_pickup_arrival_notification` criada/testada em
PostgreSQL 17 descartavel autorizado; o rollout autorizado usa `migrate deploy`
no build do Render, antes da API nova. Deploy `dep-dahvege7bikc73egjtpg`
confirmado em success em 11/09 as 09:45 (Brasilia), junto dos dois paineis.
API `/health` ok e `/health/ready` ready, PostgreSQL/Redis ok. Nao houve SQL
manual no banco compartilhado nem leitura/edicao de `.env` neste release.
CI `Typecheck, tests and builds` aprovado para `7e13bce`.
Ensaio real ainda necessario. iOS nao compilado neste Windows. Detalhes de
contrato, testes e limitacoes em `pickup-arrival-alert.md` e `changelog.md`.
APK `pilot.23` (versionCode 23) gerado e verificado em 11/09; falta distribuir
e instalar nos aparelhos. Nenhum APK instalado nem AAB novo gerado neste release.
Backup local de 11/09 as 02:30 conferido por hash e `pg_restore --list`;
backup GitHub/GCS da mesma data com job `dump` em success. Sem ensaio de restore.
Build nao significa instalacao: conferir versao nos aparelhos antes do ensaio.

## Recorte visual com publicação autorizada — navegação ilustrada Company e ADM

ADM: oito itens ilustrados no desktop e no menu compacto. Reutilizadas as quatro
artes do Company, com arquivos idênticos; geradas Visão geral, Entregadores,
Secretária IA e Configurações. Todas concluídas após nova tentativa solicitada
pelo responsável para as duas últimas, inicialmente impedidas por limite de uso.
Next Image reserva 32 px e entrega WebP; oito artes somam 7,4 KB em 1x, 15,1 KB
em 2x e 23 KB em 3x na medição local. PNGs em `apps/admin-web/public/brand/navigation`.
Nomes, rotas, página ativa, grupos do menu, notificações, ocultar valores e logout
preservados. Ajustados espaçamentos/tamanho do texto para caber no header.
58 testes do ADM aprovados (11 novos do TopNav), typecheck/lint/build aprovados.
QA local em 1280/1536/390 px: imagens carregadas e sem overflow da página,
menu compacto aberto e oito opções visíveis, console sem erros. Prévia removida.
Prompts e arquivos em `design/admin-nav-illustrations.md`.

Menu do Company Web com quatro mini-ilustrações originais (Pedidos, Clientes,
Relatórios e Financeiro), em laranja/verde-petróleo, preservando os nomes visíveis.
PNGs transparentes locais em `public/brand/navigation`, servidos por Next Image
em 32 px: quatro imagens somam 3,4 KB em 1x, 7 KB em 2x e 10,8 KB em 3x nos
testes locais WebP. Não servir diretamente os PNGs originais maiores.
Links, estado ativo, sessão, notificações e Chamar entregador preservados;
foco de teclado explícito e movimento de hover respeitam movimento reduzido.
Sete testes focados, typecheck/lint e build aprovados. Componente real conferido
em prévia local sem produção: 1280/1024/390 px, sem overflow da página; menu
mantém rolagem horizontal nas larguras menores. Prévia removida e servidor parado.
Prompts e tamanhos em `design/company-nav-illustrations.md`.
Commit/push na `main` autorizados. Conferir conclusão dos deploys automáticos
dos dois painéis; rollout ainda não verificado. Sem alteração em API, banco ou APK.

Marca aiqfome fornecida em Downloads continua em `/integracoes`, com nome
acessível e destaque ativo; recorte anterior enviado em `1d9ae85`, rollout
do deploy automático não verificado.

## Recorte com publicação autorizada — conferir rollout

**Cupom da loja:** botões na lista e detalhe de pedidos levam a
`/pedidos/[id]/imprimir`. Página protegida, sem menus; consulta novamente o
pedido/motoboy em cada impressão. Usa operations por ID (somente leitura), não
detail que pode gravar geocodificação. Sem banco/API/APK/financeiro alterados.
Prévia de 72 mm úteis conferida com dados fictícios no navegador, inclusive
texto longo e endereço ausente/parcial. 20 testes novos, 126 totais aprovados.
Impressão paginada e corte na Elgin i8/i9 ainda não validados em hardware.
Orientações e evidências em `runbooks/company-order-printing.md`.
Publicação por commit/push na `main` autorizada. Conferir o deploy automático
do Company Web na Vercel; não há mudança de API, migration ou APK neste recorte.

## O que está em produção

**Recorte da API com publicação autorizada:** filtro da chuva exige volume
positivo e código WMO compatível na amostra atual de 15 min. Zero mm com código
de chuva ou volume positivo com condição não chuvosa não inicia/reinicia a
ativação. Os 30 min secos e a frequência das consultas foram mantidos; não há
novo limiar de intensidade. Cache Redis v2 não herda ativação/espera v1, requer
nova amostra após atualizar a API. Sem migration/APK/alteração de valores.
Os 154 testes focados, typecheck, lint e build da API passaram. Precisão em campo
ainda não medida; estimativa pode divergir da rua. Rollout/rollback no runbook.

**Recorte visual com publicação autorizada:** cards em Taxas adicionais destacam
nome/valor/estado e Desativar/Reativar taxa. Modo e resumo climático separados,
empilhados em telas estreitas. ID, fonte/licença, horários detalhados e exclusão
ficam em **Detalhes e horários** (recolhido). Confirmações e chamadas da API
preservadas; nenhum ajuste no critério climático, valores, banco ou APK.
Validação visual com componentes/CSS reais e dados fictícios, sem API; não foi
um smoke autenticado de cobrança. Ver changelog para testes.

**Integração de chuva publicada:** `6b12b94` enviado para `main`; habilitação/ID
da taxa no Render e resultado do rollout não foram verificados nesta sessão.

**Recorte com publicação autorizada:** seleção Manual/Automática (chuva)
e desativação no ADM. Exige migration aditiva
`20260910160000_surcharge_rain_admin_control`, API e ADM; **não precisa de APK**.
O campo `automaticRainEnabled` começa `false`: manual/horários existentes são
preservados e o ADM deve optar novamente pelo automático na taxa vinculada.
No automático, manual/horários ficam sem efeito; desativar a taxa vence todos.
Na home do ADM, aviso de chuva/espera aparece quando a taxa automática está
ativa, com confirmação para desativar sem ir às configurações. A desativação
é geral e persiste até o ADM reativar; clima não religa por conta própria.
Consulta compartilhada com taxas a cada minuto, pausada em segundo plano.
Migration validada em **PostgreSQL 17 efêmero**, com 51 migrations anteriores,
dados fictícios e nova coluna aplicada pelo Prisma. Valores/horários preservados;
modo persistido, rollback por falha de auditoria e 10 disputas reais entre
manual/automático aprovados. Container temporário removido. O primeiro ensaio
herdou `DIRECT_URL` local e aplicou a migration antiga pendente
`20260831155700_asaas_environment_isolation` em `motoboycity_dev`; incidente
informado e continuação autorizada, sem desfazer essa migration local. O teste
foi corrigido para fixar ambas as URLs e conferir a identidade antes de migrar.
No ensaio, a migration da chuva foi aplicada somente no PostgreSQL efêmero.
O push autorizado publica API/ADM e permite ao Render aplicar a migration no
build; resultado do rollout ainda precisa ser conferido. Não houve execução
manual da migration em produção nem alteração de suas variáveis. Ver
`docs/runbooks/open-meteo-rain.md` para sequência, limites e rollback.

| | |
|---|---|
| Commit publicado | `7e13bce`, chegada GPS na coleta e versao mobile `pilot.23`, enviado para `main` em 11/09/2026. Render, Vercel Company/ADM e CI confirmados em success. Instalacao do APK nos aparelhos ainda nao confirmada |
| API | Render, deploy automático no push, `prisma migrate deploy` no build |
| Painéis | Vercel, mesmo monorepo, deploy no push |
| Banco | PostgreSQL gerenciado; 53 migrations no repositorio, incluindo chegada na coleta. Build Render com `migrate deploy` concluido e readiness PostgreSQL ok; sem inspecao SQL direta do schema de producao |
| APK nos aparelhos | O **`pilot.19`** já foi instalado em pelo menos um aparelho em 02/09/2026; a extensão do rollout não foi confirmada. Confira a versão de cada motoboy pelo heartbeat no painel (veja abaixo) |

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

`I:\MOTOboyCity\releases\motoboycity-0.1.0-pilot.23-vc23.apk`
SHA-256 `4588FF90B073DBB3E95C71845A9D8D1169205E0C112E62C6BB78E9213995A79E`,
75.172.289 bytes, `versionCode` 23, minSdk 24, targetSdk 36, assinatura v2,
ABIs arm64-v8a/armeabi-v7a/x86/x86_64, certificado oficial
`BD42D61D35819B86CB9D1FF784D3E64340C0CE153E21B0332AE97B4CF51D50B9` — o mesmo dos
anteriores, então ele atualiza por cima de `pilot.22` e versões anteriores
assinadas com essa chave. Pacote `com.motoboycity.driverapp`, origem `7e13bce`.

O bundle carrega `motoboycity-api.onrender.com` e **não** carrega
URL HTTP/HTTPS/WebSocket em `localhost`, `127.0.0.1` ou `10.0.2.2`. Versao JS
`0.1.0-pilot.23` conferida no bundle e novos campos `pickupArrivalCheck`,
`sampledAt`, `speedMps` conferidos nos DEX. Assinatura por `apksigner`, pacote
por `aapt` e hash da copia final aprovados. Ensaio fisico ainda pendente.

### AAB pronto para envio à Google Play

`I:\MOTOboyCity\releases\motoboycity-0.1.0-pilot.19-vc19.aab`
SHA-256 `157DD14393781FC94C22168085E9A6C82CC5768FD61D266D3077111AE7B1014D`,
53.722.655 bytes, pacote `com.motoboycity.driverapp`, `versionCode` 19,
`versionName` `0.1.0-pilot.19`, minSdk 24 e targetSdk 36. A assinatura JAR foi
verificada e usa o certificado oficial SHA-256
`BD42D61D35819B86CB9D1FF784D3E64340C0CE153E21B0332AE97B4CF51D50B9`.
O `processReleaseGoogleServices` foi executado; o bundle contém a API de
produção e não contém URL HTTP/HTTPS/WebSocket local.

O AAB ainda **não foi enviado** à Play Console. Ao ativar o Play App Signing,
preserve a chave de assinatura oficial já usada nos APKs distribuídos; aceitar
uma chave de app diferente quebra a continuidade de atualização entre a Play e
as instalações manuais. Como o AAB também usa `versionCode` 19, ele não atualiza
um aparelho que já esteja no APK `versionCode` 19; o próximo release destinado
a esses aparelhos deverá usar `versionCode` 20 ou maior.

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

O APK foi compilado e verificado e o `pilot.19` já foi instalado em pelo menos
um aparelho. A extensão da distribuição e o teste do toque e da vibração em uma
oferta real ainda precisam ser confirmados pelo painel/operação.

### Correções publicadas no `pilot.20`

GPS recusado especificamente por baixa precisão no destino agora oferece
**Tentar GPS novamente** e só substitui esse fix inválido. O aceite já gravado
no PostgreSQL não falha mais por limpeza posterior do Redis; o Android retenta
uma vez respostas 5xx; oferta atrasada usa a expiração absoluta do servidor; e
uma oscilação curta não mostra alerta vermelho nem desliga quem ainda está
confirmado online. A API foi enviada primeiro no commit `fdf7e57`; o APK oficial
usa `versionCode` 20 e ainda precisa ser instalado/distribuído aos motoboys.

A reconciliação dos repasses pendentes é processada em transações de até 25
lançamentos. Isso preserva a atualização condicional por status e impede que o
acúmulo de saldo bloqueado estoure o prazo do Prisma/Neon e deixe créditos
vencidos em `PENDING`.

O `GET /driver/wallet` lê o cache da carteira, o extrato visível e o ledger
completo no mesmo snapshot `RepeatableRead`. Assim, uma entrega ou liberação
concorrente não cria um aviso falso de divergência. A rota continua somente de
leitura: divergências históricas reais permanecem visíveis e não são reparadas
automaticamente por uma consulta.

Os `pilot.13` e `pilot.14` foram compilados, verificados e **descartados** sem
chegar a nenhum aparelho.

## Fluxos implementados

### Histórico de faturas por cliente no ADM — publicado (2026-09-06)

`/clientes/[id]/faturas` reúne as faturas de uma única empresa, com acesso pelo
card e detalhe do cliente, pelo nome da empresa em Financeiro e pelo detalhe de
uma fatura. Usa `GET /admin/financial/invoices?companyId=...`, já protegido por
JWT e `AdminOnlyGuard`, sem API, contrato ou migration novos. A tela filtra
número, status e período de emissão, mostra datas civis de emissão, vencimento
e pagamento, pagina os resultados e resume faturado, pago, aberto e vencido.
Canceladas permanecem consultáveis, fora dos valores faturados e a receber.
Filtros e paginação são locais sobre a lista daquela empresa; não disparam
consultas adicionais. O cache usa o prefixo financeiro já invalidado pelas
mutações de fatura. Há atualização manual e reconciliação em foco/reconexão.
Publicado em `6b8c918`: check `Vercel – motoboycity-admin-web` concluído com
`success`, nova rota HTTP `200` e código do histórico confirmado nos assets do
domínio oficial. O bundle publicado não contém a URL da API fictícia do smoke.
O teste autenticado do fluxo permanece o smoke local com fixtures; não houve
consulta a faturas reais nesta publicação.

### Filtros da fatura personalizada — publicado (2026-09-06)

A janela em Financeiro → Faturas permite buscar número exato do pedido
(inclusive vários separados por vírgula), número externo parcial, período
inclusivo de conclusão em São Paulo, atalhos de período, modalidade, valores
mínimo/máximo e selecionados/não selecionados. Há ordenação por conclusão,
número ou valor, paginação local e resumo de quantidade/valor nos resultados.
Modalidade, valores e seleção ficam em “Mais filtros”, com contador de ativos.

“Selecionar resultados” atua em todas as páginas do filtro, preservando os
selecionados fora dele e exibindo aviso explícito de que também entrarão na
prévia. O teto existente de 500 é respeitado sem seleção parcial. Atualizar a
lista invalida a prévia; selecionados que deixaram de estar disponíveis precisam
ser removidos antes de prosseguir. Trocar empresa ou fechar limpa a seleção.
Prévia/emissão mantêm a revalidação de elegibilidade e valores no servidor.

Nenhuma rota, contrato ou regra financeira mudou. A API ainda retorna todos os
candidatos elegíveis da empresa: os novos filtros não reduzem essa primeira
consulta e não fazem requisições ao digitar. Typecheck, lint, build, 26 testes
e smoke no navegador com API de fixtures local aprovados. Nenhuma fatura real
foi emitida. O recorte foi publicado em `583f67b`; o deploy do Admin Web na
Vercel concluiu com sucesso.

### Demais fluxos

**Relatório de pedidos por situação financeira — publicado (2026-09-06):**
`/relatorios/pedidos` permite cliente, intervalo inclusivo de criação/conclusão,
situação financeira (todos/em aberto/sem fatura/pendente/vencida/pagos), status
da entrega, busca e entregador. O detalhe do cliente tem “Consultar pedidos e
valores” com empresa pré-selecionada. Clique em “Buscar pedidos” aplica os
filtros; mudar campos oculta o resultado anterior até buscar. Total e quantidade
sem preço abrangem todas as páginas, calculados na API por
`GET /admin/deliveries/report`. “Em aberto” só considera concluídos `BILLED`
sem fatura ou com fatura pendente/vencida; “Todos” não significa saldo devedor.
Datas e vencimento usam São Paulo; nenhuma consulta quita ou altera fatura.
Endpoint novo somente admin, contratos aditivos, busca operacional preservada,
sem migration. Typecheck/lint raiz, 181 testes focados da API, 26 testes ADM,
builds API/ADM e smoke local com fixtures aprovados. O lint mantém um warning
anterior no mobile (`no-void`). Não homologado contra banco real. Publicado em
`583f67b`: Render (API), Admin Web e Company Web concluíram com `success`; a
rota administrativa nova responde `401` sem sessão, confirmando que está ativa
sem consultar nem alterar dados reais.

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

Quando uma empresa foi suspensa automaticamente por fatura vencida, a confirmação
válida de pagamento pelo Pix Asaas, pela baixa manual do ADM ou pela confirmação
de “Já paguei” reativa a empresa na mesma transação. A guarda condicional exige
o marcador financeiro `invoiceOverdueBlockedAt` e que não exista outra fatura que
já alcance o prazo de bloqueio; suspensão manual nunca é reativada por pagamento.
O histórico de status registra a reativação, com o ADM como autor na baixa manual
ou autor nulo no webhook do Asaas.

Em `SUSPENDED`, os membros da empresa continuam autenticando e o Company Web abre
normalmente para consultar pedidos e pagar faturas. A suspensão bloqueia somente
novo trabalho: criação avulsa/lote/admin/integração, reoferta, ativação de
agendado e vitrine. Pedidos já aceitos ou coletados seguem sem alteração.

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

## Resposta rápida da coleta no `pilot.22`

Na confirmação de coleta, o aplicativo agora inicia a captura atual do GPS
enquanto o motoboy lê o diálogo de confirmação. Depois que a API confirma a
transição, a tela e o estado local do lote são atualizados diretamente com a
própria resposta, sem aguardar quatro listagens operacionais e o detalhe de cada
pedido. A captura atual, a validação da API, a atomicidade do lote e a auditoria
continuam iguais; durante a espera o botão mostra `Confirmando coleta...`.

O recorte foi publicado e empacotado no `pilot.22`. Typecheck, lint focado, as
26 suítes / 188 testes do Driver App e o build Android de release passaram. Não
houve mudança de API, contrato, banco, migration ou regra de proximidade.

## Limitações e próximos passos

### Pendente de ação humana

1. **Instalar e testar o `pilot.22` em aparelho real.** Além de conferir que a
   tela e o botão de saque obedecem ao dia escolhido no ADM, permanecem os dois
   cenários ainda não exercitados: **negar "Permitir o tempo todo"** num
   Android 11+ e num Android 10, conferindo que o alerta oferece "Abrir ajustes"
   e que o atalho abre a tela certa; e **matar a rede no meio de uma
   finalização**, conferindo que a espera termina em 15 s com mensagem em vez de
   ficar girando. Confirmar também que uma oferta recebida com o aplicativo
   aberto toca e vibra até ser respondida ou expirar e que o fluxo normal
   **aceitar → coletar → entregar** não mostra o aviso antigo do pedido #547.
   No próximo APK, testar também o #777 com **Tentar GPS novamente**, um aceite
   durante oscilação de rede e uma oferta recebida perto do fim do prazo.
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
`DATABASE_URL` sozinho quando o schema usa `directUrl`, então aplique com
`prisma db execute --url` e registre a linha em `_prisma_migrations`.

### Armadilhas do ambiente

**Migrations usam também `DIRECT_URL`**: o schema tem `directUrl`, que prevalece
sobre `url` no CLI de migrations. Sobrescrever só `DATABASE_URL` não isola o
comando; imports da aplicação podem carregar variáveis locais antes do CLI.
Use `--url` nas ferramentas que o aceitam ou um schema temporário com **url e
directUrl literais para o mesmo destino isolado**, além de conferir o alvo
antes da primeira escrita. `scripts/verify-rain-migration.cjs` demonstra a
proteção com container próprio, banco fixo, porta exclusiva e identidade do
cluster conferida por Prisma e Docker. O client em execução usa `url`.

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

Histórico de faturas por cliente foi consolidado em `6b8c918` e documentado em
`579bc98`. Filtros da fatura personalizada e relatório de pedidos por situação
financeira foram consolidados em `583f67b`, enviados para `main` e publicados
com sucesso no Render e nas duas Vercel. O CI geral ainda estava em execução na
confirmação dos deploys; não foi usado para declarar a publicação aprovada.
Não incluir mudanças de outras sessões em eventual publicação futura.
O APK permanece `pilot.22` (`8255734`), com registro de release em `969994b`.

Podem existir arquivos locais não rastreados (`.codex/`, `temp*.tsx`) deixados
por outras sessões — **não os inclua em commit** e não os remova sem decisão do
responsável. O repositório é **público**: toda alteração exige varredura de
segredo antes do push.
