// Środowisko testowe — importowane jako PIERWSZY moduł w helpers/testApp.js,
// dzięki czemu wykonuje się zanim zostanie załadowany backend/server.js.
// dotenv w server.js NIE nadpisuje już ustawionych zmiennych, więc wartości
// poniżej mają pierwszeństwo przed ewentualnym plikiem .env.
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';

// Wymuszenie HTTP — inaczej (przy produkcyjnym .env z https) cookie sesji
// dostałoby flagę "secure" i supertest by go nie odsyłał.
process.env.DISCORD_REDIRECT_URI = 'http://localhost:3000/api/auth/discord/callback';

// Świeża, odizolowana baza SQLite dla każdego pliku testowego (node --test odpala
// każdy plik w osobnym procesie). Baza ląduje w katalogu tymczasowym systemu —
// nigdy nie dotyka backend/data/alleria.db.
const tmpDir = path.join(os.tmpdir(), 'alleria-tests');
fs.mkdirSync(tmpDir, { recursive: true });
process.env.DB_PATH = path.join(tmpDir, `alleria-${process.pid}-${randomUUID()}.db`);
