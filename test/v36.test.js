// v36: Kontostand-Vorschau und CSV-Import (alle Daten erfunden)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../www/js/kontostand.js';
import * as C from '../www/js/csv.js';

const basis = () => ({
  einstellungen: { haendlerKategorie: { 'mein lieblingsladen': 'freizeit' } },
  kategorien: [
    { id: 'wohnen', name: 'Wohnen', art: 'fix' },
    { id: 'lebensmittel', name: 'Lebensmittel', art: 'budget', budget: 200, kontoId: 'k06' },
    { id: 'tanken', name: 'Tanken', art: 'budget', budget: 100, kontoId: 'k06' },
    { id: 'freizeit', name: 'Freizeit', art: 'budget', budget: 50, kontoId: 'k06' },
    { id: 'sonstiges', name: 'Sonstiges', art: 'budget', budget: 0, kontoId: 'k06' },
    { id: 'kat-eingang', name: 'Vom Eingangskonto', art: 'budget', budget: 0 }
  ],
  fixkosten: [
    { id: 'miete', name: 'Miete', betrag: 800, wieOft: 'monatlich', tag: 30, kategorieId: 'wohnen', meinAnteil: 75, teiltMit: 'Anna', erstattungTag: 2 },
    { id: 'strom', name: 'Strom', betrag: 60, wieOft: 'monatlich', tag: 20, kategorieId: 'wohnen', meinAnteil: 100 },
    { id: 'musik', name: 'Musikdienst', betrag: 10.99, wieOft: 'monatlich', tag: 1, kategorieId: 'wohnen', meinAnteil: 100 },
    { id: 'haft', name: 'Haftpflicht', betrag: 80, wieOft: 'jaehrlich', tag: 2, monat: 2, kategorieId: 'wohnen', meinAnteil: 100 }
  ],
  einnahmen: [{ id: 'gehalt', name: 'Gehalt', wieOft: 'monatlich', betrag: 2500, sicher: false, kommtAn: 'Tag', ankunftTag: 28, istWerte: [] }],
  sparraten: [
    { id: 'spar', name: 'Sparkonto', betrag: 300, tag: 1, stand: 1000, standDatum: '2026-11-01' },
    { id: 'k06', name: 'Konto 06', art: 'konsum', betrag: 400, tag: 30, stand: 120, standDatum: '2026-11-18', standZeit: '2026-11-18T18:00:00.000Z' }
  ],
  uebertraege: [],
  buchungen: [
    { id: 'b1', zeit: '2026-11-19T10:00:00', kategorieId: 'kat-eingang', betrag: 20, ort: 'Apotheke' },
    { id: 'b2', zeit: '2026-11-19T11:00:00', kategorieId: 'tanken', betrag: 40, ort: 'Aral' }
  ],
  wuensche: [],
  eingangskonto: { name: 'Konto 05', stand: 500, standDatum: '2026-11-18', standZeit: '2026-11-18T20:00:00.000Z' }
});

test('Vorschau: Stand heute, Gehalt am Samstag erst Montag, tiefster Stand vor dem Gehalt', () => {
  const v = K.vorschau(basis(), '2026-11-21');
  // seit dem Stand: Strom 20.11. (Fr) − 60, Apotheke − 20; Tanken zahlt das Konsumkonto
  assert.equal(v.heute, 420);
  assert.deepEqual(v.vorbei.map((x) => x.text), ['Apotheke', 'Strom']);
  // Gehalt 28.11.2026 ist ein Samstag → vorsichtig Montag 30.11.
  assert.equal(v.gehalt.datum, '2026-11-30');
  assert.equal(v.gehalt.eigentlich, '2026-11-28');
  // Am 30.11.: erst Gehalt + 2500, dann Miete − 800 (voll, Anna überweist 200 am 2.12.) und Konto 06 − 400
  const tag30 = v.zukunft.filter((x) => x.datum === '2026-11-30');
  assert.deepEqual(tag30.map((x) => [x.text, x.betrag]), [['Gehalt', 2500], ['Miete', -800], ['Aufs Konto 06', -400]]);
  assert.equal(v.bis, '2026-12-05');
  assert.deepEqual(v.tiefster, { stand: 420, datum: '2026-11-21' });
  assert.equal(v.zukunft.find((x) => x.datum === '2026-11-30' && x.text === 'Aufs Konto 06').stand, 1720);
  assert.ok(v.zukunft.some((x) => x.datum === '2026-12-01' && x.text === 'Aufs Sparkonto'));
});

