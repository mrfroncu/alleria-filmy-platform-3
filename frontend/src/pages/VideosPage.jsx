import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Tag as TagIcon, Lock } from 'lucide-react';
import { api } from '../utils/apiClient';
import { useSettings } from '../contexts/SettingsContext';
import VideoCard from '../components/VideoCard';
import Skeleton from '../components/ui/Skeleton';
import Input from '../components/ui/Input';
import Dropdown from '../components/ui/Dropdown';
import Button from '../components/ui/Button';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Najnowsze' },
  { value: 'oldest', label: 'Najstarsze' },
  { value: 'title_asc', label: 'Tytuł A-Z' },
  { value: 'title_desc', label: 'Tytuł Z-A' },
];

export default function VideosPage() {
  const { categorySlug, tagId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { config } = useSettings();

  const [videos, setVideos] = useState(null);
  const [categories, setCategories] = useState(null);
  const [authors, setAuthors] = useState([]);
  const [tags, setTags] = useState([]);
  const [progressList, setProgressList] = useState([]);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [sort, setSort] = useState('newest');
  const [authorFilter, setAuthorFilter] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => setCategories([]));
    api.getAuthors().then(setAuthors).catch(() => setAuthors([]));
    api.getProgressList().then(setProgressList).catch(() => setProgressList([]));
  }, []);

  useEffect(() => {
    const fetchTags = categorySlug ? api.getTagsForCategory(categorySlug) : api.getTags();
    fetchTags.then(setTags).catch(() => setTags([]));
  }, [categorySlug]);

  const currentCategory = useMemo(
    () => (categorySlug && categories ? categories.find((c) => c.slug === categorySlug) : null),
    [categories, categorySlug]
  );
  const categoryAccessDenied = categorySlug && currentCategory && currentCategory.locked;

  useEffect(() => {
    setPage(1);
  }, [search, sort, authorFilter, selectedTags, categorySlug, tagId]);

  useEffect(() => {
    if (categoryAccessDenied) { setVideos([]); return; }
    setVideos(null);
    const params = { sort };
    if (search) params.search = search;
    if (authorFilter) params.author = authorFilter;
    if (categorySlug) params.category = categorySlug;
    const tagIds = tagId ? [tagId, ...selectedTags.filter((t) => t !== tagId)] : selectedTags;
    if (tagIds.length) params.tags = tagIds.join(',');
    api.getVideos(params).then(setVideos).catch(() => setVideos([]));
  }, [search, sort, authorFilter, selectedTags, categorySlug, tagId, categoryAccessDenied]);

  const progressByVideo = useMemo(() => {
    const m = new Map();
    progressList.forEach((p) => m.set(p.video_id, p));
    return m;
  }, [progressList]);

  const pageSize = config.videosPerPage;
  const pageCount = videos ? Math.max(1, Math.ceil(videos.length / pageSize)) : 1;
  const pageVideos = videos ? videos.slice((page - 1) * pageSize, page * pageSize) : [];

  const toggleTag = (id) => {
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };
  const clearFilters = () => {
    setSearch('');
    setAuthorFilter('');
    setSelectedTags([]);
    setSort('newest');
  };
  const hasFilters = search || authorFilter || selectedTags.length > 0 || sort !== 'newest';

  const pageTitle = categorySlug ? currentCategory?.name : tagId ? 'Tag' : 'Wszystkie filmy';

  if (categoryAccessDenied) {
    return (
      <div className="p-6 sm:p-10 max-w-2xl mx-auto">
        <div className="rounded-4xl border border-dashed border-slate-300 dark:border-white/15 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-rose-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display mb-2">Brak dostępu</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Nie masz uprawnień do przeglądania tej kategorii.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-display">{pageTitle}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj filmów..." className="pl-10" />
        </div>
        <Dropdown label="Sortuj" value={sort} onChange={setSort} options={SORT_OPTIONS} />
        <Dropdown
          label="Autor"
          value={authorFilter}
          onChange={setAuthorFilter}
          options={[{ value: '', label: 'Wszyscy' }, ...authors.map((a) => ({ value: String(a.id), label: a.display_name || a.username }))]}
        />
        <Button variant={selectedTags.length ? 'primary' : 'secondary'} size="sm" onClick={() => setShowTagPanel((s) => !s)}>
          <TagIcon className="w-3.5 h-3.5" /> Tagi {selectedTags.length > 0 && `(${selectedTags.length})`}
        </Button>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors flex items-center gap-1">
            <X className="w-3.5 h-3.5" /> Wyczyść filtry
          </button>
        )}
      </div>

      <AnimatePresence>
        {showTagPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-6"
          >
            <div className="flex flex-wrap gap-2 p-4 rounded-3xl bg-slate-100 dark:bg-white/5">
              {tags.map((t) => (
                <button
                  key={t.id}
                  onClick={() => toggleTag(String(t.id))}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    selectedTags.includes(String(t.id))
                      ? 'bg-brand-500 text-white'
                      : 'bg-white dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/15'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {videos === null ? (
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${config.gridCardMinWidth}px, 1fr))` }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="aspect-video mb-2.5 rounded-3xl" />
              <Skeleton className="h-4 w-3/4 mb-1.5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : pageVideos.length === 0 ? (
        <div className="rounded-4xl border border-dashed border-slate-300 dark:border-white/15 p-16 text-center">
          <p className="text-slate-500 dark:text-slate-400 font-medium">Brak wyników</p>
          <p className="text-sm text-slate-400 dark:text-slate-600 mt-1">Nie znaleziono filmów spełniających kryteria wyszukiwania.</p>
        </div>
      ) : (
        <motion.div
          layout
          className="grid gap-5"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${config.gridCardMinWidth}px, 1fr))` }}
        >
          <AnimatePresence mode="popLayout">
            {pageVideos.map((v) => (
              <VideoCard key={v.id} video={v} progress={progressByVideo.get(v.id)} fromCategory={categorySlug} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 mt-10">
          {Array.from({ length: pageCount }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={`w-9 h-9 rounded-xl text-sm font-semibold transition-colors ${
                page === i + 1
                  ? 'bg-brand-500 text-white'
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
