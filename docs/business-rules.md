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
(`complete-return`) usa a confirmação do motoboy e não pode ser bloqueado por
GPS, distância ou precisão do aparelho.

## Comissão (motoboy/plataforma)

Percentual, configurável pelo admin — não hardcoded, sem valor padrão fixo
decidido (isso é configuração de implementação, não decisão de negócio
bloqueante). A configuração global vale para tabelas gerais e como fallback
das tabelas personalizadas antigas que ainda não possuem uma divisão própria.

## Preços personalizados por empresa

O admin pode manter uma tabela de preços própria para uma empresa e tipo de
serviço. Quando existir uma tabela personalizada ativa, ela tem prioridade;
quando não existir, a empresa usa a tabela geral ativa da sua região.

Uma nova tabela desativa somente a anterior do mesmo escopo (empresa + tipo de
serviço, ou tabela geral + tipo de serviço). Valores já calculados continuam
congelados em `Delivery` e nunca são reescritos por uma alteração posterior.

Ao criar uma tabela personalizada nova, o admin também define o percentual do
subtotal base + distância destinado ao motoboy; a plataforma recebe o
complemento até 100%. Preço e divisão são versionados juntos por empresa e tipo
de serviço. Tabelas gerais continuam usando a divisão global. Tabelas
personalizadas antigas sem percentual próprio também continuam herdando a
divisão global, sem backfill nem mudança retroativa.

O retorno continua 100% com o motoboy. Cada taxa adicional continua usando seu
próprio `driverSharePercentage`; esses dois valores não são afetados pela
divisão personalizada da tabela.

## Cálculo de distância

Rota real via Google Maps Routes API — explicitamente não é distância em
linha reta. O GPS continua obrigatório quando a posição capturada é o próprio
destino usado para calcular distância e preço; não é usado para bloquear a
confirmação de entrega com endereço já conhecido nem a confirmação de retorno.

## Cancelamento

Empresa só pode cancelar enquanto nenhum motoboy aceitou. Admin pode
cancelar a qualquer momento, em qualquer status (exceto já
CANCELLED/COMPLETED). O motoboy pode cancelar um pedido atribuído a ele em
qualquer etapa operacional ativa. Antes da coleta, também pode apenas devolver
o pedido à fila; depois da coleta, pode informar problema e retornar a
mercadoria à loja. Sem penalidade monetária definida pra nenhum cenário de
cancelamento.

“Problema na entrega” não devolve o pedido à fila e não troca o entregador. A
ação só existe depois da coleta: mantém o mesmo motoboy responsável, muda o
pedido para devolução pendente e preserva o valor normal da corrida. O repasse
é liberado uma única vez quando ele confirma que devolveu a mercadoria à
empresa. O insucesso não cria desconto nem cobrança adicional; uma taxa de
retorno só existe quando o pedido já nasceu com `requiresReturn=true`.

As ações do motoboy usam o horário atual do servidor. O aplicativo não exige
mais declaração retroativa, texto de justificativa para devolver à fila ou
prova de proximidade. Confirmações simples continuam existindo para evitar
toques acidentais e todas as transições permanecem no histórico auditável.

## Encerramento offline pelo motoboy

O motoboy pode marcar a entrega e concluir o retorno mesmo durante uma queda de
internet. A ação é salva primeiro no aparelho e fica claramente identificada
como pendente de sincronização; o aplicativo tenta enviá-la novamente ao abrir,
voltar ao primeiro plano, reconectar ou por comando manual. Quando o destino é
definido no momento da entrega, a coordenada e a precisão capturadas naquele
momento ficam congeladas junto da ação e não podem ser recapturadas depois.

O encerramento local não antecipa efeitos oficiais. Status auditável, horário
da transição, cálculo definitivo, faturamento e repasse só passam a valer após
a API confirmar a ação. O horário oficial continua sendo o horário do servidor
na sincronização. Entrega e retorno pendentes são enviados na ordem, sem
duplicar histórico ou crédito, e a fila é vinculada à identidade do motoboy
para nunca ser transmitida pela conta de outra pessoa no mesmo aparelho.

## Intervenções operacionais pelo administrador

Nos cards das filas, o administrador pode trocar o entregador, confirmar
coleta, confirmar entrega, cancelar ou finalizar um pedido. Toda intervenção
exige motivo, grava o usuário administrador no histórico e respeita a ordem das
etapas. A coleta continua atômica para o lote inteiro. Marcar uma entrega sem
retorno também conclui o pedido e libera o repasse; com retorno, mantém o pedido
em `DELIVERED` até a finalização.

