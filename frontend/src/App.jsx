import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { WatchPartyProvider } from './contexts/WatchPartyContext';
import { ToastProvider } from './components/ui/Toast';
import AppShell from './layout/AppShell';

import LoginPage from './pages/LoginPage';
import VideosPage from './pages/VideosPage';
import VideoPage from './pages/VideoPage';
import FavoritesPage from './pages/FavoritesPage';
import HistoryPage from './pages/HistoryPage';
import StatsPage from './pages/StatsPage';
import ProfilePage from './pages/ProfilePage';
import AuthorPage from './pages/AuthorPage';
import AdminPage from './pages/AdminPage';
import ManagePage from './pages/ManagePage';
import LogsPage from './pages/LogsPage';
import DebugPage from './pages/DebugPage';
import WatchPartyPage from './pages/WatchPartyPage';

function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="w-8 h-8 border-[3px] border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children, adminOnly = false, devOnly = false }) {
  const { user, loading, isAdmin, isDev } = useAuth();
  if (loading) return <FullScreenSpinner />;
  if (!user) return <Navigate to={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`} replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  if (devOnly && !isDev) return <Navigate to="/" replace />;
  return children;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenSpinner />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />

      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/" element={<VideosPage />} />
        <Route path="/category/:categorySlug" element={<VideosPage />} />
        <Route path="/tag/:tagId" element={<VideosPage />} />
        <Route path="/video/:id" element={<VideoPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/author/:authorId" element={<AuthorPage />} />
        <Route path="/watch-party" element={<WatchPartyPage />} />
        <Route path="/stats" element={<ProtectedRoute adminOnly><StatsPage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
        <Route path="/manage" element={<ProtectedRoute devOnly><ManagePage /></ProtectedRoute>} />
        <Route path="/logs" element={<ProtectedRoute devOnly><LogsPage /></ProtectedRoute>} />
        <Route path="/debug" element={<ProtectedRoute devOnly><DebugPage /></ProtectedRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <WatchPartyProvider>
              <AppRoutes />
            </WatchPartyProvider>
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}
