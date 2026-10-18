// Regresje z audytu bezpieczeństwa 2026-10: WebSockety, upload obrazków, webhooki kategorii,
// ścieżki streamingu i odświeżanie sesji (usunięte konto / zmiana roli / rola na Discordzie).
import { describe, it, before as beforeAll, after as afterAll } from 'node:test';
import { expect } from 'expect';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { seedUsers, loginAs, createVideo, db } from '../helpers/testApp.js';

const require = createRequire(import.meta.url);
const WebSocket = require('../../backend/node_modules/ws');
const { httpServer } = require('../../backend/server.js'); // ta sama instancja co w testApp.js
const { uploadsDir } = require('../../backend/lib/config');
const { setSetting } = require('../../backend/lib/settings');
const { loginRole } = require('../../backend/lib/accounts');
const { refreshSessionUser, DISCORD_RECHECK_MS } = require('../../backend/lib/sessionUser');

// Najmniejszy poprawny PNG (1x1)
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4f50000000049454e44ae426082', 'hex');

let member, redaktor, dev;
let port;

beforeAll(async () => {
  seedUsers();
  member = await loginAs('member');
  redaktor = await loginAs('redaktor');
  dev = await loginAs('dev');
  await new Promise(r => httpServer.listen(0, '127.0.0.1', r));
  port = httpServer.address().port;
});

afterAll(() => new Promise(r => httpServer.close(r)));

// Łączy się z WebSocketem, wysyła wiadomości po kolei i zwraca wszystko, co przyszło w ciągu `ms`.
function wsSession(path, messages, ms = 300) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    const received = [];
    ws.on('message', (m) => received.push(JSON.parse(m)));
    ws.on('error', reject);
    ws.on('open', () => {
      for (const m of messages) ws.send(typeof m === 'string' ? m : JSON.stringify(m));
      setTimeout(() => { ws.close(); resolve(received); }, ms);
    });
  });
}

describe('WebSockety nie wywracają serwera', () => {
  it('niezalogowany klient wysyłający null / liczbę / tablicę', async () => {
    for (const path of ['/ws/notifications', '/ws/watch-party']) {
      await wsSession(path, ['null', '42', '[]', '"x"']);
    }
    // proces żyje i dalej obsługuje żądania
    expect((await member.get('/api/auth/me')).status).toBe(200);
  });

  it('host party wysyłający nieprawidłową pozycję / źródło / kod', async () => {
    const { code } = (await member.post('/api/watch-party')).body;
    const { token } = (await member.get('/api/watch-party/token')).body;
    const received = await wsSession('/ws/watch-party', [
      { type: 'auth', token, code },
      { type: 'play', position: 'x' },
      { type: 'pause', position: null },
      { type: 'seek', position: { a: 1 } },
      { type: 'seek', position: -5 },
      { type: 'source_change', sourceKey: { evil: true } },
      { type: 'sync_request' },
    ]);
    const sync = received.find(m => m.type === 'sync');
    expect(sync).toBeTruthy();
    expect(sync.position).toBe(0); // żadna z błędnych pozycji nie została przyjęta
    const { token: t2 } = (await member.get('/api/watch-party/token')).body;
    await wsSession('/ws/watch-party', [{ type: 'auth', token: t2, code: 12345 }]);
    expect((await member.get('/api/auth/me')).status).toBe(200);
  });
});

