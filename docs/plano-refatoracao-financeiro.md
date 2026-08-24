# Plano — refatoração da área Financeiro (admin-web)

Documento de execução. Quem implementar não precisa de contexto além daqui.

---

## 1. Situação de hoje

A área financeira está **espalhada em quatro rotas sem ligação visível** entre
si, e a página principal mostra números sem dizer o que fazer com eles.

| Rota | Linhas | O que faz |
| --- | --- | --- |
| `/financeiro` | 314 | Posição de caixa + carteiras de motoboy + período |
| `/faturas` | 255 | Lista de faturas |
| `/financeiro/saques` | 260 | Fila de saques |
| `/financeiro/saques/[id]` | 297 | Aprovar / recusar um saque |

Problemas concretos, não estéticos:

1. **Não há navegação entre elas.** Quem está em `/financeiro` não descobre
   `/faturas` — a ligação existe só no menu lateral, misturada com o resto.

2. **Números sem ação.** "Pedidos ainda não cobrados: R$ 5.978" é a informação
   mais acionável da tela, e não há botão para gerar as faturas. A ação existe
   na API (`POST /admin/financial/invoices/close`) e não tem porta na interface.

3. **A fila de saques não aparece onde se olha o caixa.** O saque pendente é
   dívida exigível; hoje só aparece como número, e a fila fica em outra rota.

4. **Não existe extrato de recebimentos.** Não há como responder "quanto entrou
   ontem?" sem abrir fatura por fatura.

5. **Carteiras de empresa existem no banco e não em lugar nenhum.** O modelo
   `Wallet` tem `companyId`, hoje com zero registros e nenhuma tela.

6. **Tudo em cinza.** Faturado, vencido, a receber e bloqueado têm a mesma cor,
   e o vencido é o único que exige ação hoje.

---

## 2. O que a referência faz melhor

Da análise das telas do concorrente — **estrutura apenas**; as telas contêm
dados bancários e pessoais de terceiros que não foram registrados:

- **Uma área, quatro abas**: Dashboard · Carteiras · Faturas · Recebimentos.
  Tudo que é dinheiro mora sob o mesmo teto.
- **Contador na aba.** "Carteiras Digitais ④" — o número de saques esperando
  aparece antes de clicar.
- **Cor com significado**: amarelo para o que ainda não virou fatura, laranja
  para o pendente, vermelho para o vencido, verde para o que entra.
- **Ação junto do número.** A lista de pedidos sem fatura tem seleção por linha
  e o botão de gerar as faturas do lado.
- **Recebimentos agrupados por dia**, com total do dia no cabeçalho.
- **Blocos analíticos por período** separados do caixa de agora.

---

## 3. Arquitetura alvo

```
/financeiro                     ← página única, quatro abas em URL
  ?aba=painel        (padrão)
  ?aba=carteiras
  ?aba=faturas
  ?aba=recebimentos
```

**Aba na URL, não em estado local.** Sem isso o admin não consegue mandar o
link da fila de saques para alguém, e o F5 devolve para o painel. Usar
`useSearchParams` + `router.replace`.

`/faturas` e `/financeiro/saques` continuam existindo e **redirecionam** para a
aba correspondente. Link antigo em conversa não pode quebrar.

### Componentes novos

```
src/components/finance/
  finance-tabs.tsx          Abas com contador opcional
  metric-card.tsx           Cartão colorido: ícone, rótulo, valor, dica
  money.tsx                 Valor monetário com sinal e cor por intenção
  day-group.tsx             Cabeçalho de dia com total, para o extrato
  invoice-batch-panel.tsx   Seleção de pedidos + geração de faturas
  withdrawal-queue.tsx      Fila de saques embutível
```

---

## 4. Sistema de cor

Hoje tudo é cinza. A cor precisa significar **estado do dinheiro**, e não
enfeite — senão vira ruído e para de ser lida.

| Intenção | Cor | Onde |
| --- | --- | --- |
| Ainda não cobrado | Âmbar | Pedidos sem fatura |
| Aguardando | Laranja | Faturas pendentes, saques pendentes |
| Atrasado, exige ação | Vermelho | Faturas vencidas |
| Entrou / disponível | Verde | Recebido, saldo disponível |
| Retido | Cinza | Saldo bloqueado |
| Informativo | Azul | Contagens, totais neutros |

