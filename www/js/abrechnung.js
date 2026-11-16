// v29: Brutto-Netto-Abrechnung (PDF, als Textzeilen je Blatt) lesen und mit dem Gehaltsrechner vergleichen.
// Reine Rechnung, keine Oberfläche. Gelesen werden nur Beträge, Stunden und die Eingruppierung –
// Personalnummer, Sozialversicherungsnummer, Steuer-ID, Anschrift und Bankverbindung werden nicht ausgewertet und nie gespeichert.
//
// Bekanntes Format: „Abrechnung der Brutto/Netto-Bezüge“ (Formular LOGO18), ein Blatt je Monat, dazu Blätter
// „für Sep 2026 (1. NB)“ für Nachberechnungen. Andere Formulare werden abgelehnt, statt falsch gelesen.
import * as R from './rechnen.js';
import * as DRK from './drk.js';
import * as DI from './dienste.js';

const MONATE = { januar: 1, jan: 1, februar: 2, feb: 2, 'märz': 3, 'mär': 3, mrz: 3, april: 4, apr: 4, mai: 5, juni: 6, jun: 6, juli: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11, dezember: 12, dez: 12 };
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
// „1.234,56“, „12,34-“ → Zahl
export function geld(t) {
  const m = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(-?)$/.exec(String(t || ''));
  if (!m) return NaN;
  const v = Number(m[2].replace(/\./g, '') + '.' + m[3]);
  return m[1] || m[4] ? -v : v;
}
// Felder ohne Komma: „1.23456“ = 1.234,56 · „45678“ = 456,78
export function kompakt(t) {
  if (!/^\d[\d.]*$/.test(String(t || ''))) return NaN;
  return Number(String(t).replace(/\./g, '')) / 100;
}
const EINHEIT = new Set(['Std', 'T', 'Km', 'St', 'EUR', 'Tsd', 'Mio']);
const KENNZ = /^[LSFEPAMNVWHJ]$/;

export function lohnartArt(nr, name, imBrutto) {
  const n = name.toLowerCase();
  if (!imBrutto) return /uml/.test(n) ? 'umlage' : 'arbeitgeber';
  if (nr === '120' || /tabellenentgelt/.test(n)) return 'tabelle';
  if (nr === '258' || /pauschale nach|23 ?b/.test(n)) return 'pauschale';
  if (/schichtzulage/.test(n)) return 'schicht';
  if (/praxisanl/.test(n)) return 'praxis';
  if (/nacht.*0 ?[-–] ?4/.test(n)) return 'nacht04';
  if (/nacht/.test(n)) return 'nacht';
  if (/sonntag/.test(n)) return 'sonntag';
  if (/heilig|silvester|vorfest/.test(n)) return 'vorfest';
  if (/feiertag/.test(n)) return 'feiertag';
  if (/besitzstand/.test(n)) return 'besitz';
  return 'sonst';
}
function lohnart(z) {
  const m = /^(N\s+)?(\d{3})\s+(.+)$/.exec(z);
  if (!m) return null;
  const t = m[3].split(' ');
  const betrag = geld(t[t.length - 1]);
  if (isNaN(betrag) || t.length < 2) return null;
  const rest = t.slice(0, -1);
  let i = rest.findIndex((x) => EINHEIT.has(x) || !isNaN(geld(x)) || KENNZ.test(x));
  if (i < 0) i = rest.length;
  const name = rest.slice(0, i).join(' ');
  if (!name) return null;
  const hinten = rest.slice(i);
  const zahlen = hinten.filter((x) => !isNaN(geld(x))).map(geld);
  const kennz = hinten.filter((x) => KENNZ.test(x));
  const mitEinheit = EINHEIT.has(hinten[0]);
  const imBrutto = kennz.includes('J');
  return { nr: m[2], name, nach: !!m[1], betrag, einheit: mitEinheit ? hinten[0] : null, menge: mitEinheit && zahlen.length ? zahlen[0] : null, faktor: mitEinheit && zahlen.length > 1 ? zahlen[1] : null,
    prozent: !mitEinheit && zahlen.length ? zahlen[0] : null, imBrutto, einmal: kennz.length >= 3 && kennz[0] === 'S', steuerfrei: imBrutto && kennz.length < 3, art: lohnartArt(m[2], name, imBrutto) };
}

