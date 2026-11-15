// Rechenlogik der Finanz-App. Reine Funktionen, keine Oberfläche.
// Wörter und Felder wie im CaleConnect-Konzept §5/§15 (claude/konzept-ziele-geld-fortschritt.md).

export const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const MONATE_LANG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

// Rhythmus → Abstand in Monaten
export const RHYTHMUS = { monatlich: 1, vierteljaehrlich: 3, halbjaehrlich: 6, jaehrlich: 12 };
export const RHYTHMUS_TEXT = { monatlich: 'monatlich', vierteljaehrlich: 'vierteljährlich', halbjaehrlich: 'halbjährlich', jaehrlich: 'jährlich' };

// ---------- Datum ----------
// Monate als Text "2026-11" (Budget-Monat beginnt am 1.)
export function ym(jahr, monat) { return jahr + '-' + String(monat).padStart(2, '0'); }
export function ymAus(datum) { return datum.slice(0, 7); }
export function ymTeile(s) { const [j, m] = s.split('-').map(Number); return { jahr: j, monat: m }; }
export function ymPlus(s, n) {
  const { jahr, monat } = ymTeile(s);
  const t = jahr * 12 + (monat - 1) + n;
  return ym(Math.floor(t / 12), (t % 12) + 1);
}
export function tageImMonat(s) { const { jahr, monat } = ymTeile(s); return new Date(jahr, monat, 0).getDate(); }
export function zweistellig(n) { return String(n).padStart(2, '0'); }
// lokale Zeit als "2026-11-15T18:42:00" (ohne Zeitzone, wie im Widget)
export function zeitText(d) {
  return d.getFullYear() + '-' + zweistellig(d.getMonth() + 1) + '-' + zweistellig(d.getDate()) +
    'T' + zweistellig(d.getHours()) + ':' + zweistellig(d.getMinutes()) + ':' + zweistellig(d.getSeconds());
}
export function datumText(d) { return zeitText(d).slice(0, 10); }

