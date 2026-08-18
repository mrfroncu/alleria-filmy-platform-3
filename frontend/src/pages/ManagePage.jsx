import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { FolderOpen, Plus, Pencil, Trash2, Users, Shield, Lock, FileText, Settings, ShieldCheck, LayoutGrid, Frame, PanelTop, X, LogIn, Bot, Headphones, Radio, MessageSquare, Info, Mail, Play, AlertTriangle, Flag, ExternalLink, Loader2, Image } from 'lucide-react';
import { api } from '../utils/api';
import { buildCategoryTreeOptions, formatDate } from '../utils/helpers';
import { roleBadgeClass } from '../utils/roleColors';
import { useSettings } from '../contexts/SettingsContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useToast } from '../contexts/ToastContext';
import { useUnsavedForm, useUnsavedGuard } from '../contexts/UnsavedChangesContext';
import { renderMarkdown } from '../utils/markdown';
import CategoryModal from '../components/CategoryModal';
import RankModal from '../components/RankModal';

const MANAGE_TAB_IDS = ['categories', 'ranks', 'users', 'reports', 'gdpr', 'tos', 'settings'];
const REPORT_REASON_LABELS = { spam: 'Spam', harassment: 'Nękanie / obraźliwe treści', spoiler: 'Spoiler', inappropriate: 'Nieodpowiednia treść', other: 'Inne' };

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

