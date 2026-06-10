import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import {
  Film, Shield, LogOut, Menu, X, Wrench, ChevronDown,
  Heart, Clock, BarChart3, User, FolderOpen, FileText, MessageSquarePlus
} from 'lucide-react';
import { getCurrentYear } from '../utils/helpers';
import WatchPartyTab from './WatchPartyTab';

const LOGO_URL = 'https://alleria.pl/image/favicon.png';

// The single morphing pill behind whichever nav item is active.
// view-transition-name makes it GLIDE to the next item on navigation.
const NavPill = () => (
  <span className="nav-pill-bg" style={{ viewTransitionName: 'nav-pill' }} aria-hidden="true" />
);

function CatTree({ cats, parentId, depth, location, setSidebarOpen, activeCatSlug }) {
  const children = cats.filter(c => (c.parent_id || null) === parentId);
  if (children.length === 0) return null;
  return children.map(cat => {
    const hasKids = cats.some(c => c.parent_id === cat.id);
    const active = location.pathname === `/category/${cat.slug}` || activeCatSlug === cat.slug;
    const pl = depth === 0 ? 'pl-9' : depth === 1 ? 'pl-12' : 'pl-14';
    return (
      <div key={cat.id}>
        <Link
          to={`/category/${cat.slug}`}
          viewTransition
          onClick={() => setSidebarOpen(false)}
          className={`sidebar-link w-full flex items-center ${pl} pr-4 py-2 group ${
            active
              ? 'active text-white'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          {active && <NavPill />}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-300 ${active ? 'bg-white scale-125' : hasKids ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-300 dark:bg-zinc-600'} group-hover:bg-ember-400 group-hover:scale-125`} />
            <span className="font-semibold text-[13px] truncate">{cat.name}</span>
            <span className={`text-[10px] shrink-0 ${active ? 'text-white/70' : 'text-zinc-400'}`}>{cat.videoCount || 0}</span>
          </div>
        </Link>
        {hasKids && <CatTree cats={cats} parentId={cat.id} depth={depth + 1} location={location} setSidebarOpen={setSidebarOpen} activeCatSlug={activeCatSlug} />}
      </div>
    );
  });
}

