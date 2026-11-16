// v27: Dienste (Schichten) → Stunden mit Zuschlag → geschätztes Gehalt pro Monat. Reine Rechnung, keine Oberfläche.
//
// Regeln (DRK-RTV, durchgeschriebene Fassung idF 52. ÄTV, nachgelesen am 16.11.2026):
// - Nachtarbeit = 20 bis 6 Uhr (§ 13 Abs. 6), Zuschlag je Stunde (§ 14 Abs. 2 Satz 3).
// - Sonntag 25 %, Feiertag 35 %, 24.12. und 31.12. ab 14 Uhr 35 % (§ 14 Abs. 2 Satz 2 b–d).
//   Treffen Sonntag, Feiertag und 24./31.12. zusammen, gibt es nur den höchsten (Satz 4). Nacht kommt immer dazu.
// - Zeitzuschläge werden spätestens am Zahltag des zweiten Folgemonats fällig (§ 29 Abs. 1 Satz 3). In der Praxis
//   kommen sie als Nachberechnung schon mit der nächsten Abrechnung → Standard: 1 Monat später.
// - Dienstpauschale § 23 b: 10 € je dienstplanmäßiger Schicht ab 6 Stunden, nur bei verlängerter Arbeitszeit (§ 12 Abs. 6).
// Annahme: Jede Stunde im Dienst zählt voll (keine Pausen abgezogen), der ganze Dienst zählt zum Monat,
// in dem er beginnt – so steht es auch in der Monatsübersicht des Arbeitgebers (Nachtdienst Sa→So: Sonntag 7 Std.).
import * as R from './rechnen.js';
import * as DRK from './drk.js';

// ---------- Feiertage ----------
export const LAENDER = { BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen', HH: 'Hamburg', HE: 'Hessen', MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen' };
const iso = (d) => d.getFullYear() + '-' + R.zweistellig(d.getMonth() + 1) + '-' + R.zweistellig(d.getDate());
function ostersonntag(jahr) {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(jahr, monat - 1, tag, 12);
}
// Gesetzliche Feiertage, die im ganzen Bundesland gelten (ohne Sonderfälle einzelner Gemeinden)
export function feiertage(jahr, land = 'BW') {
  const o = ostersonntag(jahr);
  const plus = (n) => { const d = new Date(o); d.setDate(d.getDate() + n); return iso(d); };
  const f = {};
  const fest = (md, name) => { f[jahr + '-' + md] = name; };
  fest('01-01', 'Neujahr'); f[plus(-2)] = 'Karfreitag'; f[plus(1)] = 'Ostermontag'; fest('05-01', 'Tag der Arbeit');
  f[plus(39)] = 'Christi Himmelfahrt'; f[plus(50)] = 'Pfingstmontag'; fest('10-03', 'Tag der Deutschen Einheit');
  fest('12-25', '1. Weihnachtstag'); fest('12-26', '2. Weihnachtstag');
  const in_ = (...l) => l.includes(land);
  if (in_('BW', 'BY', 'ST')) fest('01-06', 'Heilige Drei Könige');
  if (in_('BE', 'MV')) fest('03-08', 'Frauentag');
  if (in_('BB')) { f[plus(0)] = 'Ostersonntag'; f[plus(49)] = 'Pfingstsonntag'; }
  if (in_('BW', 'BY', 'HE', 'NW', 'RP', 'SL')) f[plus(60)] = 'Fronleichnam';
  if (in_('SL')) fest('08-15', 'Mariä Himmelfahrt');
  if (in_('TH')) fest('09-20', 'Weltkindertag');
  if (in_('BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH')) fest('10-31', 'Reformationstag');
  if (in_('BW', 'BY', 'NW', 'RP', 'SL')) fest('11-01', 'Allerheiligen');
  if (in_('SN')) { const d = new Date(jahr, 10, 22, 12); do d.setDate(d.getDate() - 1); while (d.getDay() !== 3); f[iso(d)] = 'Buß- und Bettag'; }
  return f;
}

// ---------- Stunden ----------
const min = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
const ueber = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));
const tagPlus = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return iso(x); };
const cache = {};
const feiertagAm = (d, land) => { const k = d.slice(0, 4) + land; return (cache[k] || (cache[k] = feiertage(Number(d.slice(0, 4)), land)))[d]; };

