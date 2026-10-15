'use strict';
// The shop catalog, shared by the browser and the server (the server prices and validates; the browser only displays).
// Avatar items are identified as "<field>:<value>", e.g. "acc:11" (a crown). Anything NOT listed here is free for everyone.
(function (root) {
  const ITEMS = [];
  const add = (id, kind, group, name, price, extra) => ITEMS.push(Object.assign({ id, kind, group, name, price }, extra || {}));
  const av = (field, value, group, name, price) => add(field + ':' + value, 'avatar', group, name, price, { field, value });

  /* hair styles (index = value in avatar.js) */
  av('hair', 1, 'hair', 'Spiky', 250); av('hair', 4, 'hair', 'Medium wavy', 350); av('hair', 6, 'hair', 'Long wavy', 450); av('hair', 7, 'hair', 'Twin tails', 600);
  av('hair', 8, 'hair', 'Bun', 300); av('hair', 9, 'hair', 'Ponytail', 400); av('hair', 10, 'hair', 'Short pigtails', 500);
  /* hats and head wear */
  av('acc', 4, 'hats', 'Beanie', 350); av('acc', 6, 'hats', 'Bow', 250); av('acc', 10, 'hats', 'Baseball cap', 600); av('acc', 9, 'hats', 'Cat ears', 900);
  av('acc', 14, 'hats', 'Bunny ears', 1200); av('acc', 12, 'hats', 'Top hat', 1500); av('acc', 15, 'hats', 'Flower crown', 1800); av('acc', 13, 'hats', 'Halo', 2500); av('acc', 11, 'hats', 'Golden crown', 3000);
  /* gear and accessories */
  av('acc', 3, 'gear', 'Glasses', 300); av('acc', 1, 'gear', 'Headphones', 400); av('acc', 7, 'gear', 'Music note', 500); av('acc', 8, 'gear', 'Sunglasses', 700);
  /* clothing */
  av('clothes', 2, 'clothes', 'Collared shirt', 200); av('clothes', 3, 'clothes', 'Sweater', 300); av('clothes', 5, 'clothes', 'Scarf', 350); av('clothes', 4, 'clothes', 'Jacket', 500);
  av('clothes', 7, 'clothes', 'Sailor uniform', 900); av('clothes', 8, 'clothes', 'Puffer vest', 1000); av('clothes', 6, 'clothes', 'Tuxedo', 1400);
  /* colors */
  av('hairColor', 5, 'colors', 'Pink hair', 250); av('hairColor', 6, 'colors', 'Lavender hair', 250); av('hairColor', 7, 'colors', 'Blue hair', 300); av('hairColor', 8, 'colors', 'Mint hair', 300);
  av('hairColor', 9, 'colors', 'Silver hair', 400); av('hairColor', 10, 'colors', 'Gold hair', 1200); av('hairColor', 11, 'colors', 'Galaxy hair', 2000);
  av('eyeColor', 3, 'colors', 'Violet eyes', 150); av('eyeColor', 6, 'colors', 'Pink eyes', 150); av('eyeColor', 7, 'colors', 'Teal eyes', 150);
  /* face */
  av('eyes', 5, 'face', 'Dot eyes', 150); av('eyes', 2, 'face', 'Sleepy eyes', 200); av('eyes', 4, 'face', 'Cat eyes', 400); av('eyes', 3, 'face', 'Sparkly eyes', 500);
  av('mark', 1, 'face', 'Whiskers', 200); av('mark', 4, 'face', 'Tear mark', 300); av('mark', 2, 'face', 'Star mark', 400); av('mark', 3, 'face', 'Forehead gem', 800);
  /* profile flair */
  for (const [k, n, p] of [['pixel', 'Pixel frame', 600], ['gold', 'Gold frame', 800], ['ice', 'Ice frame', 1000], ['neon', 'Neon frame', 1500], ['rainbow', 'Rainbow frame', 2200], ['flame', 'Flame frame', 3500]]) add('frame:' + k, 'frame', 'frames', n, p);
  for (const [k, n, p] of [['rose', 'Rose name', 300], ['mint', 'Mint name', 300], ['violet', 'Violet name', 500], ['gold', 'Gold name', 900], ['rainbow', 'Rainbow name', 2000]]) add('name:' + k, 'name', 'names', n, p);
  for (const [k, n, p] of [['rookie', 'Rookie DJ', 150], ['topper', 'Chart Topper', 500], ['collector', 'Vinyl Collector', 700], ['beat', 'Beat Master', 1200], ['wizard', 'Lyric Wizard', 1800], ['legend', 'Mixtape Legend', 4000]]) add('title:' + k, 'title', 'titles', n, p, { text: n });
  /* reaction effects (shown around your avatar when you guess right) */
  for (const [k, n, p] of [['sparkles', 'Sparkles', 500], ['hearts', 'Hearts', 700], ['confetti', 'Confetti', 1200], ['stars', 'Shooting stars', 2000]]) add('fx:' + k, 'fx', 'effects', n, p);

  const BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
  const tier = (price) => (price >= 2500 ? 'legendary' : price >= 1000 ? 'epic' : price >= 300 ? 'rare' : 'common');
  const itemId = (field, value) => field + ':' + value;
  const isFree = (field, value) => !BY_ID[itemId(field, value)];
  // avatar config -> ids of paid items it uses that `owned` (a Set or array) does not contain
  function lockedIn(cfg, owned) {
    const have = owned instanceof Set ? owned : new Set(owned || []);
    return Object.keys(cfg || {}).map((f) => itemId(f, cfg[f])).filter((id) => BY_ID[id] && !have.has(id));
  }
  const GROUPS = [['hair', 'Hair'], ['hats', 'Hats'], ['gear', 'Accessories'], ['clothes', 'Clothes'], ['colors', 'Colors'], ['face', 'Face'], ['frames', 'Frames'], ['names', 'Name colors'], ['titles', 'Titles'], ['effects', 'Effects']];
  const api = { ITEMS, BY_ID, GROUPS, tier, itemId, isFree, lockedIn, STARTER_COINS: 500, PARTICIPATION_COINS: 50, WIN_BONUS_COINS: 100 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Shop = api;
})(typeof self !== 'undefined' ? self : this);
