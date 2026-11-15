param(
  [string[]]$Files = @(),
  [string]$PfxPath = $env:CODESIGN_PFX,
  [string]$PfxPassword = $env:CODESIGN_PASS,
  [string]$TimestampUrl = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'

function Find-SignTool {
  $inPath = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($inPath) { return $inPath.Source }

  $kits = 'C:\Program Files (x86)\Windows Kits\10\bin'
  if (-not (Test-Path $kits)) { return $null }

  $candidates = Get-ChildItem $kits -Filter 'signtool.exe' -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\x64\\' } |
    Sort-Object { $_.FullName } -Descending

  if ($candidates.Count -gt 0) { return $candidates[0].FullName }
  return $null
}

$signtool = Find-SignTool
if (-not $signtool) {
  throw 'signtool.exe not found. Install Windows SDK or Windows SDK Build Tools.'
}
Write-Host "signtool: $signtool"

if (-not $Files -or $Files.Count -eq 0) {
  $root = Split-Path $PSScriptRoot -Parent
  $Files = @(
    (Join-Path $root 'src-tauri\target\release\Game Launcher.exe'),
    (Get-ChildItem (Join-Path $root 'src-tauri\target\release\bundle\nsis') -Filter '*-setup.exe' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName),
    (Get-ChildItem (Join-Path $root 'src-tauri\target\release\bundle\msi') -Filter '*.msi' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
  ) | Where-Object { $_ } | Select-Object -Unique
}

if (-not $PfxPath) {
  throw 'No signing certificate. Options: SignPath Foundation (free for open source, https://signpath.org), Azure Artifact Signing (~$9.99/mo, https://aka.ms/artifactsigning), Certum Open Source (~$50/yr). Then set CODESIGN_PFX and CODESIGN_PASS and run: npm run sign'
}

if (-not (Test-Path $PfxPath)) { throw "Certificate file not found: $PfxPath" }

$signed = 0
foreach ($file in $Files) {
  if (-not (Test-Path $file)) {
    Write-Host "skip (no file): $file" -ForegroundColor DarkYellow
    continue
  }

  if ($PfxPassword) {
    & $signtool sign /fd SHA256 /f $PfxPath /p $PfxPassword /td SHA256 /tr $TimestampUrl $file | Out-Null
  } else {
    & $signtool sign /fd SHA256 /f $PfxPath /td SHA256 /tr $TimestampUrl $file | Out-Null
  }

  if ($LASTEXITCODE -ne 0) { throw "signtool exit code $LASTEXITCODE for $file" }

  $check = Get-AuthenticodeSignature $file
  Write-Host ("signed: {0} - {1}" -f (Split-Path $file -Leaf), $check.Status)
  $signed += 1
}

Write-Host "done: signed files $signed" -ForegroundColor Green
