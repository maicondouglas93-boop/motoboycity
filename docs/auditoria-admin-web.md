# Auditoria — painel do administrador (`apps/admin-web`)

> **Documento de época — leia com data.** Registra o auditoria de 2026-08-24. O
> sistema andou bastante desde então: itens aqui podem já estar prontos,
> descartados ou superados. Para o estado atual use `agent-handoff.md` e
> `architecture.md`, e **confirme no código** antes de agir.

Executada em 24/08/2026 sobre 37 páginas e ~21 mil linhas, seguindo
`docs/prompt-auditoria-admin-web.md`. Nenhum código foi alterado nesta rodada.

**Há dois achados de gravidade alta.** Os dois são ação irreversível com um
clique, sobre dinheiro: marcar fatura como paga e fechar as faturas da semana.

Onze achados no total. A seção final lista o que foi testado e estava correto —
vale tanto quanto os achados, porque evita que a próxima auditoria refaça o
mesmo caminho.

---

## Alta

### [Alta] Marcar fatura como paga é um clique, sem confirmação

**Onde:** `src/app/(app)/faturas/[id]/page.tsx:149`

**O que acontece:** o botão "Marcar como paga" chama `markPaidMutation.mutate()`
direto no `onClick`. Não há diálogo, não há resumo do que vai acontecer, e não
há como desfazer pela tela — para reverter é preciso cancelar a fatura, o que
devolve as entregas para cobrança e obriga a fechar tudo de novo.

**Por que importa:** um clique errado apaga a dívida de uma empresa. A fatura
sai da lista de pendentes, some do "a vencer" no painel da loja, e ninguém mais
é lembrado de cobrar. Só aparece de novo se alguém for conferir fatura por
fatura.

**Como confirmei:** li o `onClick` e a volta pela `cancelInvoice` em
`apps/api/src/finance/invoice.service.ts`. O contraste é a própria tela ao lado:
cancelar fatura tem diálogo, explicação da consequência e motivo obrigatório de
10 caracteres.

---

### [Alta] "Fechar faturas da semana" também é um clique

**Onde:** `src/components/finance/faturas-tab.tsx:126`

**O que acontece:** `fecharMutation.mutate()` no `onClick`. Essa ação gera as
faturas de **todas as empresas de uma vez** e prende a elas todas as entregas
concluídas ainda não faturadas.

**Por que importa:** é a ação de maior alcance do painel inteiro, e a única
saída dela é cancelar fatura por fatura. O botão está corretamente desligado
fora de segunda-feira (`hojeEhDiaDeFechar`), o que reduz a chance — mas na
segunda ele é um botão comum, do lado de outros botões comuns.

**Como confirmei:** li o `onClick` e o `closeInvoices` no
`apps/api/src/finance/invoice.service.ts`, que percorre todas as empresas.

**Ressalva honesta:** rodar duas vezes não duplica cobrança — a segunda execução
não encontra entregas sem fatura e não faz nada. O risco real é fechar num dia
em que não se queria fechar, não fechar duas vezes.

---

## Média

### [Média] `GET /deliveries` não tem paginação nem limite, e cinco telas o consomem

**Onde:** `apps/api/src/deliveries/deliveries.service.ts:546` (sem `take`, sem
`skip`, com `include: { company: true, serviceType: true }`)

Consumido por:

| Tela | O que pede |
| --- | --- |
| `src/app/(app)/pedidos/page.tsx:58` | **tudo**, quando o filtro está em "ALL" |
| `src/app/(app)/clientes/[id]/page.tsx:54` | todos os pedidos da empresa, desde sempre |
| `src/app/(app)/entregadores/[id]/page.tsx:80` | todos os pedidos do motoboy, desde sempre |
| `src/app/(app)/entregadores/[id]/page.tsx:86` | segunda chamada, mesma rota |
| `src/app/(app)/relatorios/historico/page.tsx:79` | sem período aplicado, traz tudo |

**Por que importa:** hoje a base tem dezenas de pedidos e funciona. Com um mês
de operação real são milhares de linhas — cada uma com a empresa e o tipo de
serviço embutidos — atravessando a rede para preencher uma tabela. É o mesmo
defeito que existia em `/indicadores` no painel da loja.

**A correção já existe no repositório:** `deliveries.search`
(`deliveries.service.ts:638`) tem `skip`, `take`, `page`, `pageSize` e
contagem total. Foi construída para os relatórios do painel da loja. As cinco
telas acima podem migrar para ela.

**Como confirmei:** li o `findMany` da `list` procurando `take`/`skip` (não há),
e comparei com o `search`, que tem.

---

### [Média] Duas telas somam dinheiro em `float`, no navegador

