import React, { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Film, Play, ArrowRight } from 'lucide-react';
import { useReveal } from '../utils/hooks';

/**
 * PosterCard — compact tile for horizontal shelves. Shares the morph
 * identity scheme (`vc-{id}` / `vct-{id}`), so a poster morphs into the
 * QuickLook panel, into the player, and even into its grid twin when
 * you start searching.
 */
export function PosterCard({ video, to, progress, onQuickLook, morphHidden = false, morphKey }) {
  const navigate = useNavigate();
  const href = to || `/video/${video.id}`;
  const key = morphKey ?? video.id;

  const goWatch = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const thumb = e.currentTarget.closest('[data-card-root]')?.querySelector('[data-vt-thumb]');
    if (thumb) thumb.style.viewTransitionName = 'video-hero';
    navigate(href, { viewTransition: true });
  };

  const handleClick = (e) => {
    if (onQuickLook && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      onQuickLook(video);
      return;
    }
    const thumb = e.currentTarget.querySelector('[data-vt-thumb]');
    if (thumb) thumb.style.viewTransitionName = 'video-hero';
  };

  const pct = progress && progress.duration > 0
    ? Math.min(100, (progress.position / progress.duration) * 100)
    : null;

  return (
    <Link
      to={href}
      viewTransition
      onClick={handleClick}
      data-card-root
      className={`poster-card group block w-[228px] sm:w-[260px] shrink-0 ${morphHidden ? 'invisible' : ''}`}
      style={{ viewTransitionName: morphHidden ? 'none' : `vc-${key}` }}
    >
      <div
        data-vt-thumb
        className="poster-img thumb-shine relative aspect-video rounded-2xl overflow-hidden bg-zinc-200 dark:bg-zinc-800 border border-zinc-200/60 dark:border-white/[0.06]"
        style={{ viewTransitionName: morphHidden ? 'none' : `vct-${key}` }}
      >
        {video.thumbnail ? (
          <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover group-hover:scale-110 group-hover:saturate-[1.15] transition-transform duration-700" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-9 h-9 text-zinc-400 dark:text-zinc-600" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <button
          onClick={goWatch}
          title="Oglądaj od razu"
          className="play-badge absolute inset-0 m-auto w-12 h-12 rounded-full bg-white/15 border border-white/30 flex items-center justify-center shadow-2xl shadow-black/40 hover:!scale-110 hover:bg-ember-500/60 active:!scale-90"
        >
          <Play className="w-5 h-5 text-white fill-white ml-0.5" />
        </button>

        {video.category_name && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-sm border border-white/10 text-white text-[9px] font-bold opacity-0 group-hover:opacity-100 -translate-y-1 group-hover:translate-y-0 transition-all duration-300">
            {video.category_name}
          </span>
        )}

        {pct !== null && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
            <div className="progress-fill h-full bg-gradient-to-r from-ember-500 to-curtain-500" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      <div className="pt-2.5 px-0.5">
        <h3 className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-ember-500 dark:group-hover:text-ember-400 transition-colors font-display">
          {video.title}
        </h3>
        <p className="text-[11px] text-zinc-500 truncate mt-0.5">{video.author_display_name || video.author_name}</p>
      </div>
    </Link>
  );
}

/**
 * Shelf — a reveal-on-scroll horizontal snap row with hover arrows.
 */
export default function Shelf({ title, icon: Icon, seeAllTo, children }) {
  const rowRef = useRef(null);
  const revealRef = useReveal();

  const scrollBy = (dir) => {
    rowRef.current?.scrollBy({ left: dir * (rowRef.current.clientWidth * 0.85), behavior: 'smooth' });
  };

  return (
    <section ref={revealRef} className="shelf-reveal mb-4">
      <div className="flex items-center gap-2.5 px-1">
        {Icon && <Icon className="w-4 h-4 text-ember-500" />}
        <h2 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white font-display tracking-tight">{title}</h2>
        {seeAllTo && (
          <Link to={seeAllTo} viewTransition className="ml-auto group flex items-center gap-1 text-[11px] font-bold text-zinc-400 hover:text-ember-500 transition-colors uppercase tracking-wider">
            Zobacz wszystkie <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </Link>
        )}
      </div>
      <div className="shelf-wrap relative">
        <button className="shelf-arrow left" onClick={() => scrollBy(-1)} aria-label="Przewiń w lewo" data-no-ripple>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div ref={rowRef} className="shelf-row">
          {children}
        </div>
        <button className="shelf-arrow right" onClick={() => scrollBy(1)} aria-label="Przewiń w prawo" data-no-ripple>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
}