// Minuten eines Dienstes je Zuschlagsart
export function dienstMinuten(dienst, land = 'BW') {
  const a = min(dienst.von), b0 = min(dienst.bis);
  const leer = { gesamt: 0, nacht: 0, nacht04: 0, sonntag: 0, feiertag: 0, vorfest: 0 };
  if (dienst.frei || isNaN(a) || isNaN(b0)) return leer;
  const b = b0 > a ? b0 : b0 + 1440;
  const teile = [[dienst.d, a, Math.min(b, 1440), false]];
  if (b > 1440) teile.push([tagPlus(dienst.d, 1), 0, b - 1440, true]);
  const m = { ...leer };
  for (const [d, von, bis, nachMitternacht] of teile) {
    m.gesamt += bis - von;
    m.nacht += ueber(von, bis, 0, 360) + ueber(von, bis, 1200, 1440);
    if (nachMitternacht) m.nacht04 += ueber(von, bis, 0, 240);
    const wt = new Date(d + 'T12:00:00').getDay();
    const md = d.slice(5);
    const vor = md === '12-24' || md === '12-31' ? ueber(von, bis, 840, 1440) : 0;
    if (feiertagAm(d, land)) m.feiertag += bis - von;
    else { m.vorfest += vor; if (wt === 0) m.sonntag += bis - von - vor; }
  }
  return m;
}
const h2 = (minuten) => Math.round(minuten / 60 * 100) / 100;
// v28 Dienstpauschale (§ 23 b): Hat die Schichtart die Angabe `pauschale`, gilt sie. Sonst: Kürzel von Fahrzeug-Diensten
// (R1T, N1N, M1T, K1F …) ja, alles andere (Fortbildung, Dozent, Büro) nein.
export function mitPauschale(k, arten = []) {
  const a = arten.find((x) => x.k === k);
  if (a && typeof a.pauschale === 'boolean') return a.pauschale;
  return /^[RNMK]\d/i.test(String(k || ''));
}
// Stunden aller Dienste, die im Monat ym beginnen; pauschalDienste = Schichten ab 6 Stunden mit Dienstpauschale
export function stundenAusDiensten(dienste, ym, land = 'BW', arten = []) {
  const l = (dienste || []).filter((x) => x && typeof x.d === 'string' && x.d.slice(0, 7) === ym);
  const s = { gesamt: 0, nacht: 0, nacht04: 0, sonntag: 0, feiertag: 0, vorfest: 0 };
  let anzahl = 0, ohneZeit = 0, pauschalDienste = 0;
  for (const x of l) {
    if (x.frei) continue;
    const m = dienstMinuten(x, land);
    if (!m.gesamt) { ohneZeit++; continue; }
    anzahl++;
    if (m.gesamt >= 360 && mitPauschale(x.k, arten)) pauschalDienste++;
    for (const k of Object.keys(s)) s[k] += m[k];
  }
  return { anzahl, ohneZeit, pauschalDienste, stunden: h2(s.gesamt), nacht: h2(s.nacht), nacht04: h2(s.nacht04), sonntag: h2(s.sonntag), feiertag: h2(s.feiertag), vorfest: h2(s.vorfest) };
}