function blattLesen(zeilen) {
  const l = zeilen.map((x) => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const kopf = l.find((x) => /Abrechnung der Brutto\/Netto-Bezüge/i.test(x));
  if (!kopf) return null;
  const m = /für\s+([A-Za-zäöüÄÖÜ]+)\.?\s+(\d{4})(?:\s*\((\d+)\.\s*NB\))?(?:\s+(\d{2})\.(\d{2})\.(\d{4}))?/.exec(kopf);
  const mon = m && MONATE[m[1].toLowerCase()];
  if (!mon) return null;
  const b = { monat: m[2] + '-' + R.zweistellig(mon), nb: m[3] ? Number(m[3]) : 0, datum: m[4] ? `${m[6]}-${m[5]}-${m[4]}` : null, lohnarten: [], steuer: [], sv: [], nettoPosten: [], ausNB: [] };
  const idx = (re) => l.findIndex((x) => re.test(x));
  // Eingruppierung, Steuerklasse, Wochenstunden
  const g = l.map((x) => /^Gruppe\/Stufe\s+(.+?)\s*\/\s*(\d)\b/.exec(x)).find(Boolean);
  if (g) { b.eg = g[1].replace(/\s+/g, '').replace(/^E/i, ''); b.stufe = Number(g[2]); }
  const ip = idx(/^Personal-Nr\./);
  if (ip >= 0 && l[ip + 1]) { const t = l[ip + 1].split(' '); if (/^[1-6]$/.test(t[2] || '')) b.stkl = Number(t[2]); }
  const w = l.map((x) => /Wöch\.Arb\.Zt\.\s+(\d+,\d+)/.exec(x)).find(Boolean);
  if (w) b.wochenstd = geld(w[1]);
  const ib = idx(/^Brutto-Bezüge/);
  const zb = l.slice(0, ib < 0 ? l.length : ib).map((x) => /ZVK-\/VBLU-Brutto\s+([\d.]+)$/.exec(x)).find(Boolean);
  if (zb) b.zvkBrutto = kompakt(zb[1]);
  // Lohnarten: zwischen der Kopfzeile der Tabelle und „Gesamt-Brutto“
  const il = idx(/^Lohnart Bezeichnung/), ig = l.findIndex((x, i) => i > il && /^Gesamt-Brutto$/.test(x));
  if (il >= 0) for (const x of l.slice(il + 1, ig < 0 ? l.length : ig)) { const a = lohnart(x); if (a) b.lohnarten.push(a); }
  const gb = l.map((x) => /^Steuer\/Sozialversicherung\s+(\S+)$/.exec(x)).find(Boolean);
  if (gb && !isNaN(geld(gb[1]))) b.gesamtBrutto = geld(gb[1]);
  // Steuer- und SV-Zeilen (L = laufend, S = sonstiger Bezug, N = Nachberechnung)
  const ist = idx(/^St 4 Steuer-Brutto/), isv = idx(/^SV 4 KV-Brutto/), inv = idx(/^Netto-Verdienst$/);
  const zahlZeile = (x) => { const mm = /^([LSNE])\s+(.+)$/.exec(x); if (!mm) return null; return { art: mm[1], t: mm[2].split(' ').filter((y) => !/^[A-Z]$/.test(y)) }; };
  if (ist >= 0 && isv > ist) for (const x of l.slice(ist + 1, isv)) {
    const z = zahlZeile(x); if (!z || z.t.length < 3) continue;
    const summe = geld(z.t[z.t.length - 1]); if (isNaN(summe)) continue;
    const mitte = z.t.slice(1, -1).map(kompakt);
    b.steuer.push({ art: z.art, brutto: kompakt(z.t[0]), lohnsteuer: mitte[0], weitere: r2(mitte.slice(1).reduce((a, y) => a + (y || 0), 0)), summe });
  }
  if (isv >= 0) for (const x of l.slice(isv + 1, inv < 0 ? l.length : inv)) {
    const z = zahlZeile(x); if (!z || z.t.length !== 9) continue;
    const v = z.t.slice(0, 8).map(kompakt); const summe = geld(z.t[8]);
    if (v.some(isNaN) || isNaN(summe)) continue;
    b.sv.push({ art: z.art, kvBrutto: v[0], rvBrutto: v[1], avBrutto: v[2], pvBrutto: v[3], kv: v[4], rv: v[5], av: v[6], pv: v[7], summe });
  }
  for (const x of l) {
    let mm = /Netto-Bezüge\/Netto-Abzüge\s+(\S+)$/.exec(x); if (mm && !isNaN(geld(mm[1]))) b.nettoVerdienst = geld(mm[1]);
    mm = /(?:^|\s)(N?)(\d{4})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.\- ]*?)\s+(\S+)$/.exec(x); if (mm && !isNaN(geld(mm[4]))) b.nettoPosten.push({ nr: mm[2], nach: !!mm[1], name: mm[3], betrag: geld(mm[4]) });
    mm = /aus NB (\d{2})\/(\d{4})\s+(\S+)$/.exec(x); if (mm && !isNaN(geld(mm[3]))) b.ausNB.push({ monat: mm[2] + '-' + mm[1], betrag: geld(mm[3]) });
    mm = /bereits ausbezahlt\s+(\S+)$/.exec(x); if (mm && !isNaN(geld(mm[1]))) b.bereits = Math.abs(geld(mm[1]));
    if (/^Konto\b/.test(x)) { const t = x.split(' '); const a = geld(t[t.length - 1]); if (t.length > 1 && !isNaN(a)) b.auszahlung = a; }
  }
  return b;
}

