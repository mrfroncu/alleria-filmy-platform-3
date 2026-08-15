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
import { MaintenanceBlocked } from './components/Maintenance';
import VideosPage from './pages/VideosPage';
import VideoPage from './pages/VideoPage';
import AdminPage from './pages/AdminPage';
import DebugPage from './pages/DebugPage';
import FavoritesPage from './pages/FavoritesPage';
import HistoryPage from './pages/HistoryPage';
import StatsPage from './pages/StatsPage';
import ProfilePage from './pages/ProfilePage';
import LogsPage from './pages/LogsPage';
import ManagePage from './pages/ManagePage';
import WatchPartyPage from './pages/WatchPartyPage';
import AuthorPage from './pages/AuthorPage';
import ShortsPage from './pages/ShortsPage';
// Lazy: recharts alone adds ~370KB (raw) to the bundle — not worth every visitor paying for
// on first load when only authors/admins ever open this page.
const VideoAnalyticsPage = lazy(() => import('./pages/VideoAnalyticsPage'));

function ProtectedRoute({ children, adminOnly, devOnly }) {
  const { user, loading, isAdmin, isDev, maintenanceMode, logout } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user) {
    // Pass current path so LoginPage can redirect back after login
    const returnTo = location.pathname + location.search;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} />;
  }
  // Maintenance mode: only role 'dev' gets past this point, everyone else is logged in but
  // blocked — matches the server-side /api/* gate, so blocked users can't get partial data.
  if (maintenanceMode && !isDev) return <MaintenanceBlocked onLogout={logout} />;
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

const P = ({ children, ...props }) => <ProtectedRoute {...props}><Layout>{children}</Layout></ProtectedRoute>;

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
        <Routes>
          <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/" element={<P><VideosPage /></P>} />
          <Route path="/video/:id" element={<P><VideoPage /></P>} />
          <Route path="/video/:id/analytics" element={<P><Suspense fallback={<LoadingScreen />}><VideoAnalyticsPage /></Suspense></P>} />
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
