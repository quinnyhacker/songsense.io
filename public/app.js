'use strict';
// Song Sense client. The server holds all game state; this file renders what the server says and sends actions.
const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PATHS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', search: '<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/>', plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  leave: '<path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10"/><path d="M15 8l4 4-4 4"/><path d="M19 12H9.5"/>',
  copy: '<rect x="9" y="9" width="10" height="10" rx="2"/><path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15"/>',
  share: '<path d="M12 4v11"/><path d="M8 8l4-4 4 4"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/>',
  star: '<path d="M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z"/>', music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  send: '<path d="M4 12l16-7-6 15-3-6z"/>', pen: '<path d="M5 19l1-4L16 5l3 3L9 18z"/>', mic: '<rect x="9" y="4" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3"/>',
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
const ui = { listen: true, err: '', notice: '', name: store.get('songsense.name') || '', code: inviteCode, invite: inviteCode.length === 4 ? { code: inviteCode, status: 'checking' } : null,
  sq: '', hits: null, searching: false, leaveArmed: false };
const last = {}; const locks = new Set(); let fails = 0, inRoom = false;

async function api(path, body) {
  const hdr = { 'Content-Type': 'application/json', ...(auth.token ? { Authorization: 'Bearer ' + auth.token } : {}) };
  const opt = body ? { method: 'POST', headers: hdr, body: JSON.stringify({ ...body, ...(session || {}) }) } : { headers: hdr };
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
  store.del('songsense.session'); session = null; state = null; inRoom = false; fails = 0; setNet(true); ui.hits = null; ui.sq = '';
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
(function loop() { poll(false).finally(() => setTimeout(loop, state && state.phase === 'playing' ? 600 : 1200)); })();   // faster while a round is playing so shared playback stays tight
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
/* ---------- avatars: config -> layered SVG, with expression reactions ---------- */
const myAvatarLocal = () => { let v = store.get('songsense.avatar'); if (!Avatar.valid(v)) { v = Avatar.random(); store.set('songsense.avatar', v); } return v; };   // first visit gets a random free look, saved locally
const myAvatar = () => (auth.user && Avatar.valid(auth.user.avatar) ? auth.user.avatar : Avatar.sanitize(myAvatarLocal(), ownedSet()));
const svgMemo = new Map();
function avSvg(cfg, expr) { const k = JSON.stringify(cfg) + '|' + expr; if (!svgMemo.has(k)) { if (svgMemo.size > 500) svgMemo.clear(); svgMemo.set(k, Avatar.svg(cfg, { expr })); } return svgMemo.get(k); }
const cfgOf = (p) => (p.avatar ? p.avatar : Avatar.fromName(p.name));      // players without a saved avatar get a stable one from their name
function exprFor(p) {                                                       // happy/excited when right, confused when wrong, sad when losing ...
  const base = Avatar.normalize(cfgOf(p)).expr, E = Avatar.EXPR;
  if (p.react && nowMs() - p.react.at < 4500) return E[p.react.k];
  if (!state) return base;
  if (state.phase === 'gameover' && state.final) { const f = state.final, i = f.findIndex((x) => x.id === p.id); if (i >= 0) return f[i].score === f[0].score ? E.excited : (i === f.length - 1 && f.length > 1) ? E.sad : E.happy; }
  if (state.phase === 'roundend' && state.result) return p.isPicker ? (state.result.guessers.length ? E.happy : E.sad) : p.guessed ? E.excited : E.sad;
  if (state.phase === 'playing' && p.guessed) return E.happy;
  return base;
}
function avatar(p, sz = 40, opts = {}) {
  const ring = opts.plain ? '' : p.guessed ? 'ok' : p.isPicker ? 'pick' : '';
  const badge = opts.badge || (opts.plain ? '' : p.isHost ? `<span class="badge" title="Host">${icon('star')}</span>` : p.guessed ? `<span class="badge good">${icon('check')}</span>` : '');
  const fl = p.flair || {}, fr = flairKey(fl.frame), cheer = p.react && p.react.k === 'excited' && nowMs() - p.react.at < 4500;
  return `<span class="av ${ring} ${p.online === false ? 'off' : ''}" ${fr ? `data-frame="${fr}"` : ''} style="--sz:${sz}px" aria-hidden="true">${avSvg(cfgOf(p), exprFor(p))}${cfgOf(p).pet ? `<span class="pet" aria-hidden="true">${Avatar.petSvg(cfgOf(p).pet)}</span>` : ''}${badge}${cheer && fl.fx ? fxHtml(flairKey(fl.fx)) : ''}</span>`;
}
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

/* ---------- window chrome ---------- */
const CTL = { min: '<path d="M5 17h14"/>', max: '<rect x="5" y="5" width="14" height="14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>' };
const ctlSvg = (k) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${CTL[k]}</svg>`;
const winCtl = (closeAttrs) => `<span class="ctl">${'<span aria-hidden="true">' + ctlSvg('min') + '</span><span aria-hidden="true">' + ctlSvg('max') + '</span>'}${closeAttrs ? `<button type="button" class="close" ${closeAttrs}>${ctlSvg('x')}</button>` : `<span class="close" aria-hidden="true">${ctlSvg('x')}</span>`}</span>`;
const smallMark = MARK.replace('class="mark"', 'class="mark" style="width:22px;height:15px"');

/* ---------- home ---------- */
function renderHome() {
  document.body.dataset.phase = 'home'; inRoom = false;
  const typed = document.getElementById('nm'); if (typed) ui.name = typed.value;   // a re-render (e.g. invite check finishing) must not wipe the name being typed
  const inv = ui.invite, bad = inv && (inv.status === 'missing' || inv.status === 'full');
  const meRow = `<div class="me-row"><button type="button" class="avbtn" data-act="avatar" aria-label="Customize your avatar" title="Customize your avatar">${avatar({ name: ui.name || 'you', avatar: myAvatar(), flair: auth.user ? auth.user.flair : null }, 60, { badge: `<span class="badge" aria-hidden="true">${icon('pen')}</span>` })}</button>
    <label class="sr" for="nm">Your name</label><input id="nm" name="name" maxlength="20" placeholder="Your name" value="${esc(auth.user ? auth.user.username : ui.name)}" autocomplete="nickname" ${bad || auth.user ? 'disabled' : ''}></div>`;
  let form;
  if (inv) {
    form = `<div class="card invite-card" id="invcard">${inviteCardHtml()}</div>
      <form data-form="join" class="stack" style="margin-top:12px">${meRow}<button class="btn go block" id="joinbtn" ${bad ? 'disabled' : ''}>Join game</button></form>
      <p class="or">or</p><button class="btn block" data-act="home">Start your own game</button>`;
  } else {
    form = `<form data-form="create" class="stack">${meRow}<button class="btn go block">Create a game</button></form><p class="or">or join with a code</p>
      <form data-form="join" class="field"><label class="sr" for="cd">Room code</label><input id="cd" class="codein" name="code" maxlength="4" placeholder="CODE" value="${esc(ui.code)}" autocapitalize="characters" autocomplete="off" spellcheck="false"><button class="btn primary">Join</button></form>`;
  }
  $app.innerHTML = `<div class="home enter"><div class="win"><div class="tb"><span class="ttl">${smallMark} Song Sense</span>${winCtl()}</div><div class="win-body">${MARK}<h1>Song <i>Sense</i></h1><p class="lede">Hint a word with up to three songs. Your friends type what it is. The faster they guess, the more they score.</p>
    ${ui.notice ? `<p class="banner warn" role="status" style="margin-bottom:16px">${esc(ui.notice)}</p>` : ''}${accountBarHtml()}${form}<p class="err" id="err" role="alert">${esc(ui.err)}</p>
    <ol class="how"><li>One player is the picker and secretly chooses 1 of 3 words: an emotion, adjective or scenario.</li><li>The picker adds a Spotify song, then optionally a second and third, to hint at it.</li><li>Everyone else listens and types guesses. Early guesses on early songs score the most.</li></ol>
    <p class="foot">Free, no accounts. Works best with 3 to 8 friends.<br><button type="button" data-act="privacy">Privacy</button> &middot; <button type="button" data-act="intro">A note from the maker</button> &middot; Not affiliated with Spotify.</p></div></div></div>`;
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

/* ---------- room shell: every panel is a glass window ---------- */
const win = (id, title, inner, extra = '') => `<div class="win ${extra}" id="${id}-win"><div class="tb"><span class="ttl" id="t-${id}">${title}</span>${winCtl()}</div>${inner}</div>`;
function shell() {
  $app.innerHTML = `<div id="room"><div class="win topwin"><div class="tb"><span class="ttl wordmark">${smallMark.replace('width:22px;height:15px', 'width:34px;height:24px')}Song <i>Sense</i></span>
    <span class="tb-tools"><button class="code" data-act="copyinvite" aria-label="Copy invite link for room ${esc(state.code)}"><b>${esc(state.code)}</b>${icon('copy')}</button></span>${winCtl('id="leavebtn" data-act="leave" aria-label="Leave game" title="Leave game"')}</div></div>
    <div class="room"><div class="col" id="colmain">
      ${win('hero', '', '<section id="hero" class="win-body hero" aria-live="polite"></section>')}
      <div class="win" id="mainwin"><div class="tb"><span class="ttl" id="t-main"></span>${winCtl()}</div><section id="main" class="win-body"></section></div>
      <div class="win" id="songswin" hidden><div class="tb"><span class="ttl">${icon('music')} Song hints</span>${winCtl()}</div><section id="songs" class="win-body"><div class="listenbar" id="listenbar" hidden></div><div class="songs" id="songlist"></div><div class="songs" id="slots" style="margin-top:12px"></div></section></div></div>
    <div class="col side"><div class="win" id="playerswin"><div class="tb"><span class="ttl">Players</span>${winCtl()}</div><section id="players" class="win-body"></section></div>
      <div class="win chat" id="chatcard"><div class="tb"><span class="ttl">${icon('send')} Chat &amp; guesses</span>${winCtl()}</div><div id="chatlog" class="chatlog" role="log" aria-live="polite" aria-label="Game chat" tabindex="0"></div>
      <form id="chatform" class="chatform" autocomplete="off"><label class="sr" for="chatin" id="chatlbl">Message</label><input id="chatin" maxlength="80" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Say something&hellip;"><button class="btn sm primary" aria-label="Send">${icon('send')}</button></form></div></div></div></div>`;
  for (const k of Object.keys(last)) delete last[k];
  inRoom = true;
}
const setText = (id, t) => { const el = document.getElementById(id); if (el && el.textContent !== t) el.textContent = t; };
function render() {
  if (!session || !state) return renderHome();
  if (!inRoom || !document.getElementById('room')) shell();
  const s = state; document.body.dataset.phase = s.phase;
  if (s.phase === 'gameover' && s.me.signed && ui.paidFor !== s.code + s.round) { ui.paidFor = s.code + s.round; refreshMe(); }   // coins were just paid out
  setText('t-hero', { lobby: 'Game Lobby', choosing: `Round ${s.round} of ${s.totalRounds}`, playing: `Round ${s.round} of ${s.totalRounds}`, roundend: `Round ${s.round} results`, gameover: 'Final results' }[s.phase]);
  setText('t-main', { lobby: 'Lobby settings', choosing: 'Choose your word', playing: 'Add a song', roundend: 'Round results', gameover: 'Leaderboard' }[s.phase]);
  setSection('hero', heroHtml(), s.phase + s.round + s.pickerId + (s.songs.length ? 's' : '') + s.me.guessed);
  const mh = mainHtml();
  setSection('main', mh, s.phase + s.round + s.songs.length + s.settings.cats.join() + s.settings.secs + s.settings.cycles + s.me.isHost + s.players.length + s.players.map((p) => (p.ready ? 1 : 0)).join(''));
  document.getElementById('mainwin').hidden = mh === '';
  syncSongs();
  setSection('players', playersHtml(), 'p');
  updateChat(); updateChatForm(); tickClocks();
}
setInterval(() => { if (inRoom && state) setSection('players', playersHtml(), 'p'); }, 1000);   // lets short-lived avatar reactions expire

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
  return `<div class="card settings"><div class="grp"><h3>Word categories</h3><div class="segs">${chips(Object.entries(cfg.categories).map(([k, c]) => ({ v: k, l: `${c.label} (${c.count})` })), (v) => st.cats.includes(v), 'cat')}</div></div>
    <div class="grp"><h3>Guessing time per round</h3><div class="segs">${chips(cfg.secs.map((n) => ({ v: n, l: n + 's' })), (v) => st.secs === Number(v), 'secs')}</div></div>
    <div class="grp"><h3>Turns as picker each</h3><div class="segs">${chips(Array.from({ length: cfg.maxCycles }, (_, i) => ({ v: i + 1, l: String(i + 1) })), (v) => st.cycles === Number(v), 'cycles')}</div></div>
    ${host ? '' : '<p class="hint" style="margin-top:12px">Only the host can change these.</p>'}</div>`;
}
function mainHtml() {
  const s = state, me = s.me;
  if (s.phase === 'lobby') {
    const meP = P(me.id), guests = s.players.filter((p) => !p.isHost), nready = guests.filter((p) => p.ready).length;
    const can = s.players.length >= cfg.minPlayers && s.settings.cats.length;
    return `<div class="card invite-card"><p class="label">Room code</p><div class="tilesbig" aria-label="Room code ${esc(s.code)}">${[...s.code].map((c) => `<span>${esc(c)}</span>`).join('')}</div>
      <div class="row center" style="margin-top:12px"><button class="btn sm" data-act="copyinvite">${icon('copy')}Copy invite link</button>${navigator.share ? `<button class="btn sm" data-act="share">${icon('share')}Share</button>` : ''}</div>
      <p class="hint" style="margin-top:10px">Friends open the link or enter the code at ${esc(location.host)}.</p>${me.signed ? '' : `<p class="hint" style="margin-top:6px">You're a guest: sign in from the home screen to earn coins and keep your avatar.</p>`}</div>${settingsHtml()}
      ${me.isHost ? `<button class="btn go block" data-act="start" ${can ? '' : 'disabled'}>${can ? 'Start game' : 'Need 2+ players'}</button><p class="hint" style="text-align:center">${guests.length ? `${nready} of ${guests.length} players ready${nready < guests.length ? ' (you can start anyway)' : ''}` : 'Waiting for friends to join&hellip;'}</p>`
        : `<button class="btn ${meP.ready ? '' : 'go'} block" data-act="ready" aria-pressed="${!!meP.ready}">${meP.ready ? 'Ready! (click to undo)' : "I'm ready!"}</button><p class="hint" style="text-align:center">Waiting for ${esc(hostName())} to start the game&hellip;</p>`}
      <button class="btn sm block" data-act="avatar">${icon('pen')}Edit my avatar</button><p class="err" id="err" role="alert">${esc(ui.err)}</p>`;
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
  const searchForm = cfg.search ? `<form data-form="search" class="field"><label class="sr" for="sq">Search Spotify</label><input id="sq" name="q" placeholder="Search a song or artist" value="${esc(q)}" autocomplete="off" enterkeyhint="search"><button class="btn" ${ui.searching ? 'disabled' : ''}>${icon('search')}<span>${ui.searching ? 'Searching&hellip;' : 'Search'}</span></button></form>` : '';
  return `<div class="card"><p class="label">${n ? `Add another hint &middot; song ${n + 1} of 3` : 'Add your first song &middot; song 1 of 3'}</p><p class="hint" style="margin:4px 0 12px">${n ? 'Optional. Later songs are easier but worth fewer points to guessers.' : 'Choose a song that makes people feel your word. Everyone else will see it.'}</p>
    ${searchForm || '<p class="banner warn">Song search isn\'t set up on this server yet. The host needs to add the Spotify keys in the server settings.</p>'}${hits}<p class="err" id="err" role="alert">${esc(ui.err)}</p></div>`;
}
function resultsHtml() {
  const r = state.result, gs = r.guessers;
  return `<div class="card res"><p class="label" style="text-align:center">The ${esc(catLabel(r.category || '').toLowerCase())} was</p><p class="answer">${esc(r.word || '')}</p>
    ${gs.length ? `<ol class="rank">${gs.map((g, i) => `<li><span class="pos">${i + 1}</span>${avatar(P(g.id), 38, { plain: true })}<span class="nm"><span class="${nameCls(P(g.id))}">${esc(g.name)}</span><span class="tag">after ${plural(g.songs, 'song')}</span></span><span class="pts" style="color:var(--good)">+${g.points}</span></li>`).join('')}</ol>` : '<p class="muted" style="text-align:center;margin:12px 0">Nobody got it this time.</p>'}
    ${r.pickerPoints ? `<p class="hint" style="text-align:center;margin-top:12px"><b style="color:var(--text)">${esc(r.pickerName)}</b> earns +${r.pickerPoints} for a great hint</p>` : ''}
    ${r.missed.length && gs.length ? `<p class="hint" style="text-align:center;margin-top:6px">Didn't get it: ${esc(r.missed.join(', '))}</p>` : ''}</div>
    ${state.me.isHost ? `<button class="btn block" data-act="next">Next round now</button>` : ''}<p class="err" id="err" role="alert">${esc(ui.err)}</p>`;
}
function finalHtml() {
  const f = state.final || [], top = f[0], tie = f.filter((x) => x.score === (top || {}).score);
  return `<div class="card"><div class="winner pop"><div class="podium">${top ? avatar(P(top.id), 110, { plain: true }) : ''}</div><p class="label" style="margin-top:10px">${tie.length > 1 ? 'It\'s a tie' : 'Winner'}</p><h2>${esc(tie.map((t) => t.name).join(' & '))}</h2></div>
    <ol class="rank">${f.map((p, i) => `<li><span class="pos">${i + 1}</span>${avatar(P(p.id), 38, { plain: true })}<span class="nm"><span class="${nameCls(P(p.id))}">${esc(p.name)}</span>${p.id === state.me.id ? '<span class="tag">you</span>' : ''}</span><span class="pts nums">${p.score}</span></li>`).join('')}</ol></div>
    ${state.me.signed ? `<p class="banner" style="margin-top:12px;text-align:center">${COIN} You earned <b>+${(state.earned || 0).toLocaleString()}</b> coins! <button type="button" class="btn sm" data-act="shop" style="margin-left:6px">Visit Alena's shop</button></p>` : `<p class="banner warn" style="margin-top:12px;text-align:center">Playing as a guest. Create a profile on the home screen to turn your points into coins.</p>`}
    <div class="stack-gap" style="margin-top:16px">${state.me.isHost ? `<button class="btn primary block" data-act="again">Play again</button>` : `<p class="banner warn" style="text-align:center">Waiting for ${esc(hostName())} to start another game&hellip;</p>`}</div><p class="err" id="err" role="alert">${esc(ui.err)}</p>`;
}

/* ---------- songs: a media-player frame around Spotify's official embed ---------- */
// The audio always comes from Spotify's own embedded player, started by the listener's click. We only frame it (art, title, artist).
// (Spotify's iFrame API needs 'unsafe-eval' in our CSP, so it is deliberately not used; no fake controls or audio visuals.)
const embedSrc = (id) => `https://open.spotify.com/embed/track/${encodeURIComponent(id)}?utm_source=generator&theme=0`;
const splitTitle = (t) => { const [x, ...y] = String(t || '').split(' \u2014 '); return { title: x || 'Spotify track', artist: y.join(' \u2014 ') }; };
function syncSongs() {
  const s = state, box = document.getElementById('songswin'), list = document.getElementById('songlist'), slots = document.getElementById('slots'); if (!box) return;
  const show = (s.phase === 'playing' || s.phase === 'roundend') && (s.songs.length > 0 || s.phase === 'playing'); box.hidden = !show;
  const have = [...list.children]; const want = s.phase === 'playing' || s.phase === 'roundend' ? s.songs : [];
  have.forEach((el) => { if (!want.some((w) => w.trackId === el.dataset.id)) el.remove(); });
  for (const w of want) if (!list.querySelector(`[data-id="${w.trackId}"]`)) {
    const t = splitTitle(w.title), d = document.createElement('div'); d.className = 'wmp enter'; d.dataset.id = w.trackId;
    d.innerHTML = `<div class="wmp-top">${w.thumb ? `<img class="art" src="${esc(w.thumb)}" alt="Album art" referrerpolicy="no-referrer">` : `<span class="art">${icon('music')}</span>`}
        <div class="meta"><span class="n">Hint song ${w.n} of ${s.maxSongs}</span><b>${esc(t.title)}</b><span class="a">${esc(t.artist)}</span></div></div>
      <div class="wmp-bar"><span class="sync">Paused</span><div class="seek" role="progressbar" aria-label="Song progress"><i></i></div><span class="time">0:00 / 0:30</span></div>
      <div class="embedhost"><iframe class="pframe" src="/player.html?id=${encodeURIComponent(w.trackId)}" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms" allow="autoplay; encrypted-media; clipboard-write" loading="lazy" title="Spotify player for song ${w.n}"></iframe></div>`;
    d.dataset.n = w.n; d._p = { ready: false, paused: true, pos: 0, dur: 0, seen: 0 };
    list.appendChild(d);
  }
  const lb = document.getElementById('listenbar');
  if (lb) {
    const mode = s.songs.length ? (s.me.isPicker ? 'p' : ui.listen ? 'on' : 'off') : '';
    if (last.listen !== mode) {
      last.listen = mode; lb.hidden = !mode;
      lb.innerHTML = mode === 'p' ? `<span>${icon('music')} Press play on a song: everyone who joined <b>Listen along</b> hears it at the same moment.</span>`
        : mode === 'on' ? `<span>${icon('music')} <b>Listening along</b> with ${esc(P(s.pickerId).name)}. Play, pause and seeking follow the picker.</span><button type="button" class="btn sm" data-act="listen">Stop</button>`
        : `<span>${icon('music')} Hear the songs in sync with ${esc(P(s.pickerId).name)}:</span><button type="button" class="btn go sm" data-act="listen">Listen along</button>`;
    }
  }
  const need = s.phase === 'playing' ? Array.from({ length: s.maxSongs - s.songs.length }, (_, i) => s.songs.length + i + 1) : [];
  const html = need.map((n, i) => `<div class="slot ${i === 0 ? 'next' : ''}">${icon('music')}<span>${i === 0 ? (s.me.isPicker ? `Song ${n}: add it below${n > 1 ? ' (optional)' : ''}` : `Song ${n}${n === 1 ? ': waiting for the picker&hellip;' : ' may appear later as another hint'}`) : `Song ${n} (optional hint)`}</span></div>`).join('');
  if (last.slots !== html) { slots.innerHTML = html; last.slots = html; }
  if (show && s.songs.length) { const t = document.getElementById('songhint'); if (!t) slots.insertAdjacentHTML('beforebegin', '<p class="hint" id="songhint" style="margin-top:8px">Press play on a song. Every hint plays as a 30-second clip for everyone, so all players hear the same thing.</p>'); }
  else { const t = document.getElementById('songhint'); if (t) t.remove(); }
}

/* ---------- shared playback ----------
   The picker's own Spotify player is the remote control: its play/pause/seek are reported to the server, and every listener who clicked
   "Listen along" has their player follow that shared state (start position = reported position + time elapsed). Each listener's playback
   is therefore opted into by their own click. Audio is always Spotify's official player; nothing is streamed or proxied by us. */
const frameCmd = (d, m) => { const f = d.querySelector('iframe'); if (f && f.contentWindow) f.contentWindow.postMessage(Object.assign({ ss: 1 }, m), '*'); };
const CLIP_MS = 30000;                                         // every hint is a 30-second clip for everyone (signed-out listeners only get 30 s from Spotify anyway)
let lastSent = null, sendAt = 0;
window.addEventListener('message', (ev) => {
  const m = ev.data; if (!m || m.ss !== 1 || !state) return;
  const d = [...document.querySelectorAll('.wmp')].find((x) => { const f = x.querySelector('iframe'); return f && f.contentWindow === ev.source; }); if (!d) return;
  const p = d._p; if (m.t === 'ready') { p.ready = true; return; }
  if (m.t !== 'update') return;
  p.paused = m.paused; p.pos = m.position; p.dur = m.duration; p.seen = Date.now(); p.ready = true;
  d.classList.toggle('playing', !m.paused && !m.buffering);
  const clip = Math.min(m.duration || CLIP_MS, CLIP_MS);
  d.querySelector('.seek i').style.width = Math.min(100, (m.position / clip) * 100) + '%';
  d.querySelector('.time').textContent = mmss(Math.min(m.position, clip)) + ' / ' + mmss(clip);
  if (!m.paused && m.position >= CLIP_MS) frameCmd(d, { t: 'pause' });      // full-song accounts stop at the same 30 s as everyone else
  d.querySelector('.sync').textContent = m.buffering ? 'Loading' : m.paused ? 'Paused' : 'Playing';
  if (state.me.isPicker && state.phase === 'playing') report(d);
});
function report(d) {                                           // picker only: publish this player's state
  const p = d._p, n = Number(d.dataset.n), now = Date.now();
  const expect = lastSent && lastSent.n === n ? (lastSent.playing ? lastSent.pos + (now - lastSent.at) : lastSent.pos) : -1e9;
  const playing = !p.paused, changed = !lastSent || lastSent.n !== n || lastSent.playing !== playing || Math.abs(p.pos - expect) > 2500;
  if (!changed || now - sendAt < 400) return;
  if (p.paused && (!lastSent || lastSent.n !== n)) return;      // an idle, never-played song is not news
  sendAt = now; lastSent = { n, playing, pos: p.pos, at: now };
  api('playback', { n, playing, pos: p.pos }).catch(() => {});
}
function follow() {                                            // listeners who opted in: mirror the picker's player
  if (!state || !ui.listen || state.me.isPicker || state.phase !== 'playing') return;
  const pl = state.play, now = Date.now();
  for (const d of document.querySelectorAll('.wmp')) {
    const p = d._p, n = Number(d.dataset.n); if (!p || !p.ready || now - (d._cmd || 0) < 1500) continue;
    const here = p.paused ? p.pos : p.pos + (now - p.seen);
    if (!pl || pl.n !== n) { if (!p.paused) { frameCmd(d, { t: 'pause' }); d._cmd = now; } continue; }
    const target = pl.playing ? pl.pos + (nowMs() - pl.at) : pl.pos;
    if (pl.playing) {
      if (target > Math.min(p.dur || CLIP_MS, CLIP_MS)) { if (!p.paused) frameCmd(d, { t: 'pause' }); continue; }
      if (p.paused) { frameCmd(d, { t: 'playAt', sec: target / 1000 }); d._cmd = now; }
      else if (Math.abs(here - target) > 2500) { frameCmd(d, { t: 'seek', sec: target / 1000 }); d._cmd = now; }
    } else if (!p.paused) { frameCmd(d, { t: 'pause' }); d._cmd = now; }
  }
}
setInterval(follow, 500);

/* ---------- players ---------- */
function playersHtml() {
  const s = state, ps = s.phase === 'lobby' ? s.players : [...s.players].sort((a, b) => b.score - a.score);
  return `<p class="label" style="margin-bottom:4px">${plural(s.players.length, 'player')}</p><ul class="players">${ps.map((p) => {
    let st = '', cls = '', dot = '';
    if (s.phase === 'lobby') { st = !p.online ? 'Away' : p.isHost ? 'Host' : p.ready ? 'Ready' : 'Not ready'; cls = p.online && p.ready ? 'good' : ''; dot = p.online && !p.isHost ? `<span class="rdy ${p.ready ? '' : 'no'}"></span>` : ''; }
    else if (s.phase === 'roundend') { st = p.isPicker ? 'Picker' : p.guessed ? 'Got it' : 'Missed'; cls = p.guessed ? 'good' : ''; }
    else if (s.phase === 'gameover') st = p.online ? '' : 'Away';
    else if (p.isPicker) { st = 'Picker'; cls = 'acc'; } else if (p.guessed) { st = 'Got it!'; cls = 'good'; } else st = s.phase === 'playing' ? (p.online ? 'Guessing' : 'Away') : (p.online ? 'Waiting' : 'Away');
    return `<li class="${p.id === s.me.id ? 'me' : ''}">${avatar(p, 46)}<span class="nm"><span class="${nameCls(p)}">${esc(p.name)}</span>${p.id === s.me.id ? ' <span class="hint">(you)</span>' : ''}${titleOf(p) ? `<span class="ptitle sm">${esc(titleOf(p))}</span>` : ''}<span class="st ${cls}">${dot}${st}</span></span><span class="sc nums">${p.score}${p.gain ? `<span class="gain">+${p.gain}</span>` : ''}</span></li>`;
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

/* ---------- avatar maker ---------- */
const cr = { cfg: null, tab: 'hair', prev: null, focus: '', opener: null };
const CR_TABS = [['hair', 'Hair'], ['face', 'Face'], ['skin', 'Skin'], ['clothes', 'Clothes'], ['acc', 'Accessories'], ['pet', 'Pets']];
const LOCK = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
const lockOf = (field, i) => { const it = Shop.BY_ID[Shop.itemId(field, i)]; return it && !ownedSet().has(it.id) ? it : null; };
const optGrid = (field, label) => `<h4>${label}</h4><div class="ogrid" role="group" aria-label="${label}">${Array.from({ length: Avatar.SCHEMA[field] }, (_, i) => {
  const nm = Avatar.NAMES[field][i], lk = lockOf(field, i);
  return `<button type="button" class="oth ${lk ? 'locked' : ''}" data-cr="${field}" data-i="${i}" data-k="${field}${i}" aria-pressed="${cr.cfg[field] === i}" aria-label="${label}: ${nm}${lk ? `, locked, ${lk.price} coins` : ''}">${field === 'pet' ? `<span class="petthumb">${i ? Avatar.petSvg(i) : ''}</span>` : Avatar.svg({ ...cr.cfg, [field]: i })}<small>${nm}</small>${lk ? `<span class="lk">${LOCK}${lk.price}</span>` : ''}</button>`; }).join('')}</div>`;
const swatches = (field, colors, label) => `<h4>${label}</h4><div class="swatches" role="group" aria-label="${label}">${colors.map((c, i) => { const lk = lockOf(field, i); return `<button type="button" class="sw ${lk ? 'locked' : ''}" style="background:${c}" data-cr="${field}" data-i="${i}" data-k="${field}${i}" aria-pressed="${cr.cfg[field] === i}" aria-label="${label} ${i + 1}${lk ? `, locked, ${lk.price} coins` : ''}" ${lk ? `title="${lk.price} coins"` : ''}>${lk ? LOCK : ''}</button>`; }).join('')}</div>`;
function crPane() {
  switch (cr.tab) {
    case 'hair': return optGrid('hair', 'Hairstyle') + optGrid('bangs', 'Bangs') + swatches('hairColor', Avatar.HAIR_COLORS, 'Hair color');
    case 'face': return optGrid('eyes', 'Eye shape') + swatches('eyeColor', Avatar.EYE_COLORS, 'Eye color') + optGrid('brows', 'Eyebrows') + optGrid('expr', 'Expression') + optGrid('blush', 'Blush') + optGrid('freckles', 'Freckles') + optGrid('mark', 'Facial marking');
    case 'skin': return swatches('skin', Avatar.SKIN, 'Skin tone');
    case 'clothes': return optGrid('clothes', 'Top') + swatches('clothesColor', Avatar.CLOTH_COLORS, 'Color');
    case 'pet': return optGrid('pet', 'Companion (sits next to your avatar)');
    default: return optGrid('acc', 'Accessory') + swatches('accColor', Avatar.CLOTH_COLORS, 'Accessory color');
  }
}
function renderCreator() {
  const need = Shop.lockedIn(cr.cfg, ownedSet());
  const el = document.getElementById('creator'), old = el.querySelector('.pane'), top = old ? old.scrollTop : 0, ex = cr.prev === null ? cr.cfg.expr : cr.prev;
  el.innerHTML = `<div class="win cw" role="dialog" aria-modal="true" aria-labelledby="cwt"><div class="tb"><span class="ttl" id="cwt">Avatar Maker</span><span class="ctl"><span aria-hidden="true">${ctlSvg('min')}</span><span aria-hidden="true">${ctlSvg('max')}</span><button type="button" class="close" data-ca="close" aria-label="Close avatar maker">${ctlSvg('x')}</button></span></div>
    <div class="win-body"><div class="cw-grid"><div class="cw-prev"><div class="frame"><div class="scene">${Avatar.svg(cr.cfg, { expr: ex })}</div>${cr.cfg.pet ? `<span class="pet">${Avatar.petSvg(cr.cfg.pet)}</span>` : ''}</div>
      <div><p class="label" style="text-align:center;margin-bottom:6px">Preview a mood</p><div class="ex-row">${Avatar.NAMES.expr.map((n, i) => `<button type="button" class="btn" data-ca="prev" data-i="${i}" data-k="p${i}" aria-pressed="${cr.prev === i}">${n}</button>`).join('')}</div></div></div>
      <div class="cw-opts"><div class="tabs" role="tablist">${CR_TABS.map(([k, l]) => `<button type="button" class="tab" role="tab" data-ca="tab" data-i="${k}" data-k="t${k}" aria-selected="${cr.tab === k}">${l}</button>`).join('')}</div><div class="pane" role="tabpanel">${crPane()}</div></div></div>
    <div class="cw-foot"><button type="button" class="btn" data-ca="random">Randomize</button><button type="button" class="btn" data-ca="reset">Reset</button><span class="sp cw-note">${need.length ? `Trying on ${need.length} item${need.length === 1 ? '' : 's'} you don't own: ${need.slice(0, 3).map((i) => esc(Shop.BY_ID[i].name)).join(', ')}${need.length > 3 ? '&hellip;' : ''}. ${auth.user ? '<button type="button" class="linkbtn" data-ca="shop">Visit the shop</button>' : '<button type="button" class="linkbtn" data-ca="signin">Sign in to buy</button>'}` : ''}</span><button type="button" class="btn" data-ca="close">Cancel</button><button type="button" class="btn go" data-ca="save" ${need.length ? 'disabled' : ''}>Save Avatar</button></div></div></div>`;
  const pane = el.querySelector('.pane'); if (pane) pane.scrollTop = top;
  if (cr.focus) { const f = el.querySelector(`[data-k="${cr.focus}"]`); if (f) f.focus(); }
}
function openCreator() {
  cr.cfg = { ...myAvatar() }; cr.tab = 'hair'; cr.prev = null; cr.focus = 'thair'; cr.opener = document.activeElement;
  const el = document.getElementById('creator'); el.hidden = false; document.body.style.overflow = 'hidden'; renderCreator();
}
function closeCreator() {
  const el = document.getElementById('creator'); el.hidden = true; el.innerHTML = ''; document.body.style.overflow = '';
  if (cr.opener && cr.opener.focus && document.contains(cr.opener)) cr.opener.focus();
}
async function saveAvatar() {
  const a = Avatar.normalize(cr.cfg);
  if (Shop.lockedIn(a, ownedSet()).length) return toast("You don't own all of those items yet.");
  if (auth.user) { try { const r = await api('profile/avatar', { avatar: a }); auth.user = r.user; } catch (e) { return toast(e.message); } }
  store.set('songsense.avatar', a); closeCreator(); toast('Avatar saved!');
  if (session) { try { await api('avatar', { avatar: a }); await poll(true); } catch (e) { toast(e.message); } } else if (document.getElementById('nm')) renderHome();
}
document.getElementById('creator').addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.cr) { cr.cfg[t.dataset.cr] = Number(t.dataset.i); cr.focus = t.dataset.k; return renderCreator(); }
  const k = t.dataset.ca; if (!k) return; cr.focus = t.dataset.k || '';
  if (k === 'tab') cr.tab = t.dataset.i; else if (k === 'prev') cr.prev = cr.prev === Number(t.dataset.i) ? null : Number(t.dataset.i);
  else if (k === 'random') { const own = ownedSet(); cr.cfg = Avatar.random(null, (f, v) => Shop.isFree(f, v) || own.has(Shop.itemId(f, v))); cr.focus = ''; } else if (k === 'reset') { cr.cfg = { ...Avatar.DEFAULT }; cr.focus = ''; }
  else if (k === 'shop') { closeCreator(); return openShop(); } else if (k === 'signin') { closeCreator(); return openAuth('login'); }
  else if (k === 'close') return closeCreator(); else if (k === 'save') return saveAvatar();
  renderCreator();
});
document.getElementById('creator').addEventListener('mousedown', (e) => { if (e.target.id === 'creator') closeCreator(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.getElementById('creator').hidden) closeCreator(); });

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
    const nmEl = document.getElementById('nm'), name = auth.user ? auth.user.username : (nmEl ? nmEl.value : val(f, 'name')).trim(); if (!auth.user) { ui.name = name; store.set('songsense.name', name); }
    const code = kind === 'join' ? (ui.invite ? ui.invite.code : val(f, 'code').toUpperCase().replace(/[^A-Z]/g, '')) : null; ui.code = code || '';
    if (!name) return setErr('Enter your name first.');
    if (kind === 'join' && !code) return setErr('Enter the 4-letter room code.');
    try { const r = await api(kind, { name, code, avatar: myAvatar() }); save({ code: r.code, pid: r.pid }); ui.invite = null; ui.err = ''; ui.notice = ''; history.replaceState(null, '', location.pathname); await poll(true); }
    catch (er) { setErr(er.message); }
  } else if (kind === 'search') {
    const q = val(f, 'q'); ui.sq = q; if (!q) return; ui.searching = true; render();
    try { ui.hits = await api('search?q=' + encodeURIComponent(q)); setErr(''); } catch (er) { setErr(er.message); ui.hits = null; }
    ui.searching = false; setSection('main', mainHtml(), 'force', true);
  }
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a === 'privacy') return document.getElementById('privacy').showModal();
  if (a === 'signin') return openAuth('login');
  if (a === 'profile') return openProfile();
  if (a === 'shop') return openShop();
  if (a === 'signout') return signOut();
  if (a === 'avatar') return openCreator();
  if (a === 'intro') return showIntro();
  if (a === 'listen') { ui.listen = !ui.listen; last.listen = null; toast(ui.listen ? "Listening along: the picker's play button now plays for you too" : 'Stopped listening along'); if (state) syncSongs(); return; }
  if (a === 'home') { ui.invite = null; ui.code = ''; history.replaceState(null, '', location.pathname); return renderHome(); }
  if (a === 'copyinvite') { const u = inviteUrl(); try { await navigator.clipboard.writeText(u); toast('Invite link copied'); } catch { prompt('Copy this invite link:', u); } return; }
  if (a === 'share') { try { await navigator.share({ title: 'Song Sense', text: 'Join my Song Sense game!', url: inviteUrl() }); } catch { /* cancelled */ } return; }
  if (a === 'leave') {
    if (!ui.leaveArmed) { ui.leaveArmed = true; toast('Click the red X again to leave the game'); setTimeout(() => { ui.leaveArmed = false; }, 3000); return; }
    try { await api('leave', {}); } catch { /* leave locally anyway */ } return leave('');
  }
  if (!state) return;
  if (a === 'start') return act('start', {});
  if (a === 'ready') return act('ready', { ready: !P(state.me.id).ready });
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

/* ---------- welcome message from the maker: a Pokemon-style dialogue box, shown once per browser ---------- */
const INTRO_KEY = 'songsense.intro.v2';      // v2: the welcome message now continues into the cutscene, so everyone sees it once more
const MAKER = { skin: 1, hair: 1, hairColor: 1, bangs: 2, eyes: 3, eyeColor: 4, brows: 0, expr: 2, blush: 1, freckles: 0, mark: 0, clothes: 1, clothesColor: 0, acc: 1, accColor: 9 };
const INTRO_PAGES = [
  'Hi Vivian,',
  'I started making this site before you left for your rotation. In hopes to learn more about making apps / sites in JavaScript.',
  'I wanted to finish right before you left but I suck lol.',
  'I hope you enjoy',
];
function showIntro() {
  if (document.getElementById('intro')) return;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = document.createElement('div'); el.id = 'intro'; el.className = 'intro'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'A message from the maker: ' + INTRO_PAGES.join(' '));
  el.innerHTML = `<button type="button" class="intro-skip" data-i="skip">Skip</button><div class="intro-stage"><div class="intro-avwrap" aria-hidden="true"><div class="intro-av"></div><div class="hearts"></div></div>
    <button type="button" class="dlg" data-i="next" aria-label="Next"><span class="dlg-text" aria-hidden="true"></span><span class="dlg-arrow" aria-hidden="true">&#9660;</span></button></div>`;
  document.body.appendChild(el); document.body.style.overflow = 'hidden';
  const av = el.querySelector('.intro-av'), txt = el.querySelector('.dlg-text'), arrow = el.querySelector('.dlg-arrow'), btn = el.querySelector('.dlg');
  const hearts = el.querySelector('.hearts');
  let page = 0, i = 0, timer = null, talk = null, done = false, kissT = null, cut = false;
  const face = (x) => { av.innerHTML = Avatar.svg(MAKER, { expr: x, label: 'The maker' }); };
  face(MAKER.expr);
  const stopTalk = () => { clearInterval(talk); talk = null; face(MAKER.expr); };
  const HEART = '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.5 6.4 4.5c2.2 0 3.7 1.2 5.6 3.3 1.9-2.1 3.4-3.3 5.6-3.3 3.7 0 5.5 3.9 4 7.3C19.5 16.4 12 21 12 21z" fill="#ff6f91" stroke="#c43a5c" stroke-width="1.2" stroke-linejoin="round"/><path d="M7 7.5c.8-.9 1.9-1 2.6-.4" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".8"/></svg>';
  function blowKiss() {                                          // last page: wink, pucker, and send hearts toward the player
    face('kiss');
    if (!reduce) for (let k = 0; k < 4; k++) { const h = document.createElement('span'); h.className = 'heart'; h.innerHTML = HEART; h.style.animationDelay = (k * 0.28) + 's'; h.style.setProperty('--dx', (k % 2 ? -1 : 1) * (18 + k * 10) + 'px'); h.style.setProperty('--sz', (30 + k * 8) + 'px'); hearts.appendChild(h); }
    kissT = setTimeout(() => { hearts.innerHTML = ''; face(MAKER.expr); }, 2200);
  }
  function finishPage() { clearInterval(timer); txt.textContent = INTRO_PAGES[page]; done = true; stopTalk(); arrow.classList.add('on'); if (page === INTRO_PAGES.length - 1) blowKiss(); }
  function start() {
    done = false; i = 0; txt.textContent = ''; arrow.classList.remove('on');
    if (reduce) return finishPage();
    let flip = false; talk = setInterval(() => { flip = !flip; face(flip ? Avatar.EXPR.happy : Avatar.EXPR.excited); }, 140);
    timer = setInterval(() => { i++; txt.textContent = INTRO_PAGES[page].slice(0, i); if (i >= INTRO_PAGES[page].length) finishPage(); }, 32);
  }
  function close() { clearInterval(timer); clearInterval(talk); clearTimeout(kissT); store.set(INTRO_KEY, 1); el.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); if (!session) renderHome(); }
  function advance() { if (cut) return; if (!done) return finishPage(); if (page < INTRO_PAGES.length - 1) { page++; start(); } else { cut = true; clearTimeout(kissT); hearts.innerHTML = ''; el.style.display = 'none'; playCutscene(close); } }   // after the last line: straight into the cutscene
  function onKey(e) { if (cut) return; if (e.key === 'Escape') close(); else if (e.key === 'Enter' || e.key === ' ') { if (document.activeElement && document.activeElement.dataset.i === 'skip') return; e.preventDefault(); advance(); } }
  el.addEventListener('click', (e) => { if (cut) return; const t = e.target.closest('[data-i]'); if (t && t.dataset.i === 'skip') return close(); advance(); });
  document.addEventListener('keydown', onKey);
  btn.focus(); start();
}

fetch('/api/config').then((r) => r.json()).then((c) => { cfg = c; if (state) render(); }).catch(() => {});
if (session) poll(true).then(() => { if (!state) render(); }); else { render(); if (!store.get(INTRO_KEY)) showIntro(); }
refreshMe().then(() => { if (state) render(); else if (!session) renderHome(); });   // load the profile (if signed in) and redraw with coins and flair
