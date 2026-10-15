'use strict';
// Runs inside a sandboxed iframe (no access to the app). Hosts Spotify's official embed through Spotify's iFrame API and relays
// play state to the game page, and play/pause/seek commands from it. Audio always comes from Spotify's own player.
(function () {
  const id = new URLSearchParams(location.search).get('id');
  if (!/^[A-Za-z0-9]{22}$/.test(id || '')) return;
  let ctrl = null;
  const up = (m) => parent.postMessage(Object.assign({ ss: 1 }, m), '*');
  window.onSpotifyIframeApiReady = (A) => {
    A.createController(document.getElementById('e'), { uri: 'spotify:track:' + id, width: '100%', height: 80 }, (c) => {
      ctrl = c;
      c.addListener('ready', () => up({ t: 'ready' }));
      c.addListener('playback_update', (e) => { const d = e.data || {}; up({ t: 'update', paused: !!d.isPaused, buffering: !!d.isBuffering, position: d.position || 0, duration: d.duration || 0 }); });
    });
  };
  const sc = document.createElement('script'); sc.src = 'https://open.spotify.com/embed/iframe-api/v1'; sc.async = true; document.head.appendChild(sc);
  addEventListener('message', (ev) => {
    if (ev.source !== parent || !ctrl) return; const m = ev.data || {}; if (m.ss !== 1) return;
    if (m.t === 'pause') ctrl.pause();
    else if (m.t === 'seek') ctrl.seek(Math.max(0, Number(m.sec) || 0));
    else if (m.t === 'playAt') { ctrl.play(); setTimeout(() => ctrl.seek(Math.max(0, Number(m.sec) || 0)), 350); }
  });
})();
