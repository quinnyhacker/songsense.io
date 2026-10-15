// Song Sense - Node server (no runtime dependencies). All game state is authoritative here and held in memory.
// The secret word never leaves the server except to the picker (and to players after they guess it or the round ends).
// Secrets (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET) come from the environment only, never the browser.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const words = require('./lib/words');
const { judge, mask } = require('./lib/match');
const { guessPoints, pickerPoints } = require('./lib/scoring');
const { limiter } = require('./lib/ratelimit');

const PORT = process.env.PORT || 3000;
const HAS_SEARCH = !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
const TRUST_PROXY = process.env.TRUST_PROXY !== '0';
// Test hook: scale all game timers (e.g. SPEED=0.05) so automated tests do not wait for real clocks.
const SPEED = Number(process.env.SPEED) > 0 ? Number(process.env.SPEED) : 1;
const T = (ms) => Math.max(200, Math.round(ms * SPEED));
const rooms = new Map();
const MAX_BODY = 20 * 1024;
const MAX_PLAYERS = 12, MIN_PLAYERS = 2;
const MAX_SONGS = 3;
const ROOM_IDLE_MS = 3 * 3600 * 1000;
const ONLINE_MS = 15000, HOST_AWAY_MS = 60000, PLAYER_DROP_MS = 20 * 60000;
const CHOOSE_MS = 20000, FIRST_SONG_MS = 60000, RESULTS_MS = 14000;
const SECS_OPTIONS = [60, 90, 120], MAX_CYCLES = 3;

const rid = (n = 8) => crypto.randomBytes(n).toString('hex');
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().replace(/\s+/g, ' ').slice(0, 20);
const cleanText = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const httpErr = (code, msg) => { const e = new Error(msg); e.status = code; return e; };
const CODE_RE = /^[A-Z]{4}$/, PID_RE = /^[a-f0-9]{16}$/;
const setClock = (room, ms) => { room.deadline = Date.now() + ms; room.span = ms; };
const touch = (room) => { room.v++; room.updated = Date.now(); };
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };

function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += chars[crypto.randomInt(chars.length)]; if (!rooms.has(c)) return c; }
}

/* ---------- rate limits (per client IP) ---------- */
const limits = { global: limiter(2400, 60000), create: limiter(20, 600000), join: limiter(60, 600000), search: limiter(60, 60000), song: limiter(40, 60000), guess: limiter(240, 60000) };
const clientIp = (req) => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
function limit(name, req) { const r = limits[name](clientIp(req)); if (!r.ok) { const e = httpErr(429, `You're doing that a lot. Try again in ${r.retry}s.`); e.retry = r.retry; throw e; } }

/* ---------- Spotify (search by server-side client credentials; playback only via official embeds) ---------- */
const TRACK_RE = /(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/;
const parseTrackId = (s) => { const m = TRACK_RE.exec(String(s || '')); return m ? m[1] : null; };
async function trackMeta(id) {
  try {
    const r = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent('https://open.spotify.com/track/' + id), { signal: AbortSignal.timeout(5000) });
    if (r.status === 404 || r.status === 400) return null;       // not a real track
    if (r.ok) { const j = await r.json(); return { title: String(j.title || 'Unknown track').slice(0, 120), thumb: /^https:\/\//.test(j.thumbnail_url || '') ? j.thumbnail_url : '' }; }
  } catch { /* network hiccup: fall through */ }
  return { title: 'Spotify track', thumb: '' };
}
let tokenCache = { token: null, exp: 0 };
async function spotifyToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const basic = Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64');
  const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials', signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error('token');
  const j = await r.json(); tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 }; return tokenCache.token;
}
async function search(q) {
  const token = await spotifyToken();
  const r = await fetch('https://api.spotify.com/v1/search?type=track&limit=10&q=' + encodeURIComponent(q), { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(6000) });
  if (r.status === 401) tokenCache = { token: null, exp: 0 };
  if (!r.ok) throw new Error('search ' + r.status);
  const j = await r.json();
  return j.tracks.items.map((t) => ({ id: t.id, title: t.name, artist: t.artists.map((a) => a.name).join(', '), thumb: (t.album.images[t.album.images.length - 2] || t.album.images[0] || {}).url || '' }));
}

