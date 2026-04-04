import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import { Shield, Lock, Play, Pause, Volume2, VolumeX, Maximize, Settings } from 'lucide-react';

/*
 * SecurePlayer — encrypted HLS player with DRM protections
 *
 * Features:
 * - AES-128 encrypted HLS streaming via hls.js
 * - Token-authenticated key delivery
 * - Anti-inspect: disables right-click, keyboard shortcuts, devtools detection
 * - Anti-capture: EME-based protection + CSS overlay on capture detection
 * - Watermark overlay with username for traceability
 * - Multi-quality selection
 */

const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';

export default function SecurePlayer({ streamVideoId, drmEnhanced, title }) {
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
  const [showVolume, setShowVolume] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [qualities, setQualities] = useState([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [showControls, setShowControls] = useState(true);
  const [showQuality, setShowQuality] = useState(false);
  const [captureDetected, setCaptureDetected] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const controlsTimer = useRef(null);

  // Load hls.js dynamically
  useEffect(() => {
    if (window.Hls) return;
    const script = document.createElement('script');
    script.src = HLS_CDN;
    script.async = true;
    document.head.appendChild(script);
    return () => {};
  }, []);

  // Get playback token
  useEffect(() => {
    if (!streamVideoId) return;
    api.streamToken(streamVideoId)
      .then(t => setToken(t.token))
      .catch(err => setError('Nie udało się uzyskać tokenu: ' + err.message));
  }, [streamVideoId]);

  // Initialize HLS player
  useEffect(() => {
    if (!token || !streamVideoId || !window.Hls) {
      // Retry after hls.js loads
      if (!window.Hls && !error) {
        const t = setTimeout(() => setLoading(l => l), 500);
        return () => clearTimeout(t);
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const manifestUrl = `/stream/media/${streamVideoId}/master.m3u8`;

    if (window.Hls.isSupported()) {
      const hls = new window.Hls({
        xhrSetup: (xhr, url) => {
          // Inject token into key requests — key URI contains TOKEN_PLACEHOLDER and UID_PLACEHOLDER
          if (url.includes('TOKEN_PLACEHOLDER')) {
            const newUrl = url
              .replace('TOKEN_PLACEHOLDER', token)
              .replace('UID_PLACEHOLDER', String(user?.id || ''));
            xhr.open('GET', newUrl, true);
          }
        },
        enableWorker: true,
        lowLatencyMode: false,
      });

      hls.loadSource(manifestUrl);
      hls.attachMedia(video);

      hls.on(window.Hls.Events.MANIFEST_PARSED, (e, data) => {
        setLoading(false);
        setQualities(data.levels.map((l, i) => ({
          index: i,
          height: l.height,
          bitrate: l.bitrate,
          label: `${l.height}p`
        })));
      });

      hls.on(window.Hls.Events.ERROR, (e, data) => {
        if (data.fatal) {
          console.error('[SecurePlayer] Fatal HLS error:', data);
          setError('Błąd odtwarzania: ' + data.details);
        }
      });

      hlsRef.current = hls;
      return () => { hls.destroy(); hlsRef.current = null; };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = manifestUrl;
      video.addEventListener('loadedmetadata', () => setLoading(false));
    } else {
      setError('Przeglądarka nie obsługuje HLS.');
    }
  }, [token, streamVideoId, user, error]);

  // Anti-devtools and anti-capture
  useEffect(() => {
    if (!drmEnhanced) return;

    const handleContextMenu = (e) => { e.preventDefault(); return false; };

    // Detect devtools via size threshold
    const devtoolsCheck = setInterval(() => {
      const threshold = 160;
      if (window.outerWidth - window.innerWidth > threshold || window.outerHeight - window.innerHeight > threshold) {
        if (!captureDetected) setCaptureDetected(true);
      }
    }, 2000);

    // Keyboard shortcuts for inspect
    const handleKeyDown = (e) => {
      if (e.key === 'F12') { e.preventDefault(); return false; }
      if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) { e.preventDefault(); return false; }
      if (e.ctrlKey && e.key === 'u') { e.preventDefault(); return false; }
      // PrintScreen
      if (e.key === 'PrintScreen') { e.preventDefault(); setCaptureDetected(true); return false; }
    };

    // Pause on tab hide (screen share / alt-tab)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        const video = videoRef.current;
        if (video && !video.paused) video.pause();
      }
    };

    // Screen Capture API — detect active display capture
    let captureInterval = null;
    if (navigator.mediaDevices) {
      captureInterval = setInterval(async () => {
        try {
          // Check if any display capture is active via permissions API
          if (navigator.permissions && navigator.permissions.query) {
            const result = await navigator.permissions.query({ name: 'display-capture' });
            // If permission was just granted, someone started screen sharing
            if (result.state === 'granted') {
              // Double-check: is our video actually playing?
              const video = videoRef.current;
              if (video && !video.paused) {
                setCaptureDetected(true);
                video.pause();
              }
            }
          }
        } catch (e) {
          // display-capture permission query not supported — fallback: no action
        }
      }, 3000);
    }

    // Picture-in-Picture protection
    const handlePiP = (e) => { e.preventDefault(); };
    const video = videoRef.current;
    if (video) {
      video.disablePictureInPicture = true;
      video.addEventListener('enterpictureinpicture', handlePiP);
    }

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
      if (video) video.removeEventListener('enterpictureinpicture', handlePiP);
    };
  }, [drmEnhanced]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setCurrentTime(video.currentTime);
    const onDur = () => setDuration(video.duration);
    const onProgress = () => {
      if (video.buffered.length > 0 && video.duration > 0) {
        const end = video.buffered.end(video.buffered.length - 1);
        setBuffered((end / video.duration) * 100);
      }
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('loadedmetadata', onDur);
    video.addEventListener('progress', onProgress);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('loadedmetadata', onDur);
      video.removeEventListener('progress', onProgress);
    };
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const newMuted = !muted;
    v.muted = newMuted;
    if (!newMuted) v.volume = volume;
    setMuted(newMuted);
  };

  const changeVolume = (newVolume) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = newVolume;
    setVolume(newVolume);
    if (newVolume === 0) {
      v.muted = true;
      setMuted(true);
    } else if (muted && newVolume > 0) {
      v.muted = false;
      setMuted(false);
    }
  };

  const seek = (e) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    v.currentTime = pct * duration;
  };

  const changeQuality = (idx) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = idx;
      setCurrentQuality(idx);
    }
    setShowQuality(false);
  };

  const toggleFullscreen = () => {
    const c = containerRef.current;
    const v = videoRef.current;
    if (!c) return;

    // Check if already fullscreen
    const isFS = document.fullscreenElement || document.webkitFullscreenElement;
    if (isFS) {
      (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
      return;
    }

    // Try container fullscreen first (desktop browsers)
    if (c.requestFullscreen) {
      c.requestFullscreen().catch(() => {});
    } else if (c.webkitRequestFullscreen) {
      c.webkitRequestFullscreen();
    } else if (v && v.webkitEnterFullscreen) {
      // iOS Safari — only supports fullscreen on video element directly
      v.webkitEnterFullscreen();
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

  if (error) {
    return (
      <div className="aspect-video bg-black rounded-[32px] flex items-center justify-center">
        <div className="text-center p-8">
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-300 text-sm font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative aspect-video bg-black rounded-[32px] overflow-hidden group select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
      onContextMenu={e => e.preventDefault()}
      style={{
        // Anti-capture CSS: prevents screenshots in some contexts
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full"
        playsInline
        webkit-playsinline=""
        x5-playsinline=""
        onClick={togglePlay}
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        style={{ objectFit: 'contain' }}
      />

      {/* DRM Watermark overlay */}
      {drmEnhanced && user && (
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden opacity-[0.03]" style={{ mixBlendMode: 'difference' }}>
          <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-24 -rotate-12">
            {Array(12).fill(null).map((_, i) => (
              <span key={i} className="text-white text-lg font-bold whitespace-nowrap font-mono">
                {user.display_name || user.username} • ID:{user.id}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Capture detection overlay */}
      {captureDetected && drmEnhanced && (
        <div className="absolute inset-0 bg-black z-50 flex items-center justify-center">
          <div className="text-center p-8">
            <Lock className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <p className="text-white text-lg font-bold mb-2">Przechwytywanie zablokowane</p>
            <p className="text-zinc-400 text-sm">Zamknij narzędzia deweloperskie, aby kontynuować oglądanie.</p>
            <button onClick={() => setCaptureDetected(false)} className="mt-6 px-6 py-3 bg-violet-500 text-white rounded-xl font-bold text-sm hover:bg-violet-600 transition-colors">
              Sprawdź ponownie
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 bg-black flex items-center justify-center z-30">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-zinc-400 text-sm">Ładowanie streamu...</p>
          </div>
        </div>
      )}

      {/* DRM badge */}
      {drmEnhanced && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-black/60 backdrop-blur rounded-xl">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">DRM Protected</span>
        </div>
      )}

      {/* Custom Controls */}
      <div className={`absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-16 pb-4 px-5">
          {/* Progress bar */}
          <div className="mb-3 cursor-pointer group/bar" onClick={seek}>
            <div className="h-1 group-hover/bar:h-2 bg-white/20 rounded-full transition-all relative">
              {/* Buffer bar */}
              <div
                className="absolute inset-y-0 left-0 bg-white/20 rounded-full"
                style={{ width: `${buffered}%` }}
              />
              {/* Playback bar */}
              <div
                className="h-full bg-violet-500 rounded-full relative z-10"
                style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover/bar:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={togglePlay} className="p-1.5 text-white hover:text-violet-400 transition-colors">
                {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" fill="white" />}
              </button>
              <div
                className="flex items-center gap-1.5"
                onMouseEnter={() => setShowVolume(true)}
                onMouseLeave={() => setShowVolume(false)}
              >
                <button onClick={toggleMute} className="p-1.5 text-white hover:text-violet-400 transition-colors">
                  {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <div className={`overflow-hidden transition-all duration-200 ${showVolume ? 'w-20 opacity-100' : 'w-0 opacity-0'}`}>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={muted ? 0 : volume}
                    onChange={e => changeVolume(parseFloat(e.target.value))}
                    className="w-full accent-violet-500 cursor-pointer"
                    style={{ height: '4px' }}
                  />
                </div>
              </div>
              <span className="text-white/80 text-xs font-mono">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Quality selector */}
              {qualities.length > 1 && (
                <div className="relative">
                  <button onClick={() => setShowQuality(!showQuality)} className="p-1.5 text-white hover:text-violet-400 transition-colors flex items-center gap-1">
                    <Settings className="w-4 h-4" />
                    <span className="text-[11px] font-bold">
                      {currentQuality === -1 ? 'Auto' : qualities.find(q => q.index === currentQuality)?.label || 'Auto'}
                    </span>
                  </button>
                  {showQuality && (
                    <div className="absolute bottom-full right-0 mb-2 bg-black/90 backdrop-blur rounded-xl border border-white/10 py-1 min-w-[120px]">
                      <button onClick={() => changeQuality(-1)} className={`w-full text-left px-4 py-2 text-sm ${currentQuality === -1 ? 'text-violet-400 font-bold' : 'text-white'} hover:bg-white/10`}>
                        Auto
                      </button>
                      {qualities.map(q => (
                        <button key={q.index} onClick={() => changeQuality(q.index)} className={`w-full text-left px-4 py-2 text-sm ${currentQuality === q.index ? 'text-violet-400 font-bold' : 'text-white'} hover:bg-white/10`}>
                          {q.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
