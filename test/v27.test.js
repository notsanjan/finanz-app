// v27: Fixkosten „gilt ab“, Auswertung, Personen, Sparziel, engster Monat, Sicherung, Verlauf-Filter,
// Dienste → Stunden, Dateien einlesen, Monatsübersicht, Gehalt schätzen, Rechenweg
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../www/js/rechnen.js';
import * as DRK from '../www/js/drk.js';
import * as DI from '../www/js/dienste.js';
import { leereDaten } from '../www/js/daten.js';

const fk = (extra) => Object.assign({ id: 'f1', name: 'Strom', betrag: 100, wieOft: 'monatlich', tag: 15, monat: null, kategorieId: 'wohnen', meinAnteil: 100 }, extra);

test('Fixkosten gilt ab: alte Monate behalten den alten Betrag', () => {
  const f = fk({ betrag: 78 });
  R.betragAendern(f, { betrag: 108 }, '2026-11');
  assert.deepEqual(f.frueher, [{ bis: '2026-10', betrag: 78, meinAnteil: 100 }]);
  assert.equal(R.eigenerBetrag(f, '2026-10'), 78);
  assert.equal(R.eigenerBetrag(f, '2026-07'), 78);
  assert.equal(R.eigenerBetrag(f, '2026-11'), 108);
  assert.equal(R.eigenerBetrag(f), 108);
  // zweite Änderung ab Januar: drei Stufen
  R.betragAendern(f, { betrag: 120 }, '2027-01');
  assert.equal(R.eigenerBetrag(f, '2026-10'), 78);
  assert.equal(R.eigenerBetrag(f, '2026-12'), 108);
  assert.equal(R.eigenerBetrag(f, '2027-01'), 120);
  // „schon immer“ ändert nur den heutigen Betrag
  R.betragAendern(f, { betrag: 125 }, null);
  assert.equal(R.eigenerBetrag(f, '2026-12'), 108);
  assert.equal(R.eigenerBetrag(f, '2027-02'), 125);
});
test('Fixkosten gilt ab: eine spätere Änderung überschreibt eine noch nicht erreichte Stufe', () => {
  const f = fk({ betrag: 50 });
  R.betragAendern(f, { betrag: 60 }, '2026-12'); // ab Dezember 60
  R.betragAendern(f, { betrag: 70 }, '2026-11'); // doch schon ab November 70
  assert.deepEqual(f.frueher, [{ bis: '2026-10', betrag: 50, meinAnteil: 100 }]);
  assert.equal(R.eigenerBetrag(f, '2026-11'), 70);
});
test('Fixkosten gilt ab: Anteil ändert sich mit, Monatsrechnung nutzt den Monat', () => {
  const d = leereDaten(new Date(2026, 6, 1));
  d.einnahmen[0].betrag = 3000;
  const f = fk({ betrag: 1000, meinAnteil: 50 });
  R.betragAendern(f, { betrag: 1100, meinAnteil: 60 }, '2026-11');
  d.fixkosten.push(f);
  assert.equal(R.monatsRechnung(d, '2026-10').ausgaben, 500);
  assert.equal(R.monatsRechnung(d, '2026-11').ausgaben, 660);
  assert.equal(R.jahresUeberblick(d, '2026-10', 2)[0].summe, 500);
  assert.equal(R.naechsteAbbuchungen(d, '2026-10-01')[0].betrag, 500);
  assert.equal(R.naechsteAbbuchungen(d, '2026-10-01')[1].betrag, 660);
});

