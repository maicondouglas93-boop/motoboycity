# Plano de implementação — Loja online (PWA) e catálogo

> Referência **atual** da loja online no MOTOboyCity. O `changelog.md` guarda a
> história de cada recorte; este arquivo guarda o que vale hoje e o que falta.
>
> O plano equivalente do Ligeirinho está descontinuado: o trabalho migrou para
> este repositório.

## Onde estamos

Existe a área `/loja` no `company-web`, com **telas de demonstração**:

| Tela                                   | O que faz                                                 |
| -------------------------------------- | --------------------------------------------------------- |
| `/loja/vendas`                         | Pedidos vindos da loja, janela de cancelamento, detalhe   |
| `/loja/produtos`                       | Lista, filtros por situação, aviso de pendências          |
| `/loja/produtos/organizar`             | Categorias e ordem do catálogo                            |
| `/loja/produtos/novo` e `/[id]/editar` | Cadastro e edição, um formulário só                       |
| `/loja/configuracoes`                  | Link, identidade visual, pagamentos, Asaas, preparo, taxa |

**Nada disso tem backend.** Os dados vêm de `apps/company-web/src/lib/loja-mock.ts`
e vivem na memória do navegador. O arquivo pede para ser **apagado**, e não
adaptado, por quem for ligar à API. A loja **não está no menu** do painel; as
telas são alcançadas pela URL. O porquê está comentado no `NAV_ITEMS` do
`top-nav.tsx`.

Não existe ainda: schema Prisma, migration, endpoint, schema Zod, contrato em
`packages/*`, nem o PWA do cliente.

## Decisões já tomadas

1. **Uma loja por empresa, com link próprio** (`/slug`), e não um marketplace
   que reúne todas. A empresa divulga o próprio endereço.
2. **O pedido entra como `agendado`** e vira entrega sozinho quando o tempo de
   preparo vence. A loja não aprova nada — ela tem uma janela para cancelar.
   (Ver o item 2 de "A fazer": isto passa a ser configurável.)
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

### 2. A empresa decide se o pedido entra em agendado automaticamente

> **Desenhado nas telas de demonstração em 2026-09-23.** Falta o backend.

Checkbox em `/loja/configuracoes`. Marcado (padrão), vale a decisão 2 acima: o
pedido entra `agendado` e o motoboy é chamado quando o preparo vence.
Desmarcado, o pedido fica esperando alguém da loja confirmar.

**O que precisa ser resolvido junto, senão o modo manual vira armadilha:**

- Sem ninguém olhando a tela, o pedido fica parado e o cliente espera sem saber.
  Precisa de alerta sonoro/visual na tela de vendas e, provavelmente, de um
  prazo: não confirmado em X minutos, avisa ou cancela.
- **A janela de cancelamento deixa de existir no modo manual.** Hoje ela é o
  tempo de preparo correndo antes do despacho. Sem despacho automático não há
  janela — a tela de vendas precisa mostrar coisa diferente em cada modo, e não
  a contagem regressiva em ambos.
- Se o pagamento foi Pix online, o pedido já está pago quando chega. Recusar ou
  deixar expirar exige estorno. Definir de quem é a responsabilidade.

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

A loja respeita horário por dia com mais de uma faixa, feriados, pausa manual,
bairros com taxa própria, pedido mínimo e retirada no local. O checkout tem
observação do cliente.

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

Falta: manifest, service worker e instalação — sem eles é um site, não um PWA.
Falta o Web Push para avisar a loja de pedido novo (o que existe é FCM para o
app Android do motoboy). E falta o backend inteiro: hoje o pedido termina no
`localStorage` e a loja nunca fica sabendo dele.

**Contrato a alterar na integração:** `CompanyCustomerAddress` não tem bairro, e
a taxa por bairro obriga o checkout a coletá-lo. Mexe em `packages/types`, na
validação e no cadastro de clientes do painel.

## Ordem sugerida

1. Schema e migration do catálogo (produto, categoria, grupo, escolha, tamanho).
2. Endpoints e contratos em `packages/*`, com os schemas Zod.
3. Ligar as telas do painel que já existem; **apagar** o `loja-mock.ts`.
4. O PWA do cliente: catálogo, carrinho, checkout (com telefone e endereço
   estruturado, por causa do item 1).
5. Pedido da loja virando entrega, com o checkbox do item 2.
6. Salvar cliente a partir da venda (item 1).
7. Pôr o item "Loja" de volta no `NAV_ITEMS` — no mesmo recorte em que as telas
   deixarem de ser demonstração.
