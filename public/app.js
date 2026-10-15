'use strict';
// Song Sense client. The server holds all game state; this file renders what the server says and sends actions.
const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TONES = ['#d4a97f', '#93bba6', '#8fa9cf', '#b9a0cf', '#cf94a4', '#cdc482', '#82cdc4', '#cf9575'];
const tone = (s) => TONES[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];

const PATHS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', search: '<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/>', plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  leave: '<path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10"/><path d="M15 8l4 4-4 4"/><path d="M19 12H9.5"/>',
  copy: '<rect x="9" y="9" width="10" height="10" rx="2"/><path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15"/>',
  share: '<path d="M12 4v11"/><path d="M8 8l4-4 4 4"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/>',
  star: '<path d="M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z"/>', music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  send: '<path d="M4 12l16-7-6 15-3-6z"/>', mic: '<rect x="9" y="4" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3"/>',
};
const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[n]}</svg>`;
const MARK = `<svg class="mark" viewBox="0 0 64 44" aria-hidden="true"><path class="bub" d="M8 2h48a6 6 0 0 1 6 6v22a6 6 0 0 1-6 6H32l-12 7v-7h-12a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z"/>
  <rect class="bar" x="13" y="14" width="5" height="10" rx="2.5"/><rect class="bar" x="21.5" y="9" width="5" height="20" rx="2.5"/><rect class="bar" x="30" y="12" width="5" height="14" rx="2.5"/><rect class="bar" x="38.5" y="8" width="5" height="22" rx="2.5"/><rect class="bar" x="47" y="15" width="5" height="8" rx="2.5"/></svg>`;

/* ---------- storage (survives refresh + reconnects) ---------- */
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }, del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } } };
let session = store.get('songsense.session');
const inviteCode = (new URLSearchParams(location.search).get('join') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
if (inviteCode.length === 4 && session && session.code !== inviteCode) { session = null; store.del('songsense.session'); }   // a new invite link wins over an old game

let state = null, cfg = { search: false, categories: {}, secs: [60, 90, 120], maxCycles: 3, minPlayers: 2 }, clockOffset = 0;
const ui = { err: '', notice: '', name: store.get('songsense.name') || '', code: inviteCode, invite: inviteCode.length === 4 ? { code: inviteCode, status: 'checking' } : null,
  sq: '', hits: null, searching: false, link: '', leaveArmed: false };
const last = {}; const locks = new Set(); let fails = 0, inRoom = false;

async function api(path, body) {
  const opt = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...(session || {}) }) } : {};
  let r; try { r = await fetch('/api/' + path, opt); } catch { const e = new Error('Can\'t reach the game right now. Check your connection.'); e.network = true; throw e; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Something went wrong. Please try again.'); e.status = r.status; throw e; }
  return j;
}
const setErr = (m) => { ui.err = m || ''; const el = document.getElementById('err'); if (el) el.textContent = ui.err; };
const act = async (path, body, quiet) => {
  const key = path + (body && body.to ? ':' + body.to : ''); if (locks.has(key)) return; locks.add(key);
  try { const r = await api(path, body); setErr(''); await poll(true); return r; } catch (e) { if (quiet) toast(e.message); else { setErr(e.message); toast(e.message); } } finally { locks.delete(key); }
};
const save = (s) => { session = s; store.set('songsense.session', s); };
function toast(msg) { const el = document.getElementById('toast'); if (!el) return; el.textContent = msg; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2400); }
function leave(notice) {
  store.del('songsense.session'); session = null; state = null; inRoom = false; fails = 0; setNet(true); ui.hits = null; ui.sq = ''; ui.link = '';
  Object.keys(last).forEach((k) => delete last[k]); document.body.dataset.phase = 'home'; ui.notice = notice || ''; ui.leaveArmed = false; history.replaceState(null, '', location.pathname); render();
}
function setNet(ok) { const el = document.getElementById('net'); if (el) el.classList.toggle('on', !ok); }

async function poll(force) {
  if (!session) return;
  try {
    const s = await api(`state?code=${session.code}&pid=${session.pid}&v=${force ? 0 : (state?.v ?? 0)}`);
    fails = 0; setNet(true);
    if (s.now) clockOffset = s.now - Date.now();
    if (!s.unchanged) { state = s; render(); }
  } catch (e) {
    if (e.status === 404) return leave(e.message);
    if (e.network || e.status >= 500) { fails++; if (fails >= 2) setNet(false); }
  }
}
setInterval(() => poll(false), 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(true); });
window.addEventListener('online', () => poll(true));

/* only touch the DOM when HTML changed; never replace a section while the user types in it */
function setSection(id, html, key, force) {
  const el = document.getElementById(id); if (!el) return;
  if (last[id] === html && !force) return;
  const a = document.activeElement;
  if (!force && last[id + ':k'] === key && a && el.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return;
  const fresh = last[id] === undefined || last[id + ':k'] !== key;
  last[id] = html; last[id + ':k'] = key; el.innerHTML = html;
  if (fresh) { el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
}

/* ---------- shared pieces ---------- */
const avatar = (p, sz = 40) => `<span class="av ${p.guessed ? 'ok' : p.isPicker ? 'pick' : ''} ${p.online === false ? 'off' : ''}" style="--sz:${sz}px;--tone:${tone(p.name)}" aria-hidden="true">${esc((p.name[0] || '?').toUpperCase())}${p.isHost ? `<span class="badge" title="Host">${icon('star')}</span>` : p.guessed ? `<span class="badge good">${icon('check')}</span>` : ''}</span>`;
const nowMs = () => Date.now() + clockOffset;
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const P = (id) => state.players.find((p) => p.id === id) || { name: 'Someone', score: 0 };
const hostName = () => (state.players.find((p) => p.isHost) || {}).name || 'the host';
const inviteUrl = () => `${location.origin}/?join=${state.code}`;
const catLabel = (c) => ({ emotions: 'Emotion', adjectives: 'Adjective', scenarios: 'Scenario' }[c] || c);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const clockHtml = (dl, span, label) => `<div class="clock" data-dl="${dl}" data-span="${span}" role="timer" aria-label="${esc(label)}"><div class="bar"><i></i></div><span class="num nums"></span></div>`;
function tickClocks() {
  for (const el of document.querySelectorAll('.clock[data-dl]')) {
    const left = Number(el.dataset.dl) - nowMs(), span = Number(el.dataset.span) || 1;
    el.querySelector('i').style.width = Math.max(0, Math.min(100, (left / span) * 100)) + '%';
    el.querySelector('.num').textContent = mmss(left); el.classList.toggle('low', left < 10000 && left > 0);
  }
}
setInterval(tickClocks, 250);
function tilesHtml(maskStr) {
  return `<div class="tiles" role="img" aria-label="${esc(maskStr.replace(/ /g, '').replace(/_/g, '').length ? 'Word with punctuation' : plural(maskStr.replace(/[^_]/g, '').length, 'letter'))}">${maskStr.split(' ').map((w) => `<span class="w">${[...w].map((c) => c === '_' ? '<span class="t"></span>' : `<span class="t sym">${esc(c)}</span>`).join('')}</span>`).join('')}</div>`;
}

/* ---------- home ---------- */
function renderHome() {
  document.body.dataset.phase = 'home'; inRoom = false;
  const typed = document.getElementById('nm'); if (typed) ui.name = typed.value;   // a re-render (e.g. invite check finishing) must not wipe the name being typed
  const inv = ui.invite;
  let form;
  if (inv) {
    form = `<div class="card invite-card" id="invcard">${inviteCardHtml()}</div>
      <form data-form="join" class="stack" style="margin-top:16px"><label class="sr" for="nm">Your name</label><input id="nm" name="name" maxlength="20" placeholder="Your name" value="${esc(ui.name)}" autocomplete="nickname" ${inv.status === 'missing' || inv.status === 'full' ? 'disabled' : ''}>
      <button class="btn primary block" id="joinbtn" ${inv.status === 'missing' || inv.status === 'full' ? 'disabled' : ''}>Join game</button></form>
      <p class="or">or</p><button class="btn block" data-act="home">Start your own game</button>`;
  } else {
    form = `<form data-form="create" class="stack"><label class="sr" for="nm">Your name</label><input id="nm" name="name" maxlength="20" placeholder="Your name" value="${esc(ui.name)}" autocomplete="nickname">
      <button class="btn primary block">Create a game</button></form><p class="or">or join with a code</p>
      <form data-form="join" class="field"><label class="sr" for="cd">Room code</label><input id="cd" class="codein" name="code" maxlength="4" placeholder="CODE" value="${esc(ui.code)}" autocapitalize="characters" autocomplete="off" spellcheck="false"><button class="btn">Join</button></form>`;
  }
  $app.innerHTML = `<div class="home enter">${MARK}<h1>Song <i>Sense</i></h1><p class="lede">Hint a word with up to three songs. Your friends type what it is. The faster they guess, the more they score.</p>
    ${ui.notice ? `<p class="banner warn" role="status" style="margin-bottom:16px">${esc(ui.notice)}</p>` : ''}${form}<p class="err" id="err" role="alert">${esc(ui.err)}</p>
    <ol class="how"><li>One player is the picker and secretly chooses 1 of 3 words: an emotion, adjective or scenario.</li><li>The picker adds a Spotify song, then optionally a second and third, to hint at it.</li><li>Everyone else listens and types guesses. Early guesses on early songs score the most.</li></ol>
    <p class="foot">Free, no accounts. Works best with 3 to 8 friends.<br><button type="button" data-act="privacy">Privacy</button> &middot; Not affiliated with Spotify.</p></div>`;
  if (inv && inv.status === 'checking') checkInvite();
}
function inviteCardHtml() {
  const inv = ui.invite;
  const msg = inv.status === 'missing' ? "That game isn't running anymore. Ask your host for a new invite link, or start your own." : inv.status === 'full' ? 'That game is full.' : inv.status === 'checking' ? 'Checking the invite&hellip;' : `${plural(inv.players, 'player')} waiting${inv.phase !== 'lobby' ? " &middot; game in progress, you'll play at the end of the queue" : ''}.`;
  return `<p class="label">You're invited</p><p class="big">${esc(inv.code)}</p><p class="hint" style="margin-top:8px">${msg}</p>`;
}
async function checkInvite() {
  try { const r = await api('room?code=' + ui.invite.code); ui.invite = r.exists ? { code: ui.invite.code, status: r.full ? 'full' : 'ok', players: r.players, phase: r.phase } : { code: ui.invite.code, status: 'missing' }; }
  catch { ui.invite = { code: ui.invite.code, status: 'ok', players: 0, phase: 'lobby' }; }
  if (session) return;
  const card = document.getElementById('invcard'); if (!card) return renderHome();
  card.innerHTML = inviteCardHtml();                         // update in place: never rebuild the form while someone is typing
  const bad = ui.invite.status === 'missing' || ui.invite.status === 'full';
  const nm = document.getElementById('nm'), jb = document.getElementById('joinbtn'); if (nm) nm.disabled = bad; if (jb) jb.disabled = bad;
}

