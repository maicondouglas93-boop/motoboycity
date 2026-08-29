# Plano de evolução e homologação do aplicativo do motoboy

> **Documento de época — leia com data.** Registra o plano de 2026-08-20. O
> sistema andou bastante desde então: itens aqui podem já estar prontos,
> descartados ou superados. Para o estado atual use `agent-handoff.md` e
> `architecture.md`, e **confirme no código** antes de agir.

> Atualizado em 2026-08-20. Este documento transforma a análise do aplicativo
> de referência e o estado real do repositório em uma sequência executável.
> `docs/business-rules.md` continua sendo a fonte de verdade das regras de
> negócio, e `docs/agent-handoff.md` continua sendo a fonte do estado técnico.

## Objetivo da entrega essencial

Considerar a primeira versão operacional pronta somente quando o caminho abaixo
funcionar de ponta a ponta em um ambiente compartilhado e em aparelhos reais:

1. a empresa cria pedido individual ou lote imediato;
2. o despacho automático oferece o grupo a um motoboy realmente online;
3. o motoboy recebe a oferta em primeiro ou segundo plano, aceita ou recusa e
   executa coleta, entrega e eventual retorno;
4. empresa e administrador acompanham a operação em tempo real;
5. o administrador pode cancelar dentro das regras vigentes;
6. a conclusão gera um crédito único e auditável para o motoboy;
7. repasses e faturas fecham no ciclo semanal confirmado;
8. saque, pagamento da fatura e pagamento do saque são manuais, idempotentes e
   auditáveis;
9. falhas de rede, GPS, reinício do app ou repetição de requisição não duplicam
   pedido, transição nem dinheiro.

Esta definição é mais importante que a semelhança visual com qualquer sistema
de referência.

## Estado de partida

| Área                     | Estado no código                                                                    | Portão ainda pendente                                                           |
| ------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Central da empresa       | Criação individual/lote, busca, mapa e tempo real implementados                     | Smoke visual com chave Google restrita e dados de homologação                   |
| Dispatch                 | BullMQ, oferta agregada, concorrência, expiração e presença Redis implementados     | Homologação com API, Redis e aparelho reais                                     |
| Ciclo do motoboy         | Aceite, coleta, entrega, retorno, GPS pontual e recuperação de ativos implementados | Acabamento da experiência e teste completo em Android/iOS                       |
| Presença e rastreamento  | Heartbeat, TTL e serviços nativos Android/iOS implementados                         | Validar segundo plano, reinício, bateria, logout e bloqueio em aparelhos reais  |
| Central administrativa   | Mapa global, filtros, atividade, detalhe e cancelamento implementados               | Smoke visual e conferência do escopo com dados reais                            |
| Financeiro               | Ledger, crédito, liberação semanal, faturas e saques auditáveis implementados       | Preservar/publicar o recorte ainda não commitado e homologar valores reais      |
| Aplicativo distribuível  | Debug Android abre com Metro                                                        | URL ainda fixa em `localhost`, versão inconsistente e release assinado pendente |
| Ofertas em segundo plano | Socket.IO funciona com o app ativo                                                  | Push nativo ainda não implementado                                              |
| Testes mobile            | Typecheck/lint e um smoke Jest passam                                               | Cobertura de comportamento e builds físicos Android/iOS insuficientes           |
| CI                       | Workflow escrito no worktree                                                        | Commit/push e primeira execução no GitHub pendentes                             |

O progresso deve ser acompanhado pelos portões de aceite deste documento, não
por uma porcentagem subjetiva.

## Lições incorporadas da referência

Adaptar agora:

- mapa e lista operacional coexistindo na Home;
- disponibilidade online/offline muito visível;
- separação entre pedidos em andamento e ofertas pendentes;
- oferta com contagem regressiva, coleta, destino, retorno, distância e ganho;
- ação principal fixa e inequívoca durante a entrega;
- carteira separando disponível, bloqueado e reservado;
- extrato por pedido e previsão de liberação;
- aviso acionável quando GPS, permissão, bateria ou conexão impedirem o
  funcionamento.

Não copiar nesta versão:

- identidade visual, textos ou dados do sistema de referência;
- escalas, desafios, agendamentos e chat, pois não existem contratos reais no
  MOTOboyCity;
- edição ampla de perfil sem endpoints e auditoria;
- antecipação antes de definir taxa, limite e fluxo auditável;
- avisos permanentes que ocupem a tela quando o problema já estiver resolvido.

Regras que a referência não altera:

- uma região, despacho automático e lotes imediatos de 2 a 50;
- destino conhecido ou capturado por GPS uniforme no lote;
- dados pessoais do destinatário fora da oferta e visíveis só após o aceite;
- pagamentos e cobranças manuais, sem gateway;
- saque somente na segunda-feira, sem taxa e sem valor mínimo;
- faturamento semanal e retenção de 30 dias da trajetória de entrega;
- nenhuma prova adicional de entrega nesta fase.

