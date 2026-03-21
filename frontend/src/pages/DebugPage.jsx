import React, { useState, useRef } from 'react';
import { Download, Upload, Trash2, AlertTriangle, Database, UserPlus, ChevronDown } from 'lucide-react';
import { api } from '../utils/api';

export default function DebugPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Create user form
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState('member');
  const [newDiscordId, setNewDiscordId] = useState('');
  const [newAvatar, setNewAvatar] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const data = await api.exportDB();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `alleria-filmy-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ type: 'success', msg: 'Eksport zakończony pomyślnie.' });
    } catch (err) {
      setStatus({ type: 'error', msg: 'Błąd eksportu: ' + err.message });
    }
    setLoading(false);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await api.importDB(data);
      setStatus({ type: 'success', msg: 'Import zakończony pomyślnie.' });
    } catch (err) {
      setStatus({ type: 'error', msg: 'Błąd importu: ' + err.message });
    }
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClear = async () => {
    if (!confirm('UWAGA: To usunie WSZYSTKIE dane (filmy, tagi, logi). Kontynuować?')) return;
    if (!confirm('Naprawdę usunąć wszystko? Ta operacja jest nieodwracalna!')) return;
    setLoading(true);
    try {
      await api.clearDB();
      setStatus({ type: 'success', msg: 'Baza danych wyczyszczona.' });
    } catch (err) {
      setStatus({ type: 'error', msg: 'Błąd: ' + err.message });
    }
    setLoading(false);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername.trim() || !newDisplayName.trim()) return;
    setCreatingUser(true);
    try {
      const result = await api.createUser({
        username: newUsername.trim(),
        display_name: newDisplayName.trim(),
        role: newRole,
        discord_id: newDiscordId.trim() || undefined,
        avatar: newAvatar.trim() || undefined,
      });
      setStatus({ type: 'success', msg: `Użytkownik "${result.user.display_name}" utworzony (ID: ${result.user.id})` });
      setNewUsername('');
      setNewDisplayName('');
      setNewRole('member');
      setNewDiscordId('');
      setNewAvatar('');
    } catch (err) {
      setStatus({ type: 'error', msg: 'Błąd tworzenia użytkownika: ' + err.message });
    }
    setCreatingUser(false);
  };

  return (
    <div className="p-6 sm:p-10 max-w-3xl mx-auto animate-fade-in">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-red-50 dark:bg-red-500/10 rounded-xl flex items-center justify-center">
            <Database className="w-5 h-5 text-red-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Debug Tools</h1>
        </div>
        <p className="text-zinc-500 dark:text-zinc-400">Narzędzia deweloperskie do zarządzania bazą danych.</p>
      </div>

      {status && (
        <div className={`mb-6 p-4 rounded-2xl border text-sm font-medium animate-slide-up ${
          status.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-300'
        }`}>
          {status.msg}
        </div>
      )}

      <div className="space-y-4">
        {/* Create User */}
        <div className="card p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <UserPlus className="w-6 h-6 text-emerald-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Dodaj użytkownika</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                Utwórz konto ręcznie dla osoby, która jeszcze się nie zalogowała. Będzie widoczna jako autor filmów.
              </p>
              <form onSubmit={handleCreateUser} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label-field">Username</label>
                    <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} className="input-field !py-3 text-sm" placeholder="np. jan_kowalski" required />
                  </div>
                  <div>
                    <label className="label-field">Wyświetlana nazwa</label>
                    <input type="text" value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} className="input-field !py-3 text-sm" placeholder="np. Jan Kowalski" required />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label-field">Rola</label>
                    <div className="relative">
                      <select value={newRole} onChange={e => setNewRole(e.target.value)} className="input-field !py-3 text-sm appearance-none cursor-pointer">
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                        <option value="dev">Dev</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="label-field">Discord ID (opcjonalnie)</label>
                    <input type="text" value={newDiscordId} onChange={e => setNewDiscordId(e.target.value)} className="input-field !py-3 text-sm font-mono" placeholder="np. 248804732787884033" />
                  </div>
                </div>
                <div>
                  <label className="label-field">Avatar URL (opcjonalnie)</label>
                  <input type="text" value={newAvatar} onChange={e => setNewAvatar(e.target.value)} className="input-field !py-3 text-sm" placeholder="https://cdn.discordapp.com/avatars/..." />
                </div>
                <button type="submit" disabled={creatingUser} className="btn-primary text-sm">
                  {creatingUser ? 'Tworzenie...' : 'Utwórz użytkownika'}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Export */}
        <div className="card p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <Download className="w-6 h-6 text-indigo-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Eksportuj bazę danych</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Pobierz plik JSON ze wszystkimi danymi platformy.</p>
              <button onClick={handleExport} disabled={loading} className="btn-primary text-sm">
                {loading ? 'Eksportowanie...' : 'Eksportuj JSON'}
              </button>
            </div>
          </div>
        </div>

        {/* Import */}
        <div className="card p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-50 dark:bg-amber-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <Upload className="w-6 h-6 text-amber-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Importuj bazę danych</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">Zastąp wszystkie dane w bazie danymi z pliku JSON.</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mb-4 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Obecne dane zostaną nadpisane!
              </p>
              <label className="btn-secondary text-sm inline-flex items-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4" /> Wybierz plik JSON
                <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        {/* Clear */}
        <div className="card p-8 border-red-200 dark:border-red-500/20">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-red-50 dark:bg-red-500/10 rounded-2xl flex items-center justify-center shrink-0">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-2">Wyczyść bazę danych</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">Usuń wszystkie filmy, tagi i logi. Użytkownicy zostaną zachowani.</p>
              <p className="text-xs text-red-600 dark:text-red-400 font-bold mb-4 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Ta operacja jest nieodwracalna!
              </p>
              <button onClick={handleClear} disabled={loading} className="btn-danger text-sm">
                {loading ? 'Czyszczenie...' : 'Wyczyść wszystko'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