/* ---------- room shell ---------- */
function shell() {
  $app.innerHTML = `<div id="room"><div class="topbar"><span class="wordmark">${MARK.replace('class="mark"', 'class="mark" style="width:34px;height:24px"')}Song <i>Sense</i></span>
    <span class="row" style="flex-wrap:nowrap;align-items:center"><button class="code" data-act="copyinvite" aria-label="Copy invite link for room ${esc(state.code)}"><b>${esc(state.code)}</b>${icon('copy')}</button>
    <button class="btn ghost" id="leavebtn" data-act="leave">${icon('leave')}<span>Leave</span></button></span></div>
    <div class="room"><div class="col" id="colmain"><section id="hero" class="card hero" aria-live="polite"></section><section id="main"></section><section id="songs" hidden><div class="songs" id="songlist"></div><div class="songs" id="slots" style="margin-top:12px"></div></section></div>
    <div class="col side"><section id="players" class="card"></section><section id="chatcard" class="card chat"><div id="chatlog" class="chatlog" role="log" aria-live="polite" aria-label="Game chat" tabindex="0"></div>
      <form id="chatform" class="chatform" autocomplete="off"><label class="sr" for="chatin" id="chatlbl">Message</label><input id="chatin" maxlength="80" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Say something&hellip;"><button class="btn sm primary" aria-label="Send">${icon('send')}</button></form></section></div></div></div>`;
  for (const k of Object.keys(last)) delete last[k];
  inRoom = true;
}
function render() {
  if (!session || !state) return renderHome();
  if (!inRoom || !document.getElementById('room')) shell();
  document.body.dataset.phase = state.phase;
  setSection('hero', heroHtml(), state.phase + state.round + state.pickerId + (state.songs.length ? 's' : '') + state.me.guessed);
  setSection('main', mainHtml(), state.phase + state.round + state.songs.length + state.settings.cats.join() + state.settings.secs + state.settings.cycles + state.me.isHost + state.players.length);
  syncSongs();
  setSection('players', playersHtml(), 'p');
  updateChat(); updateChatForm(); tickClocks();
  const lb = document.getElementById('leavebtn'); if (lb && !ui.leaveArmed) lb.querySelector('span').textContent = 'Leave';
}

