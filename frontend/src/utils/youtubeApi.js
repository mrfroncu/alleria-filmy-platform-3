// Shared YouTube IFrame API loader — robust polling, safe to call from multiple mounted players.
export function loadYtApi() {
  return new Promise((resolve) => {
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
