# ALLERIA FILMY

Prywatna platforma wideo dla społeczności [Alleria.pl](https://alleria.pl) z uwierzytelnianiem Discord/TeamSpeak 6, zarządzaniem filmami, self-hosted streamingiem HLS z szyfrowaniem AES-128, kategoriami z podkategoriami, oraz kontrolą dostępu opartą na rolach.

![Panel v3.8.0](https://img.shields.io/badge/Panel-v3.8.0-f43f5e) ![Streaming v1.5.0](https://img.shields.io/badge/Streaming-v1.5.0-10b981)

## Funkcjonalności

### Uwierzytelnianie
- **Discord OAuth2** — logowanie przez Discord, sprawdzanie ról, automatyczne przypisywanie uprawnień (member/admin/dev)
- **TeamSpeak 6** — logowanie przez ServerQuery HTTP API (port 10080), dopasowanie po IP klienta, sprawdzanie grup serwera
- **Redirect po logowaniu** — niezalogowany użytkownik wchodzący na `/video/24` zostaje przekierowany na login, a po zalogowaniu wraca na `/video/24`

### Filmy
- **YouTube/Embed** — wklejanie linków YouTube z auto-konwersją na embed i smart thumbnailami
- **Self-hosted streaming** — upload plików wideo (do 6GB), chunked upload (50MB kawałki dla Cloudflare Tunnel), transkodowanie HLS multi-quality (1080p/720p/480p/360p)
- **Szyfrowanie AES-128** — pliki HLS szyfrowane, klucze dostarczane z tokenem sesji
- **Mirrory** — do 2 alternatywnych źródeł z opcją embed/iframe
- **Tagi** — system tagów z autocompletem, chip-based input
- **Progres uploadu** — podwójny progress bar: całość + bieżący chunk
- **Auto-transkodowanie** — backend co 30s sprawdza status, admin widzi % postępu i aktualną jakość

### Ochrona DRM
- Szyfrowanie AES-128 HLS
- Header `Permissions-Policy: display-capture=()`
- Watermark z nazwą użytkownika
- Blokada: devtools, right-click, PrintScreen, PiP, keyboard shortcuts
- Pauza przy utracie focusu okna

### Kategorie & Podkategorie
- Drzewo kategorii z podkategoriami (parent_id) w sidebarze
- Filtrowanie filmów po kategorii
- Kontrola dostępu oparta na rolach Discord (viewer/editor per kategoria)
- Puste role viewerów = kategoria publiczna dla wszystkich członków
- Badge kategorii na kafelkach filmów
- Zarządzanie w Debug Tools (tworzenie, edycja, usuwanie, ustawianie ról)

### Uprawnienia per-film
- **Z kategorii** — dostęp wynika z uprawnień kategorii
- **Niestandardowe** — ręczna lista użytkowników z checkboxami
- Filmy z custom access ukryte przed użytkownikami bez dostępu

### Nawigacja kontekstowa
- Prev/next w ramach kategorii lub wszystkich filmów
- Sidebar podświetla kategorię z której przyszedłeś
- "Wróć do kategorii" / "Wróć do bazy" — zależnie od kontekstu

### Panel Redaktora (Admin)
- **Biblioteka** — tabela filmów z kolumnami: checkbox, ID, tytuł, autor, kategoria, dostęp, data, akcje
- **Bulk actions** — seryjne: zmiana kategorii, autora, uprawnień, usuwanie
- **Użytkownicy** — kolumny: avatar, rola, widz kategorii, redaktor kategorii, metoda auth, ostatnie logowanie, usuwanie konta
- **Logi** — podzielone na subtaby (wyświetlenia / logowania) z paginacją
- **Tagi** — zarządzanie tagami
- **Status transkodowania** — auto-polling co 15s, badge z % i jakością

### Debug Tools (Dev only)
- Konsola SQL — bezpośrednie zapytania na SQLite z wynikami w tabeli
- Zarządzanie kategoriami — tworzenie z parent_id, ustawianie ról Discord
- Tworzenie użytkowników ręcznie
- Import/export bazy JSON
- Czyszczenie logów (osobno wyświetlenia / logowania)
- Czyszczenie bazy danych

### Inne
- **Ulubione** — serduszko na filmie, strona ulubionych
- **Historia** — nieograniczona historia obejrzanych filmów, grupowana po dacie
- **Statystyki** — KPI, najczęściej oglądane, top widzowie, top autorzy, chmura tagów
- **Profil** — edycja display name, bio, podgląd statystyk
- **Dark/light mode** — przełącznik w sidebarze
- **Paginacja** — konfigurowalna ilość filmów na stronę i kolumn (`.env`)
- **Wersjonowanie** — numer wersji panelu i streamingu widoczny w sidebarze
- **Kalendarz** — DateTimePicker z polskim kalendarzem, DD/MM/YYYY, 24h, przycisk "Teraz"

## Architektura

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React 18 + Tailwind + Vite)              │
│  SPA — sidebar layout, responsive                   │
├─────────────────────────────────────────────────────┤
│  Backend (Express.js + SQLite)                      │
│  REST API, session auth, reverse proxy to streaming │
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
- Opcjonalnie: TeamSpeak 6 z włączonym ServerQuery HTTP (port 10080)

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

### Wyświetlanie
| Zmienna | Domyślnie | Opis |
|---------|-----------|------|
| `VIDEOS_PER_PAGE` | 12 | Filmów na stronę (wielokrotność `GRID_COLUMNS`) |
| `GRID_COLUMNS` | 3 | Liczba kolumn siatki filmów |
| `LOGS_PER_PAGE` | 50 | Rekordów logów na stronę w panelu admina |

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
│   ├── server.js          # API, auth, proxy streaming
│   ├── database.js         # SQLite schema + migracje
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.jsx          # Sidebar z kategoriami, wersja
│   │   │   ├── VideoModal.jsx      # Dodawanie/edycja filmów
│   │   │   ├── SecurePlayer.jsx    # HLS player z DRM
│   │   │   └── DateTimePicker.jsx  # Polski kalendarz
│   │   ├── pages/
│   │   │   ├── VideosPage.jsx      # Siatka filmów z paginacją
│   │   │   ├── VideoPage.jsx       # Odtwarzacz z prev/next
│   │   │   ├── AdminPage.jsx       # Panel redaktora
│   │   │   ├── DebugPage.jsx       # Narzędzia deweloperskie
│   │   │   └── ...
│   │   ├── contexts/AuthContext.jsx
│   │   ├── utils/api.js
│   │   └── App.jsx
│   └── package.json
├── streaming/
│   ├── server.js           # FFmpeg transcoding service
│   ├── Dockerfile
│   └── package.json
├── streaming-standalone/    # Do deployu na osobnym serwerze
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── README.md
```

## Baza danych (SQLite)

| Tabela | Opis |
|--------|------|
| `users` | Użytkownicy (Discord/TS/manual), role, discord_roles JSON |
| `videos` | Filmy, źródła, mirrory, category_id, access_mode, stream_status |
| `categories` | Kategorie z parent_id (podkategorie), slug, sort_order |
| `category_access` | Role Discord → kategoria (viewer/editor) |
| `video_access` | Per-video custom access (video_id → user_id) |
| `tags`, `video_tags` | System tagów |
| `favorites` | Ulubione per user |
| `watch_logs` | Historia wyświetleń |
| `login_logs` | Logi logowania |
| `sessions` | Sesje express-session |

## API Endpoints

### Auth
- `GET /auth/discord` — Start Discord OAuth2 (+`?returnTo=` dla redirect)
- `GET /auth/discord/callback` — Discord OAuth2 callback
- `POST /api/auth/teamspeak` — TS6 auth po IP
- `GET /api/auth/me` — Current user
- `POST /api/auth/logout` — Wylogowanie

### Videos
- `GET /api/videos` — Lista filmów (filtry: search, tags, author, category, sort)
- `GET /api/videos/:id` — Pojedynczy film (z access check)
- `POST /api/videos` — Dodaj film
- `PUT /api/videos/:id` — Edytuj film (category_id, access_mode, allowed_users)
- `DELETE /api/videos/:id` — Usuń film
- `POST /api/videos/bulk` — Bulk actions (change_category, change_author, change_access, delete)
- `GET /api/videos/:id/access` — Per-video access list
- `POST /api/videos/:id/access` — Set per-video access

### Categories
- `GET /api/categories` — Lista (filtrowana po rolach użytkownika)
- `POST /api/categories` — Utwórz (dev only, z parent_id)
- `PUT /api/categories/:id` — Edytuj
- `DELETE /api/categories/:id` — Usuń
- `POST /api/categories/:id/access` — Set viewer/editor roles

### Streaming
- `POST /api/stream/upload/init` — Inicjalizuj chunked upload
- `POST /api/stream/upload/chunk` — Upload chunk (50MB)
- `POST /api/stream/upload/complete` — Złóż i transkoduj
- `GET /api/stream/status/:videoId` — Status transkodowania
- `GET /api/stream/check/:dbVideoId` — Check + update DB status
- `GET /api/stream/token/:videoId` — Token odtwarzania
- `GET /stream/media/*` — Proxy HLS (z rewrite key URI)
- `GET /stream/keys/*` — Proxy klucze AES

### Other
- `GET /api/config` — Display settings (videosPerPage, gridColumns)
- `GET /api/version` — App version
- `GET /api/version/streaming` — Streaming version

## Technologie

- **Frontend**: React 18, Tailwind CSS, Vite, hls.js, Lucide icons
- **Backend**: Express.js, better-sqlite3, express-session, multer
- **Streaming**: FFmpeg (Alpine), AES-128 HLS encryption
- **Deploy**: Docker, Docker Compose, Cloudflare Tunnel

## Licencja

Projekt prywatny dla społeczności Alleria.pl.

---

© 2025 Alleria.pl | built by [Matthew](https://github.com/mrfroncu)
