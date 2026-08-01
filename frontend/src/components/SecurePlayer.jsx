import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import { Shield, Lock, Play, Pause, Volume1, Volume2, VolumeX, Maximize, Settings, Cast, Airplay, PictureInPicture2, RotateCcw, RotateCw } from 'lucide-react';

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
const CAST_SDK_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
const DOUBLE_TAP_MS = 300;
const EDGE_ZONE = 0.35;

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
  const [pipActive, setPipActive] = useState(false);
  const controlsTimer = useRef(null);

  // Mobile double-tap-to-seek (edges of the video, YouTube-style)
  const [skipFlash, setSkipFlash] = useState(null); // 'left' | 'right' | null
  const lastTapRef = useRef({ time: 0, side: null });
  const tapTimerRef = useRef(null);
  const skipFlashTimerRef = useRef(null);

  // AirPlay (Safari/WebKit) state
  const [airplayAvailable, setAirplayAvailable] = useState(false);
  const [airplayActive, setAirplayActive] = useState(false);

  // Chromecast state
  const [castAvailable, setCastAvailable] = useState(false);
  const [casting, setCasting] = useState(false);
  const [castDeviceName, setCastDeviceName] = useState('');
  const [castBusy, setCastBusy] = useState(false);
  const castContextRef = useRef(null);
  const castPlayerRef = useRef(null);
  const castControllerRef = useRef(null);
  const wasPlayingBeforeCastRef = useRef(false);
  const castCleanupRef = useRef(null);
  // Always-fresh loader for the cast session — avoids stale closures inside the
  // SDK's event listeners, which are registered once when the SDK finishes loading.
  const loadCastMediaRef = useRef(() => {});

  // Load hls.js dynamically
  useEffect(() => {
    if (window.Hls) return;
    const script = document.createElement('script');
    script.src = HLS_CDN;
    script.async = true;
    document.head.appendChild(script);
    return () => {};
  }, []);

  // AirPlay availability — Safari/WebKit only. The target picker itself
  // (webkitShowPlaybackTargetPicker) needs no setup; we just track whether a
  // receiver is reachable so the button only shows up when it can do something.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !window.WebKitPlaybackTargetAvailabilityEvent) return;
    const onAvailability = (e) => setAirplayAvailable(e.availability === 'available');
    const onTargetChange = () => setAirplayActive(!!video.webkitCurrentPlaybackTargetIsWireless);
    video.addEventListener('webkitplaybacktargetavailabilitychanged', onAvailability);
    video.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', onTargetChange);
    return () => {
      video.removeEventListener('webkitplaybacktargetavailabilitychanged', onAvailability);
      video.removeEventListener('webkitcurrentplaybacktargetiswirelesschanged', onTargetChange);
    };
  }, []);

  // Chromecast — load the Cast Sender SDK once and wire a RemotePlayer that mirrors
  // the receiver's state back into this component's own play/pause/seek/volume UI.
  useEffect(() => {
    let cancelled = false;

    const setupCast = () => {
      if (cancelled || !window.cast?.framework || !window.chrome?.cast) return;

      const ctx = window.cast.framework.CastContext.getInstance();
      ctx.setOptions({
        receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });
      castContextRef.current = ctx;

      const remotePlayer = new window.cast.framework.RemotePlayer();
      const remoteController = new window.cast.framework.RemotePlayerController(remotePlayer);
      castPlayerRef.current = remotePlayer;
      castControllerRef.current = remoteController;

      const Evt = window.cast.framework.RemotePlayerEventType;

      const updateCastState = () => {
        setCastAvailable(ctx.getCastState() !== window.cast.framework.CastState.NO_DEVICES_AVAILABLE);
      };
      updateCastState();
      ctx.addEventListener(window.cast.framework.CastContextEventType.CAST_STATE_CHANGED, updateCastState);

      const onConnectedChanged = () => {
        const connected = remotePlayer.isConnected;
        setCasting(connected);
        if (connected) {
          const v = videoRef.current;
          wasPlayingBeforeCastRef.current = !!(v && !v.paused);
          if (v) v.pause();
          const session = ctx.getCurrentSession();
          setCastDeviceName(session?.getCastDevice()?.friendlyName || '');
          loadCastMediaRef.current();
        } else {
          setCastDeviceName('');
          const v = videoRef.current;
          if (v) {
            if (remotePlayer.currentTime) v.currentTime = remotePlayer.currentTime;
            if (wasPlayingBeforeCastRef.current) v.play().catch(() => {});
          }
        }
      };
      const onPausedChanged = () => { if (remotePlayer.isConnected) setPlaying(!remotePlayer.isPaused); };
      const onTimeChanged = () => { if (remotePlayer.isConnected) setCurrentTime(remotePlayer.currentTime || 0); };
      const onDurationChanged = () => { if (remotePlayer.isConnected) setDuration(remotePlayer.duration || 0); };
      const onVolumeChanged = () => { if (remotePlayer.isConnected) setVolume(remotePlayer.volumeLevel ?? 1); };
      const onMutedChanged = () => { if (remotePlayer.isConnected) setMuted(!!remotePlayer.isMuted); };
      const onPlayerStateChanged = () => { if (remotePlayer.isConnected) setCastBusy(remotePlayer.playerState === 'BUFFERING'); };

      remoteController.addEventListener(Evt.IS_CONNECTED_CHANGED, onConnectedChanged);
      remoteController.addEventListener(Evt.IS_PAUSED_CHANGED, onPausedChanged);
      remoteController.addEventListener(Evt.CURRENT_TIME_CHANGED, onTimeChanged);
      remoteController.addEventListener(Evt.DURATION_CHANGED, onDurationChanged);
      remoteController.addEventListener(Evt.VOLUME_LEVEL_CHANGED, onVolumeChanged);
      remoteController.addEventListener(Evt.IS_MUTED_CHANGED, onMutedChanged);
      remoteController.addEventListener(Evt.PLAYER_STATE_CHANGED, onPlayerStateChanged);

      // A session from a previous video/page might already be connected — IS_CONNECTED_CHANGED
      // only fires on transitions, so sync explicitly to pick up an in-progress cast session
      // (e.g. navigating to the next episode while still casting) and load this video onto it.
      if (remotePlayer.isConnected) onConnectedChanged();

      castCleanupRef.current = () => {
        ctx.removeEventListener(window.cast.framework.CastContextEventType.CAST_STATE_CHANGED, updateCastState);
        remoteController.removeEventListener(Evt.IS_CONNECTED_CHANGED, onConnectedChanged);
        remoteController.removeEventListener(Evt.IS_PAUSED_CHANGED, onPausedChanged);
        remoteController.removeEventListener(Evt.CURRENT_TIME_CHANGED, onTimeChanged);
        remoteController.removeEventListener(Evt.DURATION_CHANGED, onDurationChanged);
        remoteController.removeEventListener(Evt.VOLUME_LEVEL_CHANGED, onVolumeChanged);
        remoteController.removeEventListener(Evt.IS_MUTED_CHANGED, onMutedChanged);
        remoteController.removeEventListener(Evt.PLAYER_STATE_CHANGED, onPlayerStateChanged);
      };
    };

    if (window.cast?.framework) {
      setupCast();
    } else {
      window['__onGCastApiAvailable'] = (isAvailable) => { if (isAvailable) setupCast(); };
      if (!document.querySelector('script[data-cast-sdk]')) {
        const script = document.createElement('script');
        script.src = CAST_SDK_URL;
        script.async = true;
        script.setAttribute('data-cast-sdk', '1');
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (castCleanupRef.current) { castCleanupRef.current(); castCleanupRef.current = null; }
    };
  }, []);

  // Keep the cast media loader current — it needs the latest token/user/title, but
  // the SDK event listeners above are registered once, so they call through this ref.
  useEffect(() => {
    loadCastMediaRef.current = async () => {
      const session = castContextRef.current?.getCurrentSession();
      if (!session || !streamVideoId || !token) return;
      setCastBusy(true);
      try {
        const uid = String(user?.id || '');
        const { castToken, expires } = await api.streamCastToken(streamVideoId);
        const manifestUrl = `${window.location.origin}/stream/media/${streamVideoId}/master.m3u8`
          + `?t=${encodeURIComponent(token)}&uid=${encodeURIComponent(uid)}`
          + `&ct=${encodeURIComponent(castToken)}&cte=${expires}`;

        const mediaInfo = new window.chrome.cast.media.MediaInfo(manifestUrl, 'application/x-mpegURL');
        mediaInfo.streamType = window.chrome.cast.media.StreamType.BUFFERED;
        mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
        mediaInfo.metadata.title = title || 'Alleria';

        const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
        request.currentTime = videoRef.current?.currentTime || 0;
        request.autoplay = true;

        await session.loadMedia(request);
      } catch (err) {
        console.error('[SecurePlayer] Nie udało się przesłać strumienia na urządzenie:', err);
      } finally {
        setCastBusy(false);
      }
    };
  }, [streamVideoId, token, user, title]);

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
        setQualities(data.levels.map((l, i) => {
          // Only call out the frame rate for genuinely high-fps content (≥50, matching the
          // transcoding pipeline's own 60fps threshold) — standard 24/25/30fps stays plain
          // "720p" etc., same convention as YouTube ("1080p60" vs just "1080p").
          const fps = l.frameRate >= 50 ? Math.round(l.frameRate) : null;
          return {
            index: i,
            height: l.height,
            bitrate: l.bitrate,
            label: `${l.height}p${fps ? fps : ''}`
          };
        }));
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
    const onTime = () => {
      setCurrentTime(video.currentTime);
      if (onTimeUpdate) onTimeUpdate(video.currentTime, video.duration || 0);
    };
    const onDur = () => setDuration(video.duration);
    const onProgress = () => {
      if (video.buffered.length > 0 && video.duration > 0) {
        const end = video.buffered.end(video.buffered.length - 1);
        setBuffered((end / video.duration) * 100);
      }
    };
    const onEnterPiP = () => setPipActive(true);
    const onLeavePiP = () => setPipActive(false);

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('loadedmetadata', onDur);
    video.addEventListener('progress', onProgress);
    video.addEventListener('enterpictureinpicture', onEnterPiP);
    video.addEventListener('leavepictureinpicture', onLeavePiP);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('loadedmetadata', onDur);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('enterpictureinpicture', onEnterPiP);
      video.removeEventListener('leavepictureinpicture', onLeavePiP);
    };
  }, []);

  // Clear pending double-tap timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(tapTimerRef.current);
      clearTimeout(skipFlashTimerRef.current);
    };
  }, []);

  // Expose external control methods for Watch Party sync — routed to the cast
  // receiver while casting so party sync keeps working on the TV too.
  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      seek: (pos) => {
        if (casting && castControllerRef.current) {
          castPlayerRef.current.currentTime = pos;
          castControllerRef.current.seek();
          return;
        }
        if (videoRef.current) videoRef.current.currentTime = pos;
      },
      play: () => {
        if (casting && castControllerRef.current) {
          if (castPlayerRef.current.isPaused) castControllerRef.current.playOrPause();
          return;
        }
        if (videoRef.current) videoRef.current.play().catch(() => {});
      },
      pause: () => {
        if (casting && castControllerRef.current) {
          if (!castPlayerRef.current.isPaused) castControllerRef.current.playOrPause();
          return;
        }
        if (videoRef.current) videoRef.current.pause();
      },
      getCurrentTime: () => (casting && castPlayerRef.current ? castPlayerRef.current.currentTime : (videoRef.current?.currentTime ?? 0)),
    };
  });

  const togglePlay = () => {
    if (casting && castControllerRef.current) {
      castControllerRef.current.playOrPause();
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      if (onPlay) onPlay(v.currentTime);
    } else {
      v.pause();
      if (onPause) onPause(v.currentTime);
    }
  };

  const changeVolume = (e) => {
    const val = parseFloat(e.target.value);
    if (casting && castControllerRef.current) {
      castPlayerRef.current.volumeLevel = val;
      castControllerRef.current.setVolumeLevel();
      castPlayerRef.current.isMuted = val === 0;
      castControllerRef.current.muteOrUnmute();
      setVolume(val);
      setMuted(val === 0);
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
    setVolume(val);
    setMuted(val === 0);
  };

  const seek = (e) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const newTime = pct * duration;
    if (casting && castControllerRef.current) {
      castPlayerRef.current.currentTime = newTime;
      castControllerRef.current.seek();
      setCurrentTime(newTime);
      if (onSeek) onSeek(newTime);
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = newTime;
    if (onSeek) onSeek(newTime);
  };

  const skip = (seconds) => {
    if (casting && castControllerRef.current) {
      const cur = castPlayerRef.current.currentTime || 0;
      const newTime = Math.min(Math.max(cur + seconds, 0), duration || Infinity);
      castPlayerRef.current.currentTime = newTime;
      castControllerRef.current.seek();
      setCurrentTime(newTime);
      if (onSeek) onSeek(newTime);
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    const newTime = Math.min(Math.max(v.currentTime + seconds, 0), v.duration || Infinity);
    v.currentTime = newTime;
    if (onSeek) onSeek(newTime);
  };

  const adjustVolume = (delta) => {
    if (casting && castControllerRef.current) {
      const newVol = Math.min(Math.max((castPlayerRef.current.volumeLevel || 0) + delta, 0), 1);
      castPlayerRef.current.volumeLevel = newVol;
      castControllerRef.current.setVolumeLevel();
      castPlayerRef.current.isMuted = newVol === 0;
      castControllerRef.current.muteOrUnmute();
      setVolume(newVol);
      setMuted(newVol === 0);
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    const newVol = Math.min(Math.max(v.volume + delta, 0), 1);
    v.volume = newVol;
    v.muted = newVol === 0;
    setVolume(newVol);
    setMuted(newVol === 0);
  };

  const toggleMute = () => {
    if (casting && castControllerRef.current) {
      castPlayerRef.current.isMuted = !muted;
      castControllerRef.current.muteOrUnmute();
      setMuted(!muted);
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    if (muted) {
      const restoredVolume = volume === 0 ? 1 : volume;
      v.muted = false;
      v.volume = restoredVolume;
      setMuted(false);
      setVolume(restoredVolume);
    } else {
      v.muted = true;
      setMuted(true);
    }
  };

  const seekToPercent = (pct) => {
    if (casting && castControllerRef.current) {
      if (!duration) return;
      const newTime = (pct / 100) * duration;
      castPlayerRef.current.currentTime = newTime;
      castControllerRef.current.seek();
      setCurrentTime(newTime);
      if (onSeek) onSeek(newTime);
      return;
    }
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const newTime = (pct / 100) * v.duration;
    v.currentTime = newTime;
    if (onSeek) onSeek(newTime);
  };

  const frameStep = (dir) => {
    if (casting) return; // no frame-accurate seeking on a cast receiver
    const v = videoRef.current;
    if (!v) return;
    if (!v.paused) v.pause();
    v.currentTime = Math.min(Math.max(v.currentTime + dir * (1 / 30), 0), v.duration || Infinity);
  };

  // Mobile double-tap on the left/right edge of the video → skip ±10s (YouTube-style).
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

  const toggleCast = () => {
    const ctx = castContextRef.current;
    if (!ctx) return;
    if (casting) {
      ctx.endCurrentSession(true);
    } else {
      ctx.requestSession().catch((err) => {
        if (err !== 'cancel') console.error('[SecurePlayer] Nie udało się otworzyć okna Chromecast:', err);
      });
    }
  };

  const startAirPlay = () => {
    const v = videoRef.current;
    if (v && v.webkitShowPlaybackTargetPicker) v.webkitShowPlaybackTargetPicker();
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

  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (v.requestPictureInPicture) {
        await v.requestPictureInPicture();
      }
    } catch (e) {
      // PiP request rejected/unsupported — ignore
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
      tabIndex={0}
      className="relative aspect-video bg-black rounded-[32px] overflow-hidden group select-none outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
      onContextMenu={e => e.preventDefault()}
      onKeyDown={handlePlayerKeyDown}
      style={{
        // Anti-capture CSS: prevents screenshots in some contexts
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full outline-none"
        playsInline
        webkit-playsinline=""
        x5-playsinline=""
        tabIndex={-1}
        onClick={() => { togglePlay(); containerRef.current?.focus(); }}
        onTouchEnd={handleVideoTouchEnd}
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture={drmEnhanced}
        style={{ objectFit: 'contain' }}
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

      {/* Casting overlay — playback continues on the receiver device, controls below stay live */}
      {casting && (
        <div className="absolute inset-0 bg-black z-20 flex items-center justify-center">
          <div className="text-center p-8">
            <Cast className="w-14 h-14 text-violet-400 mx-auto mb-4" />
            <p className="text-white text-lg font-bold mb-1">
              {castBusy ? 'Łączenie z odbiornikiem...' : 'Przesyłanie na TV'}
            </p>
            {castDeviceName && <p className="text-zinc-400 text-sm mb-6">{castDeviceName}</p>}
            <button onClick={toggleCast} className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-sm transition-colors">
              Rozłącz
            </button>
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
              {/* AirPlay */}
              {airplayAvailable && (
                <button onClick={startAirPlay} className={`p-1.5 transition-colors ${airplayActive ? 'text-violet-400' : 'text-white hover:text-violet-400'}`} title="AirPlay">
                  <Airplay className="w-5 h-5" />
                </button>
              )}

              {/* Chromecast */}
              {castAvailable && (
                <button onClick={toggleCast} className={`p-1.5 transition-colors ${casting ? 'text-violet-400' : 'text-white hover:text-violet-400'}`} title="Chromecast">
                  <Cast className="w-5 h-5" />
                </button>
              )}

              {/* Quality selector — not applicable while casting, the receiver picks its own ABR level */}
              {qualities.length > 1 && !casting && (
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

              {/* Picture-in-Picture — blocked for DRM-enhanced content as part of anti-capture protections */}
              {!drmEnhanced && !casting && document.pictureInPictureEnabled && (
                <button onClick={togglePiP} className={`p-1.5 transition-colors ${pipActive ? 'text-violet-400' : 'text-white hover:text-violet-400'}`} title="Obraz w obrazie">
                  <PictureInPicture2 className="w-5 h-5" />
                </button>
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
