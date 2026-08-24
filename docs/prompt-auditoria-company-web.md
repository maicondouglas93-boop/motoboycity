# Prompt — auditoria do painel da empresa (`apps/company-web`)

Documento para colar em outro agente. Ele não precisa de contexto além daqui.

---

## O que é para fazer

Auditar `apps/company-web` inteiro e entregar um **relatório de achados**, não
um conjunto de correções. Não altere código nesta rodada: o valor aqui é o
diagnóstico, e correção sem prioridade acordada vira retrabalho.

São **17 páginas e ~10 mil linhas** — metade do painel do administrador, mas
com um agravante: **quem usa esta tela não trabalha aqui.** É o balconista da
pizzaria entre um pedido e outro, no celular, com o telefone tocando. O admin
aprende o painel dele; a loja não vai aprender o dela.

---

## O produto, em três frases

MOTOboyCity é uma plataforma B2B de motoboys em Lajinha, Minas Gerais. Lojas
lançam pedidos, motoboys aceitam e entregam, a plataforma cobra a loja por
fatura semanal e repassa ao motoboy por carteira. O `company-web` é o painel da
LOJA: ela chama entregador, acompanha o pedido e confere o que vai pagar.

---

## O que separa este painel do outro

Quatro coisas que mudam o critério de gravidade. Um achado que as ignora
provavelmente está classificado errado.

1. **A loja não dá baixa na própria dívida.** Nada aqui pode mudar o status de
   uma fatura. O aviso de pagamento (`payment-notice-dialog.tsx`) é aviso, e
   quem confirma é o admin. Se encontrar qualquer caminho que fure isso, é
   **alta** na hora.
2. **`companyId` vem do TOKEN, nunca de parâmetro.** Uma loja não pode ler
   dado de outra. Se alguma chamada aceitar `companyId` do cliente, é **alta**.
3. **Não existe máscara de esconder valores aqui**, ao contrário do admin. É de
   propósito: a loja olha o próprio dinheiro na própria tela, e o comentário no
   topo de `src/lib/dinheiro.ts` explica. **Não reporte a ausência como
   defeito** — já houve quem tentasse "corrigir" copiando a regra do outro lado.
4. **Erro aqui vira ligação, não bilhete.** Uma tela ambígua no admin gera uma
   dúvida; na loja gera telefonema para o dono da operação no meio do almoço.
   Peso isso ao classificar clareza.

---

## Regras da casa (um achado que as ignora não é achado)

1. **Dinheiro é somado em centavos inteiros** — `somarDinheiro()` em
   `src/lib/dinheiro.ts`. `0.1 + 0.2` não fecha.
2. **Fuso é `America/Sao_Paulo` via `Intl`**, nunca subtrair 3 horas.
3. **Coluna `@db.Date` é dia civil**, sem hora e sem fuso. Formatá-la com
   conversão de fuso mostra o dia anterior — isso já aconteceu e está
   corrigido no `formatarData()`; procure recorrências.
4. **Diálogo é Base UI, não Radix**: `render={<Button/>}`, nunca `asChild`.
5. **`undefined !== null` é verdadeiro.** Use `== null` ou `Boolean(x)`.
6. **Vermelho só para o que exige ação hoje.** Zero não é vermelho nem verde.
7. **Agregação de dinheiro no servidor.** `groupBy` no Prisma, nunca somar
   array no navegador — nem para exibir.

---

## O que JÁ é conhecido — não gaste a auditoria nisso

**A área financeira foi construída recentemente** (`docs/plano-financeiro-company-web.md`):
`/financeiro` com Resumo, Faturas e Pedidos sem fatura, mais o aviso de
pagamento. Está verificada contra o banco. Auditar é bem-vindo, mas ela não é
terreno inexplorado.

**Os relatórios são recém-nascidos** (`docs/plano-relatorios-company-web.md`):
`/relatorios/pedidos`, `/tempos-sla`, `/horarios`, `/modalidades`, `/geral`.
Foram escritos por outro agente e **ainda não passaram por revisão nenhuma** —
é o pedaço mais promissor desta auditoria.

**`/indicadores` já foi corrigida** para usar agregação no servidor, em vez de
baixar a lista inteira de entregas. Se achar o mesmo padrão em outra tela, isso
**é** achado novo.

---

## Hipóteses para testar

Não são conclusões. Confirme cada uma no código antes de reportar, e descarte a
que não se sustentar. As contagens abaixo saíram de uma varredura rápida e
podem ter falso positivo.

### Dinheiro e números