function mitBuchungen() {
  const d = leereDaten(new Date(2026, 6, 1));
  d.kategorien.find((k) => k.id === 'lebensmittel').budget = 300;
  d.kategorien.find((k) => k.id === 'tanken').budget = 100;
  const b = (zeit, kat, betrag, ort, extra = {}) => d.buchungen.push(Object.assign({ id: 'b' + d.buchungen.length, zeit, kategorieId: kat, betrag, ort }, extra));
  b('2026-08-05T10:00:00', 'lebensmittel', 200, 'Edeka'); b('2026-09-05T10:00:00', 'lebensmittel', 220, 'Edeka'); b('2026-10-05T10:00:00', 'lebensmittel', 240, 'Bäcker');
  b('2026-08-09T10:00:00', 'tanken', 150, 'Aral'); b('2026-09-09T10:00:00', 'tanken', 160, 'Aral'); b('2026-10-20T10:00:00', 'tanken', 140, 'Jet');
  b('2026-11-03T10:00:00', 'lebensmittel', 50, 'Edeka'); b('2026-11-16T18:00:00', 'tanken', 70, 'Aral'); b('2026-11-17T08:00:00', 'tanken', 9, 'Aral');
  return d;
}
test('Auswertung: Schnitt, Urteil, Vergleich bis zum selben Tag, Orte', () => {
  const a = R.auswertung(mitBuchungen(), '2026-11-16', 3);
  assert.deepEqual(a.monate, ['2026-08', '2026-09', '2026-10']);
  const leb = a.kats.find((k) => k.kategorie.id === 'lebensmittel'), tan = a.kats.find((k) => k.kategorie.id === 'tanken');
  assert.equal(leb.schnitt, 220); assert.equal(leb.urteil, 'luft');   // 220 < 75 % von 300
  assert.equal(tan.schnitt, 150); assert.equal(tan.urteil, 'knapp');
  assert.equal(a.summeJetzt, 129);
  assert.equal(a.summeVorBisTag, 240);   // Oktober bis zum 16.: nur die 240 vom 5.; der 16. zählt ganz mit
  assert.deepEqual(a.verlauf.map((m) => m.summe), [350, 380, 380, 129]);
  assert.equal(a.orte[0].ort, 'Edeka'); assert.equal(a.orte[0].summe, 470); assert.equal(a.orte[0].anzahl, 3);
});
test('Auswertung: Monate vor dem Start zählen nicht, ohne ganzen Monat kein Urteil', () => {
  const d = mitBuchungen(); d.einstellungen.startMonat = '2026-10';
  assert.deepEqual(R.auswertung(d, '2026-11-16', 12).monate, ['2026-10']);
  d.einstellungen.startMonat = '2026-11';
  const a = R.auswertung(d, '2026-11-16', 3);
  assert.deepEqual(a.monate, []); assert.equal(a.kats[0].urteil, 'neu'); assert.equal(a.summeVorBisTag, null);
});
test('Abrechnung pro Person', () => {
  const d = leereDaten();
  d.buchungen = [
    { id: '1', zeit: '2026-11-01T10:00:00', kategorieId: 'freizeit', betrag: 20, gesamt: 40, teiltMit: 'Lena' },
    { id: '2', zeit: '2026-11-02T10:00:00', kategorieId: 'freizeit', betrag: 10, gesamt: 30, teiltMit: 'Lena ' },
    { id: '3', zeit: '2026-11-03T10:00:00', kategorieId: 'freizeit', betrag: 10, gesamt: 15, teiltMit: null },
    { id: '4', zeit: '2026-11-04T10:00:00', kategorieId: 'freizeit', betrag: 10, gesamt: 100, teiltMit: 'Tom', zurueckErhalten: true },
    { id: '5', zeit: '2026-11-05T10:00:00', kategorieId: 'freizeit', betrag: 10 }
  ];
  const p = R.personenAbrechnung(d);
  assert.deepEqual(p.map((x) => [x.name, x.summe, x.buchungen.length]), [['Lena', 40, 2], ['Ohne Namen', 5, 1]]);
});
test('Sparziel: nötige Rate und Monat der Ankunft', () => {
  const sp = { id: 's', betrag: 200, tag: 1, stand: 4200, standDatum: '2026-11-16', ziel: 6200, zielBis: '2027-03' };
  let z = R.sparziel(sp, '2026-11-16', null);
  assert.equal(z.fehlt, 2000); assert.equal(z.raten, 4); assert.equal(z.noetig, 500); assert.equal(z.reicht, false);
  assert.equal(z.fertigIm, '2027-09');   // 10 Raten ab Dezember
  z = R.sparziel(Object.assign({}, sp, { zielBis: '2027-09' }), '2026-11-16', null);
  assert.equal(z.reicht, true); assert.equal(z.raten, 10);
  // Rate dieses Monats steht noch aus (Tag 20): zählt mit
  z = R.sparziel(Object.assign({}, sp, { tag: 20, zielBis: '2027-03' }), '2026-11-16', null);
  assert.equal(z.raten, 5); assert.equal(z.noetig, 400);
  assert.equal(R.sparziel(Object.assign({}, sp, { ziel: 4000 }), '2026-11-16', null).erreicht, true);
  assert.equal(R.sparziel(Object.assign({}, sp, { ziel: null }), '2026-11-16', null), null);
  assert.equal(R.sparziel(Object.assign({}, sp, { zielBis: '2026-09' }), '2026-11-16', null).vorbei, true);
});
test('Engster Monat: nur ohne Rücklagenkonto und nur wenn deutlich enger', () => {
  const d = leereDaten(new Date(2026, 10, 1));
  d.einnahmen[0].betrag = 2500;
  d.fixkosten.push(fk({ betrag: 800 }), fk({ id: 'k', name: 'Kfz', betrag: 684, wieOft: 'jaehrlich', monat: 3, tag: 1 }), fk({ id: 'h', name: 'Haftpflicht', betrag: 30, wieOft: 'jaehrlich', monat: 1, tag: 1 }));
  const e = R.engsterMonat(d, '2026-11');
  assert.equal(e.monat, '2027-03'); assert.equal(e.frei, 2500 - 800 - 684); assert.equal(e.weniger, 684); assert.equal(e.inMonaten, 4);
  d.sparraten.push({ id: 'rk', art: 'ruecklage', betrag: 60, tag: 1, stand: 0 });
  assert.equal(R.engsterMonat(d, '2026-11'), null);
  d.sparraten = []; d.fixkosten = d.fixkosten.filter((f) => f.id !== 'k');
  assert.equal(R.engsterMonat(d, '2026-11'), null);   // 30 € Unterschied sind kein Hinweis
});
test('Sicherung fällig: nach 30 Tagen, nie gesichert zählt ab der ersten Buchung', () => {
  const d = leereDaten(new Date(2026, 9, 1));
  assert.equal(R.sicherungFaellig(d, new Date(2026, 10, 16)), null);   // keine Daten
  d.buchungen.push({ id: 'b', zeit: '2026-10-10T10:00:00', kategorieId: 'tanken', betrag: 5 });
  assert.deepEqual(R.sicherungFaellig(d, new Date(2026, 10, 16)), { tage: 36, nie: true });
  d.einstellungen.letzteSicherungZeit = new Date(2026, 10, 1).toISOString();
  assert.equal(R.sicherungFaellig(d, new Date(2026, 10, 16)), null);
  assert.equal(R.sicherungFaellig(d, new Date(2026, 11, 2)).tage, 31);
  delete d.einstellungen.letzteSicherungZeit; d.einstellungen.letzteSicherung = '1.10.2026 09:30';   // alte Version
  assert.equal(R.sicherungFaellig(d, new Date(2026, 10, 16)).nie, false);
  d.beispiel = true; assert.equal(R.sicherungFaellig(d, new Date(2027, 0, 1)), null);
});
test('Verlauf filtern: Text, Kategorie, Monat, Ort, Betrag', () => {
  const d = mitBuchungen(); const alle = R.verlaufMitStand(d);
  assert.equal(R.verlaufFiltern(alle, d, { text: 'edeka' }).length, 3);
  assert.equal(R.verlaufFiltern(alle, d, { text: 'tank' }).length, 5);
  assert.equal(R.verlaufFiltern(alle, d, { kategorieId: 'tanken', monat: '2026-11' }).length, 2);
  assert.equal(R.verlaufFiltern(alle, d, { ort: 'Jet' }).length, 1);
  assert.equal(R.verlaufFiltern(alle, d, { text: '240' }).length, 1);
  assert.equal(R.verlaufFiltern(alle, d, {}).length, alle.length);
});

