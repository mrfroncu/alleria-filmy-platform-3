import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Upload, Trash2, AlertTriangle, UserPlus, ChevronDown, Terminal, Play, BarChart3, Loader2, Users, RefreshCw, HardDrive, CheckSquare, Square, ShieldCheck, Wrench, Settings, Bug, Lock } from 'lucide-react';
import { api } from '../utils/api';

// Dev Tools tabs — selected at the top of the page
const TABS = [
  { id: 'streaming', label: 'Streaming', icon: HardDrive },
  { id: 'admin', label: 'Administracyjne', icon: Users },
  { id: 'categories', label: 'Kategorie', icon: ShieldCheck },
  { id: 'settings', label: 'Ustawienia', icon: Settings },
  { id: 'debug', label: 'Debug', icon: Bug },
];

function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

const TAB_IDS = TABS.map(t => t.id);

export default function DebugPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(TAB_IDS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'streaming');
  const fileInputRef = useRef(null);

  // SQL executor
  const [sqlQuery, setSqlQuery] = useState('');
  const [sqlResult, setSqlResult] = useState(null);
  const [sqlRunning, setSqlRunning] = useState(false);

  // Create user form
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState('member');
  const [newDiscordId, setNewDiscordId] = useState('');
  const [newAvatar, setNewAvatar] = useState('');

  const [cleanupLog, setCleanupLog] = useState([]);

  // Clear DB confirmation modal
  const [clearDbOpen, setClearDbOpen] = useState(false);
  const [clearDbText, setClearDbText] = useState('');
  const CLEAR_DB_PHRASE = 'WYCZYŚĆ WSZYSTKO';

  // Watch Party management
  const [watchParties, setWatchParties] = useState([]);
  const [wpLoading, setWpLoading] = useState(false);

  const loadWatchParties = () => {
    setWpLoading(true);
    api.getActiveWatchParties().then(setWatchParties).catch(() => {}).finally(() => setWpLoading(false));
  };

  // Admin stats
  const [streamStats, setStreamStats] = useState(null);
  const [dbStats, setDbStats] = useState(null);
  const [dbSize, setDbSize] = useState(null);
  const [transcodingVideos, setTranscodingVideos] = useState([]);

  const loadDbSize = () => api.dbStats().then(setDbSize).catch(() => {});

  // Live transcoding from streaming server
  const [liveTranscoding, setLiveTranscoding] = useState(null); // null = not yet loaded
  const [transcodingLoading, setTranscodingLoading] = useState(false);

  const loadLiveTranscoding = async () => {
    try {
      const jobs = await api.streamTranscoding();
      setLiveTranscoding(jobs);
    } catch (_) { setLiveTranscoding([]); }
  };

  // Stream file manager
  const [streamFiles, setStreamFiles] = useState(null);
  const [streamFilesLoading, setStreamFilesLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [deletingFiles, setDeletingFiles] = useState(false);

  const loadStreamFiles = async () => {
    setStreamFilesLoading(true);
    try {
      const files = await api.streamFiles();
      setStreamFiles(files);
      setSelectedFiles(new Set());
    } catch (e) {
      setStatus({ type: 'error', msg: 'Błąd ładowania plików streamera: ' + e.message });
    }
    setStreamFilesLoading(false);
  };

  const deleteSelectedFiles = async (ids) => {
    if (!ids.length) return;
    if (!confirm(`Usunąć ${ids.length} plik(ów) ze streamera? Operacja nieodwracalna!`)) return;
    setDeletingFiles(true);
    let deleted = 0;
    for (const id of ids) {
      try { await api.deleteStream(id); deleted++; } catch (_) {}
    }
    setStatus({ type: 'success', msg: `Usunięto ${deleted} plik(ów) ze streamera.` });
    setDeletingFiles(false);
    await loadStreamFiles();
    fetch('/api/stream/stats').then(r => r.json()).then(setStreamStats).catch(() => {});
  };

  useEffect(() => {
    loadWatchParties();
    // Load stats
    fetch('/api/stream/stats').then(r => r.json()).then(setStreamStats).catch(() => {});
    api.execSQL('SELECT COUNT(*) AS videos FROM videos').then(r => {
      if (r.rows) {
        const videos = r.rows[0]?.videos || 0;
        api.execSQL('SELECT COUNT(*) AS users FROM users').then(r2 => {
          const users = r2.rows?.[0]?.users || 0;
          api.execSQL('SELECT COUNT(*) AS cats FROM categories').then(r3 => {
            setDbStats({ videos, users, categories: r3.rows?.[0]?.cats || 0 });
          });
        });
      }
    }).catch(() => {});
    // Load transcoding videos
    loadTranscoding();
    loadLiveTranscoding();
    loadDbSize();
  }, []);

  // Poll live transcoding every 5s
  useEffect(() => {
    const interval = setInterval(loadLiveTranscoding, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadTranscoding = () => {
    api.getVideos({ include_transcoding: '1' }).then(videos => {
      setTranscodingVideos(videos.filter(v => v.stream_status === 'transcoding'));
    }).catch(() => {});
  };

  // Poll transcoding status
  useEffect(() => {
    if (transcodingVideos.length === 0) return;
    const interval = setInterval(async () => {
      let changed = false;
      const updated = [...transcodingVideos];
      for (let i = 0; i < updated.length; i++) {
        try {
          const st = await api.streamCheck(updated[i].id);
          updated[i] = { ...updated[i], _progress: st.progress, _quality: st.quality, _status: st.status };
          if (st.status === 'ready' || st.status === 'error') changed = true;
        } catch (e) {}
      }
      setTranscodingVideos(updated.filter(v => v._status !== 'ready' && v._status !== 'error'));
      if (changed) {
        fetch('/api/stream/stats').then(r => r.json()).then(setStreamStats).catch(() => {});
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [transcodingVideos.length]);
  // Access checker
  const [accessMode, setAccessMode] = useState('category');
  const [accessCategories, setAccessCategories] = useState([]);
  const [accessVideos, setAccessVideos] = useState([]);
  const [accessSelectedId, setAccessSelectedId] = useState('');
  const [accessResult, setAccessResult] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);

  useEffect(() => {
    api.getCategories().then(setAccessCategories).catch(() => {});
    api.getVideos({ include_transcoding: '1' }).then(setAccessVideos).catch(() => {});
  }, []);

  const checkAccess = async () => {
    if (!accessSelectedId) return;
    setAccessLoading(true);
    setAccessResult(null);
    try {
      const data = await api.debugAccess(accessMode, accessSelectedId);
      setAccessResult(data);
    } catch (e) {
      setAccessResult({ error: e.message });
    }
    setAccessLoading(false);
  };

  const reasonLabel = (reason, viewerRoles, editorRoles) => {
    if (reason === 'admin') return { text: 'Administrator', color: 'text-violet-600 dark:text-violet-400' };
    if (reason === 'dev') return { text: 'Developer', color: 'text-violet-600 dark:text-violet-400' };
    if (reason === 'public' || reason === 'public_category') return { text: 'Kategoria publiczna', color: 'text-emerald-600 dark:text-emerald-400' };
    if (reason === 'no_category') return { text: 'Film bez kategorii (publiczny)', color: 'text-emerald-600 dark:text-emerald-400' };
    if (reason === 'custom_access') return { text: 'Dostęp niestandardowy', color: 'text-blue-600 dark:text-blue-400' };
    if (reason === 'not_in_custom_list') return { text: 'Brak na liście niestandardowej', color: 'text-red-500' };
    if (reason === 'no_matching_role') {
      const allRoles = [...(viewerRoles || []), ...(editorRoles || [])];
      return { text: `Brak wymaganej roli${allRoles.length ? ` (wymaga: ${allRoles.slice(0, 2).join(', ')}${allRoles.length > 2 ? '…' : ''})` : ''}`, color: 'text-red-500' };
    }
    if (reason?.startsWith('viewer:')) return { text: `Rola widza: ${reason.slice(7)}`, color: 'text-emerald-600 dark:text-emerald-400' };
    if (reason?.startsWith('editor:')) return { text: `Rola edytora: ${reason.slice(7)}`, color: 'text-emerald-600 dark:text-emerald-400' };
    return { text: reason || '—', color: 'text-zinc-400' };
  };

  const [creatingUser, setCreatingUser] = useState(false);

  // App settings (webhook domain restriction + content limits)
  const [settings, setSettingsState] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [limitForm, setLimitForm] = useState({ limit_display_name: '', limit_bio: '', limit_comment: '' });

  useEffect(() => {
    api.getSettings().then(s => {
      setSettingsState(s);
      setLimitForm({
        limit_display_name: s.limit_display_name,
        limit_bio: s.limit_bio,
        limit_comment: s.limit_comment,
      });
    }).catch(() => {});
  }, []);

  const saveLimits = async () => {
    setSavingSettings(true);
    try {
      const r = await api.setSettings({
        limit_display_name: parseInt(limitForm.limit_display_name, 10),
        limit_bio: parseInt(limitForm.limit_bio, 10),
        limit_comment: parseInt(limitForm.limit_comment, 10),
      });
      setSettingsState(r);
      setLimitForm({ limit_display_name: r.limit_display_name, limit_bio: r.limit_bio, limit_comment: r.limit_comment });
      setStatus({ type: 'success', msg: 'Limity treści zapisane.' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingSettings(false);
  };

  const toggleWebhookRestriction = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const r = await api.setSettings({ webhook_domain_restriction: !settings.webhook_domain_restriction });
      setSettingsState(s => ({ ...s, webhook_domain_restriction: r.webhook_domain_restriction }));
      setStatus({ type: 'success', msg: `Ograniczenie domen webhooków: ${r.webhook_domain_restriction ? 'WŁĄCZONE' : 'WYŁĄCZONE'}` });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingSettings(false);
  };

  const setTs3Delivery = async (value) => {
    if (!settings || settings.ts3_code_delivery === value) return;
    setSavingSettings(true);
    try {
      const r = await api.setSettings({ ts3_code_delivery: value });
      setSettingsState(s => ({ ...s, ts3_code_delivery: r.ts3_code_delivery }));
      const label = value === 'pm' ? 'prywatna wiadomość' : value === 'poke' ? 'poke' : 'wiadomość + poke';
      setStatus({ type: 'success', msg: `Wysyłka kodu TS3: ${label}` });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingSettings(false);
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const data = await api.exportDB();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `alleria-filmy-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ type: 'success', msg: 'Eksport zakończony pomyślnie.' });
    } catch (err) {
      setStatus({ type: 'error', msg: 'Błąd eksportu: ' + err.message });
    }
    setLoading(false);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await api.importDB(data);
      setStatus({ type: 'success', msg: 'Import zakończony pomyślnie.' });
    } catch (err) {
      setStatus({ type: 'error', msg: 'Błąd importu: ' + err.message });
    }
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const performClear = async () => {
    if (clearDbText !== CLEAR_DB_PHRASE) return;
    setLoading(true);
    try {
      await api.clearDB();
      setStatus({ type: 'success', msg: 'Baza danych wyczyszczona.' });
      setClearDbOpen(false);
      setClearDbText('');
    } catch (err) {
      setStatus({ type: 'error', msg: 'Błąd: ' + err.message });
    }
    setLoading(false);
  };

  const handleRunSQL = async () => {
    if (!sqlQuery.trim()) return;
    setSqlRunning(true);
    setSqlResult(null);
    try {
      const result = await api.execSQL(sqlQuery.trim());
      setSqlResult(result);
    } catch (err) {
      setSqlResult({ success: false, error: err.message });
    }
    setSqlRunning(false);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername.trim() || !newDisplayName.trim()) return;
    setCreatingUser(true);
    try {
      const result = await api.createUser({
        username: newUsername.trim(),
        display_name: newDisplayName.trim(),
        role: newRole,
        discord_id: newDiscordId.trim() || undefined,
        avatar: newAvatar.trim() || undefined,
      });
      setStatus({ type: 'success', msg: `Użytkownik "${result.user.display_name}" utworzony (ID: ${result.user.id})` });
      setNewUsername('');
      setNewDisplayName('');
      setNewRole('member');
      setNewDiscordId('');
      setNewAvatar('');
    } catch (err) {
      setStatus({ type: 'error', msg: 'Błąd tworzenia użytkownika: ' + err.message });
    }
    setCreatingUser(false);
  };

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto animate-fade-in">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-red-50 dark:bg-red-500/10 rounded-xl flex items-center justify-center">
            <Wrench className="w-5 h-5 text-red-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Dev Tools</h1>
        </div>
        <p className="text-zinc-500 dark:text-zinc-400">Narzędzia deweloperskie do zarządzania platformą i bazą danych.</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
                active
                  ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {status && (
        <div className={`mb-6 p-4 rounded-2xl border text-sm font-medium animate-slide-up ${
          status.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-300'
        }`}>
          {status.msg}
        </div>
      )}

      {/* ============ STREAMING ============ */}
      {activeTab === 'streaming' && (
      <div className="animate-fade-in">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="card p-5 text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{dbStats?.videos ?? '—'}</p>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">Filmów</p>
        </div>
        <div className="card p-5 text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{dbStats?.users ?? '—'}</p>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">Użytkowników</p>
        </div>
        <div className="card p-5 text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{streamStats?.totalSizeGB ?? '—'} <span className="text-sm text-zinc-400">GB</span></p>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">Rozmiar streamingu</p>
        </div>
        <div className="card p-5 text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{streamStats?.videoCount ?? '—'}</p>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">Plików wideo ({streamStats?.fileCount ?? 0} segmentów)</p>
        </div>
      </div>

      {/* Transcoding Monitor — full width */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display flex items-center gap-2">
            {liveTranscoding?.length > 0
              ? <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
              : <BarChart3 className="w-4 h-4 text-zinc-400" />}
            Transkodowanie na serwerze
            {liveTranscoding !== null && (
              <span className={`text-xs font-mono px-2 py-0.5 rounded-lg ${liveTranscoding.length > 0 ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                {liveTranscoding.length} aktywnych
              </span>
            )}
          </h3>
          <button onClick={loadLiveTranscoding} className="btn-ghost flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Odśwież
          </button>
        </div>

        {liveTranscoding === null && (
          <p className="text-zinc-400 text-sm text-center py-4 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Ładowanie...
          </p>
        )}

        {liveTranscoding !== null && liveTranscoding.length === 0 && (
          <p className="text-zinc-400 text-sm text-center py-4">Brak aktywnych transkodowań</p>
        )}

        {liveTranscoding?.length > 0 && (
          <div className="space-y-3">
            {liveTranscoding.map(job => (
              <div key={job.video_id} className="p-4 bg-amber-50/50 dark:bg-amber-500/5 rounded-xl border border-amber-200 dark:border-amber-500/20 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                      {job.db_video ? job.db_video.title : <span className="text-zinc-400 italic">Brak w bazie danych</span>}
                    </p>
                    <p className="text-[10px] font-mono text-zinc-400 mt-0.5">{job.video_id}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {job.quality && (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-lg font-mono">{job.quality}</span>
                    )}
                    <span className="text-sm font-mono font-bold text-amber-600 dark:text-amber-400 w-10 text-right">{job.progress}%</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500" style={{ width: `${job.progress}%` }} />
                  </div>
                  <p className="text-[10px] text-zinc-400">
                    {job.quality ? `Kodowanie jakości ${job.quality}` : 'Oczekiwanie na start...'} — odświeżanie co 5s
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Streaming file manager — full width */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display">Pliki streamera</h3>
              <p className="text-xs text-zinc-500">Wszystkie pliki HLS na serwerze streamingu — zarządzanie i usuwanie</p>
            </div>
          </div>
          <button
            onClick={loadStreamFiles}
            disabled={streamFilesLoading}
            className="btn-ghost flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${streamFilesLoading ? 'animate-spin' : ''}`} />
            {streamFiles ? 'Odśwież' : 'Załaduj'}
          </button>
        </div>

        {streamFiles === null && !streamFilesLoading && (
          <p className="text-zinc-400 text-sm text-center py-6">Kliknij „Załaduj" aby pobrać listę plików</p>
        )}
        {streamFilesLoading && (
          <p className="text-zinc-400 text-sm text-center py-6 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Ładowanie...
          </p>
        )}

        {streamFiles !== null && !streamFilesLoading && (() => {
          const orphans = streamFiles.filter(f => !f.db_video);
          const totalSize = streamFiles.reduce((s, f) => s + (f.sizeBytes || 0), 0);
          const selectedOrphans = streamFiles.filter(f => !f.db_video).map(f => f.video_id);
          const allSelected = streamFiles.length > 0 && selectedFiles.size === streamFiles.length;

          const fmtSize = (bytes) => {
            if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
            if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
            return (bytes / 1024).toFixed(0) + ' KB';
          };

          return (
            <>
              {/* Summary bar */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-zinc-500">
                <span><span className="font-bold text-zinc-800 dark:text-zinc-200">{streamFiles.length}</span> plików</span>
                <span><span className="font-bold text-zinc-800 dark:text-zinc-200">{fmtSize(totalSize)}</span> łącznie</span>
                {orphans.length > 0 && (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">{orphans.length} osierocone (brak w DB)</span>
                )}
                {selectedFiles.size > 0 && (
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">{selectedFiles.size} zaznaczonych</span>
                )}
              </div>

              {/* Bulk actions */}
              {streamFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  <button
                    onClick={() => setSelectedFiles(allSelected ? new Set() : new Set(streamFiles.map(f => f.video_id)))}
                    className="btn-ghost flex items-center gap-1.5"
                  >
                    {allSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                    {allSelected ? 'Odznacz wszystko' : 'Zaznacz wszystko'}
                  </button>
                  {orphans.length > 0 && (
                    <button
                      onClick={() => setSelectedFiles(new Set(selectedOrphans))}
                      className="px-3 py-1.5 text-xs bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-lg font-semibold transition-colors"
                    >
                      Zaznacz osierocone ({orphans.length})
                    </button>
                  )}
                  {selectedFiles.size > 0 && (
                    <button
                      onClick={() => deleteSelectedFiles([...selectedFiles])}
                      disabled={deletingFiles}
                      className="px-3 py-1.5 text-xs bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-700 dark:text-red-400 rounded-lg font-semibold transition-colors disabled:opacity-50"
                    >
                      {deletingFiles ? 'Usuwanie...' : `Usuń zaznaczone (${selectedFiles.size})`}
                    </button>
                  )}
                </div>
              )}

              {/* File list */}
              {streamFiles.length === 0 ? (
                <p className="text-zinc-400 text-sm text-center py-4">Brak plików na serwerze streamingu</p>
              ) : (
                <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
                  {streamFiles.map(f => {
                    const isOrphan = !f.db_video;
                    const isSelected = selectedFiles.has(f.video_id);
                    const statusColor = f.status === 'ready' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10'
                      : f.status === 'error' ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10'
                      : f.status === 'transcoding' ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10'
                      : 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800';

                    return (
                      <div
                        key={f.video_id}
                        onClick={() => setSelectedFiles(prev => {
                          const next = new Set(prev);
                          next.has(f.video_id) ? next.delete(f.video_id) : next.add(f.video_id);
                          return next;
                        })}
                        className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors select-none ${
                          isSelected ? 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border border-transparent'
                        }`}
                      >
                        {/* Checkbox */}
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-zinc-300 dark:border-zinc-600'}`}>
                          {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </div>

                        {/* Status badge */}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${statusColor}`}>
                          {f.status}
                        </span>

                        {/* Title / orphan badge */}
                        <div className="flex-1 min-w-0">
                          {f.db_video ? (
                            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate block">{f.db_video.title}</span>
                          ) : (
                            <span className="text-sm font-bold text-amber-600 dark:text-amber-400">Osierocony — brak w bazie</span>
                          )}
                          <span className="text-[10px] text-zinc-400 font-mono">{f.video_id}</span>
                        </div>

                        {/* Qualities */}
                        <div className="hidden sm:flex gap-1 shrink-0">
                          {(f.qualities || []).map(q => (
                            <span key={q} className="text-[10px] px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded font-mono">{q}</span>
                          ))}
                        </div>

                        {/* Size */}
                        <span className="text-xs text-zinc-500 font-mono shrink-0 w-16 text-right">{fmtSize(f.sizeBytes || 0)}</span>

                        {/* Delete button */}
                        <button
                          onClick={e => { e.stopPropagation(); deleteSelectedFiles([f.video_id]); }}
                          disabled={deletingFiles}
                          className="btn-icon-red shrink-0"
                          title="Usuń ten plik"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Streaming Cleanup — full width */}
      <div className="card p-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-violet-50 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center shrink-0">
            <Trash2 className="w-6 h-6 text-violet-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Czyszczenie streamingu</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Usuń osierocone, uszkodzone i zfailowane pliki transkodowania z serwera streaming.</p>
            <div className="flex flex-wrap gap-3 mb-3">
              <button
                onClick={async () => {
                  setCleanupLog(prev => [...prev, '🔍 Skanowanie serwera streaming...']);
                  try {
                    const data = await api.streamCleanupList();
                    const orphanCount = data.orphans?.length || 0;
                    const dbCount = data.dbOrphans?.length || 0;
                    setCleanupLog(prev => [
                      ...prev,
                      `📊 Znaleziono: ${orphanCount} osieroconych plików, ${dbCount} błędnych rekordów DB`,
                      ...(data.orphans || []).map(o => `  📁 ${o.video_id} — status: ${o.status}`),
                      ...(data.dbOrphans || []).map(o => `  🗃️ DB#${o.id}: ${o.title} (${o.stream_status})`),
                    ]);
                    if (orphanCount + dbCount === 0) {
                      setCleanupLog(prev => [...prev, '✅ Brak osieroconych plików — czysto!']);
                      return;
                    }
                    setCleanupLog(prev => [...prev, '🗑️ Usuwanie...']);
                    const result = await api.streamCleanupPurge({ clean_db: true });
                    setCleanupLog(prev => [
                      ...prev,
                      `✅ Usunięto ${result.deleted} plików ze streamingu`,
                      result.dbCleaned ? `✅ Wyczyszczono ${result.dbCleaned} rekordów z bazy danych` : null,
                      '🏁 Czyszczenie zakończone',
                    ].filter(Boolean));
                  } catch (e) {
                    setCleanupLog(prev => [...prev, `❌ Błąd: ${e.message}`]);
                  }
                }}
                className="btn-danger text-sm"
              >
                Skanuj i wyczyść
              </button>
              {cleanupLog.length > 0 && (
                <button onClick={() => setCleanupLog([])} className="btn-link-zinc">
                  Wyczyść logi
                </button>
              )}
            </div>
            {cleanupLog.length > 0 && (
              <div className="bg-zinc-950 dark:bg-zinc-950 rounded-xl p-4 font-mono text-xs max-h-[250px] overflow-y-auto space-y-1">
                {cleanupLog.map((line, i) => (
                  <div key={i} className={`${line.startsWith('❌') ? 'text-red-400' : line.startsWith('✅') ? 'text-emerald-400' : 'text-zinc-400'}`}>{line}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      </div>
      )}

      {/* ============ ADMINISTRACYJNE ============ */}
      {activeTab === 'admin' && (
      <div className="animate-fade-in">
      {/* Watch Party manager */}
      <div className="card p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-50 dark:bg-violet-500/10 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display">
                Aktywne Watch Parties ({watchParties.length})
              </h3>
              <p className="text-xs text-zinc-500">Party w pamięci serwera — usuwane automatycznie 30 min po opustoszeniu</p>
            </div>
          </div>
          <button
            onClick={loadWatchParties}
            disabled={wpLoading}
            className="btn-ghost flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${wpLoading ? 'animate-spin' : ''}`} />
            Odśwież
          </button>
        </div>

        {watchParties.length === 0 ? (
          <p className="text-zinc-400 text-sm text-center py-4">Brak aktywnych party</p>
        ) : (
          <div className="space-y-2">
            {watchParties.map(p => {
              const isEmpty = p.memberCount === 0;
              const emptyMins = p.emptyAt ? Math.floor((Date.now() - p.emptyAt) / 60000) : null;
              return (
                <div key={p.code} className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${isEmpty ? 'border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5' : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50'}`}>
                  {/* Code + status */}
                  <div className="shrink-0 text-center min-w-[72px]">
                    <span className="font-mono text-base font-bold text-violet-600 dark:text-violet-400 tracking-widest">{p.code}</span>
                    <div className="mt-0.5">
                      {isEmpty ? (
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                          puste {emptyMins != null ? `${emptyMins}m` : ''}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">aktywne</span>
                      )}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                      <span><span className="font-semibold text-zinc-800 dark:text-zinc-200">{p.memberCount}</span> uczestników</span>
                      <span><span className="font-semibold text-zinc-800 dark:text-zinc-200">{p.queueLength}</span> w kolejce</span>
                      {p.currentTitle && (
                        <span className="truncate max-w-[200px]">▶ <span className="font-semibold text-zinc-800 dark:text-zinc-200">{p.currentTitle}</span></span>
                      )}
                      {!isEmpty && (
                        <span>{p.playing ? '▶ gra' : '⏸ pauza'} @ {Math.floor(p.position / 60)}:{String(p.position % 60).padStart(2, '0')}</span>
                      )}
                    </div>
                    {p.members.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {p.members.map(m => (
                          <span key={m.id} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${m.canControl ? 'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'}`}>
                            {m.name}{m.canControl ? ' ★' : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-zinc-400">
                      ID: <span className="font-mono">{p.id}</span> · utworzono: {new Date(p.createdAt).toLocaleString('pl')}
                    </p>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={async () => {
                      if (!confirm(`Usunąć party ${p.code}? Wszyscy uczestnicy zostaną rozłączeni.`)) return;
                      await api.forceDeleteWatchParty(p.code).catch(() => {});
                      loadWatchParties();
                    }}
                    className="btn-icon-red shrink-0"
                    title="Usuń party"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create User */}
      <div className="card p-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center shrink-0">
            <UserPlus className="w-6 h-6 text-emerald-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Dodaj użytkownika</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              Utwórz konto ręcznie dla osoby, która jeszcze się nie zalogowała. Będzie widoczna jako autor filmów.
            </p>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label-field">Username</label>
                  <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} className="input-field !py-3 text-sm" placeholder="np. jan_kowalski" required />
                </div>
                <div>
                  <label className="label-field">Wyświetlana nazwa</label>
                  <input type="text" value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} className="input-field !py-3 text-sm" placeholder="np. Jan Kowalski" required />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label-field">Rola</label>
                  <div className="relative">
                    <select value={newRole} onChange={e => setNewRole(e.target.value)} className="input-field !py-3 text-sm appearance-none cursor-pointer">
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      <option value="dev">Dev</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="label-field">Discord ID (opcjonalnie)</label>
                  <input type="text" value={newDiscordId} onChange={e => setNewDiscordId(e.target.value)} className="input-field !py-3 text-sm font-mono" placeholder="np. 248804732787884033" />
                </div>
              </div>
              <div>
                <label className="label-field">Avatar URL (opcjonalnie)</label>
                <input type="text" value={newAvatar} onChange={e => setNewAvatar(e.target.value)} className="input-field !py-3 text-sm" placeholder="https://cdn.discordapp.com/avatars/..." />
              </div>
              <button type="submit" disabled={creatingUser} className="btn-primary text-sm">
                {creatingUser ? 'Tworzenie...' : 'Utwórz użytkownika'}
              </button>
            </form>
          </div>
        </div>
      </div>

      </div>
      )}

      {/* ============ KATEGORIE ============ */}
      {activeTab === 'categories' && (
      <div className="animate-fade-in grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
      {/* Access Checker */}
      <div className="card p-6 xl:col-span-2">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display">Sprawdź uprawnienia</h3>
            <p className="text-xs text-zinc-500">Lista użytkowników z dostępem do wybranej kategorii lub filmu i powód dostępu</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 shrink-0">
            {['category', 'video'].map(m => (
              <button key={m} type="button"
                onClick={() => { setAccessMode(m); setAccessSelectedId(''); setAccessResult(null); }}
                className={`px-4 py-2 text-xs font-bold transition-colors ${accessMode === m ? 'bg-blue-500 text-white' : 'bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}>
                {m === 'category' ? 'Kategoria' : 'Film'}
              </button>
            ))}
          </div>
          <select
            value={accessSelectedId}
            onChange={e => { setAccessSelectedId(e.target.value); setAccessResult(null); }}
            className="input-field !py-2 text-sm flex-1 min-w-[200px]"
          >
            <option value="">Wybierz {accessMode === 'category' ? 'kategorię' : 'film'}...</option>
            {accessMode === 'category'
              ? accessCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
              : accessVideos.map(v => <option key={v.id} value={v.id}>{v.title}</option>)
            }
          </select>
          <button
            onClick={checkAccess}
            disabled={!accessSelectedId || accessLoading}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-40 shrink-0"
          >
            {accessLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sprawdź'}
          </button>
        </div>

        {accessResult?.error && (
          <div className="p-3 bg-red-50 dark:bg-red-500/10 rounded-xl text-sm text-red-600 dark:text-red-400">{accessResult.error}</div>
        )}

        {accessResult && !accessResult.error && (() => {
          const withAccess = accessResult.users.filter(u => u.has_access);
          const withoutAccess = accessResult.users.filter(u => !u.has_access);
          return (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-xl font-semibold text-zinc-600 dark:text-zinc-400">
                  {accessResult.type === 'category' ? accessResult.name : accessResult.title}
                </span>
                {accessResult.access_mode === 'custom' && (
                  <span className="px-3 py-1.5 bg-blue-50 dark:bg-blue-500/10 rounded-xl font-bold text-blue-600 dark:text-blue-400">Dostęp niestandardowy</span>
                )}
                {accessResult.is_public && (
                  <span className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl font-bold text-emerald-600 dark:text-emerald-400">Publiczna</span>
                )}
                {!accessResult.is_public && accessResult.viewer_roles?.length > 0 && (
                  <span className="px-3 py-1.5 bg-amber-50 dark:bg-amber-500/10 rounded-xl font-semibold text-amber-700 dark:text-amber-400">
                    {accessResult.viewer_roles.length} rola/e widza · {accessResult.editor_roles?.length || 0} edytora
                  </span>
                )}
                {accessResult.category_name && (
                  <span className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-zinc-500">Kat: {accessResult.category_name}</span>
                )}
                <span className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl font-bold text-emerald-600 dark:text-emerald-400">{withAccess.length} ma dostęp</span>
                <span className="px-3 py-1.5 bg-red-50 dark:bg-red-500/10 rounded-xl font-bold text-red-500">{withoutAccess.length} bez dostępu</span>
              </div>

              {/* User table */}
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="max-h-[500px] overflow-y-auto">
                  {[...withAccess, ...withoutAccess].map(u => {
                    const { text, color } = reasonLabel(u.reason, accessResult.viewer_roles, accessResult.editor_roles);
                    return (
                      <div key={u.id} className={`flex items-center gap-3 px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 ${u.has_access ? '' : 'opacity-50'}`}>
                        {u.avatar
                          ? <img src={u.avatar} alt="" className="w-7 h-7 rounded-full shrink-0 object-cover" />
                          : <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 shrink-0 flex items-center justify-center text-[10px] font-bold text-zinc-500">{(u.display_name || u.username || '?')[0].toUpperCase()}</div>
                        }
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-zinc-900 dark:text-white">{u.display_name || u.username}</span>
                          <span className="text-[10px] text-zinc-400 ml-1.5 font-mono">@{u.username}</span>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${u.role === 'dev' ? 'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300' : u.role === 'admin' ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>{u.role}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${u.has_access ? 'bg-emerald-500' : 'bg-red-400'}`} />
                          <span className={`text-xs font-medium ${color}`}>{text}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Access reasons legend */}
      <div className="card p-6 xl:col-span-1">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-violet-50 dark:bg-violet-500/10 rounded-xl flex items-center justify-center">
            <Lock className="w-5 h-5 text-violet-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display">Powody dostępu</h3>
            <p className="text-xs text-zinc-500">Co oznaczają etykiety w wynikach</p>
          </div>
        </div>
        <div className="space-y-3">
          {[
            { color: 'bg-violet-500', label: 'Administrator / Developer', desc: 'Pełny dostęp z racji roli systemowej' },
            { color: 'bg-emerald-500', label: 'Kategoria / film publiczny', desc: 'Brak ograniczeń dostępu' },
            { color: 'bg-blue-500', label: 'Dostęp niestandardowy', desc: 'Użytkownik na ręcznie ustawionej liście' },
            { color: 'bg-emerald-500', label: 'Rola widza / edytora', desc: 'Dopasowana rola Discord lub ranga' },
            { color: 'bg-red-400', label: 'Brak wymaganej roli', desc: 'Użytkownik nie ma dostępu' },
          ].map((r, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${r.color}`} />
              <div>
                <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{r.label}</p>
                <p className="text-[11px] text-zinc-400">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      </div>
      )}

      {/* ============ USTAWIENIA ============ */}
      {activeTab === 'settings' && (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 animate-fade-in">
        {/* Content length limits */}
        <div className="card p-8 h-full flex flex-col xl:col-span-2">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-violet-50 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <Settings className="w-6 h-6 text-violet-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Limity treści</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                Maksymalna długość pól (w znakach). Egzekwowane po stronie serwera.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
                <div>
                  <label className="label-field">Nazwa wyświetlana</label>
                  <input type="number" min="1" max="100000" value={limitForm.limit_display_name}
                    onChange={e => setLimitForm(f => ({ ...f, limit_display_name: e.target.value }))}
                    className="input-field !py-3 text-sm" />
                </div>
                <div>
                  <label className="label-field">Bio</label>
                  <input type="number" min="1" max="100000" value={limitForm.limit_bio}
                    onChange={e => setLimitForm(f => ({ ...f, limit_bio: e.target.value }))}
                    className="input-field !py-3 text-sm" />
                </div>
                <div>
                  <label className="label-field">Komentarz</label>
                  <input type="number" min="1" max="100000" value={limitForm.limit_comment}
                    onChange={e => setLimitForm(f => ({ ...f, limit_comment: e.target.value }))}
                    className="input-field !py-3 text-sm" />
                </div>
              </div>
              <button onClick={saveLimits} disabled={savingSettings || settings == null} className="btn-primary text-sm mt-4">
                {savingSettings ? 'Zapisywanie...' : 'Zapisz limity'}
              </button>
            </div>
          </div>
        </div>

        {/* Webhook domain restriction */}
        <div className="card p-8 h-full flex flex-col">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-blue-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Ograniczenie domen webhooków</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                Gdy włączone, serwer wysyła powiadomienia tylko do domen Discord
                ({settings?.webhook_allowed_hosts?.join(', ') || 'discord.com, discordapp.com'}).
                Chroni przed SSRF — wskazaniem webhooka na adres wewnętrzny.
              </p>
              <button
                type="button"
                onClick={toggleWebhookRestriction}
                disabled={!settings || savingSettings}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm font-semibold text-zinc-700 dark:text-zinc-300 disabled:opacity-50"
              >
                {settings?.webhook_domain_restriction
                  ? <CheckSquare className="w-5 h-5 text-emerald-500" />
                  : <Square className="w-5 h-5 text-zinc-400" />}
                {settings == null ? 'Ładowanie...' : (settings.webhook_domain_restriction ? 'Ograniczenie domen: WŁĄCZONE' : 'Ograniczenie domen: WYŁĄCZONE')}
              </button>
            </div>
          </div>
        </div>

        {/* TS3 login code delivery */}
        <div className="card p-8 h-full flex flex-col">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-violet-50 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-violet-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Wysyłka kodu logowania (TS3)</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                Jak bot ServerQuery dostarcza 6-znakowy kod logowania na TeamSpeak 3.
              </p>
              <div className="flex rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 w-full max-w-xs">
                {[['pm', 'Wiadomość'], ['poke', 'Poke'], ['both', 'Oba']].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setTs3Delivery(val)}
                    disabled={!settings || savingSettings}
                    className={`flex-1 px-3 py-2.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                      settings?.ts3_code_delivery === val
                        ? 'bg-violet-500 text-white'
                        : 'bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      )}

      {/* ============ DEBUG ============ */}
      {activeTab === 'debug' && (
      <div className="animate-fade-in">
      {/* Database stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div className="card p-5 text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{dbSize ? formatBytes(dbSize.sizeBytes) : '—'}</p>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">Rozmiar bazy</p>
        </div>
        <div className="card p-5 text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{dbSize ? formatBytes(dbSize.mainBytes ?? 0) : '—'}</p>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">Plik główny</p>
        </div>
        <div className="card p-5 text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{dbSize?.rowCount?.toLocaleString('pl') ?? '—'}</p>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">Rekordów</p>
        </div>
        <div className="card p-5 text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{dbSize?.tableCount ?? '—'}</p>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">Tabel</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Export */}
        <div className="card p-8 h-full flex flex-col">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-violet-50 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <Download className="w-6 h-6 text-violet-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Eksportuj bazę danych</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Pobierz plik JSON ze wszystkimi danymi platformy (wszystkie tabele oprócz sesji logowania).</p>
              <button onClick={handleExport} disabled={loading} className="btn-primary text-sm">
                {loading ? 'Eksportowanie...' : 'Eksportuj JSON'}
              </button>
            </div>
          </div>
        </div>

        {/* Import */}
        <div className="card p-8 h-full flex flex-col">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-50 dark:bg-amber-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <Upload className="w-6 h-6 text-amber-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Importuj bazę danych</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">Zastąp wszystkie dane w bazie danymi z pliku JSON.</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mb-4 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Obecne dane zostaną nadpisane!
              </p>
              <label className="btn-secondary text-sm inline-flex items-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4" /> Wybierz plik JSON
                <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        {/* Clear Logs */}
        <div className="card p-8 h-full flex flex-col">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-orange-50 dark:bg-orange-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <Trash2 className="w-6 h-6 text-orange-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Czyszczenie logów</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Usuń poszczególne typy logów bez wpływu na resztę bazy danych.</p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={async () => {
                    if (!confirm('Wyczyścić logi wyświetleń filmów?')) return;
                    try {
                      const r = await api.clearWatchLogs();
                      setStatus({ type: 'success', msg: `Usunięto ${r.deleted} logów wyświetleń.` });
                    } catch (e) { setStatus({ type: 'error', msg: e.message }); }
                  }}
                  className="btn-secondary text-sm"
                >
                  Wyczyść logi wyświetleń
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('Wyczyścić logi logowania?')) return;
                    try {
                      const r = await api.clearLoginLogs();
                      setStatus({ type: 'success', msg: `Usunięto ${r.deleted} logów logowania.` });
                    } catch (e) { setStatus({ type: 'error', msg: e.message }); }
                  }}
                  className="btn-secondary text-sm"
                >
                  Wyczyść logi logowania
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('Wyczyścić logi audytu?')) return;
                    try {
                      const r = await api.clearAuditLogs();
                      setStatus({ type: 'success', msg: `Usunięto ${r.deleted} logów audytu.` });
                    } catch (e) { setStatus({ type: 'error', msg: e.message }); }
                  }}
                  className="btn-secondary text-sm"
                >
                  Wyczyść logi audytu
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('Wyczyścić logi watch party?')) return;
                    try {
                      const r = await api.clearWatchPartyLogs();
                      setStatus({ type: 'success', msg: `Usunięto ${r.deleted} logów watch party.` });
                    } catch (e) { setStatus({ type: 'error', msg: e.message }); }
                  }}
                  className="btn-secondary text-sm"
                >
                  Wyczyść logi watch party
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Clear DB */}
        <div className="card p-8 h-full flex flex-col border-red-200 dark:border-red-500/20">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-red-50 dark:bg-red-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Wyczyść bazę danych</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">Usuń wszystkie filmy, tagi i logi. Użytkownicy zostaną zachowani.</p>
              <p className="text-xs text-red-600 dark:text-red-400 font-bold mb-4 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Ta operacja jest nieodwracalna!
              </p>
              <button onClick={() => { setClearDbText(''); setClearDbOpen(true); }} disabled={loading} className="btn-danger text-sm">
                Wyczyść wszystko
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SQL Executor — full width below the grid */}
      <div className="card p-8 mt-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-violet-50 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <Terminal className="w-6 h-6 text-violet-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Konsola SQL</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Wykonaj polecenie SQL bezpośrednio na bazie SQLite.</p>
              <div className="space-y-3">
                <textarea
                  value={sqlQuery}
                  onChange={e => setSqlQuery(e.target.value)}
                  placeholder="SELECT * FROM users LIMIT 10;"
                  className="input-field font-mono text-sm resize-none h-28"
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleRunSQL(); }}}
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleRunSQL}
                    disabled={sqlRunning || !sqlQuery.trim()}
                    className="btn-primary text-sm flex items-center gap-2"
                  >
                    <Play className="w-4 h-4" /> {sqlRunning ? 'Wykonywanie...' : 'Wykonaj'} <span className="text-xs opacity-60">(Ctrl+Enter)</span>
                  </button>
                  <div className="flex gap-1">
                    {['SELECT * FROM users', 'SELECT * FROM videos', 'SELECT * FROM tags', 'PRAGMA table_list'].map(q => (
                      <button key={q} onClick={() => setSqlQuery(q)} className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-lg text-[10px] font-mono hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                        {q.length > 22 ? q.slice(0, 22) + '…' : q}
                      </button>
                    ))}
                  </div>
                </div>

                {sqlResult && (
                  <div className="mt-4">
                    {!sqlResult.success ? (
                      <div className="p-3 bg-red-50 dark:bg-red-500/10 rounded-xl text-sm text-red-700 dark:text-red-300 font-mono">
                        Błąd: {sqlResult.error}
                      </div>
                    ) : sqlResult.type === 'statement' ? (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl text-sm text-emerald-700 dark:text-emerald-300 font-mono">
                        OK — {sqlResult.changes} zmian{sqlResult.changes !== 1 ? '' : 'a'}{sqlResult.lastInsertRowid ? `, lastInsertRowid: ${sqlResult.lastInsertRowid}` : ''}
                      </div>
                    ) : (
                      <div className="bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                          {sqlResult.count} wyników
                        </div>
                        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                          <table className="w-full text-xs font-mono">
                            <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-900">
                              <tr>
                                {sqlResult.columns.map(col => (
                                  <th key={col} className="text-left px-3 py-2 font-bold text-zinc-600 dark:text-zinc-400 whitespace-nowrap border-b border-zinc-200 dark:border-zinc-800">{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sqlResult.rows.map((row, i) => (
                                <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800/30">
                                  {sqlResult.columns.map(col => (
                                    <td key={col} className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300 whitespace-nowrap max-w-[300px] truncate">
                                      {row[col] === null ? <span className="text-zinc-400 italic">NULL</span> : String(row[col])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
      )}

      {/* Clear DB confirmation modal */}
      {clearDbOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => { if (!loading) { setClearDbOpen(false); setClearDbText(''); } }}
        >
          <div className="card w-full max-w-md p-6 border-red-300 dark:border-red-500/30" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-50 dark:bg-red-500/10 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display">Wyczyść bazę danych</h3>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
              Ta operacja usunie wszystkie filmy, tagi i logi i jest <strong className="text-red-600 dark:text-red-400">nieodwracalna</strong>.
              Aby potwierdzić, wpisz poniżej dokładnie <span className="font-mono font-bold text-red-600 dark:text-red-400">{CLEAR_DB_PHRASE}</span>.
            </p>
            <input
              type="text"
              value={clearDbText}
              onChange={e => setClearDbText(e.target.value)}
              placeholder={CLEAR_DB_PHRASE}
              autoFocus
              className="input-field !py-3 text-sm mb-4"
              onKeyDown={e => { if (e.key === 'Enter' && clearDbText === CLEAR_DB_PHRASE) performClear(); }}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setClearDbOpen(false); setClearDbText(''); }}
                disabled={loading}
                className="btn-secondary text-sm"
              >
                Anuluj
              </button>
              <button
                onClick={performClear}
                disabled={loading || clearDbText !== CLEAR_DB_PHRASE}
                className="btn-danger text-sm"
              >
                {loading ? 'Czyszczenie...' : 'Wyczyść wszystko'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
