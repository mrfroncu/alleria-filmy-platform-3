import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Tag, Film, Search, X, CheckSquare, Square, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate } from '../utils/helpers';
import VideoModal from '../components/VideoModal';

export default function AdminPage() {
  const [videos, setVideos] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [tags, setTags] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState('videos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [searchVideos, setSearchVideos] = useState('');

  // Bulk actions
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAction, setBulkAction] = useState('');
  const [bulkValue, setBulkValue] = useState('');

  const [expandedTag, setExpandedTag] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [v, au, t, c] = await Promise.all([
        api.getVideos({ include_transcoding: '1' }), api.getAllUsers(), api.getTags(), api.getCategories()
      ]);
      setVideos(v); setAllUsers(au); setTags(t); setCategories(c);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // Auto-poll transcode status every 15 seconds
  const [transcodeProgress, setTranscodeProgress] = useState({});
  useEffect(() => {
    const hasTranscoding = videos.some(v => v.stream_status === 'transcoding');
    if (!hasTranscoding) return;
    const poll = async () => {
      const transcoding = videos.filter(v => v.stream_status === 'transcoding');
      let changed = false;
      for (const v of transcoding) {
        try {
          const st = await api.streamCheck(v.id);
          if (st.progress !== undefined) {
            setTranscodeProgress(prev => ({ ...prev, [v.id]: { progress: st.progress, quality: st.quality } }));
          }
          if (st.status === 'ready' || st.status === 'error') changed = true;
        } catch (e) {}
      }
      if (changed) loadData();
    };
    poll(); // immediate first check
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [videos]);

  const handleDelete = async (id) => {
    try {
      await api.deleteVideo(id);
      setDeleteConfirm(null);
      loadData();
    } catch (err) { alert('Błąd: ' + err.message); }
  };

  const handleDeleteTag = async (id) => {
    if (!confirm('Usunąć ten tag?')) return;
    try {
      await api.deleteTag(id);
      setTags(prev => prev.filter(t => t.id !== id));
    } catch (err) { alert('Błąd: ' + err.message); }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.length === 0) return;
    const label = bulkAction === 'delete' ? `USUNĄĆ ${selectedIds.length} filmów` : `zmienić ${selectedIds.length} filmów`;
    if (!confirm(`Czy na pewno chcesz ${label}?`)) return;
    try {
      await api.bulkVideos({ action: bulkAction, video_ids: selectedIds, value: bulkValue || null });
      setSelectedIds([]); setBulkAction(''); setBulkValue('');
      loadData();
    } catch (err) { alert('Błąd: ' + err.message); }
  };

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredVideos.length) setSelectedIds([]);
    else setSelectedIds(filteredVideos.map(v => v.id));
  };
  const getCatName = (catId) => categories.find(c => c.id === catId)?.name || '—';

  const filteredVideos = videos.filter(v =>
    v.title.toLowerCase().includes(searchVideos.toLowerCase())
  );

  const tabs = [
    { key: 'videos', label: 'Biblioteka', icon: Film },
    { key: 'tags', label: 'Tagi', icon: Tag },
  ];

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto page-enter">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display mb-3">Panel Redaktora</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Zarządzaj filmami i tagami platformy.</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-zinc-200 dark:border-zinc-800">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* === VIDEOS TAB === */}
      {tab === 'videos' && (
        <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input type="text" value={searchVideos} onChange={e => setSearchVideos(e.target.value)} placeholder="Szukaj filmów..." className="input-field pl-11 !py-3 text-sm" />
            </div>
            <button onClick={() => { setEditingVideo(null); setIsModalOpen(true); }} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Dodaj film
            </button>
          </div>

          {/* Bulk action toolbar */}
          {selectedIds.length > 0 && (
            <div className="mb-4 p-4 bg-violet-50 dark:bg-violet-500/10 rounded-2xl border border-violet-200 dark:border-violet-500/20 flex flex-wrap items-center gap-3 animate-slide-up">
              <span className="text-sm font-bold text-violet-600 dark:text-violet-300">Zaznaczono: {selectedIds.length}</span>
              <select value={bulkAction} onChange={e => { setBulkAction(e.target.value); setBulkValue(''); }} className="input-field !py-2 !px-3 text-sm !w-auto min-w-[160px]">
                <option value="">Wybierz akcję...</option>
                <option value="change_category">Zmień kategorię</option>
                <option value="change_author">Zmień autora</option>
                <option value="change_access">Zmień uprawnienia</option>
                <option value="delete">Usuń zaznaczone</option>
              </select>
              {bulkAction === 'change_category' && (
                <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="input-field !py-2 !px-3 text-sm !w-auto min-w-[140px]">
                  <option value="">Bez kategorii</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {bulkAction === 'change_author' && (
                <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="input-field !py-2 !px-3 text-sm !w-auto min-w-[140px]">
                  <option value="">Wybierz...</option>
                  {allUsers.map(u => <option key={u.id} value={u.id}>{u.display_name || u.username}</option>)}
                </select>
              )}
              {bulkAction === 'change_access' && (
                <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="input-field !py-2 !px-3 text-sm !w-auto min-w-[140px]">
                  <option value="category">Z kategorii</option>
                  <option value="custom">Niestandardowe</option>
                </select>
              )}
              <button onClick={handleBulkAction} disabled={!bulkAction} className="btn-primary !py-2 text-sm">Wykonaj</button>
              <button onClick={() => { setSelectedIds([]); setBulkAction(''); }} className="text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-white">Anuluj</button>
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th className="w-10 px-3 py-4">
                      <button onClick={toggleSelectAll} className="text-zinc-400 hover:text-violet-500 transition-colors">
                        {selectedIds.length === filteredVideos.length && filteredVideos.length > 0 ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">ID</th>
                    <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Tytuł</th>
                    <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Autor</th>
                    <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Kategoria</th>
                    <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Dostęp</th>
                    <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Data</th>
                    <th className="text-right px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/50">
                        <td colSpan={8} className="px-6 py-4"><div className="h-5 bg-zinc-100 dark:bg-zinc-800 rounded skeleton" /></td>
                      </tr>
                    ))
                  ) : filteredVideos.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-zinc-400 text-sm">Brak filmów</td>
                    </tr>
                  ) : (
                    filteredVideos.map(video => (
                      <tr key={video.id} className={`border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors ${selectedIds.includes(video.id) ? 'bg-violet-50/50 dark:bg-violet-500/5' : ''}`}>
                        <td className="w-10 px-3 py-3">
                          <button onClick={() => toggleSelect(video.id)} className="text-zinc-400 hover:text-violet-500 transition-colors">
                            {selectedIds.includes(video.id) ? <CheckSquare className="w-4 h-4 text-violet-500" /> : <Square className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-zinc-400">{video.id}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {video.thumbnail && <img src={video.thumbnail} alt="" className="w-10 h-7 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700 shrink-0" />}
                            <div className="min-w-0">
                              <span className="text-sm font-bold text-zinc-900 dark:text-white block truncate max-w-[200px]">{video.title}</span>
                              {video.stream_video_id && video.stream_status === 'transcoding' && (
                                <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1">
                                  <span className="w-1 h-1 bg-amber-500 rounded-full animate-pulse" />
                                  Transkodowanie{transcodeProgress[video.id] ? ` ${transcodeProgress[video.id].progress}%` : '...'}
                                  {transcodeProgress[video.id]?.quality && <span className="text-zinc-400 ml-1">({transcodeProgress[video.id].quality})</span>}
                                </span>
                              )}
                              {video.stream_video_id && video.stream_status === 'ready' && (
                                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1"><span className="w-1 h-1 bg-emerald-500 rounded-full" /> Gotowy{video.drm_enhanced ? ' • DRM' : ''}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 truncate max-w-[120px]">{video.author_display_name || video.author_name}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold ${video.category_id ? 'text-violet-500 dark:text-violet-400' : 'text-zinc-400'}`}>
                            {getCatName(video.category_id)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${video.access_mode === 'custom' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                            {video.access_mode === 'custom' ? 'Custom' : 'Kategoria'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-500 font-mono whitespace-nowrap">{formatDate(video.publish_date)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => { setEditingVideo(video); setIsModalOpen(true); }} className="p-1.5 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-lg transition-colors text-zinc-400 hover:text-violet-500 dark:hover:text-violet-400">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeleteConfirm(video)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors text-zinc-400 hover:text-red-600 dark:hover:text-red-400">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* === TAGS TAB === */}
      {tab === 'tags' && (
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display mb-4">Zarządzanie tagami</h2>
          <div className="card overflow-hidden">
            {tags.length === 0 ? (
              <p className="text-zinc-400 text-sm text-center py-8">Brak tagów</p>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {tags.map(tag => {
                  const hasVideos = tag.video_count > 0;
                  const isExpanded = expandedTag === tag.id;
                  return (
                    <div key={tag.id}>
                      <div className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                        <Tag className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                        <span className="text-sm font-bold text-zinc-900 dark:text-white flex-1">{tag.name}</span>
                        {hasVideos ? (
                          <>
                            <button
                              onClick={() => setExpandedTag(isExpanded ? null : tag.id)}
                              className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-all"
                            >
                              <Film className="w-3 h-3" />
                              {tag.video_count} {tag.video_count === 1 ? 'film' : 'filmów'}
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                            <div className="w-7 h-7 flex items-center justify-center text-zinc-300 dark:text-zinc-600" title="Nie można usunąć — tag jest przypisany do filmów">
                              <Lock className="w-3.5 h-3.5" />
                            </div>
                          </>
                        ) : (
                          <button onClick={() => handleDeleteTag(tag.id)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg transition-colors text-zinc-400 hover:text-red-500">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {isExpanded && (
                        <div className="mx-5 mb-3 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl">
                          <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider mb-2">Nie można usunąć — tag przypisany do filmów:</p>
                          <div className="space-y-1">
                            {tag.videos.map(v => (
                              <p key={v.id} className="text-xs text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                                <span className="text-zinc-400 font-mono text-[10px]">#{v.id}</span>
                                {v.title}
                              </p>
                            ))}
                          </div>
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

      {/* Video Modal */}
      <VideoModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingVideo(null); }}
        video={editingVideo}
        users={allUsers}
        onSaved={loadData}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)} />
          <div className="modal-content max-w-md p-10 text-center" style={{ animation: 'slideUp 0.3s ease-out' }}>
            <div className="w-20 h-20 bg-red-50 dark:bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 text-red-600 border border-red-100 dark:border-red-500/20">
              <Trash2 className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-4 font-display">Usunąć film?</h3>
            <p className="text-zinc-500 dark:text-zinc-400 mb-10 leading-relaxed text-sm">
              Czy na pewno chcesz usunąć <strong className="text-zinc-900 dark:text-white">"{deleteConfirm.title}"</strong>? Tej operacji nie można cofnąć.
            </p>
            <div className="flex gap-4">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 btn-secondary">Anuluj</button>
              <button onClick={() => handleDelete(deleteConfirm.id)} className="flex-1 btn-danger">Usuń</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


