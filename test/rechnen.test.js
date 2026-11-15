import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as R from '../www/js/rechnen.js';
import { beispielDaten, pruefeImport } from '../www/js/daten.js';

const nov = new Date(2026, 10, 12);
// Beispiel ohne die zusätzlichen Demo-Abos (Spotify, Fitnessstudio), damit die Mockup-Zahlen gelten
const daten = () => { const d = beispielDaten(nov); d.fixkosten = d.fixkosten.filter((f) => !['Spotify', 'Fitnessstudio'].includes(f.name)); return d; };

const ohneRuecklage = () => { const d = daten(); d.sparraten = d.sparraten.filter((x) => x.art !== 'ruecklage'); return d; };

test('Mit Rücklagenkonto: jährliche Kosten nicht im Monat, feste Rate statt dessen', () => {
  const d = daten();
  const r = R.monatsRechnung(d, '2026-11');
  assert.equal(r.einkommen, 2400);
  assert.equal(r.ausgaben, 585 + 29 + 570);
  assert.equal(r.zuruecklegen, 75);
  assert.equal(r.sparen, 200);
  assert.equal(r.frei, 2400 - 1184 - 75 - 200);
  // März: Kfz kommt aus der Rücklage, „Frei“ gleich wie im November
  assert.equal(R.monatsRechnung(d, '2027-03').frei, r.frei);
  assert.equal(R.empfohleneRuecklage(d, '2026-11'), 75);
});

test('Ohne Rücklagenkonto: keine Doppelzählung, voller Betrag im Fälligkeitsmonat', () => {
  const d = ohneRuecklage();
  const nov = R.monatsRechnung(d, '2026-11');
  assert.equal(nov.zuruecklegen, 0);
  assert.equal(nov.frei, 2400 - (640 + 29 + 570) - 200);
  const mar = R.monatsRechnung(d, '2027-03');
  assert.equal(mar.frei, 2400 - (585 + 29 + 480 + 570) - 200);
  const b = R.naechsterBrockenMonat(d, '2026-11');
  assert.equal(b.monat, '2027-01');
  assert.equal(b.posten[0].name, 'Haftpflicht');
});

test('Rücklage: Stand wächst um die Rate und sinkt bei Abbuchung; Lücke wird erkannt', () => {
  const d = daten();
  const rk = R.ruecklage(d);
  assert.equal(R.ruecklageStand(d, '2026-11-01'), rk.stand);
  // 15.11.: Rundfunk 55 aus der Rücklage
  assert.equal(R.ruecklageStand(d, '2026-11-15'), rk.stand - 55);
  assert.equal(R.ruecklageStand(d, '2026-12-01'), rk.stand - 55 + 75);
  assert.equal(R.ruecklageLuecke(d, '2026-11-12'), null);
  rk.stand = 0;
  const l = R.ruecklageLuecke(d, '2026-11-12');
  assert.ok(l && l.fehlt > 0);
});

test('Abnahme 3: Kfz 480 € jährlich am 1. März', () => {
  const d = daten();
  const kfz = d.fixkosten.find((f) => f.name === 'Kfz-Versicherung');
  const p = (s) => R.monatsRechnung(d, s).gruppen.find((g) => g.name === 'Versicherungen').posten.find((x) => x.fixkosten === kfz);
  assert.equal(p('2026-11').faellig, false);
  assert.equal(Math.round(p('2026-11').anteil), 40);
  assert.equal(p('2027-03').faellig, true);
  assert.equal(p('2027-03').betrag, 480);
  const jahr = R.jahresUeberblick(d, '2026-12');
  assert.ok(jahr.find((x) => x.monat === '2027-03').zusaetzlich.some((z) => z.text.startsWith('Kfz-Versicherung 480 €')));
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
  assert.equal(r.ausgaben, 1184);
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
  assert.equal(r.frei, R.monatsRechnung(daten(), '2026-11').frei + 112);
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
  assert.equal(R.monatsRechnung(d, '2026-11').frei, R.monatsRechnung(daten(), '2026-11').frei - 50);
});

