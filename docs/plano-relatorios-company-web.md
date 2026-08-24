# Plano — melhoria dos relatórios do Company Web

Documento de execução para transformar `/relatorios` em uma central gerencial
com páginas específicas, dados agregados no servidor e escopo obrigatório na
empresa do usuário autenticado.

Este plano complementa `docs/plano-financeiro-company-web.md`. Relatórios
explicam operação, demanda, custo e qualidade. A área `/financeiro` responde
posição de dívida, faturas e pedidos ainda não faturados. Os dois módulos podem
se ligar, mas não devem manter cálculos concorrentes para o mesmo número.

---

## 1. Estado real em 2026-08-24

| Tela/contrato | Situação atual |
| --- | --- |
| `/relatorios` | Tela única de pedidos e faturas; baixa listas completas e soma no navegador |
| `/indicadores` | Tela única de indicadores; também baixa todas as entregas e agrega no navegador |
| `GET /deliveries` | Dados reais e corretamente limitados à empresa pelo token, mas sem paginação ou limite |
| `GET /deliveries/search` | Busca real, paginada e já limitada à empresa pelo token |
| `GET /deliveries/stage-times` | Tempos reais por etapa, agregados no servidor e limitados à empresa |
| `GET /company/invoices` | Lista real de faturas da empresa, sem paginação |
| `GET /company/invoices/:id` | Detalhe real e protegido contra acesso de outra empresa |

Não há mock na tela atual. O problema é de escala, organização e profundidade:

1. `/relatorios` e `/indicadores` duplicam filtros e cálculos;
2. ambas dependem de `GET /deliveries`, que cresce sem limite;
3. não existe comparação com período anterior;
4. filtros não ficam na URL e o recorte se perde ao compartilhar/atualizar;
5. não existem páginas próprias para demanda, modalidades, retornos ou falhas;
6. não existe exportação operacional controlada;
7. pedidos criados e pedidos concluídos são misturados sem explicitar a coorte;
8. os números financeiros da tela competem com a nova área financeira planejada.

No momento em que este plano foi escrito, a primeira fase de
`docs/plano-financeiro-company-web.md` estava sendo implementada em paralelo.
Antes de iniciar código de Relatórios, terminar/commitar esse recorte ou combinar
explicitamente a propriedade dos arquivos compartilhados.

---

## 2. Objetivo e limites

A central deve permitir que a loja responda, sem pedir ajuda ao administrador:

- quantos pedidos criou, concluiu, cancelou ou não conseguiu entregar;
- quanto gastou nas entregas concluídas e como isso mudou;
- quando concentra demanda;
- quais modalidades usa e quanto cada uma custa;
- quanto tempo a operação leva em cada etapa;
- onde estão falhas, cancelamentos, retornos e lotes problemáticos;
- quais pedidos explicam cada total.

Limites obrigatórios:

- mostrar somente dados da empresa vinculada ao token;
- mostrar `totalValue`, que é o custo da empresa;
- nunca expor `driverValue`, `platformValue`, carteira, saque ou margem interna;
- não duplicar posição em aberto, faturas ou pedidos sem faturar: esses números
  pertencem à área `/financeiro`;
- não criar nota única de “performance” nem metas arbitrárias;
- não inferir origem Aiqfome/manual por `externalOrderNumber`;
- não criar ranking por membro da equipe, pois `Delivery` não persiste hoje
  quem criou o pedido.

---

## 3. Arquitetura de informação alvo

```text
/relatorios                         central por categorias
  /geral                            visão executiva e comparação
  /pedidos                          consulta detalhada paginada
  /horarios                         demanda por hora e dia da semana
  /modalidades                      volume e custo por serviço
  /tempos-sla                       aceite, coleta, entrega e ciclo
  /ocorrencias                      falhas e cancelamentos
  /retornos-lotes                   retornos e comportamento dos lotes

/financeiro                         posição e cobrança, plano separado
  ?aba=resumo
  ?aba=faturas
  ?aba=pedidos
```

Categorias e cards da central:

