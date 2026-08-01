import React, { useState, useEffect, useCallback } from 'react';
import { FolderTree, Users, Plus, Pencil, Trash2, Webhook, Award, X } from 'lucide-react';
import { api } from '../utils/apiClient';
import { buildCategoryTree } from '../utils/helpers';
import { ROLE_TONES, ROLE_LABELS } from '../utils/roleColors';
import { useToast } from '../components/ui/Toast';
import TabBar from '../components/ui/TabBar';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input, { Label } from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Avatar from '../components/ui/Avatar';

const TABS = [
  { id: 'categories', label: 'Kategorie', icon: FolderTree },
  { id: 'users', label: 'Użytkownicy', icon: Users },
];

function categoryOptions(tree, depth = 0) {
  let out = [];
  for (const c of tree) {
    out.push({ value: c.id, label: `${'— '.repeat(depth)}${c.name}` });
    out = out.concat(categoryOptions(c.children, depth + 1));
  }
  return out;
}

const emptyCat = { id: null, name: '', description: '', sort_order: 0, parent_id: '', webhook_url: '', webhook_template: '', viewer_mode: 'public', editor_mode: 'public', viewers: '', editors: '', rank_viewers: [], rank_editors: [] };

function AccessModeEditor({ label, mode, setMode, roleIds, setRoleIds, rankIds, setRankIds, ranks }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-500 mb-1.5">{label}</p>
      <div className="flex gap-1.5 mb-2">
        {['public', 'roles', 'custom'].map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${mode === m ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}>
            {m === 'public' ? 'Publiczny' : m === 'roles' ? 'Role/Rangi' : 'Lista własna'}
          </button>
        ))}
      </div>
      {mode === 'roles' && (
        <div className="space-y-2">
          <Input value={roleIds} onChange={(e) => setRoleIds(e.target.value)} placeholder="ID ról Discord, po przecinku" className="text-xs" />
          {ranks.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {ranks.map((r) => (
                <button key={r.id} type="button" onClick={() => setRankIds((prev) => prev.includes(r.id) ? prev.filter((x) => x !== r.id) : [...prev, r.id])}
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold border" style={{ borderColor: r.color, color: rankIds.includes(r.id) ? '#fff' : r.color, background: rankIds.includes(r.id) ? r.color : 'transparent' }}>
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CategoriesTab() {
  const notify = useToast();
  const [categories, setCategories] = useState([]);
  const [ranks, setRanks] = useState([]);
  const [form, setForm] = useState(emptyCat);
  const [saving, setSaving] = useState(false);
  const [rankForm, setRankForm] = useState({ id: null, name: '', description: '', color: '#4f46e5' });

  const load = useCallback(() => {
    api.getCategories().then(setCategories).catch(() => {});
    api.getRanks().then(setRanks).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const tree = buildCategoryTree(categories);
  const options = categoryOptions(tree);

  const editCategory = (c) => {
    const [viewerMode, editorMode] = (c.access_mode || 'public:public').split(':');
    setForm({
      id: c.id, name: c.name, description: c.description || '', sort_order: c.sort_order || 0, parent_id: c.parent_id || '',
      webhook_url: c.webhook_url || '', webhook_template: c.webhook_template || '',
      viewer_mode: viewerMode || 'public', editor_mode: editorMode || 'public',
      viewers: '', editors: '',
      rank_viewers: (c.rank_access || []).filter((r) => r.viewer).map((r) => r.rank_id) || [],
      rank_editors: (c.rank_access || []).filter((r) => r.editor).map((r) => r.rank_id) || [],
    });
  };

  const saveCategory = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name: form.name, description: form.description, sort_order: Number(form.sort_order) || 0, parent_id: form.parent_id || null, webhook_url: form.webhook_url, webhook_template: form.webhook_template };
      let cat;
      if (form.id) { await api.updateCategory(form.id, body); cat = { id: form.id }; }
      else cat = await api.createCategory(body);

      await api.setCategoryAccess(cat.id, {
        viewer_mode: form.viewer_mode, editor_mode: form.editor_mode,
        viewers: form.viewers ? form.viewers.split(',').map((s) => s.trim()).filter(Boolean) : [],
        editors: form.editors ? form.editors.split(',').map((s) => s.trim()).filter(Boolean) : [],
        rank_viewers: form.rank_viewers, rank_editors: form.rank_editors,
        viewer_user_ids: [], editor_user_ids: [],
      });

      notify('Kategoria zapisana.', 'success');
      setForm(emptyCat);
      load();
    } catch (e) {
      notify(e.message, 'error');
    }
    setSaving(false);
  };

  const deleteCategory = async (id) => {
    try { await api.deleteCategory(id); load(); } catch (e) { notify(e.message, 'error'); }
  };

  const saveRank = async () => {
    try {
      if (rankForm.id) await api.updateRank(rankForm.id, rankForm);
      else await api.createRank(rankForm);
      setRankForm({ id: null, name: '', description: '', color: '#4f46e5' });
      load();
    } catch (e) { notify(e.message, 'error'); }
  };
  const deleteRank = async (id) => {
    try { await api.deleteRank(id); load(); } catch (e) { notify(e.message, 'error'); }
  };

  const renderTree = (nodes, depth = 0) => nodes.map((c) => (
    <div key={c.id}>
      <div className="flex items-center gap-2 py-2 px-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5" style={{ paddingLeft: `${12 + depth * 20}px` }}>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 flex-1 truncate">{c.name}</span>
        <span className="text-[11px] text-slate-400">{c.videoCount ?? 0} filmów</span>
        {c.webhook_url && <Webhook className="w-3.5 h-3.5 text-teal-500" />}
        <Badge tone="neutral">{c.access_mode || 'public:public'}</Badge>
        <button onClick={() => editCategory(c)} className="p-1.5 rounded-lg text-slate-400 hover:text-brand-500"><Pencil className="w-3.5 h-3.5" /></button>
        <button onClick={() => deleteCategory(c.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      {c.children?.length > 0 && renderTree(c.children, depth + 1)}
    </div>
  ));

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="font-bold text-slate-900 dark:text-white font-display text-sm mb-4">{form.id ? 'Edytuj kategorię' : 'Nowa kategoria'}</h3>
        <form onSubmit={saveCategory} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Nazwa</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
            <div>
              <Label>Kategoria nadrzędna</Label>
              <select value={form.parent_id} onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))} className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-2.5 text-sm">
                <option value="">— brak (kategoria główna)</option>
                {options.filter((o) => o.value !== form.id).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div><Label>Opis</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
          <div><Label>Kolejność sortowania</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} className="max-w-[120px]" /></div>
          <div><Label>Webhook URL (Discord)</Label><Input value={form.webhook_url} onChange={(e) => setForm((f) => ({ ...f, webhook_url: e.target.value }))} placeholder="https://discord.com/api/webhooks/..." /></div>
          <div>
            <Label>Szablon wiadomości webhooka</Label>
            <textarea value={form.webhook_template} onChange={(e) => setForm((f) => ({ ...f, webhook_template: e.target.value }))} rows={5}
              className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-2.5 text-sm font-mono resize-y min-h-[6rem]" />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <AccessModeEditor label="Widzowie" mode={form.viewer_mode} setMode={(m) => setForm((f) => ({ ...f, viewer_mode: m }))}
              roleIds={form.viewers} setRoleIds={(v) => setForm((f) => ({ ...f, viewers: v }))}
              rankIds={form.rank_viewers} setRankIds={(fn) => setForm((f) => ({ ...f, rank_viewers: typeof fn === 'function' ? fn(f.rank_viewers) : fn }))} ranks={ranks} />
            <AccessModeEditor label="Redaktorzy" mode={form.editor_mode} setMode={(m) => setForm((f) => ({ ...f, editor_mode: m }))}
              roleIds={form.editors} setRoleIds={(v) => setForm((f) => ({ ...f, editors: v }))}
              rankIds={form.rank_editors} setRankIds={(fn) => setForm((f) => ({ ...f, rank_editors: typeof fn === 'function' ? fn(f.rank_editors) : fn }))} ranks={ranks} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving}>{saving ? 'Zapisywanie...' : 'Zapisz kategorię'}</Button>
            {form.id && <Button type="button" variant="secondary" onClick={() => setForm(emptyCat)}>Anuluj edycję</Button>}
          </div>
        </form>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-900 dark:text-white font-display text-sm mb-2 px-2">Lista kategorii</h3>
        {tree.length === 0 ? <p className="text-sm text-slate-400 px-2">Brak kategorii.</p> : renderTree(tree)}
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Award className="w-4.5 h-4.5 text-amber-500" />
          <h3 className="font-bold text-slate-900 dark:text-white font-display text-sm">Rangi aplikacji</h3>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {ranks.map((r) => (
            <span key={r.id} className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full text-xs font-semibold" style={{ background: `${r.color}22`, color: r.color }}>
              <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />
              {r.name}
              <button onClick={() => setRankForm(r)} className="ml-1 hover:opacity-70"><Pencil className="w-3 h-3" /></button>
              <button onClick={() => deleteRank(r.id)} className="hover:opacity-70"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><Label>Nazwa</Label><Input value={rankForm.name} onChange={(e) => setRankForm((f) => ({ ...f, name: e.target.value }))} className="!py-2 w-40" /></div>
          <div><Label>Opis</Label><Input value={rankForm.description} onChange={(e) => setRankForm((f) => ({ ...f, description: e.target.value }))} className="!py-2 w-48" /></div>
          <div><Label>Kolor</Label><input type="color" value={rankForm.color} onChange={(e) => setRankForm((f) => ({ ...f, color: e.target.value }))} className="w-11 h-[38px] rounded-xl border border-slate-200 dark:border-white/10" /></div>
          <Button size="sm" onClick={saveRank}><Plus className="w-3.5 h-3.5" /> {rankForm.id ? 'Zapisz' : 'Dodaj rangę'}</Button>
        </div>
      </Card>
    </div>
  );
}

function UsersTab() {
  const notify = useToast();
  const [users, setUsers] = useState(null);
  const [ranks, setRanks] = useState([]);
  const [editingRanksFor, setEditingRanksFor] = useState(null);
  const [userRanks, setUserRanks] = useState([]);

  const load = useCallback(() => {
    api.getUsers().then(setUsers).catch(() => setUsers([]));
    api.getRanks().then(setRanks).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const openRankEditor = async (u) => {
    setEditingRanksFor(u.id);
    try { setUserRanks((await api.getUserRanks(u.id)).map((r) => r.id ?? r)); } catch (_) { setUserRanks([]); }
  };
  const saveUserRanks = async () => {
    try { await api.setUserRanks(editingRanksFor, userRanks); setEditingRanksFor(null); notify('Rangi zapisane.', 'success'); } catch (e) { notify(e.message, 'error'); }
  };
  const removeUser = async (id) => {
    try { await api.deleteUser(id); load(); } catch (e) { notify(e.message, 'error'); }
  };

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-white/10">
            <th className="p-3">Użytkownik</th><th className="p-3">Rola</th><th className="p-3">Rangi</th><th className="p-3">Metoda</th><th className="p-3">Ostatnie logowanie</th><th className="p-3 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {users === null ? (
            <tr><td colSpan={6} className="p-6 text-center text-slate-400">Ładowanie...</td></tr>
          ) : users.map((u) => (
            <tr key={u.id} className="border-b border-slate-100 dark:border-white/5">
              <td className="p-3"><div className="flex items-center gap-2"><Avatar src={u.avatar} name={u.display_name || u.username} size="sm" /><span className="font-medium text-slate-800 dark:text-slate-200">{u.display_name || u.username}</span></div></td>
              <td className="p-3"><Badge tone={ROLE_TONES[u.role] || 'neutral'}>{ROLE_LABELS[u.role] || u.role}</Badge></td>
              <td className="p-3">
                {editingRanksFor === u.id ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ranks.map((r) => (
                      <button key={r.id} onClick={() => setUserRanks((prev) => prev.includes(r.id) ? prev.filter((x) => x !== r.id) : [...prev, r.id])}
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold border" style={{ borderColor: r.color, color: userRanks.includes(r.id) ? '#fff' : r.color, background: userRanks.includes(r.id) ? r.color : 'transparent' }}>
                        {r.name}
                      </button>
                    ))}
                    <button onClick={saveUserRanks} className="text-[11px] font-semibold text-brand-500">Zapisz</button>
                  </div>
                ) : (
                  <button onClick={() => openRankEditor(u)} className="text-xs text-slate-400 hover:text-brand-500">Edytuj rangi</button>
                )}
              </td>
              <td className="p-3 text-slate-500 capitalize">{u.auth_method}</td>
              <td className="p-3 text-slate-400 text-xs">{u.last_login ? new Date(u.last_login).toLocaleString('pl-PL') : '—'}</td>
              <td className="p-3"><button onClick={() => removeUser(u.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default function ManagePage() {
  const [tab, setTab] = useState('categories');
  return (
    <div className="p-6 sm:p-10">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-display mb-6">Zarządzanie</h1>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'users' && <UsersTab />}
    </div>
  );
}
