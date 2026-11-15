import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as R from '../www/js/rechnen.js';
import { beispielDaten, pruefeImport } from '../www/js/daten.js';

const nov = new Date(2026, 10, 12);
const daten = () => beispielDaten(nov);

test('Mockup November: Frei ≈ 906 €, Zurücklegen 55 €, Ausgaben 1.239 €', () => {
  const r = R.monatsRechnung(daten(), '2026-11');
  assert.equal(r.einkommen, 2400);
  assert.equal(r.ausgaben, 1239);
  assert.equal(r.zuruecklegen, 55);
  assert.equal(r.sparen, 200);
  assert.equal(r.frei, 906);
  assert.equal(r.geschaetzt, true);
});

test('Abnahme 3: Kfz 480 € jährlich am 1. März', () => {
  const d = daten();
  const kfz = d.fixkosten.find((f) => f.name === 'Kfz-Versicherung');
  const nov = R.monatsRechnung(d, '2026-11').gruppen.find((g) => g.name === 'Versicherungen').posten.find((p) => p.fixkosten === kfz);
  assert.equal(nov.faellig, false);
  assert.equal(Math.round(nov.anteil), 40);
  const mar = R.monatsRechnung(d, '2027-03').gruppen.find((g) => g.name === 'Versicherungen').posten.find((p) => p.fixkosten === kfz);
  assert.equal(mar.faellig, true);
  assert.equal(mar.betrag, 480);
  const jahr = R.jahresUeberblick(d, '2026-12');
  const m = jahr.find((x) => x.monat === '2027-03');
  assert.ok(m.zusaetzlich.some((z) => z.text.startsWith('Kfz-Versicherung 480 €')));
  assert.equal(jahr.filter((x) => x.zusaetzlich.some((z) => z.fixkosten === kfz)).length, 1);
});

test('Abnahme 4: Rundfunk vierteljährlich ab Februar → Feb, Mai, Aug, Nov', () => {
  const d = daten();
  const rf = d.fixkosten.find((f) => f.name === 'Rundfunkbeitrag');
  assert.deepEqual(R.abbuchungsMonate(rf), [2, 5, 8, 11]);
  const jahr = R.jahresUeberblick(d, '2027-01');
  const monate = jahr.filter((x) => x.zusaetzlich.some((z) => z.fixkosten === rf)).map((x) => x.name);
  assert.deepEqual(monate, ['Feb', 'Mai', 'Aug', 'Nov']);
});

test('Halbjährlich ab Mai → Mai, Nov', () => {
  assert.deepEqual(R.abbuchungsMonate({ wieOft: 'halbjaehrlich', monat: 5 }), [5, 11]);
});

test('Abnahme 5: Sparrate 200 € ist keine Ausgabe, Stand wächst', () => {
  const d = daten();
  const r = R.monatsRechnung(d, '2026-11');
  assert.equal(r.ausgaben, 1239);
  assert.equal(r.sparen, 200);
  const sp = d.sparraten[0];
  assert.equal(R.sparStand(sp, '2026-11-15'), 2050);
  assert.equal(R.sparStand(sp, '2026-12-01'), 2250);
  assert.equal(R.sparStand(sp, '2027-02-10'), 2650);
});

test('Abnahme 6: Gehalt ≈ 2.400 € automatisch, Korrektur 2.512 € rechnet neu', () => {
  const d = daten();
  assert.equal(R.monatsRechnung(d, '2026-12').einkommen, 2400);
  assert.equal(R.monatsRechnung(d, '2026-12').geschaetzt, true);
  d.einnahmen[0].istWerte.push({ datum: '2026-11-30', betrag: 2512 });
  const r = R.monatsRechnung(d, '2026-11');
  assert.equal(r.einkommen, 2512);
  assert.equal(r.geschaetzt, false);
  assert.equal(r.frei, 906 + 112);
});

test('Abnahme 1/2: Buchung 15 € → 173 €, vorher/nachher; Rückgängig', () => {
  const d = daten();
  d.buchungen.push({ id: 'a', zeit: '2026-11-10T10:00:00', kategorieId: 'lebensmittel', betrag: 158, ort: null });
  assert.equal(R.ausgegebenIm(d, '2026-11', 'lebensmittel'), 158);
  d.buchungen.push({ id: 'b', zeit: '2026-11-12T18:42:00', kategorieId: 'lebensmittel', betrag: 15, ort: 'Edeka' });
  assert.equal(R.ausgegebenIm(d, '2026-11', 'lebensmittel'), 173);
  const v = R.verlaufMitStand(d)[0];
  assert.equal(v.vorher, 158); assert.equal(v.nachher, 173);
  d.buchungen = d.buchungen.filter((b) => b.id !== 'b');
  assert.equal(R.ausgegebenIm(d, '2026-11', 'lebensmittel'), 158);
});

test('Budget überzogen zählt mit dem Ausgegebenen', () => {
  const d = daten();
  d.buchungen.push({ id: 'x', zeit: '2026-11-10T10:00:00', kategorieId: 'tanken', betrag: 200 });
  assert.equal(R.monatsRechnung(d, '2026-11').frei, 906 - 50);
});

test('Fixkosten mit Ende und Anteil', () => {
  const d = daten();
  d.fixkosten.push({ id: 'k', name: 'Kredit', betrag: 100, wieOft: 'monatlich', tag: 1, kategorieId: 'wohnen', endetAm: '2027-01-31', meinAnteil: 50 });
  assert.equal(R.monatsRechnung(d, '2027-01').ausgaben - R.monatsRechnung(beispielDaten(nov), '2027-01').ausgaben, 50);
  assert.equal(R.monatsRechnung(d, '2027-02').ausgaben, R.monatsRechnung(beispielDaten(nov), '2027-02').ausgaben);
});

test('Nächste Abbuchungen ab 12. Nov', () => {
  const n = R.naechsteAbbuchungen(daten(), '2026-11-12');
  assert.equal(n[0].datum, '2026-11-12'); // Netflix am 12.
  assert.equal(n[1].datum, '2026-11-15');
});

test('Abnahme 7: Export/Import-Datei', () => {
  const d = daten();
  const r = pruefeImport(JSON.stringify(d));
  assert.equal(r.ok, true);
  assert.equal(r.daten.fixkosten.length, 10);
  assert.equal(pruefeImport('{"a":1}').ok, false);
  assert.equal(pruefeImport('kaputt').ok, false);
});
