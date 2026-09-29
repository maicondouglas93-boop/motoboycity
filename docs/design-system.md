# Design system — painel da empresa e loja online

A linguagem visual do `company-web`: o painel da empresa (`/loja`, Pedidos,
Financeiro...) e a página do cliente (`/pedir/[slug]`). Os tokens moram em
`apps/company-web/src/app/globals.css`; os componentes, em `src/components/ui`.
Este arquivo diz **para que serve cada escolha**, para a próxima tela não
inventar outra.

Decidido em 2026-09-29, a pedido do dono, depois de uma auditoria de UI/UX. A
referência era "produto de software comercial, sem cara de gerado por IA":
menos cartão, menos arredondamento, menos sombra, menos cor.

## Princípios

1. **A hierarquia vem do espaço e do texto**, não de caixa. Borda só onde separa
   algo; cartão só onde há um objeto (um pedido, um formulário).
2. **Uma ação principal por tela**, em âmbar. As outras são de contorno.
3. **Cor significa estado.** Verde é concluído, amarelo é atenção, vermelho é
   falha. Fora disso a tela é neutra.
4. **Movimento só para abrir e fechar.** Nada sobe, cresce ou pula no hover.
5. **Um componente base por coisa.** Se o botão, o campo ou o cartão estiver
   feio, conserta-se o componente, e não se cria uma exceção na tela.

## Cor

| Papel | Token | Valor | Uso |
|---|---|---|---|
| Fundo | `background` | `#f4f7f8` | a página |
| Superfície | `card` | `#ffffff` | cartões, campos, menus |
| Texto | `foreground` | `#10252f` | tudo que se lê |
| Secundário | `muted-foreground` | `#586a72` | ajuda, rótulos (5,65:1 sobre branco) |
| Separador | `border` | `#d9e3e7` | linhas e bordas de cartão |
| Contorno de campo | `input` | `#7f929a` | campos e checkbox (3,24:1) |
| Ação principal | `primary` | `#fda02e` | UM botão por tela; hover `colete-hover` |
| Foco e item ativo | `ring`, `portal`, `accent` | `#0f6b70`, `#e4f3f2` | anel de foco, menu, links |
| Sucesso | `success` / `success-soft` | `#0b6e4f` / `#e6f2ed` | concluído, pago |
| Atenção | `warning` / `warning-soft` | `#8a5200` / `#fdf5e6` | espera resposta, pausado |
| Falha | `destructive-text` / `destructive-soft` | `#b42318` / `#fdeceb` | cancelado, erro |

Regras que já custaram caro:

- **O âmbar nunca é cor de texto** (2,05:1 sobre branco) nem de item de menu.
  O item ativo é `accent` com `accent-foreground` (11,5:1).
- O texto de estado vai sempre sobre o fundo suave da mesma família. Vermelho
  cru sobre `destructive/10` dá 4,2:1; `destructive-text` dá mais de 6.
- Nada de cor crua do Tailwind (`amber-500`, `emerald-700`...) nas telas: use
  o token. As etapas do pedido usam quatro cores, e não seis.
- O painel só existe em tema claro. Não há modo escuro.

A **página do cliente** não usa esses tokens: cada loja escolhe a sua marca, e a
paleta sai de `components/loja-online/paleta.ts` (`fundo`, `texto`, `suave`,
`contorno`, `erro`). O contorno de campo é o texto misturado ao fundo em 50%,
para ter contraste em qualquer tema e em qualquer cor de marca.

## Tipografia

- **Geist**: a fonte de trabalho da interface.
- **Archivo** (`font-heading`): só no título da página (`h1`, aplicado por
  `.company-workspace h1`, então não se põe classe de tamanho nele) e nos números
  grandes (o total do dia). Em cartão e seção usa-se Geist semibold.

| Papel | Tamanho | Peso |
|---|---|---|
| Título da página | 22–28px (fluido) | 700, Archivo |
| Título de seção ou cartão | 16px | 600 |
| Corpo | 14px | 400 |
| Rótulo de campo | 14px | 500 |
| Ajuda e informação auxiliar | 12px | 400, `muted-foreground` |
| Número que alinha em coluna | igual ao texto | `tabular-nums` |

Na página do cliente os campos e as opções são de **16px**: abaixo disso o
Safari do iPhone amplia a tela ao focar.

