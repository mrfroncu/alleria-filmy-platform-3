import React, { useState, useEffect, useCallback } from 'react';
import { Library, Tag as TagIcon, Search, Plus, Pencil, Trash2, Film, Layers } from 'lucide-react';
import { api } from '../utils/apiClient';
import { formatDate } from '../utils/helpers';
import { useToast } from '../components/ui/Toast';
import TabBar from '../components/ui/TabBar';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import VideoModal from '../components/VideoModal';

const TABS = [
  { id: 'library', label: 'Biblioteka', icon: Library },
  { id: 'tags', label: 'Tagi', icon: TagIcon },
];

function LibraryTab({ categories, users }) {
  const notify = useToast();
  const [videos, setVideos] = useState(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [modalVideo, setModalVideo] = useState(undefined); // undefined = closed, null = new, obj = edit
  const [deleteId, setDeleteId] = useState(null);
  const [bulkAction, setBulkAction] = useState('');
  const [bulkValue, setBulkValue] = useState('');

  const load = useCallback(() => {
    api.getVideos({ search, limit: 500, include_transcoding: 1 }).then(setVideos).catch(() => setVideos([]));
  }, [search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const hasTranscoding = videos?.some((v) => v.stream_status && v.stream_status !== 'ready');
    if (!hasTranscoding) return;
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [videos, load]);

  const toggleSelect = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSelected((s) => (s.length === videos.length ? [] : videos.map((v) => v.id)));

  const applyBulk = async () => {
    if (!bulkAction || selected.length === 0) return;
    try {
      await api.bulkVideos(bulkAction, selected, bulkValue);
      notify('Zastosowano akcję zbiorczą.', 'success');
      setSelected([]);
      setBulkAction('');
      load();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const confirmDelete = async () => {
    try {
      await api.deleteVideo(deleteId);
      setDeleteId(null);
      load();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj..." className="pl-10" />
        </div>
        <Button size="sm" onClick={() => setModalVideo(null)}><Plus className="w-3.5 h-3.5" /> Dodaj film</Button>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-2xl bg-brand-500/10">
          <span className="text-xs font-semibold text-brand-600 dark:text-brand-300">{selected.length} zaznaczonych</span>
          <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)} className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs">
            <option value="">Akcja...</option>
            <option value="change_category">Zmień kategorię</option>
            <option value="change_author">Zmień autora</option>
            <option value="delete">Usuń</option>
          </select>
          {bulkAction === 'change_category' && (
            <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs">
              <option value="">Kategoria...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {bulkAction === 'change_author' && (
            <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs">
              <option value="">Autor...</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.display_name || u.username}</option>)}
            </select>
          )}
          <Button size="sm" onClick={applyBulk}>Zastosuj</Button>
        </div>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-white/10">
              <th className="p-3 w-8"><input type="checkbox" checked={videos?.length > 0 && selected.length === videos.length} onChange={toggleAll} /></th>
              <th className="p-3">Film</th>
              <th className="p-3">Autor</th>
              <th className="p-3">Kategoria</th>
              <th className="p-3">Status</th>
              <th className="p-3">Data</th>
              <th className="p-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {videos === null ? (
              <tr><td colSpan={7} className="p-6 text-center text-slate-400">Ładowanie...</td></tr>
            ) : videos.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-slate-400">Brak filmów.</td></tr>
            ) : videos.map((v) => (
              <tr key={v.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5">
                <td className="p-3"><input type="checkbox" checked={selected.includes(v.id)} onChange={() => toggleSelect(v.id)} /></td>
                <td className="p-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-14 aspect-video rounded-lg bg-slate-200 dark:bg-slate-800 overflow-hidden shrink-0">
                      {v.thumbnail && <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <span className="truncate font-medium text-slate-800 dark:text-slate-200 max-w-[220px]">{v.title}</span>
                    {v.drm_enhanced ? <Badge tone="rose">DRM</Badge> : null}
                  </div>
                </td>
                <td className="p-3 text-slate-500">{v.author_display_name || v.author_name}</td>
                <td className="p-3 text-slate-500">{v.category_name || '—'}</td>
                <td className="p-3">
                  {v.stream_status && v.stream_status !== 'ready' ? <Badge tone="amber">{v.stream_status}</Badge> : <Badge tone="teal">gotowy</Badge>}
                </td>
                <td className="p-3 text-slate-400 text-xs">{formatDate(v.publish_date)}</td>
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setModalVideo(v)} className="p-1.5 rounded-lg text-slate-400 hover:text-brand-500 hover:bg-brand-500/10"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setDeleteId(v.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <VideoModal open={modalVideo !== undefined} onClose={() => setModalVideo(undefined)} onSaved={load} video={modalVideo} categories={categories} users={users} />

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Usuń film" maxWidth="max-w-sm">
        <p className="text-sm text-slate-500 mb-5">Ta operacja jest nieodwracalna.</p>
        <div className="flex gap-2">
          <Button variant="danger" onClick={confirmDelete}>Usuń</Button>
          <Button variant="secondary" onClick={() => setDeleteId(null)}>Anuluj</Button>
        </div>
      </Modal>
    </div>
  );
}

function TagsTab() {
  const notify = useToast();
  const [tags, setTags] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(() => api.getTags().then(setTags).catch(() => setTags([])), []);
  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    try {
      await api.deleteTag(id);
      load();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {tags === null ? (
        <p className="text-slate-400 text-sm">Ładowanie...</p>
      ) : tags.length === 0 ? (
        <p className="text-slate-400 text-sm">Brak tagów.</p>
      ) : tags.map((t) => (
        <Card key={t.id} className="p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">{t.name}</span>
            {t.videos?.length > 0 ? (
              <button onClick={() => setExpanded(expanded === t.id ? null : t.id)} className="text-[11px] text-slate-400 hover:text-brand-500 flex items-center gap-1">
                <Layers className="w-3 h-3" /> {t.videos.length}
              </button>
            ) : (
              <button onClick={() => remove(t.id)} className="p-1 rounded-lg text-slate-300 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
            )}
          </div>
          {expanded === t.id && t.videos?.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/10 space-y-1">
              {t.videos.map((v) => <p key={v.id} className="text-xs text-slate-400 truncate flex items-center gap-1"><Film className="w-3 h-3 shrink-0" /> {v.title}</p>)}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState('library');
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {});
    api.getAllUsers().then(setUsers).catch(() => {});
  }, []);

  return (
    <div className="p-6 sm:p-10">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-display mb-6">Panel Redaktora</h1>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'library' && <LibraryTab categories={categories} users={users} />}
      {tab === 'tags' && <TagsTab />}
    </div>
  );
}
