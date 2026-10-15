'use strict';
// "A Long-Distance Love Story": a short animated cutscene that plays right after the maker's welcome message.
// Everything you might want to edit (the words, Vivian's look) is at the top. Pure HTML/CSS/SVG, no audio, no external files.
const STORY = {
  title: 'A Long-Distance Love Story',
  dedication: 'for Vivian',
  map: ['Vivian left for her away rotation.', 'Different cities. Different schedules. A whole lot of miles in between.', 'But every night, somehow, the distance felt a little smaller.'],
  her: ['Long shifts. Longer nights.', 'Then... a tiny buzz.'],
  herPhone: 'Quinn ♥<br>Thinking of you. Go save lives, doctor.',
  him: ['Back home, Quinn was teaching himself to build apps, one late night at a time.', 'All for one tiny reason: to give her somewhere to smile after a long day.'],
  call: ['And when the day was finally done... they talked.'],
  chat: [['v', 'Hi you. I am SO tired.'], ['q', 'I know. Come play something with me?'], ['v', 'Always.'], ['q', 'I made you a little something...'], ['v', 'Quinn... is that a game?! ♥']],
  game: ['Game night, long distance edition.', 'Quinn picks a word. Vivian listens, and guesses.'],
  guesses: ['homesick?', 'missing you?', 'love'],
  gameWord: 'LOVE',
  finale: ['No matter how many miles are between us...', 'you are my favorite person, Vivian.', 'I love you. Come home soon.'],
  endLine: 'Made with love, for Vivian',
};
// Vivian: scrubs, stethoscope, long black hair. Change any number here (see public/avatar.js for the option lists).
const VIVIAN = { skin: 2, hair: 5, hairColor: 0, bangs: 3, eyes: 0, eyeColor: 0, brows: 0, expr: 0, blush: 1, freckles: 0, mark: 0, clothes: 9, clothesColor: 4, acc: 16, accColor: 9, pet: 0 };
const CS_HEART = '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.5 6.4 4.5c2.2 0 3.7 1.2 5.6 3.3 1.9-2.1 3.4-3.3 5.6-3.3 3.7 0 5.5 3.9 4 7.3C19.5 16.4 12 21 12 21z" fill="#ff6f91" stroke="#c43a5c" stroke-width="1.2" stroke-linejoin="round"/><path d="M7 7.5c.8-.9 1.9-1 2.6-.4" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".8"/></svg>';

