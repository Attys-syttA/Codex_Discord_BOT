$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot
try {
  git status --short --branch
  npm run typecheck
  npm test
  npm run build
  npm run plans:check
  npm run audit:deps
  npm run nas:inventory:check
  npm run nas:bundle:check
  npm run nas:bundle:prepare
  git diff --check

  if (Get-Command docker -ErrorAction SilentlyContinue) {
    try {
      docker version | Out-Null
    }
    catch {
      Write-Warning "Docker is installed but the daemon is not reachable; skipping NAS Docker image build."
      $dockerUnavailable = $true
    }

    if (-not $dockerUnavailable) {
      npm run nas:bundle:docker-build
    }
  }
  else {
    Write-Warning "Docker is not installed or not on PATH; skipping NAS Docker image build."
  }

  if (Get-Command ggshield -ErrorAction SilentlyContinue) {
    ggshield secret scan path --recursive --yes --use-gitignore .
  }
  else {
    Write-Warning "ggshield is not installed or not on PATH; skipping local secret scan."
  }
}
finally {
  Pop-Location
}
