import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useUnsavedGuard } from '../contexts/UnsavedChangesContext';
import { api } from '../utils/api';
import {
  Film, Shield, Menu, X, Wrench, ChevronRight, ChevronDown, LogOut,
  Heart, Clock, BarChart3, FolderOpen, FileText, MessageSquarePlus, Lock, Clapperboard
} from 'lucide-react';
import { getCurrentYear } from '../utils/helpers';
import WatchPartyTab from './WatchPartyTab';
import ProfileMenu from './ProfileMenu';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './NotificationBell';

const LOGO_URL = 'https://alleria.pl/image/favicon.png';

const STATIC_PAGE_TITLES = {
  '/': 'Baza Filmów',
  '/favorites': 'Ulubione',
  '/history': 'Historia',
  '/profile': 'Mój profil',
  '/admin': 'Panel Redaktora',
  '/stats': 'Statystyki',
  '/manage': 'Zarządzanie',
  '/logs': 'Logi systemowe',
  '/debug': 'Narzędzia Developerskie',
  '/watch-party': 'Watch Party',
};

function getPageTitle(pathname, categories) {
  if (STATIC_PAGE_TITLES[pathname]) return STATIC_PAGE_TITLES[pathname];
  if (pathname.startsWith('/category/')) {
    const cat = categories.find(c => c.slug === pathname.split('/')[2]);
    return cat?.name || 'Kategoria';
  }
  if (pathname.startsWith('/shorts/')) {
    const cat = categories.find(c => c.slug === pathname.split('/')[2]);
    return cat?.name ? `Shorts — ${cat.name}` : 'Shorts';
  }
  if (pathname.startsWith('/video/')) return 'Film';
  if (pathname.startsWith('/author/')) return 'Profil autora';
  if (pathname.startsWith('/tag/')) return 'Tag';
  return 'Alleria Filmy';
}

function guardedNavClick(e, to, navigate, guardNav, after) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // let the browser handle new-tab clicks
  e.preventDefault();
  guardNav(() => { after?.(); navigate(to); });
}

