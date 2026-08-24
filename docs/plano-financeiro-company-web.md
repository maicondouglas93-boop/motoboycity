# Plano — área financeira do painel da empresa

Documento de execução. Quem implementar não precisa de contexto além daqui.

O painel do admin já foi refatorado (`docs/plano-refatoracao-financeiro.md` e
`docs/financeiro-o-que-falta.md`). Este é o outro lado do balcão: o que a
**loja** vê sobre o próprio dinheiro.

---

## 1. Situação de hoje

A empresa tem **duas rotas financeiras, ambas só de leitura**:

| Rota da API                 | O que faz              |
| --------------------------- | ---------------------- |
| `GET /company/invoices`     | Lista as faturas       |
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

| Cartão             | Cor         | Origem                        |
| ------------------ | ----------- | ----------------------------- |
| A vencer           | aguardando  | Faturas `PENDING`             |
| Vencido            | atrasado    | Faturas `OVERDUE`             |
| Ainda não faturado | não cobrado | Pedidos concluídos sem fatura |
| Total em aberto    | informativo | Soma dos três                 |

**"Ainda não faturado" é o cartão mais valioso desta tela.** É o que a loja não
consegue saber hoje, e o que evita a surpresa de segunda-feira.

Cada cartão leva à aba correspondente com o filtro aplicado.

### Bloco B: Próximo fechamento

Uma frase e um número: _"A próxima fatura fecha segunda-feira, dia 31, com os
pedidos feitos até lá — hoje somam R$ 340,00."_

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
  notDue: {
    count: number;
    value: number;
  }
  overdue: {
    count: number;
    value: number;
    maxOverdueDays: number;
  }
  unbilled: {
    count: number;
    value: number;
  }
  totalOpen: number;
  nextClosingDate: string; // próxima segunda, no fuso da operação
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

### 6.4 Sinalizar pagamento — IMPLEMENTADO

`POST /company/invoices/:id/payment-notice` com data, valor e observação.

**Não muda o status da fatura.** Cria um aviso que aparece para o admin na
fila. Só o admin confirma o recebimento — deixar a loja marcar a própria
fatura como paga seria deixar o devedor dar baixa na própria dívida.

A decisão foi confirmada e o fluxo foi implementado: a empresa sinaliza pelo
Company Web, o admin recebe uma fila própria no Financeiro e somente a
confirmação administrativa chama a baixa existente da fatura.

---

## 7. Ordem de execução

| #   | Etapa                                              | Situação                                     |
| --- | -------------------------------------------------- | -------------------------------------------- |
| 1   | Copiar `MetricCard`, tokens de cor e `FinanceTabs` | feito                                        |
| 2   | `GET /company/financial/position` + testes         | feito                                        |
| 3   | Aba Resumo (blocos A e B)                          | feito                                        |
| 4   | Aba Faturas com destaque de vencida                | feito                                        |
| 5   | Redirecionar `/faturas`                            | feito                                        |
| 6   | Aba Pedidos sem fatura                             | feito                                        |
| 7   | `GET /company/financial/summary` + testes          | feito                                        |
| 8   | Bloco C, e trocar a agregação de `/indicadores`    | feito                                        |
| 9   | Exportação CSV                                     | feito, com um desvio (abaixo)                |
| 10  | Aviso de pagamento                                 | feito, com fila administrativa e E2E isolado |

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

- [x] `pnpm -r typecheck` e `pnpm -r lint` limpos
- [x] Testes da API verdes, incluindo o de isolamento entre empresas
      (`company-financial.e2e-spec.ts`: a loja A vê zero enquanto a fatura de
      R$ 250,00 da loja B existe)
- [x] Empresa sem nenhuma fatura não vê `NaN` nem tela quebrada
- [x] Link antigo `/faturas` continua abrindo
- [x] Testado contra a API rodando, não só com mock (16 e2e contra o banco)
- [x] `/indicadores` deixou de baixar a lista inteira de entregas
- [x] Conferido na tela, com a loja logada (números batidos contra o banco:
      22 pedidos, R$ 113,50, ticket R$ 5,16, 1 fatura a vencer)

### Desvios do plano, e por quê

**Etapa 6 precisou de endpoint próprio.** O plano dizia que a aba de pedidos
sem fatura dependia só da etapa 2, mas a `position` devolve o total, não as
linhas. Foi criado `GET /company/financial/unbilled`, com a **mesma cláusula**
do cartão do resumo — se as duas telas divergissem, a loja não saberia em qual
acreditar.

**Etapa 9 exporta só o período, não a fatura.** O plano previa também
`GET /company/invoices/:id/export`. O extrato do período é o que a
contabilidade pede e é o único que não cabe no navegador; a fatura já tem a
tela de detalhe com os pedidos listados. Fica anotado como pendência barata,
não como parte entregue.

**A tela de indicadores ganhou um período padrão.** Ela aceitava "sem filtro",
o que no servidor significaria varrer todo o histórico da loja — justamente o
problema que a etapa 7 resolve. Sem filtro, agora são os últimos 30 dias.

### Etapa 10 entregue

`POST /company/invoices/:id/payment-notice` cria o aviso sem tocar na fatura;
`GET /company/invoices/:id/payment-notices` permite acompanhar a decisão. O
admin possui fila filtrável e ações de confirmar ou recusar. Confirmar o aviso,
baixar a fatura e gravar o histórico formam uma transação única. Um índice
parcial garante no banco apenas um aviso pendente por fatura, inclusive sob
requisições simultâneas.

### Dois defeitos de data achados na conferência

Nenhum dos dois foi introduzido aqui; ambos só ficaram visíveis quando a tela
passou a mostrar datas lado a lado com o número da fatura.

**1. Todo dia civil aparecia um dia atrás.** `issueDate`, `dueDate` e
`paymentDate` são colunas `@db.Date` — dia, sem hora e sem fuso. A API as
serializava com `toISOString()` inteiro, inventando meia-noite UTC; formatado
no fuso da operação, isso volta um dia. A fatura `FAT-20260824` aparecia como
23/08/2026.

Corrigido em duas camadas, porque as duas estavam erradas:
`civilDateFromDbDate()` em `sao-paulo-time.ts` (a cópia local que existia no
`admin-financial.service.ts` virou essa, compartilhada), e `formatarData()` nos
dois painéis, que agora reconhece `AAAA-MM-DD` e não converte fuso de um dado
que não tem fuso.

**2. "Próximo fechamento" apontava para um corte que já tinha passado.** O
corte roda às 00:05 de segunda. A primeira versão devolvia "hoje" quando hoje
era segunda — então às 10h de segunda a tela dizia "fecha hoje" logo abaixo da
fatura que fechou de madrugada. Agora `nextInvoiceClosingDateInSaoPaulo()`
deriva do último corte real, e não do dia da semana.

Os dois têm teste travando a regressão.

### Decidido pelo dono: a fatura vence no mesmo dia

`invoice.service.ts` faz `const dueDate = issueDate`. Isso **é regra**,
confirmado em 24/08/2026, e não descuido: o ciclo inteiro cabe na
segunda-feira. O corte roda 00:05, a fatura nasce vencendo no mesmo dia, e como
o `refreshOverdueInvoices` compara com `dueDate < hoje`, ela só vira `OVERDUE`
na terça de madrugada — a loja tem o dia útil inteiro para pagar.

Está documentado no código e travado por teste (`invoice.service.spec.ts`,
"emite a fatura vencendo NO MESMO DIA"), porque a linha sem explicação parecia
um prazo esquecido — foi lida como defeito na primeira conferência.

Se um dia existir prazo, ele vira configuração e passa por ali.
