import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, LogIn, Shield, Users, Search, Trash2 } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate } from '../utils/helpers';

const LOGS_TAB_IDS = ['audit', 'watchparty', 'watch', 'login'];

const WP_ACTIONS = [
  { key: '', label: 'Wszystkie' },
  { key: 'party_created', label: 'Utworzono', color: 'bg-emerald-500/10 text-emerald-400' },
  { key: 'party_ended', label: 'Zakończono', color: 'bg-red-500/10 text-red-400' },
  { key: 'user_joined', label: 'Dołączył', color: 'bg-violet-500/10 text-violet-400' },
  { key: 'user_left', label: 'Opuścił', color: 'bg-zinc-500/10 text-zinc-400' },
  { key: 'user_kicked', label: 'Wyrzucono', color: 'bg-orange-500/10 text-orange-400' },
  { key: 'play', label: 'Play', color: 'bg-emerald-500/10 text-emerald-400' },
  { key: 'pause', label: 'Pause', color: 'bg-amber-500/10 text-amber-400' },
  { key: 'seek', label: 'Seek', color: 'bg-blue-500/10 text-blue-400' },
  { key: 'source_change', label: 'Zmiana źródła', color: 'bg-cyan-500/10 text-cyan-400' },
  { key: 'queue_add', label: 'Dodano do kolejki', color: 'bg-violet-500/10 text-violet-400' },
  { key: 'queue_play', label: 'Odtworzono z kolejki', color: 'bg-emerald-500/10 text-emerald-400' },
  { key: 'queue_remove', label: 'Usunięto z kolejki', color: 'bg-red-500/10 text-red-400' },
  { key: 'set_control', label: 'Uprawnienia', color: 'bg-indigo-500/10 text-indigo-400' },
  { key: 'host_changed', label: 'Nowy host', color: 'bg-amber-500/10 text-amber-400' },
];

function actionMeta(action) {
  return WP_ACTIONS.find(a => a.key === action) || { label: action, color: 'bg-zinc-500/10 text-zinc-400' };
}

