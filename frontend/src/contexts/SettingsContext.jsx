import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../utils/apiClient';

const SettingsContext = createContext(null);

const DEFAULT_CONFIG = {
  videosPerPage: 12,
  gridColumns: 3,
  gridCardMinWidth: 300,
  logsPerPage: 50,
  limitDisplayName: 50,
  limitBio: 1000,
  limitComment: 3000,
  showTopBar: true,
  customYoutubePlayer: false,
};

export function SettingsProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getConfig()
      .then((c) => setConfig((prev) => ({ ...prev, ...c })))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <SettingsContext.Provider value={{ config, loading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
