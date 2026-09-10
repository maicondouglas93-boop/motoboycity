# Taxa automática de chuva — Lajinha–MG

## Configuração e publicação

1. Em **ADM → Configurações → Taxas adicionais**, mantenha/crie a taxa de chuva
   da região de Lajinha, com o valor e repasse aprovados. Copie o **ID da taxa**
   mostrado no card. A integração não procura pelo nome nem altera valor,
   repasse ou região. O modo de ativação é escolhido separadamente no card.
2. Após autorização para publicar o código, faça deploy da API e do ADM.
   O controle pelo ADM exige primeiro a migration aditiva
   `20260910160000_surcharge_rain_admin_control`, depois API e ADM.
   Não precisa de APK. Consulte o procedimento de banco abaixo antes do rollout.
3. Configure no serviço **API do Render**:

   | Variável | Valor |
   |---|---|
   | `OPEN_METEO_RAIN_SURCHARGE_ID` | UUID da taxa de chuva de Lajinha |
   | `OPEN_METEO_RAIN_ENABLED` | `true` habilita; ausente/`false` desliga |
   | `OPEN_METEO_API_KEY` | opcional; sem chave usa endpoint público; com chave usa o comercial |

4. Reinicie/republique a API após mudar variáveis. No ADM, a taxa vinculada
   mostrará o estado climático e a hora do dado. Sem ID válido ou habilitação,
   não há consulta externa nem ativação automática. A chave NÃO é obrigatória.
5. No card, escolha **Automática (chuva)**. A taxa precisa estar **ativa** para
   cobrar. O automático ignora o interruptor manual e os horários, sem apagá-los.
   Para assumir o controle, escolha **Manual**: o clima deixa de aplicar a taxa
   e os horários cadastrados voltam a valer; sem horários, use **Ligar manual**.
   A troca de modo desliga o manual antigo. O mesmo clique reenviado não muda
   novamente o interruptor nem duplica a auditoria.
6. **Desativar** bloqueia qualquer cobrança desta taxa, conservando o modo
   escolhido. **Reativar** permite novamente esse modo; não liga o manual por
   conta própria. A escolha é salva no servidor e auditada; não exige redeploy.
   Para suspender só a cobrança pelo clima, selecione Manual. A consulta do
   clima continua em background para permitir voltar ao automático; desligar
   também as consultas exige `OPEN_METEO_RAIN_ENABLED=false` no Render.

### Migration, preservação e ordem do rollout

- Adiciona somente `surcharges.automaticRainEnabled BOOLEAN NOT NULL DEFAULT false`.
  Não modifica valores, repasses, horários, faturas ou entregas. Todas as taxas
  começam no modo Manual: mesmo a taxa antes vinculada ao clima precisa de
  **opt-in no ADM** após atualizar. A aplicação antiga ignora a nova coluna.
- Gerada pelo Prisma 6.19.3 com `migrate diff --from-schema-datamodel
  <schema anterior> --to-schema-datamodel prisma/schema.prisma --script`, sem
  conexão ao banco, para evitar o reset exigido pelo histórico local antigo.
  A cópia temporária do schema anterior foi removida após gerar/revisar o SQL.
- Antes do rollout autorizado, confirmar backup/ponto de restauração do banco
  gerenciado. Ensaio isolado aprovado em PostgreSQL 17: histórico de 51 migrations,
  taxas fictícias anteriores, migration nova e repetição sem pendências.
  Valores/repasse/horários/flags/timestamps preservados; controle e auditoria
  testados no service real, inclusive concorrência e rollback. Banco de teste
  removido. Não aplicado em produção nem no banco de desenvolvimento.
- Publicar API somente depois da migration (o Render já executa migrations no
  build). Atualizar ADM depois da API, conferir a taxa e selecionar o modo.
  A migration aditiva fica no banco num rollback; não remover coluna ou dados.
  Antes de voltar à API anterior, desligar `OPEN_METEO_RAIN_ENABLED` em **todas**
  as instâncias: a versão antiga não respeita a escolha de modo do ADM.

O endpoint público funciona sem chave, conforme solicitado pelo responsável.
Isso não equivale a licença comercial: os termos do Open-Meteo restringem o
serviço gratuito a uso não comercial, independentemente do volume. Confirmar
licença/autorização apropriada antes da ativação comercial. O sistema não faz
assinaturas nem autoriza despesas. Uma chave comercial inválida não causa
fallback silencioso para a API pública. Nunca colocar chave no Git, chat,
mobile, Vercel ou variável `NEXT_PUBLIC_*`.

Nenhuma configuração de produção foi alterada durante a implementação.

## Aviso e desativação pela home do ADM

Quando a taxa automática estiver ativa, a home mostra **Chuva indicada em
Lajinha**, nome da taxa, horário do dado em Brasília e botão **Desativar taxa**.
O texto deixa claro que é uma estimativa, não confirmação de chuva em cada rua.
Se a indicação já estiver seca, informa a espera de 30 minutos em vez de dizer
que ainda está chovendo. Sem cobrança automática ativa, não mostra alerta de chuva.

Confirmar **Desativar taxa** usa a desativação geral auditada: para novas
cotações deixa de cobrar, e o automático **não religa** até o ADM reativar em
Configurações → Taxas adicionais. Preços existentes não são reescritos.
A confirmação só aparece após sucesso da API; erro permanece no diálogo.
Falha/offline na consulta exibe estado não confirmado, sem garantir cobrança
ou desligamento com dados antigos. Consulta a cada minuto somente com a página
visível; usa a API/cache existentes, sem mais chamadas climáticas/geocoding.

