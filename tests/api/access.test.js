// Macierz uprawnień: każdy endpoint × każda rola (anon / member / redaktor / dev).
// To jest główny test regresji kontroli dostępu — jeśli ktoś przypadkiem zmieni
// requireAuth/requireAdmin/requireDev na endpointzie, ten plik to wyłapie.
import { describe, it, before as beforeAll } from 'node:test';
import { expect } from 'expect';
import { seedUsers, anon, loginAs } from '../helpers/testApp.js';

// [metoda, ścieżka, { rola: oczekiwany status }]
// Brak roli w obiekcie = nie testujemy (np. sukces POST testowany w dedykowanym pliku,
// żeby nie zostawiać śmieci / nie wymagać pełnego payloadu).
const MATRIX = [
  ['GET', '/api/health', { anon: 200, member: 200, redaktor: 200, dev: 200 }],

  // Wymaga zalogowania (dowolna rola)
  ['GET', '/api/config', { anon: 401, member: 200, redaktor: 200, dev: 200 }],
  ['GET', '/api/version', { anon: 401, member: 200 }],
  ['GET', '/api/videos', { anon: 401, member: 200, redaktor: 200, dev: 200 }],
  ['GET', '/api/tags', { anon: 401, member: 200 }],
  ['GET', '/api/categories', { anon: 401, member: 200 }],
  ['GET', '/api/ranks', { anon: 401, member: 200 }],
  ['GET', '/api/authors', { anon: 401, member: 200 }],
  ['GET', '/api/stats', { anon: 401, member: 200 }],
  ['GET', '/api/profile', { anon: 401, member: 200 }],
  ['GET', '/api/favorites', { anon: 401, member: 200 }],
  ['GET', '/api/history', { anon: 401, member: 200 }],
  ['GET', '/api/progress', { anon: 401, member: 200 }],

  // Redaktor (admin) lub dev
  ['GET', '/api/users', { anon: 401, member: 403, redaktor: 200, dev: 200 }],
  ['GET', '/api/users/all', { anon: 401, member: 403, redaktor: 200, dev: 200 }],
  ['GET', '/api/logs/watch', { anon: 401, member: 403, redaktor: 200, dev: 200 }],
  ['GET', '/api/logs/login', { anon: 401, member: 403, redaktor: 200, dev: 200 }],
  ['GET', '/api/logs/watch-party', { anon: 401, member: 403, redaktor: 200, dev: 200 }],
  ['POST', '/api/videos', { anon: 401, member: 403 }],
  ['PUT', '/api/videos/999999', { anon: 401, member: 403 }],
  ['DELETE', '/api/videos/999999', { anon: 401, member: 403 }],
  ['DELETE', '/api/tags/999999', { anon: 401, member: 403 }],
  ['POST', '/api/ranks', { anon: 401, member: 403 }],
  ['POST', '/api/videos/bulk', { anon: 401, member: 403 }],

  // Tylko dev
  ['GET', '/api/audit-logs', { anon: 401, member: 403, redaktor: 403, dev: 200 }],
  ['GET', '/api/debug/settings', { anon: 401, member: 403, redaktor: 403, dev: 200 }],
  ['GET', '/api/debug/export', { anon: 401, member: 403, redaktor: 403, dev: 200 }],
  ['GET', '/api/admin/watch-parties', { anon: 401, member: 403, redaktor: 403, dev: 200 }],
  ['POST', '/api/categories', { anon: 401, member: 403, redaktor: 403 }],
  ['PUT', '/api/categories/999999', { anon: 401, member: 403, redaktor: 403 }],
  ['DELETE', '/api/categories/999999', { anon: 401, member: 403, redaktor: 403 }],
  ['POST', '/api/debug/sql', { anon: 401, member: 403, redaktor: 403 }],
  ['POST', '/api/debug/create-user', { anon: 401, member: 403, redaktor: 403 }],
  ['POST', '/api/debug/clear', { anon: 401, member: 403, redaktor: 403 }],
  ['POST', '/api/comments/admin', { anon: 401, member: 403, redaktor: 403 }],
  ['DELETE', '/api/comments/999999/hard', { anon: 401, member: 403, redaktor: 403 }],
];

const agents = {};

beforeAll(async () => {
  seedUsers();
  agents.anon = anon();
  agents.member = await loginAs('member');
  agents.redaktor = await loginAs('redaktor');
  agents.dev = await loginAs('dev');
});

function call(agent, method, url) {
  switch (method) {
    case 'GET': return agent.get(url);
    case 'POST': return agent.post(url).send({});
    case 'PUT': return agent.put(url).send({});
    case 'DELETE': return agent.del(url);
    default: throw new Error(`Nieobsługiwana metoda: ${method}`);
  }
}

describe('Macierz uprawnień endpointów', () => {
  for (const [method, url, expectations] of MATRIX) {
    for (const [role, status] of Object.entries(expectations)) {
      it(`${method} ${url} jako ${role} → ${status}`, async () => {
        const res = await call(agents[role], method, url);
        expect(res.status).toBe(status);
      });
    }
  }
});
