// v29: Brutto-Netto-Abrechnung lesen und abgleichen. Die Zeilen sind dem bekannten Formular (LOGO18) nachgebaut;
// Person, Arbeitgeber, Kasse, Nummern und alle Beträge sind erfunden (Beträge mit dem Gehaltsrechner nachgerechnet).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as AB from '../www/js/abrechnung.js';
import * as DI from '../www/js/dienste.js';
import * as DRK from '../www/js/drk.js';
import { leereDaten } from '../www/js/daten.js';

const kopf = (titel, blatt) => ['99Z/99 000000/0000/0000', `Abrechnung der Brutto/Netto-Bezüge für ${titel} 23.10.2026 Blatt: ${blatt}`,
  'Personal-Nr. Geburtsdatum StKl Faktor Ki.Frbtr. Konfession Freibetrag jährl. 1 Freibetrag mtl. 1 DBA Midijob St.-Tg. VJ Url. üb. Url. Anspr. Url.Tg.gen. Resturlaub', '01234 010190 1 30',
  'SV-Nummer Krankenkasse KK % 9 PGRS BGRS Um. SV-Tg. Anw. Tage Urlaub Tage Krankh. Tg. Fehlz. Tage', '00000000X000 Musterkasse 1678101 1111 2 30',
  'Muster gGmbH*Musterweg 1*00000 Musterstadt Ersteintr. 01.10.24 Wöch.Arb.Zt. 38,50', 'Max Muster', 'Tarifvertrag/Eingruppierung', 'Tarif/BesO DRK Reform-TV', 'Gruppe/Stufe 8 / 2'];
const fuss = ['1 H = Hinzurechnungsbetrag 4 L = Laufender Bezug, S = Sonstiger Bezug, F = Frei, 5 J = Bestandteil des Gesamt-Bruttos'];
const OKT = [...kopf('Oktober 2026', 1), 'Arbeitszeit Zusatzversorgung/VBLU', 'Regelmäßige wöchentl. Arbeitszeit 3850 ZVK-/VBLU-Brutto 3.70340', 'Abw. wöchentliche Vollarbeitszeit ZVK-/VBLU-AG-Anteil 23702',
  'Brutto-Bezüge', 'Lohnart Bezeichnung Einheit 2 Menge 3 Faktor 3 Prozentsatz St 4 SV 4 GB 5 ZVK 7 Betrag',
  '120 Tabellenentgelt L L J 1 3.703,40', '955 Zusatzbeitr. lfd.st-fr. 0,65 F F N 24,07', '986 Allg.Uml. ZVK st-frei 5,75 F F N 69,82', '986 Allg.Uml. ZVK st-frei 5,75 F L N 143,13',
  'Gesamt-Brutto', 'Steuer/Sozialversicherung 3.703,40', 'St 4 Steuer-Brutto Lohnsteuer Kirchensteuer Solidaritätszuschlag Steuerrechtliche Abzüge', 'L 3.70340 45525 455,25',
  'SV 4 KV-Brutto RV-Brutto AV-Brutto PV-Brutto KV-Beitrag RV-Beitrag AV-Beitrag PV-Beitrag 6 SV-rechtliche Abzüge', 'L 3.84653 3.84653 3.84653 3.84653 32888 35773 5000 Z 9232 828,93',
  'Netto-Verdienst', 'Verdienstbescheinigung Netto-Bezüge/Netto-Abzüge 2.419,22', 'Gesamt-Brutto 38.12050 SV-Brutto 37.40210 Nr. Bezeichnung Betrag',
  'Steuer-Brutto 36.55480 KV-Beitrag 3.20011 9982 AN-Anteil ZVK 20,37-', 'Lohnsteuer 4.88213 RV-Beitrag 3.48012 aus NB 09/2026 300,00', 'P. verst. Zuk.sich. ZVK-/VBLU-Brutto 36.55480',
  'Bank Musterbank SV-AG-Anteil Zus. AG-Kosten Gesamtkosten Auszahlungsbetrag', 'Konto DE00 0000 0000 0000 0000 00 80010 31022 4.82314 2.698,85', ...fuss];
