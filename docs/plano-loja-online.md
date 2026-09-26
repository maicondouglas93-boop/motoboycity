# Plano de implementação — Loja online (PWA) e catálogo

> Referência **atual** da loja online no MOTOboyCity. O `changelog.md` guarda a
> história de cada recorte; este arquivo guarda o que vale hoje e o que falta.
>
> O plano equivalente do Ligeirinho está descontinuado: o trabalho migrou para
> este repositório.

## Onde estamos

Existe a área `/loja` no `company-web`. As telas do catálogo (Produtos,
Organizar, cadastro e edição), as da operação (status, Horários, Tipos de
pedido e Notificações) e Configurações **gravam na API** desde 2026-09-25, e
Vendas desde 2026-09-26:

| Tela                                   | O que faz                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------- |
| Status, no alto de todas as telas      | Aberta, fechada ou pausada; pausar, fechar e abrir — **API**                |
| `/loja/vendas`                         | Fila por etapa, aceite, preparo, cancelamento, agendados, comanda — **API** |
| `/loja/produtos`                       | Lista, filtros por situação, aviso de pendências — **API**                  |
| `/loja/produtos/organizar`             | Categorias e ordem do catálogo — **API**                                    |
| `/loja/produtos/novo` e `/[id]/editar` | Cadastro e edição, um formulário só — **API**                               |
| `/loja/horarios`                       | Semana, datas especiais, feriados, recado de fechada — **API**              |
| `/loja/tipos-de-pedido`                | Entrega, retirada, agendado e recebimento (aceite e tempos) — **API**       |
| `/loja/notificacoes`                   | Avisos do lojista (notificação e som) e do cliente — **API**                |
| `/loja/configuracoes`                  | Link, identidade, pagamento, bairros e coleta — **API**; Asaas em breve     |

**O pedido tem backend** (2026-09-26, migration `20260926120000_loja_pedido`):
tabela `store_orders`, módulo `company/store-orders` e os contratos em
`packages/*` (`store-checkout.schema.ts`, `store-order.ts`,
`public-store-orders.ts`, `company-store-orders.ts`). As regras de horário, de
etapa e de operação saíram do `company-web` para `packages/validation`
(`store-*.rules.ts`), e o servidor refaz com elas a conta do checkout. Vendas lê
e muda os pedidos pela API, e a Loja **está no menu** do painel. A loja só
recebe pedido pela página quando liga **Pedidos pela página**, no alto de
Vendas.

Só a loja de exemplo (`/pedir/minha-loja`) ainda usa `loja-mock.ts` e o
`localStorage` (`lib/loja-demo.ts`); os dois pedem para ser **apagados**, e não
adaptados, junto com ela.

**O catálogo tem backend, e o painel já o usa** (2026-09-25): tabelas `store_categories`, `store_products`, `store_product_sizes`,
`store_option_groups` e `store_options` (migration
`20260925090000_loja_catalogo`), o módulo `company/store-catalog` da API com as
rotas `/company/store/*`, e os contratos em `packages/*`
(`store-catalog.schema.ts`, `store-catalog.ts`, `company-store-catalog.ts`). A
regra de "dá para publicar?" (`storeProductIssues`) mora no pacote de
validação, para o painel e o servidor não discordarem.

**O link da loja e a vitrine** (2026-09-25): a loja cria o link em
Configurações (`store_settings` e `store_slugs`, migration
`20260925190000_loja_link`), e `/pedir/<link>` mostra o cardápio publicado,
pela rota pública `GET /public/stores/:slug`, com o horário, a situação
(aberta, fechada, pausada, com o recado), o tempo de entrega, a taxa dos bairros
e as formas de pagamento. Recebe pedido quando a loja liga os pedidos pela
página e o login do cliente está configurado; sem uma das duas, é **vitrine**.
Link antigo leva ao
atual; empresa pendente ou suspensa não aparece. `/pedir/minha-loja` continua
sendo a demonstração inteira, com os dados de exemplo.

A foto do produto sobe pelo painel desde 2026-09-25, para o ImageKit, como o
avatar.

**A operação da loja tem backend** (2026-09-25): `store_operations` (migration
`20260925230000_loja_operacao`), um JSONB por bloco — horário, ajuste da hora,
tipos de pedido, avisos —, módulo `company/store-operation` com
`/company/store/operation/*`, e os contratos em `packages/*`
(`store-operation.schema.ts`, `store-operation.ts`,
`company-store-operation.ts`).

**A configuração da loja tem backend** (2026-09-25, migration
`20260926090000_loja_configuracoes`): a identidade visual (tema, cores, logo)
em `store_settings`, e as formas de pagamento e os bairros com taxa como dois
blocos novos de `store_operations`. Pagamento online fica recusado até a conta
Asaas existir.

**A corrida nasce do pedido** (2026-09-26, migration
`20260926150000_loja_pedido_corrida`): no aceite, agendada para quando o pedido
fica pronto, liberada no "Pronto", cancelada junto com o pedido; o pedido
acompanha a corrida até "Entregue". Regras em `business-rules.md`.

Não existe ainda: a conta Asaas da loja (e com ela o pagamento online e o
estorno), o Web Push e o "Salvar cliente".

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
17. **Taxa de entrega por bairro** (2026-09-25, usuário): cada bairro atendido
    com a sua taxa; fora da lista, não há entrega. Fecha o "em aberto" do item 3.
18. **Estorno automático e total** (2026-09-25, usuário) do pedido pago online
    e recusado, cancelado ou vencido, pela conta Asaas da loja. Fecha o "em
    aberto" do item 2.
