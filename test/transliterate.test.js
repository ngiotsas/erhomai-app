import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toLatin } from '../app/src/transliterate.js';

describe('toLatin', () => {
  it('transliterates common Greek abbreviations', () => {
    assert.equal(toLatin('ΠΛ. ΟΜΟΝΟΙΑΣ'), 'PL. OMONOIAS');
    assert.equal(toLatin('ΓΡ.ΛΑΜΠΡΑΚΗ'), 'GR.LAMPRAKI');
    assert.equal(toLatin('Ν.ΦΑΛΗΡΟΥ'), 'N.FALIROU');
    assert.equal(toLatin('ΗΣΑΠ'), 'ISAP');
  });

  it('handles digraphs at word start', () => {
    assert.equal(toLatin('ΜΠΑΚΑΛΗΣ'), 'BAKALIS');
    assert.equal(toLatin('ΝΤΑΛΙΑΝΗ'), 'DALIANI');
    assert.equal(toLatin('ΓΚΑΖΙ'), 'GAZI');
    assert.equal(toLatin('Μπαχαρία'), 'Bacharia');
  });

  it('handles digraphs mid-word', () => {
    assert.equal(toLatin('ΛΑΜΠΡΑΚΗ'), 'LAMPRAKI');
    assert.equal(toLatin('ΟΜΠΡΕΛΑ'), 'OMPRELA');
  });

  it('preserves case: capitalised first letter only', () => {
    assert.equal(toLatin('Τσακάλωφ'), 'Tsakalof');
    assert.equal(toLatin('Αθήνα'), 'Athina');
    assert.equal(toLatin('Θεσσαλονίκη'), 'Thessaloniki');
  });

  it('uppercases digraph values when both letters are uppercase', () => {
    assert.equal(toLatin('ΑΓ.ΝΤΙΜΗΤΡΙΟΣ'), 'AG.DIMITRIOS');
    assert.equal(toLatin('ΜΠΑΚΑΛΗΣ'), 'BAKALIS');
  });

  it('handles αυ and ευ correctly before voiceless consonants', () => {
    assert.equal(toLatin('ΑΥΤΟΚΙΝΗΤΟ'), 'AFTOKINITO');
    assert.equal(toLatin('ΕΥΧΑΡΙΣΤΩ'), 'EFCHARISTO');
  });

  it('handles αυ and ευ before voiced consonants and vowels', () => {
    assert.equal(toLatin('ΕΥΑΓΓΕΛΙΣΜΟΣ'), 'EVANGELISMOS');
    assert.equal(toLatin('ΑΥΓΟ'), 'AVGO');
    assert.equal(toLatin('ΕΥΡΙΠΙΔΟΥ'), 'EVRIPIDOU');
  });

  it('handles ου correctly', () => {
    assert.equal(toLatin('ΟΥΡΑΝΟΣ'), 'OURANOS');
    assert.equal(toLatin('ΛΟΥΤΡΑΚΙ'), 'LOUTRAKI');
  });

  it('passes through non-Greek text unchanged', () => {
    assert.equal(toLatin('123 ABC'), '123 ABC');
    assert.equal(toLatin('Kalamata'), 'Kalamata');
  });

  it('handles mixed Greek and non-Greek', () => {
    assert.equal(toLatin('Στάση 5'), 'Stasi 5');
  });

  it('returns null/undefined as received', () => {
    assert.equal(toLatin(null), null);
    assert.equal(toLatin(undefined), undefined);
    assert.equal(toLatin(''), '');
  });
});
