// v36: Kontoauszug als CSV einlesen (offline, nichts verlässt das Handy).
// Versteht die üblichen Exporte deutscher Banken: Volksbanken/Raiffeisenbanken, Sparkassen (CSV-CAMT),
// DKB, ING, comdirect, N26 und ähnliche. Gespalten wird nach Spaltennamen, nicht nach festen Positionen.
// Gespeichert werden nur Datum, Betrag, Name des Händlers und die Kategorie – keine IBAN, kein Verwendungszweck.
import * as R from './rechnen.js';

// ---------- Text und Zeilen ----------
export function dekodieren(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(u8); }
  catch (e) { text = new TextDecoder('windows-1252').decode(u8); }
  return text.replace(/^﻿/, '');
}

function trenner(text) {
  const probe = text.split(/\r?\n/).slice(0, 30).join('\n');
  let best = ';', max = -1;
  for (const t of [';', '\t', ',']) {
    let n = 0, inQ = false;
    for (const c of probe) { if (c === '"') inQ = !inQ; else if (c === t && !inQ) n++; }
    if (n > max) { max = n; best = t; }
  }
  return best;
}

export function zeilen(text) {
  const t = trenner(text);
  const rows = []; let row = []; let feld = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { feld += '"'; i++; } else inQ = false; }
      else feld += c;
    } else if (c === '"') inQ = true;
    else if (c === t) { row.push(feld); feld = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(feld); feld = ''; rows.push(row); row = [];
    } else feld += c;
  }
  if (feld !== '' || row.length) { row.push(feld); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ''));
}

// ---------- Werte ----------
export function datumAus(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/) || t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) { const j = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return j + '-' + R.zweistellig(Number(m[2])) + '-' + R.zweistellig(Number(m[1])); }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
}
export function betragAus(s) {
  let t = String(s || '').replace(/[\s €]|EUR/gi, '');
  if (!t) return NaN;
  let minus = false;
  if (/-$/.test(t)) { minus = true; t = t.slice(0, -1); }
  if (/^[-−]/.test(t)) { minus = true; t = t.slice(1); }
  if (/^\+/.test(t)) t = t.slice(1);
  const k = t.lastIndexOf(','), p = t.lastIndexOf('.');
  if (k >= 0 && p >= 0) t = k > p ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (k >= 0) t = t.replace(/\./g, '').replace(',', '.');
  else if (p >= 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  const n = Number(t);
  return minus ? -n : n;
}

// ---------- Kopfzeile erkennen ----------
const norm = (s) => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9/()]+/g, ' ').trim();
const SPALTEN = {
  datum: [/^buchungstag$/, /^buchungsdatum$/, /^buchung$/, /^datum$/, /^booking date$/, /^date$/, /^valutadatum$/, /^valuta$/, /^wertstellung/],
  betrag: [/^betrag( \((eur|€)\)| eur| in eur)?$/, /^umsatz( in eur)?$/, /^amount( \(eur\))?$/, /^betrag/],
  soll: [/^soll( \(eur\))?$/, /^ausgang$/, /^belastung$/],
  haben: [/^haben( \(eur\))?$/, /^eingang$/, /^gutschrift$/],
  sh: [/^(soll\/haben|s\/h)$/],
  name: [/^name zahlungsbeteiligter$/, /beguenstigter\/zahlungspflichtiger/, /^zahlungsempfaenger( in)?$/, /^auftraggeber\/empfaenger$/, /^empfaenger$/, /^auftraggeber/, /^beguenstigter/, /^zahlungspflichtiger/, /^payee$/, /^partner name$/, /^name$/, /zahlungsempfaenger/, /empfaenger/],
  zweck: [/^verwendungszweck$/, /^buchungsdetails$/, /^beschreibung$/, /^payment reference$/, /^reference$/, /verwendungszweck/],
  text: [/^buchungstext$/, /^umsatzart$/, /^vorgang$/, /^transaktionstyp$/, /^transaction type$/, /^art$/, /^typ$/],
  saldo: [/^saldo nach buchung$/, /^saldo$/, /^kontostand$/, /saldo/]
};
function spalten(kopf) {
  const n = kopf.map(norm);
  const s = {};
  for (const [key, muster] of Object.entries(SPALTEN)) {
    for (const re of muster) { const i = n.findIndex((x, j) => re.test(x) && !Object.values(s).includes(j)); if (i >= 0) { s[key] = i; break; } }
  }
  return s;
}