// ---------- Dienste ----------
test('Feiertage Baden-Württemberg 2026 und Ostern 2027', () => {
  const f = DI.feiertage(2026, 'BW');
  for (const d of ['2026-01-01', '2026-01-06', '2026-04-03', '2026-04-06', '2026-05-01', '2026-05-14', '2026-05-25', '2026-06-04', '2026-10-03', '2026-11-01', '2026-12-25', '2026-12-26']) assert.ok(f[d], d);
  assert.equal(Object.keys(f).length, 12);
  assert.ok(!DI.feiertage(2026, 'BE')['2026-11-01']); assert.ok(DI.feiertage(2026, 'BE')['2026-03-08']);
  assert.ok(DI.feiertage(2027, 'BW')['2027-03-26']);   // Karfreitag 2027
  assert.equal(DI.feiertage(2026, 'SN')['2026-11-18'], 'Buß- und Bettag');
});
test('Stunden: wie in der Monatsübersicht des Arbeitgebers (Nacht 20–6, Sa→So 7 Std. Sonntag)', () => {
  const n = (d) => ({ d, k: 'R1N', von: '19:00', bis: '07:00' });
  // Mo 9.11.: Nacht 10 (davon 0–4: 4), kein Sonntag
  assert.deepEqual(DI.dienstMinuten(n('2026-11-09')), { gesamt: 720, nacht: 600, nacht04: 240, sonntag: 0, feiertag: 0, vorfest: 0 });
  // Sa 14.11.: Sonntag 0–7 Uhr = 7 Std.
  assert.equal(DI.dienstMinuten(n('2026-11-14')).sonntag, 420);
  // So 15.11.: Sonntag 19–24 = 5 Std.
  assert.equal(DI.dienstMinuten(n('2026-11-15')).sonntag, 300);
  const s = DI.stundenAusDiensten([{ d: '2026-11-02', k: 'R1T', von: '07:00', bis: '19:00' }, n('2026-11-09'), n('2026-11-14'), n('2026-11-15'), { d: '2026-11-25', k: 'UL', frei: true }, { d: '2026-11-26', k: 'X' }, n('2026-12-01')], '2026-11');
  assert.deepEqual(s, { anzahl: 4, ohneZeit: 1, pauschalDienste: 4, stunden: 48, nacht: 30, nacht04: 12, sonntag: 12, feiertag: 0, vorfest: 0 });
});
test('Stunden: Feiertag schlägt Sonntag, 24./31.12. ab 14 Uhr, Dienst über Silvester', () => {
  const t = (d) => ({ d, k: 'R1T', von: '07:00', bis: '19:00' });
  assert.deepEqual(DI.dienstMinuten(t('2026-11-01')), { gesamt: 720, nacht: 0, nacht04: 0, sonntag: 0, feiertag: 720, vorfest: 0 });   // Allerheiligen am Sonntag
  assert.equal(DI.dienstMinuten(t('2026-11-01'), 'BE').sonntag, 720);   // in Berlin kein Feiertag
  assert.deepEqual(DI.dienstMinuten(t('2026-12-24')), { gesamt: 720, nacht: 0, nacht04: 0, sonntag: 0, feiertag: 0, vorfest: 300 });
  // 31.12. 19–07: 19–24 Vorfest (5), 0–7 Neujahr (7), Nacht 10
  assert.deepEqual(DI.dienstMinuten({ d: '2026-12-31', k: 'R1N', von: '19:00', bis: '07:00' }), { gesamt: 720, nacht: 600, nacht04: 240, sonntag: 0, feiertag: 420, vorfest: 300 });
  // 24.12.2028 ist ein Sonntag: bis 14 Uhr Sonntag, danach nur der höhere Zuschlag
  assert.deepEqual(DI.dienstMinuten(t('2028-12-24')), { gesamt: 720, nacht: 0, nacht04: 0, sonntag: 420, feiertag: 0, vorfest: 300 });
  // Dienst bis Mitternacht (15–00 Uhr)
  assert.deepEqual(DI.dienstMinuten({ d: '2026-11-10', k: 'M1N', von: '15:00', bis: '00:00' }), { gesamt: 540, nacht: 240, nacht04: 0, sonntag: 0, feiertag: 0, vorfest: 0 });
});
test('Dienste aus CaleConnect: Sammel-Datei und Backup', () => {
  const sammel = { app: 'caleconnect-dienste', v: 1, duties: [{ d: '2026-10-03', code: 'R1T', start: '07:00', end: '19:00', allDay: false, loc: 'WHR1' }, { d: '2026-10-12', code: 'UL', allDay: true }, { d: 'kaputt', code: 'X', start: '07:00', end: '19:00' }, { d: '2026-10-13', code: 'FB' }] };
  const r = DI.diensteAusDatei(JSON.stringify(sammel));
  assert.deepEqual(r.dienste, [{ d: '2026-10-03', k: 'R1T', von: '07:00', bis: '19:00' }, { d: '2026-10-12', k: 'UL', frei: true }]);
  assert.deepEqual(r.monate, ['2026-10']);
  const backup = { events: [{ title: 'Zahnarzt', date: '2026-12-03', start: 600, end: 660 }, { src: 'dp', code: 'R1N', od: '2026-12-12', start: 1140, end: 1860, allDay: false }, { src: 'dp', code: 'R1T', od: '2026-12-19', start: 420, end: 1140, rdp: true }], tpls: [], cats: [] };
  assert.deepEqual(DI.diensteAusDatei(JSON.stringify(backup)).dienste, [{ d: '2026-12-12', k: 'R1N', von: '19:00', bis: '07:00' }]);
  assert.equal(DI.diensteAusDatei('{').ok, false);
  assert.match(DI.diensteAusDatei(JSON.stringify({ format: 'finanz-app' })).fehler, /Sicherung der Finanz-App/);
  assert.equal(DI.diensteAusDatei(JSON.stringify({ events: [] })).ok, false);
  // Einlesen ersetzt nur die Monate der Datei
  const zus = DI.diensteZusammen([{ d: '2026-10-01', k: 'A', von: '07:00', bis: '19:00' }, { d: '2026-11-01', k: 'B', von: '07:00', bis: '19:00' }], r.dienste);
  assert.deepEqual(zus.map((x) => x.d), ['2026-10-03', '2026-10-12', '2026-11-01']);
  assert.deepEqual(DI.schichtartenAus([{ d: '2026-05-01', k: 'M1T', von: '07:00', bis: '17:00' }, { d: '2026-06-01', k: 'M1T', von: '06:00', bis: '15:00' }], [{ k: 'UL', frei: true }]), [{ k: 'UL', frei: true }, { k: 'M1T', von: '06:00', bis: '15:00' }]);
});
const UEBERSICHT = (monat, gedruckt) => ['Monatsübersicht', `Muster, Max (1234) ${monat}`, 'Tag ABK FG Zeitpaare Lohnarten WUZ SOL RAZ BAZ AZK Stand',
  'So 01 -', 'Mo 02 R1T 07:00 n 19:00 n 258 10:00 0:14 8:36 12:00 12:28 3:52 32:24', 'Di 03 - 8:36 -8:36 23:48', 'Do 05 FB 07:25 n 18:36 n 8:36 10:26 12:00 3:24 18:36',
  'Mo 09 R1N 19:00 n 07*00 n 258 10:00 770 6:00 790 4:00 0:14 8:36 12:00 12:28 3:52 13:52', 'Sa 14 R1N 19:00 n 07*00 n 205 7:00 258 10:00 770 6:00 790 4:00 0:14 12:00 12:28 12:28 -8:04',
  'Mo 16 +', 'Mi 18 R1N', 'Do 19 K',
  'Lohnarten', '258 Schichtzulage 30:00 770 Nacht 12:00 790 Nach 0:00-4:00 8:00 205 Sonntagszuschlag 7:00', '210 Feiertagszuschlag 12:30',
  'Urlaubsstände zum 30.11.2026 Urlaub 22,00 Resturlaub', `Gedruckt am ${gedruckt} Seite`, 'von Benutzer 1234 1 von 1'];
