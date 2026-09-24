// Magazyn sesji na better-sqlite3 (backend/lib/sessionStore.js) — zamiennik connect-sqlite3,
// zgodny z jego formatem pliku, żeby wdrożenie nikogo nie wylogowało.
import { describe, it, after } from 'node:test';
import { expect } from 'expect';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('../../backend/node_modules/better-sqlite3');
const { SqliteSessionStore } = require('../../backend/lib/sessionStore');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alleria-sess-'));
const stores = [];
function openStore(name = 'sessions.db') {
  const s = new SqliteSessionStore({ file: path.join(dir, name) });
  stores.push(s);
  return s;
}
const call = (store, method, ...args) => new Promise((resolve, reject) =>
  store[method](...args, (err, val) => (err ? reject(err) : resolve(val))));

after(() => {
  for (const s of stores) s.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('SqliteSessionStore', () => {
  it('zapisuje, odczytuje i usuwa sesję', async () => {
    const store = openStore();
    const sess = { cookie: { maxAge: 60_000 }, user: { id: 7 } };
    await call(store, 'set', 'sid-1', sess);
    expect(await call(store, 'get', 'sid-1')).toEqual(sess);
    expect(await call(store, 'length')).toBe(1);
    await call(store, 'destroy', 'sid-1');
    expect(await call(store, 'get', 'sid-1')).toBe(null);
  });

  it('wygasła sesja nie jest zwracana', async () => {
    const store = openStore();
    store.db.prepare('INSERT INTO sessions (sid, expired, sess) VALUES (?, ?, ?)')
      .run('old', Date.now() - 1000, JSON.stringify({ cookie: {}, user: { id: 1 } }));
    expect(await call(store, 'get', 'old')).toBe(null);
    expect(store.rows().find(r => r.sid === 'old')).toBeUndefined();
  });

  it('touch przedłuża ważność', async () => {
    const store = openStore();
    await call(store, 'set', 'sid-t', { cookie: { maxAge: 1000 } });
    const later = new Date(Date.now() + 3_600_000).toISOString();
    await call(store, 'touch', 'sid-t', { cookie: { expires: later } });
    const row = store.db.prepare('SELECT expired FROM sessions WHERE sid = ?').get('sid-t');
    expect(row.expired).toBe(new Date(later).getTime());
  });

  it('rows() zwraca sid + sesję (lista urządzeń / unieważnianie po scaleniu kont)', async () => {
    const store = openStore();
    await call(store, 'set', 'a', { cookie: { maxAge: 60_000 }, user: { id: 42 } });
    await call(store, 'set', 'b', { cookie: { maxAge: 60_000 }, user: { id: 43 } });
    const mine = store.rows().filter(r => r.sess.user?.id === 42).map(r => r.sid);
    expect(mine).toEqual(['a']);
  });

  it('czyta plik utworzony przez connect-sqlite3 (sesje przetrwają wdrożenie)', async () => {
    const file = path.join(dir, 'legacy.db');
    const legacy = new Database(file);
    legacy.exec('CREATE TABLE IF NOT EXISTS sessions (sid PRIMARY KEY, expired, sess)');
    legacy.prepare('INSERT OR REPLACE INTO sessions VALUES (?, ?, ?)')
      .run('legacy-sid', Date.now() + 60_000, JSON.stringify({ cookie: { maxAge: 60_000 }, user: { id: 5 } }));
    legacy.close();

    const store = openStore('legacy.db');
    expect((await call(store, 'get', 'legacy-sid')).user.id).toBe(5);
  });
});
