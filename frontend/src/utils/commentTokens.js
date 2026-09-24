// Inline tokens inside comment (and description) text:
//
//   12:34 / 1:02:03          → clickable timestamp, seeks whatever source is currently playing
//   [12:34|Wersja reżyserska] → clickable timestamp bound to a source (main source or a mirror,
//                               matched by its label, or by key: main / mirror1..mirror5)
//   @[Jan Kowalski](123)      → mention of user 123 (the label is just what gets displayed)
//
// Everything is plain text in the DB — no markup is ever rendered as HTML.

const TOKEN_RE = new RegExp([
  // 1: mention name, 2: mention user id
  String.raw`@\[([^\]\n]{1,64})\]\((\d{1,10})\)`,
  // 3: bracketed clock, 4: optional source label
  String.raw`\[((?:\d{1,2}:)?\d{1,3}:[0-5]\d)(?:\|([^\]\n]{1,80}))?\]`,
  // 5: bare clock (not glued to other digits/words, nor part of a URL like ?t=12:34)
  String.raw`(?<![\w:./@#=?&%-])((?:\d{1,2}:)?\d{1,3}:[0-5]\d)(?![\w:])`,
].join('|'), 'g');

// "12:34" → 754, "1:02:03" → 3723; null when it isn't a valid clock.
export function parseClock(clock) {
  const parts = String(clock).split(':').map(n => parseInt(n, 10));
  if (parts.some(n => !Number.isFinite(n))) return null;
  if (parts.length === 3) {
    const [h, m, s] = parts;
    if (m > 59 || s > 59) return null;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    if (s > 59) return null;
    return m * 60 + s;
  }
  return null;
}

export function formatClock(seconds) {
  const t = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// ?t= in a share link: "754", "12:34", "1h2m3s" / "12m34s" / "45s". null if unparseable.
export function parseTimeParam(value) {
  if (value == null || value === '') return null;
  const v = String(value).trim();
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  if (/^\d{1,3}(:\d{1,2}){1,2}$/.test(v)) return parseClock(v);
  const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (m && (m[1] || m[2] || m[3])) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  return null;
}

// Splits text into [{ type: 'text', value } | { type: 'mention', name, userId } |
// { type: 'timestamp', seconds, clock, sourceRef }] — sourceRef is null for a bare timestamp.
export function tokenizeComment(text) {
  const out = [];
  const src = String(text || '');
  let last = 0;
  for (const m of src.matchAll(TOKEN_RE)) {
    let token = null;
    if (m[1] !== undefined) {
      token = { type: 'mention', name: m[1], userId: Number(m[2]) };
    } else {
      const clock = m[3] ?? m[5];
      const seconds = parseClock(clock);
      if (seconds !== null) token = { type: 'timestamp', seconds, clock, sourceRef: m[4]?.trim() || null };
    }
    if (!token) continue;
    if (m.index > last) out.push({ type: 'text', value: src.slice(last, m.index) });
    out.push(token);
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ type: 'text', value: src.slice(last) });
  return out;
}

export function mentionToken(name, userId) {
  const clean = String(name || '').replace(/[[\]\n]/g, '').trim().slice(0, 64) || 'użytkownik';
  return `@[${clean}](${userId})`;
}

// Bare "12:34" when there's nothing to disambiguate, "[12:34|Label]" when the video has several
// sources — so a reader on a different source still lands on the same moment of the same cut.
export function timestampToken(seconds, sourceLabel) {
  const clock = formatClock(seconds);
  const label = String(sourceLabel || '').replace(/[[\]|\n]/g, '').trim().slice(0, 80);
  return label ? `[${clock}|${label}]` : clock;
}
