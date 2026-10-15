'use strict';
// Profiles, coins and Alena's shop. Loaded before app.js; it only defines things at load time and uses app.js helpers
// (api, esc, icon, toast, avatar, Avatar, Shop ...) when its functions run.
const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const lsSet = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* private mode */ } };
const auth = { token: lsGet('songsense.token'), user: null };
const COIN = '<svg class="coin" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#f5c542" stroke="#b8860b" stroke-width="1.2"/><circle cx="10" cy="10" r="6.4" fill="none" stroke="#fff3b0" stroke-width="1.2"/><path d="M10 5.5l1.2 2.8 3 .3-2.3 2 .7 3L10 12l-2.6 1.6.7-3-2.3-2 3-.3z" fill="#b8860b"/></svg>';
const coinsHtml = (n) => `<span class="coins" title="${n} coins">${COIN}<b>${Number(n).toLocaleString()}</b></span>`;
const ownedSet = () => new Set(auth.user ? auth.user.owned : []);
const FLAIR_SLOTS = [['frame', 'Frame'], ['name', 'Name color'], ['title', 'Title'], ['fx', 'Reaction effect']];

/* ---------- flair rendering (used by avatar(), the player list and results) ---------- */
const flairKey = (id) => String(id || '').split(':')[1] || '';
const frameOf = (p) => flairKey(p.flair && p.flair.frame);
const nameCls = (p) => (p.flair && p.flair.name ? 'nc-' + flairKey(p.flair.name) : '');
const titleOf = (p) => { const it = p.flair && p.flair.title && Shop.BY_ID[p.flair.title]; return it ? it.text : ''; };
const FX_GLYPH = { sparkles: '\u2726', hearts: '\u2665', confetti: '\u25A0', stars: '\u2605', sakura: '\u273F', lightning: '\u26A1', fireworks: '\u273A' };
function fxHtml(kind) {
  const g = FX_GLYPH[kind]; if (!g) return '';
  return `<span class="fx fx-${kind}" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i style="--a:${i * 36}deg;--d:${(i % 5) * 0.07}s">${g}</i>`).join('')}</span>`;
}

/* ---------- session ---------- */
async function refreshMe() {
  if (!auth.token) { auth.user = null; return; }
  try { const r = await api('me'); auth.user = r.user; }
  catch (e) { if (e.status === 401) { auth.token = ''; auth.user = null; lsSet('songsense.token', ''); } }
}
function setAuth(r) { auth.token = r.token; auth.user = r.user; lsSet('songsense.token', r.token); }
async function signOut() {
  try { await api('logout', {}); } catch { /* token may already be invalid */ }
  auth.token = ''; auth.user = null; lsSet('songsense.token', ''); svgMemo.clear(); closeOverlay();
  if (session) await leaveRoomQuietly(); else renderHome();
  toast('Signed out');
}
async function leaveRoomQuietly() { try { await api('leave', {}); } catch { /* ignore */ } leave(''); }
async function syncRoomLook() {                                   // tell the room about a changed look/flair
  if (session && state && state.me && state.me.signed) { try { await api('avatar', {}); await poll(true); } catch { /* not critical */ } }
}

/* ---------- generic overlay window ---------- */
const OV = () => document.getElementById('overlay');
function openOverlay(title, body, cls = '') {
  const el = OV(), old = el.querySelector('.pane'), top = old ? old.scrollTop : 0; if (el.hidden) ui.opener = document.activeElement; el.hidden = false; document.body.style.overflow = 'hidden';
  el.innerHTML = `<div class="win cw ${cls}" role="dialog" aria-modal="true" aria-labelledby="ovt"><div class="tb"><span class="ttl" id="ovt">${title}</span><span class="ctl"><span aria-hidden="true">${ctlSvg('min')}</span><span aria-hidden="true">${ctlSvg('max')}</span><button type="button" class="close" data-ov="close" aria-label="Close">${ctlSvg('x')}</button></span></div>${body}</div>`;
  const pane = el.querySelector('.pane'); if (pane && top) pane.scrollTop = top;
}
function closeOverlay() { const el = OV(); if (!el || el.hidden) return; el.hidden = true; el.innerHTML = ''; document.body.style.overflow = ''; ui.ovKind = ''; if (ui.opener && ui.opener.focus && document.contains(ui.opener)) ui.opener.focus(); }

/* ---------- sign in / create profile ---------- */
function openAuth(mode = 'login') {
  ui.ovKind = 'auth'; ui.authMode = mode;
  const create = mode === 'signup';
  openOverlay('Profile', `<div class="win-body" style="max-width:420px;margin:auto;width:100%"><div class="segs" style="margin-bottom:12px"><button type="button" class="chip" aria-pressed="${!create}" data-ov="mode" data-m="login">Sign in</button><button type="button" class="chip" aria-pressed="${create}" data-ov="mode" data-m="signup">Create profile</button></div>
    <p class="muted" style="margin-bottom:12px">${create ? 'Pick a username and a 4-digit PIN. Your avatar, coins and purchases are saved to it, and you can sign in from any device.' : 'Welcome back! Sign in to load your avatar and coins.'}</p>
    <form data-ov="auth" class="stack"><label class="sr" for="au">Username</label><input id="au" name="u" maxlength="16" placeholder="Username (3 to 16 letters, numbers, _)" autocomplete="username" autocapitalize="off" spellcheck="false">
    <label class="sr" for="ap">4-digit PIN</label><input id="ap" name="p" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="4-digit PIN" autocomplete="${create ? 'new-password' : 'current-password'}">
    <button class="btn go block">${create ? 'Create profile' : 'Sign in'}</button></form><p class="err" id="autherr" role="alert"></p>
    <p class="hint">A 4-digit PIN is easy to guess, so don't reuse a PIN you use anywhere important. After 5 wrong tries the username is locked for 15 minutes.${create ? ` New profiles start with ${Shop.STARTER_COINS} coins.` : ''}</p></div>`);
  const u = document.getElementById('au'); if (u) u.focus();
}
async function submitAuth(form) {
  const u = form.elements.u.value.trim(), p = form.elements.p.value, err = document.getElementById('autherr'), btn = form.querySelector('button');
  btn.disabled = true; err.textContent = '';
  try {
    const r = await api(ui.authMode === 'signup' ? 'signup' : 'login', { username: u, pin: p, ...(ui.authMode === 'signup' ? { avatar: Avatar.sanitize(myAvatarLocal(), []) } : {}) });
    setAuth(r); svgMemo.clear();
    if (!r.user.avatar) { try { const a = Avatar.sanitize(myAvatarLocal(), r.user.owned); const x = await api('profile/avatar', { avatar: a }); auth.user = x.user; } catch { /* keeps default */ } }
    closeOverlay(); toast(ui.authMode === 'signup' ? `Welcome, ${r.user.username}! ${Shop.STARTER_COINS} starter coins added.` : `Welcome back, ${r.user.username}!`);
    if (!session) renderHome();
  } catch (e) { err.textContent = e.message; btn.disabled = false; }
}

