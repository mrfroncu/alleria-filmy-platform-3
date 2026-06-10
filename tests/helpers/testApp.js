// Wspólny helper testów API.
// Importuje aplikację Express z backendu (bez uruchamiania serwera HTTP)
// i dostarcza "agentów" symulujących zalogowanych użytkowników o różnych rolach.
import '../setup-env.js'; // MUSI być pierwszym importem — ustawia NODE_ENV=test, DB_PATH i SESSION_SECRET
import { createRequire } from 'node:module';
import supertest from 'supertest';

const require = createRequire(import.meta.url);
const { app, db } = require('../../backend/server.js');

// Testowa trasa logowania — rejestrowana wyłącznie z kodu testów, nie istnieje w produkcji.
// Ustawia req.session.user dokładnie tak, jak robi to prawdziwy callback Discord OAuth.
app.post('/__test/login', (req, res) => {
  req.session.user = req.body;
  req.session.save(() => res.json({ ok: true }));
});

// Konta testowe. Uwaga: "redaktor" w UI odpowiada roli 'admin' w backendzie.
export const USERS = {
  member: { id: 101, username: 'test-member', display_name: 'Testowy Member', role: 'member', discord_roles: [] },
  redaktor: { id: 102, username: 'test-redaktor', display_name: 'Testowy Redaktor', role: 'admin', discord_roles: [] },
  dev: { id: 103, username: 'test-dev', display_name: 'Testowy Dev', role: 'dev', discord_roles: [] },
};

// Wstawia konta testowe do bazy (endpointy robią JOIN-y na tabeli users)
export function seedUsers() {
  const stmt = db.prepare('INSERT OR IGNORE INTO users (id, discord_id, username, display_name, role) VALUES (?, ?, ?, ?, ?)');
  for (const u of Object.values(USERS)) stmt.run(u.id, `discord-${u.id}`, u.username, u.display_name, u.role);
}

// Backend wymaga nagłówka X-Requested-With na żądaniach zmieniających stan (ochrona CSRF) —
// wrapper dokleja go automatycznie, .raw daje dostęp do agenta bez nagłówka.
function wrap(agent) {
  return {
    get: (url) => agent.get(url),
    post: (url) => agent.post(url).set('X-Requested-With', 'XMLHttpRequest'),
    put: (url) => agent.put(url).set('X-Requested-With', 'XMLHttpRequest'),
    del: (url) => agent.delete(url).set('X-Requested-With', 'XMLHttpRequest'),
    raw: agent,
  };
}

// Agent niezalogowany
export function anon() {
  return wrap(supertest.agent(app));
}

// Agent zalogowany jako member / redaktor / dev (sesja trzymana w cookie agenta)
export async function loginAs(roleKey, overrides = {}) {
  if (!USERS[roleKey]) throw new Error(`Nieznana rola testowa: ${roleKey}`);
  const agent = supertest.agent(app);
  const res = await agent.post('/__test/login').send({ ...USERS[roleKey], ...overrides });
  if (res.status !== 200) throw new Error(`Logowanie testowe nie powiodło się: ${res.status}`);
  return wrap(agent);
}

// Tworzy film przez API (jako podany agent z uprawnieniami redaktora/deva) i zwraca jego id
export async function createVideo(api, overrides = {}) {
  const res = await api.post('/api/videos').send({
    title: `Film testowy ${Math.random().toString(36).slice(2, 8)}`,
    author_id: USERS.redaktor.id,
    main_source: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    main_source_type: 'youtube',
    publish_date: '2020-01-01 12:00:00',
    ...overrides,
  });
  if (res.status !== 200 || !res.body.id) {
    throw new Error(`createVideo nie powiodło się: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.id;
}

export { app, db };
