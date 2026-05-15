import React, { useState, useEffect } from 'react';
import { FolderOpen, Plus, Pencil, Trash2, Users } from 'lucide-react';
import { api } from '../utils/api';
import { buildCategoryTreeOptions } from '../utils/helpers';

export default function ManagePage() {
  const [cats, setCats] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [status, setStatus] = useState(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catOrder, setCatOrder] = useState('0');
  const [catParentId, setCatParentId] = useState('');
  const [editingCat, setEditingCat] = useState(null);
  const [catViewerRoles, setCatViewerRoles] = useState('');
  const [catEditorRoles, setCatEditorRoles] = useState('');
  const [catWebhookUrl, setCatWebhookUrl] = useState('');
  const [catWebhookTemplate, setCatWebhookTemplate] = useState('');
  const [catAccessMode, setCatAccessMode] = useState('roles');
  const [catAllowedUsers, setCatAllowedUsers] = useState([]);

  useEffect(() => {
    api.getCategories().then(setCats).catch(() => {});
    api.getAllUsers().then(setAllUsers).catch(() => {});
  }, []);

  const resetForm = () => {
    setCatName(''); setCatDesc(''); setCatOrder('0'); setCatParentId('');
    setCatViewerRoles(''); setCatEditorRoles(''); setCatWebhookUrl(''); setCatWebhookTemplate('');
    setCatAccessMode('roles'); setCatAllowedUsers([]);
    setEditingCat(null);
  };

  const saveCategory = async () => {
    if (!catName.trim()) return;
    try {
      const data = { name: catName, description: catDesc, sort_order: parseInt(catOrder) || 0, parent_id: catParentId ? parseInt(catParentId) : null, webhook_url: catWebhookUrl, webhook_template: catWebhookTemplate };
      const accessPayload = {
        access_mode: catAccessMode,
        viewers: catAccessMode === 'roles' ? catViewerRoles.split(',').map(s => s.trim()).filter(Boolean) : [],
        editors: catAccessMode === 'roles' ? catEditorRoles.split(',').map(s => s.trim()).filter(Boolean) : [],
        user_ids: catAccessMode === 'custom' ? catAllowedUsers : [],
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
    setCatViewerRoles((cat.access || []).filter(a => a.access_type === 'viewer').map(a => a.discord_role_id).join(','));
    setCatEditorRoles((cat.access || []).filter(a => a.access_type === 'editor').map(a => a.discord_role_id).join(','));
    const mode = cat.access_mode || 'roles';
    setCatAccessMode(mode);
    if (mode === 'custom') {
      try {
        const r = await api.getCategoryUserAccess(cat.id);
        setCatAllowedUsers(r.users.map(u => u.id));
      } catch (_) { setCatAllowedUsers([]); }
    } else {
      setCatAllowedUsers([]);
    }
  };

  const deleteCategory = async (cat) => {
    if (!confirm(`Usunąć kategorię "${cat.name}"?`)) return;
    try {
      await api.deleteCategory(cat.id);
      setCats(prev => prev.filter(c => c.id !== cat.id));
      setStatus({ type: 'success', msg: `Kategoria "${cat.name}" usunięta.` });
    } catch (e) { setStatus({ type: 'error', msg: e.message }); }
  };

  const toggleUser = (userId) => {
    setCatAllowedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  return (
    <div className="p-6 sm:p-10 max-w-5xl mx-auto page-enter">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display mb-3">Zarządzanie</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Zarządzaj kategoriami, uprawnieniami i webhookami.</p>
      </div>

      {status && (
        <div className={`mb-6 p-4 rounded-2xl text-sm font-medium animate-slide-up ${status.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20' : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/20'}`}>
          {status.msg}
        </div>
      )}

      {/* Category form */}
      <div className="card p-8 mb-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center">
            {editingCat ? <Pencil className="w-5 h-5 text-violet-500" /> : <Plus className="w-5 h-5 text-violet-500" />}
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display">{editingCat ? `Edycja: ${editingCat.name}` : 'Nowa kategoria'}</h2>
          {editingCat && <button onClick={resetForm} className="ml-auto text-xs text-zinc-400 hover:text-zinc-600 transition-colors">Anuluj edycję</button>}
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

          {/* Access mode toggle */}
          <div>
            <label className="label-field">Tryb dostępu</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setCatAccessMode('roles')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${catAccessMode === 'roles' ? 'bg-violet-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
                Role Discord
              </button>
              <button type="button" onClick={() => setCatAccessMode('custom')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${catAccessMode === 'custom' ? 'bg-violet-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
                <Users className="w-3.5 h-3.5" /> Niestandardowe
              </button>
            </div>
          </div>

          {catAccessMode === 'roles' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label-field">Role widzów (Discord Role IDs)</label><input type="text" value={catViewerRoles} onChange={e => setCatViewerRoles(e.target.value)} className="input-field font-mono" placeholder="ID1,ID2 (puste = wszyscy)" /></div>
              <div><label className="label-field">Role redaktorów (Discord Role IDs)</label><input type="text" value={catEditorRoles} onChange={e => setCatEditorRoles(e.target.value)} className="input-field font-mono" placeholder="ID1,ID2" /></div>
            </div>
          ) : (
            <div>
              <label className="label-field">Użytkownicy z dostępem ({catAllowedUsers.length} wybranych)</label>
              {allUsers.length === 0 ? (
                <p className="text-sm text-zinc-400 italic">Brak użytkowników</p>
              ) : (
                <div className="max-h-48 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800">
                  {allUsers.map(u => (
                    <label key={u.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                      <input type="checkbox" checked={catAllowedUsers.includes(u.id)} onChange={() => toggleUser(u.id)} className="rounded accent-violet-500" />
                      <span className="text-sm text-zinc-900 dark:text-white font-medium">{u.display_name || u.username}</span>
                      <span className="text-xs text-zinc-400 ml-auto">{u.role}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div><label className="label-field">Discord Webhook URL (opcjonalnie)</label><input type="text" value={catWebhookUrl} onChange={e => setCatWebhookUrl(e.target.value)} className="input-field font-mono" placeholder="https://discord.com/api/webhooks/..." /></div>
          <div>
            <label className="label-field">Szablon wiadomości webhook</label>
            <textarea value={catWebhookTemplate} onChange={e => setCatWebhookTemplate(e.target.value)} className="input-field font-mono resize-none h-20" placeholder={'🎬 **Nowy film:** {title}\n👤 Autor: {author}\n📁 Kategoria: {category}\n🔗 {url}'} />
            <p className="text-[9px] text-zinc-400 mt-1">Placeholdery: {'{title}'} {'{author}'} {'{category}'} {'{description}'} {'{date}'} {'{id}'} {'{url}'} {'{thumbnail}'}</p>
          </div>
          <button onClick={saveCategory} className="btn-primary text-sm">{editingCat ? 'Zapisz zmiany' : 'Dodaj kategorię'}</button>
        </div>
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
                      {cat.access_mode === 'custom' && <span className="text-[9px] bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5"><Users className="w-2.5 h-2.5" /> NIESTANDARDOWE</span>}
                      {cat.webhook_url && <span className="text-[9px] bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300 px-1.5 py-0.5 rounded font-bold">WEBHOOK</span>}
                    </div>
                    {cat.description && <p className="text-xs text-zinc-400 mt-0.5">{cat.description}</p>}
                    {cat.access_mode !== 'custom' && cat.access && cat.access.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {cat.access.map((a, i) => (
                          <span key={i} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${a.access_type === 'editor' ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'}`}>
                            {a.access_type === 'editor' ? '✏️' : '👁️'} {a.discord_role_id}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => startEdit(cat)} className="p-2 hover:bg-violet-100 dark:hover:bg-violet-500/10 rounded-xl text-zinc-400 hover:text-violet-500 transition-all hover:scale-110">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteCategory(cat)} className="p-2 hover:bg-red-100 dark:hover:bg-red-500/10 rounded-xl text-zinc-400 hover:text-red-500 transition-all hover:scale-110">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