/* ---------- room helpers ---------- */
function getRoom(code, pid) {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room) throw httpErr(404, 'We couldn\'t find that game. It may have ended, or the code is wrong.');
  if (pid !== undefined) { if (!room.players[pid]) throw httpErr(404, 'You\'re no longer in this game.'); room.players[pid].lastSeen = Date.now(); }
  room.active = Date.now();
  return room;
}
const hostOnly = (room, pid) => { if (pid !== room.hostId) throw httpErr(403, 'Only the host can do that.'); };
const isOnline = (p) => Date.now() - p.lastSeen < ONLINE_MS;
const orderedIds = (room) => Object.keys(room.players).sort((a, b) => room.players[a].joinedAt - room.players[b].joinedAt);
const nextHost = (room) => { const ids = orderedIds(room); return ids.find((i) => isOnline(room.players[i])) || ids[0]; };
const inGame = (room) => room.phase === 'choosing' || room.phase === 'playing' || room.phase === 'roundend';
const guessers = (room) => orderedIds(room).filter((id) => id !== room.pickerId);
function say(room, kind, text, extra = {}) { room.chat.push({ id: ++room.chatSeq, t: Date.now(), kind, text, vis: 'all', ...extra }); if (room.chat.length > 120) room.chat.splice(0, room.chat.length - 120); }

function viewFor(room, pid) {
  const me = room.players[pid], isPicker = pid === room.pickerId, now = Date.now();
  const revealed = room.phase === 'roundend' || room.phase === 'gameover';
  const players = orderedIds(room).map((id) => { const p = room.players[id];
    return { id, name: p.name, score: p.score, isHost: id === room.hostId, online: isOnline(p), isPicker: inGame(room) && id === room.pickerId, guessed: !!room.guessed[id], gain: revealed ? (room.gains[id] || 0) : 0 }; });
  const out = { v: room.v, now, code: room.code, phase: room.phase, round: room.round, totalRounds: room.round + room.queue.length, settings: room.settings,
    me: { id: pid, name: me.name, isHost: pid === room.hostId, isPicker, guessed: !!room.guessed[pid] }, players, pickerId: inGame(room) ? room.pickerId : null,
    deadline: room.deadline, span: room.span, scoreClockStart: room.firstSongAt, songs: room.songs.map((s, i) => ({ n: i + 1, trackId: s.trackId, title: s.title, thumb: s.thumb })), maxSongs: MAX_SONGS };
  if (room.phase === 'choosing' && isPicker) out.options = room.options.map((o) => ({ word: o.word, category: o.category }));
  if (room.phase === 'playing' || room.phase === 'roundend') {
    const known = isPicker || room.guessed[pid] || room.phase === 'roundend';
    out.word = known ? room.word.word : null;
    out.mask = mask(room.word.word); out.category = room.word.category;
  }
  if (room.phase === 'roundend') out.result = room.result;
  if (room.phase === 'gameover') out.final = room.final;
  const guessedOrPicker = isPicker || !!room.guessed[pid];
  out.chat = room.chat.filter((m) => m.vis === 'all' || m.vis === pid || (m.vis === 'guessed' && (room.phase !== 'playing' || guessedOrPicker))).slice(-60)
    .map((m) => ({ id: m.id, kind: m.kind, name: m.name, text: m.text, group: m.vis === 'guessed' }));
  return out;
}