## Regra e limites

- Referência fixa: `-20.15139, -41.62278`, Lajinha, Minas Gerais, BR. Coordenadas
  verificadas no geocoding oficial e salvas no código. **Zero consultas de
  geocoding em operação**, nenhum GPS de empresa/entregador enviado ao provedor.
- Consulta `/v1/forecast` a cada cinco minutos: `current=rain,showers,weather_code`,
  unidade mm, tempo UNIX, fuso `America/Sao_Paulo`. Chuva/pancadas acima de zero
  OU WMO de garoa, chuva/pancadas/temporal ativa a contribuição automática.
  Nuvens, neblina e probabilidade de chuva futura não ativam.
- Após a primeira amostra seca, a ativação permanece até completar 30 minutos.
  Nova chuva cancela a contagem; polling repetido não reinicia esse prazo.
- Open-Meteo usa **modelos meteorológicos**, não sensores de cada rua. Dados
  atuais têm passo de 15 minutos; consultar a cada cinco minutos não torna a
  detecção instantânea nem comprova chuva em cada ponto da cidade.
- Dados com 30 minutos ou mais, futuros, fora de ordem, de outra localização
  ou sem unidades/campos válidos não autorizam cobrança automática. Em falha,
  o último dado válido só vale até esse limite; falha não inventa chuva nem
  contabiliza tempo seco. No modo automático, falha não cai silenciosamente em
  cobrança manual/horários; o ADM pode escolher Manual explicitamente.
- O motor de preços existente continua escolhendo **no máximo uma taxa**, pela
  mesma prioridade de criação mais recente e divisão do adicional. Não há
  escrita em entregas existentes. Preços já congelados não mudam. Pedidos com
  **destino/preço definidos na entrega** continuam usando a regra vigente na
  primeira precificação, como antes desta integração.

## Cache, desempenho e recuperação

`WeatherModule` é compartilhado pela precificação e pelo ADM. Cada processo
sincroniza um pequeno snapshot no Redis a cada minuto. O lock de cinco minutos
limita chamadas/retries entre instâncias; a gravação verifica seu dono para
impedir sobrescrita por resposta atrasada. A decisão em cada pedido/lista é
**somente em memória**, sem HTTP nem leitura adicional do banco/Redis.
Instâncias podem levar até um minuto para sincronizar o estado.

O snapshot permanece no Redis por duas horas para recuperação de restart;
isso NÃO prolonga os 30 minutos de validade meteorológica. Sem dado recente, a
automação não cobra. Timeout HTTP de cinco segundos e falhas não impedem a API
de iniciar. Desabilitada, não abre conexão Redis adicional. Uso nominal:
**288 chamadas de clima/dia**, independentemente do número de empresas,
pedidos ou celulares. Nenhuma consulta de geocoding recorrente.

Logs `rain_automation_changed` registram mudanças detectadas nas consultas,
ID da taxa e amostra, sem chave nem autor administrador fictício. O adicional
efetivamente cobrado permanece em `Delivery.surchargeLabel/surchargeValue`.
Logs climáticos não são um arquivo meteorológico permanente. A tela atribui
os dados ao Open-Meteo e mostra quando se usa o endpoint público.

Rollback: **Desativar** a taxa no ADM cessa todas as fontes imediatamente.
Para desligar só a cobrança automática, escolher **Manual** no card. Para
desligar também o monitoramento, definir `OPEN_METEO_RAIN_ENABLED=false` em todas
as instâncias e republicar. Não apagar dados nem alterar pedidos/faturas.

## Verificação de publicação

Validação reproduzível (Docker aberto e imagem local `postgres:17-alpine`):

```sh
pnpm --filter @motoboycity/api run build
node --test apps/api/scripts/rain-migration-target.test.cjs
node apps/api/scripts/verify-rain-migration.cjs
```

O script cria container próprio em porta exclusiva de loopback, fixa `url` e
`directUrl` no schema temporário e nas variáveis do subprocesso e confirma a
identidade do cluster por Prisma e Docker antes de migrar. Não usa Compose,
volumes do projeto ou URLs externas. Não gera cobranças reais nem consulta
Open-Meteo; somente o clima é simulado nos testes do service.

Incidente corrigido no primeiro ensaio: o wrapper antigo fixava apenas `url`
e herdou `DIRECT_URL` de desenvolvimento. Aplicou a migration antiga pendente
de isolamento do Asaas no banco local, **não** a migration da chuva. O usuário
foi informado, autorizou continuar com isolamento corrigido e essa migration
local não foi desfeita. Registro completo no changelog. Não reutilizar a
versão antiga do script nem presumir que sobrescrever só `DATABASE_URL` basta.

Conferir taxa correta, dado recente e estado no ADM. Sem chuva atual, o
automático deve ficar desligado. Não forçar clima fictício ou criar cobranças
em produção para testar. Validar o ciclo completo em ambiente isolado antes
da ativação. Testes automatizados usam HTTP/Redis simulados; não validam a
credencial comercial ou concorrência com Redis gerenciado real.

Fontes consultadas em 10/09/2026: [API/WMO](https://open-meteo.com/en/docs),
[geocoding](https://open-meteo.com/en/docs/geocoding-api),
[termos](https://open-meteo.com/en/terms), [planos](https://open-meteo.com/en/pricing).
