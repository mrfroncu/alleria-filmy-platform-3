import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowLeft, Film } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate, youtubeToEmbed } from '../utils/helpers';

export default function VideoPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSource, setActiveSource] = useState('main');
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setActiveSource('main');
    api.getVideo(id)
      .then(v => { setVideo(v); setError(null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 sm:p-10 max-w-5xl mx-auto animate-fade-in">
        <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-[32px] skeleton mb-6" />
        <div className="h-8 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-2/3 mb-4" />
        <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-1/3" />
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="p-10 max-w-5xl mx-auto text-center">
        <div className="card p-16">
          <Film className="w-16 h-16 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white font-display mb-2">Film nie znaleziony</h2>
          <p className="text-zinc-500 mb-6">{error || 'Nie znaleziono filmu o podanym ID.'}</p>
          <Link to="/" className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Wróć do bazy
          </Link>
        </div>
      </div>
    );
  }

  const getEmbedHtml = () => {
    let source = video.main_source;
    let type = video.main_source_type || 'youtube';
    
    if (activeSource === 'mirror1' && video.mirror1_url) {
      source = video.mirror1_url;
      type = video.mirror1_is_embed ? 'embed' : 'youtube';
    } else if (activeSource === 'mirror2' && video.mirror2_url) {
      source = video.mirror2_url;
      type = video.mirror2_is_embed ? 'embed' : 'youtube';
    }

    if (type === 'embed' || type === 'html') {
      return { __html: source };
    }
    return null;
  };

  const getEmbedUrl = () => {
    let source = video.main_source;
    let type = video.main_source_type || 'youtube';

    if (activeSource === 'mirror1' && video.mirror1_url) {
      source = video.mirror1_url;
      type = video.mirror1_is_embed ? 'embed' : 'youtube';
    } else if (activeSource === 'mirror2' && video.mirror2_url) {
      source = video.mirror2_url;
      type = video.mirror2_is_embed ? 'embed' : 'youtube';
    }

    if (type === 'embed' || type === 'html') return null;
    return youtubeToEmbed(source);
  };

  const embedUrl = getEmbedUrl();
  const embedHtml = getEmbedHtml();
  const hasMirrors = video.mirror1_url || video.mirror2_url;

  const sources = [
    { key: 'main', label: video.main_source_title || 'Główne źródło' },
    ...(video.mirror1_url ? [{ key: 'mirror1', label: video.mirror1_name || 'Mirror 1' }] : []),
    ...(video.mirror2_url ? [{ key: 'mirror2', label: video.mirror2_name || 'Mirror 2' }] : []),
  ];

  return (
    <div className="p-6 sm:p-10 max-w-5xl mx-auto animate-fade-in">
      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors mb-6 font-medium text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Wróć do bazy
      </button>

      {/* Title & Meta */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display mb-3">
            {video.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={`/author/${video.author_id}`}
              className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors"
            >
              {video.author_display_name || video.author_name}
            </Link>
            {video.tags && video.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {video.tags.map(tag => (
                  <Link
                    key={tag.id}
                    to={`/tag/${tag.id}`}
                    className="tag-chip"
                  >
                    {tag.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="text-sm text-zinc-400 font-mono">{formatDate(video.publish_date)}</span>
        </div>
      </div>

      {/* Video Player */}
      <div className="card overflow-hidden mb-6">
        <div className="aspect-video bg-black relative">
          {embedUrl ? (
            <iframe
              key={activeSource}
              src={embedUrl}
              title={video.title}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              frameBorder="0"
            />
          ) : embedHtml ? (
            <div
              key={activeSource}
              className="absolute inset-0 w-full h-full [&>iframe]:w-full [&>iframe]:h-full"
              dangerouslySetInnerHTML={embedHtml}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Film className="w-16 h-16 text-zinc-700" />
            </div>
          )}
        </div>
      </div>

      {/* Source Selection */}
      {hasMirrors && (
        <div className="mb-6">
          <span className="label-field">Źródło</span>
          <div className="flex flex-wrap gap-2">
            {sources.map(s => (
              <button
                key={s.key}
                onClick={() => setActiveSource(s.key)}
                className={`px-5 py-3 rounded-2xl font-bold text-sm transition-all ${
                  activeSource === s.key
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Prev / Next Navigation */}
      <div className="flex items-stretch gap-4 mb-8">
        {video.nextVideo ? (
          <Link
            to={`/video/${video.nextVideo.id}`}
            className="flex-1 card p-5 group hover:shadow-lg transition-all hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-2 text-indigo-500 font-bold text-sm mb-1">
              <ChevronLeft className="w-4 h-4" /> następny film
            </div>
            <p className="text-sm text-zinc-900 dark:text-white font-medium truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {video.nextVideo.title}
            </p>
          </Link>
        ) : <div className="flex-1" />}
        
        {video.prevVideo ? (
          <Link
            to={`/video/${video.prevVideo.id}`}
            className="flex-1 card p-5 text-right group hover:shadow-lg transition-all hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-end gap-2 text-indigo-500 font-bold text-sm mb-1">
              poprzedni film <ChevronRight className="w-4 h-4" />
            </div>
            <p className="text-sm text-zinc-900 dark:text-white font-medium truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {video.prevVideo.title}
            </p>
          </Link>
        ) : <div className="flex-1" />}
      </div>

      {/* Description */}
      {video.description && (
        <div className="card p-8">
          <h3 className="label-field">Opis</h3>
          <div className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
            {video.description}
          </div>
        </div>
      )}
    </div>
  );
}