// Alle Blätter einer Datei → Hauptabrechnung (laufender Monat) und Nachberechnungen
export function abrechnungLesen(seiten) {
  const alle = (seiten || []).map(blattLesen);
  if (!alle.some(Boolean)) {
    const text = (seiten || []).flat().join(' ');
    if (/Monatsübersicht/i.test(text)) return { ok: false, fehler: 'Das ist eine Monatsübersicht. Nimm dafür den Knopf „Monatsübersicht einlesen“.' };
    return { ok: false, fehler: 'Das ist keine Brutto-Netto-Abrechnung, die die App kennt (die Überschrift „Abrechnung der Brutto/Netto-Bezüge“ fehlt).' };
  }
  const zus = new Map();
  for (const b of alle.filter(Boolean)) {
    const k = b.monat + '|' + b.nb;
    const a = zus.get(k);
    if (!a) { zus.set(k, b); continue; }
    for (const f of ['lohnarten', 'steuer', 'sv', 'nettoPosten', 'ausNB']) a[f] = a[f].concat(b[f]);
    for (const f of ['eg', 'stufe', 'stkl', 'wochenstd', 'zvkBrutto', 'gesamtBrutto', 'nettoVerdienst', 'bereits', 'auszahlung', 'datum']) if (a[f] == null && b[f] != null) a[f] = b[f];
  }
  const liste = [...zus.values()];
  const haupt = liste.filter((a) => !a.nb).sort((x, y) => (x.monat < y.monat ? 1 : -1))[0] || null;
  const nachberechnungen = liste.filter((a) => a.nb).sort((x, y) => (x.monat < y.monat ? -1 : 1));
  if (!haupt && !nachberechnungen.length) return { ok: false, fehler: 'In der Datei steht keine lesbare Abrechnung.' };
  if (haupt && !haupt.lohnarten.length) return { ok: false, fehler: 'Die Lohnarten der Abrechnung lassen sich nicht lesen. Das Formular ist anders aufgebaut als das bekannte.' };
  return { ok: true, haupt, nachberechnungen, datum: (haupt || nachberechnungen[0]).datum };
}

