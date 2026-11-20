// v43: Monat von Gehalt zu Gehalt (alle Daten erfunden)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../www/js/rechnen.js';
import * as K from '../www/js/kontostand.js';

const daten = (an = true) => ({
  einstellungen: { gehaltsmonat: an, startMonat: '2026-10' },
  kategorien: [
    { id: 'wohnen', name: 'Wohnen', art: 'fix' },
    { id: 'lebensmittel', name: 'Lebensmittel', art: 'budget', budget: 200 }
  ],
  fixkosten: [
    { id: 'miete', name: 'Miete', betrag: 500, wieOft: 'monatlich', tag: 30, kategorieId: 'wohnen' },
    { id: 'strom', name: 'Strom', betrag: 50, wieOft: 'monatlich', tag: 15, kategorieId: 'wohnen' },
    { id: 'kfz', name: 'Kfz', betrag: 300, wieOft: 'jaehrlich', tag: 29, monat: 11, kategorieId: 'wohnen' }
  ],
  einnahmen: [
    { id: 'gehalt', name: 'Gehalt', wieOft: 'monatlich', betrag: 2000, kommtAn: 'Tag', ankunftTag: 28, istWerte: [{ datum: '2026-11-27', betrag: 2100 }] },
    { id: 'st', name: 'Erstattung', wieOft: 'einmalig', betrag: 300, sicher: true, status: 'fest', monat: '2026-11', istWerte: [{ datum: '2026-11-13', betrag: 300 }] }
  ],
  sparraten: [],
  uebertraege: [],
  buchungen: [
    { id: 'a', zeit: '2026-11-20T10:00:00', kategorieId: 'lebensmittel', betrag: 40 },
    { id: 'b', zeit: '2026-11-29T10:00:00', kategorieId: 'lebensmittel', betrag: 25 }
  ]
});

test('Monat beginnt am Gehaltstag: Zeitraum, Zuordnung, Februar', () => {
  assert.equal(R.monatsBeginn(daten()), 28);
  assert.equal(R.periode('2026-11-27'), '2026-11');
  assert.equal(R.periode('2026-11-28'), '2026-12');
  assert.deepEqual(R.zeitraum('2026-12'), { von: '2026-11-28', bis: '2026-12-27' });
  assert.deepEqual(R.zeitraum('2027-03'), { von: '2027-02-28', bis: '2027-03-27' });
  // Gehalt kommt einen Tag früher (Freitag) → zählt trotzdem zum Dezember
  assert.equal(R.gehaltMonat('2026-11-27'), '2026-12');
  assert.equal(R.gehaltDatum(daten().einnahmen[0], '2026-12'), '2026-11-28');
  // Abbuchung am 30. gehört zum nächsten Monat, am 15. zum selben
  assert.equal(R.abbuchungIm(daten().fixkosten[0], '2026-12').faellig, '2026-11-30');
  assert.equal(R.abbuchungIm(daten().fixkosten[1], '2026-12').faellig, '2026-12-15');
  // jährlich am 29.11. → Dezember, nicht November
  assert.equal(R.wirdAbgebuchtIm(daten().fixkosten[2], '2026-11'), false);
  assert.equal(R.wirdAbgebuchtIm(daten().fixkosten[2], '2026-12'), true);
  R.monatsBeginn({});
});

test('Monatsrechnung Dezember = 28.11.–27.12.', () => {
  const d = daten();
  R.monatsBeginn(d);
  const dez = R.monatsRechnung(d, '2026-12');
  assert.equal(dez.gehaltWert.betrag, 2100); // Gehalt vom 27.11. ist das Geld für den Dezember
  assert.equal(dez.weitere, 0); // Erstattung vom 13.11. gehört zum November
  assert.equal(R.ausgegebenIm(d, '2026-12', 'lebensmittel'), 25);
  assert.equal(R.ausgegebenIm(d, '2026-11', 'lebensmittel'), 40);
  const nov = R.monatsRechnung(d, '2026-11');
  assert.equal(nov.weitere, 300);
  assert.equal(nov.gehaltWert.betrag, 2000); // Gehalt vom Oktober (Schätzung)
  // Fixkosten im Dezember: Miete 30.11., Strom 15.12., Kfz 29.11.
  const fix = dez.gruppen.filter((g) => g.art !== 'budget').reduce((a, g) => a + g.summe, 0);
  assert.equal(fix, 850);
  R.monatsBeginn({});
});

test('Ausgeschaltet: alles wie bisher im Kalendermonat', () => {
  const d = daten(false);
  assert.equal(R.monatsBeginn(d), 0);
  assert.equal(R.periode('2026-11-28'), '2026-11');
  const nov = R.monatsRechnung(d, '2026-11');
  assert.equal(nov.gehaltWert.betrag, 2100);
  assert.equal(nov.weitere, 300);
  assert.equal(R.ausgegebenIm(d, '2026-11', 'lebensmittel'), 65);
});

test('Kontostand-Vorschau mit Gehaltsmonat: nächstes Gehalt und Budget-Rest', () => {
  const d = daten();
  d.eingangskonto = { name: 'Konto 05', stand: 1000, standDatum: '2026-11-20' };
  d.einnahmen[0].istWerte = [];
  R.monatsBeginn(d);
  const ng = K.naechstesGehalt(d, '2026-11-20');
  assert.equal(ng.datum, '2026-11-30'); // 28.11.2026 ist ein Samstag → Montag
  const v = K.vorschau(d, '2026-11-20');
  assert.ok(v.zukunft.some((x) => x.text === 'Miete' && x.datum === '2026-11-30'));
  R.monatsBeginn({});
});