## Sequência de execução

Cada fase deve terminar validada e, quando o responsável pedir, commitada antes
da fase seguinte. Não acumular fases que alterem os mesmos contratos.

### Fase 0 — preservar e publicar o checkpoint atual

Objetivo: não perder nem misturar o recorte financeiro/CI que já está no
worktree.

Trabalho:

- revisar o diff atual de scheduler financeiro, validação de datas, E2E do
  caminho dourado, README e workflow de CI;
- manter `.agents/`, `.codex/`, `AGENTS.md` e imagens de referência fora do
  commit, salvo pedido explícito;
- repetir as validações mínimas afetadas se o diff tiver mudado;
- criar commit próprio somente após solicitação do responsável;
- fazer push e conferir a primeira execução real do GitHub Actions;
- registrar qualquer diferença entre os comandos locais e o runner.

Aceite:

- CI verde no GitHub ou falha explicada e corrigida;
- histórico Git separa esse checkpoint das próximas mudanças mobile;
- nenhuma migration é aplicada em ambiente compartilhado nesta fase.

### Fase 1 — configuração, versão e release distribuível

Objetivo: instalar um build de homologação que funcione sem Metro, sem
`adb reverse` e sem editar código para trocar de servidor.

Trabalho:

- substituir `API_BASE_URL` fixa por configuração de build para `debug`,
  `staging` e `release`, sem guardar segredo no aplicativo;
- impedir build de produção apontando para `localhost`, IP privado ou HTTP não
  autorizado;
- manter tráfego sem TLS somente no debug local;
- alinhar versão do pacote, `DRIVER_APP_VERSION`, `versionName/versionCode` do
  Android e `CFBundleShortVersionString/CFBundleVersion` do iOS;
- configurar assinatura release fora do repositório; remover a assinatura
  debug do build release;
- apresentar ambiente e versão em uma área de diagnóstico, sem exibir tokens;
- definir uma estratégia de compatibilidade para o rollout da presença GPS.
  Recomendação: uma flag de servidor temporária, porque a API atual exige
  heartbeat e o app antigo não envia esse contrato.

Aceite:

- APK/AAB de staging inicia com bundle embarcado e autentica na API de staging;
- build release falha cedo quando a URL é insegura ou ausente;
- versão exibida pelo app corresponde aos metadados nativos;
- logout remove sessão, presença e rastreamento;
- nenhuma chave privada ou credencial de assinatura entra no Git.

Validação mínima:

- `pnpm --filter @motoboycity/driver-app typecheck`;
- `pnpm --filter @motoboycity/driver-app lint`;
- `pnpm --filter @motoboycity/driver-app test -- --runInBand`;
- build Android debug e release de staging;
- build iOS em máquina/macOS compatível antes de publicar.

### Fase 2 — Home operacional com mapa

Objetivo: tornar a Home o centro de trabalho diário do motoboy.

Trabalho:

- fazer um spike curto da biblioteca de mapa, preferindo uma solução compatível
  com React Native 0.86, Android, iOS e Google Maps;
- configurar chaves móveis separadas e restritas por package/bundle e
  certificado; nunca reutilizar a chave web dos painéis;
- combinar mapa, posição atual, coleta, destinos e pedidos ativos;
- criar abas ou segmentos `Em andamento` e `Pendentes`, sem duplicar o estado
  vindo da API/Socket.IO;
- manter o seletor online/offline e os estados de conexão visíveis;
- representar GPS ausente, desatualizado, permissão negada, serviço parado e
  economia de bateria com mensagem e ação específica;
- restaurar pedidos ativos e enquadramento do mapa após reinício;
- suportar vários itens do mesmo lote sem escolher silenciosamente o item
  errado.

Aceite:

- mapa nunca substitui a lista, inclusive quando a chave ou rede falhar;
- o motoboy não aparece online se o serviço nativo não iniciou;
- tocar em marcador ou card abre o mesmo pedido correto;
- reconexão não duplica ofertas, cards ou listeners;
- acessibilidade, área de toque, contraste e telas pequenas são verificadas.

### Fase 3 — oferta segura e execução da entrega

Objetivo: reduzir erro operacional e tornar cada próxima ação óbvia.

Oferta:

- modal em tela cheia com expiração, empresa, modalidade, lote, coleta,
  destino, retorno, distância e ganho;
- preservar destinatário, telefone e observação fora da oferta;
- desabilitar os dois botões durante a resposta e exigir confirmação explícita
  antes do aceite;
- usar a expiração do servidor como autoridade; contador local é apenas visual;
- ao expirar, cancelar ou perder elegibilidade, fechar o modal e explicar o
  resultado sem permitir ação atrasada;
