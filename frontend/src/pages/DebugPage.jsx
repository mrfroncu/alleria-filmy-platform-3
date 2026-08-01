import React, { useState, useEffect, useCallback } from 'react';
import { HardDrive, Users, ShieldCheck, Settings as SettingsIcon, Bug, Trash2, Download, Upload, Play, Loader2, UserPlus, AlertTriangle, Search, Radio } from 'lucide-react';
import { api } from '../utils/apiClient';
import { useToast } from '../components/ui/Toast';
import TabBar from '../components/ui/TabBar';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input, { Label } from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import ToggleSwitch from '../components/ui/ToggleSwitch';

const TABS = [
  { id: 'streaming', label: 'Streaming', icon: HardDrive },
  { id: 'admin', label: 'Administracyjne', icon: Users },
  { id: 'categories', label: 'Kategorie', icon: ShieldCheck },
  { id: 'settings', label: 'Ustawienia', icon: SettingsIcon },
  { id: 'debug', label: 'Debug', icon: Bug },
];

function formatBytes(n) {
  if (n == null) return '—';
  if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1024).toFixed(0) + ' KB';
}
function fmtBitrate(bps) {
  if (!bps) return '';
  return bps >= 1000000 ? `${(bps / 1000000).toFixed(1)} Mb/s` : `${Math.round(bps / 1000)} kb/s`;
}

function StatCard({ label, value }) {
  return (
    <Card className="p-5">
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value ?? '—'}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </Card>
  );
}

