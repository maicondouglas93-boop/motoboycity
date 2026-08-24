# Financeiro — o que falta implementar

Documento de execução, escrito para quem chegar sem contexto. Cada item diz o
que existe, o que falta e por quê.

Contexto: a área financeira foi refatorada em `/financeiro`, com quatro abas
(Painel, Carteiras, Faturas, Recebimentos) e a aba ativa na URL. Ver
`docs/plano-refatoracao-financeiro.md` para as decisões já tomadas.

---

## Já feito (não refazer)

| Entregue | Onde |
| --- | --- |
| Quatro abas com estado na URL | `src/app/(app)/financeiro/page.tsx` |
| Cartões coloridos por intenção | `src/components/finance/metric-card.tsx` |
| Extrato de recebimentos + endpoint | `GET /admin/financial/receipts` |
| Envelhecimento da dívida por empresa | `src/components/finance/receivables-aging.tsx` |
| Ajuste manual de carteira | `POST /admin/financial/driver-wallets/:driverId/adjustments` |

---

## 1. Obrigações por entregador — SÓ INTERFACE

**Existe pronto e nenhuma tela usa:** `GET /admin/financial/payouts-aging`,
já exposto no `adminFinancialApi.payoutsAging(token)`.

Devolve `PayoutsAgingReport` (`packages/types/src/finance.ts`):

- `totalObligation` — tudo que a operação deve aos motoboys agora
- `wallets.divergentCount` — carteiras cujo cache discorda do ledger
- `withdrawals.maxOpenDays` e `oldestOpenDate` — há quanto tempo alguém espera
- `buckets` — faixas `OPEN_0_1`, `OPEN_2_3`, `OPEN_4_7`, `OPEN_8_PLUS`
- `drivers` — `DriverPayoutPositionItem[]` com `totalObligation` por motoboy

**Onde colocar:** dentro da aba Carteiras
(`src/components/finance/carteiras-tab.tsx`), acima da tabela de carteiras.

**Como desenhar:** espelhar `receivables-aging.tsx` — as faixas como cartões e a
lista por motoboy abaixo. Ordenar por **dias de espera**, não por valor: quem
espera há 8 dias é um problema; quem pediu hoje é fluxo normal.

`divergentCount` maior que zero merece destaque em vermelho — é erro de
contabilidade, não detalhe.

---

## 2. Cancelar fatura — BACKEND + INTERFACE

**O que existe:** o enum `InvoiceStatus` tem `CANCELLED`, e
**nenhuma rota o produz**. Fatura emitida errada hoje não tem saída.

**O que falta:**

1. `PATCH /admin/financial/invoices/:id/cancel` em
   `apps/api/src/finance/invoice.controller.ts`
2. Schema com **motivo obrigatório** (mesmo padrão de
   `adjustDriverWalletSchema`: mínimo de 10 caracteres)
3. No serviço:
   - Recusar cancelar fatura já `PAID` — dinheiro que entrou não se cancela,
     se estorna. Devolver `ConflictException` explicando isso.
   - **Soltar as entregas**: `invoiceId: null` nas entregas vinculadas, senão
     elas somem do "sem fatura" e nunca mais são cobradas
   - Gravar em `InvoiceStatusHistory` com o autor
4. Botão na aba Faturas, com confirmação e o motivo

**Cuidado:** o passo de soltar as entregas é o que impede dinheiro de sumir. Sem
ele, cancelar a fatura apaga a cobrança em vez de reabri-la.

---

## 3. Antecipação de saldo — BACKEND INTEIRO

**O que existe:** o modelo `AdvanceRequest` no schema, com
`blockedAmountAntecipado`, `feeAmount`, `netAmount`, `status` e
`resultingWithdrawalRequestId`. **Não há serviço, nem endpoint, nem tela.**
É funcionalidade modelada e nunca construída.

**O que é:** o motoboy pede para receber antes o saldo que ainda está bloqueado
(o repasse só libera na segunda). A operação cobra uma taxa por isso.

**O que falta, na ordem:**

