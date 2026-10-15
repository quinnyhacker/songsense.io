'use strict';
// Song Sense avatars: cute anime-style heads and shoulders assembled from independent SVG layers on a 100x100 grid.
// Layer order (back to front): back hair, clothing, neck, head + ears, skin shading, face (eyes, brows, mouth, blush,
// freckles, marks), front hair (cap + bangs + extras), accessories.
// An avatar is a small structured config of option indexes, e.g. { skin:2, hair:3, ... }, so it can be saved,
// sent to the server (which validates it with the same SCHEMA) and recreated identically everywhere.
(function (root) {
  const INK = '#2a2140';
  const SKIN = ['#fde3cf', '#f8cfb0', '#efb98f', '#d9a077', '#b9744a', '#8d5530', '#6a3d24', '#4b2a1a'];
  const HAIR_COLORS = ['#2b2433', '#6b4430', '#a0623a', '#e8c36a', '#d9703a', '#f08bb5', '#b8a5e8', '#5fa3e8', '#7fdcc0', '#e6e9f2'];
  const EYE_COLORS = ['#6b3d22', '#3a8dcc', '#3aa26b', '#8b5fd0', '#d99a2b', '#7a8594', '#e0609a', '#2ab3b3'];
  const CLOTH_COLORS = ['#203c61', '#3a8dcc', '#70b8f0', '#b8a5e8', '#a9e5d0', '#d95353', '#f0c34a', '#f08bb5', '#f4faff', '#3a3a48'];
  const NAMES = {
    hair: ['Messy', 'Spiky', 'Fluffy bob', 'Medium', 'Medium wavy', 'Long', 'Long wavy', 'Twin tails'],
    bangs: ['No bangs', 'Straight', 'Side swept', 'Parted'],
    eyes: ['Round', 'Tall', 'Sleepy', 'Sparkly', 'Cat', 'Dots'],
    brows: ['Thin', 'Thick', 'Arched', 'Flat'],
    expr: ['Happy', 'Neutral', 'Excited', 'Confused', 'Sad', 'Angry', 'Smug'],
    blush: ['None', 'Light', 'Rosy'],
    freckles: ['None', 'Freckles'],
    mark: ['None', 'Whiskers', 'Star', 'Gem', 'Tear mark'],
    clothes: ['T-shirt', 'Hoodie', 'Collared', 'Sweater', 'Jacket', 'Scarf'],
    acc: ['None', 'Headphones', 'Earbuds', 'Glasses', 'Beanie', 'Hair clips', 'Bow', 'Music note'],
  };
  const EXPR = { happy: 0, neutral: 1, excited: 2, confused: 3, sad: 4, angry: 5, smug: 6 };
  // number of choices per field (the server validates against this exact table)
  const SCHEMA = { skin: SKIN.length, hair: NAMES.hair.length, hairColor: HAIR_COLORS.length, bangs: NAMES.bangs.length, eyes: NAMES.eyes.length, eyeColor: EYE_COLORS.length,
    brows: NAMES.brows.length, expr: NAMES.expr.length, blush: NAMES.blush.length, freckles: NAMES.freckles.length, mark: NAMES.mark.length, clothes: NAMES.clothes.length,
    clothesColor: CLOTH_COLORS.length, acc: NAMES.acc.length, accColor: CLOTH_COLORS.length };
  const DEFAULT = { skin: 1, hair: 3, hairColor: 1, bangs: 2, eyes: 0, eyeColor: 1, brows: 0, expr: 0, blush: 1, freckles: 0, mark: 0, clothes: 1, clothesColor: 1, acc: 0, accColor: 2 };

  const clamp = (v, n) => { v = Number(v); return Number.isInteger(v) && v >= 0 && v < n ? v : 0; };
  function normalize(cfg) { const out = {}; for (const k of Object.keys(SCHEMA)) out[k] = clamp(cfg && cfg[k] !== undefined ? cfg[k] : DEFAULT[k], SCHEMA[k]); return out; }
  // strict check for untrusted input: every field present, an integer, in range
  function valid(cfg) { return !!cfg && typeof cfg === 'object' && Object.keys(SCHEMA).every((k) => Number.isInteger(cfg[k]) && cfg[k] >= 0 && cfg[k] < SCHEMA[k]) && Object.keys(cfg).length === Object.keys(SCHEMA).length; }
  function hashSeed(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function random(rand) { rand = rand || Math.random; const out = {}; for (const k of Object.keys(SCHEMA)) out[k] = Math.floor(rand() * SCHEMA[k]); out.acc = rand() < 0.35 ? 0 : out.acc; out.freckles = rand() < 0.7 ? 0 : 1; out.mark = rand() < 0.6 ? 0 : out.mark; out.bangs = out.bangs; return out; }
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
  /* ---- layer: front hair = cap over the crown + optional extras (spikes, tufts) ---- */
  const CAP = 'M22 40 C20 20 34 10 50 10 C66 10 80 20 78 40 C72 28 62 23 50 23 C38 23 28 28 22 40Z';
  const EXTRA = [
    'M23 32 L27 16 L35 25 L42 11 L50 22 L58 11 L65 25 L73 16 L77 32 C70 24 60 20 50 20 C40 20 30 24 23 32Z',
    'M22 34 L15 14 L31 24 L36 3 L46 20 L54 1 L62 20 L72 5 L72 24 L87 13 L78 34 C70 24 60 20 50 20 C40 20 30 24 22 34Z',
  ];
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
      default: return '';
    }
  }

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

  const api = { SCHEMA, DEFAULT, NAMES, EXPR, SKIN, HAIR_COLORS, EYE_COLORS, CLOTH_COLORS, normalize, valid, random, fromName, svg, rng, hashSeed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Avatar = api;
})(typeof self !== 'undefined' ? self : this);
