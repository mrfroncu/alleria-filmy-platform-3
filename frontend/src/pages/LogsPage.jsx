import React, { useState, useEffect } from 'react';
import { Eye, LogIn, Shield, FileText } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate } from '../utils/helpers';

export default function LogsPage() {
  const [tab, setTab] = useState('audit');

  const [watchLogs, setWatchLogs] = useState([]);
  const [watchMeta, setWatchMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loginLogs, setLoginLogs] = useState([]);
  const [loginMeta, setLoginMeta] = useState({ total: 0, page: 1, totalPages: 1 });

  // Audit
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPages, setAuditPages] = useState(1);
  const [auditType, setAuditType] = useState('');
  const [auditAction, setAuditAction] = useState('');

  const loadWatch = (p) => api.getWatchLogs(p).then(r => { setWatchLogs(r.logs || []); setWatchMeta({ total: r.total, page: r.page, totalPages: r.totalPages }); }).catch(() => {});
  const loadLogin = (p) => api.getLoginLogs(p).then(r => { setLoginLogs(r.logs || []); setLoginMeta({ total: r.total, page: r.page, totalPages: r.totalPages }); }).catch(() => {});

  useEffect(() => {
    if (tab === 'watch') loadWatch(1);
    else if (tab === 'login') loadLogin(1);
  }, [tab]);

  useEffect(() => {
    if (tab !== 'audit') return;
    const params = { page: auditPage };
    if (auditType) params.type = auditType;
    if (auditAction) params.action = auditAction;
    api.getAuditLogs(params).then(r => {
      setAuditLogs(r.logs || []); setAuditTotal(r.total || 0); setAuditPages(r.totalPages || 1);
    }).catch(() => {});
  }, [tab, auditPage, auditType, auditAction]);

  const entityColors = { video: 'bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300', comment: 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300', category: 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', tag: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' };
  const actionColors = { create: 'text-emerald-600', edit: 'text-amber-600', delete: 'text-red-600' };

  const Pagination = ({ meta, onPage }) => meta.totalPages > 1 && (
    <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-200 dark:border-zinc-800">
      <span className="text-xs text-zinc-500">Strona {meta.page} z {meta.totalPages} ({meta.total} rekordów)</span>
      <div className="flex gap-1">
        {Array.from({ length: Math.min(meta.totalPages, 10) }, (_, i) => i + 1).map(p => (
          <button key={p} onClick={() => onPage(p)} className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${p === meta.page ? 'bg-violet-500 text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>{p}</button>
        ))}
        {meta.totalPages > 10 && <span className="text-xs text-zinc-400 px-2">...</span>}
      </div>
    </div>
  );

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto page-enter">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display mb-3">Logi systemowe</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Przeglądanie logów wyświetleń, logowania i audytu zmian.</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        {[
          { key: 'audit', label: 'Audit Log', icon: Shield },
          { key: 'watch', label: 'Wyświetlenia', icon: Eye },
          { key: 'login', label: 'Logowania', icon: LogIn },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all ${tab === t.key ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* ─── AUDIT ─── */}
      {tab === 'audit' && (
        <div>
          <div className="flex flex-wrap gap-2 mb-4">
            {['', 'video', 'comment', 'category', 'tag'].map(t => (
              <button key={t} onClick={() => { setAuditType(t); setAuditPage(1); }} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${auditType === t ? 'bg-violet-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                {t || 'Wszystkie'}
              </button>
            ))}
            <span className="text-zinc-300 dark:text-zinc-700 self-center">|</span>
            {['', 'create', 'edit', 'delete'].map(a => (
              <button key={a} onClick={() => { setAuditAction(a); setAuditPage(1); }} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${auditAction === a ? 'bg-violet-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                {a || 'Wszystkie akcje'}
              </button>
            ))}
          </div>
          <div className="card overflow-hidden">
            {auditLogs.length === 0 ? <p className="text-zinc-400 text-sm text-center py-8">Brak logów</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-zinc-50 dark:bg-zinc-800/50 text-left">
                    <th className="px-4 py-3 font-bold text-zinc-500 text-[10px] uppercase">Data</th>
                    <th className="px-4 py-3 font-bold text-zinc-500 text-[10px] uppercase">Użytkownik</th>
                    <th className="px-4 py-3 font-bold text-zinc-500 text-[10px] uppercase">Akcja</th>
                    <th className="px-4 py-3 font-bold text-zinc-500 text-[10px] uppercase">Typ</th>
                    <th className="px-4 py-3 font-bold text-zinc-500 text-[10px] uppercase">ID</th>
                    <th className="px-4 py-3 font-bold text-zinc-500 text-[10px] uppercase">Szczegóły</th>
                  </tr></thead>
                  <tbody>
                    {auditLogs.map(l => (
                      <tr key={l.id} className="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs text-zinc-400 whitespace-nowrap">{formatDate(l.created_at)}</td>
                        <td className="px-4 py-2.5 text-zinc-900 dark:text-white font-medium text-xs">{l.display_name || l.username || '—'}</td>
                        <td className="px-4 py-2.5"><span className={`font-bold text-xs ${actionColors[l.action] || 'text-zinc-500'}`}>{l.action}</span></td>
                        <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${entityColors[l.entity_type] || 'bg-zinc-100 text-zinc-500'}`}>{l.entity_type}</span></td>
                        <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{l.entity_id || '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-zinc-500 max-w-[400px]">{l.details || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {auditPages > 1 && (
              <div className="flex justify-center gap-2 p-4 border-t border-zinc-200 dark:border-zinc-800">
                {Array.from({ length: auditPages }, (_, i) => i + 1).slice(Math.max(0, auditPage - 3), auditPage + 2).map(p => (
                  <button key={p} onClick={() => setAuditPage(p)} className={`w-8 h-8 rounded-xl text-xs font-bold transition-all ${p === auditPage ? 'bg-violet-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>{p}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── WATCH ─── */}
      {tab === 'watch' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Użytkownik</th>
                <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Film</th>
                <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Data</th>
              </tr></thead>
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
          <Pagination meta={watchMeta} onPage={loadWatch} />
        </div>
      )}

      {/* ─── LOGIN ─── */}
      {tab === 'login' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Użytkownik</th>
                <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Metoda</th>
                <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">IP</th>
                <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Status</th>
                <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Data</th>
              </tr></thead>
              <tbody>
                {loginLogs.map(log => (
                  <tr key={log.id} className="border-b border-zinc-100 dark:border-zinc-800/50">
                    <td className="px-6 py-3 text-sm font-medium text-zinc-900 dark:text-white">{log.username}</td>
                    <td className="px-6 py-3 text-sm text-zinc-500">{log.auth_method}</td>
                    <td className="px-6 py-3 text-sm text-zinc-500 font-mono">{log.ip_address}</td>
                    <td className="px-6 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${log.success ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300'}`}>{log.success ? 'OK' : 'FAIL'}</span></td>
                    <td className="px-6 py-3 text-sm text-zinc-500 font-mono">{formatDate(log.logged_at)}</td>
                  </tr>
                ))}
                {loginLogs.length === 0 && <tr><td colSpan={5} className="px-6 py-8 text-center text-zinc-400 text-sm">Brak logów</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination meta={loginMeta} onPage={loadLogin} />
        </div>
      )}
    </div>
  );
}