function CatTree({ cats, parentId, depth, location, setSidebarOpen, activeCatSlug, navigate, guardNav }) {
  const children = cats.filter(c => (c.parent_id || null) === parentId);
  if (children.length === 0) return null;
  return children.map(cat => {
    const hasKids = cats.some(c => c.parent_id === cat.id);
    const active = location.pathname === `/category/${cat.slug}` || activeCatSlug === cat.slug;
    const pl = depth === 0 ? 'pl-9' : depth === 1 ? 'pl-12' : 'pl-14';

    // Locked: user can't view this category itself, but it's shown (grayed out, not clickable)
    // because a subcategory beneath it IS accessible — otherwise that subcategory would have no
    // way to be reached from the sidebar at all.
    if (cat.locked) {
      return (
        <div key={cat.id}>
          <div
            title="Brak dostępu do tej kategorii"
            className={`w-full flex items-center ${pl} pr-4 py-2 rounded-xl text-zinc-400 dark:text-zinc-600 cursor-not-allowed select-none`}
          >
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <Lock className="w-3 h-3 shrink-0" />
              <span className="font-semibold text-[13px] truncate">{cat.name}</span>
            </div>
          </div>
          {hasKids && <CatTree cats={cats} parentId={cat.id} depth={depth + 1} location={location} setSidebarOpen={setSidebarOpen} activeCatSlug={activeCatSlug} navigate={navigate} guardNav={guardNav} />}
        </div>
      );
    }

    return (
      <div key={cat.id}>
        <Link
          to={`/category/${cat.slug}`}
          onClick={(e) => guardedNavClick(e, `/category/${cat.slug}`, navigate, guardNav, () => setSidebarOpen(false))}
          className={`w-full flex items-center ${pl} pr-4 py-2 rounded-xl transition-all duration-300 group ${
            active
              ? 'bg-violet-500/10 text-violet-500 dark:text-violet-400'
              : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {cat.is_shorts_category ? (
              <Clapperboard className={`w-3 h-3 shrink-0 ${active ? 'text-violet-500' : 'text-zinc-400 dark:text-zinc-500'}`} title="Kategoria Shortów" />
            ) : (
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-violet-500' : hasKids ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
            )}
            <span className="font-semibold text-[13px] truncate">{cat.name}</span>
            <span className="text-[10px] text-zinc-400 shrink-0">{cat.videoCount || 0}</span>
          </div>
        </Link>
        {hasKids && <CatTree cats={cats} parentId={cat.id} depth={depth + 1} location={location} setSidebarOpen={setSidebarOpen} activeCatSlug={activeCatSlug} navigate={navigate} guardNav={guardNav} />}
      </div>
    );
  });
}

export default function Layout({ children }) {
  const { user, logout, isAdmin, isDev } = useAuth();
  const { config } = useSettings();
  const showTopBar = config.showTopBar;
  const location = useLocation();
  const navigate = useNavigate();
  const guardNav = useUnsavedGuard();
  const mainRef = useRef(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [catsExpanded, setCatsExpanded] = useState(true);
  const [versions, setVersions] = useState({ panel: '', stream: '', streamStatus: '' });
  const [gdprPendingCount, setGdprPendingCount] = useState(0);

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
      api.getVersion().catch(() => ({})),
      api.getStreamVersion().catch(() => ({})),
    ]).then(([app, stream]) => {
      setVersions({ panel: app.version || '?', stream: stream.version || '?', streamStatus: stream.status || '' });
    });
  }, []);

  // Poll pending GDPR request count for the sidebar badge — dev-only, and only meaningful
  // once RODO handling is actually turned on.
  useEffect(() => {
    if (!isDev || config.gdprRegion === 'off') { setGdprPendingCount(0); return; }
    const load = () => api.adminGetGdprPendingCount().then(r => setGdprPendingCount(r.count || 0)).catch(() => {});
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [isDev, config.gdprRegion]);

  const isActive = (path, prefixes) => {
    if (prefixes) return prefixes.some(p => location.pathname.startsWith(p)) || location.pathname === path;
    return location.pathname === path;
  };

  const NavLink = ({ to, icon: Icon, label, active, indent, badge }) => (
    <Link
      to={to}
      onClick={(e) => guardedNavClick(e, to, navigate, guardNav, () => setSidebarOpen(false))}
      className={`sidebar-link w-full flex items-center justify-between ${indent ? 'pl-9 pr-4' : 'px-4'} py-2.5 rounded-xl group ${
        active
          ? indent ? 'active bg-violet-500/10 text-violet-500 dark:text-violet-400' : 'active bg-violet-500 text-white shadow-lg shadow-violet-500/20'
          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
      }`}
    >
      <div className="flex items-center gap-3">
        {Icon && <Icon className="w-[18px] h-[18px]" />}
        {!Icon && indent && <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-violet-500' : 'bg-zinc-400 dark:bg-zinc-600'}`} />}
        <span className="font-semibold text-[13px] truncate">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {!!badge && (
          <span className={`min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold ${
            active ? 'bg-white text-violet-600' : 'bg-red-500 text-white'
          }`}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
        {active && !indent && <ChevronRight className="w-3.5 h-3.5 opacity-70" />}
      </div>
    </Link>
  );

  const SectionLabel = ({ label }) => (
    <div className="px-4 mb-2 mt-5 first:mt-0">
      <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-400 dark:text-zinc-600">{label}</span>
    </div>
  );

  // Determine which sidebar item should be active based on URL + ?from= param
  const fromParam = new URLSearchParams(location.search).get('from');
  const onVideoPage = location.pathname.startsWith('/video/');
  const anyCatActive = location.pathname.startsWith('/category/') || (onVideoPage && !!fromParam);
  const activeCatSlug = location.pathname.startsWith('/category/') ? location.pathname.split('/')[2] : fromParam;
  const allFilmsActive = (location.pathname === '/' || location.pathname.startsWith('/video') || location.pathname.startsWith('/author') || location.pathname.startsWith('/tag')) && !anyCatActive;
  const pageTitle = getPageTitle(location.pathname, categories);

  // h-dvh, not h-screen: 100vh is measured against the *largest* possible mobile viewport
  // (toolbar collapsed), so on load (toolbar visible) this div is taller than what's actually on
  // screen — body/html then grow to match and gain their own, unintended scroll region stacked
  // behind <main>'s own overflow-y-auto. A touch starting outside <main> (e.g. the floating
  // WatchPartyTab) scrolls that outer surface instead, which is what "swiping the watch party tab
  // scrolls the whole page, then the middle only scrolls a little" was. 100dvh tracks the actual
  // visible viewport instead, so this outer surface never exists.
  return (
    <div className="flex h-dvh bg-zinc-50 dark:bg-zinc-950 font-sans selection:bg-violet-100 selection:text-violet-900 relative overflow-hidden transition-colors duration-300">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-40 lg:hidden animate-fade-in" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 w-[272px] bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-white/5 flex flex-col z-50 lg:z-10 transition-all duration-300 ease-in-out overflow-hidden
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-10 dark:opacity-20">
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-violet-500 rounded-full blur-[100px]" />
          <div className="absolute top-1/2 -right-32 w-64 h-64 bg-fuchsia-600 rounded-full blur-[100px]" />
        </div>

        {/* Logo */}
        <div className="px-6 pt-7 pb-2 relative z-10 shrink-0">
          <div className="flex items-center justify-between mb-7">
            <Link to="/" className="flex items-center gap-3 group" onClick={() => setSidebarOpen(false)}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden shadow-lg shadow-violet-500/10 group-hover:shadow-violet-500/30 transition-shadow bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-white/10">
                <img src={LOGO_URL} alt="Alleria" className="w-9 h-9 object-contain" />
              </div>
              <div>
                <span className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white font-display block leading-tight">ALLERIA</span>
                <span className="text-[9px] font-bold uppercase tracking-[0.35em] text-violet-500 font-display">FILMY</span>
              </div>
            </Link>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 relative z-10">
          <SectionLabel label="Przeglądaj" />
          <nav className="space-y-0.5">
            {/* Baza Filmów with categories */}
            <NavLink to="/" icon={Film} label="Wszystkie filmy" active={allFilmsActive && !anyCatActive} />

            {categories.length > 0 && (
              <>
                <button
                  onClick={() => setCatsExpanded(!catsExpanded)}
                  className="w-full flex items-center justify-between px-4 py-2 rounded-xl text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white transition-all"
                >
                  <div className="flex items-center gap-3">
                    <FolderOpen className="w-[18px] h-[18px]" />
                    <span className="font-semibold text-[13px]">Kategorie</span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${catsExpanded ? '' : '-rotate-90'}`} />
                </button>
                {catsExpanded && (
                  <div className="space-y-0.5 animate-fade-in">
                    <CatTree cats={categories} parentId={null} depth={0} location={location} setSidebarOpen={setSidebarOpen} activeCatSlug={activeCatSlug} navigate={navigate} guardNav={guardNav} />
                  </div>
                )}
              </>
            )}

            <NavLink to="/favorites" icon={Heart} label="Ulubione" active={isActive('/favorites')} />
            <NavLink to="/history" icon={Clock} label="Historia" active={isActive('/history')} />
          </nav>

          {(isAdmin || isDev) && (
            <>
              <SectionLabel label="Administracja" />
              <nav className="space-y-0.5">
                {isAdmin && <NavLink to="/admin" icon={Shield} label="Panel Redaktora" active={isActive('/admin')} />}
                {isAdmin && <NavLink to="/stats" icon={BarChart3} label="Statystyki" active={isActive('/stats')} />}
                {isDev && <NavLink to="/manage" icon={FolderOpen} label="Zarządzanie" active={isActive('/manage')} badge={gdprPendingCount} />}
                {isDev && <NavLink to="/logs" icon={FileText} label="Logi systemowe" active={isActive('/logs')} />}
                {isDev && <NavLink to="/debug" icon={Wrench} label="Narzędzia Developerskie" active={isActive('/debug')} />}
              </nav>
            </>
          )}

          <div className="mt-2">
            <a
              href="https://github.com/mrfroncu/alleria-filmy-platform-3/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white transition-all duration-300 font-semibold text-[13px]"
            >
              <MessageSquarePlus className="w-[18px] h-[18px] shrink-0" />
              Zgłoś Błąd / Zaproponuj funkcjonalność
            </a>
          </div>
        </div>

        {/* User card — only shown when the top bar (which hosts the profile menu) is off */}
        {!showTopBar && user && (
          <div className="px-4 relative z-10 shrink-0">
            <div className="p-3 bg-zinc-50 dark:bg-white/5 rounded-2xl border border-zinc-200 dark:border-white/10">
              <div className="flex items-center gap-3">
                <Link to="/profile" onClick={(e) => guardedNavClick(e, '/profile', navigate, guardNav)} className="flex items-center gap-3 flex-1 min-w-0 group">
                  <img src={user.avatar || `https://ui-avatars.com/api/?name=${user.display_name || 'U'}&background=6366f1&color=fff&size=80`} alt="" className="w-9 h-9 rounded-xl shadow-sm border border-zinc-200 dark:border-white/10 object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-zinc-900 dark:text-white truncate group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors">{user.display_name || user.username}</p>
                    <p className="text-[10px] text-zinc-500 truncate font-mono flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${user.role === 'dev' ? 'bg-red-400' : user.role === 'admin' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                      {user.role?.toUpperCase()}
                    </p>
                  </div>
                </Link>
                <NotificationBell fullScreenOnly />
                <button onClick={() => guardNav(logout)} className="p-1.5 rounded-lg text-zinc-400 hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 transition-all duration-300 shrink-0" title="Wyloguj">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Version info */}
        <div className="p-4 relative z-10 shrink-0">
          {versions.panel && (
            <div className="pt-2 text-[9px] text-zinc-500 dark:text-zinc-400 font-mono text-center">
              Panel: v{versions.panel} | Player:{' '}
              {versions.streamStatus === 'offline'
                ? <span className="text-red-500">(offline)</span>
                : <>v{versions.stream}{' '}{versions.streamStatus === 'compatible' && <span className="text-emerald-500">(C)</span>}{versions.streamStatus === 'deprecated' && <span className="text-amber-500">(Streamer deprecated)</span>}</>
              }
            </div>
          )}
        </div>
      </aside>

      <main ref={mainRef} className="flex-1 overflow-y-auto relative flex flex-col">
        {/* Sticks as one unit — the mobile/desktop top bars were already each independently
            sticky top-0 (mutually exclusive via breakpoint, so that never conflicted); the
            impersonation banner needed to join that same stack instead of being a third
            independent sticky top-0 sibling, which would just overlap whichever bar is active. */}
        <div className="sticky top-0 z-30 flex flex-col">
          {/* Impersonation banner — always shown regardless of role/route, since the impersonated
              session has exactly the target user's permissions and may not have dev-route access
              to get back to Dev Tools at all. This is the only way back. */}
          {user?.impersonatedBy && (
            <div className="shrink-0 flex items-center justify-center gap-3 px-4 py-2 bg-amber-500 text-amber-950 text-xs font-bold flex-wrap">
              <span>Jesteś zalogowany jako {user.display_name || user.username} (podszywanie się przez {user.impersonatedBy.display_name || user.impersonatedBy.username})</span>
              <button
                onClick={async () => { await api.stopImpersonating().catch(() => {}); window.location.href = '/'; }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-950/10 hover:bg-amber-950/20 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Wróć do swojego konta
              </button>
            </div>
          )}
          {/* Setup wizard reminder — shown after a dev skips it (SetupGate stops force-redirecting
              for the rest of that session once skipped, see SetupGate.jsx), so there's still a way
              back in without retyping the URL. Hidden on /setup itself. */}
          {isDev && user && !user.setupCompleted && location.pathname !== '/setup' && (
            <div className="shrink-0 flex items-center justify-center gap-3 px-4 py-2 bg-violet-500 text-white text-xs font-bold flex-wrap">
              <span>Konfiguracja platformy nie została jeszcze zakończona</span>
              <Link to="/setup" className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 transition-colors no-underline text-white">
                Dokończ konfigurację
              </Link>
            </div>
          )}
          {/* Mobile top bar — always present (hamburger is the only way to reach the sidebar on mobile) */}
          <div className="lg:hidden shrink-0 flex items-center justify-between gap-3 p-4 bg-gradient-to-r from-violet-100/50 via-white/60 to-fuchsia-100/40 dark:from-violet-500/10 dark:via-zinc-950/50 dark:to-fuchsia-500/10 backdrop-blur-xl backdrop-saturate-150 border-b border-white/50 dark:border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
            <div className="flex items-center gap-2 min-w-0">
              {/* Sidebar opens from the left, so its trigger lives on the left too */}
              <button onClick={() => setSidebarOpen(true)} className="btn-icon-zinc shrink-0">
                <Menu className="w-5 h-5" />
              </button>
              <Link to="/" className="flex items-center gap-2 min-w-0">
                <img src={LOGO_URL} alt="Alleria" className="w-7 h-7 object-contain shrink-0" />
                {showTopBar
                  ? <span className="font-bold text-zinc-900 dark:text-white font-display text-sm truncate">{pageTitle}</span>
                  : <span className="font-bold text-zinc-900 dark:text-white font-display text-sm">ALLERIA FILMY</span>}
              </Link>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {showTopBar && <GlobalSearch compact />}
              {showTopBar && <NotificationBell />}
              {showTopBar && <ProfileMenu compact />}
            </div>
          </div>

          {/* Desktop top bar — page title, global search, profile menu (optional, Zarządzanie > Ustawienia) */}
          {showTopBar && (
            <div className="hidden lg:flex shrink-0 items-center gap-6 px-8 py-3 bg-gradient-to-r from-violet-100/50 via-white/60 to-fuchsia-100/40 dark:from-violet-500/10 dark:via-zinc-950/50 dark:to-fuchsia-500/10 backdrop-blur-xl backdrop-saturate-150 border-b border-white/50 dark:border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
              <h1 className="text-zinc-900 dark:text-white font-bold text-lg font-display shrink-0 truncate max-w-[240px]">{pageTitle}</h1>
              <div className="flex-1 flex justify-center">
                <GlobalSearch />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <NotificationBell />
                <ProfileMenu />
              </div>
            </div>
          )}
        </div>

        <div className="flex-1">{children}</div>

        <footer className="shrink-0 px-10 py-5 border-t border-zinc-200 dark:border-white/5 text-center">
          <p className="text-[11px] text-zinc-400 dark:text-zinc-600">
            © 2025 - {getCurrentYear()} Alleria.pl | built by{' '}
            <a href="https://github.com/mrfroncu" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:text-violet-400 transition-colors">Matthew</a>
          </p>
        </footer>
      </main>

      {location.pathname !== '/watch-party' && !location.pathname.startsWith('/shorts/') && <WatchPartyTab />}
    </div>
  );
}