- **Quatro arquivos ainda chamam `Intl.NumberFormat` direto**, em vez de usar o
  `formatarDinheiro()` que já existe: `faturas/[id]`, `pedidos/[id]`,
  `relatorios/horarios` e `relatorios/pedidos`. Confirme se é dinheiro mesmo em
  cada um (pode ser número ou porcentagem) e se o resultado diverge.
- **Soma em `float` no navegador.** Procure `reduce` acumulando valor.
- **Ticket médio, percentual e "vs. período anterior" nos relatórios.** Divisão
  por zero, `Infinity`, `NaN` e "+100%" no primeiro período de uso.

### Escala

- **Duas chamadas de listagem sem paginação** nas páginas. Quais rotas por trás
  não têm `take`/`skip`? Com um mês de operação real, quais telas baixam tudo?
  Existe `deliveries.search` paginada no servidor — veja quem podia usá-la.
- **Exportação de CSV montada no cliente** obriga a baixar tudo. Onde acontece?

### Correção e clareza

- **Duas telas não checam `isError`**: `(app)/page.tsx` e `login/page.tsx`.
  Falha de carregamento vira tela vazia, indistinguível de "não há nada".
- **Três lugares cancelam pedido direto no `onClick`**, sem confirmação:
  `pedidos/page.tsx`, `pedidos/[id]/page.tsx` e `call-driver-dialog.tsx`.
  **Pese com cuidado:** a API só deixa a loja cancelar em `SCHEDULED` ou
  `AWAITING_DRIVER` (`COMPANY_CANCELLABLE_STATUSES`), ou seja, antes de existir
  motoboy do outro lado. Isso é bem menos grave que o mesmo padrão no admin, e
  exigir texto num cancelamento corriqueiro atrapalharia mais do que ajuda.
- **Estados vazios que mentem.** Tela que mostra zero quando na verdade falhou.
- **Mensagem de erro que não diz o que fazer.** "Não foi possível" sozinho, sem
  dizer se é para tentar de novo ou ligar para alguém.

### O caminho principal

O que a loja faz cem vezes por dia é **chamar entregador**
(`call-driver-dialog.tsx`, 458 linhas) e **acompanhar o pedido**. Vale mais uma
passada cuidadosa nesses dois do que em qualquer relatório:

- Dá para lançar pedido duplicado com clique duplo?
- O que a tela mostra enquanto o despacho procura motoboy?
- Se o endereço não geocodifica, a loja entende o que aconteceu?
- Erro de rede no meio do envio: o pedido foi ou não foi?

---

## O que NÃO é para reportar

- A ausência de máscara de valores (ver item 3 mais acima).
- Preferência de estilo sem consequência — o `eslint` já cuida.
- "Adicionar testes", "melhorar tipagem", "extrair componente" como conselho
  genérico, sem apontar arquivo e problema concreto.
- Sugestão de trocar biblioteca ou arquitetura.
- Achado que você não confirmou lendo o código.

---

## Formato do relatório

Grave em `docs/auditoria-company-web.md`. Para cada achado:

```
### [Gravidade] Título curto do defeito

**Onde:** caminho/do/arquivo.tsx:linha

**O que acontece:** uma ou duas frases, concretas. Qual entrada leva a qual
saída errada.

**Por que importa PARA A LOJA:** o efeito para quem está atrás do balcão. Se
não conseguir escrever esta linha, o achado provavelmente não vale reportar.

**Como confirmei:** o que você leu ou rodou.
```

Gravidade, pelo critério e não pelo instinto:

- **Alta** — fura o isolamento entre lojas, deixa a loja mexer na própria
  dívida, mostra número errado de dinheiro, ou perde um pedido.
- **Média** — quebra com volume real, ou engana sobre o estado do sistema.
- **Baixa** — atrito e manutenção.

Ordene por gravidade. **Não infle a lista**: vinte achados médios afogam os três
que importam.

No fim, duas seções obrigatórias:

**"O que eu olhei e estava certo"** — as hipóteses acima que você testou e
descartou. Vale tanto quanto os achados: evita que a próxima auditoria refaça o
caminho.

**"Onde começariam os testes"** — `company-web` não tem **nenhum** teste, nem
arquivo nem script no `package.json`. Em vez de recomendar "adicionar testes",
diga as três coisas que mais merecem o primeiro, e por quê.

---

## Trabalho em andamento

Há alterações não commitadas na árvore, de outro agente, em autenticação,
empresas, entregadores, despacho e realtime. Rode `git status` antes de começar
e não conte como defeito o que estiver visivelmente pela metade.
