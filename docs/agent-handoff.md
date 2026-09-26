# Handoff de engenharia — MOTOboyCity

> **O que está valendo agora.** Este arquivo é reescrito quando o estado muda —
> ele não acumula histórico e não deve passar de algumas centenas de linhas.
>
> - histórico de cada recorte → `changelog.md` (append-only)
> - como o sistema é organizado → `architecture.md`
> - decisões de negócio confirmadas → `business-rules.md`
> - fluxo de trabalho e armadilhas → `ai-agent-guide.md`
>
> Última revisão: **2026-09-23**, liberar pedido agendado antes da hora
> (empresa e ADM) e valor mostrado ao motoboy antes de confirmar a entrega sem
> endereço, publicados em `378ca74` (Render e as duas Vercel em success) e
> empacotados no APK `pilot.27`, compilado de `f2d1795` e ainda não enviado.
> Antes disso, seis melhorias de carregamento do Driver App
> e a autoria da FM Software no alto do painel da loja, publicadas em
> `dbd6422` e `d444189` e empacotadas no APK `pilot.26`. Antes disso, endereço
> conferido por GPS no modal de entrega e marcação de pedido urgente em
> `ebf029f`, no APK `pilot.25`, enviado aos motoboys no mesmo dia.
> Antes disso, confirmação da entrega e fim da troca de
> pedido sozinho publicadas em `1bd88bc`, empacotadas no APK `pilot.24`.
> Antes disso, o aviso GPS de proximidade da coleta publicado
> em `7e13bce`: Render, Vercel (Company/ADM) e CI confirmados em success.
> APK `pilot.27` assinado e pronto para distribuicao, com verificacoes abaixo.
> O `pilot.26` foi enviado aos motoboys em 21/09; o `.27` vem por cima dele.
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
coleta/preco. Company pergunta sobre som na primeira entrada; ativar testa o
toque, recusar/fechar silencia. Escolha salva por usuario/navegador, sincronizada
entre abas e alteravel pelo volume. Ao reabrir, tenta habilitar quem aceitou;
se autoplay bloquear, um gesto normal no painel tenta liberar, sem tocar teste
nem chegada antiga. Esta melhoria web tem commit/push autorizados; conferir
rollout. Nao precisa de outro APK alem do `pilot.23` ja gerado.
Aviso visual mantido. Android/iOS precisam desta nova versao para informar velocidade/tempo
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
APK `pilot.26` (versionCode 26) gerado, verificado e **enviado aos motoboys em
21/09**, alguma horas depois do `pilot.25` e sem ensaio previo em aparelho.
Dez mudancas de tela chegaram ao campo no mesmo dia, em dois APKs. Ele carrega tambem o que
o `pilot.23` e o `pilot.24` carregavam, nenhum deles distribuido. Quatro
mudancas de tela chegaram juntas ao campo: confirmacao da entrega, fim da troca
de pedido sozinho, endereco por GPS no modal e etiqueta de urgente.

**Nao ha volta simples por APK.** O Android recusa instalar versionCode menor
por cima; voltar exigiria desinstalar, e a desinstalacao apaga a fila local de
finalizacoes pendentes do aparelho. Se algo estiver errado, corrigir para a
frente com um `pilot.26` e mais seguro do que tentar voltar. Nenhum APK instalado
nem AAB novo gerado neste release.
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

**Cupom da loja:** botões na lista, detalhe e janela Acompanhando levam a
`/pedidos/[id]/imprimir`. Página protegida, sem menus; consulta novamente o
pedido/motoboy em cada impressão. Usa operations por ID (somente leitura), não
detail que pode gravar geocodificação. Sem banco/API/APK/financeiro alterados.
Atalho novo em Acompanhando abre outra aba, por pedido, preservando a janela;
implementado em 11/09, com commit/push autorizados; conferir deploy automatico.
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
| Commit publicado | `bd35d87`, a oferta ao motoboy repete no conflito de serialização (o "Internal server error" ao chamar motoboy), enviado para `main` em 26/09/2026: CI verde e "Deploy live" no Render às 14:40, lido nos eventos do serviço. Antes, no mesmo dia: `be86503`, Pix online pela conta Asaas de cada loja, enviado para `main` em 26/09/2026: CI verde, a rota nova (`/company/store/asaas-account`) responde 401 no Render (a migration `20260926230000_loja_pagamento_online` foi no build), `/health` ok, e o Vercel do company e do admin em success no status do commit. O Pix fica desligado até `STORE_ASAAS_ENCRYPTION_KEY` entrar no Render. Antes, no mesmo dia: `18b0d0d`, correção do build, com o Web Push de `840a0ce` (avisos da loja online com a página fechada), enviados para `main` em 26/09/2026. O `840a0ce` sozinho falhou no build do Render, do Vercel e do CI (ver "Armadilhas do ambiente"); com `18b0d0d`, CI verde, `/public/web-push` passou de 404 a 200 no Render (`chavePublica: null` até as chaves `WEB_PUSH_*` entrarem), `/health/ready` ok, e o Vercel do company e do admin em "Deployment has completed". Antes, no mesmo dia: `f94ff4a`, a corrida nasce do pedido da loja online: CI verde, a rota nova (`POST /company/store/orders/:id/ride`) passou de 404 a 401 no Render cerca de 3,5 min depois do push, `/health/ready` ok, e o Vercel do company e do admin em "Deployment has completed". Antes dele, no mesmo dia: `424db8a`, pedido da loja online, login do cliente pelo Firebase e Vendas de verdade (junto: `6c4dace`, a loja que não abre). CI verde no GitHub. API nova conferida pela rota nova (`/company/store/orders`, 404 → 401); a rota do cliente responde 401 `STORE_CUSTOMER_REQUIRED`, e não 503 — o `FIREBASE_PROJECT_ID` está no Render; `/health/ready` com PostgreSQL/Redis ok. No status do commit, o Vercel do company e do admin em "Deployment has completed"; `/pedir/minha-loja`, `/login` e `/loja/vendas` respondem 200. Painéis do Render e do Vercel não foram abertos |
| API | Render, deploy automático no push, `prisma migrate deploy` no build |
| Painéis | Vercel, mesmo monorepo, deploy no push |
| Banco | PostgreSQL gerenciado; 63 migrations no repositório, incluindo as da loja online (catálogo, foto, link, operação, configurações, pedido, corrida do pedido, avisos). A API nova no ar indica o `migrate deploy` do build concluído, e o readiness PostgreSQL está ok; sem inspeção SQL direta do schema de produção |
| APK nos aparelhos | O **`pilot.26`** foi enviado aos motoboys em 21/09/2026 pelo responsável, no mesmo dia do `pilot.25`. O `pilot.27` (23/09) está compilado e **ainda não foi enviado**. Envio não é instalação: confira a versão de cada um pelo heartbeat no painel (veja abaixo) — alguns podem ter parado no `.25`, ou no `pilot.19` de 02/09, que era o último instalado confirmado antes de 21/09 |

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

