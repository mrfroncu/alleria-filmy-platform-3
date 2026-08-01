import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Users, X, Copy, LogOut, DoorOpen, Crown } from 'lucide-react';
import { useWatchParty } from '../contexts/WatchPartyContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Avatar from '../components/ui/Avatar';

export default function WatchPartyTab() {
  const { party, inParty, createParty, joinParty, leaveParty, endParty } = useWatchParty();
  const { user } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);

  if (location.pathname === '/login') return null;
  const isHost = party?.hostId === user?.id;

  const create = async () => {
    setBusy(true);
    try {
      const code = await createParty();
      setOpen(false);
      navigate('/watch-party');
    } catch (e) { notify(e.message, 'error'); }
    setBusy(false);
  };

  const join = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    try {
      joinParty(joinCode.trim().toUpperCase());
      setOpen(false);
      navigate('/watch-party');
    } catch (e) { notify(e.message, 'error'); }
    setBusy(false);
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/watch-party?join=${party.code}`);
    notify('Link skopiowany.', 'success');
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`fixed right-0 top-1/2 -translate-y-1/2 z-40 flex items-center gap-1.5 px-2.5 py-4 rounded-l-2xl shadow-lg transition-colors [writing-mode:vertical-rl] text-xs font-bold tracking-wider ${
          inParty ? 'bg-gradient-to-b from-brand-500 to-teal-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300'
        }`}
      >
        <Users className="w-4 h-4 [writing-mode:horizontal-tb]" /> WATCH PARTY
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div
              initial={{ x: 320 }} animate={{ x: 0 }} exit={{ x: 320 }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              className="fixed right-0 top-0 z-50 h-full w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-white/10 shadow-2xl p-5"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-slate-900 dark:text-white font-display flex items-center gap-2"><Users className="w-4.5 h-4.5 text-brand-500" /> Watch Party</h3>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
              </div>

              {!inParty ? (
                <div className="space-y-4">
                  <Button className="w-full" onClick={create} disabled={busy}>Utwórz nowe party</Button>
                  <div className="flex items-center gap-2 text-xs text-slate-400"><div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />lub<div className="flex-1 h-px bg-slate-200 dark:bg-white/10" /></div>
                  <div className="flex gap-2">
                    <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="KOD" className="font-mono tracking-widest text-center" maxLength={8} />
                    <Button variant="secondary" onClick={join} disabled={busy}>Dołącz</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-mono text-lg font-bold tracking-widest text-brand-500 bg-brand-500/10 rounded-2xl px-4 py-2.5 text-center">{party.code}</span>
                    <button onClick={copyLink} className="p-2.5 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-500 hover:text-brand-500"><Copy className="w-4 h-4" /></button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {party.members?.map((m) => (
                      <div key={m.id} className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/5">
                        <Avatar src={m.avatar} name={m.display_name} size="sm" className="!w-6 !h-6 !rounded-full" />
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{m.display_name}</span>
                        {m.id === party.hostId && <Crown className="w-3 h-3 text-amber-400" />}
                      </div>
                    ))}
                  </div>
                  {location.pathname !== '/watch-party' && (
                    <Button className="w-full" onClick={() => { navigate('/watch-party'); setOpen(false); }}><DoorOpen className="w-4 h-4" /> Przejdź do party</Button>
                  )}
                  {isHost ? (
                    <Button variant="danger" className="w-full" onClick={endParty}>Zakończ party</Button>
                  ) : (
                    <Button variant="secondary" className="w-full" onClick={leaveParty}><LogOut className="w-4 h-4" /> Opuść party</Button>
                  )}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