- ao aceitar, buscar o detalhe autenticado e só então revelar os metadados do
  destinatário.

Operação:

- ação principal fixa conforme o estado: confirmar coleta, marcar entrega ou
  concluir retorno;
- mapa/atalho de navegação, contato com a loja, destinatário, pagamento do
  cliente, observação e ganho;
- resumo navegável de todos os itens do lote;
- impedir retorno acidental que esconda uma entrega ativa;
- reconsultar o servidor depois de erro, reconexão ou repetição de ação;
- exibir a linha do tempo do pedido sem inventar transições locais.

Aceite:

- uma resposta duplicada não aceita duas vezes nem duplica histórico;
- cancelamento administrativo remove a operação do app em tempo real;
- bloqueio/suspensão encerra presença, oferta e rastreamento;
- destino por GPS respeita precisão máxima e retorno respeita o raio
  configurado;
- pedido concluído aparece no histórico e gera um único crédito pendente.

### Fase 4 — push e confiabilidade em segundo plano

Objetivo: não depender de o app estar aberto para o motoboy perceber uma
oferta ou mudança crítica.

Trabalho:

- adicionar registro/rotação/revogação de token de dispositivo com escopo do
  motoboy autenticado;
- integrar FCM no Android e APNs por meio do provedor adotado no iOS;
- enviar push para nova oferta, cancelamento e bloqueio/suspensão;
- não colocar PII, endereço completo, saldo ou token de sessão na notificação;
- ao tocar, abrir o app e revalidar oferta/pedido na API antes de mostrar ação;
- manter Socket.IO como canal ao vivo quando conectado e push como sinal de
  retomada, sem processar a mesma oferta duas vezes;
- remover token no logout e tratar token inválido retornado pelo provedor;
- definir som, vibração e canais Android sem contornar o controle do usuário.

Aceite:

- oferta é percebida com tela bloqueada e app em segundo plano;
- oferta expirada nunca pode ser aceita pelo deep link;
- reinstalação, troca de conta e múltiplos aparelhos não vazam notificação;
- negação de notificação é explicada, mas não altera silenciosamente a regra
  de disponibilidade;
- falha do provedor de push não interrompe dispatch nem transações.

Esta fase altera persistência, contratos, API e nativo; deve usar migration
aditiva, contratos compartilhados e testes de autorização no mesmo recorte.

### Fase 5 — carteira e histórico profissionais

Objetivo: deixar o motoboy entender quanto ganhou, quando libera e o que já foi
pago sem depender do administrador.

Trabalho:

- destacar saldo disponível, a liberar e reservado para saque;
- mostrar próxima segunda de liberação por crédito e explicar o ciclo semanal;
- manter extrato por pedido com status, data, origem e link para o detalhe;
- mostrar pedido de saque, estado e auditoria em uma linha do tempo simples;
- permitir saque apenas na segunda-feira e refletir o saldo reservado logo
  após a solicitação;
- tratar indisponibilidade, lista vazia, paginação e repetição de solicitação;
- no admin, conferir fila de saques, dados PIX, aprovação, pagamento,
  referência e rejeição com motivo;
- manter saldo sempre derivado do ledger; não criar botão de ajuste manual.

Aceite:

- o total do extrato confere com o ledger e com os saldos derivados;
- corrida de solicitação/aprovação/pagamento não duplica débito nem crédito;
- referência de pagamento e responsável ficam auditáveis;
- empresa enxerga a própria fatura e admin confirma pagamento manualmente;
- entrega concluída após o corte correto fica no ciclo seguinte.

Antecipação permanece fora até o responsável definir taxa, limite, elegibilidade
e quem absorve o custo. A tela não deve prometer essa função antes do contrato
real existir.

### Fase 6 — homologação do caminho dourado

Objetivo: provar o sistema completo em condições próximas da operação.

Preparação:

- criar backup do staging e restaurar uma cópia isolada;
- aplicar todas as migrations pendentes nessa cópia e revisar dados, índices e
  rollback antes do ambiente compartilhado;
- configurar Redis isolado, chave Google web, chaves Google móveis, push e
  URLs de staging sem registrar secrets;
- cadastrar empresa, modalidade, tabela, endereço com coordenadas, motoboy
  aprovado e PIX de teste;
- atribuir explicitamente a modalidade ao motoboy.

Cenários obrigatórios em aparelho real:

1. login válido, token inválido, logout e reinício;
2. permissão de localização negada, parcial e concedida;
3. ficar online, heartbeat, expiração do TTL e múltiplas sessões;
4. oferta ativa, expirada, recusada, aceita e cancelada;
5. app em primeiro plano, segundo plano e tela bloqueada;
6. coleta, entrega conhecida, entrega por GPS e retorno;
7. lote com vários itens e recuperação depois de encerrar o app;
8. perda e recuperação de rede/GPS durante a operação;
9. bloqueio e suspensão administrativa;
10. crédito, liberação semanal, saque, aprovação, PIX pago, fatura fechada e
    pagamento confirmado;
