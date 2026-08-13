import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, X, Plus, LogIn, Copy, Check, ExternalLink } from 'lucide-react';
import { useWatchParty } from '../contexts/WatchPartyContext';
import { useAuth } from '../contexts/AuthContext';

export default function WatchPartyTab() {
  const { user } = useAuth();
  const { party, inParty, createParty, joinParty, leaveParty, endParty } = useWatchParty();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState('menu'); // menu | create | join
  const [codeInput, setCodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  if (!user) return null;

  const close = () => { setOpen(false); setError(''); setView('menu'); };

  const handleCreate = async () => {
    setLoading(true); setError('');
    try {
      await createParty();
      close();
      navigate('/watch-party');
    } catch (e) { setError(e.message || 'Błąd tworzenia party'); }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!codeInput.trim()) return;
    setLoading(true); setError('');
    try {
      await joinParty(codeInput.trim().toUpperCase());
      setCodeInput('');
      close();
      navigate('/watch-party');
    } catch (e) { setError(e.message || 'Nie znaleziono party o tym kodzie'); }
    setLoading(false);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(party.code);
    setCopied('code');
    setTimeout(() => setCopied(''), 2000);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/watch-party?join=${party.code}`);
    setCopied('link');
    setTimeout(() => setCopied(''), 2000);
  };

  const isHost = party && user && party.hostId === user.id;

  return (
    <>
      {/* Floating vertical tab on right edge */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-2 px-2.5 py-4 rounded-l-2xl shadow-xl transition-all duration-300 select-none ${
          inParty ? 'bg-violet-600 text-white shadow-violet-500/30' : 'bg-zinc-800 dark:bg-zinc-900 text-zinc-400 hover:text-white shadow-black/30'
        }`}
      >
        <Users className="w-4 h-4 shrink-0" />
        <span className="text-[10px] font-bold tracking-widest" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}>
          WATCH PARTY
        </span>
        {inParty && (
          <span className="text-[10px] bg-white/25 rounded-full w-5 h-5 flex items-center justify-center font-bold shrink-0">
            {party.members.length}
          </span>
        )}
        <span className="text-[9px] font-bold bg-red-600 text-white px-1 py-0.5 rounded shrink-0 leading-none">
          BETA
        </span>
      </button>

      {/* Backdrop */}
      {open && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={close} />}

      {/* Slide-out panel */}
      <div className={`fixed right-0 top-0 h-full w-full max-w-[22rem] sm:w-80 bg-zinc-900 border-l border-zinc-800 z-50 shadow-2xl flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-violet-400" />
            <span className="font-bold text-white text-sm">Watch Party</span>
          </div>
          <button onClick={close} className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!inParty ? (
            view === 'menu' ? (
              <>
                <button
                  onClick={() => setView('create')}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 transition-all text-left"
                >
                  <Plus className="w-5 h-5 shrink-0" />
                  <div>
                    <div className="font-bold text-sm">Utwórz party</div>
                    <div className="text-xs opacity-60 mt-0.5">Zaproś innych kodem</div>
                  </div>
                </button>
                <button
                  onClick={() => setView('join')}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700/80 transition-all text-left"
                >
                  <LogIn className="w-5 h-5 shrink-0" />
                  <div>
                    <div className="font-bold text-sm">Dołącz do party</div>
                    <div className="text-xs opacity-60 mt-0.5">Wpisz kod zaproszenia</div>
                  </div>
                </button>
              </>
            ) : view === 'create' ? (
              <div className="space-y-4">
                <button onClick={() => { setView('menu'); setError(''); }} className="text-zinc-400 hover:text-white text-sm transition-colors flex items-center gap-1">← Wróć</button>
                <div className="p-4 bg-zinc-800 rounded-2xl space-y-3">
                  <p className="text-sm text-zinc-400">Zostaniesz hostem party. Inni dołączą za pomocą kodu zaproszenia.</p>
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  <button onClick={handleCreate} disabled={loading} className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 text-sm">
                    {loading ? 'Tworzenie...' : 'Utwórz party'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <button onClick={() => { setView('menu'); setError(''); }} className="text-zinc-400 hover:text-white text-sm transition-colors flex items-center gap-1">← Wróć</button>
                <div className="p-4 bg-zinc-800 rounded-2xl space-y-3">
                  <input
                    value={codeInput}
                    onChange={e => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="ABCDEF"
                    maxLength={6}
                    className="w-full bg-zinc-700 border border-zinc-600 text-white font-mono text-2xl text-center py-3 px-4 rounded-xl tracking-[0.4em] focus:outline-none focus:border-violet-500 transition-colors"
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  />
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  <button onClick={handleJoin} disabled={loading || codeInput.length < 6} className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 text-sm">
                    {loading ? 'Dołączanie...' : 'Dołącz'}
                  </button>
                </div>
              </div>
            )
          ) : (
            <>
              {/* Invite code */}
              <div className="p-4 bg-zinc-800 rounded-2xl space-y-2">
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Kod zaproszenia</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-2xl font-bold text-white tracking-[0.3em] flex-1">{party.code}</span>
                  <button onClick={copyCode} title="Kopiuj kod" className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-all">
                    {copied === 'code' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <button onClick={copyLink} className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors">
                  <ExternalLink className="w-3 h-3" />
                  {copied === 'link' ? 'Skopiowano!' : 'Kopiuj link zaproszenia'}
                </button>
              </div>

              {/* Members */}
              <div className="p-4 bg-zinc-800 rounded-2xl space-y-2">
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Uczestnicy ({party.members.length})</div>
                {party.members.map(m => (
                  <div key={m.id} className="flex items-center gap-2.5">
                    <img src={m.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.display_name || 'U')}&background=6366f1&color=fff&size=40`} className="w-7 h-7 rounded-lg object-cover shrink-0" alt="" />
                    <span className="text-sm text-white flex-1 truncate">{m.display_name}</span>
                    {m.id === party.hostId && <span className="text-[9px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded font-bold">HOST</span>}
                    {m.canControl && m.id !== party.hostId && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">ctrl</span>}
                  </div>
                ))}
              </div>

              {/* Go to party page */}
              <button onClick={() => { navigate('/watch-party'); close(); }} className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-all text-sm">
                Otwórz Watch Party
              </button>

              {isHost ? (
                <button onClick={async () => { await endParty(); close(); }} className="w-full py-2.5 text-red-400 hover:bg-red-500/10 rounded-xl transition-all text-sm font-semibold">
                  Zakończ party
                </button>
              ) : (
                <button onClick={() => { leaveParty(); close(); }} className="w-full py-2.5 text-zinc-400 hover:bg-zinc-800 rounded-xl transition-all text-sm font-semibold">
                  Opuść party
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