// Gelesene Datei → { ok, buchungen: [{ datum, betrag, name, zweck, text, saldo }], saldo: { betrag, datum } | null }
export function lesen(text) {
  const rows = zeilen(text);
  let k = -1, sp = null;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const s = spalten(rows[i]);
    if (s.datum != null && (s.betrag != null || s.soll != null || s.haben != null)) { k = i; sp = s; break; }
  }
  if (k < 0) return { ok: false, fehler: 'In der Datei steht keine Kopfzeile mit Datum und Betrag. Ist das eine CSV-Datei mit Umsätzen (nicht PDF)?' };
  // Kontostand aus den Zeilen über dem Kopf (ING, DKB: „Kontostand vom 18.11.2026:;1.234,56 €“)
  let metaSaldo = null;
  for (const r of rows.slice(0, k)) {
    const t = norm(r[0]);
    if (/kontostand|saldo/.test(t)) {
      const b = r.slice(1).map(betragAus).find((x) => isFinite(x));
      const d = (r.join(' ').match(/\d{1,2}\.\d{1,2}\.\d{2,4}/) || [])[0];
      if (isFinite(b)) metaSaldo = { betrag: b, datum: d ? datumAus(d) : null };
    }
  }
  const zelle = (r, key) => (sp[key] != null ? (r[sp[key]] || '') : '');
  const liste = [];
  for (const r of rows.slice(k + 1)) {
    const datum = datumAus(zelle(r, 'datum'));
    if (!datum) continue;
    let betrag;
    if (sp.betrag != null) betrag = betragAus(zelle(r, 'betrag'));
    else {
      const soll = betragAus(zelle(r, 'soll')); const haben = betragAus(zelle(r, 'haben'));
      betrag = (isFinite(haben) ? Math.abs(haben) : 0) - (isFinite(soll) ? Math.abs(soll) : 0);
    }
    if (!isFinite(betrag) || betrag === 0) continue;
    if (sp.sh != null && /^s/i.test(zelle(r, 'sh'))) betrag = -Math.abs(betrag);
    const saldo = sp.saldo != null ? betragAus(zelle(r, 'saldo')) : NaN;
    liste.push({ datum, betrag: Math.round(betrag * 100) / 100, name: zelle(r, 'name'), zweck: zelle(r, 'zweck'), text: zelle(r, 'text'), saldo: isFinite(saldo) ? saldo : null, nr: liste.length });
  }
  if (!liste.length) return { ok: false, fehler: 'Die Datei hat eine Kopfzeile, aber keine lesbaren Umsätze.' };
  return { ok: true, buchungen: liste, saldo: saldoAus(liste) || (metaSaldo && metaSaldo.datum ? metaSaldo : metaSaldo ? { betrag: metaSaldo.betrag, datum: liste.reduce((m, x) => (x.datum > m ? x.datum : m), liste[0].datum) } : null) };
}

// Kontostand nach der neuesten Buchung: Die Datei kann auf- oder absteigend sortiert sein
export function saldoAus(liste) {
  const mit = liste.filter((x) => x.saldo != null);
  if (!mit.length) return null;
  const absteigend = liste[0].datum > liste[liste.length - 1].datum || (liste[0].datum === liste[liste.length - 1].datum);
  const max = mit.reduce((m, x) => (x.datum > m ? x.datum : m), mit[0].datum);
  const amTag = mit.filter((x) => x.datum === max);
  const neueste = absteigend ? amTag[0] : amTag[amTag.length - 1];
  return { betrag: neueste.saldo, datum: max };
}