`I:\MOTOboyCity\releases\motoboycity-0.1.0-pilot.27-vc27.apk`
SHA-256 `DE92D7FAFDB2AFDA012EEC94791DF6AC3206C05D0957EAF08FEF33557ABBB709`,
75.187.653 bytes, `versionCode` 27, minSdk 24, targetSdk 36, assinatura v2,
ABIs arm64-v8a/armeabi-v7a/x86/x86_64, certificado oficial
`BD42D61D35819B86CB9D1FF784D3E64340C0CE153E21B0332AE97B4CF51D50B9` — o mesmo dos
anteriores, então ele atualiza por cima de `pilot.26` e versões anteriores
assinadas com essa chave. Pacote `com.motoboycity.driverapp`, origem `f2d1795`.
O `pilot.26` (`38a7773`) continua na mesma pasta.

O bundle carrega `motoboycity-api.onrender.com` e **não** carrega
`localhost:3333`, `127.0.0.1` ou `10.0.2.2`. Versao JS `0.1.0-pilot.27`
conferida no bundle, junto de `Calculando o valor...`, `Calculado ao confirmar`,
`Seu GPS está impreciso agora` e `Não deu para calcular o valor agora` (as duas
últimas em UTF-16, como previsto).

**Armadilha ao conferir o bundle:** o Hermes guarda em UTF-16 toda string que
tenha caractere nao-ASCII. Procurar texto acentuado lendo o bundle como texto
devolve "ausente" para strings que ESTAO la. Procure nos bytes, nas duas
codificacoes — foi o que aconteceu na conferencia do `pilot.26`. Assinatura
por `apksigner`, pacote por `aapt` e hash da copia final aprovados. Ensaio
fisico ainda pendente, e agora ele cobre tambem o valor no modal de
confirmacao (item 2 das pendências), a confirmacao da entrega, o
cabecalho de duas linhas e o fim de pedido com dois pedidos abertos.

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

### Proteção individual de páginas por senha no painel da empresa (2026-09-24)

Empresas podem configurar proteção individual por senha para páginas e dados confidenciais (`/financeiro`, `/relatorios`, `/pedidos`, `/clientes`). Gerenciável em `/configuracoes` e `/perfil`. Senhas em hash `bcrypt`, isolamento multi-tenant absoluto (empresa resolvida do token JWT sem IDOR), autorização temporária de 30 min via header assinado `x-page-unlock-token`, e proteção real de API no backend via `PageProtectionGuard` em rotas financeiras e de relatórios.

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

**Liberar pedido agendado antes da hora — publicado em `378ca74`
(2026-09-23):** empresa (na lista e no detalhe do pedido, "Chamar agora") e ADM
(menu de ações, "Liberar agora") tiram um pedido `SCHEDULED` do agendamento e o
mandam para a busca na hora — o caso típico é o pedido do aiqfome esperando o
tempo de preparo. Valor inalterado; a empresa respeita o horário de
funcionamento e o ADM passa por cima. Regras em `business-rules.md`.

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

## Confirmação da entrega com endereço e valor

Marcar "Pedido entregue" não fecha mais o pedido em um toque. O aplicativo
abre um modal com o número e a loja do pedido, o endereço de destino e o valor
do entregador (mais o retorno quando existe), e só finaliza em "Confirmar
entrega"; "Fechar" devolve o motoboy ao pedido sem mexer em nada.

