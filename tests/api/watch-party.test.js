// Watch Party: tworzenie pokoju, podgląd, usuwanie (tylko host) i panel admina (dev).
import { describe, it, before as beforeAll } from 'node:test';
import { expect } from 'expect';
import { seedUsers, loginAs } from '../helpers/testApp.js';

let member, redaktor, dev;

beforeAll(async () => {
  seedUsers();
  member = await loginAs('member');
  redaktor = await loginAs('redaktor');
  dev = await loginAs('dev');
});

describe('Cykl życia watch party', () => {
  it('member tworzy party i może je odczytać po kodzie', async () => {
    const created = await member.post('/api/watch-party');
    expect(created.status).toBe(200);
    expect(created.body.code).toMatch(/^[A-Z0-9]{6}$/);

    const res = await member.get(`/api/watch-party/${created.body.code}`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(created.body.code);
    expect(res.body.memberCount).toBe(0);
  });

  it('nieistniejący kod → 404', async () => {
    const res = await member.get('/api/watch-party/XXXXXX');
    expect(res.status).toBe(404);
  });

  it('tylko host może usunąć party', async () => {
    const created = await member.post('/api/watch-party');
    const code = created.body.code;

    // redaktor (nie-host) nie może usunąć
    const forbidden = await redaktor.del(`/api/watch-party/${code}`);
    expect(forbidden.status).toBe(403);

    // host usuwa
    await member.del(`/api/watch-party/${code}`).expect(200);
    const after = await member.get(`/api/watch-party/${code}`);
    expect(after.status).toBe(404);
  });

  it('member dostaje jednorazowy token WebSocket', async () => {
    const res = await member.get('/api/watch-party/token');
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(10);
  });
});

describe('Panel admina watch party (dev)', () => {
  it('dev widzi listę party i może usunąć dowolne', async () => {
    const created = await member.post('/api/watch-party');
    const code = created.body.code;

    const list = await dev.get('/api/admin/watch-parties');
    expect(list.status).toBe(200);
    expect(list.body.find(p => p.code === code)).toBeDefined();

    await dev.del(`/api/admin/watch-parties/${code}`).expect(200);
    const after = await member.get(`/api/watch-party/${code}`);
    expect(after.status).toBe(404);
  });

  it('member i redaktor nie mają dostępu do panelu admina (403)', async () => {
    expect((await member.get('/api/admin/watch-parties')).status).toBe(403);
    expect((await redaktor.get('/api/admin/watch-parties')).status).toBe(403);
  });
});
