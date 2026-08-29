# Financeiro — o que falta implementar

> **Documento de época — leia com data.** Registra o plano de 2026-08-24. O
> sistema andou bastante desde então: itens aqui podem já estar prontos,
> descartados ou superados. Para o estado atual use `agent-handoff.md` e
> `architecture.md`, e **confirme no código** antes de agir.

Documento de execução, escrito para quem chegar sem contexto. Cada item diz o
que existe, o que falta e por quê.

Contexto: a área financeira foi refatorada em `/financeiro`, com cinco abas
(Painel, Carteiras, Faturas, Recebimentos, Demonstrativo) e a aba ativa na URL. Ver
`docs/plano-refatoracao-financeiro.md` para as decisões já tomadas.

---

## Já feito (não refazer)

| Entregue | Onde |
| --- | --- |
| Cinco abas com estado na URL | `src/app/(app)/financeiro/page.tsx` |
| Cartões coloridos por intenção | `src/components/finance/metric-card.tsx` |
| Extrato de recebimentos + endpoint | `GET /admin/financial/receipts` |
| Envelhecimento da dívida por empresa | `src/components/finance/receivables-aging.tsx` |
| Ajuste manual de carteira | `POST /admin/financial/driver-wallets/:driverId/adjustments` |
| Obrigações por entregador | `src/components/finance/payouts-aging.tsx` |
| Cancelar fatura | `PATCH /admin/financial/invoices/:id/cancel` |
| Demonstrativo por competência | `src/components/finance/demonstrativo-tab.tsx` |

---

## Único item restante — Antecipação de saldo — BACKEND INTEIRO

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
