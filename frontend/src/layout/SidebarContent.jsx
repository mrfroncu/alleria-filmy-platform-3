import React, { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Film, Heart, History, BarChart3, ShieldCheck, Settings2, FileText, Bug, Sun, Moon, LogOut, Github } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { api } from '../utils/apiClient';
import { buildCategoryTree } from '../utils/helpers';
import CategoryTree from './CategoryTree';
import Avatar from '../components/ui/Avatar';

const navLinkClass = ({ isActive }) =>
  `flex items-center gap-2.5 px-3 py-2 rounded-2xl text-sm font-medium transition-colors ${
    isActive
      ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300'
      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
  }`;

export default function SidebarContent({ onNavigate }) {
  const { user, isAdmin, isDev, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [categories, setCategories] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getCategories().then((c) => { if (!cancelled) setCategories(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const tree = categories ? buildCategoryTree(categories) : [];

  return (
    <div className="flex flex-col h-full" onClick={onNavigate}>
      <div className="p-5 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-brand-500 to-teal-500 flex items-center justify-center shrink-0">
          <Film className="w-4.5 h-4.5 text-white" />
        </div>
        <span className="font-display font-extrabold text-slate-900 dark:text-white tracking-tight">ALLERIA FILMY</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
        <div className="space-y-0.5">
          <NavLink to="/" end className={navLinkClass}>
            <Film className="w-4 h-4" /> Wszystkie filmy
          </NavLink>
        </div>

        <div>
          <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 font-display">Kategorie</p>
          {categories === null ? (
            <div className="px-3 text-xs text-slate-400">Ładowanie...</div>
          ) : (
            <CategoryTree tree={tree} />
          )}
        </div>

        <div className="space-y-0.5">
          <NavLink to="/favorites" className={navLinkClass}>
            <Heart className="w-4 h-4" /> Ulubione
          </NavLink>
          <NavLink to="/history" className={navLinkClass}>
            <History className="w-4 h-4" /> Historia
          </NavLink>
        </div>

        {(isAdmin || isDev) && (
          <div>
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 font-display">Administracja</p>
            <div className="space-y-0.5">
              {isAdmin && (
                <NavLink to="/admin" className={navLinkClass}>
                  <ShieldCheck className="w-4 h-4" /> Panel Redaktora
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/stats" className={navLinkClass}>
                  <BarChart3 className="w-4 h-4" /> Statystyki
                </NavLink>
              )}
              {isDev && (
                <NavLink to="/manage" className={navLinkClass}>
                  <Settings2 className="w-4 h-4" /> Zarządzanie
                </NavLink>
              )}
              {isDev && (
                <NavLink to="/logs" className={navLinkClass}>
                  <FileText className="w-4 h-4" /> Logi
                </NavLink>
              )}
              {isDev && (
                <NavLink to="/debug" className={navLinkClass}>
                  <Bug className="w-4 h-4" /> Dev Tools
                </NavLink>
              )}
            </div>
          </div>
        )}

        <a
          href="https://github.com/mrfroncu/alleria-filmy-platform-3/issues"
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-3 py-2 rounded-2xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
        >
          <Github className="w-4 h-4" /> Zgłoś problem
        </a>
      </nav>

      <div className="p-3 border-t border-slate-200 dark:border-white/10 space-y-2">
        <button
          onClick={(e) => { e.stopPropagation(); toggleTheme(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === 'dark' ? 'Jasny motyw' : 'Ciemny motyw'}
        </button>
        <div className="flex items-center gap-2.5 p-2 rounded-2xl bg-slate-50 dark:bg-white/5">
          <Link to="/profile" className="flex items-center gap-2.5 flex-1 min-w-0">
            <Avatar src={user?.avatar} name={user?.display_name || user?.username} size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user?.display_name || user?.username}</p>
              <p className="text-[11px] text-slate-400 capitalize">{user?.role}</p>
            </div>
          </Link>
          <button onClick={(e) => { e.stopPropagation(); logout(); }} title="Wyloguj" className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
