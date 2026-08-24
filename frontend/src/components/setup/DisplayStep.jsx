import React, { useState, useEffect } from 'react';
import { LayoutGrid } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../contexts/ToastContext';
import { ToggleSwitch } from './SetupUI';

// Same fields, same payload keys as ManagePage.jsx's "Wygląd i treść" section.
export default function DisplayStep({ settings, reloadSettings }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [limitForm, setLimitForm] = useState({ limit_display_name: '', limit_bio: '', limit_comment: '' });
  const [displayForm, setDisplayForm] = useState({ videos_per_page: '', grid_columns: '', grid_card_min_width: '' });
  const [logsForm, setLogsForm] = useState({ logs_per_page: '' });

  useEffect(() => {
    if (!settings) return;
    setLimitForm({ limit_display_name: settings.limit_display_name, limit_bio: settings.limit_bio, limit_comment: settings.limit_comment });
    setDisplayForm({ videos_per_page: settings.videos_per_page, grid_columns: settings.grid_columns, grid_card_min_width: settings.grid_card_min_width });
    setLogsForm({ logs_per_page: settings.logs_per_page });
  }, [settings]);

  if (!settings) return <div className="h-64 skeleton rounded-2xl" />;

  const save = async (payload, okMsg) => {
    setSaving(true);
    try {
      await api.setSettings(payload);
      await reloadSettings();
      toast.success(okMsg);
    } catch (e) {
      toast.error('Błąd: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key, okMsg) => save({ [key]: !settings[key] }, okMsg);

  return (
    <div>
      <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-5">
        <LayoutGrid className="w-6 h-6 text-emerald-500" />
      </div>
      <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display mb-6">Wygląd i treść</h2>

      <div className="mb-6 pb-6 border-b border-zinc-100 dark:border-zinc-800">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-2">Limity treści (max znaków)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
          <div>
            <label className="label-field">Nazwa wyświetlana</label>
            <input type="number" min="1" max="100000" value={limitForm.limit_display_name}
              onChange={e => setLimitForm(f => ({ ...f, limit_display_name: e.target.value }))} className="input-field !py-3 text-sm" />
          </div>
          <div>
            <label className="label-field">Bio</label>
            <input type="number" min="1" max="100000" value={limitForm.limit_bio}
              onChange={e => setLimitForm(f => ({ ...f, limit_bio: e.target.value }))} className="input-field !py-3 text-sm" />
          </div>
          <div>
            <label className="label-field">Komentarz</label>
            <input type="number" min="1" max="100000" value={limitForm.limit_comment}
              onChange={e => setLimitForm(f => ({ ...f, limit_comment: e.target.value }))} className="input-field !py-3 text-sm" />
          </div>
        </div>
        <button onClick={() => save(limitForm, 'Zapisano limity.')} disabled={saving} className="btn-primary text-sm mt-4 disabled:opacity-50">Zapisz limity</button>
      </div>

      <div className="mb-6 pb-6 border-b border-zinc-100 dark:border-zinc-800">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-2">Wyświetlanie filmów</h3>
        <div className="grid grid-cols-2 gap-4 max-w-xs">
          <div>
            <label className="label-field">Filmów na stronę</label>
            <input type="number" min="1" max="500" value={displayForm.videos_per_page}
              onChange={e => setDisplayForm(f => ({ ...f, videos_per_page: e.target.value }))} className="input-field !py-3 text-sm" />
          </div>
          <div>
            <label className="label-field">Maks. kolumn siatki</label>
            <input type="number" min="1" max="12" value={displayForm.grid_columns}
              onChange={e => setDisplayForm(f => ({ ...f, grid_columns: e.target.value }))} className="input-field !py-3 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="label-field">Min. szerokość karty (px)</label>
            <input type="number" min="150" max="800" value={displayForm.grid_card_min_width}
              onChange={e => setDisplayForm(f => ({ ...f, grid_card_min_width: e.target.value }))} className="input-field !py-3 text-sm" />
          </div>
        </div>
        <button onClick={() => save(displayForm, 'Zapisano ustawienia siatki.')} disabled={saving} className="btn-primary text-sm mt-4 disabled:opacity-50">Zapisz</button>

        <div className="mt-5 pt-5 border-t border-zinc-100 dark:border-zinc-800">
          <ToggleSwitch
            checked={!!settings.infinite_scroll}
            onChange={() => toggle('infinite_scroll', 'Zapisano.')}
            disabled={saving}
            label={settings.infinite_scroll ? 'Infinite scroll: WŁĄCZONY' : 'Infinite scroll: WYŁĄCZONY'}
          />
        </div>
      </div>

      <div className="mb-6 pb-6 border-b border-zinc-100 dark:border-zinc-800">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-2">Logi</h3>
        <div className="max-w-[140px]">
          <label className="label-field">Logów na stronę</label>
          <input type="number" min="1" max="500" value={logsForm.logs_per_page}
            onChange={e => setLogsForm(f => ({ ...f, logs_per_page: e.target.value }))} className="input-field !py-3 text-sm" />
        </div>
        <button onClick={() => save(logsForm, 'Zapisano.')} disabled={saving} className="btn-primary text-sm mt-4 disabled:opacity-50">Zapisz</button>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-1">Odtwarzacz YouTube</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">Nakładka UI na player YT (eksperymentalna).</p>
          <ToggleSwitch
            checked={!!settings.youtube_custom_player}
            onChange={() => toggle('youtube_custom_player', 'Zapisano.')}
            disabled={saving}
            label={settings.youtube_custom_player ? 'Własna nakładka YouTube: WŁĄCZONA' : 'Własna nakładka YouTube: WYŁĄCZONA'}
          />
        </div>
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-1">Górny pasek</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
            WŁĄCZONY: tytuł strony, wyszukiwarka i profil użytkownika w górnym pasku. WYŁĄCZONY: profil w lewym dolnym
            rogu, a każda strona pokazuje własny tytuł, brak smart search.
          </p>
          <ToggleSwitch
            checked={!!settings.show_top_bar}
            onChange={() => toggle('show_top_bar', 'Zapisano.')}
            disabled={saving}
            label={settings.show_top_bar ? 'Górny pasek: WŁĄCZONY' : 'Górny pasek: WYŁĄCZONY'}
          />
        </div>
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-1">Własne avatary</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
            Zezwól zwykłym userom (member) na przesyłanie własnego zdjęcia profilowego. Redaktorzy i devowie mogą zawsze.
          </p>
          <ToggleSwitch
            checked={!!settings.allow_custom_avatars}
            onChange={() => toggle('allow_custom_avatars', 'Zapisano.')}
            disabled={saving}
            label={settings.allow_custom_avatars ? 'Własne avatary: WŁĄCZONE' : 'Własne avatary: WYŁĄCZONE'}
          />
        </div>
      </div>
    </div>
  );
}
