import React, { useState, useEffect } from 'react';
import { Mail } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../contexts/ToastContext';
import { ToggleSwitch } from './SetupUI';

const TEMPLATE_FIELDS = [
  { key: 'email_template_new_video', title: 'Nowy film w kategorii', hint: 'Znaczniki: {title} {author} {category} {description} {date} {id} {url} {thumbnail}', type: 'new_video', rows: 5 },
  { key: 'email_template_gdpr_notify', title: 'Zgłoszenie RODO (do administracji)', hint: 'Znaczniki: {user} {type} {url}', type: 'gdpr_notify', rows: 4 },
  { key: 'email_template_gdpr_result_export', title: 'RODO - eksport gotowy', hint: null, type: 'gdpr_result_export', rows: 4 },
  { key: 'email_template_gdpr_result_deletion', title: 'RODO - konto usunięte', hint: null, type: 'gdpr_result_deletion', rows: 4 },
];

// Same fields, same payload keys as ManagePage.jsx's "Ustawienia serwera E-mail" section.
export default function EmailStep({ settings, reloadSettings }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [smtpForm, setSmtpForm] = useState({ host: '', port: '', user: '', password: '', from: '', secure: false });
  const [templates, setTemplates] = useState({});
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setSmtpForm({
      host: settings.smtp_host || '', port: settings.smtp_port || '', user: settings.smtp_user || '',
      password: settings.smtp_password || '', from: settings.smtp_from || '', secure: !!settings.smtp_secure,
    });
    setTemplates({
      email_template_new_video: settings.email_template_new_video || '',
      email_template_gdpr_notify: settings.email_template_gdpr_notify || '',
      email_template_gdpr_result_export: settings.email_template_gdpr_result_export || '',
      email_template_gdpr_result_deletion: settings.email_template_gdpr_result_deletion || '',
    });
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

  const saveSmtp = () => save({
    smtp_host: smtpForm.host, smtp_port: smtpForm.port, smtp_user: smtpForm.user,
    smtp_password: smtpForm.password, smtp_from: smtpForm.from, smtp_secure: smtpForm.secure,
  }, 'Zapisano ustawienia SMTP.');

  const sendTest = async () => {
    setTestingEmail(true);
    try {
      await api.sendTestEmail(testEmailTo);
      toast.success('Wysłano testowego e-maila.');
    } catch (e) {
      toast.error('Błąd: ' + e.message);
    } finally {
      setTestingEmail(false);
    }
  };

  return (
    <div>
      <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-5">
        <Mail className="w-6 h-6 text-blue-500" />
      </div>
      <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display mb-2">Powiadomienia e-mail</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        Serwer SMTP używany do powiadomień o nowych filmach oraz zgłoszeń RODO. Opcjonalne - bez tego platforma działa
        normalnie, po prostu nikt nie dostanie e-maili.
      </p>

      <div className="mb-6 pb-6 border-b border-zinc-100 dark:border-zinc-800">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label-field">Host</label>
            <input type="text" value={smtpForm.host} onChange={e => setSmtpForm(f => ({ ...f, host: e.target.value }))} className="input-field !py-3 text-sm font-mono" placeholder="smtp.example.com" />
          </div>
          <div>
            <label className="label-field">Port</label>
            <input type="text" value={smtpForm.port} onChange={e => setSmtpForm(f => ({ ...f, port: e.target.value }))} className="input-field !py-3 text-sm font-mono" placeholder="587" />
          </div>
          <div>
            <label className="label-field">Użytkownik</label>
            <input type="text" value={smtpForm.user} onChange={e => setSmtpForm(f => ({ ...f, user: e.target.value }))} className="input-field !py-3 text-sm font-mono" />
          </div>
          <div>
            <label className="label-field">Hasło</label>
            <input type="password" value={smtpForm.password} onChange={e => setSmtpForm(f => ({ ...f, password: e.target.value }))} className="input-field !py-3 text-sm font-mono" />
          </div>
          <div>
            <label className="label-field">Nadawca (From)</label>
            <input type="text" value={smtpForm.from} onChange={e => setSmtpForm(f => ({ ...f, from: e.target.value }))} className="input-field !py-3 text-sm font-mono" placeholder="Alleria Filmy <no-reply@alleria.pl>" />
          </div>
          <div className="flex items-end">
            <ToggleSwitch checked={smtpForm.secure} onChange={() => setSmtpForm(f => ({ ...f, secure: !f.secure }))} label={smtpForm.secure ? 'SSL/TLS: WŁĄCZONE' : 'SSL/TLS: WYŁĄCZONE'} />
          </div>
        </div>
        <button onClick={saveSmtp} disabled={saving} className="btn-primary text-sm mb-4 disabled:opacity-50">Zapisz SMTP</button>
        <div className="flex items-center gap-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
          <input
            type="email" value={testEmailTo} onChange={e => setTestEmailTo(e.target.value)}
            placeholder="adres@testowy.pl (puste = Twój zapisany e-mail)" className="input-field !py-2.5 text-sm flex-1"
          />
          <button onClick={sendTest} disabled={testingEmail} className="btn-secondary text-sm shrink-0 disabled:opacity-50">
            {testingEmail ? 'Wysyłanie...' : 'Wyślij testowy e-mail'}
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-2">Szablony e-mail</h3>
        <button type="button" onClick={() => setShowTemplates(v => !v)} className="btn-secondary text-sm">
          {showTemplates ? 'Ukryj szablony' : 'Zarządzaj szablonami e-mail'}
        </button>
        {showTemplates && (
          <div className="mt-5 space-y-6">
            {TEMPLATE_FIELDS.map(tpl => (
              <div key={tpl.key} className="border-t border-zinc-100 dark:border-zinc-800 pt-5">
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-2">{tpl.title}</h4>
                <textarea
                  value={templates[tpl.key] || ''}
                  onChange={e => setTemplates(t => ({ ...t, [tpl.key]: e.target.value }))}
                  className="input-field font-mono resize-y min-h-[6rem]"
                  style={{ height: `${tpl.rows * 1.5}rem` }}
                />
                {tpl.hint && <p className="text-[9px] text-zinc-400 mt-1">{tpl.hint}</p>}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => save({ [tpl.key]: templates[tpl.key] }, 'Zapisano szablon.')} disabled={saving} className="btn-primary text-sm disabled:opacity-50">Zapisz</button>
                  <button type="button" onClick={() => window.open(api.emailTemplatePreviewUrl(tpl.type, templates[tpl.key] || ''), '_blank')} className="btn-secondary text-sm">Podgląd</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
