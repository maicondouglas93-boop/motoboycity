# Plano — área financeira do painel da empresa

Documento de execução. Quem implementar não precisa de contexto além daqui.

O painel do admin já foi refatorado (`docs/plano-refatoracao-financeiro.md` e
`docs/financeiro-o-que-falta.md`). Este é o outro lado do balcão: o que a
**loja** vê sobre o próprio dinheiro.

---

## 1. Situação de hoje

A empresa tem **duas rotas financeiras, ambas só de leitura**:

| Rota da API | O que faz |
| --- | --- |
| `GET /company/invoices` | Lista as faturas |
| `GET /company/invoices/:id` | Detalhe com os pedidos |

E duas telas: `/faturas` (208 linhas) e `/faturas/[id]` (201 linhas).

### O que falta, do ponto de vista da loja

1. **Não existe "quanto eu devo".** A lista mostra faturas uma a uma; não há
   nenhum lugar que responda "qual meu saldo com a plataforma hoje".

2. **Não dá para saber o que está por vir.** Os pedidos já feitos e ainda não
   faturados são invisíveis para a loja — ela só descobre o valor na
   segunda-feira, quando a fatura fecha. É a informação mais útil da semana e a
   única que ela não tem.

3. **Fatura vencida não avisa.** O status aparece na lista, mas nada chama
   atenção. Quem não abre a tela não descobre.

4. **Não há como sinalizar pagamento.** Só o admin marca como paga. A loja paga
   por PIX, manda comprovante por WhatsApp, e espera alguém lembrar de dar
   baixa.

5. **Não há exportação.** Contabilidade pede o extrato do mês; hoje a saída é
   copiar da tela.

6. **Os indicadores agregam no navegador.** `/indicadores` chama
   `GET /deliveries` — que **não tem paginação nem limite** — e soma tudo no
   cliente. Com 22 entregas funciona. Com um mês real de operação, a tela baixa
   milhares de registros para calcular uma média.

---

## 2. Arquitetura alvo

```
/financeiro                     ← área nova, três abas em URL
  ?aba=resumo        (padrão)
  ?aba=faturas
  ?aba=pedidos
```

`/faturas` redireciona para `?aba=faturas`; `/faturas/[id]` **não se move** — é
o endereço de uma fatura específica, que circula em conversa.

**Reaproveitar do admin:** `MetricCard`, os tokens de cor `--dinheiro-*` e o
`FinanceTabs` já existem em `apps/admin-web`. Copiar para `company-web`
mantendo os nomes; os dois painéis são apps separados e não compartilham
componentes hoje.

**Não reaproveitar o `useMoney()`.** A máscara de esconder valores existe
porque o dono da operação mostra o painel para terceiros. A loja olha o próprio
dinheiro na própria tela — copiar isso seria copiar a solução sem o problema.

---

## 3. Aba Resumo

Responde as três perguntas que a loja faz.

### Bloco A: Minha posição

| Cartão | Cor | Origem |
| --- | --- | --- |
| A vencer | aguardando | Faturas `PENDING` |
| Vencido | atrasado | Faturas `OVERDUE` |
| Ainda não faturado | não cobrado | Pedidos concluídos sem fatura |
| Total em aberto | informativo | Soma dos três |

**"Ainda não faturado" é o cartão mais valioso desta tela.** É o que a loja não
consegue saber hoje, e o que evita a surpresa de segunda-feira.

Cada cartão leva à aba correspondente com o filtro aplicado.

### Bloco B: Próximo fechamento

Uma frase e um número: *"A próxima fatura fecha segunda-feira, dia 31, com os
pedidos feitos até lá — hoje somam R$ 340,00."*

Sem isso a regra semanal continua sendo folclore para a loja.

### Bloco C: Gasto por período

Filtro de data, e: pedidos concluídos, valor total, ticket médio, e a
modalidade mais usada. Comparado com o período anterior.

---

## 4. Aba Faturas

A lista de hoje, com três acréscimos:

- **Vencida em destaque**, no topo e em vermelho — hoje ela se perde no meio
- Filtro por status e por período
- **Exportar CSV** do período (ver item 6.3)

---

## 5. Aba Pedidos sem fatura

O que vai entrar na próxima fatura, item a item: data, número do pedido,
endereço de entrega e valor. Com o total no rodapé.

É a mesma informação que o admin vê em "aguardando o próximo fechamento", do
lado da loja.

---

## 6. O que precisa de backend