/* ---------- game flow ---------- */
function pool(room) {
  const all = [];
  for (const c of room.settings.cats) for (const w of words.CATEGORIES[c] || []) all.push({ ...w, category: c });
  return all;
}
function startNextRound(room) {
  while (room.queue.length && !room.players[room.queue[0]]) room.queue.shift();
  if (!room.queue.length || Object.keys(room.players).length < MIN_PLAYERS) return finishGame(room);
  room.pickerId = room.queue.shift(); room.round++;
  const fresh = pool(room).filter((w) => !room.usedWords.has(w.word)); const src = fresh.length >= 3 ? fresh : pool(room);
  room.options = shuffle(src).slice(0, 3); room.word = null; room.songs = []; room.guessed = {}; room.gains = {}; room.firstSongAt = null; room.result = null;
  room.phase = 'choosing'; setClock(room, T(CHOOSE_MS));
  say(room, 'sys', `Round ${room.round}: ${room.players[room.pickerId].name} is picking a word.`);
  touch(room);
}
function chooseWord(room, idx) {
  room.word = room.options[idx]; room.usedWords.add(room.word.word); room.options = [];
  room.phase = 'playing'; setClock(room, T(FIRST_SONG_MS));
  say(room, 'sys', `${room.players[room.pickerId].name} picked a ${room.word.category.replace(/s$/, '')}. Guesses open when the first song is added.`);
  touch(room);
}
function endRound(room, reason) {
  if (room.phase !== 'playing' && room.phase !== 'choosing') return;
  const picker = room.players[room.pickerId];
  if (picker && room.gains[room.pickerId]) picker.score += room.gains[room.pickerId];
  const order = Object.entries(room.guessed).sort((a, b) => a[1].at - b[1].at).map(([id, g]) => ({ id, name: (room.players[id] || { name: 'Someone' }).name, points: g.points, songs: g.songs }));
  room.result = { reason, word: room.word ? room.word.word : null, category: room.word ? room.word.category : null, pickerId: room.pickerId, pickerName: picker ? picker.name : 'The picker',
    pickerPoints: room.gains[room.pickerId] || 0, guessers: order, missed: guessers(room).filter((id) => !room.guessed[id]).map((id) => room.players[id].name), songs: room.songs.map((s) => ({ trackId: s.trackId, title: s.title })) };
  room.phase = 'roundend'; setClock(room, T(RESULTS_MS));
  if (room.word) say(room, 'sys', `The answer was “${room.word.word}”.`);
  touch(room);
}
function finishGame(room) {
  room.phase = 'gameover'; room.pickerId = null; room.deadline = null; room.word = null; room.songs = []; room.options = [];
  room.final = orderedIds(room).map((id) => ({ id, name: room.players[id].name, score: room.players[id].score })).sort((a, b) => b.score - a.score);
  say(room, 'sys', 'Game over!'); touch(room);
}
function maybeEarlyEnd(room) {
  if (room.phase !== 'playing' || !room.firstSongAt) return;
  const g = guessers(room).filter((id) => isOnline(room.players[id]) || room.guessed[id]);
  if (g.length && g.every((id) => room.guessed[id])) endRound(room, 'everyone');
}
function removePlayer(room, pid) {
  const p = room.players[pid]; if (!p) return;
  const wasPicker = inGame(room) && room.pickerId === pid;
  delete room.players[pid]; delete room.guessed[pid];
  if (!Object.keys(room.players).length) { rooms.delete(room.code); return; }
  room.queue = room.queue.filter((x) => x !== pid);
  if (room.hostId === pid) room.hostId = nextHost(room);
  say(room, 'sys', `${p.name} left.`);
  if (inGame(room) && Object.keys(room.players).length < MIN_PLAYERS) finishGame(room);
  else if (wasPicker && (room.phase === 'choosing' || room.phase === 'playing')) endRound(room, 'pickerleft');
  else if (room.phase === 'playing') maybeEarlyEnd(room);
  touch(room);
}
function tick(room) {
  const now = Date.now();
  if (room.phase === 'choosing' && now >= room.deadline) chooseWord(room, crypto.randomInt(room.options.length));
  else if (room.phase === 'playing') {
    if (!room.firstSongAt && now >= room.deadline) endRound(room, 'nosong');
    else if (room.firstSongAt && now >= room.deadline) endRound(room, 'time');
  } else if (room.phase === 'roundend' && now >= room.deadline) startNextRound(room);
}

