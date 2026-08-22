# Levantamento — o que a plataforma atual tem e o MOTOboyCity não

> Atualizado em 2026-08-22. Baseado em navegação **somente leitura** no sistema
> hoje em produção, feita com autorização do responsável. Nenhum dado pessoal,
> endereço de cliente, nome de entregador ou valor individual foi copiado para
> este repositório — só estrutura, vocabulário e agregados.

## O que é o sistema observado

`motoboycity.app.br` é o **Portal de Pedidos** de uma instância white-label da
**Plataforma Entregas Expressas** (`entregasexpressas.com.br/admin`). Ou seja,
o MOTOboyCity opera hoje alugando um SaaS de terceiro, e este projeto é o
substituto.

Isso importa para priorizar: os clientes que precisam migrar **já usam** o que
está descrito aqui. Uma funcionalidade ausente não é só uma comparação
desfavorável — é um motivo concreto para a loja não trocar de sistema.

Áreas navegadas: dashboard operacional, pedidos, indicadores, relatórios,
integrações, configurações e financeiro. Suporte foi aberto mas o conteúdo é
conversa real e não está registrado aqui.

## Dado que resolve uma decisão pendente

O painel financeiro da operação real, no período consultado:

| Linha                  | Valor        |
| ---------------------- | ------------ |
| Total dos Entregadores | R$ 12.774,44 |
| Total de Comissão      | R$ 1.336,82  |
| Soma Total             | R$ 14.111,26 |

**A comissão praticada é ~9,5%** — o entregador fica com ~90,5%. O
`driverCommissionPercentage` estava listado como decisão pendente do
responsável; este é o número que a própria operação já pratica. A decisão
continua sendo dele, mas agora tem referência.

Outros números úteis para dimensionar: ticket médio de **R$ 5,98**, tempo médio
de entrega de **~31 min**, e uma loja sozinha faz **~8,5 pedidos/dia** com picos
de 20–25.

## Máquina de estados: dois estados a mais

A plataforma atual usa:

```
Agendado → Em preparo → Buscando → Aceito → Chegou na coleta → Coletado
         → [Retorno ao local de coleta] → Concluído        (+ Cancelado)
```

O MOTOboyCity não tem **Em preparo** nem **Chegou na coleta**.

`Chegou na coleta` é o mais relevante: sem ele, a métrica "do aceite até a
coleta" implementada em `delivery-stage-times.ts` mistura duas coisas
diferentes — o tempo do motoboy chegando e o tempo da loja entregando o pacote.
Com o estado, a mesma métrica passa a apontar de quem é o atraso, que é a
pergunta que o lojista realmente faz.

## Prioridade sugerida

A ordem abaixo é por **valor entregue dividido por custo e risco**, não por
ordem de descoberta.

### 1. Barato e de alto uso

| Item                         | Por quê                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cronômetro ao vivo** ✅    | _Feito._ Cada pedido na fila mostra há quanto tempo está no estado atual. É o medidor de pressão da operação.                                     |
| **Clonar entrega** ✅        | _Feito._ Loja com ~8,5 entregas/dia sai sempre do mesmo endereço. Reaproveita a criação existente. Ver nota abaixo sobre o que **não** é copiado. |
| **Chegou na coleta**         | Valor de enum aditivo + um endpoint. Conserta a ambiguidade do SLA recém-implementado.                                                            |
| **Inverter local de coleta** | Troca coleta e entrega. Trivial no formulário.                                                                                                    |

Sobre clonar entrega, duas decisões que só apareceram na construção:

- **o número externo não é copiado.** Ele identifica UM pedido no sistema da
  própria loja, e é por ele que a conciliação acontece depois — duplicá-lo
  criaria duas entregas alegando ser o mesmo pedido;
- **o endereço só é reaproveitado com coordenadas.** O despacho mede distância
  por lat/lng; copiar rua e número sem o par montaria um destino que parece
  completo e falha no cálculo. Sem coordenadas, a tela avisa e pede que a
  pessoa reescolha.

### 2. Valor real, custo médio

