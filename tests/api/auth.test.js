// Sesja, /api/auth/me, wylogowanie oraz ochrona CSRF (nagłówek X-Requested-With).
import { describe, it, before as beforeAll } from 'node:test';
import { expect } from 'expect';
import { seedUsers, anon, loginAs } from '../helpers/testApp.js';

beforeAll(() => {
  seedUsers();
});

describe('Sesja i /api/auth/me', () => {
  it('anonim dostaje 401 z /api/auth/me', async () => {
    const res = await anon().get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('zalogowany member widzi swoje dane sesji', async () => {
    const member = await loginAs('member');
    const res = await member.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('member');
    expect(res.body.username).toBe('test-member');
  });

  it('zalogowany dev ma rolę dev', async () => {
    const dev = await loginAs('dev');
    const res = await dev.get('/api/auth/me');
    expect(res.body.role).toBe('dev');
  });

  it('po wylogowaniu sesja przestaje działać', async () => {
    const member = await loginAs('member');
    await member.post('/api/auth/logout').expect(200);
    const res = await member.get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('Ochrona CSRF', () => {
  it('żądanie zmieniające stan bez X-Requested-With jest odrzucane (403)', async () => {
    const member = await loginAs('member');
    // .raw = agent bez automatycznego nagłówka CSRF
    const res = await member.raw.put('/api/profile').send({ display_name: 'Hacker' });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('X-Requested-With');
  });

  it('GET działa bez nagłówka X-Requested-With', async () => {
    const member = await loginAs('member');
    const res = await member.raw.get('/api/profile');
    expect(res.status).toBe(200);
  });

  it('z nagłówkiem X-Requested-With żądanie przechodzi', async () => {
    const member = await loginAs('member');
    const res = await member.put('/api/profile').send({ display_name: 'Poprawna Nazwa' });
    expect(res.status).toBe(200);
  });
});
