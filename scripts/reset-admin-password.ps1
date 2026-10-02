$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env.local"

if (-not (Test-Path $envFile)) {
  Write-Host "Could not find .env.local in the Christmas worktree." -ForegroundColor Red
  exit 1
}

function Read-PlainSecret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

$newSecret = Read-PlainSecret "Enter a NEW PostDuty admin password"
$confirm = Read-PlainSecret "Enter it again to confirm"

if ($newSecret -ne $confirm) {
  Write-Host "Passwords did not match. Nothing changed." -ForegroundColor Red
  exit 1
}

if ($newSecret.Length -lt 12) {
  Write-Host "Use at least 12 characters. Nothing changed." -ForegroundColor Red
  exit 1
}

$lines = Get-Content -LiteralPath $envFile
$found = $false
$updated = foreach ($line in $lines) {
  if ($line -match '^ADMIN_SECRET=') {
    $found = $true
    "ADMIN_SECRET=$newSecret"
  }
  else {
    $line
  }
}

if (-not $found) {
  $updated += "ADMIN_SECRET=$newSecret"
}

Set-Content -LiteralPath $envFile -Value $updated -Encoding UTF8

$newSecret = $null
$confirm = $null

Write-Host ""
Write-Host "Local PostDuty admin password reset successfully." -ForegroundColor Green
Write-Host "Tell ChatGPT: admin password reset"
Write-Host "The preview server must be restarted before the new password takes effect."
