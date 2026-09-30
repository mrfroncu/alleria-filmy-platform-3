// Eksport / import całej bazy (Dev Tools → Debug oraz przywracanie w kreatorze konfiguracji).
import { describe, it, before as beforeAll } from 'node:test';
import { expect } from 'expect';
import { seedUsers, loginAs, createVideo, db } from '../helpers/testApp.js';

let dev, member;

// discord_id pozwala importowi przepiąć sesję deva na jego konto w zaimportowanych danych
const devLogin = () => loginAs('dev', { discord_id: 'discord-103' });

async function exportDb() {
  const res = await dev.get('/api/debug/export');
  expect(res.status).toBe(200);
  return JSON.parse(res.text);
}

const importDb = (agent, body) => agent.post('/api/debug/import').set('Content-Type', 'application/json').send(body);

beforeAll(async () => {
  seedUsers();
  dev = await devLogin();
  member = await loginAs('member');
});

describe('Eksport bazy', () => {
  it('zawiera _meta i wszystkie tabele oprócz sesji i historii migracji', async () => {
    await createVideo(dev, { title: 'Film do eksportu' });
    const data = await exportDb();
    expect(data._meta.format).toBe('alleria-filmy-export');
    expect(data._meta.schema_version).toBeGreaterThan(0);
    expect(data.videos.some(v => v.title === 'Film do eksportu')).toBe(true);
    expect(data.schema_migrations).toBeUndefined();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('sessions','schema_migrations')").all().map(t => t.name);
    for (const t of tables) expect(Array.isArray(data[t])).toBe(true);
  });

  it('member nie może eksportować ani importować', async () => {
    expect((await member.get('/api/debug/export')).status).toBe(403);
    expect((await importDb(member, { users: [], app_settings: [] })).status).toBe(403);
  });
});

describe('Import bazy', () => {
  it('odtwarza dane 1:1 po eksporcie', async () => {
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('import_probe', 'przed')").run();
    const data = await exportDb();
    db.prepare("UPDATE app_settings SET value = 'po' WHERE key = 'import_probe'").run();
    db.prepare("DELETE FROM videos").run();

    const res = await importDb(dev, data);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.relogin).toBe(false);
    expect(res.body.rows).toBeGreaterThan(0);
    expect(db.prepare("SELECT value FROM app_settings WHERE key = 'import_probe'").get().value).toBe('przed');
    expect(db.prepare("SELECT COUNT(*) AS c FROM videos WHERE title = 'Film do eksportu'").get().c).toBe(1);
    // sesja deva dalej działa
    expect((await dev.get('/api/debug/db-stats')).status).toBe(200);
  });

  it('pomija nieznane tabele i kolumny zamiast przerywać import', async () => {
    const data = await exportDb();
    data.tabela_z_przyszlosci = [{ id: 1 }];
    data.users = data.users.map(u => ({ ...u, kolumna_z_przyszlosci: 'x' }));
    const res = await importDb(dev, data);
    expect(res.status).toBe(200);
    expect(res.body.skippedTables).toContain('tabela_z_przyszlosci');
    expect(res.body.skippedColumns.users).toEqual(['kolumna_z_przyszlosci']);
    expect(db.prepare('SELECT COUNT(*) AS c FROM users').get().c).toBe(data.users.length);
  });

  it('przyjmuje eksport większy niż globalny limit 2 MB', async () => {
    const data = await exportDb();
    const filler = 'x'.repeat(1000);
    data.app_settings = [...data.app_settings, ...Array.from({ length: 3000 }, (_, i) => ({ key: `filler_${i}`, value: filler }))];
    const res = await importDb(dev, JSON.stringify(data));
    expect(res.status).toBe(200);
    expect(db.prepare("SELECT COUNT(*) AS c FROM app_settings WHERE key LIKE 'filler_%'").get().c).toBe(3000);
  });

  it('odrzuca plik, który nie jest eksportem, i nie rusza bazy', async () => {
    const before = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    expect((await importDb(dev, { foo: [] })).status).toBe(400);
    expect((await importDb(dev, [1, 2, 3])).status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS c FROM users').get().c).toBe(before);
  });

  it('błąd w trakcie importu wycofuje całą transakcję', async () => {
    const data = await exportDb();
    const before = db.prepare('SELECT COUNT(*) AS c FROM videos').get().c;
    data.users = [{ id: 1, username: null }]; // username NOT NULL
    const res = await importDb(dev, data);
    expect(res.status).toBe(500);
    expect(db.prepare('SELECT COUNT(*) AS c FROM videos').get().c).toBe(before);
  });

  it('extras podaje pliki spoza eksportu (uploads, gdpr)', async () => {
    const res = await dev.get('/api/debug/export/extras');
    expect(res.status).toBe(200);
    expect(res.body.uploads).toEqual({ files: expect.any(Number), bytes: expect.any(Number) });
    expect(res.body.gdpr).toHaveProperty('withFile');
    expect((await member.get('/api/debug/export/extras')).status).toBe(403);
  });
});

