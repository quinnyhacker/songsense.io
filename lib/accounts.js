'use strict';
// Player profiles: username + 4-digit PIN, coins, owned cosmetics. File-backed (JSON), single process.
//  - PINs are hashed with scrypt and a per-user salt; they are never stored or logged in plain text.
//  - Sessions are random tokens; only their SHA-256 is stored server-side, the raw token lives in the player's browser.
//  - 5 wrong PINs lock that username for 15 minutes (a 4-digit PIN is weak, so online guessing has to be slow).
//  - DATA_DIR should point at a persistent disk in production; on a host with an ephemeral disk, profiles are lost on every deploy/restart.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const Shop = require('../public/shop-data.js');
const Avatar = require('../public/avatar.js');

const err = (status, message) => { const e = new Error(message); e.status = status; return e; };
const USER_RE = /^[A-Za-z0-9_]{3,16}$/, PIN_RE = /^\d{4}$/;
const MAX_USERS = 5000, TOKEN_MS = 90 * 24 * 3600 * 1000, LOCK_AFTER = 5, LOCK_MS = 15 * 60 * 1000;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const SLOTS = { frame: 'frame', name: 'name', title: 'title', fx: 'fx' };

class Accounts {
  constructor(dir, opts = {}) {
    this.dir = dir; this.file = dir ? path.join(dir, 'profiles.json') : null;
    this.starter = opts.starterCoins ?? Shop.STARTER_COINS;
    this.users = new Map(); this.tokens = new Map(); this.fails = new Map(); this.timer = null;
    this.dummy = crypto.randomBytes(16).toString('hex');
    this.load();
  }
  load() {
    if (!this.file) return;
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const u of j.users || []) this.users.set(u.key, u);
      for (const [h, v] of Object.entries(j.tokens || {})) if (v.exp > Date.now()) this.tokens.set(h, v);
    } catch { /* first run or unreadable file: start empty */ }
  }
  save() { if (!this.file) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 400); if (this.timer.unref) this.timer.unref(); }
  flush() {
    if (!this.file) return;
    try { fs.mkdirSync(this.dir, { recursive: true }); const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ users: [...this.users.values()], tokens: Object.fromEntries(this.tokens) })); fs.renameSync(tmp, this.file); }
    catch (e) { console.error('[accounts] could not save profiles:', e.message); }
  }
  async hash(pin, salt) { return (await scrypt(pin, salt, 32)).toString('hex'); }
  issue(key) { const raw = crypto.randomBytes(24).toString('hex'); this.tokens.set(sha(raw), { key, exp: Date.now() + TOKEN_MS }); this.save(); return raw; }
  userByToken(raw) {
    if (!raw) return null; const t = this.tokens.get(sha(raw));
    if (!t) return null; if (t.exp < Date.now()) { this.tokens.delete(sha(raw)); return null; }
    return this.users.get(t.key) || null;
  }
  logout(raw) { if (raw) { this.tokens.delete(sha(raw)); this.save(); } }
  byKey(key) { return this.users.get(key) || null; }

  async signup(username, pin, avatar) {
    username = String(username || '').trim(); pin = String(pin || '');
    if (!USER_RE.test(username)) throw err(400, 'Usernames are 3 to 16 letters, numbers or underscores.');
    if (!PIN_RE.test(pin)) throw err(400, 'Your PIN must be exactly 4 digits.');
    const key = username.toLowerCase();
    if (this.users.has(key)) throw err(400, 'That username is taken. Try another.');
    if (this.users.size >= MAX_USERS) throw err(503, 'Profiles are full right now.');
    const salt = crypto.randomBytes(16).toString('hex');
    const u = { key, username, salt, hash: await this.hash(pin, salt), coins: this.starter, owned: [], avatar: Avatar.valid(avatar) && !Shop.lockedIn(avatar, []).length ? avatar : null,
      flair: { frame: null, name: null, title: null, fx: null }, stats: { games: 0, wins: 0 }, created: Date.now() };
    if (this.users.has(key)) throw err(400, 'That username is taken. Try another.');     // re-check after the await
    this.users.set(key, u); this.save();
    return { user: u, token: this.issue(key) };
  }
  async login(username, pin) {
    const key = String(username || '').trim().toLowerCase(), f = this.fails.get(key), now = Date.now();
    if (f && f.until > now) throw err(429, `Too many wrong PINs. Try again in ${Math.ceil((f.until - now) / 60000)} minutes.`);
    const u = this.users.get(key), ok = PIN_RE.test(String(pin || ''));
    const got = await this.hash(ok ? String(pin) : '0000', u ? u.salt : this.dummy);             // always do the work, so timing does not reveal which usernames exist
    const good = !!u && ok && crypto.timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(u.hash, 'hex'));
    if (!good) {
      const n = (f ? f.n : 0) + 1; this.fails.set(key, n >= LOCK_AFTER ? { n: 0, until: now + LOCK_MS } : { n, until: 0 });
      throw err(401, 'Wrong username or PIN.');
    }
    this.fails.delete(key); return { user: u, token: this.issue(key) };
  }

  publicUser(u) { return { username: u.username, coins: u.coins, owned: u.owned, avatar: u.avatar, flair: u.flair, stats: u.stats }; }
  flairOf(u) { return u ? { ...u.flair } : null; }
  owns(u, id) { return !Shop.BY_ID[id] || u.owned.includes(id); }                                // anything not in the catalog is free
  setAvatar(u, avatar) {
    if (!Avatar.valid(avatar)) throw err(400, "That avatar isn't valid.");
    const locked = Shop.lockedIn(avatar, u.owned); if (locked.length) throw err(400, `You don't own: ${locked.map((i) => Shop.BY_ID[i].name).join(', ')}.`);
    u.avatar = avatar; this.save();
  }
  equip(u, slot, id) {
    if (!SLOTS[slot]) throw err(400, 'Unknown slot.');
    if (id !== null) { const it = Shop.BY_ID[id]; if (!it || it.kind !== slot) throw err(400, 'That item does not fit there.'); if (!u.owned.includes(id)) throw err(403, "You don't own that yet."); }
    u.flair[slot] = id; this.save();
  }
  buy(u, id) {
    const it = Shop.BY_ID[String(id)]; if (!it) throw err(404, 'That item is not for sale.');
    if (u.owned.includes(it.id)) throw err(400, 'You already own that.');
    if (u.coins < it.price) throw err(402, `You need ${it.price - u.coins} more coins.`);
    u.coins -= it.price; u.owned.push(it.id); this.save(); return it;
  }
  award(u, coins, { win = false, game = false } = {}) {
    u.coins += Math.max(0, Math.round(coins)); if (game) u.stats.games++; if (win) u.stats.wins++; this.save();
  }
}
module.exports = { Accounts };
