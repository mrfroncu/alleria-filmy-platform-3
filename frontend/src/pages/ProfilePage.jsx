import React, { useState, useEffect } from 'react';
import { User, Film, Eye, Heart, Calendar, Shield, Pencil, Check, X, Globe, Server, RefreshCw, Link2, CheckCircle2, AlertTriangle, AlertCircle, Info, ChevronDown, ExternalLink, Download, Trash2, Clock, ShieldCheck, Mail } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate, parseTsError } from '../utils/helpers';
import { roleBadgeClass } from '../utils/roleColors';
import { useSettings } from '../contexts/SettingsContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useToast } from '../contexts/ToastContext';
import TsChallengeModal from '../components/TsChallengeModal';

export default function ProfilePage() {
  const { config: siteConfig } = useSettings();
  const confirm = useConfirm();
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingAvatarSource, setSavingAvatarSource] = useState(false);
  const [refreshingDiscord, setRefreshingDiscord] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState(null);
  const [config, setConfig] = useState({ limitDisplayName: 50, limitBio: 1000 });
  const [editEmail, setEditEmail] = useState('');
  const [editEmailNotifications, setEditEmailNotifications] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  // Account linking
  const [linkMsg, setLinkMsg] = useState(null); // { type: 'success'|'error', text }
  const [linkingTs, setLinkingTs] = useState(null); // 'teamspeak' | 'teamspeak3' | null
  const [tsLinkChallenge, setTsLinkChallenge] = useState(null); // { challengeId, method, nickname, version }
  const [tsLinkCode, setTsLinkCode] = useState('');
  const [tsLinkError, setTsLinkError] = useState(null);
  const [tsLinkLoading, setTsLinkLoading] = useState(false);
  const [pendingMerge, setPendingMerge] = useState(null); // { mergeId, secondaryLabel, stats, identities }
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState(null);
  const [ts3ConnectError, setTs3ConnectError] = useState(null);
  const [ts6ConnectError, setTs6ConnectError] = useState(null);
  const [tsInfoOpen, setTsInfoOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(null); // 'discord' | 'teamspeak3' | 'teamspeak' | null

  // GDPR / RODO
  const [gdprRequests, setGdprRequests] = useState([]);
  const [gdprBusy, setGdprBusy] = useState(false);
  const [gdprMsg, setGdprMsg] = useState(null);

  useEffect(() => { api.getConfig().then(c => setConfig(prev => ({ ...prev, ...c }))).catch(() => {}); }, []);

  // Discord link redirect lands back here with ?linked=discord / ?error=... / ?mergeId=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linked = params.get('linked');
    const err = params.get('error');
    const mergeId = params.get('mergeId');
    if (linked === 'discord') setLinkMsg({ type: 'success', text: 'Połączono konto Discord.' });
    else if (err === 'already_linked_discord') setLinkMsg({ type: 'error', text: 'To konto ma już połączony inny Discord.' });
    else if (err === 'link_failed') setLinkMsg({ type: 'error', text: 'Nie udało się połączyć konta. Spróbuj ponownie.' });
    if (mergeId) {
      api.getPendingMerge(mergeId).then(data => setPendingMerge({ mergeId, ...data })).catch(() => {
        setLinkMsg({ type: 'error', text: 'Prośba o połączenie kont wygasła. Spróbuj ponownie.' });
      });
    }
    if (linked || err || mergeId) {
      window.history.replaceState({}, '', '/profile');
    }
  }, []);

  const load = () => {
    setLoading(true);
    api.getProfile().then(p => {
      setProfile(p);
      setEditName(p.display_name || '');
      setEditBio(p.bio || '');
      setEditEmail(p.email || p.discordEmail || '');
      setEditEmailNotifications(!!p.emailNotifications);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const loadGdprRequests = () => {
    api.getGdprRequests().then(setGdprRequests).catch(() => {});
  };
  useEffect(() => {
    if (siteConfig.gdprRegion && siteConfig.gdprRegion !== 'off') loadGdprRequests();
  }, [siteConfig.gdprRegion]);

  const handleGdprExport = async () => {
    if (gdprBusy) return;
    if (!(await confirm('Zażądać kopii swoich danych?\n\nPlik zostanie przygotowany i po weryfikacji przez administratora (maksymalnie do 30 dni) pojawi się tu do pobrania.'))) return;
    setGdprBusy(true);
    setGdprMsg(null);
    try {
      await api.gdprRequestExport();
      setGdprMsg({ type: 'success', text: 'Zgłoszenie eksportu danych zostało złożone.' });
      loadGdprRequests();
    } catch (err) {
      setGdprMsg({ type: 'error', text: 'Błąd: ' + err.message });
    }
    setGdprBusy(false);
  };

  const handleGdprDeletion = async () => {
    if (gdprBusy) return;
    if (!(await confirm('Zażądać usunięcia konta?\n\nPo zatwierdzeniu przez administratora (maksymalnie do 30 dni) Twoje dane osobowe zostaną zanonimizowane, a konto wylogowane wszędzie. Komentarze i dodane filmy zostaną — bez powiązania z Twoją tożsamością. Tej operacji po zatwierdzeniu nie można cofnąć.', { danger: true, confirmLabel: 'Usuń konto' }))) return;
    setGdprBusy(true);
    setGdprMsg(null);
    try {
      await api.gdprRequestDeletion();
      setGdprMsg({ type: 'success', text: 'Zgłoszenie usunięcia konta zostało złożone.' });
      loadGdprRequests();
    } catch (err) {
      setGdprMsg({ type: 'error', text: 'Błąd: ' + err.message });
    }
    setGdprBusy(false);
  };

  const handleCancelGdpr = async (id) => {
    if (gdprBusy) return;
    setGdprBusy(true);
    try {
      await api.cancelGdprRequest(id);
      loadGdprRequests();
    } catch (err) {
      setGdprMsg({ type: 'error', text: 'Błąd: ' + err.message });
    }
    setGdprBusy(false);
  };

  const handleDownloadGdpr = async (id) => {
    try {
      const data = await api.downloadGdprExport(id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `moje-dane-alleria-${id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setGdprMsg({ type: 'error', text: 'Błąd: ' + err.message });
    }
  };

  const gdprDaysLeft = (dueAt) => Math.ceil((new Date(dueAt) - new Date()) / 86400000);
  const gdprTypeLabel = (t) => t === 'export' ? 'Eksport danych' : 'Usunięcie konta';
  const gdprStatusLabel = (s) => s === 'pending' ? 'Oczekujące' : s === 'approved' ? 'Zatwierdzone' : 'Odrzucone';

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateProfile({ display_name: editName, bio: editBio });
      setProfile(prev => ({ ...prev, display_name: editName, bio: editBio }));
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast.error('Błąd: ' + err.message);
    }
    setSaving(false);
  };

  const handleAvatarSourceChange = async (source) => {
    if (!profile || profile.avatar_source === source || savingAvatarSource) return;
    setSavingAvatarSource(true);
    try {
      await api.updateProfile({ avatar_source: source });
      load();
    } catch (err) {
      toast.error('Błąd: ' + err.message);
    }
    setSavingAvatarSource(false);
  };

  const handleSaveEmail = async () => {
    setSavingEmail(true);
    try {
      await api.updateProfile({ email: editEmail, email_notifications: editEmailNotifications });
      toast.success('Zapisano ustawienia e-mail.');
      load();
    } catch (err) {
      toast.error('Błąd: ' + err.message);
    }
    setSavingEmail(false);
  };

  const handleRefreshDiscord = async () => {
    setRefreshingDiscord(true);
    setRefreshMsg(null);
    try {
      const r = await api.refreshDiscordAvatar();
      await load();
      setRefreshMsg(r.has_guild_avatar ? 'Wykryto avatar serwerowy — możesz go teraz wybrać.' : 'Odświeżono — brak avatara serwerowego na tym koncie.');
    } catch (err) {
      setRefreshMsg('Błąd: ' + err.message);
    }
    setRefreshingDiscord(false);
    setTimeout(() => setRefreshMsg(null), 4000);
  };

  const handleLinkDiscord = () => {
    window.location.href = '/auth/discord?mode=link&returnTo=/profile';
  };

  const handleLinkTs = async (method) => {
    setLinkingTs(method);
    if (method === 'teamspeak3') setTs3ConnectError(null); else setTs6ConnectError(null);
    try {
      const loginFn = method === 'teamspeak3' ? api.loginTeamspeak3 : api.loginTeamspeak;
      const res = await loginFn({ linkMode: true });
      if (res?.challenge) {
        setTsLinkChallenge({
          challengeId: res.challengeId, method,
          nickname: res.nickname, version: method === 'teamspeak3' ? 'TeamSpeak 3' : 'TeamSpeak 6',
          multipleCandidates: res.multipleCandidates, count: res.count,
        });
        setTsLinkCode('');
        setTsLinkError(null);
      }
    } catch (err) {
      const friendly = parseTsError(err.message, method === 'teamspeak3' ? 'TeamSpeak 3' : 'TeamSpeak 6');
      if (method === 'teamspeak3') setTs3ConnectError(friendly); else setTs6ConnectError(friendly);
    }
    setLinkingTs(null);
  };

  const cancelTsLinkChallenge = () => {
    setTsLinkChallenge(null);
    setTsLinkCode('');
    setTsLinkError(null);
  };

  const handleTsLinkSubmit = async () => {
    if (!tsLinkChallenge || tsLinkCode.trim().length < 6 || tsLinkLoading) return;
    setTsLinkLoading(true);
    setTsLinkError(null);
    try {
      const verifyFn = tsLinkChallenge.method === 'teamspeak3' ? api.verifyTeamspeak3 : api.verifyTeamspeak;
      const res = await verifyFn(tsLinkChallenge.challengeId, tsLinkCode.trim());
      setTsLinkChallenge(null);
      setTsLinkCode('');
      if (res?.mergeNeeded) {
        setPendingMerge({ mergeId: res.mergeId, secondaryLabel: res.secondaryLabel, stats: res.stats });
      } else {
        const label = res?.linked === 'teamspeak3' ? 'TeamSpeak 3' : 'TeamSpeak 6';
        setLinkMsg({ type: 'success', text: `Połączono konto ${label}.` });
        load();
      }
    } catch (err) {
      setTsLinkError(err.message || 'Nieprawidłowy kod.');
    }
    setTsLinkLoading(false);
  };

  const handleConfirmMerge = async () => {
    if (!pendingMerge || mergeBusy) return;
    setMergeBusy(true);
    setMergeError(null);
    try {
      await api.confirmMerge(pendingMerge.mergeId);
      setPendingMerge(null);
      setLinkMsg({ type: 'success', text: 'Konta zostały połączone.' });
      load();
    } catch (err) {
      setMergeError(err.message || 'Nie udało się połączyć kont.');
    }
    setMergeBusy(false);
  };

  const handleCancelMerge = async () => {
    if (!pendingMerge) return;
    const mergeId = pendingMerge.mergeId;
    setPendingMerge(null);
    setMergeError(null);
    try { await api.cancelMerge(mergeId); } catch (_) {}
  };

  const handleUnlink = async (method, label) => {
    if (unlinking) return;
    if (!(await confirm(`Rozłączyć konto ${label}?\n\nBędziesz mógł zalogować się tą metodą ponownie — powstanie nowe, osobne konto, albo połączysz ją z innym kontem od nowa. Historia na TYM koncie (komentarze, obejrzane filmy, dodane przez Ciebie filmy jako redaktor) zostaje bez zmian.`))) return;
    setUnlinking(method);
    try {
      await api.unlinkAccount(method);
      setLinkMsg({ type: 'success', text: `Rozłączono konto ${label}.` });
      load();
    } catch (err) {
      setLinkMsg({ type: 'error', text: 'Błąd: ' + (err.message || 'Nie udało się rozłączyć konta.') });
    }
    setUnlinking(null);
  };

  if (loading) {
    return (
      <div className="p-6 sm:p-10 max-w-3xl mx-auto page-enter">
        <div className="card p-10"><div className="h-40 skeleton rounded-2xl" /></div>
      </div>
    );
  }

  if (!profile) return null;

  const identityCount = [profile.has_discord, profile.has_teamspeak3, profile.has_teamspeak6].filter(Boolean).length;
  const canUnlink = identityCount > 1;

  return (
    <div className="p-6 sm:p-10 max-w-3xl mx-auto page-enter">
      <div className="mb-10">
        {!siteConfig.showTopBar && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/10 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-violet-500" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Mój profil</h1>
          </div>
        )}
      </div>

      {saved && (
        <div className="mb-6 p-4 rounded-2xl border bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-sm font-medium animate-slide-up flex items-center gap-2">
          <Check className="w-4 h-4" /> Profil zaktualizowany pomyślnie.
        </div>
      )}

      {linkMsg && (
        <div className={`mb-6 p-4 rounded-2xl border text-sm font-medium animate-slide-up flex items-center gap-2 ${
          linkMsg.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-300'
        }`}>
          {linkMsg.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
          {linkMsg.text}
        </div>
      )}

      {/* Profile Card */}
      <div className="card p-8 mb-6">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <img
            src={profile.avatar || `https://ui-avatars.com/api/?name=${profile.display_name}&background=6366f1&color=fff&size=160`}
            alt=""
            className="w-24 h-24 rounded-2xl shadow-lg border-2 border-zinc-200 dark:border-zinc-700 object-cover"
          />
          <div className="flex-1">
            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="label-field">Wyświetlana nazwa <span className="text-zinc-400 font-normal">({editName.length}/{config.limitDisplayName})</span></label>
                  <input type="text" maxLength={config.limitDisplayName} value={editName} onChange={e => setEditName(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="label-field">O mnie <span className="text-zinc-400 font-normal">({editBio.length}/{config.limitBio})</span></label>
                  <textarea maxLength={config.limitBio} value={editBio} onChange={e => setEditBio(e.target.value)} className="input-field resize-none h-24" placeholder="Napisz coś o sobie..." />
                </div>
                <div className="flex gap-3">
                  <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-2">
                    <Check className="w-4 h-4" /> {saving ? 'Zapisywanie...' : 'Zapisz'}
                  </button>
                  <button onClick={() => { setEditing(false); setEditName(profile.display_name || ''); setEditBio(profile.bio || ''); }} className="btn-secondary text-sm flex items-center gap-2">
                    <X className="w-4 h-4" /> Anuluj
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{profile.display_name}</h2>
                  <span className={`inline-flex px-3 py-1 rounded-xl text-xs font-bold border ${roleBadgeClass(profile.role)}`}>
                    {profile.role?.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-zinc-500 font-mono mb-2">@{profile.username}</p>
                {profile.bio ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">{profile.bio}</p>
                ) : (
                  <p className="text-sm text-zinc-400 italic mb-4">Brak opisu - kliknij edytuj, żeby dodać.</p>
                )}
                <button onClick={() => setEditing(true)} className="btn-link-violet inline-flex items-center gap-2 text-sm">
                  <Pencil className="w-4 h-4" /> Edytuj profil
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Avatar source (accounts with a linked Discord identity only) */}
      {profile.has_discord && (
        <div className="card p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3 mb-1">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display">Źródło avatara</h3>
                <button
                  type="button"
                  onClick={handleRefreshDiscord}
                  disabled={refreshingDiscord}
                  className="btn-link-violet inline-flex items-center gap-1.5 text-xs shrink-0 disabled:opacity-50"
                  title="Pobierz aktualne avatary z Discorda (przydatne, jeśli od ostatniego logowania coś się zmieniło)"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshingDiscord ? 'animate-spin' : ''}`} />
                  {refreshingDiscord ? 'Odświeżanie...' : 'Odśwież dane z Discorda'}
                </button>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                Możesz wybrać źródło avatara, aby zmienić sam avatar musisz zrobić to na Discordzie.
              </p>
              {refreshMsg && (
                <p className={`text-xs font-medium mb-3 ${refreshMsg.startsWith('Błąd') ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{refreshMsg}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleAvatarSourceChange('global')}
                  disabled={savingAvatarSource}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 ${
                    (profile.avatar_source || 'global') !== 'guild'
                      ? 'bg-violet-500 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" /> Globalny (konto Discord)
                </button>
                <button
                  type="button"
                  onClick={() => handleAvatarSourceChange('guild')}
                  disabled={savingAvatarSource || !profile.has_guild_avatar}
                  title={!profile.has_guild_avatar ? 'Brak avatara serwerowego — wymaga Discord Nitro i ustawionego avatara na tym serwerze.' : undefined}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    profile.avatar_source === 'guild'
                      ? 'bg-violet-500 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <Server className="w-3.5 h-3.5" /> Serwerowy (ten serwer)
                </button>
              </div>
              <p className="text-[11px] text-zinc-400 mt-3">
                Avatar serwerowy (ustawiony osobno serwerze Discord społeczności) jest dostępny tylko dla użytkowników z Discord Nitro
                {!profile.has_guild_avatar ? ' — obecnie nie masz ustawionego avatara serwerowego.' : '.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Connected accounts */}
      <div className="card p-6 mb-6">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-1">Połączone konta</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
          Połącz dodatkowe metody logowania, aby móc zalogować się na to samo konto na kilka sposobów.
        </p>
        <div className="space-y-2.5">
          {/* Discord */}
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#5865F2]/10 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#5865F2">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/>
                </svg>
              </div>
              <span className="text-sm font-medium text-zinc-900 dark:text-white">Discord</span>
            </div>
            {profile.has_discord ? (
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Połączone
                </span>
                {canUnlink && (
                  <button onClick={() => handleUnlink('discord', 'Discord')} disabled={unlinking !== null} className="btn-link-red text-xs font-bold disabled:opacity-50">
                    {unlinking === 'discord' ? 'Rozłączanie…' : 'Rozłącz'}
                  </button>
                )}
              </div>
            ) : (
              <button onClick={handleLinkDiscord} className="btn-link-violet inline-flex items-center gap-1.5 text-xs font-bold">
                <Link2 className="w-3.5 h-3.5" /> Połącz
              </button>
            )}
          </div>

          {/* TeamSpeak 3 — a different server from TS6, with its own independent identity;
              linking one has no bearing on the other */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                  <Server className="w-4 h-4 text-zinc-500" />
                </div>
                <span className="text-sm font-medium text-zinc-900 dark:text-white">TeamSpeak 3</span>
              </div>
              {profile.has_teamspeak3 ? (
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Połączone
                  </span>
                  {canUnlink && (
                    <button onClick={() => handleUnlink('teamspeak3', 'TeamSpeak 3')} disabled={unlinking !== null} className="btn-link-red text-xs font-bold disabled:opacity-50">
                      {unlinking === 'teamspeak3' ? 'Rozłączanie…' : 'Rozłącz'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <a
                    href="ts3server://alleria.pl"
                    title="Otwórz alleria.pl w kliencie TS3"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button onClick={() => handleLinkTs('teamspeak3')} disabled={linkingTs !== null} className="btn-link-violet inline-flex items-center gap-1.5 text-xs font-bold disabled:opacity-50">
                    <Link2 className="w-3.5 h-3.5" /> {linkingTs === 'teamspeak3' ? 'Łączenie…' : 'Połącz'}
                  </button>
                </div>
              )}
            </div>
            {ts3ConnectError && (
              <div className="mt-2.5 p-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{ts3ConnectError}</span>
              </div>
            )}
          </div>

          {/* TeamSpeak 6 */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                  <Server className="w-4 h-4 text-zinc-500" />
                </div>
                <span className="text-sm font-medium text-zinc-900 dark:text-white">TeamSpeak 6</span>
              </div>
              {profile.has_teamspeak6 ? (
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Połączone
                  </span>
                  {canUnlink && (
                    <button onClick={() => handleUnlink('teamspeak', 'TeamSpeak 6')} disabled={unlinking !== null} className="btn-link-red text-xs font-bold disabled:opacity-50">
                      {unlinking === 'teamspeak' ? 'Rozłączanie…' : 'Rozłącz'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <a
                    href="teamspeak://ts6.alleria.pl"
                    title="Otwórz ts6.alleria.pl w kliencie TS6"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button onClick={() => handleLinkTs('teamspeak')} disabled={linkingTs !== null} className="btn-link-violet inline-flex items-center gap-1.5 text-xs font-bold disabled:opacity-50">
                    <Link2 className="w-3.5 h-3.5" /> {linkingTs === 'teamspeak' ? 'Łączenie…' : 'Połącz'}
                  </button>
                </div>
              )}
            </div>
            {ts6ConnectError && (
              <div className="mt-2.5 p-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{ts6ConnectError}</span>
              </div>
            )}
          </div>
        </div>

        {/* TS requirements — collapsible, same guidance as the login page */}
        <button
          onClick={() => setTsInfoOpen(v => !v)}
          className="w-full flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors mt-3"
        >
          <Info className="w-3 h-3 shrink-0" />
          <span>Jak działa łączenie przez TeamSpeak?</span>
          <ChevronDown className={`w-3 h-3 ml-auto shrink-0 transition-transform duration-200 ${tsInfoOpen ? 'rotate-180' : ''}`} />
        </button>
        {tsInfoOpen && (
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 space-y-1.5 pl-3 border-l-2 border-violet-500/30 pt-2">
            <p>• Musisz być <span className="font-semibold text-zinc-700 dark:text-zinc-300">aktywnie połączony</span> z serwerem TS w momencie łączenia.</p>
            <p>• Weryfikacja działa przez <span className="font-semibold text-zinc-700 dark:text-zinc-300">dopasowanie IP</span> — nie używaj VPN.</p>
            <p>• Wymagana jest <span className="font-semibold text-zinc-700 dark:text-zinc-300">odpowiednia grupa serwerowa</span> na TS.</p>
            <p>• Bot wyśle Ci na TeamSpeaku <span className="font-semibold text-zinc-700 dark:text-zinc-300">6-znakowy kod</span> — wpisz go, aby dokończyć łączenie.</p>
            <p>• TS3 i TS6 to osobne serwery z osobnymi kontami — możesz połączyć oba niezależnie.</p>
            <p>• Przycisk „Rozłącz" pojawia się, gdy masz połączoną więcej niż jedną metodę — nie można rozłączyć jedynego sposobu logowania.</p>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-5 text-center">
          <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Eye className="w-5 h-5 text-violet-500" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{profile.viewCount}</p>
          <p className="text-[11px] text-zinc-500 font-medium mt-1">Obejrzanych</p>
        </div>
        <div className="card p-5 text-center">
          <div className="w-10 h-10 bg-pink-50 dark:bg-pink-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Heart className="w-5 h-5 text-pink-500" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{profile.favCount}</p>
          <p className="text-[11px] text-zinc-500 font-medium mt-1">Ulubionych</p>
        </div>
        <div className="card p-5 text-center">
          <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Film className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{profile.videoCount}</p>
          <p className="text-[11px] text-zinc-500 font-medium mt-1">Filmów (autor)</p>
        </div>
      </div>

      {/* Account Details */}
      <div className="card p-6">
        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider font-display mb-4">Szczegóły konta</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-sm text-zinc-500">Metoda logowania</span>
            <span className="text-sm font-medium text-zinc-900 dark:text-white">{profile.auth_method}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-sm text-zinc-500">Data rejestracji</span>
            <span className="text-sm font-mono text-zinc-900 dark:text-white">{formatDate(profile.created_at)}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-zinc-500">Ostatnie logowanie</span>
            <span className="text-sm font-mono text-zinc-900 dark:text-white">{formatDate(profile.last_login)}</span>
          </div>
        </div>
      </div>

      {/* Email i powiadomienia */}
      <div className="card p-6 mt-6">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="w-4 h-4 text-violet-500" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display">Adres e-mail i powiadomienia</h3>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
          {profile.discordEmail
            ? 'Adres podpowiedziany z Twojego konta Discord — możesz go zmienić.'
            : 'Twoje konto nie ma adresu e-mail z Discorda — podaj go ręcznie, jeśli chcesz otrzymywać powiadomienia lub odpowiedź na zgłoszenie RODO.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="email"
            value={editEmail}
            onChange={e => setEditEmail(e.target.value)}
            placeholder="twoj@email.pl"
            className="input-field !py-3 text-sm flex-1"
          />
          <button onClick={handleSaveEmail} disabled={savingEmail} className="btn-secondary text-sm shrink-0 disabled:opacity-50">
            {savingEmail ? 'Zapisywanie...' : 'Zapisz'}
          </button>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={editEmailNotifications}
            onChange={e => setEditEmailNotifications(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
          />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">Zezwalam na powiadomienia email (np. o nowych filmach)</span>
        </label>
      </div>

      {/* GDPR / RODO */}
      {siteConfig.gdprRegion && siteConfig.gdprRegion !== 'off' && (
        <div className="card p-6 mt-6">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display">Twoje dane (RODO)</h3>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
            Możesz zażądać kopii swoich danych albo usunięcia konta. Zgłoszenia są weryfikowane ręcznie przez administratora — maksymalny ustawowy termin realizacji to 30 dni.
          </p>

          {gdprMsg && (
            <div className={`mb-4 p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
              gdprMsg.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-300'
            }`}>
              {gdprMsg.type === 'success' ? <Check className="w-3.5 h-3.5 shrink-0" /> : <X className="w-3.5 h-3.5 shrink-0" />}
              {gdprMsg.text}
            </div>
          )}

          <div className="flex flex-wrap gap-2.5 mb-4">
            <button onClick={handleGdprExport} disabled={gdprBusy} className="btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
              <Download className="w-3.5 h-3.5" /> Pobierz swoje dane
            </button>
            <button onClick={handleGdprDeletion} disabled={gdprBusy} className="btn-danger text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
              <Trash2 className="w-3.5 h-3.5" /> Usuń konto
            </button>
          </div>

          {gdprRequests.length > 0 && (
            <div className="space-y-2">
              {gdprRequests.map(r => {
                const daysLeft = gdprDaysLeft(r.due_at);
                return (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 text-xs">
                    <span className="font-bold text-zinc-900 dark:text-white">{gdprTypeLabel(r.type)}</span>
                    <span className={`px-2 py-0.5 rounded-lg font-bold ${
                      r.status === 'pending' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        : r.status === 'approved' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300'
                    }`}>{gdprStatusLabel(r.status)}</span>
                    {r.status === 'pending' && (
                      <span className={`inline-flex items-center gap-1 font-mono ${daysLeft <= 3 ? 'text-red-500' : daysLeft <= 10 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'}`}>
                        <Clock className="w-3 h-3" /> {daysLeft > 0 ? `${daysLeft} dni do terminu` : 'termin minął'}
                      </span>
                    )}
                    {r.status === 'rejected' && r.admin_note && (
                      <span className="text-zinc-400 italic">Powód: {r.admin_note}</span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      {r.type === 'export' && r.status === 'approved' && (
                        <button onClick={() => handleDownloadGdpr(r.id)} className="btn-link-violet text-xs font-bold">Pobierz plik</button>
                      )}
                      {r.status === 'pending' && (
                        <button onClick={() => handleCancelGdpr(r.id)} disabled={gdprBusy} className="btn-link-zinc text-xs font-bold disabled:opacity-50">Anuluj</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 leading-relaxed">
            Pozostałe uprawnienia wynikające z art. 15–21 RODO (m.in. dostęp do danych, sprostowanie, ograniczenie przetwarzania, przenoszalność, sprzeciw) możesz zrealizować, wysyłając wiadomość na{' '}
            <a
              href={`mailto:kontakt@alleria.pl?subject=${encodeURIComponent(`RODO — konto #${profile.id}`)}&body=${encodeURIComponent(`Identyfikator konta: #${profile.id}`)}`}
              className="text-violet-500 hover:text-violet-400 font-medium"
            >kontakt@alleria.pl</a>
            {' '}— podaj w niej identyfikator swojego konta: <span className="font-mono font-bold text-zinc-600 dark:text-zinc-300">#{profile.id}</span>.
            {profile.discordEmail && (
              <> Najlepiej wyślij ją z adresu <span className="font-mono font-bold text-zinc-600 dark:text-zinc-300">{profile.discordEmail}</span> powiązanego z Twoim kontem Discord — ułatwi to weryfikację, że to Ty.</>
            )}
          </p>
        </div>
      )}

      {/* TS account-linking challenge modal */}
      <TsChallengeModal
        challenge={tsLinkChallenge}
        code={tsLinkCode}
        onCodeChange={setTsLinkCode}
        onSubmit={handleTsLinkSubmit}
        onCancel={cancelTsLinkChallenge}
        loading={tsLinkLoading}
        error={tsLinkError}
        multipleCandidates={tsLinkChallenge?.multipleCandidates}
        count={tsLinkChallenge?.count}
      />

      {/* Merge confirmation — shown when the identity being linked already belongs to a
          different, existing account with its own history */}
      {pendingMerge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-white/10 p-7 animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Połączyć konta?</h2>
                <p className="text-xs text-zinc-500">{pendingMerge.secondaryLabel}</p>
              </div>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
              To konto ma już historię: {pendingMerge.stats?.videoCount ?? 0} obejrzanych filmów, {pendingMerge.stats?.commentCount ?? 0} komentarzy,{' '}
              {pendingMerge.stats?.favCount ?? 0} ulubionych. Cała ta historia zostanie przeniesiona na Twoje obecne konto, a drugie konto zostanie usunięte.
            </p>
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-4">Tej operacji nie można cofnąć.</p>
            {mergeError && (
              <div className="mb-3 p-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{mergeError}</span>
              </div>
            )}
            <div className="flex gap-2.5">
              <button onClick={handleCancelMerge} disabled={mergeBusy} className="btn-sm-secondary flex-1">
                Anuluj
              </button>
              <button onClick={handleConfirmMerge} disabled={mergeBusy} className="btn-sm-primary flex-1">
                {mergeBusy ? 'Łączenie…' : 'Połącz konta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