// Section divider used to group the settings page into "Wygląd i treść" / "Bezpieczeństwo i prywatność" /
// "Powiadomienia email" / "Logowanie" without splitting them into separate sub-tabs.
function SettingsSectionHeader({ id, icon: Icon, label, first }) {
  return (
    <div id={id} className={`flex items-center gap-3 mb-4 scroll-mt-24 ${first ? '' : 'mt-12'}`}>
      <Icon className="w-5 h-5 text-violet-500 shrink-0" />
      <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display whitespace-nowrap">{label}</h2>
      <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

export default function ManagePage() {
  const { config } = useSettings();
  const confirm = useConfirm();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(MANAGE_TAB_IDS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'categories');
  // Deep-links (e.g. from GlobalSearch) point at a settings section via ?subtab=; since all
  // sections now live on one scrollable page, this just scrolls to the section on arrival.
  const settingsScrollTarget = ["display","security","email","login"].includes(searchParams.get('subtab')) ? searchParams.get('subtab') : null;
  useEffect(() => {
    if (tab === 'settings' && settingsScrollTarget) {
      document.getElementById(`settings-section-${settingsScrollTarget}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Category state
  const [cats, setCats] = useState([]);
  const [users, setUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [ranks, setRanks] = useState([]);
  // Redirects every existing setStatus({ type, msg }) call site to a floating toast instead
  // of an inline banner at the top of the page (easy to miss while scrolled down).
  const setStatus = (s) => { if (s) (s.type === 'success' ? toast.success : toast.error)(s.msg); };
  const [editingCat, setEditingCat] = useState(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  // Rank form state
  const [editingRank, setEditingRank] = useState(null);
  const [rankModalOpen, setRankModalOpen] = useState(false);

  // Users tab state
  const [userRanks, setUserRanks] = useState({});
  const [editingUserRanks, setEditingUserRanks] = useState(null);

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
  useEffect(() => {
    if (tab === 'gdpr' && settings && settings.gdpr_region === 'off') setTab('categories');
  }, [tab, settings]);

  // Regulamin (ToS) editor
  const [tosContent, setTosContent] = useState('');
  const [tosUpdatedAt, setTosUpdatedAt] = useState(null);
  const [tosLoading, setTosLoading] = useState(false);
  const [tosSaving, setTosSaving] = useState(false);
  useEffect(() => {
    if (tab === 'tos') {
      setTosLoading(true);
      api.getTos().then(t => { setTosContent(t.content); setTosBaseline(t.content); setTosUpdatedAt(t.updatedAt); }).catch(() => {}).finally(() => setTosLoading(false));
    }
  }, [tab]);
  const saveTos = async () => {
    setTosSaving(true);
    try {
      const previousUpdatedAt = tosUpdatedAt;
      const t = await api.updateTos(tosContent);
      setTosUpdatedAt(t.updatedAt);
      setTosBaseline(tosContent);
      setStatus({
        type: 'success',
        msg: t.updatedAt !== previousUpdatedAt
          ? 'Regulamin zapisany. Użytkownicy, którzy zaakceptowali go wcześniej, zobaczą prośbę o ponowną akceptację.'
          : 'Treść bez zmian - nic nie zaktualizowano, akceptacje pozostają ważne.',
      });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setTosSaving(false);
  };
  const [limitForm, setLimitForm] = useState({ limit_display_name: '', limit_bio: '', limit_comment: '' });
  const [limitBaseline, setLimitBaseline] = useState(limitForm);
  const [displayForm, setDisplayForm] = useState({ videos_per_page: '', grid_columns: '', grid_card_min_width: '' });
  const [displayBaseline, setDisplayBaseline] = useState(displayForm);
  const [logsForm, setLogsForm] = useState({ logs_per_page: '' });
  const [logsBaseline, setLogsBaseline] = useState(logsForm);
  const [originsForm, setOriginsForm] = useState([]);
  const [originsBaseline, setOriginsBaseline] = useState([]);
  const [originInput, setOriginInput] = useState('');
  const [envCheck, setEnvCheck] = useState(null);
  const [ts6Form, setTs6Form] = useState({ host: '', port: '', username: '', password: '', api_key: '', server_id: '', member_group_id: '', admin_group_id: '' });
  const [ts6Baseline, setTs6Baseline] = useState(ts6Form);
  const [ts3Form, setTs3Form] = useState({ host: '', port: '', username: '', password: '', server_id: '', member_group_id: '', admin_group_id: '' });
  const [ts3Baseline, setTs3Baseline] = useState(ts3Form);
  const [botNickname, setBotNickname] = useState('');
  const [botNicknameBaseline, setBotNicknameBaseline] = useState('');
  const [discordRolesForm, setDiscordRolesForm] = useState({ member_role_id: '', admin_role_id: '' });
  const [discordRolesBaseline, setDiscordRolesBaseline] = useState(discordRolesForm);
  const [categoryRoleOverview, setCategoryRoleOverview] = useState([]);
  const [smtpForm, setSmtpForm] = useState({ host: '', port: '', secure: false, user: '', password: '', from: '' });
  const [smtpBaseline, setSmtpBaseline] = useState(smtpForm);
  const [tosBaseline, setTosBaseline] = useState('');
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);

  // Email templates (content only — design is fixed server-side)
  const [showEmailTemplates, setShowEmailTemplates] = useState(false);
  const [newVideoTemplate, setNewVideoTemplate] = useState('');
  const [newVideoTemplateBaseline, setNewVideoTemplateBaseline] = useState('');
  const [savingNewVideoTemplate, setSavingNewVideoTemplate] = useState(false);
  const [gdprTemplate, setGdprTemplate] = useState('');
  const [gdprTemplateBaseline, setGdprTemplateBaseline] = useState('');
  const [savingGdprTemplate, setSavingGdprTemplate] = useState(false);
  const [gdprResultExportTemplate, setGdprResultExportTemplate] = useState('');
  const [gdprResultExportTemplateBaseline, setGdprResultExportTemplateBaseline] = useState('');
  const [savingGdprResultExportTemplate, setSavingGdprResultExportTemplate] = useState(false);
  const [gdprResultDeletionTemplate, setGdprResultDeletionTemplate] = useState('');
  const [gdprResultDeletionTemplateBaseline, setGdprResultDeletionTemplateBaseline] = useState('');
  const [savingGdprResultDeletionTemplate, setSavingGdprResultDeletionTemplate] = useState(false);

  useEffect(() => {
    api.getSettings().then(s => {
      setSettingsState(s);
      const limits = { limit_display_name: s.limit_display_name, limit_bio: s.limit_bio, limit_comment: s.limit_comment };
      setLimitForm(limits); setLimitBaseline(limits);
      const display = { videos_per_page: s.videos_per_page, grid_columns: s.grid_columns, grid_card_min_width: s.grid_card_min_width };
      setDisplayForm(display); setDisplayBaseline(display);
      const logs = { logs_per_page: s.logs_per_page };
      setLogsForm(logs); setLogsBaseline(logs);
      const origins = s.iframe_allowed_origins || [];
      setOriginsForm(origins); setOriginsBaseline(origins);
      const ts6 = {
        host: s.ts6_host || '', port: s.ts6_port || '', username: s.ts6_username || '', password: s.ts6_password || '',
        api_key: s.ts6_api_key || '', server_id: s.ts6_server_id || '', member_group_id: s.ts6_member_group_id || '', admin_group_id: s.ts6_admin_group_id || '',
      };
      setTs6Form(ts6); setTs6Baseline(ts6);
      const ts3 = {
        host: s.ts3_host || '', port: s.ts3_port || '', username: s.ts3_username || '', password: s.ts3_password || '',
        server_id: s.ts3_server_id || '', member_group_id: s.ts3_member_group_id || '', admin_group_id: s.ts3_admin_group_id || '',
      };
      setTs3Form(ts3); setTs3Baseline(ts3);
      const nickname = s.ts_bot_nickname || '';
      setBotNickname(nickname); setBotNicknameBaseline(nickname);
      const discordRoles = { member_role_id: s.discord_member_role_id || '', admin_role_id: s.discord_admin_role_id || '' };
      setDiscordRolesForm(discordRoles); setDiscordRolesBaseline(discordRoles);
      const smtp = {
        host: s.smtp_host || '', port: String(s.smtp_port || '587'), secure: !!s.smtp_secure,
        user: s.smtp_user || '', password: s.smtp_password || '', from: s.smtp_from || '',
      };
      setSmtpForm(smtp); setSmtpBaseline(smtp);
      const nv = s.email_template_new_video || '';
      setNewVideoTemplate(nv); setNewVideoTemplateBaseline(nv);
      const gdpr = s.email_template_gdpr_notify || '';
      setGdprTemplate(gdpr); setGdprTemplateBaseline(gdpr);
      const gdprExp = s.email_template_gdpr_result_export || '';
      setGdprResultExportTemplate(gdprExp); setGdprResultExportTemplateBaseline(gdprExp);
      const gdprDel = s.email_template_gdpr_result_deletion || '';
      setGdprResultDeletionTemplate(gdprDel); setGdprResultDeletionTemplateBaseline(gdprDel);
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
      const newLimits = { limit_display_name: r.limit_display_name, limit_bio: r.limit_bio, limit_comment: r.limit_comment };
      setLimitForm(newLimits); setLimitBaseline(newLimits);
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
  useEffect(() => { if (tab === 'gdpr') loadGdprAdmin(); }, [tab]);

  // Pending-count badge on the RODO tab button — needs to be known before the tab is ever opened.
  const [gdprPendingCount, setGdprPendingCount] = useState(0);
  const loadGdprPendingCount = () => api.adminGetGdprPendingCount().then(r => setGdprPendingCount(r.count || 0)).catch(() => {});
  useEffect(() => {
    if (!(settings?.gdpr_region && settings.gdpr_region !== 'off')) { setGdprPendingCount(0); return; }
    loadGdprPendingCount();
  }, [settings?.gdpr_region]);

  // Comment moderation queue
  const [commentReports, setCommentReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsPendingCount, setReportsPendingCount] = useState(0);
  const [reportStatusFilter, setReportStatusFilter] = useState('pending');
  const [resolvingReportId, setResolvingReportId] = useState(null);

  const loadReportsPendingCount = () => api.getCommentReportsPendingCount().then(r => setReportsPendingCount(r.count || 0)).catch(() => {});
  useEffect(() => { loadReportsPendingCount(); }, []);

  const loadReports = () => {
    setReportsLoading(true);
    api.getCommentReports(reportStatusFilter === 'all' ? '' : reportStatusFilter)
      .then(setCommentReports).catch(() => {}).finally(() => setReportsLoading(false));
  };
  useEffect(() => { if (tab === 'reports') loadReports(); }, [tab, reportStatusFilter]);

  const resolveReport = async (report, action) => {
    if (action === 'delete_comment') {
      if (!(await confirm('Komentarz zostanie ukryty — jego treść zniknie z widoku, ale wpis zostaje w bazie (ślad zostaje zachowany). Zgłoszenie zostanie oznaczone jako rozstrzygnięte. Kontynuować?', { danger: true, confirmLabel: 'Ukryj komentarz' }))) return;
    } else if (action === 'hard_delete') {
      if (!(await confirm('Komentarz i wszystkie jego odpowiedzi zostaną usunięte NA ZAWSZE z bazy danych — tej operacji nie można cofnąć. Zgłoszenie zostanie oznaczone jako rozstrzygnięte. Kontynuować?', { danger: true, confirmLabel: 'Usuń trwale' }))) return;
    }
    setResolvingReportId(report.id);
    try {
      await api.resolveCommentReport(report.id, action);
      setCommentReports(prev => prev.filter(r => r.id !== report.id));
      setReportsPendingCount(c => Math.max(0, c - 1));
      toast.success('Zgłoszenie rozpatrzone.');
    } catch (err) { toast.error('Błąd: ' + err.message); }
    setResolvingReportId(null);
  };

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

  const handleGdprApprove = async (id, type) => {
    const message = type === 'deletion'
      ? 'Zatwierdzić usunięcie konta? Nastąpi natychmiastowa anonimizacja danych i wylogowanie użytkownika. Tej operacji nie można cofnąć.'
      : 'Zatwierdzić eksport danych? Plik stanie się dostępny do pobrania w profilu użytkownika.';
    if (!(await confirm(message, { confirmLabel: 'Zatwierdź', danger: type === 'deletion' }))) return;
    setGdprBusy(id);
    try {
      await api.adminApproveGdpr(id);
      setStatus({ type: 'success', msg: 'Zgłoszenie zatwierdzone.' });
      loadGdprAdmin();
      loadGdprPendingCount();
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
      loadGdprPendingCount();
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
      const newDisplay = { videos_per_page: r.videos_per_page, grid_columns: r.grid_columns, grid_card_min_width: r.grid_card_min_width };
      setDisplayForm(newDisplay); setDisplayBaseline(newDisplay);
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
      const newLogs = { logs_per_page: r.logs_per_page };
      setLogsForm(newLogs); setLogsBaseline(newLogs);
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
      setStatus({ type: 'error', msg: 'Nieprawidłowy format - oczekiwano np. https://alleria.pl' });
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
      const newOrigins = r.iframe_allowed_origins || [];
      setOriginsForm(newOrigins); setOriginsBaseline(newOrigins);
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

  const toggleCustomAvatars = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const r = await api.setSettings({ allow_custom_avatars: !settings.allow_custom_avatars });
      setSettingsState(s => ({ ...s, allow_custom_avatars: r.allow_custom_avatars }));
      setStatus({ type: 'success', msg: `Własne avatary: ${r.allow_custom_avatars ? 'WŁĄCZONE' : 'WYŁĄCZONE'}` });
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
      setBotNickname(r.ts_bot_nickname || ''); setBotNicknameBaseline(r.ts_bot_nickname || '');
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
      const newTs6 = {
        host: r.ts6_host || '', port: r.ts6_port || '', username: r.ts6_username || '', password: r.ts6_password || '',
        api_key: r.ts6_api_key || '', server_id: r.ts6_server_id || '', member_group_id: r.ts6_member_group_id || '', admin_group_id: r.ts6_admin_group_id || '',
      };
      setTs6Form(newTs6); setTs6Baseline(newTs6);
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
      const newTs3 = {
        host: r.ts3_host || '', port: r.ts3_port || '', username: r.ts3_username || '', password: r.ts3_password || '',
        server_id: r.ts3_server_id || '', member_group_id: r.ts3_member_group_id || '', admin_group_id: r.ts3_admin_group_id || '',
      };
      setTs3Form(newTs3); setTs3Baseline(newTs3);
      setStatus({ type: 'success', msg: 'Ustawienia TeamSpeak 3 zapisane.' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingSettings(false);
  };

  const saveSmtpSettings = async () => {
    setSavingSettings(true);
    try {
      const r = await api.setSettings({
        smtp_host: smtpForm.host, smtp_port: smtpForm.port, smtp_secure: smtpForm.secure,
        smtp_user: smtpForm.user, smtp_password: smtpForm.password, smtp_from: smtpForm.from,
      });
      setSettingsState(s => ({ ...s, ...r }));
      const newSmtp = {
        host: r.smtp_host || '', port: String(r.smtp_port || '587'), secure: !!r.smtp_secure,
        user: r.smtp_user || '', password: r.smtp_password || '', from: r.smtp_from || '',
      };
      setSmtpForm(newSmtp); setSmtpBaseline(newSmtp);
      setStatus({ type: 'success', msg: 'Ustawienia SMTP zapisane.' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingSettings(false);
  };

  const sendTestEmail = async () => {
    setTestingEmail(true);
    try {
      const r = await api.sendTestEmail(testEmailTo);
      setStatus({ type: 'success', msg: `Testowy e-mail wysłany na ${r.to}.` });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setTestingEmail(false);
  };

  const saveNewVideoTemplate = async () => {
    setSavingNewVideoTemplate(true);
    try {
      const r = await api.setSettings({ email_template_new_video: newVideoTemplate });
      setSettingsState(s => ({ ...s, ...r }));
      const v = r.email_template_new_video || '';
      setNewVideoTemplate(v); setNewVideoTemplateBaseline(v);
      setStatus({ type: 'success', msg: 'Domyślny szablon "Nowy film" zapisany.' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingNewVideoTemplate(false);
  };

  const saveGdprTemplate = async () => {
    setSavingGdprTemplate(true);
    try {
      const r = await api.setSettings({ email_template_gdpr_notify: gdprTemplate });
      setSettingsState(s => ({ ...s, ...r }));
      const v = r.email_template_gdpr_notify || '';
      setGdprTemplate(v); setGdprTemplateBaseline(v);
      setStatus({ type: 'success', msg: 'Szablon powiadomienia RODO zapisany.' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingGdprTemplate(false);
  };

  const saveGdprResultExportTemplate = async () => {
    setSavingGdprResultExportTemplate(true);
    try {
      const r = await api.setSettings({ email_template_gdpr_result_export: gdprResultExportTemplate });
      setSettingsState(s => ({ ...s, ...r }));
      const v = r.email_template_gdpr_result_export || '';
      setGdprResultExportTemplate(v); setGdprResultExportTemplateBaseline(v);
      setStatus({ type: 'success', msg: 'Szablon "Eksport gotowy" zapisany.' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingGdprResultExportTemplate(false);
  };

  const saveGdprResultDeletionTemplate = async () => {
    setSavingGdprResultDeletionTemplate(true);
    try {
      const r = await api.setSettings({ email_template_gdpr_result_deletion: gdprResultDeletionTemplate });
      setSettingsState(s => ({ ...s, ...r }));
      const v = r.email_template_gdpr_result_deletion || '';
      setGdprResultDeletionTemplate(v); setGdprResultDeletionTemplateBaseline(v);
      setStatus({ type: 'success', msg: 'Szablon "Konto usunięte" zapisany.' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingGdprResultDeletionTemplate(false);
  };

  const saveDiscordRoles = async () => {
    setSavingSettings(true);
    try {
      const r = await api.setSettings({
        discord_member_role_id: discordRolesForm.member_role_id,
        discord_admin_role_id: discordRolesForm.admin_role_id,
      });
      setSettingsState(s => ({ ...s, ...r }));
      const newDiscordRoles = { member_role_id: r.discord_member_role_id || '', admin_role_id: r.discord_admin_role_id || '' };
      setDiscordRolesForm(newDiscordRoles); setDiscordRolesBaseline(newDiscordRoles);
      setStatus({ type: 'success', msg: 'Role Discord zapisane.' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
    setSavingSettings(false);
  };

  const loadUsers = async () => {
    try {
      const [u, au, r] = await Promise.all([api.getUsers(), api.getAllUsers(), api.getRanks()]);
      setUsers(u);
      setAllUsers(au);
      setRanks(r);
      if (r.length > 0) {
        const rankMap = {};
        await Promise.all(u.map(async usr => {
          try { rankMap[usr.id] = (await api.getUserRanks(usr.id)).map(rk => rk.id); } catch { rankMap[usr.id] = []; }
        }));
        setUserRanks(rankMap);
      }
    } catch (e) {}
  };

  useEffect(() => {
    api.getCategories().then(setCats).catch(() => {});
    loadUsers();
  }, []);

  const openAddCategory = () => { setEditingCat(null); setCategoryModalOpen(true); };
  const openEditCategory = (cat) => { setEditingCat(cat); setCategoryModalOpen(true); };
  const closeCategoryModal = () => setCategoryModalOpen(false);
  const onCategorySaved = () => { api.getCategories().then(setCats).catch(() => {}); };

  const deleteCategory = async (cat) => {
    if (!(await confirm(`Usunąć kategorię "${cat.name}"?`, { danger: true, confirmLabel: 'Usuń' }))) return;
    try {
      await api.deleteCategory(cat.id);
      setCats(prev => prev.filter(c => c.id !== cat.id));
      setStatus({ type: 'success', msg: `Kategoria "${cat.name}" usunięta.` });
    } catch (e) { setStatus({ type: 'error', msg: e.message }); }
  };

  const openAddRank = () => { setEditingRank(null); setRankModalOpen(true); };
  const openEditRank = (rank) => { setEditingRank(rank); setRankModalOpen(true); };
  const closeRankModal = () => setRankModalOpen(false);
  const onRankSaved = () => { api.getRanks().then(setRanks).catch(() => {}); };

  const deleteRank = async (rank) => {
    if (!(await confirm(`Usunąć rangę "${rank.name}"? Spowoduje to usunięcie wszystkich przypisań tej rangi.`, { danger: true, confirmLabel: 'Usuń' }))) return;
    try {
      await api.deleteRank(rank.id);
      setRanks(prev => prev.filter(r => r.id !== rank.id));
      setStatus({ type: 'success', msg: `Ranga "${rank.name}" usunięta.` });
    } catch (e) { setStatus({ type: 'error', msg: e.message }); }
  };

  const parseModes = (m) => {
    if (!m) return { vm: 'public', em: 'none' };
    if (m.includes(':')) { const [vm, em] = m.split(':'); return { vm, em }; }
    if (m === 'custom') return { vm: 'custom', em: 'none' };
    if (m === 'roles') return { vm: 'roles', em: 'roles' };
    return { vm: 'public', em: 'none' };
  };

  const tsLocked = settings?.ts_config_source !== 'panel';
  const discordRolesLocked = settings?.discord_roles_config_source !== 'panel';
  // Only ever shown when the setting is env-locked — a "Źródło: panel" badge for the unlocked
  // case would just be noise, since panel is the unlocked default state.
  const sourceBadgeClass = 'text-[10px] font-bold px-2 py-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500';

  useUnsavedForm('manage-limits', { dirty: JSON.stringify(limitForm) !== JSON.stringify(limitBaseline), save: saveLimits, label: 'Limity treści' });
  useUnsavedForm('manage-display', { dirty: JSON.stringify(displayForm) !== JSON.stringify(displayBaseline), save: saveDisplaySettings, label: 'Ustawienia wyświetlania' });
  useUnsavedForm('manage-logs', { dirty: JSON.stringify(logsForm) !== JSON.stringify(logsBaseline), save: saveLogsSettings, label: 'Ustawienia logów' });
  useUnsavedForm('manage-origins', { dirty: JSON.stringify(originsForm) !== JSON.stringify(originsBaseline), save: saveOrigins, label: 'Domeny iframe' });
  useUnsavedForm('manage-ts6', { dirty: JSON.stringify(ts6Form) !== JSON.stringify(ts6Baseline), save: saveTs6Settings, label: 'TeamSpeak 6' });
  useUnsavedForm('manage-ts3', { dirty: JSON.stringify(ts3Form) !== JSON.stringify(ts3Baseline), save: saveTs3Settings, label: 'TeamSpeak 3' });
  useUnsavedForm('manage-bot-nickname', { dirty: botNickname !== botNicknameBaseline, save: saveBotNickname, label: 'Nazwa bota' });
  useUnsavedForm('manage-discord-roles', { dirty: JSON.stringify(discordRolesForm) !== JSON.stringify(discordRolesBaseline), save: saveDiscordRoles, label: 'Role Discord' });
  useUnsavedForm('manage-smtp', { dirty: JSON.stringify(smtpForm) !== JSON.stringify(smtpBaseline), save: saveSmtpSettings, label: 'SMTP' });
  useUnsavedForm('manage-email-template-new-video', { dirty: newVideoTemplate !== newVideoTemplateBaseline, save: saveNewVideoTemplate, label: 'Szablon e-mail: Nowy film' });
  useUnsavedForm('manage-email-template-gdpr', { dirty: gdprTemplate !== gdprTemplateBaseline, save: saveGdprTemplate, label: 'Szablon e-mail: RODO' });
  useUnsavedForm('manage-email-template-gdpr-result-export', { dirty: gdprResultExportTemplate !== gdprResultExportTemplateBaseline, save: saveGdprResultExportTemplate, label: 'Szablon e-mail: Eksport gotowy' });
  useUnsavedForm('manage-email-template-gdpr-result-deletion', { dirty: gdprResultDeletionTemplate !== gdprResultDeletionTemplateBaseline, save: saveGdprResultDeletionTemplate, label: 'Szablon e-mail: Konto usunięte' });
  useUnsavedForm('manage-tos', { dirty: tosContent !== tosBaseline, save: saveTos, label: 'Regulamin' });

  const guardNav = useUnsavedGuard();

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto page-enter">
      <div className="mb-8">
        {!config.showTopBar && <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display mb-3">Zarządzanie</h1>}
        <p className="text-zinc-500 dark:text-zinc-400">Zarządzaj kategoriami, rangami, użytkownikami, zgłoszeniami komentarzy oraz ustawieniami platformy.</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-zinc-200 dark:border-zinc-800">
        {[
          ['categories', 'Kategorie', FolderOpen],
          ['ranks', 'Rangi', Shield],
          ['users', 'Użytkownicy', Users],
          ['reports', 'Zgłoszenia', Flag],
          ...(settings?.gdpr_region && settings.gdpr_region !== 'off' ? [['gdpr', 'RODO', Lock]] : []),
          ['tos', 'Regulamin', FileText],
          ['settings', 'Ustawienia', Settings],
        ].map(([key, label, Icon]) => (
          <button key={key} onClick={() => guardNav(() => setTab(key))}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === key
                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}>
            <Icon className="w-4 h-4" />
            {label}
            {key === 'gdpr' && gdprPendingCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold">
                {gdprPendingCount > 99 ? '99+' : gdprPendingCount}
              </span>
            )}
            {key === 'reports' && reportsPendingCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold">
                {reportsPendingCount > 99 ? '99+' : reportsPendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* === CATEGORIES TAB === */}
      {tab === 'categories' && (
        <>
          <div className="card p-8 mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-cyan-50 dark:bg-cyan-500/10 rounded-2xl flex items-center justify-center">
                <FolderOpen className="w-5 h-5 text-cyan-500" />
              </div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display flex-1">Kategorie ({cats.length})</h2>
              <button onClick={openAddCategory} className="btn-primary text-sm flex items-center gap-2">
                <Plus className="w-4 h-4" /> Dodaj kategorię
              </button>
            </div>

            {cats.length === 0 ? <p className="text-sm text-zinc-400 italic text-center py-6">Brak kategorii</p> : (
              <div className="space-y-2">
                {buildCategoryTreeOptions(cats).map(opt => {
                  const cat = cats.find(c => c.id === opt.id);
                  if (!cat) return null;
                  return (
                    <div key={cat.id} className="flex items-center gap-3 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" style={{ marginLeft: opt.depth * 24 }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-zinc-900 dark:text-white">{opt.depth > 0 ? '↳ ' : ''}{cat.name}</span>
                          <span className="text-xs text-zinc-400">({cat.videoCount || 0} filmów)</span>
                          {(cat.access_mode || '').includes('custom') && <span className="text-[9px] bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5"><Users className="w-2.5 h-2.5" /> NIESTANDARDOWE</span>}
                          {!!cat.webhook_enabled && cat.webhook_url && <span className="text-[9px] bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300 px-1.5 py-0.5 rounded font-bold">WEBHOOK</span>}
                          {!!cat.email_enabled && <span className="text-[9px] bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded font-bold">EMAIL</span>}
                          {!!cat.is_shorts_category && <span className="text-[9px] bg-pink-100 dark:bg-pink-500/10 text-pink-600 dark:text-pink-300 px-1.5 py-0.5 rounded font-bold">SHORTS</span>}
                        </div>
                        {cat.description && <p className="text-xs text-zinc-400 mt-0.5">{cat.description}</p>}
                        {((cat.access && cat.access.length > 0) || (cat.rank_access && cat.rank_access.length > 0)) && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {(cat.access || []).map((a, i) => (
                              <span key={`d-${i}`} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${a.access_type === 'editor' ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'}`}>
                                {a.access_type === 'editor' ? '✏️' : '👁️'} {a.discord_role_id}
                              </span>
                            ))}
                            {(cat.rank_access || []).map((a, i) => (
                              <span key={`r-${i}`} className="text-[10px] font-medium px-1.5 py-0.5 rounded text-white"
                                style={{ backgroundColor: a.rank_color || '#6366f1' }}>
                                {a.access_type === 'editor' ? '✏️' : '👁️'} {a.rank_name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => openEditCategory(cat)} className="btn-icon-violet">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteCategory(cat)} className="btn-icon-red">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <CategoryModal
            isOpen={categoryModalOpen}
            onClose={closeCategoryModal}
            category={editingCat}
            cats={cats}
            allUsers={allUsers}
            ranks={ranks}
            onSaved={onCategorySaved}
          />
        </>
      )}

      {/* === RANKS TAB === */}
      {tab === 'ranks' && (
        <div className="animate-fade-in">
          <div className="card p-8 mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-indigo-500" />
              </div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display flex-1">Rangi ({ranks.length})</h2>
              <button onClick={openAddRank} className="btn-primary text-sm flex items-center gap-2">
                <Plus className="w-4 h-4" /> Dodaj rangę
              </button>
            </div>

            {ranks.length === 0 ? <p className="text-sm text-zinc-400 italic text-center py-6">Brak rang</p> : (
              <div className="space-y-2">
                {ranks.map(r => (
                  <div key={r.id} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-bold text-zinc-900 dark:text-white">{r.name}</span>
                      {r.description && <span className="text-xs text-zinc-400 ml-2">{r.description}</span>}
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400">ID:{r.id}</span>
                    <button onClick={() => openEditRank(r)} className="btn-icon-indigo"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteRank(r)} className="btn-icon-red"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <RankModal
            isOpen={rankModalOpen}
            onClose={closeRankModal}
            rank={editingRank}
            onSaved={onRankSaved}
          />
        </div>
      )}

      {/* === USERS TAB === */}
      {tab === 'users' && (
        <div className="card overflow-hidden">
          {editingUserRanks && (
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-indigo-50 dark:bg-indigo-500/10">
              <div className="flex items-center gap-3 flex-wrap">
                <Shield className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">Rangi: {editingUserRanks.name}</span>
                <div className="flex flex-wrap gap-1.5">
                  {ranks.map(r => {
                    const active = editingUserRanks.rankIds.includes(r.id);
                    return (
                      <button key={r.id} type="button"
                        onClick={() => setEditingUserRanks(prev => ({ ...prev, rankIds: active ? prev.rankIds.filter(x => x !== r.id) : [...prev.rankIds, r.id] }))}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-all ${active ? 'text-white border-transparent' : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-300 dark:border-zinc-600'}`}
                        style={active ? { backgroundColor: r.color, borderColor: r.color } : {}}>
                        {r.name}
                      </button>
                    );
                  })}
                </div>
                <div className="ml-auto flex gap-2">
                  <button onClick={async () => {
                    try {
                      await api.setUserRanks(editingUserRanks.userId, editingUserRanks.rankIds);
                      setUserRanks(prev => ({ ...prev, [editingUserRanks.userId]: editingUserRanks.rankIds }));
                      setEditingUserRanks(null);
                    } catch (err) { toast.error('Błąd: ' + err.message); }
                  }} className="btn-ghost-primary">Zapisz</button>
                  <button onClick={() => setEditingUserRanks(null)} className="btn-ghost">Anuluj</button>
                </div>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Użytkownik</th>
                  <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Rola</th>
                  <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Widz kategorii</th>
                  <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Redaktor kategorii</th>
                  {ranks.length > 0 && <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Rangi</th>}
                  <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Metoda</th>
                  <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Email</th>
                  <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Ostatnio</th>
                  <th className="text-right px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const userRoles = (() => { try { return JSON.parse(u.discord_roles || '[]'); } catch { return []; } })();
                  const isDevOnly = u.role === 'dev';
                  const assignedRankIds = userRanks[u.id] || [];
                  const viewerCats = isDevOnly ? cats : cats.filter(cat => {
                    const { vm, em } = parseModes(cat.access_mode);
                    if (vm === 'public') return true;
                    let canView = false;
                    if (vm === 'roles') {
                      const vRIds = (cat.access || []).filter(a => a.access_type === 'viewer').map(a => a.discord_role_id);
                      const vKIds = (cat.rank_access || []).filter(a => a.access_type === 'viewer').map(a => a.rank_id);
                      canView = userRoles.some(r => vRIds.includes(r)) || assignedRankIds.some(r => vKIds.includes(r));
                    }
                    if (!canView && em === 'roles') {
                      const eRIds = (cat.access || []).filter(a => a.access_type === 'editor').map(a => a.discord_role_id);
                      const eKIds = (cat.rank_access || []).filter(a => a.access_type === 'editor').map(a => a.rank_id);
                      if (userRoles.some(r => eRIds.includes(r)) || assignedRankIds.some(r => eKIds.includes(r))) canView = true;
                    }
                    return canView;
                  });
                  const editorCats = isDevOnly ? cats : cats.filter(cat => {
                    const { em } = parseModes(cat.access_mode);
                    if (em !== 'roles') return false;
                    const eRIds = (cat.access || []).filter(a => a.access_type === 'editor').map(a => a.discord_role_id);
                    const eKIds = (cat.rank_access || []).filter(a => a.access_type === 'editor').map(a => a.rank_id);
                    return userRoles.some(r => eRIds.includes(r)) || assignedRankIds.some(r => eKIds.includes(r));
                  });
                  return (
                    <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <img src={u.avatar || `https://ui-avatars.com/api/?name=${u.display_name || u.username}&background=6366f1&color=fff`} alt="" className="w-7 h-7 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700" />
                          <div>
                            <p className="text-sm font-bold text-zinc-900 dark:text-white">{u.display_name || u.username}</p>
                            <p className="text-[10px] text-zinc-500 font-mono">@{u.username} • ID:{u.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold border ${roleBadgeClass(u.role)}`}>{u.role?.toUpperCase()}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {isDevOnly ? (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Wszystkie</span>
                          ) : viewerCats.length === 0 ? (
                            <span className="text-[10px] text-zinc-400">—</span>
                          ) : viewerCats.map(c => (
                            <span key={c.id} className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded">{c.name}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {isDevOnly ? (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Wszystkie</span>
                          ) : editorCats.length === 0 ? (
                            <span className="text-[10px] text-zinc-400">—</span>
                          ) : editorCats.map(c => (
                            <span key={c.id} className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded">{c.name}</span>
                          ))}
                        </div>
                      </td>
                      {ranks.length > 0 && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 flex-wrap max-w-[160px]">
                            {assignedRankIds.length === 0 ? (
                              <span className="text-[10px] text-zinc-400">—</span>
                            ) : ranks.filter(r => assignedRankIds.includes(r.id)).map(r => (
                              <span key={r.id} className="text-[10px] font-medium px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: r.color }}>{r.name}</span>
                            ))}
                            <button onClick={() => setEditingUserRanks({ userId: u.id, name: u.display_name || u.username, rankIds: [...assignedRankIds] })}
                              className="btn-icon-indigo !p-0.5 ml-0.5" title="Edytuj rangi">
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3 text-xs text-zinc-500">{u.auth_method}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500 font-mono truncate max-w-[160px]">{u.email || u.discord_email || '—'}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500 font-mono">{formatDate(u.last_login)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={async () => {
                            if (!(await confirm(`Usunąć konto "${u.display_name || u.username}"?\n\nTo nie jest ban - użytkownik może zalogować się ponownie.`, { danger: true, confirmLabel: 'Usuń' }))) return;
                            try {
                              await api.deleteUser(u.id);
                              setUsers(prev => prev.filter(x => x.id !== u.id));
                              setAllUsers(prev => prev.filter(x => x.id !== u.id));
                            } catch (err) { toast.error('Błąd: ' + err.message); }
                          }}
                          className="btn-icon-red"
                          title="Usuń konto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============ ZGŁOSZENIA ============ */}
      {tab === 'reports' && (
        <div className="animate-fade-in">
          <div className="flex flex-wrap gap-2 mb-4">
            {[['pending', 'Oczekujące'], ['resolved', 'Rozstrzygnięte'], ['dismissed', 'Odrzucone'], ['all', 'Wszystkie']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setReportStatusFilter(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${reportStatusFilter === key ? 'bg-violet-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {reportsLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-violet-500 animate-spin" /></div>
          ) : commentReports.length === 0 ? (
            <div className="card p-8 text-center"><p className="text-zinc-400 text-sm">Brak zgłoszeń.</p></div>
          ) : (
            <div className="space-y-3">
              {commentReports.map(r => (
                <div key={r.id} className="card p-5">
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        {REPORT_REASON_LABELS[r.reason] || r.reason}
                      </span>
                      {r.status !== 'pending' && (
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg ${r.status === 'dismissed' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500' : 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'}`}>
                          {r.status === 'dismissed' ? 'Odrzucone' : 'Rozstrzygnięte'}
                        </span>
                      )}
                      {r.video_id && (
                        <Link to={`/video/${r.video_id}`} target="_blank" className="text-xs text-violet-500 hover:text-violet-400 flex items-center gap-1">
                          {r.video_title || `Film #${r.video_id}`} <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono whitespace-nowrap">{formatDate(r.created_at)}</span>
                  </div>

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl mb-2">
                    <p className="text-[10px] text-zinc-400 mb-1">
                      Komentarz {r.comment_author_display_name || r.comment_author_username ? `— ${r.comment_author_display_name || r.comment_author_username}` : ''}
                    </p>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 break-words">
                      {r.comment_deleted ? <span className="italic text-zinc-400">(komentarz już usunięty)</span> : (r.comment_content || <span className="italic text-zinc-400">(komentarz nie istnieje)</span>)}
                    </p>
                  </div>

                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                    Zgłosił: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{r.reporter_display_name || r.reporter_username}</span>
                  </p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-3">{r.description}</p>

                  {r.status === 'pending' && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => resolveReport(r, 'dismiss')}
                        disabled={resolvingReportId === r.id}
                        title="Zgłoszenie jest bezzasadne — komentarz zostaje bez zmian, zgłoszenie oznaczone jako odrzucone."
                        className="btn-ghost text-xs disabled:opacity-50"
                      >
                        Odrzuć zgłoszenie
                      </button>
                      {!r.comment_deleted && (
                        <button
                          onClick={() => resolveReport(r, 'delete_comment')}
                          disabled={resolvingReportId === r.id}
                          title="Treść komentarza znika z widoku, ale wpis zostaje w bazie — odwracalne przez dev."
                          className="btn-sm-danger !py-1.5 !px-3 text-xs disabled:opacity-50"
                        >
                          Ukryj komentarz
                        </button>
                      )}
                      {/* /manage is dev-only (route-level guard), so unlike the old Redaktor-panel
                          copy of this UI, every viewer here already qualifies for hard delete. */}
                      <button
                        onClick={() => resolveReport(r, 'hard_delete')}
                        disabled={resolvingReportId === r.id}
                        title="Trwale usuwa komentarz i jego odpowiedzi z bazy danych — nieodwracalne."
                        className="btn-link-red text-xs px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50"
                      >
                        Usuń trwale (nieodwracalne)
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============ RODO ============ */}
      {tab === 'gdpr' && settings?.gdpr_region && settings.gdpr_region !== 'off' && (
      <div className="animate-fade-in">
        <input ref={gdprFileRef} type="file" accept="application/json" className="hidden" onChange={handleGdprFileSelected} />
        <div className="card p-6">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-1">Zgłoszenia RODO (GDPR / LGPD)</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">
            Eksport danych: pobierz i sprawdź wygenerowany plik (ewentualnie podmień), a następnie zatwierdź - wtedy staje się dostępny do pobrania w profilu użytkownika.
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
                            <button onClick={() => handleGdprApprove(r.id, r.type)} disabled={busy} className="btn-sm-primary disabled:opacity-50">Zatwierdź</button>
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

      {/* ============ REGULAMIN ============ */}
      {tab === 'tos' && (
      <div className="animate-fade-in">
        <div className="card p-6">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display">Regulamin platformy</h3>
            {tosUpdatedAt && (
              <span className="text-xs text-zinc-400 shrink-0">Ostatnia aktualizacja: {new Date(tosUpdatedAt).toLocaleString('pl-PL')}</span>
            )}
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Zapisanie ustawia nową datę aktualizacji - każde konto, które zaakceptowało regulamin wcześniej, będzie musiało zaakceptować go ponownie.
          </p>
          {tosLoading ? (
            <div className="h-96 skeleton rounded-2xl" />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2 font-display">Treść (Markdown)</p>
                <textarea
                  value={tosContent}
                  onChange={e => setTosContent(e.target.value)}
                  className="input-field font-mono text-xs resize-y h-[32rem]"
                />
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2 font-display">Podgląd</p>
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 h-[32rem] overflow-y-auto text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed bg-zinc-50 dark:bg-zinc-950">
                  {renderMarkdown(tosContent)}
                </div>
              </div>
            </div>
          )}
          <button onClick={saveTos} disabled={tosSaving || tosLoading} className="btn-primary text-sm mt-4">
            {tosSaving ? 'Zapisywanie...' : 'Zapisz regulamin'}
          </button>
        </div>

        {/* Markdown cheat sheet */}
        <div className="card p-6 mt-4">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-4">Ściągawka formatowania (markdown)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Wpisz to</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Efekt</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                  <td className="px-3 py-3 align-top"><code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">## Nagłówek</code></td>
                  <td className="px-3 py-3 align-top text-zinc-600 dark:text-zinc-400"><span className="font-semibold text-zinc-900 dark:text-white">Nagłówek</span> (pogrubiony, wyróżniony tytuł sekcji)</td>
                </tr>
                <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                  <td className="px-3 py-3 align-top"><code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded whitespace-pre-line">{'Akapit tekstu,\n\npotem pusta linia,\ni kolejny akapit.'}</code></td>
                  <td className="px-3 py-3 align-top text-zinc-600 dark:text-zinc-400">Dwa osobne akapity, oddzielone odstępem. Pojedyncze przejście do nowej linii bez pustej linii nie rozdziela akapitów.</td>
                </tr>
                <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                  <td className="px-3 py-3 align-top"><code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded whitespace-pre-line">{'- Pierwsza pozycja\n- Druga pozycja'}</code></td>
                  <td className="px-3 py-3 align-top text-zinc-600 dark:text-zinc-400">
                    <ul className="list-disc list-inside marker:text-violet-500">
                      <li>Pierwsza pozycja</li>
                      <li>Druga pozycja</li>
                    </ul>
                    (wypunktowana lista)
                  </td>
                </tr>
                <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                  <td className="px-3 py-3 align-top"><code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">**pogrubienie**</code></td>
                  <td className="px-3 py-3 align-top text-zinc-600 dark:text-zinc-400"><strong>pogrubienie</strong></td>
                </tr>
                <tr>
                  <td className="px-3 py-3 align-top"><code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{'[etykieta](https://alleria.pl)'}</code></td>
                  <td className="px-3 py-3 align-top text-zinc-600 dark:text-zinc-400"><span className="text-violet-500 underline">etykieta</span> (klikalny link)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* ============ USTAWIENIA ============ */}
      {tab === 'settings' && (
      <div className="animate-fade-in">
        {/* .env sanity check warning */}
        {envCheck && (envCheck.deprecated?.length > 0 || envCheck.suspicious?.length > 0) && (
          <div className="card p-8 h-full flex flex-col xl:col-span-2 !border-amber-300 dark:!border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/[0.06] mb-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-amber-100 dark:bg-amber-500/10 rounded-2xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Posiadasz starą wersję pliku .env</h3>
                {envCheck.deprecated?.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-1.5">
                      Poniższe zmienne są teraz zarządzane z poziomu tej zakładki i można je bezpiecznie usunąć z <code className="font-mono text-xs">.env</code>
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

        {/* ============ WYGLĄD I TREŚĆ ============ */}
        <SettingsSectionHeader id="settings-section-display" icon={LayoutGrid} label="Wygląd i treść" first />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Content length limits */}
          <div className="card p-8 h-full flex flex-col xl:col-span-2">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-violet-50 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center shrink-0">
                <Settings className="w-6 h-6 text-violet-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Limity treści</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                  Maksymalna długość znaków.
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

          {/* Videos per page + grid columns */}
          <div className="card p-8 h-full flex flex-col">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center shrink-0">
                <LayoutGrid className="w-6 h-6 text-emerald-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Wyświetlanie filmów</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                  Ustawienia wizualne siatki filmów. "Maks. kolumn siatki" - limit dla szerokich ekranów, na węższych ekranach redukuje się wg. min. szerok. karty.
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
                  Liczba wpisów na jednej stronie logów.
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

          {/* Custom YouTube player overlay */}
          <div className="card p-8 h-full flex flex-col">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-red-50 dark:bg-red-500/10 rounded-2xl flex items-center justify-center shrink-0">
                <Play className="w-6 h-6 text-red-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Odtwarzacz YouTube</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                  Nakładka UI na player YT (<i>eksperymentalna</i>).
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

          {/* Top bar visibility */}
          <div className="card p-8 h-full flex flex-col">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-pink-50 dark:bg-pink-500/10 rounded-2xl flex items-center justify-center shrink-0">
                <PanelTop className="w-6 h-6 text-pink-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Górny pasek</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                  <b>WŁĄCZONY</b>: tytuł strony, wyszukiwarka i profil użytkownika w górnym pasku.
                  <br />
                  <b>WYŁĄCZONY</b>: profil w lewym dolnym rogu, a każda strona pokazuje własny tytuł, brak SmartSearch.
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

          {/* Custom avatars */}
          <div className="card p-8 h-full flex flex-col">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-lime-50 dark:bg-lime-500/10 rounded-2xl flex items-center justify-center shrink-0">
                <Image className="w-6 h-6 text-lime-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Własne avatary</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                  Zezwól zwykłym userom (member) na przesyłanie własnego zdjęcia profilowego. Redaktorzy i devowie mogą zawsze.
                </p>
                <ToggleSwitch
                  checked={!!settings?.allow_custom_avatars}
                  onChange={toggleCustomAvatars}
                  disabled={!settings || savingSettings}
                  label={settings == null ? 'Ładowanie...' : (settings.allow_custom_avatars ? 'Własne avatary: WŁĄCZONE' : 'Własne avatary: WYŁĄCZONE')}
                />
              </div>
            </div>
          </div>
          </div>

        {/* ============ BEZPIECZEŃSTWO I PRYWATNOŚĆ ============ */}
        <SettingsSectionHeader id="settings-section-security" icon={ShieldCheck} label="Bezpieczeństwo i prywatność" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
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
                  Ochrona przed przed podatnością SSRF.
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
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Region RODO (GDPR / LGPD)</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                  Zgodność z przepisami RODO (GDPR / LGPD). Włącza sekcję "Twoje dane" w profilu (eksport danych, usunięcie konta).
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

          {/* Iframe embedding */}
          <div className="card p-8 h-full flex flex-col xl:col-span-2">
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
          </div>

        {/* ============ POWIADOMIENIA EMAIL ============ */}
        <SettingsSectionHeader id="settings-section-email" icon={Mail} label="Ustawienia serwera E-mail" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* SMTP / Email */}
          <div className="card p-8 h-full flex flex-col xl:col-span-2">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center shrink-0">
                <Mail className="w-6 h-6 text-blue-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Konfiguracja SMTP (wysyłka e-mail)</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                  Konfiguracja serwera SMTP używanego do powiadomień email o nowych filmach oraz eksportu danych RODO.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="label-field">Host</label>
                    <input type="text" value={smtpForm.host} onChange={e => setSmtpForm(f => ({ ...f, host: e.target.value }))} className="input-field !py-3 text-sm font-mono" placeholder="smtp.example.com" />
                  </div>
                  <div>
                    <label className="label-field">Port</label>
                    <input type="text" value={smtpForm.port} onChange={e => setSmtpForm(f => ({ ...f, port: e.target.value }))} className="input-field !py-3 text-sm font-mono" placeholder="587" />
                  </div>
                  <div>
                    <label className="label-field">Użytkownik</label>
                    <input type="text" value={smtpForm.user} onChange={e => setSmtpForm(f => ({ ...f, user: e.target.value }))} className="input-field !py-3 text-sm font-mono" />
                  </div>
                  <div>
                    <label className="label-field">Hasło</label>
                    <input type="password" value={smtpForm.password} onChange={e => setSmtpForm(f => ({ ...f, password: e.target.value }))} className="input-field !py-3 text-sm font-mono" />
                  </div>
                  <div>
                    <label className="label-field">Nadawca (From)</label>
                    <input type="text" value={smtpForm.from} onChange={e => setSmtpForm(f => ({ ...f, from: e.target.value }))} className="input-field !py-3 text-sm font-mono" placeholder="Alleria Filmy <no-reply@alleria.pl>" />
                  </div>
                  <div className="flex items-end">
                    <ToggleSwitch
                      checked={smtpForm.secure}
                      onChange={() => setSmtpForm(f => ({ ...f, secure: !f.secure }))}
                      label={smtpForm.secure ? 'SSL/TLS: WŁĄCZONE' : 'SSL/TLS: WYŁĄCZONE'}
                    />
                  </div>
                </div>
                <button onClick={saveSmtpSettings} disabled={savingSettings} className="btn-primary text-sm mb-4 disabled:opacity-50">
                  {savingSettings ? 'Zapisywanie...' : 'Zapisz SMTP'}
                </button>
                <div className="flex items-center gap-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <input
                    type="email"
                    value={testEmailTo}
                    onChange={e => setTestEmailTo(e.target.value)}
                    placeholder="adres@testowy.pl (puste = Twój zapisany e-mail)"
                    className="input-field !py-2.5 text-sm flex-1"
                  />
                  <button onClick={sendTestEmail} disabled={testingEmail} className="btn-secondary text-sm shrink-0 disabled:opacity-50">
                    {testingEmail ? 'Wysyłanie...' : 'Wyślij testowy e-mail'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Email templates */}
          <div className="card p-8 h-full flex flex-col xl:col-span-2">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-violet-50 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6 text-violet-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Szablony e-mail</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                  Zmień format wysyłanych wiadomości z platformy. Nnagłówek, kolory, stopka są predefiniowane i jednakowe dla wszystkich e-maili. <code className="font-mono text-xs">{'{tagi}'}</code>.
                </p>
                <button type="button" onClick={() => setShowEmailTemplates(v => !v)} className="btn-secondary text-sm">
                  {showEmailTemplates ? 'Ukryj szablony e-mail' : 'Zarządzaj szablonami e-mail'}
                </button>

                {showEmailTemplates && (
                  <div className="mt-6 space-y-6">
                    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-6">
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-1">Nowy film w kategorii</h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                        Treść powiadomienia o nowym filmie.
                      </p>
                      <textarea value={newVideoTemplate} onChange={e => setNewVideoTemplate(e.target.value)} className="input-field font-mono resize-y h-32 min-h-[6rem]" />
                      <p className="text-[9px] text-zinc-400 mt-1">Znaczniki: {'{title}'} {'{author}'} {'{category}'} {'{description}'} {'{date}'} {'{id}'} {'{url}'} {'{thumbnail}'}</p>
                      <div className="flex gap-2 mt-3">
                        <button onClick={saveNewVideoTemplate} disabled={savingNewVideoTemplate} className="btn-primary text-sm disabled:opacity-50">
                          {savingNewVideoTemplate ? 'Zapisywanie...' : 'Zapisz'}
                        </button>
                        <button type="button" onClick={() => window.open(api.emailTemplatePreviewUrl('new_video', newVideoTemplate), '_blank')} className="btn-secondary text-sm">
                          Podgląd
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-6">
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-1">Zgłoszenie RODO (do administracji)</h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                        Wysyłane do kont z rolą Developer, gdy użytkownik złoży zgłoszenie RODO/GDPR.
                      </p>
                      <textarea value={gdprTemplate} onChange={e => setGdprTemplate(e.target.value)} className="input-field font-mono resize-y h-24 min-h-[5rem]" />
                      <p className="text-[9px] text-zinc-400 mt-1">Znaczniki: {'{user}'} {'{type}'} {'{url}'}</p>
                      <div className="flex gap-2 mt-3">
                        <button onClick={saveGdprTemplate} disabled={savingGdprTemplate} className="btn-primary text-sm disabled:opacity-50">
                          {savingGdprTemplate ? 'Zapisywanie...' : 'Zapisz'}
                        </button>
                        <button type="button" onClick={() => window.open(api.emailTemplatePreviewUrl('gdpr_notify', gdprTemplate), '_blank')} className="btn-secondary text-sm">
                          Podgląd
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-6">
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-1">RODO — eksport gotowy</h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                        Wysyłane do użytkownika, gdy administrator zatwierdzi jego zgłoszenie eksportu danych.
                      </p>
                      <textarea value={gdprResultExportTemplate} onChange={e => setGdprResultExportTemplate(e.target.value)} className="input-field font-mono resize-y h-24 min-h-[5rem]" />
                      <div className="flex gap-2 mt-3">
                        <button onClick={saveGdprResultExportTemplate} disabled={savingGdprResultExportTemplate} className="btn-primary text-sm disabled:opacity-50">
                          {savingGdprResultExportTemplate ? 'Zapisywanie...' : 'Zapisz'}
                        </button>
                        <button type="button" onClick={() => window.open(api.emailTemplatePreviewUrl('gdpr_result_export', gdprResultExportTemplate), '_blank')} className="btn-secondary text-sm">
                          Podgląd
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-6">
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-1">RODO — konto usunięte</h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                        Wysyłane do użytkownika, gdy administrator zatwierdzi jego zgłoszenie usunięcia konta (przed anonimizacją).
                      </p>
                      <textarea value={gdprResultDeletionTemplate} onChange={e => setGdprResultDeletionTemplate(e.target.value)} className="input-field font-mono resize-y h-24 min-h-[5rem]" />
                      <div className="flex gap-2 mt-3">
                        <button onClick={saveGdprResultDeletionTemplate} disabled={savingGdprResultDeletionTemplate} className="btn-primary text-sm disabled:opacity-50">
                          {savingGdprResultDeletionTemplate ? 'Zapisywanie...' : 'Zapisz'}
                        </button>
                        <button type="button" onClick={() => window.open(api.emailTemplatePreviewUrl('gdpr_result_deletion', gdprResultDeletionTemplate), '_blank')} className="btn-secondary text-sm">
                          Podgląd
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>

        {/* ============ LOGOWANIE ============ */}
        <SettingsSectionHeader id="settings-section-login" icon={LogIn} label="Logowanie" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="card p-6 xl:col-span-2 !border-blue-200 dark:!border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/[0.06]">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Z poziomu panelu można zdefiniować połączenie z TeamSpeak 3/6 (host, port, dane logowania, grupy) oraz - dla Discorda - wyłącznie ID roli <strong>Member</strong> i ogólnego <strong>Redaktora</strong>. Wymaga to ustawienia odpowiedniej flagi
                (<code className="font-mono text-xs">TS_CONFIG_SOURCE</code> / <code className="font-mono text-xs">DISCORD_ROLES_CONFIG_SOURCE</code>) na <code className="font-mono text-xs">panel</code> w <code className="font-mono text-xs">.env</code> i restartu kontenera.
                Pozostała konfiguracja Discord (Client ID/Secret, Bot Token, Guild ID, Redirect URI, rola Developera) jest zawsze wyłącznie w <code className="font-mono text-xs">.env</code> - bez możliwości podglądu ani edycji tutaj.
              </p>
            </div>
          </div>

          {/* Bot nickname (shared TS3/TS6) */}
          <div className="card p-8 h-full flex flex-col">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/10 rounded-xl flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-violet-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display">Nazwa bota ServerQuery</h3>
                  <span className="text-[11px] text-zinc-400 font-normal">(wspólna dla TS3 i TS6)</span>
                  {tsLocked && <span className={sourceBadgeClass}>Źródło: .env</span>}
                </div>
                {tsLocked && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">Sterowane przez <code className="font-mono">.env</code>. Ustaw <code className="font-mono">TS_CONFIG_SOURCE=panel</code> i zrestartuj, aby edytować tutaj.</p>
                )}
                <div className="flex gap-2 max-w-md">
                  <input type="text" disabled={tsLocked} value={botNickname} onChange={e => setBotNickname(e.target.value)}
                    className="input-field !py-2.5 text-sm flex-1 disabled:opacity-50" placeholder="ALLERIA VIDEOS PLATFORM" />
                  <button onClick={saveBotNickname} disabled={tsLocked || savingSettings || settings == null} className="btn-primary text-sm shrink-0 disabled:opacity-50">Zapisz</button>
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

          {/* TeamSpeak 6 */}
          <div className="card p-8 h-full flex flex-col">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center shrink-0">
                <Headphones className="w-6 h-6 text-blue-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display">TeamSpeak 6</h3>
                  {tsLocked && <span className={sourceBadgeClass}>Źródło: .env</span>}
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
                  {tsLocked && <span className={sourceBadgeClass}>Źródło: .env</span>}
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
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display">Discord - role Member / Redaktor</h3>
                  {discordRolesLocked && <span className={sourceBadgeClass}>Źródło: .env</span>}
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
                              title={r.role_name ? undefined : 'Nie udało się pobrać nazwy roli z Discorda - pokazano surowe ID'}>
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
      </div>
      )}
    </div>
  );
}