## Espaçamento

Escala de 4px: 4, 8, 12, 16, 24, 32 (`1`, `2`, `3`, `4`, `6`, `8` do Tailwind).

- entre blocos de uma tela: 24 (`space-y-6`); entre itens de uma lista: 8
- padding de cartão: 16; de linha de lista: 12 vertical, 16 lateral
- rótulo até o campo: 6; entre campos de um formulário: 12
- checkout do cliente: cada seção `py-5` com uma linha em cima

## Bordas, raios e sombras

| Raio | Onde |
|---|---|
| 6px (`rounded-sm`) | badge, checkbox |
| 8px (`rounded-md`) | botão, campo, select, aba, item de menu |
| 10px (`rounded-lg`) | cartão, menu suspenso |
| 12px (`rounded-xl`) | diálogo |

`2xl`, `3xl` e `4xl` valem 12px no tema: nenhuma classe traz de volta a cápsula.
`rounded-full` só em avatar e ponto de status. Chip e filtro são retângulos.

Sombra: **nenhuma em cartão**. `shadow-xs` na aba ativa, `shadow-md` em menu
suspenso, `shadow-lg` em diálogo: elevação é de quem flutua sobre a tela.

## Componentes

- **Card**: superfície branca e uma borda. Lista de itens do mesmo tipo (os
  produtos) é UM cartão com divisórias, e não um cartão por item.
- **Button**: `default` (âmbar, chapado) é a ação principal; `outline` as demais;
  `destructive` só para o que apaga ou cancela. Tamanhos compactos com mouse e um
  degrau acima em tela de toque (`pointer-coarse:`).
- **Badge**: estado, e só estado. A seção e as opções de um produto são texto.
- **Input, Select, Checkbox**: contorno `input`, foco em `ring`, erro em
  `destructive` com a mensagem escrita embaixo.
- **Skeleton**: no lugar de "Carregando...", com a forma do que vem.
- **SecaoDeConfiguracao**: título e frase à esquerda, cartões à direita; agrupa
  o que se lê junto em Configurações.
- **Checkout** (`components/loja-online/campos-do-checkout.tsx`): `Secao`,
  `Campo`, `CampoDeLista`, `Segmentado` (duas opções lado a lado) e `OpcaoDaLista`
  (lista com descrição, com o que só vale para ela logo abaixo).

## Estados

- **Carregando**: Skeleton.
- **Vazio**: uma frase que diz o que é, e uma que diz o que fazer, num bloco de
  borda tracejada.
- **Erro**: o que houve e "Tentar novamente".
- **Sucesso**: "Tudo salvo" no rodapé do formulário, e não um aviso que some.
- **Formulário com campo faltando**: o botão de enviar **não** fica desabilitado
  (desabilitado ele não diz o que falta). Ao tocar, cada campo mostra o seu erro
  e o primeiro recebe o foco.

## Movimento

Só abrir e fechar (altura e opacidade, 150 a 220ms) e a entrada em cascata do
cardápio. Nenhum hover move ou cresce o elemento. Quem pediu movimento reduzido
não vê nem a cascata nem o pulsar do Skeleton.

## Acessibilidade

- Texto: 4,5:1. Contorno de campo: 3:1. Foco: anel de 2px em `ring` (painel) ou
  na cor do texto da loja (cliente), com contraste em qualquer tema.
- Alvo de toque de 44px em tela de toque (botão, campo, item de menu lateral).
- Campo com erro: `aria-invalid` e `aria-describedby` apontando para a mensagem.
- O rádio de verdade continua no DOM (escondido) nos seletores do checkout:
  teclado e leitor de tela funcionam como em qualquer grupo de rádios.

## Ainda não uniformizado

- O item "Loja" do cabeçalho usa um ícone de linha, e os outros, ilustrações: só
  se resolve com a ilustração dela.
- Pedidos, Financeiro, Clientes e a tela de login herdam os componentes base, mas
  ainda têm classes próprias nas telas (`premium-panel`, `order-list-card`,
  cartões de ranking). Foram só suavizadas pelo teto de raio e pelo `Card`.
- As abas de Vendas usam o markup próprio com sublinhado, e não o `Tabs`.
- Horários, Tipos de pedido e Notificações mantiveram a estrutura: receberam só
  os tokens de cor, o raio e o tamanho de toque.