**Onde:**
- `src/app/(app)/clientes/[id]/page.tsx:96,97,104,107`
- `src/app/(app)/entregadores/[id]/page.tsx:100`

**O que acontece:** `deliveries.reduce((sum, d) => sum + (d.totalValue ?? 0), 0)`
soma valores em ponto flutuante. `0.1 + 0.2` é `0.30000000000000004`; sobre
centenas de entregas, os centavos escorregam.

**Por que importa:** a linha 100 do detalhe do motoboy é o **repasse total** —
o número que ele vai perguntar por que não bate com o extrato. E as somas do
detalhe do cliente são o que se olha antes de negociar preço com a loja.

**A correção já existe:** `somarDinheiro()` em `src/lib/dinheiro.ts:27`, que
soma em centavos inteiros. Nenhuma dessas cinco linhas a usa.

**Como confirmei:** li as cinco linhas e o helper.

---

### [Média] Cancelar pedido continua sem confirmação em duas telas

**Onde:**
- `src/app/(app)/pedidos/page.tsx:198`
- `src/app/(app)/pedidos/[id]/page.tsx:157`

**O que acontece:** `cancelMutation.mutate(...)` direto no `onClick`, sem
diálogo e sem motivo.

**Por que importa:** cancelar pedido que já tem motoboy faz a corrida sumir do
aplicativo dele sem aviso, e o pedido não pode ser reaberto. Na tela de lista
(`pedidos/page.tsx:198`) o botão fica numa linha de tabela, ao lado de outras
linhas — a chance de clicar na errada é maior do que no painel lateral.

**Nota:** a home já foi corrigida e tem
`components/operations/cancel-delivery-dialog.tsx`, que estas duas telas podem
reaproveitar sem escrever nada novo. **É uma lacuna do próprio conserto
anterior**, não um defeito antigo intocado.

**Como confirmei:** li os dois `onClick` e comparei com o diálogo já existente.

---

### [Média] "Hoje" é calculado em UTC ao marcar pagamento

**Onde:** `src/app/(app)/faturas/[id]/page.tsx:29`

```ts
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
```

**O que acontece:** o valor preenche a data de pagamento por padrão
(`useState(today)`, linha 48). São Paulo é UTC−3, então **entre 21:00 e
meia-noite o campo já vem com a data de amanhã**.

**Por que importa:** conferência de pagamento à noite é comum, e o admin não
tem motivo para desconfiar de um campo já preenchido. A fatura fica com data de
pagamento no futuro, e o extrato do dia não fecha com o do banco.

**A correção já existe:** `dateInSaoPaulo` do lado do servidor, e o padrão
`toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })` que outras
telas já usam.

**Como confirmei:** li a função e o `useState` que a consome.

---

### [Média] Quatro telas não têm estado de erro nenhum

**Onde:**
- `src/app/(app)/configuracoes/horario/page.tsx`
- `src/app/(app)/configuracoes/taxas/page.tsx`
- `src/app/(app)/financeiro/page.tsx`
- `src/app/(app)/relatorios/historico/page.tsx`

**O que acontece:** nenhuma delas menciona `isError`. Falha de carregamento vira
tela vazia.

**Por que importa:** em `configuracoes/taxas` isso é pior que estética. A tela
lista as taxas adicionais vigentes; se a consulta falhar, ela mostra **nenhuma
taxa** — e quem olhar vai concluir que não há taxa configurada, quando pode
haver taxa noturna ativa cobrando de todo mundo.

**Como confirmei:** varri todos os arquivos com `useQuery` em `src/app`
procurando `isError`; estes quatro não têm.

---

## Baixa

### [Baixa] Ações sobre pessoas disparam sem confirmação

**Onde:**
- `src/app/(app)/clientes/page.tsx:120` — aprovar empresa
- `src/app/(app)/entregadores/page.tsx:347` — recusar motoboy
- `src/app/(app)/entregadores/page.tsx:370,392` — bloquear motoboy

**O que acontece:** um clique aprova, recusa ou bloqueia.

**Por que importa:** bloquear motoboy corta a renda de alguém. É reversível
(dá para desbloquear), por isso não é alta — mas o motoboy fica sem receber
oferta até alguém perceber.

---

### [Baixa] Excluir taxa e desativar tabela de preços também são um clique

**Onde:**
- `src/app/(app)/configuracoes/taxas/page.tsx:440` — remover taxa
- `src/app/(app)/configuracoes/tabela-de-precos/page.tsx:565` — desativar tabela

**Por que importa:** desativar a tabela de preços errada faz a cotação de
pedidos daquela região parar de funcionar. O efeito aparece no próximo pedido
lançado, não na hora do clique.

---

### [Baixa] Datas do detalhe da fatura não fixam o fuso

