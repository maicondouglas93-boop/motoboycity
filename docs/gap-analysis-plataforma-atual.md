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

| Item                         | Por quê                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cronômetro ao vivo**       | Cada pedido na fila mostra há quanto tempo está no estado atual. É o medidor de pressão da operação. O dado já existe em `statusChangedAt` — é só interface. |
| **Clonar entrega**           | Loja com ~8,5 entregas/dia sai sempre do mesmo endereço. Provavelmente o botão mais usado da plataforma atual. Reaproveita a criação existente.              |
| **Chegou na coleta**         | Valor de enum aditivo + um endpoint. Conserta a ambiguidade do SLA recém-implementado.                                                                       |
| **Inverter local de coleta** | Troca coleta e entrega. Trivial no formulário.                                                                                                               |

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
- **Taxa de chuva** e **tarifa dinâmica** — motor de preço condicional.
- **Roteirizador automático** e **agrupamento inteligente** — otimização de
  rotas; escopo próprio.
- **Escalas e diárias**, **desafios**, **punição de entregadores** — gestão de
  frota.
- **Perfis de acesso** — hoje há três perfis fixos; lá é RBAC configurável.
- **Notas fiscais**.

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

Dois já foram feitos aqui: SLA por etapa e o caminho de insucesso. **Cancelamento
com motivo** é o próximo mais barato — hoje o cancelamento não registra
justificativa.

## Limites deste levantamento

- Navegação somente leitura: nada foi clicado que criasse, alterasse ou
  enviasse qualquer coisa.
- As seções **Gestão**, **Suporte** e os submenus de Financeiro e Relatórios do
  admin não foram abertos em profundidade.
- Não há acesso ao código nem à documentação técnica da plataforma; tudo aqui é
  inferido da interface.
- Números refletem o período consultado em 2026-08-22 e servem para dimensionar
  ordem de grandeza, não para contabilidade.