/* ---------- account bar (home page) ---------- */
function accountBarHtml() {
  if (!auth.user) return `<div class="acct"><span class="muted">Playing as a guest. Create a profile to save your avatar and earn coins.</span><button type="button" class="btn sm" data-act="signin">Sign in / Create profile</button></div>`;
  const u = auth.user;
  return `<div class="acct"><span class="who">${coinsHtml(u.coins)}</span><span class="row" style="gap:6px"><button type="button" class="btn sm" data-act="profile">Profile</button><button type="button" class="btn sm go" data-act="shop">Shop</button><button type="button" class="btn sm" data-act="signout">Sign out</button></span></div>`;
}

/* ---------- profile ---------- */
function openProfile() {
  if (!auth.user) return openAuth('login');
  ui.ovKind = 'profile'; renderProfile();
}
function renderProfile() {
  const u = auth.user, me = { name: u.username, avatar: u.avatar, flair: u.flair, id: 'me' };
  const owned = (kind) => Shop.ITEMS.filter((i) => i.kind === kind && u.owned.includes(i.id));
  const rows = FLAIR_SLOTS.map(([slot, label]) => {
    const list = owned(slot), cur = u.flair[slot];
    return `<h4>${label}</h4><div class="segs"><button type="button" class="chip" aria-pressed="${!cur}" data-ov="equip" data-slot="${slot}" data-id="">None</button>${list.map((i) => `<button type="button" class="chip" aria-pressed="${cur === i.id}" data-ov="equip" data-slot="${slot}" data-id="${i.id}">${esc(i.name)}</button>`).join('')}</div>${list.length ? '' : `<p class="hint" style="margin-top:6px">None yet. Alena sells some!</p>`}`;
  }).join('');
  openOverlay('My Profile', `<div class="win-body"><div class="cw-grid pgrid"><div class="cw-prev" style="gap:8px"><div class="pfav">${avatar(me, 140, { plain: true })}</div><p class="pname ${nameCls(me)}">${esc(u.username)}</p><p class="ptitle">${esc(titleOf(me))}</p>
    ${coinsHtml(u.coins)}<p class="hint">${plural(u.stats.games, 'game')} played &middot; ${plural(u.stats.wins, 'win')}</p>
    <button type="button" class="btn sm block" data-ov="maker">Avatar Maker</button><button type="button" class="btn sm go block" data-ov="shop">Alena's shop</button></div>
    <div class="pane"><p class="hint" style="margin-bottom:8px">Flair you've bought shows next to your name in games. Pick what to wear:</p>${rows}</div></div></div>`, 'wide');
}

