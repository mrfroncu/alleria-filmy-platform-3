import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Film, Loader2 } from 'lucide-react';
import { api } from '../utils/api';

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Wraps the first case-insensitive match of `query` inside `text` in a <mark>-like highlight.
function Highlighted({ text, query }) {
  if (!query || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="bg-violet-200 dark:bg-violet-500/40 text-violet-900 dark:text-violet-100 rounded-sm">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

// Which field matched, and a short excerpt to show under the title when the match isn't in the title.
function matchReason(video, query) {
  const q = query.toLowerCase();
  if (video.title?.toLowerCase().includes(q)) return null;
  if (video.author_display_name?.toLowerCase().includes(q) || video.author_name?.toLowerCase().includes(q)) {
    return { label: 'autor', text: video.author_display_name || video.author_name };
  }
  if (video.description?.toLowerCase().includes(q)) {
    const idx = video.description.toLowerCase().indexOf(q);
    const start = Math.max(0, idx - 20);
    const excerpt = (start > 0 ? '…' : '') + video.description.slice(start, idx + q.length + 20) + '…';
    return { label: 'opis', text: excerpt };
  }
  return null;
}

export default function GlobalSearch({ compact = false }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const rootRef = useRef(null);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClickOutside = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      api.getVideos({ search: query.trim(), limit: 8 })
        .then(v => { setResults(v); setLoading(false); })
        .catch(() => { setResults([]); setLoading(false); });
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const goToVideo = (id) => {
    setOpen(false);
    setMobileOpen(false);
    setQuery('');
    navigate(`/video/${id}`);
  };

  const viewAll = () => {
    if (!query.trim()) return;
    setOpen(false);
    setMobileOpen(false);
    navigate(`/?search=${encodeURIComponent(query.trim())}`);
    setQuery('');
  };

  const dropdown = open && query.trim().length >= 2 && (
    <div className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden z-50 animate-scale-in origin-top">
      {loading ? (
        <div className="p-6 flex items-center justify-center text-zinc-400 text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Szukanie...
        </div>
      ) : results.length === 0 ? (
        <div className="p-6 text-center text-zinc-400 text-sm">Brak wyników dla „{query}"</div>
      ) : (
        <>
          <div className="max-h-[400px] overflow-y-auto py-1.5">
            {results.map(v => {
              const reason = matchReason(v, query.trim());
              return (
                <button
                  key={v.id}
                  onClick={() => goToVideo(v.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors text-left"
                >
                  <div className="w-14 h-9 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 flex items-center justify-center">
                    {v.thumbnail ? <img src={v.thumbnail} alt="" className="w-full h-full object-cover" /> : <Film className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                      <Highlighted text={v.title} query={query.trim()} />
                    </p>
                    {reason ? (
                      <p className="text-[11px] text-zinc-400 truncate">
                        {reason.label}: <Highlighted text={reason.text} query={query.trim()} />
                      </p>
                    ) : (
                      <p className="text-[11px] text-zinc-400 truncate">{v.author_display_name || v.author_name}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <button
            onClick={viewAll}
            className="w-full px-4 py-2.5 text-xs font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 border-t border-zinc-100 dark:border-zinc-800 transition-colors"
          >
            Zobacz wszystkie wyniki dla „{query}"
          </button>
        </>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="relative" ref={rootRef}>
        {!mobileOpen ? (
          <button onClick={() => setMobileOpen(true)} className="p-2 text-white/80 hover:text-white transition-colors">
            <Search className="w-5 h-5" />
          </button>
        ) : (
          <div className="fixed inset-x-0 top-0 z-50 p-3 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 shadow-lg">
            <div className="relative flex items-center gap-2">
              <Search className="absolute left-3 w-4 h-4 text-zinc-400 pointer-events-none" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setOpen(true); }}
                onKeyDown={e => { if (e.key === 'Enter') viewAll(); if (e.key === 'Escape') setMobileOpen(false); }}
                placeholder="Szukaj filmów, autorów..."
                className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none"
              />
              <button onClick={() => { setMobileOpen(false); setQuery(''); }} className="absolute right-2 p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            {dropdown}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full" ref={rootRef}>
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70 pointer-events-none" />
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === 'Enter') viewAll(); if (e.key === 'Escape') setOpen(false); }}
        placeholder="Szukaj filmów, autorów, opisów..."
        className="w-full pl-10 pr-9 py-2 rounded-xl bg-white/15 hover:bg-white/20 focus:bg-white text-sm text-white focus:text-zinc-900 placeholder:text-white/70 focus:placeholder:text-zinc-400 border border-white/20 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-white/50 transition-colors"
      />
      {query && (
        <button onClick={() => { setQuery(''); setResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      )}
      {dropdown}
    </div>
  );
}
