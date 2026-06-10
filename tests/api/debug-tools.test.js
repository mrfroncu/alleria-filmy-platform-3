// Narzędzia deweloperskie (tylko dev): SQL executor, ustawienia aplikacji,
// tworzenie użytkowników, audit log.
import { describe, it, before as beforeAll } from 'node:test';
import { expect } from 'expect';
import { seedUsers, loginAs, createVideo } from '../helpers/testApp.js';

let member, redaktor, dev;

beforeAll(async () => {
  seedUsers();
  member = await loginAs('member');
  redaktor = await loginAs('redaktor');
  dev = await loginAs('dev');
});

describe('SQL executor', () => {
  it('dev wykonuje zapytanie SELECT', async () => {
    const res = await dev.post('/api/debug/sql').send({ query: 'SELECT COUNT(*) AS c FROM users' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.rows[0].c).toBeGreaterThanOrEqual(3);
  });

  it('puste zapytanie → 400', async () => {
    const res = await dev.post('/api/debug/sql').send({ query: '   ' });
    expect(res.status).toBe(400);
  });

  it('błędny SQL zwraca success: false (bez crasha)', async () => {
    const res = await dev.post('/api/debug/sql').send({ query: 'SELECT * FROM nieistniejaca_tabela' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
  });
});

describe('Ustawienia aplikacji', () => {
  it('dev odczytuje i zmienia ustawienia', async () => {
    const before = await dev.get('/api/debug/settings');
    expect(before.status).toBe(200);
    expect(before.body).toHaveProperty('limit_comment');
    expect(before.body).toHaveProperty('webhook_domain_restriction');

    const res = await dev.post('/api/debug/settings').send({ limit_comment: 500 });
    expect(res.status).toBe(200);
    expect(res.body.limit_comment).toBe(500);
  });

  it('nieprawidłowa wartość limitu → 400', async () => {
    expect((await dev.post('/api/debug/settings').send({ limit_comment: 0 })).status).toBe(400);
    expect((await dev.post('/api/debug/settings').send({ limit_comment: 'abc' })).status).toBe(400);
    expect((await dev.post('/api/debug/settings').send({ limit_comment: 100001 })).status).toBe(400);
  });

  it('przełącznik webhook_domain_restriction działa', async () => {
    const off = await dev.post('/api/debug/settings').send({ webhook_domain_restriction: false });
    expect(off.body.webhook_domain_restriction).toBe(false);
    const on = await dev.post('/api/debug/settings').send({ webhook_domain_restriction: true });
    expect(on.body.webhook_domain_restriction).toBe(true);
  });
});

describe('Tworzenie użytkowników (dev)', () => {
  it('dev tworzy użytkownika ręcznie', async () => {
    const res = await dev.post('/api/debug/create-user')
      .send({ username: 'nowy-autor', display_name: 'Nowy Autor', role: 'member' });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('nowy-autor');
    expect(res.body.user.auth_method).toBe('manual');
  });

  it('brak wymaganych pól → 400', async () => {
    const res = await dev.post('/api/debug/create-user').send({ username: 'bez-nazwy' });
    expect(res.status).toBe(400);
  });

  it('nieznana rola jest zamieniana na member', async () => {
    const res = await dev.post('/api/debug/create-user')
      .send({ username: 'dziwna-rola', display_name: 'Dziwna Rola', role: 'superadmin' });
    expect(res.body.user.role).toBe('member');
  });
});

describe('Audit log', () => {
  it('akcje redaktora są zapisywane w audit logu (widoczne dla deva)', async () => {
    await createVideo(redaktor, { title: 'Film audytowany' });

    const res = await dev.get('/api/audit-logs');
    expect(res.status).toBe(200);
    const entry = res.body.logs.find(l => l.entity_type === 'video' && l.details === 'Film audytowany');
    expect(entry).toBeDefined();
    expect(entry.action).toBe('create');
  });

  it('member i redaktor nie mają dostępu do audit logów', async () => {
    expect((await member.get('/api/audit-logs')).status).toBe(403);
    expect((await redaktor.get('/api/audit-logs')).status).toBe(403);
  });
});
