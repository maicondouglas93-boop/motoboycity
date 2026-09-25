# Plano de implementação — Loja online (PWA) e catálogo

> Referência **atual** da loja online no MOTOboyCity. O `changelog.md` guarda a
> história de cada recorte; este arquivo guarda o que vale hoje e o que falta.
>
> O plano equivalente do Ligeirinho está descontinuado: o trabalho migrou para
> este repositório.

## Onde estamos

Existe a área `/loja` no `company-web`. As telas do catálogo (Produtos,
Organizar, cadastro e edição) **gravam na API** desde 2026-09-25; as demais são
**demonstração**:

| Tela                                   | O que faz                                                             |
| -------------------------------------- | --------------------------------------------------------------------- |
| Status, no alto de todas as telas      | Aberta, fechada ou pausada; pausar, fechar e abrir fora do horário    |
| `/loja/vendas`                         | Fila por etapa, aceite, preparo, cancelamento, agendados, comanda     |
| `/loja/produtos`                       | Lista, filtros por situação, aviso de pendências — **API**            |
| `/loja/produtos/organizar`             | Categorias e ordem do catálogo — **API**                              |
| `/loja/produtos/novo` e `/[id]/editar` | Cadastro e edição, um formulário só — **API**                         |
| `/loja/horarios`                       | Semana com períodos, datas especiais, feriados, recado de fechada     |
| `/loja/tipos-de-pedido`                | Entrega, retirada, pedido agendado e recebimento (aceite e tempos)    |
| `/loja/notificacoes`                   | Avisos do lojista (notificação e som) e do cliente                    |
| `/loja/configuracoes`                  | Link, identidade visual, pagamentos, Asaas, bairros e ponto de coleta |

**As demais telas ainda não usam backend.** Os dados de exemplo vêm de
`apps/company-web/src/lib/loja-mock.ts`. O que o painel configura em Horários,
Tipos de pedido e Notificações, o status e as vendas ficam no `localStorage`
deste navegador, por `lib/loja-demo.ts` — é o que faz painel e página do cliente
conversarem na demonstração, em abas do mesmo navegador. Os dois arquivos pedem
para ser **apagados**, e não adaptados, por quem for ligar à API. As regras
(`loja-horario.ts`, `loja-pedido.ts`, `loja-avisos.ts`, `loja-operacao.ts`)
ficam: o servidor precisa delas. A loja **não está no menu** do painel; as telas
são alcançadas pela URL. O porquê está comentado no `NAV_ITEMS` do
`top-nav.tsx`.

**O catálogo tem backend, e o painel já o usa** (2026-09-25): tabelas `store_categories`, `store_products`, `store_product_sizes`,
`store_option_groups` e `store_options` (migration
`20260925090000_loja_catalogo`), o módulo `company/store-catalog` da API com as
rotas `/company/store/*`, e os contratos em `packages/*`
(`store-catalog.schema.ts`, `store-catalog.ts`, `company-store-catalog.ts`). A
regra de "dá para publicar?" (`storeProductIssues`) mora no pacote de
validação, para o painel e o servidor não discordarem. **A página do cliente
ainda lê o cardápio de exemplo**: o que se cadastra no painel só aparece para o
cliente quando existir o catálogo público por `slug` — e a lista de Produtos
avisa isso.

A foto do produto sobe pelo painel desde 2026-09-25, para o ImageKit, como o
avatar.

Não existe ainda: a configuração da loja no banco (link, identidade, horário,
tipos de pedido, avisos), o pedido da loja, o catálogo público por `slug` e o
PWA ligado à API.

## Decisões já tomadas

1. **Uma loja por empresa, com link próprio** (`/slug`), e não um marketplace
   que reúne todas. A empresa divulga o próprio endereço.
