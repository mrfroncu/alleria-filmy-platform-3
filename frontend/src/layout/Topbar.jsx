import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Sun, Moon } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import { SearchTrigger } from '../components/GlobalSearch';

export default function Topbar({ title }) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="hidden lg:flex items-center justify-between gap-4 h-16 px-8 border-b border-slate-200 dark:border-white/10">
      <h1 className="text-lg font-bold text-slate-900 dark:text-white font-display truncate w-48 shrink-0">{title}</h1>
      <div className="flex-1 flex justify-center"><SearchTrigger /></div>
      <div className="flex items-center gap-3">
        <button onClick={toggleTheme} className="p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <Link to="/profile">
          <Avatar src={user?.avatar} name={user?.display_name || user?.username} size="sm" />
        </Link>
      </div>
    </header>
  );
}