11. mapas da empresa/admin e localização desatualizada;
12. acessos cruzados: empresa, motoboy ou usuário não podem consultar dados de
    outro escopo.

Matriz mínima:

- Android físico suportado, incluindo economia de bateria ativa;
- iPhone físico com permissão `Sempre`, segundo plano e reinício;
- conexão Wi-Fi e rede móvel;
- build de staging assinado, não apenas debug com Metro.

Validações de engenharia:

```sh
pnpm typecheck
pnpm lint
pnpm --filter @motoboycity/api test -- --runInBand
pnpm --filter @motoboycity/api test:e2e
pnpm --filter @motoboycity/driver-app test -- --runInBand
pnpm --filter @motoboycity/api run build
pnpm --filter @motoboycity/company-web run build
pnpm --filter @motoboycity/admin-web run build
```

E2E deve usar PostgreSQL e Redis isolados. Build nativo e migrations em
ambiente compartilhado exigem o processo e a autorização descritos em
`AGENTS.md`.

### Fase 7 — rollout controlado e operação assistida

Objetivo: publicar sem separar API e aplicativos incompatíveis.

Ordem recomendada:

1. API e contratos compatíveis, com exigência nova protegida pela estratégia
   temporária de rollout;
2. driver-app de staging e depois produção;
3. central da empresa;
4. ativação obrigatória do heartbeat após adoção suficiente do app;
5. central administrativa global;
6. scheduler financeiro automático.

Observar durante o piloto:

- motoboys online com heartbeat válido e GPS recente;
- taxa de oferta aceita, recusada e expirada;
- falhas por etapa e pedidos presos em estado operacional;
- desconexões Socket.IO e entrega de push;
- divergência entre cache e ledger financeiro;
- execução e atraso dos jobs de repasse, fatura e retenção;
- cancelamentos e ações administrativas por usuário.

Rollback:

- desativar a exigência nova pelo mecanismo temporário, sem apagar dados;
- manter API retrocompatível durante a janela definida;
- reverter aplicação/serviço para a versão anterior sem reverter migration
  aditiva;
- pausar scheduler somente com registro operacional e plano para recuperar os
  jobs idempotentes;
- nunca apagar ledger, histórico, ofertas ou trajetória manualmente para
  “corrigir” uma publicação.

## Cobertura automatizada que falta no mobile

Prioridade de testes:

1. sessão válida/inválida e logout;
2. online com permissão, rollback quando o serviço falha e offline;
3. uma única conexão Socket.IO e reconexão sem listener duplicado;
4. oferta recebida, expirada, cancelada, aceita e recusada;
5. recuperação de entrega ativa após reinício;
6. transições `ACCEPTED → COLLECTED → DELIVERED → COMPLETED`;
7. erro de precisão do GPS e repetição segura;
8. cancelamento e bloqueio em tempo real;
9. carteira, filtros, saque e estados de auditoria;
10. bridges nativas com testes de contrato/mocks, complementados por aparelho
    real — mocks não provam segundo plano.

O smoke atual de renderização deve permanecer, mas não é evidência suficiente
para nenhum dos fluxos acima.

## Dependências externas e decisões pendentes

Não são motivos para alterar regras já confirmadas, mas precisam ser resolvidas
antes de produção:

- URL e domínio públicos de API para staging e produção;
- contas/certificados de assinatura Android e Apple;
- chaves Google Maps móveis separadas e restritas;
- projeto e credenciais de FCM/APNs;
- canal humano de suporte que será mostrado quando uma conta for bloqueada;
- taxa, limite e elegibilidade de antecipação, caso a função volte ao escopo;
- janela de piloto e critério de adoção para tornar heartbeat obrigatório.

Nenhum segredo deve ser colocado neste documento, no código ou no histórico
Git.

## Como retomar em uma próxima sessão

1. ler `AGENTS.md`, `docs/ai-agent-guide.md`, `docs/business-rules.md`,
   `docs/agent-handoff.md` e este arquivo;
2. executar `git status --short` e `git log --oneline -10`;
3. preservar mudanças alheias e arquivos locais não rastreados;
4. confirmar no handoff qual foi a última fase concluída;
5. executar somente a primeira fase ainda aberta;
6. validar, atualizar o handoff e pedir autorização antes de commit/push.

Próximo passo exato no estado de 2026-08-20: concluir a **Fase 0**, publicando
o checkpoint financeiro/CI de forma separada; depois iniciar a **Fase 1** pela
configuração de ambiente e versionamento do driver-app.