1. Serviço com `requestAdvance` (motoboy) e `approve`/`reject` (admin)
2. A aprovação precisa, **na mesma transação**:
   - Mover o valor de bloqueado para disponível — via lançamento no ledger,
     nunca escrevendo o saldo
   - Lançar a taxa como `DEBIT_FEE`
   - Opcionalmente criar o `WithdrawalRequest` decorrente
3. Endpoints no app do motoboy e no admin
4. Fila de aprovação na aba Carteiras, junto da fila de saques

**Só construir se o motoboy pedir no piloto.** É a mais cara da lista e a única
sem demanda comprovada.

---

## 4. Demonstrativo por competência — SÓ INTERFACE

**Existe pronto:** `GET /admin/financial/financial-statement?from&to`, exposto
em `adminFinancialApi.financialStatement(token, { from, to })`.

Devolve `FinancialStatementReport` com `totals`, `comparison` (período
anterior), `walletAdjustments` separados, e as dimensões `companies`,
`serviceTypes`, `paymentMethods` e `days`.

**Onde colocar:** aba nova (`?aba=demonstrativo`) ou dentro do Painel, abaixo do
bloco de período. Preferir aba nova — o Painel já tem 12 cartões e mais um bloco
o dilui.

**Por que os ajustes vêm separados:** ajuste manual não é receita nem despesa da
operação, é correção. Somá-los ao resultado faria um mês com muitas correções
parecer melhor ou pior do que foi.

---

## Regras que valem para todos os itens

Vieram de erros reais cometidos neste repositório.

1. **Nunca criar um segundo formatador de moeda.** Quem formata dinheiro é o
   `useMoney()` de `src/lib/money.tsx`, e só ele — é o que aplica a máscara
   `R$ ••••` quando o dono esconde os valores para mostrar a tela a alguém. Um
   segundo formatador fura essa máscara em silêncio.

2. **Dinheiro não se escreve no saldo.** A carteira é a soma das linhas do
   ledger. Toda movimentação é um `WalletTransaction` novo, e o cache do saldo
   é atualizado **na mesma transação**. Ver `adjustDriverWallet` como modelo.

3. **Nada se apaga nem se edita.** Erro se corrige com lançamento novo, e os
   dois ficam visíveis. Por isso as ações de dinheiro são `POST`, não `PATCH`.

4. **Toda ação de dinheiro exige motivo e autor.** Sem os dois é movimentação
   sem rastro. Piso de 10 caracteres no motivo — "ajuste" não explica nada.

5. **Vermelho só para o que exige ação hoje.** E **zero nunca é verde nem
   vermelho** — use `neutralizarZero` no `MetricCard`. Pintar zero de vermelho
   ensina o admin a ignorar o vermelho.

6. **Fuso pelo `Intl`, com `America/Sao_Paulo`.** Nunca subtrair 3 horas na mão.
   Agrupar por dia com `toISOString()` joga tudo depois das 21h para o dia
   seguinte — já quase aconteceu no extrato de recebimentos.

7. **Somar dinheiro em centavos inteiros** (`somarDinheiro` em
   `src/lib/dinheiro.ts`), ou pedir o total ao servidor. `0.1 + 0.2` é
   `0.30000000000000004`.

8. **`undefined !== null` é verdadeiro.** Ao checar campo opcional da API, usar
   `== null` ou `Boolean(x)`. Este erro já passou por revisão aqui uma vez.

9. **Diálogo é Base UI, não Radix.** Usa `render={<Button/>}`, não `asChild`.

10. **Rodar prettier só nos arquivos alterados**, nunca em diretório: já
    reformatou 22 arquivos alheios de uma vez.

11. **`toEqual` estrito em teste e2e quebra quando a API ganha campo novo.**
    Se você adicionar campo em resposta, procure as asserções estritas antes de
    dar por pronto.

---

## Verificação antes de dar por pronto

- [ ] `pnpm -r typecheck` limpo
- [ ] `pnpm -r lint` sem avisos novos
- [ ] `pnpm exec jest` na API verde
- [ ] Tela com base zerada não mostra `NaN` nem `R$ undefined`
- [ ] Contador de aba bate com a lista que ele abre
- [ ] Testado contra a API rodando, não só com mock
- [ ] Se mexeu em dinheiro: o extrato e o saldo batem depois da operação