// ---------- Dienste aus einer Datei (CaleConnect) ----------
// Erkennt die Sammel-Datei (app: "caleconnect-dienste", duties[]) und ein CaleConnect-Backup (events[] mit src "dp").
const ZEIT = /^\d{2}:\d{2}$/, TAG = /^\d{4}-\d{2}-\d{2}$/;
const hm = (minuten) => { const m = ((minuten % 1440) + 1440) % 1440; return R.zweistellig(Math.floor(m / 60)) + ':' + R.zweistellig(m % 60); };
export function diensteAusDatei(text) {
  let o;
  try { o = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return { ok: false, fehler: 'Die Datei lässt sich nicht lesen (kein JSON).' }; }
  if (!o || typeof o !== 'object') return { ok: false, fehler: 'Die Datei enthält keine Dienste.' };
  const liste = [];
  if (Array.isArray(o.duties)) {
    for (const x of o.duties) {
      if (!x || !TAG.test(x.d) || typeof x.code !== 'string' || !x.code) continue;
      if (x.allDay === true) liste.push({ d: x.d, k: x.code.slice(0, 12), frei: true });
      else if (ZEIT.test(x.start) && ZEIT.test(x.end)) liste.push({ d: x.d, k: x.code.slice(0, 12), von: x.start, bis: x.end });
    }
  } else {
    const st = [o, o.state, o.data, o.daten].find((x) => x && Array.isArray(x.events));
    if (!st) return { ok: false, fehler: o.format === 'finanz-app' ? 'Das ist eine Sicherung der Finanz-App, keine Dienste-Datei. Sie gehört unter „Importieren“.' : 'In der Datei stehen keine Dienste. Erwartet wird ein Backup oder eine Dienste-Datei aus CaleConnect.' };
    for (const e of st.events) {
      if (!e || e.src !== 'dp' || e.rdp) continue; // rdp = vorläufig aus dem Rahmenplan
      const d = TAG.test(e.od) ? e.od : TAG.test(e.date) ? e.date : null;
      const k = String(e.code || e.title || '').slice(0, 12);
      if (!d || !k) continue;
      if (e.allDay === true) liste.push({ d, k, frei: true });
      else if (isFinite(e.start) && isFinite(e.end)) liste.push({ d, k, von: hm(Number(e.start)), bis: hm(Number(e.end)) });
    }
  }
  if (!liste.length) return { ok: false, fehler: 'In der Datei stehen keine Dienste.' };
  // pro Tag ein Dienst (der erste gewinnt, wie in CaleConnect)
  const tage = new Map();
  for (const x of liste.sort((a, b) => (a.d < b.d ? -1 : 1))) if (!tage.has(x.d)) tage.set(x.d, x);
  const dienste = [...tage.values()];
  const monate = [...new Set(dienste.map((x) => x.d.slice(0, 7)))].sort();
  return { ok: true, dienste, monate };
}
// Einlesen ersetzt jeden Monat, der in der Datei vorkommt, vollständig; andere Monate bleiben.
export function diensteZusammen(alt, neu) {
  const monate = new Set(neu.map((x) => x.d.slice(0, 7)));
  return (alt || []).filter((x) => !monate.has(x.d.slice(0, 7))).concat(neu).sort((a, b) => (a.d < b.d ? -1 : 1));
}
// Schichtarten (Kürzel mit Uhrzeit) aus Diensten ableiten: je Kürzel die zuletzt verwendete Zeit
export function schichtartenAus(dienste, vorhandene = []) {
  const m = new Map(vorhandene.map((x) => [x.k, x]));
  for (const x of [...dienste].sort((a, b) => (a.d < b.d ? -1 : 1))) if (!x.frei && x.von && x.bis) m.set(x.k, { k: x.k, von: x.von, bis: x.bis });
  return [...m.values()];
}

