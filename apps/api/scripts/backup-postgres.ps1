[CmdletBinding()]
param(
  [string]$EnvironmentFile = 'F:\MOTOboyCity\config\backup.env',
  [string]$BackupDirectory = 'F:\MOTOboyCity\database-backups',
  [string]$PgDumpPath = 'F:\MOTOboyCity\tools\postgresql-18.6\pgsql\bin\pg_dump.exe',
  [string]$PgRestorePath = 'F:\MOTOboyCity\tools\postgresql-18.6\pgsql\bin\pg_restore.exe',
  [ValidateRange(1, 3650)]
  [int]$RetentionDays = 30,
  [switch]$AllowLocalSource,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:LogPath = $null
$partialPath = $null
$lockStream = $null
$managedEnvironmentNames = @(
  'PGHOST',
  'PGPORT',
  'PGDATABASE',
  'PGUSER',
  'PGPASSWORD',
  'PGSSLMODE',
  'PGCHANNELBINDING',
  'PGOPTIONS'
)
$previousEnvironment = @{}

function Write-SafeLog {
  param([Parameter(Mandatory)][string]$Message)

  $line = '{0} {1}' -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $Message
  Write-Output $line
  if ($script:LogPath) {
    Add-Content -LiteralPath $script:LogPath -Value $line -Encoding UTF8
  }
}

function Resolve-SafeBackupDirectory {
  param([Parameter(Mandatory)][string]$Path)

  $fullPath = [System.IO.Path]::GetFullPath(
    $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
  ).TrimEnd('\')
  $root = [System.IO.Path]::GetPathRoot($fullPath).TrimEnd('\')

  if (-not [System.IO.Path]::IsPathRooted($fullPath) -or $fullPath -eq $root) {
    throw 'O diretorio de backup precisa ser absoluto e nao pode ser a raiz de um disco.'
  }

  $relativeParts = $fullPath.Substring($root.Length).Trim('\').Split(
    '\',
    [System.StringSplitOptions]::RemoveEmptyEntries
  )
  if ($relativeParts.Count -lt 2) {
    throw 'Use pelo menos dois niveis abaixo da raiz, por exemplo F:\MOTOboyCity\database-backups.'
  }

  $driveName = [System.IO.Path]::GetPathRoot($fullPath).Substring(0, 1)
  $drive = Get-PSDrive -Name $driveName -PSProvider FileSystem -ErrorAction Stop
  if ($drive.Free -lt 1GB) {
    throw ('O disco {0}: tem menos de 1 GB livre.' -f $driveName)
  }

  return $fullPath
}

function Read-DirectDatabaseUrl {
  param([Parameter(Mandatory)][string]$Path)

  $resolvedEnvironmentFile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
  if (-not (Test-Path -LiteralPath $resolvedEnvironmentFile -PathType Leaf)) {
    throw "Arquivo de ambiente nao encontrado: $resolvedEnvironmentFile"
  }

  foreach ($line in [System.IO.File]::ReadLines($resolvedEnvironmentFile)) {
    if ($line -match '^\s*DIRECT_URL\s*=\s*(.*?)\s*$') {
      $value = $Matches[1]
      if ($value.Length -ge 2) {
        $first = $value.Substring(0, 1)
        $last = $value.Substring($value.Length - 1, 1)
        if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
          $value = $value.Substring(1, $value.Length - 2)
        }
      }
      if ($value.Trim()) {
        return $value.Trim()
      }
    }
  }

  throw "DIRECT_URL nao foi configurada em $resolvedEnvironmentFile. O backup nao usa a URL com pool."
}

function ConvertFrom-PostgresUrl {
  param([Parameter(Mandatory)][string]$ConnectionUrl)

  $uri = [System.Uri]::new($ConnectionUrl)
  if ($uri.Scheme -notin @('postgres', 'postgresql')) {
    throw 'DIRECT_URL precisa usar o protocolo postgres:// ou postgresql://.'
  }

  $userInfoParts = $uri.UserInfo.Split(@(':'), 2, [System.StringSplitOptions]::None)
  if ($userInfoParts.Count -ne 2) {
    throw 'DIRECT_URL precisa conter usuario e senha.'
  }

  $query = @{}
  foreach ($pair in $uri.Query.TrimStart('?').Split('&', [System.StringSplitOptions]::RemoveEmptyEntries)) {
    $parts = $pair.Split(@('='), 2, [System.StringSplitOptions]::None)
    $name = [System.Uri]::UnescapeDataString($parts[0])
    $value = if ($parts.Count -eq 2) { [System.Uri]::UnescapeDataString($parts[1]) } else { '' }
    $query[$name] = $value
  }

  $database = [System.Uri]::UnescapeDataString($uri.AbsolutePath.Trim('/'))
  if (-not $uri.Host -or -not $database) {
    throw 'DIRECT_URL precisa conter host e nome do banco.'
  }
  if ($uri.Host -match '-pooler\.' ) {
    throw 'A URL informada parece usar o pool do Neon. Copie a conexao direta (unpooled).'
  }
  if (-not $AllowLocalSource -and $uri.Host -in @('localhost', '127.0.0.1', '::1')) {
    throw 'A origem aponta para localhost. Use a DIRECT_URL de producao ou declare -AllowLocalSource conscientemente.'
  }

  return [pscustomobject]@{
    Host = $uri.Host
    Port = if ($uri.IsDefaultPort) { 5432 } else { $uri.Port }
    Database = $database
    User = [System.Uri]::UnescapeDataString($userInfoParts[0])
    Password = [System.Uri]::UnescapeDataString($userInfoParts[1])
    SslMode = if ($query.ContainsKey('sslmode') -and $query['sslmode']) { $query['sslmode'] } else { 'require' }
    ChannelBinding = if ($query.ContainsKey('channel_binding')) { $query['channel_binding'] } else { $null }
    Options = if ($query.ContainsKey('options')) { $query['options'] } else { $null }
  }
}

function Set-ProcessPostgresEnvironment {
  param([Parameter(Mandatory)]$Connection)

  $values = @{
    PGHOST = $Connection.Host
    PGPORT = [string]$Connection.Port
    PGDATABASE = $Connection.Database
    PGUSER = $Connection.User
    PGPASSWORD = $Connection.Password
    PGSSLMODE = $Connection.SslMode
    PGCHANNELBINDING = $Connection.ChannelBinding
    PGOPTIONS = $Connection.Options
  }

  foreach ($name in $managedEnvironmentNames) {
    if (Test-Path -LiteralPath "Env:$name") {
      $previousEnvironment[$name] = (Get-Item -LiteralPath "Env:$name").Value
    }
    if ($null -eq $values[$name] -or -not ([string]$values[$name]).Trim()) {
      Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
    } else {
      Set-Item -LiteralPath "Env:$name" -Value ([string]$values[$name])
    }
  }
}

function Restore-ProcessPostgresEnvironment {
  foreach ($name in $managedEnvironmentNames) {
    if ($previousEnvironment.ContainsKey($name)) {
      Set-Item -LiteralPath "Env:$name" -Value $previousEnvironment[$name]
    } else {
      Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
    }
  }
}

try {
  $resolvedBackupDirectory = Resolve-SafeBackupDirectory -Path $BackupDirectory
  New-Item -ItemType Directory -Path $resolvedBackupDirectory -Force | Out-Null
  $logDirectory = Join-Path $resolvedBackupDirectory 'logs'
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

  $timestamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
  $script:LogPath = Join-Path $logDirectory "backup-$timestamp.log"
  $lockPath = Join-Path $resolvedBackupDirectory '.backup.lock'
  try {
    $lockStream = [System.IO.File]::Open(
      $lockPath,
      [System.IO.FileMode]::OpenOrCreate,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::None
    )
  } catch [System.IO.IOException] {
    throw 'Outro backup ja esta em execucao.'
  }

  $connectionUrl = Read-DirectDatabaseUrl -Path $EnvironmentFile
  $connection = ConvertFrom-PostgresUrl -ConnectionUrl $connectionUrl

  foreach ($tool in @($PgDumpPath, $PgRestorePath)) {
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) {
      throw "Ferramenta PostgreSQL nao encontrada: $tool"
    }
  }

  Write-SafeLog ('Destino validado: {0} ({1:N2} GB livres).' -f $resolvedBackupDirectory, ((Get-PSDrive -Name $resolvedBackupDirectory.Substring(0, 1)).Free / 1GB))
  Write-SafeLog ('Origem validada: host={0}; porta={1}; banco={2}; TLS={3}.' -f $connection.Host, $connection.Port, $connection.Database, $connection.SslMode)

  if ($DryRun) {
    Write-SafeLog 'Dry-run concluido; nenhum acesso ao banco e nenhum dump foram executados.'
    return
  }

  Set-ProcessPostgresEnvironment -Connection $connection

  $baseName = "motoboycity-postgres-$timestamp"
  $partialPath = Join-Path $resolvedBackupDirectory "$baseName.dump.partial"
  $finalPath = Join-Path $resolvedBackupDirectory "$baseName.dump"
  $hashPath = "$finalPath.sha256"
  $manifestPath = "$finalPath.json"

  Write-SafeLog 'Iniciando pg_dump em formato customizado.'
  $dumpArguments = @(
    '--format=custom',
    '--compress=9',
    '--no-owner',
    '--no-acl',
    "--file=$partialPath"
  )
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $PgDumpPath @dumpArguments 2>&1 | ForEach-Object { Write-SafeLog "pg_dump: $_" }
    $dumpExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($dumpExitCode -ne 0) {
    throw "pg_dump terminou com codigo $dumpExitCode."
  }

  $partialFile = Get-Item -LiteralPath $partialPath
  if ($partialFile.Length -le 0) {
    throw 'pg_dump gerou um arquivo vazio.'
  }

  try {
    $ErrorActionPreference = 'Continue'
    $restoreOutput = @(& $PgRestorePath --list $partialPath 2>&1)
    $restoreExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($restoreExitCode -ne 0) {
    $summary = ($restoreOutput | Select-Object -First 5) -join ' '
    throw "pg_restore nao reconheceu o arquivo gerado. $summary"
  }

  Move-Item -LiteralPath $partialPath -Destination $finalPath
  $partialPath = $null

  $finalFile = Get-Item -LiteralPath $finalPath
  $hash = (Get-FileHash -LiteralPath $finalPath -Algorithm SHA256).Hash
  [System.IO.File]::WriteAllText(
    $hashPath,
    "$hash  $($finalFile.Name)`r`n",
    [System.Text.UTF8Encoding]::new($false)
  )

  $pgDumpVersion = (& $PgDumpPath --version 2>&1 | Select-Object -First 1).ToString()
  $manifest = [ordered]@{
    createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    file = $finalFile.Name
    bytes = $finalFile.Length
    sha256 = $hash
    format = 'postgresql-custom'
    sourceHost = $connection.Host
    sourcePort = $connection.Port
    sourceDatabase = $connection.Database
    client = $pgDumpVersion
    retentionDays = $RetentionDays
  }
  [System.IO.File]::WriteAllText(
    $manifestPath,
    (($manifest | ConvertTo-Json -Depth 3) + "`r`n"),
    [System.Text.UTF8Encoding]::new($false)
  )

  $cutoff = (Get-Date).ToUniversalTime().AddDays(-$RetentionDays)
  $removedCount = 0
  Get-ChildItem -LiteralPath $resolvedBackupDirectory -File | Where-Object {
    $_.Name -like 'motoboycity-postgres-*' -and
    $_.Name -match '\.dump(\.sha256|\.json)?$' -and
    $_.LastWriteTimeUtc -lt $cutoff
  } | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
    $removedCount += 1
  }

  $partialCutoff = (Get-Date).ToUniversalTime().AddDays(-1)
  Get-ChildItem -LiteralPath $resolvedBackupDirectory -File -Filter 'motoboycity-postgres-*.dump.partial' | Where-Object {
    $_.LastWriteTimeUtc -lt $partialCutoff
  } | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
    $removedCount += 1
  }

  Get-ChildItem -LiteralPath $logDirectory -File -Filter 'backup-*.log' | Where-Object {
    $_.FullName -ne $script:LogPath -and $_.LastWriteTimeUtc -lt $cutoff
  } | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
    $removedCount += 1
  }

  Write-SafeLog ('Backup concluido: {0}; {1:N2} MB; SHA-256 {2}.' -f $finalFile.Name, ($finalFile.Length / 1MB), $hash)
  Write-SafeLog ("Retencao de $RetentionDays dias aplicada; $removedCount arquivo(s) antigo(s) removido(s).")
} catch {
  if ($partialPath -and (Test-Path -LiteralPath $partialPath -PathType Leaf)) {
    Remove-Item -LiteralPath $partialPath -Force -ErrorAction SilentlyContinue
  }
  if ($script:LogPath) {
    Write-SafeLog "FALHA: $($_.Exception.Message)"
  }
  throw
} finally {
  Restore-ProcessPostgresEnvironment
  if ($lockStream) {
    $lockStream.Dispose()
  }
}
