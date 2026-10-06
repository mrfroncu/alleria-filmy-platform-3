// Logowanie SSO przez Authentik (OIDC): przekierowanie z PKCE, weryfikacja state, wymiana kodu,
// mapowanie grup na role, łączenie z istniejącym kontem i rozłączanie.
// Zamiast prawdziwego Authentika działa lokalny serwer HTTP udający jego endpointy
// /application/o/token/ i /application/o/userinfo/.
import { describe, it, before as beforeAll, after as afterAll, beforeEach } from 'node:test';
import { expect } from 'expect';
import http from 'node:http';
import crypto from 'node:crypto';
import supertest from 'supertest';
import { createRequire } from 'node:module';
import { app, db, seedUsers, anon, loginAs } from '../helpers/testApp.js';

let fake;          // serwer udający Authentik
let fakeUser;      // co zwróci /userinfo/
let lastTokenBody; // ostatnie żądanie do /token/ (do sprawdzenia PKCE)
const codeChallenges = new Map(); // code -> code_challenge z przekierowania
const guildMembers = new Map();   // Discord id -> role na serwerze (brak = nie jest na serwerze)
let discordDown = false;

beforeAll(async () => {
  seedUsers();
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/application/o/token/' && req.method === 'POST') {
        lastTokenBody = Object.fromEntries(new URLSearchParams(body));
        const expected = codeChallenges.get(lastTokenBody.code);
        const actual = crypto.createHash('sha256').update(lastTokenBody.code_verifier || '').digest('base64url');
        if (!expected || expected !== actual || lastTokenBody.client_secret !== 'test-secret') {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'invalid_grant' }));
        }
        return res.end(JSON.stringify({ access_token: 'at-123', token_type: 'Bearer' }));
      }
      if (req.url === '/application/o/userinfo/' && req.headers.authorization === 'Bearer at-123') {
        return res.end(JSON.stringify(fakeUser));
      }
      // Udawane API Discorda dla bota: /discord/guilds/G1/members/<id>
      const m = req.url.match(/^\/discord\/guilds\/G1\/members\/(\d+)$/);
      if (m && req.headers.authorization === 'Bot test-bot') {
        if (discordDown) { res.statusCode = 503; return res.end('{}'); }
        const roles = guildMembers.get(m[1]);
        if (!roles) { res.statusCode = 404; return res.end(JSON.stringify({ message: 'Unknown Member' })); }
        return res.end(JSON.stringify({ roles }));
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
});

afterAll(() => fake.close());

beforeEach(() => {
  process.env.AUTHENTIK_URL = `http://127.0.0.1:${fake.address().port}/`;
  process.env.AUTHENTIK_CLIENT_ID = 'test-client';
  process.env.AUTHENTIK_CLIENT_SECRET = 'test-secret';
  process.env.AUTHENTIK_REDIRECT_URI = 'http://localhost:3000/auth/authentik/callback';
  delete process.env.AUTHENTIK_MEMBER_GROUPS;
  delete process.env.AUTHENTIK_ADMIN_GROUPS;
  delete process.env.AUTHENTIK_DEV_GROUPS;
  delete process.env.AUTHENTIK_TRUST_EMAIL;
  delete process.env.ACCOUNT_LINK_BY_EMAIL;
  delete process.env.DISCORD_BOT_TOKEN; // bez bota — żadnych prawdziwych zapytań do Discorda
  // Większość testów sprawdza tryb "same grupy Authentik"; wymóg roli Discord ma własny blok niżej
  process.env.AUTHENTIK_REQUIRE_DISCORD_ROLE = 'false';
  discordDown = false;
  fakeUser = { sub: 'ak-sub-1', preferred_username: 'jan', name: 'Jan Kowalski', email: 'jan@example.com', groups: [] };
});

// Przechodzi krok przekierowania i zwraca { state, code } gotowe do wywołania callbacku
async function startFlow(agent, query = '') {
  const res = await agent.get(`/auth/authentik${query}`);
  expect(res.status).toBe(302);
  const url = new URL(res.headers.location);
  const code = `code-${crypto.randomUUID()}`;
  codeChallenges.set(code, url.searchParams.get('code_challenge'));
  return { url, state: url.searchParams.get('state'), code };
}