function playCutscene(onDone) {
  const quinn = (typeof MAKER !== 'undefined' ? MAKER : Avatar.DEFAULT), reduce = window.__csFast || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const root = document.createElement('div'); root.className = 'cs'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'A short story about Quinn and Vivian');
  root.innerHTML = '<div class="cs-bg night"></div><div class="cs-stars"></div><div class="cs-stage"></div><div class="cs-bar top"></div><div class="cs-bar bot"></div>' +
    '<div class="cs-cap hide" aria-live="polite"><div class="dlg static"><span class="dlg-text"></span><span class="dlg-arrow" aria-hidden="true">&#9660;</span></div></div><button type="button" class="cs-skip">Skip</button><div class="cs-hint">tap to continue</div>';
  document.body.appendChild(root); document.body.style.overflow = 'hidden';
  const $ = (s, r = root) => r.querySelector(s), stage = $('.cs-stage'), bg = $('.cs-bg'), stars = $('.cs-stars'), cap = $('.cs-cap'), txt = $('.dlg-text'), arrow = $('.dlg-arrow');
  let aborted = false, nudge = null, raf = 0, finished = false;
  const sleep = (ms) => new Promise((res) => { if (aborted) return res(); let t = setTimeout(end, reduce ? Math.min(ms, 500) : ms); function end() { clearTimeout(t); nudge = null; res(); } nudge = end; });
  const rand = (a, b) => a + Math.random() * (b - a);
  const finish = () => { if (finished) return; finished = true; aborted = true; cancelAnimationFrame(raf); if (nudge) nudge(); root.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); onDone && onDone(); };
  function onKey(e) { if (e.key === 'Escape') finish(); else if (e.key === ' ' || e.key === 'Enter') { if (document.activeElement && document.activeElement.className === 'cs-skip') return; e.preventDefault(); if (nudge) nudge(); } }
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', (e) => { if (e.target.closest('.cs-skip')) return finish(); if (e.target.closest('.btn')) return; if (nudge) nudge(); });

  /* narration in the same Pokemon-style box as the welcome message */
  async function say(text, hold = 1500) {
    if (aborted) return; cap.classList.remove('hide'); txt.textContent = ''; arrow.classList.remove('on');
    await new Promise((res) => { if (reduce) { txt.textContent = text; return res(); } let i = 0; const iv = setInterval(() => { i++; txt.textContent = text.slice(0, i); if (i >= text.length || aborted) { clearInterval(iv); nudge = null; res(); } }, 30); nudge = () => { clearInterval(iv); txt.textContent = text; nudge = null; res(); }; });
    arrow.classList.add('on'); await sleep(hold);
  }
  const hideCap = () => cap.classList.add('hide');
  function scene(cls, html, bgClass, showStars = true) {
    const old = $('.cs-scene'); if (old) { old.classList.add('out'); setTimeout(() => old.remove(), 600); }
    cancelAnimationFrame(raf); bg.className = 'cs-bg ' + bgClass; stars.classList.toggle('off', !showStars);
    const el = document.createElement('div'); el.className = 'cs-scene ' + cls; el.innerHTML = html; stage.appendChild(el); return el;
  }
  function av(cfg, o) {
    const d = document.createElement('div'); d.className = 'cs-av ' + (o.cls || ''); d.style.cssText = 'left:' + o.x + ';top:' + o.y + ';--w:' + o.w + ';margin:calc(var(--w) / -2) 0 0 calc(var(--w) / -2);' + (o.glow ? '--glow:' + o.glow + ';' : '');
    d.innerHTML = Avatar.svg(cfg, { expr: o.expr === undefined ? cfg.expr : o.expr, label: o.label || 'Avatar' }); d.set = (e) => { d.innerHTML = Avatar.svg(cfg, { expr: e, label: o.label || 'Avatar' }); }; return d;
  }
  const label = (txt2, x, y) => { const n = document.createElement('div'); n.className = 'cs-name'; n.style.left = x; n.style.top = y; n.textContent = txt2; return n; };
  const heartAt = (parent, x, y, sz) => { const h = document.createElement('div'); h.className = 'cs-heart'; h.style.cssText = 'left:' + x + 'px;top:' + y + 'px;--sz:' + sz + 'px;'; h.innerHTML = CS_HEART; parent.appendChild(h); return h; };
  function burst(parent, x, y, n = 22) {
    if (reduce) return; const glyphs = [CS_HEART, CS_HEART, '✦', '★'];
    for (let i = 0; i < n; i++) { const b = document.createElement('div'); b.className = 'cs-boom'; const a = rand(0, Math.PI * 2), r = rand(80, 260), g = glyphs[i % glyphs.length];
      b.style.cssText = 'left:' + x + 'px;top:' + y + 'px;--x:' + Math.cos(a) * r + 'px;--y:' + (Math.sin(a) * r - 40) + 'px;--d:' + rand(1.3, 2.4) + 's;--r:' + rand(-90, 90) + 'deg;width:' + rand(14, 30) + 'px;height:' + rand(14, 30) + 'px;' + (g.length === 1 ? 'color:' + ['#ffd54a', '#fff3b0', '#ff9ec4'][i % 3] + ';font-size:22px;line-height:1;text-shadow:0 0 8px #fff3b0' : '');
      b.innerHTML = g; parent.appendChild(b); setTimeout(() => b.remove(), 2600); }
  }
  const rect = () => stage.getBoundingClientRect();
  const bezier = (A, C, B, t) => ({ x: (1 - t) * (1 - t) * A.x + 2 * (1 - t) * t * C.x + t * t * B.x, y: (1 - t) * (1 - t) * A.y + 2 * (1 - t) * t * C.y + t * t * B.y });

  /* ---------------- the scenes ---------------- */
  async function sTitle() {
    const notes = Array.from({ length: 16 }, () => '<span class="cs-note" style="left:' + rand(2, 96).toFixed(1) + '%;--s:' + rand(16, 38).toFixed(0) + 'px;--t:' + rand(9, 16).toFixed(1) + 's;animation-delay:-' + rand(0, 12).toFixed(1) + 's">' + ['♪', '♫', '♥'][Math.floor(rand(0, 3))] + '</span>').join('');
    scene('', notes + '<div class="cs-title"><small>Song Sense presents</small><h1>' + STORY.title + '</h1><p>' + STORY.dedication + ' ♥</p></div>', 'night');
    await sleep(5200);
  }
  async function sMap() {
    const sc = scene('cs-map', '', 'night'), r = rect(), W = r.width, H = r.height, A = { x: W * 0.17, y: H * 0.6 }, B = { x: W * 0.83, y: H * 0.5 }, C = { x: W * 0.5, y: H * 0.06 };
    sc.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '"><path class="dash" d="M' + A.x + ' ' + A.y + ' Q' + C.x + ' ' + C.y + ' ' + B.x + ' ' + B.y + '" fill="none" stroke="rgba(255,190,220,.75)" stroke-width="3" stroke-linecap="round"/></svg>';
    for (const [p, c] of [[A, 'q'], [B, 'v']]) { const ring = document.createElement('div'); ring.className = 'cs-ring'; ring.style.left = p.x + 'px'; ring.style.top = p.y + 'px'; sc.appendChild(ring); }
    const w = Math.min(130, W * 0.22) + 'px';
    sc.appendChild(av(quinn, { x: A.x + 'px', y: A.y + 'px', w, cls: 'pop bob', expr: 2, glow: 'rgba(140,120,255,.6)', label: 'Quinn' })); sc.appendChild(label('Quinn · home', A.x + 'px', (A.y + parseFloat(w) / 2 + 12) + 'px'));
    sc.appendChild(av(VIVIAN, { x: B.x + 'px', y: B.y + 'px', w, cls: 'pop bob', expr: 0, glow: 'rgba(90,220,200,.6)', label: 'Vivian' })); sc.appendChild(label('Vivian · away', B.x + 'px', (B.y + parseFloat(w) / 2 + 12) + 'px'));
    const hearts = Array.from({ length: 5 }, (_, i) => ({ el: heartAt(sc, 0, 0, 26), off: i / 5 })); const t0 = performance.now();
    const loop = (now) => { const dur = 4200; hearts.forEach((h) => { const t = (((now - t0) / dur) + h.off) % 1, p = bezier(A, C, B, t), s = 12 + Math.sin(t * Math.PI) * 22; h.el.style.left = (p.x - s / 2) + 'px'; h.el.style.top = (p.y - s / 2) + 'px'; h.el.style.setProperty('--sz', s + 'px'); h.el.style.opacity = Math.sin(t * Math.PI); }); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    await sleep(900); await say(STORY.map[0], 1300); await say(STORY.map[1], 1500); await say(STORY.map[2], 2200); hideCap();
  }
  async function sHer() {
    const sc = scene('', '<div class="cs-window" style="left:7%;top:calc(7vh + 8%);width:36%;height:38%"><div class="moon"></div><div class="city">' + '<i style="height:60%"></i><i style="height:90%"></i><i style="height:50%"></i><i style="height:75%"></i><i style="height:100%"></i><i style="height:65%"></i>' + '</div></div><div class="cs-desk"></div>', 'hospital');
    const w = 'clamp(170px,36vmin,300px)', v = av(VIVIAN, { x: '68%', y: '47%', w, cls: 'pop bob', expr: 1, glow: 'rgba(90,220,200,.55)', label: 'Vivian, tired after a long shift' }); sc.appendChild(v); sc.appendChild(label('Vivian', '68%', 'calc(47% + clamp(85px,18vmin,150px) + 12px)'));
    const mug = document.createElement('div'); mug.className = 'cs-mug'; mug.style.cssText = 'left:14%;bottom:calc(22% - 14px)'; mug.innerHTML = '<i></i><i></i>'; sc.appendChild(mug);
    const ph = document.createElement('div'); ph.className = 'cs-phone'; ph.style.cssText = 'left:36%;bottom:calc(22% - 40px)'; sc.appendChild(ph);
    await sleep(700); await say(STORY.her[0], 1300); await say(STORY.her[1], 600); hideCap();
    ph.classList.add('buzz'); ph.innerHTML = '<span>' + STORY.herPhone + '</span>'; v.set(Avatar.EXPR.excited); await sleep(900);
    const r = rect(); const pr = ph.getBoundingClientRect(); burst(sc, pr.left - r.left + 37, pr.top - r.top, 10); v.set(Avatar.EXPR.happy); await sleep(3200);
  }
  async function sHim() {
    const sc = scene('', '<div class="cs-lamp" style="right:2%;top:calc(7vh + 4%)"></div><div class="cs-desk"></div>', 'room');
    const lap = document.createElement('div'); lap.className = 'cs-laptop'; lap.style.cssText = 'left:6%;top:calc(7vh + 18%)';
    lap.innerHTML = '<div class="cs-code"><div><em>const</em> game = <b>"Song Sense"</b>;</div><div><em>function</em> missYou() {</div><div>&nbsp;&nbsp;sendHeart(<b>"Vivian"</b>);</div><div>&nbsp;&nbsp;<em>return</em> distance &lt; love;</div><div>}</div><div><em>// almost done...</em></div></div>'; sc.appendChild(lap);
    const w = 'clamp(170px,36vmin,300px)', q = av(quinn, { x: '72%', y: '48%', w, cls: 'pop bob', expr: 1, glow: 'rgba(160,120,255,.55)', label: 'Quinn, coding late at night' }); sc.appendChild(q); sc.appendChild(label('Quinn', '72%', 'calc(48% + clamp(85px,18vmin,150px) + 12px)'));
    const mug = document.createElement('div'); mug.className = 'cs-mug'; mug.style.cssText = 'left:56%;bottom:calc(22% - 14px)'; mug.innerHTML = '<i></i><i></i>'; sc.appendChild(mug);
    await sleep(800); await say(STORY.him[0], 1500); q.set(Avatar.EXPR.excited); await say(STORY.him[1], 2000); q.set(Avatar.EXPR.happy); hideCap(); await sleep(600);
  }
  async function sCall() {
    const sc = scene('', '<div class="cs-vs">video call</div><div class="cs-call"><div class="cs-tile q"><div class="live"></div></div><div class="cs-chat"></div><div class="cs-tile v"><div class="live"></div></div></div>', 'call', false);
    const tq = $('.cs-tile.q', sc), tv = $('.cs-tile.v', sc), chat = $('.cs-chat', sc), aq = av(quinn, { x: '0', y: '0', w: '0', cls: 'bob', label: 'Quinn' }), avv = av(VIVIAN, { x: '0', y: '0', w: '0', cls: 'bob', label: 'Vivian' });
    for (const [t, a, n] of [[tq, aq, 'Quinn'], [tv, avv, 'Vivian']]) { a.style.cssText = ''; a.className = 'cs-av bob'; t.appendChild(a); const l = document.createElement('div'); l.className = 'lbl'; l.textContent = n; t.appendChild(l); }
    await sleep(600); await say(STORY.call[0], 1400); hideCap();
    for (const [who, text] of STORY.chat) {
      const typ = document.createElement('div'); typ.className = 'cs-typing ' + who; typ.innerHTML = '<i></i><i></i><i></i>'; chat.appendChild(typ); await sleep(900); typ.remove();
      const b = document.createElement('div'); b.className = 'cs-b ' + who; b.textContent = text; chat.appendChild(b);
      (who === 'q' ? aq : avv).set(Avatar.EXPR.happy); (who === 'q' ? avv : aq).set(Avatar.EXPR.neutral); await sleep(1500);
    }
    aq.set(Avatar.EXPR.excited); avv.set(Avatar.EXPR.excited); const r = rect(); for (let i = 0; i < 4; i++) { setTimeout(() => burst(sc, r.width / 2 + rand(-90, 90), r.height * 0.45, 6), i * 250); } await sleep(1800);
  }
  async function sGame() {
    const word = STORY.gameWord.split('');
    const sc = scene('', '<div class="cs-game"><div class="win"><div class="tb"><span class="ttl">Round 1 of 2</span><span class="ctl"><span>&#8212;</span><span>&#9633;</span><span class="close">&#10005;</span></span></div>' +
      '<div class="gl"><div class="hero" style="padding:4px 0"><div class="who" style="display:flex;justify-content:center;align-items:center;gap:8px;margin-bottom:4px"><span class="av pick" style="--sz:34px" id="csq1"></span><span class="muted"><b>Quinn</b> is the picker</span></div><p class="todo" style="font-size:18px;font-weight:700;text-align:center">What\'s the word?</p><div class="tiles" id="cstiles">' + word.map(() => '<span class="w"><span class="t"></span></span>').join('') + '</div><p class="sub" style="text-align:center"><span class="chip on">Emotion</span></p></div>' +
      '<div class="cs-song"><span class="art"></span><div style="flex:1"><b>Hint song 1 of 3</b><span>Our Song</span><div class="seek"><i></i></div></div></div></div>' +
      '<div class="gr"><div class="cs-plist"><div class="cs-prow"><span class="av" style="--sz:40px" id="csq2"></span>Quinn<span class="sc" id="scq">0</span></div><div class="cs-prow"><span class="av" style="--sz:40px" id="csv2"></span>Vivian<span class="sc" id="scv">0</span></div></div><div class="cs-gchat" id="csg"></div></div></div></div>', 'game', false);
    const setAv = (id, cfg, ex, fx) => { const el = $('#' + id, sc); el.innerHTML = Avatar.svg(cfg, { expr: ex }) + (fx ? fxHtml('hearts') : ''); }; const logLine = (h) => { const d = document.createElement('div'); d.innerHTML = h; $('#csg', sc).appendChild(d); };
    setAv('csq1', quinn, Avatar.EXPR.happy); setAv('csq2', quinn, Avatar.EXPR.happy); setAv('csv2', VIVIAN, Avatar.EXPR.neutral);
    await sleep(500); await say(STORY.game[0], 1200); await say(STORY.game[1], 900); hideCap();
    logLine('<i style="color:var(--faint)">First song is in. Type your guesses!</i>'); await sleep(1300);
    logLine('<b>Vivian</b> ' + STORY.guesses[0]); setAv('csv2', VIVIAN, Avatar.EXPR.confused); await sleep(1500);
    logLine('<b>Vivian</b> ' + STORY.guesses[1]); logLine('<i style="color:#a56f00">So close! Keep going.</i>'); setAv('csv2', VIVIAN, Avatar.EXPR.confused); await sleep(1700);
    logLine('<b>Vivian</b> ' + STORY.guesses[2]); await sleep(500);
    logLine('<span class="ok">✓ Vivian got it!</span>'); setAv('csv2', VIVIAN, Avatar.EXPR.excited, true); setAv('csq2', quinn, Avatar.EXPR.excited, true); setAv('csq1', quinn, Avatar.EXPR.excited);
    $('#scv', sc).textContent = '500'; $('#scq', sc).textContent = '125';
    const ts = $('#cstiles', sc).querySelectorAll('.t'); ts.forEach((t, i) => setTimeout(() => { t.textContent = word[i]; t.classList.add('on'); }, i * 220));
    const coin = document.createElement('div'); coin.className = 'cs-coin'; coin.style.cssText = 'left:50%;top:44%;margin-left:-40px'; coin.textContent = '+500'; sc.appendChild(coin); const r = rect(); burst(sc, r.width / 2, r.height * 0.45, 18);
    await sleep(3200);
  }
  async function sFinale() {
    const sc = scene('cs-finale', '<div class="cs-aurora"></div>', 'finale'), W = rect().width, small = W < 700, w = 'clamp(150px,30vmin,250px)', y = small ? '44%' : '50%';
    const q = av(quinn, { x: '24%', y, w, cls: 'bob', expr: 2, glow: 'rgba(160,120,255,.65)', label: 'Quinn' }), v = av(VIVIAN, { x: '76%', y, w, cls: 'bob', expr: 0, glow: 'rgba(90,220,200,.65)', label: 'Vivian' });
    sc.appendChild(q); sc.appendChild(v); await sleep(900);
    await say(STORY.finale[0], 1400);
    // they drift together across the distance
    q.style.left = 'calc(50% - var(--w) * .52)'; v.style.left = 'calc(50% + var(--w) * .52)'; await sleep(2600);
    await say(STORY.finale[1], 1300);
    // a kiss across the last bit of space
    const kiss = Avatar.svg(quinn, { expr: 'kiss', label: 'Quinn' }); q.innerHTML = kiss; await sleep(600);
    const r = rect(), a = q.getBoundingClientRect(), b = v.getBoundingClientRect(), A = { x: a.left + a.width * 0.62 - r.left, y: a.top + a.height * 0.45 - r.top }, B = { x: b.left + b.width * 0.4 - r.left, y: b.top + b.height * 0.42 - r.top }, C = { x: (A.x + B.x) / 2, y: Math.min(A.y, B.y) - 70 };
    const h = heartAt(sc, A.x, A.y, 44); const t0 = performance.now();
    await new Promise((res) => { const step = (now) => { const t = Math.min(1, (now - t0) / 1300), p = bezier(A, C, B, t); h.style.left = (p.x - 22) + 'px'; h.style.top = (p.y - 22) + 'px'; h.style.setProperty('--sz', 28 + Math.sin(t * Math.PI) * 30 + 'px'); if (t < 1 && !aborted) raf = requestAnimationFrame(step); else res(); }; raf = requestAnimationFrame(step); setTimeout(res, 1700); });   // (fallback so a backgrounded tab cannot stall the scene)
    h.remove(); burst(sc, B.x, B.y, 30); v.set(Avatar.EXPR.excited); q.set(Avatar.EXPR.happy); await sleep(1400); v.set(Avatar.EXPR.happy);
    await say(STORY.finale[2], 2600); hideCap();
    const end = document.createElement('div'); end.className = 'cs-end'; end.innerHTML = '<h2>Song Sense</h2><p>' + STORY.endLine + ' ♥</p><button type="button" class="btn go">Let\'s play</button>'; sc.appendChild(end);
    $('.btn', end).addEventListener('click', finish); $('.cs-hint').textContent = ''; nudge = null; await new Promise((res) => setTimeout(() => { nudge = res; }, 1800));   // taps are ignored while the end card fades in
  }

  (async () => { try { for (const s of [sTitle, sMap, sHer, sHim, sCall, sGame, sFinale].slice(window.__csStart || 0)) { if (aborted) break; await s(); } } finally { if (!finished) finish(); } })();
  return finish;
}
