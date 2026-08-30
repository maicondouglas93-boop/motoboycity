# Backup e restauração do banco

> Um backup que nunca foi restaurado é uma esperança, não um backup. A seção
> **Restaurar** existe para ser executada de verdade — pelo menos uma vez agora,
> e depois sempre que o schema mudar de forma relevante.

O dump diário roda em `.github/workflows/backup-banco.yml`, às 03:10 de São
Paulo, e vai para o Google Cloud Storage.

## O que este backup cobre, e o que não cobre

**Cobre:** todo o conteúdo do PostgreSQL de produção — pedidos, histórico de
status, carteiras, faturas, empresas, entregadores, clientes.

**Não cobre:**

- **Redis.** Fila de despacho, presença e jobs agendados. É estado efêmero por
  desenho: a varredura `dispatch-sweep-every-minute` reconstrói o que importa no
  próximo minuto. Não vale backup.
- **Keystore de assinatura** (`I:\MOTOboyCity\signing\`, cópia em `D:\`). Perder
  as duas cópias significa **nunca mais atualizar o aplicativo instalado**.
  Continua fora daqui por ser decisão separada — se for para a nuvem, tem que ir
  criptografado.
- **APKs.** Recompiláveis a partir do código, e já em duas pastas.
- **Segredos de ambiente** (`.env`, chaves do Google, Firebase). Ficam com o
  provedor e com você.

## O dump tem dado pessoal

Nome, telefone, CPF e endereço de destinatários e entregadores. O balde **não
pode ser público**, e o acesso a ele é o mesmo acesso a esses dados. Isso não é
formalidade: é o motivo de a conta de serviço abaixo não poder ler nada.

## Configuração — o que fazer no Google Cloud

Uma vez só. Requer `gcloud` instalado, ou o console web.

### 1. Balde privado, com apagamento automático

```bash
gcloud storage buckets create gs://SEU-BALDE \
  --location=southamerica-east1 \
  --uniform-bucket-level-access \
  --public-access-prevention
```

`southamerica-east1` (São Paulo) porque o dado é de titulares brasileiros e a
latência do envio importa pouco perto disso.

Vale deixar a **exclusão reversível** (soft delete) ligada, como está. Ela é a
segunda camada da mesma ideia da conta de serviço abaixo: mesmo um apagamento
feito de dentro do console, por engano, tem volta durante a retenção. O preço é
saber que objeto apagado continua sendo cobrado nesse período — com a retenção
padrão de 7 dias, paga-se cerca de 37 dias de armazenamento, e não 30.

Retenção de 30 dias, para o custo não crescer para sempre:

```bash
printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}' > ciclo.json
gcloud storage buckets update gs://SEU-BALDE --lifecycle-file=ciclo.json
```

### 2. Conta de serviço que só sabe criar

```bash
gcloud iam service-accounts create backup-motoboycity \
  --display-name="Backup do banco MOTOboyCity"

gcloud storage buckets add-iam-policy-binding gs://SEU-BALDE \
  --member="serviceAccount:backup-motoboycity@SEU-PROJETO.iam.gserviceaccount.com" \
  --role="roles/storage.objectCreator"
```

**`objectCreator`, e não `objectAdmin`.** A diferença é o que acontece se a
chave vazar: com `objectCreator` o invasor consegue escrever lixo novo, mas
**não consegue ler nem apagar** os backups existentes. Com `objectAdmin`, ele
apaga tudo — e um backup que o atacante apaga é exatamente o que não existe na
hora do resgate.

É por isso que o workflow gera o nome com data e hora em vez de sobrescrever um
arquivo fixo: sobrescrever exigiria permissão de apagar.

### 3. A chave

```bash
gcloud iam service-accounts keys create chave.json \
  --iam-account=backup-motoboycity@SEU-PROJETO.iam.gserviceaccount.com
```

Cole o **conteúdo inteiro** do `chave.json` no segredo do GitHub abaixo e
**apague o arquivo local**. Ele é uma credencial de longa duração; o `chave.json`
parado na pasta Downloads é o jeito mais comum de vazar uma.

### 4. Segredos no GitHub

Em **Settings → Secrets and variables → Actions → New repository secret**:

| Segredo                   | Conteúdo                                                   |
| ------------------------- | ---------------------------------------------------------- |
| `PRODUCTION_DATABASE_URL` | string de conexão do PostgreSQL de produção                |
| `GCP_SERVICE_ACCOUNT_KEY` | JSON inteiro do `chave.json`                               |
| `GCS_BUCKET`              | só o nome do balde, sem `gs://`                            |
| `API_URL`                 | endereço da API em produção, ex. `https://api.exemplo.com` |
| `JOB_CHECK_IN_TOKEN`      | segredo compartilhado com a API (ver seção 5)              |

Os dois últimos são do aviso de vida, e não do backup em si — sem eles o dump
continua rodando e subindo, mas o painel não fica sabendo e passa a reclamar de
um backup que existe.

Produção roda **PostgreSQL 18**, e o workflow já usa essa major por padrão —
não é preciso criar variável nenhuma. Se um dia o provedor subir a versão, o
dump falha em vez de sair truncado, e a saída é criar a **variável** (não
segredo) `PG_MAJOR` com a major nova.

