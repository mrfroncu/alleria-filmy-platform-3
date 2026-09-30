import { api } from './api';

// Same part size as video uploads (VideoModal.jsx) — safely under Cloudflare's 100 MB request cap.
const CHUNK_SIZE = 50 * 1024 * 1024;

// Shared by Dev Tools → Debug and the setup wizard's restore option (WelcomeStep.jsx).
// `chunked` follows the same chunked_upload setting as video uploads; onProgress gets a
// ready-to-show label. Reads just the head of the file first to catch an obviously wrong pick
// before uploading hundreds of MB.
export async function importDatabaseFile(file, { chunked = true, onProgress = () => {} } = {}) {
  const head = await file.slice(0, 4096).text();
  if (!head.trimStart().startsWith('{')) throw new Error('To nie jest plik JSON z eksportu bazy.');
  const mb = (b) => (b / 1024 / 1024).toFixed(1);

  if (!chunked) {
    onProgress(`Wysyłanie (${mb(file.size)} MB)...`);
    return api.importDB(file);
  }

  const total = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  const { upload_id } = await api.importDbInit(file.size, total);
  for (let i = 0; i < total; i++) {
    const part = file.slice(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, file.size));
    onProgress(`Wysyłanie części ${i + 1}/${total} (${mb(file.size)} MB)...`);
    await api.importDbChunk(upload_id, i, part);
  }
  onProgress('Importowanie danych...');
  return api.importDbComplete(upload_id);
}

export function describeImport(r) {
  const parts = [`${r.rows} wierszy w ${r.tables} tabelach`];
  if (r.meta?.app_version) parts.push(`eksport z wersji ${r.meta.app_version}`);
  if (r.skippedTables?.length) parts.push(`nieznane tabele pominięte: ${r.skippedTables.join(', ')}`);
  const cols = Object.entries(r.skippedColumns || {});
  if (cols.length) parts.push(`nieznane kolumny pominięte: ${cols.map(([t, c]) => `${t}.${c.join('/')}`).join(', ')}`);
  if (r.backup) parts.push(`kopia poprzedniej bazy: backups/${r.backup}`);
  return parts.join(' · ');
}

// The import swaps the users table, so the in-memory AuthContext is stale either way — a hard
// navigation reloads it (and sends the dev to log in again if their account wasn't in the export).
export function reloadAfterImport(r) {
  window.location.href = r.relogin ? '/login' : '/';
}
