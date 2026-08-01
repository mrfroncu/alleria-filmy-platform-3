import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/apiClient';
import { useAuth } from './AuthContext';

const GlobalSearchContext = createContext(null);

function buildPages(isAdmin, isDev) {
  const pages = [
    { label: 'Baza filmów', path: '/' },
    { label: 'Ulubione', path: '/favorites' },
    { label: 'Historia', path: '/history' },
    { label: 'Profil', path: '/profile' },
    { label: 'Watch Party', path: '/watch-party' },
  ];
  if (isAdmin) pages.push({ label: 'Statystyki', path: '/stats' }, { label: 'Panel Redaktora', path: '/admin' });
  if (isDev) pages.push(
    { label: 'Zarządzanie', path: '/manage' },
    { label: 'Logi systemowe', path: '/logs' },
    { label: 'Dev Tools — Streaming', path: '/debug?tab=streaming' },
    { label: 'Dev Tools — Ustawienia', path: '/debug?tab=settings' },
    { label: 'Dev Tools — Debug', path: '/debug?tab=debug' },
  );
  return pages;
}

export function GlobalSearchProvider({ children }) {
  const { isAdmin, isDev } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [videos, setVideos] = useState([]);
  const [tags, setTags] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => { if (!open) { setQuery(''); setVideos([]); setTags([]); setActiveIndex(0); } }, [open]);

  useEffect(() => {
    setActiveIndex(0);
    if (!query.trim()) { setVideos([]); setTags([]); return; }
    const t = setTimeout(() => {
      api.getVideos({ search: query, limit: 5 }).then(setVideos).catch(() => setVideos([]));
      api.getTags(query).then((r) => setTags(r.slice(0, 5))).catch(() => setTags([]));
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const pages = buildPages(isAdmin, isDev).filter((p) => !query || p.label.toLowerCase().includes(query.toLowerCase()));
  const results = [
    ...pages.map((p) => ({ type: 'page', ...p })),
    ...tags.map((t) => ({ type: 'tag', label: t.name, path: `/tag/${t.id}` })),
    ...videos.map((v) => ({ type: 'video', label: v.title, path: `/video/${v.id}`, thumbnail: v.thumbnail })),
  ];

  const go = useCallback((path) => { setOpen(false); navigate(path); }, [navigate]);

  return (
    <GlobalSearchContext.Provider value={{ open, setOpen, query, setQuery, results, activeIndex, setActiveIndex, go }}>
      {children}
    </GlobalSearchContext.Provider>
  );
}

export function useGlobalSearch() {
  const ctx = useContext(GlobalSearchContext);
  if (!ctx) throw new Error('useGlobalSearch must be used within GlobalSearchProvider');
  return ctx;
}
