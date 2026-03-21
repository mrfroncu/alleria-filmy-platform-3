import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Users, Eye, LogIn, Tag, Film, Search, X } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate } from '../utils/helpers';
import VideoModal from '../components/VideoModal';

export default function AdminPage() {
  const [videos, setVideos] = useState([]);
  const [users, setUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [watchLogs, setWatchLogs] = useState([]);
  const [loginLogs, setLoginLogs] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState('videos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [searchVideos, setSearchVideos] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [v, u, au, t] = await Promise.all([
        api.getVideos(), api.getUsers(), api.getAllUsers(), api.getTags()
      ]);
      setVideos(v); setUsers(u); setAllUsers(au); setTags(t);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const loadLogs = async () => {
    try {
      const [wl, ll] = await Promise.all([api.getWatchLogs(), api.getLoginLogs()]);
      setWatchLogs(wl); setLoginLogs(ll);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab]);

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
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input type="text" value={searchVideos} onChange={e => setSearchVideos(e.target.value)} placeholder="Szukaj filmów..." className="input-field pl-11 !py-3 text-sm" />
            </div>
            <button onClick={() => { setEditingVideo(null); setIsModalOpen(true); }} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Dodaj film
            </button>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th className="text-left px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">ID</th>
                    <th className="text-left px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Tytuł</th>
                    <th className="text-left px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Autor</th>
                    <th className="text-left px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Data publikacji</th>
                    <th className="text-right px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/50">
                        <td colSpan={5} className="px-6 py-4"><div className="h-5 bg-zinc-100 dark:bg-zinc-800 rounded skeleton" /></td>
                      </tr>
                    ))
                  ) : filteredVideos.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-zinc-400 text-sm">Brak filmów</td>
                    </tr>
                  ) : (
                    filteredVideos.map(video => (
                      <tr key={video.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4 text-sm font-mono text-zinc-400">{video.id}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {video.thumbnail && (
                              <img src={video.thumbnail} alt="" className="w-12 h-8 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700" />
                            )}
                            <span className="text-sm font-bold text-zinc-900 dark:text-white">{video.title}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-600 dark:text-zinc-400">{video.author_display_name || video.author_name}</td>
                        <td className="px-6 py-4 text-sm text-zinc-500 font-mono">{formatDate(video.publish_date)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => { setEditingVideo(video); setIsModalOpen(true); }} className="p-2 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-xl transition-colors text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => setDeleteConfirm(video)} className="p-2 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors text-zinc-400 hover:text-red-600 dark:hover:text-red-400">
                              <Trash2 className="w-4 h-4" />
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
                  <th className="text-left px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Użytkownik</th>
                  <th className="text-left px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Rola</th>
                  <th className="text-left px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Metoda</th>
                  <th className="text-left px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Rejestracja</th>
                  <th className="text-left px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Ostatnie logowanie</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img src={u.avatar || `https://ui-avatars.com/api/?name=${u.display_name || u.username}&background=6366f1&color=fff`} alt="" className="w-8 h-8 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700" />
                        <div>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white">{u.display_name || u.username}</p>
                          <p className="text-[10px] text-zinc-500 font-mono">@{u.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-3 py-1 rounded-lg text-xs font-bold ${
                        u.role === 'dev' ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300' :
                        u.role === 'admin' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' :
                        'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}>
                        {u.role?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-500">{u.auth_method}</td>
                    <td className="px-6 py-4 text-sm text-zinc-500 font-mono">{formatDate(u.created_at)}</td>
                    <td className="px-6 py-4 text-sm text-zinc-500 font-mono">{formatDate(u.last_login)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === LOGS TAB === */}
      {tab === 'logs' && (
        <div className="space-y-8">
          {/* Watch logs */}
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2">
              <Eye className="w-5 h-5 text-indigo-500" /> Ostatnio obejrzane
            </h2>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Użytkownik</th>
                      <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Film</th>
                      <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Data</th>
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
                    {watchLogs.length === 0 && (
                      <tr><td colSpan={3} className="px-6 py-8 text-center text-zinc-400 text-sm">Brak logów</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Login logs */}
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2">
              <LogIn className="w-5 h-5 text-indigo-500" /> Logi logowania
            </h2>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Użytkownik</th>
                      <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Metoda</th>
                      <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">IP</th>
                      <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Status</th>
                      <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Data</th>
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
                          {log.reason && <span className="ml-2 text-xs text-zinc-400">{log.reason}</span>}
                        </td>
                        <td className="px-6 py-3 text-sm text-zinc-500 font-mono">{formatDate(log.logged_at)}</td>
                      </tr>
                    ))}
                    {loginLogs.length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-zinc-400 text-sm">Brak logów</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
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


