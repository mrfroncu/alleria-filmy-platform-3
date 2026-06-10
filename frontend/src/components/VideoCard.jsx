import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Film, Play } from 'lucide-react';
import { formatDateShort } from '../utils/helpers';

/**
 * Shared video tile with morph identity.
 *
 * Every card carries view-transition-names (`vc-{id}` root, `vct-{id}` thumb),
 * so ANY state change wrapped in morph() — grid↔list toggle, sorting,
 * filtering, pagination, opening QuickLook — makes the tile physically
 * glide and reshape into its new form instead of re-rendering.
 *
 * Click → onQuickLook (tile morphs into the preview panel).
 * Play button / middle click → straight to the player (thumb morphs into it).
 */
export default function VideoCard({
  video,
  to,
  layout = 'grid',          // 'grid' | 'list'
  progress,                 // { position, duration } | undefined
  onQuickLook,              // fn(video) | undefined → click opens QuickLook
  morphHidden = false,      // true while QuickLook shows this video
  delay = 0,
  overlay,                  // extra node rendered over the thumbnail (e.g. remove btn)
}) {
  const navigate = useNavigate();
  const href = to || `/video/${video.id}`;
  const isList = layout === 'list';

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
    // no QuickLook → navigate with the thumbnail morphing into the player
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
      data-tilt={isList ? undefined : ''}
      className={`video-card card group overflow-hidden ${isList ? 'flex items-stretch' : ''} ${morphHidden ? 'invisible' : ''}`}
      style={{
        animationDelay: `${delay}ms`,
        viewTransitionName: morphHidden ? 'none' : `vc-${video.id}`,
      }}
    >
      {/* ── Thumbnail ── */}
      <div
        data-vt-thumb
        className={`thumb-shine relative bg-zinc-100 dark:bg-zinc-800 overflow-hidden shrink-0 ${
          isList
            ? 'w-44 sm:w-56 self-stretch rounded-l-3xl'
            : 'aspect-video rounded-t-3xl'
        }`}
        style={{ viewTransitionName: morphHidden ? 'none' : `vct-${video.id}` }}
      >
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt={video.title}
            className="video-thumb w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center min-h-[96px]">
            <Film className="w-10 h-10 text-zinc-300 dark:text-zinc-700" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Direct-play badge — springs in, morphs the thumb into the player */}
        <button
          onClick={goWatch}
          title="Oglądaj od razu"
          className="play-badge absolute inset-0 m-auto w-14 h-14 rounded-full bg-white/15 border border-white/30 flex items-center justify-center shadow-2xl shadow-black/40 hover:!scale-110 hover:bg-ember-500/60 active:!scale-90"
        >
          <Play className="w-6 h-6 text-white fill-white ml-0.5" />
        </button>

        {pct !== null && (
          <>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
              <div className="progress-fill h-full bg-gradient-to-r from-ember-500 to-curtain-500 shadow-glow-sm" style={{ width: `${pct}%` }} />
            </div>
            {!isList && (
              <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/70 text-white text-[9px] font-bold rounded-full backdrop-blur-sm border border-white/10">
                Kontynuuj oglądanie
              </div>
            )}
          </>
        )}
        {overlay}
      </div>

      {/* ── Meta ── */}
      <div className={isList ? 'flex-1 min-w-0 p-5 flex flex-col justify-center' : 'p-6'}>
        <h3 className={`font-bold text-zinc-900 dark:text-white line-clamp-2 group-hover:text-ember-500 dark:group-hover:text-ember-400 transition-colors font-display ${isList ? 'mb-1.5 text-base' : 'mb-2'}`}>
          {video.title}
        </h3>
        <div className={`flex items-center justify-between ${isList ? 'mb-2' : 'mb-3'}`}>
          <span className="text-sm text-zinc-500 font-medium truncate">
            {video.author_display_name || video.author_name}
          </span>
          <span className="text-xs text-zinc-400 font-mono shrink-0 ml-3">
            {formatDateShort(video.publish_date)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {video.category_name && (
            <span className="inline-flex px-2.5 py-0.5 bg-ember-50 dark:bg-ember-500/10 text-ember-600 dark:text-ember-300 rounded-full text-[10px] font-bold border border-ember-100 dark:border-ember-500/20">
              {video.category_name}
            </span>
          )}
          {(video.tags || []).slice(0, isList ? 3 : 4).map(tag => (
            <span key={tag.id} className="inline-flex px-2.5 py-0.5 bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 rounded-full text-[10px] font-bold">
              {tag.name}
            </span>
          ))}
          {(video.tags || []).length > (isList ? 3 : 4) && (
            <span className="text-[10px] text-zinc-400 font-bold">+{video.tags.length - (isList ? 3 : 4)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
