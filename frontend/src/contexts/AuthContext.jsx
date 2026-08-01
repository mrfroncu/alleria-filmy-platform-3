import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../utils/apiClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    return api.me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch (_) {}
    window.location.href = '/login';
  }, []);

  const isAdmin = user?.role === 'admin' || user?.role === 'dev';
  const isDev = user?.role === 'dev';

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout, isAdmin, isDev }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
