import React, { useState, useEffect, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Search, SlidersHorizontal, X, ChevronDown, Film, RotateCcw } from 'lucide-react';
import { api } from '../utils/api';
import { formatDateShort } from '../utils/helpers';

export default function VideosPage() {
  const { authorId, tagId, categorySlug } = useParams();
  const navigate = useNavigate();
  const [videos, setVideos] = useState([]);
  const [tags, setTags] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState(tagId ? [parseInt(tagId)] : []);
  const [selectedAuthor, setSelectedAuthor] = useState(authorId || '');
  const [sort, setSort] = useState('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [continueWatching, setContinueWatching] = useState([]);
  const [resetting, setResetting] = useState(false);

  // Display config — videosPerPage should be a multiple of gridColumns (default 3)
  const [config, setConfig] = useState({ videosPerPage: 12, gridColumns: 3 });

  useEffect(() => {
    const tagPromise = categorySlug ? api.getCategoryTags(categorySlug) : api.getTags();
    Promise.all([tagPromise, api.getAuthors(), api.getCategories(), api.getConfig()])
      .then(([t, a, c, cfg]) => { setTags(t); setAuthors(a); setCategories(c); if (cfg) setConfig(cfg); })
      .catch(console.error);
  }, [categorySlug]);

  useEffect(() => {
    api.getAllProgress().then(setContinueWatching).catch(() => {});
  }, []);

  useEffect(() => {
    if (tagId) setSelectedTags([parseInt(tagId)]);
    if (authorId) setSelectedAuthor(authorId);
  }, [tagId, authorId]);

  useEffect(() => {
    setLoading(true);
    const params = { sort };
    if (search) params.search = search;
    if (selectedTags.length > 0) params.tags = selectedTags.join(',');
    if (selectedAuthor) params.author = selectedAuthor;
    if (categorySlug) params.category = categorySlug;

    api.getVideos(params)
      .then(v => { setVideos(v); setPage(1); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, selectedTags, selectedAuthor, sort, categorySlug]);

  const toggleTag = (id) => {
    setSelectedTags(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedTags([]);
    setSelectedAuthor('');
    setSort('newest');
    if (tagId || authorId) navigate('/');
  };

  const hasActiveFilters = search || selectedTags.length > 0 || selectedAuthor;

  const handleResetProgress = async () => {
    if (!confirm('Zresetować postęp wszystkich filmów? Funkcja "Kontynuuj oglądanie" zostanie wyczyszczona.')) return;
    setResetting(true);
    try { await api.resetProgress(); setContinueWatching([]); } catch (e) {}
    setResetting(false);
  };

  const progressMap = useMemo(() =>
    Object.fromEntries(continueWatching.map(p => [p.video_id, p])),
    [continueWatching]
  );

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto page-enter">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display mb-3">
          {categorySlug
            ? (categories.find(c => c.slug === categorySlug)?.name || categorySlug)
            : 'Baza Filmów'}
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-base sm:text-lg">
          {categorySlug
            ? (categories.find(c => c.slug === categorySlug)?.description || 'Filmy w tej kategorii.')
            : 'Przeglądaj materiały wideo społeczności.'}
        </p>
      </div>

      {/* Search & Filters Bar */}
      <div className="mb-8 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Szukaj po tytule..."
              className="input-field pl-14"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            )}
          </div>

          {/* Sort */}
          <div className="relative min-w-[200px]">
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="input-field appearance-none pr-12 cursor-pointer"
            >
              <option value="newest">Najnowsze</option>
              <option value="oldest">Najstarsze</option>
              <option value="title_asc">Tytuł A-Z</option>
              <option value="title_desc">Tytuł Z-A</option>
            </select>
            <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
          </div>

          {/* Author filter */}
          <div className="relative min-w-[200px]">
            <select
              value={selectedAuthor}
              onChange={e => setSelectedAuthor(e.target.value)}
              className="input-field appearance-none pr-12 cursor-pointer"
            >
              <option value="">Wszyscy autorzy</option>
              {authors.map(a => (
                <option key={a.id} value={a.id}>{a.display_name || a.username}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-5 py-4 rounded-2xl font-bold text-sm flex items-center gap-2 transition-all ${
              showFilters || selectedTags.length > 0
                ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Tagi {selectedTags.length > 0 && `(${selectedTags.length})`}
          </button>
        </div>

        {/* Tags checkboxes */}
        {showFilters && (
          <div className="card p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <span className="label-field mb-0">Filtruj po tagach</span>
              {selectedTags.length > 0 && (
                <button onClick={() => setSelectedTags([])} className="text-xs text-violet-500 font-bold hover:text-violet-400">
                  Wyczyść
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <label
                  key={tag.id}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all border ${
                    selectedTags.includes(tag.id)
                      ? 'bg-violet-500 text-white border-violet-500 shadow-lg shadow-violet-500/20'
                      : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-violet-300 dark:hover:border-violet-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTags.includes(tag.id)}
                    onChange={() => toggleTag(tag.id)}
                    className="sr-only"
                  />
                  {tag.name}
                </label>
              ))}
              {tags.length === 0 && (
                <p className="text-sm text-zinc-400 italic">Brak tagów</p>
              )}
            </div>
          </div>
        )}

        {/* Active filters indicator */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-medium">Aktywne filtry:</span>
            <button onClick={clearFilters} className="text-xs text-red-500 font-bold hover:text-red-400 transition-colors">
              Wyczyść wszystkie
            </button>
          </div>
        )}
      </div>

      {/* Videos Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="card overflow-hidden">
              <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 skeleton" />
              <div className="p-6 space-y-3">
                <div className="h-5 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-3/4" />
                <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Film className="w-10 h-10 text-zinc-400" />
          </div>
          <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2 font-display">Brak wyników</h3>
          <p className="text-zinc-500 text-sm">Nie znaleziono filmów spełniających kryteria wyszukiwania.</p>
        </div>
      ) : (
        <>
          {/* Grid — GRID_COLUMNS from .env is the MAX on desktop.
              Mobile: 1 col, Tablet (sm): 2 cols, Desktop (xl): env value */}
          <style>{`@media(min-width:1280px){.video-grid{grid-template-columns:repeat(${config.gridColumns},minmax(0,1fr))!important}}`}</style>
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 video-grid">
            {videos.slice((page - 1) * config.videosPerPage, page * config.videosPerPage).map((video, idx) => (
            <Link
              key={video.id}
              to={`/video/${video.id}${categorySlug ? `?from=${categorySlug}` : ''}`}
              className="video-card card overflow-hidden group"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
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
                    <Film className="w-12 h-12 text-zinc-300 dark:text-zinc-700" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                {progressMap[video.id] && (() => {
                  const p = progressMap[video.id];
                  const pct = p.duration > 0 ? Math.min(100, (p.position / p.duration) * 100) : 0;
                  return (
                    <>
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                        <div className="h-full bg-violet-500" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/70 text-white text-[9px] font-bold rounded backdrop-blur-sm">
                        Kontynuuj oglądanie
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="p-6">
                <h3 className="font-bold text-zinc-900 dark:text-white mb-2 line-clamp-2 group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors">
                  {video.title}
                </h3>
                <div className="flex items-center justify-between mb-3">
                  <Link
                    to={`/author/${video.author_id}`}
                    onClick={e => e.stopPropagation()}
                    className="text-sm text-zinc-500 font-medium hover:text-violet-500 transition-colors no-underline"
                  >
                    {video.author_display_name || video.author_name}
                  </Link>
                  <span className="text-xs text-zinc-400 font-mono">
                    {formatDateShort(video.publish_date)}
                  </span>
                </div>
                {video.category_name && (
                  <div className="mb-2">
                    <span className="inline-flex px-2 py-0.5 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300 rounded-lg text-[10px] font-bold">
                      {video.category_name}
                    </span>
                  </div>
                )}
                {video.tags && video.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {video.tags.slice(0, 4).map(tag => (
                      <span key={tag.id} className="inline-flex px-2 py-0.5 bg-violet-50 dark:bg-violet-500/10 text-violet-500 dark:text-violet-300 rounded-lg text-[10px] font-bold">
                        {tag.name}
                      </span>
                    ))}
                    {video.tags.length > 4 && (
                      <span className="text-[10px] text-zinc-400 font-bold self-center">+{video.tags.length - 4}</span>
                    )}
                  </div>
                )}
              </div>
            </Link>
            ))}
          </div>

          {/* Pagination */}
          {videos.length > config.videosPerPage && (() => {
            const totalPages = Math.ceil(videos.length / config.videosPerPage);
            return (
              <div className="flex items-center justify-center gap-2 mt-10">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 transition-all"
                >
                  ← Poprzednia
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                    .reduce((acc, p, i, arr) => {
                      if (i > 0 && p - arr[i - 1] > 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '...' ? (
                        <span key={`dot-${i}`} className="px-2 py-2 text-zinc-400 text-sm">...</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${p === page ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                        >
                          {p}
                        </button>
                      )
                    )}
                </div>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 transition-all"
                >
                  Następna →
                </button>
              </div>
            );
          })()}
        </>
      )}

      {/* Reset progress — shown only when there's something to reset */}
      {continueWatching.length > 0 && (
        <div className="flex justify-center mt-12">
          <button
            onClick={handleResetProgress}
            disabled={resetting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 font-medium transition-all disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Resetuj postęp oglądania
          </button>
        </div>
      )}
    </div>
  );
}