| Categoria | Card | Destino |
| --- | --- | --- |
| Visão geral | Analítico geral | `/relatorios/geral` |
| Visão geral | Horários e demanda | `/relatorios/horarios` |
| Pedidos e custos | Histórico de pedidos | `/relatorios/pedidos` |
| Pedidos e custos | Modalidades e custos | `/relatorios/modalidades` |
| Pedidos e custos | Retornos e lotes | `/relatorios/retornos-lotes` |
| Qualidade | Tempos e SLA | `/relatorios/tempos-sla` |
| Qualidade | Falhas e cancelamentos | `/relatorios/ocorrencias` |
| Financeiro | Minha posição financeira | `/financeiro?aba=resumo` |
| Financeiro | Faturas e cobranças | `/financeiro?aba=faturas` |

Não publicar card clicável antes de sua página estar completa. Durante a
execução por fases, card futuro deve ficar fora da central, e não apontar para
uma tela vazia.

Quando `/relatorios/geral` estiver pronto, `/indicadores` passa a redirecionar
para ele. O link “Indicadores” sai da navegação para eliminar dois destinos que
respondem à mesma pergunta. A URL antiga continua funcionando por compatibilidade.

---

## 4. Padrão comum de UX

Todas as páginas próprias devem reutilizar componentes locais em
`apps/company-web/src/components/reports/`:

- `ReportLayout`: título, descrição, período aplicado e ações;
- `ReportFilterCard`: datas, filtros específicos, aplicar e limpar;
- `ReportComparison`: valor atual, anterior e variação;
- `ReportPagination`: total, página, tamanho e navegação;
- estados padronizados de carregamento, vazio e `ApiError`;
- exportação com nome do arquivo, período e filtros visíveis.

Regras de interação:

1. período padrão: últimos 30 dias, incluindo hoje;
2. atalhos: hoje, 7 dias, 30 dias, mês atual e mês anterior;
3. `from`, `to`, busca, filtros, ordenação e página ficam na URL;
4. período anterior tem exatamente a mesma duração do atual;
5. variação percentual é `null` quando a base anterior é zero;
6. gráficos sempre têm tabela ou resumo textual equivalente;
7. tabelas devem funcionar em largura estreita sem esconder ações;
8. `0`, `null` e “sem amostra” têm apresentações diferentes;
9. vermelho fica reservado para falha, cancelamento ou vencimento que exige ação;
10. exportação inclui apenas o recorte solicitado e informa qualquer limite.

---

## 5. Conteúdo de cada relatório

### 5.1 Analítico geral

- pedidos criados no período;
- pedidos concluídos no período;
- cancelados e falhos entre os pedidos criados;
- custo total das entregas concluídas;
- ticket médio concluído;
- pedidos cujo valor ainda está indefinido;
- comparação com janela anterior;
- evolução diária;
- distribuição pelo status atual;
- atalhos para os relatórios que explicam cada indicador.

Pedidos criados e concluídos são coortes separadas. Não calcular “taxa de
conclusão” dividindo entregas concluídas no período por pedidos criados no mesmo
período: uma entrega pode ter sido criada antes e concluída agora.

### 5.2 Histórico de pedidos

- busca por número, UUID e número externo;
- filtros por status, período e modalidade;
- filtros por retorno, lote, modo de destino e situação de faturamento;
- paginação real no servidor;
- colunas: pedido, criação, modalidade, status, distância, custo, retorno e
  fatura;
- links para pedido e fatura;
- CSV operacional com o mesmo recorte.

O CSV não deve incluir telefone, coordenadas, observações ou endereço completo.
Esses dados não são necessários para conciliar a operação.

### 5.3 Horários e demanda

- pedidos criados por hora no fuso `America/Sao_Paulo`;
- média por dia, não apenas total bruto;
- pedidos por dia da semana e quantidade de ocorrências daquele dia no período;
- horário e dia mais movimentados;
- evolução diária e comparação com período anterior;
- CSV dos buckets exibidos.

Todos os pedidos criados entram, inclusive cancelados posteriormente, pois
também representaram demanda operacional.

### 5.4 Modalidades e custos

