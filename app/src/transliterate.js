const ACCENT_MAP = {
  ά: 'α', έ: 'ε', ή: 'η', ί: 'ι', ό: 'ο', ύ: 'υ', ώ: 'ω',
  Ά: 'Α', Έ: 'Ε', Ή: 'Η', Ί: 'Ι', Ό: 'Ο', Ύ: 'Υ', Ώ: 'Ω',
  ϊ: 'ι', ϋ: 'υ', Ϊ: 'Ι', Ϋ: 'Υ',
};

const CHAR_MAP = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z',
  η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm',
  ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's',
  ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
  Α: 'A', Β: 'V', Γ: 'G', Δ: 'D', Ε: 'E', Ζ: 'Z',
  Η: 'I', Θ: 'TH', Ι: 'I', Κ: 'K', Λ: 'L', Μ: 'M',
  Ν: 'N', Ξ: 'X', Ο: 'O', Π: 'P', Ρ: 'R', Σ: 'S',
  Τ: 'T', Υ: 'Y', Φ: 'F', Χ: 'CH', Ψ: 'PS', Ω: 'O',
};

const DIGRAPH_MAP = {
  μπ: { start: 'b', rest: 'mp' },
  ντ: { start: 'd', rest: 'nt' },
  γκ: { start: 'g', rest: 'gk' },
  γγ: { start: 'ng', rest: 'ng' },
  τσ: { start: 'ts', rest: 'ts' },
  τζ: { start: 'tz', rest: 'tz' },
  αυ: { start: 'av', voiceless: 'af', rest: 'av' },
  ευ: { start: 'ev', voiceless: 'ef', rest: 'ev' },
  ου: { start: 'ou', rest: 'ou' },
};

const VOICELESS = new Set(['θ', 'κ', 'ξ', 'π', 'σ', 'ς', 'τ', 'φ', 'χ', 'ψ']);

function stripAccent(ch) {
  return ACCENT_MAP[ch] || ch;
}

function isGreek(ch) {
  const code = ch.charCodeAt(0);
  return (code >= 0x0370 && code <= 0x03FF) || ch in ACCENT_MAP;
}

export function toLatin(text) {
  if (!text) return text;
  const stripped = Array.from(text).map(stripAccent).join('');

  let result = '';
  let i = 0;

  while (i < stripped.length) {
    const ch = stripped[i];
    if (!isGreek(ch)) {
      result += ch;
      i++;
      continue;
    }

    let matched = false;
    if (i + 1 < stripped.length) {
      const pair = stripped.substring(i, i + 2).toLowerCase();
      const origCase = stripped[i] === stripped[i].toUpperCase();
      const dg = DIGRAPH_MAP[pair];
      if (dg) {
        let val;
        if (pair === 'αυ' || pair === 'ευ') {
          const nextCh = i + 2 < stripped.length ? stripped[i + 2] : '';
          val = VOICELESS.has(nextCh.toLowerCase()) ? dg.voiceless : dg.rest;
        } else if (i === 0 || /\s/.test(stripped[i - 1])) {
          val = dg.start;
        } else {
          val = dg.rest;
        }
        result += origCase ? val.toUpperCase() : val;
        i += 2;
        matched = true;
      }
    }

    if (!matched) {
      const mapped = CHAR_MAP[ch];
      result += mapped || ch;
      i++;
    }
  }

  return result;
}
