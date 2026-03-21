import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import VideosPage from './pages/VideosPage';
import VideoPage from './pages/VideoPage';
import AdminPage from './pages/AdminPage';
import DebugPage from './pages/DebugPage';

function ProtectedRoute({ children, adminOnly, devOnly }) {
  const { user, loading, isAdmin, isDev } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" />;
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
    <div className="flex items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/" element={
          <ProtectedRoute><Layout><VideosPage /></Layout></ProtectedRoute>
        } />
        <Route path="/video/:id" element={
          <ProtectedRoute><Layout><VideoPage /></Layout></ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute adminOnly><Layout><AdminPage /></Layout></ProtectedRoute>
        } />
        <Route path="/debug" element={
          <ProtectedRoute devOnly><Layout><DebugPage /></Layout></ProtectedRoute>
        } />
        <Route path="/author/:authorId" element={
          <ProtectedRoute><Layout><VideosPage /></Layout></ProtectedRoute>
        } />
        <Route path="/tag/:tagId" element={
          <ProtectedRoute><Layout><VideosPage /></Layout></ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </AuthProvider>
  );
}