**No pedido criado sem endereço o modal mostra a rua onde ele está.** Ao abrir o
modal — no ponto em que ele acabou de entregar — o app captura o GPS e pergunta
a rua ao servidor (`POST /deliveries/:id/destination-preview`, consulta que não
grava nada no pedido). O fix fica **congelado** entre a conferência e a confirmação: o
endereço mostrado é o mesmo que vai ser gravado, inclusive quando ele usa
"Tentar GPS novamente", que também passa pelo modal. Sem rua identificada, o
modal diz isso e deixa confirmar; sem localização nenhuma, o confirmar fica
desabilitado com "Tentar de novo", porque sem coordenada o servidor recusa esse
pedido de qualquer forma.

Ordem de publicação importa: **API antes do APK**. Com o APK novo contra uma API
antiga, a consulta falha e o modal cai no texto de "não foi possível identificar
a rua" — degrada sem travar a entrega, mas tira a conferência. Ainda não
conferido em aparelho real.

**Desde 23/09/2026 o modal também mostra o VALOR no pedido sem endereço** (pedido
do cliente: o motoboy só descobria na carteira). A mesma consulta calcula
distância e preço com o ponto congelado e **reserva** o valor no Redis por 20
minutos; a confirmação com o mesmo ponto cobra exatamente ele, mesmo com taxa de
chuva/horário virando no meio. O confirmar passou a **esperar o valor**, com teto
de 8 s — passado disso libera e avisa que o valor sai na confirmação. GPS
impreciso bloqueia o confirmar com "Tentar de novo". A reserva já vale para o
`pilot.26` depois do deploy da API (ele já chama a consulta); só **mostrar** o
valor exige o `pilot.27`.

## Abertura automática do pedido recém-aceito

Ao voltar ao primeiro plano, a Home só abre sozinha a operação de um pedido
aceito quando **a própria Home está em foco**, quando já houve uma listagem
anterior na sessão (sem ela não há como saber o que é novo) e **uma única vez**
por pedido. Em qualquer outra tela o pedido novo apenas entra na lista: a tela
de operação nunca mais troca de pedido sozinha, que era o caminho pelo qual o
motoboy confirmava etapa no pedido errado. Oferta pendente continua abrindo
`IncomingOffer` em qualquer tela, de propósito — oferta tem prazo. Ainda não
ensaiado com dois pedidos reais em aparelho.

## Fim de um pedido e identificação da tela

Concluir um pedido **não emenda mais no próximo**: a tela concluída — com
"Concluído", o aviso de sucesso e os botões "Ver detalhes e histórico" e
"Voltar para o início" — passa a fechar qualquer pedido, e o próximo é aberto
pelo motoboy na lista da Home. Só sai sozinho para a Home o caso excepcional
de pedido encerrado por fora depois de uma coleta ou ocorrência. O cabeçalho da
operação mostra `Pedido #128` com o nome da loja embaixo (`subtitle` novo e
opcional do `SheetHeader`). Ainda não conferido em aparelho — inclusive a seta
de voltar com o cabeçalho de duas linhas.

## Pedido urgente

A loja (e o ADM) marcam o pedido como **URGENTE** na criação, e a etiqueta
aparece para o motoboy na oferta, no cartão da Home, na vitrine e na tela da
operação. Em lote, um pedido urgente marca a oferta inteira.

**É sinalização, não regra**: não muda fila de despacho, ordem de oferta, prazo
nem preço. Se um dia precisar mudar, é decisão de negócio — não assuma pelo nome
do campo.

✅ **A migration `20260921091703_pedido_urgente` foi aplicada em produção** pelo
`migrate deploy` do build do Render em 21/09, junto do deploy `ebf029f`. É
aditiva (coluna com default, sem backfill) e o `migrate deploy` do build do
Render aplica sozinho no próximo deploy da API, antes de a API nova subir.
Como Render e Vercel disparam juntos no mesmo push, existe uma janela de alguns
minutos em que os painéis já mostram o campo e a API ainda é a antiga: nessa
janela o Zod descarta a chave desconhecida e o pedido nasce sem a marcação.
Não quebra nada, mas quem marcar urgente aí vai achar que não funcionou.

## Loja online — telas dentro do painel

O `company-web` tem a área `/loja`, com as telas Vendas, Produtos (mais
Organizar, Cadastrar e Editar), Horários, Tipos de pedido, Notificações e
Configurações, e o status da loja no alto da barra lateral.

**Produtos, Organizar, Cadastrar e Editar gravam na API desde 2026-09-25**
(rotas `/company/store/*`; ver "Catálogo da loja online" em `architecture.md`),
e **Horários, Tipos de pedido, Notificações, o status e Configurações também**
(rotas `/company/store/operation/*` e `/company/store/settings/*`; tabelas
`store_operations` e `store_settings`), **e Vendas também, desde 2026-09-26**
(rotas `/company/store/orders/*`, tabela `store_orders`). `/pedir/<link>`
abre a loja de verdade: o cardápio publicado, a cara da loja
(logo, tema e cores), o horário, a situação (aberta, fechada, pausada, com o
recado), o tempo de entrega, a faixa de taxa dos bairros e as formas de
pagamento — tudo do banco. **Ela só recebe pedido com duas chaves ligadas**: a
da loja (**Pedidos pela página**, no alto de Vendas; `acceptsOrders`, desligado
por padrão) e a do login do cliente (as quatro `NEXT_PUBLIC_FIREBASE_*`, ver
"Login do cliente da loja"). Faltando uma, a página é **vitrine**, e a sacola diz
por quê. A página é de servidor (`lib/loja-publica.ts` busca
`GET /public/stores/:slug`); link antigo redireciona, com 307 de propósito — a
loja pode voltar a um link que já foi dela. Empresa pendente ou suspensa
responde "Loja não encontrada". **`/pedir/minha-loja` é a demonstração**, com o
fluxo inteiro no `localStorage`; o link é reservado. O que quem mexer no
catálogo do painel precisa saber:

- Uma consulta só para as quatro telas: `useCatalogo`, em
  `components/loja/catalogo.ts`.
- Organizar grava cada mudança na hora e muda a tela antes da resposta. As
  gravações correm numa fila (`scope` do TanStack Query, em
  `useFilaDoCatalogo`): em paralelo, cliques seguidos em "subir" podiam chegar
  ao servidor fora de ordem. A última da fila relê o catálogo.
- O formulário manda cada item do produto com o `id` que a API devolveu, e linha
  nova sem id (`components/loja/produto-no-formulario.ts`). Sem isso, a edição
  recriaria o item com id novo.
- A foto tem rotas próprias (`PUT` e `DELETE /company/store/products/:id/image`)
  e não vai mais no salvar do produto: o servidor guarda o arquivo no ImageKit
  e o `imageExternalFileId` dele, e apaga lá a foto trocada, removida ou de
  produto excluído. No cadastro, a foto espera o produto existir e sobe logo
  depois do primeiro salvar; se só ela falhar, a edição abre avisando.
- **A API local tem chave de ImageKit de verdade**: foto válida enviada pelo
  painel local vai para a conta real. Para testar sem isso, use um arquivo que
  a checagem de bytes recuse — ela roda antes do envio.
- **"Salvar cliente" em Vendas → Detalhes** (2026-09-26): `CadastroDaVenda`
  (`components/loja/cadastro-da-venda.tsx`) usa as rotas do cadastro de
  clientes que já existiam, sem rota nova. Só na entrega: o cadastro exige
  endereço. O bairro vai na referência, e sem CEP valem os da loja.

As migrations da loja online (`20260925090000_loja_catalogo`,
`20260925160000_loja_foto_do_produto`, `20260925190000_loja_link`,
`20260925230000_loja_operacao` e `20260926090000_loja_configuracoes`) foram
nos pushes de 2026-09-25, pelo `prisma migrate deploy` do build do Render, e
estão aplicadas também no `motoboycity_dev` local. A do pedido,
`20260926120000_loja_pedido` (tabela `store_orders`, quatro enums e a coluna
`store_settings.acceptsOrders`), foi no push de 2026-09-26, pelo mesmo caminho;
o rollback está no changelog. A da corrida, `20260926150000_loja_pedido_corrida`
(`store_orders.deliveryId`, `rideAttempt` e `rideIssue`), foi no push de
2026-09-26 (`f94ff4a`), depois de validada em banco descartável (aplicar,
desfazer, reaplicar); está também no `motoboycity_dev` local. A dos avisos,
`20260926200000_loja_avisos_push` (tabela `web_push_subscriptions` e o enum
`WebPushAudience`), foi no push de 2026-09-26 (`18b0d0d`), depois de validada
em banco descartável; está também no `motoboycity_dev` local. A do pagamento online,
`20260926230000_loja_pagamento_online` (a etapa `AGUARDANDO_PAGAMENTO`, o
pagamento no pedido e `store_asaas_accounts`), foi no push de 2026-09-26
(`be86503`), pelo mesmo caminho, depois de validada em banco descartável; o
rollback só desfaz a etapa nova se nenhum pedido estiver nela.

**Como a loja funciona, no banco** (2026-09-25). Cada bloco é uma coluna JSONB
de `store_operations` — horário, ajuste da hora, tipos de pedido, avisos —, e
cada tela grava só o seu: salvar o horário não desfaz a pausa feita em outra
aba. A linha nasce na primeira gravação; sem ela, a API responde a semana
fechada (`OPERACAO_INICIAL`, em `store-operation.service.ts`). O JSON segue o
tipo `OperacaoDaLoja` de `@motoboycity/types`, em português, porque é o mesmo
que as telas editam. O que quem mexer aqui precisa saber:

- O banco (JSONB) não guarda a ordem das chaves. O "há alterações" das telas
  compara pelo conteúdo (`mesmoConteudo`, em `components/loja/operacao.ts`, e
  as conversões de cada tela); comparar o `JSON.stringify` direto acusa mudança
  depois de salvar.
- O começo do ajuste (`desde`) é a hora do servidor, e a API recusa fim no
  passado. A tela mostra o ajuste gravado como já valendo, mesmo com o `desde`
  segundos à frente do relógio dela (`aplicarAjuste`, em `lib/loja-horario.ts`).
- A página do cliente recebe a operação sem os avisos da loja
  (`OperacaoPublica`), lida quando a página abre: uma pausa feita depois só
  aparece ao recarregar. A pausa que vence, sim, a página acompanha sozinha.
- **Pagamento online está travado de propósito.** A API recusa forma online ao
  gravar (`STORE_PAYMENT_ONLINE_UNAVAILABLE`) e a tira do que a página recebe
  (`PAGAMENTO_ONLINE_DISPONIVEL`, em `store-operation.service.ts`), e o painel
  trava o grupo (`RECEBE_ONLINE`, em `components/loja/pagamentos-da-loja.tsx`):
  sem a conta Asaas da loja, o dinheiro não teria para onde ir. Quem ligar o
  Asaas troca as duas constantes pela checagem da conta.