/* ---------- Alena's shop ---------- */
const ALENA = { skin: 2, hair: 5, hairColor: 0, bangs: 1, eyes: 1, eyeColor: 0, brows: 2, expr: 0, blush: 2, freckles: 0, mark: 0, clothes: 2, clothesColor: 4, acc: 6, accColor: 7 };
function teddySvg(happy = true) {                                   // Teddy, a black shih tzu
  const INKC = '#2a2140', fur = '#2b2b36', fur2 = '#3a3a48';
  return `<svg class="teddy-svg" viewBox="0 0 100 100" role="img" aria-label="Teddy the shih tzu" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 100 C20 82 34 74 50 74 C66 74 80 82 80 100Z" fill="${fur}" stroke="${INKC}" stroke-width="1.6" stroke-linejoin="round"/><path d="M34 80 Q50 90 66 80 L66 85 Q50 95 34 85Z" fill="#e0556b" stroke="${INKC}" stroke-width="1.2"/><circle cx="50" cy="91" r="3" fill="#f5c542" stroke="${INKC}" stroke-width="1"/>
    <path d="M18 38 C4 42 4 74 20 78 C30 72 30 52 28 40Z" fill="#1f1f29" stroke="${INKC}" stroke-width="1.6" stroke-linejoin="round"/><path d="M82 38 C96 42 96 74 80 78 C70 72 70 52 72 40Z" fill="#1f1f29" stroke="${INKC}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M50 20 C72 20 83 36 81 54 C80 70 67 78 50 78 C33 78 20 70 19 54 C17 36 28 20 50 20Z" fill="${fur}" stroke="${INKC}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M30 70 Q34 78 40 74 Q44 80 50 76 Q56 80 60 74 Q66 78 70 70" fill="none" stroke="${INKC}" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>
    <ellipse cx="50" cy="58" rx="15" ry="11" fill="${fur2}"/><ellipse cx="50" cy="52" rx="5.5" ry="3.8" fill="#0d0d12"/><ellipse cx="48.5" cy="50.8" rx="1.6" ry="1" fill="#fff" opacity=".8"/>
    <circle cx="37" cy="43" r="5" fill="#0d0d12"/><circle cx="63" cy="43" r="5" fill="#0d0d12"/><circle cx="35.4" cy="41.4" r="1.7" fill="#fff"/><circle cx="61.4" cy="41.4" r="1.7" fill="#fff"/><circle cx="38.6" cy="45" r=".8" fill="#fff" opacity=".7"/><circle cx="64.6" cy="45" r=".8" fill="#fff" opacity=".7"/>
    <path d="M32 33 q4 -3 8 -1 M60 32 q4 -2 8 1" fill="none" stroke="#6b5a48" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M44 61 Q50 ${happy ? 67 : 63} 56 61" fill="none" stroke="${INKC}" stroke-width="1.6" stroke-linecap="round"/>${happy ? '<ellipse cx="50" cy="66.5" rx="4" ry="3.4" fill="#ff8aa0" stroke="#d0506a" stroke-width="1"/>' : ''}
    <path d="M50 20 L44 8 L50 12 L56 8Z" fill="#e0556b" stroke="${INKC}" stroke-width="1.2" stroke-linejoin="round"/><circle cx="50" cy="13" r="2.4" fill="#c43a52" stroke="${INKC}" stroke-width="1"/></svg>`;
}
const SHOP_LINES = {
  hi: ["Welcome to my boutique! Take a look around, and say hi to Teddy.", "Hi there! New stock came in today. Everything is hand-picked."],
  guest: "Sign in with your profile and you can shop with the coins you win!",
  broke: "Oh! You need a few more coins for that one. Play a few more rounds and come back!",
  thanks: ["Thank you! It looks great on you.", "A wonderful choice! I've put it on for you.", "Sold! Teddy approves."],
  woof: ["Woof!", "Yip yip!", "*wags tail*", "Arf! (Teddy loves the Golden Crown.)"],
  owned: "You already have that one, silly!",
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function openShop() {
  ui.ovKind = 'shop'; ui.shopTab = ui.shopTab || 'legendary'; ui.shopSay = pick(SHOP_LINES.hi); ui.confirm = null; renderShop();
}
function previewFor(it, base) {
  if (it.kind === 'avatar') return `<div class="oth-prev">${avSvg({ ...base, [it.field]: it.value }, base.expr)}</div>`;
  if (it.kind === 'frame') return `<div class="oth-prev"><span class="av" data-frame="${flairKey(it.id)}" style="--sz:56px;margin:8px auto">${avSvg(base, base.expr)}</span></div>`;
  if (it.kind === 'name') return `<div class="oth-prev txt"><b class="nc-${flairKey(it.id)}">${esc(auth.user ? auth.user.username : 'Player')}</b></div>`;
  if (it.kind === 'title') return `<div class="oth-prev txt"><span class="ptitle">${esc(it.text)}</span></div>`;
  return `<div class="oth-prev"><span class="av" style="--sz:56px;margin:8px auto">${avSvg(base, Avatar.EXPR.excited)}${fxHtml(flairKey(it.id))}</span></div>`;
}
function renderShop() {
  const u = auth.user, owned = ownedSet(), base = Avatar.normalize((u && u.avatar) || Avatar.fromName(u ? u.username : 'guest')), tab = ui.shopTab;
  const items = tab === 'legendary' ? Shop.ITEMS.filter((i) => i.price >= 2500).sort((a, b) => b.price - a.price) : Shop.ITEMS.filter((i) => i.group === tab).sort((a, b) => a.price - b.price);
  const tabs = Shop.GROUPS.map(([k, l]) => `<button type="button" class="tab" role="tab" data-ov="stab" data-t="${k}" aria-selected="${tab === k}">${l}</button>`).join('');
  const cards = items.map((it) => {
    const have = owned.has(it.id), afford = u && u.coins >= it.price, tier = Shop.tier(it.price);
    return `<div class="si tier-${tier}">${previewFor(it, base)}<p class="sn">${esc(it.name)}</p><p class="sp">${have ? '<span class="own">Owned</span>' : `${COIN}<b>${it.price.toLocaleString()}</b>`}</p>
      ${have ? '<button type="button" class="btn sm block" disabled>Owned</button>' : `<button type="button" class="btn sm ${afford ? 'primary' : ''} block" data-ov="buy" data-id="${it.id}" ${u ? '' : ''}>${u ? (afford ? 'Buy' : `Need ${(it.price - u.coins).toLocaleString()} more`) : 'Sign in to buy'}</button>`}</div>`;
  }).join('');
  const conf = ui.confirm ? Shop.BY_ID[ui.confirm] : null;
  const say = conf ? `Take the ${conf.name} for ${conf.price.toLocaleString()} coins?` : ui.shopSay;
  openOverlay("Alena's Boutique", `<div class="win-body"><div class="cw-grid shopgrid"><div class="cw-prev shopscene"><div class="scene2"><div class="alena" aria-hidden="true">${Avatar.svg(ALENA, { expr: ui.shopHappy ? 'excited' : 'happy', label: 'Alena' })}</div>
      <button type="button" class="teddy" data-ov="woof" aria-label="Pet Teddy the dog">${teddySvg(true)}</button></div>
      <div class="dlg static" role="status" aria-live="polite"><span class="dlg-text">${esc(say)}</span></div>
      ${conf ? `<div class="row center"><button type="button" class="btn go sm" data-ov="yes">Yes, buy it</button><button type="button" class="btn sm" data-ov="no">Not now</button></div>` : ''}
      <div class="row center" style="align-items:center">${u ? coinsHtml(u.coins) : '<button type="button" class="btn sm primary" data-ov="login">Sign in</button>'}</div></div>
      <div class="cw-opts"><div class="tabs" role="tablist">${tabs}</div><div class="pane"><div class="shopcards">${cards}</div></div></div></div></div>`, 'wide');
}
async function buyItem(id) {
  try {
    const r = await api('shop/buy', { id }); auth.user = r.user; const it = Shop.BY_ID[id]; svgMemo.clear();
    if (it.kind === 'avatar') { try { const a = { ...Avatar.normalize(auth.user.avatar || Avatar.DEFAULT), [it.field]: it.value }; const x = await api('profile/avatar', { avatar: a }); auth.user = x.user; } catch { /* stays unworn */ } }
    else { try { const x = await api('profile/equip', { slot: it.kind, id }); auth.user = x.user; } catch { /* stays unequipped */ } }
    ui.shopSay = pick(SHOP_LINES.thanks); ui.shopHappy = true; ui.confirm = null; renderShop(); toast(`You bought ${it.name}!`); syncRoomLook(); setTimeout(() => { ui.shopHappy = false; }, 100);
  } catch (e) { ui.confirm = null; ui.shopSay = e.status === 402 ? SHOP_LINES.broke : e.message; renderShop(); }
}

/* ---------- overlay events ---------- */
document.addEventListener('submit', (e) => { if (e.target.dataset && e.target.dataset.ov === 'auth') { e.preventDefault(); submitAuth(e.target); } }, true);
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-ov]'); if (!b || b.tagName === 'FORM') return; const k = b.dataset.ov;
  if (k === 'close') return closeOverlay();
  if (k === 'mode') return openAuth(b.dataset.m);
  if (k === 'stab') { ui.shopTab = b.dataset.t; ui.confirm = null; return renderShop(); }
  if (k === 'woof') { ui.shopSay = pick(SHOP_LINES.woof); return renderShop(); }
  if (k === 'login') return openAuth('login');
  if (k === 'no') { ui.confirm = null; ui.shopSay = 'Take your time!'; return renderShop(); }
  if (k === 'buy') { if (!auth.user) return openAuth('login'); const it = Shop.BY_ID[b.dataset.id]; if (auth.user.owned.includes(it.id)) { ui.shopSay = SHOP_LINES.owned; return renderShop(); } if (auth.user.coins < it.price) { ui.shopSay = SHOP_LINES.broke; ui.confirm = null; return renderShop(); } ui.confirm = it.id; return renderShop(); }
  if (k === 'yes') return buyItem(ui.confirm);
  if (k === 'equip') { try { const r = await api('profile/equip', { slot: b.dataset.slot, id: b.dataset.id || null }); auth.user = r.user; renderProfile(); syncRoomLook(); } catch (er) { toast(er.message); } return; }
  if (k === 'maker') { closeOverlay(); return openCreator(); }
  if (k === 'shop') { closeOverlay(); return openShop(); }
});
document.addEventListener('mousedown', (e) => { if (e.target.id === 'overlay') closeOverlay(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && OV() && !OV().hidden) closeOverlay(); });
