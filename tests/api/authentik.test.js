// Logowanie SSO przez Authentik (OIDC): przekierowanie z PKCE, weryfikacja state, wymiana kodu,
// mapowanie grup na role, łączenie z istniejącym kontem i rozłączanie.
// Zamiast prawdziwego Authentika działa lokalny serwer HTTP udający jego endpointy
// /application/o/token/ i /application/o/userinfo/.
import { describe, it, before as beforeAll, after as afterAll, beforeEach } from 'node:test';
import { expect } from 'expect';
import http from 'node:http';
import crypto from 'node:crypto';
import supertest from 'supertest';
import { app, db, seedUsers, anon, loginAs } from '../helpers/testApp.js';

let fake;          // serwer udający Authentik
let fakeUser;      // co zwróci /userinfo/
let lastTokenBody; // ostatnie żądanie do /token/ (do sprawdzenia PKCE)
const codeChallenges = new Map(); // code -> code_challenge z przekierowania

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
