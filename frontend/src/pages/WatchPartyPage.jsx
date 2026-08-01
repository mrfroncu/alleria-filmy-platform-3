import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Crown, LogOut, ExternalLink, PlayCircle, Trash2, Play, RefreshCw, ShieldOff, UserX } from 'lucide-react';
import { useWatchParty } from '../contexts/WatchPartyContext';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { extractYoutubeId } from '../utils/helpers';
import { useToast } from '../components/ui/Toast';
import SecurePlayer from '../components/SecurePlayer';
import YouTubeCustomPlayer from '../components/YouTubeCustomPlayer';
import YouTubeTrackingPlayer from '../components/YouTubeTrackingPlayer';
import HtmlEmbed from '../components/HtmlEmbed';
import AddToQueuePanel from '../components/AddToQueuePanel';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

function FullScreenState({ icon: Icon, title, subtitle, onHome }) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="text-center">
        <div className="w-16 h-16 rounded-3xl bg-rose-500/10 flex items-center justify-center mx-auto mb-4"><Icon className="w-7 h-7 text-rose-500" /></div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display mb-1">{title}</h1>
        <p className="text-sm text-slate-400 mb-6">{subtitle}</p>
        <Button onClick={onHome}>Wróć do bazy</Button>
      </div>
    </div>
  );
}