Regras:

- **Vermelho só para o que exige ação hoje.** Se tudo pode ficar vermelho, o
  vermelho não avisa nada.
- **Zero não é verde.** "R$ 0,00 vencido" é neutro, não é conquista.
- Cada cartão leva ícone da mesma família (`lucide-react`, já no projeto).
- Contraste conferido em AA. Texto colorido sobre fundo colorido claro, nunca
  colorido sobre branco puro em corpo pequeno.

---

## 5. Aba 1 — Painel

### Bloco A: A receber (linha de quatro cartões)

| Cartão | Origem | Cor |
| --- | --- | --- |
| Pedidos sem fatura | `cashPosition.unbilledValue` | âmbar |
| Faturas pendentes | `cashPosition.invoicesDueValue` | laranja |
| Faturas vencidas | `cashPosition.invoicesOverdueValue` | vermelho |
| Total a receber | `cashPosition.totalReceivable` | verde |

Cada um mostra a contagem como dica (`unbilledCount` etc.), que já existe no
tipo `CashPositionItem`.

**Cada cartão é clicável** e leva para a aba com o filtro já aplicado. É o que
falta hoje: o número não leva a lugar nenhum.

### Bloco B: Carteiras

Duas colunas — Motoboys e Empresas — cada uma com saldo disponível e saldo
negativo, mais dois cartões soltos: saques pendentes e total bloqueado.

**A coluna de Empresas fica visível com valor zero e uma nota** explicando que
carteira de empresa ainda não é usada na operação. Esconder daria a impressão de
que a funcionalidade não existe; mostrar zerado diz a verdade.

### Bloco C: Analítico por período

Filtro de data no topo do bloco, separado do caixa. Cartões:

- Faturas recebidas no período
- Entregas concluídas (contagem)
- Valor total das entregas
- Repasse aos motoboys
- Comissão da plataforma
- Saques solicitados / pagos / pendentes no período

Origem: `GET /admin/financial/overview?from&to` — já existe, hoje mostrado só
parcialmente.

**O período NÃO afeta o bloco de caixa.** Caixa é sempre "agora"; misturar os
dois é a confusão mais comum nesse tipo de tela. Deixar isso escrito na
interface, não só no código.

---

## 6. Aba 2 — Carteiras

Quatro seções recolhíveis, a primeira aberta:

1. **Solicitações de saque pendentes** — contador vermelho na aba e no título
2. Carteiras de motoboys — busca por nome, saldo disponível e bloqueado
3. Carteiras de empresas — vazia por enquanto, com a nota
4. Histórico de saques — busca, ordenação, status colorido

A fila pendente vem primeiro porque é a única com prazo.

O detalhe do saque (`/financeiro/saques/[id]`) continua em rota própria: é uma
decisão com consequência financeira e merece endereço próprio, com o histórico
auditável que já existe lá.

**Não replicar os dados bancários na lista.** Conta, agência e chave Pix só na
tela de detalhe, para quem vai efetuar o pagamento. Numa lista aberta na sala
eles ficam expostos sem necessidade.

---

## 7. Aba 3 — Faturas

Duas seções.

### 7.1 Pedidos pendentes de fatura

O que hoje não existe na interface e é a maior perda de tempo do admin.

- Filtro por data e por empresa
- Tabela com seleção: pedido, data, empresa, valor do motoboy, comissão, total
- Rodapé fixo com o resumo do que está selecionado
- Campo de data de vencimento
- Botão **Gerar faturas** — uma por empresa, agrupando os pedidos escolhidos

API: `POST /admin/financial/invoices/close` já existe. **Conferir o contrato
antes de implementar**: se ele fecha por empresa/período em vez de por lista de
pedidos, ou a tela se adapta ou o endpoint ganha uma variante. Não inventar
comportamento do lado do cliente.

Regras que a tela precisa respeitar:

- Só pedido `COMPLETED` com `paymentMethod: BILLED` e `invoiceId: null` entra.
  Pedido pago online nunca vira fatura — a regra já está no service e a tela não
  pode sugerir o contrário.