describe('Import bazy w częściach', () => {
  const sendChunk = (agent, id, index, buf) => agent.post(`/api/debug/import/chunk?upload_id=${id}&index=${index}`)
    .set('Content-Type', 'application/octet-stream').send(buf);

  async function uploadParts(buf, parts) {
    const size = Math.ceil(buf.length / parts);
    const init = await dev.post('/api/debug/import/init').send({ filesize: buf.length, total_chunks: parts });
    expect(init.status).toBe(200);
    for (let i = 0; i < parts; i++) {
      const r = await sendChunk(dev, init.body.upload_id, i, buf.subarray(i * size, (i + 1) * size));
      expect(r.status).toBe(200);
    }
    return init.body.upload_id;
  }

  it('składa części i importuje jak zwykły import', async () => {
    const data = await exportDb();
    data.app_settings = [...data.app_settings.filter(s => s.key !== 'chunk_probe'), { key: 'chunk_probe', value: 'ok' }];
    const id = await uploadParts(Buffer.from(JSON.stringify(data)), 3);
    const res = await dev.post('/api/debug/import/complete').send({ upload_id: id });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(db.prepare("SELECT value FROM app_settings WHERE key = 'chunk_probe'").get().value).toBe('ok');
    // upload jest sprzątany po complete
    expect((await dev.post('/api/debug/import/complete').send({ upload_id: id })).status).toBe(404);
  });

  it('brakująca część → 400, baza bez zmian', async () => {
    const buf = Buffer.from(JSON.stringify(await exportDb()));
    const init = await dev.post('/api/debug/import/init').send({ filesize: buf.length, total_chunks: 2 });
    await sendChunk(dev, init.body.upload_id, 0, buf.subarray(0, 10));
    const before = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const res = await dev.post('/api/debug/import/complete').send({ upload_id: init.body.upload_id });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Brak części 2\/2/);
    expect(db.prepare('SELECT COUNT(*) AS c FROM users').get().c).toBe(before);
  });

  it('uszkodzony JSON → 400', async () => {
    const id = await uploadParts(Buffer.from('{"users": [ nie json'), 2);
    const res = await dev.post('/api/debug/import/complete').send({ upload_id: id });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/JSON/);
  });

  it('waliduje init i numer części', async () => {
    expect((await dev.post('/api/debug/import/init').send({ filesize: 0, total_chunks: 1 })).status).toBe(400);
    expect((await dev.post('/api/debug/import/init').send({ filesize: 600 * 1024 * 1024, total_chunks: 12 })).status).toBe(400);
    expect((await dev.post('/api/debug/import/init').send({ filesize: 200 * 1024 * 1024, total_chunks: 1 })).status).toBe(400);
    const init = await dev.post('/api/debug/import/init').send({ filesize: 100, total_chunks: 2 });
    expect((await sendChunk(dev, init.body.upload_id, 2, Buffer.from('x'))).status).toBe(400);
    expect((await sendChunk(dev, '../../etc', 0, Buffer.from('x'))).status).toBe(404);
  });

  it('inny dev nie może dosyłać części do cudzego uploadu', async () => {
    const other = await loginAs('dev', { id: 999, discord_id: 'discord-999' });
    const init = await dev.post('/api/debug/import/init').send({ filesize: 100, total_chunks: 1 });
    expect((await sendChunk(other, init.body.upload_id, 0, Buffer.from('x'))).status).toBe(404);
    expect((await other.post('/api/debug/import/complete').send({ upload_id: init.body.upload_id })).status).toBe(404);
  });

  it('member nie ma dostępu', async () => {
    expect((await member.post('/api/debug/import/init').send({ filesize: 100, total_chunks: 1 })).status).toBe(403);
  });
});

describe('Import bazy — sesje', () => {
  it('dev spoza zaimportowanych danych musi zalogować się ponownie', async () => {
    const data = await exportDb();
    data.users = data.users.filter(u => u.discord_id !== 'discord-103');
    const res = await importDb(dev, data);
    expect(res.status).toBe(200);
    expect(res.body.relogin).toBe(true);
    expect((await dev.get('/api/debug/db-stats')).status).toBe(401);
  });
});
