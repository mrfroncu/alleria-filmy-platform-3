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
  endScreenSelfHosted: true,
  endScreenYoutube: true,
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

  // Every settings write goes through here so the public config the rest of the app reads
  // (top bar, grid, players, limits...) follows immediately instead of after a page reload.
  const saveSettings = useCallback(async (data) => {
    const r = await api.setSettings(data);
    refreshConfig();
    return r;
  }, [refreshConfig]);

  return (
    <SettingsContext.Provider value={{ config, loading, refreshConfig, saveSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
