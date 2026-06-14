$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot
try {
  node scripts/prepare-nas-bundle.mjs
}
finally {
  Pop-Location
}
