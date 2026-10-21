import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLineText, GREEK_TO_LATIN as serverMap } from '../functions/_lib/normalize.js';
import { normalizeLineId, GREEK_TO_LATIN as clientMap } from '../app/src/normalizeLineId.js';

// The server (functions/_lib/normalize.js) and the client
// (app/src/normalizeLineId.js) keep separate copies because the two builds
// cannot import each other; these tests pin them together so they can't drift.

describe('normalization parity (server vs client)', () => {
  it('GREEK_TO_LATIN maps are identical', () => {
    assert.deepEqual(clientMap, serverMap);
  });

  const corpus = [
    'Χ95', 'X95', 'Β5', 'B5', 'Α7', 'A7', '021', '550', 'Ε14', 'E14',
    'ΠΕΙΡΑΙΑΣ - Ν. ΣΜΥΡΝΗ', 'Άγιος Νικόλαος', 'ΟΜΟΝΟΙΑ', 'ΨΥΧΙΚΟ',
    'ϊϋ', 'ΑΫΛΗ', 'ΣΥΝΤΑΓΜΑ - ΑΕΡΟΛ. ΑΘΗΝΩΝ (EXPRESS)',
    'ΓΡ. ΛΑΜΠΡΑΚΗ', 'Ν. ΦΑΛΗΡΟΥ', 'Kalamata', '123 ABC', 'στάση 5',
  ];

  for (const sample of corpus) {
    it(`normalizes ${JSON.stringify(sample)} identically`, () => {
      assert.equal(normalizeLineId(sample), normalizeLineText(sample));
    });
  }
});

describe('normalizeLineId', () => {
  it('passes falsy values through untouched', () => {
    assert.equal(normalizeLineId(null), null);
    assert.equal(normalizeLineId(undefined), undefined);
    assert.equal(normalizeLineId(''), '');
  });

  it('normalizes Greek lookalikes to Latin', () => {
    assert.equal(normalizeLineId('Χ95'), 'x95');
    assert.equal(normalizeLineId('Β5'), 'b5');
  });
});
