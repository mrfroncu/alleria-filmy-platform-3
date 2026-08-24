import React, { useState, useEffect } from 'react';
import { LogIn, Bot, Headphones, Radio, MessageSquare } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../contexts/ToastContext';
import { Segmented, sourceBadgeClass } from './SetupUI';

const emptyTs = { host: '', port: '', server_id: '', username: '', password: '', member_group_id: '', admin_group_id: '' };

// Same fields, same payload keys, same .env-vs-panel locking as ManagePage.jsx's "Logowanie"
// section — see that file for the authoritative behavior this mirrors.
export default function LoginStep({ settings, reloadSettings }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [botNickname, setBotNickname] = useState('');
  const [ts6Form, setTs6Form] = useState({ ...emptyTs, api_key: '' });
  const [ts3Form, setTs3Form] = useState(emptyTs);
  const [discordRolesForm, setDiscordRolesForm] = useState({ member_role_id: '', admin_role_id: '' });

  useEffect(() => {
    if (!settings) return;
    setBotNickname(settings.ts_bot_nickname || '');
    setTs6Form({
      host: settings.ts6_host || '', port: settings.ts6_port || '', server_id: settings.ts6_server_id || '',
      username: settings.ts6_username || '', password: settings.ts6_password || '', api_key: settings.ts6_api_key || '',
      member_group_id: settings.ts6_member_group_id || '', admin_group_id: settings.ts6_admin_group_id || '',
    });
    setTs3Form({
      host: settings.ts3_host || '', port: settings.ts3_port || '', server_id: settings.ts3_server_id || '',
      username: settings.ts3_username || '', password: settings.ts3_password || '',
      member_group_id: settings.ts3_member_group_id || '', admin_group_id: settings.ts3_admin_group_id || '',
    });
    setDiscordRolesForm({
      member_role_id: settings.discord_member_role_id || '', admin_role_id: settings.discord_admin_role_id || '',
    });
  }, [settings]);

  if (!settings) return <div className="h-64 skeleton rounded-2xl" />;

  const tsLocked = settings.ts_config_source !== 'panel';
  const discordRolesLocked = settings.discord_roles_config_source !== 'panel';

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

  return (
    <div>
      <div className="w-12 h-12 rounded-2xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center mb-5">
        <LogIn className="w-6 h-6 text-violet-500" />
      </div>
      <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display mb-6">Logowanie</h2>

      {/* Bot nickname */}
      <div className="mb-6 pb-6 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Bot className="w-4 h-4 text-violet-500" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display">Nazwa bota ServerQuery</h3>
          <span className="text-[11px] text-zinc-400 font-normal">(wspólna dla TS3 i TS6)</span>
          {tsLocked && <span className={sourceBadgeClass}>Źródło: .env</span>}
        </div>
        <div className="flex gap-2 max-w-md">
          <input type="text" disabled={tsLocked} value={botNickname} onChange={e => setBotNickname(e.target.value)}
            className="input-field !py-2.5 text-sm flex-1 disabled:opacity-50" placeholder="ALLERIA VIDEOS PLATFORM" />
          <button onClick={() => save({ ts_bot_nickname: botNickname }, 'Zapisano nazwę bota.')} disabled={tsLocked || saving}
            className="btn-primary text-sm shrink-0 disabled:opacity-50">Zapisz</button>
        </div>
      </div>

      {/* TS3 delivery */}
      <div className="mb-6 pb-6 border-b border-zinc-100 dark:border-zinc-800">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-2">Wysyłka kodu logowania (TS3)</h3>
        <Segmented
          value={settings.ts3_code_delivery}
          disabled={saving}
          options={[['pm', 'Wiadomość'], ['poke', 'Poke'], ['both', 'Oba']]}
          onChange={(val) => save({ ts3_code_delivery: val }, 'Zapisano sposób dostarczania kodu.')}
        />
      </div>

      {/* TS6 */}
      <div className="mb-6 pb-6 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Headphones className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display">TeamSpeak 6</h3>
          {tsLocked && <span className={sourceBadgeClass}>Źródło: .env</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="label-field">Host</label><input type="text" disabled={tsLocked} value={ts6Form.host} onChange={e => setTs6Form(f => ({ ...f, host: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
          <div><label className="label-field">Port</label><input type="text" disabled={tsLocked} value={ts6Form.port} onChange={e => setTs6Form(f => ({ ...f, port: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
          <div><label className="label-field">Server ID</label><input type="text" disabled={tsLocked} value={ts6Form.server_id} onChange={e => setTs6Form(f => ({ ...f, server_id: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
          <div><label className="label-field">Użytkownik</label><input type="text" disabled={tsLocked} value={ts6Form.username} onChange={e => setTs6Form(f => ({ ...f, username: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
          <div><label className="label-field">Hasło</label><input type="password" disabled={tsLocked} value={ts6Form.password} onChange={e => setTs6Form(f => ({ ...f, password: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
          <div className="col-span-2"><label className="label-field">Klucz API</label><input type="password" disabled={tsLocked} value={ts6Form.api_key} onChange={e => setTs6Form(f => ({ ...f, api_key: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
          <div><label className="label-field">ID grupy Member</label><input type="text" disabled={tsLocked} value={ts6Form.member_group_id} onChange={e => setTs6Form(f => ({ ...f, member_group_id: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
          <div><label className="label-field">ID grupy Admin</label><input type="text" disabled={tsLocked} value={ts6Form.admin_group_id} onChange={e => setTs6Form(f => ({ ...f, admin_group_id: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
        </div>
        <button
          onClick={() => save({
            ts6_host: ts6Form.host, ts6_port: ts6Form.port, ts6_username: ts6Form.username, ts6_password: ts6Form.password,
            ts6_api_key: ts6Form.api_key, ts6_server_id: ts6Form.server_id, ts6_member_group_id: ts6Form.member_group_id,
            ts6_admin_group_id: ts6Form.admin_group_id,
          }, 'Zapisano TeamSpeak 6.')}
          disabled={tsLocked || saving} className="btn-primary text-sm mt-4 disabled:opacity-50"
        >Zapisz TeamSpeak 6</button>
      </div>

      {/* TS3 */}
      <div className="mb-6 pb-6 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Radio className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display">TeamSpeak 3</h3>
          {tsLocked && <span className={sourceBadgeClass}>Źródło: .env</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="label-field">Host</label><input type="text" disabled={tsLocked} value={ts3Form.host} onChange={e => setTs3Form(f => ({ ...f, host: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
          <div><label className="label-field">Port</label><input type="text" disabled={tsLocked} value={ts3Form.port} onChange={e => setTs3Form(f => ({ ...f, port: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
          <div><label className="label-field">Server ID</label><input type="text" disabled={tsLocked} value={ts3Form.server_id} onChange={e => setTs3Form(f => ({ ...f, server_id: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
          <div><label className="label-field">Użytkownik</label><input type="text" disabled={tsLocked} value={ts3Form.username} onChange={e => setTs3Form(f => ({ ...f, username: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
          <div><label className="label-field">Hasło</label><input type="password" disabled={tsLocked} value={ts3Form.password} onChange={e => setTs3Form(f => ({ ...f, password: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
          <div><label className="label-field">ID grupy Member</label><input type="text" disabled={tsLocked} value={ts3Form.member_group_id} onChange={e => setTs3Form(f => ({ ...f, member_group_id: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
          <div><label className="label-field">ID grupy Admin</label><input type="text" disabled={tsLocked} value={ts3Form.admin_group_id} onChange={e => setTs3Form(f => ({ ...f, admin_group_id: e.target.value }))} className="input-field !py-2.5 text-sm disabled:opacity-50" /></div>
        </div>
        <button
          onClick={() => save({
            ts3_host: ts3Form.host, ts3_port: ts3Form.port, ts3_username: ts3Form.username, ts3_password: ts3Form.password,
            ts3_server_id: ts3Form.server_id, ts3_member_group_id: ts3Form.member_group_id, ts3_admin_group_id: ts3Form.admin_group_id,
          }, 'Zapisano TeamSpeak 3.')}
          disabled={tsLocked || saving} className="btn-primary text-sm mt-4 disabled:opacity-50"
        >Zapisz TeamSpeak 3</button>
      </div>

      {/* Discord roles */}
      <div>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <MessageSquare className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display">Discord - role Member / Redaktor</h3>
          {discordRolesLocked && <span className={sourceBadgeClass}>Źródło: .env</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
          <div>
            <label className="label-field">ID roli Member</label>
            <input type="text" disabled={discordRolesLocked} value={discordRolesForm.member_role_id}
              onChange={e => setDiscordRolesForm(f => ({ ...f, member_role_id: e.target.value }))}
              className="input-field !py-2.5 text-sm font-mono disabled:opacity-50" placeholder="123456789012345678" />
          </div>
          <div>
            <label className="label-field">ID roli Admin</label>
            <input type="text" disabled={discordRolesLocked} value={discordRolesForm.admin_role_id}
              onChange={e => setDiscordRolesForm(f => ({ ...f, admin_role_id: e.target.value }))}
              className="input-field !py-2.5 text-sm font-mono disabled:opacity-50" placeholder="123456789012345679" />
          </div>
        </div>
        <button
          onClick={() => save({
            discord_member_role_id: discordRolesForm.member_role_id, discord_admin_role_id: discordRolesForm.admin_role_id,
          }, 'Zapisano role Discord.')}
          disabled={discordRolesLocked || saving} className="btn-primary text-sm mt-4 disabled:opacity-50"
        >Zapisz role Discord</button>
      </div>
    </div>
  );
}