test('Vorschau: Rückzahlung, Daueraufträge, Jahreskosten und offenes Budget im Folgemonat', () => {
  const d = basis();
  d.kategorien.find((k) => k.id === 'kat-eingang').budget = 30;
  const v = K.vorschau(d, '2026-11-29');
  assert.equal(v.gehalt.datum, '2026-11-30');
  // Monatsende nach dem nächsten Gehalt (30.11.) liegt weniger als 7 Tage entfernt → bis Ende Dezember
  assert.equal(v.bis, '2027-01-05');
  const texte = v.zukunft.map((x) => x.datum + ' ' + x.text);
  assert.ok(texte.includes('2026-11-29 Noch offen in Budgets')); // 30 − 20 = 10 € im November
  assert.ok(texte.includes('2026-12-02 Anna: Miete zurück'));
  assert.ok(texte.includes('2026-12-01 Aufs Sparkonto'));
  assert.ok(texte.includes('2026-12-01 Musikdienst'));
  assert.ok(!texte.some((t) => t.includes('Haftpflicht'))); // erst im Februar
  assert.equal(v.zukunft.find((x) => x.text === 'Noch offen in Budgets' && x.monat === '2026-12').betrag, -30);
});

test('Vorschau: Rücklagenkonto zahlt die Jahreskosten, Überträge und Rückfluss', () => {
  const d = basis();
  d.eingangskonto.standDatum = '2027-01-31'; d.eingangskonto.standZeit = '2027-01-31T20:00:00.000Z';
  d.buchungen = [];
  const ohne = K.vorschau(d, '2027-02-01');
  assert.ok(ohne.zukunft.some((x) => x.text === 'Haftpflicht' && x.datum === '2027-02-02'));
  d.sparraten.push({ id: 'rl', name: 'Rücklage', art: 'ruecklage', betrag: 20, tag: 3, stand: 0, standDatum: '2027-01-01' });
  d.uebertraege.push({ id: 'u1', datum: '2027-02-05', betrag: 50, kontoId: 'spar' }, { id: 'u2', datum: '2027-02-06', betrag: 15, vonKontoId: 'k06', kontoId: null });
  const mit = K.vorschau(d, '2027-02-01');
  assert.ok(!mit.zukunft.some((x) => x.text === 'Haftpflicht'));
  assert.ok(mit.zukunft.some((x) => x.text === 'Aufs Rücklage' && x.betrag === -20));
  assert.ok(mit.zukunft.some((x) => x.datum === '2027-02-05' && x.betrag === -50));
  assert.ok(mit.zukunft.some((x) => x.datum === '2027-02-06' && x.betrag === 15 && x.text === 'Vom Konto 06 zurück'));
});

test('Vorschau: ohne eingetragenen Stand gibt es keine', () => {
  const d = basis(); delete d.eingangskonto;
  assert.equal(K.vorschau(d, '2026-11-21'), null);
});

// ---------- CSV ----------
const VR = [
  'Bezeichnung Auftragskonto;IBAN Auftragskonto;BIC Auftragskonto;Bankname Auftragskonto;Buchungstag;Valutadatum;Name Zahlungsbeteiligter;IBAN Zahlungsbeteiligter;BIC (SWIFT-Code) Zahlungsbeteiligter;Buchungstext;Verwendungszweck;Betrag;Waehrung;Saldo nach Buchung;Bemerkung;Kategorie;Steuerrelevant;Glaeubiger ID;Mandatsreferenz',
  'Girokonto;DE00123;GENODE;Testbank;19.11.2026;19.11.2026;NETTO MARKEN-DISCOUNT//Musterstadt/DE;;;Kartenzahlung;2026-11-18 Debitk.1 VISA Debit;-17,24;EUR;217,02;;;;;',
  'Girokonto;DE00123;GENODE;Testbank;18.11.2026;18.11.2026;PayPal Europe S.a.r.l. et Cie S.C.A;DE88;;Basislastschrift;"PP.1234.PP . Musikdienst, Ihr Einkauf bei Musikdienst";-10,99;EUR;234,26;;;;;',
  'Girokonto;DE00123;GENODE;Testbank;17.11.2026;17.11.2026;Max Muster;DE99;;Dauerauftrag;Sparen;-300,00;EUR;245,25;;;;;',
  'Girokonto;DE00123;GENODE;Testbank;16.11.2026;16.11.2026;ARAL STATION 1234;;;Kartenzahlung;;-45,10;EUR;545,25;;;;;',
  'Girokonto;DE00123;GENODE;Testbank;16.11.2026;16.11.2026;Mein Lieblingsladen;;;Kartenzahlung;;-12,00;EUR;590,35;;;;;',
  'Girokonto;DE00123;GENODE;Testbank;16.11.2026;16.11.2026;Apotheke am Markt;;;Kartenzahlung;;-20,00;EUR;602,35;;;;;',
  'Girokonto;DE00123;GENODE;Testbank;10.11.2026;10.11.2026;Firma Beispiel GmbH;;;Lohn/Gehalt;LOHN/GEHALT 10/2026;2.345,67;EUR;622,35;;;;;'
].join('\r\n');

