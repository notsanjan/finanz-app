import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gehaltRechnen, tabelle, zuschlagBasisMonat, stufen } from '../www/js/drk.js';
import { lohnsteuer2026 } from '../www/js/lohnsteuer.js';

const basis = { eg: '9c', stufe: 3, vz: 38.5, tz: 100, stkl: 1, kinder: 0, ab23: true, zkf: 0, kvz: 2.9, kirche: 0 };

test('Tabelle: E 9c ab 10/2026 und die Erhöhung ab 10/2027', () => {
  assert.equal(tabelle('2026-11')['9c'][2], 4128.82);
  assert.equal(tabelle('2026-11')['9c'][5], 4914.85);
  assert.equal(tabelle('2027-10')['9c'][5], 5014.85);
  assert.equal(tabelle('2027-10')['9c'][3], 4546.55);
  assert.deepEqual(stufen('1', '2026-11'), [2, 3, 4, 5, 6]);
});

test('Zeitzuschläge: Basis Stufe 1, Sonderfall E 9b ab Stufe 3 = E 9a Stufe 1', () => {
  assert.equal(zuschlagBasisMonat('9c', 5, '2026-11'), 3709.89);
  assert.equal(zuschlagBasisMonat('9b', 2, '2026-11'), 3492.24);
  assert.equal(zuschlagBasisMonat('9b', 3, '2026-11'), 3786.07);
  const r = gehaltRechnen({ ...basis, nacht: 40, sonntag: 16 }, '2026-11');
  assert.equal(r.basisStunde, 22.16); // 3709,89 / (4,348 × 38,5)
  assert.equal(r.zuschlaege[0].betrag, 220); // 40 × 5,50 €
  assert.equal(r.steuerfrei, r.zuschlaege.reduce((a, z) => a + z.betrag, 0)); // alles unter den § 3b-Grenzen
});

test('Netto: Abzüge passen zusammen, Lohnsteuer kommt aus dem PAP', () => {
  const r = gehaltRechnen({ ...basis, schicht: true }, '2026-11');
  assert.equal(r.brutto, 4243.82);
  assert.equal(r.lohnsteuer, lohnsteuer2026({ LZZ: 2, RE4: 424382, STKL: 1, KVZ: 2.9, PVZ: 1 }).LSTLZZ / 100);
  assert.equal(r.rv, Math.round(4243.82 * 0.093 * 100) / 100);
  assert.equal(r.satz.pv, 0.024); // 1,8 % + 0,6 % kinderlos
  assert.equal(Math.round((r.brutto - r.netto) * 100), Math.round(r.abzuege * 100));
  const kind = gehaltRechnen({ ...basis, schicht: true, kinder: 3 }, '2026-11');
  assert.equal(kind.satz.pv, 0.018 - 2 * 0.0025);
});

test('Teilzeit halbiert das Tabellenentgelt, nicht die Zuschlagsbasis je Stunde', () => {
  const r = gehaltRechnen({ ...basis, tz: 50, nacht: 10 }, '2026-11');
  assert.equal(r.tabellenentgelt, 2064.41);
  assert.equal(r.basisStunde, 22.16);
  const z = gehaltRechnen({ ...basis, tz: 50, schicht: true }, '2026-11');
  assert.deepEqual(z.zulagen[0], ['Schichtzulage (anteilig)', 57.5]); // § 29 Abs. 2: Zulagen anteilig
});
