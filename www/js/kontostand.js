// v36: Kontostand-Vorschau fürs Eingangskonto (Girokonto, auf dem Gehalt und Fixkosten laufen).
// Gespeichert wird nur der Stand, den Jan einträgt (oder den eine CSV-Datei liefert):
//   daten.eingangskonto = { name, stand, standDatum: "2026-11-19", standZeit: ISO }
// Alles andere wird gerechnet: Stand + Einnahmen − Fixkosten − Daueraufträge − Buchungen, die nicht vom
// Konsumkonto bezahlt werden. Nicht drin: geplante Ausgaben, Schulden, Konsum-Ausgaben.
import * as R from './rechnen.js';

const rund = (x) => Math.round(x * 100) / 100;
const tagIm = (s, tag) => s + '-' + R.zweistellig(Math.min(tag || 1, R.tageImMonat(s)));
const nachTag = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return R.datumText(x); };

export function eingangskonto(daten) {
  const ek = daten && daten.eingangskonto;
  return ek && ek.standDatum && isFinite(Number(ek.stand)) ? ek : null;
}
export function kontoName(daten) { const ek = daten && daten.eingangskonto; return (ek && ek.name) || 'Girokonto'; }

// Liegt ein Zeitpunkt (Datum + optional lokale Zeit) nach dem eingetragenen Stand?
// Am Tag des Stands zählt nur, was später als der Stand angelegt wurde (Buchungen mit Uhrzeit).
function nachStand(ek, datum, zeit) {
  if (datum > ek.standDatum) return true;
  if (datum < ek.standDatum || !zeit || !ek.standZeit) return false;
  return zeit > R.zeitText(new Date(ek.standZeit));
}

// Gehalt: Ist-Wert des Monats (mit Datum), sonst Schätzung am Ankunftstag.
// Kommt der Tag aufs Wochenende/einen Feiertag, rechnet die Vorschau vorsichtig mit dem nächsten Bankarbeitstag.
function gehaltIm(g, s) {
  const ist = (g.istWerte || []).find((w) => R.ymAus(w.datum) === s);
  if (ist) return { datum: ist.datum, betrag: Number(ist.betrag) || 0, geschaetzt: false };
  const tag = tagIm(s, R.ankunftsTag(g, s));
  const w = R.einnahmeIm(g, s);
  return { datum: R.bankTag(tag), eigentlich: tag, betrag: w.betrag, geschaetzt: true };
}

