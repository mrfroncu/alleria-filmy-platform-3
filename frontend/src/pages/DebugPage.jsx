import React, { useState, useRef, useEffect } from 'react';
import { Download, Upload, Trash2, AlertTriangle, Database, UserPlus, ChevronDown, Terminal, Play, FolderPlus, X, Shield, BarChart3, Loader2 } from 'lucide-react';
import { api } from '../utils/api';
import { buildCategoryTreeOptions } from '../utils/helpers';

export default function DebugPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
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

  // Category management
  const [cats, setCats] = useState([]);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catOrder, setCatOrder] = useState('0');
  const [catParentId, setCatParentId] = useState('');
  const [editingCat, setEditingCat] = useState(null);
  const [catViewerRoles, setCatViewerRoles] = useState('');
  const [catEditorRoles, setCatEditorRoles] = useState('');
  const [catWebhookUrl, setCatWebhookUrl] = useState('');
  const [catWebhookTemplate, setCatWebhookTemplate] = useState('');
  const [cleanupLog, setCleanupLog] = useState([]);

  // Admin stats
  const [streamStats, setStreamStats] = useState(null);
  const [dbStats, setDbStats] = useState(null);
  const [transcodingVideos, setTranscodingVideos] = useState([]);

  useEffect(() => {
    api.getCategories().then(setCats).catch(() => {});
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
  const [creatingUser, setCreatingUser] = useState(false);

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

  const handleClear = async () => {
    if (!confirm('UWAGA: To usunie WSZYSTKIE dane (filmy, tagi, logi). Kontynuować?')) return;
    if (!confirm('Naprawdę usunąć wszystko? Ta operacja jest nieodwracalna!')) return;
    setLoading(true);
    try {
      await api.clearDB();
      setStatus({ type: 'success', msg: 'Baza danych wyczyszczona.' });
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
            <Database className="w-5 h-5 text-red-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Debug Tools</h1>
        </div>
        <p className="text-zinc-500 dark:text-zinc-400">Narzędzia deweloperskie do zarządzania bazą danych.</p>
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

      {/* Stats row — full width */}
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
      {transcodingVideos.length > 0 && (
        <div className="card p-6 mb-6">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-3 flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-amber-500 animate-spin" /> Aktywne transkodowanie ({transcodingVideos.length})
          </h3>
          <div className="space-y-3">
            {transcodingVideos.map(v => (
              <div key={v.id} className="flex items-center gap-4 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                <div className="w-16 h-10 bg-zinc-200 dark:bg-zinc-700 rounded-lg overflow-hidden shrink-0">
                  {v.thumbnail ? <img src={v.thumbnail} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-400 text-[8px]">brak</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{v.title}</p>
                  <p className="text-[10px] text-zinc-500">
                    {v._quality ? `Jakość: ${v._quality}` : 'Oczekiwanie...'} • {v._progress != null ? `${v._progress}%` : '0%'}
                  </p>
                </div>
                <div className="w-24 shrink-0">
                  <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${v._progress || 0}%` }}></div>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-amber-600 shrink-0">{v._progress || 0}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2-column grid for tools */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Create User */}
        <div className="card p-8 xl:row-span-2" >
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

        {/* Export */}
        <div className="card p-8 h-full flex flex-col">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-violet-50 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <Download className="w-6 h-6 text-violet-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Eksportuj bazę danych</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Pobierz plik JSON ze wszystkimi danymi platformy.</p>
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

        {/* Category Management */}
        <div className="card p-8 xl:row-span-3">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-cyan-50 dark:bg-cyan-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <FolderPlus className="w-6 h-6 text-cyan-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Zarządzanie kategoriami</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                Twórz kategorie filmów i ustawiaj kto ma dostęp (jakie role Discord). Podaj ID ról oddzielone przecinkami.
              </p>

              {/* Add/Edit category form */}
              <div className="space-y-3 mb-6 p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label-field">Nazwa kategorii</label>
                    <input type="text" value={catName} onChange={e => setCatName(e.target.value)} className="input-field !py-3 text-sm" placeholder="np. Filmy akcji" />
                  </div>
                  <div>
                    <label className="label-field">Kolejność sortowania</label>
                    <input type="number" value={catOrder} onChange={e => setCatOrder(e.target.value)} className="input-field !py-3 text-sm" placeholder="0" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label-field">Opis (opcjonalnie)</label>
                    <input type="text" value={catDesc} onChange={e => setCatDesc(e.target.value)} className="input-field !py-3 text-sm" placeholder="Opis kategorii" />
                  </div>
                  <div>
                    <label className="label-field">Kategoria nadrzędna</label>
                    <select value={catParentId} onChange={e => setCatParentId(e.target.value)} className="input-field !py-3 text-sm appearance-none cursor-pointer">
                      <option value="">Brak (główna)</option>
                      {buildCategoryTreeOptions(cats, editingCat?.id).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label-field">Role widzów (Discord Role IDs)</label>
                    <input type="text" value={catViewerRoles} onChange={e => setCatViewerRoles(e.target.value)} className="input-field !py-3 text-sm font-mono" placeholder="ID1,ID2 (puste = wszyscy)" />
                  </div>
                  <div>
                    <label className="label-field">Role redaktorów (Discord Role IDs)</label>
                    <input type="text" value={catEditorRoles} onChange={e => setCatEditorRoles(e.target.value)} className="input-field !py-3 text-sm font-mono" placeholder="ID1,ID2" />
                  </div>
                </div>
                <div>
                  <label className="label-field">Discord Webhook URL (opcjonalnie)</label>
                  <input type="text" value={catWebhookUrl} onChange={e => setCatWebhookUrl(e.target.value)} className="input-field !py-3 text-sm font-mono" placeholder="https://discord.com/api/webhooks/..." />
                </div>
                <div>
                  <label className="label-field">Szablon wiadomości webhook</label>
                  <textarea value={catWebhookTemplate} onChange={e => setCatWebhookTemplate(e.target.value)} className="input-field !py-3 text-sm font-mono resize-none h-20" placeholder={'🎬 **Nowy film:** {title}\n👤 Autor: {author}\n📁 Kategoria: {category}\n🔗 {url}'} />
                  <p className="text-[9px] text-zinc-400 mt-1">Placeholdery: {'{title}'} {'{author}'} {'{category}'} {'{description}'} {'{date}'} {'{id}'} {'{url}'} {'{thumbnail}'}</p>
                </div>
                <button
                  onClick={async () => {
                    if (!catName.trim()) return;
                    try {
                      const catData = { name: catName, description: catDesc, sort_order: parseInt(catOrder) || 0, parent_id: catParentId ? parseInt(catParentId) : null, webhook_url: catWebhookUrl, webhook_template: catWebhookTemplate };
                      if (editingCat) {
                        await api.updateCategory(editingCat.id, catData);
                        await api.setCategoryAccess(editingCat.id, {
                          viewers: catViewerRoles.split(',').map(s => s.trim()).filter(Boolean),
                          editors: catEditorRoles.split(',').map(s => s.trim()).filter(Boolean),
                        });
                        setStatus({ type: 'success', msg: `Kategoria "${catName}" zaktualizowana.` });
                      } else {
                        const r = await api.createCategory(catData);
                        if (r.category && (catViewerRoles || catEditorRoles)) {
                          await api.setCategoryAccess(r.category.id, {
                            viewers: catViewerRoles.split(',').map(s => s.trim()).filter(Boolean),
                            editors: catEditorRoles.split(',').map(s => s.trim()).filter(Boolean),
                          });
                        }
                        setStatus({ type: 'success', msg: `Kategoria "${catName}" utworzona.` });
                      }
                      setCatName(''); setCatDesc(''); setCatOrder('0'); setCatParentId(''); setCatViewerRoles(''); setCatEditorRoles(''); setCatWebhookUrl(''); setCatWebhookTemplate(''); setEditingCat(null);
                      api.getCategories().then(setCats).catch(() => {});
                    } catch (e) { setStatus({ type: 'error', msg: e.message }); }
                  }}
                  className="btn-primary text-sm"
                >
                  {editingCat ? 'Zapisz zmiany' : 'Dodaj kategorię'}
                </button>
                {editingCat && (
                  <button onClick={() => { setEditingCat(null); setCatName(''); setCatDesc(''); setCatOrder('0'); setCatParentId(''); setCatViewerRoles(''); setCatEditorRoles(''); setCatWebhookUrl(''); setCatWebhookTemplate(''); }} className="btn-secondary text-sm ml-2">
                    Anuluj edycję
                  </button>
                )}
              </div>

              {/* Existing categories */}
              {cats.length === 0 ? (
                <p className="text-sm text-zinc-400 italic">Brak kategorii</p>
              ) : (
                <div className="space-y-2">
                  {buildCategoryTreeOptions(cats).map(opt => {
                    const cat = cats.find(c => c.id === opt.id);
                    if (!cat) return null;
                    return (
                    <div key={cat.id} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl" style={{ marginLeft: opt.depth * 20 }}>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-bold text-zinc-900 dark:text-white">{opt.depth > 0 ? '↳ ' : ''}{cat.name}</span>
                        <span className="text-xs text-zinc-400 ml-2">({cat.videoCount || 0} filmów, sort: {cat.sort_order})</span>
                        {cat.access && cat.access.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {cat.access.map((a, i) => (
                              <span key={i} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${a.access_type === 'editor' ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'}`}>
                                {a.access_type === 'editor' ? '✏️' : '👁️'} {a.discord_role_id}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => {
                        setEditingCat(cat);
                        setCatName(cat.name);
                        setCatDesc(cat.description || '');
                        setCatOrder(String(cat.sort_order || 0));
                        setCatParentId(String(cat.parent_id || ''));
                        setCatWebhookUrl(cat.webhook_url || '');
                        setCatWebhookTemplate(cat.webhook_template || '');
                        const viewers = (cat.access || []).filter(a => a.access_type === 'viewer').map(a => a.discord_role_id).join(',');
                        const editors = (cat.access || []).filter(a => a.access_type === 'editor').map(a => a.discord_role_id).join(',');
                        setCatViewerRoles(viewers);
                        setCatEditorRoles(editors);
                      }} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                        <Shield className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={async () => {
                        if (!confirm(`Usunąć kategorię "${cat.name}"?`)) return;
                        try {
                          await api.deleteCategory(cat.id);
                          setCats(prev => prev.filter(c => c.id !== cat.id));
                          setStatus({ type: 'success', msg: `Kategoria "${cat.name}" usunięta.` });
                        } catch (e) { setStatus({ type: 'error', msg: e.message }); }
                      }} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-500/10 rounded-lg text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Accent Color */}
        <div className="card p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-violet-50 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <span className="text-2xl">🎨</span>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Kolor akcentu</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Zmień kolor akcentu interfejsu.</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { name: 'Violet', hue: '263', colors: 'from-violet-500 to-fuchsia-500', bg: 'bg-violet-500' },
                  { name: 'Blue', hue: '217', colors: 'from-blue-500 to-cyan-500', bg: 'bg-blue-500' },
                  { name: 'Emerald', hue: '160', colors: 'from-emerald-500 to-teal-500', bg: 'bg-emerald-500' },
                  { name: 'Rose', hue: '350', colors: 'from-rose-500 to-pink-500', bg: 'bg-rose-500' },
                  { name: 'Amber', hue: '38', colors: 'from-amber-500 to-orange-500', bg: 'bg-amber-500' },
                  { name: 'Cyan', hue: '190', colors: 'from-cyan-500 to-sky-500', bg: 'bg-cyan-500' },
                ].map(c => (
                  <button key={c.name} onClick={() => {
                    document.documentElement.style.setProperty('--accent-hue', c.hue);
                    localStorage.setItem('accent-hue', c.hue);
                    setStatus({ type: 'success', msg: `Kolor akcentu zmieniony na ${c.name}` });
                  }} className={`w-10 h-10 ${c.bg} rounded-xl hover:scale-110 active:scale-95 transition-all shadow-lg`} title={c.name} />
                ))}
                <div className="flex items-center gap-2 ml-2">
                  <input type="color" defaultValue="#8b5cf6" onChange={e => {
                    const hex = e.target.value;
                    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
                    document.documentElement.style.setProperty('--accent-r', r);
                    document.documentElement.style.setProperty('--accent-g', g);
                    document.documentElement.style.setProperty('--accent-b', b);
                    localStorage.setItem('accent-custom', hex);
                  }} className="w-10 h-10 rounded-xl border-0 cursor-pointer" title="Własny kolor" />
                  <span className="text-[10px] text-zinc-400">Custom</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Streaming Cleanup */}
        <div className="card p-8 h-full flex flex-col">
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
                  <button onClick={() => setCleanupLog([])} className="text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
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
              <button onClick={handleClear} disabled={loading} className="btn-danger text-sm">
                {loading ? 'Czyszczenie...' : 'Wyczyść wszystko'}
              </button>
            </div>
          </div>
        </div>

        {/* End of 2-column grid */}
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
    );
  }
