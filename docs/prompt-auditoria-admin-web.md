# Prompt — auditoria do painel do administrador (`apps/admin-web`)

Documento para colar em outro agente. Ele não precisa de contexto além daqui.

---

## O que é para fazer

Auditar `apps/admin-web` inteiro e entregar um **relatório de achados**, não um
conjunto de correções. Não altere código nesta rodada: o valor aqui é o
diagnóstico, e correção sem prioridade acordada vira retrabalho.

O painel tem **37 páginas e ~21 mil linhas**, é onde o dono da operação passa o
dia, e nunca foi revisado por inteiro.

---

## O produto, em três frases

MOTOboyCity é uma plataforma B2B de motoboys em Lajinha, Minas Gerais. Lojas
lançam pedidos, motoboys aceitam e entregam, a plataforma cobra a loja por
fatura semanal e repassa ao motoboy por carteira. O `admin-web` é o painel de
quem é dono da operação: ele despacha, acompanha, cobra, paga e audita.

---

## Regras da casa (um achado que as ignora não é achado)

1. **Dinheiro na tela passa por `useMoney()`** (`src/lib/money.tsx`). Existe um
   botão de esconder valores no topo; um formatador próprio fura a máscara em
   silêncio. O comentário do arquivo explica por quê.
2. **Dinheiro em conta é somado em centavos inteiros.** `0.1 + 0.2` não fecha, e
   o banco guarda `Decimal(10,2)`.
3. **Fuso é `America/Sao_Paulo` via `Intl`**, nunca subtrair 3 horas. Ver
   `apps/api/src/common/sao-paulo-time.ts`.
4. **Coluna `@db.Date` é dia civil**, sem hora e sem fuso. Formatá-la com
   conversão de fuso mostra o dia anterior — isso já aconteceu e está corrigido;
   procure recorrências.
5. **Diálogo é Base UI, não Radix**: `render={<Button/>}`, nunca `asChild`.
6. **A carteira do motoboy é um livro-razão.** O saldo é a soma das linhas;
   escrever saldo direto é erro.
7. **`undefined !== null` é verdadeiro.** Use `== null` ou `Boolean(x)`.
8. **Vermelho só para o que exige ação hoje.** Zero não é vermelho nem verde.

---

## O que JÁ foi achado — não repita

Uma revisão só da **home** (`src/app/(app)/page.tsx`) já rodou. Estes sete
pontos estão conhecidos; não gaste a auditoria neles:

| # | Achado | Situação |
| --- | --- | --- |
| 1 | A home tinha `Intl.NumberFormat` próprio e furava a máscara | corrigido |
| 2 | Cancelar pedido era um clique sem confirmação nem motivo | corrigido |
| 3 | Filas listavam 8 e exibiam o total real, sem dizer que esconderam | corrigido |
| 4 | Cada `driver:location` invalida a consulta inteira de operações | **em aberto** |
| 5 | Sem estado de erro: API fora do ar ficava igual a operação parada | corrigido |
| 6 | Feed "Atividade auditável" é engolido por online/offline de um motoboy | **em aberto** |
| 7 | Faltam números do dia (tempo até aceite, parados há X min, entregues hoje) | **em aberto** |

Os itens 4, 6 e 7 continuam valendo — se você encontrar o mesmo padrão em
outras telas, isso **é** achado novo.

---

## Trabalho em andamento (não commitado) — cuidado para não colidir

Estes arquivos estão modificados na árvore agora:

```
 M apps/admin-web/src/app/(app)/page.tsx
 M apps/api/src/deliveries/deliveries.controller.ts
 M apps/api/src/deliveries/deliveries.service.ts
 M apps/api/src/deliveries/deliveries.service.spec.ts
 M packages/api-client/src/deliveries.ts
 M packages/validation/src/index.ts
?? apps/admin-web/src/components/operations/cancel-delivery-dialog.tsx
?? packages/validation/src/deliveries/cancel-delivery.schema.ts
```

Também está em andamento o **aviso de pagamento** (`payment-notice.*` na API,
`components/finance/avisos-tab.tsx` no admin): a loja avisa que pagou, e só o
admin confirma. Não audite isso como se estivesse pronto.

---