- **Sem bairro, não há entrega pela página** (decisão 17 do plano): a lista
  vazia é o padrão da loja nova. Na demonstração, lista vazia ainda quer dizer
  "entrega a combinar" — é o comportamento antigo, e some com ela.

**Identidade visual** (2026-09-25): tema, cor da marca, cor de ação e logo
ficam em `store_settings`, e exigem o link (409 `STORE_LINK_REQUIRED` sem ele).
A régua de contraste mora em `packages/validation` (`store-identity.schema.ts`),
e o `lib/contraste.ts` do painel só a reexporta: o servidor recusa a cor que o
painel avisa, com a mesma frase. A logo sobe como a foto do produto (ImageKit,
pasta `store-logos/<empresa>`, troca protegida e a anterior apagada lá). Os
textos das formas de pagamento saíram do `loja-mock.ts` para
`lib/loja-pagamentos.ts`, porque a tela integrada os usa.

**Só a loja de exemplo ainda vive no navegador.** `/pedir/minha-loja` grava
os pedidos no `localStorage` por `lib/loja-demo.ts`, e o painel copia para lá a
operação que a API guardou (`espelharNaDemonstracao`), para o exemplo obedecer
ao horário e à pausa configurados. Vendas não lê mais dali. Quem apagar a loja
de exemplo apaga `loja-demo.ts`, `loja-mock.ts` e o espelho juntos. As regras
de horário, de etapa do pedido e de operação moram em `packages/validation`
(`store-schedule.rules.ts`, `store-order.rules.ts`, `store-operation.rules.ts`)
desde 2026-09-26, porque a API decide com elas; `lib/loja-horario.ts`,
`loja-pedido.ts` e `loja-operacao.ts` só as reexportam. Mudou uma regra? Rode
`pnpm --filter @motoboycity/validation run build` — os apps a leem do `dist`.
Em Configurações, o cartão do Asaas diz "ainda não disponível", em vez de
mostrar campo que não grava.

**Quem faz a entrega e a comanda** (2026-09-25). A
loja escolhe em Tipos de pedido se entrega pelo MOTOboyCity ou com entregador
próprio, e cada pedido guarda a escolha ao nascer (`courier` no banco,
`entregaPor` no tipo). A comanda
da venda fica em `/loja/vendas/<número>/imprimir`, no grupo `(print)`, e usa o
estilo do cupom de entrega (`delivery-receipt.module.css`) — mudar aquele
arquivo muda as duas impressões.

**O horário é calculado no fuso da loja** (`America/Sao_Paulo`), e não no do
aparelho. Teste de horário constrói as datas com `-03:00`, para dar o mesmo
resultado em qualquer máquina. Telas que dependem da hora usam o relógio único
de `lib/relogio.ts`: quem grava um ajuste acerta o relógio antes, e ele se acerta
sozinho quando outra aba muda a loja.

**A Loja está no menu desde 2026-09-26** (item "Loja", que leva a Vendas e
fica marcado em toda `/loja`), porque Vendas deixou de ser demonstração. Os
avisos do lojista (pedido novo, cancelado, agendado, loja fechando) moram no
layout do painel inteiro, `app/(app)/layout.tsx`, e só consultam a fila da
empresa que ligou os pedidos pela página.

### Pedido da loja online — o que o servidor garante (2026-09-26)

Módulo `apps/api/src/company/store-orders/`. O cliente faz e acompanha o pedido
por `POST` e `GET /public/stores/:slug/orders` (token do Firebase no
`Authorization`); a loja lê a fila e muda a etapa por `/company/store/orders`.
Quem mexer aqui precisa saber:

- **O servidor refaz a conta.** Preço, tamanho, escolhas, pedido mínimo, loja
  aberta (ou o horário agendado), bairro atendido, forma de pagamento e troco
  são conferidos com as regras de `@motoboycity/validation`, em centavos. A
  página manda o total que mostrou (`totalVisto`); se o do servidor for outro,
  responde 409 `STORE_ORDER_TOTAL_CHANGED` com o total novo, e a sacola pede
  para o cliente conferir. Nada é gravado nesse caso.
- **Mudança de etapa é condicional.** `mudar` só grava se o pedido ainda tiver
  o `updatedAt` que leu (três tentativas, relendo); aceitar numa aba e cancelar
  na outra não passa as duas. Transição que a regra não permite: 409
  `STORE_ORDER_STAGE_INVALID`.
- **O prazo do aceite vence em até um minuto**, mesmo sem ninguém olhar: a
  varredura `store-orders-sweep-every-minute` (fila `store-orders`, BullMQ,
  desde 2026-09-26) cancela os NOVOS com `acceptDeadline` vencido, como
  `SISTEMA`, e leva o pedido à etapa que a corrida já alcançou. A leitura da
  fila e dos pedidos do cliente continua fazendo o mesmo — a varredura só
  garante que aconteça sem leitura, para o aviso sair na hora.
- **O número é por loja**, o maior mais um, numa transação; dois pedidos no
  mesmo instante esbarram na chave única e o segundo tenta de novo.
