import React, { useEffect, useRef } from 'react';
import { loadYtApi } from '../utils/youtubeApi';

// Native YouTube UI (controls:1) but still polls playback position so "continue watching" works.
export default function YouTubeTrackingPlayer({ videoId, onTimeUpdate, controlRef, onPlayStateChange }) {
  const wrapperRef = useRef(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);
  const onPlayStateChangeRef = useRef(onPlayStateChange);
  useEffect(() => { onPlayStateChangeRef.current = onPlayStateChange; }, [onPlayStateChange]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !videoId) return;
    let destroyed = false, player = null, pollId = null;

    const reportTime = () => {
      if (!player) return;
      const ct = player.getCurrentTime?.() ?? 0;
      const dur = player.getDuration?.() ?? 0;
      if (dur > 0 && onTimeUpdateRef.current) onTimeUpdateRef.current(ct, dur);
    };
    const stopPoll = () => { if (pollId) { clearInterval(pollId); pollId = null; } };
    const startPoll = () => { stopPoll(); reportTime(); pollId = setInterval(reportTime, 2000); };

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
            if (controlRef) controlRef.current = {
              seek: (pos) => player.seekTo(pos, true),
              play: () => player.playVideo(),
              pause: () => player.pauseVideo(),
              getCurrentTime: () => player.getCurrentTime?.() ?? 0,
            };
          },
          onStateChange: ({ data }) => {
            if (data === window.YT.PlayerState.PLAYING) { startPoll(); onPlayStateChangeRef.current?.(true, player.getCurrentTime?.() ?? 0); }
            else { stopPoll(); if (data === window.YT.PlayerState.PAUSED) onPlayStateChangeRef.current?.(false, player.getCurrentTime?.() ?? 0); }
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