describe('Authentik — konfiguracja i przekierowanie', () => {
  it('bez konfiguracji przekierowuje na /login?error=config_missing', async () => {
    delete process.env.AUTHENTIK_CLIENT_ID;
    const res = await anon().get('/auth/authentik');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?error=config_missing');
  });

  it('/api/health zgłasza, czy SSO jest skonfigurowane', async () => {
    const res = await anon().get('/api/health');
    expect(res.body.authentik_configured).toBe(true);
    delete process.env.AUTHENTIK_URL;
    const res2 = await anon().get('/api/health');
    expect(res2.body.authentik_configured).toBe(false);
  });

  it('przekierowuje na endpoint authorize z PKCE (S256), state i scope openid', async () => {
    const { url, state } = await startFlow(supertest.agent(app));
    expect(url.pathname).toBe('/application/o/authorize/');
    expect(url.searchParams.get('client_id')).toBe('test-client');
    expect(url.searchParams.get('scope')).toBe('openid profile email');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(state).toMatch(/^[0-9a-f]{48}$/);
  });
});

describe('Authentik — callback', () => {
  it('odrzuca callback z nieprawidłowym state', async () => {
    const agent = supertest.agent(app);
    const { code } = await startFlow(agent);
    const res = await agent.get(`/auth/authentik/callback?code=${code}&state=wrong`);
    expect(res.headers.location).toBe('/login?error=invalid_state');
  });

  it('state jest jednorazowy — drugi callback z tym samym state jest odrzucany', async () => {
    const agent = supertest.agent(app);
    const { code, state } = await startFlow(agent);
    await agent.get(`/auth/authentik/callback?code=${code}&state=${state}`);
    const res = await agent.get(`/auth/authentik/callback?code=${code}&state=${state}`);
    expect(res.headers.location).toBe('/login?error=invalid_state');
  });

  it('anulowanie po stronie Authentika (?error=access_denied) wraca z authentik_denied', async () => {
    const agent = supertest.agent(app);
    const { state } = await startFlow(agent);
    const res = await agent.get(`/auth/authentik/callback?error=access_denied&state=${state}`);
    expect(res.headers.location).toBe('/login?error=authentik_denied');
  });

  it('pełne logowanie tworzy konto i sesję (rola member, gdy brak wymaganych grup)', async () => {
    const agent = supertest.agent(app);
    const { code, state } = await startFlow(agent, '?returnTo=/videos');
    const res = await agent.get(`/auth/authentik/callback?code=${code}&state=${state}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/videos');
    // PKCE: verifier wysłany do /token/ pasuje do challenge z przekierowania (sprawdza fake serwer)
    expect(lastTokenBody.code_verifier).toBeTruthy();

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.auth_method).toBe('authentik');
    expect(me.body.role).toBe('member');
    expect(me.body.display_name).toBe('Jan Kowalski');

    const row = db.prepare('SELECT * FROM users WHERE authentik_sub = ?').get('ak-sub-1');
    expect(row.username).toBe('jan');
    expect(row.email).toBe('jan@example.com');
  });

  it('kolejne logowanie trafia w to samo konto (dopasowanie po sub)', async () => {
    const before = db.prepare('SELECT COUNT(*) c FROM users').get().c;
    const agent = supertest.agent(app);
    const { code, state } = await startFlow(agent);
    await agent.get(`/auth/authentik/callback?code=${code}&state=${state}`);
    expect(db.prepare('SELECT COUNT(*) c FROM users').get().c).toBe(before);
  });

  it('odmawia, gdy użytkownik nie należy do AUTHENTIK_MEMBER_GROUPS', async () => {
    process.env.AUTHENTIK_MEMBER_GROUPS = 'filmy, inna';
    fakeUser = { ...fakeUser, sub: 'ak-sub-2', groups: ['ktos-inny'] };
    const agent = supertest.agent(app);
    const { code, state } = await startFlow(agent);
    const res = await agent.get(`/auth/authentik/callback?code=${code}&state=${state}`);
    expect(res.headers.location).toBe('/login?error=authentik_no_group');
    expect(db.prepare('SELECT 1 FROM users WHERE authentik_sub = ?').get('ak-sub-2')).toBeUndefined();
  });

  it('grupa z AUTHENTIK_ADMIN_GROUPS daje rolę admin nawet bez grupy member', async () => {
    process.env.AUTHENTIK_MEMBER_GROUPS = 'filmy';
    process.env.AUTHENTIK_ADMIN_GROUPS = 'redaktorzy';
    fakeUser = { ...fakeUser, sub: 'ak-sub-3', preferred_username: 'red', groups: ['redaktorzy'] };
    const agent = supertest.agent(app);
    const { code, state } = await startFlow(agent);
    await agent.get(`/auth/authentik/callback?code=${code}&state=${state}`);
    const me = await agent.get('/api/auth/me');
    expect(me.body.role).toBe('admin');
  });

  it('zły client secret / nieudana wymiana kodu kończy się auth_failed', async () => {
    process.env.AUTHENTIK_CLIENT_SECRET = 'zly-secret';
    const agent = supertest.agent(app);
    const { code, state } = await startFlow(agent);
    const res = await agent.get(`/auth/authentik/callback?code=${code}&state=${state}`);
    expect(res.headers.location).toBe('/login?error=auth_failed');
  });
});

// Pierwsze logowanie przez SSO kogoś, kto ma już konto z Discorda
describe('Authentik — dopasowanie do istniejącego konta', () => {
  const addUser = (fields) => {
    const cols = Object.keys(fields);
    const r = db.prepare(`INSERT INTO users (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...Object.values(fields));
    return r.lastInsertRowid;
  };
  const ssoLogin = async () => {
    const agent = supertest.agent(app);
    const { code, state } = await startFlow(agent);
    const res = await agent.get(`/auth/authentik/callback?code=${code}&state=${state}`);
    expect(res.headers.location).toBe('/');
    return (await agent.get('/api/auth/me')).body;
  };

  it('claim discord_id trafia w konto z tym samym Discordem (i zapamiętuje sub)', async () => {
    const id = addUser({ username: 'dc-user', display_name: 'Z Discorda', role: 'admin', discord_id: '555000111', auth_method: 'discord' });
    fakeUser = { sub: 'ak-dc-1', preferred_username: 'dcsso', name: 'Inna Nazwa', groups: [], discord_id: '555000111' };
    const me = await ssoLogin();
    expect(me.id).toBe(id);
    expect(me.role).toBe('admin'); // rola z konta Discord nie spada
    expect(me.display_name).toBe('Z Discorda');
    expect(db.prepare('SELECT authentik_sub FROM users WHERE id = ?').get(id).authentik_sub).toBe('ak-dc-1');
  });

  it('nowe konto SSO z claimem discord_id dostaje też discord_id (późniejszy login Discordem trafi w nie)', async () => {
    fakeUser = { sub: 'ak-dc-2', preferred_username: 'nowy', groups: [], discord_id: '555000222' };
    const me = await ssoLogin();
    expect(db.prepare('SELECT discord_id FROM users WHERE id = ?').get(me.id).discord_id).toBe('555000222');
  });

  it('dopasowanie po e-mailu jest domyślnie wyłączone', async () => {
    const id = addUser({ username: 'mail-off', role: 'member', discord_id: '555000333', discord_email: 'off@example.com', discord_email_verified: 1 });
    fakeUser = { sub: 'ak-mail-off', preferred_username: 'x', email: 'off@example.com', email_verified: true, groups: [] };
    const me = await ssoLogin();
    expect(me.id).not.toBe(id);
  });

  it('z ACCOUNT_LINK_BY_EMAIL trafia w konto o zweryfikowanym e-mailu z Discorda (bez względu na wielkość liter)', async () => {
    process.env.ACCOUNT_LINK_BY_EMAIL = 'true';
    const id = addUser({ username: 'mail-on', role: 'member', discord_id: '555000444', discord_email: 'On@Example.com', discord_email_verified: 1 });
    fakeUser = { sub: 'ak-mail-on', preferred_username: 'y', email: 'on@example.COM', email_verified: true, groups: [] };
    const me = await ssoLogin();
    expect(me.id).toBe(id);
  });

  it('niezweryfikowany e-mail z Discorda się nie liczy', async () => {
    process.env.ACCOUNT_LINK_BY_EMAIL = 'true';
    const id = addUser({ username: 'dc-unverified', role: 'member', discord_id: '555000555', discord_email: 'unv@example.com', discord_email_verified: 0 });
    fakeUser = { sub: 'ak-unv', preferred_username: 'z', email: 'unv@example.com', email_verified: true, groups: [] };
    const me = await ssoLogin();
    expect(me.id).not.toBe(id);
  });

  it('e-mail z Authentika z email_verified=false (domyślny mapping) liczy się tylko z AUTHENTIK_TRUST_EMAIL', async () => {
    process.env.ACCOUNT_LINK_BY_EMAIL = 'true';
    const id = addUser({ username: 'trust', role: 'member', discord_id: '555000666', discord_email: 'trust@example.com', discord_email_verified: 1 });
    fakeUser = { sub: 'ak-trust-1', preferred_username: 't1', email: 'trust@example.com', email_verified: false, groups: [] };
    expect((await ssoLogin()).id).not.toBe(id);

    process.env.AUTHENTIK_TRUST_EMAIL = 'true';
    fakeUser = { ...fakeUser, sub: 'ak-trust-2' };
    expect((await ssoLogin()).id).toBe(id);
  });

  it('niejednoznaczny e-mail (kilka kont) nie łączy z żadnym', async () => {
    process.env.ACCOUNT_LINK_BY_EMAIL = 'true';
    const a = addUser({ username: 'dup-a', role: 'member', discord_id: '555000777', discord_email: 'dup@example.com', discord_email_verified: 1 });
    const b = addUser({ username: 'dup-b', role: 'member', discord_id: '555000888', discord_email: 'dup@example.com', discord_email_verified: 1 });
    fakeUser = { sub: 'ak-dup', preferred_username: 'd', email: 'dup@example.com', email_verified: true, groups: [] };
    const me = await ssoLogin();
    expect([a, b]).not.toContain(me.id);
  });

  it('wcześniej założone konto tylko-SSO zostaje scalone do konta Discord, które zostaje główne', async () => {
    // Stan "sprzed" dopasowania: osobne konto SSO z historią + stare konto Discord z rolą dev
    const dcId = addUser({ username: 'stary-dc', display_name: 'Stary Discord', role: 'dev', discord_id: '777000111', auth_method: 'discord' });
    const ssoId = addUser({ username: 'sso-dup', display_name: 'Duplikat', role: 'member', auth_method: 'authentik', authentik_sub: 'ak-dup-sub' });
    db.prepare("INSERT INTO login_logs (user_id, username, auth_method, ip_address, success) VALUES (?, 'sso-dup', 'authentik', '1.2.3.4', 1)").run(ssoId);

    fakeUser = { sub: 'ak-dup-sub', preferred_username: 'sso-dup', groups: [], discord_id: '777000111' };
    const me = await ssoLogin();
    expect(me.id).toBe(dcId);
    expect(me.role).toBe('dev');
    expect(me.display_name).toBe('Stary Discord');
    expect(db.prepare('SELECT 1 FROM users WHERE id = ?').get(ssoId)).toBeUndefined();
    expect(db.prepare('SELECT authentik_sub FROM users WHERE id = ?').get(dcId).authentik_sub).toBe('ak-dup-sub');
    expect(db.prepare('SELECT COUNT(*) c FROM login_logs WHERE user_id = ?').get(ssoId).c).toBe(0); // historia przeniesiona
  });

  it('to samo przez zweryfikowany e-mail (ACCOUNT_LINK_BY_EMAIL)', async () => {
    process.env.ACCOUNT_LINK_BY_EMAIL = 'true';
    process.env.AUTHENTIK_TRUST_EMAIL = 'true';
    const dcId = addUser({ username: 'dc-mail', role: 'admin', discord_id: '777000222', discord_email: 'old@example.com', discord_email_verified: 1 });
    const ssoId = addUser({ username: 'sso-mail', role: 'member', auth_method: 'authentik', authentik_sub: 'ak-mail-dup' });
    fakeUser = { sub: 'ak-mail-dup', preferred_username: 'sso-mail', email: 'old@example.com', groups: [] };
    const me = await ssoLogin();
    expect(me.id).toBe(dcId);
    expect(me.role).toBe('admin');
    expect(db.prepare('SELECT 1 FROM users WHERE id = ?').get(ssoId)).toBeUndefined();
  });

  it('konto SSO z inną metodą logowania (np. TS3) nie jest scalane automatycznie', async () => {
    const dcId = addUser({ username: 'dc-x', role: 'member', discord_id: '777000333', auth_method: 'discord' });
    const ssoId = addUser({ username: 'sso-x', role: 'member', auth_method: 'authentik', authentik_sub: 'ak-x', ts3_uid: 'ts3-x' });
    fakeUser = { sub: 'ak-x', preferred_username: 'sso-x', groups: [], discord_id: '777000333' };
    const me = await ssoLogin();
    expect(me.id).toBe(ssoId);
    expect(db.prepare('SELECT 1 FROM users WHERE id = ?').get(dcId)).toBeTruthy();
  });

  it('migracja 005 oznacza stare e-maile Discord jako zweryfikowane, nowsze logowania zostawia', () => {
    const migration = createRequire(import.meta.url)('../../backend/migrations/005_backfill_discord_email_verified.js');
    const oldId = addUser({ username: 'old-dc', discord_id: '777000444', discord_email: 'a@example.com', discord_email_verified: 0, last_login: '2000-01-01 00:00:00' });
    const newId = addUser({ username: 'new-dc', discord_id: '777000555', discord_email: 'b@example.com', discord_email_verified: 0, last_login: '2999-01-01 00:00:00' });
    migration.up(db);
    expect(db.prepare('SELECT discord_email_verified v FROM users WHERE id = ?').get(oldId).v).toBe(1);
    expect(db.prepare('SELECT discord_email_verified v FROM users WHERE id = ?').get(newId).v).toBe(0);
  });

  it('pole e-mail z profilu (edytowalne przez użytkownika) nigdy nie służy do dopasowania', async () => {
    process.env.ACCOUNT_LINK_BY_EMAIL = 'true';
    process.env.AUTHENTIK_TRUST_EMAIL = 'true';
    const id = addUser({ username: 'profile-mail', role: 'dev', discord_id: '555000999', email: 'victim@example.com' });
    fakeUser = { sub: 'ak-attacker', preferred_username: 'a', email: 'victim@example.com', groups: [] };
    const me = await ssoLogin();
    expect(me.id).not.toBe(id);
    expect(me.role).toBe('member');
  });
});

// Domyślny tryb: przez SSO wejdzie tylko ktoś z rolą MEMBER/ADMIN/DEV na serwerze Discord
describe('Authentik — wymagana rola na Discordzie (domyślnie włączone)', () => {
  const MEMBER = '900000000000000001';
  const ADMIN = '900000000000000002';
  beforeEach(() => {
    delete process.env.AUTHENTIK_REQUIRE_DISCORD_ROLE; // = domyślnie włączone
    process.env.DISCORD_API_URL = `http://127.0.0.1:${fake.address().port}/discord`;
    process.env.DISCORD_BOT_TOKEN = 'test-bot';
    process.env.DISCORD_GUILD_ID = 'G1';
    process.env.DISCORD_MEMBER_ROLE_ID = MEMBER;
    process.env.DISCORD_ADMIN_ROLE_ID = ADMIN;
    guildMembers.clear();
  });
  afterAll(() => {
    for (const k of ['DISCORD_API_URL', 'DISCORD_GUILD_ID', 'DISCORD_MEMBER_ROLE_ID', 'DISCORD_ADMIN_ROLE_ID']) delete process.env[k];
  });
  const callback = async (agent = supertest.agent(app)) => {
    const { code, state } = await startFlow(agent);
    const res = await agent.get(`/auth/authentik/callback?code=${code}&state=${state}`);
    return { res, agent };
  };
  const countUsers = () => db.prepare('SELECT COUNT(*) c FROM users').get().c;

  it('osoba z rolą MEMBER wchodzi', async () => {
    guildMembers.set('810000000000000001', [MEMBER]);
    fakeUser = { sub: 'gate-ok', preferred_username: 'ok', groups: [], discord_id: '810000000000000001' };
    const { res, agent } = await callback();
    expect(res.headers.location).toBe('/');
    expect((await agent.get('/api/auth/me')).body.role).toBe('member');
  });

  it('rola ADMIN na Discordzie daje admina także przez SSO', async () => {
    guildMembers.set('810000000000000002', [ADMIN]);
    fakeUser = { sub: 'gate-admin', preferred_username: 'adm', groups: [], discord_id: '810000000000000002' };
    const { agent } = await callback();
    expect((await agent.get('/api/auth/me')).body.role).toBe('admin');
  });

  it('osoba na serwerze, ale bez roli MEMBER — odrzucona, nic nie zapisane', async () => {
    guildMembers.set('810000000000000003', ['123']);
    fakeUser = { sub: 'gate-norole', preferred_username: 'x', groups: [], discord_id: '810000000000000003' };
    const before = countUsers();
    const { res } = await callback();
    expect(res.headers.location).toBe('/login?error=no_role');
    expect(countUsers()).toBe(before);
  });

  it('osoba spoza serwera Discord — odrzucona', async () => {
    fakeUser = { sub: 'gate-outsider', preferred_username: 'y', groups: [], discord_id: '810000000000000004' };
    const { res } = await callback();
    expect(res.headers.location).toBe('/login?error=no_role');
  });

  it('konto SSO bez żadnego Discorda (brak claimu, brak połączonego Discorda) — odrzucone', async () => {
    fakeUser = { sub: 'gate-nodiscord', preferred_username: 'z', groups: [] };
    const { res } = await callback();
    expect(res.headers.location).toBe('/login?error=authentik_no_discord');
  });

  it('gdy nie da się sprawdzić Discorda (awaria) — odrzucone, a nie przepuszczone', async () => {
    discordDown = true;
    guildMembers.set('810000000000000005', [MEMBER]);
    fakeUser = { sub: 'gate-down', preferred_username: 'd', groups: [], discord_id: '810000000000000005' };
    const { res } = await callback();
    expect(res.headers.location).toBe('/login?error=discord_unavailable');
  });

  it('członkostwo w grupach admin Authentika nie omija wymogu roli Discord', async () => {
    process.env.AUTHENTIK_ADMIN_GROUPS = 'admini';
    fakeUser = { sub: 'gate-akadmin', preferred_username: 'a', groups: ['admini'], discord_id: '810000000000000006' };
    const { res } = await callback();
    expect(res.headers.location).toBe('/login?error=no_role');
  });

  it('stare konto Discord, które straciło rolę MEMBER, nie wejdzie przez SSO (nawet z zapisaną wcześniej rolą admin)', async () => {
    const id = db.prepare("INSERT INTO users (username, role, discord_id, auth_method) VALUES ('byly-admin', 'admin', '810000000000000007', 'discord')").run().lastInsertRowid;
    fakeUser = { sub: 'gate-former', preferred_username: 'f', groups: [], discord_id: '810000000000000007' };
    const { res } = await callback();
    expect(res.headers.location).toBe('/login?error=no_role');
    expect(db.prepare('SELECT authentik_sub FROM users WHERE id = ?').get(id).authentik_sub).toBeNull();
  });

  // SSO przez inną usługę (np. Google w Authentiku) — bez discord_id, ale z tym samym mailem co stare konto Discord
  describe('SSO bez Discorda, ten sam e-mail co stare konto Discord', () => {
    beforeEach(() => {
      process.env.ACCOUNT_LINK_BY_EMAIL = 'true';
      process.env.AUTHENTIK_TRUST_EMAIL = 'true';
    });

    it('konto Discord z rolą MEMBER — wchodzi na to konto, SSO zostaje do niego dopięte', async () => {
      const id = db.prepare(`INSERT INTO users (username, display_name, role, discord_id, auth_method, discord_email, discord_email_verified)
        VALUES ('stary-member', 'Stary Member', 'member', '820000000000000001', 'discord', 'stary@example.com', 1)`).run().lastInsertRowid;
      guildMembers.set('820000000000000001', [MEMBER]);
      fakeUser = { sub: 'google-1', preferred_username: 'g1', email: 'Stary@Example.com', groups: [] };
      const before = countUsers();
      const { res, agent } = await callback();
      expect(res.headers.location).toBe('/');
      const me = (await agent.get('/api/auth/me')).body;
      expect(me.id).toBe(id);
      expect(me.display_name).toBe('Stary Member');
      expect(countUsers()).toBe(before);
      expect(db.prepare('SELECT authentik_sub FROM users WHERE id = ?').get(id).authentik_sub).toBe('google-1');
    });

    it('konto Discord, które straciło MEMBER — odrzucone i nic nie dopięte', async () => {
      const id = db.prepare(`INSERT INTO users (username, role, discord_id, auth_method, discord_email, discord_email_verified)
        VALUES ('byly-member', 'member', '820000000000000002', 'discord', 'byly@example.com', 1)`).run().lastInsertRowid;
      fakeUser = { sub: 'google-2', preferred_username: 'g2', email: 'byly@example.com', groups: [] };
      const { res } = await callback();
      expect(res.headers.location).toBe('/login?error=no_role');
      expect(db.prepare('SELECT authentik_sub FROM users WHERE id = ?').get(id).authentik_sub).toBeNull();
    });

    it('nowa, losowa osoba (mail nie pasuje do żadnego konta Discord) — odrzucona', async () => {
      fakeUser = { sub: 'google-3', preferred_username: 'g3', email: 'obcy@example.com', groups: [] };
      const before = countUsers();
      const { res } = await callback();
      expect(res.headers.location).toBe('/login?error=authentik_no_discord');
      expect(countUsers()).toBe(before);
    });
  });

  it('bez claimu, ale z kontem już połączonym z Discordem — sprawdzany jest ten Discord', async () => {
    db.prepare("INSERT INTO users (username, role, discord_id, auth_method, authentik_sub) VALUES ('polaczony', 'member', '810000000000000008', 'discord', 'gate-linked')").run();
    fakeUser = { sub: 'gate-linked', preferred_username: 'l', groups: [] };
    expect((await callback()).res.headers.location).toBe('/login?error=no_role');
    guildMembers.set('810000000000000008', [MEMBER]);
    expect((await callback()).res.headers.location).toBe('/');
  });
});

describe('Authentik — łączenie kont', () => {
  it('member łączy Authentik ze swoim kontem, a potem może go rozłączyć', async () => {
    fakeUser = { ...fakeUser, sub: 'ak-sub-link', preferred_username: 'member-sso' };
    const member = await loginAs('member');
    const { code, state } = await startFlow(member.raw, '?mode=link&returnTo=/profile');
    const res = await member.raw.get(`/auth/authentik/callback?code=${code}&state=${state}`);
    expect(res.headers.location).toBe('/profile?linked=authentik');

    const profile = await member.get('/api/profile');
    expect(profile.body.has_authentik).toBe(true);
    expect(profile.body.authentikUsername).toBe('member-sso');

    // Konto testowe ma też discord_id, więc Authentik nie jest jedyną metodą — można rozłączyć
    const unlink = await member.post('/api/profile/unlink').send({ method: 'authentik' });
    expect(unlink.status).toBe(200);
    expect(db.prepare('SELECT authentik_sub FROM users WHERE id = 101').get().authentik_sub).toBeNull();
  });

  it('łączenie Authentika, który ma już osobne konto, proponuje scalenie kont', async () => {
    // ak-sub-1 ma własne konto z testu "pełne logowanie" wyżej
    const member = await loginAs('member');
    const { code, state } = await startFlow(member.raw, '?mode=link');
    const res = await member.raw.get(`/auth/authentik/callback?code=${code}&state=${state}`);
    expect(res.headers.location).toMatch(/^\/profile\?mergeId=/);
    const mergeId = res.headers.location.split('mergeId=')[1];
    const pending = await member.get(`/api/profile/merge/${mergeId}`);
    expect(pending.body.identities).toEqual(['authentik']);
  });
});
