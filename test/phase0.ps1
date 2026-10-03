[CmdletBinding()]
param([switch]$ResetDatabase)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Api = Join-Path $Root "apps\api"
$Worker = Join-Path $Root "apps\worker"
$Admin = Join-Path $Root "..\admin-frontend"
$Customer = Join-Path $Root "..\customer-portal"
$processes = @()

function Invoke-Step([string]$Name, [scriptblock]$Action) {
  Write-Host "`n=== $Name ===" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE" }
}

function Wait-Healthy {
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    $status = docker compose ps --format json 2>$null | ConvertFrom-Json
    if (@($status).Count -ge 2 -and @($status | Where-Object { $_.Health -eq "healthy" }).Count -ge 2) { return }
    Start-Sleep -Seconds 2
  }
  docker compose ps
  throw "Postgres and Redis did not become healthy."
}

try {
  Set-Location $Root
  Invoke-Step "Start Postgres and Redis" { docker compose up -d postgres redis }
  Wait-Healthy

  if ($ResetDatabase) {
    $env:PHASE0_ALLOW_DESTRUCTIVE_RESET = "1"
    Invoke-Step "Reset database" { Set-Location $Api; npm run db:reset }
  }
  Invoke-Step "Run migrations and seed" { Set-Location $Api; npm run db:seed }

  $apiLog = Join-Path $Root "test\phase0-api.log"
  $apiErrorLog = Join-Path $Root "test\phase0-api.error.log"
  $workerLog = Join-Path $Root "test\phase0-worker.log"
  $workerErrorLog = Join-Path $Root "test\phase0-worker.error.log"
  $processes += Start-Process npm -ArgumentList "run","dev" -WorkingDirectory $Api -RedirectStandardOutput $apiLog -RedirectStandardError $apiErrorLog -PassThru
  $processes += Start-Process npm -ArgumentList "run","dev" -WorkingDirectory $Worker -RedirectStandardOutput $workerLog -RedirectStandardError $workerErrorLog -PassThru

  for ($attempt = 1; $attempt -le 30; $attempt++) {
    try { if ((Invoke-WebRequest "http://localhost:3001/health/ready" -UseBasicParsing).StatusCode -eq 200) { break } } catch { }
    Start-Sleep -Seconds 2
    if ($attempt -eq 30) { throw "API readiness check failed. See phase0-api.log." }
  }

  Invoke-Step "API typecheck and tests" { Set-Location $Api; npm run typecheck; npm run typecheck:test; npm test -- --runInBand; npm run build }
  Invoke-Step "Worker typecheck and build" { Set-Location $Worker; npm run typecheck; npm run build }
  Invoke-Step "Admin frontend tests, lint, and build" { Set-Location $Admin; npm test; npm run lint; npm run build }
  Invoke-Step "Customer frontend tests, lint, and build" { Set-Location $Customer; npm test; npm run lint; npm run build }

  Write-Host "`nPhase 0 passed." -ForegroundColor Green
  Write-Host "Admin: http://localhost:3000/admin/login"
  Write-Host "Customer: http://localhost:3002"
  Write-Host "API: http://localhost:3001/health/ready"
  Write-Host "Seed users: admin@test.com, manager@test.com, agent@test.com, customer@test.com"
} finally {
  foreach ($process in $processes) { if ($process -and !$process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue } }
  Set-Location $Root
  docker compose stop postgres redis 2>$null | Out-Null
}
