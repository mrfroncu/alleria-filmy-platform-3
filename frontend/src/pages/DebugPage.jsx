import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Upload, Trash2, AlertTriangle, UserPlus, ChevronDown, Terminal, Play, BarChart3, Loader2, Users, RefreshCw, HardDrive, CheckSquare, Square, ShieldCheck, Wrench, Settings, Bug, Lock, LayoutGrid, FileText, Frame, PanelTop, X, LogIn, Bot, Headphones, Radio, MessageSquare, Info } from 'lucide-react';
import { api } from '../utils/api';
import { useSettings } from '../contexts/SettingsContext';

// Dev Tools tabs — selected at the top of the page
const TABS = [
  { id: 'streaming', label: 'Streaming', icon: HardDrive },
  { id: 'admin', label: 'Administracyjne', icon: Users },
  { id: 'categories', label: 'Kategorie', icon: ShieldCheck },
  { id: 'gdpr', label: 'RODO', icon: Lock },
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

// Standard on/off slider switch — used for the boolean settings toggles in the Ustawienia tab.
function ToggleSwitch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className="inline-flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${checked ? 'bg-violet-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </span>
      <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>
    </button>
  );
}

const TAB_IDS = TABS.map(t => t.id);

export default function DebugPage() {
  const { config } = useSettings();
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

  const checkAccess = async (idOverride) => {
    const id = idOverride || accessSelectedId;
    if (!id) return;
    setAccessLoading(true);
    setAccessResult(null);
    try {
      const data = await api.debugAccess(accessMode, id);
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

  // GDPR / RODO admin review
  const [gdprRequests, setGdprRequests] = useState([]);
  const [gdprLoading, setGdprLoading] = useState(false);
  const [gdprBusy, setGdprBusy] = useState(null); // request id currently being acted on
  const [replacingId, setReplacingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const gdprFileRef = useRef(null);
  const [limitForm, setLimitForm] = useState({ limit_display_name: '', limit_bio: '', limit_comment: '' });
  const [displayForm, setDisplayForm] = useState({ videos_per_page: '', grid_columns: '', grid_card_min_width: '' });
  const [logsForm, setLogsForm] = useState({ logs_per_page: '' });
  const [originsForm, setOriginsForm] = useState([]);
  const [originInput, setOriginInput] = useState('');
  const [envCheck, setEnvCheck] = useState(null);
  const [ts6Form, setTs6Form] = useState({ host: '', port: '', username: '', password: '', api_key: '', server_id: '', member_group_id: '', admin_group_id: '' });
  const [ts3Form, setTs3Form] = useState({ host: '', port: '', username: '', password: '', server_id: '', member_group_id: '', admin_group_id: '' });
  const [botNickname, setBotNickname] = useState('');
  const [discordRolesForm, setDiscordRolesForm] = useState({ member_role_id: '', admin_role_id: '' });
  const [categoryRoleOverview, setCategoryRoleOverview] = useState([]);

  useEffect(() => {
    api.getSettings().then(s => {
      setSettingsState(s);
      setLimitForm({
        limit_display_name: s.limit_display_name,
        limit_bio: s.limit_bio,
        limit_comment: s.limit_comment,
      });
      setDisplayForm({ videos_per_page: s.videos_per_page, grid_columns: s.grid_columns, grid_card_min_width: s.grid_card_min_width });
      setLogsForm({ logs_per_page: s.logs_per_page });
      setOriginsForm(s.iframe_allowed_origins || []);
      setTs6Form({
        host: s.ts6_host || '', port: s.ts6_port || '', username: s.ts6_username || '', password: s.ts6_password || '',
        api_key: s.ts6_api_key || '', server_id: s.ts6_server_id || '', member_group_id: s.ts6_member_group_id || '', admin_group_id: s.ts6_admin_group_id || '',
      });
      setTs3Form({
        host: s.ts3_host || '', port: s.ts3_port || '', username: s.ts3_username || '', password: s.ts3_password || '',
        server_id: s.ts3_server_id || '', member_group_id: s.ts3_member_group_id || '', admin_group_id: s.ts3_admin_group_id || '',
      });
      setBotNickname(s.ts_bot_nickname || '');
      setDiscordRolesForm({ member_role_id: s.discord_member_role_id || '', admin_role_id: s.discord_admin_role_id || '' });
    }).catch(() => {});
    api.envCheck().then(setEnvCheck).catch(() => {});
    api.categoryRoleOverview().then(setCategoryRoleOverview).catch(() => {});
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

  const setGdprRegion = async (value) => {
    if (!settings || settings.gdpr_region === value) return;
    setSavingSettings(true);
    try {
      const r = await api.setSettings({ gdpr_region: value });
      setSettingsState(s => ({ ...s, gdpr_region: r.gdpr_region }));
      const label = value === 'off' ? 'wyłączone' : value === 'eu' ? 'UE' : 'Brazylia';
      setStatus({ type: 'success', msg: `Region RODO: ${label}` });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingSettings(false);
  };

  const loadGdprAdmin = () => {
    setGdprLoading(true);
    api.adminGetGdprRequests().then(setGdprRequests).catch(() => {}).finally(() => setGdprLoading(false));
  };
  useEffect(() => { if (activeTab === 'gdpr') loadGdprAdmin(); }, [activeTab]);

  const handleGdprDownloadFile = async (r) => {
    try {
      const data = await api.adminDownloadGdprFile(r.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.export_file || `export_${r.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatus({ type: 'error', msg: 'Błąd: ' + err.message });
    }
  };

  const triggerReplace = (id) => {
    setReplacingId(id);
    gdprFileRef.current?.click();
  };

  const handleGdprFileSelected = async (e) => {
    const file = e.target.files?.[0];
    const id = replacingId;
    if (!file || !id) return;
    setGdprBusy(id);
    try {
      await api.adminReplaceGdprFile(id, file);
      setStatus({ type: 'success', msg: 'Plik podmieniony.' });
      loadGdprAdmin();
    } catch (err) {
      setStatus({ type: 'error', msg: 'Błąd: ' + err.message });
    }
    setGdprBusy(null);
    setReplacingId(null);
    e.target.value = '';
  };

  const handleGdprApprove = async (id) => {
    if (!confirm('Zatwierdzić to zgłoszenie? Dla usunięcia konta oznacza to natychmiastową anonimizację i wylogowanie użytkownika.')) return;
    setGdprBusy(id);
    try {
      await api.adminApproveGdpr(id);
      setStatus({ type: 'success', msg: 'Zgłoszenie zatwierdzone.' });
      loadGdprAdmin();
    } catch (err) {
      setStatus({ type: 'error', msg: 'Błąd: ' + err.message });
    }
    setGdprBusy(null);
  };

  const handleGdprReject = async (id) => {
    setGdprBusy(id);
    try {
      await api.adminRejectGdpr(id, rejectReason);
      setStatus({ type: 'success', msg: 'Zgłoszenie odrzucone.' });
      setRejectingId(null);
      setRejectReason('');
      loadGdprAdmin();
    } catch (err) {
      setStatus({ type: 'error', msg: 'Błąd: ' + err.message });
    }
    setGdprBusy(null);
  };

  const gdprDaysLeft = (dueAt) => Math.ceil((new Date(dueAt) - new Date()) / 86400000);

  const saveDisplaySettings = async () => {
    setSavingSettings(true);
    try {
      const r = await api.setSettings({
        videos_per_page: parseInt(displayForm.videos_per_page, 10),
        grid_columns: parseInt(displayForm.grid_columns, 10),
        grid_card_min_width: parseInt(displayForm.grid_card_min_width, 10),
      });
      setSettingsState(r);
      setDisplayForm({ videos_per_page: r.videos_per_page, grid_columns: r.grid_columns, grid_card_min_width: r.grid_card_min_width });
      setStatus({ type: 'success', msg: 'Ustawienia wyświetlania filmów zapisane.' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingSettings(false);
  };

  const saveLogsSettings = async () => {
    setSavingSettings(true);
    try {
      const r = await api.setSettings({ logs_per_page: parseInt(logsForm.logs_per_page, 10) });
      setSettingsState(r);
      setLogsForm({ logs_per_page: r.logs_per_page });
      setStatus({ type: 'success', msg: 'Ustawienia logów zapisane.' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingSettings(false);
  };

  const toggleIframeEmbed = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const r = await api.setSettings({ iframe_embed_enabled: !settings.iframe_embed_enabled });
      setSettingsState(s => ({ ...s, iframe_embed_enabled: r.iframe_embed_enabled }));
      setStatus({ type: 'success', msg: `Osadzanie w iframe: ${r.iframe_embed_enabled ? 'WŁĄCZONE' : 'WYŁĄCZONE'}` });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingSettings(false);
  };

  const addOrigin = () => {
    const val = originInput.trim();
    if (!val) return;
    if (!/^https?:\/\/[^;\s,]+$/.test(val)) {
      setStatus({ type: 'error', msg: 'Nieprawidłowy format — oczekiwano np. https://alleria.pl' });
      return;
    }
    if (originsForm.includes(val)) { setOriginInput(''); return; }
    setOriginsForm(prev => [...prev, val]);
    setOriginInput('');
  };

  const removeOrigin = (origin) => setOriginsForm(prev => prev.filter(o => o !== origin));

  const saveOrigins = async () => {
    setSavingSettings(true);
    try {
      const r = await api.setSettings({ iframe_allowed_origins: originsForm });
      setSettingsState(s => ({ ...s, iframe_allowed_origins: r.iframe_allowed_origins }));
      setOriginsForm(r.iframe_allowed_origins || []);
      setStatus({ type: 'success', msg: 'Dozwolone domeny iframe zapisane.' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingSettings(false);
  };

  const toggleYoutubePlayer = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const r = await api.setSettings({ youtube_custom_player: !settings.youtube_custom_player });
      setSettingsState(s => ({ ...s, youtube_custom_player: r.youtube_custom_player }));
      setStatus({ type: 'success', msg: `Własny odtwarzacz YouTube: ${r.youtube_custom_player ? 'WŁĄCZONY' : 'WYŁĄCZONY'}` });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingSettings(false);
  };

  const toggleTopBar = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const r = await api.setSettings({ show_top_bar: !settings.show_top_bar });
      setSettingsState(s => ({ ...s, show_top_bar: r.show_top_bar }));
      setStatus({ type: 'success', msg: `Górny pasek: ${r.show_top_bar ? 'WŁĄCZONY' : 'WYŁĄCZONY'}` });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingSettings(false);
  };

  const saveBotNickname = async () => {
    setSavingSettings(true);
    try {
      const r = await api.setSettings({ ts_bot_nickname: botNickname });
      setSettingsState(s => ({ ...s, ts_bot_nickname: r.ts_bot_nickname }));
      setBotNickname(r.ts_bot_nickname || '');
      setStatus({ type: 'success', msg: 'Nazwa bota ServerQuery zapisana.' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingSettings(false);
  };

  const saveTs6Settings = async () => {
    setSavingSettings(true);
    try {
      const r = await api.setSettings({
        ts6_host: ts6Form.host, ts6_port: ts6Form.port, ts6_username: ts6Form.username, ts6_password: ts6Form.password,
        ts6_api_key: ts6Form.api_key, ts6_server_id: ts6Form.server_id, ts6_member_group_id: ts6Form.member_group_id, ts6_admin_group_id: ts6Form.admin_group_id,
      });
      setSettingsState(s => ({ ...s, ...r }));
      setTs6Form({
        host: r.ts6_host || '', port: r.ts6_port || '', username: r.ts6_username || '', password: r.ts6_password || '',
        api_key: r.ts6_api_key || '', server_id: r.ts6_server_id || '', member_group_id: r.ts6_member_group_id || '', admin_group_id: r.ts6_admin_group_id || '',
      });
      setStatus({ type: 'success', msg: 'Ustawienia TeamSpeak 6 zapisane.' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingSettings(false);
  };

  const saveTs3Settings = async () => {
    setSavingSettings(true);
    try {
      const r = await api.setSettings({
        ts3_host: ts3Form.host, ts3_port: ts3Form.port, ts3_username: ts3Form.username, ts3_password: ts3Form.password,
        ts3_server_id: ts3Form.server_id, ts3_member_group_id: ts3Form.member_group_id, ts3_admin_group_id: ts3Form.admin_group_id,
      });
      setSettingsState(s => ({ ...s, ...r }));
      setTs3Form({
        host: r.ts3_host || '', port: r.ts3_port || '', username: r.ts3_username || '', password: r.ts3_password || '',
        server_id: r.ts3_server_id || '', member_group_id: r.ts3_member_group_id || '', admin_group_id: r.ts3_admin_group_id || '',
      });
      setStatus({ type: 'success', msg: 'Ustawienia TeamSpeak 3 zapisane.' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingSettings(false);
  };

  const saveDiscordRoles = async () => {
    setSavingSettings(true);
    try {
      const r = await api.setSettings({
        discord_member_role_id: discordRolesForm.member_role_id,
        discord_admin_role_id: discordRolesForm.admin_role_id,
      });
      setSettingsState(s => ({ ...s, ...r }));
      setDiscordRolesForm({ member_role_id: r.discord_member_role_id || '', admin_role_id: r.discord_admin_role_id || '' });
      setStatus({ type: 'success', msg: 'Role Discord zapisane.' });
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

  const tsLocked = settings?.ts_config_source !== 'panel';
  const discordRolesLocked = settings?.discord_roles_config_source !== 'panel';
  const sourceBadgeClass = (locked) => `text-[10px] font-bold px-2 py-0.5 rounded-lg ${locked ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500' : 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'}`;

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto animate-fade-in">
      <div className="mb-8">
        {!config.showTopBar && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-red-50 dark:bg-red-500/10 rounded-xl flex items-center justify-center">
              <Wrench className="w-5 h-5 text-red-500" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Dev Tools</h1>
          </div>
        )}
        <p className="text-zinc-500 dark:text-zinc-400">Narzędzia deweloperskie do zarządzania platformą.</p>
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
          const fmtBitrate = (bps) => {
            if (!bps) return '—';
            return bps >= 1000000 ? `${(bps / 1000000).toFixed(1)} Mbps` : `${Math.round(bps / 1000)} kbps`;
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

                        {/* Qualities — bitrate/fps shown when available (videos transcoded before
                            this was added only have plain quality names, no per-quality detail) */}
                        <div className="hidden sm:flex flex-wrap gap-1 shrink-0 max-w-[320px] justify-end">
                          {f.qualityDetails?.length > 0 ? (
                            f.qualityDetails.map(q => (
                              <span key={q.name}
                                className="text-[10px] px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded font-mono whitespace-nowrap"
                                title={`${q.width}×${q.height} @ ${q.fps} kl/s`}>
                                {q.name}{q.fps >= 50 ? Math.round(q.fps) : ''} · {fmtBitrate(q.bitrate)}
                              </span>
                            ))
                          ) : (
                            (f.qualities || []).map(q => (
                              <span key={q} className="text-[10px] px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded font-mono">{q}</span>
                            ))
                          )}
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
            onClick={() => checkAccess()}
            disabled={!accessSelectedId || accessLoading}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-40 shrink-0"
          >
            {accessLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sprawdź'}
          </button>
        </div>

        {accessMode === 'video' && (() => {
          const customVideos = accessVideos.filter(v => v.access_mode === 'custom');
          return (
            <div className="mb-4">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2 font-display">
                Filmy z niestandardowymi uprawnieniami ({customVideos.length})
              </p>
              {customVideos.length === 0 ? (
                <p className="text-xs text-zinc-400 italic">Brak filmów z uprawnieniami niezależnymi od kategorii.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {customVideos.map(v => (
                    <button key={v.id} type="button"
                      onClick={() => { setAccessSelectedId(String(v.id)); checkAccess(v.id); }}
                      className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${accessSelectedId === String(v.id) ? 'bg-blue-500 text-white border-blue-500' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-blue-400'}`}>
                      {v.title}{v.category_name ? ` · ${v.category_name}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

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

      {/* ============ RODO ============ */}
      {activeTab === 'gdpr' && (
      <div className="animate-fade-in">
        <input ref={gdprFileRef} type="file" accept="application/json" className="hidden" onChange={handleGdprFileSelected} />
        <div className="card p-6">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-1">Zgłoszenia RODO / LGPD</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">
            Eksport danych: pobierz i sprawdź wygenerowany plik (ewentualnie podmień), a następnie zatwierdź — wtedy staje się dostępny do pobrania w profilu użytkownika.
            Usunięcie konta: zatwierdzenie od razu anonimizuje konto i wylogowuje użytkownika.
          </p>

          {gdprLoading ? (
            <div className="h-24 skeleton rounded-2xl" />
          ) : gdprRequests.length === 0 ? (
            <p className="text-zinc-400 text-sm text-center py-8">Brak zgłoszeń.</p>
          ) : (
            <div className="space-y-2.5">
              {gdprRequests.map(r => {
                const daysLeft = gdprDaysLeft(r.due_at);
                const busy = gdprBusy === r.id;
                return (
                  <div key={r.id} className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="font-bold text-zinc-900 dark:text-white">{r.display_name || r.username}</span>
                      <span className="text-zinc-400 font-mono">@{r.username}</span>
                      <span className="px-2 py-0.5 rounded-lg font-bold bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300">
                        {r.type === 'export' ? 'Eksport danych' : 'Usunięcie konta'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-lg font-bold ${
                        r.status === 'pending' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : r.status === 'approved' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300'
                      }`}>
                        {r.status === 'pending' ? 'Oczekujące' : r.status === 'approved' ? 'Zatwierdzone' : 'Odrzucone'}
                      </span>
                      {r.status === 'pending' && (
                        <span className={`font-mono ${daysLeft <= 3 ? 'text-red-500' : daysLeft <= 10 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'}`}>
                          {daysLeft > 0 ? `${daysLeft} dni do ustawowego terminu` : 'termin minął'}
                        </span>
                      )}
                      {r.anonymized_original_display_name && (
                        <span className="text-zinc-400 italic">
                          było: {r.anonymized_original_display_name} (@{r.anonymized_original_username})
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-2">
                        {r.type === 'export' && r.export_file && (
                          <button onClick={() => handleGdprDownloadFile(r)} className="btn-link-violet text-xs font-bold">Pobierz plik</button>
                        )}
                        {r.type === 'export' && r.status === 'pending' && (
                          <button onClick={() => triggerReplace(r.id)} disabled={busy} className="btn-link-zinc text-xs font-bold disabled:opacity-50">Podmień plik</button>
                        )}
                        {r.status === 'pending' && (
                          <>
                            <button onClick={() => handleGdprApprove(r.id)} disabled={busy} className="btn-sm-primary disabled:opacity-50">Zatwierdź</button>
                            <button onClick={() => { setRejectingId(rejectingId === r.id ? null : r.id); setRejectReason(''); }} disabled={busy} className="btn-sm-secondary disabled:opacity-50">Odrzuć</button>
                          </>
                        )}
                      </div>
                    </div>
                    {rejectingId === r.id && (
                      <div className="flex items-center gap-2 mt-3">
                        <input
                          type="text"
                          value={rejectReason}
                          onChange={e => setRejectReason(e.target.value)}
                          placeholder="Powód odrzucenia (opcjonalnie)..."
                          className="input-field !py-2 text-sm flex-1"
                        />
                        <button onClick={() => handleGdprReject(r.id)} disabled={busy} className="btn-sm-primary shrink-0 disabled:opacity-50">Potwierdź odrzucenie</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}

      {/* ============ USTAWIENIA ============ */}
      {activeTab === 'settings' && (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 animate-fade-in">
        {/* .env sanity check warning */}
        {envCheck && (envCheck.deprecated?.length > 0 || envCheck.suspicious?.length > 0) && (
          <div className="card p-8 h-full flex flex-col xl:col-span-2 !border-amber-300 dark:!border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/[0.06]">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-amber-100 dark:bg-amber-500/10 rounded-2xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Uwagi dotyczące pliku .env</h3>
                {envCheck.deprecated?.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-1.5">
                      Te zmienne są teraz zarządzane z poziomu tej strony i można je bezpiecznie usunąć z <code className="font-mono text-xs">.env</code>:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {envCheck.deprecated.map(name => (
                        <span key={name} className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-mono font-bold">{name}</span>
                      ))}
                    </div>
                  </div>
                )}
                {envCheck.suspicious?.length > 0 && (
                  <div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-1.5">Podejrzane nazwy zmiennych (możliwa literówka):</p>
                    <div className="space-y-1">
                      {envCheck.suspicious.map(s => (
                        <p key={s.found} className="text-xs font-mono">
                          <span className="text-red-500 font-bold">{s.found}</span>
                          <span className="text-zinc-400"> → czy chodziło o </span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">{s.suggestion}</span>
                          <span className="text-zinc-400">?</span>
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
                Chroni przed SSRF.
              </p>
              <ToggleSwitch
                checked={!!settings?.webhook_domain_restriction}
                onChange={toggleWebhookRestriction}
                disabled={!settings || savingSettings}
                label={settings == null ? 'Ładowanie...' : (settings.webhook_domain_restriction ? 'Ograniczenie domen: WŁĄCZONE' : 'Ograniczenie domen: WYŁĄCZONE')}
              />
            </div>
          </div>
        </div>

        {/* GDPR / RODO region */}
        <div className="card p-8 h-full flex flex-col">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-violet-50 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-violet-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Region RODO / LGPD</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                Włącza sekcję "Twoje dane" w profilu (eksport danych, usunięcie konta) oraz zakładkę RODO w tym panelu.
              </p>
              <div className="flex rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 w-full max-w-xs">
                {[['off', 'Wyłączone'], ['eu', 'UE'], ['brazil', 'Brazylia']].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setGdprRegion(val)}
                    disabled={!settings || savingSettings}
                    className={`flex-1 px-3 py-2.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                      settings?.gdpr_region === val
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

        {/* Videos per page + grid columns */}
        <div className="card p-8 h-full flex flex-col">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <LayoutGrid className="w-6 h-6 text-emerald-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Wyświetlanie filmów</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                Liczba filmów na stronę, maksymalna liczba kolumn siatki i minimalna szerokość karty filmu (px) w widoku bazy filmów. Na szerokich ekranach dokłada się kolejna kolumna zamiast ściskać istniejące karty poniżej tej szerokości, aż do limitu kolumn; na węższych ekranach nadal redukuje się jak dotychczas. Jeśli po tej zmianie liczba kolumn na Twoim ekranie nadal nie zgadza się z oczekiwaniami, zmniejsz minimalną szerokość karty.
              </p>
              <div className="grid grid-cols-2 gap-4 max-w-xs">
                <div>
                  <label className="label-field">Filmów na stronę</label>
                  <input type="number" min="1" max="500" value={displayForm.videos_per_page}
                    onChange={e => setDisplayForm(f => ({ ...f, videos_per_page: e.target.value }))}
                    className="input-field !py-3 text-sm" />
                </div>
                <div>
                  <label className="label-field">Maks. kolumn siatki</label>
                  <input type="number" min="1" max="12" value={displayForm.grid_columns}
                    onChange={e => setDisplayForm(f => ({ ...f, grid_columns: e.target.value }))}
                    className="input-field !py-3 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="label-field">Min. szerokość karty (px)</label>
                  <input type="number" min="150" max="800" value={displayForm.grid_card_min_width}
                    onChange={e => setDisplayForm(f => ({ ...f, grid_card_min_width: e.target.value }))}
                    className="input-field !py-3 text-sm" />
                </div>
              </div>
              <button onClick={saveDisplaySettings} disabled={savingSettings || settings == null} className="btn-primary text-sm mt-4">
                {savingSettings ? 'Zapisywanie...' : 'Zapisz'}
              </button>
            </div>
          </div>
        </div>

        {/* Logs per page */}
        <div className="card p-8 h-full flex flex-col">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-50 dark:bg-amber-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6 text-amber-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Logi</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                Liczba wpisów na stronę w logach oglądania, logowania i watch party.
              </p>
              <div className="max-w-[140px]">
                <label className="label-field">Logów na stronę</label>
                <input type="number" min="1" max="500" value={logsForm.logs_per_page}
                  onChange={e => setLogsForm(f => ({ ...f, logs_per_page: e.target.value }))}
                  className="input-field !py-3 text-sm" />
              </div>
              <button onClick={saveLogsSettings} disabled={savingSettings || settings == null} className="btn-primary text-sm mt-4">
                {savingSettings ? 'Zapisywanie...' : 'Zapisz'}
              </button>
            </div>
          </div>
        </div>

        {/* Iframe embedding */}
        <div className="card p-8 h-full flex flex-col">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <Frame className="w-6 h-6 text-blue-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Osadzanie w iframe</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                Lista domen platformy - zabezpieczenie przed dostępem do playera z innych domen. (CSP <code className="font-mono text-xs">frame-ancestors</code>).
              </p>
              <ToggleSwitch
                checked={!!settings?.iframe_embed_enabled}
                onChange={toggleIframeEmbed}
                disabled={!settings || savingSettings}
                label={settings == null ? 'Ładowanie...' : (settings.iframe_embed_enabled ? 'Osadzanie: WŁĄCZONE' : 'Osadzanie: WYŁĄCZONE')}
              />

              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mt-5 mb-2 font-display">Dozwolone domeny</p>
              <div className="flex gap-2 max-w-md">
                <input
                  type="text"
                  value={originInput}
                  onChange={e => setOriginInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOrigin(); } }}
                  placeholder="https://alleria.pl"
                  className="input-field !py-2.5 text-sm font-mono flex-1"
                />
                <button type="button" onClick={addOrigin} className="btn-ghost-primary shrink-0">Dodaj</button>
              </div>
              {originsForm.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {originsForm.map(origin => (
                    <span key={origin} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs font-mono">
                      {origin}
                      <button type="button" onClick={() => removeOrigin(origin)} className="p-0.5 rounded hover:bg-red-500/10 hover:text-red-500 transition-colors" title="Usuń">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <button onClick={saveOrigins} disabled={savingSettings || settings == null} className="btn-primary text-sm mt-4">
                {savingSettings ? 'Zapisywanie...' : 'Zapisz domeny'}
              </button>
            </div>
          </div>
        </div>

        {/* Top bar visibility */}
        <div className="card p-8 h-full flex flex-col">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-pink-50 dark:bg-pink-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <PanelTop className="w-6 h-6 text-pink-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Górny pasek</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                Gdy włączony: tytuł strony, wyszukiwarka i profil użytkownika w górnym pasku. Gdy wyłączony: profil wraca do lewego dolnego rogu, a każda strona pokazuje własny tytuł.
              </p>
              <ToggleSwitch
                checked={!!settings?.show_top_bar}
                onChange={toggleTopBar}
                disabled={!settings || savingSettings}
                label={settings == null ? 'Ładowanie...' : (settings.show_top_bar ? 'Górny pasek: WŁĄCZONY' : 'Górny pasek: WYŁĄCZONY')}
              />
            </div>
          </div>
        </div>

        {/* Custom YouTube player overlay */}
        <div className="card p-8 h-full flex flex-col">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-red-50 dark:bg-red-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <Play className="w-6 h-6 text-red-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Odtwarzacz YouTube</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                Gdy włączony: filmy z YouTube odtwarzają się w naszej nakładce sterującej (spójny wygląd z resztą platformy) zamiast domyślnych kontrolek YouTube. Sterowanie jakością nie jest dostępne — YouTube nie pozwala na to embedom od kilku lat, więc ten przycisk celowo nie istnieje w nakładce. Gdy wyłączony: zwykły embed YouTube, tak jak dotychczas.
              </p>
              <ToggleSwitch
                checked={!!settings?.youtube_custom_player}
                onChange={toggleYoutubePlayer}
                disabled={!settings || savingSettings}
                label={settings == null ? 'Ładowanie...' : (settings.youtube_custom_player ? 'Własna nakładka: WŁĄCZONA' : 'Własna nakładka: WYŁĄCZONA')}
              />
            </div>
          </div>
        </div>

        {/* ============ LOGOWANIE ============ */}
        <div className="xl:col-span-2 flex items-center gap-3 mt-4 mb-1">
          <LogIn className="w-5 h-5 text-zinc-400" />
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Logowanie</h2>
        </div>

        <div className="card p-6 xl:col-span-2 !border-blue-200 dark:!border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/[0.06]">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Z poziomu panelu można zdefiniować połączenie z TeamSpeak 3/6 (host, port, dane logowania, grupy) oraz — dla Discorda — wyłącznie ID roli <strong>Member</strong> i ogólnego <strong>Redaktora</strong>. Wymaga to ustawienia odpowiedniej flagi
              (<code className="font-mono text-xs">TS_CONFIG_SOURCE</code> / <code className="font-mono text-xs">DISCORD_ROLES_CONFIG_SOURCE</code>) na <code className="font-mono text-xs">panel</code> w <code className="font-mono text-xs">.env</code> i restartu kontenera.
              Pozostała konfiguracja Discord (Client ID/Secret, Bot Token, Guild ID, Redirect URI, rola Developera) jest zawsze wyłącznie w <code className="font-mono text-xs">.env</code> — bez możliwości podglądu ani edycji tutaj.
            </p>
          </div>
        </div>

        {/* Bot nickname (shared TS3/TS6) */}
        <div className="card p-6 xl:col-span-2">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/10 rounded-xl flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-violet-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display">Nazwa bota ServerQuery</h3>
                <span className="text-[11px] text-zinc-400 font-normal">(wspólna dla TS3 i TS6)</span>
                <span className={sourceBadgeClass(tsLocked)}>{tsLocked ? 'Źródło: .env' : 'Źródło: panel'}</span>
              </div>
              {tsLocked && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">Sterowane przez <code className="font-mono">.env</code> (<code className="font-mono">TS_CONFIG_SOURCE=env</code>, domyślnie).</p>
              )}
              <div className="flex gap-2 max-w-md">
                <input type="text" disabled={tsLocked} value={botNickname} onChange={e => setBotNickname(e.target.value)}
                  className="input-field !py-2.5 text-sm flex-1 disabled:opacity-50" placeholder="ALLERIA VIDEOS PLATFORM" />
                <button onClick={saveBotNickname} disabled={tsLocked || savingSettings || settings == null} className="btn-primary text-sm shrink-0 disabled:opacity-50">Zapisz</button>
              </div>
            </div>
          </div>
        </div>

        {/* TeamSpeak 6 */}
        <div className="card p-8 h-full flex flex-col">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <Headphones className="w-6 h-6 text-blue-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display">TeamSpeak 6</h3>
                <span className={sourceBadgeClass(tsLocked)}>{tsLocked ? 'Źródło: .env' : 'Źródło: panel'}</span>
              </div>
              {tsLocked && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">Sterowane przez <code className="font-mono">.env</code>. Ustaw <code className="font-mono">TS_CONFIG_SOURCE=panel</code> i zrestartuj, aby edytować tutaj.</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className="label-field">Host</label><input type="text" disabled={tsLocked} value={ts6Form.host} onChange={e => setTs6Form(f => ({ ...f, host: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
                <div><label className="label-field">Port</label><input type="text" disabled={tsLocked} value={ts6Form.port} onChange={e => setTs6Form(f => ({ ...f, port: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
                <div><label className="label-field">Server ID</label><input type="text" disabled={tsLocked} value={ts6Form.server_id} onChange={e => setTs6Form(f => ({ ...f, server_id: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
                <div><label className="label-field">Użytkownik</label><input type="text" disabled={tsLocked} value={ts6Form.username} onChange={e => setTs6Form(f => ({ ...f, username: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
                <div><label className="label-field">Hasło</label><input type="password" disabled={tsLocked} value={ts6Form.password} onChange={e => setTs6Form(f => ({ ...f, password: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
                <div className="col-span-2"><label className="label-field">Klucz API</label><input type="password" disabled={tsLocked} value={ts6Form.api_key} onChange={e => setTs6Form(f => ({ ...f, api_key: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
                <div><label className="label-field">ID grupy Member</label><input type="text" disabled={tsLocked} value={ts6Form.member_group_id} onChange={e => setTs6Form(f => ({ ...f, member_group_id: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
                <div><label className="label-field">ID grupy Admin</label><input type="text" disabled={tsLocked} value={ts6Form.admin_group_id} onChange={e => setTs6Form(f => ({ ...f, admin_group_id: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
              </div>
              <button onClick={saveTs6Settings} disabled={tsLocked || savingSettings || settings == null} className="btn-primary text-sm mt-4 disabled:opacity-50">
                {savingSettings ? 'Zapisywanie...' : 'Zapisz TeamSpeak 6'}
              </button>
            </div>
          </div>
        </div>

        {/* TeamSpeak 3 */}
        <div className="card p-8 h-full flex flex-col">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <Radio className="w-6 h-6 text-indigo-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display">TeamSpeak 3</h3>
                <span className={sourceBadgeClass(tsLocked)}>{tsLocked ? 'Źródło: .env' : 'Źródło: panel'}</span>
              </div>
              {tsLocked && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">Sterowane przez <code className="font-mono">.env</code>. Ustaw <code className="font-mono">TS_CONFIG_SOURCE=panel</code> i zrestartuj, aby edytować tutaj.</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className="label-field">Host</label><input type="text" disabled={tsLocked} value={ts3Form.host} onChange={e => setTs3Form(f => ({ ...f, host: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
                <div><label className="label-field">Port</label><input type="text" disabled={tsLocked} value={ts3Form.port} onChange={e => setTs3Form(f => ({ ...f, port: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
                <div><label className="label-field">Server ID</label><input type="text" disabled={tsLocked} value={ts3Form.server_id} onChange={e => setTs3Form(f => ({ ...f, server_id: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
                <div><label className="label-field">Użytkownik</label><input type="text" disabled={tsLocked} value={ts3Form.username} onChange={e => setTs3Form(f => ({ ...f, username: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
                <div><label className="label-field">Hasło</label><input type="password" disabled={tsLocked} value={ts3Form.password} onChange={e => setTs3Form(f => ({ ...f, password: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
                <div><label className="label-field">ID grupy Member</label><input type="text" disabled={tsLocked} value={ts3Form.member_group_id} onChange={e => setTs3Form(f => ({ ...f, member_group_id: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
                <div><label className="label-field">ID grupy Admin</label><input type="text" disabled={tsLocked} value={ts3Form.admin_group_id} onChange={e => setTs3Form(f => ({ ...f, admin_group_id: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
              </div>
              <button onClick={saveTs3Settings} disabled={tsLocked || savingSettings || settings == null} className="btn-primary text-sm mt-4 disabled:opacity-50">
                {savingSettings ? 'Zapisywanie...' : 'Zapisz TeamSpeak 3'}
              </button>
            </div>
          </div>
        </div>

        {/* Discord — member/redaktor role IDs + category role overview */}
        <div className="card p-8 h-full flex flex-col xl:col-span-2">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <MessageSquare className="w-6 h-6 text-indigo-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display">Discord — role Member / Redaktor</h3>
                <span className={sourceBadgeClass(discordRolesLocked)}>{discordRolesLocked ? 'Źródło: .env' : 'Źródło: panel'}</span>
              </div>
              {discordRolesLocked && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">Sterowane przez <code className="font-mono">.env</code>. Ustaw <code className="font-mono">DISCORD_ROLES_CONFIG_SOURCE=panel</code> i zrestartuj, aby edytować tutaj.</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                <div>
                  <label className="label-field">ID roli Member</label>
                  <input type="text" disabled={discordRolesLocked} value={discordRolesForm.member_role_id}
                    onChange={e => setDiscordRolesForm(f => ({ ...f, member_role_id: e.target.value }))}
                    className="input-field !py-2.5 text-sm font-mono disabled:opacity-50" placeholder="123456789012345678" />
                </div>
                <div>
                  <label className="label-field">ID roli Redaktor (Admin)</label>
                  <input type="text" disabled={discordRolesLocked} value={discordRolesForm.admin_role_id}
                    onChange={e => setDiscordRolesForm(f => ({ ...f, admin_role_id: e.target.value }))}
                    className="input-field !py-2.5 text-sm font-mono disabled:opacity-50" placeholder="123456789012345679" />
                </div>
              </div>
              <button onClick={saveDiscordRoles} disabled={discordRolesLocked || savingSettings || settings == null} className="btn-primary text-sm mt-4 disabled:opacity-50">
                {savingSettings ? 'Zapisywanie...' : 'Zapisz role Discord'}
              </button>

              {categoryRoleOverview.length > 0 && (
                <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-3 font-display">
                    Kategorie z niestandardowymi rolami/użytkownikami Discord ({categoryRoleOverview.length})
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {categoryRoleOverview.map(c => (
                      <div key={c.id} className="flex flex-wrap items-center gap-1.5 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                        <span className="text-sm font-bold text-zinc-900 dark:text-white mr-1">{c.name}</span>
                        {c.discord_roles.map((r, i) => (
                          <span key={`r-${i}`} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.access_type === 'editor' ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'}`}
                            title={r.role_name ? undefined : 'Nie udało się pobrać nazwy roli z Discorda — pokazano surowe ID'}>
                            {r.access_type === 'editor' ? '✏️' : '👁️'} {r.role_name || <span className="font-mono">{r.role_id}</span>}
                          </span>
                        ))}
                        {c.custom_users.map((u, i) => (
                          <span key={`u-${i}`} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300">
                            {u.access_type === 'editor' ? '✏️' : '👁️'} {u.display_name}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={async () => {
                    if (!confirm('Wyczyścić logi wyświetleń filmów?')) return;
                    try {
                      const r = await api.clearWatchLogs();
                      setStatus({ type: 'success', msg: `Usunięto ${r.deleted} logów wyświetleń.` });
                    } catch (e) { setStatus({ type: 'error', msg: e.message }); }
                  }}
                  className="btn-secondary text-sm w-full"
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
                  className="btn-secondary text-sm w-full"
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
                  className="btn-secondary text-sm w-full"
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
                  className="btn-secondary text-sm w-full"
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
