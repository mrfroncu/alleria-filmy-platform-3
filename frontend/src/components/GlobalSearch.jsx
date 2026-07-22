import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, Film, Loader2, Heart, Clock, Users, User,
  Shield, BarChart3, FolderOpen, FileText, Wrench, CornerDownLeft,
} from 'lucide-react';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || navigator.userAgent || '');

const PAGES = [
  { label: 'Baza Filmów', to: '/', icon: Film },
  { label: 'Ulubione', to: '/favorites', icon: Heart },
  { label: 'Historia', to: '/history', icon: Clock },
  { label: 'Watch Party', to: '/watch-party', icon: Users },
  { label: 'Mój profil', to: '/profile', icon: User },
  { label: 'Panel Redaktora', to: '/admin', icon: Shield, adminOnly: true },
  { label: 'Statystyki', to: '/stats', icon: BarChart3, adminOnly: true },
  { label: 'Zarządzanie', to: '/manage', icon: FolderOpen, devOnly: true },
  { label: 'Logi systemowe', to: '/logs', icon: FileText, devOnly: true },
  { label: 'Dev Tools', to: '/debug', icon: Wrench, devOnly: true },
];

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
  const { isAdmin, isDev } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  const visiblePages = useMemo(
    () => PAGES.filter(p => (!p.adminOnly || isAdmin) && (!p.devOnly || isDev)),
    [isAdmin, isDev]
  );
  const trimmed = query.trim();
  const matchedPages = trimmed
    ? visiblePages.filter(p => p.label.toLowerCase().includes(trimmed.toLowerCase()))
    : visiblePages;
  const flatItems = useMemo(
    () => [...matchedPages.map(p => ({ type: 'page', ...p })), ...results.map(v => ({ type: 'video', ...v }))],
    [matchedPages, results]
  );

  // Global Cmd/Ctrl+K shortcut
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQuery(''); setResults([]); setSelectedIndex(0); }
  }, [open]);

  useEffect(() => { setSelectedIndex(0); }, [trimmed]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (trimmed.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      api.getVideos({ search: trimmed, limit: 6 })
        .then(v => { setResults(v); setLoading(false); })
        .catch(() => { setResults([]); setLoading(false); });
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [trimmed]);

  const activate = (item) => {
    setOpen(false);
    if (item.type === 'page') navigate(item.to);
    else navigate(`/video/${item.id}`);
  };

  const viewAllResults = () => {
    if (!trimmed) return;
    setOpen(false);
    navigate(`/?search=${encodeURIComponent(trimmed)}`);
  };

  const onInputKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (flatItems.length ? (i + 1) % flatItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (flatItems.length ? (i - 1 + flatItems.length) % flatItems.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatItems[selectedIndex]) activate(flatItems[selectedIndex]);
      else viewAllResults();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const KbdHint = () => (
    <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-zinc-200/70 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 text-[10px] font-mono font-semibold">
      {isMac ? '⌘' : 'Ctrl'} K
    </kbd>
  );

  return (
    <>
      {/* Trigger */}
      {compact ? (
        <button onClick={() => setOpen(true)} className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
          <Search className="w-5 h-5" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2.5 pl-3.5 pr-2.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700/60 transition-colors text-left w-full max-w-[280px]"
        >
          <Search className="w-4 h-4 text-violet-500 shrink-0" />
          <span className="flex-1 text-sm text-zinc-400 dark:text-zinc-500 truncate">Szukaj...</span>
          <KbdHint />
        </button>
      )}

      {/* Command palette */}
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] sm:pt-[14vh] px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" style={{ animation: 'fadeIn 0.15s ease-out' }} />
          <div
            className="relative w-full max-w-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
            style={{ animation: 'modalIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <div className="flex items-center gap-3 px-4 border-b border-zinc-100 dark:border-zinc-800">
              <Search className="w-4 h-4 text-zinc-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Szukaj filmów, przejdź do strony..."
                className="flex-1 py-4 bg-transparent text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none"
              />
              <kbd className="shrink-0 px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-white/10 text-zinc-400 text-[10px] font-mono font-semibold">ESC</kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto py-2">
              {matchedPages.length > 0 && (
                <div className="mb-1">
                  <p className="px-4 pt-1 pb-1.5 text-[10px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em]">Strony</p>
                  {matchedPages.map((p, i) => {
                    const idx = i;
                    const active = idx === selectedIndex;
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.to}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        onClick={() => activate({ type: 'page', ...p })}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 mx-2 rounded-xl text-left transition-colors ${active ? 'bg-violet-50 dark:bg-violet-500/15' : 'hover:bg-zinc-50 dark:hover:bg-white/5'}`}
                        style={{ width: 'calc(100% - 1rem)' }}
                      >
                        <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                        </div>
                        <span className="flex-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                          <Highlighted text={p.label} query={trimmed} />
                        </span>
                        {active && <CornerDownLeft className="w-3.5 h-3.5 text-violet-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {trimmed.length >= 2 && (
                <div>
                  <p className="px-4 pt-2 pb-1.5 text-[10px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em]">Filmy</p>
                  {loading ? (
                    <div className="px-4 py-4 flex items-center gap-2 text-sm text-zinc-400">
                      <Loader2 className="w-4 h-4 animate-spin" /> Szukanie...
                    </div>
                  ) : results.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-zinc-400">Brak filmów dla „{trimmed}"</p>
                  ) : (
                    results.map((v, i) => {
                      const idx = matchedPages.length + i;
                      const active = idx === selectedIndex;
                      const reason = matchReason(v, trimmed);
                      return (
                        <button
                          key={v.id}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          onClick={() => activate({ type: 'video', ...v })}
                          className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-xl text-left transition-colors ${active ? 'bg-violet-50 dark:bg-violet-500/15' : 'hover:bg-zinc-50 dark:hover:bg-white/5'}`}
                          style={{ width: 'calc(100% - 1rem)' }}
                        >
                          <div className="w-12 h-8 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 flex items-center justify-center">
                            {v.thumbnail ? <img src={v.thumbnail} alt="" className="w-full h-full object-cover" /> : <Film className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-700" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                              <Highlighted text={v.title} query={trimmed} />
                            </p>
                            {reason ? (
                              <p className="text-[11px] text-zinc-400 truncate">{reason.label}: <Highlighted text={reason.text} query={trimmed} /></p>
                            ) : (
                              <p className="text-[11px] text-zinc-400 truncate">{v.author_display_name || v.author_name}</p>
                            )}
                          </div>
                          {active && <CornerDownLeft className="w-3.5 h-3.5 text-violet-500 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                  {results.length > 0 && (
                    <button
                      onClick={viewAllResults}
                      className="w-full mt-1 px-4 py-2.5 text-xs font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 border-t border-zinc-100 dark:border-zinc-800 transition-colors"
                    >
                      Zobacz wszystkie wyniki dla „{trimmed}"
                    </button>
                  )}
                </div>
              )}

              {matchedPages.length === 0 && trimmed.length >= 1 && trimmed.length < 2 && (
                <p className="px-4 py-6 text-center text-sm text-zinc-400">Brak dopasowanych stron.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
