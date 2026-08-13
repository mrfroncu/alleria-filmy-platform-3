import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowLeft, Heart, Pencil, MessageCircle, Send, Trash2, Reply, Check, X, AlertTriangle, Play, Pause, Volume1, Volume2, VolumeX, Maximize, RotateCcw, RotateCw, SmilePlus, Flag, BarChart3 } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate, youtubeToEmbed, extractYoutubeId } from '../utils/helpers';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import SecurePlayer from '../components/SecurePlayer';
import VideoModal from '../components/VideoModal';

function Portal({ children }) { return ReactDOM.createPortal(children, document.body); }

// Blob URL iframe — creates a local blob:// URL from HTML string
// This is the ONLY reliable way to render arbitrary HTML with inline JS handlers
// doc.write() fails behind Cloudflare, srcDoc gets escaped by React, dangerouslySetInnerHTML strips JS
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
  return <iframe src={blobUrl} className="w-full h-full border-0" sandbox="allow-forms" allowFullScreen />;
}

// YouTube IFrame API loader — robust polling, works even if API already loaded by another module
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

const DOUBLE_TAP_MS = 300;
const EDGE_ZONE = 0.35;

// A real seek is near-instant; normal 1x playback between two polls never drifts this far from
// "elapsed wall-clock time" — used to infer seeks from polled currentTime, since the YouTube
// IFrame API has no seek event of its own (native controls, our own custom bar, and double-tap
// skip all end up going through this same detector uniformly).
const YT_SEEK_JUMP_THRESHOLD_S = 1.5;

// YouTube player with progress tracking — React owns wrapper div only, YT owns inner element
function YouTubeTrackingPlayer({ videoId, onTimeUpdate, onPlay, onPause, onSeek, controlRef }) {
  const wrapperRef = useRef(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);
  const onPlayRef = useRef(onPlay);
  useEffect(() => { onPlayRef.current = onPlay; }, [onPlay]);
  const onPauseRef = useRef(onPause);
  useEffect(() => { onPauseRef.current = onPause; }, [onPause]);
  const onSeekRef = useRef(onSeek);
  useEffect(() => { onSeekRef.current = onSeek; }, [onSeek]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !videoId) return;
    let destroyed = false, player = null, pollId = null, lastPollTime = null, lastCt = null;

    const reportTime = () => {
      if (!player) return;
      const ct = player.getCurrentTime?.() ?? 0;
      const dur = player.getDuration?.() ?? 0;

      // Fires BEFORE onTimeUpdate below: the seek handler reads "from position" off a ref that
      // onTimeUpdate keeps fresh, so it must still hold last tick's value when this runs.
      const now = Date.now();
      if (lastPollTime != null) {
        const expected = lastCt + (now - lastPollTime) / 1000;
        if (Math.abs(ct - expected) > YT_SEEK_JUMP_THRESHOLD_S) onSeekRef.current?.(ct);
      }
      lastPollTime = now;
      lastCt = ct;

      if (dur > 0 && onTimeUpdateRef.current) onTimeUpdateRef.current(ct, dur);
    };
    const stopPoll = () => { if (pollId) { clearInterval(pollId); pollId = null; } lastPollTime = null; lastCt = null; };
    const startPoll = () => {
      stopPoll();
      reportTime(); // report immediately so we don't miss a 2s window
      pollId = setInterval(reportTime, 2000);
    };

    const playerDiv = document.createElement('div');
    playerDiv.style.width = '100%';
    playerDiv.style.height = '100%';
    wrapper.appendChild(playerDiv);

    loadYtApi().then(() => {
      if (destroyed) return;
      player = new window.YT.Player(playerDiv, {
        videoId,
        playerVars: { autoplay: 0, controls: 1, rel: 0, origin: window.location.origin },
        events: {
          onReady: () => {
            if (controlRef) controlRef.current = { seek: (pos) => player.seekTo(pos, true) };
          },
          onStateChange: ({ data }) => {
            // A real seek routes through BUFFERING (YouTube re-buffers at the new position)
            // before PLAYING fires again — stopping the poll there (as this used to) reset
            // lastPollTime/lastCt on every seek, which erased the exact jump the seek detector
            // needs to compare against, so no seek/rewind ever registered. Only a deliberate
            // PAUSED/ENDED should reset that baseline; BUFFERING just rides through untouched,
            // and PLAYING only (re)starts the poll if it isn't already running, so a
            // BUFFERING → PLAYING bounce mid-seek never resets it either.
            if (data === window.YT.PlayerState.PLAYING) {
              if (!pollId) startPoll();
              onPlayRef.current?.(player.getCurrentTime?.() ?? 0);
            } else if (data === window.YT.PlayerState.PAUSED) {
              stopPoll();
              onPauseRef.current?.(player.getCurrentTime?.() ?? 0);
            } else if (data === window.YT.PlayerState.ENDED) {
              stopPoll();
            }
          },
        },
      });
    });

    return () => {
      destroyed = true; stopPoll();
      try { player?.destroy(); } catch (_) {}
      try { if (wrapper.firstChild) wrapper.innerHTML = ''; } catch (_) {}
    };
  }, [videoId]);

  return <div ref={wrapperRef} className="w-full h-full" />;
}