const SEP1 = [...kopf('Sep 2026 (1. NB)', 1), 'Regelmäßige wöchentl. Arbeitszeit 3850 ZVK-/VBLU-Brutto 4.10000', 'Brutto-Bezüge', 'Lohnart Bezeichnung Einheit 2 Menge 3 Faktor 3 Prozentsatz St 4 SV 4 GB 5 ZVK 7 Betrag',
  '120 Tabellenentgelt L L J 1 3.380,00', 'N 196 Ausgleich Arbeitsstd. Std 10,00 22,50 S E J 1 225,00', 'N 224 Leistungsprämie S E J 1 300,00', 'N 258 Pauschale nach § 23 b L L J 1 20,00',
  'N 390 Schichtzulage 51.ÄTV L L J 1 115,00', 'N 770 Nachtzuschlag Std 12,00 5,50 J 66,00', 'N 790 Nachtzuschlag 0-4 Uhr Std 8,00 5,50 J 44,00', 'N 205 Sonntagszuschlag Std 7,00 5,54 J 38,78',
  '986 Allg.Uml. ZVK st-frei 5,75 F L N 130,10', 'N 986 Allg.Uml. ZVK st-frei 5,75 F L N 5,10', 'Gesamt-Brutto', 'Steuer/Sozialversicherung', 'Netto-Verdienst', 'Konto', ...fuss];
const SEP2 = [...kopf('Sep 2026 (1. NB)', 2), 'Brutto-Bezüge', 'Lohnart Bezeichnung Einheit 2 Menge 3 Faktor 3 Prozentsatz St 4 SV 4 GB 5 ZVK 7 Betrag', 'N 987 Allg.Uml.ZVK EBZ st-fr 5,75 F E N 40,12',
  'Gesamt-Brutto', 'Steuer/Sozialversicherung 4.188,78', 'St 4 Steuer-Brutto Lohnsteuer Kirchensteuer Solidaritätszuschlag Steuerrechtliche Abzüge', 'L 3.38000 41020 410,20', 'N 66000 15800 158,00',
  'SV 4 KV-Brutto RV-Brutto AV-Brutto PV-Brutto KV-Beitrag RV-Beitrag AV-Beitrag PV-Beitrag 6 SV-rechtliche Abzüge', 'L 3.51010 3.51010 3.51010 3.51010 29540 32628 4563 Z 8424 751,55',
  'Netto-Verdienst', 'Verdienstbescheinigung Netto-Bezüge/Netto-Abzüge 2.650,00', 'Steuer-Brutto 35.12340 KV-Beitrag 3.10020 9982 AN-Anteil ZVK 18,59-', 'Lohnsteuer 4.42700 RV-Beitrag 3.15040 N9982 AN-Anteil ZVK 3,63-',
  'Kirchensteuer AV-Beitrag 44510 bereits ausbezahlt 2.331,44-', 'Bank Der Auszahlungsbetrag wird mit der SV-AG-Anteil Zus. AG-Kosten Gesamtkosten Auszahlungsbetrag', 'Konto Abrechnung 10/2026 verrechnet. 1.05010 40020 6.10050 300,00', ...fuss];

