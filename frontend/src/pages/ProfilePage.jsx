import React, { useState, useEffect } from 'react';
import { User, Film, Eye, Heart, Calendar, Shield, Pencil, Check, X } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate } from '../utils/helpers';

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [config, setConfig] = useState({ limitDisplayName: 50, limitBio: 1000 });

  useEffect(() => { api.getConfig().then(c => setConfig(prev => ({ ...prev, ...c }))).catch(() => {}); }, []);

  const load = () => {
    setLoading(true);
    api.getProfile().then(p => {
      setProfile(p);
      setEditName(p.display_name || '');
      setEditBio(p.bio || '');
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateProfile({ display_name: editName, bio: editBio });
      setProfile(prev => ({ ...prev, display_name: editName, bio: editBio }));
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert('Błąd: ' + err.message);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-6 sm:p-10 max-w-3xl mx-auto page-enter">
        <div className="card p-10"><div className="h-40 skeleton rounded-2xl" /></div>
      </div>
    );
  }

  if (!profile) return null;

  const roleColors = {
    dev: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/20',
    admin: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/20',
    member: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20',
  };

  return (
    <div className="p-6 sm:p-10 max-w-3xl mx-auto page-enter">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/10 rounded-xl flex items-center justify-center">
            <User className="w-5 h-5 text-violet-500" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Mój profil</h1>
        </div>
      </div>

      {saved && (
        <div className="mb-6 p-4 rounded-2xl border bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-sm font-medium animate-slide-up flex items-center gap-2">
          <Check className="w-4 h-4" /> Profil zaktualizowany pomyślnie.
        </div>
      )}

      {/* Profile Card */}
      <div className="card p-8 mb-6">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <img
            src={profile.avatar || `https://ui-avatars.com/api/?name=${profile.display_name}&background=6366f1&color=fff&size=160`}
            alt=""
            className="w-24 h-24 rounded-2xl shadow-lg border-2 border-zinc-200 dark:border-zinc-700 object-cover"
          />
          <div className="flex-1">
            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="label-field">Wyświetlana nazwa <span className="text-zinc-400 font-normal">({editName.length}/{config.limitDisplayName})</span></label>
                  <input type="text" maxLength={config.limitDisplayName} value={editName} onChange={e => setEditName(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="label-field">O mnie <span className="text-zinc-400 font-normal">({editBio.length}/{config.limitBio})</span></label>
                  <textarea maxLength={config.limitBio} value={editBio} onChange={e => setEditBio(e.target.value)} className="input-field resize-none h-24" placeholder="Napisz coś o sobie..." />
                </div>
                <div className="flex gap-3">
                  <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-2">
                    <Check className="w-4 h-4" /> {saving ? 'Zapisywanie...' : 'Zapisz'}
                  </button>
                  <button onClick={() => { setEditing(false); setEditName(profile.display_name || ''); setEditBio(profile.bio || ''); }} className="btn-secondary text-sm flex items-center gap-2">
                    <X className="w-4 h-4" /> Anuluj
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{profile.display_name}</h2>
                  <span className={`inline-flex px-3 py-1 rounded-xl text-xs font-bold border ${roleColors[profile.role] || roleColors.member}`}>
                    {profile.role?.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-zinc-500 font-mono mb-2">@{profile.username}</p>
                {profile.bio ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">{profile.bio}</p>
                ) : (
                  <p className="text-sm text-zinc-400 italic mb-4">Brak opisu — kliknij edytuj, żeby dodać.</p>
                )}
                <button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 text-sm font-bold text-violet-500 dark:text-violet-400 hover:text-violet-500 transition-colors">
                  <Pencil className="w-4 h-4" /> Edytuj profil
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-5 text-center">
          <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Eye className="w-5 h-5 text-violet-500" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{profile.viewCount}</p>
          <p className="text-[11px] text-zinc-500 font-medium mt-1">Obejrzanych</p>
        </div>
        <div className="card p-5 text-center">
          <div className="w-10 h-10 bg-pink-50 dark:bg-pink-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Heart className="w-5 h-5 text-pink-500" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{profile.favCount}</p>
          <p className="text-[11px] text-zinc-500 font-medium mt-1">Ulubionych</p>
        </div>
        <div className="card p-5 text-center">
          <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Film className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{profile.videoCount}</p>
          <p className="text-[11px] text-zinc-500 font-medium mt-1">Filmów (autor)</p>
        </div>
      </div>

      {/* Account Details */}
      <div className="card p-6">
        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider font-display mb-4">Szczegóły konta</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-sm text-zinc-500">Metoda logowania</span>
            <span className="text-sm font-medium text-zinc-900 dark:text-white">{profile.auth_method}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-sm text-zinc-500">Data rejestracji</span>
            <span className="text-sm font-mono text-zinc-900 dark:text-white">{formatDate(profile.created_at)}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-zinc-500">Ostatnie logowanie</span>
            <span className="text-sm font-mono text-zinc-900 dark:text-white">{formatDate(profile.last_login)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
