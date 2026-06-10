// Ulubione filmy oraz postęp oglądania ("kontynuuj oglądanie").
import { describe, it, before as beforeAll } from 'node:test';
import { expect } from 'expect';
import { seedUsers, loginAs, createVideo } from '../helpers/testApp.js';

let member, redaktor, videoId;

beforeAll(async () => {
  seedUsers();
  member = await loginAs('member');
  redaktor = await loginAs('redaktor');
  videoId = await createVideo(redaktor, { title: 'Film do ulubionych' });
});

describe('Ulubione', () => {
  it('dodanie, sprawdzenie, lista i usunięcie ulubionego', async () => {
    await member.post(`/api/favorites/${videoId}`).expect(200);

    const check = await member.get(`/api/favorites/check/${videoId}`);
    expect(check.body.isFavorite).toBe(true);
    expect(check.body.count).toBe(1);

    const list = await member.get('/api/favorites');
    expect(list.body.find(v => v.id === videoId)).toBeDefined();

    await member.del(`/api/favorites/${videoId}`).expect(200);
    const after = await member.get(`/api/favorites/check/${videoId}`);
    expect(after.body.isFavorite).toBe(false);
  });

  it('ulubione są osobiste — redaktor nie widzi ulubionych membera', async () => {
    await member.post(`/api/favorites/${videoId}`).expect(200);
    const list = await redaktor.get('/api/favorites');
    expect(list.body.find(v => v.id === videoId)).toBeUndefined();
    await member.del(`/api/favorites/${videoId}`).expect(200);
  });

  it('ponowne dodanie tego samego filmu nie duplikuje wpisu', async () => {
    await member.post(`/api/favorites/${videoId}`).expect(200);
    await member.post(`/api/favorites/${videoId}`).expect(200);
    const check = await member.get(`/api/favorites/check/${videoId}`);
    expect(check.body.count).toBe(1);
    await member.del(`/api/favorites/${videoId}`).expect(200);
  });
});

describe('Postęp oglądania', () => {
  it('zapis i odczyt pozycji filmu', async () => {
    await member.put(`/api/progress/${videoId}`).send({ position: 100, duration: 300 }).expect(200);

    const row = await member.get(`/api/progress/${videoId}`);
    expect(row.body.position).toBe(100);
    expect(row.body.duration).toBe(300);
  });

  it('film w ~33% pojawia się na liście "kontynuuj oglądanie"', async () => {
    await member.put(`/api/progress/${videoId}`).send({ position: 100, duration: 300 }).expect(200);
    const list = await member.get('/api/progress');
    expect(list.body.find(p => p.video_id === videoId)).toBeDefined();
  });

  it('film obejrzany w >90% znika z listy "kontynuuj oglądanie"', async () => {
    await member.put(`/api/progress/${videoId}`).send({ position: 295, duration: 300 }).expect(200);
    const list = await member.get('/api/progress');
    expect(list.body.find(p => p.video_id === videoId)).toBeUndefined();
  });

  it('brak parametrów → 400', async () => {
    const res = await member.put(`/api/progress/${videoId}`).send({});
    expect(res.status).toBe(400);
  });

  it('wyczyszczenie całego postępu', async () => {
    await member.put(`/api/progress/${videoId}`).send({ position: 100, duration: 300 }).expect(200);
    const res = await member.del('/api/progress');
    expect(res.status).toBe(200);
    const row = await member.get(`/api/progress/${videoId}`);
    expect(row.body).toBeNull();
  });
});
