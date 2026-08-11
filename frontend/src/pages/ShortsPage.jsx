import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Film } from 'lucide-react';
import { api } from '../utils/api';
import SecurePlayer from '../components/SecurePlayer';

// Retries covering typical token-fetch + HLS-manifest-parse latency (SecurePlayer never
// autoplays on its own — see its MANIFEST_PARSED handler) — a slide going active fires an
// immediate play() plus two follow-ups; each call is a harmless no-op once playback has started.
const PLAY_RETRY_DELAYS_MS = [300, 900];

function ShortSlide({ video, active, registerSlide }) {
  const controlRef = useRef(null);
  const slideRef = useRef(null);

  useEffect(() => {
    registerSlide(video.id, slideRef.current);
    return () => registerSlide(video.id, null);
  }, [video.id, registerSlide]);

  useEffect(() => {
    if (!active) {
      controlRef.current?.pause();
      return undefined;
    }
    controlRef.current?.play();
    const timers = PLAY_RETRY_DELAYS_MS.map(ms => setTimeout(() => controlRef.current?.play(), ms));
    return () => timers.forEach(clearTimeout);
  }, [active]);

  return (
    <section
      ref={slideRef}
      data-video-id={video.id}
      className="h-full w-full shrink-0 snap-start snap-always relative flex items-center justify-center bg-black"
    >
      <SecurePlayer
        streamVideoId={video.stream_video_id}
        drmEnhanced={video.drm_enhanced}
        title={video.title}
        controlRef={controlRef}
        containerClassName="h-full w-full rounded-none"
        startMuted
      />
      <div className="absolute inset-x-0 bottom-0 p-5 pb-8 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none">
        <Link to={`/video/${video.id}`} className="pointer-events-auto inline-block no-underline">
          <h2 className="text-white font-bold text-base line-clamp-2 mb-1">{video.title}</h2>
        </Link>
        <p className="text-white/70 text-sm">{video.author_display_name || video.author_name}</p>
      </div>
    </section>
  );
}

export default function ShortsPage() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const containerRef = useRef(null);
  const slidesRef = useRef(new Map());

  useEffect(() => {
    api.getVideos({ shorts: 1 })
      .then(vs => { setVideos(vs); if (vs.length > 0) setActiveId(vs[0].id); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const registerSlide = useCallback((id, el) => {
    if (el) slidesRef.current.set(id, el);
    else slidesRef.current.delete(id);
  }, []);

  // Which slide is "active" (autoplayed) — the one most centered in the scroll container.
  useEffect(() => {
    if (videos.length === 0) return undefined;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          setActiveId(parseInt(entry.target.dataset.videoId, 10));
        }
      }
    }, { root: containerRef.current, threshold: [0.6] });
    for (const el of slidesRef.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [videos]);

  // Desktop arrow-key navigation — scroll-snap already covers touch swipe/trackpad natively.
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const ids = videos.map(v => v.id);
      const idx = ids.indexOf(activeId);
      if (idx === -1) return;
      e.preventDefault();
      const nextIdx = e.key === 'ArrowDown' ? Math.min(idx + 1, ids.length - 1) : Math.max(idx - 1, 0);
      slidesRef.current.get(ids[nextIdx])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [videos, activeId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6 bg-black">
        <Film className="w-10 h-10 text-zinc-700 mb-4" />
        <p className="text-zinc-400 text-sm max-w-xs">Brak Shortów. Wróć tu, gdy autorzy dodadzą pierwsze krótkie filmy.</p>
        <Link to="/" className="mt-4 text-violet-400 hover:text-violet-300 font-medium text-sm no-underline">Wróć do Biblioteki</Link>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-y-scroll snap-y snap-mandatory bg-black no-scrollbar"
    >
      {videos.map(video => (
        <ShortSlide key={video.id} video={video} active={video.id === activeId} registerSlide={registerSlide} />
      ))}
    </div>
  );
}