| Item                               | Observação                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Em preparo**                     | Separa "a loja ainda está montando o pedido" de "estamos procurando motoboy".                                               |
| **Código de coleta / confirmação** | Códigos que provam coleta e entrega. Precisa de schema e tela no app.                                                       |
| **Saldo negativo na carteira**     | Hoje o ledger só credita. A plataforma atual permite entregador devedor — muda o modelo financeiro.                         |
| **Bloqueado na carteira**          | Retenção distinta de "pendente". Existe lá como linha própria.                                                              |
| **Carteira do cliente**            | Empresa com saldo pré-pago. Hoje só há carteira de entregador e fatura.                                                     |
| **Insucesso configurável**         | A plataforma tem "Problemas na entrega" como configuração. O caminho de falha já existe aqui; o que falta é parametrização. |

### 3. Grande porte — decisão de produto antes de código

- **Múltiplas praças** — contradiz a regra confirmada de praça única em
  `business-rules.md`. Não mexer sem decisão do responsável.
- **Prova de entrega (foto/assinatura)** — `business-rules.md` registra que foi
  deliberadamente adiada, com o risco aceito por escrito. Reabrir é decisão de
  produto nova, não correção.
- **Taxa de chuva** — inspecionada em 2026-08-22, ver detalhamento abaixo.
- **Roteirizador automático** e **agrupamento inteligente** — otimização de
  rotas; escopo próprio.
- **Escalas e diárias**, **desafios**, **punição de entregadores** — gestão de
  frota.
- **Perfis de acesso** — hoje há três perfis fixos; lá é RBAC configurável.
- **Notas fiscais**.

### 3.1 Detalhamento das três configurações inspecionadas

Telas abertas em modo leitura no admin da plataforma, sem alterar nada.

**Taxa de chuva** (`/admin/settings/taxa_chuva`) — o gatilho é **manual**, não
API de clima: existe um interruptor "Taxa de Chuva Ativa Agora". A configuração
é mais rica do que parecia de fora:

- tipo **porcentagem ou fixo**, com valor;
- **quanto do adicional vai para o entregador** — tabela de preço, porcentagem
  ou fixo;
- aviso opcional ao cliente no formulário, com mensagem customizável;
- **lista de clientes isentos**, para não aplicar a empresas escolhidas.

O último item é o que torna a funcionalidade vendável: sobe o preço na chuva
sem irritar o cliente grande.

**Horário de funcionamento** (`/admin/settings/horario_funcionamento`) — o mais
simples dos três. Liga/desliga geral; por dia da semana, com **múltiplas faixas**
(abre, fecha para o almoço, reabre); atalho "clonar de segunda a sexta". Fora do
horário, o envio de pedido é **bloqueado**.

**Tarifa dinâmica** (`/admin/settings/tarifa_dinamica`) — **a operação NÃO tem
esta funcionalidade.** A tela é uma página de venda: R$ 199/mês somados ao plano
atual, ou inclusa no plano Platina.

Isso reposiciona o item: como nunca foi usada, **nenhum cliente depende dela** e
ela não é bloqueio de migração. E é a mais cara de construir — polígonos
desenhados no mapa, áreas automáticas comparando pedidos pendentes com
entregadores disponíveis, prioridade de sobreposição e visualização das zonas no
app do entregador. Recomendação: fora da lista por ora.

### 4. Provavelmente não vale

- **As 40+ integrações.** O responsável confirmou em 2026-08-22 que a
  integração fica **só com o aiqfome**. Registrado como decisão, não a
  reabrir. Observação factual, não recomendação: a plataforma atual expõe
  **Open Delivery** como categoria com oito parceiros por baixo, ou seja, uma
  implementação abre vários — se algum dia o escopo mudar, é por ali que rende.
- **Operador digital de atendimento (IAGo)** — atende no Portal e no WhatsApp
  24h. Produto inteiro à parte.

## Relatórios que a plataforma tem

Catálogo observado, útil como referência de backlog: Pedidos por Data,
Histórico de Entregas, Pedidos Faturados, **Pedidos Cancelados por motivo**,
**Pedidos por Canal**, Valores por Forma de Pagamento, **Horários de Pico**,
**Tempos e SLA por etapa**, **Insucesso de Entrega**, **Entregas por
Bairro/Cidade**, Relatório de Escalas, Pedidos por Entregador.

