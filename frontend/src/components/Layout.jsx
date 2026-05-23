import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import {
  Film, Shield, LogOut, Menu, X, Bug, ChevronRight, ChevronDown,
  Heart, Clock, BarChart3, User, FolderOpen, FileText, MessageSquarePlus
} from 'lucide-react';
import { getCurrentYear } from '../utils/helpers';
import WatchPartyTab from './WatchPartyTab';

const LOGO_URL = 'https://alleria.pl/image/favicon.png';

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
          onClick={() => setSidebarOpen(false)}
          className={`sidebar-link w-full flex items-center ${pl} pr-4 py-2 rounded-xl transition-all duration-200 group ${
            active ? 'active' : ''
          }`}
          style={active
            ? { background: 'rgba(255,91,46,0.10)', color: 'var(--ember-2)' }
            : { color: 'var(--fg-3)' }
          }
        >
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0`}
              style={{ background: active ? 'var(--ember)' : hasKids ? 'var(--fg-4)' : 'var(--bg-4)' }} />
            <span className="font-semibold text-[13px] truncate">{cat.name}</span>
            <span className="text-[10px] shrink-0" style={{ color: 'var(--fg-4)' }}>{cat.videoCount || 0}</span>
          </div>
        </Link>
        {hasKids && (
          <CatTree cats={cats} parentId={cat.id} depth={depth + 1}
            location={location} setSidebarOpen={setSidebarOpen} activeCatSlug={activeCatSlug} />
        )}
      </div>
    );
  });
}

export default function Layout({ children }) {
  const { user, logout, isAdmin, isDev } = useAuth();
  const location = useLocation();
  const mainRef = useRef(null);
  const cursorRef = useRef(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [catsExpanded, setCatsExpanded] = useState(true);
  const [versions, setVersions] = useState({ panel: '', stream: '', streamStatus: '' });

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [location.pathname]);

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    Promise.all([
      fetch('/api/version').then(r => r.json()).catch(() => ({})),
      fetch('/api/version/streaming').then(r => r.json()).catch(() => ({})),
    ]).then(([app, stream]) => {
      setVersions({ panel: app.version || '?', stream: stream.version || '?', streamStatus: stream.status || '' });
    });
  }, []);

  // Cursor light tracking
  useEffect(() => {
    const el = cursorRef.current;
    if (!el) return;
    const onMove = (e) => {
      el.style.left = e.clientX + 'px';
      el.style.top  = e.clientY + 'px';
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const isActive = (path, prefixes) => {
    if (prefixes) return prefixes.some(p => location.pathname.startsWith(p)) || location.pathname === path;
    return location.pathname === path;
  };

  const NavLink = ({ to, icon: Icon, label, active, indent }) => (
    <Link
      to={to}
      onClick={() => setSidebarOpen(false)}
      className={`sidebar-link w-full flex items-center justify-between ${indent ? 'pl-9 pr-4' : 'px-4'} py-2.5 rounded-xl group transition-all duration-200 ${active ? 'active' : ''}`}
      style={active
        ? indent
          ? { background: 'rgba(255,91,46,0.10)', color: 'var(--ember-2)' }
          : { background: 'var(--ember)', color: '#fff', boxShadow: '0 4px 20px -4px var(--ember-glow)' }
        : { color: 'var(--fg-3)' }
      }
    >
      <div className="flex items-center gap-3">
        {Icon && <Icon className="w-[18px] h-[18px]" />}
        {!Icon && indent && (
          <div className="w-1.5 h-1.5 rounded-full"
            style={{ background: active ? 'var(--ember)' : 'var(--fg-4)' }} />
        )}
        <span className="font-semibold text-[13px] truncate">{label}</span>
      </div>
      {active && !indent && <ChevronRight className="w-3.5 h-3.5 opacity-70" />}
    </Link>
  );

  const SectionLabel = ({ label }) => (
    <div className="px-4 mb-2 mt-5 first:mt-0">
      <span className="text-[9px] font-bold uppercase tracking-[0.28em] font-mono"
        style={{ color: 'var(--fg-4)' }}>{label}</span>
    </div>
  );

  const fromParam = new URLSearchParams(location.search).get('from');
  const onVideoPage = location.pathname.startsWith('/video/');
  const anyCatActive = location.pathname.startsWith('/category/') || (onVideoPage && !!fromParam);
  const activeCatSlug = location.pathname.startsWith('/category/')
    ? location.pathname.split('/')[2] : fromParam;
  const allFilmsActive = (
    location.pathname === '/' ||
    location.pathname.startsWith('/video') ||
    location.pathname.startsWith('/author') ||
    location.pathname.startsWith('/tag')
  ) && !anyCatActive;

  return (
    <div className="flex h-screen font-sans relative overflow-hidden"
      style={{ background: 'var(--bg-0)', color: 'var(--fg)' }}>

      {/* Cursor light */}
      <div ref={cursorRef} className="cursor-light" />

      {/* Ambient backdrop blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div className="absolute rounded-full animate-float1"
          style={{
            width: '50vw', height: '50vw',
            background: 'var(--ember)', opacity: 0.10,
            top: '-15%', left: '-10%', filter: 'blur(110px)',
            animation: 'float1 24s ease-in-out infinite',
          }} />
        <div className="absolute rounded-full"
          style={{
            width: '45vw', height: '45vw',
            background: 'var(--violet-a)', opacity: 0.08,
            bottom: '-15%', right: '-10%', filter: 'blur(110px)',
            animation: 'float2 28s ease-in-out infinite',
          }} />
        <div className="absolute rounded-full"
          style={{
            width: '35vw', height: '35vw',
            background: 'var(--cyber)', opacity: 0.05,
            top: '50%', left: '30%', filter: 'blur(110px)',
            animation: 'float3 32s ease-in-out infinite',
          }} />
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden animate-fade-in"
          style={{ background: 'rgba(10,10,16,0.7)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 w-[272px] flex flex-col z-50 lg:z-10 transition-all duration-300 ease-in-out overflow-hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        style={{
          background: 'rgba(17,17,26,0.88)',
          borderRight: '1px solid var(--line-2)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        {/* Sidebar inner glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -left-20 w-56 h-56 rounded-full"
            style={{ background: 'var(--ember)', opacity: 0.08, filter: 'blur(70px)' }} />
          <div className="absolute top-1/2 -right-24 w-52 h-52 rounded-full"
            style={{ background: 'var(--violet-a)', opacity: 0.06, filter: 'blur(70px)' }} />
        </div>

        {/* Logo */}
        <div className="px-6 pt-7 pb-2 relative z-10 shrink-0">
          <div className="flex items-center justify-between mb-7">
            <Link to="/" className="flex items-center gap-3 group" onClick={() => setSidebarOpen(false)}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden transition-all duration-300 group-hover:shadow-[0_0_20px_rgba(255,91,46,0.3)]"
                style={{ background: 'rgba(255,91,46,0.08)', border: '1px solid rgba(255,91,46,0.22)' }}>
                <img src={LOGO_URL} alt="Alleria" className="w-9 h-9 object-contain" />
              </div>
              <div>
                <span className="text-[15px] font-bold tracking-tight block leading-tight" style={{ color: 'var(--fg)' }}>ALLERIA</span>
                <span className="text-[9px] font-bold uppercase tracking-[0.35em] font-mono" style={{ color: 'var(--ember)' }}>FILMY</span>
              </div>
            </Link>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-2 rounded-lg transition-colors"
              style={{ color: 'var(--fg-3)' }}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 relative z-10">
          <SectionLabel label="Przeglądaj" />
          <nav className="space-y-0.5">
            <NavLink to="/" icon={Film} label="Wszystkie filmy" active={allFilmsActive && !anyCatActive} />

            {categories.length > 0 && (
              <>
                <button
                  onClick={() => setCatsExpanded(!catsExpanded)}
                  className="w-full flex items-center justify-between px-4 py-2 rounded-xl transition-all duration-200"
                  style={{ color: 'var(--fg-3)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg)'; e.currentTarget.style.background = 'rgba(246,246,250,0.04)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-3)'; e.currentTarget.style.background = ''; }}
                >
                  <div className="flex items-center gap-3">
                    <FolderOpen className="w-[18px] h-[18px]" />
                    <span className="font-semibold text-[13px]">Kategorie</span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${catsExpanded ? '' : '-rotate-90'}`} />
                </button>
                {catsExpanded && (
                  <div className="space-y-0.5 animate-fade-in">
                    <CatTree cats={categories} parentId={null} depth={0}
                      location={location} setSidebarOpen={setSidebarOpen} activeCatSlug={activeCatSlug} />
                  </div>
                )}
              </>
            )}

            <NavLink to="/favorites" icon={Heart}  label="Ulubione" active={isActive('/favorites')} />
            <NavLink to="/history"   icon={Clock}  label="Historia"  active={isActive('/history')} />
          </nav>

          <SectionLabel label="Konto" />
          <nav className="space-y-0.5">
            <NavLink to="/profile" icon={User} label="Mój profil" active={isActive('/profile')} />
          </nav>

          {(isAdmin || isDev) && (
            <>
              <SectionLabel label="Administracja" />
              <nav className="space-y-0.5">
                {isAdmin && <NavLink to="/admin"  icon={Shield}   label="Panel Redaktora"  active={isActive('/admin')} />}
                {isAdmin && <NavLink to="/stats"  icon={BarChart3} label="Statystyki"      active={isActive('/stats')} />}
                {isDev   && <NavLink to="/manage" icon={FolderOpen} label="Zarządzanie"    active={isActive('/manage')} />}
                {isDev   && <NavLink to="/logs"   icon={FileText}  label="Logi systemowe"  active={isActive('/logs')} />}
                {isDev   && <NavLink to="/debug"  icon={Bug}       label="Debug Tools"     active={isActive('/debug')} />}
              </nav>
            </>
          )}

          <div className="mt-2">
            <a
              href="https://github.com/mrfroncu/alleria-filmy-platform-3/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 font-semibold text-[13px] no-underline"
              style={{ color: 'var(--fg-3)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg)'; e.currentTarget.style.background = 'rgba(246,246,250,0.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-3)'; e.currentTarget.style.background = ''; }}
            >
              <MessageSquarePlus className="w-[18px] h-[18px] shrink-0" />
              Report Issue / Request Feature
            </a>
          </div>
        </div>

        {/* User card */}
        <div className="p-4 relative z-10 shrink-0">
          <div className="p-3 rounded-2xl" style={{ background: 'rgba(246,246,250,0.04)', border: '1px solid var(--line-2)' }}>
            <div className="flex items-center gap-3">
              <img
                src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.display_name || 'U'}&background=ff5b2e&color=fff&size=80`}
                alt="" className="w-9 h-9 rounded-xl object-cover"
                style={{ border: '1px solid var(--line-2)' }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold truncate" style={{ color: 'var(--fg)' }}>
                  {user?.display_name || user?.username}
                </p>
                <p className="text-[10px] font-mono flex items-center gap-1" style={{ color: 'var(--fg-3)' }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-[blink_2s_infinite]"
                    style={{
                      background: user?.role === 'dev' ? 'var(--err)' : user?.role === 'admin' ? 'var(--warn)' : 'var(--ok)',
                      boxShadow: `0 0 6px ${user?.role === 'dev' ? 'var(--err)' : user?.role === 'admin' ? 'var(--warn)' : 'var(--ok)'}`,
                    }} />
                  {user?.role?.toUpperCase()}
                </p>
              </div>
              <button
                onClick={logout}
                className="p-1.5 rounded-lg transition-all duration-200 shrink-0"
                style={{ color: 'var(--fg-3)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--err)'; e.currentTarget.style.background = 'rgba(239,111,108,0.10)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-3)'; e.currentTarget.style.background = ''; }}
                title="Wyloguj"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {versions.panel && (
            <div className="pt-2 text-[8px] font-mono text-center" style={{ color: 'var(--fg-4)' }}>
              Panel & API: v{versions.panel} | Player:{' '}
              {versions.streamStatus === 'offline'
                ? <span style={{ color: 'var(--err)' }}>(offline)</span>
                : (
                  <>
                    v{versions.stream}{' '}
                    {versions.streamStatus === 'compatible'  && <span style={{ color: 'var(--ok)' }}>(C)</span>}
                    {versions.streamStatus === 'deprecated'  && <span style={{ color: 'var(--warn)' }}>(deprecated)</span>}
                  </>
                )
              }
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main ref={mainRef} className="flex-1 overflow-y-auto relative flex flex-col" style={{ zIndex: 4 }}>
        {/* Mobile header */}
        <div
          className="lg:hidden flex items-center justify-between p-4 sticky top-0 z-30"
          style={{
            background: 'rgba(17,17,26,0.90)',
            borderBottom: '1px solid var(--line-2)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <img src={LOGO_URL} alt="Alleria" className="w-7 h-7 object-contain" />
            <span className="font-bold font-display text-sm" style={{ color: 'var(--fg)' }}>ALLERIA FILMY</span>
          </div>
          <button onClick={() => setSidebarOpen(true)} style={{ color: 'var(--fg-3)' }}>
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1">{children}</div>

        <footer className="px-10 py-5 text-center" style={{ borderTop: '1px solid var(--line)' }}>
          <p className="text-[11px] font-mono" style={{ color: 'var(--fg-4)' }}>
            © 2025 – {getCurrentYear()} Alleria.pl | built by{' '}
            <a
              href="https://github.com/mrfroncu"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-70"
              style={{ color: 'var(--ember)' }}
            >
              Matthew
            </a>
          </p>
        </footer>
      </main>

      <WatchPartyTab />
    </div>
  );
}