test('Fixkosten mit Ende und Anteil', () => {
  const d = daten();
  d.fixkosten.push({ id: 'k', name: 'Kredit', betrag: 100, wieOft: 'monatlich', tag: 1, kategorieId: 'wohnen', endetAm: '2027-01-31', meinAnteil: 50 });
  assert.equal(R.monatsRechnung(d, '2027-01').ausgaben - R.monatsRechnung(daten(), '2027-01').ausgaben, 50);
  assert.equal(R.monatsRechnung(d, '2027-02').ausgaben, R.monatsRechnung(daten(), '2027-02').ausgaben);
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
  assert.equal(r.daten.fixkosten.length, d.fixkosten.length);
  assert.equal(pruefeImport('{"a":1}').ok, false);
  assert.equal(pruefeImport('kaputt').ok, false);
});

test('Potenzielle Ausgaben: passt, fehlt, frühestens, Budget', () => {
  const d = daten(); // Frei pro Monat: 2400 - 1184 - 75 - 200 = 941
  d.wuensche = [
    { id: 'a', name: 'Fahrrad', preis: 500, monat: '2026-11', status: 'geplant' },
    { id: 'b', name: 'Laptop', preis: { von: 1200, bis: 1500 }, monat: '2026-12', status: 'geplant' },
    { id: 'c', name: 'Kinokarten', preis: 40, monat: '2026-11', kategorieId: 'freizeit', status: 'geplant' },
    { id: 'd', name: 'Starlink', preis: 300, monat: null, status: 'geplant' }
  ];
  d.buchungen.push({ id: 'x', zeit: '2026-11-03T10:00:00', kategorieId: 'freizeit', betrag: 100 });
  const p = R.wunschPruefung(d, '2026-11');
  assert.equal(p.a.fehlt, 0);
  assert.equal(p.c.budgetUeber, 20); // 120 Budget, 100 ausgegeben, 40 geplant
  // Nov übrig: 941 - 500 - 20 = 421; Dez: 421 + 941 - 1500 = -138 → fehlt 138, frühestens Jan
  assert.equal(Math.round(p.b.fehlt), 138);
  assert.equal(p.b.fruehestens, '2027-01');
  assert.equal(p.d.offen, true);
  assert.equal(p.d.fruehestens, '2027-01'); // Nov hätte gereicht, aber dann fehlt im Dez mehr
  assert.equal(R.geplantAusFrei(d, '2026-11', p), 520);
});

test('Weitere Einnahmen: fest zählt, geplant erst nach „Kam an“', () => {
  const d = daten();
  d.einnahmen = d.einnahmen.filter((e) => e.id !== 'ein-beispiel');
  const basis = R.monatsRechnung(d, '2026-11').frei;
  d.einnahmen.push({ id: 'n', name: 'Nebenjob', wieOft: 'einmalig', monat: '2026-12', betrag: 300, sicher: true, status: 'geplant', istWerte: [] });
  d.einnahmen.push({ id: 'k', name: 'Kindergeld', wieOft: 'monatlich', ab: '2026-11', bis: null, betrag: 255, sicher: true, status: 'fest', istWerte: [] });
  const nov = R.monatsRechnung(d, '2026-11');
  assert.equal(nov.frei, basis + 255);
  assert.equal(nov.gehaltWert.betrag, 2400);
  assert.equal(nov.weitere, 255);
  const dez = R.monatsRechnung(d, '2026-12');
  assert.equal(dez.geplantRein, 300);
  assert.equal(dez.frei, basis + 255);
  d.einnahmen.find((e) => e.id === 'n').istWerte.push({ datum: '2026-12-05', betrag: 280 });
  assert.equal(R.monatsRechnung(d, '2026-12').frei, basis + 255 + 280);
  assert.equal(R.monatsRechnung(d, '2027-01').weitere, 255);
});

