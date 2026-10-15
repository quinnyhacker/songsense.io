'use strict';
// Song Sense avatars: cute anime-style heads and shoulders assembled from independent SVG layers on a 100x100 grid.
// Layer order (back to front): back hair, clothing, neck, head + ears, skin shading, face (eyes, brows, mouth, blush,
// freckles, marks), front hair (cap + bangs + extras), accessories.
// An avatar is a small structured config of option indexes, e.g. { skin:2, hair:3, ... }, so it can be saved,
// sent to the server (which validates it with the same SCHEMA) and recreated identically everywhere.
(function (root) {
  const Shop = (typeof module !== 'undefined' && module.exports) ? require('./shop-data.js') : root.Shop;   // which items are free vs paid
  const INK = '#2a2140';
  const SKIN = ['#fde3cf', '#f8cfb0', '#efb98f', '#d9a077', '#b9744a', '#8d5530', '#6a3d24', '#4b2a1a'];
  const HAIR_COLORS = ['#2b2433', '#6b4430', '#a0623a', '#e8c36a', '#d9703a', '#f08bb5', '#b8a5e8', '#5fa3e8', '#7fdcc0', '#e6e9f2', '#f5c542', '#5b3fa8'];
  const EYE_COLORS = ['#6b3d22', '#3a8dcc', '#3aa26b', '#8b5fd0', '#d99a2b', '#7a8594', '#e0609a', '#2ab3b3'];
  const CLOTH_COLORS = ['#203c61', '#3a8dcc', '#70b8f0', '#b8a5e8', '#a9e5d0', '#d95353', '#f0c34a', '#f08bb5', '#f4faff', '#3a3a48'];
  const NAMES = {
    hair: ['Messy', 'Spiky', 'Fluffy bob', 'Medium', 'Medium wavy', 'Long', 'Long wavy', 'Twin tails', 'Bun', 'Ponytail', 'Short pigtails', 'Afro', 'Mohawk', 'Curly bob', 'Braids', 'Space buns'],
    bangs: ['No bangs', 'Straight', 'Side swept', 'Parted'],
    eyes: ['Round', 'Tall', 'Sleepy', 'Sparkly', 'Cat', 'Dots'],
    brows: ['Thin', 'Thick', 'Arched', 'Flat'],
    expr: ['Happy', 'Neutral', 'Excited', 'Confused', 'Sad', 'Angry', 'Smug'],
    blush: ['None', 'Light', 'Rosy'],
    freckles: ['None', 'Freckles'],
    mark: ['None', 'Whiskers', 'Star', 'Gem', 'Tear mark'],
    clothes: ['T-shirt', 'Hoodie', 'Collared', 'Sweater', 'Jacket', 'Scarf', 'Tuxedo', 'Sailor', 'Puffer vest', 'Scrubs', 'Lab coat', 'Knight armor', 'Shadow suit', 'Space suit', 'Wizard robe', 'Royal robe'],
    acc: ['None', 'Headphones', 'Earbuds', 'Glasses', 'Beanie', 'Hair clips', 'Bow', 'Music note', 'Sunglasses', 'Cat ears', 'Baseball cap', 'Golden crown', 'Top hat', 'Halo', 'Bunny ears', 'Flower crown', 'Stethoscope', 'Knight helmet', 'Scrub cap', 'Shadow cowl', 'Wizard hat', 'Astronaut helmet', 'Viking helmet', 'Angel wings', 'Devil horns', 'Pirate hat', 'Cowboy hat', 'Santa hat', 'Sweatband', 'Eyepatch', 'Monocle', 'Heart glasses', 'Antlers', 'Tiara', 'Chef hat', 'Party hat', 'Laurel wreath'],
    pet: ['None', 'Kitten', 'Puppy', 'Duckling', 'Bunny', 'Shih tzu', 'Penguin', 'Panda', 'Fox', 'Owl', 'Axolotl', 'Ghost', 'Robot', 'Baby dragon', 'Unicorn foal'],
  };
  const EXPR = { happy: 0, neutral: 1, excited: 2, confused: 3, sad: 4, angry: 5, smug: 6 };
  // number of choices per field (the server validates against this exact table)
  const SCHEMA = { skin: SKIN.length, hair: NAMES.hair.length, hairColor: HAIR_COLORS.length, bangs: NAMES.bangs.length, eyes: NAMES.eyes.length, eyeColor: EYE_COLORS.length,
    brows: NAMES.brows.length, expr: NAMES.expr.length, blush: NAMES.blush.length, freckles: NAMES.freckles.length, mark: NAMES.mark.length, clothes: NAMES.clothes.length,
    clothesColor: CLOTH_COLORS.length, acc: NAMES.acc.length, pet: NAMES.pet.length, accColor: CLOTH_COLORS.length };
  const DEFAULT = { skin: 1, hair: 3, hairColor: 1, bangs: 2, eyes: 0, eyeColor: 1, brows: 0, expr: 0, blush: 1, freckles: 0, mark: 0, clothes: 1, clothesColor: 1, acc: 0, accColor: 2, pet: 0 };
  const OPTIONAL = new Set(['pet']);                // fields added after launch: older saved avatars legitimately lack them

  const clamp = (v, n) => { v = Number(v); return Number.isInteger(v) && v >= 0 && v < n ? v : 0; };
  function normalize(cfg) { const out = {}; for (const k of Object.keys(SCHEMA)) out[k] = clamp(cfg && cfg[k] !== undefined ? cfg[k] : DEFAULT[k], SCHEMA[k]); return out; }
  // strict check for untrusted input: every field present, an integer, in range
  function valid(cfg) {
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return false;
    if (!Object.keys(cfg).every((k) => k in SCHEMA)) return false;
    return Object.keys(SCHEMA).every((k) => (cfg[k] === undefined ? OPTIONAL.has(k) : Number.isInteger(cfg[k]) && cfg[k] >= 0 && cfg[k] < SCHEMA[k]));
  }
  function hashSeed(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function random(rand, allow) {          // allow(field, value) -> bool; default: only free items
    rand = rand || Math.random; allow = allow || ((f, v) => Shop.isFree(f, v)); const out = {};
    for (const k of Object.keys(SCHEMA)) { const ok = []; for (let i = 0; i < SCHEMA[k]; i++) if (allow(k, i)) ok.push(i); out[k] = ok.length ? ok[Math.floor(rand() * ok.length)] : 0; }
    out.acc = rand() < 0.35 ? 0 : out.acc; out.freckles = rand() < 0.7 ? 0 : 1; out.mark = rand() < 0.6 || !allow('mark', out.mark) ? 0 : out.mark; return out;
  }
  // replace any paid item the player does not own with a free one (used when restoring saved looks)
  function sanitize(cfg, owned) {
    const have = owned instanceof Set ? owned : new Set(owned || []), out = normalize(cfg);
    for (const k of Object.keys(SCHEMA)) if (!Shop.isFree(k, out[k]) && !have.has(Shop.itemId(k, out[k]))) { let v = DEFAULT[k]; if (!Shop.isFree(k, v)) { v = 0; while (v < SCHEMA[k] && !Shop.isFree(k, v)) v++; } out[k] = v; }
    return out;
  }
  const fromName = (name) => random(rng(hashSeed(name || 'player')));   // stable default for players who have not made one

  function shade(hex, f) {          // f < 0 darkens, f > 0 lightens
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = f < 0 ? 0 : 255, p = Math.abs(f); r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  const P = (d, fill, extra) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" ${extra || ''}/>`;
  const L = (d, w, col, extra) => `<path d="${d}" fill="none" stroke="${col || INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra || ''}/>`;

  /* ---- layer: back hair (behind head and clothes) ---- */
  const BACK = [
    'M21 40 C18 22 30 12 50 12 C70 12 82 22 79 40 C80 50 76 56 76 56 L24 56 C24 56 20 50 21 40Z',
    'M21 40 C18 24 30 14 50 14 C70 14 82 24 79 40 C80 50 76 54 76 54 L24 54 C24 54 20 50 21 40Z',
    'M16 48 C10 20 30 7 50 7 C70 7 90 20 84 48 C88 62 80 69 73 68 L27 68 C20 69 12 62 16 48Z',
    'M18 40 C16 18 32 8 50 8 C68 8 84 18 82 40 L85 82 L70 82 L70 62 L30 62 L30 82 L15 82Z',
    'M18 40 C15 18 32 8 50 8 C68 8 85 18 82 40 C88 52 80 58 86 70 C90 78 82 84 76 82 L70 66 L30 66 L24 82 C18 84 10 78 14 70 C20 58 12 52 18 40Z',
    'M17 40 C14 16 32 6 50 6 C68 6 86 16 83 40 L89 97 L11 97Z',
    'M17 40 C13 16 32 6 50 6 C68 6 87 16 83 40 C92 56 80 64 90 78 C94 88 86 94 90 98 L10 98 C14 94 6 88 10 78 C20 64 8 56 17 40Z',
    'M22 40 C20 16 34 8 50 8 C66 8 80 16 78 40 L76 52 L24 52Z M24 44 C8 48 4 74 12 92 C22 88 26 68 30 56Z M76 44 C92 48 96 74 88 92 C78 88 74 68 70 56Z',
  ];
  BACK[8] = BACK[0];
  BACK[9] = BACK[0] + 'M72 26 C92 22 98 52 88 80 C84 70 82 58 76 46Z';
  BACK[10] = BACK[0] + 'M22 46 C10 50 8 66 14 76 C20 72 24 62 28 54Z M78 46 C90 50 92 66 86 76 C80 72 76 62 72 54Z';
  BACK[11] = 'M12 44 C2 24 18 5 36 9 C42 -1 58 -1 64 9 C82 5 98 24 88 44 C94 58 84 64 76 60 L24 60 C16 64 6 58 12 44Z';           // afro
  BACK[12] = 'M26 40 C26 24 36 16 50 16 C64 16 74 24 74 40 L74 50 L26 50Z';                                                    // mohawk (shaved sides)
  BACK[13] = 'M16 48 C8 40 10 28 18 24 C16 14 28 6 38 10 C44 2 58 2 62 10 C72 6 84 14 82 24 C90 28 92 40 84 48 C90 58 80 68 72 66 L28 66 C20 68 10 58 16 48Z';   // curly bob
  BACK[14] = BACK[0] + 'M24 52 C16 60 22 70 16 78 C22 84 18 92 24 96 C30 90 26 82 30 76 C26 70 30 60 30 54Z M76 52 C84 60 78 70 84 78 C78 84 82 92 76 96 C70 90 74 82 70 76 C74 70 70 60 70 54Z';   // braids
  BACK[15] = BACK[0];                                                                                                          // space buns (buns are drawn in front)
  /* ---- layer: front hair = cap over the crown + optional extras (spikes, tufts) ---- */
  const CAP = 'M22 40 C20 20 34 10 50 10 C66 10 80 20 78 40 C72 28 62 23 50 23 C38 23 28 28 22 40Z';
  const EXTRA = [
    'M23 32 L27 16 L35 25 L42 11 L50 22 L58 11 L65 25 L73 16 L77 32 C70 24 60 20 50 20 C40 20 30 24 23 32Z',
    'M22 34 L15 14 L31 24 L36 3 L46 20 L54 1 L62 20 L72 5 L72 24 L87 13 L78 34 C70 24 60 20 50 20 C40 20 30 24 22 34Z',
  ];
  EXTRA[12] = 'M35 27 L39 6 L44 13 L50 1 L56 13 L61 6 L65 27Z';
  EXTRA[15] = 'M16 12 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0Z M66 12 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0Z';
  EXTRA[8] = 'M41.5 9 a8.5 8.5 0 1 0 17 0 a8.5 8.5 0 1 0 -17 0Z';        // top bun
  const BANGS = [
    '',
    'M22 40 C20 18 34 10 50 10 C66 10 80 18 78 40 L76 33 L24 33Z',
    'M22 40 C20 18 34 10 50 10 C66 10 80 18 78 40 C74 34 70 30 66 29 C56 35 40 37 26 41 C24 41 23 41 22 40Z',
    'M22 40 C20 18 34 10 50 10 C66 10 80 18 78 40 C76 33 68 30 58 26 L50 19 L42 26 C32 30 24 33 22 40Z',
  ];

  /* ---- layer: clothing + neck ---- */
  const SHOULDERS = 'M6 100 C6 88 20 81 38 79 L62 79 C80 81 94 88 94 100Z';
  function clothing(c, skin, col, shadeSkin) {
    const dk = shade(col, -0.25), neck = (d) => P(d, skin) + `<path d="M43 78 C47 82 53 82 57 78 L57 74 L43 74Z" fill="${shadeSkin}" opacity=".5"/>`;
    const base = P(SHOULDERS, col) + L('M16 96 C20 88 28 84 36 82', 1.2, shade(col, 0.3), 'opacity=".6"');
    switch (c) {
      case 0: return base + neck('M41 66 L59 66 L60 80 C56 90 44 90 40 80Z') + L('M40 80 C44 90 56 90 60 80', 3, dk);                       // t-shirt, crew neck
      case 1: return P('M30 82 C28 68 40 64 50 70 C60 64 72 68 70 82Z', dk) + base + neck('M42 66 L58 66 L58 82 C54 88 46 88 42 82Z') + L('M33 78 C33 94 67 94 67 78', 5, dk) + L('M45 86 L44 98 M55 86 L56 98', 1.8, '#fff');   // hoodie
      case 2: return base + neck('M42 66 L58 66 L50 90Z') + P('M41 74 L50 90 L36 86Z', '#fff') + P('M59 74 L50 90 L64 86Z', '#fff');                  // collared shirt
      case 3: return base + neck('M43 66 L57 66 L57 72Z') + P('M37 66 L63 66 L65 82 L35 82Z', col) + L('M39 70 L61 70 M38 74 L62 74 M37 78 L63 78', 1.1, dk);   // sweater (turtle)
      case 4: return base + neck('M42 66 L58 66 L50 92Z') + P('M42 76 L58 76 L50 94Z', '#f4faff') + P('M37 76 L48 96 L33 92Z', dk) + P('M63 76 L52 96 L67 92Z', dk);   // jacket
      case 6: return P(SHOULDERS, '#2b2b3a') + neck('M42 66 L58 66 L50 90Z') + P('M41 75 L50 92 L59 75 L56 72 L50 82 L44 72Z', '#fff') + P('M34 78 L48 96 L30 92Z', '#3d3d50') + P('M66 78 L52 96 L70 92Z', '#3d3d50') + P('M50 82 L43 78 L43 87Z', '#d9423a') + P('M50 82 L57 78 L57 87Z', '#d9423a') + '<circle cx="50" cy="82" r="2.2" fill="#a52a22"/>';   // tuxedo
      case 7: return P(SHOULDERS, '#f4faff') + neck('M42 66 L58 66 L50 86Z') + P('M34 72 L50 90 L66 72 L74 84 L50 98 L26 84Z', col) + L('M33 79 L49 93 M67 79 L51 93', 1.6, '#fff') + P('M50 88 L44 98 L56 98Z', '#d9423a');   // sailor uniform
      case 8: return base + neck('M43 66 L57 66 L57 74 C54 84 46 84 43 74Z') + P('M8 100 C8 90 20 83 36 80 L38 100Z', dk) + P('M92 100 C92 90 80 83 64 80 L62 100Z', dk) + L('M12 94 L37 90 M10 100 L38 96 M88 94 L63 90 M90 100 L62 96', 1.2, shade(dk, 0.3));   // puffer vest
      case 9: return base + neck('M42 66 L58 66 L50 88Z') + L('M40 75 L50 90 L60 75', 2.4, dk) + P('M58 88 h9 v8 h-9z', shade(col, -0.12)) + L('M60 91 h5', 1, shade(col, 0.4));   // scrubs
      case 10: return P(SHOULDERS, '#f8fbff') + neck('M42 66 L58 66 L50 90Z') + P('M42 74 L50 92 L58 74 L54 72 L50 80 L46 72Z', col) + P('M35 77 L48 98 L28 94Z', '#fff') + P('M65 77 L52 98 L72 94Z', '#fff') + P('M62 90 h8 v8 h-8z', '#eef3f9') + L('M65 90 v-3', 1.6, '#d9423a');   // lab coat
      case 11: return P(SHOULDERS, '#aeb8c8') + neck('M43 66 L57 66 L57 72 L43 72Z') + P('M36 69 L64 69 L68 82 L32 82Z', '#8d99ad') + L('M36 74 H64', 1.2, '#cfd8e6') + P('M6 100 C6 84 20 76 36 79 L33 100Z', '#c4cddb') + P('M94 100 C94 84 80 76 64 79 L67 100Z', '#c4cddb') + P('M37 82 L63 82 L67 100 L33 100Z', '#b6c0d0') + L('M50 84 V98 M43 90 H57', 1.8, '#f5c542') + [[14, 90], [22, 84], [86, 90], [78, 84]].map((c) => `<circle cx="${c[0]}" cy="${c[1]}" r="1.4" fill="#eef3f9" stroke="${INK}" stroke-width=".6"/>`).join('');   // knight armor
      case 12: return P('M2 100 C2 70 14 56 30 52 L70 52 C86 56 98 70 98 100Z', '#1d1d28') + L('M4 98 C4 74 16 60 30 56 M96 98 C96 74 84 60 70 56', 1.6, '#5b3fa8') + P(SHOULDERS, '#33343f') + neck('M43 66 L57 66 L57 74 L43 74Z') + P('M38 72 L62 72 L64 82 L36 82Z', '#262730') + P('M50 84 L58 88 L56 96 L50 99 L44 96 L42 88Z', '#f5c542') + P('M50 88 L54 92 L50 96 L46 92Z', '#262730') + L('M12 94 L36 86 M88 94 L64 86', 1.2, '#4a4b5a') + '<circle cx="30" cy="82" r="2.2" fill="#f5c542" stroke="' + INK + '" stroke-width=".8"/><circle cx="70" cy="82" r="2.2" fill="#f5c542" stroke="' + INK + '" stroke-width=".8"/>';   // shadow vigilante suit + cape
      case 13: return P(SHOULDERS, '#f4f6fa') + neck('M43 66 L57 66 L57 76 L43 76Z') + P('M33 73 C40 85 60 85 67 73 L69 82 C60 93 40 93 31 82Z', '#c9d3e2') + P('M40 90 h20 v9 h-20z', '#aeb8c8') + '<circle cx="45" cy="94.5" r="1.8" fill="#d9423a"/><circle cx="50" cy="94.5" r="1.8" fill="#4aa6ec"/><circle cx="55" cy="94.5" r="1.8" fill="#5fd0a1"/>' + P('M10 94 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0Z', col);   // space suit
      case 14: return P(SHOULDERS, '#5b3fa8') + neck('M42 66 L58 66 L50 88Z') + L('M40 76 L50 90 L60 76', 2.6, '#f5c542') + [[22, 92, 3.4], [78, 90, 3], [60, 97, 2.4], [38, 98, 2.4]].map((s) => `<path d="M${s[0]} ${s[1] - s[2]} Q${s[0]} ${s[1]} ${s[0] + s[2]} ${s[1]} Q${s[0]} ${s[1]} ${s[0]} ${s[1] + s[2]} Q${s[0]} ${s[1]} ${s[0] - s[2]} ${s[1]} Q${s[0]} ${s[1]} ${s[0]} ${s[1] - s[2]}Z" fill="#f5c542"/>`).join('');   // wizard robe
      case 15: return P(SHOULDERS, '#b52a3a') + neck('M43 66 L57 66 L57 74 L43 74Z') + P('M30 74 C38 86 62 86 70 74 L74 84 C62 98 38 98 26 84Z', '#fffaf0') + [[36, 84], [44, 89], [54, 89], [62, 84], [32, 80], [68, 80]].map((c) => `<ellipse cx="${c[0]}" cy="${c[1]}" rx="1.1" ry="2" fill="#2a2140"/>`).join('') + '<circle cx="50" cy="90" r="2.6" fill="#f5c542" stroke="' + INK + '" stroke-width=".9"/>';   // royal robe
      default: return base + neck('M42 66 L58 66 L58 78 L42 78Z') + P('M33 72 C40 84 60 84 67 72 L69 80 C60 92 40 92 31 80Z', dk) + P('M53 84 L63 99 L51 99 L47 88Z', col) + L('M51 94 L58 94', 1.6, '#fff');   // scarf
    }
  }

  /* ---- layer: face ---- */
  function eye(cx, kind, iris, ex, side) {
    if (ex === 0) return L(`M${cx - 6.5} 49 Q${cx} 39 ${cx + 6.5} 49`, 2.6);                  // happy: closed ^ ^ eyes
    const cy = 47, dark = shade(iris, -0.45);
    if (kind === 5) return `<circle cx="${cx}" cy="${cy}" r="3.4" fill="${INK}"/><circle cx="${cx - 1}" cy="${cy - 1.2}" r="1" fill="#fff"/>`;
    const sh = { 0: [6.2, 7.4], 1: [5.2, 8.6], 2: [6.4, 5.4], 3: [6.6, 8], 4: [6.6, 6.6] }[kind];
    const tilt = kind === 4 ? (side < 0 ? -12 : 12) : 0, rx = sh[0] + (ex === 2 ? 0.8 : 0), ry = sh[1] + (ex === 2 ? 0.8 : 0);
    let s = `<g transform="rotate(${tilt} ${cx} ${cy})"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" stroke="${INK}" stroke-width="1.6"/>`;
    s += `<ellipse cx="${cx}" cy="${cy + 0.6}" rx="${rx * 0.78}" ry="${ry * 0.82}" fill="${iris}"/><ellipse cx="${cx}" cy="${cy + 0.8}" rx="${rx * 0.4}" ry="${ry * 0.5}" fill="${dark}"/>`;
    s += `<circle cx="${cx - rx * 0.32}" cy="${cy - ry * 0.35}" r="${kind === 3 ? 2.3 : 1.8}" fill="#fff"/><circle cx="${cx + rx * 0.3}" cy="${cy + ry * 0.35}" r="0.9" fill="#fff"/>`;
    if (kind === 3 || ex === 2) s += `<path d="M${cx + rx * 0.5} ${cy - ry * 0.6} l0.7 1.6 1.6 0.7 -1.6 0.7 -0.7 1.6 -0.7 -1.6 -1.6 -0.7 1.6 -0.7z" fill="#fff"/>`;
    s += L(`M${cx - rx - 0.5} ${cy - ry * 0.55} Q${cx} ${cy - ry - 2.2} ${cx + rx + 0.5} ${cy - ry * 0.55}`, 2.2) + '</g>';
    if (ex === 6) s += `<path d="M${cx - rx - 1} ${cy - ry - 2} L${cx + rx + 1} ${cy - ry - 2} L${cx + rx + 1} ${cy - 1.5} L${cx - rx - 1} ${cy - 1.5}Z" fill="SKINFILL"/>` + L(`M${cx - rx - 1} ${cy - 1.5} L${cx + rx + 1} ${cy - 1.5}`, 2.2);   // smug: heavy lids
    if (ex === 4) s += `<path d="M${cx + side * 5.5} ${cy + ry + 1} q-2 4 0 5.5 q2 -1.5 0 -5.5z" fill="#8fd0ff" stroke="#3a8dcc" stroke-width=".8"/>`;                                      // sad: tear
    return s;
  }
  const BROW_W = [1.6, 3.2, 2, 2.4];
  function brow(cx, style, ex, side) {
    const w = BROW_W[style], path = style === 2 ? `M${cx - 7} 36 Q${cx} 29 ${cx + 7} 36` : style === 3 ? `M${cx - 6.5} 34 L${cx + 6.5} 34` : `M${cx - 6.5} 35 Q${cx} 32 ${cx + 6.5} 35`;
    // rotation sign flips per side so "inner end up/down" is mirrored
    const angle = ex === 5 ? -side * 18 : ex === 4 ? side * 16 : ex === 3 ? (side < 0 ? 12 : 0) : 0;   // angry: inner ends down, sad: inner ends up
    const dy = ex === 2 ? -2.5 : ex === 3 ? (side > 0 ? -3.5 : 1) : ex === 6 ? (side > 0 ? -2.5 : 0.5) : 0;
    return L(path, w, INK, `transform="translate(0 ${dy}) rotate(${angle} ${cx} 35)"`);
  }
  const MOUTH = [
    () => L('M43 59 Q50 66 57 59', 2),                                                              // happy
    () => L('M46.5 61 L53.5 61', 2),                                                                // neutral
    () => P('M42 58 Q50 73 58 58Z', '#a8394f') + '<ellipse cx="50" cy="65.5" rx="4.2" ry="2.4" fill="#f08b9a"/>',   // excited (open)
    () => L('M43.5 62.5 Q46.5 58.5 50 62.5 T56.5 62.5', 2),                                         // confused
    () => L('M44 64 Q50 57.5 56 64', 2),                                                            // sad
    () => L('M44.5 63 Q50 59 55.5 63', 2),                                                          // angry
    () => L('M44 60.5 Q51 64 58.5 56.5', 2),                                                        // smug
  ];

  function face(cfg, ex, skin, kiss) {
    const iris = EYE_COLORS[cfg.eyeColor];
    let s = '';
    if (cfg.blush) s += `<ellipse cx="31.5" cy="56" rx="5.5" ry="3.2" fill="#ff7f9f" opacity="${cfg.blush === 2 ? 0.6 : 0.32}"/><ellipse cx="68.5" cy="56" rx="5.5" ry="3.2" fill="#ff7f9f" opacity="${cfg.blush === 2 ? 0.6 : 0.32}"/>`;
    if (cfg.freckles) s += [[30, 54], [34, 56.5], [38, 54.5], [62, 54.5], [66, 56.5], [70, 54]].map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="0.95" fill="${shade(skin, -0.45)}"/>`).join('');
    if (cfg.mark === 1) s += L('M26 53 L33 54.5 M26 57.5 L33 57 M74 53 L67 54.5 M74 57.5 L67 57', 1, shade(skin, -0.5));
    if (cfg.mark === 2) s += '<path d="M72 52 l1.3 2.8 3 .4 -2.2 2.1 .6 3 -2.7 -1.5 -2.7 1.5 .6 -3 -2.2 -2.1 3 -.4z" fill="#ffd54a" stroke="#c98d00" stroke-width=".6"/>';
    if (cfg.mark === 3) s += '<path d="M50 24.5 l3 3.5 -3 4 -3 -4z" fill="#7fe3ff" stroke="#2a8fb8" stroke-width=".9"/>';
    if (cfg.mark === 4) s += L('M31 50.5 L31 54.5 M69 50.5 L69 54.5', 1.4, '#3a8dcc');
    s += '<path d="M49 53 Q50 54.6 51.4 53" fill="none" stroke="' + shade(skin, -0.45) + '" stroke-width="1.1" stroke-linecap="round"/>';
    if (kiss) {                                                   // blow-a-kiss pose: one eye open, one winking, lips puckered, extra blush
      s += `<ellipse cx="31.5" cy="56" rx="5.5" ry="3.2" fill="#ff7f9f" opacity=".55"/><ellipse cx="68.5" cy="56" rx="5.5" ry="3.2" fill="#ff7f9f" opacity=".55"/>`;
      s += eye(38, cfg.eyes, iris, 1, -1) + eye(62, cfg.eyes, iris, 0, 1);
      s += brow(38, cfg.brows, 1, -1) + brow(62, cfg.brows, 2, 1);
      s += '<ellipse cx="50" cy="62" rx="3.2" ry="3.9" fill="#d0506a" stroke="' + INK + '" stroke-width="1.6"/><ellipse cx="49" cy="60.8" rx="1" ry="1.2" fill="#fff" opacity=".7"/>';
      return s;
    }
    s += (eye(38, cfg.eyes, iris, ex, -1) + eye(62, cfg.eyes, iris, ex, 1)).replace(/SKINFILL/g, skin);
    s += brow(38, cfg.brows, ex, -1) + brow(62, cfg.brows, ex, 1) + MOUTH[ex]();
    return s;
  }

  /* ---- layer: accessories ---- */
  function accessory(a, col, hair) {
    const dk = shade(col, -0.3);
    switch (a) {
      case 1: return L('M21 46 C18 8 82 8 79 46', 3.6, '#3d3d4e') + P('M14 40 h9 a3 3 0 0 1 3 3 v14 a3 3 0 0 1 -3 3 h-9 a4 4 0 0 1 -4 -4 v-12 a4 4 0 0 1 4 -4z', col) + P('M86 40 h-9 a3 3 0 0 0 -3 3 v14 a3 3 0 0 0 3 3 h9 a4 4 0 0 0 4 -4 v-12 a4 4 0 0 0 -4 -4z', col);
      case 2: return '<circle cx="23.5" cy="52" r="2.6" fill="#fff" stroke="' + INK + '" stroke-width="1"/><circle cx="76.5" cy="52" r="2.6" fill="#fff" stroke="' + INK + '" stroke-width="1"/>' + L('M23.5 54.5 C20 70 30 84 36 99', 1.2, '#fff') + L('M76.5 54.5 C80 70 70 84 64 99', 1.2, '#fff');
      case 3: return `<circle cx="38" cy="47" r="10" fill="#bfe6ff" fill-opacity=".28" stroke="${INK}" stroke-width="2"/><circle cx="62" cy="47" r="10" fill="#bfe6ff" fill-opacity=".28" stroke="${INK}" stroke-width="2"/>` + L('M48 46 Q50 43.5 52 46 M28 45 L23 43 M72 45 L77 43', 1.8) + L('M32 42 L35 39', 1.2, '#fff');
      case 4: return P('M21 34 C19 4 81 4 79 34Z', col) + P('M19.5 30 h61 a3 3 0 0 1 3 3 v3 a3 3 0 0 1 -3 3 h-61 a3 3 0 0 1 -3 -3 v-3 a3 3 0 0 1 3 -3z', dk) + `<circle cx="50" cy="6" r="4.6" fill="#fff" stroke="${INK}" stroke-width="1.4"/>`;
      case 5: return P('M24 24 L38 21 L39.5 25 L25.5 28Z', col) + P('M23 30 L37 27 L38.5 31 L24.5 34Z', dk);
      case 6: return P('M71 20 L56 11 L56 29Z', col) + P('M71 20 L86 11 L86 29Z', col) + `<circle cx="71" cy="20" r="3.4" fill="${dk}" stroke="${INK}" stroke-width="1.4"/>`;
      case 7: return `<g transform="translate(66 14) scale(1.05)"><ellipse cx="2.5" cy="14" rx="4.2" ry="3.2" fill="${col}" stroke="${INK}" stroke-width="1.4"/><path d="M6.4 14 V1" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M6.4 1 Q12 2 12 8" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/></g>`;
      case 8: return `<path d="M26 41 h22 v8 q0 6 -6 6 h-10 q-6 0 -6 -6z" fill="#1d1d2b" stroke="${INK}" stroke-width="1.6"/><path d="M52 41 h22 v8 q0 6 -6 6 h-10 q-6 0 -6 -6z" fill="#1d1d2b" stroke="${INK}" stroke-width="1.6"/>` + L('M48 44 Q50 42 52 44 M26 43 L22 41 M74 43 L78 41', 1.8) + L('M30 44 L34 44 M56 44 L60 44', 1.4, '#7f93b8');
      case 9: return P('M22 30 L24 4 L42 18Z', col) + P('M78 30 L76 4 L58 18Z', col) + P('M27 22 L28 11 L36 17Z', '#ffb3c6') + P('M73 22 L72 11 L64 17Z', '#ffb3c6');
      case 10: return P('M23 33 C23 6 77 6 77 33Z', col) + P('M20 31 Q50 42 80 31 L80 27 Q50 36 20 27Z', dk) + `<circle cx="50" cy="8.5" r="2.4" fill="${dk}" stroke="${INK}" stroke-width="1.2"/>`;
      case 11: return P('M25 24 L29 5 L40 15 L50 2 L60 15 L71 5 L75 24Z', '#f5c542') + P('M25 24 H75 V29 H25Z', '#e0a81c') + '<circle cx="29" cy="6" r="2.2" fill="#ff5c7a"/><circle cx="50" cy="3.5" r="2.4" fill="#5fa3e8"/><circle cx="71" cy="6" r="2.2" fill="#ff5c7a"/><circle cx="38" cy="26.5" r="1.4" fill="#fff6c4"/><circle cx="62" cy="26.5" r="1.4" fill="#fff6c4"/>';
      case 12: return P('M33 22 L35 3 L65 3 L67 22Z', '#2b2b3a') + P('M33.4 17 L66.6 17 L67 22 L33 22Z', col) + P('M22 23 Q50 29 78 23 Q50 17 22 23Z', '#2b2b3a');
      case 13: return '<ellipse cx="50" cy="7" rx="17" ry="4.5" fill="none" stroke="#f5c542" stroke-width="3.2"/><ellipse cx="50" cy="6" rx="17" ry="4.5" fill="none" stroke="#fff6c4" stroke-width="1" opacity=".85"/>';
      case 14: return `<ellipse cx="33" cy="10" rx="5" ry="11.5" transform="rotate(-18 33 10)" fill="${col}" stroke="${INK}" stroke-width="1.5"/><ellipse cx="33" cy="10.5" rx="2.4" ry="7" transform="rotate(-18 33 10)" fill="#ffb3c6"/><ellipse cx="67" cy="10" rx="5" ry="11.5" transform="rotate(18 67 10)" fill="${col}" stroke="${INK}" stroke-width="1.5"/><ellipse cx="67" cy="10.5" rx="2.4" ry="7" transform="rotate(18 67 10)" fill="#ffb3c6"/>`;
      case 15: return L('M24 28 Q50 12 76 28', 2.4, '#4fae6b') + [[28, 25, '#ff8fb1'], [39, 19, '#fff'], [50, 16.5, '#ffd166'], [61, 19, '#fff'], [72, 25, '#ff8fb1']].map((f) => `<circle cx="${f[0]}" cy="${f[1]}" r="4.3" fill="${f[2]}" stroke="${INK}" stroke-width="1.1"/><circle cx="${f[0]}" cy="${f[1]}" r="1.5" fill="#ffd54a"/>`).join('');
      case 16: return L('M40 71 C33 84 43 93 50 94 M60 71 C67 84 57 93 50 94 M50 94 V98', 2.4, '#2a2a35') + L('M40 71 C33 84 43 93 50 94 M60 71 C67 84 57 93 50 94', 1, col, 'opacity=".9"') + `<circle cx="40" cy="71" r="2.2" fill="#8a8f9c" stroke="${INK}" stroke-width=".8"/><circle cx="60" cy="71" r="2.2" fill="#8a8f9c" stroke="${INK}" stroke-width=".8"/>` + P('M50 98 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0Z', '#dfe5ee') + '<circle cx="50" cy="98" r="1.6" fill="#8a8f9c"/>';   // stethoscope
      case 17: return P('M46 14 C39 -1 63 -4 68 8 C61 4 55 8 54 15Z', col) + P('M22 38 C20 8 80 8 78 38Z', '#aeb8c8') + P('M20 33 H80 V40 H20Z', '#8d99ad') + L('M30 20 Q40 12 52 12', 1.6, '#e9eef6', 'opacity=".8"') + P('M20 40 L20 62 L30 67 L30 40Z', '#b6c0d0') + P('M80 40 L80 62 L70 67 L70 40Z', '#b6c0d0') + P('M48.4 36 H51.6 V52 H48.4Z', '#8d99ad');   // knight helmet (visor up)
      case 18: return P('M23 36 C23 8 77 8 77 36 C70 30 60 28 50 28 C40 28 30 30 23 36Z', col) + P('M72 30 L86 35 L74 41Z', dk) + '<circle cx="36" cy="18" r="1.6" fill="#fff" opacity=".7"/><circle cx="50" cy="14" r="1.6" fill="#fff" opacity=".7"/><circle cx="63" cy="19" r="1.6" fill="#fff" opacity=".7"/>';   // scrub cap
      case 19: return P('M22 44 C20 12 80 12 78 44 L72 38 Q50 30 28 38Z', '#1d1d28') + P('M26 26 L29 2 L41 17Z', '#1d1d28') + P('M74 26 L71 2 L59 17Z', '#1d1d28') + P('M26 38 L47 35 L48 40 L28 44Z', '#12121a') + P('M74 38 L53 35 L52 40 L72 44Z', '#12121a') + L('M32 20 Q40 14 50 14', 1.4, '#5b3fa8', 'opacity=".8"');   // shadow cowl
      case 20: return P('M20 30 C10 30 8 24 14 22 L86 22 C92 24 90 30 80 30 Q50 38 20 30Z', '#5b3fa8') + P('M28 28 C36 20 44 8 58 2 C64 12 68 20 72 28Q50 34 28 28Z', '#6c4bc2') + L('M30 27 Q50 33 70 27', 2.6, '#f5c542') + '<path d="M50 14 l1.6 3.4 3.6.4 -2.7 2.4.8 3.6 -3.3-1.9 -3.3 1.9.8-3.6 -2.7-2.4 3.6-.4z" fill="#f5c542"/>';   // wizard hat
      case 21: return `<circle cx="50" cy="43" r="37" fill="#bfe6ff" fill-opacity=".16" stroke="#e9f4ff" stroke-width="3"/><circle cx="50" cy="43" r="37" fill="none" stroke="${INK}" stroke-width="1.2" opacity=".5"/>` + L('M24 24 Q32 12 46 9', 3, '#fff', 'opacity=".75"') + P('M28 74 Q50 84 72 74 L72 82 Q50 92 28 82Z', '#c9d3e2');   // astronaut helmet
      case 22: return P('M23 38 C22 10 78 10 77 38Z', '#9a8a78') + P('M21 33 H79 V40 H21Z', '#6b5a48') + P('M23 30 C8 28 5 12 12 5 C14 17 22 22 27 24Z', '#f4efe2') + P('M77 30 C92 28 95 12 88 5 C86 17 78 22 73 24Z', '#f4efe2') + '<circle cx="36" cy="36.5" r="1.4" fill="#d8c9a8"/><circle cx="50" cy="36.5" r="1.4" fill="#d8c9a8"/><circle cx="64" cy="36.5" r="1.4" fill="#d8c9a8"/>';   // viking helmet
      case 23: return P('M20 80 C4 76 -2 52 6 36 C9 46 15 52 24 58 C16 62 16 72 24 76Z', '#fff') + P('M80 80 C96 76 102 52 94 36 C91 46 85 52 76 58 C84 62 84 72 76 76Z', '#fff') + L('M8 44 C12 54 18 58 22 62 M5 56 C10 64 15 68 20 70 M92 44 C88 54 82 58 78 62 M95 56 C90 64 85 68 80 70', 1, '#c9d3e2');   // angel wings
      case 24: return P('M30 24 C23 12 27 2 36 6 C34 12 36 18 40 21Z', '#d9423a') + P('M70 24 C77 12 73 2 64 6 C66 12 64 18 60 21Z', '#d9423a');   // devil horns
      case 25: return P('M14 31 C18 6 82 6 86 31 Q50 21 14 31Z', '#1d1d28') + P('M24 27 Q50 18 76 27 L71 21 Q50 13 29 21Z', '#2c2c3a') + '<circle cx="50" cy="17" r="3.6" fill="#fff" stroke="' + INK + '" stroke-width="1"/><circle cx="48.8" cy="16.4" r=".7" fill="' + INK + '"/><circle cx="51.2" cy="16.4" r=".7" fill="' + INK + '"/>' + L('M44 22 L56 26 M56 22 L44 26', 1.6, '#fff');   // pirate hat
      case 26: return P('M6 31 C14 41 30 35 50 35 C70 35 86 41 94 31 C86 28 74 26 50 26 C26 26 14 28 6 31Z', '#8a5a2b') + P('M30 28 C28 6 72 6 70 28Z', '#9c6a35') + L('M31 24 H69', 3, '#d9423a');   // cowboy hat
      case 27: return P('M24 31 C26 10 54 3 80 22 L72 33Z', '#d9423a') + P('M19 29 Q50 38 81 29 L81 37 Q50 46 19 37Z', '#fff') + '<circle cx="80" cy="21" r="5" fill="#fff" stroke="' + INK + '" stroke-width="1.2"/>';   // santa hat
      case 28: return P('M22 34 Q50 27 78 34 L78 40 Q50 33 22 40Z', col) + L('M24 37 Q50 30 76 37', 1.6, '#fff', 'opacity=".85"');   // sweatband
      case 29: return L('M23 36 L55 42 M70 42 L78 36', 1.8, '#1a1a22') + '<ellipse cx="62" cy="47" rx="8.5" ry="9.5" fill="#1a1a22" stroke="' + INK + '" stroke-width="1.4"/><path d="M57 43 Q62 40 67 43" stroke="#4a4a58" stroke-width="1.2" fill="none"/>';   // eyepatch
      case 30: return '<circle cx="62" cy="47" r="10.5" fill="#bfe6ff" fill-opacity=".25" stroke="#d4a017" stroke-width="2.2"/>' + L('M71 54 C76 64 70 74 74 84', 1.2, '#d4a017') + L('M56 40 Q58 38 61 38', 1.4, '#fff');   // monocle
      case 31: return [38, 62].map((cx) => '<path d="M' + cx + ' 55 C' + (cx - 13) + ' 46 ' + (cx - 7) + ' 36 ' + cx + ' 43 C' + (cx + 7) + ' 36 ' + (cx + 13) + ' 46 ' + cx + ' 55Z" fill="#ff7eb6" fill-opacity=".4" stroke="' + INK + '" stroke-width="1.8" stroke-linejoin="round"/>').join('') + L('M50 44 Q50 43 50 44 M47.5 44.5 Q50 42.5 52.5 44.5 M25 44 L21 42 M75 44 L79 42', 1.8);   // heart glasses
      case 32: return L('M31 22 L26 6 M28 13 L19 9 M28.5 15 L35 7', 2.8, '#8a5a2b') + L('M69 22 L74 6 M72 13 L81 9 M71.5 15 L65 7', 2.8, '#8a5a2b') + L('M31 22 L26 6 M69 22 L74 6', 1, '#c08850');   // reindeer antlers
      case 33: return P('M30 22 L34 12 L42 18 L50 7 L58 18 L66 12 L70 22Z', '#e8edf7') + P('M30 22 H70 V25 H30Z', '#c9d3e2') + '<path d="M50 10 l2.4 4 -2.4 4 -2.4-4z" fill="#ff7eb6" stroke="' + INK + '" stroke-width=".8"/><circle cx="34" cy="15.5" r="1.4" fill="#7fdcc0"/><circle cx="66" cy="15.5" r="1.4" fill="#7fdcc0"/>';   // tiara
      case 34: return P('M30 26 C16 24 17 5 32 8 C34 -1 66 -1 68 8 C83 5 84 24 70 26Z', '#fff') + P('M30 24 H70 V33 H30Z', '#f1f4fa');   // chef hat
      case 35: return P('M38 29 L58 3 L74 27Z', col) + L('M43 23 L66 19 M48 16 L62 13', 2, '#fff', 'opacity=".8"') + '<circle cx="58" cy="3.4" r="3.2" fill="#ffd54a" stroke="' + INK + '" stroke-width="1"/>' + L('M36 29 Q56 33 76 28', 1.6, dk);   // party hat
      case 36: return L('M27 42 C19 26 30 12 46 9', 2.6, '#4fae6b') + L('M73 42 C81 26 70 12 54 9', 2.6, '#4fae6b') + [[24, 34], [26, 26], [31, 18], [39, 12], [76, 34], [74, 26], [69, 18], [61, 12]].map((c, k) => '<ellipse cx="' + c[0] + '" cy="' + c[1] + '" rx="3.6" ry="1.9" transform="rotate(' + (k < 4 ? 55 - k * 20 : -55 + (k - 4) * 20) + ' ' + c[0] + ' ' + c[1] + ')" fill="#6fcf7f" stroke="' + INK + '" stroke-width=".8"/>').join('') + '<circle cx="50" cy="9" r="2.4" fill="#f5c542" stroke="' + INK + '" stroke-width=".9"/>';   // laurel wreath
      default: return '';
    }
  }

  /* ---- companion pets: separate little illustrations (60x60) shown beside the avatar, not clipped by its circle ---- */
  const PK = '#ffb3c6';
  const pw = (d, fill, sw) => '<path d="' + d + '" fill="' + fill + '" stroke="' + INK + '" stroke-width="' + (sw || 1.4) + '" stroke-linejoin="round" stroke-linecap="round"/>';
  const pc = (cx, cy, rx, ry, fill) => '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '" stroke="' + INK + '" stroke-width="1.4"/>';
  const tail = (d, col, w) => '<path d="' + d + '" fill="none" stroke="' + INK + '" stroke-width="' + (w + 2.4) + '" stroke-linecap="round"/><path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round"/>';
  const eyes = (y, dx, r) => '<circle cx="' + (30 - dx) + '" cy="' + y + '" r="' + (r || 2.6) + '" fill="' + INK + '"/><circle cx="' + (30 + dx) + '" cy="' + y + '" r="' + (r || 2.6) + '" fill="' + INK + '"/><circle cx="' + (29.2 - dx) + '" cy="' + (y - 0.9) + '" r=".9" fill="#fff"/><circle cx="' + (29.2 + dx) + '" cy="' + (y - 0.9) + '" r=".9" fill="#fff"/>';
  const smile = (y) => '<path d="M30 ' + y + ' V' + (y + 1.6) + ' M30 ' + (y + 1.6) + ' Q27 ' + (y + 4) + ' 25 ' + (y + 2) + ' M30 ' + (y + 1.6) + ' Q33 ' + (y + 4) + ' 35 ' + (y + 2) + '" fill="none" stroke="' + INK + '" stroke-width="1.2" stroke-linecap="round"/>';
  const cheeks = (y) => '<ellipse cx="20" cy="' + y + '" rx="2.6" ry="1.6" fill="#ff7f9f" opacity=".45"/><ellipse cx="40" cy="' + y + '" rx="2.6" ry="1.6" fill="#ff7f9f" opacity=".45"/>';
  const PETS = [null,
    () => tail('M42 52 C58 50 58 34 49 31', '#f2a65a', 4.6) + pc(30, 47, 13, 11, '#f2a65a') + pw('M17 24 L18 8 L29 17Z', '#f2a65a') + pw('M43 24 L42 8 L31 17Z', '#f2a65a') + pw('M19.6 20 L20 12 L25.6 17Z', PK, 0.6) + pw('M40.4 20 L40 12 L34.4 17Z', PK, 0.6) + pc(30, 30, 15, 13, '#f2a65a') + '<path d="M30 17.5 V21.5 M24 18.5 L25 22 M36 18.5 L35 22" stroke="#c97b34" stroke-width="1.6" stroke-linecap="round"/>' + eyes(30, 8) + pw('M28 34 H32 L30 36.4Z', '#e0607a', 0.8) + smile(36.4) + '<path d="M20 35 H11 M20 37 L12 40 M40 35 H49 M40 37 L48 40" stroke="' + INK + '" stroke-width=".9" stroke-linecap="round"/>' + cheeks(35),
    () => tail('M42 52 C51 50 53 44 51 39', '#d99b5b', 4.4) + pc(30, 47, 13, 11, '#d99b5b') + pc(30, 49, 8, 8, '#fffaf0') + pw('M16 22 C6 24 6 42 16 42 C20 38 20 28 19 22Z', '#a8683a') + pw('M44 22 C54 24 54 42 44 42 C40 38 40 28 41 22Z', '#a8683a') + pc(30, 30, 15, 13, '#d99b5b') + pw('M26 18 Q30 14 34 18 L33 32 Q30 36 27 32Z', '#fffaf0', 0.8) + eyes(29, 8) + pc(30, 34, 3.4, 2.4, '#2a2140') + smile(36) + pc(30, 41.4, 2.4, 2.8, '#ff8aa0') + cheeks(35),
    () => pc(30, 47, 13, 11, '#ffe066') + pw('M16 44 C10 46 12 54 20 52Z', '#ffd23f') + pw('M44 44 C50 46 48 54 40 52Z', '#ffd23f') + pc(30, 29, 14, 13, '#ffe066') + '<path d="M28 16 Q30 11 33 15" fill="none" stroke="' + INK + '" stroke-width="1.3" stroke-linecap="round"/>' + eyes(27, 8) + pw('M23 33 Q30 40 37 33 Q30 30 23 33Z', '#ff9f43', 1.2) + cheeks(33) + pw('M22 58 L26 54 L30 58Z M30 58 L34 54 L38 58Z', '#ff9f43', 0.9),
    () => pc(44, 52, 4.4, 4.4, '#fff') + pc(30, 47, 13, 11, '#fff') + pc(22, 13, 5, 12.5, '#fff') + pc(38, 13, 5, 12.5, '#fff') + pc(22, 14, 2.4, 8, PK) + pc(38, 14, 2.4, 8, PK) + pc(30, 32, 14, 12, '#fff') + eyes(31, 8) + pw('M28.6 35 H31.4 L30 36.6Z', '#e0607a', 0.7) + '<path d="M30 36.6 V38 M30 38 Q27.4 40 25.8 38.4 M30 38 Q32.6 40 34.2 38.4" fill="none" stroke="' + INK + '" stroke-width="1.1" stroke-linecap="round"/>' + cheeks(35),
    () => pc(30, 47, 13, 11, '#2b2b36') + pw('M14 22 C3 26 3 47 16 47 C21 41 20 29 18 22Z', '#1f1f29') + pw('M46 22 C57 26 57 47 44 47 C39 41 40 29 42 22Z', '#1f1f29') + pc(30, 30, 16, 14, '#2b2b36') + pc(30, 35, 9, 6.5, '#3a3a48') + '<circle cx="22" cy="29" r="3.2" fill="#0d0d12"/><circle cx="38" cy="29" r="3.2" fill="#0d0d12"/><circle cx="21" cy="27.8" r="1.1" fill="#fff"/><circle cx="37" cy="27.8" r="1.1" fill="#fff"/>' + pc(30, 33.4, 3.4, 2.4, '#0d0d12') + smile(36) + pc(30, 41, 2.4, 2.8, '#ff8aa0') + pw('M30 17 L24 10 L24 18Z', '#e0556b', 1) + pw('M30 17 L36 10 L36 18Z', '#e0556b', 1) + '<circle cx="30" cy="17" r="2" fill="#c43a52" stroke="' + INK + '" stroke-width=".9"/>',
    () => pw('M14 34 C8 40 10 49 14 49Z', '#2b3a55') + pw('M46 34 C52 40 50 49 46 49Z', '#2b3a55') + '<ellipse cx="30" cy="36" rx="16" ry="21" fill="#2b3a55" stroke="' + INK + '" stroke-width="1.4"/><ellipse cx="30" cy="41" rx="10.5" ry="15" fill="#fff" stroke="' + INK + '" stroke-width="1"/>' + pw('M22 57 L26 54 L30 58Z M30 58 L34 54 L38 57Z', '#ff9f43', 1) + '<circle cx="24" cy="26" r="3.6" fill="#fff"/><circle cx="36" cy="26" r="3.6" fill="#fff"/><circle cx="24.6" cy="26.4" r="1.9" fill="' + INK + '"/><circle cx="35.4" cy="26.4" r="1.9" fill="' + INK + '"/>' + pw('M26.6 31 H33.4 L30 36Z', '#ff9f43', 1) + cheeks(31),
    () => pc(20, 57, 5, 3.6, '#1d1d28') + pc(40, 57, 5, 3.6, '#1d1d28') + pc(30, 47, 13, 11, '#fff') + pc(18, 46, 4, 6, '#1d1d28') + pc(42, 46, 4, 6, '#1d1d28') + pc(17.5, 18, 5.6, 5.6, '#1d1d28') + pc(42.5, 18, 5.6, 5.6, '#1d1d28') + pc(30, 30, 15, 13, '#fff') + '<ellipse cx="22.5" cy="30" rx="4.2" ry="5.4" transform="rotate(20 22.5 30)" fill="#1d1d28"/><ellipse cx="37.5" cy="30" rx="4.2" ry="5.4" transform="rotate(-20 37.5 30)" fill="#1d1d28"/><circle cx="22.5" cy="29.6" r="1.5" fill="#fff"/><circle cx="37.5" cy="29.6" r="1.5" fill="#fff"/>' + pc(30, 35, 2.8, 2, '#1d1d28') + '<path d="M30 37 V38.2 M30 38.2 Q27.6 40.4 26 38.8 M30 38.2 Q32.4 40.4 34 38.8" fill="none" stroke="' + INK + '" stroke-width="1.1" stroke-linecap="round"/>',
    () => tail('M42 52 C60 52 60 34 50 32', '#ee8a3a', 8) + pc(30, 47, 13, 11, '#ee8a3a') + pc(30, 50, 7, 7, '#fff') + pw('M15 26 L15 7 L28 18Z', '#ee8a3a') + pw('M45 26 L45 7 L32 18Z', '#ee8a3a') + pw('M17 20 L16.6 11 L23 17Z', '#3a2a2a', 0.6) + pw('M43 20 L43.4 11 L37 17Z', '#3a2a2a', 0.6) + pw('M14 30 C14 20 22 17 30 17 C38 17 46 20 46 30 C46 38 38 44 30 44 C22 44 14 38 14 30Z', '#ee8a3a') + pw('M14 32 C20 40 25 39 30 44 C35 39 40 40 46 32 C41 37 34 37 30 35 C26 37 19 37 14 32Z', '#fff', 1) + eyes(29, 8) + pc(30, 37, 2.4, 1.8, '#1d1d28') + '<path d="M30 38.8 V40 M30 40 Q28 41.8 26.4 40.6 M30 40 Q32 41.8 33.6 40.6" fill="none" stroke="' + INK + '" stroke-width="1" stroke-linecap="round"/>',
    () => '<ellipse cx="30" cy="38" rx="16" ry="20" fill="#a0743c" stroke="' + INK + '" stroke-width="1.4"/><ellipse cx="30" cy="43" rx="10" ry="13" fill="#e8cf9c" stroke="' + INK + '" stroke-width="1"/>' + L('M24 40 q3 3 6 0 q3 3 6 0 M24 46 q3 3 6 0 q3 3 6 0', 1, '#a0743c') + pw('M17 21 L15 8 L26 16Z', '#a0743c') + pw('M43 21 L45 8 L34 16Z', '#a0743c') + pc(23, 28, 7.2, 7.2, '#fff') + pc(37, 28, 7.2, 7.2, '#fff') + '<circle cx="23" cy="28" r="3.2" fill="' + INK + '"/><circle cx="37" cy="28" r="3.2" fill="' + INK + '"/><circle cx="22" cy="26.8" r="1.1" fill="#fff"/><circle cx="36" cy="26.8" r="1.1" fill="#fff"/>' + pw('M27.6 31.5 H32.4 L30 37Z', '#f2a23a', 1) + pw('M22 57 L25 54 L28 58Z M32 58 L35 54 L38 57Z', '#f2a23a', 0.9),
    () => pw('M42 52 C54 54 58 48 52 42 C50 48 46 50 42 48Z', '#ffb3c6') + pc(30, 47, 13, 10, '#ffb3c6') + '<path d="M16 26 L5 21 M15.5 30 L3 30 M16 34 L5 39 M44 26 L55 21 M44.5 30 L57 30 M44 34 L55 39" stroke="' + INK + '" stroke-width="4.4" stroke-linecap="round"/><path d="M16 26 L5 21 M15.5 30 L3 30 M16 34 L5 39 M44 26 L55 21 M44.5 30 L57 30 M44 34 L55 39" stroke="#ff6f91" stroke-width="2.4" stroke-linecap="round"/>' + pc(30, 31, 16, 12, '#ffb3c6') + '<circle cx="22" cy="30" r="2.4" fill="' + INK + '"/><circle cx="38" cy="30" r="2.4" fill="' + INK + '"/><circle cx="21.2" cy="29.1" r=".8" fill="#fff"/><circle cx="37.2" cy="29.1" r=".8" fill="#fff"/><path d="M25 36 Q30 41 35 36" fill="none" stroke="' + INK + '" stroke-width="1.3" stroke-linecap="round"/>' + cheeks(34),
    () => pw('M12 54 L12 28 C12 14 48 14 48 28 L48 54 L42 49 L36 55 L30 49 L24 55 L18 49Z', '#f4f8ff') + '<ellipse cx="23" cy="30" rx="3" ry="4" fill="' + INK + '"/><ellipse cx="37" cy="30" rx="3" ry="4" fill="' + INK + '"/><circle cx="22" cy="28.4" r="1" fill="#fff"/><circle cx="36" cy="28.4" r="1" fill="#fff"/><ellipse cx="30" cy="38" rx="2.6" ry="3.2" fill="' + INK + '"/>' + cheeks(35) + pw('M12 40 C6 42 6 48 11 48Z M48 40 C54 42 54 48 49 48Z', '#f4f8ff', 1),
    () => '<path d="M30 14 V6" stroke="' + INK + '" stroke-width="2.4" stroke-linecap="round"/><circle cx="30" cy="5" r="3" fill="#ff5c7a" stroke="' + INK + '" stroke-width="1.2"/>' + pw('M18 18 H42 Q46 18 46 22 V36 Q46 40 42 40 H18 Q14 40 14 36 V22 Q14 18 18 18Z', '#c9d3e2') + pw('M17 42 H43 V57 H17Z', '#aab4c8') + pw('M18 23 H42 V35 H18Z', '#26324a', 1) + '<circle cx="24" cy="29" r="3" fill="#6ff0ff"/><circle cx="36" cy="29" r="3" fill="#6ff0ff"/><circle cx="24.8" cy="28.2" r=".9" fill="#fff"/><circle cx="36.8" cy="28.2" r=".9" fill="#fff"/><circle cx="11" cy="29" r="2.4" fill="#8a94a8" stroke="' + INK + '" stroke-width="1"/><circle cx="49" cy="29" r="2.4" fill="#8a94a8" stroke="' + INK + '" stroke-width="1"/><rect x="22" y="46" width="16" height="6" rx="2" fill="#26324a"/><circle cx="26" cy="49" r="1.4" fill="#ff5c7a"/><circle cx="31" cy="49" r="1.4" fill="#ffd54a"/><circle cx="36" cy="49" r="1.4" fill="#5fd0a1"/>',
    () => tail('M42 52 C58 54 60 44 54 38', '#5fc77a', 5) + pw('M16 42 C4 36 3 22 10 19 C12 30 16 34 21 37Z', '#3aa05a') + pw('M44 42 C56 36 57 22 50 19 C48 30 44 34 39 37Z', '#3aa05a') + pc(30, 46, 13, 11, '#5fc77a') + pc(30, 48, 8, 8, '#c9f0cf') + pw('M20 21 L17 8 L26 17Z', '#f5c542', 1) + pw('M40 21 L43 8 L34 17Z', '#f5c542', 1) + pc(30, 30, 14, 12, '#5fc77a') + pc(30, 36, 7.4, 4.8, '#8fdc9f') + '<circle cx="27.6" cy="36" r=".9" fill="' + INK + '"/><circle cx="32.4" cy="36" r=".9" fill="' + INK + '"/><ellipse cx="23" cy="28" rx="3.2" ry="3.8" fill="#ffe44d" stroke="' + INK + '" stroke-width="1"/><ellipse cx="37" cy="28" rx="3.2" ry="3.8" fill="#ffe44d" stroke="' + INK + '" stroke-width="1"/><ellipse cx="23" cy="28" rx="1" ry="2.6" fill="' + INK + '"/><ellipse cx="37" cy="28" rx="1" ry="2.6" fill="' + INK + '"/>',
    () => '<path d="M17 24 C6 26 7 40 14 44" fill="none" stroke="' + INK + '" stroke-width="6.4" stroke-linecap="round"/><path d="M17 24 C6 26 7 40 14 44" fill="none" stroke="#ff7eb6" stroke-width="4" stroke-linecap="round"/><path d="M16 17 C8 17 6 28 10 31" fill="none" stroke="#7fdcc0" stroke-width="3.2" stroke-linecap="round"/><path d="M19 15 C13 12 8 16 8 20" fill="none" stroke="#b8a5e8" stroke-width="3" stroke-linecap="round"/>' + pc(30, 47, 13, 11, '#fff') + pw('M22 20 L22 12 L28 18Z', '#fff', 1) + pw('M38 20 L38 12 L32 18Z', '#fff', 1) + pc(30, 31, 13, 12, '#fff') + pw('M30 3 L26 18 L34 18Z', '#f5c542', 1.1) + L('M28.6 12 L32 10 M27.6 16 L33 13.4', 1, '#b8860b') + '<path d="M22 28 q2 -3 4 0 M34 28 q2 -3 4 0" stroke="' + INK + '" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="24" cy="30.6" r="2.2" fill="' + INK + '"/><circle cx="36" cy="30.6" r="2.2" fill="' + INK + '"/><circle cx="23.4" cy="29.8" r=".8" fill="#fff"/><circle cx="35.4" cy="29.8" r=".8" fill="#fff"/>' + pw('M28.6 36 H31.4 L30 37.4Z', '#e0607a', 0.7) + cheeks(35),
  ];
  const petSvg = (i) => { const f = PETS[Number(i)]; return f ? '<svg class="pet-svg" viewBox="-3 -3 66 66" role="img" aria-label="' + (NAMES.pet[i] || 'Pet') + '" xmlns="http://www.w3.org/2000/svg">' + f() + '</svg>' : ''; };

  // expr (optional) overrides the saved expression so the game can react (excited / confused / sad ...)
  function svg(config, opts) {
    opts = opts || {}; const cfg = normalize(config), kiss = opts.expr === 'kiss', ex = kiss ? 0 : opts.expr === undefined ? cfg.expr : clamp(typeof opts.expr === 'string' ? EXPR[opts.expr] : opts.expr, 7);
    const skin = SKIN[cfg.skin], sk2 = shade(skin, -0.18), hair = HAIR_COLORS[cfg.hairColor], hi = shade(hair, 0.28), cc = CLOTH_COLORS[cfg.clothesColor], ac = CLOTH_COLORS[cfg.accColor];
    const hairP = (d) => P(d, hair), frontShine = L('M30 24 C34 18 42 15 50 15', 2.2, hi, 'opacity=".7"');
    let out = `<svg class="avatar-svg" viewBox="0 0 100 100" role="img" aria-label="${opts.label ? String(opts.label).replace(/[<>&"]/g, '') : 'Avatar'}" xmlns="http://www.w3.org/2000/svg">`;
    out += BACK[cfg.hair].split('M').filter(Boolean).map((p) => hairP('M' + p)).join('');
    out += clothing(cfg.clothes, skin, cc, sk2);
    out += `<ellipse cx="23.5" cy="47" rx="3.6" ry="5" fill="${skin}" stroke="${INK}" stroke-width="1.6"/><ellipse cx="76.5" cy="47" rx="3.6" ry="5" fill="${skin}" stroke="${INK}" stroke-width="1.6"/>`;
    out += P('M23 42 C23 20 36 14 50 14 C64 14 77 20 77 42 C77 58 66 70 50 70 C34 70 23 58 23 42Z', skin);
    out += `<path d="M24 38 C28 31 40 35 50 35 C60 35 72 31 76 38 L76 26 L24 26Z" fill="${sk2}" opacity=".35"/>` + `<path d="M30 66 C38 72 62 72 70 66 C62 75 38 75 30 66Z" fill="${sk2}" opacity=".35"/>`;
    out += face(cfg, ex, skin, kiss);
    out += (EXTRA[cfg.hair] ? hairP(EXTRA[cfg.hair]) : '') + hairP(CAP) + (BANGS[cfg.bangs] ? hairP(BANGS[cfg.bangs]) : '') + frontShine;
    out += accessory(cfg.acc, ac, hair);
    return out + '</svg>';
  }

  const api = { petSvg, sanitize, SCHEMA, DEFAULT, NAMES, EXPR, SKIN, HAIR_COLORS, EYE_COLORS, CLOTH_COLORS, normalize, valid, random, fromName, svg, rng, hashSeed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Avatar = api;
})(typeof self !== 'undefined' ? self : this);