export default function Layout({ children }) {
  const { user, logout, isAdmin, isDev } = useAuth();
  const location = useLocation();
  const mainRef = useRef(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [catsExpanded, setCatsExpanded] = useState(true);
  const [versions, setVersions] = useState({ panel: '', stream: '', streamStatus: '' });

  const supportsVT = typeof document !== 'undefined' && !!document.startViewTransition;

  // Scroll main content to top on route change
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [location.pathname]);

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

  const isActive = (path, prefixes) => {
    if (prefixes) return prefixes.some(p => location.pathname.startsWith(p)) || location.pathname === path;
    return location.pathname === path;
  };

  const NavLink = ({ to, icon: Icon, label, active }) => (
    <Link
      to={to}
      viewTransition
      onClick={() => setSidebarOpen(false)}
      className={`sidebar-link w-full flex items-center px-4 py-2.5 group ${
        active
          ? 'active text-white'
          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
      }`}
    >
      {active && <NavPill />}
      <div className="flex items-center gap-3">
        {Icon && <Icon className="nav-icon w-[18px] h-[18px]" />}
        <span className="font-semibold text-[13px] truncate">{label}</span>
      </div>
    </Link>
  );

  const SectionLabel = ({ label }) => (
    <div className="px-4 mb-2 mt-5 first:mt-0 flex items-center gap-2">
      <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-400 dark:text-zinc-600 shrink-0 font-display">{label}</span>
      <div className="h-px flex-1 bg-gradient-to-r from-zinc-200 dark:from-white/10 to-transparent" />
    </div>
  );

  // Determine which sidebar item should be active based on URL + ?from= param
  const fromParam = new URLSearchParams(location.search).get('from');
  const onVideoPage = location.pathname.startsWith('/video/');
  const anyCatActive = location.pathname.startsWith('/category/') || (onVideoPage && !!fromParam);
  const activeCatSlug = location.pathname.startsWith('/category/') ? location.pathname.split('/')[2] : fromParam;
  const allFilmsActive = (location.pathname === '/' || location.pathname.startsWith('/video') || location.pathname.startsWith('/author') || location.pathname.startsWith('/tag')) && !anyCatActive;

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 font-sans relative overflow-hidden transition-colors duration-300">

      {/* ── Ambient ember haze background ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="aurora-blob aurora-1 -top-44 -left-44 w-[560px] h-[560px] bg-ember-500/10 dark:bg-ember-500/15 blur-[150px]" />
        <div className="aurora-blob aurora-2 top-1/3 -right-48 w-[520px] h-[520px] bg-curtain-600/[0.07] dark:bg-curtain-600/10 blur-[160px]" />
        <div className="aurora-blob aurora-3 -bottom-48 left-1/3 w-[480px] h-[480px] bg-amber-400/[0.08] dark:bg-amber-500/10 blur-[150px]" />
        <div className="noise-overlay" />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-40 lg:hidden animate-fade-in" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar — floating warm panel ── */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 w-[276px] flex flex-col z-50 lg:z-10
        transition-transform duration-300 ease-out lg:p-3 lg:pr-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex flex-col h-full bg-white/90 dark:bg-zinc-900/70 backdrop-blur-2xl border border-zinc-200 dark:border-white/[0.07] lg:rounded-3xl overflow-hidden shadow-xl shadow-zinc-200/40 dark:shadow-black/40 relative">

          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-10 dark:opacity-20" aria-hidden="true">
            <div className="aurora-blob aurora-1 -top-24 -left-24 w-64 h-64 bg-ember-500 blur-[100px]" />
            <div className="aurora-blob aurora-2 top-1/2 -right-32 w-64 h-64 bg-curtain-600 blur-[100px]" />
          </div>

          {/* Logo */}
          <div className="px-6 pt-7 pb-2 relative z-10 shrink-0">
            <div className="flex items-center justify-between mb-7">
              <Link to="/" viewTransition className="flex items-center gap-3 group" onClick={() => setSidebarOpen(false)}>
                <div className="border-beam logo-glow w-10 h-10 rounded-2xl flex items-center justify-center overflow-hidden bg-gradient-to-br from-ember-500/10 to-curtain-500/10 border border-white/10 group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-300">
                  <img src={LOGO_URL} alt="Alleria" className="w-9 h-9 object-contain group-hover:rotate-[14deg] transition-transform duration-300" />
                </div>
                <div>
                  <span className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white font-display block leading-tight">ALLERIA</span>
                  <span className="text-gradient text-[9px] font-bold uppercase tracking-[0.35em] font-display">FILMY</span>
                </div>
              </Link>
              <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5 transition-all hover:rotate-90 duration-300">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Nav */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 relative z-10">
            <SectionLabel label="Przeglądaj" />
            <nav className="space-y-0.5 nav-stagger">
              <NavLink to="/" icon={Film} label="Wszystkie filmy" active={allFilmsActive && !anyCatActive} />

              {categories.length > 0 && (
                <>
                  <button
                    onClick={() => setCatsExpanded(!catsExpanded)}
                    className="sidebar-link w-full flex items-center justify-between px-4 py-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    aria-expanded={catsExpanded}
                  >
                    <div className="flex items-center gap-3">
                      <FolderOpen className="nav-icon w-[18px] h-[18px]" />
                      <span className="font-semibold text-[13px]">Kategorie</span>
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${catsExpanded ? '' : '-rotate-90'}`} />
                  </button>
                  <div className={`reveal-y ${catsExpanded ? 'open' : ''}`}>
                    <div className="space-y-0.5">
                      <CatTree cats={categories} parentId={null} depth={0} location={location} setSidebarOpen={setSidebarOpen} activeCatSlug={activeCatSlug} />
                    </div>
                  </div>
                </>
              )}

              <NavLink to="/favorites" icon={Heart} label="Ulubione" active={isActive('/favorites')} />
              <NavLink to="/history" icon={Clock} label="Historia" active={isActive('/history')} />
            </nav>

            <SectionLabel label="Konto" />
            <nav className="space-y-0.5 nav-stagger">
              <NavLink to="/profile" icon={User} label="Mój profil" active={isActive('/profile')} />
            </nav>

            {(isAdmin || isDev) && (
              <>
                <SectionLabel label="Administracja" />
                <nav className="space-y-0.5 nav-stagger">
                  {isAdmin && <NavLink to="/admin" icon={Shield} label="Panel Redaktora" active={isActive('/admin')} />}
                  {isAdmin && <NavLink to="/stats" icon={BarChart3} label="Statystyki" active={isActive('/stats')} />}
                  {isDev && <NavLink to="/manage" icon={FolderOpen} label="Zarządzanie" active={isActive('/manage')} />}
                  {isDev && <NavLink to="/logs" icon={FileText} label="Logi systemowe" active={isActive('/logs')} />}
                  {isDev && <NavLink to="/debug" icon={Wrench} label="Dev Tools" active={isActive('/debug')} />}
                </nav>
              </>
            )}

            <div className="mt-2">
              <a
                href="https://github.com/mrfroncu/alleria-filmy-platform-3/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="sidebar-link w-full flex items-center gap-3 px-4 py-2.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white font-semibold text-[13px]"
              >
                <MessageSquarePlus className="nav-icon w-[18px] h-[18px] shrink-0" />
                Report Issue / Request Feature
              </a>
            </div>
          </div>

          {/* User card */}
          <div className="p-4 relative z-10 shrink-0">
            <div className="glow-ring p-3 bg-zinc-50/80 dark:bg-white/5 rounded-2xl border border-zinc-200 dark:border-white/10 backdrop-blur-md transition-all duration-300 hover:border-ember-300 dark:hover:border-ember-500/30">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <img src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.display_name || 'U'}&background=dd5f02&color=fff&size=80`} alt="" className="w-9 h-9 rounded-xl shadow-sm border border-zinc-200 dark:border-white/10 object-cover" />
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-900 animate-pulse-soft ${user?.role === 'dev' ? 'bg-red-400' : user?.role === 'admin' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-zinc-900 dark:text-white truncate">{user?.display_name || user?.username}</p>
                  <p className="text-[10px] text-zinc-500 truncate font-mono">{user?.role?.toUpperCase()}</p>
                </div>
                <button onClick={logout} className="p-1.5 rounded-xl text-zinc-400 hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 transition-all duration-300 shrink-0 hover:scale-110 hover:rotate-6 active:scale-90" title="Wyloguj">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Version info */}
            {versions.panel && (
              <div className="pt-2 text-[8px] text-zinc-400 dark:text-zinc-600 font-mono text-center">
                Panel & API: v{versions.panel} | Player:{' '}
                {versions.streamStatus === 'offline'
                  ? <span className="text-red-500">(offline)</span>
                  : <>v{versions.stream}{' '}{versions.streamStatus === 'compatible' && <span className="text-emerald-500">(C)</span>}{versions.streamStatus === 'deprecated' && <span className="text-amber-500">(Streamer deprecated)</span>}</>
                }
              </div>
            )}
          </div>
        </div>
      </aside>

      <main ref={mainRef} className="flex-1 overflow-y-auto relative flex flex-col z-[5]">
        <div className="lg:hidden flex items-center justify-between p-4 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-200 dark:border-white/5 sticky top-0 z-30">
          <div className="flex items-center gap-2.5">
            <img src={LOGO_URL} alt="Alleria" className="w-7 h-7 object-contain animate-float" />
            <span className="font-bold text-zinc-900 dark:text-white font-display text-sm">ALLERIA FILMY</span>
          </div>
          <button onClick={() => setSidebarOpen(true)} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:scale-110 active:scale-90 transition-transform">
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* Route content. With View Transitions the whole column MORPHS between
            pages (vtPageOut/vtPageIn); .page-enter is only the no-VT fallback. */}
        <div
          key={location.pathname}
          className={`flex-1 ${supportsVT ? '' : 'page-enter'}`}
          style={{ viewTransitionName: 'page-main' }}
        >
          {children}
        </div>

        <footer className="px-10 py-5 border-t border-zinc-200 dark:border-white/5 text-center relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px bg-gradient-to-r from-transparent via-ember-500/40 to-transparent" />
          <p className="text-[11px] text-zinc-400 dark:text-zinc-600">
            © 2025 - {getCurrentYear()} Alleria.pl | built by{' '}
            <a href="https://github.com/mrfroncu" target="_blank" rel="noopener noreferrer" className="link-underline text-ember-500 hover:text-ember-400 transition-colors">Matthew</a>
          </p>
        </footer>
      </main>

      <WatchPartyTab />
    </div>
  );
}