// ============ STREAMING TAB ============
function StreamingTab() {
  const notify = useToast();
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [files, setFiles] = useState(null);
  const [selected, setSelected] = useState([]);
  const [cleanup, setCleanup] = useState(null);

  const load = useCallback(() => {
    api.getStreamStats().then(setStats).catch(() => {});
    api.getStreamFiles().then(setFiles).catch(() => setFiles([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const poll = () => api.getTranscodingJobs().then(setJobs).catch(() => {});
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, []);

  const toggleSelect = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const deleteSelected = async () => {
    try {
      await Promise.all(selected.map((id) => api.deleteStreamVideo(id)));
      notify('Usunięto wybrane pliki.', 'success');
      setSelected([]);
      load();
    } catch (e) { notify(e.message, 'error'); }
  };

  const scanOrphans = async () => {
    try { setCleanup(await api.getStreamCleanupCandidates()); } catch (e) { notify(e.message, 'error'); }
  };
  const purgeOrphans = async () => {
    const ids = (cleanup?.orphaned || cleanup || []).map((o) => o.video_id || o.id);
    try {
      await api.runStreamCleanup({ video_ids: ids, force: true, clean_db: true });
      notify('Wyczyszczono osierocone pliki.', 'success');
      setCleanup(null);
      load();
    } catch (e) { notify(e.message, 'error'); }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Filmy" value={stats?.videoCount ?? stats?.video_count} />
        <StatCard label="Użytkownicy" value={stats?.userCount ?? stats?.user_count} />
        <StatCard label="Miejsce na dysku" value={formatBytes(stats?.totalSize ?? stats?.total_size)} />
        <StatCard label="Pliki segmentów" value={stats?.segmentCount ?? stats?.segment_count} />
      </div>

      {jobs.length > 0 && (
        <Card className="p-6">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display mb-3">Trwające transkodowania</h3>
          <div className="space-y-3">
            {jobs.map((j) => (
              <div key={j.videoId || j.video_id}>
                <div className="flex justify-between text-xs mb-1"><span className="font-medium text-slate-600 dark:text-slate-300">{j.title || j.videoId || j.video_id}</span><span className="text-slate-400">{j.quality} · {j.progress ?? 0}%</span></div>
                <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden"><div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${j.progress ?? 0}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display">Pliki streamera</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={scanOrphans}><Search className="w-3.5 h-3.5" /> Skanuj osierocone</Button>
            {selected.length > 0 && <Button size="sm" variant="danger" onClick={deleteSelected}><Trash2 className="w-3.5 h-3.5" /> Usuń ({selected.length})</Button>}
          </div>
        </div>
        {cleanup && (
          <div className="mb-4 p-3 rounded-2xl bg-amber-500/10 text-xs text-amber-600 dark:text-amber-300 flex items-center justify-between gap-3">
            <span>{(cleanup.orphaned || cleanup || []).length} osieroconych plików znalezionych.</span>
            <Button size="sm" variant="danger" onClick={purgeOrphans}>Wyczyść</Button>
          </div>
        )}
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {files === null ? <p className="text-sm text-slate-400">Ładowanie...</p> : files.length === 0 ? <p className="text-sm text-slate-400">Brak plików.</p> : files.map((f) => (
            <div key={f.videoId || f.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 text-sm">
              <input type="checkbox" checked={selected.includes(f.videoId || f.id)} onChange={() => toggleSelect(f.videoId || f.id)} />
              <span className="font-medium text-slate-700 dark:text-slate-200 flex-1 truncate">{f.title || f.videoId || f.id}</span>
              {!f.inDb && !f.exists_in_db && <Badge tone="rose">osierocony</Badge>}
              <div className="flex flex-wrap gap-1 shrink-0">
                {(f.qualityDetails?.length ? f.qualityDetails : (f.qualities || []).map((q) => ({ name: q }))).map((q, i) => (
                  <span key={i} className="text-[10px] font-mono text-slate-400" title={`${q.width || ''}x${q.height || ''}`}>
                    {q.name}{q.fps >= 50 ? Math.round(q.fps) : ''}{q.bitrate ? ` · ${fmtBitrate(q.bitrate)}` : ''}
                  </span>
                ))}
              </div>
              <span className="text-xs text-slate-400 font-mono shrink-0">{formatBytes(f.size)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ============ ADMIN TAB ============
function AdminTab() {
  const notify = useToast();
  const [parties, setParties] = useState([]);
  const [form, setForm] = useState({ username: '', display_name: '', role: 'member', discord_id: '', avatar: '' });

  const load = useCallback(() => api.getActiveParties().then(setParties).catch(() => setParties([])), []);
  useEffect(() => { load(); const iv = setInterval(load, 8000); return () => clearInterval(iv); }, [load]);

  const forceEnd = async (code) => { try { await api.forceEndParty(code); load(); } catch (e) { notify(e.message, 'error'); } };
  const createUser = async (e) => {
    e.preventDefault();
    try {
      await api.createUser(form);
      notify('Użytkownik utworzony.', 'success');
      setForm({ username: '', display_name: '', role: 'member', discord_id: '', avatar: '' });
    } catch (e) { notify(e.message, 'error'); }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4"><Radio className="w-4.5 h-4.5 text-brand-500" /><h3 className="font-bold text-sm text-slate-900 dark:text-white font-display">Aktywne Watch Party</h3></div>
        {parties.length === 0 ? <p className="text-sm text-slate-400">Brak aktywnych sesji.</p> : (
          <div className="space-y-2">
            {parties.map((p) => (
              <div key={p.code} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 text-sm">
                <span className="font-mono text-xs text-brand-500">{p.code}</span>
                <span className="text-slate-500 text-xs flex-1">{p.memberCount ?? p.members?.length ?? 0} osób · {p.currentItem?.title || '—'}</span>
                <Button size="sm" variant="danger" onClick={() => forceEnd(p.code)}>Zakończ</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4"><UserPlus className="w-4.5 h-4.5 text-brand-500" /><h3 className="font-bold text-sm text-slate-900 dark:text-white font-display">Ręczne utworzenie konta</h3></div>
        <form onSubmit={createUser} className="grid grid-cols-2 gap-3">
          <Input placeholder="Username" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required />
          <Input placeholder="Wyświetlana nazwa" value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} />
          <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-2.5 text-sm">
            <option value="member">Member</option><option value="admin">Admin</option><option value="dev">Dev</option>
          </select>
          <Input placeholder="Discord ID (opcjonalnie)" value={form.discord_id} onChange={(e) => setForm((f) => ({ ...f, discord_id: e.target.value }))} />
          <Button type="submit" className="col-span-2">Utwórz</Button>
        </form>
      </Card>
    </div>
  );
}

// ============ CATEGORIES (ACCESS CHECKER) TAB ============
function CategoriesTab() {
  const [type, setType] = useState('category');
  const [id, setId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState([]);

  useEffect(() => { api.getCategoryRoleOverview().then(setOverview).catch(() => {}); }, []);

  const check = async () => {
    if (!id) return;
    setLoading(true);
    try { setResult(await api.getAccessDebug(type, id)); } catch (_) { setResult(null); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display mb-4">Sprawdź uprawnienia</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-2.5 text-sm">
            <option value="category">Kategoria</option><option value="video">Film</option>
          </select>
          <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="ID" className="max-w-[140px]" />
          <Button onClick={check} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sprawdź'}</Button>
        </div>
        {result && (
          <div className="mt-4 space-y-1.5 max-h-80 overflow-y-auto">
            {(result.users || result || []).map((u, i) => (
              <div key={u.id ?? i} className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 dark:bg-white/5 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-200 flex-1">{u.display_name || u.username}</span>
                <span className="text-slate-400">{u.reason}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display mb-4">Kategorie z niestandardowymi rolami</h3>
        {overview.length === 0 ? <p className="text-sm text-slate-400">Brak.</p> : (
          <div className="space-y-2">
            {overview.map((c) => (
              <div key={c.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{c.name}</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(c.roles || []).map((r, i) => <Badge key={i} tone="neutral">{r.role_name || r.role_id}</Badge>)}
                  {(c.users || []).map((u, i) => <Badge key={`u${i}`} tone="brand">{u.display_name}</Badge>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============ SETTINGS TAB ============
function SettingsTab() {
  const notify = useToast();
  const [settings, setSettings] = useState(null);
  const [envCheck, setEnvCheck] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.getSettings().then((s) => { setSettings(s); setForm(s); }).catch(() => {});
    api.getEnvCheck().then(setEnvCheck).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (partial) => {
    setSaving(true);
    try {
      const r = await api.setSettings(partial);
      setSettings((s) => ({ ...s, ...r }));
      notify('Ustawienia zapisane.', 'success');
    } catch (e) { notify(e.message, 'error'); }
    setSaving(false);
  };

  if (!settings) return <p className="text-sm text-slate-400">Ładowanie...</p>;

  const hasEnvIssues = (envCheck?.deprecated?.length || 0) + (envCheck?.suspicious?.length || 0) > 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      {hasEnvIssues && (
        <div className="xl:col-span-2 flex items-start gap-2 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-300 text-xs p-4">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            {envCheck.deprecated?.length > 0 && <p>Przestarzałe zmienne .env: {envCheck.deprecated.join(', ')}</p>}
            {envCheck.suspicious?.length > 0 && <p>Możliwe literówki: {envCheck.suspicious.join(', ')}</p>}
          </div>
        </div>
      )}

      <Card className="p-6">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display mb-3">Wyświetlanie filmów</h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div><Label>Na stronę</Label><Input type="number" value={form.videos_per_page ?? ''} onChange={(e) => setForm((f) => ({ ...f, videos_per_page: e.target.value }))} className="!py-2" /></div>
          <div><Label>Maks. kolumn</Label><Input type="number" value={form.grid_columns ?? ''} onChange={(e) => setForm((f) => ({ ...f, grid_columns: e.target.value }))} className="!py-2" /></div>
          <div><Label>Min. szer. karty</Label><Input type="number" value={form.grid_card_min_width ?? ''} onChange={(e) => setForm((f) => ({ ...f, grid_card_min_width: e.target.value }))} className="!py-2" /></div>
        </div>
        <Button size="sm" disabled={saving} onClick={() => save({ videos_per_page: Number(form.videos_per_page), grid_columns: Number(form.grid_columns), grid_card_min_width: Number(form.grid_card_min_width) })}>Zapisz</Button>
      </Card>

      <Card className="p-6">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display mb-3">Logi</h3>
        <div className="mb-3 max-w-[140px]"><Label>Wpisów na stronę</Label><Input type="number" value={form.logs_per_page ?? ''} onChange={(e) => setForm((f) => ({ ...f, logs_per_page: e.target.value }))} className="!py-2" /></div>
        <Button size="sm" disabled={saving} onClick={() => save({ logs_per_page: Number(form.logs_per_page) })}>Zapisz</Button>
      </Card>

      <Card className="p-6">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display mb-3">Limity treści</h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div><Label>Nazwa</Label><Input type="number" value={form.limit_display_name ?? ''} onChange={(e) => setForm((f) => ({ ...f, limit_display_name: e.target.value }))} className="!py-2" /></div>
          <div><Label>Bio</Label><Input type="number" value={form.limit_bio ?? ''} onChange={(e) => setForm((f) => ({ ...f, limit_bio: e.target.value }))} className="!py-2" /></div>
          <div><Label>Komentarz</Label><Input type="number" value={form.limit_comment ?? ''} onChange={(e) => setForm((f) => ({ ...f, limit_comment: e.target.value }))} className="!py-2" /></div>
        </div>
        <Button size="sm" disabled={saving} onClick={() => save({ limit_display_name: Number(form.limit_display_name), limit_bio: Number(form.limit_bio), limit_comment: Number(form.limit_comment) })}>Zapisz</Button>
      </Card>

      <Card className="p-6 space-y-3">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display mb-1">Przełączniki</h3>
        <ToggleSwitch checked={!!settings.webhook_domain_restriction} onChange={(v) => save({ webhook_domain_restriction: v })} label="Ograniczenie domen webhooków" />
        <ToggleSwitch checked={!!settings.iframe_embed_enabled} onChange={(v) => save({ iframe_embed_enabled: v })} label="Osadzanie w iframe" />
        <ToggleSwitch checked={!!settings.show_top_bar} onChange={(v) => save({ show_top_bar: v })} label="Górny pasek" />
        <ToggleSwitch checked={!!settings.youtube_custom_player} onChange={(v) => save({ youtube_custom_player: v })} label="Własna nakładka YouTube" />
      </Card>

      <Card className="p-6">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display mb-3">Wysyłka kodu TS3</h3>
        <select value={form.ts3_code_delivery ?? 'pm'} onChange={(e) => { setForm((f) => ({ ...f, ts3_code_delivery: e.target.value })); save({ ts3_code_delivery: e.target.value }); }} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-2.5 text-sm">
          <option value="pm">Wiadomość prywatna</option><option value="poke">Poke</option><option value="both">Oba</option>
        </select>
      </Card>
    </div>
  );
}

// ============ DEBUG TAB ============
function DebugTab() {
  const notify = useToast();
  const [dbStats, setDbStats] = useState(null);
  const [sql, setSql] = useState('SELECT * FROM videos LIMIT 10;');
  const [sqlResult, setSqlResult] = useState(null);
  const [sqlRunning, setSqlRunning] = useState(false);
  const [clearConfirm, setClearConfirm] = useState('');
  const importRef = React.useRef(null);

  useEffect(() => { api.getDbStats().then(setDbStats).catch(() => {}); }, []);

  const runSql = async () => {
    setSqlRunning(true);
    try { setSqlResult(await api.runSql(sql)); } catch (e) { setSqlResult({ error: e.message }); }
    setSqlRunning(false);
  };

  const runClear = async () => {
    if (clearConfirm !== 'WYCZYŚĆ WSZYSTKO') return;
    try { await api.clearDb(); notify('Baza wyczyszczona.', 'success'); setClearConfirm(''); } catch (e) { notify(e.message, 'error'); }
  };

  const importFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try { await api.importDb(fd); notify('Import zakończony.', 'success'); } catch (e) { notify(e.message, 'error'); }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Rozmiar bazy" value={formatBytes(dbStats?.sizeBytes ?? dbStats?.size)} />
        <StatCard label="Tabele" value={dbStats?.tableCount ?? dbStats?.tables} />
        <StatCard label="Wiersze (filmy)" value={dbStats?.videoCount ?? dbStats?.rows?.videos} />
        <StatCard label="Wiersze (użytkownicy)" value={dbStats?.userCount ?? dbStats?.rows?.users} />
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <a href={api.exportDb()} download><Button size="sm" variant="secondary"><Download className="w-3.5 h-3.5" /> Eksportuj DB</Button></a>
          <Button size="sm" variant="secondary" onClick={() => importRef.current?.click()}><Upload className="w-3.5 h-3.5" /> Importuj DB</Button>
          <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={importFile} />
          <Button size="sm" variant="secondary" onClick={async () => { try { await api.clearWatchLogs(); notify('OK', 'success'); } catch (e) { notify(e.message, 'error'); } }}>Wyczyść logi wyświetleń</Button>
          <Button size="sm" variant="secondary" onClick={async () => { try { await api.clearLoginLogs(); notify('OK', 'success'); } catch (e) { notify(e.message, 'error'); } }}>Wyczyść logi logowań</Button>
          <Button size="sm" variant="secondary" onClick={async () => { try { await api.clearAuditLogs(); notify('OK', 'success'); } catch (e) { notify(e.message, 'error'); } }}>Wyczyść audit log</Button>
        </div>
      </Card>

      <Card className="p-6 border-rose-300 dark:border-rose-500/30">
        <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4.5 h-4.5 text-rose-500" /><h3 className="font-bold text-sm text-rose-600 dark:text-rose-400 font-display">Wyczyść bazę danych</h3></div>
        <p className="text-xs text-slate-500 mb-3">Nieodwracalne. Wpisz <code className="font-mono bg-slate-100 dark:bg-white/10 px-1 rounded">WYCZYŚĆ WSZYSTKO</code> aby potwierdzić.</p>
        <div className="flex gap-2">
          <Input value={clearConfirm} onChange={(e) => setClearConfirm(e.target.value)} className="max-w-xs" />
          <Button variant="danger" disabled={clearConfirm !== 'WYCZYŚĆ WSZYSTKO'} onClick={runClear}>Wyczyść</Button>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display mb-3">Konsola SQL</h3>
        <textarea
          value={sql} onChange={(e) => setSql(e.target.value)} rows={4}
          onKeyDown={(e) => { if (e.ctrlKey && e.key === 'Enter') runSql(); }}
          className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-950 text-teal-300 px-4 py-3 text-xs font-mono"
        />
        <Button size="sm" className="mt-2" onClick={runSql} disabled={sqlRunning}>
          {sqlRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Wykonaj <span className="opacity-60">(Ctrl+Enter)</span>
        </Button>
        {sqlResult && (
          <div className="mt-3 overflow-x-auto max-h-80 overflow-y-auto rounded-2xl border border-slate-200 dark:border-white/10">
            {sqlResult.error ? (
              <p className="p-3 text-xs text-rose-500 font-mono">{sqlResult.error}</p>
            ) : Array.isArray(sqlResult) && sqlResult.length > 0 ? (
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 dark:bg-white/5">{Object.keys(sqlResult[0]).map((k) => <th key={k} className="p-2 text-left font-mono">{k}</th>)}</tr></thead>
                <tbody>{sqlResult.map((row, i) => <tr key={i} className="border-t border-slate-100 dark:border-white/5">{Object.values(row).map((v, j) => <td key={j} className="p-2 font-mono">{String(v)}</td>)}</tr>)}</tbody>
              </table>
            ) : (
              <p className="p-3 text-xs font-mono text-slate-500">{JSON.stringify(sqlResult)}</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function DebugPage() {
  const [tab, setTab] = useState('streaming');
  return (
    <div className="p-6 sm:p-10">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-display mb-6">Dev Tools</h1>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'streaming' && <StreamingTab />}
      {tab === 'admin' && <AdminTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'debug' && <DebugTab />}
    </div>
  );
}
