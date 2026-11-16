// DRK-Gehaltsrechner: Brutto nach DRK-Reformtarifvertrag (DRK-RTV), Netto nach Lohnsteuer-PAP 2026
// und den Sozialversicherungswerten 2026. Reine Rechnung, keine Oberfläche.
//
// Quellen (Stand der Recherche 15.11.2026):
// - Entgelttabelle ab 01.10.2026 und E 9c ab 01.10.2027: 52. Änderungstarifvertrag zum DRK-RTV vom 10.07.2025,
//   Anlage A 1 (btg.drk.de). Gegengeprüft mit oeffentlichen-dienst.de/entgelttabelle/drk.html.
// - Zeitzuschläge § 14 Abs. 2 DRK-RTV (durchgeschriebene Fassung idF 52. AETV, Stand Juli 2025):
//   Basis = Stundenanteil der niedrigsten Stufe der eigenen Entgeltgruppe; Sonntag 25 %, Feiertag 35 %,
//   24./31.12. ab 14 Uhr 35 %, Nachtarbeit (20–6 Uhr) 5,50 € je Stunde ab 01.01.2026.
// - Schichtzulage § 14 Abs. 7: 115,00 € je Monat ab 01.01.2026 (ständige Schichtarbeit).
// - Teilzeit § 29 Abs. 2: Tabellenentgelt und alle sonstigen Entgeltbestandteile anteilig (auch Schichtzulage).
// - Stundenanteil § 29 Abs. 3: Monatsbetrag ÷ (4,348 × regelmäßige Wochenarbeitszeit). Rettungsdienst 38,5 Std. (§ 12 Abs. 1).
// - Jahressonderzahlung § 23 Abs. 2 (ab 01.01.2026): 90 % des Durchschnitts Juli–September, mit dem Novembergehalt.
// - Sozialversicherung 2026: RV 18,6 %, AV 2,6 %, KV 14,6 % + Zusatzbeitrag (Ø 2,9 %), PV 3,6 % (+0,6 % kinderlos ab 23,
//   −0,25 % je Kind ab dem 2. bis 5., Sachsen AN 2,3 %); BBG KV/PV 5.812,50 €, RV/AV 8.450 € im Monat.
// - Steuerfreie SFN-Zuschläge § 3b EStG (Grundlohn höchstens 50 €/Std.), beitragsfrei bis Grundlohn 25 €/Std. (§ 1 SvEV).
// - v27 (nachgelesen 16.11.2026): Zeitzuschläge werden am Zahltag des zweiten Folgemonats fällig (§ 29 Abs. 1 Satz 3);
//   Jahressonderzahlung § 23 Abs. 2 und 4; Praxisanleitung § 23 a Abs. 1 (153,32 € ab 01.10.2026).
import { lohnsteuer2026, sonstigerBezug2026 } from './lohnsteuer.js';

// Monatsentgelte Vollzeit, Stufe 1–6 (null = Stufe gibt es nicht)
const T_2026_10 = {
  '15Ü': [7129.51, 7887.83, 8606.30, 9085.22, 9197.01, null],
  '15': [5855.89, 6238.80, 6665.95, 7249.09, 7848.92, 8243.58],
  '14': [5323.74, 5670.51, 6123.33, 6625.81, 7185.96, 7588.10],
  '13': [4924.69, 5304.71, 5737.31, 6207.03, 6759.72, 7059.67],
  '12': [4436.22, 4874.23, 5385.27, 5952.32, 6617.67, 6933.37],
  '11': [4286.32, 4692.33, 5070.29, 5480.30, 6041.47, 6357.19],
  '10': [4136.34, 4459.51, 4817.74, 5206.26, 5638.95, 5781.01],
  '9': [3786.07, 4048.71, 4218.53, 4713.09, 5003.05, 5338.93],
  '9a': [3786.07, 4048.71, 4048.71, 4218.53, 4218.53, 4713.09],
  '9b': [3492.24, 3703.40, 4048.71, 4218.53, 4218.53, 4713.09],
  '9c': [3709.89, 3864.09, 4128.82, 4496.55, 4671.72, 4914.85],
  '8': [3492.24, 3703.40, 3851.11, 4002.97, 4168.07, 4248.47],
  '7': [3245.83, 3446.01, 3718.77, 4002.97, 4168.07, 4248.47],
  '7a': [3245.83, 3446.01, 3586.40, 4002.97, 4168.07, 4248.47],
  '6': [3245.83, 3446.01, 3586.40, 3725.34, 3862.77, 3935.50],
  '6a': [3129.46, 3323.65, 3520.62, 3725.34, 3862.77, 3935.50],
  '6b': [3129.46, 3323.65, 3454.81, 3725.34, 3862.77, 3935.50],
  '5': [3129.46, 3323.65, 3454.81, 3593.73, 3722.81, 3789.61],
  '4': [2958.27, 3169.63, 3337.94, 3593.73, 3722.81, 3789.61],
  '3': [2958.27, 3169.63, 3221.04, 3338.62, 3426.82, 3507.66],
  '2': [2766.63, 2980.52, 3032.35, 3106.36, 3269.07, 3439.25],
  '1': [null, 2520.49, 2556.69, 2601.97, 2644.19, 2752.83]
};
// ab 01.10.2027 ändert sich nur E 9c (Stufe 4 +50 €, 5 +75 €, 6 +100 €; § 31 b Nr. 2 des 52. AETV)
const E9C_2027_10 = [3709.89, 3864.09, 4128.82, 4546.55, 4746.72, 5014.85];