test('Monatsübersicht lesen: Monat, Lohnarten, Dienste, Zwischenstand oder abgerechnet', () => {
  const r = DI.monatsuebersichtLesen(UEBERSICHT('November 2026', '16.11.2026'));
  assert.equal(r.ok, true); assert.equal(r.monat, '2026-11'); assert.equal(r.stand, '2026-11-16'); assert.equal(r.fertig, false);
  assert.deepEqual(r.lohnarten.map((x) => [x.nr, x.art, x.stunden]), [['258', 'pauschale', 30], ['770', 'nacht', 12], ['790', 'nacht04', 8], ['205', 'sonntag', 7], ['210', 'feiertag', 12.5]]);
  assert.deepEqual(r.stunden, { nacht: 20, nacht04: 8, sonntag: 7, feiertag: 12.5, vorfest: 0, pauschale: 30 });
  // Dienstpauschale je Kürzel: R1T und R1N gebucht, FB (Fortbildung) nicht
  assert.deepEqual(DI.diensteAusUebersicht(r.dienste, []).pauschale, { R1T: true, FB: false, R1N: true });
  assert.deepEqual(r.dienste.map((x) => [x.d.slice(8), x.k, x.von || '', x.bis || '']), [['02', 'R1T', '07:00', '19:00'], ['05', 'FB', '07:25', '18:36'], ['09', 'R1N', '19:00', '07:00'], ['14', 'R1N', '19:00', '07:00'], ['18', 'R1N', '', ''], ['19', 'K', '', '']]);
  const a = DI.diensteAusUebersicht(r.dienste, [{ k: 'K', frei: true }]);
  assert.deepEqual(a.fertig.find((x) => x.d === '2026-11-18'), { d: '2026-11-18', k: 'R1N', von: '19:00', bis: '07:00' });   // Zeit vom 9. übernommen
  assert.deepEqual(a.fertig.find((x) => x.d === '2026-11-19'), { d: '2026-11-19', k: 'K', frei: true });
  assert.equal(a.ohne.length, 0);
  assert.equal(DI.monatsuebersichtLesen(UEBERSICHT('November 2026', '03.12.2026')).fertig, true);
  assert.equal(DI.monatsuebersichtLesen(['Dienstplan', 'November 2026']).ok, false);
});