test('Überträge: einmalig und jeden Monat, eigene Konten und andere Konten', () => {
  const d = daten();
  const basis = R.monatsRechnung(d, '2026-11').frei;
  const sp = R.sparratenNormal(d)[0];
  const rk = R.ruecklage(d);
  // einmalig 300 € extra aufs Sparkonto: „Frei“ sinkt nur in diesem Monat, der Stand wächst ab dem Datum
  d.uebertraege = [{ id: 'u1', datum: '2026-11-20', betrag: 300, kontoId: sp.id }];
  const nov = R.monatsRechnung(d, '2026-11');
  assert.equal(nov.frei, basis - 300);
  assert.equal(nov.sparen, 200 + 300);
  assert.equal(nov.konten.find((k) => k.konto.id === sp.id).extra, 300);
  assert.equal(R.monatsRechnung(d, '2026-12').frei, basis);
  const vorher = R.sparStand(sp, '2026-11-19', d);
  assert.equal(R.sparStand(sp, '2026-11-20', d), vorher + 300);
  // einmalig auf die Rücklage: Stand der Rücklage wächst
  const rkVorher = R.ruecklageStand(d, '2026-11-25');
  d.uebertraege.push({ id: 'u2', datum: '2026-11-21', betrag: 100, kontoId: rk.id });
  assert.equal(R.ruecklageStand(d, '2026-11-25'), rkVorher + 100);
  assert.equal(R.monatsRechnung(d, '2026-11').zuruecklegen, 75 + 100);
  // anderes Konto (Gemeinschaftskonto): zählt wie eine Ausgabe, ist kein Sparen
  d.uebertraege = [];
  d.sparraten.push({ id: 'gk', name: 'Gemeinschaftskonto', art: 'extern', betrag: 600, tag: 1, stand: 0 });
  const mitGk = R.monatsRechnung(d, '2026-11');
  assert.equal(mitGk.extern, 600);
  assert.equal(mitGk.sparen, 200);
  assert.equal(mitGk.frei, basis - 600);
  assert.equal(R.sparratenNormal(d).some((x) => x.id === 'gk'), false);
});

test('Gehalt bestätigen und Schätzung, die mitlernt', () => {
  const d = daten();
  const g = R.gehaltVon(d);
  g.istWerte = [{ datum: '2026-08-31', betrag: 2380 }, { datum: '2026-09-30', betrag: 2540 }, { datum: '2026-10-31', betrag: 2470 }, { datum: '2026-07-31', betrag: 1000 }];
  assert.equal(R.gehaltBestaetigt(g, '2026-10'), true);
  assert.equal(R.gehaltBestaetigt(g, '2026-11'), false);
  const st = R.gehaltStatistik(g, 3);
  assert.equal(st.anzahl, 3); assert.equal(st.min, 2380); assert.equal(st.max, 2540);
  assert.ok(Math.abs(st.schnitt - 2463.33) < 0.01);
  // der bestätigte Betrag zählt statt der Schätzung
  assert.equal(R.monatsRechnung(d, '2026-10').einkommen, 2470);
});

// ---------- Offene Beträge (v25) ----------
test('Offener Betrag, zählt nicht: „Frei“ bleibt, „Mit Offenem“ zeigt die Spanne', () => {
  const d = daten();
  const frei = R.monatsRechnung(d, '2026-11').frei;
  d.fixkosten.push({ id: 'fk-offen', name: 'Strom neu', betrag: 0, wieOft: 'monatlich', tag: 15, kategorieId: 'wohnen', meinAnteil: 100, offen: { von: 60, bis: 90, zaehlt: false } });
  assert.equal(R.monatsRechnung(d, '2026-11').frei, frei);
  const m = R.mitOffenem(d, '2026-11');
  assert.equal(m.anzahl, 1);
  assert.equal(m.min, frei - 90);
  assert.equal(m.max, frei - 60);
  assert.equal(m.betrifft, true);
});

