import React, { useState, useEffect } from 'react';
import { ShieldCheck, Frame, X } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../contexts/ToastContext';
import { ToggleSwitch, Segmented } from './SetupUI';

// Same fields, same payload keys as ManagePage.jsx's "Bezpieczeństwo i prywatność" section.
export default function SecurityStep({ settings, reloadSettings }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [originsForm, setOriginsForm] = useState([]);
  const [originInput, setOriginInput] = useState('');

  useEffect(() => {
    if (settings) setOriginsForm(settings.iframe_allowed_origins || []);
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

  const addOrigin = () => {
    const v = originInput.trim();
    if (v && !originsForm.includes(v)) setOriginsForm(o => [...o, v]);
    setOriginInput('');
  };
  const removeOrigin = (o) => setOriginsForm(list => list.filter(x => x !== o));

  return (
    <div>
      <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-5">
        <ShieldCheck className="w-6 h-6 text-blue-500" />
      </div>
      <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display mb-6">Bezpieczeństwo i prywatność</h2>

      <div className="mb-6 pb-6 border-b border-zinc-100 dark:border-zinc-800">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-2">Ograniczenie domen webhooków</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
          Gdy włączone, serwer wysyła powiadomienia webhook tylko do domen Discorda
          ({settings.webhook_allowed_hosts?.join(', ') || 'discord.com, discordapp.com'}) — ochrona przed SSRF.
        </p>
        <ToggleSwitch
          checked={!!settings.webhook_domain_restriction}
          onChange={() => save({ webhook_domain_restriction: !settings.webhook_domain_restriction }, 'Zapisano.')}
          disabled={saving}
          label={settings.webhook_domain_restriction ? 'Ograniczenie domen: WŁĄCZONE' : 'Ograniczenie domen: WYŁĄCZONE'}
        />
      </div>

      <div className="mb-6 pb-6 border-b border-zinc-100 dark:border-zinc-800">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-2">Region RODO (GDPR / LGPD)</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
          Włącza samoobsługowe żądania eksportu/usunięcia danych (sekcja "Twoje dane" w profilu).
        </p>
        <Segmented
          value={settings.gdpr_region}
          disabled={saving}
          options={[['off', 'Wyłączone'], ['eu', 'UE'], ['brazil', 'Brazylia']]}
          onChange={(val) => save({ gdpr_region: val }, 'Zapisano region RODO.')}
        />
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <Frame className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display">Osadzanie w iframe</h3>
        </div>
        <ToggleSwitch
          checked={!!settings.iframe_embed_enabled}
          onChange={() => save({ iframe_embed_enabled: !settings.iframe_embed_enabled }, 'Zapisano.')}
          disabled={saving}
          label={settings.iframe_embed_enabled ? 'Osadzanie: WŁĄCZONE' : 'Osadzanie: WYŁĄCZONE'}
        />
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mt-5 mb-2 font-display">Dozwolone domeny</p>
        <div className="flex gap-2 max-w-md">
          <input
            type="text" value={originInput} onChange={e => setOriginInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOrigin(); } }}
            placeholder="https://alleria.pl" className="input-field !py-2.5 text-sm font-mono flex-1"
          />
          <button type="button" onClick={addOrigin} className="btn-ghost-primary shrink-0">Dodaj</button>
        </div>
        {originsForm.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {originsForm.map(origin => (
              <span key={origin} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs font-mono">
                {origin}
                <button type="button" onClick={() => removeOrigin(origin)} className="p-0.5 rounded hover:bg-red-500/10 hover:text-red-500 transition-colors" title="Usuń">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <button onClick={() => save({ iframe_allowed_origins: originsForm }, 'Zapisano domeny.')} disabled={saving} className="btn-primary text-sm mt-4 disabled:opacity-50">
          Zapisz domeny
        </button>
      </div>
    </div>
  );
}
