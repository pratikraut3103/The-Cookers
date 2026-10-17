# Starts the backend (port 8000) and the frontend (port 8443) in two windows. Open http://localhost:8443
#   .\scripts\dev.ps1          real Claude (needs ANTHROPIC_API_KEY in backend/.env; check it with backend\scripts\check_claude.py)
#   .\scripts\dev.ps1 -Mock    fixed example answers, no key and no cost
param([switch]$Mock)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

$python = @("$backend\.venv\Scripts\python.exe", "$root\.venv\Scripts\python.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $python) { throw "No Python virtual environment. Run: cd backend; python -m venv .venv; .\.venv\Scripts\python.exe -m pip install -r requirements.txt" }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw "pnpm not found. Install Node.js (https://nodejs.org), then: npm install -g pnpm" }
if (-not (Test-Path "$frontend\node_modules")) { Write-Host "Installing frontend packages ..."; Push-Location $frontend; try { pnpm install } finally { Pop-Location } }
if (-not (Test-Path "$backend\.env") -and -not $Mock) { Write-Host "Note: backend\.env is missing. Copy backend\.env.example to backend\.env, or use -Mock." -ForegroundColor Yellow }

$mockLine = if ($Mock) { "`$env:MOCK_AI = 'true'; " } else { "" }   # single quotes: double quotes get lost in the child command line
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle = 'Kita backend :8000'; Set-Location '$backend'; $mockLine& '$python' -m uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle = 'Kita frontend :8443'; Set-Location '$frontend'; pnpm dev"

Write-Host "`nBackend:  http://localhost:8000/docs"
Write-Host "Frontend: http://localhost:8443   <- open this"
Write-Host ("AI: " + $(if ($Mock) { "mock (fixed example answers)" } else { "real Claude" }))
Write-Host "Staff login code: SONNE.  Close the two windows to stop."
