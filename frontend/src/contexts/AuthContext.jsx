import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getMe().catch(() => null),
      // Public, unauthenticated — fetched in parallel so maintenance mode never adds an
      // extra perceived-loading step beyond the auth check that already runs on every load.
      fetch('/api/health').then(r => r.json()).catch(() => ({})),
    ]).then(([u, health]) => {
      setUser(u);
      setMaintenanceMode(!!health.maintenance_mode);
    }).finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await api.logout();
    setUser(null);
    window.location.href = '/login';
  };

  const isAdmin = user && (user.role === 'admin' || user.role === 'dev');
  const isDev = user && user.role === 'dev';

  return (
    <AuthContext.Provider value={{ user, loading, logout, isAdmin, isDev, maintenanceMode }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
