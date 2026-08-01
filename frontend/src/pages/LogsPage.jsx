import React, { useState, useEffect, useCallback } from 'react';
import { ScrollText, Users2, Eye, LogIn, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../utils/apiClient';
import { useToast } from '../components/ui/Toast';
import TabBar from '../components/ui/TabBar';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

const TABS = [
  { id: 'audit', label: 'Audit Log', icon: ScrollText },
  { id: 'watchparty', label: 'Watch Party', icon: Users2 },
  { id: 'views', label: 'Wyświetlenia', icon: Eye },
  { id: 'logins', label: 'Logowania', icon: LogIn },
];

function Pager({ page, setPage, hasMore }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-4">
      <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
      <span className="text-xs text-slate-400 font-mono">{page}</span>
      <button onClick={() => setPage((p) => p + 1)} disabled={!hasMore} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
    </div>
  );
}

function AuditTab() {
  const notify = useToast();
  const [logs, setLogs] = useState(null);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');

  const load = useCallback(() => {
    api.getAuditLogs({ ...(entityType && { type: entityType }), ...(action && { action }) }).then(setLogs).catch(() => setLogs([]));
  }, [entityType, action]);
  useEffect(() => { load(); }, [load]);

  const clear = async () => { try { await api.clearAuditLogs(); load(); } catch (e) { notify(e.message, 'error'); } };

  const list = Array.isArray(logs) ? logs : logs?.items || logs?.logs || [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-xs">
          <option value="">Wszystkie typy</option>
          <option value="video">Film</option><option value="comment">Komentarz</option><option value="category">Kategoria</option><option value="tag">Tag</option>
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-xs">
          <option value="">Wszystkie akcje</option>
          <option value="create">Utworzenie</option><option value="edit">Edycja</option><option value="delete">Usunięcie</option>
        </select>
        <Button size="sm" variant="secondary" onClick={clear}><Trash2 className="w-3.5 h-3.5" /> Wyczyść</Button>
      </div>
      <Card className="divide-y divide-slate-100 dark:divide-white/5">
        {list.length === 0 ? <p className="p-6 text-center text-sm text-slate-400">Brak wpisów.</p> : list.map((l, i) => (
          <div key={l.id ?? i} className="flex items-center gap-3 p-3 text-sm">
            <span className={`w-2 h-2 rounded-full shrink-0 ${l.action === 'delete' ? 'bg-rose-500' : l.action === 'create' ? 'bg-teal-500' : 'bg-amber-500'}`} />
            <span className="font-medium text-slate-700 dark:text-slate-200">{l.actor_name || l.user_id}</span>
            <span className="text-xs text-slate-400">{l.action} · {l.entity_type}</span>
            <span className="text-xs text-slate-400 truncate flex-1">{l.details}</span>
            <span className="text-[10px] text-slate-400 font-mono shrink-0">{l.created_at ? new Date(l.created_at).toLocaleString('pl-PL') : ''}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function WatchPartyTab() {
  const notify = useToast();
  const [logs, setLogs] = useState(null);
  const [code, setCode] = useState('');
  const load = useCallback(() => api.getWatchPartyLogs(code ? { code } : {}).then(setLogs).catch(() => setLogs([])), [code]);
  useEffect(() => { load(); }, [load]);
  const clear = async () => { try { await api.clearWatchPartyLogs(code || undefined); load(); } catch (e) { notify(e.message, 'error'); } };
  const list = Array.isArray(logs) ? logs : logs?.items || logs?.logs || [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Filtruj po kodzie..." className="max-w-[180px] !py-2" />
        <Button size="sm" variant="secondary" onClick={clear}><Trash2 className="w-3.5 h-3.5" /> Wyczyść</Button>
      </div>
      <Card className="divide-y divide-slate-100 dark:divide-white/5">
        {list.length === 0 ? <p className="p-6 text-center text-sm text-slate-400">Brak wpisów.</p> : list.map((l, i) => (
          <div key={l.id ?? i} className="flex items-center gap-3 p-3 text-sm">
            <span className="font-mono text-xs text-brand-500">{l.code}</span>
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{l.action}</span>
            <span className="text-xs text-slate-400 truncate flex-1">{l.details}</span>
            <span className="text-[10px] text-slate-400 font-mono shrink-0">{l.created_at ? new Date(l.created_at).toLocaleString('pl-PL') : ''}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function PaginatedLogTab({ fetcher, clearFetcher, columns }) {
  const notify = useToast();
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const load = useCallback(() => fetcher(page).then(setData).catch(() => setData([])), [page]);
  useEffect(() => { load(); }, [load]);
  const clear = async () => { try { await clearFetcher(); load(); } catch (e) { notify(e.message, 'error'); } };
  const list = Array.isArray(data) ? data : data?.items || data?.logs || [];

  return (
    <div>
      <div className="flex justify-end mb-4"><Button size="sm" variant="secondary" onClick={clear}><Trash2 className="w-3.5 h-3.5" /> Wyczyść</Button></div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-white/10">{columns.map((c) => <th key={c.key} className="p-3">{c.label}</th>)}</tr></thead>
          <tbody>
            {list.length === 0 ? <tr><td colSpan={columns.length} className="p-6 text-center text-slate-400">Brak wpisów.</td></tr> : list.map((row, i) => (
              <tr key={row.id ?? i} className="border-b border-slate-100 dark:border-white/5">
                {columns.map((c) => <td key={c.key} className="p-3 text-slate-600 dark:text-slate-300">{c.render ? c.render(row) : row[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Pager page={page} setPage={setPage} hasMore={list.length > 0} />
    </div>
  );
}

export default function LogsPage() {
  const [tab, setTab] = useState('audit');
  return (
    <div className="p-6 sm:p-10">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-display mb-6">Logi systemowe</h1>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'audit' && <AuditTab />}
      {tab === 'watchparty' && <WatchPartyTab />}
      {tab === 'views' && (
        <PaginatedLogTab
          fetcher={api.getWatchLogs}
          clearFetcher={api.clearWatchLogs}
          columns={[
            { key: 'user', label: 'Użytkownik', render: (r) => r.display_name || r.username || r.user_id },
            { key: 'title', label: 'Film', render: (r) => r.title || r.video_id },
            { key: 'created_at', label: 'Data', render: (r) => r.created_at ? new Date(r.created_at).toLocaleString('pl-PL') : '' },
          ]}
        />
      )}
      {tab === 'logins' && (
        <PaginatedLogTab
          fetcher={api.getLoginLogs}
          clearFetcher={api.clearLoginLogs}
          columns={[
            { key: 'user', label: 'Użytkownik', render: (r) => r.display_name || r.username || r.user_id },
            { key: 'method', label: 'Metoda' },
            { key: 'ip', label: 'IP' },
            { key: 'success', label: 'Status', render: (r) => (r.success ? <span className="text-teal-500 font-semibold">OK</span> : <span className="text-rose-500 font-semibold">Błąd</span>) },
            { key: 'created_at', label: 'Data', render: (r) => r.created_at ? new Date(r.created_at).toLocaleString('pl-PL') : '' },
          ]}
        />
      )}
    </div>
  );
}