// ---------- Monatsübersicht des Arbeitgebers (PDF, als Textzeilen) ----------
// Erwartet die Zeilen des Reports „Monatsübersicht“: Kopf mit Monat, eine Zeile je Tag (Tag, Kürzel, Zeitpaar, Lohnarten),
// unten die Summen der Lohnarten („770 Nacht 12:00 …“) und „Gedruckt am“.
const MONATE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
const hDez = (t) => { const m = /^(\d{1,3}):(\d{2})$/.exec(t); return m ? Math.round((Number(m[1]) + Number(m[2]) / 60) * 100) / 100 : NaN; };
export function lohnartZuordnen(name, nr) {
  const n = name.toLowerCase();
  // Lohnart 258 heißt auf der Monatsübersicht „Schichtzulage“, auf der Abrechnung „Pauschale nach § 23 b“ (Betrag in €, kein Stundenwert)
  if (nr === '258' || /pauschale|23 ?b/.test(n)) return 'pauschale';
  if (/0[:.]00\s*-\s*4[:.]00/.test(n)) return 'nacht04';
  if (/nacht|nach\b/.test(n)) return 'nacht';
  if (/sonntag/.test(n)) return 'sonntag';
  if (/heilig|silvester|24\.|31\.|vorfest/.test(n)) return 'vorfest';
  if (/feiertag/.test(n)) return 'feiertag';
  return null;
}
export function monatsuebersichtLesen(zeilen) {
  const l = zeilen.map((x) => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!l.some((x) => /monatsübersicht/i.test(x))) return { ok: false, fehler: 'Das ist keine Monatsübersicht (das Wort „Monatsübersicht“ fehlt).' };
  let ym = null;
  for (const x of l) { const m = new RegExp('(' + MONATE.join('|') + ')\\s+(\\d{4})', 'i').exec(x); if (m) { ym = m[2] + '-' + R.zweistellig(MONATE.indexOf(m[1].toLowerCase()) + 1); break; } }
  if (!ym) return { ok: false, fehler: 'Der Monat steht nicht in der Datei.' };
  let stand = null;
  for (const x of l) { const m = /gedruckt am\s+(\d{2})\.(\d{2})\.(\d{4})/i.exec(x); if (m) stand = `${m[3]}-${m[2]}-${m[1]}`; }
  // Summen der Lohnarten: alles nach der letzten Zeile, die nur „Lohnarten“ heißt
  const start = l.map((x) => /^lohnarten$/i.test(x)).lastIndexOf(true);
  const lohnarten = [];
  if (start >= 0) {
    for (const x of l.slice(start + 1)) {
      if (/^urlaubsst|^gedruckt|^von benutzer/i.test(x)) break;
      const re = /(\d{3})\s+(.+?)\s+(\d{1,3}:\d{2})(?=\s+\d{3}\s|\s*$)/g;
      let m;
      while ((m = re.exec(x))) lohnarten.push({ nr: m[1], name: m[2], stunden: hDez(m[3]), art: lohnartZuordnen(m[2], m[1]) });
    }
  }
  // Tageszeilen: „Mo 02 R1T 07:00 n 19:00 n …“ · „So 01 -“ · Zeit auch als 07*00
  const dienste = [];
  for (const x of l) {
    const m = /^(Mo|Di|Mi|Do|Fr|Sa|So)\s+(\d{2})\s+(\S+)(?:\s+(\d{2})[:*](\d{2})\s+\S?\s*(\d{2})[:*](\d{2}))?/.exec(x);
    if (!m) continue;
    const k = m[3];
    if (/^[-+–]+$/.test(k) || /^\d/.test(k)) continue;
    const d = ym + '-' + m[2];
    // p = an diesem Tag wurde die Dienstpauschale (Lohnart 258) gebucht
    if (m[4]) dienste.push({ d, k, von: m[4] + ':' + m[5], bis: m[6] + ':' + m[7], gestempelt: true, p: /\s258\s+\d/.test(x) });
    else dienste.push({ d, k });
  }
  const s = { nacht: 0, nacht04: 0, sonntag: 0, feiertag: 0, vorfest: 0, pauschale: 0 };
  for (const x of lohnarten) if (x.art && isFinite(x.stunden)) s[x.art] += x.stunden;
  // In der Übersicht ist „Nacht“ ohne die Stunden 0–4 Uhr geführt → für die Rechnung zusammenzählen. pauschale = Euro.
  const stunden = { nacht: Math.round((s.nacht + s.nacht04) * 100) / 100, nacht04: s.nacht04, sonntag: s.sonntag, feiertag: s.feiertag, vorfest: s.vorfest, pauschale: s.pauschale };
  const letzter = ym + '-' + R.zweistellig(R.tageImMonat(ym));
  return { ok: true, monat: ym, stand, fertig: !!stand && stand > letzter, lohnarten, stunden, dienste };
}
// Dienste aus der Übersicht in gerundete Planzeiten bringen: bekannte Schichtart gewinnt, sonst die gestempelte Zeit
export function diensteAusUebersicht(dienste, schichtarten = []) {
  const arten = new Map(schichtarten.map((x) => [x.k, x]));
  // Kürzel, das die App noch nicht kennt: die erste Zeit aus dieser Übersicht gilt auch für die Tage ohne Zeit
  for (const x of dienste) if (x.von && !arten.has(x.k)) arten.set(x.k, { k: x.k, von: x.von, bis: x.bis });
  const fertig = [], ohne = [];
  for (const x of dienste) {
    const a = arten.get(x.k);
    if (a && a.frei) fertig.push({ d: x.d, k: x.k, frei: true });
    else if (a && a.von) fertig.push({ d: x.d, k: x.k, von: a.von, bis: a.bis });
    else if (x.von) fertig.push({ d: x.d, k: x.k, von: x.von, bis: x.bis });
    else ohne.push(x);
  }
  // Dienstpauschale je Kürzel: aus den Tagen mit gebuchter Zeit ablesen (ja, sobald sie einmal gebucht wurde)
  const pauschale = {};
  for (const x of dienste) if (x.von && typeof x.p === 'boolean') pauschale[x.k] = pauschale[x.k] || x.p;
  return { fertig, ohne, pauschale };
}

