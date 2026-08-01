import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Check, X, RefreshCw, Film, Eye, Heart, Globe, Server } from 'lucide-react';
import { api } from '../utils/apiClient';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { formatDate } from '../utils/helpers';
import { ROLE_TONES, ROLE_LABELS } from '../utils/roleColors';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input, { Label } from '../components/ui/Input';
import Skeleton from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';

export default function ProfilePage() {
  const { config } = useSettings();
  const { refresh: refreshAuth } = useAuth();
  const notify = useToast();

  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ display_name: '', bio: '' });
  const [saving, setSaving] = useState(false);
  const [refreshingAvatar, setRefreshingAvatar] = useState(false);

  const load = () => api.getProfile().then((p) => { setProfile(p); setForm({ display_name: p.display_name || '', bio: p.bio || '' }); }).catch(() => {});

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateProfile(form);
      setProfile((p) => ({ ...p, ...updated }));
      setEditing(false);
      refreshAuth();
      notify('Profil zapisany.', 'success');
    } catch (e) {
      notify(e.message, 'error');
    }
    setSaving(false);
  };

  const setAvatarSource = async (source) => {
    try {
      const updated = await api.updateProfile({ avatar_source: source });
      setProfile((p) => ({ ...p, ...updated }));
      refreshAuth();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const refreshDiscord = async () => {
    setRefreshingAvatar(true);
    try {
      await api.refreshDiscordAvatar();
      await load();
      refreshAuth();
      notify('Avatar odświeżony z Discorda.', 'success');
    } catch (e) {
      notify(e.message, 'error');
    }
    setRefreshingAvatar(false);
  };

  if (!profile) {
    return (
      <div className="p-6 sm:p-10 max-w-2xl mx-auto">
        <Skeleton className="h-40 rounded-4xl mb-5" />
        <Skeleton className="h-24 rounded-4xl" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 sm:p-10 max-w-2xl mx-auto space-y-5">
      <Card className="p-8">
        <div className="flex items-start gap-5">
          <Avatar src={profile.avatar} name={profile.display_name || profile.username} size="xl" />
          <div className="flex-1 min-w-0 pt-1">
            {!editing ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display">{profile.display_name || profile.username}</h1>
                  <Badge tone={ROLE_TONES[profile.role] || 'neutral'}>{ROLE_LABELS[profile.role] || profile.role}</Badge>
                </div>
                {profile.bio && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 whitespace-pre-wrap">{profile.bio}</p>}
                <button onClick={() => setEditing(true)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-500 hover:text-brand-600">
                  <Pencil className="w-3.5 h-3.5" /> Edytuj profil
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label>Wyświetlana nazwa</Label>
                  <Input value={form.display_name} maxLength={config.limitDisplayName} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} />
                </div>
                <div>
                  <Label>Bio</Label>
                  <textarea
                    value={form.bio}
                    maxLength={config.limitBio}
                    onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                    rows={3}
                    className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/30"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={save} disabled={saving}><Check className="w-3.5 h-3.5" /> Zapisz</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setEditing(false); setForm({ display_name: profile.display_name || '', bio: profile.bio || '' }); }}>
                    <X className="w-3.5 h-3.5" /> Anuluj
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {profile.auth_method === 'discord' && (
        <Card className="p-6">
          <h3 className="font-bold text-slate-900 dark:text-white font-display text-sm mb-1">Źródło avatara</h3>
          <p className="text-xs text-slate-400 mb-4">Avatar można zmienić tylko na Discordzie — tutaj wybierasz tylko, który z nich pokazywać.</p>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setAvatarSource('global')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-xs font-semibold transition-colors ${
                profile.avatar_source !== 'guild' ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'
              }`}
            >
              <Globe className="w-3.5 h-3.5" /> Globalny
            </button>
            <button
              onClick={() => profile.has_guild_avatar && setAvatarSource('guild')}
              disabled={!profile.has_guild_avatar}
              title={!profile.has_guild_avatar ? 'Brak ustawionego avatara serwerowego (wymaga Discord Nitro)' : ''}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                profile.avatar_source === 'guild' ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'
              }`}
            >
              <Server className="w-3.5 h-3.5" /> Serwerowy
            </button>
          </div>
          {!profile.has_guild_avatar && (
            <p className="text-[11px] text-slate-400 mb-3">Avatar serwerowy to funkcja Discord Nitro — nie masz go ustawionego.</p>
          )}
          <button onClick={refreshDiscord} disabled={refreshingAvatar} className="text-xs font-semibold text-slate-400 hover:text-brand-500 flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingAvatar ? 'animate-spin' : ''}`} /> Odśwież z Discorda
          </button>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center">
          <Film className="w-4 h-4 text-brand-500 mx-auto mb-1.5" />
          <p className="text-lg font-bold text-slate-900 dark:text-white">{profile.videoCount ?? 0}</p>
          <p className="text-[11px] text-slate-400">Filmów</p>
        </Card>
        <Card className="p-4 text-center">
          <Eye className="w-4 h-4 text-teal-500 mx-auto mb-1.5" />
          <p className="text-lg font-bold text-slate-900 dark:text-white">{profile.viewCount ?? 0}</p>
          <p className="text-[11px] text-slate-400">Wyświetleń</p>
        </Card>
        <Card className="p-4 text-center">
          <Heart className="w-4 h-4 text-rose-500 mx-auto mb-1.5" />
          <p className="text-lg font-bold text-slate-900 dark:text-white">{profile.favCount ?? 0}</p>
          <p className="text-[11px] text-slate-400">Ulubionych</p>
        </Card>
      </div>

      <Card className="p-6 text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
        <p>Metoda logowania: <span className="font-semibold text-slate-700 dark:text-slate-200 capitalize">{profile.auth_method}</span></p>
        {profile.created_at && <p>Konto utworzone: {formatDate(profile.created_at)}</p>}
        {profile.last_login && <p>Ostatnie logowanie: {formatDate(profile.last_login)}</p>}
      </Card>
    </motion.div>
  );
}
