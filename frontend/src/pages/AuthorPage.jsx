import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Film, ArrowLeft, Calendar } from 'lucide-react';
import { api } from '../utils/api';
import { morph } from '../utils/fx';
import { formatDate } from '../utils/helpers';
import { useCountUp } from '../utils/hooks';
import VideoCard from '../components/VideoCard';
import QuickLook from '../components/QuickLook';

function AuthorAvatar({ author, size = 'lg' }) {
  const letter = (author.display_name || author.username || '?')[0].toUpperCase();
  const sizeClass = size === 'lg'
    ? 'w-20 h-20 text-3xl'
    : 'w-10 h-10 text-base';

  if (author.avatar) {
    return (
      <img
        src={author.avatar}
        alt={author.display_name}
        className={`${sizeClass} rounded-3xl object-cover ring-4 ring-white dark:ring-zinc-900 shadow-xl hover:scale-105 hover:-rotate-3 transition-transform duration-300`}
      />
    );
  }
  return (
    <div className={`${sizeClass} rounded-3xl bg-gradient-to-br from-ember-500 to-curtain-600 flex items-center justify-center font-extrabold text-white ring-4 ring-white dark:ring-zinc-900 shadow-xl font-display hover:scale-105 hover:-rotate-3 transition-transform duration-300`}>
      {letter}
    </div>
  );
}

export default function AuthorPage() {
  const { authorId } = useParams();
  const [author, setAuthor] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quickLook, setQuickLook] = useState(null);
  const videoCount = useCountUp(videos.length);

  const openQuick = (video) => morph(() => setQuickLook(video));
  const closeQuick = () => morph(() => setQuickLook(null));

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.getAuthor(authorId),
      api.getVideos({ author: authorId, sort: 'newest' }),
    ])
      .then(([a, v]) => {
        setAuthor(a);
        setVideos(Array.isArray(v) ? v : v.videos ?? []);
      })
      .catch(e => setError(e.message || 'Nie znaleziono autora.'))
      .finally(() => setLoading(false));
  }, [authorId]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="card p-8 mb-8">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-3xl bg-zinc-100 dark:bg-zinc-800 skeleton shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="h-7 bg-zinc-100 dark:bg-zinc-800 rounded-xl skeleton w-48" />
              <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-32" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="card overflow-hidden">
              <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 skeleton" />
              <div className="p-5 space-y-3">
                <div className="h-5 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-3/4" />
                <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !author) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="card p-16 text-center animate-spring-in">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-4 animate-float">
            <Film className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2 font-display">Nie znaleziono autora</h2>
          <p className="text-zinc-500 text-sm mb-6">{error}</p>
          <Link to="/" viewTransition className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Wróć do biblioteki
          </Link>
        </div>
      </div>
    );
  }

  const displayName = author.display_name || author.username;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">

      {/* ── Author profile card ── */}
      <div className="card anim-stagger-1">
        <div className="h-28 bg-gradient-to-r from-ember-600 via-curtain-600 to-ember-500 relative overflow-hidden rounded-t-3xl" style={{ backgroundSize: '300% 100%', animation: 'gradientFlow 12s ease infinite' }}>
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
          <div className="noise-overlay" />
        </div>

        <div className="px-8 pb-8">
          <div className="-mt-10 mb-5 relative z-10 animate-spring-in" style={{ animationDelay: '120ms' }}>
            <AuthorAvatar author={author} size="lg" />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white font-display">
                {displayName}
              </h1>
              {author.username !== author.display_name && (
                <p className="text-sm text-zinc-400 mt-0.5">@{author.username}</p>
              )}
              {author.created_at && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-zinc-400">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Dołączył {formatDate(author.created_at)}</span>
                </div>
              )}
              {author.bio && (
                <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-xl whitespace-pre-wrap">
                  {author.bio}
                </p>
              )}
            </div>

            <div className="shrink-0 flex items-center gap-6 sm:mt-1">
              <div className="text-center">
                <p className="text-2xl font-extrabold text-gradient font-display">{videoCount}</p>
                <p className="text-xs text-zinc-400 font-medium">
                  {videos.length === 1 ? 'film' : videos.length < 5 ? 'filmy' : 'filmów'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section header ── */}
      <div className="flex items-center justify-between anim-stagger-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display">
            Filmy autora
          </h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Wszystkie dostępne filmy dodane przez {displayName}
          </p>
        </div>
        <Link
          to="/"
          viewTransition
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-ember-500 transition-all hover:gap-2.5 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Biblioteka
        </Link>
      </div>

      {/* ── Video grid ── */}
      {videos.length === 0 ? (
        <div className="card p-16 text-center animate-spring-in">
          <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-3xl flex items-center justify-center mx-auto mb-4 animate-float">
            <Film className="w-8 h-8 text-zinc-400" />
          </div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2 font-display">
            Brak dostępnych filmów
          </h3>
          <p className="text-zinc-500 text-sm">
            Ten autor nie ma jeszcze żadnych filmów dostępnych dla Ciebie.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 video-grid">
          {videos.map((video, idx) => (
            <VideoCard
              key={video.id}
              video={video}
              layout="grid"
              onQuickLook={openQuick}
              morphHidden={quickLook?.id === video.id}
              delay={idx * 40}
            />
          ))}
        </div>
      )}

      {quickLook && (
        <QuickLook video={quickLook} onClose={closeQuick} />
      )}
    </div>
  );
}
