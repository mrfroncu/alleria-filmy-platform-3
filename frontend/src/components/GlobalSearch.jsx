import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Search, Film, Loader2, Heart, Clock, Users, User, Tag as TagIcon,
  Shield, BarChart3, FolderOpen, FileText, Wrench, CornerDownLeft,
  Eye, LogIn, HardDrive, UserPlus, ShieldCheck, Settings, Download,
  Upload, Trash2, AlertTriangle, Terminal, Mail, Lock,
} from 'lucide-react';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useUnsavedGuard } from '../contexts/UnsavedChangesContext';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || navigator.userAgent || '');

// Rendered into document.body — the top bar's backdrop-blur establishes a containing
// block for position:fixed descendants, which would otherwise trap this overlay inside it.
function Portal({ children }) { return ReactDOM.createPortal(children, document.body); }

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
  { label: 'Narzędzia Developerskie', to: '/debug', icon: Wrench, devOnly: true },
];

const SHORTCUT_PATHS = ['/', '/favorites', '/history'];

// Settings/options/tabs living inside admin+dev pages — deep-link via ?tab= so search actually lands on the right tab
const SEARCHABLE_ITEMS = [
  { label: 'Biblioteka filmów', section: 'Panel Redaktora', to: '/admin?tab=videos', icon: Film, adminOnly: true },
  { label: 'Zarządzanie tagami', section: 'Panel Redaktora', to: '/admin?tab=tags', icon: TagIcon, adminOnly: true },
  { label: 'Kategorie', section: 'Zarządzanie', to: '/manage?tab=categories', icon: FolderOpen, devOnly: true },
  { label: 'Rangi', section: 'Zarządzanie', to: '/manage?tab=ranks', icon: Shield, devOnly: true },
  { label: 'Użytkownicy', section: 'Zarządzanie', to: '/manage?tab=users', icon: Users, devOnly: true },
  { label: 'Audit Log', section: 'Logi systemowe', to: '/logs?tab=audit', icon: FileText, devOnly: true },
  { label: 'Logi Watch Party', section: 'Logi systemowe', to: '/logs?tab=watchparty', icon: Users, devOnly: true },
  { label: 'Logi wyświetleń', section: 'Logi systemowe', to: '/logs?tab=watch', icon: Eye, devOnly: true },
  { label: 'Logi logowania', section: 'Logi systemowe', to: '/logs?tab=login', icon: LogIn, devOnly: true },
  { label: 'Pliki streamera', section: 'Narzędzia Developerskie', to: '/debug?tab=streaming', icon: HardDrive, devOnly: true },
  { label: 'Czyszczenie streamingu', section: 'Narzędzia Developerskie', to: '/debug?tab=streaming', icon: Trash2, devOnly: true },
  { label: 'Aktywne Watch Parties', section: 'Narzędzia Developerskie', to: '/debug?tab=admin', icon: Users, devOnly: true },
  { label: 'Dodaj użytkownika', section: 'Narzędzia Developerskie', to: '/debug?tab=admin', icon: UserPlus, devOnly: true },
  { label: 'Sprawdź uprawnienia', section: 'Narzędzia Developerskie', to: '/debug?tab=categories', icon: ShieldCheck, devOnly: true },
  { label: 'Eksportuj bazę danych', section: 'Narzędzia Developerskie', to: '/debug?tab=debug', icon: Download, devOnly: true },
  { label: 'Importuj bazę danych', section: 'Narzędzia Developerskie', to: '/debug?tab=debug', icon: Upload, devOnly: true },
  { label: 'Czyszczenie logów', section: 'Narzędzia Developerskie', to: '/debug?tab=debug', icon: Trash2, devOnly: true },
  { label: 'Wyczyść bazę danych', section: 'Narzędzia Developerskie', to: '/debug?tab=debug', icon: AlertTriangle, devOnly: true },
  { label: 'Konsola SQL', section: 'Narzędzia Developerskie', to: '/debug?tab=debug', icon: Terminal, devOnly: true },
  { label: 'Limity treści', section: 'Zarządzanie', to: '/manage?tab=settings&subtab=display', icon: Settings, devOnly: true },
  { label: 'Ograniczenie domen webhooków', section: 'Zarządzanie', to: '/manage?tab=settings&subtab=security', icon: ShieldCheck, devOnly: true },
  { label: 'Wysyłka kodu logowania (TS3)', section: 'Zarządzanie', to: '/manage?tab=settings&subtab=login', icon: ShieldCheck, devOnly: true },
  { label: 'Regulamin (edycja)', section: 'Zarządzanie', to: '/manage?tab=tos', icon: FileText, devOnly: true },
  { label: 'Ustawienia SMTP', section: 'Zarządzanie', to: '/manage?tab=settings&subtab=email', icon: Mail, devOnly: true },
  { label: 'Region RODO / LGPD', section: 'Zarządzanie', to: '/manage?tab=settings&subtab=security', icon: ShieldCheck, devOnly: true },
  { label: 'Zgłoszenia RODO (GDPR / LGPD)', section: 'Zarządzanie', to: '/manage?tab=gdpr', icon: Lock, devOnly: true },
  { label: 'Adres e-mail i powiadomienia', section: 'Mój profil', to: '/profile', icon: Mail },
  { label: 'Twoje dane (RODO)', section: 'Mój profil', to: '/profile', icon: Lock },
];