// ---------- Händlername ----------
const klein = new Set(['und', 'der', 'die', 'das', 'von', 'bei', 'am', 'im', 'gmbh', 'ag', 'kg', 'ug', 'se', 'eg', 'ev']);
function schoen(s) {
  let t = s.replace(/\s+/g, ' ').trim();
  if (t && t === t.toUpperCase() && /[A-ZÄÖÜ]{3}/.test(t)) {
    t = t.toLowerCase().split(' ').map((w, i) => (i > 0 && klein.has(w.replace(/\./g, '')) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
    t = t.replace(/\bGmbh\b/g, 'GmbH').replace(/\bAg\b/g, 'AG').replace(/\bDm\b/g, 'dm');
  }
  return t.length > 40 ? t.slice(0, 40).trim() + '…' : t;
}
export function haendler(b) {
  const name = (b.name || '').trim(); const zweck = b.zweck || '';
  if (/paypal/i.test(name) || /^pp\.\d+/i.test(zweck)) {
    const m = zweck.match(/Ihr Einkauf bei ([^,]+?)(?:,|$)/i) || zweck.match(/PP\.\d+\.PP\s*\.\s*([^,]+?)(?:,|$)/i);
    if (m) return schoen(m[1]);
  }
  let t = name || zweck.split(/\s{2,}|\/\//)[0] || b.text || 'Umsatz';
  t = t.split('//')[0].replace(/\s+(\d{4,}|DE|GER)\s*$/i, '');
  return schoen(t) || 'Umsatz';
}
export const schluessel = (h) => (h || '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim();

// ---------- Kategorie raten ----------
const STICHWORTE = [
  ['tanken', /\b(aral|shell|esso|jet|total|totalenergies|avia|agip|omv|bft|eni|orlen|tankstelle|bag)\b|tankst/i],
  ['lebensmittel', /\b(edeka|rewe|lidl|aldi|netto|penny|kaufland|norma|feneberg|globus|tegut|marktkauf|nahkauf|aktiv markt|denns|alnatura)\b|b(ä|ae)ck|backstube|metzger|mcdonald|burger king/i],
  ['freizeit', /\b(kino|cinema|restaurant|pizzeria|cafe|café|bar|steakhouse|bowling|therme|fitness|museum|ticket|eventim)\b/i]
];
function passendeKat(kats, id) {
  return kats.find((k) => k.id === id) || kats.find((k) => norm(k.name).includes(id.slice(0, 5)));
}
function rateKategorie(daten, b, erlaubt, name) {
  const gemerkt = ((daten.einstellungen && daten.einstellungen.haendlerKategorie) || {})[schluessel(name)];
  if (gemerkt && erlaubt.some((k) => k.id === gemerkt)) return { id: gemerkt, grund: 'gemerkt' };
  const text = name + ' ' + (b.zweck || '');
  for (const [id, re] of STICHWORTE) {
    if (re.test(text)) { const k = passendeKat(erlaubt, id); if (k) return { id: k.id, grund: 'erraten' }; }
  }
  const sonst = passendeKat(erlaubt, 'sonstiges') || erlaubt[0];
  return sonst ? { id: sonst.id, grund: 'unsicher' } : { id: '', grund: 'keine Kategorie' };
}

// ---------- Vorschläge ----------
// konto: 'eingang' | 'konsum' | 'anderes'
export const NEU_EINGANG = '__eingang';
export function erlaubteKategorien(daten, konto) {
  const kk = R.konsumKonto(daten);
  const budget = (daten.kategorien || []).filter((k) => k.art === 'budget');
  if (!kk) return budget;
  if (konto === 'konsum') return budget.filter((k) => R.istKonsum(daten, k, kk));
  return budget.filter((k) => !R.istKonsum(daten, k, kk));
}
const tageAbstand = (a, b) => Math.abs(Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 864e5));
const UEBERTRAG = /umbuchung|übertrag|uebertrag|dauerauftrag|eigenes konto|eigene konten|sparplan/i;
const GEHALT = /\b(lohn|gehalt|bezuege|bezüge|entgelt|salary|loehne|löhne)\b/i;

function fixkosteFuer(daten, b, name) {
  const a = -b.betrag; const s = R.ymAus(b.datum); const text = (name + ' ' + (b.name || '') + ' ' + (b.zweck || '')).toLowerCase();
  let best = null;
  for (const f of daten.fixkosten || []) {
    const fn = (f.name || '').toLowerCase().trim();
    const woerter = fn.split(/[^a-z0-9äöüß+]+/).filter((w) => w.length >= 4);
    const nameTrifft = fn.length >= 3 && (text.includes(fn) || woerter.some((w) => text.includes(w)));
    const betragTrifft = [Number(R.betragIm(f, s).betrag) || 0, R.eigenerBetrag(f, s)].some((x) => Math.abs(x - a) < 0.015);
    let tagTrifft = false;
    for (const m of [s, R.ymPlus(s, -1)]) if (R.wirdAbgebuchtIm(f, m) && tageAbstand(R.abbuchungIm(f, m).gebucht, b.datum) <= 5) tagTrifft = true;
    const punkte = (nameTrifft ? 2 : 0) + (betragTrifft ? 2 : 0) + (tagTrifft ? 1 : 0);
    if ((nameTrifft || (betragTrifft && tagTrifft)) && (!best || punkte > best.punkte)) best = { f, punkte };
  }
  return best && best.f;
}

export function vorschlaege(daten, gelesen, konto) {
  const kk = R.konsumKonto(daten);
  const erlaubt = erlaubteKategorien(daten, konto);
  const g = R.gehaltVon(daten);
  const benutzt = new Set();
  const doppelt = (b) => (daten.buchungen || []).find((x) => {
    if (benutzt.has(x.id)) return false;
    const k = R.kategorie(daten, x.kategorieId);
    if (kk && konto !== 'anderes' && (konto === 'konsum') !== R.istKonsum(daten, k, kk)) return false;
    const betrag = [Number(x.betrag), Number(x.gesamt)].filter((y) => isFinite(y));
    return betrag.some((y) => Math.abs(y + b.betrag) < 0.005) && tageAbstand(x.zeit.slice(0, 10), b.datum) <= 3;
  });
  return gelesen.buchungen.map((b, i) => {
    const name = haendler(b);
    const z = { i, datum: b.datum, betrag: b.betrag, name, wahl: '', grund: '', art: 'buchung' };
    const t = (b.text || '') + ' ' + (b.zweck || '') + ' ' + (b.name || '');
    if (b.betrag < 0) {
      const d = doppelt(b);
      if (d) { benutzt.add(d.id); return Object.assign(z, { art: 'doppelt', grund: `schon gebucht (${d.ort || 'Buchung'} am ${Number(d.zeit.slice(8, 10))}.${Number(d.zeit.slice(5, 7))}.)` }); }
      if (konto !== 'konsum') {
        const f = fixkosteFuer(daten, b, name);
        if (f) return Object.assign(z, { art: 'fix', fixkostenId: f.id, grund: `Fixkosten „${f.name}“ – rechnet die App schon` });
      }
      const sp = (daten.sparraten || []).find((x) => Number(x.betrag) > 0 && Math.abs(Number(x.betrag) + b.betrag) < 0.015);
      if (sp && konto !== 'konsum') return Object.assign(z, { art: 'konto', grund: `Übertrag aufs ${sp.name} – rechnet die App schon` });
      if (UEBERTRAG.test(t)) return Object.assign(z, { art: 'konto', grund: 'Umbuchung auf ein eigenes Konto?' });
      if (!erlaubt.length && konto === 'eingang' && kk) return Object.assign(z, { wahl: NEU_EINGANG, grund: 'neue Kategorie „Vom Eingangskonto“' });
      const r = rateKategorie(daten, b, erlaubt, name);
      return Object.assign(z, { wahl: r.id, grund: r.grund === 'gemerkt' ? 'wie beim letzten Mal' : r.grund === 'erraten' ? 'nach dem Namen' : 'bitte prüfen' });
    }
    // Eingänge
    z.art = 'eingang';
    if (konto === 'konsum' && kk && Math.abs(Number(kk.betrag) - b.betrag) < 0.015) return Object.assign(z, { art: 'konto', grund: `Übertrag vom Eingangskonto – rechnet die App schon` });
    if (UEBERTRAG.test(t)) return Object.assign(z, { art: 'konto', grund: 'Umbuchung von einem eigenen Konto?' });
    const istSchon = (daten.einnahmen || []).some((e) => (e.istWerte || []).some((w) => Math.abs(Number(w.betrag) - b.betrag) < 0.015 && tageAbstand(w.datum, b.datum) <= 4));
    if (istSchon) return Object.assign(z, { art: 'doppelt', grund: 'schon als Einnahme eingetragen' });
    if (g && konto !== 'konsum') {
      const s = R.ymAus(b.datum);
      const sch = R.schaetzungIm(g, s);
      const nahe = tageAbstand(b.datum, s + '-' + R.zweistellig(Math.min(R.ankunftsTag(g, s), R.tageImMonat(s)))) <= 4;
      if (GEHALT.test(t) || (sch > 0 && b.betrag >= sch * 0.6 && nahe)) {
        const mn = `${g.name || 'Gehalt'} ${R.MONATE_LANG[R.ymTeile(s).monat - 1]}`;
        return R.gehaltBestaetigt(g, s) ? Object.assign(z, { art: 'doppelt', grund: `${mn} ist schon eingetragen` }) : Object.assign(z, { art: 'gehalt', wahl: 'gehalt', grund: mn });
      }
    }
    return Object.assign(z, { grund: 'Eingang – nur übernehmen, wenn es eine Einnahme ist' });
  });
}

// Welches Konto ist das wahrscheinlich?
export function kontoRaten(daten, gelesen) {
  const kk = R.konsumKonto(daten);
  if (!kk) return 'eingang';
  const rate = Number(kk.betrag) || 0;
  const gehaltDa = gelesen.buchungen.some((b) => b.betrag > 0 && GEHALT.test((b.text || '') + ' ' + (b.zweck || '')));
  const rateRein = rate > 0 && gelesen.buchungen.some((b) => Math.abs(b.betrag - rate) < 0.015);
  const rateRaus = rate > 0 && gelesen.buchungen.some((b) => Math.abs(b.betrag + rate) < 0.015);
  return rateRein && !rateRaus && !gehaltDa ? 'konsum' : 'eingang';
}
