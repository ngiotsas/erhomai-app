// Normalize Latin↔Greek lookalike characters so "X95" matches "Χ95",
// "B5" matches "Β5", etc. Shared by every line-matching endpoint so the
// mapping cannot drift between them:
//   - functions/api/lines.js
//   - functions/api/lines/[lineId]/stops.js
//   - src/api.js (Express)
//
// The frontend keeps an equivalent copy in app/src/normalizeLineId.js
// (the two builds cannot import each other); test/normalize.test.js
// asserts both produce identical output.

export const GREEK_TO_LATIN = {
  'α':'a','β':'b','γ':'g','δ':'d','ε':'e','ζ':'z','η':'h','ι':'i',
  'κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','ο':'o','π':'p','ρ':'r',
  'σ':'s','ς':'s','τ':'t','υ':'y','φ':'f','χ':'x','ψ':'ps','ω':'o',
  'ά':'a','έ':'e','ή':'h','ί':'i','ό':'o','ύ':'y','ώ':'o',
  'ϊ':'i','ϋ':'y',
};

export function normalizeLineText(s) {
  return s.toLowerCase().split('').map((c) => GREEK_TO_LATIN[c] || c).join('');
}