// ---------- Gehalt schätzen ----------
function schaetzDaten() {
  const d = leereDaten(new Date(2026, 6, 1));
  d.einnahmen[0].betrag = 2950;
  d.einstellungen.gehaltsrechner = Object.assign({}, DRK.STANDARD, { nachtText: '40', sonntagText: '10' });
  d.einstellungen.gehaltSchaetzen = true;
  const n = (d2) => ({ d: d2, k: 'R1N', von: '19:00', bis: '07:00' });
  d.dienste = ['2026-11-09', '2026-11-14', '2026-11-15', '2026-11-18', '2026-11-19', '2026-11-20'].map(n);
  return d;
}
test('Gehalt schätzen: Zuschläge und Dienstpauschale kommen einen Monat später (einstellbar), ohne Dienste gilt der Durchschnitt', () => {
  const d = schaetzDaten();
  const dez = DI.gehaltSchaetzung(d, '2026-12'), nov = DI.gehaltSchaetzung(d, '2026-11');
  assert.equal(dez.stunden.quelle, 'dienste'); assert.equal(dez.stunden.monat, '2026-11'); assert.equal(dez.stunden.nacht, 60); assert.equal(dez.stunden.sonntag, 12); assert.equal(dez.stunden.pauschalDienste, 6);
  assert.equal(nov.stunden.quelle, 'schnitt');
  const basis = DRK.eingaben(d.einstellungen.gehaltsrechner);
  assert.equal(nov.netto, DRK.gehaltRechnen(basis, '2026-11').netto);
  assert.equal(dez.netto, DRK.gehaltRechnen(Object.assign({}, basis, { nacht: 60, nacht04: 24, sonntag: 12, feiertag: 0, vorfest: 0, pauschalDienste: 6 }), '2026-12').netto);
  assert.ok(dez.netto > nov.netto);
  // Tarif-Termin: zweiter Folgemonat
  d.einstellungen.zuschlagVerzug = 2;
  assert.equal(DI.gehaltSchaetzung(d, '2027-01').stunden.quelle, 'dienste');
  assert.equal(DI.gehaltSchaetzung(d, '2026-12').stunden.quelle, 'schnitt');
  // Arbeitgeber zahlt im selben Monat
  d.einstellungen.zuschlagVerzug = 0;
  assert.equal(DI.gehaltSchaetzung(d, '2026-11').stunden.quelle, 'dienste');
});
test('Gehalt schätzen: abgerechnete Monatsübersicht geht vor, Zwischenstand nicht', () => {
  const d = schaetzDaten();
  d.monatsstunden = { '2026-11': { nacht: 20, nacht04: 8, sonntag: 7, feiertag: 0, vorfest: 0, fertig: false } };
  assert.equal(DI.stundenFuer(d, '2026-11').quelle, 'dienste');
  d.monatsstunden['2026-11'].fertig = true;
  const s = DI.stundenFuer(d, '2026-11');
  assert.equal(s.quelle, 'abrechnung'); assert.equal(s.nacht, 20);
  assert.equal(s.pauschalDienste, 6);   // keine Pauschale in der Übersicht eingetragen → aus den Diensten gezählt
  d.monatsstunden['2026-11'].pauschale = 30;
  assert.equal(DI.stundenFuer(d, '2026-11').pauschalDienste, 3);
});
test('Gehalt schätzen: schaetzWerte landen in der Einnahme und jede Rechnung nutzt sie; aus = feste Schätzung', () => {
  const d = schaetzDaten();
  assert.equal(DI.schaetzWerteSetzen(d, '2026-11'), true);
  const g = R.gehaltVon(d);
  assert.equal(Object.keys(g.schaetzWerte).length, 17);
  const w = R.einnahmeIm(g, '2026-12');
  assert.equal(w.betrag, DI.gehaltSchaetzung(d, '2026-12').netto); assert.equal(w.ausDiensten, true);
  assert.equal(R.monatsRechnung(d, '2026-12').einkommen, w.betrag);
  assert.equal(DI.schaetzWerteSetzen(d, '2026-11'), false);   // nichts geändert
  // bestätigtes Gehalt gewinnt
  g.istWerte.push({ datum: '2027-01-31', betrag: 3000 });
  assert.equal(R.einnahmeIm(g, '2027-01').betrag, 3000);
  d.einstellungen.gehaltSchaetzen = false;
  assert.equal(DI.schaetzWerteSetzen(d, '2026-11'), true);
  assert.equal(g.schaetzWerte, undefined);
  assert.equal(R.einnahmeIm(g, '2027-02').betrag, 2950);
  // ohne gemerkten Gehaltsrechner keine Schätzung
  d.einstellungen.gehaltSchaetzen = true; delete d.einstellungen.gehaltsrechner;
  assert.equal(DI.gehaltSchaetzung(d, '2027-01'), null);
});