export default function LogsPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(LOGS_TAB_IDS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'audit');

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

  // Watch Party logs
  const [wpLogs, setWpLogs] = useState([]);
  const [wpMeta, setWpMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [wpAction, setWpAction] = useState('');
  const [wpCodeFilter, setWpCodeFilter] = useState('');
  const [wpCodeInput, setWpCodeInput] = useState('');

  const loadWatch = (p) => api.getWatchLogs(p).then(r => { setWatchLogs(r.logs || []); setWatchMeta({ total: r.total, page: r.page, totalPages: r.totalPages }); }).catch(() => {});
  const loadLogin = (p) => api.getLoginLogs(p).then(r => { setLoginLogs(r.logs || []); setLoginMeta({ total: r.total, page: r.page, totalPages: r.totalPages }); }).catch(() => {});

  const loadWpLogs = (p = 1, code = wpCodeFilter, action = wpAction) => {
    const params = { page: p };
    if (code) params.code = code;
    if (action) params.action = action;
    api.getWatchPartyLogs(params).then(r => {
      setWpLogs(r.logs || []);
      setWpMeta({ total: r.total || 0, page: r.page || 1, totalPages: r.totalPages || 1 });
    }).catch(() => {});
  };

  useEffect(() => {
    if (tab === 'watch') loadWatch(1);
    else if (tab === 'login') loadLogin(1);
    else if (tab === 'watchparty') loadWpLogs(1, '', '');
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
          <button key={p} onClick={() => onPage(p)} className={`page-btn w-8 h-8 rounded-lg text-xs font-bold ${p === meta.page ? 'bg-violet-500 text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>{p}</button>
        ))}
        {meta.totalPages > 10 && <span className="text-xs text-zinc-400 px-2">...</span>}
      </div>
    </div>
  );

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto page-enter">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display mb-3">Logi systemowe</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Przeglądanie logów wyświetleń, logowania, audytu i Watch Party.</p>
      </div>

      <div className="flex flex-wrap gap-1 mb-6 border-b border-zinc-200 dark:border-zinc-800">
        {[
          { key: 'audit', label: 'Audit Log', icon: Shield },
          { key: 'watchparty', label: 'Watch Party', icon: Users },
          { key: 'watch', label: 'Wyświetlenia', icon: Eye },
          { key: 'login', label: 'Logowania', icon: LogIn },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
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
          <p className="text-xs text-zinc-500 mb-3">{auditTotal} wpisów{auditType ? ` · typ: ${auditType}` : ''}{auditAction ? ` · akcja: ${auditAction}` : ''}</p>
          <div className="space-y-2">
            {auditLogs.length === 0 ? <div className="card p-8 text-center"><p className="text-zinc-400 text-sm">Brak logów</p></div> : auditLogs.map(l => (
              <div key={l.id} className="card p-4 hover:shadow-md transition-all">
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${l.action === 'create' ? 'bg-emerald-500' : l.action === 'edit' ? 'bg-amber-500' : 'bg-red-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-bold text-zinc-900 dark:text-white">{l.display_name || l.username || '—'}</span>
                      <span className={`font-bold text-xs ${actionColors[l.action] || 'text-zinc-500'}`}>{l.action}</span>
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${entityColors[l.entity_type] || 'bg-zinc-100 text-zinc-500'}`}>{l.entity_type}</span>
                      {l.entity_id && <span className="font-mono text-[10px] text-zinc-400">#{l.entity_id}</span>}
                      <span className="font-mono text-[10px] text-zinc-400 ml-auto whitespace-nowrap">{formatDate(l.created_at)}</span>
                    </div>
                    {l.details && <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed break-words whitespace-pre-wrap">{l.details}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {auditPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              {Array.from({ length: auditPages }, (_, i) => i + 1).slice(Math.max(0, auditPage - 3), auditPage + 2).map(p => (
                <button key={p} onClick={() => setAuditPage(p)} className={`page-btn w-8 h-8 rounded-xl text-xs font-bold ${p === auditPage ? 'bg-violet-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>{p}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── WATCH PARTY ─── */}
      {tab === 'watchparty' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Code filter */}
            <div className="flex gap-1.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  value={wpCodeInput}
                  onChange={e => setWpCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  onKeyDown={e => { if (e.key === 'Enter') { setWpCodeFilter(wpCodeInput); loadWpLogs(1, wpCodeInput, wpAction); } }}
                  placeholder="Kod party"
                  className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white text-xs pl-8 pr-3 py-2 rounded-xl font-mono tracking-widest w-36 focus:outline-none focus:border-violet-500 transition-colors"
                  maxLength={6}
                />
              </div>
              <button
                onClick={() => { setWpCodeFilter(wpCodeInput); loadWpLogs(1, wpCodeInput, wpAction); }}
                className="px-3 py-2 bg-violet-500 hover:bg-violet-400 text-white text-xs font-bold rounded-xl transition-all"
              >
                Filtruj
              </button>
              {wpCodeFilter && (
                <button
                  onClick={() => { setWpCodeFilter(''); setWpCodeInput(''); loadWpLogs(1, '', wpAction); }}
                  className="px-3 py-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-bold rounded-xl transition-all"
                >
                  ✕ {wpCodeFilter}
                </button>
              )}
            </div>

            <span className="text-zinc-300 dark:text-zinc-700 self-center">|</span>

            {/* Action filter */}
            <div className="flex flex-wrap gap-1.5">
              {WP_ACTIONS.slice(0, 8).map(a => (
                <button key={a.key} onClick={() => { setWpAction(a.key); loadWpLogs(1, wpCodeFilter, a.key); }}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all ${wpAction === a.key ? 'bg-violet-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}>
                  {a.label}
                </button>
              ))}
              <select
                value={wpAction}
                onChange={e => { setWpAction(e.target.value); loadWpLogs(1, wpCodeFilter, e.target.value); }}
                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 text-[11px] px-2 py-1.5 rounded-xl focus:outline-none"
              >
                {WP_ACTIONS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </div>

            <div className="ml-auto">
              <button
                onClick={() => { if (!confirm('Wyczyścić logi Watch Party?')) return; api.clearWatchPartyLogs(wpCodeFilter).then(() => loadWpLogs(1)); }}
                className="btn-link-red flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-red-500/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {wpCodeFilter ? `Wyczyść ${wpCodeFilter}` : 'Wyczyść wszystkie'}
              </button>
            </div>
          </div>

          {/* Summary */}
          <p className="text-xs text-zinc-500">{wpMeta.total} rekordów{wpCodeFilter ? ` dla party ${wpCodeFilter}` : ''}{wpAction ? ` · akcja: ${actionMeta(wpAction).label}` : ''}</p>

          {/* Log entries */}
          <div className="card overflow-hidden">
            {wpLogs.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 text-sm">Brak logów</div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {wpLogs.map(l => {
                  const meta = actionMeta(l.action);
                  return (
                    <div key={l.id} className="flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      {/* Action badge */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap shrink-0 mt-0.5 ${meta.color}`}>
                        {meta.label}
                      </span>

                      {/* Party code */}
                      <span className="font-mono text-[11px] text-violet-400 font-bold shrink-0 mt-0.5">{l.party_code}</span>

                      {/* User */}
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {l.user_name && (
                            <span className="text-sm font-semibold text-zinc-900 dark:text-white">{l.user_name}</span>
                          )}
                          {l.target_user_name && (
                            <>
                              <span className="text-zinc-400 text-xs">→</span>
                              <span className="text-sm text-zinc-600 dark:text-zinc-300">{l.target_user_name}</span>
                            </>
                          )}
                          {!l.user_name && !l.target_user_name && (
                            <span className="text-xs text-zinc-400">system</span>
                          )}
                        </div>
                        {l.details && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 break-words">{l.details}</p>
                        )}
                      </div>

                      {/* Timestamp */}
                      <span className="font-mono text-[10px] text-zinc-400 shrink-0 whitespace-nowrap mt-0.5">{formatDate(l.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <Pagination meta={wpMeta} onPage={p => loadWpLogs(p)} />
          </div>
        </div>
      )}

      {/* ─── WATCH ─── */}
      {tab === 'watch' && (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <div className="w-9 h-9 bg-violet-50 dark:bg-violet-500/10 rounded-xl flex items-center justify-center shrink-0">
              <Eye className="w-4 h-4 text-violet-500" />
            </div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display">Log wyświetleń</h3>
            <span className="text-xs text-zinc-500 ml-auto">{watchMeta.total} wpisów</span>
          </div>
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
          <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <div className="w-9 h-9 bg-violet-50 dark:bg-violet-500/10 rounded-xl flex items-center justify-center shrink-0">
              <LogIn className="w-4 h-4 text-violet-500" />
            </div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display">Log logowań</h3>
            <span className="text-xs text-zinc-500 ml-auto">{loginMeta.total} wpisów</span>
          </div>
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