### 6.1 Posição financeira da empresa — OBRIGATÓRIO

`GET /company/financial/position`

```ts
{
  notDue:    { count: number; value: number };
  overdue:   { count: number; value: number; maxOverdueDays: number };
  unbilled:  { count: number; value: number };
  totalOpen: number;
  nextClosingDate: string;   // próxima segunda, no fuso da operação
}
```

Espelha `cashPosition` do admin, **restrito à empresa do usuário logado**.

**Cuidado de segurança:** o `companyId` vem do token, nunca de parâmetro. Já há
o padrão em `findCompanyForUser` no `deliveries.service.ts` — usar ele. Aceitar
`companyId` na query deixaria uma loja ler o financeiro de outra.

### 6.2 Resumo por período — OBRIGATÓRIO

`GET /company/financial/summary?from&to`

Contagem, valor total, ticket médio e modalidade mais usada, **agregados no
servidor**. É o que substitui a agregação no navegador da tela de Indicadores.

Fazer com `groupBy` do Prisma, não trazendo linhas para somar em JavaScript.

### 6.3 Exportar CSV — DESEJÁVEL

`GET /company/invoices/:id/export` e `GET /company/financial/export?from&to`.

Gerar no servidor. Montar CSV no cliente exigiria baixar tudo — o mesmo
problema que 6.2 resolve.

Separador `;` e decimal com vírgula: é o que o Excel em português abre sem
pedir importação.

### 6.4 Sinalizar pagamento — DECISÃO DE NEGÓCIO

`POST /company/invoices/:id/payment-notice` com data, valor e observação.

**Não muda o status da fatura.** Cria um aviso que aparece para o admin na
fila. Só o admin confirma o recebimento — deixar a loja marcar a própria
fatura como paga seria deixar o devedor dar baixa na própria dívida.

**Isto é decisão do dono da operação, não técnica.** Se ele preferir continuar
recebendo comprovante por WhatsApp, o item não existe.

---

## 7. Ordem de execução

| # | Etapa | Depende de |
| --- | --- | --- |
| 1 | Copiar `MetricCard`, tokens de cor e `FinanceTabs` | — |
| 2 | `GET /company/financial/position` + testes | — |
| 3 | Aba Resumo (blocos A e B) | 1, 2 |
| 4 | Aba Faturas com destaque de vencida | 1 |
| 5 | Redirecionar `/faturas` | 4 |
| 6 | Aba Pedidos sem fatura | 2 |
| 7 | `GET /company/financial/summary` + testes | — |
| 8 | Bloco C, e trocar a agregação de `/indicadores` | 7 |
| 9 | Exportação CSV | — |
| 10 | Aviso de pagamento | decisão do dono |

As etapas 1 a 6 já entregam a maior parte do valor. A 8 é a que evita um
problema de desempenho que ainda não apareceu, mas vai aparecer.

---

## 8. Regras inegociáveis

As mesmas do admin, mais duas específicas deste painel.

1. **`companyId` vem do token, nunca de parâmetro.** Uma loja não pode ler o
   financeiro de outra. Testar isso explicitamente: um e2e que tenta acessar a
   fatura de outra empresa e espera 403.

2. **A loja não dá baixa na própria dívida.** Qualquer ação de pagamento é
   aviso, não confirmação.

3. **Agregação de dinheiro no servidor.** `groupBy` no Prisma, nunca somar
   array no navegador — nem para exibir.

4. **Fuso pelo `Intl`, com `America/Sao_Paulo`.** Nunca subtrair 3 horas.

5. **Vermelho só para o que exige ação hoje.** Zero nunca é verde nem vermelho.

6. **`undefined !== null` é verdadeiro.** Usar `== null` ou `Boolean(x)`.

7. **Diálogo é Base UI, não Radix:** `render={<Button/>}`, não `asChild`.

8. **`toEqual` estrito em e2e** quebra quando a API ganha campo novo. Se
   adicionar campo em resposta, procurar as asserções estritas antes de fechar.

---

## 9. Verificação

- [ ] `pnpm -r typecheck` e `pnpm -r lint` limpos
- [ ] Testes da API verdes, incluindo o de isolamento entre empresas
- [ ] Empresa sem nenhuma fatura não vê `NaN` nem tela quebrada
- [ ] Link antigo `/faturas` continua abrindo
- [ ] Testado contra a API rodando, não só com mock
- [ ] `/indicadores` deixou de baixar a lista inteira de entregas