test('CSV Volksbank: Spalten, Beträge, Kontostand der neuesten Zeile', () => {
  const r = C.lesen(VR);
  assert.equal(r.ok, true);
  assert.equal(r.buchungen.length, 7);
  assert.deepEqual(r.saldo, { betrag: 217.02, datum: '2026-11-19' });
  assert.equal(r.buchungen[6].betrag, 2345.67);
  assert.equal(C.haendler(r.buchungen[0]), 'Netto Marken-discount');
  assert.equal(C.haendler(r.buchungen[1]), 'Musikdienst');
  assert.equal(C.haendler(r.buchungen[3]), 'Aral Station');
});

test('CSV Vorschläge Eingangskonto: Fixkosten, Übertrag, doppelt, Kategorie, Gehalt', () => {
  const d = basis();
  const r = C.lesen(VR);
  assert.equal(C.kontoRaten(d, r), 'eingang');
  const v = C.vorschlaege(d, r, 'eingang');
  const art = v.map((x) => x.art + ':' + (x.wahl || '-'));
  assert.deepEqual(art, ['buchung:kat-eingang', 'fix:-', 'konto:-', 'buchung:kat-eingang', 'buchung:kat-eingang', 'doppelt:-', 'gehalt:gehalt']);
  // Händler „Aral“ wäre Tanken, das zahlt aber das Konsumkonto → vom 05 nur Kategorien ohne Konsumkonto
  const k = C.vorschlaege(d, r, 'konsum');
  assert.equal(k[3].wahl, 'tanken');
  assert.equal(k[4].wahl, 'freizeit'); // gemerkt
  assert.equal(k[0].wahl, 'lebensmittel');
  assert.equal(k[1].art, 'buchung'); // Fixkosten prüft es auf dem Konsumkonto nicht
});

test('CSV Sparkasse (CSV-CAMT, Datum zweistellig) und Konsumkonto erkennen', () => {
  const text = '"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Glaeubiger ID";"Mandatsreferenz";"Kundenreferenz (End-to-End)";"Sammlerreferenz";"Lastschrift Ursprungsbetrag";"Auslagenersatz Ruecklastschrift";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info"\n'
    + '"DE1";"30.10.26";"30.10.26";"GUTSCHR. UEBERWEISUNG";"Konsum";"";"";"";"";"";"";"Max Muster";"DE2";"X";"400,00";"EUR";"Umsatz gebucht"\n'
    + '"DE1";"02.11.26";"02.11.26";"KARTENZAHLUNG";"";"";"";"";"";"";"";"SHELL 4711";"";"";"-33,15";"EUR";"Umsatz gebucht"';
  const r = C.lesen(text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.buchungen.map((b) => [b.datum, b.betrag]), [['2026-10-30', 400], ['2026-11-02', -33.15]]);
  assert.equal(r.saldo, null);
  assert.equal(C.kontoRaten(basis(), r), 'konsum');
  const v = C.vorschlaege(basis(), r, 'konsum');
  assert.equal(v[0].art, 'konto');
  assert.equal(v[1].wahl, 'tanken');
});

test('CSV ING (Kopf mit Kontostand darüber) und N26 (Komma, Punkt als Dezimalzeichen)', () => {
  const ing = 'Umsatzanzeige;Datei erstellt am: 19.11.2026 08:00\n\nIBAN;DE00 1234\nKontoname;Girokonto\nKontostand vom 19.11.2026:;1.234,56;EUR\n\nBuchung;Valuta;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung\n19.11.2026;19.11.2026;REWE Markt;Lastschrift;Einkauf;1.234,56;EUR;-23,40;EUR\n18.11.2026;18.11.2026;Kino Lichtspiele;Lastschrift;Film;1.257,96;EUR;-11,00;EUR';
  const a = C.lesen(ing);
  assert.equal(a.ok, true);
  assert.deepEqual(a.buchungen.map((b) => b.betrag), [-23.4, -11]);
  assert.deepEqual(a.saldo, { betrag: 1234.56, datum: '2026-11-19' });
  const n26 = '"Booking Date","Value Date","Partner Name","Partner Iban",Type,"Payment Reference","Account Name","Amount (EUR)","Original Amount","Original Currency","Exchange Rate"\n2026-11-17,2026-11-17,"LIDL SAGT DANKE",,Presentment,,"Hauptkonto",-8.77,,,\n2026-11-16,2026-11-16,"Arbeitgeber",DE1,Credit Transfer,"Gehalt","Hauptkonto",1234.5,,,';
  const b = C.lesen(n26);
  assert.equal(b.ok, true);
  assert.deepEqual(b.buchungen.map((x) => [x.datum, x.betrag, C.haendler(x)]), [['2026-11-17', -8.77, 'Lidl Sagt Danke'], ['2026-11-16', 1234.5, 'Arbeitgeber']]);
});