test('Zahlformate der Abrechnung', () => {
  assert.equal(AB.geld('3.703,40'), 3703.4); assert.equal(AB.geld('20,37-'), -20.37); assert.equal(AB.geld('12,00'), 12); assert.ok(isNaN(AB.geld('23'))); assert.ok(isNaN(AB.geld('3.70340')));
  assert.equal(AB.kompakt('3.70340'), 3703.4); assert.equal(AB.kompakt('45525'), 455.25); assert.equal(AB.kompakt('5000'), 50); assert.equal(AB.kompakt('38.12050'), 38120.5);
});
test('Abrechnung lesen: Monat, Eingruppierung, Lohnarten, Steuer, Versicherung, Auszahlung', () => {
  const r = AB.abrechnungLesen([OKT, SEP1, SEP2]);
  assert.equal(r.ok, true); assert.equal(r.datum, '2026-10-23');
  const a = r.haupt;
  assert.deepEqual([a.monat, a.nb, a.eg, a.stufe, a.stkl, a.wochenstd, a.zvkBrutto, a.gesamtBrutto, a.nettoVerdienst, a.auszahlung], ['2026-10', 0, '8', 2, 1, 38.5, 3703.4, 3703.4, 2419.22, 2698.85]);
  assert.deepEqual(a.lohnarten.map((x) => [x.nr, x.art, x.betrag, x.imBrutto]), [['120', 'tabelle', 3703.4, true], ['955', 'arbeitgeber', 24.07, false], ['986', 'umlage', 69.82, false], ['986', 'umlage', 143.13, false]]);
  assert.deepEqual(a.steuer, [{ art: 'L', brutto: 3703.4, lohnsteuer: 455.25, weitere: 0, summe: 455.25 }]);
  assert.deepEqual(a.sv[0], { art: 'L', kvBrutto: 3846.53, rvBrutto: 3846.53, avBrutto: 3846.53, pvBrutto: 3846.53, kv: 328.88, rv: 357.73, av: 50, pv: 92.32, summe: 828.93 });
  assert.deepEqual(a.nettoPosten, [{ nr: '9982', nach: false, name: 'AN-Anteil ZVK', betrag: -20.37 }]);
  assert.deepEqual(a.ausNB, [{ monat: '2026-09', betrag: 300 }]);
  // nichts Persönliches im Ergebnis
  assert.ok(!/01234|010190|Muster|DE00/.test(JSON.stringify(r)));
});
test('Nachberechnung: zwei Blätter werden zusammengeführt, Lohnarten mit Menge, Einmalzahlung, steuerfrei', () => {
  const nb = AB.abrechnungLesen([OKT, SEP1, SEP2]).nachberechnungen[0];
  assert.deepEqual([nb.monat, nb.nb, nb.auszahlung, nb.bereits, nb.gesamtBrutto], ['2026-09', 1, 300, 2331.44, 4188.78]);
  const n = nb.lohnarten.filter((x) => x.nach && x.imBrutto);
  assert.deepEqual(n.map((x) => [x.nr, x.art, x.menge, x.faktor, x.betrag, x.einmal, x.steuerfrei]), [
    ['196', 'sonst', 10, 22.5, 225, true, false], ['224', 'sonst', null, null, 300, true, false], ['258', 'pauschale', null, null, 20, false, false], ['390', 'schicht', null, null, 115, false, false],
    ['770', 'nacht', 12, 5.5, 66, false, true], ['790', 'nacht04', 8, 5.5, 44, false, true], ['205', 'sonntag', 7, 5.54, 38.78, false, true]]);
  assert.deepEqual(AB.stundenAus(n), { nacht: 20, nacht04: 8, sonntag: 7, feiertag: 0, vorfest: 0, pauschale: 20 });
  assert.equal(nb.steuer.length, 2); assert.equal(nb.steuer[1].art, 'N'); assert.equal(nb.sv.length, 1);
  assert.equal(nb.nettoPosten.filter((x) => x.nach)[0].betrag, -3.63);
});
test('Einstellungen aus der Abrechnung: Kassen-Beitrag und Zusatzversorgung zurückgerechnet', () => {
  const a = AB.abrechnungLesen([OKT]).haupt;
  const e = AB.einstellungenAus(a);
  assert.deepEqual(e, { eg: '8', stufe: 2, stkl: 1, vz: '38,5', kvz: 2.5, kinder: 0, ab23: true, zvkAg: 5.75, zvkAn: 0.55 });
  assert.deepEqual(AB.rechnerFelder(e), { eg: '8', stufe: 2, stkl: 1, vz: '38,5', kvzText: '2,5', kinder: 0, ab23: true, zvkAgText: '5,75', zvkAnText: '0,55' });
});
test('Vergleich mit dem Gehaltsrechner: alle Zeilen auf den Cent; Abweichung wird gemeldet', () => {
  const a = AB.abrechnungLesen([OKT]).haupt;
  const v = AB.vergleich(a);
  assert.equal(v.ok, true); assert.equal(v.passt, true); assert.equal(v.zeilen.length, 8);
  assert.deepEqual(v.zeilen.find((x) => x.name === 'Netto (laufend)'), { name: 'Netto (laufend)', echt: 2398.85, app: 2398.85, diff: 0 });
  // andere Lohnsteuer auf der Abrechnung (z. B. Freibetrag) → eine Zeile weicht ab
  const b = AB.abrechnungLesen([OKT.map((x) => (x === 'L 3.70340 45525 455,25' ? 'L 3.70340 40025 400,25' : x))]).haupt;
  const w = AB.vergleich(b);
  assert.equal(w.passt, false); assert.deepEqual(w.abweichungen.map((x) => x.name), ['Lohnsteuer', 'Netto (laufend)']);
  // Monate vor der bekannten Tabelle: kein Vergleich
  assert.equal(AB.vergleich(AB.abrechnungLesen([SEP1, SEP2]).nachberechnungen[0]).ok, false);
});
test('Stunden der Nachberechnung gegen die Dienste der App', () => {
  const nb = AB.abrechnungLesen([OKT, SEP1, SEP2]).nachberechnungen[0];
  const d = leereDaten(new Date(2026, 6, 1));
  let v = AB.stundenVergleich(nb, d);
  assert.equal(v.quelle, 'schnitt'); assert.equal(v.passt, false);
  // zwei Nachtdienste, einer Sa→So (7 Std. Sonntag)
  d.dienste = [{ d: '2026-09-08', k: 'R1N', von: '19:00', bis: '07:00' }, { d: '2026-09-12', k: 'R1N', von: '19:00', bis: '07:00' }];
  v = AB.stundenVergleich(nb, d);
  assert.equal(v.quelle, 'dienste'); assert.equal(v.passt, true);
  assert.deepEqual(v.zeilen.map((x) => [x.name, x.echt, x.app]), [['Nacht gesamt', 20, 20], ['davon 0–4 Uhr', 8, 8], ['Sonntag', 7, 7], ['Schichten mit Dienstpauschale', 2, 2]]);
  d.dienste.push({ d: '2026-09-20', k: 'R1T', von: '07:00', bis: '19:00' });   // Sonntag-Tagdienst nur in der App
  assert.equal(AB.stundenVergleich(nb, d).passt, false);
});
test('Falsche Datei: klare Meldung statt falscher Zahlen', () => {
  assert.match(AB.abrechnungLesen([['Monatsübersicht', 'Muster, Max (1234) November 2026']]).fehler, /Monatsübersicht einlesen/);
  assert.match(AB.abrechnungLesen([['Dienstplan November 2026']]).fehler, /keine Brutto-Netto-Abrechnung/);
  assert.equal(AB.abrechnungLesen([]).ok, false);
  // Formular mit Überschrift, aber ohne lesbare Lohnarten
  assert.match(AB.abrechnungLesen([kopf('Oktober 2026', 1)]).fehler, /Lohnarten/);
});
test('Kalender ↔ Monatsübersicht: Unterschiede je Tag', () => {
  const kal = [{ d: '2026-11-02', k: 'R1T', von: '07:00', bis: '19:00' }, { d: '2026-11-09', k: 'R1N', von: '19:00', bis: '07:00' }, { d: '2026-11-20', k: 'R1N', von: '19:00', bis: '07:00' }, { d: '2026-11-25', k: 'UL', frei: true }, { d: '2026-12-01', k: 'R1T', von: '07:00', bis: '19:00' }];
  const ueb = [{ d: '2026-11-02', k: 'R1T' }, { d: '2026-11-05', k: 'FB' }, { d: '2026-11-09', k: 'R2N' }];
  assert.deepEqual(DI.diensteVergleich(kal, ueb, '2026-11'), { imKalender: 4, gleich: 1, unterschiede: [{ d: '2026-11-05', kal: null, ueb: 'FB' }, { d: '2026-11-09', kal: 'R1N', ueb: 'R2N' }, { d: '2026-11-20', kal: 'R1N', ueb: null }] });
  assert.deepEqual(DI.diensteVergleich([], ueb, '2026-11').imKalender, 0);
});