export const GRUPPEN = Object.keys(T_2026_10);
export const SCHICHTZULAGE = 115;
export const NACHT_JE_STUNDE = 5.5;
export const PRAXISANLEITUNG = 153.32; // § 23 a Abs. 1 ab 01.10.2026 – bitte mit der eigenen Abrechnung vergleichen
// v28: Dienstpauschale § 23 b – je dienstplanmäßiger Schicht ab 6 Stunden bei verlängerter Arbeitszeit (§ 12 Abs. 6), 10 € seit 01.01.2026
export const DIENSTPAUSCHALE = 10;
// Zusatzversorgung (ZVK/VBL): Umlage des Arbeitgebers, die bis 100 € im Monat nur zum Teil und darüber ganz zum
// sozialversicherungspflichtigen Entgelt zählt (§ 1 Abs. 1 Satz 3 und 4 SvEV: 2,5 % des Entgelts abzüglich 13,30 €)
const ZV_GRENZE = 100, ZV_SATZ = 0.025, ZV_FREI = 13.3;
export function zvHinzurechnung(zvBrutto, agProzent) {
  const ag = (Number(agProzent) || 0) / 100;
  const umlage = r2((Number(zvBrutto) || 0) * ag);
  if (!(umlage > 0)) return { umlage: 0, hinzu: 0 };
  const hinzu = Math.max(0, umlage - ZV_GRENZE) + Math.max(0, Math.min(umlage, ZV_GRENZE) / ag * ZV_SATZ - ZV_FREI);
  return { umlage, hinzu: r2(hinzu) };
}
const FAKTOR_WOCHE = 4.348;
const BBG_KV = 5812.5, BBG_RV = 8450;

export function tabelle(ym) {
  const t = { ...T_2026_10 };
  if (ym >= '2027-10') t['9c'] = E9C_2027_10;
  return t;
}
export function tarifStand(ym) { return ym >= '2027-10' ? '01.10.2027 (nur E 9c neu)' : '01.10.2026'; }
export function stufen(eg, ym) { return tabelle(ym)[eg].map((w, i) => (w == null ? null : i + 1)).filter(Boolean); }

// Basis für Zeitzuschläge: Stufe 1 (niedrigste Stufe) der eigenen Gruppe; Sonderfälle § 14 Abs. 2 Satz 2a
const ZUSCHLAG_BASIS = { '9b': [3, '9a'], '7': [3, '8'], '6a': [3, '6'], '4': [3, '5'], '7a': [4, '8'], '6b': [4, '6'] };
export function zuschlagBasisMonat(eg, stufe, ym) {
  const t = tabelle(ym);
  const s = ZUSCHLAG_BASIS[eg];
  const gruppe = s && stufe >= s[0] ? s[1] : eg;
  return t[gruppe].find((w) => w != null);
}

const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const ab2 = (x) => Math.floor(x * 100 + 1e-7) / 100;

