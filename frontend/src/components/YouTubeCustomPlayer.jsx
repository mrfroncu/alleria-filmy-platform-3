import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume1, Volume2, VolumeX, Maximize } from 'lucide-react';
import { loadYtApi } from '../utils/youtubeApi';

// YouTube playback with our own control chrome (matches SecurePlayer's look) instead of the
// native YouTube UI — mounted with controls:0. Quality control is intentionally omitted: YouTube
// stopped honoring setPlaybackQuality() for regular embeds years ago.
export default function YouTubeCustomPlayer({ videoId, onTimeUpdate, controlRef, onPlayStateChange }) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);
  const onPlayStateChangeRef = useRef(onPlayStateChange);
  useEffect(() => { onPlayStateChangeRef.current = onPlayStateChange; }, [onPlayStateChange]);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !videoId) return;
    let destroyed = false, player = null, pollId = null;

    const poll = () => {
      if (!player) return;
      const ct = player.getCurrentTime?.() ?? 0;
      const dur = player.getDuration?.() ?? 0;
      setCurrentTime(ct);
      if (dur > 0) setDuration(dur);
      setBuffered((player.getVideoLoadedFraction?.() ?? 0) * 100);
      if (dur > 0 && onTimeUpdateRef.current) onTimeUpdateRef.current(ct, dur);
    };
    const stopPoll = () => { if (pollId) { clearInterval(pollId); pollId = null; } };
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
            if (controlRef) controlRef.current = {
              seek: (pos) => player.seekTo(pos, true),
              play: () => player.playVideo(),
              pause: () => player.pauseVideo(),
              getCurrentTime: () => player.getCurrentTime?.() ?? 0,
            };
          },
          onStateChange: ({ data }) => {
            if (destroyed) return;
            if (data === window.YT.PlayerState.PLAYING) { setPlaying(true); startPoll(); onPlayStateChangeRef.current?.(true, player.getCurrentTime?.() ?? 0); }
            else { setPlaying(false); stopPoll(); if (data === window.YT.PlayerState.PAUSED) onPlayStateChangeRef.current?.(false, player.getCurrentTime?.() ?? 0); }
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

  const togglePlay = () => { const p = playerRef.current; if (!p) return; playing ? p.pauseVideo() : p.playVideo(); };

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    if (muted) { const rv = volume === 0 ? 1 : volume; p.unMute(); p.setVolume(rv * 100); setMuted(false); setVolume(rv); }
    else { p.mute(); setMuted(true); }
  };

  const changeVolume = (e) => {
    const p = playerRef.current;
    const val = parseFloat(e.target.value);
    if (!p) return;
    p.setVolume(val * 100);
    if (val === 0) p.mute(); else p.unMute();
    setVolume(val); setMuted(val === 0);
  };

  const seek = (e) => {
    const p = playerRef.current;
    if (!p || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const newTime = Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration));
    p.seekTo(newTime, true);
    setCurrentTime(newTime);
  };

  const toggleFullscreen = () => {
    const c = containerRef.current;
    if (!c) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
      return;
    }
    if (c.requestFullscreen) c.requestFullscreen().catch(() => {});
    else if (c.webkitRequestFullscreen) c.webkitRequestFullscreen();
  };

  const formatTime = (s) => { if (!s || isNaN(s)) return '0:00'; const m = Math.floor(s / 60); return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`; };

  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => { if (playing) setShowControls(false); }, 3000);
  };

  return (
    <div
      ref={containerRef}
      className="relative aspect-video bg-black rounded-4xl overflow-hidden group select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
    >
      <div ref={wrapperRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      <div className="absolute inset-0 z-10 cursor-pointer" onClick={togglePlay} />

      {!ready && (
        <div className="absolute inset-0 bg-black flex items-center justify-center z-30">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <div className={`absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-16 pb-4 px-5">
          <div className="mb-3 cursor-pointer group/bar" onClick={seek}>
            <div className="h-1 group-hover/bar:h-2 bg-white/20 rounded-full transition-all relative">
              <div className="absolute inset-y-0 left-0 bg-white/20 rounded-full" style={{ width: `${buffered}%` }} />
              <div className="h-full bg-brand-500 rounded-full relative z-10" style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover/bar:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={togglePlay} className="p-1.5 text-white hover:text-brand-300 transition-colors">
                {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" fill="white" />}
              </button>
              <div className="flex items-center gap-1 group/vol">
                <button onClick={toggleMute} className="p-1.5 text-white hover:text-brand-300 transition-colors">
                  {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : volume < 0.5 ? <Volume1 className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <div className="w-0 overflow-hidden transition-all duration-200 group-hover/vol:w-20">
                  <input type="range" min="0" max="1" step="0.05" value={volume} onChange={changeVolume} className="w-20 accent-brand-500 cursor-pointer" />
                </div>
              </div>
              <span className="text-white/80 text-xs font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
            </div>
            <button onClick={toggleFullscreen} className="p-1.5 text-white hover:text-brand-300 transition-colors">
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
