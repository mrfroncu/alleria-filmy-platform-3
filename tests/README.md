# Testy API — ALLERIA FILMY

Automatyczne testy regresji backendu (REST API). Symulują zalogowanych użytkowników
o rolach **member**, **redaktor** i **dev** bez przechodzenia przez Discord OAuth
i sprawdzają, że uprawnienia oraz funkcjonalności działają tak, jak powinny.

Po każdej większej zmianie w backendzie odpal testy — jeśli wszystko świeci się na
zielono, stare funkcjonalności nie zostały zepsute.

**Stan: 181 testów w 10 plikach, pełny przebieg ~1 sekunda.**

Testy używają wbudowanego runnera Node.js (`node --test`) + `supertest` —
**nie wymagają Dockera** i działają na Windows, macOS i Linux.

---

## Wymagania

- **Node.js 20 lub nowszy** (na Windows: `winget install OpenJS.NodeJS.LTS`,
  na macOS: `brew install node` albo instalator z https://nodejs.org)
- Docker jest potrzebny **tylko** jako awaryjny fallback, gdy Node nie jest
  zainstalowany — skrypty same go wtedy użyją.

---

## Jak uruchomić testy

### Windows

```powershell
.\tests\run-tests.cmd                      # wszystkie testy
.\tests\run-tests.cmd api/videos.test.js   # jeden plik
```

(prefiks `.\` jest wymagany w PowerShellu; w klasycznym cmd.exe wystarczy
`tests\run-tests.cmd`. Jest też `run-tests.ps1`, ale domyślna polityka Windows
blokuje skrypty .ps1 — wtedy: `powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1`)

### macOS / Linux

```bash
./tests/run-tests.sh                       # wszystkie testy
./tests/run-tests.sh api/videos.test.js    # jeden plik
```

(przy pierwszym użyciu może być potrzebne `chmod +x tests/run-tests.sh`)

### Ręcznie (dowolny system z Node 20+)

```bash
cd backend && npm install     # zależności backendu (raz)
cd ../tests && npm install    # zależności testów (raz)
npm test                      # pełny przebieg
npm run test:watch            # tryb watch — testy odpalają się same po zapisaniu pliku
node --test api/videos.test.js   # pojedynczy plik
```

---

## Jak to działa

### Symulacja logowania (bez Discord OAuth)

Prawdziwe logowanie idzie przez Discord OAuth + weryfikację ról przez bota —
testy to **całkowicie omijają**. Helper `tests/helpers/testApp.js` dorejestrowuje
do aplikacji Express testową trasę `POST /__test/login`, która ustawia
`req.session.user` dokładnie tak, jak robi to prawdziwy callback OAuth.

Trasa istnieje **wyłącznie w procesie testowym** — jest rejestrowana z kodu testów,
więc w produkcyjnym serwerze nie ma jej wcale.

Mapowanie ról (nazwa w testach → rola w backendzie):

| Klucz w testach | Rola w bazie | Kto to jest             |
|-----------------|--------------|-------------------------|
| `member`        | `member`     | zwykły użytkownik       |
| `redaktor`      | `admin`      | redaktor (dodaje filmy) |
| `dev`           | `dev`        | deweloper (pełny dostęp)|

### Izolacja danych

- `node --test` odpala każdy plik testowy w **osobnym procesie**, a każdy proces
  dostaje **świeżą bazę SQLite** w katalogu tymczasowym systemu (`DB_PATH`
  ustawiany w `setup-env.js`). Deweloperska/produkcyjna baza
  `backend/data/alleria.db` **nigdy nie jest dotykana**.
- Sesje trzymane są w pamięci (bez `sessions.db`).
- Rate limity są wyłączone w trybie testowym (`NODE_ENV=test`), żeby testy
  same się nie blokowały.

### Struktura

```
tests/
├── package.json            # zależności: supertest + expect (asercje w stylu jest/vitest)
├── setup-env.js            # env testowe (NODE_ENV, DB_PATH, SESSION_SECRET) — ładowane przed backendem
├── run-tests.cmd           # Windows (cmd/PowerShell)
├── run-tests.ps1           # Windows (PowerShell, wymaga -ExecutionPolicy Bypass)
├── run-tests.sh            # macOS / Linux
├── helpers/
│   └── testApp.js          # import aplikacji, logowanie testowe, agenci ról, createVideo()
└── api/
    ├── access.test.js      # macierz uprawnień: każdy endpoint × każda rola
    ├── auth.test.js        # sesja, /api/auth/me, logout, ochrona CSRF
    ├── videos.test.js      # CRUD filmów, tagi, filmy zaplanowane, wyszukiwanie, historia
    ├── categories.test.js  # kategorie + tryby dostępu (public/roles/custom)
    ├── comments.test.js    # komentarze: dodawanie, limity, edycja, soft/hard delete
    ├── profile.test.js     # profil, display_name/bio, konfigurowalne limity długości
    ├── favorites-progress.test.js  # ulubione + postęp oglądania
    ├── watch-party.test.js # tworzenie/usuwanie party, panel admina
    ├── users-ranks.test.js # zarządzanie użytkownikami i rangami
    └── debug-tools.test.js # narzędzia deva: SQL, ustawienia, create-user, audit log
```

---

## Jak napisać nowy test

Utwórz plik `tests/api/nazwa.test.js`:

```js
import { describe, it, before as beforeAll } from 'node:test';
import { expect } from 'expect';
import { seedUsers, loginAs, anon, createVideo } from '../helpers/testApp.js';

let member, redaktor, dev;

beforeAll(async () => {
  seedUsers();                      // wstawia konta testowe do bazy
  member = await loginAs('member'); // agent z sesją membera
  redaktor = await loginAs('redaktor');
  dev = await loginAs('dev');
});

it('member nie może usuwać filmów', async () => {
  const res = await member.del('/api/videos/1');
  expect(res.status).toBe(403);
});
```

Zasady i ułatwienia:

- Asercje to pakiet `expect` (ten sam API co w jest/vitest): `toBe`, `toEqual`,
  `toContain`, `toBeDefined` itd.
- Agent ma metody `get / post / put / del` — te zmieniające stan **automatycznie**
  dodają nagłówek `X-Requested-With: XMLHttpRequest` (wymagany przez ochronę CSRF
  backendu). `agent.raw` to czysty agent supertest bez tego nagłówka.
- `anon()` zwraca agenta niezalogowanego.
- `createVideo(redaktor, { title: '...', category_id: 5 })` tworzy film przez API
  i zwraca jego `id`.
- Każdy plik testowy ma własną, pustą bazę — dane z innych plików nie przeszkadzają,
  ale wewnątrz pliku testy współdzielą bazę (twórz unikalne nazwy/tytuły).
- **Pułapka:** świeżo utworzona kategoria ma `access_mode = 'roles'`, więc member
  bez ról Discord jej nie widzi. Żeby była publiczna, ustaw dostęp:
  `dev.post('/api/categories/<id>/access').send({ viewer_mode: 'public', editor_mode: 'none' })`.
- Jeśli dodasz nowy endpoint do backendu, **dopisz go do macierzy w `access.test.js`** —
  to najtańsza ochrona przed przypadkowym wystawieniem endpointu bez autoryzacji.

---

## Czego te testy NIE pokrywają

- prawdziwego logowania Discord OAuth i TeamSpeak (celowo pominięte),
- endpointów proxy do serwera streamingu (`/api/stream/*` — wymagają działającego
  serwisu streaming; testowane są tylko ich uprawnienia),
- frontendu (React) i WebSocketów watch party w czasie rzeczywistym —
  to wymaga testów E2E (Playwright), planowanych jako osobny etap,
- wysyłki webhooków na Discorda (testy używają kategorii bez `webhook_url`).

---

## Zmiany w backendzie zrobione pod testy

Minimalne i bezpieczne dla produkcji (aktywują się tylko przy `NODE_ENV=test`
albo nie zmieniają zachowania wcale):

1. `backend/database.js` — ścieżkę bazy można nadpisać zmienną `DB_PATH`.
2. `backend/server.js` — rate limity i SQLite-owy store sesji wyłączone w trybie
   testowym; `app` i `db` są eksportowane, a `listen()` odpala się tylko przy
   bezpośrednim uruchomieniu (`node server.js`).
3. `backend/watchParty.js` — timery oznaczone `unref()`, żeby proces testów mógł
   się zakończyć (bez wpływu na działanie serwera).
4. `backend/package.json` — `better-sqlite3` podbity do `~12.4.1` i przypięty do
   linii 12.4.x. Powód: v11 nie ma prekompilowanych binarek dla Node 24 (świeże
   instalacje na Windows/macOS wymagałyby kompilatora C++), a 12.5+ porzuca
   Node 20 używany w produkcyjnym Dockerze. Linia 12.4.x ma gotowe binarki dla
   wszystkich potrzebnych platform (sprawdzone: Windows/macOS/Linux/Alpine).

## Deploy

Folder `tests/` **nie jest deployowany**:

- `.github/workflows/deploy.yml` — rsync ma `--exclude='tests'`
  (oraz `--exclude='node_modules'`),
- `.dockerignore` — `tests` i `**/node_modules` nie trafiają do obrazu Dockera.
