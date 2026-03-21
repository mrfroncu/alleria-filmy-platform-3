# ALLERIA FILMY

Prywatna platforma wideo dla społeczności Alleria. Umożliwia członkom oglądanie filmów osadzonych z YouTube i innych źródeł, z kontrolą dostępu przez Discord i TeamSpeak.

## Funkcje

- **Logowanie przez Discord** — bot sprawdza role użytkownika na serwerze
- **Logowanie przez TeamSpeak 6** — weryfikacja IP użytkownika i roli na serwerze TS
- **Baza filmów** — przeglądanie, wyszukiwanie, filtrowanie po tagach i autorach
- **Odtwarzacz wideo** — embed YouTube + dodatkowe mirrory (iframe/HTML)
- **Panel Redaktora** — dodawanie/edycja/usuwanie filmów, zarządzanie tagami, logi
- **Debug Tools** — eksport/import bazy danych (tylko dla roli DEV)
- **Dark/Light mode** — przełączanie motywu
- **Docker** — pełna konteneryzacja

## Role

| Rola | Opis | Konfiguracja |
|------|-------|-------------|
| `member` | Przeglądanie filmów | `DISCORD_MEMBER_ROLE_ID` |
| `admin` | Member + Panel Redaktora | `DISCORD_ADMIN_ROLE_ID` |
| `dev` | Admin + Debug Tools | `DISCORD_DEV_ROLE_ID` |

## Szybki start

### 1. Konfiguracja Discord

1. Utwórz aplikację na [Discord Developer Portal](https://discord.com/developers/applications)
2. Dodaj redirect URI: `http://twoj-serwer:3000/api/auth/discord/callback`
3. Utwórz bota i dodaj go na serwer z uprawnieniami do odczytu członków
4. Skopiuj Client ID, Client Secret, Bot Token

### 2. Konfiguracja

```bash
cp .env.example .env
# Uzupełnij .env swoimi danymi
```

### 3. Uruchomienie z Docker

```bash
docker-compose up -d --build
```

Aplikacja dostępna pod `http://localhost:3000`

### 4. Uruchomienie bez Docker (development)

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (nowy terminal)
cd frontend
npm install
npm run dev
```

## Struktura projektu

```
alleria-filmy/
├── backend/
│   ├── server.js          # Express API + auth + routes
│   ├── database.js        # SQLite initialization
│   ├── package.json
│   └── data/              # SQLite DB + uploaded thumbnails
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Router + protected routes
│   │   ├── components/
│   │   │   ├── Layout.jsx      # Sidebar + header + footer
│   │   │   └── VideoModal.jsx  # Add/Edit video popup
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx  # Auth state management
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx    # Discord/TS login
│   │   │   ├── VideosPage.jsx   # Video grid + search + filters
│   │   │   ├── VideoPage.jsx    # Single video player
│   │   │   ├── AdminPage.jsx    # Editor panel
│   │   │   └── DebugPage.jsx    # Dev tools
│   │   └── utils/
│   │       ├── api.js           # API client
│   │       └── helpers.js       # Date formatting, YouTube utils
│   ├── index.html
│   ├── tailwind.config.js
│   └── vite.config.js
├── .env.example
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## API Endpoints

### Auth
- `GET /api/auth/discord` — Rozpocznij logowanie Discord
- `GET /api/auth/discord/callback` — Callback OAuth2
- `POST /api/auth/teamspeak` — Logowanie TeamSpeak (po IP)
- `GET /api/auth/me` — Obecny użytkownik
- `POST /api/auth/logout` — Wylogowanie

### Videos (wymagane: member)
- `GET /api/videos` — Lista filmów (query: search, tags, author, sort)
- `GET /api/videos/:id` — Szczegóły filmu + log obejrzenia

### Videos (wymagane: admin)
- `POST /api/videos` — Dodaj film (multipart/form-data)
- `PUT /api/videos/:id` — Edytuj film
- `DELETE /api/videos/:id` — Usuń film

### Tags
- `GET /api/tags` — Lista tagów
- `DELETE /api/tags/:id` — Usuń tag (admin)

### Admin
- `GET /api/users` — Lista użytkowników
- `GET /api/logs/watch` — Logi obejrzeń
- `GET /api/logs/login` — Logi logowań

### Debug (wymagane: dev)
- `GET /api/debug/export` — Eksport bazy JSON
- `POST /api/debug/import` — Import bazy JSON
- `POST /api/debug/clear` — Wyczyść bazę

## Format daty

Wszystkie daty wyświetlane w formacie **DD/MM/YYYY HH:mm** (24h).

## Licencja

© 2025 Alleria.pl | built by [Matthew](https://github.com/mrfroncu)