// Was sich aus der Abrechnung für den Gehaltsrechner ableiten lässt (Sätze aus den Beträgen zurückgerechnet)
export function einstellungenAus(a) {
  const e = {};
  if (a.eg && DRK.GRUPPEN.includes(a.eg)) e.eg = a.eg;
  if (a.stufe) e.stufe = a.stufe;
  if (a.stkl) e.stkl = a.stkl;
  if (a.wochenstd) e.vz = a.wochenstd === 39 ? '39' : '38,5';
  const sv = a.sv.find((x) => x.art === 'L');
  if (sv && sv.kvBrutto > 0) {
    const kvz = r2(sv.kv / sv.kvBrutto * 200 - 14.6);
    if (kvz >= 0 && kvz < 6) e.kvz = kvz;
    const pv = sv.pv / sv.pvBrutto;
    if (pv > 0.0235) { e.kinder = 0; e.ab23 = true; } else if (pv > 0.0175) e.einKindOderUnter23 = true; else if (pv > 0) e.kinder = Math.min(5, Math.round((0.018 - pv) / 0.0025) + 1);
  }
  const um = a.lohnarten.find((x) => x.art === 'umlage' && x.prozent > 0 && !x.nach);
  if (um) e.zvkAg = um.prozent;
  const an = a.nettoPosten.find((x) => /AN-Anteil/i.test(x.name) && !x.nach);
  if (an && a.zvkBrutto > 0) e.zvkAn = r2(Math.abs(an.betrag) / a.zvkBrutto * 100);
  return e;
}
const tText = (x) => String(x).replace('.', ',');
// → Felder für `einstellungen.gehaltsrechner` (Texte wie im Formular des Rechners)
export function rechnerFelder(e) {
  const f = {};
  if (e.eg) f.eg = e.eg; if (e.stufe) f.stufe = e.stufe; if (e.stkl) f.stkl = e.stkl; if (e.vz) f.vz = e.vz;
  if (e.kvz != null) f.kvzText = tText(e.kvz);
  if (e.kinder != null) f.kinder = e.kinder; if (e.ab23 != null) f.ab23 = e.ab23;
  if (e.zvkAg != null) f.zvkAgText = tText(e.zvkAg); if (e.zvkAn != null) f.zvkAnText = tText(e.zvkAn);
  return f;
}

// Stunden und Pauschale aus den Lohnarten (für den Vergleich mit Diensten und als „abgerechnet“)
export function stundenAus(lohnarten) {
  const s = { nacht: 0, nacht04: 0, sonntag: 0, feiertag: 0, vorfest: 0, pauschale: 0 };
  let hat = false;
  for (const x of lohnarten) {
    if (x.art === 'pauschale') { s.pauschale += x.betrag; hat = true; } else if (s[x.art] != null && x.menge != null) { s[x.art] += x.menge; hat = true; }
  }
  if (!hat) return null;
  return { nacht: r2(s.nacht + s.nacht04), nacht04: r2(s.nacht04), sonntag: r2(s.sonntag), feiertag: r2(s.feiertag), vorfest: r2(s.vorfest), pauschale: r2(s.pauschale) };
}

