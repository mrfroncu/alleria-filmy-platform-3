import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Loader2, Film, Heart, Volume2, VolumeX, Repeat, SkipForward } from 'lucide-react';
import { api } from '../utils/api';
import SecurePlayer from '../components/SecurePlayer';

// Retries covering typical token-fetch + HLS-manifest-parse latency (SecurePlayer never
// autoplays on its own — see its MANIFEST_PARSED handler) — a slide going active fires an
// immediate play() plus two follow-ups; each call is a harmless no-op once playback has started.
const PLAY_RETRY_DELAYS_MS = [300, 900];

// Remembered across the whole feed (not per-video) — mirrors how a real player "sticks" to the
// last choice you made, per the request that Shorts shouldn't just always start muted.
const MUTE_PREF_KEY = 'alleria_shorts_muted';
const AUTOADVANCE_PREF_KEY = 'alleria_shorts_autoadvance';

function ShortSlide({ video, active, registerSlide, autoAdvance, onToggleAutoAdvance, onEndedAdvance }) {
  const controlRef = useRef(null);
  const slideRef = useRef(null);
  const barRef = useRef(null);
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_PREF_KEY) === '1');
  const [progress, setProgress] = useState({ currentTime: 0, duration: 0 });
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  useEffect(() => { draggingRef.current = dragging; }, [dragging]);
  const [isFav, setIsFav] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  useEffect(() => {
    registerSlide(video.id, slideRef.current);
    return () => registerSlide(video.id, null);
  }, [video.id, registerSlide]);

  useEffect(() => {
    api.checkFavorite(video.id).then(r => setIsFav(!!r.isFavorite)).catch(() => {});
  }, [video.id]);

  useEffect(() => {
    if (!active) {
      controlRef.current?.pause();
      return undefined;
    }
    controlRef.current?.play();
    const timers = PLAY_RETRY_DELAYS_MS.map(ms => setTimeout(() => controlRef.current?.play(), ms));
    return () => timers.forEach(clearTimeout);
  }, [active]);

  const handleMuteChange = useCallback((m) => {
    setMuted(m);
    localStorage.setItem(MUTE_PREF_KEY, m ? '1' : '0');
  }, []);

  const handleTimeUpdate = useCallback((currentTime, duration) => {
    if (draggingRef.current) return;
    setProgress({ currentTime, duration });
  }, []);

  const seekFromClientX = (clientX) => {
    const bar = barRef.current;
    if (!bar || !progress.duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const pos = pct * progress.duration;
    setProgress(p => ({ ...p, currentTime: pos }));
    controlRef.current?.seek(pos);
  };

  const toggleLike = async () => {
    if (favBusy) return;
    setFavBusy(true);
    try {
      if (isFav) { await api.removeFavorite(video.id); setIsFav(false); }
      else { await api.addFavorite(video.id); setIsFav(true); }
    } catch (e) {}
    setFavBusy(false);
  };

  const pct = progress.duration ? (progress.currentTime / progress.duration) * 100 : 0;

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
        startMuted={muted}
        onMuteChange={handleMuteChange}
        onTimeUpdate={handleTimeUpdate}
        loop={!autoAdvance}
        onEnded={autoAdvance ? onEndedAdvance : undefined}
        disablePip
        disableFullscreen
        compactControls
      />

      {/* Title top-left on both mobile and desktop — the bottom was fought over by the mobile
          scrub bar, and on desktop it sat right on top of SecurePlayer's own control bar. */}
      <div className="absolute top-3 left-3 right-16 z-20 pointer-events-none">
        <Link to={`/video/${video.id}`} className="pointer-events-auto inline-block no-underline">
          <h2 className="text-white font-bold text-sm line-clamp-2 drop-shadow-lg">{video.title}</h2>
        </Link>
        <p className="text-white/80 text-xs mt-0.5 drop-shadow-lg">{video.author_display_name || video.author_name}</p>
      </div>

      {/* Mobile: mute toggle, top-right */}
      <button
        onClick={() => controlRef.current?.toggleMute()}
        className="sm:hidden absolute top-3 right-3 z-20 p-2 rounded-full bg-black/40 backdrop-blur text-white"
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>

      {/* Mobile: always-visible draggable scrub bar — a dedicated hit area at the very bottom,
          separate from the title and from SecurePlayer's own (hidden here) controls, so dragging
          it no longer accidentally selects the title text. */}
      <div
        ref={barRef}
        className="sm:hidden absolute left-0 right-0 bottom-0 z-20 h-8 flex items-center touch-none"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setDragging(true); seekFromClientX(e.clientX); }}
        onPointerMove={(e) => { if (dragging) seekFromClientX(e.clientX); }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <div className="relative w-full h-1">
          <div className="absolute inset-0 bg-white/25" />
          <div className="absolute inset-y-0 left-0 bg-white" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Action rail — like + loop/auto-advance. Sits clear above SecurePlayer's own desktop
          control bar (play/skip/volume/time/quality) so nothing in it gets covered. */}
      <div className="absolute right-3 bottom-24 sm:bottom-28 z-20 flex flex-col items-center gap-3">
        <button onClick={toggleLike} disabled={favBusy} className="p-2.5 rounded-full bg-black/40 backdrop-blur text-white disabled:opacity-50">
          <Heart className={`w-6 h-6 ${isFav ? 'fill-pink-500 text-pink-500' : ''}`} />
        </button>
        <button
          onClick={onToggleAutoAdvance}
          title={autoAdvance ? 'Odtwarzanie automatyczne kolejnego — kliknij, aby zapętlać ten film' : 'Zapętlanie — kliknij, aby po zakończeniu odtwarzać kolejny film'}
          className="p-2.5 rounded-full bg-black/40 backdrop-blur text-white"
        >
          {autoAdvance ? <SkipForward className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
        </button>
      </div>
    </section>
  );
}