## Onde olhar, e o que suspeitar

Estas são **hipóteses para testar**, não conclusões. Confirme cada uma no
código antes de reportar, e descarte a que não se sustentar.

### Desempenho e escala

- **22 chamadas a `Api.list(...)` nas páginas.** Quantas dessas rotas não têm
  paginação nem limite no servidor? Com um mês de operação real, quais telas
  baixam a base inteira? A tela de indicadores do painel da loja tinha
  exatamente esse defeito e foi corrigida trocando por agregação no servidor —
  procure o mesmo padrão aqui.
- **Agregação no navegador.** Alguma tela soma dinheiro em `reduce` sobre uma
  lista vinda da API? Isso quebra em dois lugares: desempenho, e a soma em
  float.
- **Consultas em cascata.** Páginas que fazem N+1 chamadas, uma por linha.

### Correção

- **Fuso.** Procure `.slice(0, 10)` sobre ISO, `new Date(x).toLocaleDateString()`
  sem `timeZone`, e qualquer aritmética de `-3` horas.
- **Dinheiro.** `Intl.NumberFormat` fora do `useMoney`, somas em float,
  `toFixed` usado como arredondamento contábil.
- **Estados vazios que mentem.** Tela que mostra zero quando na verdade falhou
  ao carregar. É o mesmo defeito do item 5 da home; conte quantas telas têm.
- **Ações destrutivas sem confirmação.** Cancelar, excluir, aprovar, recusar,
  marcar como pago, aprovar saque. Quais disparam direto no `onClick`? Saque
  aprovado é dinheiro saindo.

### Segurança

- **Rota de admin exposta sem `AdminOnlyGuard`.** Verifique o par
  controller/guard de cada rota que o painel consome.
- **Dado sensível em query string.** CPF, chave PIX, e-mail em URL.
- **O painel confia em `type` do usuário para esconder botão, mas o servidor
  valida?** Esconder no cliente não é permissão.

### Manutenção

- Arquivos grandes demais para uma tela só. Os maiores hoje:
  `relatorios/resultado-operacional` (848), `relatorios/extrato-financeiro`
  (782), `configuracoes/operacao` (774), `page.tsx` (683).
- Componentes duplicados entre `admin-web` e `company-web` que já divergiram.
- **`admin-web` não tem NENHUM teste** — nem arquivo, nem script no
  `package.json`. Diga quais três telas mais mereceriam o primeiro teste e por
  quê, em vez de recomendar "adicionar testes".

---

## O que NÃO é para reportar

- Preferência de estilo sem consequência (aspas, ordem de import, nome de
  variável) — o `eslint` já cuida.
- "Adicionar testes", "melhorar tipagem", "extrair componente" como conselho
  genérico, sem apontar o arquivo e o problema concreto.
- Sugestão de trocar biblioteca ou arquitetura. O que existe funciona; a
  auditoria é para achar defeito, não para reescrever.
- Achado que você não confirmou lendo o código. Suposição plausível que não se
  sustenta custa mais caro que silêncio.

---

## Formato do relatório

Grave em `docs/auditoria-admin-web.md`. Para cada achado:

```
### [Gravidade] Título curto do defeito

**Onde:** caminho/do/arquivo.tsx:linha

**O que acontece:** uma ou duas frases, concretas. Qual entrada leva a qual
saída errada.

**Por que importa:** o efeito para quem usa o painel. Se você não conseguir
escrever esta linha, o achado provavelmente não vale reportar.

**Como confirmei:** o que você leu ou rodou.
```

Gravidade em três níveis, e use o critério, não o instinto:

- **Alta** — perde dinheiro, mostra número errado, expõe dado, ou destrói algo
  sem confirmação.
- **Média** — quebra com volume real de operação, ou engana o usuário sobre o
  estado do sistema.
- **Baixa** — atrito e manutenção.

Ordene por gravidade. **Não infle a lista**: vinte achados médios afogam os três
que importam. Se algo for alta, diga na primeira linha do documento.

No fim, uma seção **"O que eu olhei e estava certo"** — as hipóteses acima que
você testou e descartou. Isso vale tanto quanto os achados: evita que a próxima
auditoria refaça o mesmo caminho.