test('CSV: Zahlen und Datumsformate, falsche Datei', () => {
  assert.equal(C.betragAus('1.234,56'), 1234.56);
  assert.equal(C.betragAus('-1.234,56 €'), -1234.56);
  assert.equal(C.betragAus('12,50-'), -12.5);
  assert.equal(C.betragAus('+3.000'), 3000);
  assert.equal(C.betragAus('-8.77'), -8.77);
  assert.equal(C.betragAus('1,234.56'), 1234.56);
  assert.equal(C.datumAus('5.1.27'), '2027-01-05');
  assert.equal(C.lesen('Hallo;Welt\n1;2').ok, false);
  // Umlaute in Windows-1252 (ältere Exporte)
  const bytes = new Uint8Array([0x42, 0xe4, 0x63, 0x6b, 0x65, 0x72]);
  assert.equal(C.dekodieren(bytes), 'Bäcker');
});

test('CSV Deutsche Bank: „Letzter Kontostand“ oben ist der Anfangsstand, Endstand steht unten; Kartendatum, Abwickler', () => {
  const db = ['Umsätze', 'Konto;Filial-/Kontonummer;IBAN;Währung', 'AktivKonto;111 2222222 05;DE00TEST;EUR', '', '1.11.2026 - 20.11.2026', 'Letzter Kontostand;;;;1.000,5;EUR', 'Vorgemerkte und noch nicht gebuchte Umsätze sind nicht Bestandteil dieser Übersicht.',
    'Buchungstag;Wert;Umsatzart;Begünstigter / Auftraggeber;Verwendungszweck;IBAN / Kontonummer;BIC;Kundenreferenz;Mandatsreferenz;Gläubiger ID;Fremde Gebühren;Betrag;Abweichender Empfänger;Anzahl der Aufträge;Anzahl der Schecks;Soll;Haben;Währung',
    '19.11.2026;19.11.2026;Kartenzahlung;Nexi Germany GmbH;BAECKEREI SONNE MUSTER GIR 1234//MUSTERSTADT/DE 17-11-2026T12:48:18 Folgenr. 009;DE00;;;;;;-2,5;;;;-2,5;;EUR',
    '18.11.2026;18.11.2026;SEPA Lastschrift;PayPal Europe S.a.r.l. et Cie S.C.A;104/PP.5486.PP/. , Ihr Einkauf bei;LU00;;;;;;-20;;;;-20;;EUR',
    '15.11.2026;15.11.2026;Auszahlung;;GA NR0000 BLZ000 13.11/16.54UHR MUSTERSTADT;;;;;;;-30;;;;-30;;EUR',
    '2.11.2026;2.11.2026;SEPA Überweisung (Lohn, Gehalt, Rente);Firma;LOHN / GEHALT 10/26;DE00;;;;;;2.500;;;;;2.500;EUR',
    'Kontostand;20.11.2026;;;3.448,0;EUR', ''].join('\n');
  const r = C.lesen(db);
  assert.equal(r.ok, true);
  assert.deepEqual(r.saldo, { betrag: 3448, datum: '2026-11-20' });
  assert.equal(r.buchungen.length, 4);
  assert.deepEqual([r.buchungen[0].datum, r.buchungen[0].uhr, C.haendler(r.buchungen[0])], ['2026-11-17', '12:48', 'Baeckerei Sonne Muster']);
  assert.equal(C.haendler(r.buchungen[1]), 'PayPal');
  assert.equal(C.haendler(r.buchungen[2]), 'Bargeld (Automat)');
  assert.equal(r.buchungen[3].betrag, 2500);
  // ohne Endstand mit Datum: kein Kontostand (der obere ist der Stand vor dem Zeitraum)
  assert.equal(C.lesen(db.replace('Kontostand;20.11.2026;;;3.448,0;EUR', '')).saldo, null);
});

test('CSV: zwei Fixkosten in einer Abbuchung (Internet + Handy)', () => {
  const d = basis();
  d.fixkosten.push({ id: 'net', name: 'Internet', betrag: 34.99, wieOft: 'monatlich', tag: 28, kategorieId: 'wohnen', meinAnteil: 100 }, { id: 'handy', name: 'Handyvertrag', betrag: 9.99, wieOft: 'monatlich', tag: 25, kategorieId: 'wohnen', meinAnteil: 100 });
  const gelesen = { buchungen: [{ datum: '2026-11-25', betrag: -44.98, name: 'Telekommunikation GmbH', zweck: 'KD-Nr. 1', text: 'SEPA Lastschrift' }] };
  const v = C.vorschlaege(d, gelesen, 'eingang');
  assert.equal(v[0].art, 'fix');
  assert.match(v[0].grund, /Handyvertrag \+ Internet|Internet \+ Handyvertrag/);
});