O painel não marca como entregue um pedido cujo destino e preço ainda dependem
do GPS do motoboy. Sem a coordenada real, não existe distância segura para
calcular cobrança e repasse; esse caso precisa ser confirmado pelo aplicativo.

## Timeout de despacho

Fila via Redis. Oferta vai pro primeiro motoboy da fila; duração da janela
de aceite é configurável pelo admin (não hardcoded); se expirar sem
resposta, a oferta passa automaticamente pro próximo da fila.

Uma oferta criada com timeout válido consome a vez do motoboy e o move para o
fim da sequência. Assim a fila é circular mesmo quando o motoboy pode carregar
mais de um pedido; recusa e expiração continuam procurando o próximo elegível.

A Home do administrador mostra a sequência global dos motoboys online e permite
reordená-la. Sem ajuste manual, a prioridade inicial segue a entrada online mais
antiga. A mudança manual vale somente para ofertas futuras: não cancela oferta pendente
nem altera pedido aceito. Região, modalidades habilitadas, heartbeat, bloqueio e
capacidade continuam filtrando os candidatos; quando um motoboy incompatível é
ignorado, a ordem relativa dos demais é preservada.

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

Cada empresa tem uma política própria de fechamento. O administrador pode
escolher fechamento **manual**, executado quando quiser no detalhe da empresa,
ou **automático**. No automático, a frequência pode ser semanal, com um dia da
semana configurado, ou mensal, com dia de 1 a 31; quando o mês não possui o dia
escolhido, o corte ocorre no último dia civil daquele mês. O job avalia os
cortes devidos diariamente às 00:05 de `America/Sao_Paulo` e cada ciclo é
processado uma única vez, mesmo quando não há pedidos faturáveis.

Empresas já existentes mantêm, por padrão, o fechamento automático semanal de
segunda-feira. O vencimento permanece no mesmo dia do fechamento. A cobrança é
manual/offline pro lançamento — sem gateway de pagamento (boleto/PIX
automático) planejado ainda.

O administrador também pode configurar, por empresa, a suspensão automática
após 1 a 365 dias de atraso. Sem prazo configurado, o bloqueio fica desativado.
A suspensão acontece quando uma fatura em aberto atinge o limite, desconecta os
usuários da empresa e fica registrada no histórico de status. Pagamento não
reativa a empresa automaticamente: a reativação continua sendo decisão manual
do administrador.

No detalhe administrativo da fatura, o painel pode abrir o WhatsApp do
responsável `OWNER` ativo com uma mensagem pré-preenchida contendo somente
empresa, número da fatura, valor, vencimento e quantidade de pedidos. Se houver
mais de um responsável ativo, o administrador escolhe o destinatário. O painel
normaliza telefones brasileiros para `55 + DDD + número`; o envio final é
manual no WhatsApp. Não há anexo automático, PDF, token, link autenticado ou
dado pessoal na mensagem.

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

## Cadastro de empresa e redefinição de senha pelo administrador

O administrador pode cadastrar uma empresa diretamente na aba **Empresas**.
O cadastro exige responsável, contato/WhatsApp, CPF ou CNPJ, razão social,
nome fantasia, senha inicial e seleção explícita de uma região ativa. A criação
é atômica (`User` + `Company` + vínculo `OWNER`) e mantém o mesmo portão do
autocadastro: a empresa nasce `PENDING_APPROVAL` e a aprovação continua sendo
uma ação separada.

O administrador pode redefinir a senha de um entregador e de um responsável
`OWNER` ativo escolhido explicitamente dentro da empresa. Operadores, membros
inativos e usuários sem vínculo com o alvo não podem ser usados por essas
rotas. A nova senha tem no mínimo oito caracteres, nunca é devolvida nem
registrada em texto, e encerra imediatamente os tokens REST e conexões realtime
emitidos para a credencial anterior. A revogação usa uma impressão SHA-256 do
hash bcrypt no JWT, sem armazenar sessões no servidor e sem alterar a decisão
arquitetural de JWT em `localStorage`.

