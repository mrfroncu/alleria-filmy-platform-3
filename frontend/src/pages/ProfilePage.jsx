import React, { useState, useEffect } from 'react';
import { User, Film, Eye, Heart, Pencil, Check, X, KeyRound, CalendarDays, LogIn } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate } from '../utils/helpers';
import { useCountUp } from '../utils/hooks';
import { morph } from '../utils/fx';

function StatTile({ icon: Icon, value, label, tone, delay }) {
  const display = useCountUp(value);
  return (
    <div className="bento card p-5 text-center group transition-all animate-slide-up" style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}>
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 ${tone}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-3xl font-extrabold text-zinc-900 dark:text-white font-display">{display}</p>
      <p className="text-[11px] text-zinc-500 font-medium mt-1">{label}</p>
    </div>
  );
}

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
      morph(() => setEditing(false));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert('Błąd: ' + err.message);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-5 sm:px-10 sm:py-6 max-w-4xl mx-auto">
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
    <div className="p-5 sm:px-10 sm:py-6 max-w-4xl mx-auto">
      <div className="mb-8 anim-stagger-1">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 bg-ember-50 dark:bg-ember-500/10 border border-ember-100 dark:border-ember-500/20 rounded-2xl flex items-center justify-center animate-float">
            <User className="w-5 h-5 text-ember-500" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-display">
            <span className="text-gradient">Mój profil</span>
          </h1>
        </div>
      </div>

      {saved && (
        <div className="mb-6 p-4 rounded-2xl border bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-sm font-medium toast-anim flex items-center gap-2">
          <Check className="w-4 h-4 animate-spring-in" /> Profil zaktualizowany pomyślnie.
        </div>
      )}

      {/* ════ BENTO ════ */}
      <div className="grid grid-cols-3 gap-4">

        {/* Identity tile */}
        <div className="bento card col-span-3 p-8 relative overflow-hidden transition-all anim-stagger-2">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-ember-500 via-curtain-500 to-ember-500" style={{ backgroundSize: '300% 100%', animation: 'gradientFlow 8s ease infinite' }} />
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <div className="glow-ring rounded-3xl shrink-0">
              <img
                src={profile.avatar || `https://ui-avatars.com/api/?name=${profile.display_name}&background=dd5f02&color=fff&size=160`}
                alt=""
                className="w-24 h-24 rounded-3xl shadow-lg border-2 border-zinc-200 dark:border-zinc-700 object-cover hover:scale-105 hover:-rotate-2 transition-transform duration-300"
              />
            </div>
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-4 animate-scale-in">
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
                    <button onClick={() => morph(() => { setEditing(false); setEditName(profile.display_name || ''); setEditBio(profile.bio || ''); })} className="btn-secondary text-sm flex items-center gap-2">
                      <X className="w-4 h-4" /> Anuluj
                    </button>
                  </div>
                </div>
              ) : (
                <div className="animate-scale-in">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white font-display">{profile.display_name}</h2>
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold border ${roleColors[profile.role] || roleColors.member}`}>
                      {profile.role?.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500 font-mono mb-2">@{profile.username}</p>
                  {profile.bio ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">{profile.bio}</p>
                  ) : (
                    <p className="text-sm text-zinc-400 italic mb-4">Brak opisu — kliknij edytuj, żeby dodać.</p>
                  )}
                  <button onClick={() => morph(() => setEditing(true))} className="link-underline inline-flex items-center gap-2 text-sm font-bold text-ember-500 dark:text-ember-400 hover:text-ember-400 transition-colors group">
                    <Pencil className="w-4 h-4 group-hover:-rotate-12 transition-transform" /> Edytuj profil
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats — numbers count up */}
        <StatTile icon={Eye} value={profile.viewCount} label="Obejrzanych" tone="bg-ember-50 dark:bg-ember-500/10 text-ember-500" delay={120} />
        <StatTile icon={Heart} value={profile.favCount} label="Ulubionych" tone="bg-curtain-50 dark:bg-curtain-500/10 text-curtain-500" delay={200} />
        <StatTile icon={Film} value={profile.videoCount} label="Filmów (autor)" tone="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500" delay={280} />

        {/* Account detail tiles */}
        <div className="bento card col-span-3 sm:col-span-1 p-5 transition-all animate-slide-up" style={{ animationDelay: '340ms', animationFillMode: 'both' }}>
          <KeyRound className="w-4 h-4 text-ember-500 mb-2" />
          <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-400 font-display mb-1">Metoda logowania</p>
          <p className="text-sm font-bold text-zinc-900 dark:text-white">{profile.auth_method}</p>
        </div>
        <div className="bento card col-span-3 sm:col-span-1 p-5 transition-all animate-slide-up" style={{ animationDelay: '400ms', animationFillMode: 'both' }}>
          <CalendarDays className="w-4 h-4 text-ember-500 mb-2" />
          <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-400 font-display mb-1">Data rejestracji</p>
          <p className="text-sm font-bold font-mono text-zinc-900 dark:text-white">{formatDate(profile.created_at)}</p>
        </div>
        <div className="bento card col-span-3 sm:col-span-1 p-5 transition-all animate-slide-up" style={{ animationDelay: '460ms', animationFillMode: 'both' }}>
          <LogIn className="w-4 h-4 text-ember-500 mb-2" />
          <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-400 font-display mb-1">Ostatnie logowanie</p>
          <p className="text-sm font-bold font-mono text-zinc-900 dark:text-white">{formatDate(profile.last_login)}</p>
        </div>
      </div>
    </div>
  );
}