19. **Cliente só vira cadastro se a loja salvar** (2026-09-25, usuário), com o
    aviso no checkout de que os dados vão para a loja. Fecha o "em aberto" do
    item 1.
20. **Login do cliente pelo Firebase, só com Google** (2026-09-26, usuário). O
    Clerk, escolhido antes, exige domínio próprio em produção, e ainda não há
    domínio: a loja roda em `.vercel.app`. O Firebase já é do projeto (push do
    motoboy) e aceita o endereço do Vercel como domínio autorizado.

## A fazer

### 1. Salvar o cliente com os dados do pedido do PWA

> **Desenhado nas telas de demonstração em 2026-09-23.** Falta o backend.
> O checkout já coleta telefone e endereço estruturado, e cada pedido os grava
> em `store_orders`; neste aparelho, o endereço fica guardado para o próximo
> pedido.

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

**Decidido** (decisão 19): só vira cadastro se a loja salvar, com o aviso no
checkout de que os dados vão para a loja.

### 2. Aceite automático ou manual

> **Desenhado nas telas de demonstração em 2026-09-23, refeito com as etapas
> do pedido em 2026-09-25, e no servidor desde 2026-09-26**, em Tipos de pedido
> → Recebimento. Falta o estorno, que depende do Asaas.

Automático (padrão): o pedido nasce aceito. Manual: fica em "Novo" até alguém
aceitar — e dá para mudar o tempo de preparo daquele pedido na hora de aceitar.

Já resolvido nas telas: o som de pedido novo repete a cada 30 segundos enquanto
houver pedido esperando aceite, e a tela de vendas diz quantos esperam. O
cancelamento vale nos dois modos: até o pedido ficar pronto, na entrega.

**Prazo do aceite** (2026-09-25): cada loja escolhe, e vem ligado com 10
minutos. Não aceito no prazo, o pedido é cancelado pelo sistema e o cliente é
avisado. Para agora, o prazo conta do recebimento; agendado, vai até a hora de
a cozinha começar. Regra em `prazoDoAceite` (`store-order.rules.ts`). No
servidor, o pedido vencido cai na leitura seguinte da fila ou dos pedidos do
cliente, sem tarefa agendada; o aviso ao cliente com a página fechada espera o
Web Push.

**Estorno** (decisão 18): pedido pago online e recusado, cancelado ou vencido
é estornado inteiro, automaticamente, pela conta Asaas da loja — pela decisão
3, é nela que a venda cai.

### 3. A empresa configura o valor da taxa de entrega cobrada no PWA

> **Desenhado nas telas de demonstração em 2026-09-23; os bairros com taxa
> gravam na API desde 2026-09-25, e o checkout cobra a taxa do bairro desde
> 2026-09-26.**

A tela de Configurações já tem o checkbox "cobrar a entrega do cliente na
página", mas **não tem onde pôr o valor**. Falta o campo.

> Lendo "comprar" como "cobrar". Se a intenção era outra, corrigir aqui.

**A distinção que não pode se perder:** o valor que a loja cobra do cliente é
independente do que a central cobra da loja na fatura. São dois números, e
tratá-los como um só é o erro provável — a loja pode cobrar mais, menos ou nada,
e continua devendo a entrega à central do mesmo jeito.

**Decidido** (decisão 17): **por bairro**, como as telas de demonstração já
fazem — cada bairro atendido com a sua taxa, e bairro fora da lista não pede
entrega.

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
com checkout e lista de "Meus pedidos". Na loja de verdade, o catálogo vem da
API, o pedido é gravado nela e "Meus pedidos" a consulta; a sacola fica no
`localStorage` do aparelho. A loja de exemplo guarda tudo no aparelho.

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
sacola não exige conta; fechar exige. A identidade é do Firebase, só com Google
(decisão 20), carregado só no grupo de rotas `(loja)` — ver `agent-handoff.md`
para por que ele não toca o painel.

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
é FCM para o app Android do motoboy). Enquanto isso, Vendas consulta a fila a
cada 10 s e "Meus pedidos", a cada 20 s.

**Contrato a alterar na integração:** `CompanyCustomerAddress` não tem bairro, e
a taxa por bairro obriga o checkout a coletá-lo. Mexe em `packages/types`, na
validação e no cadastro de clientes do painel.

## Ordem sugerida

1. ~~Schema e migration do catálogo (produto, categoria, grupo, escolha,
   tamanho).~~ Feito em 2026-09-25.
2. ~~Endpoints e contratos em `packages/*`, com os schemas Zod~~ — do catálogo
   e da operação (horário, status, tipos de pedido, avisos), feito em
   2026-09-25 — e da identidade, do pagamento e dos bairros, também em
   2026-09-25. Falta a conta Asaas da loja.
3. Ligar as telas do painel que já existem — ~~Produtos, Organizar, Horários,
   Tipos de pedido, Notificações, status e Configurações~~, feito em
   2026-09-25 — ~~e Vendas~~, em 2026-09-26. Falta **apagar** a loja de
   exemplo, com o `loja-mock.ts` e o `loja-demo.ts`.
4. O PWA do cliente: ~~catálogo~~ (vitrine pelo link, feito em 2026-09-25),
   ~~carrinho e checkout (com telefone e endereço estruturado, por causa do item 1)~~, feitos em 2026-09-26. Pagamento online espera o Asaas.
5. ~~Pedido da loja virando entrega, com o aceite do item 2 — só para a loja
   que entrega pelo MOTOboyCity (decisão 15)~~, feito em 2026-09-26. Falta o
   Web Push de servidor para os avisos da loja e do cliente.
6. Salvar cliente a partir da venda (item 1).
7. ~~Pôr o item "Loja" de volta no `NAV_ITEMS`~~, feito em 2026-09-26.
