const MONTHS_PL = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS_PL[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function formatDayHeader(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Dziś';
  if (sameDay(d, yesterday)) return 'Wczoraj';
  return formatDate(dateStr);
}

// Groups a list by calendar day (using `dateField`), preserving original order within each group.
export function groupByDay(items, dateField) {
  const groups = [];
  const byKey = new Map();
  for (const item of items) {
    const d = new Date(item[dateField]);
    const key = isNaN(d.getTime()) ? 'unknown' : d.toDateString();
    if (!byKey.has(key)) {
      const group = { key, date: item[dateField], items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).items.push(item);
  }
  return groups;
}

// Builds a reply tree from the flat comment list `GET /api/videos/:id/comments` returns.
export function buildCommentTree(comments) {
  const byId = new Map(comments.map((c) => [c.id, { ...c, replies: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    if (c.parent_id && byId.has(c.parent_id)) byId.get(c.parent_id).replies.push(c);
    else roots.push(c);
  }
  return roots;
}

// Builds the `sources[]` array a Watch Party QueueItem expects from a full video record
// (main source + up to 5 mirrors), mirroring VideoPage's own per-source resolution logic.
export function buildSourcesFromVideo(video) {
  const sources = [{ key: 'main', label: video.main_source_title || 'Główne źródło', url: video.main_source, type: video.main_source_type }];
  for (let n = 1; n <= 5; n++) {
    if (video[`mirror${n}_url`]) {
      sources.push({
        key: `mirror${n}`,
        label: video[`mirror${n}_name`] || `Mirror ${n}`,
        url: video[`mirror${n}_url`],
        type: video[`mirror${n}_type`] || (video[`mirror${n}_is_embed`] ? 'embed' : 'link'),
      });
    }
  }
  return sources;
}

export function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const YT_PATTERNS = [
  /youtube\.com\/watch\?v=([\w-]{11})/,
  /youtube\.com\/embed\/([\w-]{11})/,
  /youtu\.be\/([\w-]{11})/,
];

export function extractYoutubeId(url) {
  if (!url) return null;
  for (const re of YT_PATTERNS) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

export function youtubeToEmbed(url) {
  const id = extractYoutubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : url;
}

// Builds a tree from the flat category list `GET /api/categories` returns (parent_id links),
// preserving sort_order within each level.
export function buildCategoryTree(categories) {
  const byId = new Map(categories.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const cat of byId.values()) {
    if (cat.parent_id && byId.has(cat.parent_id)) {
      byId.get(cat.parent_id).children.push(cat);
    } else {
      roots.push(cat);
    }
  }
  const sortRec = (list) => {
    list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    list.forEach((c) => sortRec(c.children));
  };
  sortRec(roots);
  return roots;
}
