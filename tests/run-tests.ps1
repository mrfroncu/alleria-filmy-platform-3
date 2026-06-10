# Uruchamia testy API. Preferuje lokalny Node.js 20+; Docker uzywany tylko
# awaryjnie, gdy Node nie jest zainstalowany.
# Uwaga: domyslna polityka Windows blokuje .ps1 - uzyj run-tests.cmd albo
#   powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1
param([string]$Filter = "")

$repo = Split-Path -Parent $PSScriptRoot

if (Get-Command node -ErrorAction SilentlyContinue) {
    Push-Location "$repo\backend"
    npm install --no-audit --no-fund --loglevel=error
    Pop-Location
    Push-Location "$repo\tests"
    npm install --no-audit --no-fund --loglevel=error
    if ($Filter) { node --test $Filter } else { node --test }
    $code = $LASTEXITCODE
    Pop-Location
    exit $code
}

docker info *>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Nie znaleziono Node.js ani dzialajacego Dockera." -ForegroundColor Red
    Write-Host "Zainstaluj Node.js 20+ (https://nodejs.org) - to preferowany sposob."
    exit 1
}
Write-Host "Node.js nie znaleziony - fallback: uruchamiam testy w kontenerze Docker..."
docker run --rm -v "${repo}:/work" -w /work node:20 bash -c "cd backend && npm install --no-audit --no-fund --loglevel=error && cd ../tests && npm install --no-audit --no-fund --loglevel=error && node --test $Filter"
exit $LASTEXITCODE
