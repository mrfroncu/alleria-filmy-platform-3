import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Search, SlidersHorizontal, X, ChevronDown, ChevronLeft, ChevronRight,
  Film, RotateCcw, LayoutGrid, Rows3, Play, Info, Clock, FolderOpen, Layers
} from 'lucide-react';
import { api } from '../utils/api';
import { morph } from '../utils/fx';
import { formatDateShort } from '../utils/helpers';
import VideoCard from '../components/VideoCard';
import QuickLook from '../components/QuickLook';
import Shelf, { PosterCard } from '../components/Shelf';

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

  // Billboard hero rotation
  const [heroIdx, setHeroIdx] = useState(0);
  const heroHoverRef = useRef(false);
  const heroBackdropRef = useRef(null);

  // Tile layout in grid mode — toggling MORPHS every card between shapes
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('videosView') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  const setViewMorph = (v) => {
    morph(() => setView(v));
    try { localStorage.setItem('videosView', v); } catch {}
  };

  // QuickLook — the clicked tile morphs into a preview panel.
  // `key` scopes the morph to the exact tile instance that was clicked
  // (the same video can sit on several shelves).
  const [quickLook, setQuickLook] = useState(null); // { video, key }
  const openQuick = (video, key) => morph(() => setQuickLook({ video, key: key ?? video.id }));
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
        morph(() => { setVideos(v); setPage(1); setHeroIdx(0); setLoading(false); });
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

  const hasActiveFilters = !!(search || selectedTags.length > 0 || selectedAuthor);

  const handleResetProgress = async () => {
    if (!confirm('Zresetować postęp wszystkich filmów? Funkcja "Kontynuuj oglądanie" zostanie wyczyszczona.')) return;
    setResetting(true);
    try { await api.resetProgress(); morph(() => setContinueWatching([])); } catch (e) {}
    setResetting(false);
  };

  const progressMap = useMemo(() =>
    Object.fromEntries(continueWatching.map(p => [p.video_id, p])),
    [continueWatching]
  );

  /* ── Browse-mode data ── */
  const isHome = !categorySlug && !hasActiveFilters;
  const showShelves = isHome && !loading && videos.length > 0;
  const showGrid = !isHome;

  const featured = useMemo(() => videos.filter(v => v.thumbnail).slice(0, 5), [videos]);
  const hero = featured.length ? featured[Math.min(heroIdx, featured.length - 1)] : null;
  const showHero = !hasActiveFilters && !loading && !!hero;

  const videosById = useMemo(() => Object.fromEntries(videos.map(v => [v.id, v])), [videos]);
  const cwVideos = useMemo(
    () => continueWatching.map(p => videosById[p.video_id]).filter(Boolean),
    [continueWatching, videosById]
  );
  const shelves = useMemo(() => {
    if (!showShelves) return [];
    const byCat = new Map();
    const rest = [];
    videos.forEach(v => {
      if (v.category_id) {
        if (!byCat.has(v.category_id)) byCat.set(v.category_id, []);
        byCat.get(v.category_id).push(v);
      } else rest.push(v);
    });
    const list = [];
    categories.forEach(c => {
      const vids = byCat.get(c.id);
      if (vids?.length) list.push({ key: `c${c.id}`, title: c.name, seeAllTo: `/category/${c.slug}`, videos: vids });
      byCat.delete(c.id);
    });
    // categories the user can watch but aren't in the categories list
    byCat.forEach((vids, cid) => {
      list.push({ key: `c${cid}`, title: vids[0]?.category_name || 'Kategoria', seeAllTo: null, videos: vids });
    });
    if (rest.length) list.push({ key: 'rest', title: 'Pozostałe', seeAllTo: null, videos: rest });
    return list;
  }, [showShelves, videos, categories]);

  // Auto-rotate the billboard (pauses on hover / hidden tab)
  useEffect(() => {
    if (!showHero || featured.length < 2 || quickLook) return;
    const t = setInterval(() => {
      if (heroHoverRef.current || document.hidden) return;
      morph(() => setHeroIdx(i => (i + 1) % featured.length));
    }, 8000);
    return () => clearInterval(t);
  }, [showHero, featured.length, quickLook]);

  const rotateHero = (dir) => {
    if (featured.length < 2) return;
    morph(() => setHeroIdx(i => (i + dir + featured.length) % featured.length));
  };

  const watchHero = () => {
    if (!hero) return;
    if (heroBackdropRef.current) heroBackdropRef.current.style.viewTransitionName = 'video-hero';
    navigate(`/video/${hero.id}${categorySlug ? `?from=${categorySlug}` : ''}`, { viewTransition: true });
  };

  const pageVideos = videos.slice((page - 1) * config.videosPerPage, page * config.videosPerPage);
  const catMeta = categorySlug ? categories.find(c => c.slug === categorySlug) : null;

  return (
    <div className="pb-4">

      {/* ════════ BILLBOARD HERO ════════ */}
      {showHero && (
        <section
          className="relative px-3 sm:px-6 lg:px-8 pt-1 mb-7"
          style={{ viewTransitionName: 'billboard' }}
          onMouseEnter={() => { heroHoverRef.current = true; }}
          onMouseLeave={() => { heroHoverRef.current = false; }}
        >
          <div className="relative h-[50vh] min-h-[360px] max-h-[560px] overflow-hidden rounded-[28px] border border-zinc-200/60 dark:border-white/[0.06] shadow-2xl shadow-zinc-300/30 dark:shadow-black/50 bg-zinc-900">
            {/* Backdrop with Ken Burns drift */}
            <div ref={heroBackdropRef} key={`bg-${hero.id}`} className="absolute inset-0">
              <img src={hero.thumbnail} alt="" className="hero-kenburns w-full h-full object-cover" />
            </div>
            {/* Cinematic grading */}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/35 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/85 via-zinc-950/25 to-transparent" />
            <div className="noise-overlay" />

            {/* Slide content — lines unmask one after another */}
            <div key={`txt-${hero.id}`} className="absolute inset-x-0 bottom-0 p-6 sm:p-10 max-w-3xl">
              <div className="hero-line hero-line-1 flex items-center gap-2 mb-3">
                <span className="px-2.5 py-1 rounded-full bg-ember-500/90 text-white text-[10px] font-bold uppercase tracking-[0.2em] font-display shadow-glow-sm">
                  {hero.category_name || 'Film'}
                </span>
                <span className="text-zinc-300 text-xs font-mono">{formatDateShort(hero.publish_date)}</span>
              </div>
              <h1 className="hero-line hero-line-2 text-3xl sm:text-5xl font-extrabold text-white font-display tracking-tight leading-[1.05] mb-3 drop-shadow-xl line-clamp-2">
                {hero.title}
              </h1>
              <p className="hero-line hero-line-3 text-zinc-300 text-sm sm:text-base mb-2">
                {hero.author_display_name || hero.author_name}
                {hero.tags?.length > 0 && (
                  <span className="text-zinc-400"> · {hero.tags.slice(0, 3).map(t => t.name).join(' · ')}</span>
                )}
              </p>
              {hero.description && (
                <p className="hero-line hero-line-3 hidden sm:block text-zinc-400 text-sm leading-relaxed line-clamp-2 max-w-xl mb-1">
                  {hero.description}
                </p>
              )}
              <div className="hero-line hero-line-4 flex items-center gap-3 mt-5">
                <button onClick={watchHero} className="btn-primary !py-3 !px-7 text-sm flex items-center gap-2">
                  <Play className="w-4 h-4 fill-current" /> Oglądaj
                </button>
                <button
                  onClick={() => openQuick(hero, `hero-${hero.id}`)}
                  className="flex items-center gap-2 py-3 px-6 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm backdrop-blur-md transition-all hover:-translate-y-0.5 active:scale-95"
                >
                  <Info className="w-4 h-4" /> Informacje
                </button>
              </div>
            </div>

            {/* Rotation controls */}
            {featured.length > 1 && (
              <>
                <div className="absolute bottom-6 right-6 sm:right-10 flex items-center gap-1.5">
                  {featured.map((f, i) => (
                    <button
                      key={f.id}
                      onClick={() => morph(() => setHeroIdx(i))}
                      className={`hero-dot ${i === heroIdx ? 'active' : ''}`}
                      aria-label={`Slajd ${i + 1}`}
                      data-no-ripple
                    />
                  ))}
                </div>
                <button onClick={() => rotateHero(-1)} aria-label="Poprzedni" data-no-ripple
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/35 hover:bg-ember-500/80 border border-white/15 text-white backdrop-blur-md flex items-center justify-center transition-all hover:scale-110 active:scale-90">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button onClick={() => rotateHero(1)} aria-label="Następny" data-no-ripple
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/35 hover:bg-ember-500/80 border border-white/15 text-white backdrop-blur-md flex items-center justify-center transition-all hover:scale-110 active:scale-90">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {/* ════════ TOOLBAR ════════ */}
      <div className={`px-5 sm:px-10 mb-6 space-y-4 ${showHero ? '' : 'pt-4'} anim-stagger-2`}>
        {/* Category header (category page without hero context) */}
        {categorySlug && (
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-ember-500 font-display mb-1 flex items-center gap-2">
                <FolderOpen className="w-3.5 h-3.5" /> Kategoria
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-display text-gradient">
                {catMeta?.name || categorySlug}
              </h1>
              {catMeta?.description && <p className="text-sm text-zinc-500 mt-1">{catMeta.description}</p>}
            </div>
          </div>
        )}

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
          <div className="relative sm:min-w-[170px]">
            <select value={sort} onChange={e => setSort(e.target.value)} className="input-field appearance-none pr-12 cursor-pointer">
              <option value="newest">Najnowsze</option>
              <option value="oldest">Najstarsze</option>
              <option value="title_asc">Tytuł A-Z</option>
              <option value="title_desc">Tytuł Z-A</option>
            </select>
            <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
          </div>

          {/* Author */}
          <div className="relative sm:min-w-[170px]">
            <select value={selectedAuthor} onChange={e => setSelectedAuthor(e.target.value)} className="input-field appearance-none pr-12 cursor-pointer">
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

          {/* Grid ↔ list in grid mode */}
          {showGrid && (
            <div className="seg-tabs !p-1 self-start sm:self-auto" data-no-ripple>
              <button onClick={() => setViewMorph('grid')} className={`seg-tab !px-3.5 !py-2.5 ${view === 'grid' ? 'active' : ''}`} title="Siatka">
                {view === 'grid' && <span className="seg-pill" style={{ viewTransitionName: 'view-pill' }} aria-hidden="true" />}
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMorph('list')} className={`seg-tab !px-3.5 !py-2.5 ${view === 'list' ? 'active' : ''}`} title="Lista">
                {view === 'list' && <span className="seg-pill" style={{ viewTransitionName: 'view-pill' }} aria-hidden="true" />}
                <Rows3 className="w-4 h-4" />
              </button>
            </div>
          )}
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
                  <input type="checkbox" checked={selectedTags.includes(tag.id)} onChange={() => toggleTag(tag.id)} className="sr-only" />
                  {tag.name}
                </label>
              ))}
              {tags.length === 0 && <p className="text-sm text-zinc-400 italic">Brak tagów</p>}
            </div>
          </div>
        </div>

        {/* Active filters / reset progress row */}
        <div className="flex items-center gap-4 min-h-[1rem]">
          {hasActiveFilters && (
            <div className="flex items-center gap-2 animate-slide-up">
              <span className="text-xs text-zinc-500 font-medium">Aktywne filtry:</span>
              <button onClick={clearFilters} className="text-xs text-red-500 font-bold hover:text-red-400 active:scale-90 transition-all">
                Wyczyść wszystkie
              </button>
            </div>
          )}
          {continueWatching.length > 0 && isHome && (
            <button
              onClick={handleResetProgress}
              disabled={resetting}
              className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] text-zinc-400 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 font-medium transition-all active:scale-95 disabled:opacity-50 group"
            >
              <RotateCcw className="w-3 h-3 group-hover:-rotate-180 transition-transform duration-500" />
              Resetuj postęp
            </button>
          )}
        </div>
      </div>

      {/* ════════ CONTENT ════════ */}
      {loading ? (
        <div className="px-5 sm:px-10">
          <div className="h-[42vh] min-h-[300px] rounded-[28px] bg-zinc-100 dark:bg-zinc-800 skeleton mb-8" />
          <div className="flex gap-4 overflow-hidden">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="w-[260px] shrink-0">
                <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-2xl skeleton" />
                <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-3/4 mt-3" />
              </div>
            ))}
          </div>
        </div>
      ) : videos.length === 0 ? (
        <div className="px-5 sm:px-10">
          <div className="card p-16 text-center animate-spring-in">
            <div className="w-20 h-20 bg-gradient-to-br from-ember-500/10 to-curtain-500/10 border border-ember-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-float">
              <Film className="w-10 h-10 text-ember-400" />
            </div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2 font-display">Brak wyników</h3>
            <p className="text-zinc-500 text-sm">Nie znaleziono filmów spełniających kryteria wyszukiwania.</p>
          </div>
        </div>
      ) : showShelves ? (
        /* ════ SHELVES (home browse) ════ */
        <div className="px-5 sm:px-10 space-y-2">
          {cwVideos.length > 0 && (
            <Shelf title="Kontynuuj oglądanie" icon={Clock}>
              {cwVideos.map(v => (
                <PosterCard
                  key={`cw-${v.id}`}
                  video={v}
                  progress={progressMap[v.id]}
                  morphKey={`cw-${v.id}`}
                  onQuickLook={(vid) => openQuick(vid, `cw-${vid.id}`)}
                  morphHidden={quickLook?.key === `cw-${v.id}`}
                />
              ))}
            </Shelf>
          )}

          {shelves.map(shelf => (
            <Shelf key={shelf.key} title={shelf.title} icon={shelf.key === 'rest' ? Layers : FolderOpen} seeAllTo={shelf.seeAllTo}>
              {shelf.videos.map(v => (
                <PosterCard
                  key={v.id}
                  video={v}
                  progress={progressMap[v.id]}
                  onQuickLook={(vid) => openQuick(vid, vid.id)}
                  morphHidden={quickLook?.key === v.id}
                />
              ))}
            </Shelf>
          ))}
        </div>
      ) : (
        /* ════ GRID (category page / active filters) ════ */
        <div className="px-5 sm:px-10">
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
                onQuickLook={(vid) => openQuick(vid, vid.id)}
                morphHidden={quickLook?.key === video.id}
                delay={idx * 45}
              />
            ))}
          </div>

          {/* Pagination (morphs the tile set) */}
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
        </div>
      )}

      {/* ── QuickLook — clicked tile morphed into this panel ── */}
      {quickLook && (
        <QuickLook
          video={quickLook.video}
          morphKey={quickLook.key}
          onClose={closeQuick}
          to={`/video/${quickLook.video.id}${categorySlug ? `?from=${categorySlug}` : ''}`}
          progress={progressMap[quickLook.video.id]}
        />
      )}
    </div>
  );
}