Três já foram feitos aqui: SLA por etapa, o caminho de insucesso e **horários de
pico**. **Cancelamento com motivo** é o próximo mais barato — hoje o
cancelamento não registra justificativa.

Sobre horários de pico, vale registrar o que o trabalho revelou: o dado já
estava em `createdAt`, como previsto, mas o relatório só ficou honesto depois de
duas correções que não apareciam no levantamento. A primeira é o fuso — contar a
hora em UTC jogaria o pico do almoço para as 15h. A segunda é o calendário: uma
janela de 30 dias quase nunca tem o mesmo número de segundas e de domingos, e a
contagem crua daria 25% a mais de volume ao dia que aparecesse cinco vezes. O
número por dia da semana é média por ocorrência, não soma.

## Limites deste levantamento

- Navegação somente leitura: nada foi clicado que criasse, alterasse ou
  enviasse qualquer coisa.
- As seções **Gestão**, **Suporte** e os submenus de Financeiro e Relatórios do
  admin não foram abertos em profundidade.
- Não há acesso ao código nem à documentação técnica da plataforma; tudo aqui é
  inferido da interface.
- Números refletem o período consultado em 2026-08-22 e servem para dimensionar
  ordem de grandeza, não para contabilidade.

## App do entregador — comparação com o nosso

Navegação em modo leitura no app do concorrente
(`br.com.entregasexpressas.motoboycity.courier`, versão 2.14.6), com o
interruptor "Ativo" desligado para não haver risco de aceitar corrida real.

### O menu deles, e o que temos

| Item do menu         | Nosso equivalente          |
| -------------------- | -------------------------- |
| Carteira             | `DriverWalletScreen` ✅    |
| Pedidos Disponíveis  | **não temos** — ver abaixo |
| Histórico de Pedidos | `DriverHistoryScreen` ✅   |
| Pedidos Agendados    | **não temos** no app       |
| Minhas Escalas       | **não temos**              |
| Desafios             | **não temos**              |
| Suporte              | **não temos**              |
| Perfil               | `ProfileScreen` ✅         |

### A diferença que mais importa: vitrine contra empurrão

O nosso despacho **empurra** a oferta para um motoboy por vez
(`emitToDriver(nextDriverId, 'delivery:offer')`), com prazo de resposta e fila —
se ele não responde, passa para o próximo.

O deles tem uma tela "Pedidos Disponíveis": o motoboy **navega** o que está
aberto e escolhe. É um modelo de vitrine.

Nenhum dos dois é obviamente melhor, e a escolha é de operação, não de código:

- **empurrão** distribui de forma controlada e evita que o pedido ruim fique
  encalhado, mas depende de o motoboy estar com o app aberto e responder rápido;
- **vitrine** dá autonomia e cobre o caso de ninguém aceitar o empurrão, mas
  deixa a corrida longa ou barata parada — foi provavelmente por isso que eles
  também têm bônus por volume.

**Confirmado pelo responsável:** no deles, o pedido que ninguém aceitou fica na
vitrine esperando alguém entrar e assumir. É exatamente o complemento do
empurrão, não um substituto.

**Feito em 2026-08-22.** Empurra primeiro e, esgotada a fila, o pedido aparece
na vitrine para todos — inclusive para quem deixou a oferta expirar. Isso fecha
um buraco que existia: `dispatchDelivery` retorna em silêncio quando não há mais
motoboy elegível, e como quem já recebeu fica excluído da próxima rodada, o
pedido só voltava a se mexer se aparecesse um motoboy **novo**.

### Minhas Escalas — turnos que o motoboy aceita

A plataforma publica escalas e o motoboy aceita turnos, com seletor de data. É
outro modelo de disponibilidade: o nosso é avulso, o motoboy liga o "disponível"
quando quer.

Conecta com o "Relatório de Escalas" que aparece no catálogo de relatórios
deles.

### Desafios — bônus por volume

O admin cria um desafio com meta, bônus, janela de datas e filtro por tipo de
veículo. O app mostra barra de progresso.

