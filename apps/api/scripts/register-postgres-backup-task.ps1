[CmdletBinding()]
param(
  [string]$TaskName = 'MOTOboyCity PostgreSQL Backup',
  [string]$BackupScript = (Join-Path $PSScriptRoot 'backup-postgres.ps1'),
  [string]$EnvironmentFile = 'F:\MOTOboyCity\config\backup.env',
  [string]$BackupDirectory = 'F:\MOTOboyCity\database-backups',
  [string]$PgDumpPath = 'F:\MOTOboyCity\tools\postgresql-18.6\pgsql\bin\pg_dump.exe',
  [string]$PgRestorePath = 'F:\MOTOboyCity\tools\postgresql-18.6\pgsql\bin\pg_restore.exe',
  [ValidateRange(1, 3650)]
  [int]$RetentionDays = 30,
  [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')]
  [string]$DailyAt = '02:30',
  [ValidateSet('CurrentUser', 'System')]
  [string]$RunAs = 'CurrentUser',
  [switch]$StartImmediately
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-ExistingFile {
  param([Parameter(Mandatory)][string]$Path)

  $resolved = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
    throw "Arquivo nao encontrado: $resolved"
  }
  return [System.IO.Path]::GetFullPath($resolved)
}

function Quote-TaskArgument {
  param([Parameter(Mandatory)][string]$Value)

  if ($Value.Contains('"')) {
    throw 'Aspas duplas nao sao permitidas nos caminhos da tarefa.'
  }
  return '"{0}"' -f $Value
}

$resolvedScript = Resolve-ExistingFile -Path $BackupScript
$resolvedEnvironmentFile = Resolve-ExistingFile -Path $EnvironmentFile
$resolvedPgDump = Resolve-ExistingFile -Path $PgDumpPath
$resolvedPgRestore = Resolve-ExistingFile -Path $PgRestorePath
$resolvedBackupDirectory = [System.IO.Path]::GetFullPath(
  $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($BackupDirectory)
)

$arguments = @(
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  (Quote-TaskArgument $resolvedScript),
  '-EnvironmentFile',
  (Quote-TaskArgument $resolvedEnvironmentFile),
  '-BackupDirectory',
  (Quote-TaskArgument $resolvedBackupDirectory),
  '-PgDumpPath',
  (Quote-TaskArgument $resolvedPgDump),
  '-PgRestorePath',
  (Quote-TaskArgument $resolvedPgRestore),
  '-RetentionDays',
  [string]$RetentionDays
) -join ' '

$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Daily -At $DailyAt
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -WakeToRun `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 4) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 15)
$principal = if ($RunAs -eq 'System') {
  New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
} else {
  $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
}

$task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Backup diario do PostgreSQL do MOTOboyCity, validado e com retencao local de 30 dias.'
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force -ErrorAction Stop | Out-Null

Write-Output "Tarefa registrada: $TaskName"
Write-Output "Agenda diaria: $DailyAt; executar assim que possivel se o horario for perdido."
Write-Output "Destino: $resolvedBackupDirectory"
Write-Output "Identidade: $RunAs"

if ($StartImmediately) {
  Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  Write-Output 'Primeira execucao iniciada pelo Agendador de Tarefas.'
}
