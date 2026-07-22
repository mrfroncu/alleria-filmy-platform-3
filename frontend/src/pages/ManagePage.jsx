import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FolderOpen, Plus, Pencil, Trash2, Users, Shield } from 'lucide-react';
import { api } from '../utils/api';
import { buildCategoryTreeOptions, formatDate } from '../utils/helpers';
import { roleBadgeClass } from '../utils/roleColors';

const MANAGE_TAB_IDS = ['categories', 'users'];

export default function ManagePage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(MANAGE_TAB_IDS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'categories');

  // Category state
  const [cats, setCats] = useState([]);
  const [users, setUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [ranks, setRanks] = useState([]);
  const [status, setStatus] = useState(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catOrder, setCatOrder] = useState('0');
  const [catParentId, setCatParentId] = useState('');
  const [editingCat, setEditingCat] = useState(null);
  const [catViewerMode, setCatViewerMode] = useState('public');
  const [catEditorMode, setCatEditorMode] = useState('none');
  const [catViewerRoles, setCatViewerRoles] = useState('');
  const [catEditorRoles, setCatEditorRoles] = useState('');
  const [catViewerRankIds, setCatViewerRankIds] = useState([]);
  const [catEditorRankIds, setCatEditorRankIds] = useState([]);
  const [catViewerUserIds, setCatViewerUserIds] = useState([]);
  const [catEditorUserIds, setCatEditorUserIds] = useState([]);
  const [catWebhookUrl, setCatWebhookUrl] = useState('');
  const [catWebhookTemplate, setCatWebhookTemplate] = useState('');

  // Rank form state
  const [rankName, setRankName] = useState('');
  const [rankDesc, setRankDesc] = useState('');
  const [rankColor, setRankColor] = useState('#6366f1');
  const [editingRank, setEditingRank] = useState(null);

  // Users tab state
  const [userRanks, setUserRanks] = useState({});
  const [editingUserRanks, setEditingUserRanks] = useState(null);

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

  const resetForm = () => {
    setCatName(''); setCatDesc(''); setCatOrder('0'); setCatParentId('');
    setCatViewerMode('public'); setCatEditorMode('none');
    setCatViewerRoles(''); setCatEditorRoles('');
    setCatViewerRankIds([]); setCatEditorRankIds([]);
    setCatViewerUserIds([]); setCatEditorUserIds([]);
    setCatWebhookUrl(''); setCatWebhookTemplate('');
    setEditingCat(null);
  };

  const resetRankForm = () => {
    setRankName(''); setRankDesc(''); setRankColor('#6366f1'); setEditingRank(null);
  };

  const saveCategory = async () => {
    if (!catName.trim()) return;
    try {
      const data = { name: catName, description: catDesc, sort_order: parseInt(catOrder) || 0, parent_id: catParentId ? parseInt(catParentId) : null, webhook_url: catWebhookUrl, webhook_template: catWebhookTemplate };
      const accessPayload = {
        viewer_mode: catViewerMode,
        editor_mode: catEditorMode,
        viewers: catViewerMode === 'roles' ? catViewerRoles.split(',').map(s => s.trim()).filter(Boolean) : [],
        editors: catEditorMode === 'roles' ? catEditorRoles.split(',').map(s => s.trim()).filter(Boolean) : [],
        rank_viewers: catViewerMode === 'roles' ? catViewerRankIds : [],
        rank_editors: catEditorMode === 'roles' ? catEditorRankIds : [],
        viewer_user_ids: catViewerMode === 'custom' ? catViewerUserIds : [],
        editor_user_ids: catEditorMode === 'custom' ? catEditorUserIds : [],
      };
      if (editingCat) {
        await api.updateCategory(editingCat.id, data);
        await api.setCategoryAccess(editingCat.id, accessPayload);
        setStatus({ type: 'success', msg: `Kategoria "${catName}" zaktualizowana.` });
      } else {
        const r = await api.createCategory(data);
        if (r.category) {
          await api.setCategoryAccess(r.category.id, accessPayload);
        }
        setStatus({ type: 'success', msg: `Kategoria "${catName}" utworzona.` });
      }
      resetForm();
      api.getCategories().then(setCats).catch(() => {});
    } catch (e) { setStatus({ type: 'error', msg: e.message }); }
  };

  const startEdit = async (cat) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatDesc(cat.description || '');
    setCatOrder(String(cat.sort_order || 0));
    setCatParentId(String(cat.parent_id || ''));
    setCatWebhookUrl(cat.webhook_url || '');
    setCatWebhookTemplate(cat.webhook_template || '');
    const rawMode = cat.access_mode || 'public:none';
    const [vm, em] = rawMode.includes(':') ? rawMode.split(':')
      : rawMode === 'custom' ? ['custom', 'none']
      : rawMode === 'roles' ? ['roles', 'roles']
      : ['public', 'none'];
    setCatViewerMode(vm);
    setCatEditorMode(em);
    setCatViewerRoles((cat.access || []).filter(a => a.access_type === 'viewer').map(a => a.discord_role_id).join(','));
    setCatEditorRoles((cat.access || []).filter(a => a.access_type === 'editor').map(a => a.discord_role_id).join(','));
    setCatViewerRankIds((cat.rank_access || []).filter(a => a.access_type === 'viewer').map(a => a.rank_id));
    setCatEditorRankIds((cat.rank_access || []).filter(a => a.access_type === 'editor').map(a => a.rank_id));
    if (vm === 'custom' || em === 'custom') {
      try {
        const r = await api.getCategoryUserAccess(cat.id);
        setCatViewerUserIds((r.viewer_users || []).map(u => u.id));
        setCatEditorUserIds((r.editor_users || []).map(u => u.id));
      } catch (_) { setCatViewerUserIds([]); setCatEditorUserIds([]); }
    } else {
      setCatViewerUserIds([]); setCatEditorUserIds([]);
    }
    setTab('categories');
  };

  const deleteCategory = async (cat) => {
    if (!confirm(`Usunąć kategorię "${cat.name}"?`)) return;
    try {
      await api.deleteCategory(cat.id);
      setCats(prev => prev.filter(c => c.id !== cat.id));
      setStatus({ type: 'success', msg: `Kategoria "${cat.name}" usunięta.` });
    } catch (e) { setStatus({ type: 'error', msg: e.message }); }
  };

  const toggleId = (setter, id) => setter(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const saveRank = async () => {
    if (!rankName.trim()) return;
    try {
      if (editingRank) {
        await api.updateRank(editingRank.id, { name: rankName, description: rankDesc, color: rankColor });
        setStatus({ type: 'success', msg: `Ranga "${rankName}" zaktualizowana.` });
      } else {
        await api.createRank({ name: rankName, description: rankDesc, color: rankColor });
        setStatus({ type: 'success', msg: `Ranga "${rankName}" utworzona.` });
      }
      resetRankForm();
      api.getRanks().then(r => { setRanks(r); }).catch(() => {});
    } catch (e) { setStatus({ type: 'error', msg: e.message }); }
  };

  const deleteRank = async (rank) => {
    if (!confirm(`Usunąć rangę "${rank.name}"? Spowoduje to usunięcie wszystkich przypisań tej rangi.`)) return;
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

  return (
    <div className="p-6 sm:p-10 max-w-5xl mx-auto page-enter">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display mb-3">Zarządzanie</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Zarządzaj kategoriami, uprawnieniami i użytkownikami.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="card p-5 text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{cats.length}</p>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">Kategorii</p>
        </div>
        <div className="card p-5 text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{users.length}</p>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">Użytkowników</p>
        </div>
        <div className="card p-5 text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{ranks.length}</p>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">Rang</p>
        </div>
        <div className="card p-5 text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{cats.filter(c => (c.access_mode || '').includes('custom')).length}</p>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">Niestandardowy dostęp</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-zinc-200 dark:border-zinc-800">
        {[['categories', 'Kategorie', FolderOpen], ['users', 'Użytkownicy', Users]].map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === key
                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}>
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {status && (
        <div className={`mb-6 p-4 rounded-2xl text-sm font-medium animate-slide-up ${status.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20' : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/20'}`}>
          {status.msg}
        </div>
      )}

      {/* === CATEGORIES TAB === */}
      {tab === 'categories' && (
        <>
          {/* Category form */}
          <div className="card p-8 mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center">
                {editingCat ? <Pencil className="w-5 h-5 text-violet-500" /> : <Plus className="w-5 h-5 text-violet-500" />}
              </div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display">{editingCat ? `Edycja: ${editingCat.name}` : 'Nowa kategoria'}</h2>
              {editingCat && <button onClick={resetForm} className="btn-link-zinc ml-auto">Anuluj edycję</button>}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="label-field">Nazwa kategorii</label><input type="text" value={catName} onChange={e => setCatName(e.target.value)} className="input-field" placeholder="np. Filmy akcji" /></div>
                <div><label className="label-field">Kolejność sortowania</label><input type="number" value={catOrder} onChange={e => setCatOrder(e.target.value)} className="input-field" placeholder="0" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="label-field">Opis (opcjonalnie)</label><input type="text" value={catDesc} onChange={e => setCatDesc(e.target.value)} className="input-field" placeholder="Opis kategorii" /></div>
                <div><label className="label-field">Kategoria nadrzędna</label>
                  <select value={catParentId} onChange={e => setCatParentId(e.target.value)} className="input-field appearance-none cursor-pointer">
                    <option value="">Brak (główna)</option>
                    {buildCategoryTreeOptions(cats, editingCat?.id).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Independent viewer/editor access sections */}
              <div className="space-y-5 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-4">
                {/* WIDZOWIE */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">👁 Widzowie</span>
                  </div>
                  <div className="flex gap-1.5 mb-3">
                    {[['public', 'Wszyscy'], ['roles', 'Role/rangi'], ['custom', 'Lista użytkowników']].map(([val, lbl]) => (
                      <button key={val} type="button" onClick={() => setCatViewerMode(val)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${catViewerMode === val ? 'bg-blue-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                  {catViewerMode === 'roles' && (
                    <div className="space-y-2">
                      <input type="text" value={catViewerRoles} onChange={e => setCatViewerRoles(e.target.value)} className="input-field font-mono text-sm" placeholder="Discord Role IDs, np. 123456,789012 (puste = brak filtrowania)" />
                      {ranks.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {ranks.map(r => (
                            <button key={r.id} type="button" onClick={() => toggleId(setCatViewerRankIds, r.id)}
                              className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all border ${catViewerRankIds.includes(r.id) ? 'text-white border-transparent' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'}`}
                              style={catViewerRankIds.includes(r.id) ? { backgroundColor: r.color, borderColor: r.color } : {}}>
                              {r.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {catViewerMode === 'custom' && (
                    <div className="max-h-36 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800">
                      {allUsers.map(u => (
                        <label key={u.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <input type="checkbox" checked={catViewerUserIds.includes(u.id)} onChange={() => toggleId(setCatViewerUserIds, u.id)} className="rounded accent-blue-500" />
                          <span className="text-sm text-zinc-900 dark:text-white font-medium">{u.display_name || u.username}</span>
                          <span className="text-xs text-zinc-400 ml-auto">{u.role}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-zinc-100 dark:border-zinc-800" />

                {/* REDAKTORZY */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">✏️ Redaktorzy</span>
                  </div>
                  <div className="flex gap-1.5 mb-3">
                    {[['none', 'Brak'], ['roles', 'Role/rangi'], ['custom', 'Lista użytkowników']].map(([val, lbl]) => (
                      <button key={val} type="button" onClick={() => setCatEditorMode(val)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${catEditorMode === val ? 'bg-amber-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                  {catEditorMode === 'roles' && (
                    <div className="space-y-2">
                      <input type="text" value={catEditorRoles} onChange={e => setCatEditorRoles(e.target.value)} className="input-field font-mono text-sm" placeholder="Discord Role IDs, np. 123456,789012" />
                      {ranks.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {ranks.map(r => (
                            <button key={r.id} type="button" onClick={() => toggleId(setCatEditorRankIds, r.id)}
                              className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all border ${catEditorRankIds.includes(r.id) ? 'text-white border-transparent' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'}`}
                              style={catEditorRankIds.includes(r.id) ? { backgroundColor: r.color, borderColor: r.color } : {}}>
                              {r.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {catEditorMode === 'custom' && (
                    <div className="max-h-36 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800">
                      {allUsers.map(u => (
                        <label key={u.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <input type="checkbox" checked={catEditorUserIds.includes(u.id)} onChange={() => toggleId(setCatEditorUserIds, u.id)} className="rounded accent-amber-500" />
                          <span className="text-sm text-zinc-900 dark:text-white font-medium">{u.display_name || u.username}</span>
                          <span className="text-xs text-zinc-400 ml-auto">{u.role}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div><label className="label-field">Discord Webhook URL (opcjonalnie)</label><input type="text" value={catWebhookUrl} onChange={e => setCatWebhookUrl(e.target.value)} className="input-field font-mono" placeholder="https://discord.com/api/webhooks/..." /></div>
              <div>
                <label className="label-field">Szablon wiadomości webhook</label>
                <textarea value={catWebhookTemplate} onChange={e => setCatWebhookTemplate(e.target.value)} className="input-field font-mono resize-none h-20" placeholder={'🎬 **Nowy film:** {title}\n👤 Autor: {author}\n📁 Kategoria: {category}\n🔗 {url}'} />
                <p className="text-[9px] text-zinc-400 mt-1">Placeholdery: {'{title}'} {'{author}'} {'{category}'} {'{description}'} {'{date}'} {'{id}'} {'{url}'} {'{thumbnail}'}</p>
              </div>
              <button onClick={saveCategory} className="btn-primary text-sm">{editingCat ? 'Zapisz zmiany' : 'Dodaj kategorię'}</button>
            </div>
          </div>

          {/* Rank management */}
          <div className="card p-8 mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-indigo-500" />
              </div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display">{editingRank ? `Edycja rangi: ${editingRank.name}` : 'Nowa ranga'}</h2>
              {editingRank && <button onClick={resetRankForm} className="btn-link-zinc ml-auto">Anuluj edycję</button>}
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2"><label className="label-field">Nazwa rangi</label><input type="text" value={rankName} onChange={e => setRankName(e.target.value)} className="input-field" placeholder="np. Redaktor" /></div>
                <div><label className="label-field">Kolor</label><div className="flex gap-2 items-center"><input type="color" value={rankColor} onChange={e => setRankColor(e.target.value)} className="w-10 h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer p-0.5 bg-transparent" /><span className="text-sm font-mono text-zinc-500">{rankColor}</span></div></div>
              </div>
              <div><label className="label-field">Opis (opcjonalnie)</label><input type="text" value={rankDesc} onChange={e => setRankDesc(e.target.value)} className="input-field" placeholder="Opis rangi" /></div>
              <button onClick={saveRank} className="btn-primary text-sm">{editingRank ? 'Zapisz rangę' : 'Dodaj rangę'}</button>
            </div>

            {ranks.length > 0 && (
              <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Istniejące rangi ({ranks.length})</p>
                <div className="space-y-2">
                  {ranks.map(r => (
                    <div key={r.id} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-bold text-zinc-900 dark:text-white">{r.name}</span>
                        {r.description && <span className="text-xs text-zinc-400 ml-2">{r.description}</span>}
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400">ID:{r.id}</span>
                      <button onClick={() => { setEditingRank(r); setRankName(r.name); setRankDesc(r.description || ''); setRankColor(r.color || '#6366f1'); }} className="btn-icon-indigo"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteRank(r)} className="btn-icon-red"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Category list */}
          <div className="card p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-cyan-50 dark:bg-cyan-500/10 rounded-2xl flex items-center justify-center">
                <FolderOpen className="w-5 h-5 text-cyan-500" />
              </div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display">Kategorie ({cats.length})</h2>
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
                          {cat.webhook_url && <span className="text-[9px] bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300 px-1.5 py-0.5 rounded font-bold">WEBHOOK</span>}
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
                      <button onClick={() => startEdit(cat)} className="btn-icon-violet">
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
        </>
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
                    } catch (err) { alert('Błąd: ' + err.message); }
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
                      <td className="px-4 py-3 text-xs text-zinc-500 font-mono">{formatDate(u.last_login)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={async () => {
                            if (!confirm(`Usunąć konto "${u.display_name || u.username}"?\n\nTo nie jest ban — użytkownik może zalogować się ponownie.`)) return;
                            try {
                              await api.deleteUser(u.id);
                              setUsers(prev => prev.filter(x => x.id !== u.id));
                              setAllUsers(prev => prev.filter(x => x.id !== u.id));
                            } catch (err) { alert('Błąd: ' + err.message); }
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
    </div>
  );
}
