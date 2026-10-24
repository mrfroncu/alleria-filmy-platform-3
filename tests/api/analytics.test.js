// Analityka filmu: zdarzenia odtwarzacza ze źródłem, osobne wersje alternatywne, sesje źródeł.
import { describe, it, before as beforeAll } from 'node:test';
import { expect } from 'expect';
import { seedUsers, loginAs, createVideo, db } from '../helpers/testApp.js';

let member, redaktor, dev, videoId;

const sid = (s) => `test-session-${s}`;

beforeAll(async () => {
  seedUsers();
  member = await loginAs('member');
  redaktor = await loginAs('redaktor');
  dev = await loginAs('dev');
  videoId = await createVideo(redaktor, {
    title: 'Film z wersją alternatywną',
    mirror1_name: 'Mirror YT', mirror1_url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', mirror1_type: 'link',
    mirror2_name: 'Wersja reżyserska', mirror2_url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb', mirror2_type: 'link', mirror2_is_alt: '1',
  });

  // member: ogląda główne źródło, potem przełącza się na wersję alternatywną
  await member.post(`/api/videos/${videoId}/playback-events`).send({
    events: [{ event_type: 'pause', position: 30, source_key: 'main' }],
    session: { id: sid('m1'), view_id: 'test-view-m', source_key: 'main', start_position: 0, end_position: 60, max_position: 60, duration: 100, watched_delta: 60 },
  }).expect(200);
  await member.post(`/api/videos/${videoId}/playback-events`).send({
    events: [{ event_type: 'pause', position: 150, source_key: 'mirror2' }],
    session: { id: sid('m2'), view_id: 'test-view-m', source_key: 'mirror2', start_position: 60, end_position: 160, max_position: 160, duration: 200, watched_delta: 100 },
  }).expect(200);
  // kolejny flush tej samej sesji dolicza czas i przesuwa pozycję końcową
  await member.post(`/api/videos/${videoId}/playback-events`).send({
    events: [],
    session: { id: sid('m2'), view_id: 'test-view-m', source_key: 'mirror2', start_position: 60, end_position: 180, max_position: 180, duration: 200, watched_delta: 20 },
  }).expect(200);
});

describe('Zapis zdarzeń ze źródłem', () => {
  it('is_alt pochodzi z filmu, nie od klienta', () => {
    const rows = db.prepare('SELECT source_key, is_alt FROM video_playback_events WHERE video_id = ? ORDER BY position').all(videoId);
    expect(rows).toEqual([{ source_key: 'main', is_alt: 0 }, { source_key: 'mirror2', is_alt: 1 }]);
  });

  it('sesja jest sumowana przy kolejnych flushach', () => {
    const s = db.prepare('SELECT watched_seconds, end_position, source_label, is_alt FROM video_source_sessions WHERE session_id = ?').get(sid('m2'));
    expect(s).toEqual({ watched_seconds: 120, end_position: 180, source_label: 'Wersja reżyserska', is_alt: 1 });
  });

  it('cudza sesja (ten sam id) nie jest nadpisywana', async () => {
    await dev.post(`/api/videos/${videoId}/playback-events`).send({
      events: [],
      session: { id: sid('m1'), view_id: 'test-view-d', source_key: 'main', end_position: 99, watched_delta: 999 },
    }).expect(200);
    const s = db.prepare('SELECT user_id, watched_seconds, end_position FROM video_source_sessions WHERE session_id = ?').get(sid('m1'));
    expect(s).toEqual({ user_id: 101, watched_seconds: 60, end_position: 60 });
  });

  it('nieznany klucz źródła zapisuje zdarzenie bez źródła', async () => {
    const other = await createVideo(redaktor, { title: 'Film bez mirrorów' });
    await member.post(`/api/videos/${other}/playback-events`).send({ events: [{ event_type: 'play', position: 1, source_key: '../x' }] }).expect(200);
    const row = db.prepare('SELECT source_key, is_alt FROM video_playback_events WHERE video_id = ?').get(other);
    expect(row).toEqual({ source_key: null, is_alt: 0 });
  });
});

describe('Odczyt analityki per wersja', () => {
  it('film i wersja alternatywna mają osobne heatmapy i długość', async () => {
    const main = await redaktor.get(`/api/videos/${videoId}/analytics`).expect(200);
    expect(main.body.versions.map(v => v.key)).toEqual(['main', 'mirror2']);
    expect(main.body.version).toBe('main');
    expect(main.body.heatmap.duration).toBe(100);
    expect(main.body.heatmap.pauses).toEqual([30]);

    const alt = await redaktor.get(`/api/videos/${videoId}/analytics?version=mirror2`).expect(200);
    expect(alt.body.version).toBe('mirror2');
    expect(alt.body.heatmap.duration).toBe(200);
    expect(alt.body.heatmap.pauses).toEqual([150]);
    expect(alt.body.heatmap.furthest).toEqual([180]);
  });

  it('pozycje są dokładne, a koniec filmu z tolerancją liczy się jako obejrzany do końca', async () => {
    const v = await createVideo(redaktor, { title: 'Film 4:17' });
    await member.post(`/api/videos/${v}/playback-events`).send({
      events: [{ event_type: 'pause', position: 123.456, source_key: 'main' }],
      session: { id: sid('end-1'), view_id: 'test-view-end1', source_key: 'main', start_position: 0, end_position: 256.4, max_position: 256.4, duration: 257, watched_delta: 256 },
    }).expect(200);
    await dev.post(`/api/videos/${v}/playback-events`).send({
      events: [],
      session: { id: sid('end-2'), view_id: 'test-view-end2', source_key: 'main', start_position: 0, end_position: 201.3, max_position: 201.3, duration: 257, watched_delta: 201 },
    }).expect(200);
    const r = await redaktor.get(`/api/videos/${v}/analytics`).expect(200);
    expect(r.body.heatmap.duration).toBe(257);
    expect(r.body.heatmap.pauses).toEqual([123.5]);
    expect(r.body.heatmap.furthest).toEqual([201.3, 257]);
    expect(r.body.summary.avgCompletionPct).toBe(89);
  });

  it('zwykły mirror nie jest osobną wersją', async () => {
    const r = await redaktor.get(`/api/videos/${videoId}/analytics?version=mirror1`).expect(200);
    expect(r.body.version).toBe('main');
  });

  it('użycie źródeł: udział, przełączenia i oś czasu wizyty', async () => {
    const r = await redaktor.get(`/api/videos/${videoId}/analytics?user_ids=101`).expect(200);
    const { sources, switches, visits } = r.body.sourceUsage;
    expect(sources.map(s => [s.key, s.watchedSeconds, s.users])).toEqual([['mirror2', 120, 1], ['main', 60, 1]]);
    expect(switches).toEqual([{ from: 'Główne źródło', to: 'Wersja reżyserska', count: 1 }]);
    const visit = visits.find(v => v.viewId === 'test-view-m');
    expect(visit.segments.map(s => s.sourceKey)).toEqual(['main', 'mirror2']);
  });

  it('member nie ma dostępu do analityki', async () => {
    await member.get(`/api/videos/${videoId}/analytics`).expect(403);
  });
});

describe('Reset analityki', () => {
  it('usuwa też sesje źródeł', async () => {
    const r = await redaktor.del(`/api/videos/${videoId}/analytics`).send({ user_ids: [101] }).expect(200);
    expect(r.body.deletedSessions).toBe(2);
    expect(db.prepare('SELECT COUNT(*) AS c FROM video_source_sessions WHERE video_id = ? AND user_id = 101').get(videoId).c).toBe(0);
  });
});
