# ALLERIA FILMY

Prywatna platforma wideo dla społeczności [Alleria.pl](https://alleria.pl) z uwierzytelnianiem Discord/TeamSpeak 3/6, zarządzaniem filmami, self-hosted streamingiem HLS z szyfrowaniem AES-128, kategoriami z podkategoriami i własnym systemem rang, kontrolą dostępu opartą na rolach, komentarzami, planowanymi publikacjami z powiadomieniami na Discordzie oraz Watch Party — synchronicznym wspólnym oglądaniem w czasie rzeczywistym.

![Panel v3.22.0](https://img.shields.io/badge/Panel-v3.22.0-f43f5e) ![Streaming v1.9.4](https://img.shields.io/badge/Streaming-v1.9.4-10b981)

> Odznaki wersji są utrzymywane ręcznie — źródło prawdy to `backend/versions.js` / `streaming/versions.js` oraz `GET /api/version`. Przy podbijaniu wersji pamiętaj o aktualizacji też tutaj.

## Spis treści

- [Funkcjonalności](#funkcjonalności)
- [Role i dostęp do stron](#role-i-dostęp-do-stron)
- [Architektura](#architektura)
- [Wymagania](#wymagania)
- [Instalacja](#instalacja)
- [Konfiguracja `.env`](#konfiguracja-env)
- [Ustawienia w aplikacji (Dev Tools → Ustawienia)](#ustawienia-w-aplikacji-dev-tools--ustawienia)
- [Streaming na osobnym serwerze](#streaming-na-osobnym-serwerze)
- [Struktura plików](#struktura-plików)
- [Baza danych (SQLite)](#baza-danych-sqlite)
- [API Endpoints](#api-endpoints)
- [Technologie](#technologie)
- [Licencja](#licencja)

## Funkcjonalności

### Uwierzytelnianie
- **Discord OAuth2** — logowanie przez Discord, sprawdzanie ról, automatyczne przypisywanie uprawnień (member/admin/dev)
- **TeamSpeak 6** — logowanie przez ServerQuery HTTP API (domyślny port 10080), dopasowanie po IP klienta, sprawdzanie grup serwera
- **TeamSpeak 3** — logowanie przez ServerQuery po TCP (domyślny port 10011), ta sama logika dopasowania po IP i grupach co TS6, ale osobna implementacja protokołu
- **Własny nick bota ServerQuery** — kod logowania wysyłany na TS3/TS6 przychodzi od skonfigurowanej nazwy (`TS_BOT_NICKNAME`, domyślnie „ALLERIA VIDEOS PLATFORM”), a nie od „serveradmin”
- **Redirect po logowaniu** — niezalogowany użytkownik wchodzący na `/video/24` zostaje przekierowany na login, a po zalogowaniu wraca na `/video/24`

### Smart wyszukiwanie
- **Cmd/Ctrl+K** — command palette z wyszukiwaniem tytułów, opisów, autorów i tagów filmów, dynamicznie i na żywo
- **Wyszukiwanie stron i funkcji** — Profil, Historia, Ustawienia itd. też są wyszukiwalne; redaktorzy i deweloperzy widzą więcej wyników (dopasowanych do swoich uprawnień)
- **Dopasowanie tagów odporne na interpunkcję** — np. zapytanie „REPO” znajdzie tag „R.E.P.O.”, ale „GTA VI” celowo **nie** dopasuje „GTA V”
- **Górny pasek (tytuł + wyszukiwarka + profil)** można całkowicie wyłączyć w Dev Tools → Ustawienia — wtedy strony wracają do własnych, dużych nagłówków, a profil użytkownika trafia z powrotem do lewego dolnego rogu sidebaru

### Filmy
- **YouTube/Embed** — wklejanie linków YouTube z auto-konwersją na embed i smart thumbnailami
- **Self-hosted streaming** — upload plików wideo (do 6GB), chunked upload (50MB kawałki dla Cloudflare Tunnel), transkodowanie HLS multi-quality (1080p/720p/480p/360p)
- **Szyfrowanie AES-128** — pliki HLS szyfrowane, klucze dostarczane z tokenem sesji
- **Mirrory** — do 5 alternatywnych źródeł z opcją embed/iframe
- **Tagi** — system tagów z autocompletem, chip-based input
- **Planowane publikacje** — film z datą publikacji w przyszłości jest niewidoczny dla zwykłych użytkowników (widzą go tylko redaktorzy/dev w panelu) do momentu jej nadejścia; z chwilą publikacji automatycznie leci webhook Discord, jeśli kategoria ma go skonfigurowanego
- **Progres uploadu** — podwójny progress bar: całość + bieżący chunk
- **Auto-transkodowanie** — backend co 30s sprawdza status, redaktor widzi % postępu i aktualną jakość

### Watch Party *(BETA)*
- **Wspólne oglądanie** — synchronizacja odtwarzania w czasie rzeczywistym przez WebSocket
- **Tworzenie/dołączanie** — 6-znakowy kod zaproszenia lub link; slide-out panel dostępny z każdej strony
- **Kolejka filmów** — dodawanie filmów z biblioteki do wspólnej kolejki z wyborem źródła; host może zarządzać kolejką
- **Synchronizacja** — play/pause/seek rozgłaszane natychmiastowo do wszystkich uczestników; korekcja dryfu co 15s
- **Kontrola per-użytkownik** — host może nadać prawo sterowania odtwarzaczem i kolejką dowolnemu uczestnikowi
- **Host controls** — wyrzucanie uczestników, zakończenie party
- **YouTube IFrame API** — pełna synchronizacja YouTube (seek, play, pause) przez oficjalne IFrame API; detekcja seeków przez polling
- **HLS Player sync** — synchronizacja SecurePlayera przez bezpośrednie wywołania kontrolera (bez cyklu React)
- **Auto-dołączanie** — wejście na `/watch-party?join=KOD` automatycznie dołącza do party
- **Informacje o rozłączeniu** — osobne ekrany dla wyrzucenia i zakończenia party

### Ochrona DRM
- Szyfrowanie AES-128 HLS
- Header `Permissions-Policy: display-capture=()`
- Watermark z nazwą użytkownika
- Blokada: devtools, right-click, PrintScreen, PiP, keyboard shortcuts
- Pauza przy utracie focusu okna

### Komentarze
- Komentarze pod każdym filmem z obsługą wątków (odpowiedzi)
- Edycja własnych komentarzy z historią edycji
- Soft-delete (usunięty komentarz zachowany dla integralności wątku)
- Hard-delete i ciche edycje dla deweloperów (bez śladu)
- Komentarze redaktora wstawiane przez panel Debug Tools

### Rangi aplikacji (App Ranks)
- Własne rangi niezależne od ról Discord — nazwa, kolor, opcjonalny opis
- Rangi **same w sobie nie dają dostępu do niczego** — dopiero kategoria musi jawnie wskazać, które rangi mają dostęp jako widz lub redaktor
- Przypisywanie rang użytkownikom w „Zarządzanie” → Użytkownicy (dev only)
- Zarządzanie rangami (tworzenie/edycja/usuwanie) w „Zarządzanie” → Kategorie

### Kategorie i podkategorie
- Drzewo kategorii z podkategoriami (`parent_id`) w sidebarze, filtrowanie filmów po kategorii, badge kategorii na kafelkach
- Kontrola dostępu **osobno dla widza i redaktora**, niezależnie skonfigurowana jednym z trybów: publiczny / role Discord / rangi aplikacji / ręczna lista użytkowników
- Puste role widzów = kategoria publiczna dla wszystkich zalogowanych
- **Powiadomienia webhook Discord** — każda kategoria może mieć własny webhook URL i szablon wiadomości z placeholderami `{title}`, `{author}`, `{category}`, `{description}`, `{date}`, `{id}`, `{url}`; wysyłane automatycznie, gdy film osiąga swoją datę publikacji; chronione SSRF-guardem (przełącznik „Ograniczenie domen webhooków” w Ustawieniach ogranicza cele do domen Discorda)
- Zarządzanie w „Zarządzanie” (dev only) — tworzenie, edycja, usuwanie, ustawianie dostępu i webhooka

### Uprawnienia per-film
- **Z kategorii** — dostęp wynika z uprawnień kategorii
- **Niestandardowe** — ręczna lista użytkowników z checkboxami
- Filmy z custom access ukryte przed użytkownikami bez dostępu

### Nawigacja kontekstowa
- Prev/next w ramach kategorii lub wszystkich filmów
- Sidebar podświetla kategorię, z której przyszedłeś
- „Wróć do kategorii” / „Wróć do bazy” — zależnie od kontekstu

### Panel Redaktora
- **Biblioteka** — tabela filmów z kolumnami: checkbox, ID, tytuł, autor, kategoria, dostęp, data, akcje
- **Bulk actions** — seryjne: zmiana kategorii, autora, uprawnień, usuwanie
- **Tagi** — zarządzanie tagami
- **Status transkodowania** — auto-polling co 15s, badge z % i jakością
- Zarządzanie kategoriami, użytkownikami i rangami **nie** znajduje się tutaj — patrz sekcja „Zarządzanie” niżej; logi mają też własną, osobną stronę

### Zarządzanie *(dev only)*
- **Kategorie** — drzewo z podkategoriami, osobny tryb dostępu widz/redaktor (publiczny / role Discord / rangi / lista użytkowników), konfiguracja webhooka Discord per kategoria
- **Użytkownicy** — podgląd roli i metody logowania, przypisywanie rang aplikacji, podgląd dostępu widza/redaktora per kategoria

### Logi systemowe *(dev only)*
- Cztery zakładki: **Audit Log** (historia akcji redaktorów/deweloperów), **Watch Party** (utworzenia/zakończenia/dołączenia/akcje odtwarzacza), **Wyświetlenia**, **Logowania**
- Filtrowanie i paginacja (liczba wpisów na stronę konfigurowalna w Ustawieniach)
- Czyszczenie logów osobno dla każdego typu

### Dev Tools *(dev only)*
- **Streaming** — statystyki serwera streamingu, menedżer plików, aktywne transkodowania na żywo
- **Administracyjne** — zarządzanie aktywnymi Watch Party (wymuszone usuwanie), ręczne tworzenie kont użytkowników
- **Kategorie** — narzędzie „Sprawdź uprawnienia”: lista użytkowników z dostępem do wybranej kategorii/filmu wraz z powodem dostępu (rola, ranga, publiczna, custom itd.)
- **Ustawienia** — patrz sekcja niżej
- **Debug** — konsola SQL, statystyki bazy, eksport/import bazy JSON, czyszczenie bazy danych

### Inne
- **Ulubione** — serduszko na filmie, strona ulubionych
- **Historia** — nieograniczona historia obejrzanych filmów, grupowana po dacie
- **Kontynuuj oglądanie** — zapamiętana pozycja odtwarzania per film i użytkownik
- **Statystyki** — KPI, najczęściej oglądane, top widzowie, top autorzy, chmura tagów
- **Profil** — edycja display name, bio, podgląd statystyk; dla kont Discord: wybór źródła avatara (globalny z konta Discord vs. serwerowy — ten drugi wymaga Discord Nitro); sam avatar zmienia się tylko na Discordzie, nie na stronie
- **Wersjonowanie** — numer wersji panelu i playera widoczny w sidebarze (`Panel: vX.X.X | Player: vX.X.X`), ze statusem kompatybilności streamera
- **Kalendarz** — DateTimePicker z polskim kalendarzem, DD/MM/YYYY, 24h, przycisk „Teraz”

## Role i dostęp do stron

| Strona | Trasa | Wymagana rola |
|--------|-------|----------------|
| Baza filmów, film, ulubione, historia, autor, tag, Watch Party, profil | `/`, `/video/:id`, `/favorites`, `/history`, `/author/:id`, `/tag/:id`, `/watch-party`, `/profile` | zalogowany (member+) |
| Panel Redaktora | `/admin` | admin, dev |
| Statystyki | `/stats` | admin, dev |
| Zarządzanie | `/manage` | dev |
| Logi systemowe | `/logs` | dev |
| Dev Tools | `/debug` | dev |

Role przypisywane są automatycznie na podstawie ról Discord (`DISCORD_MEMBER_ROLE_ID` / `DISCORD_ADMIN_ROLE_ID` / `DISCORD_DEV_ROLE_ID`) lub grup TeamSpeak (`TS_MEMBER_GROUP_ID` / `TS_ADMIN_GROUP_ID`), niezależnie od rang aplikacji (App Ranks), które służą wyłącznie do dostępu per kategoria.

## Architektura

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React 18 + Tailwind + Vite)              │
│  SPA — sidebar layout, responsive                   │
├─────────────────────────────────────────────────────┤
│  Backend (Express.js + SQLite)                      │
│  REST API, session auth, WebSocket Watch Party,     │
│  reverse proxy to streaming                         │
├─────────────────────────────────────────────────────┤
│  Streaming Service (Express + FFmpeg)               │
│  Chunked upload, HLS transcoding, AES-128 encryption│
│  Może być na osobnym serwerze (Tailscale/VPN)       │
└─────────────────────────────────────────────────────┘
```

## Wymagania

- Docker + Docker Compose
- Discord Application (OAuth2 + Bot Token)
- Domena z HTTPS (Cloudflare Tunnel / nginx / traefik)
- Opcjonalnie: TeamSpeak 3 lub 6 z włączonym ServerQuery (TCP 10011 dla TS3, HTTP 10080 dla TS6)

## Instalacja

### 1. Klonowanie

```bash
git clone https://github.com/mrfroncu/alleria-filmy.git
cd alleria-filmy
```

### 2. Konfiguracja

```bash
cp .env.example .env
nano .env
```

Wypełnij co najmniej:
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`
- `DISCORD_REDIRECT_URI` — musi zgadzać się z Discord Developer Portal
- `DISCORD_GUILD_ID`, `DISCORD_MEMBER_ROLE_ID`, `DISCORD_ADMIN_ROLE_ID`, `DISCORD_DEV_ROLE_ID`
- `SESSION_SECRET` — losowy string
- `STREAM_SECRET` — losowy string (musi zgadzać się między app a streaming)

Ustawienia wyświetlania (filmy/strona, kolumny siatki, logi/strona, osadzanie w iframe) **nie** są już w `.env` — konfiguruje się je w aplikacji, patrz [Ustawienia w aplikacji](#ustawienia-w-aplikacji-dev-tools--ustawienia).

### 3. Uruchomienie

```bash
docker compose up -d --build
```

Aplikacja domyślnie na porcie `3000`.

### 4. Discord OAuth2

W [Discord Developer Portal](https://discord.com/developers/applications):

1. Utwórz aplikację → OAuth2
2. Dodaj Redirect URI: `https://twoja-domena.com/auth/discord/callback`
3. Bot → włącz Server Members Intent
4. Dodaj bota na serwer z uprawnieniami do odczytu członków

### 5. Cloudflare Tunnel (reverse proxy)

```bash
cloudflared tunnel --url http://localhost:3000
```

Lub konfiguracja permanentna w `~/.cloudflared/config.yml`.

## Konfiguracja `.env`

### Discord
| Zmienna | Opis |
|---------|------|
| `DISCORD_CLIENT_ID` | ID aplikacji Discord |
| `DISCORD_CLIENT_SECRET` | Secret aplikacji |
| `DISCORD_REDIRECT_URI` | URL callback (z `/auth/discord/callback`) |
| `DISCORD_BOT_TOKEN` | Token bota Discord |
| `DISCORD_GUILD_ID` | ID serwera Discord |
| `DISCORD_MEMBER_ROLE_ID` | ID roli dającej dostęp do platformy |
| `DISCORD_ADMIN_ROLE_ID` | ID roli admina/redaktora |
| `DISCORD_DEV_ROLE_ID` | ID roli developera |

### TeamSpeak 6 (opcjonalnie)
| Zmienna | Opis |
|---------|------|
| `TS_SERVER_HOST` / `TS6_HOST` | IP serwera TS |
| `TS_API_PORT` / `TS6_QUERY_PORT` | Port ServerQuery HTTP (domyślnie: 10080) |
| `TS6_USERNAME` | Użytkownik query (domyślnie: serveradmin) |
| `TS6_PASSWORD` | Hasło do ServerQuery |
| `TS_API_KEY` / `TS6_API_KEY` | Klucz API |
| `TS_SERVER_ID` | ID wirtualnego serwera (domyślnie: 1) |
| `TS_MEMBER_GROUP_ID` | ID grupy dającej dostęp |
| `TS_ADMIN_GROUP_ID` | ID grupy admina |
| `TS_BOT_NICKNAME` | Nazwa, pod jaką bot ServerQuery wysyła wiadomości z kodem logowania (domyślnie: „ALLERIA VIDEOS PLATFORM”) |

### TeamSpeak 3 (opcjonalnie)
| Zmienna | Opis |
|---------|------|
| `TS3_HOST` | IP serwera TS3 |
| `TS3_PORT` | Port ServerQuery TCP (domyślnie: 10011) |
| `TS3_USERNAME` | Użytkownik query (domyślnie: serveradmin) |
| `TS3_PASSWORD` | Hasło do ServerQuery |
| `TS3_SERVER_ID` | ID wirtualnego serwera (domyślnie: 1) |
| `TS3_MEMBER_GROUP_ID` | ID grupy dającej dostęp |
| `TS3_ADMIN_GROUP_ID` | ID grupy admina |
| `TS_BOT_NICKNAME` | Wspólna z TS6 — jedna nazwa bota dla obu protokołów |

### App Settings
| Zmienna | Opis |
|---------|------|
| `SESSION_SECRET` | Losowy sekret do podpisywania sesji |
| `PORT` | Port, na którym nasłuchuje backend (domyślnie: 3000) |
| `NODE_ENV` | `production` / `development` |
| `IFRAME_ALLOWED_ORIGINS` | Lista domen (po przecinku) mogących osadzać odtwarzacz w iframe — używana tylko, gdy przełącznik „Osadzanie w iframe” w Ustawieniach jest włączony |

### Streaming
| Zmienna | Opis |
|---------|------|
| `STREAM_SECRET` | Shared secret między app a streaming service |
| `STREAM_URL` | URL streaming service (domyślnie: `http://streaming:4000`) |
| `STREAM_PUBLIC_URL` | Publiczny URL streamingu |
| `ALLOWED_ORIGIN` | Domena dla CORS |

### Streaming Storage (ustawiane w kontenerze streaming)
| Zmienna | Domyślnie | Opis |
|---------|-----------|------|
| `STREAM_DATA_DIR` | `/data` | Root katalog danych |
| `STREAM_MEDIA_DIR` | `{DATA_DIR}/media` | Transkodowane pliki HLS |
| `STREAM_KEYS_DIR` | `{DATA_DIR}/keys` | Klucze szyfrowania AES |
| `STREAM_UPLOAD_DIR` | `{DATA_DIR}/uploads` | Tymczasowe uploady |

## Ustawienia w aplikacji (Dev Tools → Ustawienia)

Poniższe ustawienia **nie** są w `.env` — są zapisane w bazie (tabela `app_settings`) i edytowalne w aplikacji bez restartu kontenera:

| Ustawienie | Domyślnie | Opis |
|------------|-----------|------|
| Filmów na stronę | 12 | Liczba filmów na stronę w bazie filmów (warto, by była wielokrotnością kolumn siatki) |
| Kolumny siatki | 3 | Liczba kolumn siatki filmów na desktopie |
| Logów na stronę | 50 | Liczba wpisów na stronę w Logach systemowych |
| Limity treści | 50 / 1000 / 3000 znaków | Maksymalna długość nazwy wyświetlanej / bio / komentarza |
| Ograniczenie domen webhooków | włączone | Blokuje webhooki kategorii wskazujące poza domeny Discorda (ochrona przed SSRF) |
| Wysyłka kodu logowania (TS3) | wiadomość | Jak bot dostarcza kod logowania: wiadomość prywatna / poke / oba |
| Osadzanie w iframe | wyłączone | Zezwala na osadzanie odtwarzacza na domenach z `IFRAME_ALLOWED_ORIGINS` |
| Górny pasek | włączony | Pokazuje/ukrywa górny pasek (tytuł + smart search + profil); wyłączenie przywraca klasyczny układ z tytułem strony i profilem w sidebarze |

Zakładka Ustawienia pokazuje też ostrzeżenie, jeśli w `.env` znajdują się **zmienne przeniesione do bazy** (np. stare `VIDEOS_PER_PAGE`) albo **nazwy przypominające literówkę** znanej zmiennej (np. `DISCORD_GULID_ID` zamiast `DISCORD_GUILD_ID`) — bezpieczne do sprawdzenia bez ujawniania wartości.

## Streaming na osobnym serwerze

Aby przenieść transkodowanie i storage na inny serwer (np. przez Tailscale):

1. Skopiuj folder `streaming-standalone/` na drugi serwer
2. Skopiuj `streaming/server.js` i `streaming/package.json` do tego folderu
3. Skonfiguruj `.env` na serwerze streaming
4. Na głównym serwerze ustaw: `STREAM_URL=http://<tailscale-ip>:4000`

Szczegóły: [streaming-standalone/README.md](streaming-standalone/README.md)

## Struktura plików

```
alleria-filmy/
├── backend/
│   ├── server.js           # API, auth, proxy streaming, Watch Party REST
│   ├── watchParty.js       # WebSocket Watch Party — in-memory parties, sync
│   ├── database.js         # SQLite schema + migracje
│   ├── versions.js         # Wersja panelu i minimum streamingu
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.jsx          # Sidebar, opcjonalny górny pasek, wersja
│   │   │   ├── GlobalSearch.jsx    # Command palette (Cmd/Ctrl+K)
│   │   │   ├── ProfileMenu.jsx     # Dropdown profilu w górnym pasku
│   │   │   ├── WatchPartyTab.jsx   # Floating tab + slide-out panel Watch Party
│   │   │   ├── VideoModal.jsx      # Dodawanie/edycja filmów
│   │   │   ├── SecurePlayer.jsx    # HLS player z DRM + controlRef dla Watch Party
│   │   │   └── DateTimePicker.jsx  # Polski kalendarz
│   │   ├── pages/
│   │   │   ├── VideosPage.jsx      # Siatka filmów z paginacją
│   │   │   ├── VideoPage.jsx       # Odtwarzacz z prev/next, komentarze
│   │   │   ├── WatchPartyPage.jsx  # Dedykowana strona Watch Party
│   │   │   ├── AdminPage.jsx       # Panel Redaktora (biblioteka, tagi)
│   │   │   ├── ManagePage.jsx      # Zarządzanie (kategorie, użytkownicy, rangi) — dev only
│   │   │   ├── LogsPage.jsx        # Logi systemowe — dev only
│   │   │   ├── DebugPage.jsx       # Dev Tools — narzędzia + Ustawienia + audit logi
│   │   │   ├── StatsPage.jsx       # Statystyki
│   │   │   ├── ProfilePage.jsx     # Profil, źródło avatara Discord
│   │   │   └── ...
│   │   ├── contexts/
│   │   │   ├── AuthContext.jsx
│   │   │   ├── SettingsContext.jsx    # Ustawienia z /api/config (paginacja, górny pasek...)
│   │   │   └── WatchPartyContext.jsx  # WebSocket + stan party + syncCallbackRef
│   │   ├── utils/
│   │   │   ├── api.js
│   │   │   ├── helpers.js
│   │   │   └── roleColors.js
│   │   └── App.jsx
│   └── package.json
├── streaming/
│   ├── server.js           # FFmpeg transcoding service
│   ├── versions.js         # Wersja streaming service
│   ├── Dockerfile
│   └── package.json
├── streaming-standalone/    # Do deployu na osobnym serwerze
├── .github/workflows/
│   ├── deploy.yml           # Auto-deploy na push do main
│   └── deploy-watch-party.yml  # Ręczny deploy brancha watch-party
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── README.md
```

## Baza danych (SQLite)

| Tabela | Opis |
|--------|------|
| `users` | Użytkownicy (Discord/TS/manual), role, `discord_roles` JSON, hashe avatara Discord (globalny + serwerowy), `avatar_source` |
| `videos` | Filmy, źródła, mirrory (do 5), `category_id`, `access_mode`, `stream_status`, `publish_date`, `webhook_sent` |
| `categories` | Kategorie z `parent_id` (podkategorie), slug, sort_order, webhook Discord (URL + szablon) |
| `category_access` | Role Discord → kategoria (viewer/editor) |
| `category_rank_access` | Rangi aplikacji → kategoria (viewer/editor) |
| `category_user_access` | Ręczna lista użytkowników → kategoria (viewer/editor) |
| `app_ranks` | Rangi aplikacji (nazwa, kolor, opis), niezależne od ról Discord |
| `user_rank_assignments` | Przypisania rang do użytkowników |
| `video_access` | Per-video custom access (`video_id` → `user_id`) |
| `tags`, `video_tags` | System tagów |
| `favorites` | Ulubione per user |
| `comments` | Komentarze z wątkami (`parent_id`), historia edycji, soft-delete |
| `watch_logs` | Historia wyświetleń |
| `login_logs` | Logi logowania |
| `watch_party_logs` | Historia zdarzeń Watch Party |
| `watch_progress` | Zapisana pozycja odtwarzania per użytkownik i film (kontynuuj oglądanie) |
| `audit_logs` | Audit trail akcji redaktorów i deweloperów |
| `app_settings` | Ustawienia runtime edytowalne w Dev Tools → Ustawienia (klucz/wartość) |
| `sessions` | Sesje express-session |

## API Endpoints

### Auth
- `GET /auth/discord` — Start Discord OAuth2 (+`?returnTo=` dla redirect)
- `GET /auth/discord/callback` — Discord OAuth2 callback
- `POST /api/auth/teamspeak` / `POST /api/auth/teamspeak3` — logowanie po IP (TS6 / TS3)
- `GET /api/auth/me` — Current user
- `POST /api/auth/logout` — Wylogowanie

### Videos
- `GET /api/videos` — Lista filmów (filtry: search, tags, author, category, sort; szuka też w tagach)
- `GET /api/videos/:id` — Pojedynczy film (z access check)
- `POST /api/videos` — Dodaj film
- `PUT /api/videos/:id` — Edytuj film (category_id, access_mode, allowed_users)
- `DELETE /api/videos/:id` — Usuń film
- `POST /api/videos/bulk` — Bulk actions (change_category, change_author, change_access, delete)
- `GET /api/videos/:id/access` / `POST /api/videos/:id/access` — Per-video access list

### Categories & Ranks
- `GET /api/categories` — Lista (filtrowana po rolach/rangach użytkownika)
- `POST /api/categories` / `PUT /api/categories/:id` / `DELETE /api/categories/:id` — CRUD (dev only)
- `POST /api/categories/:id/access` — Ustaw dostęp widz/redaktor (role, rangi, użytkownicy)
- `GET /api/ranks` / `POST /api/ranks` / `PUT /api/ranks/:id` / `DELETE /api/ranks/:id` — CRUD rang aplikacji
- `GET /api/users/:id/ranks` / `POST /api/users/:id/ranks` — Rangi przypisane użytkownikowi

### Komentarze
- `GET /api/videos/:id/comments` — Komentarze do filmu
- `POST /api/videos/:id/comments` — Dodaj komentarz (z opcjonalnym `parent_id`)
- `PUT /api/comments/:id` — Edytuj komentarz (własny lub dev z `silent=true`)
- `DELETE /api/comments/:id` — Soft-delete komentarza
- `DELETE /api/comments/:id/hard` — Hard-delete (dev only)
- `POST /api/comments/admin` — Wstaw komentarz jako redaktor (dev only)

### Watch Party
- `GET /api/watch-party/token` — Jednorazowy token do autoryzacji WebSocket
- `POST /api/watch-party` — Utwórz party
- `GET /api/watch-party/:code` — Pobierz dane party (walidacja przed dołączeniem)
- `DELETE /api/watch-party/:code` — Zakończ party (host only)
- `WS /ws/watch-party` — WebSocket: auth → play/pause/seek/source_change/queue_add/queue_play/queue_remove/set_control/kick/sync_request

### Streaming
- `POST /api/stream/upload/init` — Inicjalizuj chunked upload
- `POST /api/stream/upload/chunk` — Upload chunk (50MB)
- `POST /api/stream/upload/complete` — Złóż i transkoduj
- `GET /api/stream/status/:videoId` — Status transkodowania
- `GET /api/stream/check/:dbVideoId` — Check + update DB status
- `GET /api/stream/token/:videoId` — Token odtwarzania
- `GET /stream/media/*` — Proxy HLS (z rewrite key URI)
- `GET /stream/keys/*` — Proxy klucze AES

### Postęp oglądania i profil
- `GET /api/progress` / `GET /api/progress/:videoId` — Pobierz zapisaną pozycję
- `PUT /api/progress/:videoId` — Zapisz pozycję
- `DELETE /api/progress` / `DELETE /api/progress/:videoId` — Wyczyść postęp
- `GET /api/profile` / `PUT /api/profile` — Profil (display_name, bio, `avatar_source`)

### Ustawienia i debug (dev only, o ile nie zaznaczono inaczej)
- `GET /api/config` — Ustawienia widoczne dla każdego zalogowanego (paginacja, limity, `showTopBar`)
- `GET /api/debug/settings` / `POST /api/debug/settings` — Odczyt/zapis ustawień runtime
- `GET /api/debug/env-check` — Wykrywanie przestarzałych/literówkowych zmiennych `.env`
- `GET /api/debug/access/:type/:id` — Sprawdzenie uprawnień do kategorii/filmu z powodem
- `GET /api/debug/export` / `POST /api/debug/import` — Eksport/import bazy JSON
- `POST /api/debug/sql` — Konsola SQL
- `GET /api/audit-logs` / `DELETE /api/audit-logs/clear` — Audit trail
- `GET /api/logs/watch` / `GET /api/logs/login` / `GET /api/logs/watch-party` — Logi (admin/dev)
- `DELETE /api/logs/watch/clear` / `DELETE /api/logs/login/clear` / `DELETE /api/logs/watch-party/clear` — Czyszczenie logów
- `GET /api/version` / `GET /api/version/streaming` — Wersje panelu i streamingu

## Technologie

- **Frontend**: React 18, Tailwind CSS 3, Vite 6, hls.js, YouTube IFrame API, Lucide icons, React Router 7
- **Backend**: Express.js, better-sqlite3, express-session, multer, ws (WebSocket)
- **Streaming**: FFmpeg (Alpine), AES-128 HLS encryption
- **Deploy**: Docker, Docker Compose, Cloudflare Tunnel, GitHub Actions

## Licencja

Projekt prywatny dla społeczności Alleria.pl.

---

© 2025–2026 Alleria.pl | built by [Matthew](https://github.com/mrfroncu)
