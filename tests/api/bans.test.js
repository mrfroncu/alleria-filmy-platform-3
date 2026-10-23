// Blokada kont z panelu (ban) i rola dev tylko dla kont Discord z DISCORD_DEV_USER_IDS.
import { describe, it, before as beforeAll, after as afterAll } from 'node:test';
import { expect } from 'expect';
import http from 'node:http';
import { createRequire } from 'node:module';
import { seedUsers, loginAs, db } from '../helpers/testApp.js';

const require = createRequire(import.meta.url);
const { discordRoleFromRoles, demoteUnlistedDevs } = require('../../backend/lib/discordRoles');
const { refreshSessionUser, DISCORD_RECHECK_MS } = require('../../backend/lib/sessionUser');
const { signCastToken, requireAuthOrCastToken } = require('../../backend/lib/auth');

let redaktor, dev;

beforeAll(async () => {
  seedUsers();
  redaktor = await loginAs('redaktor');
  dev = await loginAs('dev');
});

const addUser = (id, fields = {}) => db.prepare(`INSERT INTO users (id, username, display_name, role, discord_id, discord_roles, authentik_sub)
  VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, `u${id}`, `User ${id}`, fields.role || 'member', fields.discord_id ?? `d${id}`,
  fields.discord_roles || '[]', fields.authentik_sub || null);

describe('Blokada konta', () => {
  it('zablokowany użytkownik traci dostęp od razu, panel pokazuje kto i kiedy', async () => {
    addUser(400);
    const victim = await loginAs('member', { id: 400, username: 'u400' });
    expect((await victim.get('/api/auth/me')).status).toBe(200);

    await dev.post('/api/users/400/ban').expect(200);
    expect((await victim.get('/api/auth/me')).status).toBe(401);

    const row = (await dev.get('/api/users')).body.find(u => u.id === 400);
    expect(row.banned_at).toBeTruthy();
    expect(row.banned_by_name).toBe('Testowy Dev');
  });

  it('odblokowanie przywraca możliwość logowania', async () => {
    addUser(401);
    await dev.post('/api/users/401/ban').expect(200);
    await dev.del('/api/users/401/ban').expect(200);
    expect(db.prepare('SELECT banned_at FROM users WHERE id = 401').get().banned_at).toBeNull();
    const back = await loginAs('member', { id: 401, username: 'u401' });
    expect((await back.get('/api/auth/me')).status).toBe(200);
  });

  it('tylko dev może blokować; nie da się zablokować siebie ani innego deva', async () => {
    addUser(402);
    addUser(403, { role: 'dev' });
    await redaktor.post('/api/users/402/ban').expect(403);
    await dev.post('/api/users/103/ban').expect(400);
    await dev.post('/api/users/403/ban').expect(403);
    await dev.post('/api/users/99999/ban').expect(404);
    expect(db.prepare('SELECT banned_at FROM users WHERE id IN (402, 403)').all().every(r => !r.banned_at)).toBe(true);
  });

  it('token castowania zablokowanego konta przestaje działać', async () => {
    addUser(404);
    const expires = Date.now() + 60_000;
    const run = () => new Promise((resolve) => {
      const req = { session: {}, params: { 0: 'vid-1/master.m3u8' }, query: { uid: '404', ct: signCastToken('vid-1', '404', expires), cte: String(expires) } };
      const res = { status: (code) => ({ json: () => resolve(code) }) };
      requireAuthOrCastToken(req, res, () => resolve(200));
    });
    expect(await run()).toBe(200);
    db.prepare("UPDATE users SET banned_at = datetime('now') WHERE id = 404").run();
    expect(await run()).toBe(401);
  });
});

describe('Rola dev tylko z DISCORD_DEV_USER_IDS', () => {
  afterAll(() => {
    for (const k of ['DISCORD_DEV_USER_IDS', 'DISCORD_DEV_ROLE_ID', 'DISCORD_MEMBER_ROLE_ID', 'DISCORD_ADMIN_ROLE_ID', 'AUTHENTIK_DEV_GROUPS']) delete process.env[k];
  });

  it('rola Discorda nie daje deva, ID konta tak', () => {
    Object.assign(process.env, { DISCORD_DEV_ROLE_ID: 'r-dev', DISCORD_MEMBER_ROLE_ID: 'r-member', DISCORD_ADMIN_ROLE_ID: 'r-admin', DISCORD_DEV_USER_IDS: '111, 222' });
    expect(discordRoleFromRoles(['r-dev', 'r-member'], '999')).toBe('member');
    expect(discordRoleFromRoles(['r-dev'], '999')).toBeNull();
    expect(discordRoleFromRoles(['r-admin'], '999')).toBe('admin');
    expect(discordRoleFromRoles(['r-member'], '222')).toBe('dev');
    expect(discordRoleFromRoles([], '111')).toBe('dev');
  });

  it('przy starcie dev bez wpisu w DISCORD_DEV_USER_IDS spada do roli z Discorda', () => {
    // discord-103 = testowy dev z seedUsers
    Object.assign(process.env, { DISCORD_MEMBER_ROLE_ID: 'r-member', DISCORD_ADMIN_ROLE_ID: 'r-admin', DISCORD_DEV_USER_IDS: '9410,discord-103' });
    db.prepare("UPDATE users SET role = 'member' WHERE id = 403").run(); // dev z testu blokady
    addUser(410, { role: 'dev', discord_id: '9410' });
    addUser(411, { role: 'dev', discord_id: '9411', discord_roles: '["r-admin"]' });
    addUser(412, { role: 'dev', discord_id: '9412', discord_roles: '["r-dev"]', authentik_sub: 'ak-412' });
    addUser(413, { role: 'dev', discord_id: null, authentik_sub: 'ak-413' });

    expect(demoteUnlistedDevs().map(d => d.id).sort()).toEqual([411, 412, 413]);
    const role = (id) => db.prepare('SELECT role FROM users WHERE id = ?').get(id).role;
    expect([role(410), role(411), role(412), role(413)]).toEqual(['dev', 'admin', 'member', 'member']);

    // Z AUTHENTIK_DEV_GROUPS dev mógł przyjść z grupy SSO, więc konta z Authentikiem zostają
    db.prepare("UPDATE users SET role = 'dev' WHERE id IN (412, 413)").run();
    process.env.AUTHENTIK_DEV_GROUPS = 'alleria-dev';
    expect(demoteUnlistedDevs()).toEqual([]);
  });
});

describe('Okresowe sprawdzanie Discorda a dev', () => {
  let fake;
  const envKeys = ['DISCORD_API_URL', 'DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID', 'DISCORD_MEMBER_ROLE_ID', 'DISCORD_DEV_ROLE_ID', 'DISCORD_DEV_USER_IDS'];

  beforeAll(async () => {
    fake = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ roles: ['r-member', 'r-dev'] }));
    });
    await new Promise(r => fake.listen(0, '127.0.0.1', r));
    Object.assign(process.env, {
      DISCORD_API_URL: `http://127.0.0.1:${fake.address().port}/api`, DISCORD_BOT_TOKEN: 'test-bot',
      DISCORD_GUILD_ID: 'g1', DISCORD_MEMBER_ROLE_ID: 'r-member', DISCORD_DEV_ROLE_ID: 'r-dev', DISCORD_DEV_USER_IDS: '9421',
    });
  });

  afterAll(() => {
    for (const k of envKeys) delete process.env[k];
    return new Promise(r => fake.close(r));
  });

  async function runCheck(user) {
    const req = { session: { user: { ...user }, discordCheckedAt: Date.now() - DISCORD_RECHECK_MS - 1000 } };
    await new Promise(r => refreshSessionUser(req, {}, r));
    return req.session;
  }

  it('dev nadany sobie rolą na Discordzie spada do membera, dev z listy zostaje', async () => {
    addUser(420, { role: 'dev', discord_id: '9420' });
    addUser(421, { role: 'dev', discord_id: '9421' });
    expect((await runCheck({ id: 420, role: 'dev', auth_method: 'discord' })).user.role).toBe('member');
    expect((await runCheck({ id: 421, role: 'dev', auth_method: 'discord' })).user.role).toBe('dev');
  });

  it('zablokowane konto jest wylogowywane jeszcze przed sprawdzeniem Discorda', async () => {
    addUser(422, { discord_id: '9422' });
    db.prepare("UPDATE users SET banned_at = datetime('now') WHERE id = 422").run();
    expect((await runCheck({ id: 422, role: 'member', auth_method: 'discord' })).user).toBeUndefined();
  });
});