- **A corrida nasce do pedido** (2026-09-26), quando o MOTOboyCity entrega:
  no aceite (ou no checkout, com aceite automático), agendada para quando o
  pedido fica pronto (`prontoEm`: aceite + preparo, ou a janela menos o
  caminho). "Pronto" antes da hora libera a corrida agora, pelo mesmo
  `releaseScheduled` do painel. Cancelar o pedido cancela a corrida enquanto
  nenhum motoboy aceitou; depois, 409 `STORE_ORDER_RIDE_ASSIGNED` (é com a
  central). A criação é a do painel (`createFromStoreOrder`, em nome do dono da
  empresa, como a do aiqfome), com chave idempotente `pedido:tentativa`.
- **A corrida que não nasce não desfaz o aceite.** Fora do horário da central,
  sem endereço de coleta, sem tipo de serviço ou sem preço: o motivo vai para
  `rideIssue`, e Vendas mostra o aviso com "Chamar o motoboy de novo" e
  "Entregar com o entregador da loja". Corrida cancelada pela central também
  avisa; chamar de novo abre uma tentativa nova.
- **O pedido acompanha a corrida na leitura**, como o prazo do aceite: a fila
  e os pedidos do cliente levam o pedido a "Saiu" quando a corrida é coletada
  e a "Entregue" quando é entregue (`pelaCorrida`). A loja não marca essas duas
  à mão (409 `STORE_ORDER_FOLLOWS_RIDE`).
- **A corrida pedida**: tipo de serviço escolhido em Tipos de pedido (ou o
  primeiro ativo), CEP do cliente ou, sem ele, o da loja; pago na entrega, com
  retorno à loja, como no aiqfome; a nota do motoboy diz quanto cobrar e o
  troco. Decisões do usuário, 2026-09-26.
- **Estorno e pagamento online não existem ainda**: a página só aceita
  pagamento na entrega enquanto o Asaas da loja não estiver ligado.

### Avisos com a página fechada (Web Push) — 2026-09-26

Módulo `apps/api/src/web-push/` (envio com a biblioteca `web-push`, chaves
VAPID nas variáveis `WEB_PUSH_*`, inerte sem elas) e
`company/store-orders/store-order-notifications.service.ts` (quem recebe o
quê). Tabela `web_push_subscriptions` (migration
`20260926200000_loja_avisos_push`), uma linha por aparelho: `LOJA` (o painel
de quem ativou) ou `CLIENTE` (o uid do Firebase).

- **A loja** recebe pedido novo, agendado e cancelado por outra ponta, se a
  coluna "Notificação" de Notificações estiver ligada; **o cliente**, as
  etapas ligadas em "Para o cliente", e sempre o cancelamento. As palavras são
  as de `store-notification.rules.ts` (validação), as mesmas das telas.
- **Os workers.** O do painel é `public/loja/avisos-sw.js`, só de push (sem
  `fetch`), com escopo `/loja/`: não guarda nada nem controla o resto do
  painel. O do cliente é o `loja-sw.js` de sempre, que ganhou `push` e
  `notificationclick` — e por isso só existe em produção. Com a página
  visível, o worker não mostra o aviso: o painel aberto toca e notifica
  sozinho, com a mesma etiqueta (`venda-<número>`).
- **O endereço de push é conferido** (`web-push.schema.ts`): só HTTPS e só os
  serviços dos navegadores (Google, Mozilla, Apple, Windows). O servidor faz
  POST nele; aceitar qualquer um abriria SSRF.
- O aparelho que o serviço de push dá como sumido (404/410) sai da tabela no
  envio. Ativar é por aparelho: o cartão "Avisos com o painel fechado", em
  Notificações, e "Avisar quando o pedido andar", em Meus pedidos.
- **Não exercitado de verdade**: a entrega pelo Google/Mozilla (o ambiente
  local não tem as chaves). O E2E cobre inscrição, decisão e varredura com o
  envio simulado, e uma checagem sem rede confirmou que a biblioteca monta a
  requisição assinada e cifrada com as opções do serviço.

### Pagamento online da loja (Asaas, Pix) — 2026-09-26

Decisões do usuário: a loja **cola a chave da API** da conta Asaas dela (o
dinheiro não passa pela plataforma, decisão 3), **só Pix** por enquanto, e a
loja **só vê o pedido depois de pago** — o Pix vale 15 minutos.

- **A conta** (`company/store-asaas/`): a API confere a chave no Asaas
  (`/myAccount/commercialInfo`), vê se há chave Pix ativa, cria o webhook na
  conta da loja (`/integrations/asaas/stores/<empresa>/webhook`, com token
  próprio) e guarda chave e token cifrados em `store_asaas_accounts`
  (AES-256-GCM, `STORE_ASAAS_ENCRYPTION_KEY`, id da empresa como dado
  autenticado — o mesmo desenho do aiqfome). Nada volta para o navegador.
  Desligar apaga o webhook e tira o Pix das formas de pagamento.
- **O pedido pago online nasce `AGUARDANDO_PAGAMENTO`**, com a cobrança já
  criada na conta da loja (o CPF vai ao Asaas, que o exige, e não fica no
  pedido). A loja não o vê. Pago — pelo webhook, pelo "Já paguei" do cliente
  ou pela varredura —, entra como novo (ou aceito, com a corrida), e aí a loja é
  avisada. Vencido, a varredura confere no Asaas, apaga a cobrança lá e cancela
  o pedido como `SISTEMA`; o Pix que chegar depois disso é estornado sozinho.