- criados e concluídos por modalidade em métricas separadas;
- custo total e ticket médio das entregas concluídas;
- participação no volume e no custo;
- quantidade e valor adicional de retornos;
- pedidos ainda sem preço separados do total monetário;
- busca, ordenação e CSV.

A soma do custo por modalidade deve reconciliar exatamente com o custo concluído
do Analítico geral para o mesmo período.

### 5.5 Tempos e SLA

- média, mediana, p90 e amostras de aceite, coleta, entrega e ciclo total;
- explicação de qual transição forma cada etapa;
- opção de excluir marcações retroativas;
- comparação com janela anterior;
- tabela de amostras/denominadores;
- nenhuma classificação “bom/ruim” sem meta configurada e disponível à empresa.

Reutilizar `GET /deliveries/stage-times`; não recalcular histórico de status no
navegador.

### 5.6 Falhas e cancelamentos

- total de `FAILED` por motivo estruturado;
- falhas `OTHER` agrupadas sem expor observação sensível no resumo;
- cancelamentos antes e depois do aceite;
- evolução por dia;
- lista paginada dos pedidos envolvidos;
- links para o histórico de cada pedido;
- CSV do recorte sem PII.

O sistema não registra hoje motivo estruturado para cancelamento. A primeira
versão mostra contagem e momento do cancelamento, sem inventar causa. Tornar
motivo obrigatório é uma mudança de produto/contrato separada.

### 5.7 Retornos e lotes

- pedidos com retorno solicitado;
- valor adicional de retorno;
- tempo entre entrega e confirmação do retorno;
- retornos ainda aguardando conclusão;
- quantidade de lotes, média e maior quantidade de itens;
- conclusão, falha e cancelamento de itens de lote;
- custo médio por pedido avulso versus item de lote;
- tabela paginada com links para o grupo do pedido.

Não tratar lote como entidade persistida: o contrato existente continua baseado
em `Delivery.batchId`.

---

## 6. Backend e contratos

### 6.1 Reutilizar sem alteração na primeira fase

- `GET /deliveries/search`: histórico paginado;
- `GET /deliveries/stage-times`: tempos por etapa;
- `GET /company/invoices` e `/:id`: links e contexto de cobrança;
- `GET /company/financial/*`: somente quando o plano financeiro correspondente
  estiver implementado e estabilizado.

### 6.2 Agregação operacional da empresa — obrigatória

Criar `GET /company/reports/operations?from&to`, protegido por
`JwtAuthGuard` e `CompanyOnlyGuard`.

O retorno deve conter:

- período resolvido e indicação se a janela termina hoje;
- resumo e comparação com período anterior;
- contagem por status atual dos pedidos criados;
- concluídos, custo total, ticket e quantidade sem preço;
- série diária;
- buckets por hora e dia da semana;
- agregação por modalidade;
- resumo de retorno e lote.

O serviço pode reaproveitar funções puras do relatório administrativo, mas não
o controller nem o payload completo do admin. O Company nunca recebe empresas,
entregadores, repasses ou margem da plataforma.

### 6.3 Consulta detalhada

Reutilizar `GET /deliveries/search` inicialmente. Depois, ampliar de forma
aditiva `searchDeliveriesQuerySchema` e seus consumidores para aceitar:

- `serviceTypeId`;
- `requiresReturn`;
- `batchOnly`;
- `destinationKnownAtCreation`;
- `billingState` (`INVOICED`, `UNBILLED`, `NOT_APPLICABLE`).

Empresa continua proibida de enviar `companyId` ou `driverId`. O service deriva
o escopo do token antes de montar o `where`.

### 6.4 Ocorrências

Criar `GET /company/reports/occurrences?from&to&type&page&pageSize` para resumo
e itens paginados de falha/cancelamento. Não devolver `failureNote` em agregados
nem exportações gerais.

### 6.5 Exportação operacional

Criar `GET /company/reports/deliveries/export` com os mesmos filtros do histórico.
Gerar CSV no servidor, com `;`, datas no fuso da operação e decimal compatível
com Excel em português. Aplicar limite explícito de linhas; ao exceder, retornar
erro orientando reduzir o período, nunca truncar silenciosamente.

