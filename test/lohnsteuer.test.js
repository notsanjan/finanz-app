// Prüft die Lohnsteuer-Übertragung gegen Ergebnisse der amtlichen BMF-Schnittstelle 2026.
// Testdaten: test/daten/bmf-lohnsteuer-2026.json (zwischengespeicherte Antworten von
// https://www.bmf-steuerrechner.de/interface/2026Version1.xhtml, aus canida-software/lohnsteuer, MIT-Lizenz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lohnsteuer2026 } from '../www/js/lohnsteuer.js';

const faelle = JSON.parse(readFileSync(new URL('./daten/bmf-lohnsteuer-2026.json', import.meta.url)));

test('Lohnsteuer 2026: alle BMF-Vergleichsfälle centgenau', () => {
  let geprueft = 0; const falsch = [];
  for (const f of faelle) {
    const r = lohnsteuer2026(f.inputs);
    for (const k of ['LSTLZZ', 'SOLZLZZ', 'BK']) {
      if (r[k] !== f.expected[k]) falsch.push(`${JSON.stringify(f.inputs)} ${k}: ${r[k]} statt ${f.expected[k]}`);
    }
    geprueft++;
  }
  assert.equal(falsch.length, 0, falsch.slice(0, 10).join('\n'));
  assert.ok(geprueft > 200);
});

test('Lohnsteuer 2026: Beispiel 5.000 € Monat, Klasse I, Zusatzbeitrag 2,5 %, kinderlos = 785,83 €', () => {
  const r = lohnsteuer2026({ LZZ: 2, RE4: 500000, STKL: 1, KVZ: 2.5, PVZ: 1 });
  assert.equal(r.LSTLZZ, 78583);
  assert.equal(r.SOLZLZZ, 0);
});

test('Kirchensteuer-Bemessung: ohne Kinder gleich der Lohnsteuer, mit Kinderfreibetrag kleiner', () => {
  const ohne = lohnsteuer2026({ LZZ: 2, RE4: 420000, STKL: 1, KVZ: 2.9, PVZ: 1, R: 1 });
  assert.equal(ohne.BK, ohne.LSTLZZ);
  const mit = lohnsteuer2026({ LZZ: 2, RE4: 420000, STKL: 1, KVZ: 2.9, R: 1, ZKF: 1 });
  assert.ok(mit.BK < mit.LSTLZZ);
});
