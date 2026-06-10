import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import { morph } from '../utils/fx';
import {
  Film, Shield, LogOut, X, Wrench, ChevronDown, ChevronsLeft, ChevronsRight,
  Heart, Clock, BarChart3, User, FolderOpen, FileText, MessageSquarePlus,
  Search, Menu, Command
} from 'lucide-react';
import { getCurrentYear } from '../utils/helpers';
import WatchPartyTab from './WatchPartyTab';
import CommandPalette from './CommandPalette';

const LOGO_URL = 'https://alleria.pl/image/favicon.png';

// The single morphing pill behind whichever nav item is active.
// view-transition-name makes it GLIDE to the next item on navigation.
const NavPill = () => (
  <span className="nav-pill-bg" style={{ viewTransitionName: 'nav-pill' }} aria-hidden="true" />
);

const PAGE_TITLES = [
  ['/favorites', 'Ulubione'],
  ['/history', 'Historia'],
  ['/profile', 'Mój profil'],
  ['/stats', 'Statystyki'],
  ['/admin', 'Panel Redaktora'],
  ['/manage', 'Zarządzanie'],
  ['/logs', 'Logi systemowe'],
  ['/debug', 'Dev Tools'],
  ['/watch-party', 'Watch Party'],
  ['/video', 'Odtwarzanie'],
  ['/author', 'Autor'],
  ['/tag', 'Tag'],
];

function CatTree({ cats, parentId, depth, activeCatSlug, onNavigate }) {
  const children = cats.filter(c => (c.parent_id || null) === parentId);
  if (children.length === 0) return null;
  return children.map(cat => {
    const hasKids = cats.some(c => c.parent_id === cat.id);
    const active = activeCatSlug === cat.slug;
    return (
      <div key={cat.id}>
        <Link
          to={`/category/${cat.slug}`}
          viewTransition
          onClick={onNavigate}
          className={`rail-item w-full pr-3 py-2 group ${depth === 0 ? 'pl-8' : depth === 1 ? 'pl-11' : 'pl-14'} ${
            active ? 'active' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          {active && <NavPill />}
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-300 ${active ? 'bg-white scale-125' : hasKids ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-300 dark:bg-zinc-600'} group-hover:bg-ember-400 group-hover:scale-125`} />
          <span className="font-semibold text-[13px] truncate flex-1">{cat.name}</span>
          <span className={`text-[10px] shrink-0 ${active ? 'text-white/70' : 'text-zinc-400'}`}>{cat.videoCount || 0}</span>
        </Link>
        {hasKids && <CatTree cats={cats} parentId={cat.id} depth={depth + 1} activeCatSlug={activeCatSlug} onNavigate={onNavigate} />}
      </div>
    );
  });
}