/**
 * @param {object} e Eingaben: eg, stufe, vz (Vollzeit-Wochenstunden, 38,5 im Rettungsdienst), tz (Teilzeit in %),
 *   schicht (bool), praxis (bool), zulage (€), besitz (€), nacht/sonntag/feiertag (Stunden im Monat),
 *   stkl, kinder (unter 25), ab23 (bool), zkf (Kinderfreibeträge), kvz (%), kirche (0 | 8 | 9), sachsen (bool),
 *   freibetrag (€ im Monat), abzug (€ im Monat, z. B. Eigenanteil Zusatzversorgung)
 * @param {string} ym Monat „2026-11“
 */
export function gehaltRechnen(e, ym) {
  const t = tabelle(ym);
  const reihe = t[e.eg] || t['9c'];
  const stufe = reihe[(e.stufe || 1) - 1] != null ? e.stufe : reihe.findIndex((w) => w != null) + 1;
  const tz = Math.min(100, Math.max(1, Number(e.tz) || 100)) / 100;
  const vz = Number(e.vz) || 38.5;

  const tabellenentgelt = r2(reihe[stufe - 1] * tz);
  const zulagen = [];
  // Teilzeit: alle Entgeltbestandteile anteilig (§ 29 Abs. 2 DRK-RTV) – auch die Zulagen
  if (e.schicht) zulagen.push([tz < 1 ? 'Schichtzulage (anteilig)' : 'Schichtzulage', r2(SCHICHTZULAGE * tz)]);
  if (e.praxis) zulagen.push([tz < 1 ? 'Praxisanleitung (anteilig)' : 'Praxisanleitung', r2(PRAXISANLEITUNG * tz)]);
  const pd = Math.max(0, Number(e.pauschalDienste) || 0);
  if (pd > 0) zulagen.push([`Dienstpauschale · ${String(pd).replace('.', ',')} ${pd === 1 ? 'Schicht' : 'Schichten'}`, r2(pd * DIENSTPAUSCHALE)]);
  if (e.besitz > 0) zulagen.push(['Besitzstand', r2(e.besitz)]);
  if (e.zulage > 0) zulagen.push(['Weitere Zulagen', r2(e.zulage)]);
  const zulagenSumme = r2(zulagen.reduce((a, z) => a + z[1], 0));

  const basisStunde = zuschlagBasisMonat(e.eg, stufe, ym) / (FAKTOR_WOCHE * vz);
  const zuschlaege = [];
  // v27: Nachtstunden zwischen 0 und 4 Uhr sind bis 40 % des Grundlohns steuerfrei (§ 3b Abs. 3 EStG), sonst 25 %
  const n04 = Math.min(Number(e.nacht04) || 0, Number(e.nacht) || 0);
  const nRest = (Number(e.nacht) || 0) - n04;
  if (nRest > 0) zuschlaege.push({ id: 'nacht', name: 'Nachtzuschlag', stunden: nRest, satz: NACHT_JE_STUNDE, betrag: r2(nRest * NACHT_JE_STUNDE), frei: 0.25 });
  if (n04 > 0) zuschlaege.push({ id: 'nacht04', name: 'Nachtzuschlag 0–4 Uhr', stunden: n04, satz: NACHT_JE_STUNDE, betrag: r2(n04 * NACHT_JE_STUNDE), frei: 0.4 });
  if (e.sonntag > 0) zuschlaege.push({ id: 'sonntag', name: 'Sonntagszuschlag', stunden: e.sonntag, prozent: 25, betrag: r2(e.sonntag * basisStunde * 0.25), frei: 0.5 });
  if (e.feiertag > 0) zuschlaege.push({ id: 'feiertag', name: 'Feiertagszuschlag', stunden: e.feiertag, prozent: 35, betrag: r2(e.feiertag * basisStunde * 0.35), frei: 1.25 });
  if (e.vorfest > 0) zuschlaege.push({ id: 'vorfest', name: 'Zuschlag 24./31.12. ab 14 Uhr', stunden: e.vorfest, prozent: 35, betrag: r2(e.vorfest * basisStunde * 0.35), frei: 1.25 });
  const zuschlaegeSumme = r2(zuschlaege.reduce((a, z) => a + z.betrag, 0));

  const brutto = r2(tabellenentgelt + zulagenSumme + zuschlaegeSumme);

  // § 3b EStG: Grundlohn = laufender Lohn für die regelmäßige Arbeitszeit, je Stunde
  const grundlohn = (tabellenentgelt + zulagenSumme) / (FAKTOR_WOCHE * vz * tz);
  let steuerfrei = 0, svfrei = 0;
  for (const z of zuschlaege) {
    steuerfrei += Math.min(z.betrag, z.stunden * z.frei * Math.min(grundlohn, 50));
    svfrei += Math.min(z.betrag, z.stunden * z.frei * Math.min(grundlohn, 25));
  }
  steuerfrei = r2(steuerfrei); svfrei = r2(svfrei);
  const steuerBrutto = r2(brutto - steuerfrei);
  // v28 Zusatzversorgung: Eigenanteil vom Netto, Umlage des Arbeitgebers erhöht das SV-Entgelt (nicht das Steuer-Brutto)
  const zv = zvHinzurechnung(steuerBrutto, e.zvkAg);
  const zvkAn = r2(steuerBrutto * (Number(e.zvkAn) || 0) / 100);
  const svBrutto = r2(brutto - svfrei + zv.hinzu);

  // Steuer nach PAP 2026
  const kinder = Math.max(0, Math.floor(Number(e.kinder) || 0));
  const pvz = kinder === 0 && e.ab23 !== false ? 1 : 0;
  const pva = kinder >= 2 ? Math.min(4, kinder - 1) : 0;
  const pap = { LZZ: 2, RE4: Math.round(steuerBrutto * 100), STKL: Number(e.stkl) || 1, KVZ: Number(e.kvz) || 0, PVZ: pvz, PVA: pva,
    PVS: e.sachsen ? 1 : 0, ZKF: Number(e.zkf) || 0, R: e.kirche > 0 ? 1 : 0, LZZFREIB: Math.round((Number(e.freibetrag) || 0) * 100) };
  const st = lohnsteuer2026(pap);
  const lohnsteuer = st.LSTLZZ / 100, soli = st.SOLZLZZ / 100;
  const kirchensteuer = e.kirche > 0 ? ab2(st.BK / 100 * e.kirche / 100) : 0;

  // Sozialversicherung (Arbeitnehmeranteil)
  const pvSatz = (e.sachsen ? 0.023 : 0.018) + (pvz ? 0.006 : 0) - pva * 0.0025;
  const kvSatz = 0.073 + (Number(e.kvz) || 0) / 200;
  const kvBasis = Math.min(svBrutto, BBG_KV), rvBasis = Math.min(svBrutto, BBG_RV);
  const kv = r2(kvBasis * kvSatz), pv = r2(kvBasis * pvSatz), rv = r2(rvBasis * 0.093), av = r2(rvBasis * 0.013);
  const abzug = r2(Number(e.abzug) || 0);

  const abzuege = r2(lohnsteuer + soli + kirchensteuer + kv + pv + rv + av + zvkAn + abzug);
  const netto = r2(brutto - abzuege);

  // Jahressonderzahlung (November): 90 % des Monatsentgelts, Steuer als sonstiger Bezug, SV mit anteiliger Jahres-BBG
  const jsz = r2(brutto * 0.9);
  const sb = sonstigerBezug2026(pap, Math.round(jsz * 100));
  const jszKist = e.kirche > 0 ? ab2(sb.BK / 100 * e.kirche / 100) : 0;
  const restKV = Math.max(0, 11 * BBG_KV - 11 * svBrutto), restRV = Math.max(0, 11 * BBG_RV - 11 * svBrutto);
  // Umlage auf eine Einmalzahlung zählt ganz zum SV-Entgelt (die 100 € sind durch das Monatsentgelt schon verbraucht)
  const jszSvBasis = jsz + r2(jsz * (Number(e.zvkAg) || 0) / 100);
  const jszSV = r2(Math.min(jszSvBasis, restKV) * (kvSatz + pvSatz)) + r2(Math.min(jszSvBasis, restRV) * 0.106);
  const jszNetto = r2(jsz - sb.LST / 100 - sb.SOLZ / 100 - jszKist - jszSV - r2(jsz * (Number(e.zvkAn) || 0) / 100));

  return {
    stufe, tarif: tarifStand(ym), tabellenentgelt, zulagen, zulagenSumme, zuschlaege, zuschlaegeSumme, basisStunde: r2(basisStunde), basisMonat: zuschlagBasisMonat(e.eg, stufe, ym), grundlohn: r2(grundlohn), vz, tz, vollzeit: reihe[stufe - 1], brutto,
    steuerfrei, svfrei, steuerBrutto, svBrutto,
    lohnsteuer, soli, kirchensteuer, kv, pv, rv, av, abzug, abzuege, netto, zvkAn, zvUmlage: zv.umlage, zvHinzu: zv.hinzu,
    satz: { kv: kvSatz, pv: pvSatz }, pvz, pva,
    jsz, jszNetto
  };
}