- Selecionar tudo seleciona **o que está filtrado**, não o banco inteiro.
- Vencimento no passado: avisar, não bloquear. Fatura retroativa acontece.

### 7.2 Faturas emitidas

A lista de hoje, com status colorido, filtro por empresa e período, e ação de
marcar como paga.

---

## 8. Aba 4 — Extrato de recebimentos

Não existe hoje. Responde "quanto entrou e quando".

- Filtro por período
- Agrupado por dia, com **total do dia no cabeçalho do grupo**
- Cada linha: número da fatura, empresa, valor, forma de pagamento
- Filtro "somente pagos online"

**Precisa de endpoint novo:** `GET /admin/financial/receipts?from&to&onlineOnly`,
devolvendo faturas com `paymentDate` no intervalo, agrupadas por dia no
servidor. Agrupar no cliente obrigaria a baixar tudo e quebraria com o volume de
um ano.

O fuso é `America/Sao_Paulo`, resolvido por `Intl`. Agrupar por dia em UTC joga
recebimento da noite para o dia seguinte.

---

## 9. Ordem de execução

Cada etapa termina com typecheck, lint e testes verdes.

| # | Etapa | Depende de |
| --- | --- | --- |
| 1 | `metric-card`, `money`, `finance-tabs` + cores no tema | — |
| 2 | Aba Painel com o que a API já devolve | 1 |
| 3 | Aba Carteiras, movendo a fila de saques para dentro | 1 |
| 4 | Redirecionar `/faturas` e `/financeiro/saques` | 2, 3 |
| 5 | Aba Faturas — lista existente | 1 |
| 6 | Endpoint de recebimentos + testes | — |
| 7 | Aba Recebimentos | 6 |
| 8 | Geração de faturas em lote | 5 |

Etapas 1–5 não tocam a API. Se o prazo apertar, param aí e a tela já melhora.

---

## 10. Regras inegociáveis

Vieram de erros reais cometidos neste repositório.

1. **Não inventar campo que a API não devolve.** Conferir o tipo em
   `packages/types/src/finance.ts` e `pricing.ts` antes de escrever a tela.

2. **Dinheiro é `Decimal(10,2)` no banco.** Nunca somar float no cliente para
   exibir total: pedir ao servidor ou somar em centavos inteiros.

3. **Fuso pelo `Intl`, com `America/Sao_Paulo`.** Nunca subtrair 3 horas na mão.

4. **Mês em `Date.UTC` começa em zero.** Já causou bug de período aqui.

5. **`undefined !== null` é verdadeiro.** Ao checar campo opcional vindo da API,
   usar `== null` ou `Boolean(x)` — nunca `!== null` sozinho. Este erro já
   passou por revisão neste projeto uma vez.

6. **Nada de `useState` + `useEffect` para semear estado.** A regra
   `react-hooks/set-state-in-effect` está ligada e reprova. Usar
   `useSyncExternalStore` ou derivar no render.

7. **Rodar prettier só nos arquivos alterados**, nunca em diretório: já
   reformatou 22 arquivos alheios de uma vez aqui.

8. **Dados bancários só na tela de detalhe do saque.** Nunca em lista.

9. **Intervalo de data é semiaberto** (`>= from`, `< to + 1 dia`). Comparar com
   `<=` numa coluna com hora perde os recebimentos do último dia.

10. **Toda contagem exibida precisa bater com a lista que ela abre.** Se a aba
    diz "④" e a lista mostra 3, a tela perde a confiança do admin — e ele volta
    a conferir no banco.

---

## 11. Verificação

Antes de considerar pronto:

- [ ] `pnpm --filter @motoboycity/admin-web typecheck` limpo
- [ ] `pnpm --filter @motoboycity/admin-web lint` sem avisos novos
- [ ] Testes da API verdes se a etapa 6 ou 8 foi feita
- [ ] Painel com base zerada não mostra `NaN` nem `R$ undefined`
- [ ] Contador da aba bate com a lista
- [ ] Filtro de período não altera o bloco de caixa
- [ ] Links antigos `/faturas` e `/financeiro/saques` continuam abrindo
- [ ] Contraste AA nos cartões coloridos
- [ ] Tabelas rolam no celular sem estourar a página