export default function ShortsPage() {
  const { categorySlug } = useParams();
  const [searchParams] = useSearchParams();
  const startId = searchParams.get('start') ? parseInt(searchParams.get('start'), 10) : null;

  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [autoAdvance, setAutoAdvance] = useState(() => localStorage.getItem(AUTOADVANCE_PREF_KEY) === '1');
  const containerRef = useRef(null);
  const slidesRef = useRef(new Map());

  useEffect(() => {
    setLoading(true);
    api.getVideos({ category: categorySlug })
      .then(vs => {
        setVideos(vs);
        setActiveId(vs.some(v => v.id === startId) ? startId : (vs[0]?.id ?? null));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [categorySlug, startId]);

  // Jump straight to the clicked video on load instead of starting from the top of the feed.
  useEffect(() => {
    if (!startId || loading) return;
    slidesRef.current.get(startId)?.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, startId]);

  const registerSlide = useCallback((id, el) => {
    if (el) slidesRef.current.set(id, el);
    else slidesRef.current.delete(id);
  }, []);

  const toggleAutoAdvance = useCallback(() => {
    setAutoAdvance(v => {
      const next = !v;
      localStorage.setItem(AUTOADVANCE_PREF_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const advanceToNext = useCallback(() => {
    const ids = videos.map(v => v.id);
    const idx = ids.indexOf(activeId);
    if (idx === -1 || idx === ids.length - 1) return;
    slidesRef.current.get(ids[idx + 1])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [videos, activeId]);

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
        <p className="text-zinc-400 text-sm max-w-xs">Brak filmów w tej kategorii Shortów albo brak do niej dostępu.</p>
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
        <ShortSlide
          key={video.id}
          video={video}
          active={video.id === activeId}
          registerSlide={registerSlide}
          autoAdvance={autoAdvance}
          onToggleAutoAdvance={toggleAutoAdvance}
          onEndedAdvance={advanceToNext}
        />
      ))}
    </div>
  );
}
