// Komentarze: dodawanie, limity długości, edycja (tylko właściciel lub dev),
// soft delete (właściciel/redaktor/dev) i hard delete (tylko dev).
import { describe, it, before as beforeAll } from 'node:test';
import { expect } from 'expect';
import { seedUsers, loginAs, createVideo, anon } from '../helpers/testApp.js';

let member, redaktor, dev, videoId;

beforeAll(async () => {
  seedUsers();
  member = await loginAs('member');
  redaktor = await loginAs('redaktor');
  dev = await loginAs('dev');
  videoId = await createVideo(redaktor, { title: 'Film do komentowania' });
});

async function addComment(api, content) {
  const res = await api.post(`/api/videos/${videoId}/comments`).send({ content });
  expect(res.status).toBe(200);
  return res.body;
}

describe('Dodawanie komentarzy', () => {
  it('member dodaje komentarz i jest on widoczny na liście', async () => {
    const comment = await addComment(member, 'Świetny film!');
    expect(comment.content).toBe('Świetny film!');
    expect(comment.username).toBe('test-member');

    const list = await member.get(`/api/videos/${videoId}/comments`);
    expect(list.body.find(c => c.id === comment.id)).toBeDefined();
  });

  it('anonim nie może komentować (401)', async () => {
    const res = await anon().post(`/api/videos/${videoId}/comments`).send({ content: 'spam' });
    expect(res.status).toBe(401);
  });

  it('pusty komentarz → 400', async () => {
    const res = await member.post(`/api/videos/${videoId}/comments`).send({ content: '   ' });
    expect(res.status).toBe(400);
  });

  it('komentarz dłuższy niż limit → 400 (limit ustawiony przez deva)', async () => {
    await dev.post('/api/debug/settings').send({ limit_comment: 20 }).expect(200);

    const tooLong = await member.post(`/api/videos/${videoId}/comments`).send({ content: 'a'.repeat(21) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toContain('20');

    const ok = await member.post(`/api/videos/${videoId}/comments`).send({ content: 'a'.repeat(20) });
    expect(ok.status).toBe(200);

    // przywrócenie domyślnego limitu, żeby nie wpływać na pozostałe testy w tym pliku
    await dev.post('/api/debug/settings').send({ limit_comment: 3000 }).expect(200);
  });

  it('odpowiedź na komentarz zapisuje parent_id', async () => {
    const parent = await addComment(member, 'Komentarz nadrzędny');
    const res = await member.post(`/api/videos/${videoId}/comments`)
      .send({ content: 'Odpowiedź', parent_id: parent.id });
    expect(res.status).toBe(200);
    expect(res.body.parent_id).toBe(parent.id);
  });
});

describe('Edycja komentarzy', () => {
  it('member edytuje własny komentarz — pojawia się znacznik edycji', async () => {
    const comment = await addComment(member, 'Wersja pierwsza');
    const res = await member.put(`/api/comments/${comment.id}`).send({ content: 'Wersja druga' });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Wersja druga');
    expect(res.body.edited).toBe(1);
  });

  it('member nie może edytować cudzego komentarza (403)', async () => {
    const comment = await addComment(redaktor, 'Komentarz redaktora');
    const res = await member.put(`/api/comments/${comment.id}`).send({ content: 'Przejęty' });
    expect(res.status).toBe(403);
  });

  it('redaktor też nie może edytować cudzych komentarzy (403)', async () => {
    const comment = await addComment(member, 'Komentarz membera');
    const res = await redaktor.put(`/api/comments/${comment.id}`).send({ content: 'Przejęty' });
    expect(res.status).toBe(403);
  });

  it('dev może edytować cudzy komentarz, cicha edycja nie zostawia śladu', async () => {
    const comment = await addComment(member, 'Do cichej edycji');
    const res = await dev.put(`/api/comments/${comment.id}`).send({ content: 'Po cichej edycji', silent: true });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Po cichej edycji');
    expect(res.body.edited).toBeFalsy();
  });
});

describe('Usuwanie komentarzy', () => {
  it('member soft-usuwa własny komentarz (treść znika, wpis zostaje)', async () => {
    const comment = await addComment(member, 'Do usunięcia przez autora');
    const res = await member.del(`/api/comments/${comment.id}`);
    expect(res.status).toBe(200);
    expect(res.body.soft).toBe(true);

    const list = await member.get(`/api/videos/${videoId}/comments`);
    const deleted = list.body.find(c => c.id === comment.id);
    expect(deleted.deleted).toBe(1);
    expect(deleted.content).toBe('');
  });

  it('member nie może usunąć cudzego komentarza (403)', async () => {
    const comment = await addComment(redaktor, 'Cudzy komentarz');
    const res = await member.del(`/api/comments/${comment.id}`);
    expect(res.status).toBe(403);
  });

  it('redaktor może soft-usunąć komentarz membera', async () => {
    const comment = await addComment(member, 'Moderowany komentarz');
    const res = await redaktor.del(`/api/comments/${comment.id}`);
    expect(res.status).toBe(200);
  });

  it('hard delete: member i redaktor 403, dev usuwa całkowicie', async () => {
    const comment = await addComment(member, 'Do twardego usunięcia');

    expect((await member.del(`/api/comments/${comment.id}/hard`)).status).toBe(403);
    expect((await redaktor.del(`/api/comments/${comment.id}/hard`)).status).toBe(403);

    const res = await dev.del(`/api/comments/${comment.id}/hard`);
    expect(res.status).toBe(200);

    const list = await member.get(`/api/videos/${videoId}/comments`);
    expect(list.body.find(c => c.id === comment.id)).toBeUndefined();
  });
});
