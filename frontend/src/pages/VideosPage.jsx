import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Search, SlidersHorizontal, X, ChevronDown, Film, RotateCcw, Play } from 'lucide-react';
import { api } from '../utils/api';
import { formatDateShort } from '../utils/helpers';

// ── Scroll reveal hook ──────────────────────────────────────────────────────
function useScrollReveal(ref, options = {}) {
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('in'); observer.disconnect(); } },
      { threshold: options.threshold ?? 0.12, ...options }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
}

// ── Mouse-tracking glow ─────────────────────────────────────────────────────
function useMouseGlow(ref) {
  const onMove = useCallback((e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`);
  }, []);
  return onMove;
}

// ── Video card ──────────────────────────────────────────────────────────────
function VideoCard({ video, categorySlug, progress, delay = 0 }) {
  const cardRef = useRef(null);
  const onMove = useMouseGlow(cardRef);

  const p = progress;
  const pct = p && p.duration > 0 ? Math.min(100, (p.position / p.duration) * 100) : 0;

  return (
    <Link
      ref={cardRef}
      to={`/video/${video.id}${categorySlug ? `?from=${categorySlug}` : ''}`}
      className="video-card block no-underline"
      style={{
        background: 'linear-gradient(180deg, var(--bg-2) 0%, var(--bg-1) 100%)',
        border: '1px solid var(--line-2)',
        borderRadius: '20px',
        animationDelay: `${delay}ms`,
      }}
      onMouseMove={onMove}
    >
      {/* Thumbnail */}
      <div className="relative overflow-hidden" style={{ borderRadius: '19px 19px 0 0', aspectRatio: '16/9' }}>
        {video.thumbnail ? (
          <img src={video.thumbnail} alt={video.title}
            className="video-thumb w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg-3)' }}>
            <Film className="w-12 h-12 opacity-20" style={{ color: 'var(--fg-3)' }} />
          </div>
        )}

        {/* Hover play overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300"
          style={{ background: 'rgba(10,10,16,0.45)' }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center transition-transform duration-300 hover:scale-110"
            style={{ background: 'var(--ember)', boxShadow: '0 0 30px var(--ember-glow)' }}>
            <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
          </div>
        </div>

        {/* Category badge */}
        {video.category_name && (
          <div className="absolute top-3 left-3">
            <span className="text-[10px] font-bold font-mono uppercase tracking-[0.1em] px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(10,10,16,0.75)', border: '1px solid var(--line-2)', color: 'var(--fg-2)', backdropFilter: 'blur(8px)' }}>
              {video.category_name}
            </span>
          </div>
        )}

        {/* Progress bar */}
        {pct > 0 && (
          <>
            <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: 'rgba(0,0,0,0.5)' }}>
              <div className="h-full" style={{ width: `${pct}%`, background: 'var(--ember)', boxShadow: '0 0 6px var(--ember)' }} />
            </div>
            <div className="absolute bottom-2 right-2 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(10,10,16,0.80)', color: 'var(--ember-2)', backdropFilter: 'blur(6px)' }}>
              {Math.round(pct)}%
            </div>
          </>
        )}
      </div>

      {/* Body */}
      <div className="p-5 group">
        <h3 className="font-bold text-[15px] mb-2 line-clamp-2 transition-colors duration-200 leading-snug"
          style={{ color: 'var(--fg)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--ember-2)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg)'; }}>
          {video.title}
        </h3>

        <div className="flex items-center justify-between mb-3">
          <Link
            to={`/author/${video.author_id}`}
            onClick={e => e.stopPropagation()}
            className="text-sm font-medium no-underline transition-colors"
            style={{ color: 'var(--fg-3)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--ember-2)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-3)'; }}
          >
            {video.author_display_name || video.author_name}
          </Link>
          <span className="text-[11px] font-mono" style={{ color: 'var(--fg-4)' }}>
            {formatDateShort(video.publish_date)}
          </span>
        </div>

        {/* Tags */}
        {video.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {video.tags.slice(0, 4).map(tag => (
              <span key={tag.id} className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,91,46,0.10)', color: 'var(--ember-2)', border: '1px solid rgba(255,91,46,0.20)' }}>
                {tag.name}
              </span>
            ))}
            {video.tags.length > 4 && (
              <span className="text-[10px] font-bold self-center font-mono" style={{ color: 'var(--fg-4)' }}>
                +{video.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function VideosPage() {
  const { authorId, tagId, categorySlug } = useParams();
  const navigate = useNavigate();
  const gridRef = useRef(null);
  const headerRef = useRef(null);
  const filtersRef = useRef(null);

  const [videos, setVideos]       = useState([]);
  const [tags, setTags]           = useState([]);
  const [authors, setAuthors]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [selectedTags, setSelectedTags] = useState(tagId ? [parseInt(tagId)] : []);
  const [selectedAuthor, setSelectedAuthor] = useState(authorId || '');
  const [sort, setSort]           = useState('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage]           = useState(1);
  const [continueWatching, setContinueWatching] = useState([]);
  const [resetting, setResetting] = useState(false);
  const [config, setConfig]       = useState({ videosPerPage: 12, gridColumns: 3 });

  useScrollReveal(headerRef);
  useScrollReveal(filtersRef, { threshold: 0.05 });

  useEffect(() => {
    const tagPromise = categorySlug ? api.getCategoryTags(categorySlug) : api.getTags();
    Promise.all([tagPromise, api.getAuthors(), api.getCategories(), api.getConfig()])
      .then(([t, a, c, cfg]) => { setTags(t); setAuthors(a); setCategories(c); if (cfg) setConfig(cfg); })
      .catch(console.error);
  }, [categorySlug]);

  useEffect(() => { api.getAllProgress().then(setContinueWatching).catch(() => {}); }, []);

  useEffect(() => {
    if (tagId) setSelectedTags([parseInt(tagId)]);
    if (authorId) setSelectedAuthor(authorId);
  }, [tagId, authorId]);

  useEffect(() => {
    setLoading(true);
    const params = { sort };
    if (search)                params.search = search;
    if (selectedTags.length > 0) params.tags = selectedTags.join(',');
    if (selectedAuthor)        params.author = selectedAuthor;
    if (categorySlug)          params.category = categorySlug;
    api.getVideos(params)
      .then(v => { setVideos(v); setPage(1); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, selectedTags, selectedAuthor, sort, categorySlug]);

  // Trigger grid reveal after loading
  useEffect(() => {
    if (!loading && gridRef.current) {
      const el = gridRef.current;
      el.classList.remove('in');
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    }
  }, [loading, page]);

  const toggleTag = (id) => setSelectedTags(p => p.includes(id) ? p.filter(t => t !== id) : [...p, id]);

  const clearFilters = () => {
    setSearch(''); setSelectedTags([]); setSelectedAuthor(''); setSort('newest');
    if (tagId || authorId) navigate('/');
  };

  const handleResetProgress = async () => {
    if (!confirm('Zresetować postęp wszystkich filmów?')) return;
    setResetting(true);
    try { await api.resetProgress(); setContinueWatching([]); } catch (e) {}
    setResetting(false);
  };

  const hasActiveFilters = search || selectedTags.length > 0 || selectedAuthor;
  const progressMap = useMemo(() =>
    Object.fromEntries(continueWatching.map(p => [p.video_id, p])), [continueWatching]);

  const activeCat = categories.find(c => c.slug === categorySlug);
  const title = categorySlug ? (activeCat?.name || categorySlug) : 'Baza Filmów';
  const subtitle = categorySlug
    ? (activeCat?.description || 'Filmy w tej kategorii.')
    : 'Przeglądaj materiały wideo społeczności.';

  const paginated = videos.slice((page - 1) * config.videosPerPage, page * config.videosPerPage);
  const totalPages = Math.ceil(videos.length / config.videosPerPage);

  return (
    <div className="relative" style={{ color: 'var(--fg)' }}>

      {/* ── Header ── */}
      <div ref={headerRef} className="rv rv-up px-8 sm:px-12 pt-12 pb-8">
        <div className="mb-2">
          <span className="mono-label">
            {categorySlug ? `Kategoria / ${title}` : 'Alleria Filmy / Baza'}
          </span>
        </div>

        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-bold leading-tight tracking-tight"
              style={{ fontSize: 'clamp(28px, 4vw, 48px)', color: 'var(--fg)', letterSpacing: '-0.03em' }}>
              {title}
            </h1>
            <p className="mt-2 text-base" style={{ color: 'var(--fg-3)' }}>{subtitle}</p>
          </div>

          {continueWatching.length > 0 && (
            <button
              onClick={handleResetProgress}
              disabled={resetting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition-all"
              style={{ border: '1px solid var(--line-2)', color: 'var(--fg-3)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--err)'; e.currentTarget.style.borderColor = 'rgba(239,111,108,0.3)'; e.currentTarget.style.background = 'rgba(239,111,108,0.05)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-3)'; e.currentTarget.style.borderColor = 'var(--line-2)'; e.currentTarget.style.background = ''; }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Resetuj postęp
            </button>
          )}
        </div>

        {/* Separator */}
        <div className="mt-8 h-px" style={{ background: 'linear-gradient(90deg, var(--ember), transparent)' }} />
      </div>

      {/* ── Search & Filters ── */}
      <div ref={filtersRef} className="rv rv-up px-8 sm:px-12 pb-6" data-d="1">
        <div className="flex flex-col sm:flex-row gap-3">

          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--fg-4)' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Szukaj po tytule…"
              className="glass-input pl-11 pr-10"
            />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full transition-all"
                style={{ background: 'var(--bg-4)', color: 'var(--fg-3)' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort */}
          <div className="relative min-w-[180px]">
            <select value={sort} onChange={e => setSort(e.target.value)} className="glass-select">
              <option value="newest">Najnowsze</option>
              <option value="oldest">Najstarsze</option>
              <option value="title_asc">Tytuł A–Z</option>
              <option value="title_desc">Tytuł Z–A</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--fg-4)' }} />
          </div>

          {/* Author */}
          <div className="relative min-w-[180px]">
            <select value={selectedAuthor} onChange={e => setSelectedAuthor(e.target.value)} className="glass-select">
              <option value="">Wszyscy autorzy</option>
              {authors.map(a => <option key={a.id} value={a.id}>{a.display_name || a.username}</option>)}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--fg-4)' }} />
          </div>

          {/* Tags toggle */}
          <button
            onClick={() => setShowFilters(v => !v)}
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all"
            style={showFilters || selectedTags.length > 0
              ? { background: 'var(--ember)', color: '#fff', boxShadow: '0 4px 20px rgba(255,91,46,0.30)' }
              : { background: 'rgba(246,246,250,0.06)', color: 'var(--fg-3)', border: '1px solid var(--line-2)' }
            }
          >
            <SlidersHorizontal className="w-4 h-4" />
            Tagi {selectedTags.length > 0 && `(${selectedTags.length})`}
          </button>
        </div>

        {/* Tag chips panel */}
        {showFilters && (
          <div className="mt-3 p-5 rounded-2xl animate-slide-up"
            style={{ background: 'rgba(246,246,250,0.03)', border: '1px solid var(--line-2)' }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold font-mono uppercase tracking-[0.2em]" style={{ color: 'var(--fg-4)' }}>
                Filtruj po tagach
              </span>
              {selectedTags.length > 0 && (
                <button onClick={() => setSelectedTags([])}
                  className="text-xs font-bold font-mono transition-colors"
                  style={{ color: 'var(--ember)' }}>Wyczyść</button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <button key={tag.id} onClick={() => toggleTag(tag.id)}
                  className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold font-mono transition-all"
                  style={selectedTags.includes(tag.id)
                    ? { background: 'var(--ember)', color: '#fff', boxShadow: '0 0 16px rgba(255,91,46,0.25)' }
                    : { background: 'rgba(246,246,250,0.04)', color: 'var(--fg-3)', border: '1px solid var(--line-2)' }
                  }>
                  {tag.name}
                </button>
              ))}
              {tags.length === 0 && <p className="text-sm italic" style={{ color: 'var(--fg-4)' }}>Brak tagów</p>}
            </div>
          </div>
        )}

        {/* Active filters */}
        {hasActiveFilters && (
          <div className="flex items-center gap-3 mt-3">
            <span className="text-xs font-mono" style={{ color: 'var(--fg-4)' }}>Aktywne filtry</span>
            <div className="h-px flex-1" style={{ background: 'var(--line)' }} />
            <button onClick={clearFilters}
              className="text-xs font-bold font-mono transition-colors"
              style={{ color: 'var(--err)' }}>Wyczyść wszystkie ×</button>
          </div>
        )}
      </div>

      {/* ── Grid ── */}
      <div className="px-8 sm:px-12 pb-12">
        {loading ? (
          /* Skeleton */
          <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(${config.gridColumns}, minmax(0,1fr))` }}>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="rounded-[20px] overflow-hidden" style={{ background: 'var(--bg-2)', border: '1px solid var(--line)' }}>
                <div className="skeleton" style={{ aspectRatio: '16/9' }} />
                <div className="p-5 space-y-3">
                  <div className="h-4 rounded-lg skeleton w-3/4" />
                  <div className="h-3 rounded-lg skeleton w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : videos.length === 0 ? (
          /* Empty */
          <div className="flex flex-col items-center justify-center py-24 rv rv-up in">
            <div className="w-20 h-20 rounded-[28px] flex items-center justify-center mb-6"
              style={{ background: 'rgba(255,91,46,0.08)', border: '1px solid rgba(255,91,46,0.20)' }}>
              <Film className="w-10 h-10" style={{ color: 'var(--ember-2)' }} />
            </div>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--fg)' }}>Brak wyników</h3>
            <p className="text-sm" style={{ color: 'var(--fg-3)' }}>Nie znaleziono filmów spełniających kryteria.</p>
          </div>
        ) : (
          <>
            <style>{`@media(min-width:1280px){.vgrid{grid-template-columns:repeat(${config.gridColumns},minmax(0,1fr))!important}}`}</style>
            <div ref={gridRef} className="stagger-grid grid gap-5 grid-cols-1 sm:grid-cols-2 vgrid">
              {paginated.map((video, idx) => (
                <VideoCard key={video.id} video={video} categorySlug={categorySlug}
                  progress={progressMap[video.id]} delay={idx * 60} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-12">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold font-mono transition-all disabled:opacity-25"
                  style={{ background: 'rgba(246,246,250,0.05)', border: '1px solid var(--line-2)', color: 'var(--fg-3)' }}
                  onMouseEnter={e => { if (page > 1) e.currentTarget.style.borderColor = 'var(--ember)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line-2)'; }}
                >
                  ← Poprzednia
                </button>

                <div className="flex gap-1.5">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                    .reduce((acc, p, i, arr) => { if (i > 0 && p - arr[i-1] > 1) acc.push('…'); acc.push(p); return acc; }, [])
                    .map((p, i) => p === '…' ? (
                      <span key={`dot-${i}`} className="w-10 h-10 flex items-center justify-center text-sm font-mono"
                        style={{ color: 'var(--fg-4)' }}>…</span>
                    ) : (
                      <button key={p}
                        onClick={() => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className="w-10 h-10 rounded-xl text-sm font-bold font-mono transition-all"
                        style={p === page
                          ? { background: 'var(--ember)', color: '#fff', boxShadow: '0 4px 16px rgba(255,91,46,0.30)' }
                          : { background: 'rgba(246,246,250,0.05)', border: '1px solid var(--line-2)', color: 'var(--fg-3)' }
                        }>
                        {p}
                      </button>
                    ))}
                </div>

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold font-mono transition-all disabled:opacity-25"
                  style={{ background: 'rgba(246,246,250,0.05)', border: '1px solid var(--line-2)', color: 'var(--fg-3)' }}
                  onMouseEnter={e => { if (page < totalPages) e.currentTarget.style.borderColor = 'var(--ember)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line-2)'; }}
                >
                  Następna →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
