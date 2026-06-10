import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, Film, Heart, Clock, User, CornerDownLeft, Loader2 } from 'lucide-react';
import { api } from '../utils/api';

const PAGES = [
  { label: 'Baza Filmów', to: '/', icon: Film },
  { label: 'Ulubione', to: '/favorites', icon: Heart },
  { label: 'Historia', to: '/history', icon: Clock },
  { label: 'Mój profil', to: '/profile', icon: User },
];

/**
 * ⌘K command palette. The topbar search pill MORPHS into this panel
 * (shared view-transition-name "palette"). Live video search + page jumps.
 */
export default function CommandPalette({ onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sel, setSel] = useState(0);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Debounced live search
  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(() => {
      api.getVideos({ search: query.trim(), sort: 'newest' })
        .then(v => setResults((Array.isArray(v) ? v : []).slice(0, 8)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  const pages = query.trim()
    ? PAGES.filter(p => p.label.toLowerCase().includes(query.trim().toLowerCase()))
    : PAGES;
  const items = [
    ...results.map(v => ({ type: 'video', key: `v-${v.id}`, video: v })),
    ...pages.map(p => ({ type: 'page', key: p.to, page: p })),
  ];

  useEffect(() => { setSel(0); }, [query, results.length]);

  const go = (item) => {
    onClose();
    if (item.type === 'video') navigate(`/video/${item.video.id}`, { viewTransition: true });
    else navigate(item.page.to, { viewTransition: true });
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(items.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
    else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); go(items[sel]); }
    else if (e.key === 'Escape') onClose();
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] px-4">
      <div className="fixed inset-0 bg-zinc-950/55 backdrop-blur-md animate-fade-in" onClick={onClose} />
      <div
        className="palette-panel relative w-full max-w-xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-zinc-200 dark:border-white/10 rounded-[26px] shadow-2xl shadow-black/30 overflow-hidden"
        style={{ viewTransitionName: 'palette' }}
        role="dialog"
        aria-modal="true"
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 dark:border-white/[0.06]">
          {searching
            ? <Loader2 className="w-5 h-5 text-ember-500 animate-spin shrink-0" />
            : <Search className="w-5 h-5 text-ember-500 shrink-0" />}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Szukaj filmów, przejdź do strony…"
            className="flex-1 bg-transparent outline-none text-[15px] font-medium text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
          />
          <kbd className="hidden sm:block px-2 py-1 rounded-lg bg-zinc-100 dark:bg-white/5 text-[10px] font-mono text-zinc-400 border border-zinc-200 dark:border-white/10">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {query.trim() && !searching && results.length === 0 && (
            <p className="px-4 py-6 text-sm text-zinc-400 text-center animate-fade-in">Brak filmów dla „{query}”</p>
          )}

          {results.length > 0 && (
            <p className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-400 font-display">Filmy</p>
          )}
          {results.map((v, i) => (
            <button
              key={v.id}
              onClick={() => go(items[i])}
              onMouseEnter={() => setSel(i)}
              className={`palette-row w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left ${sel === i ? 'sel' : ''}`}
            >
              <div className="w-14 h-9 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0">
                {v.thumbnail
                  ? <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><Film className="w-4 h-4 text-zinc-400" /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{v.title}</p>
                <p className="text-[11px] text-zinc-400 truncate">{v.author_display_name || v.author_name}</p>
              </div>
              {sel === i && <CornerDownLeft className="w-4 h-4 text-ember-500 shrink-0 animate-spring-in" />}
            </button>
          ))}

          <p className="px-3 pt-3 pb-1 text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-400 font-display">Strony</p>
          {pages.map((p, pi) => {
            const i = results.length + pi;
            return (
              <button
                key={p.to}
                onClick={() => go(items[i])}
                onMouseEnter={() => setSel(i)}
                className={`palette-row w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left ${sel === i ? 'sel' : ''}`}
              >
                <div className="w-8 h-8 rounded-xl bg-ember-50 dark:bg-ember-500/10 border border-ember-100 dark:border-ember-500/20 flex items-center justify-center shrink-0">
                  <p.icon className="w-4 h-4 text-ember-500" />
                </div>
                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{p.label}</span>
                {sel === i && <CornerDownLeft className="w-4 h-4 text-ember-500 shrink-0 ml-auto animate-spring-in" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
