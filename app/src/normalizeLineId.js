// Normalize Greek characters to Latin equivalents for URL-safe line IDs.
// Equivalent to functions/_lib/normalize.js (the two builds cannot import
// each other); test/normalize.test.js asserts both produce identical output.

export const GREEK_TO_LATIN = {
  'α':'a','β':'b','γ':'g','δ':'d','ε':'e','ζ':'z','η':'h','ι':'i',
  'κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','ο':'o','π':'p','ρ':'r',
  'σ':'s','ς':'s','τ':'t','υ':'y','φ':'f','χ':'x','ψ':'ps','ω':'o',
  'ά':'a','έ':'e','ή':'h','ί':'i','ό':'o','ύ':'y','ώ':'o',
  'ϊ':'i','ϋ':'y',
};

export function normalizeLineId(id) {
  if (!id) return id;
  return id.toLowerCase().split('').map((c) => GREEK_TO_LATIN[c] || c).join('');
}
