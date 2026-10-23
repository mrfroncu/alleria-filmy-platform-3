import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';

const SettingsContext = createContext(null);

const DEFAULT_CONFIG = {
  videosPerPage: 12,
  gridColumns: 3,
  gridCardMinWidth: 300,
  infiniteScroll: false,
  logsPerPage: 50,
  limitDisplayName: 50,
  limitBio: 1000,
  limitComment: 3000,
  showTopBar: true,
  allowCustomAvatars: false,
  chunkedUpload: true,
  customYoutubePlayer: false,
  gdprRegion: 'off',
  feedbackUrl: '',
  endScreenDelay: 1,
};

export function SettingsProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const refreshConfig = useCallback(() => api.getConfig()
    .then(c => setConfig(prev => ({ ...prev, ...c })))
    .catch(() => {}), []);

  useEffect(() => {
    refreshConfig().finally(() => setLoading(false));
  }, [refreshConfig]);

  return (
    <SettingsContext.Provider value={{ config, loading, refreshConfig }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
