# Regras de negócio confirmadas — MOTOboyCity

> Fonte de verdade para decisões de negócio já confirmadas com o responsável do
> produto. Não redescubra, não re-questione e não "otimize" essas decisões —
> se uma tarefa tocar um destes temas, use a regra como dada. Se surgir uma
> subcasística realmente não coberta aqui (ex.: percentual exato de comissão,
> taxa exata de antecipação), trate só essa lacuna pontual como DECISÃO
> PENDENTE — não reabra a regra inteira.
>
> Este arquivo cobre **decisões**, que mudam raramente. Para **estado de
> implementação** (o que já está no código, o que falta, contratos exatos de
> endpoint), leia `docs/agent-handoff.md` — ele é atualizado com muito mais
> frequência e é a fonte mais atual se os dois divergirem.

## Retorno ao local de coleta

Não é um `DeliveryStatus` novo. É uma flag (`requiresReturn`) + valor
congelado (`returnValue`) em `Delivery`, vindo de `PricingTable.returnFee`
(valor fixo, não proporcional à distância). A empresa marca na criação do
pedido. A empresa paga o extra (aumenta o valor total do pedido). Repassado
100% ao motoboy, sem comissão da plataforma na perna de retorno. Acontece
entre `DELIVERED` e `COMPLETED` — sem status novo. O fechamento
(`complete-return`) exige o motoboy fisicamente perto do endereço de coleta
da empresa — ver "Destino conhecido vs. capturado por GPS" abaixo.

## Comissão (motoboy/plataforma)

Percentual, configurável pelo admin — não hardcoded, sem valor padrão fixo
decidido (isso é configuração de implementação, não decisão de negócio
bloqueante).

## Preços personalizados por empresa

O admin pode manter uma tabela de preços própria para uma empresa e tipo de
serviço. Quando existir uma tabela personalizada ativa, ela tem prioridade;
quando não existir, a empresa usa a tabela geral ativa da sua região.

Uma nova tabela desativa somente a anterior do mesmo escopo (empresa + tipo de
serviço, ou tabela geral + tipo de serviço). Valores já calculados continuam
congelados em `Delivery` e nunca são reescritos por uma alteração posterior.
Comissão da plataforma e taxas adicionais continuam globais; personalizá-las
exigiria uma decisão de produto separada.

## Cálculo de distância

Rota real via Google Maps Routes API — explicitamente não é distância em
linha reta. **Exceção deliberada**: a checagem de proximidade de retorno
(`complete-return`) usa distância em linha reta (Haversine) de propósito —
é uma checagem de "está perto o suficiente pra fechar", não um cálculo de
preço.

## Cancelamento

Empresa só pode cancelar enquanto nenhum motoboy aceitou. Admin pode
cancelar a qualquer momento, em qualquer status (exceto já
CANCELLED/COMPLETED). Motoboy **não pode** cancelar depois de aceitar — só
admin pode remover um pedido de um motoboy pós-aceite. Sem penalidade
monetária definida pra nenhum cenário de cancelamento.

## Timeout de despacho

Fila via Redis. Oferta vai pro primeiro motoboy da fila; duração da janela
de aceite é configurável pelo admin (não hardcoded); se expirar sem
resposta, a oferta passa automaticamente pro próximo da fila.

## Suspensão/bloqueio de motoboy

Decisão exclusiva do admin, sem prazo definido, sem processo formal de
recurso.

## Saque

Liberado toda segunda-feira pro motoboy solicitar. Sem valor mínimo, sem
taxa.

## Antecipação

Taxa e limite configuráveis pelo admin (mesmo padrão da comissão) — sem
valores fixos decididos.

## Faturamento da empresa

Fecha toda segunda-feira, agrupando todos os pedidos entregues desde o
último corte. Vencimento no mesmo dia do fechamento. Cobrança
manual/offline pro lançamento — sem gateway de pagamento (boleto/PIX
automático) planejado ainda.

A empresa pode usar **Já paguei** para informar valor, data e observação de um
pagamento manual. Esse aviso não quita nem altera a fatura: somente o
administrador pode confirmar o recebimento pelo fluxo normal de baixa ou
recusar informando o motivo. Existe no máximo um aviso pendente por fatura; se
ele for recusado, a empresa pode corrigir os dados e enviar outro.

## Regiões

Cada empresa e entregador pertence a uma única região. A operação pode ter
somente uma praça ativa hoje, mas o cadastro administrativo de entregador exige
que o admin selecione explicitamente uma região ativa; não existe vínculo
com várias regiões para o mesmo entregador.

## Cadastro de entregador pelo administrador