> **O repositório é público.** Segredos de Actions não são expostos em workflow
> agendado, e nenhum passo aqui imprime o valor deles. Mas quem tiver acesso de
> escrita ao repositório pode criar um workflow que os leia — trate o acesso ao
> repositório como acesso ao banco.

### 5. O aviso de vida (o sino do painel admin)

Um backup que para de rodar não avisa nada: workflow apagado, agendamento que
o GitHub suspende por inatividade do repositório, segredo expirado — em todos
esses casos o **silêncio parece sucesso**. Por isso a última coisa que o
workflow faz, já com o arquivo no balde, é bater na API:

```
POST /ops/check-in/backup-banco
x-job-token: <JOB_CHECK_IN_TOKEN>
{"sizeBytes": 1348231, "detail": "motoboycity-2026-08-30-0310.dump"}
```

A API guarda a data na tabela `job_check_ins`. O sino do painel admin cobra a
**ausência** desse aviso: **36 horas** sem sinal viram alerta amarelo, **7 dias**
viram crítico, e "nunca confirmou" (nenhuma linha na tabela) já nasce crítico.
Perguntar ao GitHub se o workflow falhou só pegaria a falha que ele consegue
reportar; cobrar a ausência pega também a rotina que nunca chegou a rodar.

Gere o segredo (qualquer coisa longa e aleatória serve):

```bash
openssl rand -hex 32
```

O **mesmo valor** vai em dois lugares:

1. segredo `JOB_CHECK_IN_TOKEN` no GitHub (tabela acima);
2. variável de ambiente `JOB_CHECK_IN_TOKEN` no serviço da API, no provedor.

O endpoint fica **fora do login** de propósito — quem chama é um runner sem
sessão de usuário — e por isso o segredo é comparado em tempo constante, atrás
de um guard que roda antes da validação do corpo. Enquanto a variável não
existir na API, a rota responde 401 a todo mundo e o sino continua dizendo que
o backup nunca confirmou.

### 6. Prove que funciona

**Actions → Backup do banco → Run workflow.** Não espere o horário; se algo
estiver errado, você quer saber agora.

**Se falhar com timeout de conexão**, o banco provavelmente só aceita conexão
pela rede privada do provedor. Nesse caso o runner do GitHub não alcança, e a
saída é rodar o dump como cron dentro do próprio provedor. O código do dump é o
mesmo; só muda onde ele executa.

## Restaurar

O que ninguém faz antes de precisar. Faça uma vez agora.

> **Não restaure no `motoboycity-postgres` do `docker-compose`.** Ele é
> PostgreSQL **17**, e produção é **18**: um dump feito pelo 18 não entra num
> servidor 17. Restaurar para trás não é suportado, e a falha só aparece no meio
> do processo. Por isso o teste sobe um servidor 18 descartável — que também tem
> a vantagem de não encostar no seu banco de desenvolvimento.

```bash
# 1. baixe o backup mais recente
gcloud storage ls gs://SEU-BALDE
gcloud storage cp gs://SEU-BALDE/motoboycity-AAAA-MM-DD-HHMM.dump .

# 2. suba um PostgreSQL 18 descartável na porta 5440
docker run -d --name restore-teste -e POSTGRES_PASSWORD=teste \
  -p 5440:5432 postgres:18-alpine

# 3. restaure (pg_restore da MESMA imagem 18, não o do container local)
docker run --rm -i postgres:18-alpine pg_restore \
  --dbname="postgresql://postgres:teste@host.docker.internal:5440/postgres" \
  --no-owner --no-privileges --verbose < motoboycity-AAAA-MM-DD-HHMM.dump
```

**Confira que restaurou de verdade**, e não só que o comando terminou:

```bash
docker exec restore-teste psql -U postgres -tAc \
  "SELECT (SELECT count(*) FROM deliveries) AS pedidos,
          (SELECT count(*) FROM companies) AS empresas,
          (SELECT count(*) FROM drivers) AS entregadores;"
```

Os números têm que bater com produção. Um `pg_restore` que termina com avisos e
zero linhas é o desfecho silencioso que a gente quer descobrir hoje, não no dia.

Destrua o servidor de teste ao terminar — ele contém dado pessoal real:

```bash
docker rm -f restore-teste
```

## Restaurar em produção

Só em desastre, e nunca por cima do banco vivo. O caminho seguro é o mesmo do
runbook: restaure numa **cópia nova**, aponte a API para ela, confira contagens e
rode o smoke, e só então promova. Restaurar por cima do banco atual troca um
problema conhecido por um irreversível.

## Ainda em aberto

- **O aviso de vida depende da API estar de pé.** Se a API cair junto, o sino
  não é lido por ninguém. É a limitação aceita: ele cobre rotina quebrada, não
  desastre geral — para esse caso o alerta tem que vir de fora, e não existe.
- **Frequência diária.** Perde-se até 24 horas de operação. Se isso for
  inaceitável, o caminho não é dump mais frequente e sim recuperação
  ponto-no-tempo do provedor.
- **O keystore continua sem cópia fora de casa.**