- **Estorno automático e inteiro** (decisão 18) quando o pedido pago é
  cancelado, pela conta da loja. Antes de pedir, pergunta ao Asaas se já não
  foi pedido. Recusado (sem saldo, conta trocada), fica `ESTORNO_FALHOU`, com o
  motivo em Vendas, e a varredura tenta de novo a cada 15 minutos. As tarifas do
  Asaas não voltam.
- O cliente HTTP do Asaas das faturas virou `callAsaas(credencial, ...)`,
  comum às duas contas; as faturas continuam com a conta da plataforma.
- **Não exercitado**: uma conta Asaas de verdade, nem sandbox. O E2E cobre o
  fluxo inteiro com o Asaas simulado.

### Login do cliente da loja: Firebase, só com Google, e por que ele não toca o painel

O `company-web` tem duas autenticações. O painel continua com a dele
(`lib/session.ts`, JWT próprio) e a **loja do cliente** usa o Firebase
Authentication, só com Google (`lib/firebase-da-loja.ts`, desde 2026-09-26). Elas
não se enxergam, e é assim que deve ser: quem compra um açaí não é usuário do
sistema de entregas. O Clerk, usado antes, saiu: em produção ele exige domínio
próprio, e o painel roda em `.vercel.app`.

- É o **mesmo projeto do Firebase do push do motoboy**. A API confere o token
  com o `firebase-admin` e só o `FIREBASE_PROJECT_ID` que o push já usa
  (`cliente-da-loja.guard.ts`); sem ele, as rotas do cliente respondem 503
  `STORE_ORDERS_UNAVAILABLE`. O `firebase-admin/auth` é importado só na hora,
  porque o `jose` dele é ESM e quebra o Jest.
- No navegador, o Firebase só carrega no grupo `src/app/(loja)/`, que **não
  aparece na URL**; não há middleware nem página de entrar — o botão "Entrar com
  Google" abre a janela do Google, e cai para o redirecionamento quando o
  navegador bloqueia a janela.
- Os quatro valores `NEXT_PUBLIC_FIREBASE_*` (ver `apps/company-web/.env.example`)
  são a configuração do app web no console do Firebase: públicos por natureza. O
  que protege é a lista de **domínios autorizados** em Authentication →
  Settings. Vão no `.env.local` e no Vercel, e são lidos no build: pôr os
  valores pede deploy novo. **Sem os quatro, a loja abre só como vitrine.**
- `.pnpmfile.cjs` tira de `@firebase/auth` o peer opcional do AsyncStorage do
  React Native. Sem isso, o pnpm criava uma segunda cópia do react-native com o
  React do painel, e os testes do driver-app quebravam com "Invalid hook call".
  Não apague esse arquivo sem rodar os testes do driver-app.

A biblioteca de animação da loja (`motion`) segue o mesmo recorte: é carregada
pelo `LazyMotion` no layout de `(loja)` e não chega ao painel — conferido, zero
scripts dela em `/login`. Tempos e curvas ficam em
`components/loja-online/movimento.tsx`; animação nova da loja deve tirá-los de
lá, e não de números soltos.

### Service worker da loja — leia antes de estranhar cache

`apps/company-web/public/loja-sw.js`, registrado por
`components/loja-online/registro-do-app.tsx` **só em produção** e com escopo
`/pedir/<slug>`. Guarda os arquivos `/_next/static/` e a última cópia das páginas
daquela loja; todo o resto passa direto.

- **Nunca registre esse arquivo com escopo mais largo.** Ele mora na raiz porque
  o app é o mesmo do painel, e na raiz controlaria o painel de produção. Ele se
  desregistra sozinho se isso acontecer, mas a primeira defesa é não fazer.
- O escopo não tem barra no fim, então casa também com lojas cujo slug começa
  igual; o `fetch` confere o caminho exato. Mexeu na lógica de rotas? Mantenha
  essa conferência.
- Mudou a estratégia de cache? Troque `VERSAO` no topo do arquivo: a ativação
  apaga os caches `loja-*` de outras versões.
- "Minha mudança na loja não aparece" num build de produção: DevTools →
  Application → Service workers → Unregister, e recarregar.

O plano do que falta — backend inteiro, PWA do cliente e os pedidos de
2026-09-23 — está em `docs/plano-loja-online.md`, que é a referência atual da
loja neste repositório.

Quem for ligar à API deve **apagar** `loja-mock.ts`, e não adaptá-lo. As
decisões de modelo que as telas assumem (três situações do produto em vez de um
booleano, categoria por id, ordem pela posição no array, pendência que impede
vender separada da que é só recomendação) estão comentadas no próprio arquivo e
registradas no `changelog.md` de 2026-09-23.

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
2. **Enviar e testar o `pilot.27`, com o valor antes de confirmar** (recorte de
   23/09/2026; API publicada, APK compilado e conferido, ainda não enviado nem
   testado em aparelho). Testar num pedido sem endereço: o modal mostra o valor e o confirmar espera por ele; o
   valor na carteira depois é o mesmo; GPS impreciso bloqueia com "Tentar de
   novo"; e sem internet o modal libera em até 8 s com "Calculado ao confirmar",
   sem travar a entrega.
