# Backup local do PostgreSQL no Windows

## Escopo atual

Esta rotina protege o PostgreSQL hospedado no Neon com um dump lógico diário no
disco local `F:`. Ela não altera dados do banco, não executa migrations e não
inclui o Redis/BullMQ, que contém estado operacional temporário separado.

- tarefa: `MOTOboyCity PostgreSQL Backup`;
- horário: diariamente às 02:30, com `StartWhenAvailable`;
- identidade: usuário atual do Windows, inclusive com a tela bloqueada; se o
  usuário tiver encerrado a sessão, a tarefa aguarda o próximo logon;
- destino: `F:\MOTOboyCity\database-backups`;
- retenção: 30 dias;
- formato: archive customizado do PostgreSQL;
- integridade: leitura por `pg_restore --list` e SHA-256;
- credencial: lida exclusivamente de `DIRECT_URL` em
  `F:\MOTOboyCity\config\backup.env`, sem ser gravada na tarefa,
  no log, no manifesto ou na linha de comando do `pg_dump`.

O dump é criado primeiro como `.partial`. O nome definitivo `.dump` só aparece
depois que o processo termina e o archive é reconhecido pelo `pg_restore`.

O arquivo de produção é separado dos `.env` do repositório, que podem apontar
para `localhost`. Seu conteúdo deve ter apenas a conexão direta, nunca a URL
pooled:

```dotenv
DIRECT_URL="postgresql://..."
```

Para criá-lo sem mostrar a senha no terminal ou no chat, execute e cole a URL
quando o prompt oculto aparecer:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\apps\api\scripts\configure-postgres-backup-secret.ps1
```

O helper restringe o arquivo ao usuário atual, `SYSTEM` e administradores. Ele
também rejeita `localhost` e o hostname `-pooler` do Neon.

Por padrão, o registro usa o usuário atual e não exige terminal como
administrador. `-RunAs System` está disponível somente quando o PowerShell for
aberto como administrador.

## Operação

Executar um backup manual:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\apps\api\scripts\backup-postgres.ps1
```

Consultar a tarefa e a última execução:

```powershell
Get-ScheduledTask -TaskName 'MOTOboyCity PostgreSQL Backup'
Get-ScheduledTaskInfo -TaskName 'MOTOboyCity PostgreSQL Backup'
```

Os logs ficam em `F:\MOTOboyCity\database-backups\logs`. Uma execução válida
produz o `.dump`, o `.dump.sha256` e o `.dump.json` com o mesmo nome-base.

## Verificação e restauração

Antes de restaurar, confira o hash e a estrutura do archive:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'F:\MOTOboyCity\database-backups\motoboycity-postgres-AAAAmmdd-HHMMSS.dump'
& 'F:\MOTOboyCity\tools\postgresql-18.6\pgsql\bin\pg_restore.exe' `
  --list 'F:\MOTOboyCity\database-backups\motoboycity-postgres-AAAAmmdd-HHMMSS.dump'
```

Nunca restaure diretamente sobre produção. Crie primeiro um banco ou branch
Neon isolado, configure as variáveis desse alvo em uma sessão separada e só
então execute `pg_restore`. Não reutilize o `.env` de produção no comando de
restauração.

Exemplo deliberadamente incompleto, apenas para o alvo isolado já conferido:

```powershell
$env:PGHOST = '<host-isolado>'
$env:PGPORT = '5432'
$env:PGDATABASE = '<banco-isolado>'
$env:PGUSER = '<usuario-isolado>'
$env:PGPASSWORD = '<senha-isolada>'
$env:PGSSLMODE = 'require'

& 'F:\MOTOboyCity\tools\postgresql-18.6\pgsql\bin\pg_restore.exe' `
  --no-owner --no-acl --clean --if-exists `
  --dbname $env:PGDATABASE `
  'F:\MOTOboyCity\database-backups\motoboycity-postgres-AAAAmmdd-HHMMSS.dump'
```

Depois do ensaio, remova `PGPASSWORD` da sessão. Uma restauração só está
comprovada após a API conseguir consultar a cópia e as contagens principais
serem comparadas.

## Riscos e próximos reforços

- O computador e o disco `F:` precisam estar ligados e montados. Se estiverem
  indisponíveis às 02:30, a tarefa tenta iniciar quando o Windows voltar.
- Disco local não protege contra furto, incêndio, ransomware ou falha simultânea
  do computador. O próximo reforço é uma segunda cópia criptografada fora desta
  máquina.
- Backups contêm dados pessoais e financeiros. Restrinja o acesso ao disco e
  habilite BitLocker quando possível.
- O restore deve ser ensaiado periodicamente em uma cópia isolada; validar apenas
  o archive não prova sozinho a recuperação completa da aplicação.
