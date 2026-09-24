import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { WatchPartyProvider } from './contexts/WatchPartyContext';
import { NotificationsProvider } from './contexts/NotificationsContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { ToastProvider } from './contexts/ToastContext';
import { UnsavedChangesProvider } from './contexts/UnsavedChangesContext';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import TosGate from './components/TosGate';
import SetupGate from './components/SetupGate';
import VideosPage from './pages/VideosPage';
import VideoPage from './pages/VideoPage';

// After a deploy, a tab that's still open has the previous build's index.html, whose chunk
// hashes no longer exist on the server — the first navigation to a not-yet-loaded page would
// fail. Reload once to pick up the new build instead (guarded so a real outage can't loop).
function lazyPage(factory) {
  return lazy(() => factory().catch((err) => {
    const KEY = 'alleria_chunk_reload_at';
    let last = 0;
    try { last = Number(sessionStorage.getItem(KEY) || 0); } catch (e) {}
    if (Date.now() - last > 10000) {
      try { sessionStorage.setItem(KEY, String(Date.now())); } catch (e) {}
      window.location.reload();
      return new Promise(() => {});
    }
    throw err;
  }));
}

// Only the pages almost every visit starts on (list + video) ship in the main bundle; panels,
// profile, Watch Party etc. load on first use. VideoAnalyticsPage also keeps recharts (~370KB raw)
// out of it.
const SetupWizardPage = lazyPage(() => import('./pages/SetupWizardPage'));
const AdminPage = lazyPage(() => import('./pages/AdminPage'));
const DebugPage = lazyPage(() => import('./pages/DebugPage'));
const FavoritesPage = lazyPage(() => import('./pages/FavoritesPage'));
const HistoryPage = lazyPage(() => import('./pages/HistoryPage'));
const StatsPage = lazyPage(() => import('./pages/StatsPage'));
const ProfilePage = lazyPage(() => import('./pages/ProfilePage'));
const LogsPage = lazyPage(() => import('./pages/LogsPage'));
const ManagePage = lazyPage(() => import('./pages/ManagePage'));
const WatchPartyPage = lazyPage(() => import('./pages/WatchPartyPage'));
const AuthorPage = lazyPage(() => import('./pages/AuthorPage'));
const ShortsPage = lazyPage(() => import('./pages/ShortsPage'));
const VideoAnalyticsPage = lazyPage(() => import('./pages/VideoAnalyticsPage'));

function ProtectedRoute({ children, adminOnly, devOnly }) {
  const { user, loading, isAdmin, isDev } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user) {
    // Pass current path so LoginPage can redirect back after login
    const returnTo = location.pathname + location.search;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} />;
  }
  if (adminOnly && !isAdmin) return <Navigate to="/" />;
  if (devOnly && !isDev) return <Navigate to="/" />;
  return children;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/" />;
  return children;
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// In-layout fallback while a lazy page's chunk loads — the sidebar/top bar stay put.
function PageLoading() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const P = ({ children, ...props }) => <ProtectedRoute {...props}><Layout><Suspense fallback={<PageLoading />}>{children}</Suspense></Layout></ProtectedRoute>;

export default function App() {
  return (
    <SettingsProvider>
    <ToastProvider>
    <ConfirmProvider>
    <UnsavedChangesProvider>
    <AuthProvider>
      <NotificationsProvider>
      <WatchPartyProvider>
        <TosGate />
        <SetupGate />
        <Routes>
          <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/setup" element={<ProtectedRoute devOnly><Suspense fallback={<LoadingScreen />}><SetupWizardPage /></Suspense></ProtectedRoute>} />
          <Route path="/" element={<P><VideosPage /></P>} />
          <Route path="/video/:id" element={<P><VideoPage /></P>} />
          <Route path="/video/:id/analytics" element={<P><VideoAnalyticsPage /></P>} />
          <Route path="/category/:categorySlug" element={<P><VideosPage /></P>} />
          <Route path="/favorites" element={<P><FavoritesPage /></P>} />
          <Route path="/history" element={<P><HistoryPage /></P>} />
          <Route path="/stats" element={<P adminOnly><StatsPage /></P>} />
          <Route path="/profile" element={<P><ProfilePage /></P>} />
          <Route path="/admin" element={<P adminOnly><AdminPage /></P>} />
          <Route path="/logs" element={<P devOnly><LogsPage /></P>} />
          <Route path="/manage" element={<P devOnly><ManagePage /></P>} />
          <Route path="/debug" element={<P devOnly><DebugPage /></P>} />
          <Route path="/author/:authorId" element={<P><AuthorPage /></P>} />
          <Route path="/tag/:tagId" element={<P><VideosPage /></P>} />
          <Route path="/watch-party" element={<P><WatchPartyPage /></P>} />
          <Route path="/shorts/:categorySlug" element={<P><ShortsPage /></P>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </WatchPartyProvider>
      </NotificationsProvider>
    </AuthProvider>
    </UnsavedChangesProvider>
    </ConfirmProvider>
    </ToastProvider>
    </SettingsProvider>
  );
}