Ao redefinir a senha de um entregador, o sistema também o deixa indisponível,
fecha a presença operacional, remove o heartbeat do Redis e devolve ofertas
pendentes para a fila. Hash novo, indisponibilidade e fechamento do log são uma
única transação de banco. Redis e fila usam operações idempotentes com
retentativa; o timeout da oferta só é removido depois que o redespacho termina.
Uma requisição de presença que tenha começado antes da troca só pode gravar
enquanto a credencial autenticada ainda corresponde ao hash atual; assim ela
não religa o entregador depois do reset.

Tokens emitidos antes da introdução dessa impressão são rejeitados uma única
vez após o deploy; os usuários precisam entrar novamente. Isso evita que um
token legado sobreviva a uma redefinição administrativa.

## Foto de perfil

Qualquer usuário autenticado pode substituir a própria foto de perfil. O
arquivo é enviado pela API ao ImageKit; o PostgreSQL guarda somente
`avatarExternalFileId` e `avatarUrl`. A API aceita JPEG, PNG ou WebP de até
5 MB e 4096 x 4096 pixels, valida o conteúdo real do arquivo e, depois de
persistir a nova referência, tenta remover a imagem anterior. Se a gravação no
banco falhar, a imagem nova deve ser removida do provedor para não deixar
arquivo órfão.

O fluxo de interface está disponível no perfil do app do entregador e no
perfil do usuário autenticado do Company Web. A imagem continua pertencendo ao
`User`; logotipo compartilhado da empresa, veículo e documentos são recortes
separados.

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

Se uma entrega com destino desconhecido termina em problema depois da coleta,
a localização da tentativa de entrega — não a localização posterior da
devolução — vira o destino e congela distância, cobrança e repasse antes de o
pedido entrar em `FAILED`. Sem essa coordenada o insucesso não é registrado,
evitando uma devolução sem valor. A confirmação posterior na loja não recalcula
o preço e continua sem bloqueio de proximidade.

Fechamento: item sem `requiresReturn` fecha sozinho (`COMPLETED`) assim que
marcado entregue. Item com `requiresReturn=true` fica em `DELIVERED` até o
motoboy confirmar o retorno via `complete-return`. A confirmação permanece
auditada, mas GPS e proximidade da empresa não bloqueiam essa ação.

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

## Pedido criado pelo administrador para uma empresa

O administrador pode criar um pedido avulso em nome de uma empresa ativa,
escolhida explicitamente no painel. A criacao nao simula uma sessao da loja:
o pedido pertence a empresa selecionada, usa seu endereco principal de coleta,
sua regiao e sua tabela de precos personalizada, enquanto o administrador fica
registrado como autor no historico do pedido.

Empresas pendentes, suspensas, inexistentes ou sem endereco principal nao podem
receber pedidos por esse fluxo. Depois da criacao, agendamento, congelamento de
preco, despacho, realtime e idempotencia seguem exatamente as mesmas regras da
criacao manual feita pela propria empresa.

## Cadastro de clientes da empresa

Cada empresa possui uma agenda privada de clientes. Nome, telefone e endereco
sao obrigatorios; CPF e opcional. Telefone e CPF informado sao normalizados sem
mascara e nao podem se repetir dentro da mesma empresa; os mesmos identificadores
podem existir na agenda de outra empresa. Busca por nome usa uma versao sem
acentos e busca por telefone usa somente digitos. O backend sempre resolve a
empresa pelo membro ativo da sessao e nunca aceita `companyId` enviado pelo
navegador.

Selecionar um cliente na criacao de pedido apenas preenche destinatario,
telefone e o endereco estruturado. A entrega continua armazenando seu proprio
snapshot, sem referencia mutavel ao cadastro: editar ou excluir o cliente nao
reescreve pedidos anteriores. A exclusao remove somente a entrada da agenda.

O cadastro previo permanece opcional. Depois que uma entrega manual e criada
com nome, telefone e destino completo, o Company Web procura correspondencia
exata pelo telefone normalizado e oferece salvar o cliente. O convite acontece
somente depois do sucesso do pedido e pode ser ignorado sem qualquer nova chamada
de criacao. Como a entrega nao coleta CPF, o formulario abre com esse campo vazio;
a empresa pode salvar assim ou informar um CPF valido.

---

Decisões confirmadas diretamente com o responsável do produto em sessões
anteriores. Se uma regra aqui parecer desatualizada em relação ao código,
trate o código (ou `docs/agent-handoff.md`) como mais atual e avise o
responsável — não assuma silenciosamente qual dos dois está certo.
