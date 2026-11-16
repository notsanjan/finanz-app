// v33: Bankarbeitstage, geplante Betragsänderung, Verlauf
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../www/js/rechnen.js';

test('Bankarbeitstag: Wochenende und TARGET-Feiertage', () => {
  assert.equal(R.bankTag('2026-11-16'), '2026-11-16'); // Montag
  assert.equal(R.bankTag('2026-11-14'), '2026-11-16'); // Samstag
  assert.equal(R.bankTag('2026-11-15'), '2026-11-16'); // Sonntag
  assert.equal(R.bankTag('2026-12-25'), '2026-12-28'); // Weihnachten (Fr), 26. (Sa), So
  assert.equal(R.bankTag('2027-03-26'), '2027-03-30'); // Karfreitag bis Ostermontag
  assert.equal(R.bankTag('2027-01-01'), '2027-01-04'); // Neujahr (Fr)
  assert.equal(R.bankTag('2026-05-01'), '2026-05-04'); // 1. Mai (Fr)
  assert.equal(R.bankTag('2026-05-14'), '2026-05-14'); // Christi Himmelfahrt: SEPA bucht trotzdem
  assert.equal(R.bankTag('2026-10-03'), '2026-10-05'); // 3.10. ist Samstag
  assert.equal(R.bankTag('2026-01-06'), '2026-01-06'); // Hl. Drei Könige (BW): regional, wird gebucht
  const f = { tag: 31, wieOft: 'monatlich' };
  assert.deepEqual(R.abbuchungIm(f, '2026-10'), { faellig: '2026-10-31', gebucht: '2026-11-02' });
});

test('Erhöhung im Januar planen: November bleibt, Verlauf zeigt jetzt und geplant', () => {
  const f = { id: 'u', name: 'Unfallversicherung', betrag: 377.11, wieOft: 'jaehrlich', monat: 1, tag: 2, meinAnteil: 100 };
  R.betragAendern(f, { betrag: 395 }, '2027-01');
  assert.deepEqual(f.frueher, [{ bis: '2026-12', betrag: 377.11, meinAnteil: 100 }]);
  assert.equal(R.eigenerBetrag(f, '2026-11'), 377.11);
  assert.equal(R.eigenerBetrag(f, '2027-01'), 395);
  assert.deepEqual(R.geplanteAenderung(f, '2026-11'), { ab: '2027-01', betrag: 395 });
  assert.equal(R.geplanteAenderung(f, '2027-01'), null);
  const v = R.betragVerlauf(f, '2026-11');
  assert.equal(v.length, 2);
  assert.ok(v[0].jetzt && !v[0].geplant && v[0].bis === '2026-12');
  assert.ok(v[1].geplant && v[1].von === '2027-01' && v[1].betrag === 395);
  // dritte Stufe: schon früher geändert
  R.betragAendern(f, { betrag: 410 }, '2028-01');
  assert.equal(R.betragVerlauf(f, '2026-11').length, 3);
  // geplante verwerfen → 377,11 gilt wieder dauerhaft
  R.geplanteVerwerfen(f, '2026-11');
  assert.equal(f.betrag, 377.11);
  assert.equal(f.frueher, undefined);
});

test('Geplante Änderung ersetzen: neuer Betrag ab jetzt überschreibt den Plan', () => {
  const f = { betrag: 100, wieOft: 'monatlich', tag: 1, meinAnteil: 100 };
  R.betragAendern(f, { betrag: 120 }, '2027-01');
  R.betragAendern(f, { betrag: 110 }, '2026-11');
  assert.equal(R.eigenerBetrag(f, '2026-11'), 110);
  assert.equal(R.eigenerBetrag(f, '2027-01'), 110);
  assert.equal(R.eigenerBetrag(f, '2026-10'), 100);
});
