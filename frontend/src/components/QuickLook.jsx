import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Film, Play, X, CalendarDays, User } from 'lucide-react';
import { formatDate } from '../utils/helpers';

/**
 * QuickLook — the clicked tile MORPHS into this preview panel
 * (App-Store-style expand). It shares the tile's view-transition-names
 * (`vc-{id}`, `vct-{id}`), so opening/closing is a pure shape morph:
 * the small card grows into the panel, the panel shrinks back into
 * its slot in the grid. "Oglądaj" then morphs the artwork into the player.
 */
export default function QuickLook({ video, onClose, to, progress }) {
  const navigate = useNavigate();
  const thumbRef = useRef(null);
  const href = to || `/video/${video.id}`;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const watch = (e) => {
    e.preventDefault();
    if (thumbRef.current) thumbRef.current.style.viewTransitionName = 'video-hero';
    navigate(href, { viewTransition: true });
  };

  const pct = progress && progress.duration > 0
    ? Math.min(100, (progress.position / progress.duration) * 100)
    : null;

  return ReactDOM.createPortal(
    <>
      <div className="quicklook-backdrop" onClick={onClose} />
      <div className="quicklook-wrap">
        <div
          className="quicklook-panel w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-[28px] shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto"
          style={{ viewTransitionName: `vc-${video.id}` }}
          role="dialog"
          aria-modal="true"
          aria-label={video.title}
        >
          {/* ── Artwork (morph source for the player) ── */}
          <div
            ref={thumbRef}
            className="relative aspect-video bg-zinc-100 dark:bg-zinc-800 overflow-hidden"
            style={{ viewTransitionName: `vct-${video.id}` }}
          >
            {video.thumbnail ? (
              <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Film className="w-14 h-14 text-zinc-300 dark:text-zinc-700" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

            {/* Big play — morphs artwork → player */}
            <button
              onClick={watch}
              className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-white/15 border border-white/30 backdrop-blur-md flex items-center justify-center shadow-2xl shadow-black/50 hover:scale-110 hover:bg-ember-500/60 active:scale-90 transition-all duration-300 animate-spring-in"
              title="Oglądaj"
            >
              <Play className="w-9 h-9 text-white fill-white ml-1" />
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/50 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/70 hover:rotate-90 transition-all duration-300 active:scale-90"
              title="Zamknij"
            >
              <X className="w-4.5 h-4.5 w-[18px] h-[18px]" />
            </button>

            {/* Title over artwork */}
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <h2 className="text-xl sm:text-2xl font-extrabold text-white font-display drop-shadow-lg line-clamp-2">
                {video.title}
              </h2>
            </div>

            {pct !== null && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                <div className="progress-fill h-full bg-gradient-to-r from-ember-500 to-curtain-500" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>

          {/* ── Details ── */}
          <div className="p-6 sm:p-7">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 stagger-children">
              <Link
                to={`/author/${video.author_id}`}
                viewTransition
                className="flex items-center gap-1.5 text-sm font-bold text-ember-500 hover:text-ember-400 transition-colors"
              >
                <User className="w-4 h-4" />
                {video.author_display_name || video.author_name}
              </Link>
              <span className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                <CalendarDays className="w-3.5 h-3.5" />
                {formatDate(video.publish_date)}
              </span>
              {video.category_name && (
                <span className="inline-flex px-2.5 py-0.5 bg-ember-50 dark:bg-ember-500/10 text-ember-600 dark:text-ember-300 rounded-full text-[10px] font-bold border border-ember-100 dark:border-ember-500/20">
                  {video.category_name}
                </span>
              )}
            </div>

            {video.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5 stagger-children">
                {video.tags.map(tag => (
                  <span key={tag.id} className="tag-chip text-[11px]">{tag.name}</span>
                ))}
              </div>
            )}

            {video.description && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap line-clamp-5 mb-6 animate-slide-up">
                {video.description}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button onClick={watch} className="btn-primary flex-1 text-sm flex items-center justify-center gap-2">
                <Play className="w-4 h-4 fill-current" />
                {pct !== null ? 'Kontynuuj oglądanie' : 'Oglądaj teraz'}
              </button>
              <button onClick={onClose} className="btn-secondary text-sm">
                Zamknij
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
