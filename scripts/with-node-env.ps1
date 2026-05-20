# Activate fnm Node version for Windows, set DevFlow env vars, run a command.
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$NodeVersion = node (Join-Path $Root 'scripts/read-version.mjs')
$ProfileName = node (Join-Path $Root 'scripts/read-platform.mjs')

$env:PUPPETEER_SKIP_DOWNLOAD = 'true'
$env:DEVFLOW_NODE_PROFILE = if ($env:DEVFLOW_NODE_PROFILE) { $env:DEVFLOW_NODE_PROFILE } else { $ProfileName }

function Activate-Fnm {
  if (-not (Get-Command fnm -ErrorAction SilentlyContinue)) {
    return $false
  }
  fnm env | Out-String | Invoke-Expression
  fnm use $NodeVersion --install-if-missing
  if ($LASTEXITCODE -ne 0) {
    fnm install $NodeVersion
    fnm use $NodeVersion
  }
  return $true
}

if (-not (Activate-Fnm)) {
  $currentMajor = (node -p "process.versions.node.split('.')[0]")
  if ($currentMajor -ne $NodeVersion) {
    Write-Error "[devflow] fnm not found and Node $currentMajor.x is active. Install fnm or switch to Node ${NodeVersion}.x. Run: npm run setup:node"
  }
}

if ($Rest.Count -eq 0) {
  Write-Error 'Usage: with-node-env.ps1 <command> [args...]'
}

$exe = $Rest[0]
$cmdArgs = @()
if ($Rest.Count -gt 1) {
  $cmdArgs = $Rest[1..($Rest.Count - 1)]
}

& $exe @cmdArgs
if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