export default function Layout({ children }) {
  const { user, logout, isAdmin, isDev } = useAuth();
  const location = useLocation();
  const mainRef = useRef(null);

  const [railWide, setRailWide] = useState(() => {
    try { return localStorage.getItem('railWide') !== '0'; } catch { return true; }
  });
  const [catFlyout, setCatFlyout] = useState(false);
  const [catsExpanded, setCatsExpanded] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [versions, setVersions] = useState({ panel: '', stream: '', streamStatus: '' });

  const supportsVT = typeof document !== 'undefined' && !!document.startViewTransition;

  const toggleRail = () => {
    const next = !railWide;
    setRailWide(next);
    setCatFlyout(false);
    try { localStorage.setItem('railWide', next ? '1' : '0'); } catch {}
  };

  // Scroll main content to top + close transient panels on route change
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
    setCatFlyout(false); setUserMenu(false); setSheetOpen(false);
  }, [location.pathname]);

  // ⌘K / Ctrl+K opens the command palette (morphing from the search pill)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        morph(() => setPaletteOpen(v => !v));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Refresh categories on route change
  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {});
  }, [location.pathname]);

  // Load versions once
  useEffect(() => {
    Promise.all([
      fetch('/api/version').then(r => r.json()).catch(() => ({})),
      fetch('/api/version/streaming').then(r => r.json()).catch(() => ({})),
    ]).then(([app, stream]) => {
      setVersions({ panel: app.version || '?', stream: stream.version || '?', streamStatus: stream.status || '' });
    });
  }, []);

  const isActive = (path) => location.pathname === path;

  // Active-state resolution (URL + ?from= param)
  const fromParam = new URLSearchParams(location.search).get('from');
  const onVideoPage = location.pathname.startsWith('/video/');
  const anyCatActive = location.pathname.startsWith('/category/') || (onVideoPage && !!fromParam);
  const activeCatSlug = location.pathname.startsWith('/category/') ? location.pathname.split('/')[2] : fromParam;
  const allFilmsActive = (location.pathname === '/' || location.pathname.startsWith('/video') || location.pathname.startsWith('/author') || location.pathname.startsWith('/tag')) && !anyCatActive;

  const pageTitle = anyCatActive
    ? (categories.find(c => c.slug === activeCatSlug)?.name || 'Kategoria')
    : (PAGE_TITLES.find(([p]) => location.pathname.startsWith(p))?.[1] || 'Baza Filmów');

  const navItems = [
    { to: '/', icon: Film, label: 'Wszystkie filmy', active: allFilmsActive && !anyCatActive },
    { to: '/favorites', icon: Heart, label: 'Ulubione', active: isActive('/favorites') },
    { to: '/history', icon: Clock, label: 'Historia', active: isActive('/history') },
    { to: '/profile', icon: User, label: 'Mój profil', active: isActive('/profile') },
  ];
  const adminItems = [
    ...(isAdmin ? [
      { to: '/admin', icon: Shield, label: 'Panel Redaktora', active: isActive('/admin') },
      { to: '/stats', icon: BarChart3, label: 'Statystyki', active: isActive('/stats') },
    ] : []),
    ...(isDev ? [
      { to: '/manage', icon: FolderOpen, label: 'Zarządzanie', active: isActive('/manage') },
      { to: '/logs', icon: FileText, label: 'Logi systemowe', active: isActive('/logs') },
      { to: '/debug', icon: Wrench, label: 'Dev Tools', active: isActive('/debug') },
    ] : []),
  ];

  const RailLink = ({ to, icon: Icon, label, active }) => (
    <Link
      to={to}
      viewTransition
      className={`rail-item w-full ${railWide ? 'px-4' : 'justify-center px-0'} py-2.5 ${
        active ? 'active' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
      }`}
    >
      {active && <NavPill />}
      <Icon className="nav-icon w-[19px] h-[19px] shrink-0" />
      {railWide && <span className="font-semibold text-[13px] truncate">{label}</span>}
      {!railWide && <span className="rail-tip">{label}</span>}
    </Link>
  );

  const RailLabel = ({ label }) => railWide ? (
    <div className="px-4 mb-1.5 mt-5 first:mt-0 flex items-center gap-2">
      <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-400 dark:text-zinc-600 shrink-0 font-display">{label}</span>
      <div className="h-px flex-1 bg-gradient-to-r from-zinc-200 dark:from-white/10 to-transparent" />
    </div>
  ) : (
    <div className="mx-3 my-3 h-px bg-zinc-200 dark:bg-white/10" />
  );

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 font-sans relative overflow-hidden transition-colors duration-300">

      {/* ── Ambient ember haze ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="aurora-blob aurora-1 -top-44 -left-44 w-[560px] h-[560px] bg-ember-500/10 dark:bg-ember-500/15 blur-[150px]" />
        <div className="aurora-blob aurora-2 top-1/3 -right-48 w-[520px] h-[520px] bg-curtain-600/[0.07] dark:bg-curtain-600/10 blur-[160px]" />
        <div className="aurora-blob aurora-3 -bottom-48 left-1/3 w-[480px] h-[480px] bg-amber-400/[0.08] dark:bg-amber-500/10 blur-[150px]" />
        <div className="noise-overlay" />
      </div>

      {/* ════════ ICON RAIL (desktop) ════════ */}
      <aside className={`hidden lg:flex flex-col z-30 p-3 pr-0 transition-[width] duration-300 ease-out ${railWide ? 'w-[280px]' : 'w-[92px]'}`}>
        <div className="flex flex-col h-full bg-white/90 dark:bg-zinc-900/70 backdrop-blur-2xl border border-zinc-200 dark:border-white/[0.07] rounded-3xl shadow-xl shadow-zinc-200/40 dark:shadow-black/40 relative overflow-visible">

          {/* Logo */}
          <div className={`pt-5 pb-2 shrink-0 flex ${railWide ? 'px-5' : 'justify-center px-0'}`}>
            <Link to="/" viewTransition className="flex items-center gap-3 group">
              <div className="border-beam logo-glow w-11 h-11 rounded-2xl flex items-center justify-center overflow-hidden bg-gradient-to-br from-ember-500/10 to-curtain-500/10 border border-white/10 group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-300 shrink-0">
                <img src={LOGO_URL} alt="Alleria" className="w-9 h-9 object-contain group-hover:rotate-[14deg] transition-transform duration-300" />
              </div>
              {railWide && (
                <div className="animate-slide-right">
                  <span className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white font-display block leading-tight">ALLERIA</span>
                  <span className="text-gradient text-[9px] font-bold uppercase tracking-[0.35em] font-display">FILMY</span>
                </div>
              )}
            </Link>
          </div>

          {/* Nav */}
          <div className={`flex-1 px-3 pb-2 pt-3 relative ${railWide ? 'overflow-y-auto' : 'overflow-visible'}`}>
            <RailLabel label="Przeglądaj" />
            <nav className="space-y-1 nav-stagger">
              <RailLink {...navItems[0]} />

              {/* Categories: tree when wide, flyout when collapsed */}
              {categories.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => railWide ? setCatsExpanded(v => !v) : setCatFlyout(v => !v)}
                    className={`rail-item w-full ${railWide ? 'px-4' : 'justify-center px-0'} py-2.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white ${(!railWide && anyCatActive) ? '!text-ember-500' : ''}`}
                    aria-expanded={railWide ? catsExpanded : catFlyout}
                  >
                    <FolderOpen className="nav-icon w-[19px] h-[19px] shrink-0" />
                    {railWide && <span className="font-semibold text-[13px] flex-1 text-left">Kategorie</span>}
                    {railWide && <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${catsExpanded ? '' : '-rotate-90'}`} />}
                    {!railWide && <span className="rail-tip">Kategorie</span>}
                  </button>

                  {railWide && (
                    <div className={`reveal-y ${catsExpanded ? 'open' : ''}`}>
                      <div className="space-y-0.5 pt-0.5">
                        <CatTree cats={categories} parentId={null} depth={0} activeCatSlug={activeCatSlug} onNavigate={() => {}} />
                      </div>
                    </div>
                  )}

                  {!railWide && catFlyout && (
                    <div className="rail-flyout absolute left-[calc(100%+14px)] top-0 w-72 max-h-[60vh] overflow-y-auto bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-zinc-200 dark:border-white/10 rounded-3xl shadow-2xl p-3 z-[70]">
                      <p className="px-3 pt-1 pb-2 text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-400 font-display">Kategorie</p>
                      <CatTree cats={categories} parentId={null} depth={0} activeCatSlug={activeCatSlug} onNavigate={() => setCatFlyout(false)} />
                    </div>
                  )}
                </div>
              )}

              <RailLink {...navItems[1]} />
              <RailLink {...navItems[2]} />
              <RailLink {...navItems[3]} />
            </nav>

            {adminItems.length > 0 && (
              <>
                <RailLabel label="Administracja" />
                <nav className="space-y-1 nav-stagger">
                  {adminItems.map(item => <RailLink key={item.to} {...item} />)}
                </nav>
              </>
            )}
          </div>

          {/* Rail footer */}
          <div className={`p-3 shrink-0 space-y-1 ${railWide ? '' : 'flex flex-col items-center'}`}>
            <a
              href="https://github.com/mrfroncu/alleria-filmy-platform-3/issues"
              target="_blank" rel="noopener noreferrer"
              className={`rail-item w-full ${railWide ? 'px-4' : 'justify-center px-0'} py-2.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white`}
            >
              <MessageSquarePlus className="nav-icon w-[18px] h-[18px] shrink-0" />
              {railWide && <span className="font-semibold text-[12px]">Report Issue</span>}
              {!railWide && <span className="rail-tip">Report Issue / Request Feature</span>}
            </a>
            <button
              onClick={toggleRail}
              className={`rail-item w-full ${railWide ? 'px-4' : 'justify-center px-0'} py-2.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white`}
              title={railWide ? 'Zwiń panel' : 'Rozwiń panel'}
            >
              {railWide
                ? <><ChevronsLeft className="nav-icon w-[18px] h-[18px] shrink-0" /><span className="font-semibold text-[12px]">Zwiń</span></>
                : <><ChevronsRight className="nav-icon w-[18px] h-[18px] shrink-0" /><span className="rail-tip">Rozwiń panel</span></>}
            </button>
            {railWide && versions.panel && (
              <div className="pt-1 text-[8px] text-zinc-400 dark:text-zinc-600 font-mono text-center animate-fade-in">
                Panel & API: v{versions.panel} | Player:{' '}
                {versions.streamStatus === 'offline'
                  ? <span className="text-red-500">(offline)</span>
                  : <>v{versions.stream}{' '}{versions.streamStatus === 'compatible' && <span className="text-emerald-500">(C)</span>}{versions.streamStatus === 'deprecated' && <span className="text-amber-500">(deprecated)</span>}</>}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ════════ MAIN COLUMN ════════ */}
      <div className="flex-1 flex flex-col min-w-0 z-10">

        {/* ── Glass topbar ── */}
        <header className="shrink-0 px-4 lg:px-8 pt-3 lg:pt-5 pb-1 flex items-center gap-3 relative z-40">
          {/* Mobile logo */}
          <Link to="/" viewTransition className="lg:hidden flex items-center gap-2 shrink-0">
            <img src={LOGO_URL} alt="Alleria" className="w-8 h-8 object-contain animate-float" />
          </Link>

          {/* Page title — morphs between routes */}
          <div className="min-w-0 flex-1">
            <p className="hidden lg:block text-[9px] font-bold uppercase tracking-[0.3em] text-ember-500 font-display">Alleria Filmy</p>
            <h2 key={pageTitle} className="text-base lg:text-xl font-extrabold text-zinc-900 dark:text-white font-display truncate animate-slide-right">
              {pageTitle}
            </h2>
          </div>

          {/* Search pill → morphs into the command palette */}
          <button
            onClick={() => morph(() => setPaletteOpen(true))}
            className="group flex items-center gap-2.5 pl-4 pr-2.5 py-2.5 rounded-full bg-white/80 dark:bg-zinc-900/70 border border-zinc-200 dark:border-white/10 backdrop-blur-xl shadow-sm hover:border-ember-300 dark:hover:border-ember-500/40 hover:-translate-y-0.5 transition-all active:scale-95"
            style={{ viewTransitionName: paletteOpen ? 'none' : 'palette' }}
          >
            <Search className="w-4 h-4 text-ember-500 group-hover:scale-110 transition-transform" />
            <span className="hidden sm:block text-[13px] font-medium text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">Szukaj…</span>
            <kbd className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-lg bg-zinc-100 dark:bg-white/5 text-[10px] font-mono text-zinc-400 border border-zinc-200 dark:border-white/10">
              <Command className="w-2.5 h-2.5" />K
            </kbd>
          </button>

          {/* User chip + dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setUserMenu(v => !v)}
              className="flex items-center gap-2.5 p-1.5 lg:pl-3 rounded-full bg-white/80 dark:bg-zinc-900/70 border border-zinc-200 dark:border-white/10 backdrop-blur-xl shadow-sm hover:border-ember-300 dark:hover:border-ember-500/40 transition-all active:scale-95"
            >
              <span className="hidden lg:block text-[13px] font-bold text-zinc-700 dark:text-zinc-200 max-w-[120px] truncate">{user?.display_name || user?.username}</span>
              <span className="relative">
                <img src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.display_name || 'U'}&background=dd5f02&color=fff&size=80`} alt="" className="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-white/10" />
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-900 animate-pulse-soft ${user?.role === 'dev' ? 'bg-red-400' : user?.role === 'admin' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              </span>
            </button>

            {userMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)} />
                <div className="absolute right-0 top-[calc(100%+8px)] w-56 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-zinc-200 dark:border-white/10 rounded-3xl shadow-2xl p-2 z-50 animate-spring-in origin-top-right">
                  <div className="px-3 py-2.5 border-b border-zinc-100 dark:border-white/[0.06] mb-1">
                    <p className="text-[13px] font-bold text-zinc-900 dark:text-white truncate">{user?.display_name || user?.username}</p>
                    <p className="text-[10px] text-zinc-500 font-mono">{user?.role?.toUpperCase()}</p>
                  </div>
                  <Link to="/profile" viewTransition onClick={() => setUserMenu(false)} className="palette-row flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                    <User className="w-4 h-4 text-ember-500" /> Mój profil
                  </Link>
                  <button onClick={logout} className="palette-row w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-sm font-semibold text-red-500">
                    <LogOut className="w-4 h-4" /> Wyloguj
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* ── Routed content (morphs between pages) ── */}
        <main ref={mainRef} className="flex-1 overflow-y-auto relative flex flex-col pb-20 lg:pb-0">
          <div
            key={location.pathname}
            className={`flex-1 ${supportsVT ? '' : 'page-enter'}`}
            style={{ viewTransitionName: 'page-main' }}
          >
            {children}
          </div>

          <footer className="px-10 py-5 text-center relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px bg-gradient-to-r from-transparent via-ember-500/40 to-transparent" />
            <p className="text-[11px] text-zinc-400 dark:text-zinc-600">
              © 2025 - {getCurrentYear()} Alleria.pl | built by{' '}
              <a href="https://github.com/mrfroncu" target="_blank" rel="noopener noreferrer" className="link-underline text-ember-500 hover:text-ember-400 transition-colors">Matthew</a>
            </p>
          </footer>
        </main>
      </div>

      {/* ════════ MOBILE BOTTOM DOCK ════════ */}
      <nav className="dock lg:hidden fixed bottom-3 left-3 right-3 z-50 flex items-center gap-1 p-1.5 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl border border-zinc-200 dark:border-white/10 rounded-[22px]">
        {navItems.slice(0, 3).map(item => (
          <Link key={item.to} to={item.to} viewTransition className={`dock-item ${item.active ? 'active' : 'text-zinc-400'}`}>
            {item.active && <NavPill />}
            <item.icon className="w-5 h-5" />
            <span className="text-[9px] font-bold">{item.label.split(' ')[0]}</span>
          </Link>
        ))}
        <button onClick={() => setSheetOpen(true)} className={`dock-item ${sheetOpen ? 'text-ember-500' : 'text-zinc-400'}`}>
          <Menu className="w-5 h-5" />
          <span className="text-[9px] font-bold">Menu</span>
        </button>
      </nav>

      {/* ── Mobile full-menu sheet ── */}
      {sheetOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm animate-fade-in" onClick={() => setSheetOpen(false)} />
          <div className="sheet-up absolute bottom-0 left-0 right-0 max-h-[82vh] overflow-y-auto bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-white/10 rounded-t-[28px] p-5 pb-8">
            <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto mb-5" />
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <img src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.display_name || 'U'}&background=dd5f02&color=fff&size=80`} alt="" className="w-10 h-10 rounded-2xl object-cover" />
                <div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">{user?.display_name || user?.username}</p>
                  <p className="text-[10px] text-zinc-500 font-mono">{user?.role?.toUpperCase()}</p>
                </div>
              </div>
              <button onClick={() => setSheetOpen(false)} className="p-2 rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-500 hover:rotate-90 transition-all duration-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 stagger-children">
              {[...navItems, ...adminItems].map(item => (
                <Link
                  key={item.to} to={item.to} viewTransition
                  className={`flex items-center gap-2.5 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-95 ${
                    item.active
                      ? 'bg-gradient-to-r from-ember-500 to-curtain-600 text-white shadow-ember'
                      : 'bg-zinc-50 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-white/10'
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" /> {item.label}
                </Link>
              ))}
            </div>

            {categories.length > 0 && (
              <>
                <p className="px-1 pt-5 pb-2 text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-400 font-display">Kategorie</p>
                <div className="space-y-0.5">
                  <CatTree cats={categories} parentId={null} depth={0} activeCatSlug={activeCatSlug} onNavigate={() => setSheetOpen(false)} />
                </div>
              </>
            )}

            <button onClick={logout} className="mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-full bg-red-50 dark:bg-red-500/10 text-red-500 font-bold text-sm border border-red-100 dark:border-red-500/20 active:scale-95 transition-all">
              <LogOut className="w-4 h-4" /> Wyloguj
            </button>
            {versions.panel && (
              <p className="pt-3 text-[8px] text-zinc-400 dark:text-zinc-600 font-mono text-center">
                Panel & API: v{versions.panel} | Player: {versions.streamStatus === 'offline' ? '(offline)' : `v${versions.stream}`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ⌘K palette */}
      {paletteOpen && <CommandPalette onClose={() => morph(() => setPaletteOpen(false))} />}

      <WatchPartyTab />
    </div>
  );
}
