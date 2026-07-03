import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Search, SlidersHorizontal, X, ChevronDown, Film, RotateCcw, Flame, LayoutGrid, Rows3 } from 'lucide-react';
import { api } from '../utils/api';
import { morph } from '../utils/fx';
import VideoCard from '../components/VideoCard';
import QuickLook from '../components/QuickLook';

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

  // Tile layout — toggling MORPHS every card between grid and list shapes
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('videosView') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  const setViewMorph = (v) => {
    morph(() => setView(v));
    try { localStorage.setItem('videosView', v); } catch {}
  };

  // QuickLook — the clicked tile morphs into a preview panel
  const [quickLook, setQuickLook] = useState(null);
  const openQuick = (video) => morph(() => setQuickLook(video));
  const closeQuick = () => morph(() => setQuickLook(null));

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
    setLoading(v => videos.length === 0 ? true : v);
    const params = { sort };
    if (search) params.search = search;
    if (selectedTags.length > 0) params.tags = selectedTags.join(',');
    if (selectedAuthor) params.author = selectedAuthor;
    if (categorySlug) params.category = categorySlug;

    api.getVideos(params)
      .then(v => {
        // Result-set change happens inside a view transition: removed tiles
        // shrink away, survivors GLIDE to their new slots, new ones pop in.
        morph(() => { setVideos(v); setPage(1); setLoading(false); });
      })
      .catch(err => { console.error(err); setLoading(false); });
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

  const pageVideos = videos.slice((page - 1) * config.videosPerPage, page * config.videosPerPage);

  return (
    <div className="p-5 sm:px-10 sm:py-6 max-w-7xl mx-auto">
      {/* ── Hero header ── */}
      <div className="mb-8 anim-stagger-1">
        <div className="flex items-center gap-2 mb-3">
          <Flame className="w-4 h-4 text-ember-500 animate-pulse-soft" />
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-ember-500 font-display">
            {categorySlug ? 'Kategoria' : 'Biblioteka'}
          </span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight font-display mb-3">
          <span className="text-gradient">
            {categorySlug
              ? (categories.find(c => c.slug === categorySlug)?.name || categorySlug)
              : 'Baza Filmów'}
          </span>
        </h1>
        <div className="flex items-center justify-between gap-4">
          <p className="text-zinc-500 dark:text-zinc-400 text-base sm:text-lg">
            {categorySlug
              ? (categories.find(c => c.slug === categorySlug)?.description || 'Filmy w tej kategorii.')
              : 'Przeglądaj materiały wideo społeczności.'}
          </p>
          {continueWatching.length > 0 && (
            <button
              onClick={handleResetProgress}
              disabled={resetting}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-xs text-zinc-400 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 font-medium transition-all active:scale-95 disabled:opacity-50 group"
            >
              <RotateCcw className="w-3.5 h-3.5 group-hover:-rotate-180 transition-transform duration-500" />
              Resetuj postęp oglądania
            </button>
          )}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="mb-8 space-y-4 anim-stagger-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-ember-500 group-focus-within:scale-110 transition-all" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Szukaj po tytule..."
              className="input-field pl-14"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full hover:rotate-90 transition-all duration-300 animate-spring-in">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            )}
          </div>

          {/* Sort */}
          <div className="relative sm:min-w-[180px]">
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
          <div className="relative sm:min-w-[180px]">
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

          {/* Tag filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-6 py-3.5 rounded-full font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 hover:-translate-y-0.5 ${
              showFilters || selectedTags.length > 0
                ? 'bg-gradient-to-r from-ember-500 to-curtain-600 text-white shadow-ember'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-white/10 hover:border-ember-300 dark:hover:border-ember-500/40'
            }`}
          >
            <SlidersHorizontal className={`w-4 h-4 transition-transform duration-300 ${showFilters ? 'rotate-90' : ''}`} />
            Tagi {selectedTags.length > 0 && (
              <span className="animate-spring-in inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-white/20 text-[11px]">{selectedTags.length}</span>
            )}
          </button>

          {/* Grid ↔ list — every tile MORPHS into its new shape */}
          <div className="seg-tabs !p-1 self-start sm:self-auto" data-no-ripple>
            <button
              onClick={() => setViewMorph('grid')}
              className={`seg-tab !px-3.5 !py-2.5 ${view === 'grid' ? 'active' : ''}`}
              title="Siatka"
            >
              {view === 'grid' && <span className="seg-pill" style={{ viewTransitionName: 'view-pill' }} aria-hidden="true" />}
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMorph('list')}
              className={`seg-tab !px-3.5 !py-2.5 ${view === 'list' ? 'active' : ''}`}
              title="Lista"
            >
              {view === 'list' && <span className="seg-pill" style={{ viewTransitionName: 'view-pill' }} aria-hidden="true" />}
              <Rows3 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tags — smooth accordion */}
        <div className={`reveal-y ${showFilters ? 'open' : ''}`}>
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="label-field mb-0">Filtruj po tagach</span>
              {selectedTags.length > 0 && (
                <button onClick={() => setSelectedTags([])} className="text-xs text-ember-500 font-bold hover:text-ember-400 active:scale-90 transition-all">
                  Wyczyść
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 stagger-children">
              {tags.map(tag => (
                <label
                  key={tag.id}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold cursor-pointer transition-all duration-200 border active:scale-90 hover:-translate-y-0.5 ${
                    selectedTags.includes(tag.id)
                      ? 'bg-gradient-to-r from-ember-500 to-curtain-600 text-white border-transparent shadow-ember scale-105'
                      : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-ember-300 dark:hover:border-ember-500'
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
        </div>

        {/* Active filters indicator */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 animate-slide-up">
            <span className="text-xs text-zinc-500 font-medium">Aktywne filtry:</span>
            <button onClick={clearFilters} className="text-xs text-red-500 font-bold hover:text-red-400 active:scale-90 transition-all">
              Wyczyść wszystkie
            </button>
          </div>
        )}
      </div>

      {/* ── Tiles ── */}
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
        <div className="card p-16 text-center animate-spring-in">
          <div className="w-20 h-20 bg-gradient-to-br from-ember-500/10 to-curtain-500/10 border border-ember-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-float">
            <Film className="w-10 h-10 text-ember-400" />
          </div>
          <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2 font-display">Brak wyników</h3>
          <p className="text-zinc-500 text-sm">Nie znaleziono filmów spełniających kryteria wyszukiwania.</p>
        </div>
      ) : (
        <>
          {/* Grid — GRID_COLUMNS from .env is the MAX on desktop.
              Mobile: 1 col, Tablet (sm): 2 cols, Desktop (xl): env value */}
          {view === 'grid' && (
            <style>{`@media(min-width:1280px){.video-grid{grid-template-columns:repeat(${config.gridColumns},minmax(0,1fr))!important}}`}</style>
          )}
          <div className={view === 'grid'
            ? 'grid gap-6 grid-cols-1 sm:grid-cols-2 video-grid'
            : 'flex flex-col gap-4 video-grid'
          }>
            {pageVideos.map((video, idx) => (
              <VideoCard
                key={video.id}
                video={video}
                to={`/video/${video.id}${categorySlug ? `?from=${categorySlug}` : ''}`}
                layout={view}
                progress={progressMap[video.id]}
                onQuickLook={openQuick}
                morphHidden={quickLook?.id === video.id}
                delay={idx * 45}
              />
            ))}
          </div>

          {/* ── Pagination (morphs the tile set) ── */}
          {videos.length > config.videosPerPage && (() => {
            const totalPages = Math.ceil(videos.length / config.videosPerPage);
            const goPage = (p) => morph(() => setPage(p));
            return (
              <div className="flex items-center justify-center gap-2 mt-10">
                <button
                  onClick={() => goPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="page-btn px-5 py-2.5 rounded-full text-sm font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-white/10 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30"
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
                          onClick={() => goPage(p)}
                          className={`page-btn w-10 h-10 rounded-full text-sm font-bold ${p === page ? 'bg-gradient-to-br from-ember-500 to-curtain-600 text-white shadow-ember scale-110' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-white/10 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                        >
                          {p}
                        </button>
                      )
                    )}
                </div>
                <button
                  onClick={() => goPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="page-btn px-5 py-2.5 rounded-full text-sm font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-white/10 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30"
                >
                  Następna →
                </button>
              </div>
            );
          })()}
        </>
      )}

      {/* ── QuickLook — clicked tile morphed into this panel ── */}
      {quickLook && (
        <QuickLook
          video={quickLook}
          onClose={closeQuick}
          to={`/video/${quickLook.id}${categorySlug ? `?from=${categorySlug}` : ''}`}
          progress={progressMap[quickLook.id]}
        />
      )}
    </div>
  );
}
