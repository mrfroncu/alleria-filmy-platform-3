// Profil użytkownika: odczyt, edycja display_name/bio i konfigurowalne limity długości.
import { describe, it, before as beforeAll } from 'node:test';
import { expect } from 'expect';
import { seedUsers, loginAs } from '../helpers/testApp.js';

let member, dev;

beforeAll(async () => {
  seedUsers();
  member = await loginAs('member');
  dev = await loginAs('dev');
});

describe('Odczyt profilu', () => {
  it('member widzi swój profil ze statystykami', async () => {
    const res = await member.get('/api/profile');
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('test-member');
    expect(res.body.role).toBe('member');
    expect(typeof res.body.videoCount).toBe('number');
    expect(typeof res.body.favCount).toBe('number');
  });
});

describe('Edycja profilu', () => {
  it('zmiana display_name jest widoczna w profilu i w sesji', async () => {
    await member.put('/api/profile').send({ display_name: 'Nowa Nazwa' }).expect(200);

    const profile = await member.get('/api/profile');
    expect(profile.body.display_name).toBe('Nowa Nazwa');

    const me = await member.get('/api/auth/me');
    expect(me.body.display_name).toBe('Nowa Nazwa');
  });

  it('zmiana bio jest zapisywana', async () => {
    await member.put('/api/profile').send({ bio: 'Moje testowe bio' }).expect(200);
    const profile = await member.get('/api/profile');
    expect(profile.body.bio).toBe('Moje testowe bio');
  });
});

describe('Limity długości (konfigurowane przez deva)', () => {
  it('display_name dłuższe niż limit → 400, limit widoczny w /api/config', async () => {
    await dev.post('/api/debug/settings').send({ limit_display_name: 10 }).expect(200);

    const config = await member.get('/api/config');
    expect(config.body.limitDisplayName).toBe(10);

    const tooLong = await member.put('/api/profile').send({ display_name: 'a'.repeat(11) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toContain('10');

    const ok = await member.put('/api/profile').send({ display_name: 'a'.repeat(10) });
    expect(ok.status).toBe(200);
  });

  it('bio dłuższe niż limit → 400', async () => {
    await dev.post('/api/debug/settings').send({ limit_bio: 15 }).expect(200);

    const tooLong = await member.put('/api/profile').send({ bio: 'b'.repeat(16) });
    expect(tooLong.status).toBe(400);

    const ok = await member.put('/api/profile').send({ bio: 'b'.repeat(15) });
    expect(ok.status).toBe(200);
  });
});