// Hauptabrechnung gegen den Gehaltsrechner: nur der laufende Bezug (Zeilen „L“)
// basis = gemerkte Eingaben des Rechners (für Kinder, Kirche …); die Sätze kommen aus der Abrechnung selbst.
export function vergleich(a, basis = {}) {
  const abl = einstellungenAus(a);
  if (!abl.eg || !abl.stufe) return { ok: false, grund: 'Entgeltgruppe und Stufe stehen nicht lesbar in der Abrechnung.' };
  if (a.monat < '2026-10') return { ok: false, grund: 'Für Monate vor Oktober 2026 kennt die App die Entgelttabelle nicht.' };
  const lfd = a.lohnarten.filter((x) => x.imBrutto && !x.nach && !x.einmal);
  const von = (art) => lfd.filter((x) => x.art === art);
  const sum = (l, f = 'betrag') => r2(l.reduce((s, x) => s + (x[f] || 0), 0));
  const tab = sum(von('tabelle'));
  const voll = DRK.tabelle(a.monat)[abl.eg][abl.stufe - 1];
  const tz = voll > 0 && tab > 0 && Math.abs(tab - voll) > 0.02 ? r2(tab / voll * 100) : 100;
  const sch = sum(von('schicht')), pra = sum(von('praxis'));
  const std = stundenAus(lfd) || {};
  const e = Object.assign({ kinder: 0, ab23: true, kirche: 0, zkf: 0, freibetrag: 0 }, basis, {
    eg: abl.eg, stufe: abl.stufe, vz: a.wochenstd || 38.5, tz, schicht: sch > 0, praxis: pra > 0,
    besitz: sum(von('besitz')), zulage: sum(von('sonst')), pauschalDienste: (std.pauschale || 0) / DRK.DIENSTPAUSCHALE,
    nacht: std.nacht || 0, nacht04: std.nacht04 || 0, sonntag: std.sonntag || 0, feiertag: std.feiertag || 0, vorfest: std.vorfest || 0,
    stkl: abl.stkl || basis.stkl || 1, kvz: abl.kvz != null ? abl.kvz : basis.kvz, zvkAn: abl.zvkAn || 0, zvkAg: abl.zvkAg || 0, abzug: 0 });
  if (abl.kinder != null) { e.kinder = abl.kinder; e.ab23 = abl.ab23 !== false; }
  const r = DRK.gehaltRechnen(e, a.monat);
  const st = a.steuer.find((x) => x.art === 'L'), sv = a.sv.find((x) => x.art === 'L');
  const an = a.nettoPosten.find((x) => /AN-Anteil/i.test(x.name) && !x.nach);
  const zeilen = [];
  const z = (name, echt, app) => { if (echt == null || isNaN(echt)) return; zeilen.push({ name, echt: r2(echt), app: r2(app), diff: r2(app - echt) }); };
  z('Brutto (laufend)', sum(lfd), r.brutto);
  if (st) { z('Lohnsteuer', st.lohnsteuer, r.lohnsteuer); if (st.weitere > 0 || r.soli + r.kirchensteuer > 0) z('Soli und Kirchensteuer', st.weitere, r.soli + r.kirchensteuer); }
  if (sv) { z('Krankenversicherung', sv.kv, r.kv); z('Pflegeversicherung', sv.pv, r.pv); z('Rentenversicherung', sv.rv, r.rv); z('Arbeitslosenversicherung', sv.av, r.av); }
  if (an || r.zvkAn > 0) z('Zusatzversorgung: Eigenanteil', an ? Math.abs(an.betrag) : 0, r.zvkAn);
  if (st && sv) z('Netto (laufend)', sum(lfd) - st.summe - sv.summe - (an ? Math.abs(an.betrag) : 0), r.netto);
  const ab = zeilen.filter((x) => Math.abs(x.diff) > 0.02);
  return { ok: true, eingaben: e, abgeleitet: abl, zeilen, abweichungen: ab, passt: zeilen.length >= 3 && !ab.length, einmal: a.lohnarten.filter((x) => x.imBrutto && !x.nach && x.einmal) };
}

// Nachberechnung eines Monats gegen das, was die App für diesen Monat kennt (Dienste oder Monatsübersicht)
export function stundenVergleich(nb, daten) {
  const echt = stundenAus(nb.lohnarten.filter((x) => x.imBrutto && x.nach));
  if (!echt) return null;
  const app = DI.stundenFuer(daten, nb.monat);
  const zeilen = [['Nacht gesamt', 'nacht', 'Std.'], ['davon 0–4 Uhr', 'nacht04', 'Std.'], ['Sonntag', 'sonntag', 'Std.'], ['Feiertag', 'feiertag', 'Std.'], ['24./31.12. ab 14 Uhr', 'vorfest', 'Std.']]
    .filter(([, f]) => echt[f] > 0 || (app.quelle !== 'schnitt' && app[f] > 0))
    .map(([name, f, einheit]) => ({ name, einheit, echt: echt[f], app: app.quelle === 'schnitt' ? null : app[f] || 0 }));
  const schichten = r2(echt.pauschale / DRK.DIENSTPAUSCHALE);
  if (echt.pauschale > 0 || (app.quelle !== 'schnitt' && app.pauschalDienste > 0)) zeilen.push({ name: 'Schichten mit Dienstpauschale', einheit: '', echt: schichten, app: app.quelle === 'schnitt' ? null : app.pauschalDienste || 0 });
  return { echt, quelle: app.quelle, zeilen, passt: app.quelle !== 'schnitt' && zeilen.every((x) => Math.abs(x.echt - x.app) < 0.01) };
}
