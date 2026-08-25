# Reset de dados de teste antes da producao

Este procedimento remove o movimento operacional e financeiro criado durante
os testes, sem apagar os cadastros que serao reaproveitados.

## O que e preservado

- administradores, empresas, responsaveis e motoboys;
- enderecos cadastrais, documentos, veiculos e tokens do aplicativo;
- regioes, modalidades, horarios, tabelas de preco, taxas e configuracoes;
- auditorias administrativas de cadastro/configuracao e auditoria da
  Secretaria Virtual.

## O que e removido ou zerado

- pedidos, enderecos-snapshot, GPS, ofertas e historico de status;
- faturas, avisos de pagamento e historico das faturas;
- saques, antecipacoes, historicos e todos os lancamentos de carteira de teste;
- saldos em cache das carteiras, que ficam em zero;
- logs de presenca; os motoboys ficam offline e sem localizacao ao vivo;
- notificacoes e auditorias administrativas que apontem diretamente para os
  pedidos/faturas/saques/antecipacoes removidos;
- somente a fila BullMQ `dispatch` e as chaves efemeras de presenca no Redis.

As filas recorrentes `finance`, `tracking` e `live-presence` nao sao apagadas.
Nao use `FLUSHALL` ou `FLUSHDB`.

## Portoes obrigatorios

1. Crie um restore point/branch no Neon e anote o horario e a identificacao.
2. Pare a API e os workers. O modo de manutencao HTTP sozinho nao basta: o
   processo continua executando agendadores.
3. Feche/force a parada dos aplicativos de teste dos motoboys para que eles
   nao recriem presenca assim que a API voltar.
4. Confirme que nenhum outro servico aponta para o mesmo PostgreSQL/Redis.
5. Rode primeiro o dry-run. Ele e somente leitura e nao aceita atalho para a
   execucao.

```powershell
pnpm --filter @motoboycity/api data:reset:preproduction
```

Confira no resultado:

- host, porta, nome e schema do PostgreSQL, sem credenciais;
- protocolo, host, porta e indice do Redis, sem credenciais;
- quantidades por status e por tipo financeiro;
- cadastros preservados;
- quantidade de pedidos ainda ativos;
- `Snapshot PostgreSQL SHA-256` e `Snapshot Redis SHA-256`.

## Execucao protegida

Use exatamente os alvos e a impressao digital mostrados pelo dry-run:

```powershell
pnpm --filter @motoboycity/api data:reset:preproduction -- `
  --execute `
  --confirm=RESETAR_DADOS_DE_TESTE `
  --ack-backup `
  --ack-services-stopped `
  --ack-financial-reset `
  --expect-db-host=<host-do-dry-run> `
  --expect-db-port=<porta-do-dry-run> `
  --expect-db-name=<banco-do-dry-run> `
  --expect-db-schema=<schema-do-dry-run> `
  --expect-redis-protocol=<redis-ou-rediss-do-dry-run> `
  --expect-redis-host=<host-do-dry-run> `
  --expect-redis-port=<porta-do-dry-run> `
  --expect-redis-db=<indice-do-dry-run> `
  --expect-redis-snapshot=<sha256-redis-do-dry-run> `
  --expect-snapshot=<sha256-postgresql-do-dry-run>
```

Se houver pedido em andamento, a ferramenta para antes de escrever. Para
confirmar que esses pedidos tambem sao testes, acrescente
`--ack-active-deliveries`.

Por padrao, a proxima entrega mantem a sequencia atual. Para fazer o primeiro
pedido real aparecer como `#1`, acrescente `--reset-delivery-numbers`. Essa
decisao deve ser confirmada separadamente porque numeros antigos podem existir
em prints ou mensagens de teste.

As impressoes digitais do PostgreSQL e do Redis sao conferidas antes da
escrita. A fila `dispatch` e pausada e conferida novamente antes de abrir a
transacao `Serializable`. Se qualquer dado mudar, a operacao para. Todas as
exclusoes usam os IDs capturados no snapshot; nao existe `TRUNCATE`,
`FLUSHALL` ou `deleteMany` aberto.

## Falha entre PostgreSQL e Redis

PostgreSQL e Redis nao compartilham transacao. A ferramenta verifica a conexao
com ambos antes de comecar, confirma que nao ha job `dispatch` ativo, efetiva o
banco e depois limpa o Redis. Se apenas a ultima etapa falhar, nao repita o
reset financeiro: execute o modo de recuperacao seletivo.

```powershell
pnpm --filter @motoboycity/api data:reset:preproduction -- `
  --redis-only `
  --execute `
  --confirm=RESETAR_DADOS_DE_TESTE `
  --ack-services-stopped `
  --expect-redis-protocol=<redis-ou-rediss-do-dry-run> `
  --expect-redis-host=<host-do-dry-run> `
  --expect-redis-port=<porta-do-dry-run> `
  --expect-redis-db=<indice-do-dry-run> `
  --expect-redis-snapshot=<sha256-redis-do-dry-run>
```

## Conferencia antes de reabrir

1. O comando deve terminar com `RESET PRE-PRODUCAO CONCLUIDO`.
2. Rode o dry-run outra vez: pedidos, faturas, movimentos financeiros e logs
   de presenca devem estar em zero; a fila `dispatch` deve aparecer sem jobs e
   com `queuePaused: false`.
3. Mantenha os apps de teste fechados, reabra a API e confirme que os
   agendadores recorrentes iniciaram sem criar
   fatura ou repasse.
4. Confira no Admin Web: home sem atividade operacional antiga, financeiro
   zerado e empresas/motoboys/configuracoes preservados.
5. Crie um unico pedido controlado, conclua o ciclo completo e confira fatura,
   carteira e atividade antes de cadastrar a segunda empresa real.

Se qualquer verificacao falhar, mantenha o sistema fechado e restaure o ponto
do Neon antes de aceitar pedidos reais.
