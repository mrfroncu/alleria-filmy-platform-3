// Cykl życia filmu: tworzenie (redaktor), widoczność (member), edycja, usuwanie,
// filmy zaplanowane (przyszła data publikacji), filmy ukryte (szkice / zdjęte z widoczności)
// i historia oglądania.
import { describe, it, before as beforeAll } from 'node:test';
import { expect } from 'expect';
import { seedUsers, loginAs, createVideo, USERS } from '../helpers/testApp.js';

let member, redaktor, dev;

beforeAll(async () => {
  seedUsers();
  member = await loginAs('member');
  redaktor = await loginAs('redaktor');
  dev = await loginAs('dev');
});

describe('Tworzenie i odczyt filmów', () => {
  it('redaktor tworzy film z tagami, member go widzi na liście', async () => {
    const res = await redaktor.post('/api/videos').send({
      title: 'Film z tagami',
      author_id: USERS.redaktor.id,
      main_source: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      main_source_type: 'youtube',
      publish_date: '2020-06-01 12:00:00',
      tags: JSON.stringify([{ name: 'akcja' }, { name: 'komedia' }]),
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const videoId = res.body.id;

    const list = await member.get('/api/videos');
    expect(list.status).toBe(200);
    const found = list.body.find(v => v.id === videoId);
    expect(found).toBeDefined();
    expect(found.title).toBe('Film z tagami');
    expect(found.tags.map(t => t.name).sort()).toEqual(['akcja', 'komedia']);
  });

  it('member może otworzyć szczegóły filmu (z tagami i autorem)', async () => {
    const videoId = await createVideo(redaktor, { title: 'Szczegóły filmu' });
    const res = await member.get(`/api/videos/${videoId}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Szczegóły filmu');
    expect(res.body.author_name).toBe(USERS.redaktor.username);
    expect(Array.isArray(res.body.tags)).toBe(true);
  });

  it('nieistniejący film zwraca 404', async () => {
    const res = await member.get('/api/videos/999999');
    expect(res.status).toBe(404);
  });

  it('wyszukiwanie po tytule filtruje listę', async () => {
    await createVideo(redaktor, { title: 'UnikatowyTytulXYZ' });
    const res = await member.get('/api/videos?search=UnikatowyTytulXYZ');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].title).toBe('UnikatowyTytulXYZ');
  });
});

describe('Filmy zaplanowane (przyszła data publikacji)', () => {
  it('member nie widzi filmu z przyszłą datą, redaktor i dev widzą', async () => {
    const videoId = await createVideo(redaktor, {
      title: 'Film z przyszłości',
      publish_date: '2099-01-01 12:00:00',
    });

    const memberList = await member.get('/api/videos');
    expect(memberList.body.find(v => v.id === videoId)).toBeUndefined();

    const redaktorList = await redaktor.get('/api/videos');
    expect(redaktorList.body.find(v => v.id === videoId)).toBeDefined();

    const devList = await dev.get('/api/videos');
    expect(devList.body.find(v => v.id === videoId)).toBeDefined();
  });
});

describe('Filmy ukryte (szkic / zdjęty z widoczności)', () => {
  it('szkic: member go nie widzi (lista + szczegóły z reason=hidden), redaktor widzi', async () => {
    const videoId = await createVideo(redaktor, { title: 'Szkic filmu', is_hidden: 'true' });

    const memberList = await member.get('/api/videos');
    expect(memberList.body.find(v => v.id === videoId)).toBeUndefined();
    const details = await member.get(`/api/videos/${videoId}`);
    expect(details.status).toBe(403);
    expect(details.body.reason).toBe('hidden');
    await member.post(`/api/favorites/${videoId}`).expect(403);

    const redaktorList = await redaktor.get('/api/videos');
    expect(redaktorList.body.find(v => v.id === videoId)?.is_hidden).toBe(1);
  });

  it('publikacja szkicu przenosi datę na teraz i odsłania film memberowi', async () => {
    const videoId = await createVideo(redaktor, { title: 'Szkic do publikacji', is_hidden: 'true', publish_date: '2020-01-01T12:00:00.000Z' });
    const res = await redaktor.put(`/api/videos/${videoId}/visibility`).send({ hidden: false });
    expect(res.status).toBe(200);
    expect(res.body.is_hidden).toBe(0);
    expect(Date.now() - new Date(res.body.publish_date).getTime()).toBeLessThan(60_000);

    await member.get(`/api/videos/${videoId}`).expect(200);
  });

  it('ukrycie opublikowanego filmu i przywrócenie zachowuje oryginalną datę', async () => {
    const videoId = await createVideo(redaktor, { title: 'Zdejmowany film', publish_date: '2020-03-01T12:00:00.000Z' });
    await member.get(`/api/videos/${videoId}`).expect(200);

    await redaktor.put(`/api/videos/${videoId}/visibility`).send({ hidden: true }).expect(200);
    expect((await member.get(`/api/videos/${videoId}`)).status).toBe(403);
    expect((await member.get('/api/videos')).body.find(v => v.id === videoId)).toBeUndefined();

    const res = await redaktor.put(`/api/videos/${videoId}/visibility`).send({ hidden: false });
    expect(res.body.publish_date).toBe('2020-03-01T12:00:00.000Z');
    await member.get(`/api/videos/${videoId}`).expect(200);
  });

  it('member nie może zmieniać widoczności', async () => {
    const videoId = await createVideo(redaktor, { title: 'Nie dla membera' });
    await member.put(`/api/videos/${videoId}/visibility`).send({ hidden: true }).expect(403);
  });

  it('akcje masowe hide/show', async () => {
    const a = await createVideo(redaktor, { title: 'Masowy A' });
    const b = await createVideo(redaktor, { title: 'Masowy B' });
    const hide = await redaktor.post('/api/videos/bulk').send({ action: 'hide', video_ids: [a, b] });
    expect(hide.body.changes).toBe(2);
    const listHidden = (await member.get('/api/videos')).body;
    expect(listHidden.find(v => v.id === a || v.id === b)).toBeUndefined();

    const show = await redaktor.post('/api/videos/bulk').send({ action: 'show', video_ids: [a, b] });
    expect(show.body.changes).toBe(2);
    const listShown = (await member.get('/api/videos')).body;
    expect(listShown.filter(v => v.id === a || v.id === b).length).toBe(2);
  });

  it('edycja bez pola is_hidden nie zmienia widoczności', async () => {
    const videoId = await createVideo(redaktor, { title: 'Ukryty przy edycji', is_hidden: 'true' });
    await redaktor.put(`/api/videos/${videoId}`).send({
      title: 'Ukryty po edycji',
      author_id: USERS.redaktor.id,
      main_source: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      main_source_type: 'youtube',
      publish_date: '2020-06-01 12:00:00',
    }).expect(200);
    expect((await member.get(`/api/videos/${videoId}`)).body.reason).toBe('hidden');
  });
});

describe('Edycja i usuwanie filmów', () => {
  it('redaktor edytuje film (tytuł i tagi)', async () => {
    const videoId = await createVideo(redaktor, { title: 'Przed edycją' });
    const res = await redaktor.put(`/api/videos/${videoId}`).send({
      title: 'Po edycji',
      author_id: USERS.redaktor.id,
      main_source: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      main_source_type: 'youtube',
      publish_date: '2020-06-01 12:00:00',
      tags: JSON.stringify([{ name: 'nowy-tag' }]),
    });
    expect(res.status).toBe(200);

    const after = await member.get(`/api/videos/${videoId}`);
    expect(after.body.title).toBe('Po edycji');
    expect(after.body.tags.map(t => t.name)).toEqual(['nowy-tag']);
  });

  it('edycja nieistniejącego filmu zwraca 404', async () => {
    const res = await redaktor.put('/api/videos/999999').send({ title: 'X' });
    expect(res.status).toBe(404);
  });

  it('redaktor usuwa film — znika z listy i szczegółów', async () => {
    const videoId = await createVideo(redaktor, { title: 'Do usunięcia' });
    await redaktor.del(`/api/videos/${videoId}`).expect(200);

    const details = await redaktor.get(`/api/videos/${videoId}`);
    expect(details.status).toBe(404);
    const list = await member.get('/api/videos');
    expect(list.body.find(v => v.id === videoId)).toBeUndefined();
  });
});

describe('Historia oglądania', () => {
  it('otwarcie filmu przez membera zapisuje się w jego historii', async () => {
    const videoId = await createVideo(redaktor, { title: 'Film do historii' });
    await member.get(`/api/videos/${videoId}`).expect(200);

    const history = await member.get('/api/history');
    expect(history.status).toBe(200);
    expect(history.body.find(h => h.id === videoId)).toBeDefined();

    // Historia jest osobista — dev nie widzi tego wpisu u siebie
    const devHistory = await dev.get('/api/history');
    expect(devHistory.body.find(h => h.id === videoId)).toBeUndefined();
  });
});