**Onde:** `src/app/(app)/faturas/[id]/page.tsx:26`

**O que acontece:** `new Intl.DateTimeFormat('pt-BR', { dateStyle, timeStyle })`
sem `timeZone`, usado nas linhas 179 e 204. Formata no fuso do navegador.

**Por que importa:** hoje está certo, porque a máquina de quem opera está em
horário de Brasília. Fica errado se alguém abrir de outro fuso. Baixa porque é
um problema que ainda não existe.

---

### [Baixa] `faturas-tab.tsx` divergiu entre os dois painéis

**Onde:** `src/components/finance/faturas-tab.tsx` e o arquivo de mesmo nome em
`apps/company-web`.

**O que acontece:** `metric-card.tsx` e `finance-tabs.tsx` continuam idênticos
nos dois painéis; `faturas-tab.tsx` já não é. A divergência é legítima — o
admin fecha faturas e a loja não —, mas os nomes iguais sugerem que são o mesmo
componente.

**Por que importa:** quem for corrigir um defeito na lista de faturas vai
corrigir num painel e achar que corrigiu nos dois.

---

## Onde começariam os testes

`apps/admin-web` não tem **nenhum** teste: nem arquivo, nem script no
`package.json`. Em vez de recomendar "adicionar testes", estas são as três
telas que mais mereceriam o primeiro, e o porquê:

1. **`src/lib/dinheiro.ts` e `src/lib/money.tsx`** — não é tela, e é justamente
   por isso que vem primeiro. `somarDinheiro`, `formatarDinheiro` e a máscara do
   `useMoney` são usados por todo o painel, são funções puras, e um erro neles
   aparece como número errado em dezenas de lugares. Custo mais baixo, alcance
   maior.

2. **`src/app/(app)/faturas/[id]/page.tsx`** — concentra dois achados desta
   auditoria (baixa sem confirmação e `today()` em UTC) e mexe em dinheiro de
   verdade. Um teste que fixe "a data padrão é hoje em São Paulo" trava a
   regressão de fuso para sempre.

3. **`src/components/finance/faturas-tab.tsx`** — tem a ação de maior alcance do
   painel, e a regra de quando o botão de fechar pode ser clicado
   (`hojeEhDiaDeFechar`) é lógica de calendário, que é exatamente o tipo de
   coisa que quebra em virada de mês e ninguém percebe.

---

## O que eu olhei e estava certo

Hipóteses do prompt testadas e **descartadas**. Não vale reabrir sem fato novo.

- **Rota de admin sem guarda.** Os 15 controllers com `@Controller('admin...')`
  têm `AdminOnlyGuard`. Nenhum ficou de fora.
- **Dado sensível em query string.** Nenhuma ocorrência de CPF, e-mail, chave
  PIX ou documento em URL, nem no painel nem no cliente de API.
- **Formatador de dinheiro fora do `useMoney`.** Zero. A home era a última e foi
  corrigida; a única menção a `Intl.NumberFormat` que sobrou está dentro de um
  comentário explicando por que ela saiu.
- **Datas formatadas sem fuso.** As dez ocorrências de `toLocaleString` sem
  `timeZone` são todas sobre **números** (km, porcentagem), não datas. Falso
  positivo do padrão de busca.
- **`slice(0, 10)` sobre ISO.** Só uma ocorrência real, já reportada acima
  (`faturas/[id]:29`). A outra está num comentário do `dinheiro.ts` explicando
  por que não se deve fazer isso.
- **Agregação de dinheiro no navegador nos relatórios.** Os `reduce` em
  `relatorios/entregadores` somam **contagens inteiras** (ofertas recebidas,
  aceitas, concluídas), não dinheiro. Corretos como estão.
- **Componentes duplicados que já divergiram.** Só `faturas-tab.tsx`, reportado
  como baixa. `metric-card` e `finance-tabs` seguem idênticos.

---

## O que ficou de fora desta rodada

- Os três achados da revisão anterior da home continuam em aberto e **não foram
  recontados aqui**: invalidação da consulta a cada posição de motoboy, feed de
  auditoria engolido por presença online/offline, e ausência de números do dia.
- O **aviso de pagamento** (`components/finance/avisos-tab.tsx`) acabou de ser
  construído e não foi auditado como código maduro.
- Não avaliei acessibilidade, comportamento em telas estreitas, nem o modo
  escuro.

---

## Situação após a rodada de correções (24/08/2026)