/* ---------- hero: always says what to do right now ---------- */
function heroHtml() {
  const s = state, me = s.me, picker = s.pickerId ? P(s.pickerId) : null;
  const rl = s.phase !== 'lobby' && s.phase !== 'gameover' ? `<p class="label">Round ${s.round} of ${s.totalRounds}</p>` : '';
  const who = picker ? `<div class="who">${avatar({ ...picker, isPicker: true, guessed: false }, 44)}<span class="muted">${me.isPicker ? 'You are the picker' : `<b style="color:var(--text)">${esc(picker.name)}</b> is the picker`}</span></div>` : '';
  if (s.phase === 'lobby') {
    const n = s.players.length, need = cfg.minPlayers;
    return `<p class="label">Lobby</p><p class="todo" style="margin-top:8px">${n < need ? 'Invite a friend to start' : me.isHost ? 'Ready when you are' : `Waiting for ${esc(hostName())} to start`}</p>
      <p class="sub">${n < need ? `Share the code or link below. You need at least ${need} players.` : `${plural(n, 'player')} here. ${me.isHost ? 'Pick your settings and press Start.' : 'Sit tight, the host is setting up.'}`}</p>`;
  }
  if (s.phase === 'choosing') {
    return `${rl}${who}<p class="todo">${me.isPicker ? 'Choose your secret word' : `${esc(picker.name)} is choosing a word`}</p>
      <p class="sub">${me.isPicker ? 'Pick the one you can hint best with songs. A random one is chosen if time runs out.' : 'Get ready to guess. You\'ll hear the first song soon.'}</p>${clockHtml(s.deadline, s.span, 'Time to choose')}`;
  }
  if (s.phase === 'playing') {
    const started = !!s.scoreClockStart;
    if (me.isPicker) {
      return `${rl}${who}<p class="label">Your word</p><p class="theword">${esc(s.word)}</p>
        <p class="sub">${!started ? 'Add your first song to open guessing. Do not type the word in chat.' : s.songs.length < s.maxSongs ? 'Guesses are open. Stuck players? Add another hint song.' : 'All three songs are in. Watch them guess!'}</p>
        ${clockHtml(s.deadline, s.span, started ? 'Time left to guess' : 'Time to add the first song')}`;
    }
    if (me.guessed) return `${rl}${who}<p class="label">You got it</p><p class="theword">${esc(s.word)}</p><p class="sub">Nice! You can chat with the others who got it while the rest keep guessing.</p>${clockHtml(s.deadline, s.span, 'Time left')}`;
    if (!started) return `${rl}${who}<p class="todo">Waiting for ${esc(picker.name)}'s first song</p><p class="sub">Guessing opens as soon as it's added. Category: <b>${esc(catLabel(s.category))}</b></p>${clockHtml(s.deadline, s.span, 'Picker\'s time to add a song')}`;
    return `${rl}${who}<p class="todo">What's the word?</p>${tilesHtml(s.mask)}<p class="sub"><span class="chip on">${esc(catLabel(s.category))}</span> &nbsp;Press play, then type your guess below. Earlier guesses score more.</p>${clockHtml(s.deadline, s.span, 'Time left to guess')}`;
  }
  if (s.phase === 'roundend') {
    const r = s.result, why = { everyone: 'Everyone got it!', time: 'Time\'s up.', nosong: 'No songs were added in time.', pickerleft: 'The picker left.' }[r.reason] || 'Round over.';
    return `${rl}<p class="todo">${why}</p><p class="sub">${s.round >= s.totalRounds ? 'Final scores are next.' : 'The next round starts automatically.'}</p>${clockHtml(s.deadline, s.span, 'Next round')}`;
  }
  return `<p class="label">Final results</p><p class="todo" style="margin-top:8px">Game over</p>`;
}