export const STANDARD = { eg: '9c', stufe: 3, vz: '38,5', tz: '100', schicht: true, praxis: false, zulageText: '', besitzText: '',
  nachtText: '', sonntagText: '', feiertagText: '', stkl: 1, kinder: 0, ab23: true, zkfText: '0', kvzText: '2,9', kirche: 0, sachsen: false,
  freibetragText: '', abzugText: '', offenZaehlt: '1', dienstText: '', zvkAnText: '', zvkAgText: '' };

// ---------- v27: Eingaben aus dem gemerkten Gehaltsrechner (Texte → Zahlen) ----------
function zahlAus(text) {
  if (text == null) return NaN;
  const t = String(text).replace(/[€\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  return t === '' ? NaN : Number(t);
}
const nz = (t) => { const n = zahlAus(t); return isNaN(n) ? 0 : n; };
// Felder, die „unbekannt“ sein dürfen: [Name, true = erhöht das Netto]
export const OFFENE_FELDER = { zulageText: ['Weitere Zulagen', true], besitzText: ['Besitzstand', true], nachtText: ['Nachtstunden', true], sonntagText: ['Sonntagsstunden', true], feiertagText: ['Feiertagsstunden', true], abzugText: ['Weitere Abzüge', false] };
// modus: 'aus' = offene Felder zählen 0 · 'min' = ungünstig (wenig Zuschläge, hohe Abzüge) · 'max' = günstig
export function feldWert(e, f, modus) {
  if (!e[f + 'Offen']) return nz(e[f]);
  const lies = (t) => (String(t == null ? '' : t).trim() === '' ? null : zahlAus(t));
  let von = lies(e[f + 'Von']), bis = lies(e[f + 'Bis']);
  if (von == null && bis == null) return 0;
  if (von == null || isNaN(von)) von = bis; if (bis == null || isNaN(bis)) bis = von;
  if (modus === 'aus' || isNaN(von)) return 0;
  if (bis < von) [von, bis] = [bis, von];
  return (modus === 'max') === OFFENE_FELDER[f][1] ? bis : von;
}
export function eingaben(e, modus = String(e.offenZaehlt) === '0' ? 'aus' : 'min') {
  const w = (f) => feldWert(e, f, modus);
  return { eg: e.eg, stufe: Number(e.stufe) || 1, vz: nz(e.vz) || 38.5, tz: nz(e.tz) || 100, schicht: !!e.schicht, praxis: !!e.praxis,
    zulage: w('zulageText'), besitz: w('besitzText'), nacht: w('nachtText'), sonntag: w('sonntagText'), feiertag: w('feiertagText'),
    stkl: Number(e.stkl) || 1, kinder: nz(e.kinder), ab23: e.ab23 !== false, zkf: nz(e.zkfText), kvz: nz(e.kvzText),
    kirche: Number(e.kirche) || 0, sachsen: !!e.sachsen, freibetrag: nz(e.freibetragText), abzug: w('abzugText'),
    pauschalDienste: nz(e.dienstText), zvkAn: nz(e.zvkAnText), zvkAg: nz(e.zvkAgText) };
}

// ---------- v27: Woher kommt jede Zahl? ----------
// Liefert zu einer Rechnung jede Zeile mit Rechenweg und Fundstelle. `stand` = wann zuletzt am Text nachgelesen.
const de = (x, n = 2) => Number(x).toLocaleString('de-DE', { minimumFractionDigits: n, maximumFractionDigits: n });
const std = (x) => String(Math.round(x * 100) / 100).replace('.', ',');
export const QUELLEN_STAND = '16.11.2026';
export const QUELLEN = {
  rtv: { titel: 'DRK-Reformtarifvertrag (DRK-RTV), durchgeschriebene Fassung in der Fassung des 52. Änderungstarifvertrags', stand: 'Stand Juli 2025, nachgelesen am 16.11.2026', wo: 'drk.de → Das DRK → Verbandsstruktur (PDF „DRK-RTV idF 52. ÄTV“)' },
  aetv: { titel: '52. Änderungstarifvertrag zum DRK-RTV vom 10.07.2025, Anlage A 1 (Entgelttabelle)', stand: 'nachgelesen am 15.11.2026', wo: 'btg.drk.de; gegengeprüft mit oeffentlichen-dienst.de/entgelttabelle/drk.html' },
  pap: { titel: 'Programmablaufplan für den Lohnsteuerabzug 2026 (Bundesfinanzministerium)', stand: 'BMF-Schreiben vom 12.11.2025; centgenau gegen 207 Vergleichsfälle der BMF-Schnittstelle geprüft', wo: 'bundesfinanzministerium.de → Lohnsteuer → Programmablaufplan' },
  sv: { titel: 'Sozialversicherung 2026: Beitragssätze und Beitragsbemessungsgrenzen', stand: 'Werte für 2026, eingebaut am 15.11.2026', wo: 'SGB V, SGB VI, SGB XI, SGB III; Sozialversicherungsrechengrößen-Verordnung 2026' },
  estg: { titel: 'Einkommensteuergesetz § 3b und Sozialversicherungsentgeltverordnung § 1', stand: 'eingebaut am 15.11.2026', wo: 'gesetze-im-internet.de' },
  zv: { titel: 'Zusatzversorgung: § 30 DRK-RTV, § 1 Abs. 1 Satz 3 und 4 SvEV, § 3 Nr. 56 EStG', stand: 'nachgelesen am 16.11.2026; an einer echten Abrechnung auf den Cent nachgerechnet', wo: 'gesetze-im-internet.de; Sätze (Umlage, Eigenanteil) stehen auf deiner Abrechnung' }
};
export function rechenweg(e, ym) {
  const r = gehaltRechnen(e, ym);
  const z = [];
  const teiler = `4,348 × ${std(r.vz)} Std.`;
  z.push({ teil: 'Brutto', name: `Tabellenentgelt E ${e.eg} Stufe ${r.stufe}`, betrag: r.tabellenentgelt,
    weg: r.tz < 1 ? `${de(r.vollzeit)} € × ${std(r.tz * 100)} % Teilzeit` : `${de(r.vollzeit)} € laut Tabelle ab ${r.tarif}`,
    fund: '§ 19 Abs. 1 DRK-RTV, Anlage A 1' + (r.tz < 1 ? ' · Teilzeit: § 29 Abs. 2' : ''), q: 'aetv' });
  for (const [n, b] of r.zulagen) {
    if (n.startsWith('Schichtzulage')) z.push({ teil: 'Brutto', name: n, betrag: b, weg: r.tz < 1 ? `${de(SCHICHTZULAGE)} € × ${std(r.tz * 100)} %` : `${de(SCHICHTZULAGE)} € je Monat (seit 01.01.2026)`, fund: '§ 14 Abs. 7 DRK-RTV · Schichtarbeit: § 13 Abs. 2', q: 'rtv' });
    else if (n.startsWith('Dienstpauschale')) z.push({ teil: 'Brutto', name: n, betrag: b, weg: `${std(b / DIENSTPAUSCHALE)} × ${de(DIENSTPAUSCHALE)} € je Schicht ab 6 Stunden (seit 01.01.2026)`, fund: '§ 23 b DRK-RTV · nur bei verlängerter Arbeitszeit nach § 12 Abs. 6', q: 'rtv', hinweis: 'Auf der Abrechnung „Pauschale nach § 23 b“, auf der Monatsübersicht Lohnart 258.' });
    else if (n.startsWith('Praxisanleitung')) z.push({ teil: 'Brutto', name: n, betrag: b, weg: r.tz < 1 ? `${de(PRAXISANLEITUNG)} € × ${std(r.tz * 100)} %` : `${de(PRAXISANLEITUNG)} € je Monat (seit 01.10.2026)`, fund: '§ 23 a Abs. 1 DRK-RTV', q: 'rtv', hinweis: 'Nur mit schriftlicher Anordnung und nur für die Dauer der Anleitung.' });
    else z.push({ teil: 'Brutto', name: n, betrag: b, weg: 'von dir eingetragen', fund: n === 'Besitzstand' ? 'Überleitungstarifvertrag (TVÜ-DRK) – Betrag von deiner Abrechnung' : 'eigene Angabe', q: null });
  }
  const FUND = { nacht: '§ 14 Abs. 2 Satz 3 DRK-RTV · Nacht = 20 bis 6 Uhr (§ 13 Abs. 6)', nacht04: '§ 14 Abs. 2 Satz 3 DRK-RTV · Nacht = 20 bis 6 Uhr (§ 13 Abs. 6)', sonntag: '§ 14 Abs. 2 Satz 2 Buchst. b DRK-RTV', feiertag: '§ 14 Abs. 2 Satz 2 Buchst. c DRK-RTV', vorfest: '§ 14 Abs. 2 Satz 2 Buchst. d DRK-RTV' };
  for (const x of r.zuschlaege) {
    z.push({ teil: 'Brutto', name: x.name, betrag: x.betrag, q: 'rtv', fund: FUND[x.id],
      weg: x.prozent ? `${std(x.stunden)} Std. × ${de(r.basisStunde)} € × ${x.prozent} %` : `${std(x.stunden)} Std. × ${de(x.satz)} €` });
  }
  if (r.zuschlaege.some((x) => x.prozent)) z.push({ teil: 'Brutto', name: 'Grundlage der Prozent-Zuschläge', info: true, betrag: null, weg: `${de(r.basisMonat)} € (niedrigste Stufe der Gruppe) ÷ (${teiler}) = ${de(r.basisStunde)} € je Stunde`, fund: '§ 14 Abs. 2 Satz 2 und 2a · Stundenanteil: § 29 Abs. 3 Satz 3 DRK-RTV', q: 'rtv' });
  z.push({ teil: 'Brutto', name: 'Brutto', betrag: r.brutto, summe: true, weg: 'Tabellenentgelt + Zulagen + Zeitzuschläge', fund: '', q: null });
  if (r.steuerfrei > 0) z.push({ teil: 'Steuer', name: 'Steuerfreie Zuschläge', info: true, betrag: r.steuerfrei, weg: `Grundlohn ${de(r.grundlohn)} € je Std.; frei bis Nacht 25 % (0–4 Uhr 40 %), Sonntag 50 %, Feiertag 125 % davon${r.svfrei < r.steuerfrei ? ` · beitragsfrei nur ${de(r.svfrei)} €` : ' · auch beitragsfrei'}`, fund: '§ 3b EStG (Grundlohn höchstens 50 €) · beitragsfrei bis 25 € Grundlohn: § 1 Abs. 1 Satz 1 Nr. 1 SvEV', q: 'estg' });
  z.push({ teil: 'Steuer', name: 'Lohnsteuer', betrag: -r.lohnsteuer, weg: `aus ${de(r.steuerBrutto)} € steuerpflichtigem Monatslohn, Steuerklasse ${['I', 'II', 'III', 'IV', 'V', 'VI'][(Number(e.stkl) || 1) - 1]}`, fund: '§ 39b EStG · Programmablaufplan 2026', q: 'pap' });
  if (r.soli > 0) z.push({ teil: 'Steuer', name: 'Solidaritätszuschlag', betrag: -r.soli, weg: '5,5 % der Lohnsteuer, erst über der Freigrenze', fund: '§§ 3, 4 Solidaritätszuschlaggesetz · Programmablaufplan 2026', q: 'pap' });
  if (r.kirchensteuer > 0) z.push({ teil: 'Steuer', name: 'Kirchensteuer', betrag: -r.kirchensteuer, weg: `${e.kirche} % der Lohnsteuer (mit Kinderfreibeträgen gerechnet)`, fund: 'Kirchensteuergesetz des Landes (8 % in BW und BY, sonst 9 %)', q: 'pap' });
  const p = (x) => String(Math.round(x * 10000) / 100).replace('.', ',') + ' %';
  const kvB = Math.min(r.svBrutto, BBG_KV), rvB = Math.min(r.svBrutto, BBG_RV);
  z.push({ teil: 'Versicherung', name: 'Krankenversicherung', betrag: -r.kv, weg: `${de(kvB)} € × ${p(r.satz.kv)} (halbe 14,6 % + halber Zusatzbeitrag ${std(Number(e.kvz) || 0)} %)`, fund: '§§ 241, 242, 249 SGB V', q: 'sv' });
  z.push({ teil: 'Versicherung', name: 'Pflegeversicherung', betrag: -r.pv, weg: `${de(kvB)} € × ${p(r.satz.pv)}${r.pvz ? ' (mit 0,6 % Zuschlag für Kinderlose ab 23)' : r.pva ? ` (Abschlag für ${r.pva + 1} Kinder)` : ''}`, fund: '§ 55 SGB XI', q: 'sv' });
  z.push({ teil: 'Versicherung', name: 'Rentenversicherung', betrag: -r.rv, weg: `${de(rvB)} € × 9,3 % (halbe 18,6 %)`, fund: '§ 158 SGB VI', q: 'sv' });
  z.push({ teil: 'Versicherung', name: 'Arbeitslosenversicherung', betrag: -r.av, weg: `${de(rvB)} € × 1,3 % (halbe 2,6 %)`, fund: '§ 341 SGB III', q: 'sv' });
  if (r.svBrutto > BBG_KV) z.push({ teil: 'Versicherung', name: 'Beitragsbemessungsgrenzen', info: true, betrag: null, weg: `Kranken/Pflege höchstens aus ${de(BBG_KV)} €, Rente/Arbeitslos aus ${de(BBG_RV)} € im Monat`, fund: 'Sozialversicherungsrechengrößen-Verordnung 2026', q: 'sv' });
  if (r.zvHinzu > 0) z.push({ teil: 'Versicherung', name: 'Umlage zur Zusatzversorgung zählt mit', info: true, betrag: r.zvHinzu, weg: `Dein Arbeitgeber zahlt ${std(Number(e.zvkAg))} % Umlage = ${de(r.zvUmlage)} €. Davon erhöhen ${de(r.zvHinzu)} € das Entgelt, aus dem die vier Versicherungen berechnet werden (${de(r.svBrutto)} € statt ${de(r2(r.svBrutto - r.zvHinzu))} €). Steuer fällt darauf nicht an.`, fund: '§ 1 Abs. 1 Satz 3 und 4 SvEV (über 100 € ganz; bis 100 €: 2,5 % des Entgelts abzüglich 13,30 €) · steuerfrei: § 3 Nr. 56 EStG', q: 'zv' });
  if (r.zvkAn > 0) z.push({ teil: 'Versicherung', name: 'Zusatzversorgung: dein Eigenanteil', betrag: -r.zvkAn, weg: `${de(r.steuerBrutto)} € × ${std(Number(e.zvkAn))} %`, fund: '§ 30 DRK-RTV (Versicherung „unter eigener Beteiligung“) · Satz laut Satzung deiner Zusatzversorgungskasse', q: 'zv' });
  if (r.abzug > 0) z.push({ teil: 'Versicherung', name: 'Weitere Abzüge', betrag: -r.abzug, weg: 'von dir eingetragen', fund: 'eigene Angabe', q: null });
  z.push({ teil: 'Netto', name: 'Netto', betrag: r.netto, summe: true, weg: 'Brutto − Steuern − Versicherungen − Eigenanteil Zusatzversorgung − weitere Abzüge', fund: '', q: null });
  z.push({ teil: 'Jahressonderzahlung', name: 'Jahressonderzahlung (November)', betrag: r.jsz, weg: `90 % von ${de(r.brutto)} € – genau: 90 % vom Durchschnitt Juli bis September`, fund: '§ 23 Abs. 2 und 4 DRK-RTV', q: 'rtv', hinweis: 'Voraussetzung: ungekündigt am 1. Dezember und seit 1. Juni beschäftigt (§ 23 Abs. 1).' });
  return { r, zeilen: z };
}
