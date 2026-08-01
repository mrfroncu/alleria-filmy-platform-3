// Format date to DD/MM/YYYY HH:mm
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Convert YouTube URL to embed URL
export function youtubeToEmbed(url) {
  if (!url) return '';
  // Already an embed URL
  if (url.includes('/embed/')) return url;
  
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return `https://www.youtube.com/embed/${m[1]}`;
  }
  return url;
}

// Extract YouTube video ID
export function extractYoutubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// Get current datetime in format for datetime-local input
export function nowLocalDatetime() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

// Convert datetime-local value to ISO string for backend
export function datetimeLocalToISO(val) {
  if (!val) return new Date().toISOString();
  return new Date(val).toISOString();
}

export function getCurrentYear() {
  return new Date().getFullYear();
}

// Turns a raw TS3/TS6 backend error message into a friendly, actionable one. Shared by
// LoginPage (plain login) and ProfilePage (account linking) so both surfaces explain TS
// failures the same way instead of showing raw fetch/ServerQuery error text.
export function parseTsError(msg, version) {
  if (!msg) return `Logowanie przez ${version} nie powiodło się.`;
  const m = msg.toLowerCase();
  if (m.includes('timeout') || m.includes('econnrefused') || m.includes('enotfound') || m.includes('connect')) {
    return `Wystąpił problem po naszej stronie. Użyj innej metody lub spróbuj później.`;
  }
  if (m.includes('ip') || m.includes('nie znaleziono klienta') || m.includes('znaleziono')) {
    return `Nie znaleziono Twojego IP na serwerze ${version}. Upewnij się, że jesteś aktualnie połączony.`;
  }
  if (m.includes('grupy') || m.includes('group') || m.includes('wymaganej')) {
    return `Nie posiadasz wymaganej grupy serwerowej na ${version}.`;
  }
  if (m.includes('invalid_password') || m.includes('520') || m.includes('konfiguracji serwera')) {
    return `Błąd konfiguracji — nieprawidłowe dane administracyjne ${version}. Skontaktuj się z administratorem.`;
  }
  if (m.includes('closed unexpectedly') || m.includes('socket')) {
    return `Połączenie z serwerem ${version} zostało przerwane. Spróbuj ponownie.`;
  }
  return msg;
}

// Build a properly sorted, indented tree of categories for <select> dropdowns
// Returns: [{ id, name, label, depth, parent_id }, ...]
export function buildCategoryTreeOptions(cats, excludeId = null) {
  if (!cats || cats.length === 0) return [];

  const byParent = {};
  for (const c of cats) {
    const pid = c.parent_id || 0;
    if (!byParent[pid]) byParent[pid] = [];
    byParent[pid].push(c);
  }
  // Sort children by sort_order then name
  for (const key of Object.keys(byParent)) {
    byParent[key].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));
  }

  const result = [];
  const walk = (parentId, depth) => {
    const children = byParent[parentId] || [];
    for (const c of children) {
      if (excludeId && c.id === excludeId) continue;
      const indent = depth > 0 ? '\u00A0\u00A0'.repeat(depth) + '↳ ' : '';
      result.push({ id: c.id, name: c.name, label: indent + c.name, depth, parent_id: c.parent_id });
      walk(c.id, depth + 1);
    }
  };
  walk(0, 0);
  // Also add root categories that have parent_id = null (in case 0 vs null)
  const inResult = new Set(result.map(r => r.id));
  const walkNull = (parentId, depth) => {
    const children = byParent[parentId] || [];
    for (const c of children) {
      if (inResult.has(c.id)) continue;
      if (excludeId && c.id === excludeId) continue;
      const indent = depth > 0 ? '\u00A0\u00A0'.repeat(depth) + '↳ ' : '';
      result.push({ id: c.id, name: c.name, label: indent + c.name, depth, parent_id: c.parent_id });
      inResult.add(c.id);
      walkNull(c.id, depth + 1);
    }
  };
  walkNull(null, 0);
  return result;
}