export default function WatchPartyPage() {
  const { party, sourceKey, connecting, inParty, disconnectReason, clearDisconnectReason, send, joinParty, leaveParty, endParty, registerSyncCallback } = useWatchParty();
  const { user } = useAuth();
  const { config } = useSettings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const notify = useToast();
  const playerControlRef = useRef(null);
  const joinAttempted = useRef(false);
  const joinCodeParam = searchParams.get('join');

  useEffect(() => {
    if (inParty || connecting || joinAttempted.current) return;
    if (joinCodeParam) { joinAttempted.current = true; joinParty(joinCodeParam.toUpperCase()); }
    else {
      const t = setTimeout(() => { if (!inParty) navigate('/'); }, 1000);
      return () => clearTimeout(t);
    }
  }, [inParty, connecting, joinCodeParam, joinParty, navigate]);

  useEffect(() => {
    registerSyncCallback((data) => {
      const ctrl = playerControlRef.current;
      if (!ctrl) return;
      if (data.type === 'play') ctrl.play?.();
      else if (data.type === 'pause') ctrl.pause?.();
      else if (data.type === 'seek' || data.type === 'sync') {
        ctrl.seek?.(data.position);
        data.playing ? ctrl.play?.() : ctrl.pause?.();
      }
    });
  }, [registerSyncCallback]);

  const isHost = party?.hostId === user?.id;
  const me = party?.members?.find((m) => m.id === user?.id);
  const canControl = !!(isHost || me?.canControl);

  useEffect(() => {
    if (!inParty || canControl) return;
    const iv = setInterval(() => send({ type: 'sync_request' }), 8000);
    return () => clearInterval(iv);
  }, [inParty, canControl, send]);

  if (disconnectReason) {
    return (
      <FullScreenState
        icon={disconnectReason === 'kicked' ? UserX : ShieldOff}
        title={disconnectReason === 'kicked' ? 'Zostałeś wyrzucony' : 'Party zostało zakończone'}
        subtitle={disconnectReason === 'kicked' ? 'Host usunął Cię z tej sesji.' : 'Host zakończył to Watch Party.'}
        onHome={() => { clearDisconnectReason(); navigate('/'); }}
      />
    );
  }

  if (!inParty) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="w-8 h-8 border-[3px] border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentItem = party.queue?.[party.currentIndex];
  const currentSource = currentItem?.sources?.find((s) => s.key === sourceKey) || currentItem?.sources?.[0];
  const isStreamer = currentSource?.type === 'streamer';
  const isPlex = currentSource?.type === 'plex';
  const isHtml = currentSource?.type === 'embed' || currentSource?.type === 'html';
  const youtubeId = currentSource && !isStreamer && !isPlex && !isHtml ? extractYoutubeId(currentSource.url) : null;
  const plainEmbedUrl = currentSource && !isStreamer && !isPlex && !isHtml && !youtubeId ? currentSource.url : null;

  const broadcast = (type, extra = {}) => { if (canControl) send({ type, ...extra }); };
  const manualSync = () => {
    const ctrl = playerControlRef.current;
    if (!ctrl) return;
    send({ type: 'seek', position: ctrl.getCurrentTime?.() ?? party.position ?? 0, playing: party.playing });
    notify('Zsynchronizowano.', 'success');
  };

  return (
    <div className="p-6 sm:p-10">
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="font-mono font-bold text-brand-500 bg-brand-500/10 rounded-xl px-3 py-1.5 text-sm tracking-widest">{party.code}</span>
        <div className="flex -space-x-2">
          {party.members?.map((m) => (
            <div key={m.id} className="relative" title={m.display_name}>
              <Avatar src={m.avatar} name={m.display_name} size="sm" className="!w-8 !h-8 !rounded-full ring-2 ring-white dark:ring-slate-950" />
              {m.id === party.hostId && <Crown className="w-3 h-3 text-amber-400 absolute -top-1 -right-1" />}
            </div>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={manualSync} className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-brand-500"><RefreshCw className="w-3.5 h-3.5" /> Synchronizuj</button>
        {isHost ? (
          <Button size="sm" variant="danger" onClick={endParty}>Zakończ party</Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => { leaveParty(); navigate('/'); }}><LogOut className="w-3.5 h-3.5" /> Opuść</Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div>
          {!currentItem ? (
            <div className="aspect-video rounded-4xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
              <p className="text-slate-400 text-sm">Kolejka jest pusta — dodaj coś z panelu po prawej.</p>
            </div>
          ) : isStreamer ? (
            <SecurePlayer
              streamVideoId={currentItem.stream_video_id} drmEnhanced={currentItem.drm_enhanced} title={currentItem.title}
              controlRef={playerControlRef}
              onPlay={(t) => broadcast('play', { position: t })}
              onPause={(t) => broadcast('pause', { position: t })}
              onSeek={(t) => broadcast('seek', { position: t })}
            />
          ) : isPlex ? (
            <div className="aspect-video rounded-4xl bg-gradient-to-br from-amber-950 to-slate-950 flex flex-col items-center justify-center gap-4 p-8">
              <PlayCircle className="w-14 h-14 text-amber-400" />
              <a href={currentSource.url} target="_blank" rel="noopener noreferrer">
                <Button className="!bg-amber-500 hover:!brightness-110"><ExternalLink className="w-4 h-4" /> Oglądaj w Plex</Button>
              </a>
            </div>
          ) : isHtml ? (
            <div className="aspect-video rounded-4xl overflow-hidden shadow-2xl"><HtmlEmbed html={currentSource.url} /></div>
          ) : youtubeId ? (
            <div className="aspect-video rounded-4xl overflow-hidden shadow-2xl">
              {config.customYoutubePlayer
                ? <YouTubeCustomPlayer videoId={youtubeId} controlRef={playerControlRef} onPlayStateChange={(playing, t) => broadcast(playing ? 'play' : 'pause', { position: t })} />
                : <YouTubeTrackingPlayer videoId={youtubeId} controlRef={playerControlRef} onPlayStateChange={(playing, t) => broadcast(playing ? 'play' : 'pause', { position: t })} />}
            </div>
          ) : plainEmbedUrl ? (
            <div className="aspect-video rounded-4xl overflow-hidden shadow-2xl"><iframe src={plainEmbedUrl} className="w-full h-full border-0" allowFullScreen /></div>
          ) : (
            <div className="aspect-video rounded-4xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center"><p className="text-slate-400 text-sm">Brak źródła.</p></div>
          )}

          {currentItem?.sources?.length > 1 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {currentItem.sources.map((s) => (
                <button key={s.key} onClick={() => broadcast('source_change', { sourceKey: s.key })} disabled={!canControl}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-50 ${sourceKey === s.key ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {currentItem && <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display mt-4">{currentItem.title}</h1>}
          {!canControl && <p className="text-xs text-slate-400 mt-1">Tylko host lub osoby z uprawnieniami mogą sterować odtwarzaniem.</p>}
        </div>

        <div className="space-y-5">
          <Card className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Uczestnicy</h3>
            <div className="space-y-1.5">
              {party.members?.map((m) => (
                <div key={m.id} className="flex items-center gap-2 p-1.5 rounded-xl">
                  <Avatar src={m.avatar} name={m.display_name} size="sm" className="!w-6 !h-6 !rounded-lg" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 flex-1 truncate">{m.display_name}</span>
                  {m.id === party.hostId && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                  {isHost && m.id !== party.hostId && (
                    <>
                      <label className="flex items-center gap-1 text-[10px] text-slate-400">
                        <input type="checkbox" checked={m.canControl} onChange={(e) => send({ type: 'set_control', userId: m.id, canControl: e.target.checked })} /> steruje
                      </label>
                      <button onClick={() => send({ type: 'kick', userId: m.id })} className="p-1 rounded-lg text-slate-300 hover:text-rose-500"><UserX className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Kolejka</h3>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {(!party.queue || party.queue.length === 0) ? (
                <p className="text-xs text-slate-400">Pusto.</p>
              ) : party.queue.map((item, i) => (
                <div key={i} className={`flex items-center gap-2 p-1.5 rounded-xl ${i === party.currentIndex ? 'bg-brand-500/10' : ''}`}>
                  <div className="w-10 aspect-video rounded-lg bg-slate-200 dark:bg-slate-800 overflow-hidden shrink-0">{item.thumbnail && <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />}</div>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 flex-1 truncate">{item.title}</span>
                  {isHost && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      {i !== party.currentIndex && <button onClick={() => send({ type: 'queue_play', index: i })} className="p-1 rounded-lg text-slate-300 hover:text-brand-500"><Play className="w-3 h-3" /></button>}
                      <button onClick={() => send({ type: 'queue_remove', index: i })} className="p-1 rounded-lg text-slate-300 hover:text-rose-500"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Dodaj do kolejki</h3>
            <AddToQueuePanel onAdd={(item) => send({ type: 'queue_add', item })} />
          </Card>
        </div>
      </div>
    </div>
  );
}