/* ---------- routes ---------- */
const settingsFrom = (b, cur) => {
  const cats = Array.isArray(b.cats) ? [...new Set(b.cats.map(String).filter((c) => words.CATEGORIES[c]))] : cur.cats;
  if (!cats.length) throw httpErr(400, 'Choose at least one word category.');
  const secs = b.secs === undefined ? cur.secs : Number(b.secs); if (!SECS_OPTIONS.includes(secs)) throw httpErr(400, 'Choose 60, 90 or 120 seconds.');
  const cycles = b.cycles === undefined ? cur.cycles : Number(b.cycles); if (!Number.isInteger(cycles) || cycles < 1 || cycles > MAX_CYCLES) throw httpErr(400, 'Choose 1 to 3 turns each.');
  return { cats, secs, cycles };
};
const routes = {
  'POST /api/create': async (b, req) => {
    limit('create', req);
    const name = cleanName(b.name); if (!name) throw httpErr(400, 'Enter your name to host a game.');
    const code = newCode(), pid = rid(8);
    rooms.set(code, { code, v: 1, updated: Date.now(), active: Date.now(), hostId: pid, phase: 'lobby', round: 0, queue: [], settings: { cats: ['emotions', 'adjectives', 'scenarios'], secs: 90, cycles: 1 },
      players: { [pid]: { name, score: 0, lastSeen: Date.now(), joinedAt: Date.now() } }, pickerId: null, options: [], word: null, songs: [], guessed: {}, gains: {}, usedWords: new Set(),
      deadline: null, firstSongAt: null, result: null, final: null, chat: [], chatSeq: 0 });
    return { code, pid };
  },
  'POST /api/join': async (b, req) => {
    limit('join', req);
    const code = String(b.code || '').toUpperCase().trim();
    if (!CODE_RE.test(code)) throw httpErr(400, 'Room codes are 4 letters, like ABCD.');
    const room = rooms.get(code); if (!room) throw httpErr(404, `We couldn't find a game with code ${code}. Check the code, or ask the host for a new invite link.`);
    const name = cleanName(b.name); if (!name) throw httpErr(400, 'Enter your name to join.');
    if (Object.keys(room.players).length >= MAX_PLAYERS) throw httpErr(400, 'This game is full.');
    if (Object.values(room.players).some((p) => p.name.toLowerCase() === name.toLowerCase())) throw httpErr(400, 'Someone in this game already has that name. Try another.');
    const pid = rid(8); room.players[pid] = { name, score: 0, lastSeen: Date.now(), joinedAt: Date.now() }; room.active = Date.now();
    if (inGame(room)) for (let i = 0; i < room.settings.cycles; i++) room.queue.push(pid);   // latecomers get their turn(s) at the end
    say(room, 'sys', `${name} joined.`); touch(room);
    return { code, pid };
  },
  'POST /api/leave': async (b) => { const room = getRoom(b.code, b.pid); removePlayer(room, b.pid); return { ok: true }; },
  'POST /api/settings': async (b) => {
    const room = getRoom(b.code, b.pid); hostOnly(room, b.pid);
    if (room.phase !== 'lobby') throw httpErr(400, 'Settings can only change in the lobby.');
    room.settings = settingsFrom(b, room.settings); touch(room); return { ok: true };
  },
  'POST /api/start': async (b) => {
    const room = getRoom(b.code, b.pid); hostOnly(room, b.pid);
    if (room.phase !== 'lobby') throw httpErr(400, 'The game has already started.');
    if (Object.keys(room.players).length < MIN_PLAYERS) throw httpErr(400, 'You need at least 2 players to start.');
    for (const p of Object.values(room.players)) p.score = 0;
    room.usedWords = new Set(); room.round = 0; room.queue = [];
    const turnOrder = shuffle(orderedIds(room));                  // same random order every cycle
    for (let c = 0; c < room.settings.cycles; c++) room.queue.push(...turnOrder);
    startNextRound(room); return { ok: true };
  },
  'POST /api/choose': async (b) => {
    const room = getRoom(b.code, b.pid);
    if (room.phase !== 'choosing') throw httpErr(400, 'No word to choose right now.');
    if (b.pid !== room.pickerId) throw httpErr(403, 'Only the picker chooses the word.');
    const i = Number(b.index); if (!Number.isInteger(i) || i < 0 || i >= room.options.length) throw httpErr(400, 'Choose one of the three words.');
    chooseWord(room, i); return { ok: true };
  },
  'POST /api/song': async (b, req) => {
    limit('song', req);
    const room = getRoom(b.code, b.pid);
    if (room.phase !== 'playing') throw httpErr(400, 'You can add songs once you\'ve picked a word.');
    if (b.pid !== room.pickerId) throw httpErr(403, 'Only the picker adds songs.');
    if (room.songs.length >= MAX_SONGS) throw httpErr(400, 'You\'ve already used all three songs.');
    const id = parseTrackId(b.url || ('spotify:track:' + b.trackId));
    if (!id) throw httpErr(400, 'That doesn\'t look like a Spotify song link. In Spotify choose ••• › Share › Copy Song Link.');
    if (room.songs.some((s) => s.trackId === id)) throw httpErr(400, 'You already added that song.');
    const meta = await trackMeta(id); if (!meta) throw httpErr(400, 'Spotify couldn\'t find that song. Try a different link.');
    if (room.phase !== 'playing' || room.songs.length >= MAX_SONGS) throw httpErr(400, 'The round has moved on.');   // re-check after the await
    if (b.title) meta.title = cleanText(b.title, 120) || meta.title;
    room.songs.push({ trackId: id, ...meta, at: Date.now() });
    if (room.songs.length === 1) {
      room.firstSongAt = Date.now(); setClock(room, T(room.settings.secs * 1000));
      say(room, 'sys', 'First song is in. Type your guesses!');
    } else say(room, 'sys', `Song ${room.songs.length} added.`);
    touch(room); return { ok: true, count: room.songs.length };
  },
  'POST /api/guess': async (b, req) => {
    limit('guess', req);
    const room = getRoom(b.code, b.pid); const me = room.players[b.pid], now = Date.now();
    const text = cleanText(b.text, 80); if (!text) throw httpErr(400, 'Type something first.');
    if (me.lastMsg && now - me.lastMsg < T(350)) throw httpErr(429, 'Slow down a little.');
    me.lastMsg = now;
    const isGuessing = room.phase === 'playing';
    if (!isGuessing) { say(room, 'chat', text, { name: me.name, vis: 'all', from: b.pid }); touch(room); return { result: 'chat' }; }
    if (b.pid === room.pickerId) throw httpErr(400, 'You\'re the picker: no chatting about the word until the round ends.');
    if (room.guessed[b.pid]) { say(room, 'chat', text, { name: me.name, vis: 'guessed', from: b.pid }); touch(room); return { result: 'chat' }; }   // only visible to others who know the word
    if (!room.firstSongAt) throw httpErr(400, 'Guesses open when the first song is added.');
    const verdict = judge(text, [room.word.word, ...room.word.aliases]);
    if (verdict === 'correct') {
      const total = room.settings.secs * 1000, remaining = Math.max(0, room.deadline - now);
      const points = guessPoints(total, remaining, room.songs.length);
      me.score += points; room.gains[b.pid] = points; room.guessed[b.pid] = { points, songs: room.songs.length, at: now };
      room.gains[room.pickerId] = (room.gains[room.pickerId] || 0) + pickerPoints(points);
      say(room, 'correct', `${me.name} got it!`, { name: me.name });
      maybeEarlyEnd(room); touch(room);
      return { result: 'correct', points, word: room.word.word };
    }
    if (verdict === 'close') { say(room, 'close', 'So close! Keep going.', { vis: b.pid }); say(room, 'guess', text, { name: me.name, vis: 'all' }); touch(room); return { result: 'close' }; }
    say(room, 'guess', text, { name: me.name, vis: 'all' }); touch(room); return { result: 'wrong' };
  },
  'POST /api/next': async (b) => {
    const room = getRoom(b.code, b.pid); hostOnly(room, b.pid);
    if (room.phase !== 'roundend') throw httpErr(400, 'That step isn\'t available right now.');
    startNextRound(room); return { ok: true };
  },
  'POST /api/again': async (b) => {
    const room = getRoom(b.code, b.pid); hostOnly(room, b.pid);
    if (room.phase !== 'gameover') throw httpErr(400, 'The game isn\'t over yet.');
    for (const p of Object.values(room.players)) p.score = 0;
    room.phase = 'lobby'; room.round = 0; room.queue = []; room.final = null; room.chat = []; touch(room); return { ok: true };
  },
};