2. **O pedido passa pelas etapas Novo → Aceito → Em preparação → Pronto → Saiu
   para entrega → Entregue** (2026-09-25; substitui "entra como agendado, com
   uma janela para cancelar"). A retirada vai de Pronto a Retirado. No aceite
   automático, que é o padrão, o pedido nasce aceito. O motoboy é chamado quando
   o pedido fica pronto ou quando o preparo vence, o que vier primeiro. A loja
   cancela até o pedido ficar pronto, na entrega, e até o cliente buscar, na
   retirada. O pedido não é a entrega: "Saiu" e "Entregue" virão da corrida
   (`COLLECTED`, `DELIVERED`) — quando a loja entrega pelo MOTOboyCity (item
   15).
3. **A loja recebe na própria conta Asaas.** A plataforma não toca no dinheiro
   da venda; a central continua cobrando as entregas na fatura, como hoje.
4. **Produto → grupo de escolhas → escolha**, com mínimo e máximo por grupo. É o
   que expressa tamanho de açaí, adicional de lanche e "escolha 1 cobertura"
   sem um formulário por nicho.
5. **Tamanho guarda preço cheio**, e não acréscimo sobre uma base.
6. **Três situações do produto** (`publicado`, `rascunho`, `pausado`), e não um
   booleano: "não terminei de cadastrar" e "acabou hoje" são coisas diferentes.
7. **Pendência que impede vender é separada da que é recomendação.** O alarme
   conta só produtos publicados que travam a compra.
8. **Ordem é a posição no array**; categoria é referenciada por id.
9. **Identidade visual:** duas cores livres (marca e ação) mais tema claro ou
   escuro; o resto é calculado. O contraste é medido contra o fundo da loja no
   tema escolhido.
10. **Horário no fuso de Brasília**, e não no do aparelho. Período que fecha
    antes de abrir é "depois da meia-noite" e pertence ao dia em que abre. Duas
    datas especiais no mesmo dia: vale a mais curta.
11. **O ajuste da hora vence sozinho.** Pausar e fechar têm fim, ou "até eu
    reabrir"; abrir fora do horário sempre tem fim.
12. **Os tempos ficam só no recebimento** (preparo e entrega padrão). O tempo
    estimado da entrega e o "pronto em" da retirada são derivados deles. O
    aceite automático é uma chave só, para as duas modalidades.
13. **Pedido mínimo só na entrega.**
14. **Agendar é pedir agora para depois:** uma janela só aparece se a loja
    estiver aberta na hora de a cozinha começar. A madrugada conta na noite em
    que a cozinha abriu.
15. **Entregar pelo MOTOboyCity é opcional** (2026-09-25, pedido do usuário).
    Há empresas que vão usar a loja com motoboy próprio. Para elas, o pedido de
    entrega não vira corrida nem entra na lista de pedidos do MOTOboyCity — nem
    como agendado: fica só em Vendas, e a loja marca "Saiu para entrega" e
    "Entregue". A escolha é da empresa, em Tipos de pedido → Entrega ("Quem faz
    a entrega"). Quem tem entregador próprio pode, num dia de aperto, chamar um
    motoboy do MOTOboyCity para UM pedido, em Vendas, depois do aceite e até o
    pedido sair (usuário, 2026-09-25); o pedido passa ao caminho da corrida. Sem
    corrida, a loja cancela o pedido pronto até o entregador sair. Nas telas de
    demonstração desde 2026-09-25.
16. **A venda se imprime em comanda de 80 mm** (2026-09-25, pedido do
    usuário), no mesmo formato do cupom de entrega que já roda na Elgin i8/i9.
    Diferente dele, leva os valores: quem entrega precisa saber quanto cobrar e
    quanto de troco levar, e se o pedido já foi pago online.

## A fazer

### 1. Salvar o cliente com os dados do pedido do PWA

> **Desenhado nas telas de demonstração em 2026-09-23.** Falta o backend.
> O checkout já coleta telefone e endereço estruturado, e o endereço fica
> salvo por conta do Clerk.

Na venda, oferecer o cadastro do cliente no registro que o painel já usa, para
que ele deixe de ser comprador avulso e possa receber entrega pelo fluxo normal.

**Restrição verificada no contrato que já existe.** `CompanyCustomer`
(`packages/types/src/company-customer.ts`) exige:

- `phone: string` — **obrigatório**, não aceita nulo;
- `address: CompanyCustomerAddress` — **estruturado**: `street`, `number`,
  `complement`, `city`, `state`, `zip`, `lat`, `lng`, `referenceNote`.

Ou seja, **o checkout do PWA tem que coletar telefone e endereço em campos
separados**, e não uma linha de texto livre. Se o checkout pedir "endereço" num
campo só, esta funcionalidade não tem como existir sem alguém digitar tudo de
novo no painel — que é exatamente o trabalho que ela deveria poupar.

**Três situações, e não um botão só.** Conferindo pelo telefone:

| Situação                       | Ação                                |
| ------------------------------ | ----------------------------------- |
| Telefone não cadastrado        | "Salvar cliente"                    |
| Cadastrado, mesmo endereço     | Nada a fazer; mostrar que já existe |
| Cadastrado, endereço diferente | "Salvar este endereço no cliente"   |

O terceiro caso não é detalhe: `CompanyCustomerSavedAddress` já guarda vários
endereços por cliente, com `label` e `isPrimary`. Criar um cliente duplicado
porque ele pediu do trabalho em vez de casa seria desfazer o que o cadastro de
endereços resolve.

**Em aberto:** o cliente do PWA precisa consentir que os dados fiquem com a
loja? Como tratar quem pede uma vez e nunca mais — cadastrar todo mundo
automaticamente encheria a lista de clientes de uma vez só.

### 2. Aceite automático ou manual

> **Desenhado nas telas de demonstração em 2026-09-23, e refeito com as etapas
> do pedido em 2026-09-25**, em Tipos de pedido → Recebimento. Falta o backend.

Automático (padrão): o pedido nasce aceito. Manual: fica em "Novo" até alguém
aceitar — e dá para mudar o tempo de preparo daquele pedido na hora de aceitar.

Já resolvido nas telas: o som de pedido novo repete a cada 30 segundos enquanto
houver pedido esperando aceite, e a tela de vendas diz quantos esperam. O
cancelamento vale nos dois modos: até o pedido ficar pronto, na entrega.

**Prazo do aceite** (2026-09-25): cada loja escolhe, e vem ligado com 10
minutos. Não aceito no prazo, o pedido é cancelado pelo sistema e o cliente é
avisado. Para agora, o prazo conta do recebimento; agendado, vai até a hora de
a cozinha começar. Regra em `prazoDoAceite` (`lib/loja-pedido.ts`); na
integração, é um trabalho agendado no servidor.

**Ainda em aberto:** pedido pago online e recusado, cancelado ou vencido exige
estorno. Pela decisão 3, a venda cai na conta Asaas da loja, então é dela que o
valor volta. Recomendação: estorno automático e total, pela conta da loja,
nesses três casos. Falta confirmar.

### 3. A empresa configura o valor da taxa de entrega cobrada no PWA

> **Desenhado nas telas de demonstração em 2026-09-23.** Falta o backend.

A tela de Configurações já tem o checkbox "cobrar a entrega do cliente na
página", mas **não tem onde pôr o valor**. Falta o campo.

> Lendo "comprar" como "cobrar". Se a intenção era outra, corrigir aqui.

**A distinção que não pode se perder:** o valor que a loja cobra do cliente é
independente do que a central cobra da loja na fatura. São dois números, e
tratá-los como um só é o erro provável — a loja pode cobrar mais, menos ou nada,
e continua devendo a entrega à central do mesmo jeito.

**Em aberto:** valor fixo, por quilômetro, ou por bairro/zona? Fixo é o que a
loja pequena entende e configura em trinta segundos; por distância é mais justo
e exige calcular no checkout, com o custo de Routes API que o cache de rota já
tenta conter. Sugestão: começar com **valor fixo**, e por faixa de distância
depois, se pedirem.

### 4. Interface do PWA sem cara de front feito por IA

> **Primeira fatia feita em 2026-09-23:** catálogo e folha do produto, em
> `/pedir/[slug]`. Falta sacola, checkout e o PWA propriamente dito (manifest,
> service worker, instalação).

Requisito de acabamento da loja que o cliente abre.

**O que evitar**, porque é o que denuncia:

- gradiente roxo/índigo de fundo, cartão com vidro fosco, blob colorido atrás do
  título;
- emoji como ícone de seção, título centralizado gigante com subtítulo genérico;
- tudo com o mesmo `rounded-2xl` e a mesma sombra, sem hierarquia;
- espaçamento uniforme demais, como se nenhum bloco fosse mais importante que
  outro;
- texto de enchimento ("Descubra os melhores sabores!") onde deveria estar o
  nome do produto.

**O que usar:** a identidade que a Configurações já coleta — logo, cor da marca,
cor de ação, tema claro ou escuro. A loja tem que parecer **daquela loja**, e
não do template. Densidade de cardápio, não de landing page: o cliente veio
escolher comida, e cada rolagem a mais é um item que ele não viu. Foto de
produto real quando houver, e um layout que não desmonte quando não houver — a
lista de produtos do painel já segue essa regra, com miniatura em vez de cartão
grande.

**Referência honesta:** a comparação útil é com iFood, aiqfome e Rappi, que são
o que o cliente da loja já sabe usar — e não com dribbble.

## A loja do cliente, como está

`/pedir/[slug]` — em produção o endereço é `pedidos.…/{slug}`; aqui a rota tem
prefixo porque `/loja` já é a área do painel neste mesmo app.

Feito: cabeçalho com identidade, barra de categorias grudada no topo, cardápio
em linhas com miniatura, folha do produto (tamanho, grupos, quantidade), sacola
com checkout e lista de "Meus pedidos". O catálogo lê `loja-mock.ts`; a sacola
e os pedidos ficam no `localStorage` do aparelho.

**Sem barra de abas no rodapé, e isso foi decidido.** Ela brigaria com a barra
da sacola, que é a mais importante da tela; "Home" e "Cardápio" seriam a mesma
tela; e "Perfil" pressupõe conta, que é uma etapa a mais antes de pedir. O único
destino que se justificava — "Meus pedidos" — virou um link no cabeçalho que
**só aparece depois do primeiro pedido naquele aparelho**.

**O painel decide o que o cliente vê.** Só aparece produto `publicado` e sem
pendência que impeça vender. Nos dados de exemplo isso some com dois itens: o
X-Burguer (grupo obrigatório sem escolha disponível) e o Refrigerante
(pausado). Oferecer um produto que não fecha o pedido seria justamente o
problema que o aviso do painel existe para evitar.

**Login exigido para comprar** (decisão de 2026-09-23). Navegar e montar a
sacola não exige conta; fechar exige. A identidade é do Clerk, escopado ao grupo
de rotas `(loja)` — ver `agent-handoff.md` para por que ele não toca o painel.

A loja respeita horário por dia com mais de uma faixa, período depois da
meia-noite, datas especiais (feriado, férias, horário especial), o ajuste da
hora (pausar, fechar, abrir fora do horário), bairros com taxa própria, pedido
mínimo na entrega, e entrega e retirada ligáveis. Fechada, diz quando abre, mostra
o recado da loja e deixa agendar. O checkout tem "Agora" ou "Agendar" (dia e
janela) e observação do cliente. "Meus pedidos" mostra a etapa de cada pedido e
muda sozinho.

**Pagamento em dois grupos** (decisão de 2026-09-24): online pelo Asaas — Pix,
crédito e débito — ou na entrega — dinheiro, e Pix, crédito e débito na
maquininha. Crédito e débito online passam pela página do próprio Asaas, e
nenhum campo de cartão existe na loja: o débito só é aceito lá, e o crédito pela
API poria o número do cartão no nosso sistema. Sem conta Asaas, o grupo online
inteiro some.

**Movimento com função**, com a biblioteca Motion escopada à loja: cascata de
entrada, indicador de categoria que acompanha a rolagem, folhas que sobem de
baixo, o item voando até a sacola e a confirmação desenhada. Vocabulário em
`components/loja-online/movimento.tsx`.

**É um app instalável** (2026-09-24): manifest por loja, ícones com a cor da
marca, barra do navegador na cor da marca e service worker escopado à loja. O
convite para instalar aparece depois do pedido feito — botão no Android, passos
no iPhone —, e "agora não" o faz descansar trinta dias. Não verificado ainda: o
comportamento sem internet e a instalação em aparelho real.

Os avisos saem do navegador, com a página aberta em alguma aba: som e
notificação para a loja, notificação para o cliente. Falta o Web Push de
servidor, que avisa com o navegador fechado — da loja e do cliente (o que existe
é FCM para o app Android do motoboy). E falta o backend inteiro: hoje o pedido
termina no `localStorage`, e só chega à tela de vendas do painel aberta no mesmo
navegador.

**Contrato a alterar na integração:** `CompanyCustomerAddress` não tem bairro, e
a taxa por bairro obriga o checkout a coletá-lo. Mexe em `packages/types`, na
validação e no cadastro de clientes do painel.

## Ordem sugerida

1. ~~Schema e migration do catálogo (produto, categoria, grupo, escolha,
   tamanho).~~ Feito em 2026-09-25.
2. ~~Endpoints e contratos em `packages/*`, com os schemas Zod~~ — do catálogo,
   feito em 2026-09-25. Falta o mesmo para a configuração da loja.
3. Ligar as telas do painel que já existem — ~~Produtos e Organizar~~, feito
   em 2026-09-25. Faltam as que dependem da configuração da loja e do pedido no
   banco; **apagar** o `loja-mock.ts` quando a última tela deixar de usá-lo.
4. O PWA do cliente: catálogo, carrinho, checkout (com telefone e endereço
   estruturado, por causa do item 1).
5. Pedido da loja virando entrega, com o aceite do item 2 — só para a loja que
   entrega pelo MOTOboyCity (decisão 15): as etapas até "Pronto" são do pedido;
   "Saiu para entrega" e "Entregue" vêm da corrida.
   Junto, o Web Push de servidor para os avisos da loja e do cliente.
6. Salvar cliente a partir da venda (item 1).
7. Pôr o item "Loja" de volta no `NAV_ITEMS` — no mesmo recorte em que as telas
   deixarem de ser demonstração.
