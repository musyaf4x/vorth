param(
  [ValidateSet("agy-codex", "balanced", "minimal")]
  [string]$Preset = "agy-codex",
  [string]$InstallDir,
  [switch]$SkipPath
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$entrypoint = Join-Path $repoRoot "bin\vorth.mjs"
$node = Get-Command node -ErrorAction Stop

if (-not $InstallDir) {
  if ($env:VORTH_CLI_BIN) {
    $InstallDir = $env:VORTH_CLI_BIN
  } else {
    $InstallDir = Join-Path $env:LOCALAPPDATA "Vorth\bin"
  }
}

$InstallDir = [System.IO.Path]::GetFullPath($InstallDir)
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$wrapper = Join-Path $InstallDir "vorth.cmd"
$wrapperText = "@echo off`r`n`"$($node.Source)`" `"$entrypoint`" %*`r`n"
Set-Content -LiteralPath $wrapper -Value $wrapperText -Encoding Ascii -NoNewline

if (-not $SkipPath) {
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $entries = @($userPath -split ";" | Where-Object { $_ })
  if (-not ($entries | Where-Object { $_.TrimEnd("\") -ieq $InstallDir.TrimEnd("\") })) {
    $nextPath = (@($entries) + $InstallDir) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $nextPath, "User")
  }
}

& $wrapper configure --preset $Preset | Out-Host
Write-Host "Vorth CLI installed: $wrapper"
if (-not $SkipPath) {
  Write-Host "Open a new terminal, then run: vorth init"
}