// Alle Bewegungen auf dem Eingangskonto zwischen (stand, bis]
export function bewegungen(daten, bis) {
  const ek = eingangskonto(daten);
  if (!ek) return [];
  const von = ek.standDatum;
  const l = [];
  const dazu = (datum, betrag, text, art, extra = {}) => { if (Math.abs(betrag) > 0.004) l.push(Object.assign({ datum, betrag: rund(betrag), text, art }, extra)); };
  const kk = R.konsumKonto(daten);
  const rk = R.ruecklage(daten);
  const g = R.gehaltVon(daten);
  const monate = [];
  for (let s = R.ymPlus(R.ymAus(von), -1); s <= R.ymAus(bis); s = R.ymPlus(s, 1)) monate.push(s);
  const imBereich = (d) => d > von && d <= bis;

  for (const s of monate) {
    // Einnahmen
    for (const e of daten.einnahmen || []) {
      if (!R.einnahmeAktivIm(e, s)) continue;
      if (g && e === g) {
        const w = gehaltIm(g, s);
        if (imBereich(w.datum)) dazu(w.datum, w.betrag, e.name || 'Gehalt', 'gehalt', { geschaetzt: w.geschaetzt, eigentlich: w.eigentlich });
        continue;
      }
      const ist = (e.istWerte || []).filter((x) => R.ymAus(x.datum) === s);
      if (ist.length) { for (const x of ist) if (imBereich(x.datum)) dazu(x.datum, Number(x.betrag) || 0, e.name, 'einnahme'); continue; }
      const w = R.einnahmeIm(e, s);
      if (!w.zaehlt) continue;
      // ohne Tag: einmalige am Monatsende (vorsichtig), monatliche am Ankunftstag
      const datum = e.wieOft === 'monatlich' ? tagIm(s, R.ankunftsTag(e, s)) : tagIm(s, 31);
      if (imBereich(datum)) dazu(datum, w.betrag, e.name, 'einnahme', { geschaetzt: !e.sicher, tagOffen: e.wieOft !== 'monatlich' });
    }
    // Fixkosten am Bankarbeitstag; mit Rücklagenkonto zahlt die Rücklage die nicht monatlichen
    for (const f of daten.fixkosten || []) {
      if (!R.wirdAbgebuchtIm(f, s)) continue;
      if (rk && f.wieOft !== 'monatlich') continue;
      const { faellig, gebucht } = R.abbuchungIm(f, s);
      if (!imBereich(gebucht)) continue;
      const eigen = R.eigenerBetrag(f, s);
      const voll = Number(R.betragIm(f, s).betrag) || 0;
      // Geteilt mit Überweisungstag: Bank bucht den vollen Betrag ab, der Rest kommt am Tag der Überweisung
      if (f.erstattungTag && voll - eigen > 0.004) {
        dazu(gebucht, -voll, f.name, 'fix', { fixkostenId: f.id, verschoben: gebucht !== faellig });
        const zur = tagIm(s, Number(f.erstattungTag));
        if (imBereich(zur)) dazu(zur, voll - eigen, (f.teiltMit ? f.teiltMit + ': ' : '') + f.name + ' zurück', 'einnahme');
      } else dazu(gebucht, -eigen, f.name, 'fix', { fixkostenId: f.id, verschoben: gebucht !== faellig });
    }
    // Daueraufträge auf eigene Konten (Rücklage, Sparen, Konsum, andere)
    for (const sp of daten.sparraten || []) {
      const b = Number(sp.betrag) || 0;
      if (b <= 0) continue;
      const d = tagIm(s, sp.tag || 1);
      if (imBereich(d)) dazu(d, -b, 'Aufs ' + sp.name, 'konto', { kontoId: sp.id });
    }
  }
  // Einmalige Überträge: vom Eingangskonto weg (−) oder vom eigenen Konto zurück (+)
  for (const u of daten.uebertraege || []) {
    if (!imBereich(u.datum) && !(u.datum === von && u.angelegt && nachStand(ek, u.datum, R.zeitText(new Date(u.angelegt))))) continue;
    const sp = (daten.sparraten || []).find((x) => x.id === u.kontoId);
    const vonSp = (daten.sparraten || []).find((x) => x.id === u.vonKontoId);
    if (R.ausEingang(u)) dazu(u.datum, -(Number(u.betrag) || 0), 'Aufs ' + (sp ? sp.name : 'Konto'), 'konto');
    else if (!u.kontoId) dazu(u.datum, Number(u.betrag) || 0, 'Vom ' + (vonSp ? vonSp.name : 'Konto') + ' zurück', 'einnahme');
  }
  // Buchungen, die nicht vom Konsumkonto bezahlt werden (Budgets vom Eingangskonto)
  for (const b of daten.buchungen || []) {
    const k = R.kategorie(daten, b.kategorieId);
    if (k && R.istKonsum(daten, k, kk)) continue;
    const d = b.zeit.slice(0, 10);
    if (d > bis || !nachStand(ek, d, b.zeit)) continue;
    dazu(d, -(Number(b.betrag) || 0), b.ort || (k ? k.name : 'Ausgabe'), 'buchung', { buchungId: b.id });
  }
  // Einnahmen zuerst, dann Abbuchungen (Gehalt kommt meist früh am Tag)
  const rang = (x) => (x.betrag > 0 ? 0 : 1);
  return l.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : rang(a) - rang(b)));
}

