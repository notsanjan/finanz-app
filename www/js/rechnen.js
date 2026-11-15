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
  if (ist) return { betrag: Number(ist.betrag) || 0, geschaetzt: false, schaetzung: schaetzung(e), zaehlt: true, angekommen: true };
  return { betrag: schaetzung(e), geschaetzt: !e.sicher, schaetzung: schaetzung(e), zaehlt: e.status !== 'geplant', angekommen: false };
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
export function sparStand(sp, d, daten) {
  let stand = Number(sp.stand) || 0;
  // einmalige Überträge (Extra) seit dem standDatum
  if (daten) stand += summeBetrag((daten.uebertraege || []).filter((u) => u.kontoId === sp.id && u.datum > (sp.standDatum || '') && u.datum <= d));
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
export function kontoArt(sp) { return sp.art === 'ruecklage' ? 'ruecklage' : sp.art === 'extern' ? 'extern' : 'sparen'; }

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
  const summe = (daten.fixkosten || []).filter((f) => !istMonatlich(f) && laeuftIm(f, s)).reduce((a, f) => a + monatsAnteil(f), 0);
  return Math.ceil(summe / 5) * 5;
}

// Ein- und Auszahlungen der Rücklage zwischen zwei Tagen (von exklusiv, bis inklusive)
function ruecklageBewegungen(daten, rk, von, bis) {
  const liste = [];
  let s = ymAus(von);
  for (let i = 0; i < 600 && s <= ymAus(bis); i++) {
    const rateTag = s + '-' + zweistellig(Math.min(rk.tag || 1, tageImMonat(s)));
    if (rateTag > von && rateTag <= bis) liste.push({ datum: rateTag, betrag: Number(rk.betrag) || 0 });
    for (const u of uebertraegeIm(daten, s, rk.id)) if (u.datum > von && u.datum <= bis) liste.push({ datum: u.datum, betrag: Number(u.betrag) || 0 });
    for (const f of daten.fixkosten || []) {
      if (istMonatlich(f) || !wirdAbgebuchtIm(f, s)) continue;
      const d = s + '-' + zweistellig(abbuchungsTag(f, s));
      if (d > von && d <= bis) liste.push({ datum: d, betrag: -eigenerBetrag(f), fixkosten: f });
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
  return ruecklageBewegungen(daten, rk, start, d).reduce((a, b) => a + b.betrag, Number(rk.stand) || 0);
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
      return { fixkosten: f, faellig, ausRuecklage, zaehlt: faellig && !ausRuecklage, betrag: eigenerBetrag(f), anteil: monatsAnteil(f), wann: rhythmusBeschreibung(f) + (f.abo ? ' · Abo' : '') };
    });
    const summe = posten.filter((p) => p.zaehlt).reduce((a, p) => a + p.betrag, 0);
    gruppen.push({ kategorie: kat, art: 'fix', farbe: kat.farbe, name: kat.name, posten, summe });
  }
  const budgetKats = (daten.kategorien || []).filter((k) => k.art === 'budget');
  if (budgetKats.length) {
    const posten = budgetKats.map((k) => {
      const ausgegeben = ausgegebenIm(daten, s, k.id);
      const budget = Number(k.budget) || 0;
      return { kategorie: k, faellig: true, zaehlt: true, betrag: opt.vorbei ? ausgegeben : Math.max(budget, ausgegeben), budget, ausgegeben };
    });
    gruppen.push({ art: 'budget', farbe: (daten.einstellungen && daten.einstellungen.budgetFarbe) || '#5d7d99', name: 'Budgets', posten, summe: posten.reduce((a, p) => a + p.betrag, 0) });
  }

  const ausgaben = gruppen.reduce((a, g) => a + g.summe, 0);
  // Konten: feste Monatsrate + einmalige Überträge in diesem Monat
  const konten = [rk].concat(sparratenNormal(daten), sparratenExtern(daten)).filter(Boolean).map((sp) => {
    const rate = Number(sp.betrag) || 0;
    const extra = summeBetrag(uebertraegeIm(daten, s, sp.id));
    return { konto: sp, art: kontoArt(sp), rate, extra, betrag: rate + extra };
  });
  const summeArt = (art) => konten.filter((k) => k.art === art).reduce((a, k) => a + k.betrag, 0);
  const zuruecklegen = summeArt('ruecklage');
  const sparen = summeArt('sparen');
  const extern = summeArt('extern');
  const frei = einkommen - ausgaben - zuruecklegen - sparen - extern;
  const g = gehaltVon(daten);
  const gehaltWert = einnahmen.find((e) => g && e.einnahme === g) || { betrag: 0, geschaetzt: !!g && !g.sicher, schaetzung: g ? schaetzung(g) : 0 };
  const weitere = einnahmen.filter((e) => !g || e.einnahme !== g).reduce((a, e) => a + e.betrag, 0);
  const geplantRein = geplanteEinnahmen.reduce((a, e) => a + e.betrag, 0);
  return { monat: s, einnahmen, geplanteEinnahmen, gehaltWert, weitere, geplantRein, einkommen, geschaetzt, gruppen, ausgaben, zuruecklegen, mitRuecklage: !!rk, sparen, extern, konten, frei, vorbei: !!opt.vorbei };
}

// Ohne Rücklagenkonto: nächster Monat (ab dem folgenden), in dem nicht monatliche Kosten anfallen
export function naechsterBrockenMonat(daten, s) {
  for (let i = 1; i <= 12; i++) {
    const m = ymPlus(s, i);
    const posten = (daten.fixkosten || []).filter((f) => !istMonatlich(f) && wirdAbgebuchtIm(f, m));
    if (posten.length) return { monat: m, posten, summe: posten.reduce((a, f) => a + eigenerBetrag(f), 0), frei: monatsRechnung(daten, m).frei };
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

// ---------- Monatsende ----------
// Was blieb im Monat s wirklich übrig? (Budgets nur mit dem Ausgegebenen)
export function uebrigIm(daten, s) {
  const echt = monatsRechnung(daten, s, { vorbei: true });
  const geplant = monatsRechnung(daten, s);
  return { uebrig: echt.frei, ungenutzt: echt.frei - geplant.frei };
}
export function monatAbgeschlossen(daten, s) { return ((daten.einstellungen && daten.einstellungen.abgeschlossen) || []).includes(s); }