O exemplo visto: meta de 1000 entregas no mês, bônus de R$ 100, com progresso
parcial. É mecanismo de retenção.

**Ressalva de desenho:** é exatamente o incentivo que motiva correr e recusar
corrida ruim — o mesmo motivo que levou o nosso relatório de desempenho a não
ter nota única. Se for implementar, vale pensar em meta que não seja só volume.

### Detalhe operacional que o app deles trata e o nosso não sei se trata

Um aviso fixo no topo: _"Otimização de bateria está ativada. A localização em
tempo real e o recebimento de pedidos em segundo plano podem ser afetados."_

Vale conferir se o nosso app detecta isso. Rastreamento que morre em segundo
plano é falha silenciosa — o pedido parece parado e ninguém sabe por quê.

**Respondido na segunda inspeção (2026-08-22, noite).** Eles resolvem no
servidor, não no aparelho — ver abaixo.

## Segunda inspeção do painel — 2026-08-22 (noite)

O primeiro levantamento deixou registrado que **Gestão**, **Suporte** e os
submenus de Financeiro e Relatórios não tinham sido abertos. Foram, agora.
Navegação somente leitura; um modal de "lançar pedido" abriu por clique errado
e foi cancelado sem criar nada.

### Aviso de segurança sobre o desenho deles

A tela de atendimento lista as mensagens de cobrança em texto puro, e cada uma
carrega um link `…/iago/auth/<token>` — magic link de acesso à conta do cliente
— ao lado da chave PIX e do nome do titular. Mensagens de junho ainda apareciam
com o token legível em agosto.

**Consequência para nós:** quando fizermos cobrança automática com link, o token
tem que ser de **uso único e validade curta**, e a tela de histórico não deve
reexibi-lo. Copiar o formato deles copiaria o problema junto.

### Números reais da operação — mesma cidade que a nossa

Trinta dias até 22/08/2026, praça Cidade Lajinha:

| Medida                      | Valor                             |
| --------------------------- | --------------------------------- |
| Entregas realizadas         | 3.152 (~105/dia)                  |
| Recorde em um dia (90 dias) | 188 (10/07)                       |
| Faturamento                 | R$ 20.958,37                      |
| Repasse aos entregadores    | R$ 18.970,48                      |
| **Margem da operação**      | R$ 1.987,89 — **9,5%**            |
| **Ticket médio**            | **R$ 6,65**                       |
| Cancelamento                | 2% (67 de 3.220)                  |
| Entregadores ativos         | 5                                 |
| Abertura → aceite           | 0 min                             |
| Aceite → coleta             | 10 min                            |
| Coleta → entrega            | 23 min                            |
| **Origem dos pedidos**      | **Manual (painel): 3.220 — 100%** |

Duas leituras que mudam decisão:

1. **Margem de 9,5%.** O repasse é 90,5% do faturamento. Qualquer tabela de
   preços nossa precisa fechar perto disso para ser competitiva com o que os
   motoboys da cidade já recebem hoje.
2. **100% dos pedidos são lançados à mão no painel.** As 40+ integrações
   existem e **nenhuma é usada**. Isso confirma, com dado e não com opinião, que
   a decisão de ficar só com o aiqfome não custa nada em migração.

Os tempos médios servem de meta: 10 min até a coleta e 23 min até a entrega é o
padrão que a cidade já conhece.

### O que vale copiar — por valor sobre custo

#### Nível 1 — barato, alto uso, o dado já existe aqui

**Aviso de entregador sem localização.** É a resposta à pergunta que ficou em
aberto acima. Eles **não** detectam otimização de bateria no aparelho: o
servidor percebe que o motoboy tem pedido em andamento e parou de mandar
posição, e manda mensagem pedindo para reabrir o app. Funciona independente da
causa — bateria, app fechado, sinal. Temos os pings; falta o detector e o aviso.
Foi visto em uso real, com dois motoboys diferentes.