// Noch nicht ausgegebenes Budget (nur Budgets vom Eingangskonto) – die Vorschau zieht es vorsichtig ab
export function offeneBudgets(daten, s) {
  const kk = R.konsumKonto(daten);
  return (daten.kategorien || []).filter((k) => k.art === 'budget' && !R.istKonsum(daten, k, kk))
    .map((k) => ({ kategorie: k, rest: rund(Math.max(0, (Number(k.budget) || 0) - R.ausgegebenIm(daten, s, k.id))) }))
    .filter((x) => x.rest > 0);
}

// Nächstes Gehalt nach heute (Ist-Wert oder Schätzung)
export function naechstesGehalt(daten, heute) {
  const g = R.gehaltVon(daten);
  if (!g) return null;
  for (let i = 0; i < 3; i++) {
    const s = R.ymPlus(R.ymAus(heute), i);
    if (!R.einnahmeAktivIm(g, s)) continue;
    const w = gehaltIm(g, s);
    if (w.datum > heute) return Object.assign({ monat: s, name: g.name || 'Gehalt' }, w);
  }
  return null;
}

// Vorschau: Stand heute, Liste mit Stand nach jeder Bewegung, tiefster Stand (gesamt und bis zum Gehalt)
export function vorschau(daten, heute) {
  const ek = eingangskonto(daten);
  if (!ek) return null;
  const ng = naechstesGehalt(daten, heute);
  // bis zum Monatsende nach dem nächsten Gehalt (dort kommen meist Miete und Daueraufträge) …
  const ende = (s) => s + '-' + R.zweistellig(R.tageImMonat(s));
  // … plus 5 Tage: Daueraufträge und Abbuchungen am Monatsanfang (auch nach einem Wochenende)
  let bis = ende(ng ? R.ymAus(ng.datum) : R.ymAus(heute));
  if (bis < nachTag(heute, 7)) bis = ende(R.ymPlus(R.ymAus(heute), 1));
  bis = nachTag(bis, 5);
  const alle = bewegungen(daten, bis);
  // offene Budgets vom Eingangskonto: dieser Monat heute, nächster Monat am 1.
  const budgets = [];
  for (const s of [R.ymAus(heute), R.ymPlus(R.ymAus(heute), 1)]) {
    const tag = s === R.ymAus(heute) ? heute : s + '-01';
    if (tag > bis || tag <= ek.standDatum && s !== R.ymAus(heute)) continue;
    const rest = offeneBudgets(daten, s).reduce((a, x) => a + x.rest, 0);
    if (rest > 0) budgets.push({ datum: tag, betrag: -rund(rest), text: 'Noch offen in Budgets', art: 'budget', geschaetzt: true, monat: s });
  }
  const liste = alle.concat(budgets).sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : (a.betrag > 0 ? 0 : 1) - (b.betrag > 0 ? 0 : 1)));
  let stand = Number(ek.stand) || 0;
  let standHeute = stand;
  for (const x of liste) {
    stand = rund(stand + x.betrag);
    x.stand = stand;
    x.vorbei = x.datum <= heute && x.art !== 'budget';
    if (x.vorbei) standHeute = stand;
  }
  const zukunft = liste.filter((x) => !x.vorbei);
  const tiefsterIn = (l, start) => l.reduce((m, x) => (x.stand < m.stand ? { stand: x.stand, datum: x.datum } : m), { stand: start, datum: heute });
  const tiefster = tiefsterIn(zukunft, standHeute);
  const vorGehalt = ng ? tiefsterIn(zukunft.filter((x) => x.datum < ng.datum), standHeute) : null;
  return {
    konto: ek, name: kontoName(daten), standDatum: ek.standDatum, heute: rund(standHeute), bis,
    vorbei: liste.filter((x) => x.vorbei), zukunft, tiefster, gehalt: ng, vorGehalt,
    tageAlt: Math.round((new Date(heute + 'T12:00:00') - new Date(ek.standDatum + 'T12:00:00')) / 864e5)
  };
}
