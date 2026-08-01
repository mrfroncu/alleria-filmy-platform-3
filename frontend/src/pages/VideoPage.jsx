import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, ExternalLink, PlayCircle } from 'lucide-react';
import { api } from '../utils/apiClient';
import { formatDate, youtubeToEmbed, extractYoutubeId } from '../utils/helpers';
import { useSettings } from '../contexts/SettingsContext';
import SecurePlayer from '../components/SecurePlayer';
import YouTubeTrackingPlayer from '../components/YouTubeTrackingPlayer';
import YouTubeCustomPlayer from '../components/YouTubeCustomPlayer';
import HtmlEmbed from '../components/HtmlEmbed';
import CommentSection from '../components/CommentSection';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';

function resolveSource(video, activeSource) {
  if (!video) return { url: null, type: null };
  if (activeSource === 'main') return { url: video.main_source, type: video.main_source_type };
  const n = activeSource.replace('mirror', '');
  return {
    url: video[`mirror${n}_url`],
    type: video[`mirror${n}_type`] || (video[`mirror${n}_is_embed`] ? 'embed' : 'link'),
  };
}

export default function VideoPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromCategory = searchParams.get('from') || '';
  const { config } = useSettings();

  const [video, setVideo] = useState(null);
  const [error, setError] = useState(null);
  const [activeSource, setActiveSource] = useState('main');
  const [isFav, setIsFav] = useState(false);
  const [favCount, setFavCount] = useState(0);
  const [resumePosition, setResumePosition] = useState(null);
  const [showResumeBanner, setShowResumeBanner] = useState(false);

  const saveState = useRef({ lastSaved: 0 });
  const playerControlRef = useRef(null);

  useEffect(() => {
    setVideo(null);
    setError(null);
    setActiveSource('main');
    api.getVideo(id).then(setVideo).catch((e) => setError(e.message));
    api.checkFavorite(id).then((r) => { setIsFav(!!r.isFavorite); setFavCount(r.count || 0); }).catch(() => {});
    api.getProgress(id).then((p) => {
      if (p && p.position > 5 && p.duration && p.position / p.duration < 0.9) {
        setResumePosition(p.position);
        setShowResumeBanner(true);
      }
    }).catch(() => {});
  }, [id]);

  const handleTimeUpdate = useCallback((currentTime, duration) => {
    if (!duration) return;
    const pct = currentTime / duration;
    if (pct >= 0.9) {
      api.clearProgress(id).catch(() => {});
      return;
    }
    if (pct < 0.05) return;
    const now = Date.now();
    if (now - saveState.current.lastSaved > 10000) {
      saveState.current.lastSaved = now;
      api.saveProgress(id, currentTime, duration).catch(() => {});
    }
  }, [id]);

  const toggleFavorite = async () => {
    const next = !isFav;
    setIsFav(next);
    setFavCount((c) => c + (next ? 1 : -1));
    try {
      await api.toggleFavorite(id, isFav);
    } catch (_) {
      setIsFav(!next);
      setFavCount((c) => c + (next ? -1 : 1));
    }
  };

  const src = useMemo(() => resolveSource(video, activeSource), [video, activeSource]);
  const isStreamer = src.type === 'streamer';
  const streamerVideoId = isStreamer ? src.url?.replace('self-hosted:', '') : null;
  const isPlex = src.type === 'plex';
  const isHtml = src.type === 'embed' || src.type === 'html';
  const youtubeId = !isStreamer && !isPlex && !isHtml ? extractYoutubeId(src.url) : null;
  const embedUrl = !isStreamer && !isPlex && !isHtml && !youtubeId ? youtubeToEmbed(src.url) : null;

  const sources = useMemo(() => {
    if (!video) return [];
    const list = [{ key: 'main', label: video.main_source_title || 'Główne źródło' }];
    for (let n = 1; n <= 5; n++) {
      if (video[`mirror${n}_url`]) list.push({ key: `mirror${n}`, label: video[`mirror${n}_name`] || `Mirror ${n}` });
    }
    return list;
  }, [video]);

  if (error) {
    return (
      <div className="p-6 sm:p-10 max-w-4xl mx-auto">
        <div className="rounded-4xl border border-dashed border-rose-300 dark:border-rose-500/30 p-16 text-center">
          <p className="text-rose-500 font-bold mb-1">Błąd</p>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="p-6 sm:p-10 max-w-4xl mx-auto">
        <Skeleton className="aspect-video rounded-4xl mb-6" />
        <Skeleton className="h-8 w-2/3 mb-3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 sm:p-10 max-w-4xl mx-auto"
    >
      <div className="mb-2">
        {isStreamer && streamerVideoId ? (
          <SecurePlayer streamVideoId={streamerVideoId} drmEnhanced={video.drm_enhanced} title={video.title} controlRef={playerControlRef} onTimeUpdate={handleTimeUpdate} />
        ) : isPlex && src.url ? (
          <div className="aspect-video rounded-4xl bg-gradient-to-br from-amber-950 to-slate-950 flex flex-col items-center justify-center gap-4 p-8">
            <PlayCircle className="w-14 h-14 text-amber-400" />
            <a href={src.url} target="_blank" rel="noopener noreferrer">
              <Button className="!bg-amber-500 hover:!brightness-110">
                <ExternalLink className="w-4 h-4" /> Oglądaj w Plex
              </Button>
            </a>
          </div>
        ) : isHtml && src.url ? (
          <div className="aspect-video rounded-4xl overflow-hidden shadow-2xl">
            <HtmlEmbed html={src.url} />
          </div>
        ) : youtubeId ? (
          <div className="aspect-video rounded-4xl overflow-hidden shadow-2xl">
            {config.customYoutubePlayer
              ? <YouTubeCustomPlayer videoId={youtubeId} onTimeUpdate={handleTimeUpdate} controlRef={playerControlRef} />
              : <YouTubeTrackingPlayer videoId={youtubeId} onTimeUpdate={handleTimeUpdate} controlRef={playerControlRef} />}
          </div>
        ) : embedUrl ? (
          <div className="aspect-video rounded-4xl overflow-hidden shadow-2xl">
            <iframe src={embedUrl} className="w-full h-full border-0" allowFullScreen />
          </div>
        ) : (
          <div className="aspect-video rounded-4xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
            <p className="text-slate-400 text-sm">Brak źródła.</p>
          </div>
        )}
      </div>

      {showResumeBanner && resumePosition !== null && (
        <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-brand-500/10 text-sm">
          <span className="flex-1 text-brand-700 dark:text-brand-300 font-medium">
            Kontynuować od {Math.floor(resumePosition / 60)}:{String(Math.floor(resumePosition % 60)).padStart(2, '0')}?
          </span>
          <button onClick={() => { playerControlRef.current?.seek(resumePosition); setShowResumeBanner(false); }} className="text-xs font-bold text-brand-600 dark:text-brand-300 hover:text-brand-700">Kontynuuj</button>
          <button onClick={() => setShowResumeBanner(false)} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">Od początku</button>
        </div>
      )}

      {sources.length > 1 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {sources.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveSource(s.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                activeSource === s.key
                  ? 'bg-brand-500 text-white'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start gap-4 mt-6">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-display mb-2">{video.title}</h1>
          <div className="flex flex-wrap items-center gap-3">
            {video.author_id && (
              <Link to={`/author/${video.author_id}`} className="text-sm font-bold text-brand-500 hover:text-brand-600">
                {video.author_display_name || video.author_name}
              </Link>
            )}
            {video.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {video.tags.map((t) => <Badge key={t.id} tone="neutral">{t.name}</Badge>)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
            <span>{formatDate(video.publish_date)}</span>
            {video.category_name && (
              <>
                <span>·</span>
                <Link to={`/category/${video.category_slug}`} className="hover:text-brand-500 transition-colors">{video.category_name}</Link>
              </>
            )}
          </div>
        </div>
        <button
          onClick={toggleFavorite}
          className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl transition-colors ${
            isFav ? 'bg-rose-500/10 text-rose-500' : 'bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-rose-500'
          }`}
        >
          <Heart className={`w-5 h-5 ${isFav ? 'fill-current' : ''}`} />
          {favCount > 0 && <span className="text-xs font-bold">{favCount}</span>}
        </button>
      </div>

      {video.description && (
        <p className="mt-6 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{video.description}</p>
      )}

      <CommentSection videoId={id} />
    </motion.div>
  );
}