| # | Achado | Situação |
| --- | --- | --- |
| Alta | Marcar fatura como paga sem confirmação | corrigido — `components/finance/mark-paid-dialog.tsx` |
| Alta | "Fechar faturas da semana" sem confirmação | corrigido — `components/finance/close-invoices-dialog.tsx` |
| Média | Cancelar pedido sem confirmação em `/pedidos` e `/pedidos/[id]` | corrigido, reaproveitando `cancel-delivery-dialog` |
| Média | `today()` em UTC ao marcar pagamento | corrigido — saiu junto com o diálogo de baixa |
| Média | Soma de dinheiro em float | corrigido — `somarDinheiro()` nas 5 linhas |
| Média | `GET /deliveries` sem paginação | corrigido **em `/pedidos`**; as outras 4 telas seguem abertas (ver abaixo) |
| Média | Telas sem estado de erro | corrigido em 3 de 4 — ver correção do próprio achado |
| Baixa | Ações sobre pessoas sem confirmação | em aberto |
| Baixa | Excluir taxa e desativar tabela sem confirmação | em aberto |
| Baixa | Datas do detalhe da fatura sem fuso fixo | em aberto |
| Baixa | `faturas-tab.tsx` divergiu entre os painéis | em aberto |

### Correção do próprio relatório

Agrupei **`/financeiro` mal** entre as "quatro telas sem estado de erro". As
seis abas dela (`painel`, `carteiras`, `faturas`, `recebimentos`,
`demonstrativo`, `avisos`) tratam erro cada uma por conta própria — o conteúdo
está coberto. As consultas no nível da página servem só aos distintivos, e o
que acontece numa falha é o distintivo não aparecer, que se lê como "nada
pendente". Isso é **baixa**, não média, e continua em aberto.

### Por que `GET /deliveries` só foi corrigido em uma tela

`/pedidos` migrou para `deliveries.search`, com paginação de 25 e contagem
vinda do servidor. Verificado na tela: "22 pedido(s) · página 1 de 1", batendo
com o banco.

As outras quatro **não podem simplesmente paginar**, e o motivo importa:

- `clientes/[id]` e `entregadores/[id]` calculam **totais sobre a lista
  inteira** — valor faturado da empresa, repasse do motoboy. Paginar ali
  transformaria "total do cliente" em "total desta página", que é um erro
  silencioso e pior que a lentidão atual. O certo é um endpoint de agregação no
  servidor, como o `company/financial/summary` que já existe do lado da loja.
- `relatorios/historico` exporta CSV do que está carregado. Paginar sem mudar a
  exportação faria o CSV sair com uma página só, sem avisar.

Ou seja: as três exigem decisão de contrato, não troca de chamada. Ficam
anotadas aqui em vez de serem "corrigidas" de um jeito que quebra o número.

---

## Achado fora do escopo: endereços das entregas sumiram do banco de desenvolvimento

Apareceu enquanto se olhava a tela de detalhe de um pedido, que mostrava
"Endereço de coleta não registrado" e "Endereço de entrega ainda não
registrado".

**Não é defeito de código, e não é defeito de tela.**

Fatos verificados em 24/08/2026:

- `delivery_addresses` tem **zero linhas** para as 22 entregas do banco de
  desenvolvimento.
- As 22 têm `destinationKnownAtCreation = true` — o sistema registrou que o
  destino foi informado. Os dois dados se contradizem.
- O código de gravação existe nos **dois** caminhos de criação
  (`deliveries.service.ts:343` e `:500`) desde 09/08; as entregas são de 22–23/08.
- `deliveries.e2e-spec.ts` cria pedido pelo HTTP real e afirma
  `expect(response.body.addresses).toHaveLength(2)`. **Passa hoje.** A gravação
  funciona.
- A tela procura `PICKUP`/`DROPOFF` na lista e só mostra o aviso quando não
  encontra (`pedidos/[id]/page.tsx:135-136`). Está correta.

Descartado, um a um: nenhum código de produção apaga endereço; nenhuma migração
derruba a tabela; as cinco limpezas dos testes têm filtro próprio (os quatro
specs de entrega criam a própria modalidade, não reutilizam a real); e o
histórico do Git nunca teve um `deleteMany` sem filtro.

**Como os registros sumiram continua sem explicação.** Não foi possível provar
a causa com as evidências disponíveis, e nenhuma hipótese foi confirmada.

### A consequência que importa mais que a tela

Sem coordenada de destino, `assertNearDropoff` (`deliveries.service.ts:1836`)
**não roda**: grava um aviso no log e libera. A trava de "só finaliza perto do
destino informado" não valeu para nenhuma dessas 22 entregas. Para pedidos
novos, com endereço gravado, ela volta a valer.

### Como fechar isso em um minuto

Lançar um pedido real pelo painel da loja e conferir se as duas linhas de
endereço aparecem. Com o motoboy offline não dispara oferta nem push. Se
aparecerem, o problema é só nos dados antigos e não há o que corrigir; se não
aparecerem, existe defeito vivo e passa a haver um caso reproduzível.
