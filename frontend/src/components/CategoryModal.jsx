import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { api } from '../utils/api';
import { buildCategoryTreeOptions } from '../utils/helpers';
import { useConfirm } from '../contexts/ConfirmContext';
import { useToast } from '../contexts/ToastContext';

const EMPTY_SHAPE = {
  name: '', desc: '', order: '0', parentId: '',
  viewerMode: 'public', editorMode: 'none', viewerRoles: '', editorRoles: '',
  viewerRankIds: [], editorRankIds: [], viewerUserIds: [], editorUserIds: [],
  webhookUrl: '', webhookTemplate: '', webhookEnabled: false, emailEnabled: false, pushEnabled: false,
  isShortsCategory: false,
};

const sortIds = (arr) => [...arr].sort((a, b) => a - b);

export default function CategoryModal({ isOpen, onClose, category, cats = [], allUsers = [], ranks = [], onSaved }) {
  const isEdit = !!category;
  const confirm = useConfirm();
  const toast = useToast();

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [order, setOrder] = useState('0');
  const [parentId, setParentId] = useState('');
  const [viewerMode, setViewerMode] = useState('public');
  const [editorMode, setEditorMode] = useState('none');
  const [viewerRoles, setViewerRoles] = useState('');
  const [editorRoles, setEditorRoles] = useState('');
  const [viewerRankIds, setViewerRankIds] = useState([]);
  const [editorRankIds, setEditorRankIds] = useState([]);
  const [viewerUserIds, setViewerUserIds] = useState([]);
  const [editorUserIds, setEditorUserIds] = useState([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookTemplate, setWebhookTemplate] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isShortsCategory, setIsShortsCategory] = useState(false);
  const [baseline, setBaseline] = useState(EMPTY_SHAPE);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (category) {
      setName(category.name);
      setDesc(category.description || '');
      setOrder(String(category.sort_order || 0));
      setParentId(String(category.parent_id || ''));
      setWebhookUrl(category.webhook_url || '');
      setWebhookTemplate(category.webhook_template || '');
      setWebhookEnabled(!!category.webhook_enabled);
      setEmailEnabled(!!category.email_enabled);
      setPushEnabled(!!category.push_enabled);
      setIsShortsCategory(!!category.is_shorts_category);
      const rawMode = category.access_mode || 'public:none';
      const [vm, em] = rawMode.includes(':') ? rawMode.split(':')
        : rawMode === 'custom' ? ['custom', 'none']
        : rawMode === 'roles' ? ['roles', 'roles']
        : ['public', 'none'];
      setViewerMode(vm);
      setEditorMode(em);
      const vRoles = (category.access || []).filter(a => a.access_type === 'viewer').map(a => a.discord_role_id).join(',');
      const eRoles = (category.access || []).filter(a => a.access_type === 'editor').map(a => a.discord_role_id).join(',');
      const vRankIds = (category.rank_access || []).filter(a => a.access_type === 'viewer').map(a => a.rank_id);
      const eRankIds = (category.rank_access || []).filter(a => a.access_type === 'editor').map(a => a.rank_id);
      setViewerRoles(vRoles);
      setEditorRoles(eRoles);
      setViewerRankIds(vRankIds);
      setEditorRankIds(eRankIds);
      setViewerUserIds([]);
      setEditorUserIds([]);
      setBaseline({
        name: category.name, desc: category.description || '', order: String(category.sort_order || 0), parentId: String(category.parent_id || ''),
        viewerMode: vm, editorMode: em, viewerRoles: vRoles, editorRoles: eRoles, viewerRankIds: vRankIds, editorRankIds: eRankIds,
        viewerUserIds: [], editorUserIds: [],
        webhookUrl: category.webhook_url || '', webhookTemplate: category.webhook_template || '', webhookEnabled: !!category.webhook_enabled,
        emailEnabled: !!category.email_enabled, pushEnabled: !!category.push_enabled, isShortsCategory: !!category.is_shorts_category,
      });
      if (vm === 'custom' || em === 'custom') {
        api.getCategoryUserAccess(category.id).then(r => {
          const vUserIds = (r.viewer_users || []).map(u => u.id);
          const eUserIds = (r.editor_users || []).map(u => u.id);
          setViewerUserIds(vUserIds);
          setEditorUserIds(eUserIds);
          // Patch the baseline once the async fetch lands, so the dirty-check doesn't fire the
          // instant this list loads (it would otherwise compare live ids against an empty baseline).
          setBaseline(b => ({ ...b, viewerUserIds: vUserIds, editorUserIds: eUserIds }));
        }).catch(() => {});
      }
    } else {
      setName(''); setDesc(''); setOrder('0'); setParentId('');
      setViewerMode('public'); setEditorMode('none');
      setViewerRoles(''); setEditorRoles('');
      setViewerRankIds([]); setEditorRankIds([]);
      setViewerUserIds([]); setEditorUserIds([]);
      setWebhookUrl(''); setWebhookTemplate(''); setWebhookEnabled(false);
      setEmailEnabled(false); setPushEnabled(false); setIsShortsCategory(false);
      setBaseline(EMPTY_SHAPE);
    }
  }, [isOpen, category]);

  const currentShape = {
    name, desc, order, parentId,
    viewerMode, editorMode, viewerRoles, editorRoles,
    viewerRankIds: sortIds(viewerRankIds), editorRankIds: sortIds(editorRankIds),
    viewerUserIds: sortIds(viewerUserIds), editorUserIds: sortIds(editorUserIds),
    webhookUrl, webhookTemplate, webhookEnabled, emailEnabled, pushEnabled, isShortsCategory,
  };
  const baselineShape = {
    ...baseline, viewerRankIds: sortIds(baseline.viewerRankIds), editorRankIds: sortIds(baseline.editorRankIds),
    viewerUserIds: sortIds(baseline.viewerUserIds), editorUserIds: sortIds(baseline.editorUserIds),
  };
  const dirty = isOpen && JSON.stringify(currentShape) !== JSON.stringify(baselineShape);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const guardedClose = async () => {
    if (dirtyRef.current && !(await confirm('Masz niezapisane zmiany w tej kategorii. Zamknąć bez zapisywania?', { danger: true, confirmLabel: 'Odrzuć zmiany' }))) return;
    onClose();
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && isOpen) guardedClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const toggleId = (setter, id) => setter(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const data = {
        name, description: desc, sort_order: parseInt(order) || 0, parent_id: parentId ? parseInt(parentId) : null,
        webhook_url: webhookUrl, webhook_template: webhookTemplate, webhook_enabled: webhookEnabled,
        email_enabled: emailEnabled, push_enabled: pushEnabled,
        is_shorts_category: isShortsCategory,
      };
      const accessPayload = {
        viewer_mode: viewerMode,
        editor_mode: editorMode,
        viewers: viewerMode === 'roles' ? viewerRoles.split(',').map(s => s.trim()).filter(Boolean) : [],
        editors: editorMode === 'roles' ? editorRoles.split(',').map(s => s.trim()).filter(Boolean) : [],
        rank_viewers: viewerMode === 'roles' ? viewerRankIds : [],
        rank_editors: editorMode === 'roles' ? editorRankIds : [],
        viewer_user_ids: viewerMode === 'custom' ? viewerUserIds : [],
        editor_user_ids: editorMode === 'custom' ? editorUserIds : [],
      };
      if (isEdit) {
        await api.updateCategory(category.id, data);
        await api.setCategoryAccess(category.id, accessPayload);
        toast.success(`Kategoria "${name}" zaktualizowana.`);
      } else {
        const r = await api.createCategory(data);
        if (r.category) await api.setCategoryAccess(r.category.id, accessPayload);
        toast.success(`Kategoria "${name}" utworzona.`);
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error('Błąd: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-backdrop" onClick={guardedClose} />
      <div className="modal-content max-w-2xl" style={{ animation: 'slideUp 0.3s ease-out' }}>
        <div className="p-8 sm:p-10">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">
              {isEdit ? 'Edytuj kategorię' : 'Nowa kategoria'}
            </h2>
            <button onClick={guardedClose} className="btn-icon-zinc">
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label-field">Nazwa kategorii</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="np. Filmy akcji" required /></div>
              <div><label className="label-field">Kolejność sortowania</label><input type="number" value={order} onChange={e => setOrder(e.target.value)} className="input-field" placeholder="0" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label-field">Opis (opcjonalnie)</label><input type="text" value={desc} onChange={e => setDesc(e.target.value)} className="input-field" placeholder="Opis kategorii" /></div>
              <div><label className="label-field">Kategoria nadrzędna</label>
                <select value={parentId} onChange={e => setParentId(e.target.value)} className="input-field appearance-none cursor-pointer">
                  <option value="">Brak (główna)</option>
                  {buildCategoryTreeOptions(cats, category?.id).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
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
                    <button key={val} type="button" onClick={() => setViewerMode(val)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewerMode === val ? 'bg-blue-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
                {viewerMode === 'roles' && (
                  <div className="space-y-2">
                    <input type="text" value={viewerRoles} onChange={e => setViewerRoles(e.target.value)} className="input-field font-mono text-sm" placeholder="Discord Role IDs, np. 123456,789012 (puste = brak filtrowania)" />
                    {ranks.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {ranks.map(r => (
                          <button key={r.id} type="button" onClick={() => toggleId(setViewerRankIds, r.id)}
                            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all border ${viewerRankIds.includes(r.id) ? 'text-white border-transparent' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'}`}
                            style={viewerRankIds.includes(r.id) ? { backgroundColor: r.color, borderColor: r.color } : {}}>
                            {r.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {viewerMode === 'custom' && (
                  <div className="max-h-36 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800">
                    {allUsers.map(u => (
                      <label key={u.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                        <input type="checkbox" checked={viewerUserIds.includes(u.id)} onChange={() => toggleId(setViewerUserIds, u.id)} className="rounded accent-blue-500" />
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
                    <button key={val} type="button" onClick={() => setEditorMode(val)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${editorMode === val ? 'bg-amber-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
                {editorMode === 'roles' && (
                  <div className="space-y-2">
                    <input type="text" value={editorRoles} onChange={e => setEditorRoles(e.target.value)} className="input-field font-mono text-sm" placeholder="Discord Role IDs, np. 123456,789012" />
                    {ranks.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {ranks.map(r => (
                          <button key={r.id} type="button" onClick={() => toggleId(setEditorRankIds, r.id)}
                            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all border ${editorRankIds.includes(r.id) ? 'text-white border-transparent' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'}`}
                            style={editorRankIds.includes(r.id) ? { backgroundColor: r.color, borderColor: r.color } : {}}>
                            {r.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {editorMode === 'custom' && (
                  <div className="max-h-36 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800">
                    {allUsers.map(u => (
                      <label key={u.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                        <input type="checkbox" checked={editorUserIds.includes(u.id)} onChange={() => toggleId(setEditorUserIds, u.id)} className="rounded accent-amber-500" />
                        <span className="text-sm text-zinc-900 dark:text-white font-medium">{u.display_name || u.username}</span>
                        <span className="text-xs text-zinc-400 ml-auto">{u.role}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="label-field">Discord Webhook URL (opcjonalnie)</label>
              <input type="text" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} className="input-field font-mono" placeholder="https://discord.com/api/webhooks/..." />
            </div>
            <div>
              <label className="label-field">Szablon wiadomości webhook</label>
              <textarea value={webhookTemplate} onChange={e => setWebhookTemplate(e.target.value)} className="input-field font-mono resize-y h-36 min-h-[6rem]" placeholder={'🎬 **Nowy film:** {title}\n👤 Autor: {author}\n📁 Kategoria: {category}\n🔗 {url}'} />
              <p className="text-[9px] text-zinc-400 mt-1">Placeholdery: {'{title}'} {'{author}'} {'{category}'} {'{description}'} {'{date}'} {'{id}'} {'{url}'} {'{thumbnail}'}</p>
            </div>
            <label className="flex items-center gap-3 cursor-pointer p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <input type="checkbox" checked={webhookEnabled} onChange={e => setWebhookEnabled(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500" />
              <span className="text-sm text-zinc-900 dark:text-white font-bold">Wysyłaj webhook Discord dla tej kategorii</span>
            </label>

            <div>
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <input type="checkbox" checked={emailEnabled} onChange={e => setEmailEnabled(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500" />
                <span className="text-sm text-zinc-900 dark:text-white font-bold">Wysyłaj powiadomienia email dla tej kategorii</span>
              </label>
              <p className="text-[9px] text-zinc-400 mt-1">Treść wiadomości: Ustawienia → Ustawienia serwera E-mail → Szablony e-mail.</p>
            </div>

            <label className="flex items-center gap-3 cursor-pointer p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <input type="checkbox" checked={pushEnabled} onChange={e => setPushEnabled(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500" />
              <span className="text-sm text-zinc-900 dark:text-white font-bold">Wysyłaj powiadomienia przeglądarkowe dla tej kategorii</span>
            </label>

            <div>
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <input type="checkbox" checked={isShortsCategory} onChange={e => setIsShortsCategory(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500" />
                <span className="text-sm text-zinc-900 dark:text-white font-bold">Kategoria Shortów</span>
              </label>
              <p className="text-[9px] text-zinc-400 mt-1">Kliknięcie filmu w tej kategorii uruchomi odtwarzanie sekwencyjne (jeden film przechodzi w kolejny) zamiast zwykłej strony filmu. Format dowolny — nie musi być pionowy.</p>
            </div>

            <button type="submit" disabled={submitting} className="w-full py-5 bg-gradient-to-br from-violet-500 to-violet-600 text-white rounded-2xl font-bold hover:from-violet-600 hover:to-violet-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-xl shadow-violet-500/20 active:scale-[0.98]">
              {submitting ? 'Zapisywanie...' : isEdit ? 'Zapisz zmiany' : 'Dodaj kategorię'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
