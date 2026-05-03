import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users, Crown, X, Play, SkipForward, Trash2, Plus, Search, Film,
  ChevronRight, Settings2, AlertTriangle, Loader2, Shield
} from 'lucide-react';
import { useWatchParty } from '../contexts/WatchPartyContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import SecurePlayer from '../components/SecurePlayer';
import { youtubeToEmbed, extractYoutubeId } from '../utils/helpers';

// Blob iframe for HTML embed sources (same as VideoPage)
function HtmlEmbed({ html }) {
  const [blobUrl, setBlobUrl] = useState(null);
  useEffect(() => {
    if (!html) return;
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center}</style></head><body>${html}</body></html>`;
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [html]);
  if (!blobUrl) return null;
  return <iframe src={blobUrl} className="w-full h-full border-0" allowFullScreen />;
}

// YouTube IFrame API — polling approach works even if API was already loaded by another page/module
function loadYtApi() {
  return new Promise(resolve => {
    if (window.YT?.Player) return resolve();
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    const iv = setInterval(() => {
      if (window.YT?.Player) { clearInterval(iv); resolve(); }
    }, 50);
  });
}

function WatchPartyYouTubePlayer({ videoId, controlRef, onPlay, onPause, onSeek, canControl }) {
  // React owns only this wrapper — YT owns the inner div it creates
  const wrapperRef = useRef(null);

  const playerRef = useRef(null);
  const syncingRef = useRef(false);
  const playingRef = useRef(false);
  const expectedTimeRef = useRef(0);
  const lastCheckRef = useRef(Date.now());
  const desiredPlayingRef = useRef(false); // what the server wants (play/pause state)
  const canControlRef = useRef(canControl);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onSeekRef = useRef(onSeek);

  useEffect(() => { onPlayRef.current = onPlay; }, [onPlay]);
  useEffect(() => { onPauseRef.current = onPause; }, [onPause]);
  useEffect(() => { onSeekRef.current = onSeek; }, [onSeek]);
  useEffect(() => { canControlRef.current = canControl; }, [canControl]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let destroyed = false;
    let player = null;
    let pollId = null;

    const playerDiv = document.createElement('div');
    wrapper.appendChild(playerDiv);

    const snapToExpected = () => {
      if (!playerRef.current || syncingRef.current) return;
      syncingRef.current = true;
      // Account for time elapsed since the ref was last updated — avoids snapping to stale position
      const elapsed = (Date.now() - lastCheckRef.current) / 1000;
      const target = expectedTimeRef.current + (desiredPlayingRef.current ? elapsed : 0);
      playerRef.current.seekTo(target, true);
      expectedTimeRef.current = target;
      lastCheckRef.current = Date.now();
      if (desiredPlayingRef.current) playerRef.current.playVideo();
      else playerRef.current.pauseVideo();
      setTimeout(() => { syncingRef.current = false; }, 1500);
    };

    const stopPoll = () => { clearInterval(pollId); pollId = null; };
    const startPoll = () => {
      stopPoll();
      pollId = setInterval(() => {
        if (!playerRef.current || !playingRef.current || syncingRef.current) return;
        const now = Date.now();
        const elapsed = (now - lastCheckRef.current) / 1000;
        const expected = expectedTimeRef.current + elapsed;
        const actual = playerRef.current.getCurrentTime();
        if (Math.abs(actual - expected) > 2.5) {
          if (canControlRef.current) {
            // Control member: report drift to server
            expectedTimeRef.current = actual;
            lastCheckRef.current = now;
            onSeekRef.current?.(actual);
          } else {
            // Non-control member: snap back to expected position
            expectedTimeRef.current = expected;
            lastCheckRef.current = now;
            snapToExpected();
          }
        } else {
          expectedTimeRef.current = actual;
          lastCheckRef.current = now;
        }
      }, 1000);
    };

    loadYtApi().then(() => {
      if (destroyed) return;
      player = new window.YT.Player(playerDiv, {
        videoId,
        playerVars: { rel: 0, enablejsapi: 1, origin: window.location.origin },
        events: {
          onReady: (e) => {
            if (!destroyed) {
              playerRef.current = player;
              const iframe = e.target.getIframe();
              iframe.style.cssText = 'width:100%;height:100%;display:block;';
            }
          },
          onStateChange: (e) => {
            if (destroyed) return;
            const state = e.data;
            if (state === window.YT.PlayerState.PLAYING) {
              playingRef.current = true;
              // When syncing: just ensure poll is running, skip user-action handling
              if (syncingRef.current) { startPoll(); return; }
              const t = player.getCurrentTime();
              if (canControlRef.current) {
                expectedTimeRef.current = t;
                lastCheckRef.current = Date.now();
                onPlayRef.current?.(t);
                startPoll();
              } else {
                if (!desiredPlayingRef.current) {
                  snapToExpected();
                } else {
                  const serverExpected = expectedTimeRef.current + (Date.now() - lastCheckRef.current) / 1000;
                  if (Math.abs(t - serverExpected) > 3) {
                    snapToExpected();
                  } else {
                    expectedTimeRef.current = t;
                    lastCheckRef.current = Date.now();
                    startPoll();
                  }
                }
              }
            } else if (state === window.YT.PlayerState.PAUSED) {
              // Always stop poll and mark as not playing — regardless of syncing state
              stopPoll();
              playingRef.current = false;
              if (syncingRef.current) return;
              const t = player.getCurrentTime();
              if (canControlRef.current) {
                onPauseRef.current?.(t);
              } else {
                if (desiredPlayingRef.current) {
                  snapToExpected();
                }
              }
            } else if (state === window.YT.PlayerState.ENDED) {
              stopPoll();
              playingRef.current = false;
            }
          },
        },
      });
    });

    return () => {
      destroyed = true;
      stopPoll();
      playerRef.current = null;
      try { player?.destroy(); } catch (_) {}
      try { if (wrapper.firstChild) wrapper.innerHTML = ''; } catch (_) {}
    };
  }, [videoId]);

  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      seek: (t) => {
        if (!playerRef.current) return;
        syncingRef.current = true;
        playerRef.current.seekTo(t, true);
        expectedTimeRef.current = t;
        lastCheckRef.current = Date.now();
        setTimeout(() => { syncingRef.current = false; }, 1500);
      },
      play: () => {
        if (!playerRef.current) return;
        desiredPlayingRef.current = true;
        syncingRef.current = true;
        expectedTimeRef.current = playerRef.current.getCurrentTime();
        lastCheckRef.current = Date.now();
        playerRef.current.playVideo();
        setTimeout(() => { syncingRef.current = false; }, 1500);
      },
      pause: () => {
        if (!playerRef.current) return;
        desiredPlayingRef.current = false;
        syncingRef.current = true;
        playerRef.current.pauseVideo();
        setTimeout(() => { syncingRef.current = false; }, 1500);
      },
      getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
    };
  });

  return <div ref={wrapperRef} className="w-full h-full" />;
}

// Build source list from a video object (same logic as VideoPage)
function buildSources(video) {
  return [
    { key: 'main', label: video.main_source_title || 'Główne źródło', url: video.main_source, type: video.main_source_type },
    ...(video.mirror1_url ? [{ key: 'mirror1', label: video.mirror1_name || 'Mirror 1', url: video.mirror1_url, type: video.mirror1_type || 'link' }] : []),
    ...(video.mirror2_url ? [{ key: 'mirror2', label: video.mirror2_name || 'Mirror 2', url: video.mirror2_url, type: video.mirror2_type || 'link' }] : []),
    ...(video.mirror3_url ? [{ key: 'mirror3', label: video.mirror3_name || 'Mirror 3', url: video.mirror3_url, type: video.mirror3_type || 'link' }] : []),
    ...(video.mirror4_url ? [{ key: 'mirror4', label: video.mirror4_name || 'Mirror 4', url: video.mirror4_url, type: video.mirror4_type || 'link' }] : []),
    ...(video.mirror5_url ? [{ key: 'mirror5', label: video.mirror5_name || 'Mirror 5', url: video.mirror5_url, type: video.mirror5_type || 'link' }] : []),
  ];
}

export default function WatchPartyPage() {
  const { user } = useAuth();
  const { party, inParty, connecting, disconnectReason, clearDisconnectReason, send, joinParty, leaveParty, endParty, registerSyncCallback } = useWatchParty();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Player sync
  const playerControlRef = useRef(null);
  const canControl = party?.members?.find(m => m.id === user?.id)?.canControl ?? false;
  const isHost = party?.hostId === user?.id;

  // Film browser
  const [showBrowser, setShowBrowser] = useState(false);
  const [videos, setVideos] = useState([]);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState([]);
  const [filterCat, setFilterCat] = useState('');
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [addingVideo, setAddingVideo] = useState(null); // video being configured for queue
  const [addSourceKey, setAddSourceKey] = useState('main');
  const [accessWarnings, setAccessWarnings] = useState({}); // videoId → [memberNames]
  const [ytUrl, setYtUrl] = useState('');
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState('');

  // Auto-join: from invite link, or restore previous session after page refresh
  const joinAttemptedRef = useRef(false);
  useEffect(() => {
    if (inParty || disconnectReason) return;
    if (connecting) return;

    const joinCode = searchParams.get('join') || sessionStorage.getItem('watchPartyCode');
    if (joinCode && !joinAttemptedRef.current) {
      joinAttemptedRef.current = true;
      joinParty(joinCode).catch(() => {
        sessionStorage.removeItem('watchPartyCode');
        navigate('/');
      });
    } else if (!joinCode) {
      navigate('/');
    }
  }, [inParty, connecting, disconnectReason]);

  // Register direct sync callback — bypasses React render cycle for immediate video control
  useEffect(() => {
    registerSyncCallback((action) => {
      const ctrl = playerControlRef.current;
      if (!ctrl) return;
      if (action.type === 'play') {
        // No seek — just resume. Seeking here causes echo-bounce stutter for the
        // control member who pressed play (server echo arrives ~100ms late).
        ctrl.play();
      } else if (action.type === 'pause') {
        ctrl.seek(action.position);
        ctrl.pause();
      } else if (action.type === 'seek' || action.type === 'sync') {
        if (action.type === 'sync') {
          // Periodic sync: only snap if drift exceeds 3s tolerance
          const current = ctrl.getCurrentTime?.() ?? 0;
          if (Math.abs(current - action.position) <= 3) {
            if (action.playing) ctrl.play(); else ctrl.pause();
            return;
          }
        }
        ctrl.seek(action.position);
        if (action.playing) ctrl.play(); else ctrl.pause();
      }
    });
    return () => registerSyncCallback(null);
  }, [registerSyncCallback]);

  // Periodic drift correction (every 15s)
  useEffect(() => {
    if (!inParty) return;
    const interval = setInterval(() => send({ type: 'sync_request' }), 15000);
    return () => clearInterval(interval);
  }, [inParty, send]);

  const handleSourceChange = useCallback((sourceKey) => {
    if (!canControl) return;
    send({ type: 'source_change', sourceKey });
  }, [canControl, send]);

  // Load film browser
  useEffect(() => {
    if (!showBrowser) return;
    setLoadingVideos(true);
    Promise.all([
      api.getVideos({ search, category: filterCat }),
      api.getCategories(),
    ]).then(([vids, cats]) => {
      setVideos(vids);
      setCategories(cats);
      computeAccessWarnings(vids);
    }).catch(() => {}).finally(() => setLoadingVideos(false));
  }, [showBrowser, search, filterCat]);

  // Check which party members don't have access to each video's category
  const computeAccessWarnings = async (vids) => {
    if (!party) return;
    // Simple heuristic: if members have different roles, some may lack category access
    // We fetch the video's category access and compare with member discord roles
    // For simplicity, we just show a generic note rather than deep role checking
    // TODO: could be enhanced with actual role matching
    setAccessWarnings({});
  };

  const handleAddYoutube = async () => {
    const videoId = extractYoutubeId(ytUrl.trim());
    if (!videoId) { setYtError('Nieprawidłowy link YouTube'); return; }
    setYtLoading(true); setYtError('');
    try {
      let title = `YouTube: ${videoId}`;
      try {
        const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        if (r.ok) { const d = await r.json(); if (d.title) title = d.title; }
      } catch (_) {}
      const item = {
        videoId: `yt-${videoId}`,
        sourceKey: 'main',
        title,
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        stream_video_id: null,
        stream_status: null,
        drm_enhanced: false,
        sources: [{ key: 'main', label: 'YouTube', url: `https://www.youtube.com/watch?v=${videoId}`, type: 'link' }],
      };
      send({ type: 'queue_add', item });
      setYtUrl('');
      setShowBrowser(false);
    } catch (_) { setYtError('Nie udało się dodać filmiku'); }
    setYtLoading(false);
  };

  const handleAddToQueue = (video, sourceKey) => {
    if (!canControl) return;
    const sources = buildSources(video);
    const src = sources.find(s => s.key === sourceKey) || sources[0];
    const item = {
      videoId: video.id,
      sourceKey: src.key,
      title: video.title,
      thumbnail: video.thumbnail,
      // Main HLS stream (transcoded) — separate from source URL
      stream_video_id: video.stream_video_id || null,
      stream_status: video.stream_status || null,
      drm_enhanced: video.drm_enhanced,
      sources,
    };
    send({ type: 'queue_add', item });
    setAddingVideo(null);
    setShowBrowser(false);
  };

  if (disconnectReason) {
    const isKicked = disconnectReason === 'kicked';
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4 max-w-sm px-6">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${isKicked ? 'bg-red-500/15' : 'bg-zinc-800'}`}>
            <Users className={`w-7 h-7 ${isKicked ? 'text-red-400' : 'text-zinc-500'}`} />
          </div>
          <div className="space-y-1.5">
            <p className="text-white font-bold text-lg">
              {isKicked ? 'Zostałeś wyrzucony z party' : 'Party zostało zakończone'}
            </p>
            <p className="text-zinc-500 text-sm">
              {isKicked ? 'Host usunął Cię z tego Watch Party.' : 'Host zakończył to Watch Party.'}
            </p>
          </div>
          <button
            onClick={() => { clearDisconnectReason(); navigate('/'); }}
            className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-all text-sm"
          >
            Wróć do strony głównej
          </button>
        </div>
      </div>
    );
  }

  if (!inParty || !party) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin mx-auto" />
          <p className="text-zinc-400 text-sm">Łączenie z party...</p>
        </div>
      </div>
    );
  }

  const currentItem = party.currentIndex >= 0 ? party.queue[party.currentIndex] : null;
  const currentSourceKey = currentItem?.sourceKey || 'main';
  const currentSrc = currentItem?.sources?.find(s => s.key === currentSourceKey) || null;

  // For main source: prefer the transcoded HLS stream if available
  const useMainHls = currentSourceKey === 'main' && currentItem?.stream_video_id && currentItem?.stream_status === 'ready';
  const isMirrorStreamer = !useMainHls && currentSrc?.type === 'streamer';
  const isStreamer = useMainHls || isMirrorStreamer;
  // Derive the actual streamVideoId from the current source
  const activeStreamVideoId = useMainHls
    ? currentItem.stream_video_id
    : isMirrorStreamer
      ? currentSrc?.url?.replace('self-hosted:', '')
      : null;

  const isHtml = currentSrc?.type === 'embed' || currentSrc?.type === 'html';
  const youtubeId = (!isStreamer && !isHtml && currentSrc?.type !== 'plex') ? extractYoutubeId(currentSrc?.url || '') : null;
  const embedUrl = (isStreamer || isHtml || currentSrc?.type === 'plex' || youtubeId) ? null : currentSrc ? youtubeToEmbed(currentSrc.url) : null;

  return (
    <div className="flex h-full bg-zinc-950">
      {/* Main content: player + queue browser */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
          <Users className="w-4 h-4 text-violet-400" />
          <span className="font-bold text-white text-sm">Watch Party</span>
          <span className="font-mono text-[11px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded tracking-widest">{party.code}</span>
          <div className="flex -space-x-1.5 ml-1">
            {party.members.slice(0, 5).map(m => (
              <img key={m.id} src={m.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.display_name || 'U')}&background=6366f1&color=fff&size=32`} className="w-6 h-6 rounded-lg border border-zinc-900 object-cover" title={m.display_name} alt="" />
            ))}
            {party.members.length > 5 && <span className="w-6 h-6 rounded-lg bg-zinc-700 text-[9px] text-zinc-400 flex items-center justify-center border border-zinc-900">+{party.members.length - 5}</span>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isHost ? (
              <button onClick={async () => { await endParty(); navigate('/'); }} className="text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-all font-semibold">
                Zakończ party
              </button>
            ) : (
              <button onClick={() => { leaveParty(); navigate('/'); }} className="text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-800 px-3 py-1.5 rounded-lg transition-all font-semibold">
                Opuść party
              </button>
            )}
          </div>
        </div>

        {/* Player */}
        <div className="flex-1 bg-black flex items-center justify-center min-h-0">
          {!currentItem ? (
            <div className="text-center space-y-3">
              <Film className="w-12 h-12 text-zinc-700 mx-auto" />
              <p className="text-zinc-500 text-sm">Brak filmów w kolejce.</p>
              {canControl && (
                <button onClick={() => setShowBrowser(true)} className="text-violet-400 hover:text-violet-300 text-sm font-semibold transition-colors">
                  + Dodaj film
                </button>
              )}
            </div>
          ) : isStreamer && activeStreamVideoId ? (
            <div className="w-full h-full">
              <SecurePlayer
                key={`${currentItem.videoId}-${currentSourceKey}`}
                streamVideoId={activeStreamVideoId}
                drmEnhanced={currentItem.drm_enhanced}
                title={currentItem.title}
                controlRef={playerControlRef}
                onPlay={canControl ? (pos) => send({ type: 'play', position: pos }) : undefined}
                onPause={canControl ? (pos) => send({ type: 'pause', position: pos }) : undefined}
                onSeek={canControl ? (pos) => send({ type: 'seek', position: pos }) : undefined}
              />
            </div>
          ) : youtubeId ? (
            <div className="w-full h-full">
              <WatchPartyYouTubePlayer
                key={`${currentItem.videoId}-${currentSourceKey}`}
                videoId={youtubeId}
                controlRef={playerControlRef}
                canControl={canControl}
                onPlay={canControl ? (pos) => send({ type: 'play', position: pos }) : undefined}
                onPause={canControl ? (pos) => send({ type: 'pause', position: pos }) : undefined}
                onSeek={canControl ? (pos) => send({ type: 'seek', position: pos }) : undefined}
              />
            </div>
          ) : embedUrl ? (
            <div className="w-full h-full">
              <iframe src={embedUrl} className="w-full h-full border-0" allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
            </div>
          ) : isHtml && currentSrc?.url ? (
            <div className="w-full h-full"><HtmlEmbed html={currentSrc.url} /></div>
          ) : currentSrc?.type === 'plex' ? (
            <div className="text-center space-y-3">
              <p className="text-zinc-400 text-sm">Źródło Plex — otwórz w Plex, aby oglądać.</p>
              <a href={currentSrc.url} target="_blank" rel="noopener noreferrer" className="inline-block px-4 py-2 bg-amber-400 text-zinc-900 font-bold rounded-xl text-sm hover:bg-amber-300 transition-all">
                Otwórz w Plex
              </a>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">Brak obsługiwanego źródła.</p>
          )}
        </div>

        {/* Source tabs + now playing */}
        {currentItem && (
          <div className="shrink-0 border-t border-zinc-800 px-4 py-3 bg-zinc-950">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-zinc-400 font-medium truncate max-w-[200px]">{currentItem.title}</span>
              {currentItem.sources && currentItem.sources.length > 1 && (
                <div className="flex gap-1 ml-auto flex-wrap">
                  {currentItem.sources.map(s => (
                    <button
                      key={s.key}
                      onClick={() => handleSourceChange(s.key)}
                      disabled={!canControl}
                      title={canControl ? s.label : 'Tylko host lub osoby z uprawnieniami mogą zmieniać źródło'}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        s.key === currentSourceKey
                          ? 'bg-violet-600 text-white'
                          : canControl
                          ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white cursor-pointer'
                          : 'bg-zinc-800 text-zinc-600 cursor-not-allowed opacity-50'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right panel: participants + queue + add */}
      <div className="w-72 border-l border-zinc-800 flex flex-col bg-zinc-900 shrink-0">
        {/* Participants */}
        <div className="border-b border-zinc-800 p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Uczestnicy ({party.members.length})</div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {party.members.map(m => (
              <div key={m.id} className="flex items-center gap-2">
                <img src={m.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.display_name || 'U')}&background=6366f1&color=fff&size=32`} className="w-6 h-6 rounded-lg object-cover shrink-0" alt="" />
                <span className="text-xs text-white flex-1 truncate">{m.display_name}</span>
                {m.id === party.hostId && <Crown className="w-3 h-3 text-amber-400 shrink-0" title="Host" />}
                {isHost && m.id !== user?.id && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <label
                      className="flex items-center gap-1 cursor-pointer group/ctrl"
                      title="Zezwól temu użytkownikowi na sterowanie odtwarzaczem i kolejką"
                    >
                      <input
                        type="checkbox"
                        checked={m.canControl}
                        onChange={e => send({ type: 'set_control', userId: m.id, canControl: e.target.checked })}
                        className="w-3 h-3 accent-violet-500 cursor-pointer"
                      />
                      <span className="text-[9px] text-zinc-500 group-hover/ctrl:text-zinc-300 transition-colors select-none">Sterowanie</span>
                    </label>
                    <button
                      onClick={() => send({ type: 'kick', userId: m.id })}
                      className="p-0.5 text-zinc-600 hover:text-red-400 transition-colors"
                      title="Wyrzuć z party"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Queue */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Kolejka ({party.queue.length})</div>
            {canControl && (
              <button onClick={() => setShowBrowser(true)} className="flex items-center gap-1 text-violet-400 hover:text-violet-300 text-[11px] font-semibold transition-colors">
                <Plus className="w-3 h-3" /> Dodaj
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {party.queue.length === 0 ? (
              <div className="p-4 text-center text-zinc-600 text-xs">Kolejka jest pusta</div>
            ) : (
              party.queue.map((item, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-3 py-2 border-b border-zinc-800/60 group hover:bg-zinc-800/50 transition-all ${i === party.currentIndex ? 'bg-violet-500/10 border-l-2 border-l-violet-500' : ''}`}
                >
                  {item.thumbnail ? (
                    <img src={item.thumbnail} className="w-10 h-7 object-cover rounded shrink-0" alt="" />
                  ) : (
                    <div className="w-10 h-7 bg-zinc-800 rounded shrink-0 flex items-center justify-center">
                      <Film className="w-3 h-3 text-zinc-600" />
                    </div>
                  )}
                  <span className="text-xs text-white flex-1 truncate leading-tight">{item.title}</span>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isHost && i !== party.currentIndex && (
                      <button onClick={() => send({ type: 'queue_play', index: i })} className="p-1 text-zinc-400 hover:text-violet-400 transition-colors" title="Odtwórz">
                        <Play className="w-3 h-3" />
                      </button>
                    )}
                    {isHost && (
                      <button onClick={() => send({ type: 'queue_remove', index: i })} className="p-1 text-zinc-400 hover:text-red-400 transition-colors" title="Usuń">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {i === party.currentIndex && <span className="text-[9px] text-violet-400 font-bold shrink-0">▶</span>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Film browser overlay */}
      {showBrowser && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowBrowser(false); setAddingVideo(null); }} />
          <div className="relative z-10 ml-auto w-full max-w-2xl bg-zinc-900 border-l border-zinc-800 flex flex-col h-full shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <span className="font-bold text-white">Dodaj film do kolejki</span>
              <button onClick={() => { setShowBrowser(false); setAddingVideo(null); }} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Source picker for selected video */}
            {addingVideo ? (
              <div className="flex-1 p-5 space-y-4">
                <div className="flex items-center gap-3">
                  {addingVideo.thumbnail && <img src={addingVideo.thumbnail} className="w-16 h-11 object-cover rounded-lg" alt="" />}
                  <div>
                    <p className="font-bold text-white text-sm">{addingVideo.title}</p>
                    <p className="text-xs text-zinc-400">Wybierz źródło</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {buildSources(addingVideo).map(s => (
                    <label key={s.key} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${addSourceKey === s.key ? 'border-violet-500 bg-violet-500/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'}`}>
                      <input type="radio" name="source" value={s.key} checked={addSourceKey === s.key} onChange={() => setAddSourceKey(s.key)} className="accent-violet-500" />
                      <span className="text-sm text-white font-medium">{s.label}</span>
                      <span className="text-xs text-zinc-500 ml-auto">{s.type}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setAddingVideo(null)} className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-semibold transition-all">Wróć</button>
                  <button onClick={() => handleAddToQueue(addingVideo, addSourceKey)} className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-bold transition-all">Dodaj do kolejki</button>
                </div>
              </div>
            ) : (
              <>
                {/* YouTube URL quick-add */}
                <div className="px-4 py-3 border-b border-zinc-800 shrink-0 bg-zinc-800/50">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Dodaj z YouTube</p>
                  <div className="flex gap-2">
                    <input
                      value={ytUrl}
                      onChange={e => { setYtUrl(e.target.value); setYtError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleAddYoutube()}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="flex-1 bg-zinc-700 border border-zinc-600 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-violet-500 transition-colors placeholder:text-zinc-500"
                    />
                    <button
                      onClick={handleAddYoutube}
                      disabled={ytLoading || !ytUrl.trim()}
                      className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 shrink-0"
                    >
                      {ytLoading ? '...' : '+ Dodaj'}
                    </button>
                  </div>
                  {ytError && <p className="text-red-400 text-[11px] mt-1">{ytError}</p>}
                </div>

                {/* Filters */}
                <div className="px-4 py-3 border-b border-zinc-800 flex gap-2 shrink-0">
                  <div className="flex-1 relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Szukaj filmów..."
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm pl-8 pr-3 py-2 rounded-xl focus:outline-none focus:border-violet-500 transition-colors"
                    />
                  </div>
                  <select
                    value={filterCat}
                    onChange={e => setFilterCat(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-violet-500 transition-colors"
                  >
                    <option value="">Wszystkie kategorie</option>
                    {categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
                  </select>
                </div>

                {/* Video list */}
                <div className="flex-1 overflow-y-auto">
                  {loadingVideos ? (
                    <div className="flex items-center justify-center h-32">
                      <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
                    </div>
                  ) : videos.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 text-sm">Brak filmów</div>
                  ) : (
                    videos.map(video => {
                      const warning = accessWarnings[video.id];
                      return (
                        <button
                          key={video.id}
                          onClick={() => { setAddingVideo(video); setAddSourceKey('main'); }}
                          className="w-full flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 hover:bg-zinc-800/50 transition-all text-left group"
                        >
                          {video.thumbnail ? (
                            <img src={video.thumbnail} className="w-14 h-9 object-cover rounded-lg shrink-0" alt="" />
                          ) : (
                            <div className="w-14 h-9 bg-zinc-800 rounded-lg shrink-0 flex items-center justify-center">
                              <Film className="w-4 h-4 text-zinc-600" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium truncate">{video.title}</p>
                            <p className="text-xs text-zinc-500 truncate">{video.author_display_name || video.author_name}</p>
                            {warning && (
                              <p className="text-[10px] text-amber-400 flex items-center gap-1 mt-0.5">
                                <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                {warning.join(', ')} nie ma dostępu
                              </p>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-violet-400 transition-colors shrink-0" />
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