// Strip dots/dashes/underscores/spaces so "R.E.P.O." and "REPO" compare equal —
// but keep it a plain substring check (not fuzzy) so "GTA VI" never matches tag "GTA V".
function normalizeTag(str) {
  return (str || '').toLowerCase().replace(/[.\-_\s]/g, '');
}

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
  const matchedTag = video.tags?.find(t => t.name?.toLowerCase().includes(q));
  if (matchedTag) return { label: 'tag', text: matchedTag.name };
  return null;
}

function SectionLabel({ children }) {
  return <p className="px-4 pt-2 pb-1.5 text-[10px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em]">{children}</p>;
}

function ResultRow({ active, onMouseEnter, onClick, iconBox, title, subtitle }) {
  return (
    <button
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 mx-2 rounded-xl text-left transition-colors ${active ? 'bg-violet-50 dark:bg-violet-500/15' : 'hover:bg-zinc-50 dark:hover:bg-white/5'}`}
      style={{ width: 'calc(100% - 1rem)' }}
    >
      {iconBox}
      <div className="flex-1 min-w-0">
        {title}
        {subtitle}
      </div>
      {active && <CornerDownLeft className="w-3.5 h-3.5 text-violet-500 shrink-0" />}
    </button>
  );
}

export default function GlobalSearch({ compact = false }) {
  const { isAdmin, isDev } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [allTags, setAllTags] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const tagsLoadedRef = useRef(false);
  const navigate = useNavigate();
  const guardNav = useUnsavedGuard();

  const trimmed = query.trim();
  const isSearching = trimmed.length > 0;

  const visiblePages = useMemo(
    () => PAGES.filter(p => (!p.adminOnly || isAdmin) && (!p.devOnly || isDev) && p.to !== location.pathname),
    [isAdmin, isDev, location.pathname]
  );
  const visibleSettings = useMemo(
    () => SEARCHABLE_ITEMS.filter(it => (!it.adminOnly || isAdmin) && (!it.devOnly || isDev)),
    [isAdmin, isDev]
  );
  const shortcuts = useMemo(
    () => PAGES.filter(p => SHORTCUT_PATHS.includes(p.to) && p.to !== location.pathname),
    [location.pathname]
  );

  const matchedPages = isSearching
    ? visiblePages.filter(p => p.label.toLowerCase().includes(trimmed.toLowerCase()))
    : [];
  const matchedSettings = isSearching
    ? visibleSettings.filter(it => it.label.toLowerCase().includes(trimmed.toLowerCase()) || it.section.toLowerCase().includes(trimmed.toLowerCase()))
    : [];
  const matchedTags = isSearching
    ? allTags.filter(t => normalizeTag(t.name).includes(normalizeTag(trimmed))).slice(0, 6)
    : [];

  const videoSearchActive = trimmed.length >= 2;
  const flatCount = isSearching
    ? matchedPages.length + matchedSettings.length + matchedTags.length + results.length
    : shortcuts.length;
  const nothingMatchedYet = isSearching && !videoSearchActive && matchedPages.length + matchedSettings.length + matchedTags.length === 0;

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

  // Escape closes the palette no matter what's focused inside it
  useEffect(() => {
    if (!open) return;
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open]);

  useEffect(() => {
    if (open) {
      if (!tagsLoadedRef.current) {
        tagsLoadedRef.current = true;
        api.getTags().then(setAllTags).catch(() => {});
      }
    } else {
      setQuery(''); setResults([]); setSelectedIndex(0);
    }
  }, [open]);

  // Mobile browsers only raise the on-screen keyboard for a focus() call that's synchronous
  // within the original tap — deferring it even via a 0ms setTimeout (as this used to, for every
  // open path including this one) loses that "user gesture" context, so the input technically
  // gets focus but the keyboard never appears. flushSync forces the input to actually exist in
  // the DOM before .focus() runs, still inside the same click handler. The Cmd/Ctrl+K shortcut
  // has no click to piggyback on, so it keeps a plain (non-flushSync) focus below.
  const openAndFocus = () => {
    ReactDOM.flushSync(() => setOpen(true));
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
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

  const activate = (type, item) => {
    setOpen(false);
    guardNav(() => {
      if (type === 'tag') navigate(`/tag/${item.id}`);
      else if (type === 'video') navigate(`/video/${item.id}`);
      else navigate(item.to);
    });
  };

  const viewAllResults = () => {
    if (!trimmed) return;
    setOpen(false);
    guardNav(() => navigate(`/?search=${encodeURIComponent(trimmed)}`));
  };

  const onInputKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (flatCount ? (i + 1) % flatCount : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (flatCount ? (i - 1 + flatCount) % flatCount : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!isSearching) {
        if (shortcuts[selectedIndex]) activate('page', shortcuts[selectedIndex]);
        return;
      }
      let idx = selectedIndex;
      if (idx < matchedPages.length) { activate('page', matchedPages[idx]); return; }
      idx -= matchedPages.length;
      if (idx < matchedSettings.length) { activate('page', matchedSettings[idx]); return; }
      idx -= matchedSettings.length;
      if (idx < matchedTags.length) { activate('tag', matchedTags[idx]); return; }
      idx -= matchedTags.length;
      if (idx < results.length) { activate('video', results[idx]); return; }
      viewAllResults();
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
        <button onClick={openAndFocus} className="btn-icon-zinc">
          <Search className="w-5 h-5" />
        </button>
      ) : (
        <button
          onClick={openAndFocus}
          className="flex items-center gap-2.5 pl-3.5 pr-2.5 py-2 rounded-xl bg-zinc-100/80 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700/60 transition-colors text-left w-full max-w-[280px]"
        >
          <Search className="w-4 h-4 text-violet-500 shrink-0" />
          <span className="flex-1 text-sm text-zinc-400 dark:text-zinc-500 truncate">Szukaj...</span>
          <KbdHint />
        </button>
      )}

      {/* Command palette */}
      {open && (
        <Portal>
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] sm:pt-[14vh] px-4 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
          style={{ animation: 'fadeIn 0.15s ease-out' }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
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
                placeholder="Szukaj filmów, tagów, przejdź do strony..."
                className="flex-1 py-4 bg-transparent text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none"
              />
              <kbd className="shrink-0 px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-white/10 text-zinc-400 text-[10px] font-mono font-semibold">ESC</kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto py-2">
              {!isSearching ? (
                shortcuts.length > 0 && (
                  <div>
                    <SectionLabel>Skróty</SectionLabel>
                    {shortcuts.map((p, i) => {
                      const Icon = p.icon;
                      return (
                        <ResultRow
                          key={p.to}
                          active={i === selectedIndex}
                          onMouseEnter={() => setSelectedIndex(i)}
                          onClick={() => activate('page', p)}
                          iconBox={
                            <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center shrink-0">
                              <Icon className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                            </div>
                          }
                          title={<span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate block">{p.label}</span>}
                        />
                      );
                    })}
                  </div>
              )) : (
                <>
                  {matchedPages.length > 0 && (
                    <div>
                      <SectionLabel>Strony</SectionLabel>
                      {matchedPages.map((p, i) => {
                        const Icon = p.icon;
                        return (
                          <ResultRow
                            key={p.to}
                            active={i === selectedIndex}
                            onMouseEnter={() => setSelectedIndex(i)}
                            onClick={() => activate('page', p)}
                            iconBox={
                              <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center shrink-0">
                                <Icon className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                              </div>
                            }
                            title={<span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate block"><Highlighted text={p.label} query={trimmed} /></span>}
                          />
                        );
                      })}
                    </div>
                  )}

                  {matchedSettings.length > 0 && (
                    <div>
                      <SectionLabel>Ustawienia i funkcje</SectionLabel>
                      {matchedSettings.map((it, i) => {
                        const idx = matchedPages.length + i;
                        const Icon = it.icon;
                        return (
                          <ResultRow
                            key={it.section + it.label}
                            active={idx === selectedIndex}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            onClick={() => activate('page', it)}
                            iconBox={
                              <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                                <Icon className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                              </div>
                            }
                            title={<span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate block"><Highlighted text={it.label} query={trimmed} /></span>}
                            subtitle={<span className="text-[11px] text-zinc-400 truncate block">{it.section}</span>}
                          />
                        );
                      })}
                    </div>
                  )}

                  {matchedTags.length > 0 && (
                    <div>
                      <SectionLabel>Tagi</SectionLabel>
                      <div className="flex flex-wrap gap-2 px-4 pb-2">
                        {matchedTags.map((t, i) => {
                          const idx = matchedPages.length + matchedSettings.length + i;
                          const active = idx === selectedIndex;
                          return (
                            <button
                              key={t.id}
                              onMouseEnter={() => setSelectedIndex(idx)}
                              onClick={() => activate('tag', t)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${active ? 'bg-violet-500 text-white border-violet-500' : 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-100 dark:border-violet-500/20'}`}
                            >
                              <TagIcon className="w-3 h-3" />
                              <Highlighted text={t.name} query={trimmed} />
                              <span className={active ? 'text-white/70' : 'text-violet-400 dark:text-violet-500'}>{t.video_count ?? t.videos?.length ?? 0}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {videoSearchActive && (
                  <div>
                    <SectionLabel>Filmy</SectionLabel>
                    {loading ? (
                      <div className="px-4 py-4 flex items-center gap-2 text-sm text-zinc-400">
                        <Loader2 className="w-4 h-4 animate-spin" /> Szukanie...
                      </div>
                    ) : results.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-zinc-400">Brak filmów dla „{trimmed}"</p>
                    ) : (
                      results.map((v, i) => {
                        const idx = matchedPages.length + matchedSettings.length + matchedTags.length + i;
                        const reason = matchReason(v, trimmed);
                        return (
                          <ResultRow
                            key={v.id}
                            active={idx === selectedIndex}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            onClick={() => activate('video', v)}
                            iconBox={
                              <div className="w-12 h-8 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 flex items-center justify-center">
                                {v.thumbnail ? <img src={v.thumbnail} alt="" className="w-full h-full object-cover" /> : <Film className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-700" />}
                              </div>
                            }
                            title={<span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate block"><Highlighted text={v.title} query={trimmed} /></span>}
                            subtitle={reason
                              ? <span className="text-[11px] text-zinc-400 truncate block">{reason.label}: <Highlighted text={reason.text} query={trimmed} /></span>
                              : <span className="text-[11px] text-zinc-400 truncate block">{v.author_display_name || v.author_name}</span>}
                          />
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

                  {nothingMatchedYet && (
                    <p className="px-4 py-6 text-center text-sm text-zinc-400">Brak wyników dla „{trimmed}"</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        </Portal>
      )}
    </>
  );
}
