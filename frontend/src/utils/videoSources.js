// A video's playable sources in display order — the main source plus up to five mirrors. `key` is
// what VideoPage's activeSource holds; `label` is what the viewer sees on the source tabs.
export function buildSources(video) {
  if (!video) return [];
  const sources = [{ key: 'main', label: video.main_source_title || 'Główne źródło', isAlt: false }];
  for (let i = 1; i <= 5; i++) {
    if (video[`mirror${i}_url`]) {
      sources.push({ key: `mirror${i}`, label: video[`mirror${i}_name`] || `Mirror ${i}`, isAlt: !!video[`mirror${i}_is_alt`] });
    }
  }
  return sources;
}

// Finds the source a timestamp or share link points at: exact key first (links use keys — short
// and URL-safe), then the visible label, case-insensitively (comment tokens use labels, which stay
// meaningful even after an editor reorders the mirrors). null when nothing matches.
export function resolveSourceRef(sources, ref) {
  if (!ref) return null;
  const r = String(ref).trim();
  const byKey = sources.find(s => s.key === r);
  if (byKey) return byKey;
  const lower = r.toLocaleLowerCase('pl');
  return sources.find(s => s.label.trim().toLocaleLowerCase('pl') === lower) || null;
}