### 6.6 Cadeia de contrato

Qualquer endpoint novo percorre no mesmo recorte:

```text
packages/validation
  → packages/types
    → packages/api-client
      → controller + guard
        → service
          → company-web
            → testes
```

Não é prevista migration para o conjunto principal. Relatório por membro da
equipe ou origem manual/Aiqfome exige persistência nova e fica fora deste plano.

---

## 7. Segurança e consistência financeira

1. `companyId` vem exclusivamente do vínculo do usuário autenticado.
2. Endpoint Company não aceita `companyId` em query, path ou body.
3. Teste E2E tenta consultar dados de outra empresa e espera `403` ou ausência
   completa dos dados, conforme o endpoint.
4. Valores monetários são somados em centavos no servidor.
5. `totalValue: null` não vira zero: entra em `unpricedCount`.
6. Consultas que reconciliam vários blocos usam uma visão consistente da base,
   preferencialmente transação `RepeatableRead`.
7. Limites civis de data usam o fuso `America/Sao_Paulo`.
8. A empresa nunca recebe `driverValue`, `platformValue`, dados de carteira ou
   oferta individual do motoboy.
9. Exportações operacionais minimizam PII e nunca incluem coordenadas.
10. Erros da API aparecem via `ApiError`; falha não vira tabela vazia.

---

## 8. Ordem de execução

| Fase | Entrega | Dependência |
| --- | --- | --- |
| 0 | Encerrar/coordenar o recorte financeiro concorrente | trabalho atual |
| 1 | Componentes comuns, central, `/pedidos` paginado e `/tempos-sla` | endpoints existentes |
| 2 | Contrato `/company/reports/operations`, testes e `/geral` | cadeia compartilhada |
| 3 | `/horarios` e `/modalidades` | fase 2 |
| 4 | filtros adicionais da busca e `/retornos-lotes` | contrato aditivo |
| 5 | endpoint e página `/ocorrencias` | agregação específica |
| 6 | exportação operacional no servidor | filtros estabilizados |
| 7 | redirecionar `/indicadores`, ajustar navegação e homologar | páginas concluídas |

Executar e validar uma fase por vez. Não misturar a fase financeira e a fase de
relatórios no mesmo commit quando tocarem arquivos compartilhados.

---

## 9. Critérios de aceite finais

- [ ] `/relatorios` apresenta apenas cards funcionais e organizados por categoria;
- [ ] cada card abre uma página específica, completa e compartilhável por URL;
- [ ] `/indicadores` redireciona para `/relatorios/geral`;
- [ ] nenhuma tela de relatório chama `GET /deliveries` para agregar lista inteira;
- [ ] histórico usa paginação real e preserva filtros na URL;
- [ ] períodos atual/anterior têm a mesma duração;
- [ ] totais por modalidade reconciliam com o Analítico geral;
- [ ] valores indefinidos aparecem separados e não entram como zero;
- [ ] Company não recebe repasse/margem interna nem dados de outra empresa;
- [ ] CSV respeita filtros, limite e minimização de PII;
- [ ] estados sem dados, erro e carregamento foram testados;
- [ ] desktop e largura estreita foram inspecionados com sessão real;
- [ ] testes unitários cobrem agregação, centavos, fuso e coortes;
- [ ] E2E cobre isolamento entre duas empresas;
- [ ] `pnpm typecheck`, `pnpm lint`, testes da API e build do Company Web passam;
- [ ] `docs/agent-handoff.md` registra cada fase concluída e suas limitações.

---

## 10. Decisões futuras, fora da implementação automática

- motivo obrigatório de cancelamento;
- metas de SLA ou orçamento por empresa;
- relatório por membro da equipe, que exige persistir o criador do pedido;
- relatório confiável de origem manual/Aiqfome, que exige persistir a origem;
- aviso de pagamento, tratado no plano financeiro;
- qualquer exposição de composição interna do preço.

Esses itens não devem ser inferidos durante a execução. Cada um precisa de
decisão de produto e, quando houver dado novo persistido, da Skill de
Prisma/contratos com migration aditiva e validação de isolamento.