Além do autocadastro no aplicativo, o administrador pode criar um entregador na
aba **Entregadores**. O cadastro exige dados pessoais e de acesso, PIX, região
ativa e pelo menos uma modalidade ativa. A primeira modalidade selecionada é a
principal.

O perfil criado pelo admin segue exatamente o mesmo portão operacional do
autocadastro: nasce com aprovação `PENDING`, conta `ACTIVE` e disponibilidade
`UNAVAILABLE`. Aprovar continua sendo uma ação administrativa separada; o
cadastro não autoaprova nem coloca o entregador online. Veículo e documentos não
fazem parte desta etapa porque ainda não existe fluxo integrado de upload e
revisão desses itens.

## Integração com serviço de entrega

Só Aiqfome. As integrações mostradas em dado mock antigo não são escopo
real.

## Origem do pedido

Pedidos vêm tanto de criação manual (company-web) quanto do webhook do
Aiqfome, em paralelo — nenhum bloqueia o outro.

## Arquitetura de sessão/token

Revisitada em 2026-08-09 e mantida como está, deliberadamente: JWT em
`localStorage`, sem cookie `httpOnly`, sem refresh token. Migrar pra
cookie+refresh é um item de trabalho futuro separado, não empacotado em
nenhuma fase existente. Não repropor essa migração sem ser pedido.

## Despacho em lote

Um lote é 2–50 entregas **imediatas** criadas numa chamada só; lote
agendado não é suportado. Sem tabela `DeliveryBatch` própria — um UUID
gerado pela aplicação vai em `Delivery.batchId` (`null` preserva pedido
avulso). O lote é uma unidade de despacho: uma oferta agregada pra um
motoboy só; aceite/recusa/expiração/cancelamento se aplicam a todos os
itens juntos (uma `DeliveryOffer` + uma entrada de histórico por entrega
por baixo, pra granularidade de auditoria).

## Destino conhecido na criação vs. capturado por GPS na entrega

A empresa escolhe, **por pedido/lote inteiro** (mesmo valor obrigatório em
todos os itens de um lote — não dá pra misturar dentro do mesmo lote),
entre dois modos:

- **Destino conhecido** (padrão, como sempre foi): endereço de entrega
  informado na criação, preço calculado e congelado ali mesmo.
- **Destino desconhecido**: sem endereço nenhum na criação. O motoboy não
  vê valor nenhum ao aceitar a oferta. A localização GPS dele no momento de
  marcar "entregue" vira o destino daquele item especificamente, com preço
  calculado retroativamente a partir daí.

Fechamento: item sem `requiresReturn` fecha sozinho (`COMPLETED`) assim que
marcado entregue. Item com `requiresReturn=true` fica em `DELIVERED` até o
motoboy voltar fisicamente perto da empresa e confirmar via
`complete-return`.

**Contexto histórico, pra não reabrir a discussão sem necessidade**: uma
versão anterior deste mesmo conceito (2026-08-10) tinha sido explicitamente
descartada durante a implementação em 2026-08-13, por não existir ainda
máquina de estados nem cálculo de preço que sustentasse isso com segurança.
A versão atual (2026-08-16) resolve exatamente essas duas lacunas com o
ciclo `ACCEPTED → COLLECTED → DELIVERED → COMPLETED`
(`collect`/`deliver`/`complete-return`).

**Deliberadamente sem prova de entrega adicional** (foto, assinatura,
confirmação do cliente) nesta fase — o responsável aceitou explicitamente o
risco de fraude/erro por ora ("Só o GPS mesmo, sem prova adicional"). Não é
um descuido nem uma lacuna esquecida — se isso for revisitado, é uma
decisão de produto nova, não uma correção de bug.

## Secretária Virtual administrativa

A primeira versão da Secretária Virtual no admin é **somente leitura**. Ela
pode consultar operação, relatórios, pedidos, empresas e motoboys por
ferramentas controladas, mas não pode criar, cancelar, aprovar, bloquear,
alterar preços ou executar qualquer outra escrita. Ações só podem entrar em uma
fase posterior, depois de permissões granulares, confirmação explícita,
idempotência e auditoria de antes/depois.

O texto das conversas não é persistido. A auditoria guarda somente metadados da
requisição e parâmetros/resultados reduzidos das ferramentas, sem CPF,
telefone, e-mail, endereço, coordenadas, destinatário ou credenciais.

---

Decisões confirmadas diretamente com o responsável do produto em sessões
anteriores. Se uma regra aqui parecer desatualizada em relação ao código,
trate o código (ou `docs/agent-handoff.md`) como mais atual e avise o
responsável — não assuma silenciosamente qual dos dois está certo.
