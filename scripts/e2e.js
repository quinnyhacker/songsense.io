// End-to-end API test: simulated players play a whole multi-round game against a real server process.
//   node scripts/e2e.js                       (spawns its own server with accelerated timers)
//   BASE=http://localhost:3000 node scripts/e2e.js   (uses a server you started with SPEED=0.1)
// Needs internet for Spotify oEmbed (song titles); falls back gracefully offline. Exits non-zero on any failure.
const { spawn } = require('child_process');
const path = require('path');
let BASE = process.env.BASE, child;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, p, body, raw) {
  const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json' }, body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j = {}; try { j = JSON.parse(text); } catch { /* not json */ } return { s: r.status, j, text, headers: r.headers };
}
const post = (p, b) => call('POST', '/api/' + p, b);
const state = (code, pid) => call('GET', `/api/state?code=${code}&pid=${pid}&v=0`).then((r) => r.j);
const waitFor = async (fn, ms = 15000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await sleep(120); } };
const TRACKS = ['4cOdK2wGLETKBW3PvgPWqT', '7ouMYWpwJ422jRcDASZB7P', '3AJwUDP919kvQ9QcozQPxg', '0VjIjW4GlUZAMYd2vXMi3b'];

(async () => {
  if (!BASE) {
    const port = 3300 + Math.floor(Math.random() * 500); BASE = `http://localhost:${port}`;
    child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(port), SPEED: '0.1', TRUST_PROXY: '0', SPOTIFY_CLIENT_ID: '', SPOTIFY_CLIENT_SECRET: '' }, stdio: ['ignore', 'inherit', 'inherit'] });
    await waitFor(async () => { try { return (await fetch(BASE + '/healthz')).ok; } catch { return false; } }, 8000);
  }

  console.log('Static + config');
  const idx = await call('GET', '/');
  ok(idx.s === 200 && /Song Sense/.test(idx.text), 'home page served');
  const csp = idx.headers.get('content-security-policy') || '';
  ok(csp.includes("frame-src 'self' https://open.spotify.com") && csp.includes("script-src 'self';") && !csp.includes('unsafe-eval'), 'main page CSP: scripts from self only, no eval, frames limited to Spotify and our player');
  const pl = await call('GET', '/player.html?id=7ouMYWpwJ422jRcDASZB7P'); ok(pl.s === 200 && /unsafe-eval/.test(pl.headers.get('content-security-policy')) && /frame-ancestors 'self'/.test(pl.headers.get('content-security-policy')), 'only the player frame is allowed eval, and only we may frame it');
  const js = await call('GET', '/app.js'); ok(js.s === 200 && !/client_secret|SPOTIFY_CLIENT_SECRET/i.test(js.text + idx.text), 'no secrets in browser files');
  ok((await call('GET', '/?join=ABCD')).s === 200, 'invite link loads the app');
  const cfg = (await call('GET', '/api/config')).j;
  ok(Object.values(cfg.categories).every((c) => c.count >= 150), 'each word category has 150+ words');
  ok(cfg.search === false, 'search reports itself unavailable without server keys');
  const ns = await call('GET', '/api/search?q=love'); ok(ns.s === 501 && /Render/.test(ns.j.error), 'search endpoint says how to enable it when keys are missing');

  console.log('Lobby');
  const h = (await post('create', { name: 'Host<b>' })).j; ok(/^[A-Z]{4}$/.test(h.code) && /^[a-f0-9]{16}$/.test(h.pid), 'host creates game');
  const code = h.code;
  ok((await state(code, h.pid)).players[0].name === 'Hostb', 'markup characters stripped from names');
  ok((await call('GET', '/api/room?code=' + code)).j.exists === true && (await call('GET', '/api/room?code=ZZZZ')).j.exists === false, 'invite lookup works');
  ok((await post('join', { code: 'ZZZZ', name: 'X' })).s === 404, 'unknown code gives 404');
  ok((await post('join', { code: 'AB', name: 'X' })).s === 400, 'malformed code rejected');
  const maya = (await post('join', { code, name: 'Maya' })).j, jordan = (await post('join', { code: code.toLowerCase(), name: 'Jordan' })).j;
  ok(maya.pid && jordan.pid, 'players join (code case-insensitive)');
  ok((await post('join', { code, name: 'maya' })).s === 400, 'duplicate name rejected');
  ok((await post('start', { code, pid: maya.pid })).s === 403, 'non-host cannot start');
  const solo = (await post('create', { name: 'Solo' })).j;
  ok((await post('start', { code: solo.code, pid: solo.pid })).s === 400, 'cannot start alone');
  ok((await post('settings', { code, pid: maya.pid, secs: 60 })).s === 403, 'non-host cannot change settings');
  ok((await post('settings', { code, pid: h.pid, cats: [] })).s === 400, 'empty categories rejected');
  ok((await post('settings', { code, pid: h.pid, secs: 45 })).s === 400, 'invalid duration rejected');
  ok((await post('settings', { code, pid: h.pid, cats: ['emotions', 'bogus'], secs: 60, cycles: 1 })).s === 200, 'host sets settings (unknown categories ignored)');
  ok(JSON.stringify((await state(code, maya.pid)).settings) === JSON.stringify({ cats: ['emotions'], secs: 60, cycles: 1 }), 'settings sync to players');
  await post('settings', { code, pid: h.pid, cats: ['emotions', 'adjectives', 'scenarios'] });
  const sam = (await post('join', { code, name: 'Sam' })).j, kai = (await post('join', { code, name: 'Kai' })).j;
  const P = { Host: h.pid, Maya: maya.pid, Jordan: jordan.pid, Sam: sam.pid, Kai: kai.pid }; const byPid = Object.fromEntries(Object.entries(P).map(([n, p]) => [p, n]));

  console.log('Avatars, ready and reactions');
  const Avatar = require('../public/avatar.js'), myAv = Avatar.random();
  const av1 = (await post('create', { name: 'AvTest', avatar: myAv })).j, sv = await state(av1.code, av1.pid);
  ok(JSON.stringify(sv.players[0].avatar) === JSON.stringify(myAv), 'a valid avatar config is stored and returned to players');
  const bj = (await post('join', { code: av1.code, name: 'Bad', avatar: { ...myAv, hair: 99 } })).j;
  ok(bj.pid && (await state(av1.code, bj.pid)).players[1].avatar === null, 'an invalid avatar is dropped, not trusted (client shows a default)');
  const inj = (await post('join', { code: av1.code, name: 'Inj', avatar: { ...myAv, hair: '<script>' } })).j; ok(inj.pid, 'script-like avatar values do not break joining');
  ok((await post('avatar', { code: av1.code, pid: bj.pid, avatar: { ...myAv, hair: -1 } })).s === 400, 'invalid avatar update rejected');
  ok((await post('avatar', { code: av1.code, pid: bj.pid, avatar: myAv })).s === 200 && (await state(av1.code, av1.pid)).players[1].avatar.hair === myAv.hair, 'players can change their avatar');
  ok((await state(av1.code, av1.pid)).players[0].ready === true && (await state(av1.code, av1.pid)).players[1].ready === false, 'host counts as ready, guests start not ready');
  await post('ready', { code: av1.code, pid: bj.pid, ready: true }); ok((await state(av1.code, av1.pid)).players[1].ready === true, 'players can mark themselves ready');
  await post('ready', { code: av1.code, pid: bj.pid, ready: false }); ok((await state(av1.code, av1.pid)).players[1].ready === false, 'and un-ready');

  console.log('Round 1: choose, hint, guess');
  ok((await post('start', { code, pid: h.pid })).s === 200, 'host starts the game');
  let s = await state(code, h.pid);
  ok(s.phase === 'choosing' && s.round === 1 && s.totalRounds === 5, 'round 1 of 5, choosing');
  const picker1 = s.pickerId, others = Object.values(P).filter((p) => p !== picker1);
  const sp = await state(code, picker1);
  ok(sp.options.length === 3 && new Set(sp.options.map((o) => o.word)).size === 3 && sp.me.isPicker, 'picker sees exactly 3 distinct word options');
  const opts = sp.options.map((o) => o.word);
  const so = await Promise.all(others.map((p) => state(code, p)));
  ok(so.every((x) => !x.options && !opts.some((w) => JSON.stringify(x).toLowerCase().includes(JSON.stringify(w).toLowerCase()))), 'other players never receive the options');
  ok((await post('choose', { code, pid: others[0], index: 0 })).s === 403, 'non-picker cannot choose');
  ok((await post('choose', { code, pid: picker1, index: 7 })).s === 400, 'invalid option rejected');
  const late = (await post('join', { code, name: 'Late' })).j; ok(late.pid, 'latecomer can join mid-game');
  ok((await state(code, h.pid)).totalRounds === 6, 'latecomers are queued as pickers (6 rounds)');
  await post('leave', { code, pid: late.pid });
  ok((await state(code, h.pid)).totalRounds === 5, 'leaving removes your turn from the queue');
  ok((await post('choose', { code, pid: picker1, index: 1 })).s === 200, 'picker chooses a word');
  const word1 = opts[1];
  s = await state(code, picker1); ok(s.phase === 'playing' && s.word === word1, 'picker sees the chosen word');
  const g = others; const sg = await Promise.all(g.map((p) => state(code, p)));
  ok(sg.every((x) => x.word === null && /^[_ \-]+$/.test(x.mask) && x.category), 'guessers get only a mask and category');
  ok(sg.every((x) => !JSON.stringify(x).toLowerCase().includes(word1.toLowerCase())), 'the word is absent from guessers\' payloads');
  ok((await post('guess', { code, pid: g[0], text: word1 })).s === 400, 'guessing before the first song is rejected');
  ok((await post('song', { code, pid: g[0], trackId: TRACKS[0] })).s === 403, 'non-picker cannot add songs');
  ok((await post('song', { code, pid: picker1, trackId: 'not-a-track' })).s === 400, 'only real Spotify track ids are accepted');
  ok((await post('song', { code, pid: picker1, trackId: TRACKS[0] })).s === 200, 'picker adds song 1');
  ok((await post('song', { code, pid: picker1, trackId: TRACKS[0] })).s === 400, 'duplicate song rejected');
  ok((await post('guess', { code, pid: picker1, text: 'hello' })).s === 400, 'picker cannot chat during guessing');
  s = await state(code, g[0]); ok(s.songs.length === 1 && s.scoreClockStart && s.songs[0].trackId === TRACKS[0], 'guessers see song 1 and the clock starts');
  await sleep(450);
  const wrong = (await post('guess', { code, pid: g[0], text: 'banana pancake' })).j; ok(wrong.result === 'wrong', 'wrong guess is rejected');
  ok((await state(code, g[1])).players.find((p) => p.id === g[0]).react?.k === 'confused', 'a wrong guess makes that avatar look confused');
  s = await state(code, g[1]); ok(s.chat.some((m) => m.kind === 'guess' && m.text === 'banana pancake'), 'wrong guesses are visible to other players like in Skribbl');
  await sleep(450);
  const typo = word1.length >= 6 ? word1.slice(0, -1) + (word1.endsWith('x') ? 'z' : 'x') : word1.toUpperCase() + '!!';
  const r1 = (await post('guess', { code, pid: g[0], text: typo })).j;
  ok(r1.result === 'correct' && r1.points > 0, `fuzzy guess "${typo}" accepted (${r1.points} pts)`);
  s = await state(code, g[0]); ok(s.me.guessed && s.word === word1, 'a correct guesser then sees the word');
  ok(s.players.find((p) => p.id === g[0]).react?.k === 'excited', 'a correct guess makes the avatar excited');
  const s1 = await state(code, g[1]); ok(!s1.me.guessed && s1.word === null && !JSON.stringify(s1).toLowerCase().includes(word1.toLowerCase()), 'others still cannot see it');
  ok(s1.chat.some((m) => m.kind === 'correct' && /got it/.test(m.text)) && !s1.chat.some((m) => m.text === word1 || m.text === typo), 'correct guesses are announced but their text is hidden');
  await sleep(450);
  await post('guess', { code, pid: g[0], text: `the answer is ${word1} lol` });
  ok(!(await state(code, g[1])).chat.some((m) => /the answer is/.test(m.text)), 'post-solve chat stays private from players still guessing');
  ok((await state(code, picker1)).chat.some((m) => /the answer is/.test(m.text)), 'the picker can read the guessed-players chat');
  ok((await post('song', { code, pid: picker1, trackId: TRACKS[1] })).s === 200 && (await post('song', { code, pid: picker1, trackId: TRACKS[2] })).s === 200, 'picker adds songs 2 and 3');
  ok((await post('playback', { code, pid: g[0], n: 1, playing: true, pos: 0 })).s === 403, 'only the picker can drive shared playback');
  ok((await post('playback', { code, pid: picker1, n: 9, playing: true, pos: 0 })).s === 400 && (await post('playback', { code, pid: picker1, n: 1, playing: true, pos: -5 })).s === 400, 'playback rejects unknown songs and bad positions');
  ok((await post('playback', { code, pid: picker1, n: 2, playing: true, pos: 4500 })).s === 200, 'picker publishes shared playback');
  const pb = (await state(code, g[1])).play; ok(pb && pb.n === 2 && pb.playing === true && pb.pos === 4500 && pb.at > 0, 'listeners receive the shared playback state');
  ok((await post('song', { code, pid: picker1, trackId: TRACKS[3] })).s === 400, 'a fourth song is rejected');
  await sleep(450);
  const r2 = (await post('guess', { code, pid: g[1], text: word1 + 's' })).j; ok(r2.result === 'correct', 'plural accepted');
  ok(r2.points < r1.points, `later guess after more songs scores less (${r2.points} < ${r1.points})`);
  s = await state(code, picker1);
  ok(s.phase === 'playing', 'round continues until everyone has guessed');
  await sleep(450);
  const r3 = (await post('guess', { code, pid: g[2], text: word1 })).j; ok(r3.result === 'correct', 'third player guesses correctly');
  ok((await state(code, picker1)).phase === 'playing', 'round is still open while one player has not guessed');
  await sleep(450);
  const r4 = (await post('guess', { code, pid: g[3], text: word1 })).j; ok(r4.result === 'correct', 'last player guesses correctly');
  s = await waitFor(async () => { const x = await state(code, picker1); return x.phase === 'roundend' && x; });
  ok(s && s.result.word === word1 && s.result.reason === 'everyone' && s.result.guessers.length === 4, 'round ends early when everyone has guessed');
  const total = r1.points + r2.points + r3.points + r4.points, pp = s.players.find((p) => p.id === picker1);
  ok(pp.score === Math.round(r1.points * .25) + Math.round(r2.points * .25) + Math.round(r3.points * .25) + Math.round(r4.points * .25) && pp.score > 0, 'picker earns a share of every correct guess');
  ok(s.players.find((p) => p.id === g[0]).score === r1.points && total > 0, 'scores are applied exactly once');
  const sx = await state(code, g[1]); ok(sx.word === word1 && sx.result.songs.length === 3, 'everyone sees the word and songs after the round');

  console.log('Round 2: picker idles (auto word), no song');
  s = await waitFor(async () => { const x = await state(code, h.pid); return x.phase === 'choosing' && x.round === 2 && x; }, 10000);
  ok(!!s, 'next round starts automatically');
  const picker2 = s.pickerId; ok(picker2 !== picker1, 'picker rotates');
  s = await waitFor(async () => { const x = await state(code, h.pid); return x.phase === 'playing' && x; }, 8000); ok(!!s, 'a word is auto-chosen when the picker is idle');
  s = await waitFor(async () => { const x = await state(code, h.pid); return x.phase === 'roundend' && x; }, 12000);
  ok(s && s.result.reason === 'nosong' && s.result.guessers.length === 0, 'round ends if the picker never adds a song');

  console.log('Round 3: nobody guesses, time runs out');
  s = await waitFor(async () => { const x = await state(code, h.pid); return x.phase === 'choosing' && x.round === 3 && x; }, 10000);
  const picker3 = s.pickerId; await post('choose', { code, pid: picker3, index: 0 }); await post('song', { code, pid: picker3, trackId: TRACKS[2] });
  s = await waitFor(async () => { const x = await state(code, h.pid); return x.phase === 'roundend' && x; }, 15000);
  ok(s && s.result.reason === 'time', 'round ends when the timer runs out');
  ok(s.result.word && s.players.every((p) => p.score >= 0), 'answer revealed on timeout');

  console.log('Round 4: picker leaves mid-round');
  s = await waitFor(async () => { const x = await state(code, h.pid); return x.phase === 'choosing' && x.round === 4 && x; }, 10000);
  const picker4 = s.pickerId; await post('choose', { code, pid: picker4, index: 0 });
  const hostWasPicker = picker4 === h.pid; await post('leave', { code, pid: picker4 });
  const survivor = Object.values(P).find((p) => p !== picker4 && p !== undefined);
  s = await state(code, survivor); ok(s.phase === 'roundend' && s.result.reason === 'pickerleft', 'round ends cleanly when the picker leaves');
  ok(s.players.length === 4 && s.players.filter((p) => p.isHost).length === 1, 'host is reassigned if the host left' + (hostWasPicker ? ' (host was picker)' : ''));
  const hostNow = s.players.find((p) => p.isHost).id;
  ok((await post('next', { code, pid: survivor === hostNow ? Object.values(P).find((p) => p !== hostNow && p !== picker4) : survivor })).s === 403, 'non-host cannot skip ahead');

  console.log('Finish the game');
  let guard = 0;
  while (guard++ < 12) {
    s = await waitFor(async () => { const x = await state(code, hostNow); return (x.phase === 'gameover' || x.phase === 'choosing') && x; }, 12000);
    if (!s || s.phase === 'gameover') break;
    await post('choose', { code, pid: s.pickerId, index: 0 }); await post('song', { code, pid: s.pickerId, trackId: TRACKS[guard % 4] });
    const w = (await state(code, s.pickerId)).word;
    for (const pl of s.players.filter((p) => p.id !== s.pickerId)) { await sleep(260); await post('guess', { code, pid: pl.id, text: w }); }
    await waitFor(async () => (await state(code, hostNow)).phase === 'roundend', 8000);
  }
  s = await state(code, hostNow);
  ok(s.phase === 'gameover' && s.final.length === 4 && s.final.every((p, i, a) => !i || a[i - 1].score >= p.score), 'game ends with a sorted final leaderboard after everyone has picked');
  ok(s.final.every((p) => s.players.find((x) => x.id === p.id).score === p.score), 'final scores match player scores');
  ok((await post('again', { code, pid: Object.values(P).find((p) => p !== hostNow && p !== picker4) })).s === 403, 'only the host can restart');
  ok((await post('again', { code, pid: hostNow })).s === 200, 'host plays again');
  s = await state(code, hostNow); ok(s.phase === 'lobby' && s.players.every((p) => p.score === 0), 'back to the lobby with scores reset');

  console.log('Robustness');
  ok((await call('POST', '/api/create', null, '{not json')).s === 400, 'malformed JSON rejected');
  ok((await call('POST', '/api/create', null, JSON.stringify({ name: 'x'.repeat(30000) }))).s === 413, 'oversized body rejected');
  ok((await call('GET', `/api/state?code=${code}&pid=nothex`)).s === 400, 'bad player id rejected');
  ok((await call('GET', `/api/state?code=${code}&pid=${'a'.repeat(16)}`)).s === 404, 'unknown player gets 404 (client returns to home)');
  const st2 = await call('GET', `/api/state?code=${code}&pid=${hostNow}&v=${s.v}`); ok(st2.j.unchanged === true, 'unchanged state returns a tiny response');
  let limited = 0; for (let i = 0; i < 25; i++) if ((await post('create', { name: 'Spam' + i })).s === 429) limited++;
  ok(limited > 0, 'create-game rate limit kicks in');

  console.log(`\n${pass} passed, ${fail} failed`);
  if (child) child.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); if (child) child.kill(); process.exit(1); });