// YouTube player with our own control chrome (matches SecurePlayer's look) instead of the native
// YouTube UI — mounted with controls:0. Quality control is intentionally omitted: YouTube stopped
// honoring setPlaybackQuality() for regular embeds years ago, so there is nothing real to expose.
function YouTubeCustomPlayer({ videoId, onTimeUpdate, onPlay, onPause, onSeek, controlRef }) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);
  const onPlayRef = useRef(onPlay);
  useEffect(() => { onPlayRef.current = onPlay; }, [onPlay]);
  const onPauseRef = useRef(onPause);
  useEffect(() => { onPauseRef.current = onPause; }, [onPause]);
  const onSeekRef = useRef(onSeek);
  useEffect(() => { onSeekRef.current = onSeek; }, [onSeek]);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef(null);

  // Mobile double-tap-to-seek (edges of the video, YouTube-app-style)
  const [skipFlash, setSkipFlash] = useState(null); // 'left' | 'right' | null
  const lastTapRef = useRef({ time: 0, side: null });
  const tapTimerRef = useRef(null);
  const skipFlashTimerRef = useRef(null);
  useEffect(() => () => { clearTimeout(tapTimerRef.current); clearTimeout(skipFlashTimerRef.current); }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !videoId) return;
    let destroyed = false, player = null, pollId = null, lastPollTime = null, lastCt = null;

    const poll = () => {
      if (!player) return;
      const ct = player.getCurrentTime?.() ?? 0;
      const dur = player.getDuration?.() ?? 0;
      setCurrentTime(ct);
      if (dur > 0) setDuration(dur);
      setBuffered((player.getVideoLoadedFraction?.() ?? 0) * 100);

      // Catches seeks from every source uniformly — native scrub bar clicks, double-tap skip —
      // since they all just move player.getCurrentTime() without a dedicated seek event. Must
      // fire before onTimeUpdate: the seek handler's "from position" comes off a ref onTimeUpdate
      // keeps fresh, so it needs last tick's value still in place when this runs.
      const now = Date.now();
      if (lastPollTime != null) {
        const expected = lastCt + (now - lastPollTime) / 1000;
        if (Math.abs(ct - expected) > YT_SEEK_JUMP_THRESHOLD_S) onSeekRef.current?.(ct);
      }
      lastPollTime = now;
      lastCt = ct;

      if (dur > 0 && onTimeUpdateRef.current) onTimeUpdateRef.current(ct, dur);
    };
    const stopPoll = () => { if (pollId) { clearInterval(pollId); pollId = null; } lastPollTime = null; lastCt = null; };
    const startPoll = () => { stopPoll(); poll(); pollId = setInterval(poll, 500); };

    const playerDiv = document.createElement('div');
    playerDiv.style.width = '100%';
    playerDiv.style.height = '100%';
    wrapper.appendChild(playerDiv);

    loadYtApi().then(() => {
      if (destroyed) return;
      player = new window.YT.Player(playerDiv, {
        videoId,
        playerVars: { autoplay: 0, controls: 0, rel: 0, modestbranding: 1, origin: window.location.origin },
        events: {
          onReady: () => {
            if (destroyed) return;
            playerRef.current = player;
            setReady(true);
            setVolume(player.getVolume() / 100);
            setMuted(player.isMuted());
            setDuration(player.getDuration() || 0);
            if (controlRef) controlRef.current = { seek: (pos) => player.seekTo(pos, true) };
          },
          onStateChange: ({ data }) => {
            if (destroyed) return;
            // See the sibling YouTubeTrackingPlayer for why BUFFERING must not stop the poll or
            // reset its jump-detection baseline — same fix here, `playing` visuals unaffected.
            if (data === window.YT.PlayerState.PLAYING) {
              setPlaying(true);
              if (!pollId) startPoll();
              onPlayRef.current?.(player.getCurrentTime?.() ?? 0);
            } else {
              setPlaying(false);
              if (data === window.YT.PlayerState.PAUSED) {
                stopPoll();
                onPauseRef.current?.(player.getCurrentTime?.() ?? 0);
              } else if (data === window.YT.PlayerState.ENDED) {
                stopPoll();
              }
            }
          },
        },
      });
    });

    return () => {
      destroyed = true; stopPoll();
      try { player?.destroy(); } catch (_) {}
      try { if (wrapper.firstChild) wrapper.innerHTML = ''; } catch (_) {}
    };
  }, [videoId]);

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo(); else p.playVideo();
  };

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    if (muted) {
      const restoredVolume = volume === 0 ? 1 : volume;
      p.unMute();
      p.setVolume(restoredVolume * 100);
      setMuted(false);
      setVolume(restoredVolume);
    } else {
      p.mute();
      setMuted(true);
    }
  };

  const changeVolume = (e) => {
    const p = playerRef.current;
    const val = parseFloat(e.target.value);
    if (!p) return;
    p.setVolume(val * 100);
    if (val === 0) p.mute(); else p.unMute();
    setVolume(val);
    setMuted(val === 0);
  };

  const seek = (e) => {
    const p = playerRef.current;
    if (!p || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const newTime = Math.max(0, Math.min(duration, pct * duration));
    p.seekTo(newTime, true);
    setCurrentTime(newTime);
  };

  const toggleFullscreen = () => {
    const c = containerRef.current;
    if (!c) return;
    const isFS = document.fullscreenElement || document.webkitFullscreenElement;
    if (isFS) {
      (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
      return;
    }
    if (c.requestFullscreen) c.requestFullscreen().catch(() => {});
    else if (c.webkitRequestFullscreen) c.webkitRequestFullscreen();
  };

  const skip = (seconds) => {
    const p = playerRef.current;
    if (!p) return;
    const newTime = Math.min(Math.max(currentTime + seconds, 0), duration || Infinity);
    p.seekTo(newTime, true);
    setCurrentTime(newTime);
  };

  const adjustVolume = (delta) => {
    const p = playerRef.current;
    if (!p) return;
    const newVol = Math.min(Math.max(volume + delta, 0), 1);
    p.setVolume(newVol * 100);
    if (newVol === 0) p.mute(); else p.unMute();
    setVolume(newVol);
    setMuted(newVol === 0);
  };

  const seekToPercent = (pct) => {
    const p = playerRef.current;
    if (!p || !duration) return;
    const newTime = (pct / 100) * duration;
    p.seekTo(newTime, true);
    setCurrentTime(newTime);
  };

  const frameStep = (dir) => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo();
    const newTime = Math.min(Math.max(currentTime + dir * (1 / 30), 0), duration || Infinity);
    p.seekTo(newTime, true);
    setCurrentTime(newTime);
  };

  const handlePlayerKeyDown = (e) => {
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      seekToPercent(parseInt(e.key, 10) * 10);
      return;
    }
    switch (e.key) {
      case ' ':
      case 'Spacebar':
      case 'k':
      case 'K':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        skip(-5);
        break;
      case 'ArrowRight':
        e.preventDefault();
        skip(5);
        break;
      case 'ArrowUp':
        e.preventDefault();
        adjustVolume(0.1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        adjustVolume(-0.1);
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'm':
      case 'M':
        e.preventDefault();
        toggleMute();
        break;
      case ',':
        e.preventDefault();
        frameStep(-1);
        break;
      case '.':
        e.preventDefault();
        frameStep(1);
        break;
      default:
        break;
    }
  };

  // Mobile double-tap on the left/right edge of the video → skip ±10s (YouTube-app-style).
  // A single tap is deferred briefly so it can be upgraded to a double-tap; taps in the
  // middle third pass through untouched and toggle play/pause immediately.
  const handleVideoTouchEnd = (e) => {
    if (e.changedTouches.length !== 1) return;
    const touch = e.changedTouches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = (touch.clientX - rect.left) / rect.width;

    let side = null;
    if (xPct < EDGE_ZONE) side = 'left';
    else if (xPct > 1 - EDGE_ZONE) side = 'right';
    if (!side) return;

    const now = Date.now();
    const last = lastTapRef.current;

    if (last.side === side && now - last.time < DOUBLE_TAP_MS) {
      e.preventDefault();
      clearTimeout(tapTimerRef.current);
      lastTapRef.current = { time: 0, side: null };
      skip(side === 'left' ? -10 : 10);
      setSkipFlash(side);
      clearTimeout(skipFlashTimerRef.current);
      skipFlashTimerRef.current = setTimeout(() => setSkipFlash(null), 500);
    } else {
      e.preventDefault();
      lastTapRef.current = { time: now, side };
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = setTimeout(() => {
        togglePlay();
        containerRef.current?.focus();
        lastTapRef.current = { time: 0, side: null };
      }, DOUBLE_TAP_MS);
    }
  };

  const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3000);
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="relative aspect-video bg-black rounded-[32px] overflow-hidden group select-none outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
      onKeyDown={handlePlayerKeyDown}
    >
      {/* YT iframe — pointer-events disabled so clicks/mousemove fall through to our own layers
          instead of being swallowed by the cross-origin iframe */}
      <div ref={wrapperRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* Click-to-toggle-play layer, below the control bar */}
      <div
        className="absolute inset-0 z-10 cursor-pointer"
        onClick={() => { togglePlay(); containerRef.current?.focus(); }}
        onTouchEnd={handleVideoTouchEnd}
      />

      {/* Mobile double-tap skip feedback */}
      {skipFlash && (
        <div className={`absolute inset-y-0 ${skipFlash === 'left' ? 'left-0' : 'right-0'} w-1/3 z-20 flex items-center justify-center pointer-events-none bg-white/5`}>
          <div className="flex flex-col items-center gap-1 text-white animate-pulse">
            {skipFlash === 'left' ? <RotateCcw className="w-8 h-8" /> : <RotateCw className="w-8 h-8" />}
            <span className="text-xs font-bold">10s</span>
          </div>
        </div>
      )}

      {!ready && (
        <div className="absolute inset-0 bg-black flex items-center justify-center z-30">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Custom Controls */}
      <div className={`absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-16 pb-4 px-5">
          {/* Progress bar */}
          <div className="mb-3 cursor-pointer group/bar" onClick={seek}>
            <div className="h-1 group-hover/bar:h-2 bg-white/20 rounded-full transition-all relative">
              <div className="absolute inset-y-0 left-0 bg-white/20 rounded-full" style={{ width: `${buffered}%` }} />
              <div className="h-full bg-violet-500 rounded-full relative z-10" style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover/bar:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={() => skip(-10)} className="relative p-1.5 text-white hover:text-violet-400 transition-colors" title="Cofnij 10 sekund">
                <RotateCcw className="w-5 h-5" />
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">10</span>
              </button>
              <button onClick={togglePlay} className="p-1.5 text-white hover:text-violet-400 transition-colors">
                {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" fill="white" />}
              </button>
              <button onClick={() => skip(10)} className="relative p-1.5 text-white hover:text-violet-400 transition-colors" title="Przewiń 10 sekund">
                <RotateCw className="w-5 h-5" />
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">10</span>
              </button>
              <div className="flex items-center gap-1 group/vol">
                <button onClick={toggleMute} className="p-1.5 text-white hover:text-violet-400 transition-colors">
                  {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : volume < 0.5 ? <Volume1 className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <div className="w-0 overflow-hidden transition-all duration-200 group-hover/vol:w-20">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={changeVolume}
                    className="w-20 accent-violet-500 cursor-pointer"
                  />
                </div>
              </div>
              <span className="text-white/80 text-xs font-mono">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={toggleFullscreen} className="p-1.5 text-white hover:text-violet-400 transition-colors">
                <Maximize className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const COMMENT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

const COMMENT_REPORT_REASONS = [
  { key: 'spam', label: 'Spam' },
  { key: 'harassment', label: 'Nękanie / obraźliwe treści' },
  { key: 'spoiler', label: 'Spoiler' },
  { key: 'inappropriate', label: 'Nieodpowiednia treść' },
  { key: 'other', label: 'Inne' },
];

// Reaction chips + emoji picker under a comment — stable component outside render.
function CommentReactions({ reactions, onReact }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onClickOutside = (e) => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [pickerOpen]);

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1.5">
      {(reactions || []).filter(r => r.count > 0).map(r => (
        <button
          key={r.emoji}
          onClick={() => onReact(r.emoji)}
          className={`text-[11px] px-1.5 py-0.5 rounded-lg border transition-all flex items-center gap-1 ${
            r.reacted
              ? 'bg-violet-100 dark:bg-violet-500/15 border-violet-300 dark:border-violet-500/40 text-violet-700 dark:text-violet-300'
              : 'bg-zinc-100 dark:bg-zinc-800 border-transparent text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
          }`}
        >
          <span>{r.emoji}</span><span className="font-semibold">{r.count}</span>
        </button>
      ))}
      <div className="relative" ref={pickerRef}>
        <button onClick={() => setPickerOpen(v => !v)} title="Dodaj reakcję" className="p-1 text-zinc-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-lg transition-colors">
          <SmilePlus className="w-3.5 h-3.5" />
        </button>
        {pickerOpen && (
          <div className="absolute z-10 top-full left-0 mt-1 flex gap-1 p-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg animate-scale-in origin-top-left">
            {COMMENT_REACTION_EMOJIS.map(e => (
              <button key={e} onClick={() => { onReact(e); setPickerOpen(false); }} className="text-base hover:scale-125 transition-transform p-0.5">
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Comment — stable component outside render
function CommentNode({ c, depth, replies, user, editingId, editContent, setEditContent, silentEdit, setSilentEdit, onStartEdit, onSaveEdit, onCancelEdit, onReply, onDelete, onHardDelete, onReact, onReport, editHistoryId, setEditHistoryId }) {
  const isEditing = editingId === c.id;
  const isDev = user?.role === 'dev';
  const canMod = c.user_id === user?.id || user?.role === 'admin' || isDev;
  const isDeleted = c.deleted === 1;
  let history = []; try { history = JSON.parse(c.edit_history || '[]'); } catch (e) {}

  return (
    <div className={depth > 0 ? 'ml-6 sm:ml-10 border-l-2 border-violet-200/50 dark:border-violet-800/30 pl-4' : ''}>
      <div className="flex gap-3 group py-2 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 -mx-2 px-2 rounded-xl transition-colors">
        <img src={c.avatar || `https://ui-avatars.com/api/?name=${c.display_name || c.username || 'U'}&background=8b5cf6&color=fff&size=80`} alt="" className={`w-8 h-8 rounded-xl shrink-0 object-cover mt-0.5 ${isDeleted ? 'opacity-40 grayscale' : ''}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className={`text-sm font-bold ${isDeleted ? 'text-zinc-400' : 'text-zinc-900 dark:text-white'}`}>{c.display_name || c.username}</span>
            <span className="text-[10px] text-zinc-400 font-mono">{formatDate(c.created_at)}</span>
            {c.edited === 1 && !isDeleted && <button onClick={() => setEditHistoryId(editHistoryId === c.id ? null : c.id)} className="text-[9px] text-zinc-400 hover:text-violet-500 transition-colors">(edytowano)</button>}
          </div>
          {isDeleted ? <p className="text-sm text-zinc-400 italic">(komentarz usunięty)</p>
          : isEditing ? (
            <div className="space-y-2" onClick={e => e.stopPropagation()}>
              <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="input-field !py-2 !px-3 text-sm resize-none" rows={2} autoFocus />
              <div className="flex items-center gap-2">
                <button onClick={() => onSaveEdit(c.id)} className="btn-icon-emerald"><Check className="w-4 h-4" /></button>
                <button onClick={onCancelEdit} className="btn-icon-zinc"><X className="w-4 h-4" /></button>
                {isDev && <label className="flex items-center gap-1.5 text-[10px] text-amber-500 cursor-pointer ml-2 select-none"><input type="checkbox" checked={silentEdit} onChange={e => setSilentEdit(e.target.checked)} className="w-3 h-3 rounded" /> Ciche</label>}
              </div>
            </div>
          ) : <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words">{c.content}</p>}
          {editHistoryId === c.id && history.length > 0 && (
            <div className="mt-2 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 animate-scale-in">
              <p className="text-[10px] font-bold text-zinc-500 uppercase mb-2">Historia edycji</p>
              {history.map((h, i) => <div key={i} className="text-xs text-zinc-500 mb-1"><span className="font-mono text-[10px]">{formatDate(h.date)}</span>: {h.content}</div>)}
            </div>
          )}
          {!isEditing && !isDeleted && (
            <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-all">
              <button onClick={() => onReply(c)} className="btn-link-zinc hover:text-violet-500 px-2 py-1 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-500/10 flex items-center gap-1 text-[11px]"><Reply className="w-3 h-3" /> Odpowiedz</button>
              {(c.user_id === user?.id || isDev) && <button onClick={() => onStartEdit(c)} className="btn-link-zinc hover:text-amber-500 px-2 py-1 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-500/10 flex items-center gap-1 text-[11px]"><Pencil className="w-3 h-3" /> Edytuj</button>}
              {canMod && <button onClick={() => onDelete(c.id)} className="btn-link-red px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-1 text-[11px]"><Trash2 className="w-3 h-3" /> Usuń</button>}
              {c.user_id !== user?.id && <button onClick={() => onReport(c)} className="btn-link-zinc hover:text-amber-500 px-2 py-1 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-500/10 flex items-center gap-1 text-[11px]"><Flag className="w-3 h-3" /> Zgłoś</button>}
            </div>
          )}
          {isDeleted && isDev && <button onClick={() => onHardDelete(c.id)} className="btn-link-red mt-1 text-[10px]">Usuń całkowicie{replies.length > 0 ? ` (+ ${replies.length} odp.)` : ''}</button>}
          {!isDeleted && !isEditing && <CommentReactions reactions={c.reactions} onReact={emoji => onReact(c.id, emoji)} />}
        </div>
      </div>
      {replies.map(r => <CommentNode key={r.id} c={r} depth={depth + 1} replies={r._replies || []} user={user} editingId={editingId} editContent={editContent} setEditContent={setEditContent} silentEdit={silentEdit} setSilentEdit={setSilentEdit} onStartEdit={onStartEdit} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit} onReply={onReply} onDelete={onDelete} onHardDelete={onHardDelete} onReact={onReact} onReport={onReport} editHistoryId={editHistoryId} setEditHistoryId={setEditHistoryId} />)}
    </div>
  );
}

