import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Film, LayoutDashboard, Shield, LogOut, Menu, X, Sun, Moon, Bug, ChevronRight
} from 'lucide-react';
import { getCurrentYear } from '../utils/helpers';

export default function Layout({ children }) {
  const { user, logout, isAdmin, isDev } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('alleria-theme');
      if (saved) {
        document.documentElement.classList.toggle('dark', saved === 'dark');
        return saved;
      }
    }
    return 'dark';
  });

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('alleria-theme', next);
  };

  const navItems = [
    { path: '/', label: 'Baza Filmów', icon: Film },
    ...(isAdmin ? [{ path: '/admin', label: 'Panel Redaktora', icon: Shield }] : []),
    ...(isDev ? [{ path: '/debug', label: 'Debug Tools', icon: Bug }] : []),
  ];

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/' || location.pathname.startsWith('/video') || location.pathname.startsWith('/author') || location.pathname.startsWith('/tag');
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 font-sans selection:bg-indigo-100 selection:text-indigo-900 relative overflow-hidden transition-colors duration-300">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-40 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 w-72 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-white/5 flex flex-col z-50 lg:z-10 transition-all duration-300 ease-in-out overflow-y-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Background glow */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-10 dark:opacity-20">
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-600 rounded-full blur-[100px]" />
          <div className="absolute top-1/2 -right-32 w-64 h-64 bg-fuchsia-600 rounded-full blur-[100px]" />
        </div>

        <div className="p-8 relative z-10 shrink-0">
          <div className="flex items-center justify-between mb-10">
            <Link to="/" className="flex items-center gap-3 group" onClick={() => setSidebarOpen(false)}>
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-shadow">
                <Film className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white font-display block leading-tight">ALLERIA</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-indigo-500 font-display">FILMY</span>
              </div>
            </Link>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>

          <nav className="space-y-1.5">
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-300 group ${
                  isActive(item.path)
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-xl shadow-zinc-900/10 dark:shadow-white/10'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  <span className="font-bold text-sm">{item.label}</span>
                </div>
                {isActive(item.path) && <ChevronRight className="w-4 h-4 opacity-70" />}
              </Link>
            ))}
          </nav>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User card at bottom */}
        <div className="p-6 relative z-10 shrink-0">
          <div className="p-4 bg-zinc-50 dark:bg-white/5 rounded-2xl border border-zinc-200 dark:border-white/10 mb-4 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <img
                src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.display_name || 'U'}&background=6366f1&color=fff`}
                alt=""
                className="w-10 h-10 rounded-xl shadow-sm border border-zinc-200 dark:border-white/10 object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{user?.display_name || user?.username}</p>
                <p className="text-[10px] text-zinc-500 truncate font-mono">{user?.role?.toUpperCase()} • {user?.auth_method}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={logout}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-zinc-500 dark:text-zinc-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-all duration-300 font-bold text-sm"
            >
              <LogOut className="w-4 h-4" />
              Wyloguj
            </button>
            <button
              onClick={toggleTheme}
              className="p-3 rounded-xl text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white transition-all duration-300"
              title={theme === 'dark' ? 'Tryb jasny' : 'Tryb ciemny'}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative flex flex-col">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-white/5 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-fuchsia-500 rounded-lg flex items-center justify-center">
              <Film className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-zinc-900 dark:text-white font-display">ALLERIA FILMY</span>
          </div>
          <button onClick={() => setSidebarOpen(true)} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
            <Menu className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1">
          {children}
        </div>

        {/* Footer */}
        <footer className="px-10 py-6 border-t border-zinc-200 dark:border-white/5 text-center">
          <p className="text-xs text-zinc-400 dark:text-zinc-600">
            © 2025 - {getCurrentYear()} Alleria.pl | built by{' '}
            <a href="https://github.com/mrfroncu" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-400 transition-colors">
              Matthew
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