test('Offener Betrag, zählt mit: „Frei“ rechnet mit dem oberen Wert, Umschalten hält betrag passend', () => {
  const d = daten();
  const frei = R.monatsRechnung(d, '2026-11').frei;
  const o = { von: 60, bis: 90, zaehlt: true };
  d.fixkosten.push({ id: 'fk-offen', name: 'Strom neu', betrag: R.offenBetrag(o), wieOft: 'monatlich', tag: 15, kategorieId: 'wohnen', meinAnteil: 100, offen: o });
  assert.equal(R.monatsRechnung(d, '2026-11').frei, frei - 90);
  const m = R.mitOffenem(d, '2026-11');
  assert.equal(m.min, frei - 90);
  assert.equal(m.max, frei - 60);
  R.offenZaehltSetzen(d, 'fixkosten', 'fk-offen', false);
  assert.equal(R.monatsRechnung(d, '2026-11').frei, frei);
  assert.equal(d.fixkosten.find((f) => f.id === 'fk-offen').betrag, 0);
});

test('Offene Einnahme: zählt nicht = geplant, aber nicht unter „Mit Geplantem“; ohne Schätzung wird gezählt', () => {
  const d = daten();
  const r0 = R.monatsRechnung(d, '2026-11');
  d.einnahmen.push({ id: 'ein-offen', name: 'Verkauf', wieOft: 'einmalig', monat: '2026-11', betrag: { von: 100, bis: 150 }, sicher: false, status: 'geplant', kommtAn: 'sofort', istWerte: [], offen: { von: 100, bis: 150, zaehlt: false } });
  d.buchungen.push({ id: 'b-offen', zeit: '2026-11-10T12:00:00', kategorieId: 'tanken', betrag: 0, ort: null, quelle: 'app', offen: { zaehlt: false } });
  const r = R.monatsRechnung(d, '2026-11');
  assert.equal(r.frei, r0.frei);
  assert.equal(r.geplantRein, r0.geplantRein);
  const m = R.mitOffenem(d, '2026-11');
  assert.equal(m.anzahl, 2);
  assert.equal(m.ohne, 1);
  assert.equal(m.min, r0.frei + 100);
  assert.equal(m.max, r0.frei + 150);
  R.offenZaehltSetzen(d, 'einnahme', 'ein-offen', true);
  assert.equal(R.monatsRechnung(d, '2026-11').frei, r0.frei + 100);
  assert.equal(R.offenText({ von: 60, bis: 90 }), '60–90 €');
  assert.equal(R.offenText({}), 'unbekannt');
  assert.equal(R.mitOffenem(daten(), '2026-11'), null);
});

test('Übertrag am Tag des Stands: zählt nur, wenn er nach dem Stand angelegt wurde (v26)', () => {
  const d = daten();
  const rk = R.ruecklage(d);
  Object.assign(rk, { stand: 300, standDatum: '2026-11-16', standZeit: '2026-11-16T09:00:00.000Z' });
  d.uebertraege = [{ id: 'u1', datum: '2026-11-16', betrag: 150, kontoId: rk.id, angelegt: '2026-11-16T10:00:00.000Z' }];
  assert.equal(R.ruecklageStand(d, '2026-11-16'), 450);
  d.uebertraege[0].angelegt = '2026-11-16T08:00:00.000Z'; // vor dem Stand eingetragen → steckt schon im Stand
  assert.equal(R.ruecklageStand(d, '2026-11-16'), 300);
  delete d.uebertraege[0].angelegt; // alte Daten ohne Uhrzeit: wie bisher
  assert.equal(R.ruecklageStand(d, '2026-11-16'), 300);
  const sp = R.sparratenNormal(d)[0];
  Object.assign(sp, { stand: 1000, standDatum: '2026-11-16', standZeit: '2026-11-16T09:00:00.000Z' });
  d.uebertraege.push({ id: 'u2', datum: '2026-11-16', betrag: 200, kontoId: sp.id, angelegt: '2026-11-16T09:30:00.000Z' });
  assert.equal(R.sparStand(sp, '2026-11-16', d), 1200);
});