**Devolver a entrega à fila.** O motoboy relata um problema e solta o pedido,
que volta a ficar disponível. É o par que falta da vitrine recém-entregue: hoje,
um pedido aceito que travou não tem caminho de volta a não ser pela mão do
admin. Eles têm regra de elegibilidade — a resposta observada foi "não encontrei
nenhum Pedido seu elegível para devolver à fila agora".

**Marcar coleta / entrega / retorno esquecidos, com tempo mínimo.** Motoboy
esquece de tocar o botão. Cada ação tem um **tempo mínimo em minutos** para não
marcar entrega cinco segundos depois da coleta. É um detalhe pequeno que separa
a funcionalidade útil da que vira fraude.

**Painel de caixa.** Numa tela: faturas vencidas, faturas a vencer, **concluídos
sem fatura**, saques pendentes, saldos negativos, valor bloqueado, disponível em
carteiras. "Concluídos sem fatura" (R$ 7.951,16 lá) é trabalho feito e ainda não
cobrado — número que hoje não mostramos em lugar nenhum.

**Ocultar valores.** Um botão que borra os números de dinheiro na tela. O dono
mostra o painel para outras pessoas.

#### Nível 2 — valor real, custo médio

**Régua de cobrança automática.** Cinco disparos, todos às 09:00: ao gerar a
fatura, 1 dia antes do vencimento, no dia, 1 dia depois, e aos 5 dias vencida.
Canal por WhatsApp e/ou portal, e **escolha de qual telefone do cadastro** usar
(padrão, da loja, administrativo). Há um campo de "texto extra" que eles usam
para colar a chave PIX. Ver o aviso de segurança acima antes de copiar o link.

**Kanban ao vivo por status com SLA configurável.** Uma coluna por status,
atualizando sozinho, com sinalização em "sem aceite após 5 min · coleta após 15
min · entrega após 30 min", ajustável. É a evolução natural da nossa fila com
cronômetro.

**Meta diária e recorde.** Meta por praça, "definida uma vez, vale todo dia", e
o recorde de 90 dias com o progresso de hoje contra ele.

**Comparação honesta de período.** Todo indicador compara com o período anterior
"(até agora)" — 30 dias até este instante contra os 30 anteriores até o mesmo
ponto do dia. Sem isso, o dia corrente pela metade sempre pareceria queda.

**Rótulo HISTÓRICO.** Quando o filtro não é "Hoje", a tela avisa em destaque que
os dados não atualizam em tempo real, e o feed ao vivo some. Evita que alguém
tome decisão olhando número parado achando que é atual.

#### Não é funcionalidade — é jogada do fornecedor

**Oportunidades** e **Marketing** não são ferramentas da operação: são do dono
da plataforma. Oportunidades roteia leads de um "Mercado de Entregas" por região
para quem assina; Marketing entrega e-books e posts prontos. São mecanismos de
retenção do fornecedor, não algo que uma operação de uma cidade constrói.

### Configurações que ainda não estavam catalogadas

Da tela de Configurações, itens que não apareciam no primeiro levantamento:
Nomenclaturas (renomear entidades na interface), Valores Transportados,
Segurança na Entrega, Chegada na Entrega, Tempo de Coleta, Tempo Entrega,
Escalas de Clientes, Domínio Próprio, Automatizador de Carteiras, Bônus
Automático, **Taxa de Deslocamento**, Repasses Automáticos, Toque do App, Links
no App, Botão de Chamar Entregador, Modelos de importação, Parametrização
Avançada.

Duas seguradoras aparecem integradas (IZA, 88i), o que explica o item "Valores
Transportados".

### Como o operador digital deles é configurado

Útil como especificação, mesmo que a gente nunca construa o chat. As tarefas
autorizadas ao motoboy são exatamente a lista de furos operacionais que um app
de entrega tem: consultar saldo e extrato, **ver entregas disponíveis**,
solicitar saque, **devolver entrega à fila**, marcar coleta/entrega/retorno
esquecidos. Marcados como "em breve" no painel deles: repassar entrega a outro
entregador e lançar entrega para si mesmo.

Do lado do cliente: consultar pedidos, entregas em andamento, faturas, carteira,
lançar pedido, e transferir para humano — este último "sempre ativo", sem opção
de desligar.
