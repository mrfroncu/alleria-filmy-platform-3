// @wzmianki w komentarzach: powiadomienia (tylko dla osób z dostępem do filmu, bez duplikatów)
// i podpowiedzi osób do wzmianki.
import { describe, it, before as beforeAll } from 'node:test';
import { expect } from 'expect';
import { seedUsers, loginAs, createVideo, USERS } from '../helpers/testApp.js';

let member, redaktor, dev;
let publicVideo, restrictedVideo;

const mention = (key) => `@[${USERS[key].display_name}](${USERS[key].id})`;

async function mentionNotifications(agent) {
  const res = await agent.get('/api/notifications');
  expect(res.status).toBe(200);
  return res.body.notifications.filter(n => n.type === 'comment_mention');
}

beforeAll(async () => {
  seedUsers();
  member = await loginAs('member');
  redaktor = await loginAs('redaktor');
  dev = await loginAs('dev');
  publicVideo = await createVideo(dev);
  // Świeża kategoria ma tryb 'roles' bez ról — widzi ją tylko dev.
  const cat = await dev.post('/api/categories').send({ name: 'Wzmianki Tajne' });
  restrictedVideo = await createVideo(dev, { category_id: cat.body.category.id });
});

describe('Powiadomienia o wzmiankach', () => {
  it('wzmianka tworzy powiadomienie z linkiem do komentarza', async () => {
    const res = await redaktor.post(`/api/videos/${publicVideo}/comments`).send({ content: `Zobacz to ${mention('member')}!` });
    expect(res.status).toBe(200);
    const notes = await mentionNotifications(member);
    expect(notes.length).toBe(1);
    expect(notes[0].url).toBe(`/video/${publicVideo}#comment-${res.body.id}`);
    expect(notes[0].body).toContain(USERS.redaktor.display_name);
  });

  it('wzmianka samego siebie nie tworzy powiadomienia', async () => {
    const before = (await mentionNotifications(redaktor)).length;
    await redaktor.post(`/api/videos/${publicVideo}/comments`).send({ content: `notatka ${mention('redaktor')}` }).expect(200);
    expect((await mentionNotifications(redaktor)).length).toBe(before);
  });

  it('osoba bez dostępu do filmu nie dostaje powiadomienia', async () => {
    const before = (await mentionNotifications(member)).length;
    await dev.post(`/api/videos/${restrictedVideo}/comments`).send({ content: `hej ${mention('member')}` }).expect(200);
    expect((await mentionNotifications(member)).length).toBe(before);
  });

  it('edycja powiadamia tylko nowo wspomniane osoby', async () => {
    const created = await member.post(`/api/videos/${publicVideo}/comments`).send({ content: `cześć ${mention('redaktor')}` });
    const redaktorBefore = (await mentionNotifications(redaktor)).length;
    const devBefore = (await mentionNotifications(dev)).length;
    expect(redaktorBefore).toBeGreaterThan(0);

    await member.put(`/api/comments/${created.body.id}`).send({ content: `cześć ${mention('redaktor')} i ${mention('dev')}` }).expect(200);
    expect((await mentionNotifications(redaktor)).length).toBe(redaktorBefore);
    expect((await mentionNotifications(dev)).length).toBe(devBefore + 1);
  });

  it('odpowiedź ze wzmianką autora rodzica → jedno powiadomienie (odpowiedź), nie dwa', async () => {
    const parent = await member.post(`/api/videos/${publicVideo}/comments`).send({ content: 'pytanie' });
    const mentionsBefore = (await mentionNotifications(member)).length;
    await redaktor.post(`/api/videos/${publicVideo}/comments`).send({ content: `${mention('member')} odpowiedź`, parent_id: parent.body.id }).expect(200);
    expect((await mentionNotifications(member)).length).toBe(mentionsBefore);
    const all = (await member.get('/api/notifications')).body.notifications;
    expect(all[0].type).toBe('comment_reply');
    expect(all[0].url).toContain(`#comment-`);
  });
});

describe('Podpowiedzi osób do wzmianki', () => {
  it('zwraca pasujące osoby z dostępem, bez pytającego', async () => {
    const res = await member.get(`/api/videos/${publicVideo}/mentionable?q=Testowy`);
    expect(res.status).toBe(200);
    const ids = res.body.map(u => u.id);
    expect(ids).toContain(USERS.redaktor.id);
    expect(ids).not.toContain(USERS.member.id);
    expect(res.body[0]).toHaveProperty('display_name');
  });

  it('na filmie z ograniczonym dostępem nie podpowiada osób bez dostępu', async () => {
    const res = await dev.get(`/api/videos/${restrictedVideo}/mentionable?q=`);
    expect(res.status).toBe(200);
    expect(res.body.map(u => u.id)).not.toContain(USERS.member.id);
  });

  it('bez dostępu do filmu → 403', async () => {
    const res = await member.get(`/api/videos/${restrictedVideo}/mentionable?q=a`);
    expect(res.status).toBe(403);
  });

  it('znaki % i _ są traktowane dosłownie', async () => {
    const res = await member.get(`/api/videos/${publicVideo}/mentionable?q=${encodeURIComponent('%')}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
