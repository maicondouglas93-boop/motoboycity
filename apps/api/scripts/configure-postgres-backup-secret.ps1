[CmdletBinding()]
param(
  [string]$ConfigPath = 'F:\MOTOboyCity\config\backup.env'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$plainText = $null
$pointer = [System.IntPtr]::Zero

try {
  Write-Output 'Cole a DIRECT_URL de producao do Neon. A entrada ficara oculta.'
  $secureValue = Read-Host -AsSecureString 'DIRECT_URL'
  $pointer = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
  $plainText = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)

  if (-not $plainText -or $plainText.Contains("`r") -or $plainText.Contains("`n") -or $plainText.Contains('"')) {
    throw 'DIRECT_URL vazia ou com caracteres nao permitidos.'
  }

  $uri = [System.Uri]::new($plainText)
  if ($uri.Scheme -notin @('postgres', 'postgresql') -or -not $uri.Host -or -not $uri.UserInfo -or -not $uri.AbsolutePath.Trim('/')) {
    throw 'DIRECT_URL invalida.'
  }
  if ($uri.Host -in @('localhost', '127.0.0.1', '::1')) {
    throw 'A conexao informada aponta para localhost, nao para producao.'
  }
  if ($uri.Host -match '-pooler\.') {
    throw 'A conexao informada usa o pool do Neon. Copie a conexao direta (unpooled).'
  }

  $fullPath = [System.IO.Path]::GetFullPath(
    $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ConfigPath)
  )
  $directory = Split-Path -Parent $fullPath
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  [System.IO.File]::WriteAllText(
    $fullPath,
    "DIRECT_URL=`"$plainText`"`r`n",
    [System.Text.UTF8Encoding]::new($false)
  )

  $acl = [System.Security.AccessControl.FileSecurity]::new()
  $acl.SetAccessRuleProtection($true, $false)
  $identities = @(
    [System.Security.Principal.WindowsIdentity]::GetCurrent().User,
    [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'),
    [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
  )
  foreach ($identity in $identities) {
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
      $identity,
      [System.Security.AccessControl.FileSystemRights]::FullControl,
      [System.Security.AccessControl.AccessControlType]::Allow
    )
    [void]$acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $fullPath -AclObject $acl

  Write-Output "Configuracao protegida salva em $fullPath. O segredo nao foi exibido."
} finally {
  if ($pointer -ne [System.IntPtr]::Zero) {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
  $plainText = $null
}
