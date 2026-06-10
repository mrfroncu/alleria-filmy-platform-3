@echo off
rem Uruchamia testy API. Preferuje lokalny Node.js 20+; Docker uzywany tylko
rem awaryjnie, gdy Node nie jest zainstalowany.
rem Uzycie:
rem   .\tests\run-tests.cmd                     - wszystkie testy
rem   .\tests\run-tests.cmd api/videos.test.js  - jeden plik
setlocal

for %%i in ("%~dp0..") do set "REPO=%%~fi"

where node >nul 2>&1
if not errorlevel 1 goto native

docker info >nul 2>&1
if errorlevel 1 (
    echo Nie znaleziono Node.js ani dzialajacego Dockera.
    echo Zainstaluj Node.js 20+ ^(https://nodejs.org^) - to preferowany sposob.
    exit /b 1
)
echo Node.js nie znaleziony - fallback: uruchamiam testy w kontenerze Docker...
docker run --rm -v "%REPO%:/work" -w /work node:20 bash -c "cd backend && npm install --no-audit --no-fund --loglevel=error && cd ../tests && npm install --no-audit --no-fund --loglevel=error && node --test %~1"
exit /b %errorlevel%

:native
cd /d "%REPO%\backend"
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 exit /b 1
cd /d "%REPO%\tests"
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 exit /b 1
node --test %~1
exit /b %errorlevel%
