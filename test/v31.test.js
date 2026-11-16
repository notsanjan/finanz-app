// v31: Konsumkonto – Konsum-Kategorien zählen nicht in „Frei“, nur der Dauerauftrag; Stand, Kachel, Rest am Monatsende
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../www/js/rechnen.js';
import { leereDaten } from '../www/js/daten.js';

function daten() {
  const d = leereDaten();
  d.einstellungen.startMonat = '2026-10';
  d.einnahmen = [{ id: 'g', name: 'Gehalt', art: 'gehalt', betrag: 2600, tag: 30, sicher: true, status: 'fest' }];
  d.kategorien = [
    { id: 'wohnen', name: 'Wohnen', art: 'fix', farbe: '#888' },
    { id: 'tanken', name: 'Tanken', art: 'budget', budget: 150, kontoId: 'konsum' },
    { id: 'essen', name: 'Essen', art: 'budget', budget: 300, kontoId: 'konsum' },
    { id: 'drogerie', name: 'Drogerie', art: 'budget', budget: 40 }
  ];
  d.fixkosten = [{ id: 'miete', name: 'Miete', betrag: 800, wieOft: 'monatlich', tag: 1, kategorieId: 'wohnen', meinAnteil: 100 }];
  d.sparraten = [
    { id: 'konsum', name: 'Konsumkonto', art: 'konsum', betrag: 600, tag: 1, stand: 50, standDatum: '2026-10-31', standZeit: '2026-10-31T20:00:00.000Z' },
    { id: 'spar', name: 'Tagesgeld', betrag: 200, tag: 1, stand: 1000, standDatum: '2026-10-31' }
  ];
  d.buchungen = [
    { id: 'b1', zeit: '2026-11-03T10:00:00', kategorieId: 'tanken', betrag: 70 },
    { id: 'b2', zeit: '2026-11-05T12:00:00', kategorieId: 'essen', betrag: 30 },
    { id: 'b3', zeit: '2026-11-06T12:00:00', kategorieId: 'drogerie', betrag: 12 }
  ];
  return d;
}

test('Konsum-Kategorien zählen nicht in „Frei“, der Dauerauftrag schon', () => {
  const d = daten();
  const r = R.monatsRechnung(d, '2026-11');
  assert.equal(r.konsum, 600);
  assert.equal(r.mitKonsum, true);
  // Ausgaben = Miete + Drogerie-Budget (40); Tanken und Essen nicht
  assert.equal(r.ausgaben, 840);
  assert.equal(r.frei, r.einkommen - 840 - 200 - 600);
  const k = r.gruppen.find((g) => g.konsum);
  assert.equal(k.summe, 0);
  assert.equal(k.ausgegeben, 100);
  assert.deepEqual(k.posten.map((p) => p.kategorie.id), ['tanken', 'essen']);
  // ohne Konsumkonto: alles wie vorher
  d.sparraten = d.sparraten.filter((x) => x.art !== 'konsum');
  const r2 = R.monatsRechnung(d, '2026-11');
  assert.equal(r2.konsum, 0);
  assert.equal(r2.ausgaben, 800 + 150 + 300 + 40);
});

test('Stand des Konsumkontos: Stand + Eingang − Konsum-Buchungen', () => {
  const d = daten();
  assert.equal(R.konsumStand(d, '2026-11-01'), 650);
  assert.equal(R.konsumStand(d, '2026-11-16'), 650 - 70 - 30);
  // Drogerie ist keine Konsum-Kategorie
  assert.ok(!R.istKonsum(d, R.kategorie(d, 'drogerie')));
  // Buchung vor dem eingetragenen Stand am selben Tag zählt nicht
  d.buchungen.push({ id: 'b0', zeit: '2026-10-31T08:00:00', kategorieId: 'essen', betrag: 9 });
  assert.equal(R.konsumStand(d, '2026-11-16'), 550);
});

test('Kachel: noch übrig, pro Tag bis zum nächsten Eingang', () => {
  const d = daten();
  const u = R.konsumUebersicht(d, '2026-11-16');
  assert.equal(u.stand, 550);
  assert.equal(u.ausgegeben, 100);
  assert.equal(u.naechster, '2026-12-01');
  assert.equal(u.tage, 15);
  assert.ok(Math.abs(u.proTag - 550 / 15) < 0.001);
});

test('Rest am Monatsende: zurück aufs Eingangskonto erhöht „Frei“, aufs Sparkonto nicht', () => {
  const d = daten();
  // Dezember: Eingang am 1.12. ist da → Rest November = 550
  const rest = R.konsumRest(d, '2026-12-02');
  assert.deepEqual(rest, { monat: '2026-11', bis: '2026-11-30', rest: 550 });
  assert.equal(R.konsumRest(d, '2026-11-16'), null, 'November: Rest Oktober liegt vor dem Stand');
  const freiVorher = R.monatsRechnung(d, '2026-12').frei;
  // 100 € zurück aufs Eingangskonto, 200 € aufs Tagesgeld
  d.uebertraege = [
    { id: 'u1', datum: '2026-12-02', betrag: 100, vonKontoId: 'konsum', kontoId: null },
    { id: 'u2', datum: '2026-12-02', betrag: 200, vonKontoId: 'konsum', kontoId: 'spar' }
  ];
  assert.equal(R.monatsRechnung(d, '2026-12').frei, freiVorher + 100);
  assert.equal(R.konsumStand(d, '2026-12-02'), 550 + 600 - 300);
  assert.equal(R.sparStand(d.sparraten[1], '2026-12-02', d), 1000 + 200 + 200 + 200);
  // abgeschlossen → keine Frage mehr
  d.einstellungen.konsumAbgeschlossen = ['2026-11'];
  assert.equal(R.konsumRest(d, '2026-12-02'), null);
});

test('Konsumkonto überzogen: Ausgleich vom Eingangskonto senkt „Frei“', () => {
  const d = daten();
  d.buchungen.push({ id: 'b9', zeit: '2026-11-20T12:00:00', kategorieId: 'essen', betrag: 600 });
  const rest = R.konsumRest(d, '2026-12-01');
  assert.equal(rest.rest, -50);
  const frei = R.monatsRechnung(d, '2026-12').frei;
  d.uebertraege = [{ id: 'u3', datum: '2026-12-01', betrag: 50, kontoId: 'konsum' }];
  assert.equal(R.monatsRechnung(d, '2026-12').frei, frei - 50);
  assert.equal(R.konsumStand(d, '2026-12-01'), 600);
});
