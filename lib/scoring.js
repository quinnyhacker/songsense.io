'use strict';
// Scoring is pure so it can be unit tested. Guessers earn 100-500 by how much of the clock was left,
// scaled down if they needed more songs. The picker earns a share of every correct guess.
const SONG_FACTOR = [1, 0.7, 0.5];
const PICKER_SHARE = 0.25;
function guessPoints(totalMs, remainingMs, songCount) {
  const frac = Math.max(0, Math.min(1, remainingMs / totalMs));
  const f = SONG_FACTOR[Math.max(0, Math.min(2, songCount - 1))];
  return Math.round((100 + 400 * frac) * f);
}
const pickerPoints = (guessPts) => Math.round(guessPts * PICKER_SHARE);
module.exports = { guessPoints, pickerPoints, SONG_FACTOR, PICKER_SHARE };
