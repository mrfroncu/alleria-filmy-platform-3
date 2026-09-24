// Numerowane migracje bazy (backend/migrations/) i ich podgląd w panelu (Zarządzanie → Ustawienia).
import { describe, it, before as beforeAll } from 'node:test';
import { expect } from 'expect';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { seedUsers, loginAs, db } from '../helpers/testApp.js';

const require = createRequire(import.meta.url);
const Database = require('../../backend/node_modules/better-sqlite3');
const { MIGRATIONS, LATEST_VERSION, runMigrations } = require('../../backend/migrations');

let member, redaktor, dev;

beforeAll(async () => {
  seedUsers();
  member = await loginAs('member');
  redaktor = await loginAs('redaktor');
  dev = await loginAs('dev');
});

describe('Migracje przy starcie', () => {
  it('świeża baza ma zastosowane wszystkie migracje po kolei', () => {
    const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(r => r.version);
    expect(rows).toEqual(MIGRATIONS.map(m => m.version));
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_VERSION);
  });

  it('ponowne uruchomienie niczego nie powtarza', () => {
    runMigrations(db, { isTest: true });
    const count = db.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get().c;
    expect(count).toBe(LATEST_VERSION);
  });

  it('istniejąca baza sprzed migracji: kopia zapasowa + baseline jako no-op, dane nietknięte', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alleria-mig-'));
    const file = path.join(dir, `legacy-${randomUUID()}.db`);
    const legacy = new Database(file);
    // Stan "sprzed" = schemat bazowy bez tabeli schema_migrations
    MIGRATIONS[0].up(legacy);
    legacy.prepare("INSERT INTO users (id, username) VALUES (1, 'stary-uzytkownik')").run();

    runMigrations(legacy, { dbPath: file, isTest: false });

    expect(legacy.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get().c).toBe(LATEST_VERSION);
    expect(legacy.prepare('SELECT username FROM users WHERE id = 1').get().username).toBe('stary-uzytkownik');
    const backups = fs.readdirSync(path.join(dir, 'backups'));
    expect(backups.length).toBe(1);
    expect(backups[0]).toMatch(/^alleria-before-v001-.*\.db$/);
    legacy.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('Podgląd migracji w panelu', () => {
  it('dev widzi wersję schematu i historię migracji', async () => {
    const res = await dev.get('/api/debug/migrations');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.currentVersion).toBe(LATEST_VERSION);
    expect(res.body.latestVersion).toBe(LATEST_VERSION);
    expect(res.body.pending).toEqual([]);
    expect(res.body.applied[0]).toMatchObject({ version: 1, name: 'baseline', known: true });
    expect(res.body.database.indexes).toBeGreaterThan(0);
  });

  it('member i redaktor nie mają dostępu (403)', async () => {
    expect((await member.get('/api/debug/migrations')).status).toBe(403);
    expect((await redaktor.get('/api/debug/migrations')).status).toBe(403);
    expect((await redaktor.post('/api/debug/migrations/backup')).status).toBe(403);
  });

  it('eksport bazy pomija historię migracji', async () => {
    const res = await dev.get('/api/debug/export');
    expect(res.status).toBe(200);
    const data = JSON.parse(res.text);
    expect(data).not.toHaveProperty('schema_migrations');
    expect(data).toHaveProperty('users');
  });
});
