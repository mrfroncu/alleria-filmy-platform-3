import React, { useState, useEffect, useRef } from 'react';
import { Shield, Lock, Play, Pause, Volume1, Volume2, VolumeX, Maximize, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';

function loadHlsJs() {
  return new Promise((resolve) => {
    if (window.Hls) return resolve();
    const existing = document.getElementById('hls-js-cdn');
    if (existing) { existing.addEventListener('load', () => resolve()); return; }
    const script = document.createElement('script');
    script.id = 'hls-js-cdn';
    script.src = HLS_CDN;
    script.async = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

// Full custom-chrome HLS player with DRM protections for self-hosted streams:
// AES-128 encrypted HLS via hls.js, token-authenticated key delivery, anti-inspect /
// anti-capture heuristics, watermark overlay, multi-quality selector with fps labeling.
export default function SecurePlayer({ streamVideoId, drmEnhanced, title, controlRef, onTimeUpdate, onPlay, onPause, onSeek }) {
  const { user } = useAuth();
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hlsRef = useRef(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [qualities, setQualities] = useState([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [showControls, setShowControls] = useState(true);
  const [showQuality, setShowQuality] = useState(false);
  const [captureDetected, setCaptureDetected] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const controlsTimer = useRef(null);

  useEffect(() => { loadHlsJs(); }, []);

  useEffect(() => {
    if (!streamVideoId) return;
    fetch(`/api/stream/token/${streamVideoId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((t) => setToken(t.token))
      .catch((err) => setError('Nie udało się uzyskać tokenu: ' + err.message));
  }, [streamVideoId]);

  useEffect(() => {
    if (!token || !streamVideoId) return;
    let cancelled = false;

    loadHlsJs().then(() => {
      if (cancelled) return;
      const video = videoRef.current;
      if (!video) return;
      const manifestUrl = `/stream/media/${streamVideoId}/master.m3u8`;

      if (window.Hls?.isSupported()) {
        const hls = new window.Hls({
          xhrSetup: (xhr, url) => {
            if (url.includes('TOKEN_PLACEHOLDER')) {
              const newUrl = url.replace('TOKEN_PLACEHOLDER', token).replace('UID_PLACEHOLDER', String(user?.id || ''));
              xhr.open('GET', newUrl, true);
            }
          },
          enableWorker: true,
        });
        hls.loadSource(manifestUrl);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.MANIFEST_PARSED, (e, data) => {
          setLoading(false);
          setQualities(data.levels.map((l, i) => {
            const fps = l.frameRate >= 50 ? Math.round(l.frameRate) : null;
            return { index: i, height: l.height, bitrate: l.bitrate, label: `${l.height}p${fps ? fps : ''}` };
          }));
        });
        hls.on(window.Hls.Events.ERROR, (e, data) => {
          if (data.fatal) setError('Błąd odtwarzania: ' + data.details);
        });
        hlsRef.current = hls;
        return () => hls.destroy();
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = manifestUrl;
        video.addEventListener('loadedmetadata', () => setLoading(false));
      } else {
        setError('Przeglądarka nie obsługuje HLS.');
      }
    });

    return () => { cancelled = true; if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [token, streamVideoId, user]);

  // Anti-inspect / anti-capture (only when drmEnhanced)
  useEffect(() => {
    if (!drmEnhanced) return;
    const handleContextMenu = (e) => e.preventDefault();
    const devtoolsCheck = setInterval(() => {
      if (window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160) setCaptureDetected(true);
    }, 2000);
    const handleKeyDown = (e) => {
      if (e.key === 'F12') e.preventDefault();
      if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key)) e.preventDefault();
      if (e.ctrlKey && e.key === 'u') e.preventDefault();
      if (e.key === 'PrintScreen') setCaptureDetected(true);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && videoRef.current && !videoRef.current.paused) videoRef.current.pause();
    };
    let captureInterval = null;
    if (navigator.mediaDevices && navigator.permissions?.query) {
      captureInterval = setInterval(async () => {
        try {
          const result = await navigator.permissions.query({ name: 'display-capture' });
          if (result.state === 'granted' && videoRef.current && !videoRef.current.paused) {
            setCaptureDetected(true);
            videoRef.current.pause();
          }
        } catch (_) {}
      }, 3000);
    }
    const video = videoRef.current;
    if (video) video.disablePictureInPicture = true;
    const container = containerRef.current;
    if (container) container.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(devtoolsCheck);
      if (captureInterval) clearInterval(captureInterval);
      if (container) container.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [drmEnhanced]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlayEvt = () => setPlaying(true);
    const onPauseEvt = () => setPlaying(false);
    const onTime = () => { setCurrentTime(video.currentTime); if (onTimeUpdate) onTimeUpdate(video.currentTime, video.duration || 0); };
    const onDur = () => setDuration(video.duration);
    const onProgress = () => {
      if (video.buffered.length > 0 && video.duration > 0) setBuffered((video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
    };
    video.addEventListener('play', onPlayEvt);
    video.addEventListener('pause', onPauseEvt);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('loadedmetadata', onDur);
    video.addEventListener('progress', onProgress);
    return () => {
      video.removeEventListener('play', onPlayEvt);
      video.removeEventListener('pause', onPauseEvt);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('loadedmetadata', onDur);
      video.removeEventListener('progress', onProgress);
    };
  }, [onTimeUpdate]);

  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      seek: (pos) => { if (videoRef.current) videoRef.current.currentTime = pos; },
      play: () => { if (videoRef.current) videoRef.current.play().catch(() => {}); },
      pause: () => { if (videoRef.current) videoRef.current.pause(); },
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
    };
  });

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); onPlay?.(v.currentTime); }
    else { v.pause(); onPause?.(v.currentTime); }
  };

  const changeVolume = (e) => {
    const v = videoRef.current;
    const val = parseFloat(e.target.value);
    if (!v) return;
    v.volume = val; v.muted = val === 0;
    setVolume(val); setMuted(val === 0);
  };

  const seek = (e) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const newTime = ((e.clientX - rect.left) / rect.width) * duration;
    v.currentTime = newTime;
    onSeek?.(newTime);
  };

  const changeQuality = (idx) => {
    if (hlsRef.current) { hlsRef.current.currentLevel = idx; setCurrentQuality(idx); }
    setShowQuality(false);
  };

  const toggleFullscreen = () => {
    const c = containerRef.current;
    const v = videoRef.current;
    if (!c) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
      return;
    }
    if (c.requestFullscreen) c.requestFullscreen().catch(() => {});
    else if (c.webkitRequestFullscreen) c.webkitRequestFullscreen();
    else if (v?.webkitEnterFullscreen) v.webkitEnterFullscreen();
  };

  const formatTime = (s) => { if (!s || isNaN(s)) return '0:00'; const m = Math.floor(s / 60); return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`; };

  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => { if (playing) setShowControls(false); }, 3000);
  };

  if (error) {
    return (
      <div className="aspect-video bg-black rounded-4xl flex items-center justify-center">
        <div className="text-center p-8">
          <Shield className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <p className="text-rose-300 text-sm font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative aspect-video bg-black rounded-4xl overflow-hidden group select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full"
        playsInline
        onClick={togglePlay}
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        style={{ objectFit: 'contain' }}
      />

      {drmEnhanced && user && (
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden opacity-[0.03]" style={{ mixBlendMode: 'difference' }}>
          <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-24 -rotate-12">
            {Array(12).fill(null).map((_, i) => (
              <span key={i} className="text-white text-lg font-bold whitespace-nowrap font-mono">{user.display_name || user.username} · ID:{user.id}</span>
            ))}
          </div>
        </div>
      )}

      {captureDetected && drmEnhanced && (
        <div className="absolute inset-0 bg-black z-50 flex items-center justify-center">
          <div className="text-center p-8">
            <Lock className="w-16 h-16 text-rose-500 mx-auto mb-4" />
            <p className="text-white text-lg font-bold mb-2">Przechwytywanie zablokowane</p>
            <p className="text-slate-400 text-sm">Zamknij narzędzia deweloperskie, aby kontynuować oglądanie.</p>
            <button onClick={() => setCaptureDetected(false)} className="mt-6 px-6 py-3 bg-brand-500 text-white rounded-2xl font-bold text-sm hover:bg-brand-600 transition-colors">Sprawdź ponownie</button>
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 bg-black flex items-center justify-center z-30">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400 text-sm">Ładowanie streamu...</p>
          </div>
        </div>
      )}

      {drmEnhanced && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-black/60 backdrop-blur rounded-xl">
          <Shield className="w-3.5 h-3.5 text-teal-400" />
          <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">DRM Protected</span>
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
                <button
                  onClick={() => {
                    const v = videoRef.current;
                    if (!v) return;
                    if (muted) { const rv = volume === 0 ? 1 : volume; v.muted = false; v.volume = rv; setMuted(false); setVolume(rv); }
                    else { v.muted = true; setMuted(true); }
                  }}
                  className="p-1.5 text-white hover:text-brand-300 transition-colors"
                >
                  {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : volume < 0.5 ? <Volume1 className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <div className="w-0 overflow-hidden transition-all duration-200 group-hover/vol:w-20">
                  <input type="range" min="0" max="1" step="0.05" value={volume} onChange={changeVolume} className="w-20 accent-brand-500 cursor-pointer" />
                </div>
              </div>
              <span className="text-white/80 text-xs font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
            </div>

            <div className="flex items-center gap-2">
              {qualities.length > 1 && (
                <div className="relative">
                  <button onClick={() => setShowQuality(!showQuality)} className="p-1.5 text-white hover:text-brand-300 transition-colors flex items-center gap-1">
                    <Settings className="w-4 h-4" />
                    <span className="text-[11px] font-bold">{currentQuality === -1 ? 'Auto' : qualities.find((q) => q.index === currentQuality)?.label || 'Auto'}</span>
                  </button>
                  {showQuality && (
                    <div className="absolute bottom-full right-0 mb-2 bg-black/90 backdrop-blur rounded-xl border border-white/10 py-1 min-w-[120px]">
                      <button onClick={() => changeQuality(-1)} className={`w-full text-left px-4 py-2 text-sm ${currentQuality === -1 ? 'text-brand-300 font-bold' : 'text-white'} hover:bg-white/10`}>Auto</button>
                      {qualities.map((q) => (
                        <button key={q.index} onClick={() => changeQuality(q.index)} className={`w-full text-left px-4 py-2 text-sm ${currentQuality === q.index ? 'text-brand-300 font-bold' : 'text-white'} hover:bg-white/10`}>{q.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button onClick={toggleFullscreen} className="p-1.5 text-white hover:text-brand-300 transition-colors">
                <Maximize className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
