// Zarządzanie użytkownikami (redaktor/dev) i rangami aplikacji.
import { describe, it, before as beforeAll } from 'node:test';
import { expect } from 'expect';
import { seedUsers, loginAs, USERS } from '../helpers/testApp.js';

let member, redaktor, dev;

beforeAll(async () => {
  seedUsers();
  member = await loginAs('member');
  redaktor = await loginAs('redaktor');
  dev = await loginAs('dev');
});

describe('Lista użytkowników', () => {
  it('redaktor widzi wszystkie konta testowe', async () => {
    const res = await redaktor.get('/api/users');
    expect(res.status).toBe(200);
    const usernames = res.body.map(u => u.username);
    expect(usernames).toContain('test-member');
    expect(usernames).toContain('test-redaktor');
    expect(usernames).toContain('test-dev');
  });
});

describe('Usuwanie użytkowników', () => {
  it('redaktor usuwa użytkownika utworzonego przez deva', async () => {
    const created = await dev.post('/api/debug/create-user')
      .send({ username: 'do-usuniecia', display_name: 'Do Usunięcia' });
    expect(created.status).toBe(200);
    const userId = created.body.user.id;

    await redaktor.del(`/api/users/${userId}`).expect(200);

    const list = await redaktor.get('/api/users');
    expect(list.body.find(u => u.id === userId)).toBeUndefined();
  });

  it('nie można usunąć własnego konta (400)', async () => {
    const res = await redaktor.del(`/api/users/${USERS.redaktor.id}`);
    expect(res.status).toBe(400);
  });

  it('usunięcie nieistniejącego użytkownika → 404', async () => {
    const res = await redaktor.del('/api/users/999999');
    expect(res.status).toBe(404);
  });
});

describe('Rangi aplikacji', () => {
  it('redaktor tworzy rangę i przypisuje ją userowi', async () => {
    const created = await redaktor.post('/api/ranks').send({ name: 'VIP', color: '#ff0000' });
    expect(created.status).toBe(200);
    const rankId = created.body.rank.id;

    await redaktor.post(`/api/users/${USERS.member.id}/ranks`).send({ rank_ids: [rankId] }).expect(200);

    const ranks = await redaktor.get(`/api/users/${USERS.member.id}/ranks`);
    expect(ranks.body.map(r => r.name)).toContain('VIP');
  });

  it('duplikat nazwy rangi → 400', async () => {
    await redaktor.post('/api/ranks').send({ name: 'Unikalna' }).expect(200);
    const dup = await redaktor.post('/api/ranks').send({ name: 'Unikalna' });
    expect(dup.status).toBe(400);
  });

  it('ranga bez nazwy → 400', async () => {
    const res = await redaktor.post('/api/ranks').send({ name: '  ' });
    expect(res.status).toBe(400);
  });

  it('member widzi listę rang, ale nie może ich tworzyć', async () => {
    const list = await member.get('/api/ranks');
    expect(list.status).toBe(200);
    const res = await member.post('/api/ranks').send({ name: 'Hakerska' });
    expect(res.status).toBe(403);
  });

  it('edycja i usunięcie rangi', async () => {
    const created = await redaktor.post('/api/ranks').send({ name: 'Tymczasowa' });
    const rankId = created.body.rank.id;

    await redaktor.put(`/api/ranks/${rankId}`).send({ name: 'Zmieniona' }).expect(200);
    let list = await member.get('/api/ranks');
    expect(list.body.find(r => r.id === rankId).name).toBe('Zmieniona');

    await redaktor.del(`/api/ranks/${rankId}`).expect(200);
    list = await member.get('/api/ranks');
    expect(list.body.find(r => r.id === rankId)).toBeUndefined();
  });
});