3. **CI vermelho no `main` de 21/09 a 25/09 — corrigido em 25/09.** O Lint
   falhava em
   `admin-completed-delivery-actions.tsx` (hook depois de `return`), e por isso
   testes e builds do CI nem rodavam; dois testes do `detail` falhavam por mock
   sem `walletTransaction`. Com a correção, o CI ficou verde no GitHub no push
   de 25/09 (`5840883`), E2E inteiro incluído.
4. **Smoke autenticado do OAuth aiqfome** — falta confirmar que o provedor
   devolve `state` junto com o `code`. A proteção não deve ser removida se ele
   omitir.
5. **Rotação dos segredos** registrada no changelog da integração aiqfome.
6. **Conferir o Web Push em aparelho.** As chaves `WEB_PUSH_*` foram postas
   no Render pelo usuário em 26/09 (a API passou a entregar uma chave pública
   P-256 válida). Num pedido de teste o aviso não chegou, e a causa não foi
   investigada: conferir no log do Render se há `Aviso não entregue`, se o
   cartão de Notificações diz "Este aparelho avisa mesmo com o painel fechado.",
   se o painel estava visível em outra janela (o worker não mostra o aviso
   nesse caso) e o "Não perturbe" do Windows. Trocar o par de chaves desliga
   todas as inscrições.
7. **Login do cliente da loja (Firebase): configurado em 26/09** pelo usuário.
   As quatro `NEXT_PUBLIC_FIREBASE_*` estão no build do Vercel (conferido no
   JavaScript publicado: `authDomain` e `projectId` de `motoboycity-bc0b4`, o
   mesmo do Render). Falta apagar do Vercel as variáveis antigas do Clerk.
8. **Ligar o pagamento online das lojas (Asaas).** Gerar uma vez a chave
   mestra (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
   e pôr no Render como `STORE_ASAAS_ENCRYPTION_KEY`, **com cópia fora do
   Render**: ela abre as chaves de todas as lojas, perdê-la obriga cada loja a
   ligar a conta de novo, e não há rotação. Depois, cada loja cria a conta no
   Asaas, cadastra uma chave Pix, gera a chave da API (Integrações → Chaves de
   API) e cola em Configurações → Recebimento online pelo Asaas. Testar antes
   com uma conta **sandbox**.
9. **Cópia do keystore fora desta máquina.** É o único risco irreversível do
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

**Os pacotes compilam sem os tipos do Node e do navegador — e esta máquina
esconde isso.** Existe um `package.json` com `node_modules` em
`C:\Users\Pichau`, com `@types/node`, e o TypeScript sobe pastas procurando
`node_modules/@types`: aqui, `URL`, `Buffer` e afins existem em
`packages/validation`, `types` e `api-client`; no Render, no Vercel e no CI,
não. Foi o que derrubou o build de `840a0ce` (26/09): `new URL(...)` no
`web-push.schema.ts` passou em tudo localmente. Para conferir como o deploy,
compile o pacote com `npx tsc -p tsconfig.build.json --noEmit --typeRoots
./sem-tipos`. Nos pacotes, nada de global de ambiente.

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

Os arquivos são `%TEMP%\motoboycity-store-password.dpapi` e
`%TEMP%\motoboycity-key-password.dpapi`. O responsável os cria colando, **no
PowerShell** (não dentro de `powershell -Command "..."`, que expande o `$`):

```powershell
Read-Host 'Senha do keystore' -AsSecureString | ConvertFrom-SecureString | Set-Content -Encoding utf8 "$env:TEMP\motoboycity-store-password.dpapi"
Read-Host 'Senha da chave (alias motoboycity)' -AsSecureString | ConvertFrom-SecureString | Set-Content -Encoding utf8 "$env:TEMP\motoboycity-key-password.dpapi"
```

O DPAPI amarra o arquivo ao usuário do Windows: só esta conta nesta máquina
consegue abrir, e o agente usa a senha sem nunca vê-la. No build, o script lê
com `ConvertTo-SecureString`, passa por variável de ambiente ao Gradle e apaga
as variáveis no `finally`. O Gradle roda pelo `cmd` com saída num log — com
`$ErrorActionPreference = 'Stop'`, o PowerShell mata o build no primeiro stderr.
Chame o `gradlew.bat` pelo **caminho absoluto**: o ambiente do agente define
`NoDefaultCurrentDirectoryInExePath`, e aí o `cmd` responde "'gradlew.bat' não é
reconhecido" mesmo dentro da pasta certa (visto no `pilot.27`).

## Estado do worktree

Histórico de faturas por cliente foi consolidado em `6b8c918` e documentado em
`579bc98`. Filtros da fatura personalizada e relatório de pedidos por situação
financeira foram consolidados em `583f67b`, enviados para `main` e publicados
com sucesso no Render e nas duas Vercel. O CI geral ainda estava em execução na
confirmação dos deploys; não foi usado para declarar a publicação aprovada.
Não incluir mudanças de outras sessões em eventual publicação futura.
O APK mais novo em `I:\MOTOboyCity\releases` e o `pilot.27`, compilado de `f2d1795`.

Podem existir arquivos locais não rastreados (`.codex/`, `temp*.tsx`) deixados
por outras sessões — **não os inclua em commit** e não os remova sem decisão do
responsável. O repositório é **público**: toda alteração exige varredura de
segredo antes do push.
