#!/usr/bin/env bash
# Uruchamia testy API (macOS / Linux). Preferuje lokalny Node.js 20+;
# Docker uzywany tylko awaryjnie, gdy Node nie jest zainstalowany.
# Uzycie:
#   ./tests/run-tests.sh                     # wszystkie testy
#   ./tests/run-tests.sh api/videos.test.js  # jeden plik
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"

if command -v node >/dev/null 2>&1; then
  (cd "$REPO/backend" && npm install --no-audit --no-fund --loglevel=error)
  cd "$REPO/tests"
  npm install --no-audit --no-fund --loglevel=error
  exec node --test "$@"
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "Node.js nie znaleziony - fallback: uruchamiam testy w kontenerze Docker..."
  exec docker run --rm -v "$REPO:/work" -w /work node:20 bash -c "cd backend && npm install --no-audit --no-fund --loglevel=error && cd ../tests && npm install --no-audit --no-fund --loglevel=error && node --test $*"
fi

echo "Nie znaleziono Node.js ani Dockera. Zainstaluj Node.js 20+: https://nodejs.org" >&2
exit 1
