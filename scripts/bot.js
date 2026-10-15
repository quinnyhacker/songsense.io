// Dev helper: add simulated players to a game so you can try Song Sense alone.
//   node scripts/bot.js GSPY 2            (join room GSPY with 2 bots; BASE=http://localhost:3000 by default)
// Bots stay online, pick a word and add a song when it is their turn, and make wrong guesses otherwise.
const BASE = process.env.BASE || 'http://localhost:3000';
const [code, n = '2', offset = '0'] = process.argv.slice(2);
if (!code) { console.log('usage: node scripts/bot.js ROOMCODE [count]'); process.exit(1); }
const TRACKS = ['4cOdK2wGLETKBW3PvgPWqT', '7ouMYWpwJ422jRcDASZB7P', '3AJwUDP919kvQ9QcozQPxg'];
const api = async (p, b) => { const r = await fetch(BASE + '/api/' + p, b ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {}); return r.json().catch(() => ({})); };
for (let i = 0; i < Number(n); i++) (async () => {
  const name = ['Maya', 'Jordan', 'Sam', 'Kai', 'Riley', 'Alex', 'Taylor'][(i + Number(offset)) % 7];
  const me = await api('join', { code, name }); if (!me.pid) return console.log(name, 'could not join:', me.error);
  console.log(name, 'joined');
  let songs = 0;
  setInterval(async () => {
    const s = await api(`state?code=${code}&pid=${me.pid}&v=0`); if (s.error) return;
    if (s.phase === 'choosing' && s.me.isPicker) { songs = 0; api('choose', { ...me, index: 0 }); }
    if (s.phase === 'playing' && s.me.isPicker && songs === 0) { songs = 1; console.log('WORD', s.word); api('song', { ...me, trackId: TRACKS[Math.floor(Math.random() * 3)] }); }
    if (s.phase === 'playing' && !s.me.isPicker && !s.me.guessed && s.scoreClockStart && Math.random() < 0.08) api('guess', { ...me, text: ['hmm', 'is it fast?', 'no idea'][Math.floor(Math.random() * 3)] });
  }, 1000);
})();