async function handle(req) {
  const url = new URL(req.url, 'http://x'); const key = req.method + ' ' + url.pathname; const q = url.searchParams;
  limit('global', req);
  if (key === 'GET /api/state') {
    const code = q.get('code'), pid = q.get('pid');
    if (!CODE_RE.test(String(code)) || !PID_RE.test(String(pid))) throw httpErr(400, 'Bad request.');
    const room = getRoom(code, pid);
    if (Number(q.get('v')) === room.v) return { unchanged: true, now: Date.now() };
    return viewFor(room, pid);
  }
  if (key === 'GET /api/room') {
    const code = String(q.get('code') || '').toUpperCase();
    const room = CODE_RE.test(code) && rooms.get(code);
    return room ? { exists: true, players: Object.keys(room.players).length, phase: room.phase, full: Object.keys(room.players).length >= MAX_PLAYERS } : { exists: false };
  }
  if (key === 'GET /api/config') return { search: HAS_SEARCH, categories: words.meta(), secs: SECS_OPTIONS, maxCycles: MAX_CYCLES, maxPlayers: MAX_PLAYERS, minPlayers: MIN_PLAYERS };
  if (key === 'GET /api/search') {
    limit('search', req);
    if (!HAS_SEARCH) throw httpErr(501, 'Song search isn\'t set up on this server. Paste a Spotify song link instead.');
    const term = String(q.get('q') || '').slice(0, 100).trim(); if (!term) return [];
    try { return await search(term); } catch { throw httpErr(502, 'Spotify search is unavailable right now. You can paste a song link instead.'); }
  }
  const fn = routes[key]; if (!fn) throw httpErr(404, 'Not found');
  let raw = '', size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw httpErr(413, 'That request is too large.'); raw += chunk; }
  let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { throw httpErr(400, 'Bad request.'); }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw httpErr(400, 'Bad request.');
  if (body.code !== undefined) body.code = String(body.code).toUpperCase();
  if (body.pid !== undefined && !PID_RE.test(String(body.pid)) && key !== 'POST /api/create' && key !== 'POST /api/join') throw httpErr(400, 'Bad request.');
  return fn(body, req);
}

