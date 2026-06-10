// Kategorie: tworzenie (tylko dev), widoczność zależna od trybu dostępu
// (public / roles / custom) i wpływ ograniczeń na listę filmów oraz szczegóły filmu.
//
// Uwaga: świeżo utworzona kategoria ma access_mode = 'roles' (domyślna wartość kolumny),
// więc member bez ról Discord NIE widzi jej, dopóki dev nie ustawi viewer_mode 'public'.
import { describe, it, before as beforeAll } from 'node:test';
import { expect } from 'expect';
import { seedUsers, loginAs, createVideo, USERS } from '../helpers/testApp.js';

let member, redaktor, dev;

async function createCategory(name, viewerMode = 'public') {
  const created = await dev.post('/api/categories').send({ name });
  expect(created.status).toBe(200);
  const cat = created.body.category;
  await dev.post(`/api/categories/${cat.id}/access`)
    .send({ viewer_mode: viewerMode, editor_mode: 'none', viewer_user_ids: [] })
    .expect(200);
  return cat;
}

beforeAll(async () => {
  seedUsers();
  member = await loginAs('member');
  redaktor = await loginAs('redaktor');
  dev = await loginAs('dev');
});

describe('Tworzenie kategorii', () => {
  it('dev tworzy kategorię, slug generowany z nazwy', async () => {
    const res = await dev.post('/api/categories').send({ name: 'Testowa Kategoria' });
    expect(res.status).toBe(200);
    expect(res.body.category.slug).toBe('testowa-kategoria');
  });

  it('kategoria bez nazwy → 400', async () => {
    const res = await dev.post('/api/categories').send({});
    expect(res.status).toBe(400);
  });

  it('świeża kategoria (tryb roles, brak ról) NIE jest widoczna dla membera', async () => {
    const created = await dev.post('/api/categories').send({ name: 'Swieza Kat' });
    const catId = created.body.category.id;

    const list = await member.get('/api/categories');
    expect(list.body.find(c => c.id === catId)).toBeUndefined();

    // dev widzi wszystko
    const devList = await dev.get('/api/categories');
    expect(devList.body.find(c => c.id === catId)).toBeDefined();
  });

  it('po ustawieniu viewer_mode public kategoria jest widoczna dla membera', async () => {
    const cat = await createCategory('Publiczna Kat');
    const list = await member.get('/api/categories');
    const found = list.body.find(c => c.id === cat.id);
    expect(found).toBeDefined();
    expect(found.canView).toBe(true);
  });
});

describe('Ograniczanie dostępu do kategorii (viewer_mode: custom)', () => {
  let catId, catSlug, videoId;

  beforeAll(async () => {
    const cat = await createCategory('Tajna Kategoria');
    catId = cat.id;
    catSlug = cat.slug;
    videoId = await createVideo(redaktor, { title: 'Tajny film', category_id: catId });
  });

  it('przed ograniczeniem member widzi film z kategorii', async () => {
    const res = await member.get(`/api/videos?category=${catSlug}`);
    expect(res.body.find(v => v.id === videoId)).toBeDefined();
  });

  it('po ustawieniu custom viewers (pusta lista) member traci dostęp', async () => {
    await dev.post(`/api/categories/${catId}/access`)
      .send({ viewer_mode: 'custom', editor_mode: 'none', viewer_user_ids: [] })
      .expect(200);

    // Kategoria znika z listy membera
    const cats = await member.get('/api/categories');
    expect(cats.body.find(c => c.id === catId)).toBeUndefined();

    // Film znika z listy filmów
    const list = await member.get('/api/videos');
    expect(list.body.find(v => v.id === videoId)).toBeUndefined();

    // Bezpośredni dostęp do filmu → 403
    const details = await member.get(`/api/videos/${videoId}`);
    expect(details.status).toBe(403);

    // Filtrowanie po kategorii zwraca pustą listę
    const byCat = await member.get(`/api/videos?category=${catSlug}`);
    expect(byCat.body).toEqual([]);
  });

  it('dev nadal widzi ograniczoną kategorię i film', async () => {
    const cats = await dev.get('/api/categories');
    const found = cats.body.find(c => c.id === catId);
    expect(found).toBeDefined();
    expect(found.canView).toBe(true);

    const details = await dev.get(`/api/videos/${videoId}`);
    expect(details.status).toBe(200);
  });

  it('po dodaniu membera do viewer_user_ids odzyskuje dostęp', async () => {
    await dev.post(`/api/categories/${catId}/access`)
      .send({ viewer_mode: 'custom', editor_mode: 'none', viewer_user_ids: [USERS.member.id] })
      .expect(200);

    const cats = await member.get('/api/categories');
    expect(cats.body.find(c => c.id === catId)).toBeDefined();

    const details = await member.get(`/api/videos/${videoId}`);
    expect(details.status).toBe(200);
  });
});

describe('Usuwanie kategorii', () => {
  it('po usunięciu kategorii film zostaje, ale bez kategorii', async () => {
    const cat = await createCategory('Kategoria Do Usunięcia');
    const videoId = await createVideo(redaktor, { title: 'Film osierocony', category_id: cat.id });

    await dev.del(`/api/categories/${cat.id}`).expect(200);

    const details = await dev.get(`/api/videos/${videoId}`);
    expect(details.status).toBe(200);
    expect(details.body.category_id).toBeNull();
  });
});