// ---------- Gehaltsrechner ----------
test('Rechenweg: jede Zeile hat eine Fundstelle, Summen stimmen mit der Rechnung überein', () => {
  const e = DRK.eingaben(Object.assign({}, DRK.STANDARD, { nachtText: '60', sonntagText: '12', feiertagText: '8', praxis: true, kirche: 8, abzugText: '45' }));
  const { r, zeilen } = DRK.rechenweg(e, '2026-11');
  for (const z of zeilen) if (!z.summe && z.weg !== 'von dir eingetragen') assert.ok(z.fund && z.fund.length > 5, z.name);
  const brutto = zeilen.filter((z) => z.teil === 'Brutto' && !z.summe && !z.info).reduce((a, z) => a + z.betrag, 0);
  assert.equal(Math.round(brutto * 100) / 100, r.brutto);
  const abzuege = zeilen.filter((z) => (z.teil === 'Steuer' || z.teil === 'Versicherung') && !z.info).reduce((a, z) => a + z.betrag, 0);
  assert.equal(Math.round((r.brutto + abzuege) * 100) / 100, r.netto);
  assert.match(zeilen.find((z) => z.name === 'Sonntagszuschlag').weg, /12 Std\. × 22,16 € × 25 %/);
  assert.match(zeilen.find((z) => z.name === 'Nachtzuschlag').fund, /§ 14 Abs\. 2 Satz 3/);
  assert.match(zeilen.find((z) => z.name === 'Praxisanleitung').fund, /§ 23 a Abs\. 1/);
});
test('Nachtstunden 0–4 Uhr: gleicher Zuschlag, höhere Steuerfreiheit (wirkt erst bei niedrigem Grundlohn)', () => {
  const basis = { eg: '2', stufe: 1, vz: 38.5, tz: 100, schicht: false, stkl: 1, kinder: 0, ab23: true, kvz: 2.9 };
  const ohne = DRK.gehaltRechnen(Object.assign({}, basis, { nacht: 40 }), '2026-11');
  const mit = DRK.gehaltRechnen(Object.assign({}, basis, { nacht: 40, nacht04: 16 }), '2026-11');
  assert.equal(ohne.brutto, mit.brutto);
  assert.ok(mit.steuerfrei > ohne.steuerfrei);
  assert.ok(mit.netto > ohne.netto);
  // E 9c: schon ohne die Regel ganz steuerfrei → kein Unterschied
  const hoch = { eg: '9c', stufe: 3, vz: 38.5, tz: 100, schicht: true, stkl: 1, kinder: 0, ab23: true, kvz: 2.9 };
  assert.equal(DRK.gehaltRechnen(Object.assign({}, hoch, { nacht: 40 }), '2026-11').netto, DRK.gehaltRechnen(Object.assign({}, hoch, { nacht: 40, nacht04: 16 }), '2026-11').netto);
});

