import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Users, Eye, LogIn, Tag, Film, Search, X, CheckSquare, Square } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate } from '../utils/helpers';
import VideoModal from '../components/VideoModal';

export default function AdminPage() {
  const [videos, setVideos] = useState([]);
  const [users, setUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [watchLogs, setWatchLogs] = useState([]);
  const [loginLogs, setLoginLogs] = useState([]);
  const [watchLogsMeta, setWatchLogsMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loginLogsMeta, setLoginLogsMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [logSubTab, setLogSubTab] = useState('watch');
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

  const loadData = async () => {
    setLoading(true);
    try {
      const [v, u, au, t, c] = await Promise.all([
        api.getVideos({ include_transcoding: '1' }), api.getUsers(), api.getAllUsers(), api.getTags(), api.getCategories()
      ]);
      setVideos(v); setUsers(u); setAllUsers(au); setTags(t); setCategories(c);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const loadLogs = async (watchPage, loginPage) => {
    try {
      const [wl, ll] = await Promise.all([
        api.getWatchLogs(watchPage || watchLogsMeta.page),
        api.getLoginLogs(loginPage || loginLogsMeta.page)
      ]);
      setWatchLogs(wl.logs || []); setWatchLogsMeta({ total: wl.total, page: wl.page, totalPages: wl.totalPages });
      setLoginLogs(ll.logs || []); setLoginLogsMeta({ total: ll.total, page: ll.page, totalPages: ll.totalPages });
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (tab === 'logs') loadLogs(1, 1); }, [tab]);

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
    { key: 'users', label: 'Użytkownicy', icon: Users },
    { key: 'logs', label: 'Logi', icon: Eye },
    { key: 'tags', label: 'Tagi', icon: Tag },
  ];

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display mb-3">Panel Redaktora</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Zarządzaj filmami, użytkownikami i logami platformy.</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all ${
              tab === t.key
                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-xl shadow-zinc-900/10 dark:shadow-white/10'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
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
            <div className="mb-4 p-4 bg-rose-50 dark:bg-rose-500/10 rounded-2xl border border-rose-200 dark:border-rose-500/20 flex flex-wrap items-center gap-3 animate-slide-up">
              <span className="text-sm font-bold text-rose-600 dark:text-rose-300">Zaznaczono: {selectedIds.length}</span>
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
                      <button onClick={toggleSelectAll} className="text-zinc-400 hover:text-rose-500 transition-colors">
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
                      <tr key={video.id} className={`border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors ${selectedIds.includes(video.id) ? 'bg-rose-50/50 dark:bg-rose-500/5' : ''}`}>
                        <td className="w-10 px-3 py-3">
                          <button onClick={() => toggleSelect(video.id)} className="text-zinc-400 hover:text-rose-500 transition-colors">
                            {selectedIds.includes(video.id) ? <CheckSquare className="w-4 h-4 text-rose-500" /> : <Square className="w-4 h-4" />}
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
                          <span className={`text-xs font-bold ${video.category_id ? 'text-rose-500 dark:text-rose-400' : 'text-zinc-400'}`}>
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
                            <button onClick={() => { setEditingVideo(video); setIsModalOpen(true); }} className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400">
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

      {/* === USERS TAB === */}
      {tab === 'users' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Użytkownik</th>
                  <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Rola</th>
                  <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Widz kategorii</th>
                  <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Redaktor kategorii</th>
                  <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Metoda</th>
                  <th className="text-left px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Ostatnio</th>
                  <th className="text-right px-4 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const userRoles = (() => { try { return JSON.parse(u.discord_roles || '[]'); } catch { return []; } })();
                  const isDevAdmin = u.role === 'dev' || u.role === 'admin';
                  const viewerCats = isDevAdmin ? categories : categories.filter(cat => {
                    const viewerRoleIds = (cat.access || []).filter(a => a.access_type === 'viewer').map(a => a.discord_role_id);
                    const editorRoleIds = (cat.access || []).filter(a => a.access_type === 'editor').map(a => a.discord_role_id);
                    return viewerRoleIds.length === 0 || userRoles.some(r => viewerRoleIds.includes(r)) || userRoles.some(r => editorRoleIds.includes(r));
                  });
                  const editorCats = isDevAdmin ? categories : categories.filter(cat => {
                    const editorRoleIds = (cat.access || []).filter(a => a.access_type === 'editor').map(a => a.discord_role_id);
                    return userRoles.some(r => editorRoleIds.includes(r));
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
                      <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                        u.role === 'dev' ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300' :
                        u.role === 'admin' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' :
                        'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}>{u.role?.toUpperCase()}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {isDevAdmin ? (
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
                        {isDevAdmin ? (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Wszystkie</span>
                        ) : editorCats.length === 0 ? (
                          <span className="text-[10px] text-zinc-400">—</span>
                        ) : editorCats.map(c => (
                          <span key={c.id} className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded">{c.name}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{u.auth_method}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500 font-mono">{formatDate(u.last_login)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={async () => {
                          if (!confirm(`Usunąć konto "${u.display_name || u.username}"?\n\nTo nie jest ban — użytkownik może zalogować się ponownie.`)) return;
                          try {
                            await api.deleteUser(u.id);
                            setUsers(prev => prev.filter(x => x.id !== u.id));
                          } catch (err) { alert('Błąd: ' + err.message); }
                        }}
                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
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

      {/* === LOGS TAB === */}
      {tab === 'logs' && (
        <div>
          {/* Sub-tabs */}
          <div className="flex gap-2 mb-6">
            <button onClick={() => setLogSubTab('watch')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${logSubTab === 'watch' ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}>
              <Eye className="w-4 h-4 inline mr-2" />Logi wyświetleń ({watchLogsMeta.total})
            </button>
            <button onClick={() => setLogSubTab('login')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${logSubTab === 'login' ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}>
              <LogIn className="w-4 h-4 inline mr-2" />Logi logowania ({loginLogsMeta.total})
            </button>
          </div>

          {/* Watch logs */}
          {logSubTab === 'watch' && (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Użytkownik</th>
                      <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Film</th>
                      <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchLogs.map(log => (
                      <tr key={log.id} className="border-b border-zinc-100 dark:border-zinc-800/50">
                        <td className="px-6 py-3 text-sm font-medium text-zinc-900 dark:text-white">{log.user_display || log.username}</td>
                        <td className="px-6 py-3 text-sm text-zinc-600 dark:text-zinc-400">{log.video_title || `#${log.video_id}`}</td>
                        <td className="px-6 py-3 text-sm text-zinc-500 font-mono">{formatDate(log.watched_at)}</td>
                      </tr>
                    ))}
                    {watchLogs.length === 0 && <tr><td colSpan={3} className="px-6 py-8 text-center text-zinc-400 text-sm">Brak logów</td></tr>}
                  </tbody>
                </table>
              </div>
              {watchLogsMeta.totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-200 dark:border-zinc-800">
                  <span className="text-xs text-zinc-500">Strona {watchLogsMeta.page} z {watchLogsMeta.totalPages} ({watchLogsMeta.total} rekordów)</span>
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(watchLogsMeta.totalPages, 10) }, (_, i) => i + 1).map(p => (
                      <button key={p} onClick={() => { api.getWatchLogs(p).then(r => { setWatchLogs(r.logs); setWatchLogsMeta({ total: r.total, page: r.page, totalPages: r.totalPages }); }); }}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${p === watchLogsMeta.page ? 'bg-rose-500 text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>{p}</button>
                    ))}
                    {watchLogsMeta.totalPages > 10 && <span className="text-xs text-zinc-400 px-2">...</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Login logs */}
          {logSubTab === 'login' && (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Użytkownik</th>
                      <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Metoda</th>
                      <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">IP</th>
                      <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Status</th>
                      <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loginLogs.map(log => (
                      <tr key={log.id} className="border-b border-zinc-100 dark:border-zinc-800/50">
                        <td className="px-6 py-3 text-sm font-medium text-zinc-900 dark:text-white">{log.username}</td>
                        <td className="px-6 py-3 text-sm text-zinc-500">{log.auth_method}</td>
                        <td className="px-6 py-3 text-sm text-zinc-500 font-mono">{log.ip_address}</td>
                        <td className="px-6 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${log.success ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300'}`}>
                            {log.success ? 'OK' : 'FAIL'}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-sm text-zinc-500 font-mono">{formatDate(log.logged_at)}</td>
                      </tr>
                    ))}
                    {loginLogs.length === 0 && <tr><td colSpan={5} className="px-6 py-8 text-center text-zinc-400 text-sm">Brak logów</td></tr>}
                  </tbody>
                </table>
              </div>
              {loginLogsMeta.totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-200 dark:border-zinc-800">
                  <span className="text-xs text-zinc-500">Strona {loginLogsMeta.page} z {loginLogsMeta.totalPages} ({loginLogsMeta.total} rekordów)</span>
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(loginLogsMeta.totalPages, 10) }, (_, i) => i + 1).map(p => (
                      <button key={p} onClick={() => { api.getLoginLogs(p).then(r => { setLoginLogs(r.logs); setLoginLogsMeta({ total: r.total, page: r.page, totalPages: r.totalPages }); }); }}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${p === loginLogsMeta.page ? 'bg-rose-500 text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>{p}</button>
                    ))}
                    {loginLogsMeta.totalPages > 10 && <span className="text-xs text-zinc-400 px-2">...</span>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* === TAGS TAB === */}
      {tab === 'tags' && (
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display mb-4">Zarządzanie tagami</h2>
          <div className="card p-6">
            {tags.length === 0 ? (
              <p className="text-zinc-400 text-sm text-center py-8">Brak tagów</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <div key={tag.id} className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
                    <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{tag.name}</span>
                    <button onClick={() => handleDeleteTag(tag.id)} className="p-0.5 hover:bg-red-100 dark:hover:bg-red-500/20 rounded transition-colors text-zinc-400 hover:text-red-600 dark:hover:text-red-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
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


