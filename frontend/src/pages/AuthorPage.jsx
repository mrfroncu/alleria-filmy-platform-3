import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Film, ArrowLeft, Calendar } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate, formatDateShort } from '../utils/helpers';

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
        className={`${sizeClass} rounded-2xl object-cover ring-4 ring-white dark:ring-zinc-900 shadow-xl`}
      />
    );
  }
  return (
    <div className={`${sizeClass} rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center font-black text-white ring-4 ring-white dark:ring-zinc-900 shadow-xl`}>
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
      .catch(() => setError('Nie znaleziono autora.'))
      .finally(() => setLoading(false));
  }, [authorId]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header skeleton */}
        <div className="card p-8 mb-8">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-zinc-100 dark:bg-zinc-800 skeleton shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="h-7 bg-zinc-100 dark:bg-zinc-800 rounded-xl skeleton w-48" />
              <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-32" />
            </div>
          </div>
        </div>
        {/* Grid skeleton */}
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
        <div className="card p-16 text-center">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Film className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Nie znaleziono autora</h2>
          <p className="text-zinc-500 text-sm mb-6">{error}</p>
          <Link to="/" className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Wróć do biblioteki
          </Link>
        </div>
      </div>
    );
  }

  const displayName = author.display_name || author.username;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">

      {/* ── Author profile card ── */}
      <div className="card overflow-hidden">
        {/* Top gradient stripe */}
        <div className="h-24 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 relative">
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
        </div>

        <div className="px-8 pb-8">
          {/* Avatar — overlapping the stripe */}
          <div className="-mt-10 mb-4">
            <AuthorAvatar author={author} size="lg" />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
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
            </div>

            {/* Stats */}
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-2xl font-black text-violet-500">{videos.length}</p>
                <p className="text-xs text-zinc-400 font-medium">
                  {videos.length === 1 ? 'film' : videos.length < 5 ? 'filmy' : 'filmów'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section header ── */}
      <div className="flex items-center justify-between">
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
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-violet-500 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Biblioteka
        </Link>
      </div>

      {/* ── Video grid ── */}
      {videos.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {videos.map((video, idx) => (
            <Link
              key={video.id}
              to={`/video/${video.id}`}
              className="video-card card overflow-hidden group"
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                {video.thumbnail ? (
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="video-thumb w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film className="w-10 h-10 text-zinc-300 dark:text-zinc-700" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>

              {/* Info */}
              <div className="p-5">
                <h3 className="font-bold text-zinc-900 dark:text-white mb-2 line-clamp-2 group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors leading-snug">
                  {video.title}
                </h3>
                <div className="flex items-center justify-between mb-2">
                  {video.category_name && (
                    <span className="inline-flex px-2 py-0.5 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300 rounded-lg text-[10px] font-bold">
                      {video.category_name}
                    </span>
                  )}
                  <span className="text-xs text-zinc-400 font-mono ml-auto">
                    {formatDateShort(video.publish_date)}
                  </span>
                </div>
                {video.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {video.tags.slice(0, 3).map(tag => (
                      <span key={tag.id} className="tag-chip text-[10px] py-0.5 px-2">{tag.name}</span>
                    ))}
                    {video.tags.length > 3 && (
                      <span className="text-[10px] text-zinc-400 py-0.5">+{video.tags.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