describe('Upload obrazków', () => {
  it('HTML przebrany za PNG zostaje odrzucony i nie zostaje na dysku', async () => {
    setSetting('allow_custom_avatars', '1');
    const before = fs.readdirSync(uploadsDir).length;
    const res = await member.post('/api/profile/avatar')
      .attach('avatar_file', Buffer.from('<script>alert(document.domain)</script>'), { filename: 'x.html', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(fs.readdirSync(uploadsDir).length).toBe(before);
  });

  it('prawdziwy obrazek dostaje rozszerzenie z zawartości, nie z nazwy', async () => {
    setSetting('allow_custom_avatars', '1');
    const res = await member.post('/api/profile/avatar')
      .attach('avatar_file', PNG, { filename: 'avatar.html', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.avatar).toMatch(/^\/api\/uploads\/[0-9a-f-]+\.png$/);
    const served = await member.get(res.body.avatar);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['content-security-policy']).toContain('sandbox');
  });

  it('pliki z uploads są serwowane w piaskownicy (także stare .html)', async () => {
    fs.writeFileSync(`${uploadsDir}/legacy-test.html`, '<script>alert(1)</script>');
    const res = await member.get('/api/uploads/legacy-test.html');
    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    fs.rmSync(`${uploadsDir}/legacy-test.html`);
  });

  it('wyłączone awatary: 403 zanim plik trafi na dysk', async () => {
    setSetting('allow_custom_avatars', '0');
    const before = fs.readdirSync(uploadsDir).length;
    const res = await member.post('/api/profile/avatar')
      .attach('avatar_file', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
    expect(fs.readdirSync(uploadsDir).length).toBe(before);
  });

  it('miniatura filmu: plik niebędący obrazkiem → 400', async () => {
    const res = await redaktor.post('/api/videos')
      .field('title', 'x').field('author_id', '102').field('main_source', 'https://youtu.be/dQw4w9WgXcQ')
      .field('publish_date', '2020-01-01 12:00:00')
      .attach('thumbnail_file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), { filename: 't.svg', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });
});

describe('Webhooki kategorii', () => {
  it('member nie widzi webhook_url, dev widzi', async () => {
    db.prepare(`INSERT INTO categories (name, slug, access_mode, webhook_url, webhook_template, webhook_enabled)
      VALUES ('Webhookowa', 'webhookowa', 'public:none', 'https://discord.com/api/webhooks/1/SEKRET', 'x', 1)`).run();
    const asMember = (await member.get('/api/categories')).body.find(c => c.slug === 'webhookowa');
    expect(asMember).toBeTruthy();
    expect(asMember.webhook_url).toBeUndefined();
    expect(asMember.webhook_template).toBeUndefined();
    const asDev = (await dev.get('/api/categories')).body.find(c => c.slug === 'webhookowa');
    expect(asDev.webhook_url).toBe('https://discord.com/api/webhooks/1/SEKRET');
  });
});

describe('Ścieżki streamingu', () => {
  it('isSafeStreamPath przepuszcza tylko zwykłe nazwy plików', () => {
    const { isSafeStreamPath } = require('../../backend/lib/stream');
    for (const ok of ['aaaa-mine/master.m3u8', 'id/1080p/index.m3u8', 'id/source/seg_0001.ts', 'id/enc.key', 'id/preview.json']) {
      expect({ ok, safe: isSafeStreamPath(ok) }).toEqual({ ok, safe: true });
    }
    for (const bad of ['a/../b/master.m3u8', '../x', 'a/./b', 'a//b', 'a/.hidden', 'a/b?t=1', 'a\\..\\b', '', 'a/b%2Fc']) {
      expect({ bad, safe: isSafeStreamPath(bad) }).toEqual({ bad, safe: false });
    }
  });

  it('..%2F i inne nietypowe segmenty → 400, bez sięgania do serwera streamingu', async () => {
    const mine = await createVideo(redaktor, { title: 'moj stream', stream_video_id: 'aaaa-mine' });
    db.prepare("UPDATE videos SET stream_status = 'ready' WHERE id = ?").run(mine);
    for (const p of [
      '/stream/media/aaaa-mine/..%2Fbbbb-secret%2Fmaster.m3u8',
      '/stream/media/aaaa-mine//master.m3u8',
      '/stream/media/aaaa-mine/master.m3u8%3Ft%3D1',
      '/stream/keys/aaaa-mine/..%2Fbbbb-secret%2Fenc.key',
    ]) {
      const res = await member.raw.get(p);
      expect({ p, status: res.status }).toEqual({ p, status: 400 });
    }
  });
});

describe('Odświeżanie sesji', () => {
  it('usunięte konto traci dostęp od razu', async () => {
    db.prepare("INSERT INTO users (id, discord_id, username, display_name, role) VALUES (300, 'd300', 'byly-admin', 'Były admin', 'admin')").run();
    const ex = await loginAs('redaktor', { id: 300, username: 'byly-admin' });
    expect((await ex.get('/api/users')).status).toBe(200);
    await dev.del('/api/users/300').expect(200);
    expect((await ex.get('/api/users')).status).toBe(401);
  });

  it('zmiana roli w bazie działa od następnego żądania', async () => {
    db.prepare("INSERT INTO users (id, discord_id, username, display_name, role) VALUES (301, 'd301', 'degradowany', 'Degradowany', 'admin')").run();
    const u = await loginAs('redaktor', { id: 301, username: 'degradowany' });
    expect((await u.get('/api/users')).status).toBe(200);
    db.prepare("UPDATE users SET role = 'member' WHERE id = 301").run();
    expect((await u.get('/api/users')).status).toBe(403);
    expect((await u.get('/api/auth/me')).body.role).toBe('member');
  });

  it('loginRole: jedyna metoda logowania decyduje w obie strony, połączone konto nie traci roli', () => {
    expect(loginRole({ role: 'admin', discord_id: '1' }, 'discord', 'member')).toBe('member');
    expect(loginRole({ role: 'dev', ts3_uid: 'x' }, 'teamspeak3', 'member')).toBe('member');
    expect(loginRole({ role: 'admin', discord_id: '1', ts3_uid: 'x' }, 'discord', 'member')).toBe('admin');
    expect(loginRole({ role: 'admin', ts3_uid: 'x' }, 'discord', 'member')).toBe('admin'); // dopasowanie po e-mailu
  });
});

describe('Okresowe sprawdzanie ról na Discordzie', () => {
  let fake;
  const guildRoles = new Map();
  const envKeys = ['DISCORD_API_URL', 'DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID', 'DISCORD_MEMBER_ROLE_ID', 'DISCORD_ADMIN_ROLE_ID'];

  beforeAll(async () => {
    fake = http.createServer((req, res) => {
      const id = req.url.split('/').pop();
      if (!guildRoles.has(id)) { res.statusCode = 404; return res.end('{}'); }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ roles: guildRoles.get(id) }));
    });
    await new Promise(r => fake.listen(0, '127.0.0.1', r));
    Object.assign(process.env, {
      DISCORD_API_URL: `http://127.0.0.1:${fake.address().port}/api`, DISCORD_BOT_TOKEN: 'test-bot',
      DISCORD_GUILD_ID: 'g1', DISCORD_MEMBER_ROLE_ID: 'r-member', DISCORD_ADMIN_ROLE_ID: 'r-admin',
    });
  });

  afterAll(() => {
    for (const k of envKeys) delete process.env[k];
    return new Promise(r => fake.close(r));
  });

  // Przepuszcza "żądanie" przez middleware z sesją, której ostatnie sprawdzenie było dawno temu
  async function runCheck(user, extra = {}) {
    const req = { session: { user: { ...user }, discordCheckedAt: Date.now() - DISCORD_RECHECK_MS - 1000, ...extra } };
    await new Promise(r => refreshSessionUser(req, {}, r));
    return req.session;
  }

  it('konto tylko z Discordem: odebrana rola admina → member', async () => {
    db.prepare("INSERT INTO users (id, discord_id, username, role) VALUES (310, '9310', 'dc-admin', 'admin')").run();
    guildRoles.set('9310', ['r-member']);
    const s = await runCheck({ id: 310, role: 'admin', auth_method: 'discord' });
    expect(s.user.role).toBe('member');
    expect(db.prepare('SELECT role FROM users WHERE id = 310').get().role).toBe('member');
  });

  it('konto tylko z Discordem: wyrzucony z serwera → wylogowany', async () => {
    db.prepare("INSERT INTO users (id, discord_id, username, role) VALUES (311, '9311', 'dc-gone', 'member')").run();
    const s = await runCheck({ id: 311, role: 'member', auth_method: 'discord' });
    expect(s.user).toBeUndefined();
  });

  it('połączone konto (Discord + TS3) nie traci roli', async () => {
    db.prepare("INSERT INTO users (id, discord_id, ts3_uid, username, role) VALUES (312, '9312', 'ts-312', 'linked', 'admin')").run();
    guildRoles.set('9312', ['r-member']);
    const s = await runCheck({ id: 312, role: 'admin', auth_method: 'discord' });
    expect(s.user.role).toBe('admin');
  });

  it('niedawno sprawdzona sesja nie odpytuje Discorda', async () => {
    db.prepare("INSERT INTO users (id, discord_id, username, role) VALUES (313, '9313', 'fresh', 'admin')").run();
    const s = await runCheck({ id: 313, role: 'admin', auth_method: 'discord' }, { discordCheckedAt: Date.now() });
    expect(s.user.role).toBe('admin');
  });
});
