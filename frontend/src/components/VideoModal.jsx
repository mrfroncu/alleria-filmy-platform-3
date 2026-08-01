import React, { useState, useEffect } from 'react';
import { Plus, X, Upload } from 'lucide-react';
import { api } from '../utils/apiClient';
import { buildCategoryTree } from '../utils/helpers';
import { useToast } from './ui/Toast';
import Modal from './ui/Modal';
import Input, { Label } from './ui/Input';
import Button from './ui/Button';
import VideoUploadField from './VideoUploadField';

const SOURCE_TYPES = [
  { value: 'youtube', label: 'YouTube / Link' },
  { value: 'streamer', label: 'Self-hosted (upload)' },
  { value: 'plex', label: 'Plex' },
  { value: 'embed', label: 'Kod HTML embed' },
];
function categoryOptions(tree, depth = 0) {
  let out = [];
  for (const c of tree) {
    out.push({ value: c.id, label: `${'— '.repeat(depth)}${c.name}` });
    out = out.concat(categoryOptions(c.children, depth + 1));
  }
  return out;
}

const emptyForm = {
  title: '', author_id: '', category_id: '', main_source_type: 'youtube', main_source: '', main_source_title: '',
  thumbnail: '', description: '', publish_date: '', access_mode: 'category',
  stream_video_id: '', drm_enhanced: false,
  mirror1_name: '', mirror1_url: '', mirror1_type: 'link',
  mirror2_name: '', mirror2_url: '', mirror2_type: 'link',
};