// ---------- Geld ----------
export function euro(x, mitZeichen = true) {
  const r = Math.round(x * 100) / 100;
  const s = r.toLocaleString('de-DE', { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return mitZeichen ? s + ' €' : s;
}
export function euroRund(x) { return Math.round(x).toLocaleString('de-DE') + ' €'; }

// ---------- Fixkosten ----------
export function eigenerBetrag(fk) {
  const anteil = fk.meinAnteil == null ? 100 : fk.meinAnteil;
  return (Number(fk.betrag) || 0) * anteil / 100;
}

// Monate (1–12), in denen abgebucht wird
export function abbuchungsMonate(fk) {
  const schritt = RHYTHMUS[fk.wieOft] || 1;
  if (schritt === 1) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const start = fk.monat || 1;
  const liste = [];
  for (let k = 0; k < 12; k += schritt) liste.push(((start - 1 + k) % 12) + 1);
  return liste.sort((a, b) => a - b);
}

// läuft die Fixkoste im Monat s noch? (endetAm = letzter Tag, an dem sie noch gilt)
export function laeuftIm(fk, s) {
  if (!fk.endetAm) return true;
  return s <= ymAus(fk.endetAm);
}

export function wirdAbgebuchtIm(fk, s) {
  return laeuftIm(fk, s) && abbuchungsMonate(fk).includes(ymTeile(s).monat);
}

// Abbuchungstag im Monat s (31. im Februar → letzter Tag)
export function abbuchungsTag(fk, s) { return Math.min(fk.tag || 1, tageImMonat(s)); }

// Monatsanteil, der in den anderen Monaten zurückgelegt wird
export function monatsAnteil(fk) { return eigenerBetrag(fk) / (RHYTHMUS[fk.wieOft] || 1); }

export function rhythmusBeschreibung(fk) {
  const tag = (fk.tag || 1) + '.';
  if (fk.wieOft === 'monatlich' || !RHYTHMUS[fk.wieOft]) return 'monatlich am ' + tag;
  if (fk.wieOft === 'jaehrlich') return 'jährlich am ' + tag + ' ' + MONATE_LANG[(fk.monat || 1) - 1];
  return RHYTHMUS_TEXT[fk.wieOft] + ' am ' + tag + ' · ' + abbuchungsMonate(fk).map((m) => MONATE_KURZ[m - 1]).join(', ');
}

// ---------- Einnahmen (Konzept §13) ----------
// Wert der Einnahme im Monat s: Ist-Wert, wenn eingetragen, sonst Schätzung (bei Spanne der untere Wert)
export function einnahmeIm(e, s) {
  const ist = (e.istWerte || []).find((w) => ymAus(w.datum) === s);
  if (ist) return { betrag: Number(ist.betrag) || 0, geschaetzt: false, schaetzung: schaetzung(e) };
  return { betrag: schaetzung(e), geschaetzt: !e.sicher, schaetzung: schaetzung(e) };
}
export function schaetzung(e) {
  const b = e.betrag;
  if (b && typeof b === 'object') return Number(b.von) || 0;
  return Number(b) || 0;
}
export function ankunftsTag(e, s) {
  if (e.kommtAn === 'Monatsende') return tageImMonat(s);
  if (e.kommtAn && /^\d+$/.test(String(e.ankunftTag || ''))) return Math.min(Number(e.ankunftTag), tageImMonat(s));
  return tageImMonat(s);
}

// ---------- Sparraten (Konzept §15) ----------
// Stand am Datum d ("2026-11-15"): Stand zum standDatum plus jede Rate, die seitdem fällig war
export function sparStand(sp, d) {
  let stand = Number(sp.stand) || 0;
  if (!sp.standDatum) return stand;
  const tag = sp.tag || 1;
  let s = ymAus(sp.standDatum);
  // Rate im Monat des standDatum zählt nur, wenn ihr Tag nach dem standDatum liegt
  for (let i = 0; i < 600; i++) {
    const faellig = s + '-' + zweistellig(Math.min(tag, tageImMonat(s)));
    if (faellig > d) break;
    if (faellig > sp.standDatum) stand += Number(sp.betrag) || 0;
    s = ymPlus(s, 1);
  }
  return stand;
}

// ---------- Buchungen (Ausgaben aus den Widgets) ----------
export function buchungenIm(daten, s, kategorieId) {
  return (daten.buchungen || []).filter((b) => ymAus(b.zeit) === s && (!kategorieId || b.kategorieId === kategorieId));
}
export function ausgegebenIm(daten, s, kategorieId) {
  return buchungenIm(daten, s, kategorieId).reduce((a, b) => a + (Number(b.betrag) || 0), 0);
}
// vorher/nachher je Buchung (im Monat und in der Kategorie, nach Zeit sortiert)
export function verlaufMitStand(daten) {
  const sortiert = [...(daten.buchungen || [])].sort((a, b) => (a.zeit < b.zeit ? -1 : a.zeit > b.zeit ? 1 : 0));
  const summe = {};
  return sortiert.map((b) => {
    const k = ymAus(b.zeit) + '|' + b.kategorieId;
    const vorher = summe[k] || 0;
    const nachher = vorher + (Number(b.betrag) || 0);
    summe[k] = nachher;
    return Object.assign({}, b, { vorher, nachher });
  }).reverse();
}

// ---------- Monat ----------
export function kategorie(daten, id) { return (daten.kategorien || []).find((k) => k.id === id); }

export function monatsRechnung(daten, s) {
  const einnahmen = (daten.einnahmen || []).filter((e) => e.wieOft === 'monatlich').map((e) => Object.assign({ einnahme: e }, einnahmeIm(e, s)));
  const einkommen = einnahmen.reduce((a, e) => a + e.betrag, 0);
  const geschaetzt = einnahmen.some((e) => e.geschaetzt);

  const gruppen = [];
  let zurueck = 0;
  for (const kat of (daten.kategorien || []).filter((k) => k.art === 'fix')) {
    const posten = (daten.fixkosten || []).filter((f) => f.kategorieId === kat.id && laeuftIm(f, s)).map((f) => {
      const faellig = wirdAbgebuchtIm(f, s);
      const anteil = monatsAnteil(f);
      if (!faellig) zurueck += anteil;
      return { fixkosten: f, faellig, betrag: eigenerBetrag(f), anteil, wann: rhythmusBeschreibung(f) + (f.abo ? ' · Abo' : '') };
    });
    const summe = posten.filter((p) => p.faellig).reduce((a, p) => a + p.betrag, 0);
    const anteilSumme = posten.filter((p) => !p.faellig).reduce((a, p) => a + p.anteil, 0);
    gruppen.push({ kategorie: kat, art: 'fix', farbe: kat.farbe, name: kat.name, posten, summe, anteilSumme });
  }
  const budgetKats = (daten.kategorien || []).filter((k) => k.art === 'budget');
  if (budgetKats.length) {
    const posten = budgetKats.map((k) => {
      const ausgegeben = ausgegebenIm(daten, s, k.id);
      const budget = Number(k.budget) || 0;
      return { kategorie: k, faellig: true, betrag: Math.max(budget, ausgegeben), budget, ausgegeben };
    });
    gruppen.push({ art: 'budget', farbe: (daten.einstellungen && daten.einstellungen.budgetFarbe) || '#5d7d99', name: 'Budgets', posten, summe: posten.reduce((a, p) => a + p.betrag, 0), anteilSumme: 0 });
  }

  const ausgaben = gruppen.reduce((a, g) => a + g.summe, 0);
  const zuruecklegen = Math.round(zurueck);
  const sparen = (daten.sparraten || []).reduce((a, sp) => a + (Number(sp.betrag) || 0), 0);
  const frei = einkommen - ausgaben - zuruecklegen - sparen;
  return { monat: s, einnahmen, einkommen, geschaetzt, gruppen, ausgaben, zuruecklegen, sparen, frei };
}

// ---------- Jahr ----------
export function jahresUeberblick(daten, abMonat, anzahl = 12) {
  const fixKats = (daten.kategorien || []).filter((k) => k.art === 'fix');
  const monate = [];
  for (let i = 0; i < anzahl; i++) {
    const s = ymPlus(abMonat, i);
    const teile = fixKats.map((k) => ({
      kategorie: k,
      summe: (daten.fixkosten || []).filter((f) => f.kategorieId === k.id && wirdAbgebuchtIm(f, s)).reduce((a, f) => a + eigenerBetrag(f), 0)
    }));
    const zusaetzlich = (daten.fixkosten || []).filter((f) => f.wieOft !== 'monatlich' && wirdAbgebuchtIm(f, s))
      .map((f) => ({ fixkosten: f, text: f.name + ' ' + euro(eigenerBetrag(f)) + ' am ' + abbuchungsTag(f, s) + '.' }));
    monate.push({ monat: s, name: MONATE_KURZ[ymTeile(s).monat - 1], teile, summe: teile.reduce((a, t) => a + t.summe, 0), zusaetzlich });
  }
  return monate;
}

// ---------- Nächste Abbuchungen (für das Fixkosten-Widget, gleiche Regel wie in Kotlin) ----------
export function naechsteAbbuchungen(daten, heute) {
  const ergebnis = [];
  let s = ymAus(heute);
  for (let i = 0; i < 13; i++) {
    for (const f of daten.fixkosten || []) {
      if (!wirdAbgebuchtIm(f, s)) continue;
      const datum = s + '-' + zweistellig(abbuchungsTag(f, s));
      if (datum >= heute) ergebnis.push({ datum, fixkosten: f, betrag: eigenerBetrag(f) });
    }
    s = ymPlus(s, 1);
  }
  return ergebnis.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
}

export function fixkostenProMonat(daten) {
  return (daten.fixkosten || []).filter((f) => laeuftIm(f, ymAus(datumText(new Date())))).reduce((a, f) => a + monatsAnteil(f), 0);
}