const PUBLIC = path.join(__dirname, 'public');
const STATIC = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; frame-src https://open.spotify.com; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  if (req.url === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (req.url.startsWith('/api/')) {
    try {
      const out = await handle(req);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(out));
    } catch (e) {
      const headers = { 'Content-Type': 'application/json' }; if (e.retry) headers['Retry-After'] = String(e.retry);
      if (!e.status) console.error('[error]', e);
      res.writeHead(e.status || 500, headers); res.end(JSON.stringify({ error: e.status ? e.message : 'Something went wrong on our side. Please try again.' }));
    }
    return;
  }
  const hit = STATIC[req.url.split('?')[0]] || STATIC['/'];       // unknown paths and invite links (?join=CODE) load the app
  fs.readFile(path.join(PUBLIC, hit[0]), (err, data) => {
    if (err) { res.writeHead(500); return res.end('Missing file'); }
    res.writeHead(200, { 'Content-Type': hit[1], 'Cache-Control': 'no-cache' }); res.end(data);
  });
});

/* background upkeep: round timers, host handover, drop long-gone players, expire idle rooms */
setInterval(() => {
  const now = Date.now();
  for (const room of [...rooms.values()]) {
    if (now - room.active > ROOM_IDLE_MS) { rooms.delete(room.code); continue; }
    for (const [pid, p] of Object.entries(room.players)) if (now - p.lastSeen > PLAYER_DROP_MS) removePlayer(room, pid);
    if (!rooms.has(room.code)) continue;
    const host = room.players[room.hostId];
    if (host && now - host.lastSeen > HOST_AWAY_MS) { const n = nextHost(room); if (n && n !== room.hostId && isOnline(room.players[n])) { room.hostId = n; touch(room); } }
    tick(room);
    if (room.phase === 'playing') maybeEarlyEnd(room);   // a guesser dropping offline can complete the round
  }
}, 250).unref();

if (require.main === module) server.listen(PORT, () => console.log(`Song Sense running on http://localhost:${PORT}  (Spotify search: ${HAS_SEARCH ? 'on' : 'off - paste links'})`));
module.exports = { server, rooms };
