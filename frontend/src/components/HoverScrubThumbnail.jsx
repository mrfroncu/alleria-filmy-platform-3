import React, { useEffect, useRef, useState } from 'react';
import { Film } from 'lucide-react';

// Cadence of the simulated hover-scrub — deliberately independent of the sprite's own capture
// interval (which can be tens of seconds apart for long films). This fixed, fast cadence is what
// makes it read as "scrubbing", the same trick YouTube's hover preview uses.
const SCRUB_FRAME_MS = 300;

// preview.json never changes once a video finishes transcoding, and the same video can appear in
// several cards (e.g. across filtered views) — cache it by URL so hovering never re-fetches.
const metaCache = new Map();

// Self-hosted videos only: video.preview_sprite_url / preview_meta_url are null for YouTube
// videos and for self-hosted ones too short/not-yet-ready to have a sprite (see attachPreviewUrl
// in backend/server.js) — this component silently falls back to the static thumbnail in both cases.
export default function HoverScrubThumbnail({ video, hovered, onLoad }) {
  const [meta, setMeta] = useState(() => metaCache.get(video.preview_meta_url));
  const [index, setIndex] = useState(0);
  const requestedRef = useRef(meta !== undefined);

  useEffect(() => {
    if (!hovered || requestedRef.current || !video.preview_meta_url) return;
    requestedRef.current = true;
    let cancelled = false;
    fetch(video.preview_meta_url, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(m => { metaCache.set(video.preview_meta_url, m); if (!cancelled) setMeta(m); });
    return () => { cancelled = true; };
  }, [hovered, video.preview_meta_url]);

  useEffect(() => {
    if (!hovered || !meta) { setIndex(0); return undefined; }
    const timer = setInterval(() => setIndex(i => (i + 1) % meta.frames), SCRUB_FRAME_MS);
    return () => clearInterval(timer);
  }, [hovered, meta]);

  // Nothing to wait for when there's no thumbnail at all — tell the parent right away so its
  // loading-skeleton background doesn't shimmer forever behind the fallback icon.
  useEffect(() => {
    if (!video.thumbnail) onLoad?.();
  }, [video.thumbnail]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!video.thumbnail) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Film className="w-12 h-12 text-zinc-300 dark:text-zinc-700" />
      </div>
    );
  }

  const showScrub = hovered && meta && video.preview_sprite_url;
  const col = showScrub ? index % meta.cols : 0;
  const row = showScrub ? Math.floor(index / meta.cols) : 0;

  return (
    <>
      <img src={video.thumbnail} alt={video.title} className="video-thumb w-full h-full object-cover" loading="lazy" onLoad={onLoad} />
      {showScrub && (
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            backgroundImage: `url(${video.preview_sprite_url})`,
            backgroundSize: `${meta.cols * 100}% ${meta.rows * 100}%`,
            backgroundPosition: `${meta.cols > 1 ? (col / (meta.cols - 1)) * 100 : 0}% ${meta.rows > 1 ? (row / (meta.rows - 1)) * 100 : 0}%`,
          }}
        />
      )}
    </>
  );
}