/* ---------- main column per phase ---------- */
function settingsHtml() {
  const st = state.settings, host = state.me.isHost;
  const chips = (items, on, attr) => items.map((it) => `<button type="button" class="chip" aria-pressed="${on(it.v)}" ${host ? '' : 'disabled'} data-act="${attr}" data-v="${it.v}">${esc(it.l)}</button>`).join('');
  return `<div class="card settings"><div class="grp"><h3>Word categories</h3><div class="row">${chips(Object.entries(cfg.categories).map(([k, c]) => ({ v: k, l: `${c.label} (${c.count})` })), (v) => st.cats.includes(v), 'cat')}</div></div>
    <div class="grp"><h3>Guessing time per round</h3><div class="row">${chips(cfg.secs.map((n) => ({ v: n, l: n + 's' })), (v) => st.secs === Number(v), 'secs')}</div></div>
    <div class="grp"><h3>Turns as picker each</h3><div class="row">${chips(Array.from({ length: cfg.maxCycles }, (_, i) => ({ v: i + 1, l: String(i + 1) })), (v) => st.cycles === Number(v), 'cycles')}</div></div>
    ${host ? '' : '<p class="hint" style="margin-top:12px">Only the host can change these.</p>'}</div>`;
}
function mainHtml() {
  const s = state, me = s.me;
  if (s.phase === 'lobby') {
    const can = s.players.length >= cfg.minPlayers && s.settings.cats.length;
    return `<div class="card invite-card"><p class="label">Room code</p><div class="tilesbig" aria-label="Room code ${esc(s.code)}">${[...s.code].map((c) => `<span>${esc(c)}</span>`).join('')}</div>
      <div class="row center" style="margin-top:16px"><button class="btn sm" data-act="copyinvite">${icon('copy')}Copy invite link</button>${navigator.share ? `<button class="btn sm" data-act="share">${icon('share')}Share</button>` : ''}</div>
      <p class="hint" style="margin-top:12px">Friends open the link or enter the code at ${esc(location.host)}.</p></div>${settingsHtml()}
      ${me.isHost ? `<button class="btn primary block" data-act="start" ${can ? '' : 'disabled'}>${can ? 'Start game' : 'Need 2+ players'}</button>` : `<p class="banner warn" style="text-align:center">Waiting for ${esc(hostName())} to start the game&hellip;</p>`}<p class="err" id="err" role="alert">${esc(ui.err)}</p>`;
  }
  if (s.phase === 'choosing') {
    if (!me.isPicker) return '';
    return `<div class="opts" role="group" aria-label="Choose a word">${(s.options || []).map((o, i) => `<button class="opt" data-act="choose" data-i="${i}"><b>${esc(o.word)}</b><small>${esc(catLabel(o.category))}</small></button>`).join('')}</div><p class="err" id="err" role="alert">${esc(ui.err)}</p>`;
  }
  if (s.phase === 'playing') return me.isPicker ? pickerControls() : '';
  if (s.phase === 'roundend') return resultsHtml();
  return finalHtml();
}
function pickerControls() {
  const s = state, n = s.songs.length;
  if (n >= s.maxSongs) return `<div class="banner">All three songs are in. Sit back while they guess.</div>`;
  const q = ui.sq;
  const hits = ui.hits ? (ui.hits.length ? `<ul class="hits" aria-label="Search results">${ui.hits.map((h, i) => `<li class="hit">${h.thumb ? `<img src="${esc(h.thumb)}" alt="" loading="lazy">` : `<span class="art"></span>`}<span class="meta"><b>${esc(h.title)}</b><span>${esc(h.artist)}</span></span>
      <button class="btn sm primary" data-act="addhit" data-i="${i}" aria-label="Add ${esc(h.title)}">${icon('plus')}Add</button></li>`).join('')}</ul>` : '<p class="hint" style="margin-top:12px">No songs found. Try different words.</p>') : '';
  const paste = `<details class="paste" ${cfg.search ? '' : 'open'}><summary>${cfg.search ? 'Or paste a Spotify song link' : 'Paste a Spotify song link'}</summary><form data-form="link" class="field"><label class="sr" for="lk">Spotify song link</label><input id="lk" name="link" placeholder="https://open.spotify.com/track/&hellip;" value="${esc(ui.link)}" autocomplete="off"><button class="btn primary">Add</button></form>
    ${cfg.search ? '' : '<p class="hint" style="margin-top:8px">In Spotify: ••• › Share › Copy Song Link.</p>'}</details>`;
  const searchForm = cfg.search ? `<form data-form="search" class="field"><label class="sr" for="sq">Search Spotify</label><input id="sq" name="q" placeholder="Search a song or artist" value="${esc(q)}" autocomplete="off" enterkeyhint="search"><button class="btn" ${ui.searching ? 'disabled' : ''}>${icon('search')}<span>${ui.searching ? 'Searching&hellip;' : 'Search'}</span></button></form>` : '';
  return `<div class="card"><p class="label">${n ? `Add another hint &middot; song ${n + 1} of 3` : 'Add your first song &middot; song 1 of 3'}</p><p class="hint" style="margin:4px 0 12px">${n ? 'Optional. Later songs are easier but worth fewer points to guessers.' : 'Choose a song that makes people feel your word. Everyone else will see it.'}</p>
    ${searchForm}${hits}${paste}<p class="err" id="err" role="alert">${esc(ui.err)}</p></div>`;
}
function resultsHtml() {
  const r = state.result, gs = r.guessers;
  return `<div class="card res"><p class="label" style="text-align:center">The ${esc(catLabel(r.category || '').toLowerCase())} was</p><p class="answer">${esc(r.word || '')}</p>
    ${gs.length ? `<ol class="rank">${gs.map((g, i) => `<li><span class="pos">${i + 1}</span>${avatar({ name: g.name, guessed: false }, 34)}<span class="nm">${esc(g.name)}<span class="tag">after ${plural(g.songs, 'song')}</span></span><span class="pts" style="color:var(--good)">+${g.points}</span></li>`).join('')}</ol>` : '<p class="muted" style="text-align:center;margin:12px 0">Nobody got it this time.</p>'}
    ${r.pickerPoints ? `<p class="hint" style="text-align:center;margin-top:12px"><b style="color:var(--text)">${esc(r.pickerName)}</b> earns +${r.pickerPoints} for a great hint</p>` : ''}
    ${r.missed.length && gs.length ? `<p class="hint" style="text-align:center;margin-top:6px">Didn't get it: ${esc(r.missed.join(', '))}</p>` : ''}</div>
    ${state.me.isHost ? `<button class="btn block" data-act="next">Next round now</button>` : ''}<p class="err" id="err" role="alert">${esc(ui.err)}</p>`;
}
function finalHtml() {
  const f = state.final || [], top = f[0], tie = f.filter((x) => x.score === (top || {}).score);
  return `<div class="card"><div class="winner pop"><svg class="i crown" viewBox="0 0 24 24" aria-hidden="true">${PATHS.star}</svg><p class="label" style="margin-top:8px">${tie.length > 1 ? 'It\'s a tie' : 'Winner'}</p><h2>${esc(tie.map((t) => t.name).join(' & '))}</h2></div>
    <ol class="rank">${f.map((p, i) => `<li><span class="pos">${i + 1}</span>${avatar({ name: p.name }, 34)}<span class="nm">${esc(p.name)}${p.id === state.me.id ? '<span class="tag">you</span>' : ''}</span><span class="pts nums">${p.score}</span></li>`).join('')}</ol></div>
    <div class="stack-gap" style="margin-top:16px">${state.me.isHost ? `<button class="btn primary block" data-act="again">Play again</button>` : `<p class="banner warn" style="text-align:center">Waiting for ${esc(hostName())} to start another game&hellip;</p>`}</div><p class="err" id="err" role="alert">${esc(ui.err)}</p>`;
}

/* ---------- songs: iframes are kept alive between renders so playback never restarts ---------- */
const embedSrc = (id) => `https://open.spotify.com/embed/track/${encodeURIComponent(id)}?utm_source=generator&theme=0`;
function syncSongs() {
  const s = state, box = document.getElementById('songs'), list = document.getElementById('songlist'), slots = document.getElementById('slots'); if (!box) return;
  const show = (s.phase === 'playing' || s.phase === 'roundend') && (s.songs.length > 0 || s.phase === 'playing'); box.hidden = !show;
  const have = [...list.children]; const want = s.phase === 'playing' || s.phase === 'roundend' ? s.songs : [];
  have.forEach((el) => { if (!want.some((w) => w.trackId === el.dataset.id)) el.remove(); });
  for (const w of want) if (!list.querySelector(`[data-id="${w.trackId}"]`)) {
    const d = document.createElement('div'); d.className = 'song enter'; d.dataset.id = w.trackId;
    d.innerHTML = `<div class="cap"><span class="label">Song ${w.n} of ${s.maxSongs}</span><span class="hint">${esc(w.title)}</span></div><iframe src="${embedSrc(w.trackId)}" allow="encrypted-media; clipboard-write" loading="lazy" title="Spotify player for song ${w.n}"></iframe>`;
    list.appendChild(d);
  }
  const need = s.phase === 'playing' ? Array.from({ length: s.maxSongs - s.songs.length }, (_, i) => s.songs.length + i + 1) : [];
  const html = need.map((n, i) => `<div class="slot ${i === 0 ? 'next' : ''}">${icon('music')}<span>${i === 0 ? (s.me.isPicker ? `Song ${n}: add it below${n > 1 ? ' (optional)' : ''}` : `Song ${n}${n === 1 ? ': waiting for the picker&hellip;' : ' may appear later as another hint'}`) : `Song ${n} (optional hint)`}</span></div>`).join('');
  if (last.slots !== html) { slots.innerHTML = html; last.slots = html; }
  if (show && s.songs.length) { const t = document.getElementById('songhint'); if (!t) slots.insertAdjacentHTML('beforebegin', '<p class="hint" id="songhint" style="margin-top:8px">Press play on each player. Spotify may play 30-second previews unless you\'re signed in to Spotify in this browser.</p>'); }
  else { const t = document.getElementById('songhint'); if (t) t.remove(); }
}

/* ---------- players ---------- */
function playersHtml() {
  const s = state, ps = s.phase === 'lobby' ? s.players : [...s.players].sort((a, b) => b.score - a.score);
  return `<p class="label" style="margin-bottom:4px">Players &middot; ${s.players.length}</p><ul class="players">${ps.map((p) => {
    let st = '', cls = '';
    if (s.phase === 'lobby') { st = p.online ? (p.isHost ? 'Host' : 'Ready') : 'Away'; cls = p.online ? 'good' : ''; }
    else if (s.phase === 'roundend') { st = p.isPicker ? 'Picker' : p.guessed ? 'Got it' : 'Missed'; cls = p.guessed ? 'good' : ''; }
    else if (s.phase === 'gameover') st = p.online ? '' : 'Away';
    else if (p.isPicker) { st = 'Picker'; cls = 'acc'; } else if (p.guessed) { st = 'Got it!'; cls = 'good'; } else st = s.phase === 'playing' ? (p.online ? 'Guessing' : 'Away') : (p.online ? 'Waiting' : 'Away');
    return `<li>${avatar(p, 36)}<span class="nm">${esc(p.name)}${p.id === s.me.id ? ' <span class="hint">(you)</span>' : ''}<span class="st ${cls}" style="display:block">${st}</span></span><span class="sc nums">${p.score}${p.gain ? `<span class="gain">+${p.gain}</span>` : ''}</span></li>`;
  }).join('')}</ul>`;
}

/* ---------- chat ---------- */
function updateChat() {
  const el = document.getElementById('chatlog'); if (!el) return;
  const html = state.chat.map((m) => {
    if (m.kind === 'sys') return `<div class="m sys">${esc(m.text)}</div>`;
    if (m.kind === 'correct') return `<div class="m correct">${icon('check')} ${esc(m.text)}</div>`;
    if (m.kind === 'close') return `<div class="m close">${esc(m.text)}</div>`;
    return `<div class="m ${m.group ? 'group' : ''}"><b>${esc(m.name)}</b>${esc(m.text)}</div>`;
  }).join('') || '<div class="m sys">Chat and guesses show up here.</div>';
  if (last.chat === html) return; last.chat = html;
  const stick = el.scrollHeight - el.scrollTop - el.clientHeight < 60 || !el.dataset.init; el.innerHTML = html; el.dataset.init = '1'; if (stick) el.scrollTop = el.scrollHeight;
}
function updateChatForm() {
  const s = state, inp = document.getElementById('chatin'), lbl = document.getElementById('chatlbl'); if (!inp) return;
  let mode = 'chat', ph = 'Say something…', off = false;
  if (s.phase === 'playing') {
    if (s.me.isPicker) { mode = 'picker'; ph = 'Picker: no chatting about the word'; off = true; }
    else if (s.me.guessed) { mode = 'group'; ph = 'Chat with others who got it…'; }
    else if (!s.scoreClockStart) { mode = 'wait'; ph = 'Guessing opens with the first song'; off = true; }
    else { mode = 'guess'; ph = 'Type your guess…'; }
  }
  const key = mode + off; if (last.chatmode === key) return; last.chatmode = key;
  inp.placeholder = ph; inp.disabled = off; lbl.textContent = mode === 'guess' ? 'Your guess' : 'Message';
  inp.closest('form').querySelector('button').disabled = off;
}

/* ---------- events ---------- */
const val = (form, n) => (form.elements[n] ? String(form.elements[n].value || '').trim() : '');
document.addEventListener('submit', async (e) => {
  const f = e.target; e.preventDefault();
  if (f.id === 'chatform') {
    const inp = document.getElementById('chatin'), text = inp.value.trim(); if (!text || inp.disabled) return; inp.value = '';
    try { const r = await api('guess', { text }); if (r.result === 'correct') toast(`Correct! +${r.points}`); else if (r.result === 'close') toast('So close!'); await poll(true); }
    catch (er) { toast(er.message); if (er.status === 400 || er.status === 429) inp.value = text; }
    return;
  }
  const kind = f.dataset.form; if (!kind) return;
  if (kind === 'create' || kind === 'join') {
    const name = val(f, 'name'); ui.name = name; store.set('songsense.name', name);
    const code = kind === 'join' ? (ui.invite ? ui.invite.code : val(f, 'code').toUpperCase().replace(/[^A-Z]/g, '')) : null; ui.code = code || '';
    if (!name) return setErr('Enter your name first.');
    if (kind === 'join' && !code) return setErr('Enter the 4-letter room code.');
    try { const r = await api(kind, { name, code }); save({ code: r.code, pid: r.pid }); ui.invite = null; ui.err = ''; ui.notice = ''; history.replaceState(null, '', location.pathname); await poll(true); }
    catch (er) { setErr(er.message); }
  } else if (kind === 'search') {
    const q = val(f, 'q'); ui.sq = q; if (!q) return; ui.searching = true; render();
    try { ui.hits = await api('search?q=' + encodeURIComponent(q)); setErr(''); } catch (er) { setErr(er.message); ui.hits = null; }
    ui.searching = false; setSection('main', mainHtml(), 'force', true);
  } else if (kind === 'link') {
    const link = val(f, 'link'); ui.link = link; if (!link) return;
    ui.link = ''; ui.hits = null; ui.sq = '';                      // clear first so the re-render after a successful add shows an empty box
    if (!(await act('song', { url: link }))) { ui.link = link; setSection('main', mainHtml(), 'force', true); }
  }
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a === 'privacy') return document.getElementById('privacy').showModal();
  if (a === 'home') { ui.invite = null; ui.code = ''; history.replaceState(null, '', location.pathname); return renderHome(); }
  if (a === 'copyinvite') { const u = inviteUrl(); try { await navigator.clipboard.writeText(u); toast('Invite link copied'); } catch { prompt('Copy this invite link:', u); } return; }
  if (a === 'share') { try { await navigator.share({ title: 'Song Sense', text: 'Join my Song Sense game!', url: inviteUrl() }); } catch { /* cancelled */ } return; }
  if (a === 'leave') {
    if (!ui.leaveArmed) { ui.leaveArmed = true; b.querySelector('span').textContent = 'Tap again'; setTimeout(() => { ui.leaveArmed = false; const lb = document.getElementById('leavebtn'); if (lb) lb.querySelector('span').textContent = 'Leave'; }, 3000); return; }
    try { await api('leave', {}); } catch { /* leave locally anyway */ } return leave('');
  }
  if (!state) return;
  if (a === 'start') return act('start', {});
  if (a === 'next') return act('next', {});
  if (a === 'again') return act('again', {});
  if (a === 'choose') return act('choose', { index: Number(b.dataset.i) });
  if (a === 'addhit') { const h = ui.hits && ui.hits[Number(b.dataset.i)]; if (!h) return; const prev = { hits: ui.hits, sq: ui.sq }; ui.hits = null; ui.sq = ''; if (!(await act('song', { trackId: h.id, title: `${h.title} — ${h.artist}` }))) { ui.hits = prev.hits; ui.sq = prev.sq; setSection('main', mainHtml(), 'force', true); } return; }
  if (a === 'cat' || a === 'secs' || a === 'cycles') {
    const st = { ...state.settings }; const v = b.dataset.v;
    if (a === 'cat') { st.cats = st.cats.includes(v) ? st.cats.filter((c) => c !== v) : [...st.cats, v]; if (!st.cats.length) return toast('Keep at least one category.'); }
    else st[a] = Number(v);
    return act('settings', st);
  }
});
document.getElementById('privacy-close').addEventListener('click', () => document.getElementById('privacy').close());

fetch('/api/config').then((r) => r.json()).then((c) => { cfg = c; if (state) render(); }).catch(() => {});
if (session) poll(true).then(() => { if (!state) render(); }); else render();