// ---------- v28: Zusatzversorgung (am 16.11.2026 an einer echten Abrechnung auf den Cent geprüft; hier mit erfundenen Werten) ----------
test('Beispiel E 8 Stufe 2, Steuerklasse I, Zusatzbeitrag 2,5 %, ZVK 0,55 % / 5,75 %: alle Zeilen', () => {
  const e = { eg: '8', stufe: 2, vz: 38.5, tz: 100, schicht: false, stkl: 1, kinder: 0, ab23: true, kvz: 2.5, kirche: 0, zvkAn: 0.55, zvkAg: 5.75 };
  const r = DRK.gehaltRechnen(e, '2026-10');
  assert.equal(r.brutto, 3703.4); assert.equal(r.lohnsteuer, 455.25); assert.equal(r.soli, 0);
  assert.equal(r.zvUmlage, 212.95); assert.equal(r.zvHinzu, 143.13); assert.equal(r.svBrutto, 3846.53);
  assert.equal(r.kv, 328.88); assert.equal(r.pv, 92.32); assert.equal(r.rv, 357.73); assert.equal(r.av, 50);
  assert.equal(r.zvkAn, 20.37);
  assert.equal(r.netto, 2398.85);   // Netto-Verdienst 2.419,22 − Eigenanteil ZVK 20,37
  // ohne Zusatzversorgung wäre das Netto zu hoch
  assert.equal(DRK.gehaltRechnen(Object.assign({}, e, { zvkAn: 0, zvkAg: 0 }), '2026-10').netto, 2450.07);
});
test('Zusatzversorgung: Hinzurechnung nach § 1 Abs. 1 Satz 3 und 4 SvEV', () => {
  // Beispiel des Landesamts für Besoldung BW (VBL 5,49 %, Entgelt 2.600 €): 42,74 + 32,24
  assert.deepEqual(DRK.zvHinzurechnung(2600, 5.49), { umlage: 142.74, hinzu: 74.98 });
  // Umlage unter 100 €: nur 2,5 % des Entgelts abzüglich 13,30 €
  assert.deepEqual(DRK.zvHinzurechnung(1500, 5.75), { umlage: 86.25, hinzu: 24.2 });
  assert.deepEqual(DRK.zvHinzurechnung(400, 5.75), { umlage: 23, hinzu: 0 });
  assert.deepEqual(DRK.zvHinzurechnung(4000, 0), { umlage: 0, hinzu: 0 });
});
test('Dienstpauschale § 23 b: 10 € je Schicht ab 6 Stunden, nur bei Fahrzeug-Diensten oder wenn die Schichtart es sagt', () => {
  const basis = { eg: '9c', stufe: 3, vz: 38.5, tz: 100, schicht: true, stkl: 1, kinder: 0, ab23: true, kvz: 2.9 };
  const ohne = DRK.gehaltRechnen(basis, '2026-11'), mit = DRK.gehaltRechnen(Object.assign({}, basis, { pauschalDienste: 12 }), '2026-11');
  assert.equal(mit.brutto, Math.round((ohne.brutto + 120) * 100) / 100);
  assert.deepEqual(mit.zulagen.find((z) => z[0].startsWith('Dienstpauschale')), ['Dienstpauschale · 12 Schichten', 120]);
  assert.match(DRK.rechenweg(Object.assign({}, basis, { pauschalDienste: 12 }), '2026-11').zeilen.find((z) => z.name.startsWith('Dienstpauschale')).fund, /§ 23 b/);
  assert.equal(DI.mitPauschale('R1T'), true); assert.equal(DI.mitPauschale('M1N'), true); assert.equal(DI.mitPauschale('FB'), false); assert.equal(DI.mitPauschale('DZFB'), false);
  assert.equal(DI.mitPauschale('FB', [{ k: 'FB', von: '07:00', bis: '17:00', pauschale: true }]), true);
  assert.equal(DI.mitPauschale('R1T', [{ k: 'R1T', von: '07:00', bis: '19:00', pauschale: false }]), false);
  const dienste = [{ d: '2026-11-02', k: 'R1T', von: '07:00', bis: '19:00' }, { d: '2026-11-05', k: 'FB', von: '07:00', bis: '17:00' }, { d: '2026-11-06', k: 'R1T', von: '07:00', bis: '12:00' }];
  assert.equal(DI.stundenAusDiensten(dienste, '2026-11').pauschalDienste, 1);   // FB nicht, 5-Stunden-Dienst nicht
});
