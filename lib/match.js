'use strict';
// Guess matching: forgiving about case, punctuation, accents, leading articles, simple plurals and small typos.
// Short words must match exactly so near-neighbours like sad/mad or tense/dense never count as the same word.
const norm = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/^(a|an|the) /, '');
const stem = (w) => (w.length > 3 && /ies$/.test(w) ? w.slice(0, -3) + 'y' : w.length > 3 && /(ss|us|is)$/.test(w) ? w : w.length > 3 && /(ches|shes|xes|zes|ses)$/.test(w) ? w.slice(0, -2) : w.length > 3 && /s$/.test(w) ? w.slice(0, -1) : w);
const key = (s) => norm(s).split(' ').map(stem).join(' ');
function dist(a, b) {                                   // Damerau-Levenshtein (adjacent swaps cost 1)
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let p2 = null, p1 = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], p2[j - 2] + 1);
    }
    p2 = p1; p1 = cur;
  }
  return p1[n];
}
const allowed = (len) => (len >= 10 ? 2 : len >= 6 ? 1 : 0);          // typos tolerated for a target of this length
// -> 'correct' | 'close' | 'wrong'. `targets` = the word plus any accepted aliases.
function judge(guess, targets) {
  const g = key(guess); if (!g) return 'wrong';
  const gn = norm(guess); let close = false;
  for (const t of targets) {
    const k = key(t), tn = norm(t); if (!k) continue;
    if (g === k) return 'correct';
    if ((' ' + gn + ' ').includes(' ' + tn + ' ') || (' ' + g + ' ').includes(' ' + k + ' ')) return 'correct';   // "i think it's joy"
    if (g.replace(/ /g, '') === k.replace(/ /g, '')) return 'correct';  // "roadtrip" vs "road trip"
    const d = dist(g, k), tol = allowed(k.length);
    if (d <= tol) return 'correct';
    if (d <= tol + 1 && k.length >= 5) close = true;
  }
  return close ? 'close' : 'wrong';
}
const mask = (w) => String(w).split('').map((c) => (/[A-Za-z0-9]/.test(c) ? '_' : c === ' ' ? ' ' : c)).join('');
module.exports = { norm, judge, mask, dist };
