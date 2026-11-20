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
// v27: Ein Betrag kann sich ändern, ohne dass alte Monate mitgeändert werden.
// `frueher: [{ bis: "2026-10", betrag, meinAnteil? }]` = bis einschließlich Oktober galt der alte Betrag.
// Mit Monat s liefert betragIm den Eintrag, der in diesem Monat galt; ohne Monat den heutigen.
export function betragIm(fk, s) {
  if (s && Array.isArray(fk.frueher)) {
    const e = fk.frueher.filter((x) => x && x.bis && s <= x.bis).sort((a, b) => (a.bis < b.bis ? -1 : 1))[0];
    if (e) return e;
  }
  return fk;
}
export function eigenerBetrag(fk, s) {
  const q = betragIm(fk, s);
  const a = q.meinAnteil == null ? fk.meinAnteil : q.meinAnteil;
  const anteil = a == null ? 100 : a;
  return (Number(q.betrag) || 0) * anteil / 100;
}
// Betrag ändern mit „gilt ab“: ab = erster Monat mit dem neuen Betrag (null = schon immer)
export function betragAendern(fk, werte, ab) {
  if (ab) {
    const bis = ymPlus(ab, -1);
    const alt = betragIm(fk, bis);
    const liste = (fk.frueher || []).filter((x) => x && x.bis < bis);
    liste.push({ bis, betrag: Number(alt.betrag) || 0, meinAnteil: alt.meinAnteil == null ? (fk.meinAnteil == null ? 100 : fk.meinAnteil) : alt.meinAnteil });
    fk.frueher = liste;
  }
  Object.assign(fk, werte);
  return fk;
}
// v33: Betrag im Lauf der Zeit – Abschnitte { von, bis, betrag (eigener Anteil), jetzt, geplant }; von/bis null = offen
export function betragVerlauf(fk, h) {
  const liste = [...(fk.frueher || [])].filter((x) => x && x.bis).sort((a, b) => (a.bis < b.bis ? -1 : 1));
  const teile = [];
  let von = null;
  const anteil = (x) => (x.meinAnteil == null ? fk.meinAnteil : x.meinAnteil);
  for (const x of liste) { teile.push({ von, bis: x.bis, betrag: eigenerBetrag({ betrag: x.betrag, meinAnteil: anteil(x) }), voll: Number(x.betrag) || 0 }); von = ymPlus(x.bis, 1); }
  teile.push({ von, bis: null, betrag: eigenerBetrag({ betrag: fk.betrag, meinAnteil: fk.meinAnteil }), voll: Number(fk.betrag) || 0 });
  return teile.map((t) => Object.assign(t, { jetzt: (!t.von || t.von <= h) && (!t.bis || t.bis >= h), geplant: !!t.von && t.von > h }));
}
// Nächste geplante Änderung ab Monat h: { ab, betrag } oder null
export function geplanteAenderung(fk, h) {
  const t = betragVerlauf(fk, h).find((x) => x.geplant);
  return t ? { ab: t.von, betrag: t.betrag } : null;
}
// Geplante Änderungen verwerfen: der Betrag von Monat h gilt wieder dauerhaft
export function geplanteVerwerfen(fk, h) {
  const jetzt = betragIm(fk, h);
  fk.betrag = Number(jetzt.betrag) || 0;
  if (jetzt.meinAnteil != null) fk.meinAnteil = jetzt.meinAnteil;
  fk.frueher = (fk.frueher || []).filter((x) => x && x.bis < h);
  if (!fk.frueher.length) delete fk.frueher;
  return fk;
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

// ---------- v33: Bankarbeitstage ----------
// SEPA-Lastschriften werden nur an TARGET-Geschäftstagen gebucht: nicht am Wochenende, nicht an Neujahr,
// Karfreitag, Ostermontag, 1. Mai, 25. und 26. Dezember (Deutsche Bundesbank, Merkblatt Feiertage).
// Fällt der Tag darauf, wird am nächsten Geschäftstag abgebucht.
function ostersonntag(j) {
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(j, monat - 1, tag, 12);
}
const isoTag = (d) => d.getFullYear() + '-' + zweistellig(d.getMonth() + 1) + '-' + zweistellig(d.getDate());
const targetCache = {};
function targetFrei(jahr) {
  if (!targetCache[jahr]) {
    const o = ostersonntag(jahr); const plus = (n) => { const d = new Date(o); d.setDate(d.getDate() + n); return isoTag(d); };
    targetCache[jahr] = new Set([jahr + '-01-01', plus(-2), plus(1), jahr + '-05-01', jahr + '-12-25', jahr + '-12-26']);
  }
  return targetCache[jahr];
}
export function istBankTag(datum) {
  const d = new Date(datum + 'T12:00:00'); const w = d.getDay();
  return w !== 0 && w !== 6 && !targetFrei(d.getFullYear()).has(datum);
}
// Tag, an dem wirklich abgebucht wird (gleich oder später)
export function bankTag(datum) {
  const d = new Date(datum + 'T12:00:00');
  for (let i = 0; i < 10 && !istBankTag(isoTag(d)); i++) d.setDate(d.getDate() + 1);
  return isoTag(d);
}
// Fälligkeit und echter Abbuchungstag einer Fixkoste im Monat s
export function abbuchungIm(fk, s) {
  const faellig = s + '-' + zweistellig(abbuchungsTag(fk, s));
  return { faellig, gebucht: bankTag(faellig) };
}

// Monatsanteil, der in den anderen Monaten zurückgelegt wird
export function monatsAnteil(fk, s) { return eigenerBetrag(fk, s) / (RHYTHMUS[fk.wieOft] || 1); }

export function rhythmusBeschreibung(fk) {
  const tag = (fk.tag || 1) + '.';
  if (fk.wieOft === 'monatlich' || !RHYTHMUS[fk.wieOft]) return 'monatlich am ' + tag;
  if (fk.wieOft === 'jaehrlich') return 'jährlich am ' + tag + ' ' + MONATE_LANG[(fk.monat || 1) - 1];
  return RHYTHMUS_TEXT[fk.wieOft] + ' am ' + tag + ' · ' + abbuchungsMonate(fk).map((m) => MONATE_KURZ[m - 1]).join(', ');
}

// ---------- Einnahmen (Konzept §13) ----------
// Wert der Einnahme im Monat s: Ist-Wert, wenn eingetragen, sonst Schätzung (bei Spanne der untere Wert)
export function gehaltVon(daten) {
  const l = daten.einnahmen || [];
  return l.find((e) => e.id === 'gehalt') || l.find((e) => e.wieOft === 'monatlich' && !e.status) || null;
}
// Ist die Einnahme im Monat s vorgesehen? monatlich (mit ab/bis) oder einmalig im Monat
export function einnahmeAktivIm(e, s) {
  if ((e.istWerte || []).some((w) => ymAus(w.datum) === s)) return true;
  if (e.wieOft === 'einmalig') return e.monat === s;
  if (e.wieOft === 'monatlich') return !(e.ab && s < e.ab) && !(e.bis && s > e.bis);
  return false;
}
// Wert der Einnahme im Monat s: Ist-Wert, wenn eingetragen, sonst Schätzung (bei Spanne der untere Wert).
// Zählt zu „Frei“, wenn sie fest ist oder im Monat angekommen ist; „geplant“ zählt erst nach „Kam an“.
export function einnahmeIm(e, s) {
  const ist = (e.istWerte || []).find((w) => ymAus(w.datum) === s);
  const sch = schaetzungIm(e, s);
  if (ist) return { betrag: Number(ist.betrag) || 0, geschaetzt: false, schaetzung: sch, zaehlt: true, angekommen: true };
  return { betrag: sch, geschaetzt: !e.sicher, schaetzung: sch, zaehlt: e.status !== 'geplant', angekommen: false, ausDiensten: !!(e.schaetzWerte && e.schaetzWerte[s] != null) };
}
// v27: Schätzung für genau diesen Monat (aus dem Dienstplan gerechnet, liegt in `schaetzWerte`), sonst die allgemeine
export function schaetzungIm(e, s) {
  const w = e.schaetzWerte && e.schaetzWerte[s];
  return w != null && isFinite(Number(w)) ? Number(w) : schaetzung(e);
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
// Zählt ein einmaliger Übertrag zum Stand dazu? Ja, wenn er nach dem standDatum liegt.
// Am selben Tag entscheidet die Uhrzeit (v26): erst Stand eingetragen, dann übertragen → zählt dazu.
export function uebertragNachStand(sp, u) {
  const sd = sp.standDatum || '';
  if (u.datum > sd) return true;
  return u.datum === sd && !!sp.standZeit && !!u.angelegt && u.angelegt > sp.standZeit;
}
// Stand am Datum d ("2026-11-15"): Stand zum standDatum plus jede Rate, die seitdem fällig war
export function sparStand(sp, d, daten) {
  let stand = Number(sp.stand) || 0;
  // einmalige Überträge (Extra) seit dem standDatum
  if (daten) stand += summeBetrag((daten.uebertraege || []).filter((u) => u.kontoId === sp.id && uebertragNachStand(sp, u) && u.datum <= d));
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

// ---------- Überträge (Geld auf ein anderes Konto schieben) ----------
// Jedes Konto (Sparrate) hat eine feste Monatsrate (betrag, tag) = Übertrag „jeden Monat“.
// Einmalige Überträge stehen in daten.uebertraege: { id, datum, betrag, kontoId }.
const summeBetrag = (l) => l.reduce((a, x) => a + (Number(x.betrag) || 0), 0);
export function uebertraegeIm(daten, s, kontoId) {
  return (daten.uebertraege || []).filter((u) => ymAus(u.datum) === s && (!kontoId || u.kontoId === kontoId));
}
export function kontoArt(sp) { return sp.art === 'ruecklage' ? 'ruecklage' : sp.art === 'extern' ? 'extern' : sp.art === 'konsum' ? 'konsum' : 'sparen'; }
// Interne Überträge (v31): { vonKontoId } = Geld geht von einem eigenen Konto weg (z. B. Rest vom Konsumkonto).
// kontoId leer = zurück aufs Eingangskonto. Interne Überträge zwischen zwei Konten ändern „Frei“ nicht.
export function ausEingang(u) { return !u.vonKontoId; }

// ---------- Konsumkonto (v31) ----------
// Ein Konto mit art "konsum": fester Dauerauftrag vom Eingangskonto (betrag, tag). Budget-Kategorien mit
// kontoId = Konsumkonto werden von dort bezahlt: Ihre Ausgaben zählen nicht in „Frei“, dort zählt nur der Dauerauftrag.
export function konsumKonto(daten) { return (daten.sparraten || []).find((sp) => sp.art === 'konsum') || null; }
export function istKonsum(daten, k, kk = konsumKonto(daten)) { return !!kk && !!k && k.art === 'budget' && k.kontoId === kk.id; }
export function konsumKategorien(daten) { const kk = konsumKonto(daten); return (daten.kategorien || []).filter((k) => istKonsum(daten, k, kk)); }
// Buchung nach dem eingetragenen Stand? Am selben Tag entscheidet die Uhrzeit.
function buchungNachStand(sp, b) {
  const d = b.zeit.slice(0, 10); const sd = sp.standDatum || '';
  if (d > sd) return true;
  return d === sd && !!sp.standZeit && b.zeit > zeitText(new Date(sp.standZeit));
}
// Stand am Tag d: Stand + Dauerauftrag + Überträge hinein − Konsum-Buchungen − Überträge hinaus (jeweils seit dem Stand)
export function konsumStand(daten, d) {
  const kk = konsumKonto(daten);
  if (!kk) return 0;
  let stand = sparStand(kk, d, daten);
  const ids = new Set(konsumKategorien(daten).map((k) => k.id));
  for (const b of daten.buchungen || []) if (ids.has(b.kategorieId) && b.zeit.slice(0, 10) <= d && buchungNachStand(kk, b)) stand -= Number(b.betrag) || 0;
  for (const u of daten.uebertraege || []) if (u.vonKontoId === kk.id && u.datum <= d && uebertragNachStand(kk, u)) stand -= Number(u.betrag) || 0;
  return Math.round(stand * 100) / 100;
}
// Tag des Dauerauftrags im Monat s
export function konsumEingang(kk, s) { return s + '-' + zweistellig(Math.min(kk.tag || 1, tageImMonat(s))); }
const tageZwischen = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
// Für die Kachel: Stand heute, ausgegeben im Monat, wie viel pro Tag bis zum nächsten Eingang
export function konsumUebersicht(daten, heute) {
  const kk = konsumKonto(daten);
  if (!kk) return null;
  const s = ymAus(heute);
  const kats = konsumKategorien(daten);
  const ids = new Set(kats.map((k) => k.id));
  const buchungen = buchungenIm(daten, s).filter((b) => ids.has(b.kategorieId));
  const ausgegeben = summeBetrag(buchungen);
  let naechster = konsumEingang(kk, s);
  if (naechster <= heute) naechster = konsumEingang(kk, ymPlus(s, 1));
  const tage = Math.max(1, tageZwischen(heute, naechster));
  const stand = konsumStand(daten, heute);
  const proKategorie = kats.map((k) => ({ kategorie: k, ausgegeben: ausgegebenIm(daten, s, k.id), budget: Number(k.budget) || 0 }));
  return { konto: kk, stand, ausgegeben, rate: Number(kk.betrag) || 0, naechster, tage, proTag: Math.max(0, stand) / tage, kategorien: kats, proKategorie, buchungen };
}
// Rest der letzten Runde: einmal fragen, sobald der neue Dauerauftrag da ist (Monat = Monat vor dem Eingang)
export function konsumRest(daten, heute) {
  const kk = konsumKonto(daten);
  if (!kk || !kk.standDatum) return null;
  const s = ymAus(heute);
  const eingang = konsumEingang(kk, s);
  if (heute < eingang) return null;
  const vm = ymPlus(s, -1);
  if (((daten.einstellungen && daten.einstellungen.konsumAbgeschlossen) || []).includes(vm)) return null;
  const vorher = new Date(eingang + 'T12:00:00');
  vorher.setDate(vorher.getDate() - 1);
  const bis = datumText(vorher);
  // erst fragen, wenn die App mindestens einen Tag der Runde mitverfolgt hat
  if (kk.standDatum >= bis) return null;
  const rest = konsumStand(daten, bis);
  if (Math.abs(rest) < 1) return null;
  return { monat: vm, bis, rest };
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

// ---------- Rücklagenkonto ----------
// Eine Sparrate mit art "ruecklage": feste Monatsrate auf ein eigenes Konto, daraus werden
// alle nicht monatlichen Fixkosten bezahlt. Ohne Rücklagenkonto zählen sie im Monat der Abbuchung voll.
export function ruecklage(daten) { return (daten.sparraten || []).find((sp) => sp.art === 'ruecklage') || null; }
export function sparratenNormal(daten) { return (daten.sparraten || []).filter((sp) => kontoArt(sp) === 'sparen'); }
export function sparratenExtern(daten) { return (daten.sparraten || []).filter((sp) => kontoArt(sp) === 'extern'); }
const istMonatlich = (f) => (RHYTHMUS[f.wieOft] || 1) === 1;

export function empfohleneRuecklage(daten, s) {
  const summe = (daten.fixkosten || []).filter((f) => !istMonatlich(f) && laeuftIm(f, s)).reduce((a, f) => a + monatsAnteil(f, s), 0);
  return Math.ceil(summe / 5) * 5;
}

// Ein- und Auszahlungen der Rücklage zwischen zwei Tagen (von exklusiv, bis inklusive)
function ruecklageBewegungen(daten, rk, von, bis, abStand = false) {
  const liste = [];
  let s = ymAus(von);
  for (let i = 0; i < 600 && s <= ymAus(bis); i++) {
    const rateTag = s + '-' + zweistellig(Math.min(rk.tag || 1, tageImMonat(s)));
    if (rateTag > von && rateTag <= bis) liste.push({ datum: rateTag, betrag: Number(rk.betrag) || 0 });
    for (const u of uebertraegeIm(daten, s, rk.id)) if ((u.datum > von || (abStand && uebertragNachStand(rk, u))) && u.datum <= bis) liste.push({ datum: u.datum, betrag: Number(u.betrag) || 0 });
    for (const f of daten.fixkosten || []) {
      if (istMonatlich(f) || !wirdAbgebuchtIm(f, s)) continue;
      const d = abbuchungIm(f, s).gebucht;
      if (d > von && d <= bis) liste.push({ datum: d, betrag: -eigenerBetrag(f, s), fixkosten: f });
    }
    s = ymPlus(s, 1);
  }
  // am selben Tag: erst die Rate, dann die Abbuchung
  return liste.sort((x, y) => (x.datum < y.datum ? -1 : x.datum > y.datum ? 1 : y.betrag - x.betrag));
}

export function ruecklageStand(daten, d) {
  const rk = ruecklage(daten);
  if (!rk) return 0;
  const start = rk.standDatum || d;
  return ruecklageBewegungen(daten, rk, start, d, true).reduce((a, b) => a + b.betrag, Number(rk.stand) || 0);
}

// Reicht die Rücklage für die nächsten 12 Monate? Liefert die erste Lücke oder null.
export function ruecklageLuecke(daten, heute) {
  const rk = ruecklage(daten);
  if (!rk) return null;
  let stand = ruecklageStand(daten, heute);
  const bis = ymPlus(ymAus(heute), 12) + '-01';
  for (const b of ruecklageBewegungen(daten, rk, heute, bis)) {
    stand += b.betrag;
    if (stand < -0.005 && b.fixkosten) return { datum: b.datum, fehlt: -stand, fixkosten: b.fixkosten };
  }
  return null;
}

// ---------- Monat ----------
export function kategorie(daten, id) { return (daten.kategorien || []).find((k) => k.id === id); }

// opt.vorbei: Der Monat ist vorbei → Budgets zählen nur mit dem, was wirklich ausgegeben wurde.
// „Frei“ ist dann das, was tatsächlich übrig blieb.
export function monatsRechnung(daten, s, opt = {}) {
  const alle = (daten.einnahmen || []).filter((e) => einnahmeAktivIm(e, s)).map((e) => Object.assign({ einnahme: e }, einnahmeIm(e, s)));
  const einnahmen = alle.filter((e) => e.zaehlt);
  const geplanteEinnahmen = alle.filter((e) => !e.zaehlt);
  const einkommen = einnahmen.reduce((a, e) => a + e.betrag, 0);
  const geschaetzt = einnahmen.some((e) => e.geschaetzt);
  const rk = ruecklage(daten);

  const gruppen = [];
  for (const kat of (daten.kategorien || []).filter((k) => k.art === 'fix')) {
    const posten = (daten.fixkosten || []).filter((f) => f.kategorieId === kat.id && laeuftIm(f, s)).map((f) => {
      const faellig = wirdAbgebuchtIm(f, s);
      const ausRuecklage = !!rk && !istMonatlich(f);
      return { fixkosten: f, faellig, ausRuecklage, zaehlt: faellig && !ausRuecklage, betrag: eigenerBetrag(f, s), anteil: monatsAnteil(f, s), wann: rhythmusBeschreibung(f) + (f.abo ? ' · Abo' : '') };
    });
    const summe = posten.filter((p) => p.zaehlt).reduce((a, p) => a + p.betrag, 0);
    gruppen.push({ kategorie: kat, art: 'fix', farbe: kat.farbe, name: kat.name, posten, summe });
  }
  const kk = konsumKonto(daten);
  const budgetKats = (daten.kategorien || []).filter((k) => k.art === 'budget');
  const budgetPosten = (k) => {
    const ausgegeben = ausgegebenIm(daten, s, k.id);
    const budget = Number(k.budget) || 0;
    return { kategorie: k, faellig: true, zaehlt: true, betrag: opt.vorbei ? ausgegeben : Math.max(budget, ausgegeben), budget, ausgegeben };
  };
  const normal = budgetKats.filter((k) => !istKonsum(daten, k, kk));
  if (normal.length) {
    const posten = normal.map(budgetPosten);
    gruppen.push({ art: 'budget', farbe: (daten.einstellungen && daten.einstellungen.budgetFarbe) || '#5d7d99', name: 'Budgets', posten, summe: posten.reduce((a, p) => a + p.betrag, 0) });
  }
  // v31: Konsum-Kategorien – bezahlt vom Konsumkonto, zählen nicht in „Frei“ (summe 0)
  const konsumKats = budgetKats.filter((k) => istKonsum(daten, k, kk));
  if (konsumKats.length) {
    const posten = konsumKats.map((k) => Object.assign(budgetPosten(k), { zaehlt: false, betrag: 0, konsum: true }));
    gruppen.push({ art: 'budget', konsum: true, farbe: 'var(--konsum)', name: kk.name || 'Konsumkonto', posten, summe: 0, ausgegeben: posten.reduce((a, p) => a + p.ausgegeben, 0) });
  }

  const ausgaben = gruppen.reduce((a, g) => a + g.summe, 0);
  // Konten: feste Monatsrate + einmalige Überträge in diesem Monat
  const konten = [rk].concat(sparratenNormal(daten), sparratenExtern(daten), [kk]).filter(Boolean).map((sp) => {
    const rate = Number(sp.betrag) || 0;
    // nur Geld vom Eingangskonto zählt; Rest, der zurück aufs Eingangskonto geht, zählt dagegen
    const zurueck = summeBetrag((daten.uebertraege || []).filter((u) => u.vonKontoId === sp.id && !u.kontoId && ymAus(u.datum) === s));
    const extra = summeBetrag(uebertraegeIm(daten, s, sp.id).filter(ausEingang)) - zurueck;
    return { konto: sp, art: kontoArt(sp), rate, extra, zurueck, betrag: rate + extra };
  });
  const summeArt = (art) => konten.filter((k) => k.art === art).reduce((a, k) => a + k.betrag, 0);
  const zuruecklegen = summeArt('ruecklage');
  const sparen = summeArt('sparen');
  const extern = summeArt('extern');
  const konsum = summeArt('konsum');
  const frei = einkommen - ausgaben - zuruecklegen - sparen - extern - konsum;
  const g = gehaltVon(daten);
  const gehaltWert = einnahmen.find((e) => g && e.einnahme === g) || { betrag: 0, geschaetzt: !!g && !g.sicher, schaetzung: g ? schaetzung(g) : 0 };
  const weitere = einnahmen.filter((e) => !g || e.einnahme !== g).reduce((a, e) => a + e.betrag, 0);
  // offene Beträge (v25) stehen unter „Mit Offenem“, nicht unter „Mit Geplantem“
  const geplantRein = geplanteEinnahmen.filter((e) => !e.einnahme.offen).reduce((a, e) => a + e.betrag, 0);
  return { monat: s, einnahmen, geplanteEinnahmen, gehaltWert, weitere, geplantRein, einkommen, geschaetzt, gruppen, ausgaben, zuruecklegen, mitRuecklage: !!rk, sparen, extern, konsum, mitKonsum: !!kk, konten, frei, vorbei: !!opt.vorbei };
}

// Ohne Rücklagenkonto: nächster Monat (ab dem folgenden), in dem nicht monatliche Kosten anfallen
export function naechsterBrockenMonat(daten, s) {
  for (let i = 1; i <= 12; i++) {
    const m = ymPlus(s, i);
    const posten = (daten.fixkosten || []).filter((f) => !istMonatlich(f) && wirdAbgebuchtIm(f, m));
    if (posten.length) return { monat: m, posten, summe: posten.reduce((a, f) => a + eigenerBetrag(f, m), 0), frei: monatsRechnung(daten, m).frei };
  }
  return null;
}

// ---------- Potenzielle Ausgaben (Wünsche, Konzept §5/§15) ----------
export function preisBis(w) { const p = w.preis; return p && typeof p === 'object' ? Number(p.bis) || Number(p.von) || 0 : Number(p) || 0; }
export function preisVon(w) { const p = w.preis; return p && typeof p === 'object' ? Number(p.von) || 0 : Number(p) || 0; }
export function preisText(w) {
  const p = w.preis;
  return p && typeof p === 'object' && Number(p.bis) > Number(p.von) ? euro(Number(p.von), false) + '–' + euro(Number(p.bis)) : euro(preisBis(w));
}
export function offeneWuensche(daten) { return (daten.wuensche || []).filter((w) => w.status !== 'gekauft'); }

// Prüft alle geplanten Wünsche ab dem Monat ab: reicht das Geld, wird ein Budget überschritten, ab wann leistbar?
// Gerechnet wird vorsichtig mit dem oberen Preis; was in einem Monat frei bleibt, steht in den Folgemonaten zur Verfügung.
export function wunschPruefung(daten, ab, monate = 24) {
  const wuensche = offeneWuensche(daten);
  const ergebnis = {};
  const freiIm = {};
  for (let i = 0; i < monate; i++) { const m = ymPlus(ab, i); freiIm[m] = monatsRechnung(daten, m).frei; }
  const monatVon = (w) => (w.monat && w.monat >= ab ? w.monat : ab);
  // Budget-Wünsche: was über das Budget hinausgeht, kommt aus „Frei“
  const ausFrei = {};
  const budgetRest = {};
  for (const w of wuensche.filter((x) => x.monat)) {
    const m = monatVon(w);
    let ueber = 0;
    const k = w.kategorieId ? kategorie(daten, w.kategorieId) : null;
    if (k && k.art === 'budget') {
      const key = m + '|' + k.id;
      if (budgetRest[key] == null) budgetRest[key] = Math.max(0, (Number(k.budget) || 0) - ausgegebenIm(daten, m, k.id));
      const rest = budgetRest[key];
      ueber = Math.max(0, preisBis(w) - rest);
      budgetRest[key] = Math.max(0, rest - preisBis(w));
      ergebnis[w.id] = { budgetUeber: ueber, kategorie: k };
    } else ueber = preisBis(w);
    ausFrei[w.id] = ueber;
  }
  // Monat für Monat: übrig = alles Freie bisher minus alles Geplante bisher
  let uebrig = 0;
  const reihenfolge = [];
  for (let i = 0; i < monate; i++) {
    const m = ymPlus(ab, i);
    uebrig += freiIm[m];
    for (const w of wuensche.filter((x) => x.monat && monatVon(x) === m)) {
      uebrig -= ausFrei[w.id];
      const r = ergebnis[w.id] || (ergebnis[w.id] = {});
      r.monat = m;
      r.fehlt = uebrig < -0.005 ? -uebrig : 0;
      reihenfolge.push(w);
    }
    if (i === 0) ergebnis.__ersterMonatUebrig = uebrig;
  }
  // frühestens leistbar: ab welchem Monat wäre die Lücke durch freie Monate gedeckt?
  for (const w of reihenfolge) {
    const r = ergebnis[w.id];
    if (!r.fehlt) continue;
    let luecke = r.fehlt;
    for (let i = 1; i < monate; i++) {
      const m = ymPlus(r.monat, i);
      if (freiIm[m] == null) break;
      luecke -= freiIm[m];
      if (luecke <= 0) { r.fruehestens = m; break; }
    }
  }
  // Wünsche ohne Monat: ab wann leistbar, nach allen geplanten
  let rest = 0;
  const offen = wuensche.filter((x) => !x.monat);
  const kum = [];
  for (let i = 0; i < monate; i++) {
    const m = ymPlus(ab, i);
    rest += freiIm[m];
    for (const w of reihenfolge.filter((x) => ergebnis[x.id].monat === m)) rest -= ausFrei[w.id];
    kum.push([m, rest]);
  }
  // leistbar ab Monat k nur, wenn danach kein geplanter Monat ins Minus rutscht
  let verbraucht = 0;
  for (const w of offen) {
    const brauch = preisBis(w);
    let treffer = null;
    for (let k = 0; k < kum.length && !treffer; k++) {
      let minRest = Infinity;
      for (let j = k; j < kum.length; j++) minRest = Math.min(minRest, kum[j][1] - verbraucht);
      if (minRest >= brauch) treffer = kum[k];
    }
    ergebnis[w.id] = { offen: true, fruehestens: treffer ? treffer[0] : null, sofort: !!treffer && treffer[0] === ab };
    if (treffer) verbraucht += brauch;
  }
  return ergebnis;
}

// Was im Monat s geplant ist und aus „Frei“ bezahlt würde
export function geplantAusFrei(daten, s, pruefung) {
  return offeneWuensche(daten).filter((w) => w.monat === s).reduce((a, w) => {
    const r = pruefung && pruefung[w.id];
    return a + (r && r.kategorie ? r.budgetUeber || 0 : preisBis(w));
  }, 0);
}

// ---------- Jahr ----------
export function jahresUeberblick(daten, abMonat, anzahl = 12) {
  const fixKats = (daten.kategorien || []).filter((k) => k.art === 'fix');
  const monate = [];
  for (let i = 0; i < anzahl; i++) {
    const s = ymPlus(abMonat, i);
    const teile = fixKats.map((k) => ({
      kategorie: k,
      summe: (daten.fixkosten || []).filter((f) => f.kategorieId === k.id && wirdAbgebuchtIm(f, s)).reduce((a, f) => a + eigenerBetrag(f, s), 0)
    }));
    const zusaetzlich = (daten.fixkosten || []).filter((f) => f.wieOft !== 'monatlich' && wirdAbgebuchtIm(f, s))
      .map((f) => ({ fixkosten: f, betrag: eigenerBetrag(f, s), text: f.name + ' ' + euro(eigenerBetrag(f, s)) + ' am ' + abbuchungsTag(f, s) + '.' }));
    monate.push({ monat: s, name: MONATE_KURZ[ymTeile(s).monat - 1], teile, summe: teile.reduce((a, t) => a + t.summe, 0), zusaetzlich });
  }
  return monate;
}

// ---------- Nächste Abbuchungen (für das Fixkosten-Widget, gleiche Regel wie in Kotlin) ----------
export function naechsteAbbuchungen(daten, heute) {
  const ergebnis = [];
  // ab dem Vormonat: Ein Termin am Monatsende kann wegen des Wochenendes erst im neuen Monat abgebucht werden
  let s = ymPlus(ymAus(heute), -1);
  for (let i = 0; i < 14; i++) {
    for (const f of daten.fixkosten || []) {
      if (!wirdAbgebuchtIm(f, s)) continue;
      const { faellig, gebucht } = abbuchungIm(f, s);
      if (gebucht >= heute) ergebnis.push({ datum: gebucht, faellig, verschoben: gebucht !== faellig, fixkosten: f, betrag: eigenerBetrag(f, s) });
    }
    s = ymPlus(s, 1);
  }
  return ergebnis.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
}

export function fixkostenProMonat(daten) {
  const h = ymAus(datumText(new Date()));
  return (daten.fixkosten || []).filter((f) => laeuftIm(f, h)).reduce((a, f) => a + monatsAnteil(f, h), 0);
}

// ---------- Monatsende ----------
// Was blieb im Monat s wirklich übrig? (Budgets nur mit dem Ausgegebenen)
export function uebrigIm(daten, s) {
  const echt = monatsRechnung(daten, s, { vorbei: true });
  const geplant = monatsRechnung(daten, s);
  return { uebrig: echt.frei, ungenutzt: echt.frei - geplant.frei };
}
export function monatAbgeschlossen(daten, s) { return ((daten.einstellungen && daten.einstellungen.abgeschlossen) || []).includes(s); }

// ---------- Gehalt bestätigen (Schichtdienst: Netto schwankt) ----------
export function gehaltBestaetigt(g, s) { return !!g && (g.istWerte || []).some((w) => ymAus(w.datum) === s); }
// Durchschnitt der letzten n bestätigten Monate (für eine Schätzung, die mitlernt)
export function gehaltStatistik(g, n = 3) {
  const l = [...((g && g.istWerte) || [])].sort((a, b) => (a.datum < b.datum ? 1 : -1)).slice(0, n).map((w) => Number(w.betrag) || 0);
  if (!l.length) return { anzahl: 0 };
  return { anzahl: l.length, schnitt: l.reduce((a, x) => a + x, 0) / l.length, min: Math.min(...l), max: Math.max(...l) };
}

// ---------- Offene Beträge (v25) ----------
// Ein Eintrag mit unbekanntem Betrag trägt `offen: { von?, bis?, zaehlt }`. von/bis = Schätzung (fehlt = keine Ahnung).
// Damit alle bisherigen Rechnungen (auch Widgets und CaleConnect) ohne Sonderfall stimmen, steht in `betrag`:
// zählt mit → vorsichtiger Wert (Kosten: oberer Wert), zählt nicht → 0.
// Einnahmen: `betrag` = Spanne { von, bis } (gerechnet wird mit dem unteren Wert), `status` „fest“ = zählt mit, „geplant“ = zählt nicht.
export function offenSpanne(o) {
  const v = o && o.von != null && o.von !== '' ? Number(o.von) : NaN;
  const b = o && o.bis != null && o.bis !== '' ? Number(o.bis) : NaN;
  const von = isNaN(v) ? b : v, bis = isNaN(b) ? v : b;
  if (isNaN(von) || isNaN(bis)) return { hat: false, von: 0, bis: 0 };
  return { hat: true, von: Math.min(von, bis), bis: Math.max(von, bis) };
}
export function offenBetrag(o, kosten = true) {
  const sp = offenSpanne(o);
  return o && o.zaehlt && sp.hat ? (kosten ? sp.bis : sp.von) : 0;
}
export function offenText(o) {
  const sp = offenSpanne(o);
  if (!sp.hat) return 'unbekannt';
  return sp.von === sp.bis ? 'ungefähr ' + euro(sp.bis) : euro(sp.von, false) + '–' + euro(sp.bis);
}
const OFFEN_LISTEN = { fixkosten: 'fixkosten', einnahme: 'einnahmen', buchung: 'buchungen', konto: 'sparraten' };
export function offenFinden(daten, typ, id) { return (daten[OFFEN_LISTEN[typ]] || []).find((x) => x.id === id && x.offen) || null; }
export function offeneListe(daten) {
  const l = [];
  for (const f of daten.fixkosten || []) if (f.offen) l.push({ typ: 'fixkosten', id: f.id, eintrag: f, kosten: true, name: f.name, art: f.abo ? 'Abo' : 'Fixkosten', wann: RHYTHMUS_TEXT[f.wieOft] || '' });
  for (const sp of daten.sparraten || []) if (sp.offen) l.push({ typ: 'konto', id: sp.id, eintrag: sp, kosten: true, name: 'Aufs ' + (sp.name || 'Rücklagenkonto'), art: 'Übertrag', wann: 'jeden Monat' });
  for (const b of daten.buchungen || []) if (b.offen) { const k = kategorie(daten, b.kategorieId); l.push({ typ: 'buchung', id: b.id, eintrag: b, kosten: true, name: (k ? k.name : 'Ausgabe') + (b.ort ? ' · ' + b.ort : ''), art: 'Ausgabe', wann: Number(b.zeit.slice(8, 10)) + '. ' + MONATE_KURZ[Number(b.zeit.slice(5, 7)) - 1] }); }
  for (const e of daten.einnahmen || []) if (e.offen) l.push({ typ: 'einnahme', id: e.id, eintrag: e, kosten: false, name: e.name, art: 'Einnahme', wann: e.wieOft === 'monatlich' ? 'jeden Monat' : (e.monat ? MONATE_KURZ[ymTeile(e.monat).monat - 1] + ' ' + ymTeile(e.monat).jahr : 'einmalig') });
  return l;
}
// „zählt mit“ umschalten: hält betrag/status passend zum Feld offen
export function offenZaehltSetzen(daten, typ, id, zaehlt) {
  const x = offenFinden(daten, typ, id);
  if (!x) return;
  x.offen = Object.assign({}, x.offen, { zaehlt: !!zaehlt });
  if (typ === 'einnahme') x.status = zaehlt ? 'fest' : 'geplant';
  else x.betrag = offenBetrag(x.offen, true);
}
// Kopie der Daten, in der alle offenen Beträge mit einem Ende ihrer Schätzung gerechnet werden
function mitOffenenWerten(daten, modus) {
  const d = JSON.parse(JSON.stringify(daten));
  for (const [typ, liste] of Object.entries(OFFEN_LISTEN)) for (const x of d[liste] || []) {
    if (!x.offen) continue;
    const sp = offenSpanne(x.offen); const kosten = typ !== 'einnahme';
    x.betrag = (modus === 'min') === kosten ? sp.bis : sp.von;
    if (typ === 'einnahme') x.status = 'fest';
  }
  return d;
}
// „Frei“, wenn alle offenen Beträge einträfen: min = ungünstig (Kosten oben, Einnahmen unten), max = günstig
export function mitOffenem(daten, s, opt = {}) {
  const liste = offeneListe(daten);
  if (!liste.length) return null;
  const frei = monatsRechnung(daten, s, opt).frei;
  const min = monatsRechnung(mitOffenenWerten(daten, 'min'), s, opt).frei;
  const max = monatsRechnung(mitOffenenWerten(daten, 'max'), s, opt).frei;
  return { anzahl: liste.length, ohne: liste.filter((x) => !offenSpanne(x.eintrag.offen).hat).length, frei, min, max, betrifft: Math.abs(min - frei) >= 0.005 || Math.abs(max - frei) >= 0.005 };
}

// ---------- v27: Auswertung der Ausgaben ----------
// Schnitt pro Budget-Kategorie über die letzten n abgeschlossenen Monate (ab dem Start mit der App),
// Urteil zum Budget, Vergleich laufender Monat ↔ Vormonat bis zum selben Tag, häufigste Orte.
export function auswertung(daten, heute, n = 3) {
  const h = ymAus(heute);
  const start = (daten.einstellungen && daten.einstellungen.startMonat) || h;
  const monate = [];
  for (let i = n; i >= 1; i--) { const m = ymPlus(h, -i); if (m >= start) monate.push(m); }
  const tag = heute.slice(8, 10);
  const vm = ymPlus(h, -1);
  const bisTag = (m) => m + '-' + zweistellig(Math.min(Number(tag), tageImMonat(m))) + 'T99';
  const kats = (daten.kategorien || []).filter((k) => k.art === 'budget').map((k) => {
    const werte = monate.map((m) => ausgegebenIm(daten, m, k.id));
    const schnitt = werte.length ? werte.reduce((a, x) => a + x, 0) / werte.length : null;
    const budget = Number(k.budget) || 0;
    const jetzt = ausgegebenIm(daten, h, k.id);
    const vorBisTag = vm >= start ? buchungenIm(daten, vm, k.id).filter((b) => b.zeit <= bisTag(vm)).reduce((a, b) => a + (Number(b.betrag) || 0), 0) : null;
    let urteil = 'ohne';
    if (schnitt != null && budget > 0) urteil = schnitt > budget * 1.05 ? 'knapp' : schnitt < budget * 0.75 ? 'luft' : 'passt';
    else if (schnitt == null) urteil = 'neu';
    return { kategorie: k, werte, schnitt, budget, urteil, jetzt, vorBisTag, max: werte.length ? Math.max(...werte) : null, min: werte.length ? Math.min(...werte) : null };
  });
  const verlauf = [...monate, h].map((m) => ({ monat: m, name: MONATE_KURZ[ymTeile(m).monat - 1], summe: ausgegebenIm(daten, m), laeuft: m === h }));
  // Orte über denselben Zeitraum plus den laufenden Monat
  const ab = monate[0] || h;
  const orte = new Map();
  for (const b of daten.buchungen || []) {
    if (ymAus(b.zeit) < ab || ymAus(b.zeit) > h || !b.ort) continue;
    const o = orte.get(b.ort) || { ort: b.ort, anzahl: 0, summe: 0 };
    o.anzahl++; o.summe += Number(b.betrag) || 0; orte.set(b.ort, o);
  }
  const summeJetzt = ausgegebenIm(daten, h);
  const summeVorBisTag = vm >= start ? buchungenIm(daten, vm).filter((b) => b.zeit <= bisTag(vm)).reduce((a, b) => a + (Number(b.betrag) || 0), 0) : null;
  return { monate, kats, verlauf, orte: [...orte.values()].sort((a, b) => b.summe - a.summe), summeJetzt, summeVorBisTag, vormonat: vm >= start ? vm : null };
}

// ---------- v27: Abrechnung pro Person (geteilte Ausgaben) ----------
export function personenAbrechnung(daten) {
  const personen = new Map();
  for (const b of daten.buchungen || []) {
    if (!b.gesamt || b.zurueckErhalten) continue;
    const name = (b.teiltMit || '').trim() || 'Ohne Namen';
    const p = personen.get(name) || { name, summe: 0, buchungen: [] };
    p.summe += b.gesamt - b.betrag; p.buchungen.push(b); personen.set(name, p);
  }
  return [...personen.values()].map((p) => Object.assign(p, { summe: Math.round(p.summe * 100) / 100, buchungen: p.buchungen.sort((a, b) => (a.zeit < b.zeit ? 1 : -1)) })).sort((a, b) => b.summe - a.summe);
}

// ---------- v27: Sparziel pro Konto ----------
// ziel = Betrag, zielBis = Monat „2027-08“. Liefert Stand, nötige Monatsrate und wann die heutige Rate ankommt.
export function sparziel(sp, heute, daten) {
  const ziel = Number(sp.ziel) || 0;
  if (!(ziel > 0)) return null;
  const stand = sparStand(sp, heute, daten);
  const fehlt = Math.max(0, ziel - stand);
  const rate = Number(sp.betrag) || 0;
  const h = ymAus(heute);
  // Raten, die bis zum Ende des Zielmonats noch kommen (die Rate dieses Monats zählt, wenn ihr Tag noch aussteht)
  const dieseNoch = Number(heute.slice(8, 10)) < Math.min(sp.tag || 1, tageImMonat(h)) ? 1 : 0;
  const ratenBis = (m) => { let k = 0; for (let x = ymPlus(h, 1); x <= m && k < 1200; x = ymPlus(x, 1)) k++; return k + dieseNoch; };
  const erg = { ziel, stand, fehlt, rate, anteil: Math.min(1, stand / ziel), erreicht: fehlt <= 0.005, zielBis: sp.zielBis || null };
  if (erg.erreicht) return erg;
  if (rate > 0) { const k = Math.ceil(fehlt / rate - 1e-9); erg.fertigIm = ymPlus(h, k - dieseNoch); }
  if (sp.zielBis) {
    const k = sp.zielBis >= h ? ratenBis(sp.zielBis) : 0;
    erg.raten = k;
    erg.noetig = k > 0 ? Math.ceil(fehlt / k * 100) / 100 : null;
    erg.reicht = rate > 0 && k > 0 && rate * k >= fehlt - 0.005;
    erg.vorbei = sp.zielBis < h;
  }
  return erg;
}

// ---------- v27: engster Monat (ohne Rücklagenkonto) ----------
// Der Monat der nächsten 12 mit dem wenigsten „Frei“ – nur wenn er deutlich enger ist als ein gewöhnlicher Monat.
export function engsterMonat(daten, ab, anzahl = 12) {
  if (ruecklage(daten)) return null;
  const liste = [];
  for (let i = 0; i < anzahl; i++) { const m = ymPlus(ab, i); liste.push({ monat: m, frei: monatsRechnung(daten, m).frei }); }
  const eng = liste.reduce((a, x) => (x.frei < a.frei ? x : a), liste[0]);
  const sortiert = liste.map((x) => x.frei).sort((a, b) => a - b);
  const ueblich = sortiert[Math.floor(sortiert.length / 2)];
  const posten = (daten.fixkosten || []).filter((f) => !istMonatlich(f) && wirdAbgebuchtIm(f, eng.monat));
  if (!posten.length || ueblich - eng.frei < 50) return null;
  return { monat: eng.monat, frei: eng.frei, ueblich, weniger: ueblich - eng.frei, posten, summe: posten.reduce((a, f) => a + eigenerBetrag(f, eng.monat), 0), inMonaten: liste.indexOf(eng) };
}

// ---------- v27: Erinnerung an die Sicherung ----------
// Fällig, wenn es Daten gibt und die letzte Sicherung (oder der erste Eintrag) länger als `tage` Tage her ist.
export function sicherungFaellig(daten, jetzt = new Date(), tage = 30) {
  const e = daten.einstellungen || {};
  const hat = (daten.buchungen || []).length + (daten.fixkosten || []).length;
  if (!hat || daten.beispiel) return null;
  const tagMs = 864e5;
  if (e.letzteSicherungZeit) {
    const alt = Math.floor((jetzt - new Date(e.letzteSicherungZeit)) / tagMs);
    return alt >= tage ? { tage: alt, nie: false } : null;
  }
  if (e.letzteSicherung) { // ältere Version: nur Text „16.11.2026 10:00“
    const m = String(e.letzteSicherung).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m) { const alt = Math.floor((jetzt - new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))) / tagMs); return alt >= tage ? { tage: alt, nie: false } : null; }
  }
  const erste = (daten.buchungen || []).map((b) => b.zeit).sort()[0] || ((e.startMonat || '') + '-01');
  const alt = Math.floor((jetzt - new Date(erste.slice(0, 10) + 'T12:00:00')) / tagMs);
  return alt >= tage ? { tage: alt, nie: true } : null;
}

// ---------- v27: Verlauf durchsuchen ----------
// filter: { text, kategorieId, monat, ort }
export function verlaufFiltern(eintraege, daten, filter = {}) {
  const t = (filter.text || '').trim().toLowerCase();
  return eintraege.filter((b) => {
    if (filter.kategorieId && b.kategorieId !== filter.kategorieId) return false;
    if (filter.monat && ymAus(b.zeit) !== filter.monat) return false;
    if (filter.ort && (b.ort || '') !== filter.ort) return false;
    if (!t) return true;
    const k = kategorie(daten, b.kategorieId);
    const heu = [(b.ort || ''), k ? k.name : '', b.teiltMit || '', String(b.betrag).replace('.', ','), String(b.betrag)].join(' ').toLowerCase();
    // v39: mehrere Suchwörter mit Komma = eines davon passt („mcdonald, pizza, burger“)
    return t.split(',').map((x) => x.trim()).filter(Boolean).some((w) => heu.includes(w) || heu.includes(w.replace(',', '.')));
  });
}

// ---------- v34: Schulden (eigener Bereich, zählt nicht in „Frei“) ----------
// daten.schulden = [{ id, name, betrag, datum, notiz?, bewegungen: [{ id, datum, betrag, art: 'zurueck' | 'dazu' }] }]
export function schuldOffen(sch) {
  return Math.round((sch.bewegungen || []).reduce((a, b) => a + (b.art === 'dazu' ? 1 : -1) * (Number(b.betrag) || 0), Number(sch.betrag) || 0) * 100) / 100;
}
export function schuldGesamt(sch) { return (Number(sch.betrag) || 0) + (sch.bewegungen || []).filter((b) => b.art === 'dazu').reduce((a, b) => a + (Number(b.betrag) || 0), 0); }
export function schuldenOffen(daten) { return (daten.schulden || []).reduce((a, x) => a + Math.max(0, schuldOffen(x)), 0); }