export default function VideoModal({ open, onClose, onSaved, video, categories, users }) {
  const notify = useToast();
  const [form, setForm] = useState(emptyForm);
  const [thumbFile, setThumbFile] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [saving, setSaving] = useState(false);

  const catOptions = categoryOptions(buildCategoryTree(categories || []));

  useEffect(() => {
    if (!open) return;
    api.getTags().then(setAllTags).catch(() => setAllTags([]));
    if (video) {
      setForm({
        title: video.title || '', author_id: video.author_id || '', category_id: video.category_id || '',
        main_source_type: video.main_source_type || 'youtube', main_source: video.main_source || '',
        main_source_title: video.main_source_title || '', thumbnail: video.thumbnail || '',
        description: video.description || '', publish_date: video.publish_date ? video.publish_date.slice(0, 16) : '',
        access_mode: video.access_mode || 'category',
        stream_video_id: video.stream_video_id || '', drm_enhanced: !!video.drm_enhanced,
        mirror1_name: video.mirror1_name || '', mirror1_url: video.mirror1_url || '', mirror1_type: video.mirror1_type || 'link',
        mirror2_name: video.mirror2_name || '', mirror2_url: video.mirror2_url || '', mirror2_type: video.mirror2_type || 'link',
      });
      setSelectedTags(video.tags || []);
      if (video.access_mode === 'custom') {
        api.getVideoAccess(video.id).then((r) => setAllowedUsers(r.user_ids || r || [])).catch(() => {});
      }
    } else {
      setForm(emptyForm);
      setSelectedTags([]);
      setAllowedUsers([]);
    }
    setThumbFile(null);
  }, [open, video]);

  const toggleTag = (tag) => {
    setSelectedTags((prev) => (prev.some((t) => t.id === tag.id) ? prev.filter((t) => t.id !== tag.id) : [...prev, tag]));
  };
  const addNewTag = () => {
    if (!tagInput.trim()) return;
    setSelectedTags((prev) => [...prev, { id: `new-${Date.now()}`, name: tagInput.trim(), isNew: true }]);
    setTagInput('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      const payload = { ...form, drm_enhanced: form.drm_enhanced ? '1' : '0' };
      if (form.main_source_type === 'streamer' && form.stream_video_id) {
        payload.main_source = `self-hosted:${form.stream_video_id}`;
      }
      Object.entries(payload).forEach(([k, v]) => fd.append(k, v ?? ''));
      fd.append('tags', JSON.stringify(selectedTags.map((t) => (t.isNew ? { name: t.name } : { id: t.id }))));
      if (form.access_mode === 'custom') fd.append('allowed_users', JSON.stringify(allowedUsers));
      if (thumbFile) fd.append('thumbnail_file', thumbFile);

      if (video) await api.updateVideo(video.id, fd);
      else await api.createVideo(fd);

      notify(video ? 'Film zaktualizowany.' : 'Film dodany.', 'success');
      onSaved();
      onClose();
    } catch (e) {
      notify(e.message, 'error');
    }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={video ? 'Edytuj film' : 'Dodaj film'} maxWidth="max-w-2xl">
      <form onSubmit={submit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div>
          <Label>Tytuł</Label>
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Autor</Label>
            <select value={form.author_id} onChange={(e) => setForm((f) => ({ ...f, author_id: e.target.value }))} className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-2.5 text-sm">
              <option value="">—</option>
              {(users || []).map((u) => <option key={u.id} value={u.id}>{u.display_name || u.username}</option>)}
            </select>
          </div>
          <div>
            <Label>Kategoria</Label>
            <select value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))} className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-2.5 text-sm">
              <option value="">—</option>
              {catOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <Label>Typ źródła</Label>
          <div className="flex flex-wrap gap-2">
            {SOURCE_TYPES.map((t) => (
              <button key={t.value} type="button" onClick={() => setForm((f) => ({ ...f, main_source_type: t.value }))}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${form.main_source_type === t.value ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {form.main_source_type === 'streamer' ? (
          <div className="space-y-3">
            <VideoUploadField streamVideoId={form.stream_video_id} onUploaded={(id) => setForm((f) => ({ ...f, stream_video_id: id }))} />
            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
              <input type="checkbox" checked={form.drm_enhanced} onChange={(e) => setForm((f) => ({ ...f, drm_enhanced: e.target.checked }))} />
              Wzmocniona ochrona DRM (znak wodny, blokada devtools/przechwytywania)
            </label>
          </div>
        ) : (
          <div>
            <Label>{form.main_source_type === 'embed' ? 'Kod HTML embed' : 'URL źródła'}</Label>
            {form.main_source_type === 'embed' ? (
              <textarea value={form.main_source} onChange={(e) => setForm((f) => ({ ...f, main_source: e.target.value }))} rows={3}
                className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-2.5 text-sm font-mono" />
            ) : (
              <Input value={form.main_source} onChange={(e) => setForm((f) => ({ ...f, main_source: e.target.value }))} placeholder="https://..." />
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Miniatura (URL)</Label>
            <Input value={form.thumbnail} onChange={(e) => setForm((f) => ({ ...f, thumbnail: e.target.value }))} placeholder="https://..." />
          </div>
          <div>
            <Label>lub plik</Label>
            <label className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 dark:border-white/15 px-4 py-2.5 text-sm text-slate-400 cursor-pointer hover:border-brand-400">
              <Upload className="w-4 h-4" /> {thumbFile?.name || 'Wybierz plik'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setThumbFile(e.target.files?.[0] || null)} />
            </label>
          </div>
        </div>

        <div>
          <Label>Opis</Label>
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3}
            className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-2.5 text-sm" />
        </div>

        <div>
          <Label>Data publikacji</Label>
          <input type="datetime-local" value={form.publish_date} onChange={(e) => setForm((f) => ({ ...f, publish_date: e.target.value }))}
            className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-2.5 text-sm" />
        </div>

        <div>
          <Label>Tagi</Label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {allTags.map((t) => (
              <button key={t.id} type="button" onClick={() => toggleTag(t)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${selectedTags.some((s) => s.id === t.id) ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}>
                {t.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Nowy tag..." onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNewTag(); } }} />
            <Button type="button" size="sm" variant="secondary" onClick={addNewTag}><Plus className="w-3.5 h-3.5" /></Button>
          </div>
          {selectedTags.filter((t) => t.isNew).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selectedTags.filter((t) => t.isNew).map((t) => (
                <span key={t.id} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-600 dark:text-teal-300">
                  {t.name} <button type="button" onClick={() => toggleTag(t)}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        <details className="rounded-2xl border border-slate-200 dark:border-white/10 p-4">
          <summary className="text-sm font-semibold cursor-pointer text-slate-700 dark:text-slate-200">Mirrory (opcjonalne)</summary>
          <div className="mt-3 space-y-3">
            {[1, 2].map((n) => (
              <div key={n} className="grid grid-cols-3 gap-2">
                <Input placeholder={`Nazwa mirror ${n}`} value={form[`mirror${n}_name`]} onChange={(e) => setForm((f) => ({ ...f, [`mirror${n}_name`]: e.target.value }))} />
                <Input placeholder="URL" value={form[`mirror${n}_url`]} onChange={(e) => setForm((f) => ({ ...f, [`mirror${n}_url`]: e.target.value }))} className="col-span-2" />
              </div>
            ))}
          </div>
        </details>

        <div>
          <Label>Dostęp</Label>
          <div className="flex gap-2 mb-2">
            <button type="button" onClick={() => setForm((f) => ({ ...f, access_mode: 'category' }))}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${form.access_mode === 'category' ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}>Wg kategorii</button>
            <button type="button" onClick={() => setForm((f) => ({ ...f, access_mode: 'custom' }))}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${form.access_mode === 'custom' ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}>Lista niestandardowa</button>
          </div>
          {form.access_mode === 'custom' && (
            <div className="max-h-32 overflow-y-auto rounded-2xl border border-slate-200 dark:border-white/10 p-2 space-y-1">
              {(users || []).map((u) => (
                <label key={u.id} className="flex items-center gap-2 px-2 py-1 text-xs">
                  <input type="checkbox" checked={allowedUsers.includes(u.id)} onChange={(e) => setAllowedUsers((prev) => e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id))} />
                  {u.display_name || u.username}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={saving}>{saving ? 'Zapisywanie...' : 'Zapisz'}</Button>
          <Button type="button" variant="secondary" onClick={onClose}>Anuluj</Button>
        </div>
      </form>
    </Modal>
  );
}
