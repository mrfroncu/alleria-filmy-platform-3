import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import Topbar from './Topbar';
import WatchPartyTab from './WatchPartyTab';
import { useSettings } from '../contexts/SettingsContext';
import { GlobalSearchProvider } from '../contexts/GlobalSearchContext';
import { SearchModal } from '../components/GlobalSearch';

const TITLES = {
  '/': 'Baza filmów',
  '/favorites': 'Ulubione',
  '/history': 'Historia',
  '/stats': 'Statystyki',
  '/profile': 'Profil',
  '/admin': 'Panel Redaktora',
  '/manage': 'Zarządzanie',
  '/logs': 'Logi systemowe',
  '/debug': 'Dev Tools',
  '/watch-party': 'Watch Party',
};

function getPageTitle(pathname) {
  if (TITLES[pathname]) return TITLES[pathname];
  if (pathname.startsWith('/category/')) return 'Kategoria';
  if (pathname.startsWith('/tag/')) return 'Tag';
  if (pathname.startsWith('/video/')) return 'Film';
  if (pathname.startsWith('/author/')) return 'Autor';
  return 'ALLERIA FILMY';
}

export default function AppShell() {
  const location = useLocation();
  const { config } = useSettings();
  const title = getPageTitle(location.pathname);

  return (
    <GlobalSearchProvider>
      <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          {config.showTopBar && <Topbar title={title} />}
          <MobileNav title={title} />
          <main className="flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
        <WatchPartyTab />
        <SearchModal />
      </div>
    </GlobalSearchProvider>
  );
}
