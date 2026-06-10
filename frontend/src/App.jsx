import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WatchPartyProvider } from './contexts/WatchPartyContext';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
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
    <div className="flex flex-col items-center justify-center gap-6 min-h-screen bg-zinc-50 dark:bg-zinc-950 relative overflow-hidden">
      <div className="loader-orbit">
        <div className="loader-core" />
      </div>
      <p className="text-shimmer text-xs font-bold uppercase tracking-[0.35em] text-zinc-500 dark:text-zinc-400 font-display">
        Alleria Filmy
      </p>
    </div>
  );
}

const P = ({ children, ...props }) => <ProtectedRoute {...props}><Layout>{children}</Layout></ProtectedRoute>;

export default function App() {
  return (
    <AuthProvider>
      <WatchPartyProvider>
        <Routes>
          <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/" element={<P><VideosPage /></P>} />
          <Route path="/video/:id" element={<P><VideoPage /></P>} />
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
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </WatchPartyProvider>
    </AuthProvider>
  );
}
