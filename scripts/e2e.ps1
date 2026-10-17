# Runs the end-to-end UI test: real backend (mock AI, throw-away data) + real frontend + Chrome.
#   .\scripts\e2e.ps1          mock AI: fast, free, deterministic
#   .\scripts\e2e.ps1 -Live    real Claude (uses the key in backend/.env, costs a few cents)
# Needs: Node + pnpm, Python venv with the backend requirements, Google Chrome or Edge.
param([switch]$Live)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

function Find-Python {
    foreach ($p in @("$backend\.venv\Scripts\python.exe", "$root\.venv\Scripts\python.exe")) { if (Test-Path $p) { return $p } }
    throw "No Python virtual environment found. Create one: cd backend; python -m venv .venv; .\.venv\Scripts\python.exe -m pip install -r requirements.txt"
}
function Test-Port($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
function Wait-Http($url, $seconds) {
    $end = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $end) {
        try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 | Out-Null; return } catch { Start-Sleep -Milliseconds 400 }
    }
    throw "Timed out waiting for $url"
}
foreach ($port in 8000, 8443) { if (Test-Port $port) { throw "Port $port is already in use. Stop the running server first." } }

$python = Find-Python
$work = Join-Path $env:TEMP ("kita-e2e-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $work | Out-Null
Copy-Item (Join-Path $backend "data\kita-sonnenblume") (Join-Path $work "data") -Recurse   # the test edits documents: use a copy

# Environment variables override backend/.env, so this never calls Claude and never touches your real data.
$env:MOCK_AI = if ($Live) { "false" } else { "true" }
$env:DATA_DIR = Join-Path $work "data"
$env:DB_PATH = Join-Path $work "kita.db"
$env:DEMO_TODAY = "2026-11-09"
$env:SHOTS = Join-Path $work "screenshots"

$procs = @()
try {
    Write-Host ("Starting backend (" + $(if ($Live) { "REAL Claude" } else { "mock AI" }) + ") ...")
    $procs += Start-Process -FilePath $python -ArgumentList "-m", "uvicorn", "app.main:app", "--port", "8000", "--log-level", "warning" `
        -WorkingDirectory $backend -WindowStyle Hidden -PassThru -RedirectStandardOutput "$work\backend.log" -RedirectStandardError "$work\backend.err.log"
    Write-Host "Starting frontend ..."
    $procs += Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "pnpm exec vite" `
        -WorkingDirectory $frontend -WindowStyle Hidden -PassThru -RedirectStandardOutput "$work\frontend.log" -RedirectStandardError "$work\frontend.err.log"
    Wait-Http "http://127.0.0.1:8000/api/v1/health" 60
    Wait-Http "http://127.0.0.1:8443/" 60
    Write-Host "Both servers are up. Running the UI test ...`n"

    Push-Location $frontend
    try { if ($Live) { & pnpm e2e:live } else { & pnpm e2e }; $code = $LASTEXITCODE } finally { Pop-Location }
}
finally {
    foreach ($p in $procs) { if ($p -and -not $p.HasExited) { & taskkill /T /F /PID $p.Id | Out-Null } }
    Write-Host "`nScreenshots and logs: $work"
}
exit $code
