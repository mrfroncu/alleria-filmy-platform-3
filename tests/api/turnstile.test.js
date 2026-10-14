// Captcha Cloudflare Turnstile przed logowaniem TeamSpeak: włączanie flagą z .env, weryfikacja
// tokenu w Cloudflare, brak captchy przy łączeniu konta z profilu.
// Zamiast prawdziwego Cloudflare działa lokalny serwer HTTP udający endpoint siteverify.
// TS3/TS6 nie są skonfigurowane, więc przepuszczone żądanie kończy się błędem
// „nie jest skonfigurowany” — to znak, że captcha została przepuszczona dalej.
import { describe, it, before as beforeAll, after as afterAll, beforeEach } from 'node:test';
import { expect } from 'expect';
import http from 'node:http';
import { seedUsers, anon, loginAs } from '../helpers/testApp.js';

let fake;
let verifyCalls; // body każdego żądania do siteverify

beforeAll(async () => {
  seedUsers();
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      const params = Object.fromEntries(new URLSearchParams(body));
      verifyCalls.push(params);
      if (params.secret !== 'test-secret') {
        return res.end(JSON.stringify({ success: false, 'error-codes': ['invalid-input-secret'] }));
      }
      if (params.response === 'good-token') {
        return res.end(JSON.stringify({ success: true, 'error-codes': [], action: 'ts-login' }));
      }
      if (params.response === 'used-token') {
        return res.end(JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
      }
      res.end(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }));
    });
  });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
});

afterAll(() => fake.close());

beforeEach(() => {
  verifyCalls = [];
  process.env.TURNSTILE_ENABLED = 'true';
  process.env.TURNSTILE_SITE_KEY = 'test-site-key';
  process.env.TURNSTILE_SECRET_KEY = 'test-secret';
  process.env.TURNSTILE_VERIFY_URL = `http://127.0.0.1:${fake.address().port}/turnstile/v0/siteverify`;
  delete process.env.TS3_HOST;
  delete process.env.TS6_HOST;
  delete process.env.TS_SERVER_HOST;
});

const ROUTES = [
  ['/api/auth/teamspeak3', 'TeamSpeak 3 nie jest skonfigurowany.'],
  ['/api/auth/teamspeak', 'TeamSpeak nie jest skonfigurowany.'],
];

describe('/api/health — site key dla strony logowania', () => {
  it('zwraca site key, gdy captcha jest włączona', async () => {
    const res = await anon().get('/api/health');
    expect(res.body.turnstile_site_key).toBe('test-site-key');
  });

  it('zwraca null przy TURNSTILE_ENABLED=false', async () => {
    process.env.TURNSTILE_ENABLED = 'false';
    const res = await anon().get('/api/health');
    expect(res.body.turnstile_site_key).toBeNull();
  });

  it('zwraca null, gdy flaga jest włączona, ale brakuje klucza', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const res = await anon().get('/api/health');
    expect(res.body.turnstile_site_key).toBeNull();
  });
});

for (const [route, notConfigured] of ROUTES) {
  describe(`POST ${route} — captcha`, () => {
    it('bez tokenu: 400, bez pytania Cloudflare', async () => {
      const res = await anon().post(route).send({});
      expect(res.status).toBe(400);
      expect(res.body.captcha).toBe(true);
      expect(verifyCalls).toHaveLength(0);
    });

    it('nieprawidłowy token: 403', async () => {
      const res = await anon().post(route).send({ turnstileToken: 'bad-token' });
      expect(res.status).toBe(403);
      expect(res.body.captcha).toBe(true);
      expect(res.body.error).toMatch(/captcha nie powiodła się/);
    });

    it('zużyty / wygasły token: 403 z osobnym komunikatem', async () => {
      const res = await anon().post(route).send({ turnstileToken: 'used-token' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/wygasła/);
    });

    it('poprawny token: przechodzi dalej i wysyła secret, token oraz IP', async () => {
      const res = await anon().post(route).send({ turnstileToken: 'good-token' });
      expect(res.body.captcha).toBeUndefined();
      expect(res.status).toBe(500);
      expect(res.body.error).toBe(notConfigured);
      expect(verifyCalls).toHaveLength(1);
      expect(verifyCalls[0]).toMatchObject({ secret: 'test-secret', response: 'good-token' });
      expect(verifyCalls[0].remoteip).toBeTruthy();
    });

    it('przy TURNSTILE_ENABLED=false token nie jest wymagany', async () => {
      process.env.TURNSTILE_ENABLED = 'false';
      const res = await anon().post(route).send({});
      expect(res.status).toBe(500);
      expect(res.body.error).toBe(notConfigured);
      expect(verifyCalls).toHaveLength(0);
    });

    it('Cloudflare nieosiągalny: 503, logowanie zablokowane', async () => {
      process.env.TURNSTILE_VERIFY_URL = 'http://127.0.0.1:1/siteverify';
      const res = await anon().post(route).send({ turnstileToken: 'good-token' });
      expect(res.status).toBe(503);
      expect(res.body.captcha).toBe(true);
    });

    it('łączenie konta z profilu (zalogowany, linkMode) nie wymaga captchy', async () => {
      const member = await loginAs('member');
      const res = await member.post(route).send({ linkMode: true });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe(notConfigured);
      expect(verifyCalls).toHaveLength(0);
    });

    it('linkMode bez sesji nie omija captchy', async () => {
      const res = await anon().post(route).send({ linkMode: true });
      expect(res.status).toBe(400);
      expect(res.body.captcha).toBe(true);
    });
  });
}