export default function VideoPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromCategory = searchParams.get('from') || '';
  const slideDir = searchParams.get('slide') || '';
  const navigate = useNavigate();
  const { user } = useAuth();
  const { config } = useSettings();

  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSource, setActiveSource] = useState('main');
  const [error, setError] = useState(null);
  const [isFav, setIsFav] = useState(false);
  const [favCount, setFavCount] = useState(0);
  const [favLoading, setFavLoading] = useState(false);
  const [prevVideo, setPrevVideo] = useState(null);
  const [nextVideo, setNextVideo] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editUsers, setEditUsers] = useState([]);

  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commentLimit, setCommentLimit] = useState(3000);
  const [commentLoading, setCommentLoading] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [editingComment, setEditingComment] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [silentEdit, setSilentEdit] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [hardDeleteConfirm, setHardDeleteConfirm] = useState(null);
  const [editHistoryPopup, setEditHistoryPopup] = useState(null);
  const [reportingComment, setReportingComment] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState('');

  // Continue Watching
  const playerControlRef = useRef(null);
  const progressStateRef = useRef({ id: null, position: 0, duration: 0, completed: false, lastSaved: 0 });
  const [resumePosition, setResumePosition] = useState(null);
  const [showResumeBanner, setShowResumeBanner] = useState(false);

  // Sampled play/pause/seek events for the per-video analytics heatmap (self-hosted only —
  // see SecurePlayer's onPlay/onPause/onSeek). Buffered and flushed in batches, never per-event.
  const eventBufferRef = useRef([]);

  const [devOpen, setDevOpen] = useState(false);
  const [devUserId, setDevUserId] = useState('');
  const [devContent, setDevContent] = useState('');
  const [devDate, setDevDate] = useState('');
  const [devParent, setDevParent] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  
  // Animation state machine: 'show' | 'exiting' | 'hidden' | 'entering'
  const [phase, setPhase] = useState('show');
  const [exitDir, setExitDir] = useState('');
  const [pendingSlide, setPendingSlide] = useState(slideDir); // 'left' | 'right' | ''

  useEffect(() => {
    setActiveSource('main');
    setPrevVideo(null); setNextVideo(null);
    setEditingComment(null); setEditContent('');
    setComments([]); setReplyTo(null);
    setResumePosition(null); setShowResumeBanner(false);
    const vid = Number(id);
    const isSwitch = !!video;
    
    // If switching between videos, go to hidden phase (between exit and enter)
    if (isSwitch) {
      setPhase('hidden');
    } else {
      setLoading(true);
    }
    
    Promise.all([
      api.getVideo(id),
      api.checkFavorite(id).catch(() => ({ isFavorite: false, count: 0 })),
    ]).then(([v, f]) => {
      setVideo(v); setIsFav(f.isFavorite); setFavCount(f.count || 0); setError(null);
      // NEW data is now in state → trigger enter animation
      setPendingSlide(slideDir);
      setPhase('entering');
      const admin = user?.role === 'admin' || user?.role === 'dev';
      if (admin) setCanEdit(true);
      else if (v.category_id) api.getCategories().then(cats => setCanEdit(cats.find(c => c.id === v.category_id)?.canEdit || false)).catch(() => setCanEdit(false));
      else setCanEdit(false);
      const lp = fromCategory ? { category: fromCategory } : {};
      api.getVideos(lp).then(vids => {
        if (!Array.isArray(vids) || !vids.length) return;
        const idx = vids.findIndex(v2 => Number(v2.id) === vid);
        if (idx > 0) setPrevVideo(vids[idx - 1]);
        if (idx >= 0 && idx < vids.length - 1) setNextVideo(vids[idx + 1]);
      }).catch(() => {});
      api.getComments(vid).then(setComments).catch(() => setComments([]));
      api.getProgress(vid).then(p => {
        if (p && p.duration > 0 && p.position > p.duration * 0.05 && p.position < p.duration * 0.90) {
          setResumePosition(p.position);
          setShowResumeBanner(true);
        }
      }).catch(() => {});
    }).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [id]);

  const flushPlaybackEvents = useCallback((videoId) => {
    if (eventBufferRef.current.length === 0) return;
    const events = eventBufferRef.current;
    eventBufferRef.current = [];
    fetch(`/api/videos/${videoId}/playback-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ events }),
      credentials: 'include',
      keepalive: true,
    }).catch(() => {});
  }, []);

  // Save progress when navigating to a different video (id changes) or leaving the page entirely
  useEffect(() => {
    progressStateRef.current = { id, position: 0, duration: 0, completed: false, lastSaved: 0 };
    eventBufferRef.current = [];
    const flushInterval = setInterval(() => flushPlaybackEvents(id), 15000);
    return () => {
      clearInterval(flushInterval);
      flushPlaybackEvents(id);
      const s = progressStateRef.current;
      if (!s.id || !s.duration || s.completed) return;
      const pct = s.position / s.duration;
      if (pct < 0.05 || pct >= 0.90) return;
      fetch(`/api/progress/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ position: s.position, duration: s.duration }),
        credentials: 'include',
        keepalive: true,
      }).catch(() => {});
    };
  }, [id, flushPlaybackEvents]);

  useEffect(() => { if (user?.role === 'dev' && devOpen && !allUsers.length) api.getAllUsers().then(setAllUsers).catch(() => {}); }, [devOpen]);

  const goToVideo = (videoId, dir) => {
    if (phase === 'exiting') return;
    setPhase('exiting');
    setExitDir(dir === 'next' ? 'anim-exit-left' : 'anim-exit-right');
    const p = new URLSearchParams();
    if (fromCategory) p.set('from', fromCategory);
    p.set('slide', dir === 'next' ? 'right' : 'left');
    setTimeout(() => navigate(`/video/${videoId}?${p.toString()}`), 350);
  };

  const toggleFav = async () => {
    setFavLoading(true);
    try { if (isFav) { await api.removeFavorite(id); setIsFav(false); setFavCount(c => Math.max(0, c - 1)); } else { await api.addFavorite(id); setIsFav(true); setFavCount(c => c + 1); } } catch (e) {}
    setFavLoading(false);
  };

  const openEditModal = async () => { try { setEditUsers(await api.getAllUsers()); } catch (e) { setEditUsers([]); } setShowEditModal(true); };
  const submitComment = async () => {
    if (!newComment.trim() || commentLoading) return; setCommentLoading(true);
    try { const c = await api.addComment(id, newComment.trim(), replyTo?.id || null); setComments(p => [...p, c]); setNewComment(''); setReplyTo(null); } catch (e) {}
    setCommentLoading(false);
  };
  const submitDev = async () => {
    if (!devUserId || !devContent.trim()) return;
    try { const c = await api.addAdminComment({ video_id: Number(id), user_id: Number(devUserId), content: devContent.trim(), created_at: devDate || undefined, parent_id: devParent ? Number(devParent) : null }); setComments(p => [...p, c]); setDevContent(''); } catch (e) {}
  };
  const onStartEdit = useCallback((c) => { setEditingComment(c.id); setEditContent(c.content); setSilentEdit(false); }, []);
  const onSaveEdit = useCallback(async (cid) => { if (!editContent.trim()) return; try { const u = await api.editComment(cid, editContent.trim(), silentEdit); setComments(p => p.map(c => c.id === cid ? u : c)); setEditingComment(null); setEditContent(''); } catch (e) {} }, [editContent, silentEdit]);
  const onCancelEdit = useCallback(() => { setEditingComment(null); setEditContent(''); }, []);
  const onReply = useCallback((c) => { setReplyTo(c); setNewComment(''); }, []);

  useEffect(() => { api.getConfig().then(c => { if (c.limitComment) setCommentLimit(c.limitComment); }).catch(() => {}); }, []);
  const onDelete = useCallback((cid) => setDeleteConfirm(cid), []);
  const onHardDelete = useCallback((cid) => setHardDeleteConfirm(cid), []);
  const handleReact = useCallback(async (cid, emoji) => {
    try {
      const { reactions } = await api.reactToComment(cid, emoji);
      setComments(p => p.map(c => c.id === cid ? { ...c, reactions } : c));
    } catch (e) {}
  }, []);
  const openReportModal = useCallback((c) => {
    setReportingComment(c); setReportReason(''); setReportDescription(''); setReportError('');
  }, []);
  const closeReportModal = () => { setReportingComment(null); setReportReason(''); setReportDescription(''); setReportError(''); };
  const submitReport = async () => {
    if (!reportReason) { setReportError('Wybierz powód zgłoszenia.'); return; }
    if (!reportDescription.trim()) { setReportError('Opis jest wymagany.'); return; }
    setReportSubmitting(true); setReportError('');
    try {
      await api.reportComment(reportingComment.id, reportReason, reportDescription.trim());
      closeReportModal();
    } catch (e) { setReportError(e.message); }
    setReportSubmitting(false);
  };
  const softDel = async () => { if (!deleteConfirm) return; try { await api.deleteComment(deleteConfirm); setComments(p => p.map(c => c.id === deleteConfirm ? { ...c, deleted: 1, content: '' } : c)); } catch (e) {} setDeleteConfirm(null); };
  const hardDel = async () => { if (!hardDeleteConfirm) return; try { await api.hardDeleteComment(hardDeleteConfirm); const rm = new Set([hardDeleteConfirm]); const walk = pid => comments.filter(c => c.parent_id === pid).forEach(c => { rm.add(c.id); walk(c.id); }); walk(hardDeleteConfirm); setComments(p => p.filter(c => !rm.has(c.id))); } catch (e) {} setHardDeleteConfirm(null); };

  const handleTimeUpdate = useCallback((currentTime, duration) => {
    if (!duration || duration <= 0) return;
    const pct = currentTime / duration;
    const s = progressStateRef.current;
    s.position = currentTime;
    s.duration = duration;

    if (pct >= 0.90) {
      if (!s.completed) {
        s.completed = true;
        api.clearProgress(id).catch(() => {});
        api.markWatched(id).catch(() => {});
      }
      return;
    }
    s.completed = false;
    if (pct < 0.05) return;

    const now = Date.now();
    if (now - s.lastSaved > 10000) {
      s.lastSaved = now;
      api.saveProgress(id, currentTime, duration).catch(() => {});
    }
  }, [id]);

  // Shared by SecurePlayer (self-hosted, real DOM events) and both YouTube players (IFrame API
  // has no seek event, so they infer one from a polling jump — see YT_SEEK_JUMP_THRESHOLD_S).
  // Feeds the per-video analytics heatmap. from_position comes from progressStateRef, which
  // handleTimeUpdate keeps fresh on every tick, so it reflects "where playback was right before
  // this seek" without the player itself needing to know anything about analytics.
  const handlePlayerPlay = useCallback((pos) => { eventBufferRef.current.push({ event_type: 'play', position: pos }); }, []);
  const handlePlayerPause = useCallback((pos) => { eventBufferRef.current.push({ event_type: 'pause', position: pos }); }, []);
  const handlePlayerSeek = useCallback((pos) => {
    eventBufferRef.current.push({ event_type: 'seek', position: pos, from_position: progressStateRef.current.position });
  }, []);

  const tree = useMemo(() => {
    const m = {}; comments.forEach(c => { m[c.id] = { ...c, _replies: [] }; });
    const roots = [];
    comments.forEach(c => { if (c.parent_id && m[c.parent_id]) m[c.parent_id]._replies.push(m[c.id]); else roots.push(m[c.id]); });
    return roots;
  }, [comments]);

  if (loading && !video) return <div className="p-6 sm:p-10 max-w-5xl mx-auto animate-fade-in"><div className="aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-[32px] skeleton mb-6" /><div className="h-8 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-2/3 mb-4" /><div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-1/3" /></div>;
  if (error || !video) return <div className="p-6 sm:p-10 max-w-5xl mx-auto animate-scale-in"><div className="card p-16 text-center"><p className="text-red-500 font-bold text-lg mb-2">Błąd</p><p className="text-zinc-500">{error || 'Film nie znaleziony.'}</p><Link to="/" className="btn-primary mt-6 inline-block">Wróć</Link></div></div>;

  const src = activeSource === 'mirror1'
    ? { url: video.mirror1_url, type: video.mirror1_type || (video.mirror1_is_embed ? 'embed' : 'link') }
    : activeSource === 'mirror2'
    ? { url: video.mirror2_url, type: video.mirror2_type || (video.mirror2_is_embed ? 'embed' : 'link') }
    : activeSource === 'mirror3'
    ? { url: video.mirror3_url, type: video.mirror3_type || 'link' }
    : activeSource === 'mirror4'
    ? { url: video.mirror4_url, type: video.mirror4_type || 'link' }
    : activeSource === 'mirror5'
    ? { url: video.mirror5_url, type: video.mirror5_type || 'link' }
    : { url: video.main_source, type: video.main_source_type };
  const isStreamer = src.type === 'streamer';
  const streamerVideoId = isStreamer ? src.url?.replace('self-hosted:', '') : null;
  const isPlex = src.type === 'plex';
  const isHtml = src.type === 'embed' || src.type === 'html';
  const embedUrl = (isHtml || isPlex || isStreamer) ? null : youtubeToEmbed(src.url);
  const sources = [
    { key: 'main', label: video.main_source_title || 'Główne źródło' },
    ...(video.mirror1_url ? [{ key: 'mirror1', label: video.mirror1_name || 'Mirror 1' }] : []),
    ...(video.mirror2_url ? [{ key: 'mirror2', label: video.mirror2_name || 'Mirror 2' }] : []),
    ...(video.mirror3_url ? [{ key: 'mirror3', label: video.mirror3_name || 'Mirror 3' }] : []),
    ...(video.mirror4_url ? [{ key: 'mirror4', label: video.mirror4_name || 'Mirror 4' }] : []),
    ...(video.mirror5_url ? [{ key: 'mirror5', label: video.mirror5_name || 'Mirror 5' }] : []),
  ];
  // Passed to SecurePlayer so a broken source's own error state offers a one-click way out
  // instead of only the tab row further down the page.
  const otherSources = sources.filter(s => s.key !== activeSource);
  const isDev = user?.role === 'dev';
  const activeCount = comments.filter(c => !c.deleted).length;
  // Animation class based on phase
  const enterAnim = pendingSlide === 'right' ? 'anim-enter-right' : pendingSlide === 'left' ? 'anim-enter-left' : 'anim-enter-up';
  const wrapperClass = phase === 'exiting' ? exitDir : phase === 'entering' ? enterAnim : phase === 'hidden' ? 'opacity-0' : '';

  return (
    <>
      <div className={`p-6 sm:p-10 max-w-5xl mx-auto ${wrapperClass}`} onAnimationEnd={() => { if (phase === 'entering') setPhase('show'); }}>
        <button onClick={() => navigate(fromCategory ? `/category/${fromCategory}` : '/')} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white font-medium text-sm mb-6 hover:gap-3 transition-all active:scale-95">
          <ArrowLeft className="w-4 h-4" /> {fromCategory ? 'Wróć do kategorii' : 'Wróć do bazy'}
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6 anim-stagger-1">
          <div className="flex-1">
            <div className="flex items-start gap-3 mb-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display flex-1">{video.title}</h1>
              {canEdit && <Link to={`/video/${id}/analytics`} className="shrink-0 p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-violet-500 dark:hover:text-violet-400 transition-all hover:scale-110 active:scale-95" title="Analityka"><BarChart3 className="w-5 h-5" /></Link>}
              {canEdit && <button onClick={openEditModal} className="shrink-0 p-2.5 rounded-xl bg-violet-50 dark:bg-violet-500/10 text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-all hover:scale-110 active:scale-95"><Pencil className="w-5 h-5" /></button>}
              <button onClick={toggleFav} disabled={favLoading} className={`shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl transition-all duration-300 hover:scale-105 active:scale-95 ${isFav ? 'bg-pink-50 dark:bg-pink-500/10 text-pink-500 shadow-lg shadow-pink-500/10' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-pink-500'}`}>
                <Heart className={`w-5 h-5 transition-all ${isFav ? 'fill-current scale-110' : ''}`} />
                {favCount > 0 && <span className="text-xs font-bold">{favCount}</span>}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link to={`/author/${video.author_id}`} className="text-sm font-bold text-violet-500 hover:text-violet-600 transition-colors">{video.author_display_name || video.author_name}</Link>
              {video.tags?.length > 0 && <div className="flex flex-wrap gap-1.5">{video.tags.map(t => <Link key={t.id} to={`/?tags=${t.id}`} className="tag-chip hover:scale-105 active:scale-95">{t.name}</Link>)}</div>}
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
              <span>{formatDate(video.publish_date)}</span>
              {video.category_name && <><span>•</span><Link to={`/category/${video.category_slug}`} className="hover:text-violet-500 transition-colors">{video.category_name}</Link></>}
            </div>
          </div>
        </div>

        <div className="mb-2 anim-stagger-2" key={`player-${activeSource}`}>
          {video.stream_video_id && video.stream_status === 'ready' && activeSource === 'main' ? (
            <SecurePlayer streamVideoId={video.stream_video_id} drmEnhanced={video.drm_enhanced} title={video.title} controlRef={playerControlRef} onTimeUpdate={handleTimeUpdate} onPlay={handlePlayerPlay} onPause={handlePlayerPause} onSeek={handlePlayerSeek} mirrors={otherSources} onSelectMirror={setActiveSource} />
          ) : isStreamer && streamerVideoId ? (
            <SecurePlayer streamVideoId={streamerVideoId} drmEnhanced={false} title={video.title} controlRef={playerControlRef} onTimeUpdate={handleTimeUpdate} onPlay={handlePlayerPlay} onPause={handlePlayerPause} onSeek={handlePlayerSeek} mirrors={otherSources} onSelectMirror={setActiveSource} />
          ) : isPlex && src.url ? (
            <div className="aspect-video rounded-[32px] overflow-hidden shadow-2xl animate-scale-in plex-container flex items-center justify-center">
              {/* Floating particles */}
              <div className="plex-particle w-2 h-2 bg-amber-400/40 top-[20%] left-[15%]" style={{ animation: 'plexFloat1 6s ease-in-out infinite' }} />
              <div className="plex-particle w-1.5 h-1.5 bg-emerald-400/30 top-[60%] right-[20%]" style={{ animation: 'plexFloat2 8s ease-in-out infinite 1s' }} />
              <div className="plex-particle w-1 h-1 bg-amber-300/20 bottom-[25%] left-[30%]" style={{ animation: 'plexFloat3 7s ease-in-out infinite 2s' }} />
              <div className="plex-particle w-2.5 h-2.5 bg-amber-500/20 top-[35%] right-[35%]" style={{ animation: 'plexFloat1 9s ease-in-out infinite 3s' }} />
              <div className="plex-particle w-1 h-1 bg-emerald-300/15 top-[15%] right-[40%]" style={{ animation: 'plexFloat2 5s ease-in-out infinite 0.5s' }} />

              <div className="flex flex-col items-center gap-6 p-10 relative z-10">
                {/* Plex logo */}
                <img src="https://alleria.pl/image/plex-play.png" alt="Plex" className="plex-logo w-20 h-20 object-contain mb-1" />

                {/* Primary — Oglądaj w Plex */}
                <a href={src.url} target="_blank" rel="noopener noreferrer"
                  className="plex-btn-primary block w-[280px] text-center py-4 px-8 rounded-2xl font-bold text-lg text-zinc-900 no-underline tracking-wide">
                  ▶ Oglądaj w Plex
                </a>

                {/* Secondary — Uzyskaj dostęp */}
                <a href="https://alleria.pl/plex/plex_access.php" target="_blank" rel="noopener noreferrer"
                  className="plex-btn-access block w-[280px] text-center py-3.5 px-8 rounded-2xl font-semibold text-base no-underline tracking-wide">
                  Uzyskaj dostęp do Plex
                </a>

                {/* Tertiary — Czym jest Plex */}
                <a href="https://alleria.pl/plex/" target="_blank" rel="noopener noreferrer"
                  className="plex-btn-info block text-center py-2.5 px-6 rounded-xl text-sm no-underline">
                  Czym jest Plex?
                </a>
              </div>
            </div>
          ) : embedUrl ? (
            <div className="aspect-video rounded-[32px] overflow-hidden shadow-2xl animate-scale-in">
              {config.customYoutubePlayer
                ? <YouTubeCustomPlayer videoId={extractYoutubeId(src.url)} onTimeUpdate={handleTimeUpdate} onPlay={handlePlayerPlay} onPause={handlePlayerPause} onSeek={handlePlayerSeek} controlRef={playerControlRef} />
                : <YouTubeTrackingPlayer videoId={extractYoutubeId(src.url)} onTimeUpdate={handleTimeUpdate} onPlay={handlePlayerPlay} onPause={handlePlayerPause} onSeek={handlePlayerSeek} controlRef={playerControlRef} />}
            </div>
          ) : isHtml && src.url ? (
            <div className="aspect-video rounded-[32px] overflow-hidden shadow-2xl animate-scale-in"><HtmlEmbed html={src.url} /></div>
          ) : <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-[32px] flex items-center justify-center"><p className="text-zinc-400 text-sm">Brak źródła.</p></div>}
        </div>

        {showResumeBanner && resumePosition !== null && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 rounded-2xl animate-scale-in">
            <span className="text-sm text-violet-700 dark:text-violet-300 font-medium flex-1">Kontynuuj od {Math.floor(resumePosition / 60)}:{String(Math.floor(resumePosition % 60)).padStart(2, '0')}?</span>
            <button onClick={() => { playerControlRef.current?.seek(resumePosition); setShowResumeBanner(false); }} className="btn-sm-primary">Kontynuuj</button>
            <button onClick={() => setShowResumeBanner(false)} className="btn-sm-secondary">Od początku</button>
          </div>
        )}

        {sources.length > 1 && (
          <div className="flex gap-2 mb-6 anim-stagger-3">
            {sources.map(s => <button key={s.key} onClick={() => setActiveSource(s.key)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all hover:scale-105 active:scale-95 ${activeSource === s.key ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>{s.label}</button>)}
          </div>
        )}

        {(prevVideo || nextVideo) && (
          <div className="flex items-stretch gap-3 sm:gap-4 mb-8 anim-stagger-4">
            {prevVideo ? (
              <button onClick={() => goToVideo(prevVideo.id, 'prev')} className="flex-1 min-w-0 max-w-[50%] card p-4 sm:p-5 group hover:shadow-lg hover:-translate-y-1 text-left transition-all">
                <div className="flex items-center gap-1.5 text-violet-500 font-bold text-xs sm:text-sm mb-1"><ChevronLeft className="w-4 h-4 shrink-0 group-hover:-translate-x-1.5 transition-transform duration-300" /> poprzedni</div>
                <p className="text-xs sm:text-sm text-zinc-900 dark:text-white font-medium truncate group-hover:text-violet-500 transition-colors">{prevVideo.title}</p>
              </button>
            ) : <div className="flex-1" />}
            {nextVideo ? (
              <button onClick={() => goToVideo(nextVideo.id, 'next')} className="flex-1 min-w-0 max-w-[50%] card p-4 sm:p-5 text-right group hover:shadow-lg hover:-translate-y-1 ml-auto transition-all">
                <div className="flex items-center justify-end gap-1.5 text-violet-500 font-bold text-xs sm:text-sm mb-1">następny <ChevronRight className="w-4 h-4 shrink-0 group-hover:translate-x-1.5 transition-transform duration-300" /></div>
                <p className="text-xs sm:text-sm text-zinc-900 dark:text-white font-medium truncate group-hover:text-violet-500 transition-colors">{nextVideo.title}</p>
              </button>
            ) : <div className="flex-1" />}
          </div>
        )}

        {video.description && <div className="card p-8 mb-6 anim-stagger-5"><h3 className="label-field">Opis</h3><div className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{video.description}</div></div>}

        <div className="card p-8 anim-stagger-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2"><MessageCircle className="w-5 h-5 text-violet-500" /><h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display">Komentarze ({activeCount})</h3></div>
            {isDev && <button onClick={() => setDevOpen(!devOpen)} className="text-[10px] font-bold text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-3 py-1.5 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-all">DEV: Dodaj jako...</button>}
          </div>
          {devOpen && isDev && (
            <div className="mb-6 p-4 bg-amber-50/50 dark:bg-amber-500/5 rounded-2xl border border-amber-200 dark:border-amber-500/20 space-y-3 animate-scale-in">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <select value={devUserId} onChange={e => setDevUserId(e.target.value)} className="input-field !py-2 text-xs"><option value="">Użytkownik...</option>{allUsers.map(u => <option key={u.id} value={u.id}>{u.display_name || u.username}</option>)}</select>
                <input type="datetime-local" value={devDate} onChange={e => setDevDate(e.target.value)} className="input-field !py-2 text-xs" />
                <input type="text" value={devParent} onChange={e => setDevParent(e.target.value)} className="input-field !py-2 text-xs" placeholder="Parent ID" />
                <button onClick={submitDev} disabled={!devUserId || !devContent.trim()} className="btn-sm-primary">Dodaj</button>
              </div>
              <textarea value={devContent} onChange={e => setDevContent(e.target.value)} className="input-field !py-2 text-sm resize-none" rows={2} placeholder="Treść..." />
            </div>
          )}
          {replyTo && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-violet-50 dark:bg-violet-500/10 rounded-xl text-sm animate-scale-in">
              <Reply className="w-4 h-4 text-violet-500" /><span className="text-violet-600 dark:text-violet-400">Odpowiedź do <strong>{replyTo.display_name || replyTo.username}</strong></span>
              <button onClick={() => setReplyTo(null)} className="btn-icon-violet !p-1 ml-auto"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
          <div className="flex gap-3 mb-6">
            <img src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.display_name || 'U'}&background=8b5cf6&color=fff&size=80`} alt="" className="w-10 h-10 rounded-xl shrink-0 object-cover" />
            <div className="flex-1 relative">
              <textarea value={newComment} maxLength={commentLimit} onChange={e => setNewComment(e.target.value)} placeholder={replyTo ? 'Odpowiedz...' : 'Napisz komentarz...'} className="input-field !py-3 !pr-12 resize-none text-sm min-h-[48px] max-h-[120px]" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); }}} rows={1} />
              <button onClick={submitComment} disabled={!newComment.trim() || commentLoading} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-violet-500 hover:text-violet-600 disabled:text-zinc-300 dark:disabled:text-zinc-700 transition-all hover:scale-110 active:scale-90"><Send className="w-4 h-4" /></button>
            </div>
          </div>
          {tree.length === 0 ? <p className="text-sm text-zinc-400 text-center py-6">Brak komentarzy - bądź pierwszą osobą!</p> : (
            <div className="space-y-1">{tree.map(c => <CommentNode key={c.id} c={c} depth={0} replies={c._replies} user={user} editingId={editingComment} editContent={editContent} setEditContent={setEditContent} silentEdit={silentEdit} setSilentEdit={setSilentEdit} onStartEdit={onStartEdit} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit} onReply={onReply} onDelete={onDelete} onHardDelete={onHardDelete} onReact={handleReact} onReport={openReportModal} editHistoryId={editHistoryPopup} setEditHistoryId={setEditHistoryPopup} />)}</div>
          )}
        </div>
      </div>

      {/* All modals via Portal — always centered in viewport */}
      {deleteConfirm && <Portal><div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}><div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',backdropFilter:'blur(8px)'}} onClick={()=>setDeleteConfirm(null)}/><div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[32px] shadow-2xl max-w-sm w-full p-8 text-center" style={{position:'relative',zIndex:1,animation:'modalIn 0.35s cubic-bezier(0.16,1,0.3,1)'}}><Trash2 className="w-12 h-12 text-red-500 mx-auto mb-4"/><h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Usunąć komentarz?</h3><p className="text-sm text-zinc-500 mb-6">Treść zostanie ukryta, wątek zachowany.</p><div className="flex gap-3 justify-center"><button onClick={()=>setDeleteConfirm(null)} className="btn-secondary text-sm">Anuluj</button><button onClick={softDel} className="btn-danger text-sm">Usuń</button></div></div></div></Portal>}
      {hardDeleteConfirm && <Portal><div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}><div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',backdropFilter:'blur(8px)'}} onClick={()=>setHardDeleteConfirm(null)}/><div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[32px] shadow-2xl max-w-sm w-full p-8 text-center" style={{position:'relative',zIndex:1,animation:'modalIn 0.35s cubic-bezier(0.16,1,0.3,1)'}}><AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4"/><h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Usunąć permanentnie?</h3><p className="text-sm text-zinc-500 mb-6">Komentarz i odpowiedzi usunięte na zawsze.</p><div className="flex gap-3 justify-center"><button onClick={()=>setHardDeleteConfirm(null)} className="btn-secondary text-sm">Anuluj</button><button onClick={hardDel} className="btn-danger text-sm">Usuń</button></div></div></div></Portal>}
      {showEditModal && <Portal><VideoModal isOpen={showEditModal} onClose={()=>setShowEditModal(false)} video={video} users={editUsers} onSaved={()=>{setShowEditModal(false);api.getVideo(id).then(v=>setVideo(v)).catch(()=>{})}}/></Portal>}
      {reportingComment && (
        <Portal>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }} onClick={closeReportModal} />
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[32px] shadow-2xl max-w-md w-full p-8" style={{ position: 'relative', zIndex: 1, animation: 'modalIn 0.35s cubic-bezier(0.16,1,0.3,1)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Flag className="w-5 h-5 text-amber-500" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display">Zgłoś komentarz</h3>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4 line-clamp-2 italic">"{reportingComment.content}"</p>
              <div className="space-y-3">
                <div>
                  <label className="label-field">Powód</label>
                  <select value={reportReason} onChange={e => setReportReason(e.target.value)} className="input-field text-sm">
                    <option value="">Wybierz powód...</option>
                    {COMMENT_REPORT_REASONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-field">Opis</label>
                  <textarea
                    value={reportDescription}
                    onChange={e => setReportDescription(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Opisz, dlaczego zgłaszasz ten komentarz..."
                    className="input-field text-sm resize-none"
                  />
                </div>
                {reportError && <p className="text-red-500 text-xs">{reportError}</p>}
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button onClick={closeReportModal} className="btn-secondary text-sm">Anuluj</button>
                <button onClick={submitReport} disabled={reportSubmitting} className="btn-primary text-sm disabled:opacity-50">
                  {reportSubmitting ? 'Wysyłanie...' : 'Zgłoś'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
