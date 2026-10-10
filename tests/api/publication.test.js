// Publikacja i powiadomienia: automatyczne ogłoszenie filmu (webhook Discord) przy publikacji
// szkicu z datą w przyszłości, dziennik wysyłek, błędy Discorda i ręczne ponowienie.
// Webhook trafia do lokalnego serwera HTTP zamiast do Discorda.
import { describe, it, before as beforeAll, after as afterAll } from 'node:test';
import { expect } from 'expect';
import http from 'node:http';
import { createRequire } from 'node:module';
import { seedUsers, loginAs, createVideo, db, USERS } from '../helpers/testApp.js';

const require = createRequire(import.meta.url);
const { runPublicationAnnouncements } = require('../../backend/jobs.js');

let member, redaktor;
let server, hookUrl;
const received = [];
let nextStatus = 204;

beforeAll(async () => {
  seedUsers();
  member = await loginAs('member');
  redaktor = await loginAs('redaktor');

  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      received.push(JSON.parse(body || '{}'));
      res.statusCode = nextStatus;
      res.end(nextStatus === 204 ? '' : '{"message": "Unknown Webhook", "code": 10015}');
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  hookUrl = `http://127.0.0.1:${server.address().port}/hook`;

  // Lokalny serwer to nie discord.com — wyłączamy ograniczenie domen tylko w teście.
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('webhook_domain_restriction', '0') ON CONFLICT(key) DO UPDATE SET value = '0'").run();
});

afterAll(() => new Promise(r => server.close(r)));

function makeCategory(name) {
  return db.prepare(`INSERT INTO categories (name, slug, access_mode, webhook_url, webhook_enabled) VALUES (?, ?, 'public:none', ?, 1)`)
    .run(name, name.toLowerCase().replace(/\s+/g, '-'), hookUrl).lastInsertRowid;
}

const editBody = (overrides) => ({
  title: 'Szkic z webhookiem',
  author_id: USERS.redaktor.id,
  main_source: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  main_source_type: 'youtube',
  ...overrides,
});

const webhookLog = (videoId) => db.prepare("SELECT * FROM video_notification_log WHERE video_id = ? AND channel = 'webhook' ORDER BY id").all(videoId);

describe('Szkic → opublikowany z datą w przyszłości → webhook w momencie publikacji', () => {
  it('webhook idzie dopiero gdy minie data, dokładnie raz, i trafia do dziennika', async () => {
    const catId = makeCategory('Kategoria Webhook');
    const videoId = await createVideo(redaktor, { title: 'Szkic z webhookiem', category_id: catId, is_hidden: 'true' });

    // Szkic: nic nie wychodzi.
    await runPublicationAnnouncements();
    expect(received.length).toBe(0);

    // Zmiana na opublikowany, data za 20 minut (jak w zgłoszeniu).
    const future = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    await redaktor.put(`/api/videos/${videoId}`).send(editBody({ category_id: catId, publish_date: future, is_hidden: 'false' })).expect(200);
    await runPublicationAnnouncements();
    expect(received.length).toBe(0);

    // Mija 20 minut.
    db.prepare('UPDATE videos SET publish_date = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), videoId);
    await runPublicationAnnouncements();
    expect(received.length).toBe(1);
    expect(JSON.stringify(received[0])).toContain('Szkic z webhookiem');

    const log = webhookLog(videoId);
    expect(log.length).toBe(1);
    expect(log[0]).toMatchObject({ status: 'sent', trigger: 'auto' });

    // Kolejny tick nie wysyła drugi raz.
    await runPublicationAnnouncements();
    expect(received.length).toBe(1);
  });

  it('błąd Discorda (HTTP 404) jest zapisany jako failed, ręczne ponowienie wysyła ponownie', async () => {
    const catId = makeCategory('Kategoria Bledna');
    nextStatus = 404;
    const before = received.length;
    const videoId = await createVideo(redaktor, { title: 'Film z błędnym webhookiem', category_id: catId, is_hidden: 'true' });
    await redaktor.put(`/api/videos/${videoId}/visibility`).send({ hidden: false }).expect(200);
    await runPublicationAnnouncements();
    expect(received.length).toBe(before + 1);
    expect(webhookLog(videoId)[0]).toMatchObject({ status: 'failed' });
    expect(webhookLog(videoId)[0].detail).toContain('HTTP 404');

    nextStatus = 204;
    const res = await redaktor.post(`/api/videos/${videoId}/notifications/resend`).send({ channels: ['webhook'] });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([expect.objectContaining({ channel: 'webhook', status: 'sent' })]);
    expect(received.length).toBe(before + 2);
    expect(webhookLog(videoId).at(-1)).toMatchObject({ status: 'sent', trigger: 'manual', user_id: USERS.redaktor.id });
  });
});

describe('Panel publikacji', () => {
  it('pokazuje stan, konfigurację kanałów i dziennik', async () => {
    const catId = makeCategory('Kategoria Panel');
    const videoId = await createVideo(redaktor, { title: 'Film w panelu', category_id: catId });
    await new Promise(r => setTimeout(r, 200)); // natychmiastowe ogłoszenie przy tworzeniu jest asynchroniczne

    const res = await redaktor.get(`/api/videos/${videoId}/publication`);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('published');
    expect(res.body.video.announced).toBe(true);
    expect(res.body.pending).toBeNull();
    expect(res.body.channels.webhook).toMatchObject({ enabled: true, configured: true, host: '127.0.0.1' });
    expect(res.body.channels.email.enabled).toBe(false);
    const channels = res.body.log.map(l => l.channel).sort();
    expect(channels).toEqual(['bell', 'email', 'push', 'webhook']);
    expect(res.body.log.find(l => l.channel === 'email').status).toBe('skipped');
  });

  it('szkic: oczekuje na ręczną publikację, ponowienie zablokowane', async () => {
    const videoId = await createVideo(redaktor, { title: 'Szkic w panelu', is_hidden: 'true' });
    const res = await redaktor.get(`/api/videos/${videoId}/publication`);
    expect(res.body).toMatchObject({ state: 'hidden', pending: 'hidden', resend_blocked: 'hidden' });
    const resend = await redaktor.post(`/api/videos/${videoId}/notifications/resend`).send({ channels: ['webhook'] });
    expect(resend.status).toBe(409);
  });

  it('member nie ma dostępu do panelu ani ponowienia', async () => {
    const videoId = await createVideo(redaktor, { title: 'Panel tylko admin' });
    await member.get(`/api/videos/${videoId}/publication`).expect(403);
    await member.post(`/api/videos/${videoId}/notifications/resend`).send({ channels: ['bell'] }).expect(403);
  });
});