// v29: Kalender der App gegen die Dienste der Monatsübersicht (nur Kürzel je Tag).
// Ganztägige Einträge im Kalender (Urlaub, krank), die in der Übersicht fehlen, gelten nicht als Unterschied.
export function diensteVergleich(kalender, uebersicht, ym) {
  const kal = new Map((kalender || []).filter((x) => x.d.slice(0, 7) === ym).map((x) => [x.d, x]));
  const ueb = new Map((uebersicht || []).filter((x) => x.d.slice(0, 7) === ym).map((x) => [x.d, x]));
  const tage = [...new Set([...kal.keys(), ...ueb.keys()])].sort();
  let gleich = 0; const unterschiede = [];
  for (const d of tage) {
    const a = kal.get(d), b = ueb.get(d);
    if (a && b && a.k === b.k) { gleich++; continue; }
    if (a && a.frei && !b) continue;
    unterschiede.push({ d, kal: a ? a.k : null, ueb: b ? b.k : null });
  }
  return { imKalender: kal.size, gleich, unterschiede };
}

// ---------- Gehalt schätzen ----------
export const VERZUG_STANDARD = 1; // Nachberechnung mit der nächsten Abrechnung; der Tarif erlaubt bis zum zweiten Folgemonat (§ 29 Abs. 1 Satz 3 DRK-RTV)
export function verzug(daten) { const v = daten.einstellungen && daten.einstellungen.zuschlagVerzug; return v === 0 || v === 1 || v === 2 ? v : VERZUG_STANDARD; }
export function land(daten) { return (daten.einstellungen && daten.einstellungen.bundesland) || 'BW'; }
export function schaetzenAn(daten) { return !!(daten.einstellungen && daten.einstellungen.gehaltSchaetzen && daten.einstellungen.gehaltsrechner); }

// Welche Zuschlag-Stunden gelten für den Arbeitsmonat ym – und woher kommen sie?
export function stundenFuer(daten, ym) {
  const ms = daten.monatsstunden && daten.monatsstunden[ym];
  const arten = (daten.einstellungen && daten.einstellungen.schichtarten) || [];
  const d = stundenAusDiensten(daten.dienste, ym, land(daten), arten);
  if (ms && ms.fertig) return { quelle: 'abrechnung', monat: ym, nacht: ms.nacht || 0, nacht04: ms.nacht04 || 0, sonntag: ms.sonntag || 0, feiertag: ms.feiertag || 0, vorfest: ms.vorfest || 0,
    pauschalDienste: ms.pauschale != null ? Math.round(ms.pauschale / DRK.DIENSTPAUSCHALE * 100) / 100 : d.pauschalDienste };
  if (d.anzahl > 0) return Object.assign({ quelle: 'dienste', monat: ym }, d);
  return { quelle: 'schnitt', monat: ym };
}
// Geschätztes Gehalt, das Ende des Monats s ankommt
export function gehaltSchaetzung(daten, s) {
  if (!schaetzenAn(daten)) return null;
  const e = DRK.eingaben(daten.einstellungen.gehaltsrechner);
  const st = stundenFuer(daten, R.ymPlus(s, -verzug(daten)));
  if (st.quelle !== 'schnitt') Object.assign(e, { nacht: st.nacht, nacht04: st.nacht04, sonntag: st.sonntag, feiertag: st.feiertag, vorfest: st.vorfest, pauschalDienste: st.pauschalDienste });
  const r = DRK.gehaltRechnen(e, s);
  return { monat: s, netto: r.netto, brutto: r.brutto, zuschlaege: r.zuschlaegeSumme, stunden: st, eingaben: e, r };
}
// Trägt die Schätzungen in die Gehalt-Einnahme ein (`schaetzWerte`), damit jede Rechnung sie ohne Sonderfall nutzt.
// Liefert true, wenn sich etwas geändert hat.
export function schaetzWerteSetzen(daten, heuteYm, zurueck = 2, voraus = 14) {
  const g = R.gehaltVon(daten);
  if (!g) return false;
  const vorher = JSON.stringify(g.schaetzWerte || null);
  if (!schaetzenAn(daten)) delete g.schaetzWerte;
  else {
    const w = {};
    for (let i = -zurueck; i <= voraus; i++) { const s = R.ymPlus(heuteYm, i); const x = gehaltSchaetzung(daten, s); if (x) w[s] = x.netto; }
    g.schaetzWerte = w;
  }
  return JSON.stringify(g.schaetzWerte || null) !== vorher;
}
