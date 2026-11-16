// Oberfläche der Finanz-App: Monat, Jahr, Verlauf und die Bearbeiten-Seiten.
// Plus/Minus gibt es bewusst nur im Widget auf dem Homescreen.
import * as R from './rechnen.js';
import * as D from './daten.js';
import * as E from './einfuehrung.js';
import * as DRK from './drk.js';
import * as DI from './dienste.js';
import * as AB from './abrechnung.js';

export const APP_VERSION = 'finanz-v30';
const NEU_IN_VERSION = [
  'Zahlungen erkennen (Beta): Blockiert Android den Zugriff („App wurde Zugriff verweigert“), zeigt die App jetzt Schritt für Schritt, wie du ihn freigibst – mit Knopf direkt zu den App-Infos'
];

const z = { daten: null, ansicht: 'monat', monat: null, ebenen: [], toast: null, mehrOffen: false };
const $app = () => document.getElementById('app');
const $ebene = () => document.getElementById('ebene');

// ---------- Hilfen ----------
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Geld-Farben (v23): alles, was rausgeht, rot mit „−“; was reinkommt, grün mit „+“. Im Satz rot ohne Vorzeichen.
const rausZ = (betrag, rund = false, vor = '') => `<span class="minus-zahl">${vor}− ${rund ? R.euroRund(betrag) : R.euro(betrag)}</span>`;
const rausSatz = (betrag, rund = false) => `<span class="minus-zahl">${rund ? R.euroRund(betrag) : R.euro(betrag)}</span>`;
const reinZ = (betrag, rund = false, vor = '') => `<span class="plus-zahl">${vor}+ ${rund ? R.euroRund(betrag) : R.euro(betrag)}</span>`;

// ---------- Offene Beträge (v25): Betrag unbekannt → Schätzung von–bis, „Mitrechnen“ oder „Nicht mitrechnen“ ----------
const offenMarke = (o) => `<small class="offen-marke ${o.zaehlt ? 'an' : ''}">${o.zaehlt ? 'zählt mit' : 'zählt nicht'}</small>`;
const offenZahl = (x, kosten = true) => `<span class="offen-zahl ${x.offen.zaehlt ? (kosten ? 'minus-zahl' : 'plus-zahl') : ''}">? ${esc(R.offenText(x.offen))}</span>`;
// Betrag eines Eintrags für Listen: normal, oder „? 60–90 €“ mit Marke
const betragHtml = (x, normal, kosten = true) => (x && x.offen ? offenZahl(x, kosten) + offenMarke(x.offen) : normal);
function offenEntwurf(x) {
  const o = x && x.offen; const sp = R.offenSpanne(o);
  return { unbekannt: !!o, vonText: sp.hat ? R.euro(sp.von, false) : '', bisText: sp.hat && sp.bis !== sp.von ? R.euro(sp.bis, false) : '', zaehlt: o ? !!o.zaehlt : true };
}
// Entwurf → { offen, betrag } oder { fehler }
function offenAus(e, kosten = true) {
  const lies = (t) => (String(t == null ? '' : t).trim() === '' ? null : zahl(t));
  const von = lies(e.vonText), bis = lies(e.bisText);
  if ((von !== null && (isNaN(von) || von < 0)) || (bis !== null && (isNaN(bis) || bis < 0))) return { fehler: 'Die Schätzung ist keine Zahl.' };
  const offen = { zaehlt: !!e.zaehlt };
  if (von !== null || bis !== null) { offen.von = Math.min(von ?? bis, bis ?? von); offen.bis = Math.max(von ?? bis, bis ?? von); }
  if (offen.zaehlt && offen.von == null) return { fehler: 'Zum Mitrechnen bitte ungefähr einen Wert eintragen – oder „Nicht mitrechnen“ wählen.' };
  return { offen, betrag: R.offenBetrag(offen, kosten) };
}
function offenHinweis(e, kosten = true) {
  const o = offenAus(Object.assign({}, e, { zaehlt: false }), kosten);
  const sp = o.offen ? R.offenSpanne(o.offen) : { hat: false };
  if (!e.zaehlt) return 'Zählt nicht zu „Frei“. Der Eintrag bleibt in der Liste und steht unter „Offene Beträge“.' + (sp.hat ? ' „Mit Offenem“ zeigt, was er ausmachen würde.' : '');
  if (!sp.hat) return 'Zum Mitrechnen fehlt noch ein ungefährer Wert.';
  return kosten ? `„Frei“ rechnet vorsichtig mit dem oberen Wert: ${R.euro(sp.bis)}.` : `„Frei“ rechnet vorsichtig mit dem unteren Wert: ${R.euro(sp.von)}.`;
}
function offenKasten(e, kosten = true) {
  return `<div class="offen-kasten">
    <div class="offen-kopf"><b>? Betrag unbekannt</b><button class="knopf klein leise akzent" data-a="of-an">Betrag eintragen</button></div>
    <div class="zwei"><div class="feld"><label for="of-von">Ungefähr von (€)</label><input id="of-von" class="eingabe" inputmode="decimal" data-feld="vonText" data-offen="${kosten ? 1 : 0}" value="${esc(e.vonText || '')}" placeholder="leer = keine Ahnung"></div>
      <div class="feld"><label for="of-bis">bis (€)</label><input id="of-bis" class="eingabe" inputmode="decimal" data-feld="bisText" data-offen="${kosten ? 1 : 0}" value="${esc(e.bisText || '')}" placeholder="optional"></div></div>
    <div class="wahl zwei-sp">${wahlKnopf('of-zaehlt', '1', 'Mitrechnen', !!e.zaehlt)}${wahlKnopf('of-zaehlt', '0', 'Nicht mitrechnen', !e.zaehlt)}</div>
    <p class="hinweistext" id="of-hinweis">${esc(offenHinweis(e, kosten))}</p>
  </div>`;
}
// Einnahme mit offenem Betrag: Spanne als betrag, „fest“ = zählt mit, „geplant“ = zählt nicht
function offeneEinnahmeWerte(offen) {
  const sp = R.offenSpanne(offen);
  return { betrag: !sp.hat ? 0 : sp.von === sp.bis ? sp.von : { von: sp.von, bis: sp.bis }, sicher: false, status: offen.zaehlt ? 'fest' : 'geplant', offen };
}
const OFFEN_LINK = '<button class="knopf klein leise offen-link" data-a="of-an">? Betrag unbekannt</button>';
const offenFeldAus = '<div class="eingabe offen-feld-aus" aria-hidden="true">?</div>';
const heute = () => R.datumText(new Date());
const heuteYm = () => R.ymAus(heute());
const monatsName = (s) => R.MONATE_LANG[R.ymTeile(s).monat - 1];
function zahl(text) {
  if (text == null) return NaN;
  const t = String(text).replace(/[€\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  return t === '' ? NaN : Number(t);
}
const fixKats = () => z.daten.kategorien.filter((k) => k.art === 'fix');
const budgetKats = () => z.daten.kategorien.filter((k) => k.art === 'budget');
const gehalt = () => R.gehaltVon(z.daten);

const ICON = {
  stift: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7fd6c8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  pfeil: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8fb3d9" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h12M13 7l5 5-5 5"/></svg>',
  zurueck: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#eef2f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  links: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#eef2f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  rechts: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#eef2f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  plus: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7fd6c8" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  runter: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7fd6c8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  hoch: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7fd6c8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
  x: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b7c1be" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};
// matte Farben für Kategorien (kein Lila, keine Neonfarben)
const FARBEN = ['#7fd6c8', '#4f9a8e', '#c9d27a', '#5d7d99', '#8fb3d9', '#d9a77f', '#e0c07a', '#e39a8a', '#9fb7a0', '#b9a68f', '#a3b1ad', '#6f8f7a'];
const EMOJIS = ['🏠', '💡', '📱', '📺', '🛡️', '🚗', '⛽', '🛒', '🍕', '🎉', '🎁', '💪', '🐶', '🎓', '💊', '✈️', '👕', '🧾'];

// ---------- Start ----------
export async function start() {
  try {
    z.daten = await D.laden();
  } catch (e) { z.daten = null; }
  z.monat = heuteYm();
  bindeEreignisse();
  if (!z.daten) { z.daten = D.leereDaten(); z.ebenen.push({ art: 'start' }); }
  else { zeigeNeuigkeiten(); if (DI.schaetzWerteSetzen(z.daten, heuteYm())) D.speichern(z.daten); }
  render();
  await pruefeAuftrag();
  pruefeMonatsende();
  D.beiAuftrag(() => pruefeAuftrag());
  D.beiRueckkehr(async () => {
    const neu = await D.laden();
    if (neu) { z.daten = neu; if (z.monat < z.daten.einstellungen.startMonat) z.monat = heuteYm(); render(); await ladeVorschlaege(); if (z.erkennung) { const vorher = z.erkennung.erlaubt; z.erkennung = await D.erkennungStatus(); if (!vorher && z.erkennung.erlaubt) zeigeToast('Zugriff erlaubt – Zahlungen werden jetzt erkannt'); renderEbenen(); } pruefeMonatsende(); }
  });
  window.__finanz = z; // für Tests
}

// Widget-Betrag oder Kurzbefehl am App-Symbol: direkt „Ausgabe eintragen“ öffnen
async function pruefeAuftrag() {
  const a = await D.auftragHolen();
  await ladeVorschlaege();
  if (a && a.art === 'vorschlaege' && z.daten && z.vorschlaege.length) {
    z.ebenen = z.ebenen.filter((e) => e.art === 'start' || e.art === 'einfuehrung');
    if (z.ebenen.length) return;
    z.ansicht = 'monat'; z.monat = heuteYm(); z.monatsendeGefragt = true; render();
    AKTION.vorschlaege();
    return;
  }
  if (!a || a.art !== 'ausgabe' || !z.daten) return;
  z.ebenen = z.ebenen.filter((e) => e.art === 'start' || e.art === 'einfuehrung');
  if (z.ebenen.length) return;
  z.ansicht = 'monat'; z.monat = heuteYm(); z.bearbeiten = false;
  z.monatsendeGefragt = true; // jetzt nicht dazwischenfragen
  render();
  AKTION.eintragen({ dataset: { wert: 'ausgabe', kat: a.kategorie || '' } });
  setTimeout(() => { const f = document.getElementById('et-betrag'); if (f) { f.focus(); D.tastaturZeigen(); } }, 250);
}
// BETA: erkannte Zahlungen laden (Liste liegt im Android-Teil)
async function ladeVorschlaege() {
  const alt = (z.vorschlaege || []).length;
  z.vorschlaege = await D.vorschlaegeHolen();
  if (z.vorschlaege.length !== alt) render();
}
// Neuer Monat: einmal pro App-Start nach dem Rest des Vormonats fragen (nur wenn nichts anderes offen ist)
function pruefeMonatsende() {
  if (z.monatsendeGefragt || z.ebenen.length || !z.daten) return;
  const vm = R.ymPlus(heuteYm(), -1);
  if (vm < z.daten.einstellungen.startMonat || R.monatAbgeschlossen(z.daten, vm)) return;
  if (R.uebrigIm(z.daten, vm).uebrig < 5) return;
  z.monatsendeGefragt = true;
  AKTION.monatsende({ dataset: { wert: vm } });
}
const letzterTag = (s) => (s === heuteYm() ? heute() : s + '-' + R.zweistellig(R.tageImMonat(s)));

function zeigeNeuigkeiten() {
  const gesehen = z.daten.einstellungen.gesehenVersion;
  if (gesehen && gesehen !== APP_VERSION) z.ebenen.push({ art: 'neu' });
  if (gesehen !== APP_VERSION) { z.daten.einstellungen.gesehenVersion = APP_VERSION; D.speichern(z.daten); }
}

// Jede Änderung wird sofort gespeichert und bestätigt (Wunsch Jan: immer sehen, dass es geklappt hat).
// toast: { text, rueckgaengig } · ohne Angabe „Gespeichert“ · false = keine Meldung (reine Ansicht)
async function aendern(fn, toast) {
  try {
    fn(z.daten);
    DI.schaetzWerteSetzen(z.daten, heuteYm());
    await D.speichern(z.daten);
  } catch (e) {
    zeigeToast('Nicht gespeichert: ' + (e && e.message ? e.message : 'unbekannter Fehler') + '. Bitte nochmal versuchen.', null, 'fehler');
    haptik('fehler'); render(); return false;
  }
  // Vibration nur bei wichtigen Speicherungen (Text angegeben); toast.haptik: false = still, 'tick' = leicht
  if (toast !== false) { zeigeToast(toast ? toast.text : 'Gespeichert', toast && toast.rueckgaengig); if (toast && toast.haptik !== false) haptik(toast.haptik || 'bestaetigt'); }
  render();
  return true;
}

// ---------- Darstellung ----------
function render() {
  const a = $app();
  if (!a) return;
  a.innerHTML = kopf() + (z.ansicht === 'monat' ? monatAnsicht() : z.ansicht === 'jahr' ? jahrAnsicht() : verlaufAnsicht())
    + (z.bearbeiten ? '' : fabHtml());
  renderEbenen();
}

function kopf() {
  const titel = z.ansicht === 'monat' ? monatsName(z.monat) : z.ansicht === 'jahr' ? '12 Monate' : 'Verlauf';
  const k = (id, t) => `<button data-a="ansicht" data-wert="${id}" aria-pressed="${z.ansicht === id}">${t}</button>`;
  return `<header class="kopf"><nav class="umschalter breit" aria-label="Ansicht">${k('monat', 'Monat')}${k('jahr', 'Jahr')}${k('verlauf', 'Verlauf')}</nav><button class="knopf rund leise" data-a="bereich" data-wert="einstellungen" aria-label="Einstellungen und Sicherung">${KACHEL_ICON.zahnrad}</button></header>${z.ansicht === 'monat' ? '' : `<h1 class="seitentitel">${esc(titel)}</h1>`}`;
}

function monatTeile(s = z.monat) {
  const vorbei = s < heuteYm();
  const r = R.monatsRechnung(z.daten, s, { vorbei });
  const g = gehalt();
  const gehaltWert = r.gehaltWert;
  const istHeute = s === heuteYm();
  const nav = `<div class="monatswahl">
    <button class="knopf rund" data-a="monat" data-wert="-1" aria-label="Vorheriger Monat">${ICON.links}</button>
    <h1 class="monatstitel">${esc(monatsName(s))} <span>${R.ymTeile(s).jahr}</span></h1>
    <button class="knopf rund" data-a="monat" data-wert="1" aria-label="Nächster Monat">${ICON.rechts}</button>
  </div>${istHeute ? '' : `<div class="heute-zeile"><button class="knopf klein akzent" data-a="heute">zurück zu ${esc(monatsName(heuteYm()))}</button></div>`}`;

  const pruefung = R.wunschPruefung(z.daten, heuteYm());
  const geplant = s >= heuteYm() ? R.geplantAusFrei(z.daten, s, pruefung) : 0;
  // Balken: jede Kategorie ein Stück, dann Rücklage, Sparkonto, Rest = Frei
  const basis = Math.max(r.einkommen, r.ausgaben + r.zuruecklegen + r.sparen + r.extern, 1);
  const pct = (x) => (Math.max(0, x) / basis * 100).toFixed(2);
  const stuecke = r.gruppen.filter((gr) => gr.summe > 0).map((gr) => `<span style="width:${pct(gr.summe)}%;background:${gr.farbe}" title="${esc(gr.name)}"></span>`).join('')
    + (r.zuruecklegen > 0 ? `<span class="streifen" style="width:${pct(r.zuruecklegen)}%"></span>` : '')
    + (r.sparen > 0 ? `<span style="width:${pct(r.sparen)}%;background:var(--spar)"></span>` : '')
    + (r.extern > 0 ? `<span style="width:${pct(r.extern)}%;background:var(--extern)"></span>` : '')
    + (r.frei > 0 ? '<span class="rest"></span>' : '');
  const ungefaehr = r.geschaetzt ? '≈ ' : '';
  const freiText = (r.frei < 0 ? '− ' : ungefaehr) + R.euroRund(Math.abs(r.frei));
  const aria = `Gehalt ${R.euroRund(r.einkommen)}: ${R.euroRund(r.ausgaben)} Ausgaben, ${r.mitRuecklage ? R.euroRund(r.zuruecklegen) + ' aufs Rücklagenkonto, ' : ''}${R.euroRund(r.sparen)} aufs Sparen, ${r.extern > 0 ? R.euroRund(r.extern) + ' an andere Konten, ' : ''}${freiText} frei`;
  const brocken = !r.mitRuecklage ? R.naechsterBrockenMonat(z.daten, s) : null;
  const zusatz = [];
  // Monatsende: Was ist mit dem Rest passiert? (vergangene Monate, und in den letzten 3 Tagen des aktuellen Monats)
  const endeNah = s === heuteYm() && Number(heute().slice(8)) >= R.tageImMonat(s) - 2;
  // v26: Monate vor dem Start mit der App sind nicht erfasst – das sagen, statt „übrig“ vorzurechnen
  if (s < z.daten.einstellungen.startMonat) zusatz.push(`<div class="frei-hinweis">Vor deinem Start mit der App (${esc(monatsName(z.daten.einstellungen.startMonat))}). Für diesen Monat ist nichts erfasst, die Zahl ist nur hochgerechnet.</div>`);
  if (s >= z.daten.einstellungen.startMonat && (vorbei || endeNah)) {
    if (R.monatAbgeschlossen(z.daten, s)) zusatz.push('<div class="frei-hinweis">✓ Monat abgeschlossen</div>');
    else {
      const u = R.uebrigIm(z.daten, s).uebrig;
      if (u >= 5) zusatz.push(`<button class="knopf akzent" data-a="monatsende" data-wert="${s}">${vorbei ? `Was ist mit den ≈ ${R.euroRund(u)} passiert?` : `Monat abschließen: ≈ ${R.euroRund(u)} übrig`}</button>`);
    }
  }
  const geplantRein = s >= heuteYm() ? r.geplantRein : 0;
  let mitGeplantem = '';
  if (geplant > 0 || geplantRein > 0) {
    const mit = r.frei - geplant + geplantRein;
    const teile = [geplant > 0 ? `<span class="minus-zahl">− ${R.euroRund(geplant)}</span> geplante Ausgaben` : '', geplantRein > 0 ? `<span class="plus-zahl">+ ${R.euroRund(geplantRein)}</span> geplante Einnahmen` : ''].filter(Boolean).join(' · ');
    mitGeplantem = `<div class="mit-geplantem" title="${esc(teile.replace(/<[^>]+>/g, ''))}">Mit Geplantem <b class="${mit < 0 ? 'minus-zahl' : ''}">${mit < 0 ? '− ' : '≈ '}${R.euroRund(Math.abs(mit))}</b></div>`;
  }
  // Offene Beträge (v25): Spanne für „Frei“, wenn alle offenen Beträge einträfen
  const mo = R.mitOffenem(z.daten, s, { vorbei });
  let mitOffenem = '';
  if (mo) {
    const spanne = (a, b) => (Math.round(a) === Math.round(b) ? `${a < 0 ? '− ' : '≈ '}${R.euroRund(Math.abs(a))}` : `≈ ${a < 0 ? '− ' : ''}${Math.abs(Math.round(a)).toLocaleString('de-DE')} bis ${b < 0 ? '− ' : ''}${R.euroRund(Math.abs(b))}`);
    const zahlText = `${mo.anzahl === 1 ? '1 Betrag offen' : mo.anzahl + ' Beträge offen'}${mo.ohne ? ` · ${mo.ohne} ohne Schätzung` : ''}`;
    mitOffenem = `<button class="mit-offenem" data-a="offene" aria-label="Offene Beträge ansehen">${mo.betrifft ? `<span class="mo-zeile">Mit Offenem <b class="${mo.min < 0 ? 'minus-zahl' : ''}">${spanne(mo.min, mo.max)}</b></span>` : ''}<small>? ${zahlText}${mo.betrifft ? '' : ` · ändern „Frei“ im ${esc(monatsName(s))} nicht`} · ansehen ›</small></button>`;
  }
  // v27: engster Monat der nächsten 12 (ohne Rücklagenkonto) – abschaltbar unter „Hinweise und Warnungen“
  const eng = hinweisAn('eng') && !r.mitRuecklage && istHeute ? R.engsterMonat(z.daten, s) : null;
  if (eng) {
    const en = R.MONATE_LANG[R.ymTeile(eng.monat).monat - 1] + (R.ymTeile(eng.monat).jahr !== R.ymTeile(s).jahr ? ' ' + R.ymTeile(eng.monat).jahr : '');
    const rat = eng.frei < 0 && eng.inMonaten > 0 ? ` Lege bis dahin ≈ ${R.euroRund(Math.ceil(-eng.frei / eng.inMonaten / 5) * 5)} im Monat zurück – oder richte ein Rücklagenkonto ein.` : ` Das sind ≈ ${R.euroRund(eng.weniger)} weniger als in einem gewöhnlichen Monat.`;
    zusatz.push(`<div class="frei-hinweis ${eng.frei < 0 ? 'warn' : ''}" data-hinweis="eng">${eng.frei < 0 ? '⚠ ' : ''}Am engsten wird der ${esc(en)}: ${eng.frei < 0 ? `es fehlen ≈ ${R.euroRund(-eng.frei)}` : `nur ≈ ${R.euroRund(eng.frei)} frei`} (${esc(eng.posten.map((f) => f.name).join(', '))} ${R.euroRund(eng.summe)}).${rat}</div>`);
  }
  if (brocken && hinweisAn('eng') && (!eng || (eng.monat !== brocken.monat && brocken.monat === R.ymPlus(s, 1)))) zusatz.push(`<div class="frei-hinweis">Im ${esc(R.MONATE_LANG[R.ymTeile(brocken.monat).monat - 1])} kommen zusätzlich ${R.euroRund(brocken.summe)} (${esc(brocken.posten.map((f) => f.name).join(', '))}). Dort bleiben ${brocken.frei < 0 ? '− ' : '≈ '}${R.euroRund(Math.abs(brocken.frei))} frei.</div>`);
  const gehaltTag = g ? R.ankunftsTag(g, s) + '.' + R.ymTeile(s).monat + '.' : '';

  // Frei-Karte: große Zahl, darunter rein (grün) und raus (rot); die Zahl „Frei“ steht nur einmal
  const zeile = (punkt, text, betrag, art) => `<div class="auf-zeile"><span class="l">${punkt}${text}</span><span class="r ${art}">${betrag}</span></div>`;
  const ohnePunkt = '<i class="punkt-platz"></i>';
  const gehaltZeile = `<button class="auf-zeile auf-knopf" data-a="gehalt" aria-label="Gehalt im ${esc(monatsName(s))} ändern"><span class="l">${ohnePunkt}${g ? esc(g.name) : 'Gehalt'}<small>${g ? 'am ' + gehaltTag : ''}${gehaltWert && gehaltWert.geschaetzt ? (gehaltWert.ausDiensten ? ' · aus Diensten geschätzt' : ' · geschätzt') : ''} ${ICON.stift}</small></span><span class="r plus-zahl">+ ${R.euroRund(gehaltWert ? gehaltWert.betrag : 0)}</span></button>`;
  const freiKarte = `<section class="karte ring frei-karte">
    <div class="label">${vorbei ? 'Übrig im' : 'Frei im'} ${esc(monatsName(s))}</div>
    <div class="grosszahl frei-zahl ${r.frei < 0 ? 'minus' : ''}">${freiText}</div>
    ${mitGeplantem}
    ${mitOffenem}
    <div class="balken" role="img" aria-label="${esc(aria)}">${stuecke}</div>
    <div class="aufstellung">
      ${gehaltZeile}
      ${r.weitere > 0 ? zeile(ohnePunkt, 'Weitere Einnahmen', '+ ' + R.euroRund(r.weitere), 'plus-zahl') : ''}
      <div class="auf-trenner"></div>
      ${zeile('<i class="punkt ausgaben"></i>', 'Ausgaben', '− ' + R.euroRund(r.ausgaben), 'minus-zahl')}
      ${kontoZeilen(r)}
    </div>
    ${zusatz.join('')}
    ${g && !g.betrag && !gehaltWert.betrag ? '<button class="knopf haupt" data-a="gehalt">Gehalt eintragen</button>' : ''}
  </section>`;

  const stichtag = s === heuteYm() ? heute() : s + '-' + R.zweistellig(R.tageImMonat(s));
  const rk = R.ruecklage(z.daten);
  const hatJaehrliche = z.daten.fixkosten.some((f) => f.wieOft !== 'monatlich');
  let ruecklageKarte = '';
  if (rk) {
    const luecke = hinweisAn('ruecklage') ? R.ruecklageLuecke(z.daten, heute()) : null;
    ruecklageKarte = `<button class="karte spar ruecklage" data-a="ruecklage">
      <span class="symbol">${ICON.pfeil}</span>
      <span class="mitte"><span style="font-size:var(--t-text);font-weight:600">Aufs Rücklagenkonto · ${rausZ(rk.betrag)}</span><span class="klein">am ${rk.tag || 1}. · bezahlt alle jährlichen und vierteljährlichen Kosten</span>
        ${luecke ? `<span class="warn-text">Bis ${esc(Number(luecke.datum.slice(8)) + '. ' + R.MONATE_LANG[R.ymTeile(R.ymAus(luecke.datum)).monat - 1])} fehlen ≈ ${R.euroRund(luecke.fehlt)} (${esc(luecke.fixkosten.name)})</span>` : ''}</span>
      <span class="stand"><span class="klein" style="font-size:var(--t-mini)">Stand</span><span style="font-size:var(--t-titel-karte);font-weight:500">${R.euroRund(R.ruecklageStand(z.daten, stichtag))}</span></span>
    </button>`;
  } else if (hatJaehrliche && !z.daten.einstellungen.ruecklageHinweisAus && hinweisAn('ruecklage')) {
    ruecklageKarte = `<section class="karte hinweis-karte"><div class="hinweis-kopf"><b>Jährliche Kosten glätten?</b><button class="knopf klein leise rund" style="width:36px" data-a="ruecklage-hinweis-weg" aria-label="Hinweis schließen">${ICON.x}</button></div>
      <p class="hinweistext">Mit einem eigenen Rücklagenkonto (z. B. Unterkonto oder Tagesgeld) und einem Dauerauftrag von ≈ ${R.euroRund(R.empfohleneRuecklage(z.daten, s))} im Monat ist jeden Monat gleich viel frei. Versicherungen und Co. zahlt dann die Rücklage.</p>
      <button class="knopf akzent" data-a="ruecklage">Rücklagenkonto einrichten</button></section>`;
  }
  const normale = R.sparratenNormal(z.daten).concat(R.sparratenExtern(z.daten));
  const sparKarten = normale.length ? normale.map((sp) => {
    const extern = R.kontoArt(sp) === 'extern';
    const extra = R.uebertraegeIm(z.daten, s, sp.id).reduce((a, u) => a + (Number(u.betrag) || 0), 0);
    const rate = Number(sp.betrag) || 0;
    const titel = sp.offen ? `Aufs ${esc(sp.name)} · ${offenZahl(sp)} ${offenMarke(sp.offen)}` : rate > 0 ? `Aufs ${esc(sp.name)} · ${rausZ(rate)}` : esc(sp.name);
    const unter = (rate > 0 || sp.offen ? `am ${sp.tag || 1}. · ` : 'kein fester Übertrag · ') + (extern ? 'das Geld wird dort ausgegeben' : 'keine Ausgabe, das Geld bleibt deins') + (extra > 0 ? ` · im ${monatsName(s)} + ${R.euroRund(extra)} extra` : '');
    const zi = extern ? null : R.sparziel(sp, stichtag, z.daten);
    const zielHtml = zi ? `<span class="ziel-zeile"><span class="mini ziel-mini"><span style="width:${(zi.anteil * 100).toFixed(1)}%"></span></span><span class="klein ${zi.zielBis && !zi.erreicht && !zi.reicht && hinweisAn('sparziel') ? 'warn-text' : ''}">${zi.erreicht ? '✓ Ziel erreicht' : `Ziel ${R.euroRund(zi.ziel)} · ${Math.floor(zi.anteil * 100)} %${zi.zielBis && !zi.reicht && hinweisAn('sparziel') ? ` · Rate reicht nicht bis ${R.MONATE_KURZ[R.ymTeile(zi.zielBis).monat - 1]} ${R.ymTeile(zi.zielBis).jahr}` : zi.zielBis ? ` · bis ${R.MONATE_KURZ[R.ymTeile(zi.zielBis).monat - 1]} ${R.ymTeile(zi.zielBis).jahr}` : ''}`}</span></span>` : '';
    return `<button class="karte spar ${extern ? 'extern' : ''}" data-a="sparkonto" data-id="${esc(sp.id)}">
      <span class="symbol">${ICON.pfeil}</span>
      <span class="mitte"><span style="font-size:var(--t-text);font-weight:600">${titel}</span><span class="klein">${unter}</span>${zielHtml}</span>
      ${extern ? '' : `<span class="stand"><span class="klein" style="font-size:var(--t-mini)">Stand</span><span style="font-size:var(--t-titel-karte);font-weight:500">${R.euroRund(R.sparStand(sp, stichtag, z.daten))}</span></span>`}
    </button>`;
  }).join('') : `<button class="karte spar" data-a="sparkonto"><span class="symbol">${ICON.pfeil}</span><span class="mitte"><span style="font-size:var(--t-text);font-weight:600">Sparkonto anlegen</span><span class="klein">Sparen ist keine Ausgabe, das Geld bleibt deins</span></span></button>`;

  const liste = ausgabenHtml(r, s);
  const geplantKarte = s >= heuteYm() ? geplantHtml(s, pruefung) : '';
  const einnahmenKarte = einnahmenHtml(s);

  const sicherung = `<section class="karte">
    <div class="label">Einstellungen und Sicherung</div>
    <button class="schalter" role="switch" aria-checked="${!z.daten.einstellungen.budgetLeisteAus}" data-a="budgetleiste"><span class="t">Budgets unter „Frei“ zeigen<br><span class="klein">Antippen einer Zeile = Ausgabe eintragen</span></span><span class="spur"></span></button>
    <button class="knopf" data-a="auswertung">📊 Auswertung der Ausgaben</button>
    <button class="knopf" data-a="gehaltsrechner">🧮 DRK-Gehaltsrechner</button>
    <button class="knopf" data-a="dienste">📅 Dienste und Gehalt schätzen${DI.schaetzenAn(z.daten) ? ' · an' : ''}</button>
    <button class="knopf" data-a="hinweise">🔔 Hinweise und Warnungen${(z.daten.einstellungen.hinweiseAus || []).length ? ' · ' + (z.daten.einstellungen.hinweiseAus || []).length + ' aus' : ''}</button>
    <button class="knopf" data-a="offene">? Offene Beträge${R.offeneListe(z.daten).length ? ' (' + R.offeneListe(z.daten).length + ')' : ''}</button>
    <button class="knopf" data-a="einfuehrung-erneut">Einführung erneut durchgehen</button>
    <p class="hinweistext">Alle Daten liegen nur auf diesem Handy. Exportiere ab und zu eine Sicherung, z. B. vor dem Löschen der App.${z.daten.einstellungen.letzteSicherung ? ' Zuletzt: ' + esc(z.daten.einstellungen.letzteSicherung) + '.' : ''}</p>
    <div class="zwei"><button class="knopf" data-a="export">Exportieren</button><button class="knopf" data-a="import">Importieren</button></div>
    ${z.daten.beispiel ? '<button class="knopf leise" data-a="beispiel-weg">Beispieldaten entfernen</button>' : ''}
    <div class="klein" style="font-size:var(--t-mini)">${APP_VERSION}</div>
  </section>`;

  return { s, r, pruefung, rk, hatJaehrliche, nav, freiKarte, konten: ruecklageKarte + sparKarten, liste, geplantKarte, einnahmenKarte, sicherung };
}

// ---------- Übersicht: Frei-Karte und vier Kacheln, ohne Scrollen ----------
const KACHEL_ICON = {
  ausgaben: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eef2f0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 11h11.2L21 7H6.2"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/></svg>',
  konten: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eef2f0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-6 9 6M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3 20h18"/></svg>',
  einnahmen: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eef2f0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  geplant: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eef2f0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4M9 15h6"/></svg>',
  zahnrad: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7c1be" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
};

// Kacheln der Übersicht: frei anordnen (lang drücken und ziehen), hinzufügen, entfernen, breit/aufklappbar
const STANDARD_KACHELN = [{ id: 'ausgaben' }, { id: 'konten' }, { id: 'einnahmen' }, { id: 'geplant' }, { id: 'abos', breit: true }];
function kachelListe() {
  const l = z.daten.einstellungen.kacheln;
  return (Array.isArray(l) ? l : STANDARD_KACHELN).filter((k) => kachelArt(k.id));
}
function kachelArt(id) {
  if (id.startsWith('budget:')) { const k = R.kategorie(z.daten, id.slice(7)); return k ? { titel: (k.emoji ? k.emoji + ' ' : '') + k.name, beschreibung: 'Budget mit Balken' } : null; }
  return KACHEL_KATALOG[id] || null;
}
const AUFKLAPPBAR = new Set(['ausgaben', 'geplant', 'abos', 'naechste']);
const KACHEL_KATALOG = {
  ausgaben: { titel: 'Ausgaben', beschreibung: 'Summe des Monats, aufklappbar: zuletzt gebucht' },
  konten: { titel: 'Konten', beschreibung: 'Rücklagenkonto und Sparkonto' },
  einnahmen: { titel: 'Einnahmen', beschreibung: 'Gehalt und weitere Einnahmen' },
  geplant: { titel: 'Geplante Ausgaben', beschreibung: 'Potenzielle Ausgaben mit Warnung, aufklappbar' },
  abos: { titel: 'Abos', beschreibung: 'Alle Abos, pro Monat und Jahr, aufklappbar', breit: true },
  naechste: { titel: 'Nächste Abbuchungen', beschreibung: 'Die nächsten Fixkosten, aufklappbar', breit: true }
};

// Erfolgsmoment (v21): Nach dem Buchen leuchtet der betroffene Betrag kurz auf
function leuchtet(katId) { const l = z.leuchten; return !!(l && Date.now() < l.bis && (!katId || l.kat === katId)); }
function budgetLeiste(s) {
  const ks = budgetKats().filter((k) => Number(k.budget) > 0 || R.ausgegebenIm(z.daten, s, k.id) > 0);
  if (!ks.length || s !== heuteYm() || z.daten.einstellungen.budgetLeisteAus) return '';
  return `<section class="karte budget-leiste"><div class="bl-kopf"><span class="label">Budgets im ${esc(monatsName(s))}</span><span class="klein">antippen = eintragen</span></div>${ks.map((k) => {
    const aus = R.ausgegebenIm(z.daten, s, k.id); const b = Number(k.budget) || 0; const ueber = b > 0 && aus > b;
    return `<button class="bl-zeile" data-a="eintragen" data-kat="${esc(k.id)}" aria-label="${esc(k.name)}: Ausgabe eintragen"><span class="bl-name">${esc(mitEmoji(k) + k.name)}</span>
      <span class="mini"><span style="width:${b ? Math.min(100, aus / b * 100).toFixed(1) : 0}%${ueber ? ';background:var(--fehler)' : ''}"></span></span>
      <span class="bl-rest ${ueber ? 'warn' : ''}">${b ? (ueber ? R.euroRund(aus - b) + ' drüber' : 'noch ' + R.euroRund(b - aus)) : rausZ(aus, true)}</span></button>`;
  }).join('')}</section>`;
}
function monatAnsicht() {
  const t = monatTeile(z.monat);
  const { s, r, pruefung, rk, hatJaehrliche } = t;
  const stichtag = s === heuteYm() ? heute() : s + '-' + R.zweistellig(R.tageImMonat(s));
  const kachel = (typ, titel, wert, unter, unterArt = '', aktion = 'bereich') => `<button class="kachel" data-a="${aktion}" data-wert="${typ}" aria-label="${esc(titel)} öffnen">
      <span class="kachel-kopf">${KACHEL_ICON[typ] || ''}<span>${esc(titel)}</span></span>
      <span class="kachel-wert ${typ === 'ausgaben' && s === heuteYm() && leuchtet() ? 'leuchtet' : ''}">${wert}</span>
      <span class="kachel-unter ${unterArt}">${unter}</span></button>`;
  const klappKnopf = (k) => `<button class="aufklapp klein-auf" data-a="kachel-auf" data-wert="${esc(k.id)}" aria-expanded="false" aria-label="Aufklappen">${ICON.runter}</button>`;
  const tagText = (zeit) => { const d = zeit.slice(0, 10); return d === heute() ? 'heute ' + zeit.slice(11, 16) : Number(d.slice(8)) + '. ' + R.MONATE_KURZ[Number(d.slice(5, 7)) - 1]; };
  const bauer = {
    ausgaben: (k) => {
      const budgets = (r.gruppen.find((g) => g.art === 'budget') || { posten: [] }).posten;
      const ueber = budgets.filter((p) => p.budget > 0 && p.ausgegeben > p.budget);
      const ausgegeben = budgets.reduce((a, p) => a + p.ausgegeben, 0);
      const unter = ueber.length ? `${esc(ueber.map((p) => p.kategorie.name).join(', '))} über Budget` : `${rausSatz(ausgegeben, true)} von den Budgets ausgegeben`;
      if (k.offen) {
        const letzte = R.verlaufMitStand(z.daten).slice(0, 5).map((b) => {
          const kat = R.kategorie(z.daten, b.kategorieId);
          return `<button class="mini-zeile" data-a="buchung" data-id="${esc(b.id)}"><span>${esc(tagText(b.zeit))} · ${esc((kat && kat.emoji ? kat.emoji + ' ' : '') + (b.ort || (kat ? kat.name : '')))}</span>${b.offen ? offenZahl(b) : `<span class="minus-zahl">− ${R.euro(b.betrag)}</span>`}</button>`;
        }).join('');
        return breiteKachel('ausgaben', 'Ausgaben', `<span class="minus-zahl">− ${R.euroRund(r.ausgaben)}</span>`, unter, k, '<div class="mini-titel">Zuletzt gebucht</div>' + (letzte || '<div class="mini-leer">Noch keine Buchungen.</div>'));
      }
      return kachel('ausgaben', 'Ausgaben', `<span class="minus-zahl">− ${R.euroRund(r.ausgaben)}</span>`, unter, ueber.length ? 'warn' : '') + klappKnopf(k);
    },
    konten: () => {
      const sp = R.sparratenNormal(z.daten);
      const luecke = rk && hinweisAn('ruecklage') ? R.ruecklageLuecke(z.daten, heute()) : null;
      const wert = rk || sp.length
        ? [rk ? `Rücklage ${R.euroRund(R.ruecklageStand(z.daten, stichtag))}` : '', sp.length ? `Sparen ${R.euroRund(sp.reduce((a, x) => a + R.sparStand(x, stichtag, z.daten), 0))}` : ''].filter(Boolean).join('<br>')
        : '–';
      const summe = (rk ? R.ruecklageStand(z.daten, stichtag) : 0) + sp.reduce((a, x) => a + R.sparStand(x, stichtag, z.daten), 0);
      return kachel('konten', 'Konten', rk || sp.length ? R.euroRund(summe) : '–',
        luecke ? `Rücklage reicht im ${R.MONATE_KURZ[R.ymTeile(R.ymAus(luecke.datum)).monat - 1]} nicht` : !rk && hatJaehrliche ? 'Rücklagenkonto einrichten?' : rk ? 'Rücklage reicht' : 'Sparen einrichten', luecke ? 'warn' : !rk && hatJaehrliche ? 'hinweis' : 'gut');
    },
    einnahmen: () => {
      const rein = weitereEinnahmen().filter((e) => R.einnahmeAktivIm(e, s));
      const fest = rein.reduce((a, e) => { const w = R.einnahmeIm(e, s); return a + (w.zaehlt ? w.betrag : 0); }, 0);
      const geplantRein = rein.reduce((a, e) => { const w = R.einnahmeIm(e, s); return a + (w.zaehlt ? 0 : w.betrag); }, 0);
      return kachel('einnahmen', 'Einnahmen', `<span class="plus-zahl">+ ${R.euroRund((r.gehaltWert ? r.gehaltWert.betrag : 0) + fest)}</span>`,
        geplantRein ? `+ ${R.euroRund(geplantRein)} geplant` : rein.length ? `davon weitere + ${R.euroRund(fest)}` : 'Gehalt und weitere', geplantRein ? 'plus' : '');
    },
    geplant: (k) => {
      const ws = s >= heuteYm() ? R.offeneWuensche(z.daten).filter((w) => w.monat === s || (s === heuteYm() && (!w.monat || w.monat < s))) : [];
      const probleme = hinweisAn('geplant') ? ws.filter((w) => pruefung[w.id] && pruefung[w.id].fehlt > 0) : [];
      const wert = ws.length ? `<span class="minus-zahl">− ${R.euroRund(ws.reduce((a, w) => a + R.preisBis(w), 0))}</span>` : '<span>–</span>';
      const unter = probleme.length ? `${probleme.length} reicht nicht` : ws.length ? `${ws.length} ${ws.length === 1 ? 'Sache' : 'Sachen'} · Geld reicht` : 'nichts geplant';
      if (k.offen) {
        const zeilen = ws.map((w) => { const st = wunschStatus(w, pruefung[w.id], s); return `<button class="mini-zeile" data-a="wunsch" data-id="${esc(w.id)}"><span>${esc(w.name)}<small class="status ${st.art}">${esc(st.text)}</small></span><span class="minus-zahl">− ${esc(R.preisText(w))}</span></button>`; }).join('');
        return breiteKachel('geplant', 'Geplante Ausgaben', wert, unter, k, zeilen || '<div class="mini-leer">Nichts geplant.</div>');
      }
      return kachel('geplant', 'Geplante Ausgaben', wert, unter, probleme.length ? 'warn' : ws.length ? 'gut' : '') + klappKnopf(k);
    },
    abos: (k) => {
      const abos = aboListe(s).filter((x) => x.laeuft);
      const monat = abos.reduce((a, x) => a + x.proMonat, 0);
      const zeilen = abos.slice(0, 8).map((x) => `<button class="mini-zeile" data-a="fixkosten" data-id="${esc(x.f.id)}"><span>${esc(x.f.name)}</span>${x.f.offen ? offenZahl(x.f) : `<span class="minus-zahl">− ${R.euro(Math.round(x.proMonat * 100) / 100)}</span>`}</button>`).join('');
      return breiteKachel('abos', 'Abos', `<span class="minus-zahl">− ${R.euroRund(monat)}</span><small> pro Monat</small>`, `${abos.length === 1 ? '1 Abo' : abos.length + ' Abos'} · ${rausSatz(monat * 12, true)} im Jahr`, k, zeilen || '<div class="mini-leer">Noch keine Abos.</div>');
    },
    naechste: (k) => {
      const liste = R.naechsteAbbuchungen(z.daten, heute()).slice(0, 6);
      const zeilen = liste.map((x) => `<button class="mini-zeile" data-a="fixkosten" data-id="${esc(x.fixkosten.id)}"><span>${esc(Number(x.datum.slice(8)) + '. ' + R.MONATE_KURZ[R.ymTeile(R.ymAus(x.datum)).monat - 1])} · ${esc(x.fixkosten.name)}</span><span class="minus-zahl">− ${R.euro(x.betrag)}</span></button>`).join('');
      const erste = liste[0];
      return breiteKachel('naechste', 'Nächste Abbuchungen', erste ? `<span class="kachel-klein">${esc(erste.fixkosten.name)} · ${esc(Number(erste.datum.slice(8)) + '. ' + R.MONATE_KURZ[R.ymTeile(R.ymAus(erste.datum)).monat - 1])}</span>` : '–', erste ? `<span class="minus-zahl">− ${R.euro(erste.betrag)}</span>` : 'keine Fixkosten', k, zeilen || '<div class="mini-leer">Keine.</div>', 'ausgaben');
    }
  };
  const budgetKachel = (k) => {
    const kat = R.kategorie(z.daten, k.id.slice(7));
    const aus = R.ausgegebenIm(z.daten, s, kat.id);
    const b = Number(kat.budget) || 0;
    const pct = b > 0 ? Math.min(100, aus / b * 100) : 0;
    const ueber = b > 0 && aus > b;
    // v27: Antippen = Ausgabe eintragen (das Budget selbst ändert man unter Ausgaben)
    return `<button class="kachel" data-a="eintragen" data-kat="${esc(kat.id)}" aria-label="${esc(kat.name)}: Ausgabe eintragen">
      <span class="kachel-kopf"><span>${esc((kat.emoji ? kat.emoji + ' ' : '') + kat.name)}</span></span>
      <span class="kachel-wert ${leuchtet(kat.id) ? 'leuchtet' : ''}"><span class="minus-zahl">− ${R.euroRund(aus)}</span></span>
      ${b > 0 ? `<span class="mini kachel-mini"><span style="width:${pct.toFixed(1)}%${ueber ? ';background:var(--fehler)' : ''}"></span></span>` : ''}
      <span class="kachel-unter ${ueber ? 'warn' : ''}">${b > 0 ? (ueber ? `${R.euroRund(aus - b)} über Budget` : `noch ${R.euroRund(b - aus)} von ${R.euroRund(b)}`) : 'ohne Budget'}</span><span class="kachel-tipp-klein">antippen = eintragen</span></button>`;
  };
  const bearbeiten = !!z.bearbeiten;
  const kacheln = kachelListe().map((k) => {
    const html = k.id.startsWith('budget:') ? budgetKachel(k) : bauer[k.id](k);
    const breit = k.breit || k.offen || (KACHEL_KATALOG[k.id] && KACHEL_KATALOG[k.id].breit && k.breit !== false);
    const gewaehlt = bearbeiten && z.gewaehlt === k.id;
    const steuer = bearbeiten ? `<span class="kachel-steuer"><button class="steuer-knopf weg" data-a="kachel-x" data-wert="${esc(k.id)}" aria-label="Kachel entfernen">${ICON.x}</button></span>` : '';
    const griffe = gewaehlt ? `<span class="groessen-griff" data-seite="l" aria-hidden="true"></span><span class="groessen-griff" data-seite="r" aria-hidden="true"></span>${AUFKLAPPBAR.has(k.id) ? '<span class="groessen-griff" data-seite="o" aria-hidden="true"></span><span class="groessen-griff" data-seite="u" aria-hidden="true"></span>' : ''}` : '';
    return `<div class="kachel-platz ${breit ? 'breit' : ''} ${bearbeiten && !gewaehlt ? 'wackeln' : ''} ${gewaehlt ? 'gewaehlt' : ''}" data-kachel="${esc(k.id)}">${html}${steuer}${griffe}</div>`;
  }).join('');
  const leiste = `<div class="kachel-leiste"><span class="label">Übersicht</span>${bearbeiten
    ? '<button class="knopf klein haupt" data-a="bearbeiten-aus">Fertig</button>'
    : `<button class="knopf klein rund leise" style="width:36px" data-a="bearbeiten-an" aria-label="Übersicht bearbeiten">${ICON.stift}</button>`}</div>`;
  const dazu = bearbeiten ? `<button class="kachel kachel-neu" data-a="kachel-katalog" aria-label="Kachel hinzufügen">${ICON.plus}<span>Kachel hinzufügen</span></button>` : '';
  const vk = (z.vorschlaege || []).length && !bearbeiten && z.monat === heuteYm() ? `<button class="karte vorschlag-karte" data-a="vorschlaege"><span class="vk-glocke">🔔</span><span class="mitte"><b>${z.vorschlaege.length === 1 ? '1 Zahlung erkannt' : z.vorschlaege.length + ' Zahlungen erkannt'} <span class="beta">BETA</span></b><span class="klein">Antippen zum Prüfen und Buchen</span></span>${ICON.rechts}</button>` : '';
  const gf = !bearbeiten && z.monat === heuteYm() && hinweisAn('gehalt') ? gehaltFrageKarte() : '';
  const sk = !bearbeiten && z.monat === heuteYm() ? sicherungKarte() : '';
  return t.nav + t.freiKarte + gf + vk + sk + budgetLeiste(s) + leiste + `<div class="kacheln ${bearbeiten ? 'im-bearbeiten' : ''}" id="kacheln">${kacheln}${dazu}</div>
    ${bearbeiten ? `<p class="kachel-tipp">${z.gewaehlt ? 'An den Punkten ziehen: links/rechts = breit oder schmal' + (AUFKLAPPBAR.has(z.gewaehlt) ? ', oben/unten = auf- oder zuklappen' : '') + '.' : 'Kachel antippen, um die Größe zu ändern.'} Lang drücken und ziehen verschiebt · ✕ entfernt</p>` : ''}
    <button class="knopf leise einstellungen-knopf" data-a="bereich" data-wert="einstellungen">${KACHEL_ICON.zahnrad} Einstellungen und Sicherung</button>
    <div class="fab-platz"></div>`;
}

function breiteKachel(typ, titel, wert, unter, k, zeilen, ziel) {
  const offen = !!k.offen;
  return `<div class="kachel breit-kachel ${offen ? 'offen' : ''}">
      <button class="breit-kopf" data-a="bereich" data-wert="${ziel || typ}" aria-label="${esc(titel)} öffnen">
        <span class="kachel-kopf">${KACHEL_ICON[typ] || ''}<span>${esc(titel)}</span></span>
        <span class="breit-wert"><span class="kachel-wert">${wert}</span><span class="kachel-unter">${unter}</span></span>
      </button>
      <button class="aufklapp" data-a="kachel-auf" data-wert="${esc(k.id)}" aria-expanded="${offen}" aria-label="${offen ? 'Zuklappen' : 'Aufklappen'}">${offen ? ICON.hoch : ICON.runter}</button>
      ${offen ? `<div class="mini-liste">${zeilen}</div>` : ''}
    </div>`;
}

// ---------- Schnell eintragen (＋ unten rechts) ----------
const FAB_ICON = '<svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
function fabHtml(art) {
  const ziel = { abos: ['abo-neu', 'Abo hinzufügen'], einnahmen: ['eintragen', 'Einnahme eintragen', 'einnahme'], konten: ['eintragen', 'Übertrag eintragen', 'uebertrag'] }[art] || ['eintragen', 'Ausgabe, Einnahme, Übertrag oder Abo eintragen', ''];
  return `<button class="fab" data-a="${ziel[0]}" ${ziel[2] ? `data-wert="${ziel[2]}"` : ''} aria-label="${ziel[1]}">${FAB_ICON}</button>`;
}

// Frei-Karte: jedes Konto mit seinem Namen; ab 4 Konten (ohne Rücklage) nach Art zusammengefasst
const KONTO_PUNKT = { ruecklage: '<i class="punkt streifen"></i>', sparen: '<i class="punkt" style="background:var(--spar)"></i>', extern: '<i class="punkt" style="background:var(--extern)"></i>' };
function kontoZeilen(r) {
  const knopf = (art, text, betrag, extra) => `<button class="auf-zeile auf-knopf" data-a="bereich" data-wert="konten" aria-label="${esc(text)}: Konten öffnen"><span class="l">${KONTO_PUNKT[art]}${esc(text)}${extra > 0 ? `<small>inkl. ${R.euroRund(extra)} extra</small>` : ''}</span><span class="r minus-zahl">− ${R.euroRund(betrag)}</span></button>`;
  const rk = r.konten.filter((k) => k.art === 'ruecklage');
  const andere = r.konten.filter((k) => k.art !== 'ruecklage' && k.betrag > 0);
  let html = rk.map((k) => knopf('ruecklage', k.konto.name || 'Rücklagenkonto', k.betrag, k.extra)).join('');
  if (andere.length <= 3) return html + andere.map((k) => knopf(k.art, k.konto.name, k.betrag, k.extra)).join('');
  for (const [art, titel] of [['sparen', 'Sparen'], ['extern', 'Andere Konten']]) {
    const l = andere.filter((k) => k.art === art);
    if (!l.length) continue;
    html += knopf(art, l.length === 1 ? l[0].konto.name : `${titel} (${l.length} Konten)`, l.reduce((a, k) => a + k.betrag, 0), l.reduce((a, k) => a + k.extra, 0));
  }
  return html;
}

// ---------- Abos ----------
function aboListe(s) {
  return z.daten.fixkosten.filter((f) => f.abo).map((f) => {
    const laeuft = R.laeuftIm(f, s);
    const kat = R.kategorie(z.daten, f.kategorieId);
    return { f, kat, laeuft, proMonat: R.monatsAnteil(f, s), endet: f.endetAm || null };
  }).sort((a, b) => b.proMonat - a.proMonat);
}
function abosHtml(s) {
  const alle = aboListe(s);
  const laufend = alle.filter((x) => x.laeuft && !x.endet);
  const gekuendigt = alle.filter((x) => x.laeuft && x.endet);
  const vorbei = alle.filter((x) => !x.laeuft);
  const monat = alle.filter((x) => x.laeuft).reduce((a, x) => a + x.proMonat, 0);
  const frist = { '2w': '2 Wochen', '1m': '1 Monat', '3m': '3 Monate' };
  const zeile = (x) => {
    const f = x.f;
    const naechste = R.naechsteAbbuchungen({ fixkosten: [f] }, heute())[0];
    const info = [R.rhythmusBeschreibung(f).replace(/ · .*/, ''), naechste ? 'nächste am ' + Number(naechste.datum.slice(8)) + '. ' + R.MONATE_KURZ[R.ymTeile(R.ymAus(naechste.datum)).monat - 1] : '',
      x.endet ? 'endet ' + new Date(x.endet + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }) : '', f.kuendigungsfrist && frist[f.kuendigungsfrist] ? 'Kündigungsfrist ' + frist[f.kuendigungsfrist] : ''].filter(Boolean).join(' · ');
    return `<button class="posten ${x.laeuft ? '' : 'grau'}" data-a="fixkosten" data-id="${esc(f.id)}" aria-label="${esc(f.name)} bearbeiten"><span class="t"><span class="n">${esc((x.kat && x.kat.emoji ? x.kat.emoji + ' ' : '') + f.name)}</span><small>${esc(info)}</small></span><span class="b">${f.offen ? betragHtml(f) : `<span class="minus-zahl">− ${R.euro(Math.round(x.proMonat * 100) / 100)}</span><small class="pro">${f.wieOft === 'monatlich' ? 'pro Monat' : '≈ pro Monat'}</small>`}</span>${PFEIL}</button>`;
  };
  return `<section class="karte ring abo-kopf">
      <div class="label">Abos zusammen</div>
      <div class="grosszahl" style="font-size:var(--t-zahl-xl)"><span class="minus-zahl">− ${R.euroRund(monat)}</span><small style="font-size:var(--t-text);color:var(--gedaempft)"> pro Monat</small></div>
      <div class="hinweistext">${rausSatz(monat * 12, true)} im Jahr · ${laufend.length} laufend${gekuendigt.length ? ` · ${gekuendigt.length} gekündigt` : ''}</div>
    </section>
    <section class="karte liste">${laufend.length ? laufend.map(zeile).join('') : '<div class="leer-zeile" style="border:0">Noch keine Abos. Mit ＋ unten rechts eins anlegen.</div>'}
      ${gekuendigt.length ? `<div class="unterkopf">Gekündigt, läuft noch</div>${gekuendigt.map(zeile).join('')}` : ''}
      ${vorbei.length ? `<div class="unterkopf">Beendet</div>${vorbei.map(zeile).join('')}` : ''}
    </section>
    <p class="hinweistext">Neues Abo: ＋ unten rechts. Gekündigt? Abo antippen → „Mehr“ → „Endet am“ eintragen. Ab dann zählt es nicht mehr.</p>`;
}

const BEREICH_TITEL = { ausgaben: 'Ausgaben', konten: 'Konten', einnahmen: 'Einnahmen', geplant: 'Geplante Ausgaben', abos: 'Abos', einstellungen: 'Einstellungen' };
function bereichHtml(eb) {
  const t = monatTeile(z.monat);
  const kopf = `<p class="hinweistext">${esc(monatsName(z.monat))} ${R.ymTeile(z.monat).jahr}</p>`;
  let inhalt = '';
  if (eb.typ === 'ausgaben') inhalt = t.liste;
  else if (eb.typ === 'konten') inhalt = t.konten || '<div class="leerzustand">Noch kein Konto eingerichtet.</div>';
  else if (eb.typ === 'einnahmen') inhalt = t.einnahmenKarte;
  else if (eb.typ === 'abos') inhalt = abosHtml(z.monat);
  else if (eb.typ === 'geplant') inhalt = t.s >= heuteYm() ? t.geplantKarte : '<div class="leerzustand">Für vergangene Monate lässt sich nichts mehr planen.</div>';
  else inhalt = erkennungKarte() + t.sicherung;
  if (eb.typ === 'konten') {
    inhalt += `${t.rk || t.konten.includes('hinweis-karte') ? '' : '<button class="knopf akzent" data-a="ruecklage">' + ICON.plus + ' Rücklagenkonto einrichten</button>'}<button class="knopf akzent" data-a="sparkonto">${ICON.plus} Konto anlegen</button>`;
  }
  return seite(BEREICH_TITEL[eb.typ], kopf + inhalt + (eb.typ === 'einstellungen' ? '' : '<div class="fab-platz"></div>' + fabHtml(eb.typ)));
}

// ---------- Ausgabenliste ----------
const PFEIL = '<svg class="pfeil" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7c1be" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
const STIFT_KLEIN = '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#b7c1be" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
const mitEmoji = (k) => (k && k.emoji ? k.emoji + ' ' : '');

function ausgabenHtml(r, s) {
  const kurz = R.MONATE_KURZ[R.ymTeile(s).monat - 1];
  const proMonat = !!z.daten.einstellungen.ansichtProMonat;
  const neu = `<div class="zwei"><button class="knopf akzent" data-a="fixkosten-neu">${ICON.plus} Fixkosten</button><button class="knopf akzent" data-a="budget-neu">${ICON.plus} Budget</button></div>
    <button class="knopf leise" data-a="kategorie-neu">${ICON.plus} Neue Kategorie für Fixkosten</button>`;
  const naechsteFaelligkeit = (f) => {
    const m = R.abbuchungsMonate(f).find((x) => x > R.ymTeile(s).monat) || R.abbuchungsMonate(f)[0];
    return R.MONATE_KURZ[m - 1];
  };
  const fixZeile = (p) => p.faellig
    ? `<button class="posten" data-a="fixkosten" data-id="${esc(p.fixkosten.id)}" aria-label="${esc(p.fixkosten.name)} bearbeiten"><span class="t"><span class="n">${esc(p.fixkosten.name)}</span><small>${esc(p.wann)}</small>${geteiltHtml(p.fixkosten)}</span><span class="b">${betragHtml(p.fixkosten, rausZ(p.betrag))}</span>${PFEIL}</button>`
    : `<button class="posten grau" data-a="fixkosten" data-id="${esc(p.fixkosten.id)}" aria-label="${esc(p.fixkosten.name)} bearbeiten"><span class="t"><span class="n">${esc(p.fixkosten.name)}</span><small>im ${naechsteFaelligkeit(p.fixkosten)} · ${esc(R.RHYTHMUS_TEXT[p.fixkosten.wieOft] || '')}</small></span><span class="b">${betragHtml(p.fixkosten, rausZ(p.betrag))}</span>${PFEIL}</button>`;
  const rkZeile = (p) => `<button class="posten grau" data-a="fixkosten" data-id="${esc(p.fixkosten.id)}" aria-label="${esc(p.fixkosten.name)} bearbeiten"><span class="t"><span class="n">${esc(p.fixkosten.name)}</span><small>${p.faellig ? `diesen Monat am ${R.abbuchungsTag(p.fixkosten, s)}. · aus der Rücklage` : `im ${naechsteFaelligkeit(p.fixkosten)} · ${esc(R.RHYTHMUS_TEXT[p.fixkosten.wieOft] || '')}`}</small></span><span class="b">${betragHtml(p.fixkosten, rausZ(p.betrag))}</span>${PFEIL}</button>`;
  const budgetZeile = (p) => {
    const pct = p.budget > 0 ? Math.min(100, p.ausgegeben / p.budget * 100) : 0;
    const ueber = p.budget > 0 && p.ausgegeben > p.budget;
    const unter = p.budget > 0 ? (ueber ? `${R.euro(p.ausgegeben - p.budget)} über dem Budget` : `${rausSatz(p.ausgegeben)} ausgegeben · noch ${R.euro(p.budget - p.ausgegeben)}`) : `${rausSatz(p.ausgegeben)} ausgegeben · ohne Budget`;
    return `<button class="posten budget" data-a="budget" data-id="${esc(p.kategorie.id)}" aria-label="${esc(p.kategorie.name)} bearbeiten"><span class="t"><span class="n">${esc(mitEmoji(p.kategorie) + p.kategorie.name)}</span><small class="${ueber ? 'warn' : ''}">${unter}</small>${p.budget > 0 ? `<span class="mini"><span style="width:${pct.toFixed(1)}%${ueber ? ';background:var(--fehler)' : ''}"></span></span>` : ''}</span><span class="b">${betragHtml(p.fixkosten, rausZ(p.betrag))}</span>${PFEIL}</button>`;
  };

  // Ansicht „pro Monat gerechnet“: jede Fixkoste mit ihrem Monatsanteil, Jahresbetrag darunter
  const proMonatZeile = (p) => {
    const f = p.fixkosten;
    const jahr = p.anteil * 12;
    const monate = R.abbuchungsMonate(f).map((m) => R.MONATE_KURZ[m - 1]).join(', ');
    const info = f.wieOft === 'monatlich' ? esc(p.wann)
      : f.wieOft === 'jaehrlich' ? `${rausSatz(p.betrag)} einmal im Jahr · im ${monate}`
      : `${rausSatz(p.betrag)} ${esc(R.RHYTHMUS_TEXT[f.wieOft])} (${monate}) · ${rausSatz(Math.round(jahr))} im Jahr`;
    return `<button class="posten" data-a="fixkosten" data-id="${esc(f.id)}" aria-label="${esc(f.name)} bearbeiten"><span class="t"><span class="n">${esc(f.name)}</span><small>${info}</small>${geteiltHtml(f)}</span><span class="b">${betragHtml(f, rausZ(Math.round(p.anteil * 100) / 100, false, f.wieOft === 'monatlich' ? '' : '≈ '))}</span>${PFEIL}</button>`;
  };

  const karten = r.gruppen.map((gr) => {
    if (proMonat && gr.art !== 'budget') {
      const k = gr.kategorie;
      const monat = gr.posten.reduce((a, p) => a + p.anteil, 0);
      const zeichen = k && k.emoji ? `<span class="kat-zeichen" aria-hidden="true">${esc(k.emoji)}</span>` : '<i class="kat-farbe" aria-hidden="true"></i>';
      return `<section class="kat-karte" style="--kat:${gr.farbe}">
        <button class="kat-kopf" data-a="kategorie" data-id="${esc(k.id)}" aria-label="Kategorie ${esc(gr.name)} bearbeiten">${zeichen}<span class="kat-titel"><b>${esc(gr.name)} ${STIFT_KLEIN}</b><small>${rausSatz(monat * 12, true)} im Jahr</small></span><span class="kat-summe">${rausZ(monat, true, '≈ ')}</span></button>
        ${gr.posten.map(proMonatZeile).join('')}${!gr.posten.length ? '<div class="leer-zeile">Noch nichts eingetragen</div>' : ''}</section>`;
    }
    const faellig = gr.posten.filter((p) => p.zaehlt);
    const ausRk = gr.posten.filter((p) => p.ausRuecklage);
    const spaeter = gr.posten.filter((p) => !p.faellig && !p.ausRuecklage);
    const zeilen = gr.art === 'budget' ? gr.posten.map(budgetZeile).join('') : faellig.map(fixZeile).join('');
    const spaeterHtml = (ausRk.length ? `<div class="unterkopf">Aus dem Rücklagenkonto bezahlt</div>${ausRk.map(rkZeile).join('')}` : '')
      + (spaeter.length ? `<div class="unterkopf">Nicht im ${kurz}</div>${spaeter.map(fixZeile).join('')}` : '');
    const leer = !gr.posten.length ? '<div class="leer-zeile">Noch nichts eingetragen</div>' : '';
    const unter = gr.art === 'budget' ? 'Einkäufe aus den Widgets' : (faellig.length ? `${faellig.length} Abbuchung${faellig.length > 1 ? 'en' : ''} im ${kurz}` : `keine Abbuchung im ${kurz}`);
    const k = gr.kategorie;
    const zeichen = k && k.emoji ? `<span class="kat-zeichen" aria-hidden="true">${esc(k.emoji)}</span>` : '<i class="kat-farbe" aria-hidden="true"></i>';
    const kopfAktion = gr.art === 'budget' ? 'data-a="budgets-farbe"' : `data-a="kategorie" data-id="${esc(k.id)}"`;
    return `<section class="kat-karte" style="--kat:${gr.farbe}">
      <button class="kat-kopf" ${kopfAktion} aria-label="Kategorie ${esc(gr.name)} bearbeiten">${zeichen}<span class="kat-titel"><b>${esc(gr.name)} ${STIFT_KLEIN}</b><small>${unter}</small></span><span class="kat-summe">${rausZ(gr.summe)}</span></button>
      ${zeilen}${spaeterHtml}${leer}</section>`;
  }).join('');

  const wahl = `<div class="ansicht-wahl" role="group" aria-label="Darstellung der Fixkosten">
    <button data-a="ansicht-pro-monat" data-wert="0" aria-pressed="${!proMonat}">Im ${kurz} abgebucht</button>
    <button data-a="ansicht-pro-monat" data-wert="1" aria-pressed="${proMonat}">Pro Monat gerechnet</button></div>`;
  const fixMonat = r.gruppen.filter((g) => g.art !== 'budget').reduce((a, g) => a + g.posten.reduce((b, p) => b + p.anteil, 0), 0);
  const summe = proMonat ? `<div class="pro-monat-summe">Fixkosten zusammen <b>${rausZ(fixMonat, true, '≈ ')}</b> pro Monat · ${rausSatz(fixMonat * 12, true)} im Jahr</div>` : '';
  const titel = `<div class="abschnitt-kopf"><span class="label">Ausgaben${proMonat ? '' : ' im ' + esc(monatsName(s))}</span><span class="klein">Antippen zum Bearbeiten</span></div>`;
  const aw = `<button class="karte aw-start" data-a="auswertung"><span class="aw-symbol" aria-hidden="true">📊</span><span class="mitte"><b>Auswertung</b><span class="klein">Schnitt pro Monat, passt das Budget, wo geht das Geld hin</span></span>${PFEIL}</button>`;
  return `<div class="ausgaben">${aw}${titel}${wahl}${summe}${karten}${neu}</div>`;
}

function jahrAnsicht() {
  const ab = R.ymPlus(heuteYm(), 1);
  const monate = R.jahresUeberblick(z.daten, ab);
  const max = Math.max(1, ...monate.map((m) => m.summe));
  const zeilen = monate.map((m) => {
    const teile = m.teile.filter((t) => t.summe > 0).map((t) => `<span style="width:${(t.summe / max * 100).toFixed(1)}%;background:${t.kategorie.farbe}"></span>`).join('');
    const rk = !!R.ruecklage(z.daten);
    // Jahr kompakt (v21): pro Monat höchstens eine kurze Zeile mit Kennzeichen; Einzelheiten im Monat (antippen)
    const zus = m.zusaetzlich.reduce((a, x) => a + x.betrag, 0);
    const wuensche = R.offeneWuensche(z.daten).filter((w) => w.monat === m.monat);
    const rein = weitereEinnahmen().filter((e) => e.wieOft === 'einmalig' && R.einnahmeAktivIm(e, m.monat));
    const marken = [
      zus > 0 ? `<span class="marke ${rk ? '' : 'warn'}" title="${esc(m.zusaetzlich.map((x) => x.text).join(' · '))}">${rk ? '↺' : '!'} ${rk ? rausSatz(zus, true) : R.euroRund(zus)} ${rk ? 'aus Rücklage' : 'extra fällig'}</span>` : '',
      wuensche.length ? `<span class="marke geplant">● ${wuensche.length === 1 ? esc(wuensche[0].name) : wuensche.length + ' geplant'}</span>` : '',
      rein.length ? `<span class="marke rein">+ ${R.euroRund(rein.reduce((a, e) => a + (Number(e.betrag) || 0), 0))}</span>` : ''
    ].filter(Boolean).join('');
    const extra = marken ? `<span class="marken">${marken}</span>` : '';
    const jahr = R.ymTeile(m.monat).monat === 1 ? ` ${R.ymTeile(m.monat).jahr}` : '';
    return `<button class="jahr-zeile ${m.zusaetzlich.length ? 'gross' : ''}" data-a="zu-monat" data-wert="${m.monat}" aria-label="${esc(R.MONATE_LANG[R.ymTeile(m.monat).monat - 1] + jahr)}: ${R.euroRund(m.summe)}${m.zusaetzlich.length ? ', zusätzlich ' + esc(m.zusaetzlich.map((x) => x.text).join(', ')) : ''}">
      <span class="mon">${m.name}</span><span class="mitte"><span class="jahr-balken">${teile}</span>${extra}</span><span class="summe">${m.summe > 0 ? rausZ(m.summe, true) : R.euroRund(0)}</span></button>`;
  }).join('');
  const legende = fixKats().map((k) => `<span><i class="punkt" style="background:${k.farbe}"></i>${esc(k.name)}</span>`).join('');
  const leer = !z.daten.fixkosten.length ? '<div class="leerzustand">Noch keine Fixkosten. Trage sie in der Monatsansicht ein.</div>' : '';
  return `<p class="hinweistext">Fixkosten pro Monat, so wie sie wirklich abgebucht werden. Antippen zeigt den Monat mit allen Einzelheiten.</p>
    <section class="karte" style="padding:12px 14px;gap:6px">${leer || zeilen}</section><div class="legende-zeile">${legende}</div>`;
}

function verlaufAnsicht() {
  return `<p class="hinweistext">Jede Buchung zeigt den Stand vorher und nachher. Vertippt? Hier rückgängig machen oder ändern.</p>${vfKopf()}<div id="vf-liste">${verlaufListe()}</div>`;
}
function verlaufListe() {
  const alle = R.verlaufMitStand(z.daten);
  const filtert = vfAktiv();
  const eintraege = filtert ? R.verlaufFiltern(alle, z.daten, z.vf) : alle;
  const tage = new Map();
  for (const e of eintraege) { const t = e.zeit.slice(0, 10); if (!tage.has(t)) tage.set(t, []); tage.get(t).push(e); }
  const h = heute();
  const gestern = R.datumText(new Date(Date.now() - 864e5));
  const tagName = (t) => {
    if (t === h) return 'Heute';
    if (t === gestern) return 'Gestern';
    const d = new Date(t + 'T12:00:00');
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  };
  let teile = '';
  let anzahl = 0;
  const grenze = z.verlaufAlle || filtert ? Infinity : 60;
  for (const [t, liste] of tages(tage)) {
    if (anzahl >= grenze) break;
    anzahl += liste.length;
    teile += `<div class="tag-titel">${esc(tagName(t))}</div><section class="karte verlauf">${liste.map((e) => {
      const kat = R.kategorie(z.daten, e.kategorieId);
      // v26: heute geht beides – ändern (z. B. vertippt, Betrag nachtragen) und rückgängig
      const knopf = t === h
        ? `<span class="eintrag-knoepfe"><button class="knopf klein leise" data-a="buchung" data-id="${esc(e.id)}">Ändern</button><button class="knopf klein akzent" data-a="buchung-weg" data-id="${esc(e.id)}">Rückgängig</button></span>`
        : `<button class="knopf klein leise" data-a="buchung" data-id="${esc(e.id)}">Ändern</button>`;
      const geteilt = e.gesamt ? `<span class="geteilt">geteilt${e.teiltMit ? ' mit ' + esc(e.teiltMit) : ''} · gesamt ${R.euro(e.gesamt)} · ${e.zurueckErhalten ? '✓ zurückbekommen' : R.euro(Math.round((e.gesamt - e.betrag) * 100) / 100) + ' offen'}</span>` : '';
      return `<div class="eintrag"><div class="t"><b>${esc(kat ? kat.name : 'Unbekannt')} · ${betragHtml(e, rausZ(e.betrag))}</b><span>${esc(e.zeit.slice(11, 16))} · ${esc(e.ort || 'ohne Ort')} · ${R.euro(e.vorher, false)} → ${R.euro(e.nachher)}</span>${geteilt}</div>${knopf}</div>`;
    }).join('')}</section>`;
  }
  if (filtert) {
    const summe = eintraege.reduce((a, e) => a + (Number(e.betrag) || 0), 0);
    const kopf = `<div class="vf-ergebnis" role="status"><span>${eintraege.length === 1 ? '1 Buchung' : eintraege.length + ' Buchungen'} · ${rausZ(summe)}</span><button class="knopf klein leise" data-a="vf-leer">Filter löschen</button></div>`;
    return kopf + (eintraege.length ? teile : '<section class="karte"><div class="leerzustand">Keine Buchung passt zu deiner Suche.</div></section>');
  }
  if (!eintraege.length) teile = `<section class="karte"><div class="leerzustand">Noch keine Buchungen.<br>Tippe unten rechts auf ＋ oder buche über ein Widget auf dem Homescreen.</div><button class="knopf haupt" data-a="eintragen">${ICON.plus} Ausgabe eintragen</button></section>`;
  else if (!z.verlaufAlle && eintraege.length > anzahl) teile += '<button class="knopf leise" data-a="verlauf-alle">Ältere Buchungen anzeigen</button>';

  // Keine Ausgaben: Gehalt und Sparkonto der letzten Monate
  const keine = [];
  const g = gehalt();
  for (let i = 0; i < 3; i++) {
    const s = R.ymPlus(heuteYm(), -i);
    if (s < z.daten.einstellungen.startMonat) break;
    for (const sp of z.daten.sparraten) {
      const tag = Math.min(sp.tag || 1, R.tageImMonat(s));
      const datum = s + '-' + R.zweistellig(tag);
      const istRk = sp.art === 'ruecklage';
      const art = R.kontoArt(sp);
      // v26: vor dem Tag, an dem der Stand eingetragen wurde, kennt die App den Stand nicht
      const standDanach = (d2) => art === 'extern' || (sp.standDatum && d2 < sp.standDatum) ? '' : ` · Stand danach ${R.euroRund(istRk ? R.ruecklageStand(z.daten, d2) : R.sparStand(sp, d2, z.daten))}`;
      const farbe = art === 'extern' ? 'var(--extern)' : art === 'ruecklage' ? 'var(--ruecklage)' : 'var(--spar)';
      if (datum <= h && Number(sp.betrag) > 0) keine.push({ farbe, titel: `Aufs ${sp.name}`, wert: sp.offen ? offenZahl(sp) : rausZ(sp.betrag), text: `${tag}. ${R.MONATE_KURZ[R.ymTeile(s).monat - 1]}${standDanach(datum)}` });
      for (const u of R.uebertraegeIm(z.daten, s, sp.id)) if (u.datum <= h) keine.push({ farbe, titel: `Übertrag aufs ${sp.name}`, wert: rausZ(u.betrag) + ' extra', text: `${Number(u.datum.slice(8))}. ${R.MONATE_KURZ[R.ymTeile(s).monat - 1]}${standDanach(u.datum)}` });
      if (istRk) {
        for (const f of z.daten.fixkosten.filter((x) => x.wieOft !== 'monatlich' && R.wirdAbgebuchtIm(x, s))) {
          const d2 = s + '-' + R.zweistellig(R.abbuchungsTag(f, s));
          if (d2 <= h) keine.push({ farbe: 'var(--spar)', titel: f.name, wert: rausZ(R.eigenerBetrag(f, s)) + ' aus der Rücklage', text: `${Number(d2.slice(8))}. ${R.MONATE_KURZ[R.ymTeile(s).monat - 1]}${standDanach(d2)}` });
        }
      }
    }
    for (const e of weitereEinnahmen().filter((x) => R.einnahmeAktivIm(x, s))) {
      const w = R.einnahmeIm(e, s);
      if (w.zaehlt) keine.push({ farbe: 'var(--akzent)', titel: e.name, wert: e.offen && !w.angekommen ? offenZahl(e, false) : reinZ(w.betrag, true), text: w.angekommen ? 'angekommen' : e.offen ? 'Betrag offen · zählt vorsichtig mit' : 'fest eingeplant' });
    }
    if (g) {
      const w = R.einnahmeIm(g, s);
      keine.push({ farbe: 'var(--akzent)', titel: `${g.name} ${monatsName(s)}`, wert: reinZ(w.betrag, true, w.geschaetzt ? '≈ ' : ''), text: w.geschaetzt ? (s + '-' + R.zweistellig(R.ankunftsTag(g, s)) > h ? `kommt am ${R.ankunftsTag(g, s)}.${R.ymTeile(s).monat}. (geschätzt) · antippen zum Korrigieren` : 'automatisch eingetragen (geschätzt) · antippen zum Korrigieren') : (w.betrag !== w.schaetzung ? `erwartet ≈ ${R.euroRund(w.schaetzung)}, von dir korrigiert` : 'von dir bestätigt'), monat: s });
    }
  }
  const keineHtml = keine.length ? `<div class="tag-titel">Keine Ausgaben</div><section class="karte verlauf">${keine.map((k) => {
    const inhalt = `<i class="punkt" style="background:${k.farbe}"></i><span class="t"><b>${esc(k.titel)}${k.wert ? ' · ' + k.wert : ''}</b><span>${esc(k.text)}</span></span>`;
    return k.monat ? `<button class="eintrag zeile ${z.blinkGehalt === k.monat ? 'blinken' : ''}" style="padding-left:0" data-a="gehalt" data-monat="${k.monat}">${inhalt}</button>` : `<div class="eintrag">${inhalt}</div>`;
  }).join('')}</section>` : '';

  return `${teile}${keineHtml}`;
}
function tages(m) { return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)); }

// ---------- Potenzielle Ausgaben ----------
function wunschStatus(w, r, s) {
  if (!r) return { text: '', art: '' };
  const mon = (m) => R.MONATE_LANG[R.ymTeile(m).monat - 1];
  if (r.offen) {
    if (r.sofort) return { text: 'Kann jetzt gekauft werden', art: 'gut' };
    if (r.fruehestens) return { text: `ab ≈ ${mon(r.fruehestens)} leistbar`, art: '' };
    return { text: 'In den nächsten 2 Jahren nicht leistbar', art: 'warn' };
  }
  const teile = [];
  let art = 'gut';
  if (r.budgetUeber > 0) { teile.push(`Budget ${r.kategorie.name} reicht nicht, ≈ ${R.euroRund(r.budgetUeber)} kommen aus „Frei“`); art = 'hinweis'; }
  if (r.fehlt > 0 && hinweisAn('geplant')) { teile.push(`Reicht im ${mon(r.monat)} nicht, es fehlen ≈ ${R.euroRund(r.fehlt)}` + (r.fruehestens ? ` · frühestens im ${mon(r.fruehestens)}` : '')); art = 'warn'; }
  if (!teile.length) teile.push(`Passt in den ${mon(r.monat)}`);
  return { text: teile.join(' · '), art };
}

function geplantHtml(s, pruefung) {
  const istHeute = s === heuteYm();
  const liste = R.offeneWuensche(z.daten).filter((w) => w.monat === s || (istHeute && (!w.monat || w.monat < s)));
  const zeilen = liste.map((w) => wunschZeile(w, pruefung, s)).join('');
  const alle = R.offeneWuensche(z.daten).length;
  return `<section class="karte geplant-karte">
    <div class="geplant-kopf"><span class="t"><b>Geplant</b><small>potenzielle Ausgaben, noch nicht fest</small></span>${liste.length ? `<span class="kat-summe">${rausZ(liste.reduce((a, w) => a + R.preisBis(w), 0), true)}</span>` : ''}</div>
    ${zeilen}
    <button class="knopf akzent" data-a="wunsch-neu" data-monat="${s}">${ICON.plus} Potenzielle Ausgabe planen</button>
    ${alle ? `<button class="knopf leise" data-a="geplant-alle">Alle geplanten Ausgaben (${alle}) – auch spätere Monate</button>` : ''}
  </section>`;
}
function wunschZeile(w, pruefung, s) {
  const st = wunschStatus(w, pruefung[w.id], s);
  const k = w.kategorieId ? R.kategorie(z.daten, w.kategorieId) : null;
  const wann = w.monat ? (w.monat < s ? `geplant für ${R.MONATE_KURZ[R.ymTeile(w.monat).monat - 1]}` : '') : 'Monat noch offen';
  const quelle = k ? `aus Budget ${mitEmoji(k)}${k.name}` : 'aus „Frei“';
  return `<button class="posten" data-a="wunsch" data-id="${esc(w.id)}" aria-label="${esc(w.name)} bearbeiten"><span class="t"><span class="n">${esc((w.emoji ? w.emoji + ' ' : '') + w.name)}</span><small>${esc([wann, quelle].filter(Boolean).join(' · '))}</small>${st.text ? `<small class="status ${st.art}">${esc(st.text)}</small>` : ''}</span><span class="b"><span class="minus-zahl">− ${esc(R.preisText(w))}</span></span>${PFEIL}</button>`;
}

// ---------- Weitere Einnahmen ----------
const EINNAHME_VORSCHLAEGE = ['💼 Nebenjob', '🧑‍💼 Selbstständigkeit', '🎁 Geschenk', '🤝 Spende', '🏷️ Verkauf', '↩️ Rückerstattung', '⭐ Bonus'];
function weitereEinnahmen() { const g = gehalt(); return (z.daten.einnahmen || []).filter((e) => e !== g); }
function betragText(e) {
  const b = e.betrag;
  return b && typeof b === 'object' && Number(b.bis) > Number(b.von) ? R.euro(Number(b.von), false) + '–' + R.euro(Number(b.bis)) : R.euro(R.schaetzung(e));
}
function einnahmenHtml(s) {
  const g = gehalt();
  const gw = g ? R.einnahmeIm(g, s) : null;
  const gehaltKarte = g ? `<section class="karte geplant-karte einnahmen-karte"><button class="posten" style="border-top:0" data-a="gehalt" data-monat="${s}" aria-label="Gehalt ändern"><span class="t"><span class="n">${esc(g.name)}</span><small>jeden Monat · ${gw.geschaetzt ? 'geschätzt, antippen zum Korrigieren' : 'eingetragen'}</small></span><span class="b plus">+ ${R.euroRund(gw.betrag)}</span>${PFEIL}</button></section>` : '';
  return gehaltKarte + rueckzahlungenHtml() + weitereEinnahmenHtml(s);
}
function rueckzahlungenHtml() {
  // v27: pro Person zusammengefasst, mit „Alles bekommen“
  const personen = R.personenAbrechnung(z.daten);
  if (!personen.length) return '';
  const summe = personen.reduce((a, p) => a + p.summe, 0);
  const zeile = (b) => { const kat = R.kategorie(z.daten, b.kategorieId); return `<div class="posten rueck-zeile"><span class="t"><span class="n">${esc(b.ort || (kat ? kat.name : 'Ausgabe'))} · ${reinZ(Math.round((b.gesamt - b.betrag) * 100) / 100)}</span><small>${esc(Number(b.zeit.slice(8, 10)) + '.' + Number(b.zeit.slice(5, 7)) + '. · gesamt ' + R.euro(b.gesamt))}</small></span><button class="knopf klein leise" data-a="rueck-erhalten" data-id="${esc(b.id)}" aria-label="Diese Rückzahlung bekommen">✓</button></div>`; };
  return `<section class="karte geplant-karte einnahmen-karte">
    <div class="geplant-kopf"><span class="t"><b>Bekommst du noch zurück</b><small>aus geteilten Ausgaben · zählt nicht als Einnahme</small></span><span class="kat-summe plus-zahl">+ ${R.euro(Math.round(summe * 100) / 100)}</span></div>
    ${personen.map((p) => `<div class="person-kopf"><span class="t"><b>${esc(p.name)}</b><small>${p.buchungen.length === 1 ? '1 Ausgabe' : p.buchungen.length + ' Ausgaben'} · ${reinZ(p.summe)}</small></span><button class="knopf klein akzent" data-a="rueck-alle" data-name="${esc(p.name)}">✓ Alles bekommen</button></div>${p.buchungen.map(zeile).join('')}`).join('')}
  </section>`;
}
function weitereEinnahmenHtml(s) {
  const liste = weitereEinnahmen().filter((e) => R.einnahmeAktivIm(e, s));
  if (!liste.length) return `<button class="knopf leise einnahme-knopf" data-a="einnahme-neu" data-monat="${s}">${ICON.plus} Weitere Einnahme eintragen</button>`;
  const zeilen = liste.map((e) => {
    const w = R.einnahmeIm(e, s);
    const wie = e.wieOft === 'monatlich' ? 'jeden Monat' : 'einmalig';
    const status = w.angekommen ? 'angekommen' : w.zaehlt ? 'fest eingeplant' : 'nur geplant, zählt erst, wenn es da ist';
    return `<button class="posten ${w.zaehlt ? '' : 'grau'}" data-a="einnahme" data-id="${esc(e.id)}" data-monat="${s}" aria-label="${esc(e.name)} bearbeiten"><span class="t"><span class="n">${esc(e.name)}</span><small>${wie} · ${status}</small></span><span class="b plus">${e.offen && !w.angekommen ? betragHtml(e, '', false) : `+ ${w.angekommen ? R.euro(w.betrag) : esc(betragText(e))}`}</span>${PFEIL}</button>`;
  }).join('');
  const fest = liste.reduce((a, e) => { const w = R.einnahmeIm(e, s); return a + (w.zaehlt ? w.betrag : 0); }, 0);
  const geplantSumme = liste.reduce((a, e) => { const w = R.einnahmeIm(e, s); return a + (w.zaehlt ? 0 : w.betrag); }, 0);
  return `<section class="karte geplant-karte einnahmen-karte">
    <div class="geplant-kopf"><span class="t"><b>Weitere Einnahmen</b><small>${geplantSumme ? `dazu + ${R.euroRund(geplantSumme)} nur geplant` : 'neben dem Gehalt'}</small></span><span class="kat-summe plus">+ ${R.euroRund(fest)}</span></div>
    ${zeilen}
    <button class="knopf akzent" data-a="einnahme-neu" data-monat="${s}">${ICON.plus} Einnahme eintragen</button>
  </section>`;
}

function preisAusText(t) {
  const teile = String(t || '').split(/\s*[–-]\s*(?=\d)/).map((x) => zahl(x));
  if (teile.length === 2 && !isNaN(teile[0]) && !isNaN(teile[1]) && teile[1] > teile[0]) return { von: teile[0], bis: teile[1] };
  return teile.length === 1 ? teile[0] : NaN;
}

// ---------- Ebenen (Seiten und Sheets) ----------
let gezeichneteEbenen = [];
const rollFlaeche = (k) => (k && k.matches('.seite') ? k : k && k.querySelector('.sheet'));
function renderEbenen() {
  const e = $ebene();
  document.body.style.overflow = z.ebenen.length ? 'hidden' : '';
  // v25: Scroll-Stand merken – beim Neu-Zeichnen derselben Seite springt sie nicht mehr nach oben
  const stand = [...e.children].map((k) => { const r = rollFlaeche(k); return r ? r.scrollTop : 0; });
  e.innerHTML = z.ebenen.map((eb, i) => ebeneHtml(eb, i)).join('') + toastHtml();
  z.ebenen.forEach((eb, i) => { if (gezeichneteEbenen[i] === eb && stand[i]) { const r = rollFlaeche(e.children[i]); if (r) r.scrollTop = stand[i]; } });
  gezeichneteEbenen = z.ebenen.slice();
}

function ebeneHtml(eb, i) {
  const f = EBENEN[eb.art];
  if (!f) return '';
  // spätere Ebenen liegen immer über früheren
  return f(eb, i).replace(/class="(seite|schleier)"/, (m) => `${m} style="z-index:${20 + i * 2}"`);
}

function sheet(inhalt, titel) {
  return `<div class="schleier" data-a="schliessen-schleier"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(titel)}"><div class="griff"></div>${inhalt}</div></div>`;
}
function seite(titel, inhalt) {
  return `<div class="seite" role="dialog" aria-modal="true" aria-label="${esc(titel)}"><div class="seite-innen">
    <div class="seite-kopf"><button class="knopf rund" data-a="schliessen" aria-label="Zurück">${ICON.zurueck}</button><h2>${esc(titel)}</h2></div>${inhalt}</div></div>`;
}
// ---------- Eintragen: Umschalter und Übertrag ----------
function eintragenWahl(art) {
  return `<div class="ansicht-wahl vier">${[['ausgabe', '− Ausgabe'], ['einnahme', '+ Einnahme'], ['uebertrag', '⇄ Übertrag'], ['abo', '↻ Abo']].map(([w, t]) => `<button data-a="et-art" data-wert="${w}" aria-pressed="${art === w}">${t}</button>`).join('')}</div>`;
}
function alleKonten() { return [R.ruecklage(z.daten)].concat(R.sparratenNormal(z.daten), R.sparratenExtern(z.daten)).filter(Boolean); }
function uebertragHtml(eb) {
  const e = eb.entwurf;
  const konten = alleKonten();
  const ziel = konten.find((k) => k.id === e.kontoId);
  const monatlich = e.oft === 'monatlich';
  const ziele = konten.map((k) => `<button class="chip" data-a="et-ziel" data-wert="${esc(k.id)}" aria-pressed="${e.kontoId === k.id}">${esc(k.name || 'Rücklagenkonto')}</button>`).join('')
    + `<button class="chip" data-a="et-konto-neu">${ICON.plus} Neues Konto</button>`;
  const art = ziel ? R.kontoArt(ziel) : null;
  const hinweis = !ziel ? '' : art === 'extern' ? `Das Geld geht aufs ${esc(ziel.name)} und wird dort ausgegeben. „Frei“ sinkt.`
    : art === 'ruecklage' ? 'Das Geld bleibt deins: Die Rücklage wächst, „Frei“ sinkt.' : `Das Geld bleibt deins: Der Stand auf ${esc(ziel.name)} wächst, „Frei“ sinkt.`;
  const ersetzt = monatlich && ziel && Number(ziel.betrag) > 0 ? `<p class="hinweistext">Ersetzt den bisherigen Übertrag von ${R.euro(ziel.betrag)} am ${ziel.tag || 1}.</p>` : '';
  return sheet(`${eintragenWahl('uebertrag')}
    <div class="betrag-gross"><span>→</span><input id="et-betrag" class="eingabe" inputmode="decimal" data-feld="betragText" value="${esc(e.betragText)}" placeholder="0" aria-label="Betrag in Euro"><span>€</span></div>
    <div class="label">Auf welches Konto?</div><div class="chips">${ziele}</div>
    ${hinweis ? `<p class="hinweistext">${hinweis}</p>` : ''}
    <div class="label">Wie oft?</div>
    <div class="wahl zwei-sp">${wahlKnopf('et-oft', 'einmalig', 'einmalig', !monatlich)}${wahlKnopf('et-oft', 'monatlich', 'jeden Monat', monatlich)}</div>
    ${monatlich ? `<div class="feld"><label for="et-tag">Am Tag</label><input id="et-tag" class="eingabe" inputmode="numeric" data-feld="tagText" value="${esc(e.tagText)}"></div>${ersetzt}`
      : `<div class="feld"><label for="et-datum">Datum</label><input id="et-datum" class="eingabe" type="date" data-feld="datum" value="${esc(e.datum)}"></div>`}
    ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
    <div class="knopfreihe"><button class="knopf leise" data-a="schliessen">Abbrechen</button><button class="knopf haupt breit" data-a="et-speichern">Übertrag eintragen</button></div>`, 'Eintragen');
}
async function uebertragSpeichern(eb, betrag) {
  const e = eb.entwurf;
  const konto = alleKonten().find((k) => k.id === e.kontoId);
  if (!konto) { eb.fehler = 'Bitte ein Konto wählen oder ein neues anlegen.'; renderEbenen(); return; }
  const name = konto.name || 'Rücklagenkonto';
  if (e.oft === 'monatlich') {
    const tag = zahl(e.tagText);
    if (isNaN(tag) || tag < 1 || tag > 31) { eb.fehler = 'Der Tag muss zwischen 1 und 31 liegen.'; renderEbenen(); return; }
    z.ebenen.pop();
    const alt = kopie(konto);
    await aendern((d) => {
      const k = d.sparraten.find((x) => x.id === konto.id);
      const art = R.kontoArt(k);
      // Stand bis heute festhalten, damit die neue Rate nicht rückwirkend zählt
      if (art === 'ruecklage') Object.assign(k, { stand: R.ruecklageStand(d, heute()), standDatum: heute(), standZeit: new Date().toISOString() });
      else if (art === 'sparen') Object.assign(k, { stand: R.sparStand(k, heute(), d), standDatum: heute(), standZeit: new Date().toISOString() });
      Object.assign(k, { betrag, tag: Math.round(tag) }); delete k.offen;
    }, { text: `Jeden Monat ${R.euro(betrag)} aufs ${name}`, rueckgaengig: (d) => { const i = d.sparraten.findIndex((x) => x.id === alt.id); if (i >= 0) d.sparraten[i] = alt; } });
    return;
  }
  if (!e.datum) { eb.fehler = 'Bitte ein Datum wählen.'; renderEbenen(); return; }
  z.ebenen.pop();
  const id = D.neueId('ue');
  await aendern((d) => { if (!Array.isArray(d.uebertraege)) d.uebertraege = []; d.uebertraege.push({ id, datum: e.datum, betrag, kontoId: konto.id, angelegt: new Date().toISOString() }); },
    { text: `${R.euro(betrag)} aufs ${name} übertragen`, rueckgaengig: (d) => { d.uebertraege = d.uebertraege.filter((x) => x.id !== id); } });
}
// ---------- Gehalt bestätigen ----------
// Welcher Monat wartet auf „Gehalt da?“: erst der Vormonat, dann der laufende ab dem Ankunftstag
function offenesGehalt() {
  const g = gehalt();
  if (!g || !(R.schaetzung(g) > 0)) return null;
  const h = heuteYm(), vm = R.ymPlus(h, -1);
  if (vm >= z.daten.einstellungen.startMonat && !R.gehaltBestaetigt(g, vm)) return vm;
  if (Number(heute().slice(8)) >= R.ankunftsTag(g, h) && !R.gehaltBestaetigt(g, h)) return h;
  return null;
}
function lernHinweis(g) {
  const st = R.gehaltStatistik(g, 3);
  if (DI.schaetzenAn(z.daten)) return null; // v27: mit Dienst-Schätzung rechnet die App jeden Monat einzeln
  if (st.anzahl < 3 || Math.abs(st.schnitt - R.schaetzung(g)) < 1) return null;
  return st;
}
function gehaltFrageKarte() {
  const s = offenesGehalt(); if (!s) return '';
  const g = gehalt(); const w = R.einnahmeIm(g, s);
  return `<section class="karte gehalt-frage"><div class="gf-kopf"><span class="gf-symbol">💶</span><span class="t"><b>${esc(g.name)} ${esc(monatsName(s))} da?</b><small>geschätzt ≈ ${R.euroRund(w.schaetzung)} · am ${R.ankunftsTag(g, s)}.${R.ymTeile(s).monat}. · Netto schwankt, kurz bestätigen</small></span></div>
    <div class="zwei"><button class="knopf haupt" data-a="ge-stimmt" data-monat="${s}">✓ Stimmt</button><button class="knopf" data-a="ge-anders" data-monat="${s}">Anderer Betrag</button></div></section>`;
}

// ---------- Einzelne Buchung teilen ----------
// Gespeichert wird: betrag = dein Anteil (belastet Budget und „Frei“), gesamt = was du bezahlt hast,
// teiltMit = wer dir den Rest zurückzahlt, zurueckErhalten = ob das Geld schon da ist.
const ANTEILE = [['1/2', '½', .5], ['1/3', '⅓', 1 / 3], ['1/4', '¼', .25], ['eigen', 'Betrag', null]];
function teilRechnung(t) {
  const gesamt = zahl(t.betragText);
  if (!t.geteilt || isNaN(gesamt) || gesamt <= 0) return null;
  const a = ANTEILE.find((x) => x[0] === t.anteil) || ANTEILE[0];
  const mein = a[2] != null ? Math.round(gesamt * a[2] * 100) / 100 : zahl(t.meinText);
  if (isNaN(mein) || mein <= 0 || mein >= gesamt) return { gesamt, fehler: 'Dein Anteil muss kleiner als der Gesamtbetrag sein.' };
  return { gesamt, mein, rest: Math.round((gesamt - mein) * 100) / 100 };
}
function teilHinweis(t) {
  const r = teilRechnung(t);
  if (!r) return t.geteilt ? 'Trag oben den Gesamtbetrag ein, den du bezahlt hast.' : '';
  if (r.fehler) return r.fehler;
  return `Du zahlst ${R.euro(r.gesamt)}. Belastet wird nur dein Anteil: ${R.euro(r.mein)}. ${(t.teiltMit || '').trim() || 'Die andere Person'} zahlt dir ${R.euro(r.rest)} zurück.`;
}
function teilenHtml(t) {
  const an = !!t.geteilt;
  return `<div class="wahl zwei-sp">${wahlKnopf('tl-an', '0', 'Allein bezahlt', !an)}${wahlKnopf('tl-an', '1', 'Geteilt', an)}</div>
    ${an ? `<div class="teil-box ${Date.now() - (t.teilAuf || 0) < 500 ? 'oeffnet' : ''}"><div class="label">Dein Anteil</div>
      <div class="chips">${ANTEILE.map(([w, txt]) => `<button class="chip" data-a="tl-anteil" data-wert="${w}" aria-pressed="${(t.anteil || '1/2') === w}">${txt}</button>`).join('')}</div>
      ${t.anteil === 'eigen' ? `<div class="feld"><label for="tl-mein">Dein Anteil in €</label><input id="tl-mein" class="eingabe" inputmode="decimal" data-feld="meinText" data-teilen="1" value="${esc(t.meinText || '')}" placeholder="z. B. 15"></div>` : ''}
      <div class="feld"><label for="tl-wer">Wer zahlt dir den Rest zurück?</label><input id="tl-wer" class="eingabe" data-feld="teiltMit" data-teilen="1" value="${esc(t.teiltMit || '')}" placeholder="z. B. Anna"></div>
      <p class="hinweistext" id="tl-hinweis">${esc(teilHinweis(t))}</p></div>` : ''}`;
}
// Felder für eine bestehende Buchung vorbelegen
function teilEntwurf(b) {
  if (!b.gesamt) return { geteilt: false, anteil: '1/2', meinText: '', teiltMit: '' };
  const a = ANTEILE.find((x) => x[2] != null && Math.abs(Math.round(b.gesamt * x[2] * 100) / 100 - b.betrag) < 0.006);
  return { geteilt: true, anteil: a ? a[0] : 'eigen', meinText: a ? '' : R.euro(b.betrag, false), teiltMit: b.teiltMit || '' };
}
const offeneRueckzahlungen = () => z.daten.buchungen.filter((b) => b.gesamt && !b.zurueckErhalten);

// ---------- Geteilte Kosten ----------
// Zeile unter einer Fixkoste: Gesamtbetrag, wer den Rest zurückzahlt, von welchem Konto abgebucht wird
function geteiltText(f) {
  const anteil = f.meinAnteil == null ? 100 : Number(f.meinAnteil);
  const teile = [];
  if (anteil < 100) {
    const rest = (Number(f.betrag) || 0) - R.eigenerBetrag(f);
    teile.push(`gesamt ${R.euro(f.betrag)} · dein Anteil ${R.euro(Math.round(R.eigenerBetrag(f) * 100) / 100)} (${String(Math.round(anteil * 10) / 10).replace('.', ',')} %)`);
    if (f.teiltMit) teile.push(`↩ ${f.teiltMit} überweist dir ${R.euro(Math.round(rest * 100) / 100)}${f.erstattungTag ? ' am ' + f.erstattungTag + '.' : ''}`);
  }
  if (f.konto) teile.push(`Abbuchung: ${f.konto}`);
  return teile;
}
function fkAnteil(f) {
  // Anteil in % aus dem eingetragenen Euro-Betrag; leer = 100 %
  if (!String(f.meinText || '').trim()) return 100;
  return E.anteilAusEuro(zahl(f.betragText || String(f.betrag || '')), f.meinText, zahl);
}
function geteiltFelder(f) {
  const betrag = zahl(f.betragText || String(f.betrag || ''));
  const anteil = fkAnteil(f);
  if (!String(f.meinText || '').trim()) return '<p class="hinweistext">Teilst du das mit jemandem? Trag ein, wie viel du selbst zahlst, z. B. 525 €. Die Prozent rechnet die App aus, gerechnet wird nur mit deinem Teil.</p>';
  if (anteil === null) return `<p class="hinweistext fehlertext">Dein Teil muss mehr als 0 € und höchstens ${!isNaN(betrag) && betrag > 0 ? R.euro(betrag) : 'der Betrag'} sein.</p>`;
  if (anteil >= 100) return '<p class="hinweistext">Du zahlst alles selbst.</p>';
  const mein = zahl(f.meinText);
  return `<p class="hinweistext">= ${String(Math.round(anteil * 10) / 10).replace('.', ',')} % · gesamt ${R.euro(betrag)} · du zahlst ${R.euro(mein)} · zurück bekommst du ${R.euro(Math.round((betrag - mein) * 100) / 100)}. Belastet wird nur dein Anteil.</p>
    <div class="zwei">
      <div class="feld"><label for="fk-teilt">Wer zahlt dir den Rest?</label><input id="fk-teilt" class="eingabe" data-feld="teiltMit" value="${esc(f.teiltMit || '')}" placeholder="z. B. Anna"></div>
      <div class="feld"><label for="fk-etag">Überweist am Tag</label><input id="fk-etag" class="eingabe" inputmode="numeric" data-feld="erstattungTag" value="${esc(f.erstattungTag || '')}" placeholder="z. B. 5"></div>
    </div>`;
}
const geteiltHtml = (f) => geteiltText(f).map((t) => `<span class="geteilt">${esc(t)}</span>`).join('');

// ---------- BETA: Zahlungen erkennen ----------
// v30: Android 13+ sperrt den Zugriff für Apps, die nicht aus einem App-Store kommen. Anleitung zum Freigeben.
function erSperreHtml(e) {
  const frei = e.freigegeben === true;
  const schritt = (n, titel, text, knopf, erledigt) => `<li class="er-schritt ${erledigt ? 'erledigt' : ''}"><span class="er-nr" aria-hidden="true">${erledigt ? '✓' : n}</span><span class="t"><b>${titel}</b><span>${text}</span>${knopf || ''}</span></li>`;
  return `<div class="er-sperre">
    <p class="hinweistext"><b>Android blockiert den Zugriff zuerst.</b> Die App kommt nicht aus dem Play Store, deshalb meldet Android „App wurde Zugriff verweigert“. So gibst du ihn frei:</p>
    <ol class="er-schritte">
      ${schritt(1, 'Einmal versuchen', 'In den Einstellungen „Finanzen“ einschalten. Kommt „App wurde Zugriff verweigert“: „Schließen“ tippen und zurückkommen. Erst danach bietet Android die Freigabe an.', '', frei)}
      ${schritt(2, 'Eingeschränkte Einstellungen zulassen', 'In den App-Infos oben rechts ⋮ tippen → „Eingeschränkte Einstellungen zulassen“ → mit PIN oder Fingerabdruck bestätigen.', frei ? '' : '<button class="knopf akzent" data-a="er-appinfo">App-Infos öffnen</button>', frei)}
      ${schritt(3, 'Zugriff einschalten', 'Nochmal in die Einstellungen, „Finanzen“ einschalten, „Zulassen“ und zurück in die App.', '<button class="knopf haupt" data-a="er-erlauben">Zugriff erlauben</button>', false)}
    </ol>
    ${frei ? '<p class="hinweistext er-ok">✓ Eingeschränkte Einstellungen sind zugelassen – jetzt nur noch Schritt 3.</p>'
      : '<p class="hinweistext">Kein ⋮ in den App-Infos? Dann zuerst Schritt 1 machen. Fehlt es danach immer noch: Android-Einstellungen → Apps → „Finanzen“ öffnen, dort ist es oben rechts.</p>'}
    <p class="hinweistext">Google rät, das nur bei Apps zu erlauben, deren Herkunft du kennst. Die Benachrichtigungen bleiben auf diesem Handy.</p>
  </div>`;
}
function erkennungKarte() {
  const e = z.erkennung;
  if (!e) { D.erkennungStatus().then((x) => { z.erkennung = x; renderEbenen(); }); return '<section class="karte"><div class="label">Zahlungen erkennen <span class="beta">BETA</span></div><p class="hinweistext">Lädt …</p></section>'; }
  const kopf = '<div class="label">Zahlungen automatisch erkennen <span class="beta">BETA</span></div>';
  const info = '<p class="hinweistext">Die App liest Benachrichtigungen von PayPal, Google Wallet oder deiner Banking-App mit und schlägt daraus Buchungen vor. Sie bucht nie selbst – du bestätigst jede Zahlung. Alles bleibt auf diesem Handy. <b>Beta:</b> Die Erkennung wird noch erprobt, nicht jede Zahlung wird gefunden.</p>';
  if (!e.verfuegbar) return `<section class="karte">${kopf}${info}<p class="hinweistext">Nur in der Android-App verfügbar.</p></section>`;
  const apps = (e.apps || []).map((a) => `<button class="chip" data-a="er-app" data-wert="${esc(a.paket)}" data-name="${esc(a.name)}" data-an="${a.an ? 1 : 0}" aria-pressed="${!!a.an}">${a.an ? '✓ ' : ''}${esc(a.name)}</button>`).join('');
  return `<section class="karte">${kopf}${info}
    <div class="wahl zwei-sp">${wahlKnopf('er-an', '1', 'Ein', !!e.an)}${wahlKnopf('er-an', '0', 'Aus', !e.an)}</div>
    ${e.an ? `<div class="er-status">${e.erlaubt ? '<span class="plus-zahl">✓</span> Zugriff auf Benachrichtigungen erlaubt' : '<span class="minus-zahl">!</span> Zugriff auf Benachrichtigungen fehlt noch'}</div>
      ${e.erlaubt ? '' : e.eingeschraenkt ? erSperreHtml(e) : '<button class="knopf haupt" data-a="er-erlauben">In den Einstellungen erlauben</button><p class="hinweistext">Dort „Finanzen“ einschalten und zurückkommen.</p>'}
      ${e.meldungen === false ? '<p class="hinweistext">Ohne Erlaubnis für Mitteilungen erscheinen erkannte Zahlungen nur hier in der App.</p>' : ''}
      <div class="label">Diese Apps mitlesen</div>
      <div class="chips">${apps || '<span class="klein">Noch keine Zahlungs-App gefunden. Sobald eine App einen Betrag meldet, erscheint sie hier.</span>'}</div>
      <p class="hinweistext">Andere Apps, die Beträge melden, erscheinen hier automatisch und sind aus, bis du sie einschaltest.</p>` : ''}
  </section>`;
}
function aehnlicheBuchung(v) {
  const t = Date.parse(v.zeit);
  return z.daten.buchungen.find((b) => Math.abs((Number(b.betrag) || 0) - v.betrag) < 0.005 && Math.abs(Date.parse(b.zeit) - t) < 36 * 3600 * 1000);
}
const haendlerSchluessel = (h) => (h || '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim();
// Einmalige Überträge eines Kontos (im Konto-Fenster, mit Löschen)
function uebertragListe(kontoId) {
  if (!kontoId) return '';
  const l = (z.daten.uebertraege || []).filter((u) => u.kontoId === kontoId).sort((a, b) => (a.datum < b.datum ? 1 : -1)).slice(0, 12);
  if (!l.length) return '';
  return `<div class="label">Einmalige Überträge</div><div class="ue-liste">${l.map((u) => {
    const t = R.ymTeile(R.ymAus(u.datum));
    return `<div class="ue-zeile"><span>${Number(u.datum.slice(8))}. ${R.MONATE_KURZ[t.monat - 1]} ${t.jahr}</span><span class="r">${rausZ(u.betrag)}</span><button class="knopf klein rund leise" style="width:36px" data-a="ue-weg" data-wert="${esc(u.id)}" aria-label="Übertrag löschen">${ICON.x}</button></div>`;
  }).join('')}</div>`;
}
const KONTO_NAMEN = { sparen: ['Tagesgeld', 'Notgroschen', 'Urlaub', 'ETF-Sparplan', 'Bausparvertrag'], extern: ['Gemeinschaftskonto', 'Haushaltskonto'] };

const wahlKnopf = (aktion, wert, text, an, extra = '') => `<button data-a="${aktion}" data-wert="${esc(wert)}" aria-pressed="${!!an}" ${extra}>${esc(text)}</button>`;

// ---------- DRK-Gehaltsrechner (v24) ----------
const grZahl = (t) => { const n = zahl(t); return isNaN(n) ? 0 : n; };
// Felder, die „unbekannt“ sein dürfen (v25) und die Umrechnung Text → Zahl liegen seit v27 in drk.js
const GR_OFFEN = DRK.OFFENE_FELDER;
const grOffene = (e) => Object.keys(GR_OFFEN).filter((f) => e[f + 'Offen']);
const grEingaben = (e, modus) => DRK.eingaben(e, modus);
function grErgebnisHtml(eb) {
  const rw = DRK.rechenweg(grEingaben(eb.entwurf), eb.monat);
  const r = rw.r;
  // v27: unter jeder Zeile steht, wo die Regel zu finden ist
  const fund = (name) => { const x = rw.zeilen.find((y) => y.name === name || y.name.startsWith(name)); return x && x.fund ? `<small class="gr-fund">${esc(x.fund)}</small>` : ''; };
  const zeile = (l, w, klasse = '', f = '') => `<div class="gr-zeile ${klasse}"><span>${l}${f}</span><b>${w}</b></div>`;
  const prozent = (x) => String(Math.round(x * 10000) / 100).replace('.', ',') + ' %';
  const ab = (b) => b > 0 ? rausZ(b) : R.euro(0);
  return `<div class="label">Ergebnis ${esc(monatsName(eb.monat))}</div>
    ${zeile(`Tabellenentgelt E ${esc(eb.entwurf.eg)} Stufe ${r.stufe}${grZahl(eb.entwurf.tz) && grZahl(eb.entwurf.tz) < 100 ? ` · ${esc(eb.entwurf.tz)} %` : ''}`, R.euro(r.tabellenentgelt), '', fund('Tabellenentgelt'))}
    ${r.zulagen.map(([n, b]) => zeile(esc(n), R.euro(b), '', fund(n))).join('')}
    ${r.zuschlaege.map((x) => zeile(`${esc(x.name)} · ${String(x.stunden).replace('.', ',')} Std.`, R.euro(x.betrag), '', fund(x.name))).join('')}
    ${zeile('Brutto', R.euro(r.brutto), 'summe')}
    ${r.steuerfrei > 0 ? `<p class="hinweistext gr-mini">Davon steuerfrei (§ 3b EStG): ${R.euro(r.steuerfrei)}${r.svfrei < r.steuerfrei ? ` · beitragsfrei nur ${R.euro(r.svfrei)}` : ' · auch beitragsfrei'}</p>` : ''}
    ${zeile('Lohnsteuer', ab(r.lohnsteuer), '', fund('Lohnsteuer'))}
    ${r.soli > 0 ? zeile('Solidaritätszuschlag', ab(r.soli), '', fund('Solidaritätszuschlag')) : ''}
    ${r.kirchensteuer > 0 ? zeile('Kirchensteuer', ab(r.kirchensteuer), '', fund('Kirchensteuer')) : ''}
    ${zeile(`Krankenversicherung · ${prozent(r.satz.kv)}`, ab(r.kv), '', fund('Krankenversicherung'))}
    ${zeile(`Pflegeversicherung · ${prozent(r.satz.pv)}${r.pvz ? ' (kinderlos)' : ''}`, ab(r.pv), '', fund('Pflegeversicherung'))}
    ${zeile('Rentenversicherung · 9,3 %', ab(r.rv), '', fund('Rentenversicherung'))}
    ${zeile('Arbeitslosenversicherung · 1,3 %', ab(r.av), '', fund('Arbeitslosenversicherung'))}
    ${r.zvHinzu > 0 ? `<p class="hinweistext gr-mini">Versicherungen gerechnet aus ${R.euro(r.svBrutto)}: ${R.euro(r.zvHinzu)} der Umlage zur Zusatzversorgung zählen mit (§ 1 Abs. 1 Satz 3 und 4 SvEV).</p>` : ''}
    ${r.zvkAn > 0 ? zeile('Zusatzversorgung: dein Eigenanteil', ab(r.zvkAn), '', fund('Zusatzversorgung: dein Eigenanteil')) : ''}
    ${r.abzug > 0 ? zeile('Weitere Abzüge', ab(r.abzug)) : ''}
    ${zeile('Netto', reinZ(r.netto, false, '≈ '), 'summe netto')}
    ${(() => {
      const offene = grOffene(eb.entwurf);
      if (!offene.length) return '';
      const a = DRK.gehaltRechnen(grEingaben(eb.entwurf, 'min'), eb.monat).netto, b = DRK.gehaltRechnen(grEingaben(eb.entwurf, 'max'), eb.monat).netto;
      const an = String(eb.entwurf.offenZaehlt) !== '0';
      return `<div class="gr-offen"><div class="gr-zeile"><span>Mit Offenem</span><b>≈ ${Math.round(a).toLocaleString('de-DE')} bis ${R.euroRund(b)}</b></div>
        <div class="wahl zwei-sp"><button data-a="gr-wahl" data-feld="offenZaehlt" data-wert="1" aria-pressed="${an}">Mitrechnen</button><button data-a="gr-wahl" data-feld="offenZaehlt" data-wert="0" aria-pressed="${!an}">Nicht mitrechnen</button></div>
        <p class="hinweistext gr-mini">Unbekannt: ${esc(offene.map((f) => GR_OFFEN[f][0]).join(', '))}. ${an ? 'Das Netto oben rechnet vorsichtig: wenig Zuschläge, hohe Abzüge.' : 'Das Netto oben lässt diese Werte weg.'}</p></div>`;
    })()}
    <button class="knopf klein akzent gr-quellen-knopf" data-a="quellen">Woher kommen die Zahlen? Rechenweg ansehen</button>
    <div class="gr-jsz"><span class="t"><b>November: Jahressonderzahlung</b><small>90 % vom Monatsentgelt (§ 23 Abs. 2 DRK-RTV) · ≈ ${R.euroRund(r.jsz)} brutto, netto ≈ <span class="plus-zahl">${R.euroRund(r.jszNetto)}</span></small></span>
      <button class="knopf klein akzent" data-a="gr-jsz" data-wert="${r.jszNetto}">Als Einnahme eintragen</button></div>`;
}
function grAktualisieren() {
  const eb = oben();
  const box = document.getElementById('gr-ergebnis');
  if (!eb || eb.art !== 'gehaltsrechner' || !box) return;
  box.innerHTML = grErgebnisHtml(eb);
  const r = DRK.gehaltRechnen(grEingaben(eb.entwurf), eb.monat);
  const k = document.getElementById('gr-uebernehmen');
  if (k) { k.textContent = `≈ ${R.euroRund(r.netto)} als Gehalt übernehmen`; k.dataset.wert = r.netto; }
  const h = document.getElementById('gr-saetze');
  if (h) h.innerHTML = grSaetze(eb, r);
}
function grSaetze(eb, r) {
  const basis = r.basisStunde;
  return `Nacht 5,50 € · Sonntag ${R.euro(Math.round(basis * 25) / 100)} · Feiertag ${R.euro(Math.round(basis * 35) / 100)} je Stunde. Grundlage: ${R.euro(basis)} je Stunde (niedrigste Stufe deiner Gruppe, § 14 Abs. 2). Ausgezahlt werden Zuschläge meist mit der nächsten Abrechnung (Nachberechnung), laut Tarif spätestens im zweiten Folgemonat (§ 29 Abs. 1 Satz 3).`;
}

// ---------- v27: Hinweise und Warnungen (einzeln abschaltbar) ----------
const HINWEISE = [
  ['sicherung', 'An die Sicherung erinnern', 'nach 30 Tagen ohne Export'],
  ['eng', 'Engster Monat und Zusatzkosten', 'ohne Rücklagenkonto: Monate, in denen jährliche Kosten abgebucht werden'],
  ['ruecklage', 'Rücklagenkonto', 'wenn die Rücklage nicht reicht, und der Tipp zum Einrichten'],
  ['geplant', 'Geplante Ausgaben', 'wenn das Geld für etwas Geplantes nicht reicht'],
  ['sparziel', 'Sparziel', 'wenn die Rate für ein Sparziel nicht reicht'],
  ['gehalt', 'Gehalt da?', 'Frage nach dem Gehalt am Ankunftstag']
];
const hinweisAn = (id) => !((z.daten && z.daten.einstellungen.hinweiseAus) || []).includes(id);
const std = (x) => String(Math.round((Number(x) || 0) * 100) / 100).replace('.', ',');
const monatJahr = (s, kurz) => (kurz ? R.MONATE_KURZ : R.MONATE_LANG)[R.ymTeile(s).monat - 1] + ' ' + R.ymTeile(s).jahr;

function sicherungKarte() {
  if (!hinweisAn('sicherung')) return '';
  const sp = z.daten.einstellungen.sicherungSpaeter;
  if (sp && sp > heute()) return '';
  const f = R.sicherungFaellig(z.daten, new Date());
  if (!f) return '';
  return `<section class="karte hinweis-karte sicherung-karte"><div class="hinweis-kopf"><b>${f.nie ? 'Noch keine Sicherung gemacht' : `Letzte Sicherung vor ${f.tage} Tagen`}</b><button class="knopf klein leise rund" style="width:36px" data-a="sicherung-spaeter" aria-label="In 7 Tagen wieder erinnern">${ICON.x}</button></div>
    <p class="hinweistext">Deine Daten liegen nur auf diesem Handy. Geht es verloren oder kaputt, sind sie ohne Sicherung weg. Die Datei landet im Ordner „Downloads“.</p>
    <button class="knopf akzent" data-a="export">Jetzt sichern</button></section>`;
}

// ---------- v27: Verlauf durchsuchen ----------
const vfAktiv = () => !!(z.vf && (z.vf.text.trim() || z.vf.kategorieId || z.vf.monat || z.vf.ort));
function vfKopf() {
  if (!z.vf) z.vf = { text: '', kategorieId: '', monat: '', ort: '', auf: false };
  const f = z.vf;
  if (!z.daten.buchungen.length) return '';
  const anzahl = [f.kategorieId, f.monat, f.ort].filter(Boolean).length;
  let filter = '';
  if (f.auf) {
    const kats = budgetKats().filter((k) => z.daten.buchungen.some((b) => b.kategorieId === k.id));
    const monate = [...new Set(z.daten.buchungen.map((b) => R.ymAus(b.zeit)))].sort().reverse();
    const orte = new Map();
    for (const b of z.daten.buchungen) if (b.ort && (!f.kategorieId || b.kategorieId === f.kategorieId)) orte.set(b.ort, (orte.get(b.ort) || 0) + 1);
    const top = [...orte.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map((x) => x[0]);
    if (f.ort && !top.includes(f.ort)) top.unshift(f.ort);
    const chip = (feld, wert, text, an) => `<button class="chip" data-a="vf-wahl" data-feld="${feld}" data-wert="${esc(wert)}" aria-pressed="${!!an}">${esc(text)}</button>`;
    filter = `<div class="vf-filter">
      <div class="label">Kategorie</div><div class="chips">${kats.map((k) => chip('kategorieId', k.id, mitEmoji(k) + k.name, f.kategorieId === k.id)).join('')}</div>
      <div class="label">Monat</div><div class="chips">${monate.slice(0, 12).map((m) => chip('monat', m, monatJahr(m, true), f.monat === m)).join('')}</div>
      ${top.length ? `<div class="label">Ort / Wofür</div><div class="chips">${top.map((o) => chip('ort', o, o, f.ort === o)).join('')}</div>` : ''}</div>`;
  }
  return `<div class="vf-kopf"><input id="vf-text" class="eingabe" type="search" enterkeyhint="search" autocomplete="off" placeholder="Suchen: Ort, Kategorie, Betrag" aria-label="Verlauf durchsuchen" value="${esc(f.text)}"><button class="knopf ${anzahl ? 'akzent' : ''}" data-a="vf-auf" aria-expanded="${!!f.auf}">Filter${anzahl ? ' · ' + anzahl : ''}</button></div>${filter}`;
}

// ---------- v27: Fixkosten „gilt ab“ ----------
function giltAbHtml(eb) {
  const f = eb.entwurf;
  if (!eb.id || f.unbekannt || eb.warOffen) return '';
  const betrag = zahl(f.betragText); const anteil = fkAnteil(f);
  if (isNaN(betrag) || betrag <= 0 || anteil == null) return '';
  if (Math.abs(betrag - eb.altBetrag) <= 0.004 && Math.abs(anteil - eb.altAnteil) <= 0.004) return '';
  const h = heuteYm(), n = R.ymPlus(h, 1), w = f.giltAb || 'jetzt';
  const alt = R.euro(Math.round(eb.altBetrag * eb.altAnteil) / 100);
  const satz = w === 'immer' ? 'Auch vergangene Monate rechnen dann mit dem neuen Betrag.'
    : `Bis ${monatJahr(R.ymPlus(w === 'naechster' ? n : h, -1), true)} bleibt es bei ${alt}. Vergangene Monate ändern sich nicht.`;
  return `<div class="giltab"><div class="label">Neuer Betrag gilt ab</div>
    <div class="wahl drei">${wahlKnopf('fk-giltab', 'jetzt', R.MONATE_KURZ[R.ymTeile(h).monat - 1] + ' (jetzt)', w === 'jetzt')}${wahlKnopf('fk-giltab', 'naechster', R.MONATE_KURZ[R.ymTeile(n).monat - 1], w === 'naechster')}${wahlKnopf('fk-giltab', 'immer', 'schon immer', w === 'immer')}</div>
    <p class="hinweistext">${esc(satz)}</p></div>`;
}

// ---------- v27: Sparziel ----------
function sparzielEntwurf(e) {
  const ziel = zahl(e.zielText);
  if (isNaN(ziel) || ziel <= 0) return null;
  const betrag = e.unbekannt ? 0 : zahl(e.betragText);
  return R.sparziel({ ziel, zielBis: e.zielBis || null, betrag: isNaN(betrag) ? 0 : betrag, tag: zahl(e.tagText) || 1, stand: zahl(e.standText) || 0, standDatum: heute() }, heute(), null);
}
function sparzielSatz(zi) {
  if (!zi) return 'Mit Ziel und Datum rechnet die App aus, wie viel du im Monat zurücklegen musst.';
  if (zi.erreicht) return `Ziel erreicht: ${R.euroRund(zi.stand)} von ${R.euroRund(zi.ziel)}.`;
  let t = `Es fehlen noch ${R.euroRund(zi.fehlt)}.`;
  if (zi.zielBis) {
    if (zi.vorbei) t += ` Der Zielmonat ${monatJahr(zi.zielBis)} ist vorbei.`;
    else if (zi.reicht) t += ` Mit ${R.euro(zi.rate)} im Monat schaffst du es bis ${monatJahr(zi.zielBis)}${zi.fertigIm && zi.fertigIm < zi.zielBis ? ` – schon im ${monatJahr(zi.fertigIm)}` : ''}.`;
    else t += ` Bis ${monatJahr(zi.zielBis)} sind ${R.euro(zi.noetig)} im Monat nötig${zi.rate > 0 ? ` – ${R.euro(Math.round((zi.noetig - zi.rate) * 100) / 100)} mehr als jetzt. Mit der jetzigen Rate bist du erst im ${monatJahr(zi.fertigIm)} am Ziel` : ''}.`;
  } else if (zi.fertigIm) t += ` Mit ${R.euro(zi.rate)} im Monat bist du im ${monatJahr(zi.fertigIm)} am Ziel.`;
  else t += ' Ohne festen Übertrag gibt es kein Datum.';
  return t;
}

// ---------- v27: Auswertung ----------
function auswertungHtml(eb) {
  const a = R.auswertung(z.daten, heute(), eb.n);
  const tag = Number(heute().slice(8));
  const hatMonate = a.monate.length > 0;
  // Balken: eine Reihe (Ausgaben aus den Budgets), Höhe = Summe; der laufende Monat ist schraffiert und heißt „bisher“
  const max = Math.max(1, ...a.verlauf.map((m) => m.summe));
  const gewaehlt = eb.monat && a.verlauf.some((m) => m.monat === eb.monat) ? eb.monat : a.verlauf[a.verlauf.length - 1].monat;
  const eng = a.verlauf.length > 7;
  const balken = a.verlauf.map((m) => `<button class="aw-balken ${m.laeuft ? 'laeuft' : ''}" data-a="aw-monat" data-wert="${m.monat}" aria-pressed="${gewaehlt === m.monat}" aria-label="${esc(monatJahr(m.monat))}: ${R.euroRund(m.summe)}${m.laeuft ? ' bisher' : ''}">
      <span class="aw-wert">${eng && gewaehlt !== m.monat ? '' : Math.round(m.summe).toLocaleString('de-DE')}</span>
      <span class="aw-saeule"><i style="height:${Math.max(m.summe > 0 ? 2 : 0, m.summe / max * 100).toFixed(1)}%"></i></span>
      <span class="aw-monat">${esc(m.name)}</span></button>`).join('');
  const gm = a.verlauf.find((m) => m.monat === gewaehlt);
  const teileGm = budgetKats().map((k) => ({ k, x: R.ausgegebenIm(z.daten, gewaehlt, k.id) })).filter((x) => x.x > 0).sort((p, q) => q.x - p.x);
  const detail = `<div class="aw-detail" aria-live="polite"><b>${esc(monatJahr(gewaehlt))}${gm.laeuft ? ' (bisher)' : ''}: ${rausZ(gm.summe)}</b>${teileGm.length ? `<span>${teileGm.map((x) => `${esc(mitEmoji(x.k) + x.k.name)} ${R.euroRund(x.x)}`).join(' · ')}</span>` : '<span>keine Buchungen</span>'}</div>`;
  // Vergleich mit dem Vormonat bis zum selben Tag
  let vergleich = '';
  if (a.summeVorBisTag != null) {
    const diff = a.summeJetzt - a.summeVorBisTag;
    const vmName = monatsName(a.vormonat);
    vergleich = `<section class="karte"><div class="label">${esc(monatsName(heuteYm()))} bis zum ${tag}.</div>
      <div class="gr-zeile"><span>Bisher ausgegeben</span><b>${rausZ(a.summeJetzt)}</b></div>
      <div class="gr-zeile"><span>${esc(vmName)} bis zum ${tag}.</span><b>${rausZ(a.summeVorBisTag)}</b></div>
      <p class="hinweistext">${Math.abs(diff) < 1 ? `Gleich viel wie im ${esc(vmName)}.` : diff > 0 ? `▲ ${R.euroRund(diff)} mehr als im ${esc(vmName)} zur selben Zeit.` : `▼ ${R.euroRund(-diff)} weniger als im ${esc(vmName)} zur selben Zeit.`}</p></section>`;
  }
  // Budgets: Schnitt gegen Budget
  const URTEIL = { knapp: ['▲', 'zu knapp', 'warn'], luft: ['▽', 'Luft', 'gut'], passt: ['✓', 'passt', 'gut'], ohne: ['–', 'ohne Budget', ''], neu: ['…', 'noch zu neu', ''] };
  const zeilen = a.kats.filter((k) => k.schnitt != null ? (k.schnitt > 0 || k.budget > 0) : (k.jetzt > 0 || k.budget > 0)).map((k) => {
    const [zeichen, wort, art] = URTEIL[k.urteil];
    const skala = Math.max(k.budget, k.schnitt || 0, k.max || 0, 1) * 1.08;
    const vorschlag = Math.ceil((k.schnitt || 0) / 10) * 10;
    const satz = k.urteil === 'knapp' ? `Im Schnitt ${R.euroRund(k.schnitt - k.budget)} drüber. Passender wären ≈ ${R.euroRund(vorschlag)}.`
      : k.urteil === 'luft' ? (k.schnitt < 0.5 ? 'In diesem Zeitraum nichts ausgegeben.' : `Im Schnitt bleiben ${R.euroRund(k.budget - k.schnitt)} übrig. ≈ ${R.euroRund(vorschlag)} würden reichen.`)
      : k.urteil === 'passt' ? 'Budget und Ausgaben liegen nah beieinander.'
      : k.urteil === 'neu' ? `Im ${esc(monatsName(heuteYm()))} bisher ${R.euroRund(k.jetzt)}. Ein Urteil gibt es nach dem ersten ganzen Monat.` : 'Kein Budget festgelegt.';
    return `<div class="aw-kat"><div class="aw-kat-kopf"><span class="n">${esc(mitEmoji(k.kategorie) + k.kategorie.name)}</span><span class="aw-urteil ${art}"><i aria-hidden="true">${zeichen}</i> ${wort}</span></div>
      ${k.schnitt != null ? `<div class="aw-spur" role="img" aria-label="Schnitt ${R.euroRund(k.schnitt)}${k.budget ? ', Budget ' + R.euroRund(k.budget) : ''}"><i class="aw-schnitt" style="width:${(k.schnitt / skala * 100).toFixed(1)}%"></i>${k.budget > 0 ? `<i class="aw-budget" style="left:${(k.budget / skala * 100).toFixed(1)}%"></i>` : ''}</div>
      <div class="aw-zahlen"><span>Ø <b>${R.euroRund(k.schnitt)}</b> im Monat${k.werte.length > 1 ? ` · ${R.euroRund(k.min)} bis ${R.euroRund(k.max)}` : ''}</span><span>${k.budget > 0 ? 'Budget ' + R.euroRund(k.budget) : ''}</span></div>` : ''}
      <p class="hinweistext">${satz}</p>
      ${k.urteil === 'knapp' || k.urteil === 'luft' ? `<button class="knopf klein" data-a="budget" data-id="${esc(k.kategorie.id)}">Budget ändern</button>` : ''}</div>`;
  }).join('');
  const orte = a.orte.slice(0, 8);
  const maxOrt = Math.max(1, ...orte.map((o) => o.summe));
  const orteHtml = orte.length ? `<section class="karte"><div class="label">Wo gibst du am meisten aus?</div>${orte.map((o) => `<div class="aw-ort"><div class="aw-ort-kopf"><span class="n">${esc(o.ort)}</span><b>${rausZ(o.summe, true)}</b></div><div class="aw-spur klein"><i class="aw-schnitt" style="width:${(o.summe / maxOrt * 100).toFixed(1)}%"></i></div><small>${o.anzahl === 1 ? '1 Buchung' : o.anzahl + ' Buchungen'} · Ø ${R.euro(Math.round(o.summe / o.anzahl * 100) / 100)}</small></div>`).join('')}
      <p class="hinweistext">Gezählt sind Buchungen mit Ort oder „Wofür“ ${hatMonate ? `seit ${esc(monatJahr(a.monate[0], true))}` : `im ${esc(monatsName(heuteYm()))}`}.</p></section>` : '';
  const zeitraum = hatMonate ? (a.monate.length === 1 ? `${monatJahr(a.monate[0], true)}` : `${monatJahr(a.monate[0], true)} bis ${monatJahr(a.monate[a.monate.length - 1], true)}`) : '';
  return seite('Auswertung', `
    <div class="ansicht-wahl drei" role="group" aria-label="Zeitraum">${[[3, '3 Monate'], [6, '6 Monate'], [12, '12 Monate']].map(([n, t]) => `<button data-a="aw-zeit" data-wert="${n}" aria-pressed="${eb.n === n}">${t}</button>`).join('')}</div>
    <p class="hinweistext">${hatMonate ? `Schnitt aus ${a.monate.length === 1 ? 'einem ganzen Monat' : a.monate.length + ' ganzen Monaten'} (${esc(zeitraum)})${a.monate.length < eb.n ? ` – mehr gibt es seit deinem Start mit der App noch nicht` : ''}. Gezählt sind die Ausgaben aus den Budgets, keine Fixkosten.` : 'Für einen Schnitt braucht die App mindestens einen ganzen Monat. Bis dahin siehst du den laufenden Monat.'}</p>
    <section class="karte"><div class="label">Ausgaben aus den Budgets pro Monat · in €</div>
      <div class="aw-diagramm" style="--n:${a.verlauf.length}">${balken}</div>${detail}
      <p class="hinweistext">Balken antippen zeigt den Monat. Schraffiert = läuft noch.</p></section>
    ${vergleich}
    ${zeilen ? `<section class="karte"><div class="label">Passt das Budget?</div>${zeilen}<p class="hinweistext">Balken = dein Schnitt, Strich = dein Budget. „Zu knapp“ heißt: im Schnitt mehr als 5 % drüber. „Luft“: mehr als ein Viertel bleibt übrig.</p></section>` : ''}
    ${orteHtml}
    ${!z.daten.buchungen.length ? '<section class="karte"><div class="leerzustand">Noch keine Buchungen. Trag Ausgaben über ＋ oder das Widget ein, dann füllt sich die Auswertung.</div></section>' : ''}`);
}

// ---------- v27: Dienste und Gehalt schätzen ----------
const schichtarten = () => z.daten.einstellungen.schichtarten || [];
// Schalter „Dienstpauschale“ im Schichtart-Fenster: solange nichts gewählt ist, entscheidet das Kürzel (R1T ja, FB nein)
const saPauschale = (eb) => (typeof eb.entwurf.pauschale === 'boolean' ? eb.entwurf.pauschale : DI.mitPauschale(String(eb.entwurf.k || '').trim(), []));
function diensteHtml(eb) {
  const s = eb.monat;
  const e = z.daten.einstellungen;
  const an = !!e.gehaltSchaetzen;
  const hatRechner = !!e.gehaltsrechner;
  const land = DI.land(z.daten), vz = DI.verzug(z.daten);
  const ft = Object.assign({}, DI.feiertage(R.ymTeile(s).jahr, land));
  const dienste = new Map((z.daten.dienste || []).filter((x) => x.d.slice(0, 7) === s).map((x) => [x.d, x]));
  // Kalender Mo–So
  const erster = new Date(s + '-01T12:00:00');
  const leer = (erster.getDay() + 6) % 7;
  let zellen = '<i></i>'.repeat(leer);
  for (let t = 1; t <= R.tageImMonat(s); t++) {
    const d = s + '-' + R.zweistellig(t);
    const x = dienste.get(d);
    const wt = new Date(d + 'T12:00:00').getDay();
    const nacht = x && !x.frei && x.von && x.bis && x.bis <= x.von;
    zellen += `<button class="ds-tag ${x ? (x.frei ? 'frei' : nacht ? 'nacht' : 'dienst') : ''} ${ft[d] ? 'feiertag' : wt === 0 ? 'sonntag' : ''} ${d === heute() ? 'heute' : ''}" data-a="ds-tag" data-wert="${d}" aria-label="${t}. ${esc(monatsName(s))}${ft[d] ? ', ' + esc(ft[d]) : ''}: ${x ? esc(x.k) + (x.von ? ` ${x.von}–${x.bis}` : x.frei ? ' ganztägig' : ' ohne Uhrzeit') : 'kein Dienst'}"><span class="t">${t}</span><span class="k">${x ? esc(x.k) : ''}</span></button>`;
  }
  const arten = schichtarten();
  const pinsel = eb.pinsel || '';
  const pinselHtml = `<div class="chips ds-pinsel">${arten.map((a) => `<button class="chip" data-a="ds-pinsel" data-wert="${esc(a.k)}" aria-pressed="${pinsel === a.k}">${esc(a.k)} <small>${a.frei ? 'ganztägig' : esc(a.von + '–' + a.bis)}</small></button>`).join('')}<button class="chip" data-a="ds-pinsel" data-wert="-" aria-pressed="${pinsel === '-'}">✕ Leeren</button><button class="chip" data-a="schichtart" data-wert="">${ICON.plus} Schichtart</button></div>`;
  const st = DI.stundenAusDiensten(z.daten.dienste, s, land, arten);
  const ms = (z.daten.monatsstunden || {})[s];
  const gilt = DI.stundenFuer(z.daten, s);
  const zahlMonat = R.ymPlus(s, vz);
  const rech = hatRechner ? DRK.gehaltRechnen(Object.assign(DRK.eingaben(e.gehaltsrechner), gilt.quelle === 'schnitt' ? {} : { nacht: gilt.nacht, nacht04: gilt.nacht04, sonntag: gilt.sonntag, feiertag: gilt.feiertag, vorfest: gilt.vorfest, pauschalDienste: gilt.pauschalDienste }), zahlMonat) : null;
  const stundenZeile = (l, w, klasse = '') => `<div class="gr-zeile ${klasse}"><span>${l}</span><b>${w}</b></div>`;
  const q = gilt.quelle === 'abrechnung' ? gilt : st;
  const pBetrag = (q.pauschalDienste || 0) * DRK.DIENSTPAUSCHALE;
  const stunden = `<section class="karte" id="ds-stunden"><div class="label">Stunden mit Zuschlag im ${esc(monatsName(s))}</div>
      ${st.anzahl || gilt.quelle === 'abrechnung' ? `
      ${gilt.quelle === 'abrechnung' ? `<p class="hinweistext">✓ Aus der Monatsübersicht deines Arbeitgebers (abgerechnet${ms.stand ? ', Stand ' + esc(new Date(ms.stand + 'T12:00:00').toLocaleDateString('de-DE')) : ''}).</p>` : stundenZeile(`${st.anzahl === 1 ? '1 Dienst' : st.anzahl + ' Dienste'}`, `${std(st.stunden)} Std.`)}
      ${stundenZeile('Nacht (20–6 Uhr)<small class="gr-fund">§ 13 Abs. 6, § 14 Abs. 2 Satz 3 DRK-RTV</small>', `${std(q.nacht)} Std.`)}
      ${stundenZeile('Sonntag<small class="gr-fund">§ 14 Abs. 2 Satz 2 b</small>', `${std(q.sonntag)} Std.`)}
      ${stundenZeile('Feiertag<small class="gr-fund">§ 14 Abs. 2 Satz 2 c</small>', `${std(q.feiertag)} Std.`)}
      ${q.vorfest > 0 ? stundenZeile('24./31.12. ab 14 Uhr<small class="gr-fund">§ 14 Abs. 2 Satz 2 d</small>', `${std(q.vorfest)} Std.`) : ''}
      ${stundenZeile(`Dienstpauschale · ${std(q.pauschalDienste || 0)} ${q.pauschalDienste === 1 ? 'Schicht' : 'Schichten'} × ${R.euro(DRK.DIENSTPAUSCHALE)}<small class="gr-fund">§ 23 b DRK-RTV · Schichten ab 6 Std. mit verlängerter Arbeitszeit</small>`, R.euro(pBetrag))}
      ${rech ? stundenZeile(`Zuschläge und Pauschale brutto · kommen mit dem Gehalt Ende ${esc(monatJahr(zahlMonat))}`, reinZ(rech.zuschlaegeSumme + pBetrag, false, '≈ '), 'summe') : ''}
      ${st.ohneZeit ? `<p class="hinweistext warn-text">${st.ohneZeit === 1 ? '1 Dienst hat' : st.ohneZeit + ' Dienste haben'} keine Uhrzeit und ${st.ohneZeit === 1 ? 'zählt' : 'zählen'} nicht mit. Leg die Schichtart mit Uhrzeit an, dann den Tag neu antippen.</p>` : ''}
      ${ms && !ms.fertig ? `<p class="hinweistext">Zwischenstand laut Monatsübersicht${ms.stand ? ' vom ' + esc(new Date(ms.stand + 'T12:00:00').toLocaleDateString('de-DE')) : ''}: Nacht ${std(ms.nacht)} · Sonntag ${std(ms.sonntag)} · Feiertag ${std(ms.feiertag)} Std. Gerechnet wird mit den Diensten, bis der Monat abgerechnet ist.</p>` : ''}` : '<div class="leerzustand" style="padding:8px 0">Noch keine Dienste in diesem Monat.</div>'}
      <button class="knopf klein" data-a="monatsstunden" data-monat="${s}">${ms ? 'Stunden laut Arbeitgeber ändern' : 'Stunden laut Arbeitgeber eintragen'}</button>
    </section>`;
  // Was kommt wann
  let ausblick = '';
  if (an && hatRechner) {
    const g = gehalt();
    const zeilen = [0, 1, 2, 3].map((i) => {
      const m = R.ymPlus(heuteYm(), i); const x = DI.gehaltSchaetzung(z.daten, m); const ist = g && R.gehaltBestaetigt(g, m);
      const w = x.stunden.quelle === 'abrechnung' ? `Monatsübersicht ${R.MONATE_KURZ[R.ymTeile(x.stunden.monat).monat - 1]}` : x.stunden.quelle === 'dienste' ? `Dienste ${R.MONATE_KURZ[R.ymTeile(x.stunden.monat).monat - 1]}` : `Durchschnitt (keine Dienste im ${R.MONATE_KURZ[R.ymTeile(x.stunden.monat).monat - 1]})`;
      return `<div class="gr-zeile"><span>Ende ${esc(monatJahr(m, true))}<small class="gr-fund">Zuschläge ≈ ${R.euroRund(x.zuschlaege)}${x.stunden.pauschalDienste ? ` + Pauschale ${R.euroRund(x.stunden.pauschalDienste * DRK.DIENSTPAUSCHALE)}` : ''} · ${esc(w)}${ist ? ' · Gehalt schon bestätigt' : ''}</small></span><b>${reinZ(x.netto, true, '≈ ')}</b></div>`;
    }).join('');
    ausblick = `<section class="karte" id="ds-ausblick"><div class="label">Geschätztes Gehalt (netto)</div>${zeilen}<p class="hinweistext">Diese Werte stehen im Monat als Gehalt, bis du den echten Betrag bestätigst.</p></section>`;
  }
  return seite('Dienste und Gehalt', `
    <section class="karte">
      <button class="schalter" role="switch" aria-checked="${an}" data-a="ds-schaetzen"><span class="t">Gehalt aus den Diensten schätzen<br><span class="klein">${an ? 'Jeder Monat bekommt seine eigene Schätzung' : 'Aus: es gilt deine feste Schätzung'}</span></span><span class="spur"></span></button>
      ${!hatRechner ? `<p class="hinweistext">Dafür braucht die App einmal deine Angaben im Gehaltsrechner (Entgeltgruppe, Stufe, Steuerklasse …) – dort „Merken“ tippen.</p><button class="knopf akzent" data-a="gehaltsrechner">🧮 Gehaltsrechner öffnen</button>` : ''}
      <div class="feld"><span class="label">Zuschläge kommen mit dem Gehalt …</span><div class="wahl drei">${[[1, '1 Monat später'], [2, '2 Monate später'], [0, 'im selben Monat']].map(([w, t]) => wahlKnopf('ds-verzug', w, t, vz === w)).join('')}</div></div>
      <p class="hinweistext">Üblich ist die Nachberechnung mit der nächsten Abrechnung: Zuschläge aus November kommen Ende Dezember. Der Tarif lässt Zeit bis zum Zahltag des zweiten Folgemonats (§ 29 Abs. 1 Satz 3 DRK-RTV). Auf der Abrechnung erkennst du es an den Zeilen mit „N“ davor.</p>
    </section>
    <div class="monatswahl ds-monat">
      <button class="knopf rund" data-a="ds-monat" data-wert="-1" aria-label="Vorheriger Monat">${ICON.links}</button>
      <h3 class="monatstitel">${esc(monatsName(s))} <span>${R.ymTeile(s).jahr}</span></h3>
      <button class="knopf rund" data-a="ds-monat" data-wert="1" aria-label="Nächster Monat">${ICON.rechts}</button>
    </div>
    <section class="karte">
      <div class="ds-kopf">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((t) => `<span>${t}</span>`).join('')}</div>
      <div class="ds-kalender">${zellen}</div>
      <div class="label">Schichtart wählen, dann Tage antippen</div>
      ${pinselHtml}
      <p class="hinweistext">${arten.length ? 'Nochmal antippen entfernt den Dienst. Uhrzeit einer Schichtart ändern: unten auf das Kürzel mit dem Stift tippen.' : 'Leg zuerst deine Schichtarten an, z. B. R1T 07:00–19:00 und R1N 19:00–07:00.'} Sonn- und Feiertage sind markiert.</p>
      ${arten.length ? `<div class="chips">${arten.map((a) => `<button class="chip" data-a="schichtart" data-wert="${esc(a.k)}">${ICON.stift} ${esc(a.k)}</button>`).join('')}</div>` : ''}
    </section>
    ${stunden}
    ${ausblick}
    <section class="karte ds-leser">
      <div class="label">Dienste einlesen statt antippen</div>
      <button class="knopf" data-a="ds-datei">Dienste aus CaleConnect einlesen (.json)</button>
      <p class="hinweistext">CaleConnect: Menü → Backup → Speichern, dann hier die Datei wählen. Bringt die geplanten Dienste in den Kalender oben.</p>
      <div class="label">Monatsübersicht deines Arbeitgebers</div>
      <button class="knopf" data-a="ds-pdf">Monatsübersicht einlesen (PDF)</button>
      <p class="hinweistext">Bringt nach Monatsende die abgerechneten Stunden und vergleicht die Dienste Tag für Tag mit deinem Kalender.</p>
      <div class="label">Brutto-Netto-Abrechnung</div>
      <button class="knopf" data-a="ds-abr">Abrechnung einlesen (PDF)</button>
      <p class="hinweistext">Trägt das echte Gehalt ein und vergleicht jede Zeile mit dem Gehaltsrechner. Die Datei bleibt auf dem Handy; Nummern und Bankverbindung liest die App nicht.</p>
      <div class="feld"><label for="ds-land">Feiertage von</label><select id="ds-land" class="eingabe" data-a-wechsel="ds-land">${Object.entries(DI.LAENDER).map(([k, n]) => `<option value="${k}" ${land === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    </section>
    <div class="zwei"><button class="knopf leise" data-a="gehaltsrechner">🧮 Gehaltsrechner</button><button class="knopf leise" data-a="quellen">Woher kommen die Zahlen?</button></div>`);
}

async function pdfZeilen(datei) {
  const pdfjs = await import('../vendor/pdfjs/pdf.min.js');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await datei.arrayBuffer()) }).promise;
  const blaetter = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const zeilen = [];
    const seite = await doc.getPage(n);
    const tc = await seite.getTextContent();
    const stuecke = tc.items.filter((i) => i.str && i.str.trim()).map((i) => ({ x: i.transform[4], y: i.transform[5], t: i.str }));
    stuecke.sort((a, b) => b.y - a.y || a.x - b.x);
    let reihe = [], y = null;
    const fertig = () => { if (reihe.length) zeilen.push(reihe.sort((a, b) => a.x - b.x).map((i) => i.t).join(' ')); reihe = []; };
    for (const i of stuecke) { if (y === null || Math.abs(i.y - y) > 3) { fertig(); y = i.y; } reihe.push(i); }
    fertig();
    blaetter.push(zeilen);
  }
  return blaetter; // ein Eintrag je Blatt, darin die Textzeilen
}

// ---------- v29: Brutto-Netto-Abrechnung abgleichen ----------
function abrechnungHtml(eb) {
  const erg = eb.ergebnis; const a = erg.haupt;
  const zeile = (l, w, klasse = '') => `<div class="gr-zeile ${klasse}"><span>${l}</span><b>${w}</b></div>`;
  const datum = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE') : '');
  let auszahlung = '', vergleich = '', einstellungen = '';
  if (a) {
    const g = gehalt();
    const ist = g && (g.istWerte || []).find((w) => R.ymAus(w.datum) === a.monat);
    const sch = g ? R.einnahmeIm(g, a.monat).schaetzung : null;
    const schon = ist && Math.abs(ist.betrag - a.auszahlung) < 0.005;
    const abzuege = a.nettoPosten.filter((x) => !x.nach);
    auszahlung = `<section class="karte ring" id="abr-auszahlung"><div class="label">Auszahlung ${esc(monatJahr(a.monat))}</div>
      <div class="grosszahl" style="font-size:var(--t-zahl-l)"><span class="plus-zahl">+ ${R.euro(a.auszahlung)}</span></div>
      ${a.nettoVerdienst != null ? zeile(`Netto-Verdienst ${esc(monatsName(a.monat))}`, R.euro(a.nettoVerdienst)) : ''}
      ${abzuege.map((x) => zeile(esc(x.name), x.betrag < 0 ? rausZ(-x.betrag) : reinZ(x.betrag))).join('')}
      ${a.ausNB.map((x) => zeile(`Nachberechnung ${esc(monatJahr(x.monat))}`, x.betrag < 0 ? rausZ(-x.betrag) : reinZ(x.betrag))).join('')}
      ${a.auszahlung == null ? '<p class="hinweistext">Der Auszahlungsbetrag steht nicht lesbar in der Datei.</p>' : schon ? `<p class="hinweistext">✓ Als Gehalt ${esc(monatsName(a.monat))} eingetragen.</p>`
        : `${sch != null && sch > 0 ? `<p class="hinweistext">${ist ? `Bisher eingetragen: ${R.euro(ist.betrag)}.` : `Die App hatte ≈ ${R.euroRund(sch)} geschätzt – ${Math.abs(a.auszahlung - sch) < 1 ? 'das passt' : a.auszahlung > sch ? R.euroRund(a.auszahlung - sch) + ' weniger als gekommen ist' : R.euroRund(sch - a.auszahlung) + ' mehr als gekommen ist'}.`}</p>` : ''}
          <button class="knopf haupt" data-a="abr-gehalt">${R.euro(a.auszahlung)} als Gehalt ${esc(monatsName(a.monat))} eintragen</button>`}
    </section>`;
    const v = AB.vergleich(a, z.daten.einstellungen.gehaltsrechner ? DRK.eingaben(z.daten.einstellungen.gehaltsrechner) : {});
    vergleich = `<section class="karte" id="abr-vergleich"><div class="label">Rechnet die App wie die Abrechnung?</div>
      ${!v.ok ? `<p class="hinweistext">Kein Vergleich möglich: ${esc(v.grund)}</p>` : `
      <div class="abgleich ${v.passt ? 'gut' : 'warn'}"><b>${v.passt ? `✓ Alle ${v.zeilen.length} Zeilen stimmen auf den Cent` : `≠ ${v.abweichungen.length === 1 ? '1 Zeile weicht' : v.abweichungen.length + ' Zeilen weichen'} ab`}</b><span>Verglichen wird der laufende Monat${a.ausNB.length ? ', ohne die Nachberechnung' : ''}. Die Sätze (Kasse, Zusatzversorgung) stammen aus der Abrechnung selbst.</span></div>
      <div class="vgl-tabelle"><div class="vgl-zeile kopf"><span></span><b>Abrechnung</b><b>App</b><i></i></div>${v.zeilen.map((x) => `<div class="vgl-zeile ${Math.abs(x.diff) > 0.02 ? 'ab' : ''}"><span>${esc(x.name).replace(/versicherung/, '\u00ADversicherung').replace(/versorgung/, '\u00ADversorgung')}</span><b>${R.euro(x.echt)}</b><b>${R.euro(x.app)}</b><i>${Math.abs(x.diff) > 0.02 ? '≠' : '✓'}</i></div>`).join('')}</div>
      ${v.abweichungen.length ? `<p class="hinweistext">Größte Abweichung: ${esc(v.abweichungen.sort((p, q) => Math.abs(q.diff) - Math.abs(p.diff))[0].name)} (${R.euro(Math.abs(v.abweichungen[0].diff))}). Häufige Gründe: Kinderfreibeträge, Kirchensteuer, Freibetrag oder eine Zulage, die die App nicht kennt.</p>` : ''}
      ${v.einmal.length ? `<p class="hinweistext">Nicht verglichen (Einmalzahlungen): ${esc(v.einmal.map((x) => x.name + ' ' + R.euro(x.betrag)).join(', '))}.</p>` : ''}`}
    </section>`;
  }
  // Einstellungen
  const quelle = a || erg.nachberechnungen[0];
  const abl = AB.einstellungenAus(quelle); const felder = AB.rechnerFelder(abl);
  const gesp = z.daten.einstellungen.gehaltsrechner || null;
  const NAME = { eg: 'Entgeltgruppe', stufe: 'Stufe', stkl: 'Steuerklasse', vz: 'Vollzeit pro Woche', kvzText: 'Zusatzbeitrag der Krankenkasse', kinder: 'Kinder (Pflegeversicherung)', ab23: 'Zuschlag für Kinderlose ab 23', zvkAnText: 'Zusatzversorgung: Eigenanteil', zvkAgText: 'Zusatzversorgung: Umlage Arbeitgeber' };
  const zeig = (f, w) => (f === 'eg' ? 'E ' + w : f === 'stkl' ? ['I', 'II', 'III', 'IV', 'V', 'VI'][w - 1] : f === 'vz' ? w + ' Std.' : f === 'ab23' ? (w ? 'ja' : 'nein') : /Text$/.test(f) ? w + ' %' : String(w));
  const fz = Object.keys(felder).map((f) => { const gleich = gesp && String(gesp[f]) === String(felder[f]); return { f, gleich, html: zeile(`${NAME[f]}${gleich ? '' : `<small class="gr-fund">${gesp && gesp[f] !== undefined && gesp[f] !== '' ? 'im Rechner bisher: ' + esc(zeig(f, gesp[f])) : 'im Rechner noch nicht eingetragen'}</small>`}`, `${gleich ? '✓ ' : ''}${esc(zeig(f, felder[f]))}`) }; });
  const neu = fz.filter((x) => !x.gleich).length;
  if (fz.length) einstellungen = `<section class="karte" id="abr-einstellungen"><div class="label">Einstellungen aus der Abrechnung</div>${fz.map((x) => x.html).join('')}
      ${abl.einKindOderUnter23 ? '<p class="hinweistext">Pflegeversicherung ohne Kinderlosen-Zuschlag: Ob du ein Kind hast oder unter 23 bist, kann die App nicht unterscheiden – das stellst du im Gehaltsrechner selbst ein.</p>' : ''}
      ${neu ? `<button class="knopf akzent" data-a="abr-einstellungen">${neu === 1 ? '1 Wert' : neu + ' Werte'} in den Gehaltsrechner übernehmen</button>` : '<p class="hinweistext">✓ Der Gehaltsrechner hat schon diese Werte.</p>'}
      <p class="hinweistext">Kassen-Beitrag und Zusatzversorgung sind aus den Beträgen zurückgerechnet. Alles andere im Rechner (Schichtzulage, Stunden) bleibt, wie es ist.</p></section>`;
  // Nachberechnungen
  const nbs = erg.nachberechnungen.map((nb) => {
    const lohn = nb.lohnarten.filter((x) => x.imBrutto && x.nach);
    const sv = AB.stundenVergleich(nb, z.daten);
    const ms = (z.daten.monatsstunden || {})[nb.monat];
    const schon = ms && ms.fertig && ms.quelle === 'abrechnung';
    const wert = (x, einheit) => (x == null ? '–' : std(x) + (einheit ? ' ' + einheit : ''));
    const woher = sv && (sv.quelle === 'abrechnung' ? 'Monatsübersicht' : 'Deine Dienste');
    return `<section class="karte abr-nb" data-monat="${nb.monat}"><div class="label">Nachberechnung ${esc(monatJahr(nb.monat))}</div>
      <p class="hinweistext">Diese Beträge gehören zum ${esc(monatsName(nb.monat))} und kommen mit der Auszahlung ${a ? esc(monatsName(a.monat)) : ''}${nb.auszahlung != null ? `: netto ${R.euro(nb.auszahlung)}` : ''}.</p>
      ${lohn.map((x) => zeile(`${esc(x.name)}${x.menge != null ? `<small class="gr-fund">${std(x.menge)} ${esc(x.einheit || '')} × ${R.euro(x.faktor)}${x.steuerfrei ? ' · steuerfrei' : ''}</small>` : x.art === 'pauschale' ? `<small class="gr-fund">${std(x.betrag / DRK.DIENSTPAUSCHALE)} Schichten × ${R.euro(DRK.DIENSTPAUSCHALE)} · § 23 b DRK-RTV</small>` : x.einmal ? '<small class="gr-fund">Einmalzahlung · die App schätzt sie nicht</small>' : ''}`, reinZ(x.betrag))).join('') || '<p class="hinweistext">Keine nachberechneten Beträge lesbar.</p>'}
      ${sv ? (sv.quelle === 'schnitt' ? `<p class="hinweistext">Für ${esc(monatsName(nb.monat))} sind in der App keine Dienste eingetragen – es gibt nichts zum Vergleichen.</p>`
        : `<div class="abgleich ${sv.passt ? 'gut' : 'warn'}"><b>${sv.passt ? '✓ Stunden wie in der App' : '≠ Stunden weichen von der App ab'}</b></div>
          <div class="vgl-tabelle"><div class="vgl-zeile kopf"><span></span><b>Abrechnung</b><b>${woher}</b><i></i></div>${sv.zeilen.map((x) => `<div class="vgl-zeile ${Math.abs(x.echt - x.app) > 0.01 ? 'ab' : ''}"><span>${x.name}</span><b>${wert(x.echt, x.einheit)}</b><b>${wert(x.app, x.einheit)}</b><i>${Math.abs(x.echt - x.app) > 0.01 ? '≠' : '✓'}</i></div>`).join('')}</div>`) : ''}
      ${sv ? (schon ? `<p class="hinweistext">✓ Als abgerechnete Stunden für ${esc(monatsName(nb.monat))} übernommen.</p>` : `<button class="knopf" data-a="abr-stunden" data-monat="${nb.monat}">Stunden für ${esc(monatsName(nb.monat))} als abgerechnet übernehmen</button>`) : ''}
    </section>`;
  }).join('');
  return seite(a ? `Abrechnung ${monatJahr(a.monat)}` : 'Nachberechnung', `
    <p class="hinweistext">Gelesen aus der Datei${erg.datum ? ' vom ' + esc(datum(erg.datum)) : ''}. Gespeichert wird nur, was du unten übernimmst. Personalnummer, Steuer-ID und Bankverbindung liest die App nicht.</p>
    ${auszahlung}${vergleich}${einstellungen}${nbs}
    <button class="knopf leise" data-a="quellen">Woher kommen die Zahlen? Rechenweg und Fundstellen</button>`);
}

// ---------- v27: Woher kommen die Zahlen? ----------
function quellenHtml(eb) {
  const e = grEingaben(eb.entwurf);
  const { zeilen } = DRK.rechenweg(e, eb.monat);
  const teile = ['Brutto', 'Steuer', 'Versicherung', 'Netto', 'Jahressonderzahlung'];
  const titel = { Brutto: 'Brutto', Steuer: 'Steuern', Versicherung: 'Versicherungen', Netto: 'Ergebnis', Jahressonderzahlung: 'Einmal im Jahr' };
  const zeile = (x) => `<div class="qz ${x.summe ? 'summe' : ''} ${x.info ? 'info' : ''}"><div class="qz-kopf"><span class="n">${esc(x.name)}</span>${x.betrag == null ? '' : `<b>${x.betrag < 0 ? rausZ(-x.betrag) : R.euro(x.betrag)}</b>`}</div>
      <div class="qz-weg">${esc(x.weg)}</div>${x.fund ? `<div class="qz-fund">Steht in: ${esc(x.fund)}</div>` : ''}${x.hinweis ? `<div class="qz-hinweis">${esc(x.hinweis)}</div>` : ''}</div>`;
  const karten = teile.map((t) => { const l = zeilen.filter((x) => x.teil === t); return l.length ? `<section class="karte quellen-karte"><div class="label">${titel[t]}</div>${l.map(zeile).join('')}</section>` : ''; }).join('');
  const q = DRK.QUELLEN;
  return seite('Woher kommen die Zahlen?', `
    <p class="hinweistext">Jede Zeile der Rechnung für ${esc(monatJahr(eb.monat))} mit Rechenweg und der Stelle, an der es steht. So kannst du jede Zahl selbst nachschlagen. Das ist keine Lohnabrechnung.</p>
    ${karten}
    <section class="karte quellen-karte"><div class="label">Wann kommt was?</div>
      ${zeile({ name: 'Zahltag', betrag: null, weg: 'Letzter Tag des Monats für den laufenden Monat.', fund: '§ 29 Abs. 1 Satz 2 DRK-RTV' })}
      ${zeile({ name: 'Zeitzuschläge', betrag: null, weg: 'Werden spätestens am Zahltag des zweiten Folgemonats fällig. Viele Abrechnungen bringen sie schon im Folgemonat als Nachberechnung (Zeilen mit „N“). Die App rechnet mit deiner Einstellung unter „Dienste und Gehalt“.', fund: '§ 29 Abs. 1 Satz 3 DRK-RTV' })}
      ${zeile({ name: 'Zusammentreffen', betrag: null, weg: 'Treffen Sonntag, Feiertag und 24./31.12. zusammen, gibt es nur den höchsten Zuschlag. Der Nachtzuschlag kommt immer dazu.', fund: '§ 14 Abs. 2 Satz 4 DRK-RTV' })}
      ${zeile({ name: 'Urlaub und Krankheit', betrag: null, weg: 'Zuschläge laufen als Durchschnitt der letzten drei vollen Monate weiter, bei Krankheit ohne Nachtzuschläge. Das rechnet die App nicht mit.', fund: '§ 24 Abs. 1 und 2 DRK-RTV' })}
    </section>
    <section class="karte quellen-karte"><div class="label">Die Texte dahinter</div>
      ${Object.values(q).map((x) => `<div class="qz"><div class="qz-kopf"><span class="n">${esc(x.titel)}</span></div><div class="qz-weg">${esc(x.stand)}</div><div class="qz-fund">Zu finden: ${esc(x.wo)}</div></div>`).join('')}
    </section>
    <section class="karte quellen-karte"><div class="label">Annahmen und Grenzen</div>
      <ul class="qz-liste">
        <li>Jede Stunde im Dienst zählt voll, Pausen werden nicht abgezogen. Ein Dienst zählt zu dem Monat, in dem er beginnt.</li>
        <li>Stundenanteil mit 38,5 Wochenstunden (Rettungsdienst, § 12 Abs. 1 Satz 2), auch wenn deine Arbeitszeit durch Arbeitsbereitschaft länger ist (§ 12 Abs. 6). Das ist eine Annahme – vergleiche den Stundensatz mit deiner Abrechnung.</li>
        <li>Feiertage: die gesetzlichen Feiertage des gewählten Bundeslands, ohne Sonderfälle einzelner Gemeinden.</li>
        <li>Nicht enthalten: Bereitschaftsdienst und Rufbereitschaft, Überstunden, vermögenswirksame Leistungen (§ 26), Leistungsprämien (§ 22), ausgezahlte Arbeitsstunden (§ 14 Abs. 6) und alles, was dein Arbeitgeber anders macht als der Tarifvertrag. Solche Zahlungen trägst du als „Weitere Einnahme“ ein.</li>
        <li>Zusatzversorgung: gerechnet wird nur, wenn du die zwei Sätze von deiner Abrechnung einträgst. Liegt die Umlage über 338 € im Monat (2026), wird der Rest pauschal versteuert – das rechnet die App nicht.</li>
        <li>Steuer und Sozialversicherung gelten für 2026. Für 2027 rechnet die App vorerst mit denselben Werten.</li>
      </ul>
      <p class="hinweistext">Zuletzt am Tariftext geprüft: ${DRK.QUELLEN_STAND}. Ändert sich der Tarif, muss die App aktualisiert werden.</p>
    </section>`);
}

const EBENEN = {
  abrechnung: (eb) => abrechnungHtml(eb),
  // ---------- v27 ----------
  auswertung: (eb) => auswertungHtml(eb),
  dienste: (eb) => diensteHtml(eb),
  quellen: (eb) => quellenHtml(eb),
  hinweise: () => seite('Hinweise und Warnungen', `
    <p class="hinweistext">Was die App von sich aus meldet. Ausgeschaltet heißt: Die Zahlen stimmen weiter, nur der Hinweis erscheint nicht mehr.</p>
    <section class="karte">${HINWEISE.map(([id, titel, unter]) => `<button class="schalter" role="switch" aria-checked="${hinweisAn(id)}" data-a="hw-um" data-wert="${id}"><span class="t">${titel}<br><span class="klein">${unter}</span></span><span class="spur"></span></button>`).join('')}</section>
    <div class="zwei"><button class="knopf" data-a="hw-alle" data-wert="1">Alle an</button><button class="knopf" data-a="hw-alle" data-wert="0">Alle aus</button></div>
    <p class="hinweistext">„Gehalt aus den Diensten schätzen“ schaltest du unter „Dienste und Gehalt schätzen“ ein und aus.</p>`),
  'geplant-alle': () => {
    const pruefung = R.wunschPruefung(z.daten, heuteYm());
    const h = heuteYm();
    const offen = R.offeneWuensche(z.daten);
    const gruppen = new Map();
    for (const w of offen) { const k = !w.monat ? 'ohne' : w.monat < h ? 'alt' : w.monat; if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k).push(w); }
    const reihenfolge = [...gruppen.keys()].sort((a, b) => (a === 'alt' ? -1 : b === 'alt' ? 1 : a === 'ohne' ? 1 : b === 'ohne' ? -1 : a < b ? -1 : 1));
    const titel = (k) => (k === 'alt' ? 'Überfällig – war früher geplant' : k === 'ohne' ? 'Monat noch offen' : monatJahr(k));
    const karten = reihenfolge.map((k) => { const l = gruppen.get(k); return `<section class="karte geplant-karte"><div class="geplant-kopf"><span class="t"><b>${esc(titel(k))}</b>${k !== 'alt' && k !== 'ohne' ? `<small>frei im Monat ≈ ${R.euroRund(R.monatsRechnung(z.daten, k).frei)}</small>` : ''}</span><span class="kat-summe">${rausZ(l.reduce((a, w) => a + R.preisBis(w), 0), true)}</span></div>${l.map((w) => wunschZeile(w, pruefung, k === 'alt' || k === 'ohne' ? h : k)).join('')}</section>`; }).join('');
    const gekauft = (z.daten.wuensche || []).filter((w) => w.status === 'gekauft').sort((a, b) => ((a.gekauftAm || '') < (b.gekauftAm || '') ? 1 : -1)).slice(0, 8);
    const summe = offen.reduce((a, w) => a + R.preisBis(w), 0);
    return seite('Alle geplanten Ausgaben', `
      ${offen.length ? `<section class="karte ring"><div class="label">Zusammen geplant</div><div class="grosszahl" style="font-size:var(--t-zahl-l)"><span class="minus-zahl">− ${R.euroRund(summe)}</span></div><div class="hinweistext">${offen.length === 1 ? '1 Sache' : offen.length + ' Sachen'} · gerechnet mit dem oberen Preis</div></section>` : '<section class="karte"><div class="leerzustand">Nichts geplant.</div></section>'}
      ${karten}
      <button class="knopf akzent" data-a="wunsch-neu" data-monat="">${ICON.plus} Potenzielle Ausgabe planen</button>
      ${gekauft.length ? `<section class="karte liste"><div class="label">Zuletzt gekauft</div>${gekauft.map((w) => `<div class="posten grau"><span class="t"><span class="n">${esc(w.name)}</span><small>${w.gekauftAm ? 'gekauft am ' + esc(new Date(w.gekauftAm + 'T12:00:00').toLocaleDateString('de-DE')) : 'gekauft'}</small></span><span class="b">${rausZ(w.bezahlt != null ? w.bezahlt : R.preisBis(w))}</span></div>`).join('')}</section>` : ''}`);
  },
  gekauft: (eb) => sheet(`<h2>Was hat ${esc(eb.name)} gekostet?</h2>
      <p class="hinweistext">Geplant waren ${R.euro(eb.von, false)}–${R.euro(eb.bis)}. Gebucht wird der Betrag, den du wirklich bezahlt hast.</p>
      <div class="feld"><label for="gk-betrag">Bezahlt</label><input id="gk-betrag" class="eingabe" inputmode="decimal" data-feld="betragText" value="${esc(eb.betragText)}" placeholder="z. B. ${esc(R.euro(eb.bis, false))}"></div>
      <div class="chips">${[eb.von, Math.round((eb.von + eb.bis) / 2 * 100) / 100, eb.bis].filter((x, i, l) => l.indexOf(x) === i).map((x) => `<button class="chip" data-a="gk-wert" data-wert="${x}">${R.euro(x)}</button>`).join('')}</div>
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      <div class="knopfreihe"><button class="knopf leise" data-a="schliessen">Abbrechen</button><button class="knopf haupt breit" data-a="gk-buchen">Buchen</button></div>`, 'Gekauft'),
  schichtart: (eb) => {
    const e = eb.entwurf;
    return sheet(`<h2>${eb.alt ? 'Schichtart ' + esc(eb.alt) : 'Neue Schichtart'}</h2>
      <div class="feld"><label for="sa-k">Kürzel (wie im Dienstplan)</label><input id="sa-k" class="eingabe" data-feld="k" value="${esc(e.k)}" placeholder="z. B. R1T" maxlength="12" autocapitalize="characters" autocomplete="off"></div>
      <div class="wahl zwei-sp">${wahlKnopf('sa-frei', '0', 'Dienst mit Uhrzeit', !e.frei)}${wahlKnopf('sa-frei', '1', 'Ganztägig (Urlaub, krank)', !!e.frei)}</div>
      ${e.frei ? '<p class="hinweistext">Ganztägige Einträge stehen nur zur Übersicht im Kalender. Zuschläge gibt es dafür nicht.</p>' : `<div class="zwei">
        <div class="feld"><label for="sa-von">Beginn</label><input id="sa-von" class="eingabe" type="time" data-feld="von" value="${esc(e.von)}"></div>
        <div class="feld"><label for="sa-bis">Ende</label><input id="sa-bis" class="eingabe" type="time" data-feld="bis" value="${esc(e.bis)}"></div></div>
      <p class="hinweistext">Endet der Dienst am nächsten Morgen (z. B. 19:00–07:00), rechnet die App über Mitternacht.</p>
      <button class="schalter" role="switch" aria-checked="${saPauschale(eb)}" data-a="sa-pauschale"><span class="t">Dienstpauschale ${R.euro(DRK.DIENSTPAUSCHALE)} je Schicht<br><span class="klein">§ 23 b: bei verlängerter Arbeitszeit mit Arbeitsbereitschaft, z. B. Rettungswagen – nicht bei Fortbildung oder Büro</span></span><span class="spur"></span></button>`}
      ${eb.alt ? '<p class="hinweistext">Neue Uhrzeiten gelten für Tage, die du ab jetzt antippst. Schon eingetragene Dienste behalten ihre Zeit.</p>' : ''}
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      <div class="knopfreihe">${eb.alt ? '<button class="knopf leise" data-a="sa-loeschen">Löschen</button>' : '<button class="knopf leise" data-a="schliessen">Abbrechen</button>'}<button class="knopf haupt breit" data-a="sa-speichern">Speichern</button></div>`, 'Schichtart');
  },
  monatsstunden: (eb) => {
    const e = eb.entwurf;
    const st = DI.stundenAusDiensten(z.daten.dienste, eb.monat, DI.land(z.daten), schichtarten());
    const feld = (id, label, f, platz) => `<div class="feld"><label for="${id}">${label}</label><input id="${id}" class="eingabe" inputmode="decimal" data-feld="${f}" value="${esc(e[f] ?? '')}" placeholder="${esc(platz)}"></div>`;
    return sheet(`<h2>Stunden laut Arbeitgeber · ${esc(monatJahr(eb.monat))}</h2>
      <p class="hinweistext">Die Summen stehen unten auf deiner Monatsübersicht bei „Lohnarten“. Sie gelten vor den Diensten, sobald der Monat abgerechnet ist.</p>
      <div class="zwei">${feld('ms-nacht', 'Nacht gesamt (Std.)', 'nacht', st.anzahl ? 'Dienste: ' + std(st.nacht) : 'z. B. 40')}${feld('ms-nacht04', 'davon 0–4 Uhr', 'nacht04', st.anzahl ? 'Dienste: ' + std(st.nacht04) : 'z. B. 16')}</div>
      <div class="zwei">${feld('ms-sonntag', 'Sonntag (Std.)', 'sonntag', st.anzahl ? 'Dienste: ' + std(st.sonntag) : 'z. B. 12')}${feld('ms-feiertag', 'Feiertag (Std.)', 'feiertag', st.anzahl ? 'Dienste: ' + std(st.feiertag) : 'z. B. 0')}</div>
      ${feld('ms-pauschale', 'Dienstpauschale in € (Lohnart 258, § 23 b)', 'pauschale', st.anzahl ? 'Dienste: ' + std(st.pauschalDienste * DRK.DIENSTPAUSCHALE) : 'z. B. 120')}
      ${R.ymTeile(eb.monat).monat === 12 ? feld('ms-vorfest', '24./31.12. ab 14 Uhr (Std.)', 'vorfest', st.anzahl ? 'Dienste: ' + std(st.vorfest) : 'z. B. 0') : ''}
      <button class="schalter" role="switch" aria-checked="${!!e.fertig}" data-a="ms-fertig"><span class="t">Monat ist abgerechnet<br><span class="klein">${e.fertig ? 'Diese Stunden gelten für die Schätzung' : 'Zwischenstand – gerechnet wird weiter mit den Diensten'}</span></span><span class="spur"></span></button>
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      <div class="knopfreihe">${eb.vorhanden ? '<button class="knopf leise" data-a="ms-loeschen">Löschen</button>' : '<button class="knopf leise" data-a="schliessen">Abbrechen</button>'}<button class="knopf haupt breit" data-a="ms-speichern">Speichern</button></div>`, 'Stunden laut Arbeitgeber');
  },
  'dienste-import': (eb) => sheet(`<h2>Dienste einlesen</h2>
      <p class="hinweistext"><b>${eb.dienste.length} Dienste</b> von ${esc(monatJahr(eb.monate[0]))} bis ${esc(monatJahr(eb.monate[eb.monate.length - 1]))} gefunden (${eb.monate.length === 1 ? '1 Monat' : eb.monate.length + ' Monate'}).</p>
      <p class="hinweistext">Für diese Monate ersetzt die Datei, was hier schon steht. Andere Monate bleiben. Uhrzeiten kommen aus der Datei${eb.neueArten.length ? `; neu als Schichtart: ${esc(eb.neueArten.join(', '))}` : ''}.</p>
      <div class="knopfreihe"><button class="knopf leise" data-a="schliessen">Abbrechen</button><button class="knopf haupt breit" data-a="ds-import-ja">Einlesen</button></div>`, 'Dienste einlesen'),
  'mue-import': (eb) => {
    const r = eb.ergebnis;
    const zeile = (x) => `<div class="gr-zeile"><span>${esc(x.nr + ' ' + x.name)}<small class="gr-fund">${x.art ? { nacht: 'zählt als Nacht', nacht04: 'zählt als Nacht 0–4 Uhr', sonntag: 'zählt als Sonntag', feiertag: 'zählt als Feiertag', vorfest: 'zählt als 24./31.12.', pauschale: `Dienstpauschale § 23 b in € = ${std(x.stunden / DRK.DIENSTPAUSCHALE)} Schichten` }[x.art] : 'wird nicht verwendet'}</small></span><b>${x.art === 'pauschale' ? R.euro(x.stunden) : std(x.stunden) + ' Std.'}</b></div>`;
    return sheet(`<h2>Monatsübersicht ${esc(monatJahr(r.monat))}</h2>
      <p class="hinweistext">${r.fertig ? '✓ Der Monat ist vorbei – die Stunden gelten als abgerechnet und ersetzen die Rechnung aus den Diensten.' : `Zwischenstand${r.stand ? ' vom ' + esc(new Date(r.stand + 'T12:00:00').toLocaleDateString('de-DE')) : ''}: Der Monat läuft noch. Die Stunden werden nur als Zwischenstand gemerkt, gerechnet wird mit den Diensten.`}</p>
      ${r.lohnarten.length ? `<div class="label">Lohnarten</div>${r.lohnarten.map(zeile).join('')}` : '<p class="hinweistext">Noch keine Lohnarten in der Übersicht.</p>'}
      <p class="hinweistext">${eb.fertig.length ? `${eb.fertig.length === 1 ? '1 Dienst' : eb.fertig.length + ' Dienste'} im ${esc(monatsName(r.monat))} werden in den Kalender übernommen und ersetzen, was dort für diesen Monat steht.` : 'Keine Dienste in der Übersicht.'}${eb.ohne.length ? ` ${eb.ohne.length === 1 ? '1 Dienst hat' : eb.ohne.length + ' Dienste haben'} noch keine Uhrzeit (${esc([...new Set(eb.ohne.map((x) => x.k))].join(', '))}) – dafür bitte die Schichtart anlegen.` : ''}</p>
      ${(() => {
        const t = eb.tage; if (!t || !t.imKalender) return '';
        const tag = (d) => Number(d.slice(8)) + '.' + Number(d.slice(5, 7)) + '.';
        if (!t.unterschiede.length) return `<div class="abgleich gut"><b>✓ Deckt sich mit deinem Kalender</b><span>${t.gleich === 1 ? '1 Dienst' : t.gleich + ' Dienste'} im ${esc(monatsName(r.monat))} sind gleich.</span></div>`;
        return `<div class="abgleich warn"><b>≠ ${t.unterschiede.length === 1 ? '1 Tag weicht' : t.unterschiede.length + ' Tage weichen'} von deinem Kalender ab</b>${t.unterschiede.slice(0, 10).map((u) => `<span>${tag(u.d)} · Kalender: ${u.kal ? esc(u.kal) : 'kein Dienst'} · Übersicht: ${u.ueb ? esc(u.ueb) : 'kein Dienst'}</span>`).join('')}${t.unterschiede.length > 10 ? `<span>… und ${t.unterschiede.length - 10} weitere</span>` : ''}<span>Mit „Übernehmen“ gilt die Übersicht.</span></div>`;
      })()}
      ${(() => {
        const g = eb.gerechnet; if (!g) return '';
        const zeilen = [['Nacht', r.stunden.nacht, g.nacht, 'Std.'], ['davon 0–4 Uhr', r.stunden.nacht04, g.nacht04, 'Std.'], ['Sonntag', r.stunden.sonntag, g.sonntag, 'Std.'], ['Feiertag', r.stunden.feiertag, g.feiertag, 'Std.'], ['Dienstpauschale', r.stunden.pauschale, g.pauschalDienste * DRK.DIENSTPAUSCHALE, '€']].filter((x) => x[1] > 0 || x[2] > 0);
        if (!zeilen.length) return '';
        const ab = zeilen.filter((x) => Math.abs(x[1] - x[2]) > 0.01);
        return `<div class="label">Arbeitgeber ↔ aus den Diensten gerechnet</div><div class="vgl-tabelle">${zeilen.map((x) => `<div class="vgl-zeile ${Math.abs(x[1] - x[2]) > 0.01 ? 'ab' : ''}"><span>${x[0]}</span><b>${std(x[1])} ${x[3]}</b><b>${std(x[2])} ${x[3]}</b><i>${Math.abs(x[1] - x[2]) > 0.01 ? '≠' : '✓'}</i></div>`).join('')}</div>
          <p class="hinweistext">${ab.length ? 'Es gilt, was dein Arbeitgeber abgerechnet hat. Unterschiede entstehen z. B. durch getauschte Dienste oder andere Uhrzeiten.' : 'Die App rechnet die Stunden wie dein Arbeitgeber.'}</p>`;
      })()}
      <div class="knopfreihe"><button class="knopf leise" data-a="schliessen">Abbrechen</button><button class="knopf haupt breit" data-a="mue-import-ja">Übernehmen</button></div>`, 'Monatsübersicht');
  },
  start: () => sheet(`<h2>Willkommen</h2>
    <p class="hinweistext">Die App läuft komplett ohne Internet. Deine Daten bleiben auf diesem Handy.</p>
    <button class="knopf haupt" data-a="start-einrichten">Gemeinsam einrichten (ca. 5 Min.)</button>
    <button class="knopf" data-a="start-beispiel">Mit Beispiel ausprobieren</button>
    <button class="knopf leise" data-a="start-leer">Leer anfangen</button>
    <button class="knopf leise" data-a="import">Sicherung importieren</button>`, 'Willkommen'),

  bereich: (eb) => bereichHtml(eb),
  eintragen: (eb) => {
    const e = eb.entwurf;
    if (e.art === 'uebertrag') return uebertragHtml(eb);
    const aus = e.art === 'ausgabe';
    const kat = R.kategorie(z.daten, e.kategorieId);
    const kats = budgetKats().map((k) => `<button class="chip" data-a="et-kat" data-wert="${esc(k.id)}" aria-pressed="${e.kategorieId === k.id}">${esc(mitEmoji(k) + k.name)}</button>`).join('');
    const orte = aus && kat && (kat.chips || []).length ? `<div class="label">${esc(kat.frage || 'Wo?')} (optional)</div><div class="chips">${kat.chips.map((c) => `<button class="chip" data-a="et-ort" data-wert="${esc(c)}" aria-pressed="${e.ort === c}">${esc(c)}</button>`).join('')}</div>` : '';
    const namen = !aus ? `<div class="label">Was?</div><div class="chips">${EINNAHME_VORSCHLAEGE.map((v) => `<button class="chip" data-a="et-name" data-wert="${esc(v)}" aria-pressed="${e.name === v}">${esc(v)}</button>`).join('')}</div>
      <input class="eingabe" data-feld="name" value="${esc(e.name)}" placeholder="oder selbst eintragen" aria-label="Name der Einnahme">` : '';
    return sheet(`${eintragenWahl(e.art)}
      ${e.unbekannt ? offenKasten(e, aus) : `<div class="betrag-gross ${aus ? 'minus' : 'plus'}"><span>${aus ? '−' : '+'}</span><input id="et-betrag" class="eingabe" inputmode="decimal" data-feld="betragText" value="${esc(e.betragText)}" placeholder="0" aria-label="Betrag in Euro"><span>€</span></div>${OFFEN_LINK}`}
      ${aus ? `<div class="label">Kategorie</div><div class="chips">${kats || '<span class="klein">Noch keine Budgets angelegt.</span>'}</div>${orte}${e.unbekannt ? '' : teilenHtml(e)}` : namen}
      <div class="feld"><label for="et-datum">Datum</label><input id="et-datum" class="eingabe" type="date" data-feld="datum" value="${esc(e.datum)}"></div>
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      <div class="knopfreihe"><button class="knopf leise" data-a="schliessen">Abbrechen</button><button class="knopf haupt breit" data-a="et-speichern">${aus ? 'Ausgabe buchen' : 'Einnahme eintragen'}</button></div>`, 'Eintragen');
  },
  vorschlaege: (eb) => {
    const liste = z.vorschlaege || [];
    const v = liste[0];
    if (!v) return sheet('<h2>Erkannte Zahlungen <span class="beta">BETA</span></h2><p class="hinweistext">Alles erledigt.</p><button class="knopf haupt" data-a="schliessen">Fertig</button>', 'Erkannte Zahlungen');
    const e = eb.entwurf;
    const doppelt = aehnlicheBuchung(v);
    const dk = doppelt && R.kategorie(z.daten, doppelt.kategorieId);
    const d = new Date(Date.parse(v.zeit));
    const wann = `${d.getDate()}. ${R.MONATE_KURZ[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return sheet(`<h2>Erkannte Zahlung <span class="beta">BETA</span></h2>
      <p class="hinweistext">${liste.length > 1 ? `1 von ${liste.length} · ` : ''}über ${esc(v.appName || v.app)} · ${esc(wann)}</p>
      <div class="betrag-gross minus"><span>−</span><input id="vs-betrag" class="eingabe" inputmode="decimal" data-feld="betragText" value="${esc(e.betragText)}" aria-label="Betrag in Euro"><span>€</span></div>
      <div class="feld"><label for="vs-ort">Wo?</label><input id="vs-ort" class="eingabe" data-feld="ort" value="${esc(e.ort)}" placeholder="z. B. Edeka"></div>
      <div class="label">Kategorie</div><div class="chips">${budgetKats().map((k) => `<button class="chip" data-a="et-kat" data-wert="${esc(k.id)}" aria-pressed="${e.kategorieId === k.id}">${esc(mitEmoji(k) + k.name)}</button>`).join('')}</div>
      ${doppelt ? `<p class="hinweistext warn-text">Schon gebucht? Es gibt bereits ${R.euro(doppelt.betrag)} in ${esc(dk ? dk.name : 'einer Kategorie')} am ${Number(doppelt.zeit.slice(8, 10))}.${Number(doppelt.zeit.slice(5, 7))}. Dann „Ignorieren“.</p>` : ''}
      <details class="vs-text"><summary>Originale Benachrichtigung</summary><p>${esc(v.text || '')}</p></details>
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      <div class="knopfreihe"><button class="knopf leise" data-a="vs-ignorieren">Ignorieren</button><button class="knopf haupt breit" data-a="vs-buchen">Buchen</button></div>
      <p class="hinweistext">Beta: Die Erkennung wird noch erprobt. Betrag und Ort bitte kurz prüfen.</p>`, 'Erkannte Zahlung');
  },
  monatsende: (eb) => {
    const e = eb.entwurf; const s = eb.monat;
    const { uebrig, ungenutzt } = R.uebrigIm(z.daten, s);
    const name = monatsName(s);
    if (uebrig < 0) return sheet(`<h2>Ende ${esc(name)}</h2>
      <p class="hinweistext">Im ${esc(name)} ist ≈ <b class="minus-zahl">${R.euroRund(-uebrig)}</b> mehr rausgegangen als reingekommen.</p>
      <div class="knopfreihe"><button class="knopf leise" data-a="schliessen">Später</button><button class="knopf haupt breit" data-a="me-giro">Verstanden, abschließen</button></div>`, 'Monatsende');
    const g = gehalt();
    if (g && R.schaetzung(g) > 0 && !R.gehaltBestaetigt(g, s)) {
      return sheet(`<h2>Ende ${esc(name)}</h2>
        <p class="hinweistext">Erst kurz das Gehalt: Netto schwankt, damit der Rest stimmt.</p>
        <div class="label">Was kam im ${esc(name)} wirklich an?</div>
        <div class="betrag-gross plus"><span>+</span><input id="me-gehalt" class="eingabe" inputmode="decimal" value="${esc(R.euro(R.schaetzung(g), false))}" aria-label="Gehalt in Euro"><span>€</span></div>
        ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
        <div class="knopfreihe"><button class="knopf leise" data-a="schliessen">Später</button><button class="knopf haupt breit" data-a="me-gehalt">Weiter</button></div>`, 'Monatsende');
    }
    const konten = alleKonten();
    let teil = '';
    if (e.wahl === 'konto') teil = `<div class="betrag-gross"><span>→</span><input id="me-betrag" class="eingabe" inputmode="decimal" data-feld="betragText" value="${esc(e.betragText)}" aria-label="Betrag in Euro"><span>€</span></div>
      <div class="label">Auf welches Konto?</div><div class="chips">${konten.map((k) => `<button class="chip" data-a="et-ziel" data-wert="${esc(k.id)}" aria-pressed="${e.kontoId === k.id}">${esc(k.name || 'Rücklagenkonto')}</button>`).join('')}<button class="chip" data-a="et-konto-neu">${ICON.plus} Neues Konto</button></div>`;
    if (e.wahl === 'ausgabe') teil = `<div class="betrag-gross minus"><span>−</span><input id="me-betrag" class="eingabe" inputmode="decimal" data-feld="betragText" value="${esc(e.betragText)}" aria-label="Betrag in Euro"><span>€</span></div>
      <div class="label">Wofür ungefähr?</div><div class="chips">${budgetKats().map((k) => `<button class="chip" data-a="et-kat" data-wert="${esc(k.id)}" aria-pressed="${e.kategorieId === k.id}">${esc(mitEmoji(k) + k.name)}</button>`).join('')}</div>`;
    return sheet(`<h2>Ende ${esc(name)}</h2>
      <div class="grosszahl" style="font-size:var(--t-zahl-xl)">≈ ${R.euroRund(uebrig)} <span style="font-size:var(--t-titel-karte);color:var(--gedaempft)">übrig</span></div>
      ${ungenutzt >= 1 ? `<p class="hinweistext">Davon ≈ ${R.euroRund(ungenutzt)} aus Budgets, die du nicht ganz gebraucht hast.</p>` : ''}
      <div class="label">Was ist damit passiert?</div>
      <div class="me-wahl">
        ${wahlKnopf('me-wahl', 'konto', '⇄ Auf ein Konto geschoben', e.wahl === 'konto')}
        ${wahlKnopf('me-wahl', 'ausgabe', '− Ausgegeben, nicht eingetragen', e.wahl === 'ausgabe')}
        <button data-a="me-giro">Liegt noch auf dem Girokonto</button>
      </div>
      ${teil}
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      <div class="knopfreihe"><button class="knopf leise" data-a="schliessen">Später</button>${e.wahl ? `<button class="knopf haupt breit" data-a="me-speichern">${e.wahl === 'konto' ? 'Übertragen' : 'Eintragen'}</button>` : ''}</div>
      <p class="hinweistext">Teilen geht auch: z. B. erst 100 € aufs Tagesgeld, danach fragt die App nach dem Rest.</p>`, 'Monatsende');
  },
  katalog: () => {
    const da = new Set(kachelListe().map((k) => k.id));
    const ids = Object.keys(KACHEL_KATALOG).concat(budgetKats().map((k) => 'budget:' + k.id)).filter((id) => !da.has(id));
    return sheet(`<h2>Kachel hinzufügen</h2>${ids.length ? ids.map((id) => { const a = kachelArt(id); return `<button class="knopf voll katalog-eintrag" data-a="kachel-dazu" data-wert="${esc(id)}"><span><b>${esc(a.titel)}</b><small>${esc(a.beschreibung)}</small></span>${ICON.plus}</button>`; }).join('') : '<p class="hinweistext">Alle Kacheln sind schon auf der Übersicht.</p>'}`, 'Kachel hinzufügen');
  },
  kachelmenue: (eb) => {
    const k = kachelListe().find((x) => x.id === eb.id); const a = kachelArt(eb.id);
    return sheet(`<h2>${esc(a ? a.titel : '')}</h2>
      <div class="label">Größe</div>
      <div class="wahl zwei-sp">${wahlKnopf('kachel-breit', '0', 'halbe Breite', !(k && k.breit))}${wahlKnopf('kachel-breit', '1', 'ganze Breite', !!(k && k.breit))}</div>
      <p class="hinweistext">Zum Verschieben die Kachel lang drücken und ziehen.</p>
      <div class="knopfreihe"><button class="knopf leise" data-a="schliessen">Fertig</button><button class="knopf breit" data-a="kachel-weg">Von der Übersicht entfernen</button></div>`, 'Kachel');
  },
  einfuehrung: (eb) => E.einfuehrungHtml(eb, { esc, ICON, z, kopie, heuteYm, monatsName, zahl }),

  neu: () => sheet(`<h2>Neu in ${APP_VERSION}</h2><ul class="hinweistext" style="padding-left:18px;margin:0">${NEU_IN_VERSION.map((t) => `<li>${esc(t)}</li>`).join('')}</ul><button class="knopf haupt" data-a="schliessen">Verstanden</button>`, 'Was ist neu'),

  fixkosten: (eb) => {
    const f = eb.entwurf;
    const kat = R.kategorie(z.daten, f.kategorieId) || fixKats()[0];
    const monatlich = f.wieOft === 'monatlich';
    const aktiv = monatlich ? [] : R.abbuchungsMonate(f);
    const rhythmen = ['monatlich', 'vierteljaehrlich', 'halbjaehrlich', 'jaehrlich'].map((r) => wahlKnopf('fk-rhythmus', r, R.RHYTHMUS_TEXT[r], f.wieOft === r)).join('');
    const monate = R.MONATE_KURZ.map((m, i) => wahlKnopf('fk-monat', i + 1, m, aktiv.includes(i + 1))).join('');
    const betrag = zahl(f.betragText);
    let zus = '';
    if (!isNaN(betrag) && betrag > 0) {
      const eigen = R.eigenerBetrag(Object.assign({}, f, { betrag, meinAnteil: fkAnteil(f) || 100 }));
      zus = monatlich ? `Wird jeden Monat am ${f.tag}. abgebucht: ${R.euro(eigen)}.`
        : `Wird am ${f.tag}. abgebucht: ${aktiv.map((m) => f.wieOft === 'jaehrlich' ? R.MONATE_LANG[m - 1] : R.MONATE_KURZ[m - 1]).join(', ')}. ${R.ruecklage(z.daten) ? 'Bezahlt aus dem Rücklagenkonto' : 'Zählt im Monat der Abbuchung voll'}, auf den Monat gerechnet ≈ ${R.euro(Math.round(R.monatsAnteil(Object.assign({}, f, { betrag, meinAnteil: fkAnteil(f) || 100 })) * 100) / 100)}.`;
    } else zus = 'Trage einen Betrag ein.';
    if (f.unbekannt) zus = `Betrag noch unbekannt. ${offenHinweis(f, true)}`;
    const mehr = eb.mehr ? `<section class="karte">
        <button class="schalter" role="switch" aria-checked="${!!f.abo}" data-a="fk-abo"><span class="t">Ist ein Abo<br><span class="klein">Abos stehen gesammelt und lassen sich kündigen</span></span><span class="spur"></span></button>
        <div class="feld"><label for="fk-anteil">Davon zahlst du selbst (€) – leer = alles</label><input id="fk-anteil" class="eingabe" inputmode="decimal" data-feld="meinText" data-neu-zeichnen="1" value="${esc(f.meinText || '')}" placeholder="z. B. 525"></div>
        <div data-geteilt>${geteiltFelder(f)}</div>
        <div class="feld"><label for="fk-konto">Abgebucht von Konto (optional)</label><input id="fk-konto" class="eingabe" data-feld="konto" value="${esc(f.konto || '')}" placeholder="z. B. Girokonto ••4417"></div>
        <div class="feld"><label for="fk-ende">Endet am (z. B. gekündigt zum)</label><input id="fk-ende" class="eingabe" type="date" data-feld="endetAm" value="${esc(f.endetAm || '')}"></div>
        ${(f.frueher || []).length ? `<div class="frueher"><div class="label">Frühere Beträge</div>${[...f.frueher].sort((a, b) => (a.bis < b.bis ? -1 : 1)).map((x) => `<div class="gr-zeile"><span>bis ${esc(R.MONATE_KURZ[R.ymTeile(x.bis).monat - 1])} ${R.ymTeile(x.bis).jahr}</span><b>${R.euro(R.eigenerBetrag({ betrag: x.betrag, meinAnteil: x.meinAnteil == null ? f.meinAnteil : x.meinAnteil }))}</b></div>`).join('')}<button class="knopf klein leise" data-a="fk-frueher-weg">Frühere Beträge vergessen</button></div>` : ''}
        <div class="feld"><label for="fk-frist">Kündigungsfrist</label><select id="fk-frist" class="eingabe" data-feld="kuendigungsfrist">${[['', 'keine / weiß nicht'], ['2w', '2 Wochen'], ['1m', '1 Monat'], ['3m', '3 Monate']].map(([w, t]) => `<option value="${w}" ${(f.kuendigungsfrist || '') === w ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      </section>` : '';
    return seite(eb.id ? (f.abo ? 'Abo bearbeiten' : 'Fixkosten bearbeiten') : (f.abo ? 'Neues Abo' : 'Neue Fixkosten'), `
      <section class="karte">
        <div class="feld"><label for="fk-name">Name</label><input id="fk-name" class="eingabe" data-feld="name" value="${esc(f.name)}" placeholder="${f.abo ? 'z. B. Netflix' : 'z. B. Kfz-Versicherung'}" autocomplete="off"></div>
        <div class="zwei">
          <div class="feld"><label for="fk-betrag">Betrag</label>${f.unbekannt ? offenFeldAus : `<input id="fk-betrag" class="eingabe" inputmode="decimal" data-feld="betragText" data-neu-zeichnen="1" value="${esc(f.betragText)}" placeholder="0 €">`}</div>
          <div class="feld"><span class="label">Kategorie</span><button class="eingabe" style="display:flex;align-items:center;gap:8px;text-align:left" data-a="fk-kategorie"><i class="punkt" style="background:${kat ? kat.farbe : '#888'}"></i>${esc(kat ? kat.name : 'wählen')}</button></div>
        </div>
        ${f.unbekannt ? offenKasten(f, true) : OFFEN_LINK}
        <div data-giltab>${giltAbHtml(eb)}</div>
      </section>
      <section class="karte">
        <div class="label">Wie oft wird abgebucht?</div>
        <div class="wahl zwei-sp">${rhythmen}</div>
        <div class="label">An welchem Tag?</div>
        <div class="stepper"><button class="knopf rund" data-a="fk-tag" data-wert="-1" aria-label="Tag früher">−</button><button class="wert" data-a="tag-wahl" aria-label="Tag wählen">am ${f.tag}.</button><button class="knopf rund" data-a="fk-tag" data-wert="1" aria-label="Tag später">+</button></div>
        ${monatlich ? '' : `<div class="label">${f.wieOft === 'jaehrlich' ? 'In welchem Monat?' : 'Ab welchem Monat? (die anderen folgen)'}</div><div class="wahl sechs">${monate}</div>`}
      </section>
      <section class="zusammenfassung" aria-live="polite" data-zusammenfassung>${esc(zus)}</section>
      <button class="mehr-knopf" data-a="mehr" aria-expanded="${!!eb.mehr}">${eb.mehr ? ICON.hoch + ' Weniger' : ICON.runter + ' Mehr: Abo, Anteil, Ende, Kündigung'}</button>
      ${mehr}
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      <div class="abstand"></div>
      <div class="knopfreihe">${eb.id ? '<button class="knopf leise" data-a="fk-loeschen">Löschen</button>' : '<button class="knopf leise" data-a="schliessen">Abbrechen</button>'}<button class="knopf haupt breit" data-a="fk-speichern">Speichern</button></div>`);
  },

  'kategorie-wahl': (eb, i) => {
    const unter = z.ebenen[i - 1];
    const liste = fixKats().map((k) => `<button class="knopf voll" style="justify-content:flex-start" data-a="kategorie-gewaehlt" data-wert="${esc(k.id)}" aria-pressed="${unter && unter.entwurf.kategorieId === k.id}"><i class="punkt" style="background:${k.farbe}"></i>${esc(mitEmoji(k) + k.name)}</button>`).join('');
    return sheet(`<h2>Kategorie</h2>${liste}<button class="knopf akzent" data-a="kategorie-neu">${ICON.plus} Neue Kategorie</button>`, 'Kategorie wählen');
  },

  'tag-wahl': (eb, i) => {
    const unter = z.ebenen[i - 1];
    const tage = Array.from({ length: 31 }, (_, k) => wahlKnopf('tag-gewaehlt', k + 1, String(k + 1), unter.entwurf.tag === k + 1)).join('');
    return sheet(`<h2>An welchem Tag?</h2><div class="wahl sieben">${tage}</div><p class="hinweistext">Gibt es den Tag in einem Monat nicht (z. B. 31.), zählt der letzte Tag des Monats.</p>`, 'Tag wählen');
  },

  kategorie: (eb) => {
    const e = eb.entwurf;
    const inhalt = eb.nurFarbe ? '' : `<div class="feld"><label for="kn-name">Name</label><input id="kn-name" class="eingabe" data-feld="name" value="${esc(e.name)}" placeholder="z. B. Mobilität"></div>`;
    const emoji = eb.nurFarbe ? '' : `<div class="feld"><label for="kn-emoji">Emoji (optional)</label><div class="zwei" style="grid-template-columns:90px 1fr"><input id="kn-emoji" class="eingabe emoji-feld" data-feld="emoji" value="${esc(e.emoji || '')}" placeholder="🙂" maxlength="8"><span class="hinweistext" style="align-self:center">Eigenes Emoji über die Tastatur oder unten antippen</span></div>
      <div class="emoji-wahl">${EMOJIS.map((x) => `<button class="emoji-knopf" data-a="kn-emoji" data-wert="${x}" aria-pressed="${e.emoji === x}" aria-label="Emoji ${x}">${x}</button>`).join('')}<button class="emoji-knopf" data-a="kn-emoji" data-wert="" aria-label="Kein Emoji">${ICON.x}</button></div></div>`;
    const farben = `<div class="label">Farbe der Karte</div><div class="farb-wahl">${FARBEN.map((c) => `<button class="farb-knopf" data-a="kn-farbe" data-wert="${c}" aria-pressed="${e.farbe === c}" aria-label="Farbe ${c}" style="--f:${c}"></button>`).join('')}</div>
      <div class="vorschau" style="--kat:${e.farbe}">${e.emoji ? `<span class="kat-zeichen">${esc(e.emoji)}</span>` : '<i class="kat-farbe"></i>'}<b>${esc(e.name || 'Vorschau')}</b></div>`;
    const loeschen = eb.id && !eb.nurFarbe ? '<button class="knopf leise" data-a="kn-loeschen">Löschen</button>' : '<button class="knopf leise" data-a="schliessen">Abbrechen</button>';
    return sheet(`<h2>${eb.nurFarbe ? 'Budgets' : eb.id ? 'Kategorie bearbeiten' : 'Neue Kategorie'}</h2>${inhalt}${emoji}${farben}
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      <div class="knopfreihe">${loeschen}<button class="knopf haupt breit" data-a="kn-speichern">${eb.id || eb.nurFarbe ? 'Speichern' : 'Anlegen'}</button></div>`, 'Kategorie');
  },

  budget: (eb) => {
    const b = eb.entwurf;
    const moegliche = [-10, -5, 5, 10, 20, 50];
    const schritte = moegliche.map((w) => wahlKnopf('bu-schritt', w, (w > 0 ? '+ ' : '− ') + Math.abs(w), b.schritte.includes(w))).join('');
    const chips = b.chips.map((c, k) => `<button class="chip" data-a="bu-chip-weg" data-wert="${k}" aria-label="${esc(c)} entfernen">${esc(c)} <span class="x">${ICON.x}</span></button>`).join('');
    const ausgegeben = eb.id ? R.ausgegebenIm(z.daten, heuteYm(), eb.id) : 0;
    return seite(eb.id ? 'Budget bearbeiten' : 'Neues Budget', `
      <section class="karte">
        <div class="feld"><label for="bu-name">Name</label><input id="bu-name" class="eingabe" data-feld="name" value="${esc(b.name)}" placeholder="z. B. Drogerie"></div>
        <div class="feld"><label for="bu-emoji">Emoji (optional, erscheint auch im Widget)</label><input id="bu-emoji" class="eingabe emoji-feld" data-feld="emoji" value="${esc(b.emoji || '')}" placeholder="🙂" maxlength="8"></div>
        <div class="emoji-wahl">${EMOJIS.map((x) => `<button class="emoji-knopf" data-a="bu-emoji" data-wert="${x}" aria-pressed="${b.emoji === x}" aria-label="Emoji ${x}">${x}</button>`).join('')}</div>
        <div class="feld"><label for="bu-betrag">Budget pro Monat</label><input id="bu-betrag" class="eingabe" inputmode="decimal" data-feld="budgetText" value="${esc(b.budgetText)}" placeholder="0 € = ohne Budget"></div>
        ${eb.id ? `<div class="klein">Im ${esc(monatsName(heuteYm()))} schon ausgegeben: ${rausSatz(ausgegeben)}</div>` : ''}
      </section>
      <section class="karte">
        <div class="label">Knöpfe im Widget (bis zu 3)</div>
        <div class="wahl sechs" style="grid-template-columns:repeat(3,minmax(0,1fr))">${schritte}</div>
        <p class="hinweistext">So viel bucht ein Tipp im Widget. Genaue Beträge: ＋ in der App oder auf den Betrag im Widget tippen.</p>
      </section>
      <section class="karte">
        <div class="label">Nach dem Buchen fragen</div>
        <div class="wahl zwei-sp">${wahlKnopf('bu-frage', 'Wo?', 'Wo?', b.frage === 'Wo?')}${wahlKnopf('bu-frage', 'Wofür?', 'Wofür?', b.frage === 'Wofür?')}</div>
        <div class="chips">${chips || '<span class="klein">Noch keine Auswahl.</span>'}</div>
        <div class="zwei" style="grid-template-columns:1fr auto"><input class="eingabe" data-feld="neuerChip" value="${esc(b.neuerChip || '')}" placeholder="${b.frage === 'Wo?' ? 'z. B. Edeka' : 'z. B. Geschenke'}" aria-label="Neue Auswahl"><button class="knopf" data-a="bu-chip-dazu">Dazu</button></div>
        <p class="hinweistext">Im Widget erscheinen bis zu 4 davon zum Antippen.</p>
      </section>
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      <div class="abstand"></div>
      <div class="knopfreihe">${eb.id ? '<button class="knopf leise" data-a="bu-loeschen">Löschen</button>' : '<button class="knopf leise" data-a="schliessen">Abbrechen</button>'}<button class="knopf haupt breit" data-a="bu-speichern">Speichern</button></div>`);
  },

  gehalt: (eb) => {
    const g = gehalt();
    const s = eb.monat;
    const w = R.einnahmeIm(g, s);
    return sheet(`<h2>${esc(g.name)} im ${esc(monatsName(s))}</h2>
      <div class="feld"><label for="ge-ist">Was kam an?</label><input id="ge-ist" class="eingabe" inputmode="decimal" data-feld="istText" value="${esc(eb.istText)}" placeholder="z. B. ${esc(R.euro(w.schaetzung, false))}"></div>
      <p class="hinweistext">Geschätzt: <b>${R.euro(w.schaetzung)}</b>. Leer lassen = die Schätzung gilt (≈). Netto, so wie es auf dem Konto ankommt.</p>
      ${(() => {
        const x = DI.gehaltSchaetzung(z.daten, s);
        if (!x) return `<button class="knopf leise" data-a="dienste">📅 Gehalt aus den Diensten schätzen lassen</button>`;
        const st = x.stunden; const mon = monatsName(st.monat);
        const woher = st.quelle === 'abrechnung' ? `Monatsübersicht ${mon} (abgerechnet)` : st.quelle === 'dienste' ? `Dienste im ${mon}` : `Durchschnitt – für ${mon} sind keine Dienste eingetragen`;
        return `<div class="lern-box schaetz-box"><span>Aus den Diensten: <b>≈ ${R.euroRund(x.netto)}</b> · Zuschläge ≈ ${R.euroRund(x.zuschlaege)} brutto<br><small>${esc(woher)}${st.quelle !== 'schnitt' ? ` · Nacht ${std(st.nacht)} · Sonntag ${std(st.sonntag)} · Feiertag ${std((st.feiertag || 0) + (st.vorfest || 0))} Std.` : ''}</small></span><button class="knopf klein akzent" data-a="dienste" data-monat="${st.monat}">Dienste</button></div>`;
      })()}
      <div class="feld"><label for="ge-schaetzung">${DI.schaetzenAn(z.daten) ? 'Feste Schätzung (gilt, wenn die Dienst-Schätzung aus ist)' : 'Schätzung pro Monat'}</label><input id="ge-schaetzung" class="eingabe" inputmode="decimal" data-feld="schaetzungText" value="${esc(eb.schaetzungText)}"></div>
      <button class="knopf leise gr-start" data-a="gehaltsrechner" data-monat="${s}">🧮 Schätzung mit dem DRK-Gehaltsrechner ausrechnen</button>
      ${(() => { const st = lernHinweis(g); return st && Math.abs(st.schnitt - zahl(eb.schaetzungText)) >= 1 ? `<div class="lern-box"><span>Deine letzten 3 Monate: <b>Ø ${R.euroRund(st.schnitt)}</b> (${R.euroRund(st.min)}–${R.euroRund(st.max)})</span><button class="knopf klein akzent" data-a="ge-schnitt">Als Schätzung übernehmen</button></div>` : ''; })()}
      <div class="feld"><span class="label">Kommt an</span><div class="wahl zwei-sp">${wahlKnopf('ge-ankunft', 'Monatsende', 'am Monatsende', g.kommtAn !== 'Tag')}${wahlKnopf('ge-ankunft', 'Tag', 'an einem Tag', g.kommtAn === 'Tag')}</div></div>
      ${g.kommtAn === 'Tag' ? `<div class="feld"><label for="ge-tag">Am Tag</label><input id="ge-tag" class="eingabe" inputmode="numeric" data-feld="tagText" value="${esc(eb.tagText)}"></div>` : ''}
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      <div class="knopfreihe"><button class="knopf leise" data-a="schliessen">Abbrechen</button><button class="knopf haupt breit" data-a="ge-speichern">Speichern</button></div>`, 'Gehalt');
  },

  offene: () => {
    const liste = R.offeneListe(z.daten);
    const s = heuteYm();
    const mo = R.mitOffenem(z.daten, s);
    const zeile = (x) => {
      const o = x.eintrag.offen; const sp = R.offenSpanne(o);
      return `<div class="of-zeile"><button class="of-inhalt" data-a="of-oeffnen" data-typ="${x.typ}" data-id="${esc(x.id)}" aria-label="${esc(x.name)} bearbeiten">
          <span class="n">${esc(x.name)}</span><small>${esc([x.art, x.wann].filter(Boolean).join(' · '))}</small>
          <span class="of-wert ${o.zaehlt ? (x.kosten ? 'minus-zahl' : 'plus-zahl') : ''}">? ${esc(R.offenText(o))}${o.zaehlt && sp.hat ? ` · gerechnet mit ${R.euro(x.kosten ? sp.bis : sp.von)}` : ''}</span></button>
        <button class="schalter of-schalter" role="switch" aria-checked="${!!o.zaehlt}" data-a="of-um" data-typ="${x.typ}" data-id="${esc(x.id)}" data-name="${esc(x.name)}" aria-label="${esc(x.name)} mitrechnen"><span class="t klein">${o.zaehlt ? 'zählt mit' : 'zählt nicht'}</span><span class="spur"></span></button></div>`;
    };
    const kopf = mo ? `<section class="karte of-kopf"><div class="label">${esc(monatsName(s))}</div>
        <div class="gr-zeile"><span>Frei (so wie jetzt gerechnet)</span><b>${mo.frei < 0 ? '− ' : '≈ '}${R.euroRund(Math.abs(mo.frei))}</b></div>
        <div class="gr-zeile"><span>Wenn alles Offene ungünstig ausgeht</span><b class="${mo.min < 0 ? 'minus-zahl' : ''}">${mo.min < 0 ? '− ' : '≈ '}${R.euroRund(Math.abs(mo.min))}</b></div>
        <div class="gr-zeile"><span>Wenn alles Offene günstig ausgeht</span><b>${mo.max < 0 ? '− ' : '≈ '}${R.euroRund(Math.abs(mo.max))}</b></div>
        ${mo.ohne ? `<p class="hinweistext gr-mini">${mo.ohne === 1 ? '1 Eintrag hat' : mo.ohne + ' Einträge haben'} keine Schätzung und ${mo.ohne === 1 ? 'ist' : 'sind'} hier nicht enthalten.</p>` : ''}
        <div class="zwei"><button class="knopf klein" data-a="of-alle" data-wert="1">Alle mitrechnen</button><button class="knopf klein" data-a="of-alle" data-wert="0">Keinen mitrechnen</button></div></section>` : '';
    return seite('Offene Beträge', `
      <p class="hinweistext">Beträge, die du noch nicht kennst. Pro Eintrag entscheidest du: <b>Mitrechnen</b> (vorsichtig mit der Schätzung) oder <b>nicht mitrechnen</b> (bleibt nur zur Übersicht). Eintrag antippen, um den echten Betrag nachzutragen.</p>
      ${liste.length ? kopf + `<section class="karte liste of-liste">${liste.map(zeile).join('')}</section>` : '<section class="karte"><div class="leerzustand">Keine offenen Beträge.<br>Wenn du einen Betrag noch nicht kennst, tippe beim Eintragen auf „? Betrag unbekannt“.</div></section>'}
      <p class="hinweistext">„? Betrag unbekannt“ gibt es bei Fixkosten und Abos, Ausgaben (＋), Weiteren Einnahmen und beim Übertrag jeden Monat (Konto). Geplante Ausgaben haben schon „von–bis“ und zählen nie zu „Frei“.</p>`);
  },

  gehaltsrechner: (eb) => {
    const e = eb.entwurf;
    const r = DRK.gehaltRechnen(grEingaben(e), eb.monat);
    const stufen = DRK.stufen(e.eg, eb.monat);
    const feld = (id, label, f, platz, extra = '') => `<div class="feld"><label for="${id}">${label}</label><input id="${id}" class="eingabe" inputmode="decimal" data-feld="${f}" value="${esc(e[f] ?? '')}" placeholder="${esc(platz)}" ${extra}></div>`;
    // Feld mit „? unbekannt“: dann zwei Felder von/bis (v25)
    const feldO = (id, label, f, platz) => e[f + 'Offen']
      ? `<div class="feld"><div class="gr-feldkopf"><span class="label">${label}</span><button class="gr-frage" data-a="gr-offen" data-feld="${f}">Wert eintragen</button></div><div class="zwei"><input id="${id}" class="eingabe" inputmode="decimal" data-feld="${f}Von" value="${esc(e[f + 'Von'] ?? '')}" placeholder="ungefähr von" aria-label="${label} von"><input class="eingabe" inputmode="decimal" data-feld="${f}Bis" value="${esc(e[f + 'Bis'] ?? '')}" placeholder="bis" aria-label="${label} bis"></div></div>`
      : `<div class="feld"><div class="gr-feldkopf"><label for="${id}">${label}</label><button class="gr-frage" data-a="gr-offen" data-feld="${f}">? unbekannt</button></div><input id="${id}" class="eingabe" inputmode="decimal" data-feld="${f}" value="${esc(e[f] ?? '')}" placeholder="${esc(platz)}"></div>`;
    const schalter = (f, titel, unter) => `<button class="schalter" role="switch" aria-checked="${!!e[f]}" data-a="gr-schalter" data-feld="${f}"><span class="t">${titel}<br><span class="klein">${unter}</span></span><span class="spur"></span></button>`;
    const wahl = (f, liste) => liste.map(([w, t]) => `<button data-a="gr-wahl" data-feld="${f}" data-wert="${esc(w)}" aria-pressed="${String(e[f]) === String(w)}">${esc(t)}</button>`).join('');
    return seite('Gehaltsrechner', `
      <p class="hinweistext">Schätzung nach dem DRK-Reformtarifvertrag (Tabelle ab ${esc(r.tarif)}) und der Lohnsteuer 2026. Keine Lohnabrechnung – vergleiche das Ergebnis mit deiner echten Abrechnung.</p>
      <section class="karte gr-karte">
        <div class="label">Tarif</div>
        <div class="feld"><label for="gr-eg">Entgeltgruppe</label><select id="gr-eg" class="eingabe" data-feld="eg" data-ganz="1">${DRK.GRUPPEN.map((g) => `<option value="${g}" ${e.eg === g ? 'selected' : ''}>E ${g}${g === '9c' ? ' (Notfallsanitäter)' : ''}</option>`).join('')}</select></div>
        <div class="feld"><span class="label">Stufe</span><div class="wahl sechs">${wahl('stufe', stufen.map((x) => [x, String(x)]))}</div></div>
        <div class="feld"><span class="label">Vollzeit pro Woche</span><div class="wahl zwei-sp">${wahl('vz', [['38,5', '38,5 Std. Rettungsdienst'], ['39', '39 Std. sonst']])}</div></div>
        ${feld('gr-tz', 'Teilzeit in % (leer = Vollzeit)', 'tz', '100')}
      </section>
      <section class="karte gr-karte">
        <div class="label">Zulagen jeden Monat</div>
        ${schalter('schicht', `Schichtzulage · ${R.euro(DRK.SCHICHTZULAGE)}`, 'bei ständiger Schichtarbeit (§ 14 Abs. 7) · in Teilzeit anteilig')}
        ${schalter('praxis', `Praxisanleitung · ${R.euro(DRK.PRAXISANLEITUNG)}`, '§ 23 a Abs. 1 – mit deiner Abrechnung vergleichen')}
        ${feld('gr-dienst', `Schichten mit Dienstpauschale im Monat (${R.euro(DRK.DIENSTPAUSCHALE)} je Schicht, § 23 b)`, 'dienstText', 'z. B. 12 – nur bei verlängerter Arbeitszeit')}
        ${feldO('gr-besitz', 'Besitzstand (€, falls auf der Abrechnung)', 'besitzText', 'z. B. 0')}
        ${feldO('gr-zulage', 'Weitere Zulagen (€)', 'zulageText', 'z. B. 98,12')}
      </section>
      <section class="karte gr-karte">
        <div class="label">Zeitzuschläge · Stunden im Monat (Durchschnitt)</div>
        ${feldO('gr-nacht', 'Nacht (20–6 Uhr)', 'nachtText', 'z. B. 40')}
        ${feldO('gr-sonntag', 'Sonntag', 'sonntagText', 'z. B. 24')}
        ${feldO('gr-feiertag', 'Feiertag', 'feiertagText', 'z. B. 0')}
        ${(() => { const ms = [-2, -1, 0, 1].map((i) => R.ymPlus(heuteYm(), i)).filter((m) => DI.stundenFuer(z.daten, m).quelle !== 'schnitt'); return ms.length ? `<div class="label">Aus deinen Diensten übernehmen</div><div class="chips">${ms.map((m) => `<button class="chip" data-a="gr-dienste" data-monat="${m}">${esc(monatJahr(m, true))}</button>`).join('')}</div>` : `<button class="knopf klein leise" data-a="dienste">📅 Stunden aus dem Dienstplan ausrechnen lassen</button>`; })()}
        <p class="hinweistext" id="gr-saetze">${grSaetze(eb, r)}</p>
      </section>
      <section class="karte gr-karte">
        <div class="label">Steuer und Versicherung</div>
        <div class="feld"><span class="label">Steuerklasse</span><div class="wahl sechs">${wahl('stkl', [[1, 'I'], [2, 'II'], [3, 'III'], [4, 'IV'], [5, 'V'], [6, 'VI']])}</div></div>
        <div class="feld"><span class="label">Kinder unter 25</span><div class="wahl sechs">${wahl('kinder', [[0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5+']])}</div></div>
        ${feld('gr-zkf', 'Kinderfreibeträge (laut Abrechnung, z. B. 0,5)', 'zkfText', '0')}
        ${grZahl(e.kinder) > 0 ? '' : schalter('ab23', '23 Jahre oder älter', 'dann zahlst du ohne Kinder 0,6 % mehr Pflegeversicherung')}
        ${feld('gr-kvz', 'Zusatzbeitrag deiner Krankenkasse (%)', 'kvzText', '2,9 = Durchschnitt 2026')}
        <div class="feld"><span class="label">Kirchensteuer</span><div class="wahl drei">${wahl('kirche', [[0, 'keine'], [8, '8 % (BW, BY)'], [9, '9 %']])}</div></div>
        ${feld('gr-freibetrag', 'Steuerfreibetrag pro Monat (€, optional)', 'freibetragText', 'z. B. 0')}
        ${feldO('gr-abzug', 'Weitere Abzüge pro Monat (€)', 'abzugText', 'z. B. 0')}
      </section>
      <section class="karte gr-karte">
        <div class="label">Zusatzversorgung (ZVK / VBL)</div>
        <div class="zwei">${feld('gr-zvkan', 'Dein Eigenanteil (%)', 'zvkAnText', 'z. B. 0,55')}${feld('gr-zvkag', 'Umlage Arbeitgeber (%)', 'zvkAgText', 'z. B. 5,75')}</div>
        <p class="hinweistext">Beides steht auf deiner Abrechnung: Eigenanteil = „AN-Anteil ZVK“ ÷ „ZVK-Brutto“, Umlage = Prozentsatz bei „Allg. Uml. ZVK“. Die Umlage zahlt dein Arbeitgeber, sie erhöht aber deine Beiträge zur Sozialversicherung (§ 1 Abs. 1 Satz 3 und 4 SvEV). Leer = ohne Zusatzversorgung gerechnet.</p>
      </section>
      <section class="karte gr-ergebnis" id="gr-ergebnis" aria-live="polite">${grErgebnisHtml(eb)}</section>
<button class="knopf leise" data-a="quellen">Woher kommen die Zahlen? Rechenweg und Fundstellen</button>
      <div class="knopfreihe"><button class="knopf leise" data-a="gr-merken">Merken</button><button class="knopf haupt breit" id="gr-uebernehmen" data-a="gr-uebernehmen" data-wert="${r.netto}">≈ ${R.euroRund(r.netto)} als Gehalt übernehmen</button></div>`);
  },

  sparkonto: (eb) => {
    const sp = eb.entwurf;
    const extern = sp.art === 'extern';
    const namen = KONTO_NAMEN[extern ? 'extern' : 'sparen'].map((n) => `<button class="chip" data-a="sp-name" data-wert="${esc(n)}" aria-pressed="${sp.name === n}">${esc(n)}</button>`).join('');
    return sheet(`<h2>${eb.id ? esc(sp.name) : 'Konto anlegen'}</h2>
      <div class="label">Was ist das für ein Konto?</div>
      <div class="wahl zwei-sp">${wahlKnopf('sp-art', 'sparen', 'Sparen', !extern)}${wahlKnopf('sp-art', 'extern', 'Anderes Konto', extern)}</div>
      <p class="hinweistext">${extern ? 'Zum Beispiel ein Gemeinschafts- oder Haushaltskonto: Das Geld wird dort ausgegeben. Es zählt wie eine Ausgabe, einen Stand verfolgt die App nicht.' : 'Sparen ist keine Ausgabe: Das Geld bleibt deins, der Stand wächst. Es wird nur von „Frei“ abgezogen.'}</p>
      <div class="feld"><label for="sp-name">Name</label><input id="sp-name" class="eingabe" data-feld="name" value="${esc(sp.name)}" placeholder="eigener Name"></div>
      <div class="chips">${namen}</div>
      <div class="zwei">
        <div class="feld"><label for="sp-betrag">Übertrag jeden Monat</label>${sp.unbekannt ? offenFeldAus : `<input id="sp-betrag" class="eingabe" inputmode="decimal" data-feld="betragText" value="${esc(sp.betragText)}" placeholder="0 = keiner">`}</div>
        <div class="feld"><label for="sp-tag">Am Tag</label><input id="sp-tag" class="eingabe" inputmode="numeric" data-feld="tagText" value="${esc(sp.tagText)}"></div>
      </div>
      ${sp.unbekannt ? offenKasten(sp, true) : OFFEN_LINK}
      ${extern ? '' : `<div class="feld"><label for="sp-stand">Stand heute</label><input id="sp-stand" class="eingabe" inputmode="decimal" data-feld="standText" value="${esc(sp.standText)}"></div>
      <p class="hinweistext">Der Stand wächst mit jedem Übertrag. Stimmt er nicht mehr, hier den echten Stand eintragen.</p>
      <div class="zwei">
        <div class="feld"><label for="sp-ziel">Sparziel (€, optional)</label><input id="sp-ziel" class="eingabe" inputmode="decimal" data-feld="zielText" data-ziel="1" value="${esc(sp.zielText || '')}" placeholder="z. B. 5000"></div>
        <div class="feld"><label for="sp-zielbis">Bis wann? (optional)</label><input id="sp-zielbis" class="eingabe" type="month" data-feld="zielBis" data-ziel="1" min="${heuteYm()}" value="${esc(sp.zielBis || '')}"></div>
      </div>
      <p class="hinweistext" id="sz-hinweis" aria-live="polite">${esc(sparzielSatz(sparzielEntwurf(sp)))}</p>`}
      ${uebertragListe(eb.id)}
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      <div class="knopfreihe">${eb.id ? '<button class="knopf leise" data-a="sp-loeschen">Löschen</button>' : '<button class="knopf leise" data-a="schliessen">Abbrechen</button>'}<button class="knopf haupt breit" data-a="sp-speichern">Speichern</button></div>`, 'Konto');
  },

  buchung: (eb) => {
    const b = z.daten.buchungen.find((x) => x.id === eb.id);
    if (!b) return '';
    const kat = R.kategorie(z.daten, eb.kategorieId || b.kategorieId);
    const chips = (kat && kat.chips ? kat.chips : []).map((c) => wahlKnopf('bh-ort', c, c, eb.ort === c, 'class="chip"')).join('');
    const d = new Date(b.zeit);
    const kats = budgetKats().map((k) => `<button class="chip" data-a="bh-kat" data-wert="${esc(k.id)}" aria-pressed="${(eb.kategorieId || b.kategorieId) === k.id}">${esc(mitEmoji(k) + k.name)}</button>`).join('');
    return sheet(`<h2>${esc(kat ? kat.name : '')} · ${esc(d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }))}, ${esc(b.zeit.slice(11, 16))}</h2>
      ${eb.unbekannt ? offenKasten(eb, true) : `<div class="feld"><label for="bh-betrag">${eb.geteilt ? 'Gesamtbetrag (was du bezahlt hast)' : 'Betrag'}</label><input id="bh-betrag" class="eingabe" inputmode="decimal" data-feld="betragText" data-teilen="1" value="${esc(eb.betragText)}"></div>${OFFEN_LINK}`}
      <div class="label">Kategorie</div><div class="chips" id="bh-kats">${kats}</div>
      ${chips ? `<div class="label">${esc(kat.frage || 'Wo?')}</div><div class="chips">${chips}${wahlKnopf('bh-ort', '', 'ohne', !eb.ort, 'class="chip"')}</div>` : ''}
      <div class="feld"><label for="bh-datum">Datum</label><input id="bh-datum" class="eingabe" type="date" data-feld="datum" max="${heute()}" value="${esc(eb.datum || b.zeit.slice(0, 10))}"></div>
      ${eb.unbekannt ? '' : teilenHtml(eb)}
      ${b.gesamt ? `<button class="schalter" role="switch" aria-checked="${!!eb.zurueckErhalten}" data-a="bh-zurueck"><span class="t">Rückzahlung bekommen<br><span class="klein">${esc((eb.teiltMit || '').trim() || b.teiltMit || 'Die andere Person')} hat dir ${R.euro((teilRechnung(eb) && teilRechnung(eb).rest) || Math.round((b.gesamt - b.betrag) * 100) / 100)} zurückgezahlt</span></span><span class="spur"></span></button>` : ''}
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      <div class="knopfreihe"><button class="knopf leise" data-a="buchung-weg" data-id="${esc(b.id)}">Löschen</button><button class="knopf haupt breit" data-a="bh-speichern">Speichern</button></div>`, 'Buchung ändern');
  },

  wunsch: (eb) => {
    const w = eb.entwurf;
    const monate = Array.from({ length: 13 }, (_, i) => R.ymPlus(heuteYm(), i));
    const budgets = budgetKats();
    return sheet(`<h2>${eb.id ? 'Potenzielle Ausgabe' : 'Potenzielle Ausgabe planen'}</h2>
      <p class="hinweistext">Noch nicht fest: Die App prüft nur, ob das Geld reicht, und warnt dich.</p>
      <div class="feld"><label for="wu-name">Was?</label><input id="wu-name" class="eingabe" data-feld="name" value="${esc(w.name)}" placeholder="z. B. 🛰️ Starlink"></div>
      <div class="feld"><label for="wu-preis">Preis (oder Spanne, z. B. 250–300)</label><input id="wu-preis" class="eingabe" inputmode="text" data-feld="preisText" value="${esc(w.preisText)}" placeholder="z. B. 300"></div>
      <div class="feld"><label for="wu-monat">Wann?</label><select id="wu-monat" class="eingabe" data-feld="monat"><option value="" ${!w.monat ? 'selected' : ''}>noch offen – App sagt, ab wann es geht</option>${monate.map((m) => `<option value="${m}" ${w.monat === m ? 'selected' : ''}>${R.MONATE_LANG[R.ymTeile(m).monat - 1]} ${R.ymTeile(m).jahr}</option>`).join('')}</select></div>
      <div class="feld"><label for="wu-quelle">Bezahlt aus</label><select id="wu-quelle" class="eingabe" data-feld="kategorieId"><option value="" ${!w.kategorieId ? 'selected' : ''}>„Frei“ (was übrig bleibt)</option>${budgets.map((k) => `<option value="${esc(k.id)}" ${w.kategorieId === k.id ? 'selected' : ''}>Budget ${esc(mitEmoji(k) + k.name)}</option>`).join('')}</select></div>
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      ${eb.id ? `<div class="knopfreihe"><button class="knopf leise" data-a="wu-loeschen">Löschen</button><button class="knopf" data-a="wu-gekauft">Gekauft</button><button class="knopf haupt" data-a="wu-speichern">Speichern</button></div>`
        : `<div class="knopfreihe"><button class="knopf leise" data-a="schliessen">Abbrechen</button><button class="knopf haupt breit" data-a="wu-speichern">Planen</button></div>`}`, 'Potenzielle Ausgabe');
  },

  einnahme: (eb) => {
    const e = eb.entwurf;
    const monate = Array.from({ length: 13 }, (_, i) => R.ymPlus(heuteYm(), i));
    if (e.monat && !monate.includes(e.monat)) monate.unshift(e.monat);
    const monatOpt = (sel, leer) => (leer ? `<option value="" ${!sel ? 'selected' : ''}>${leer}</option>` : '') + monate.map((m) => `<option value="${m}" ${sel === m ? 'selected' : ''}>${R.MONATE_LANG[R.ymTeile(m).monat - 1]} ${R.ymTeile(m).jahr}</option>`).join('');
    const kannAnkommen = eb.id && e.status === 'geplant' && eb.monatAnsicht <= heuteYm();
    return sheet(`<h2>${eb.id ? 'Einnahme' : 'Weitere Einnahme'}</h2>
      <div class="feld"><label for="ei-name">Was?</label><input id="ei-name" class="eingabe" data-feld="name" value="${esc(e.name)}" placeholder="z. B. Nebenjob"></div>
      <div class="chips">${EINNAHME_VORSCHLAEGE.map((v) => `<button class="chip" data-a="ei-vorschlag" data-wert="${esc(v)}" aria-pressed="${e.name === v}">${esc(v)}</button>`).join('')}</div>
      ${e.unbekannt ? offenKasten(e, false) : `<div class="feld"><label for="ei-betrag">Betrag (oder Spanne, z. B. 200–300)</label><input id="ei-betrag" class="eingabe" data-feld="betragText" value="${esc(e.betragText)}" placeholder="z. B. 300"></div>${OFFEN_LINK}`}
      <div class="label">Wie oft?</div>
      <div class="wahl zwei-sp">${wahlKnopf('ei-wieoft', 'einmalig', 'einmalig', e.wieOft === 'einmalig')}${wahlKnopf('ei-wieoft', 'monatlich', 'jeden Monat', e.wieOft === 'monatlich')}</div>
      ${e.wieOft === 'einmalig'
        ? `<div class="feld"><label for="ei-monat">In welchem Monat?</label><select id="ei-monat" class="eingabe" data-feld="monat">${monatOpt(e.monat)}</select></div>`
        : `<div class="zwei"><div class="feld"><label for="ei-ab">Ab</label><select id="ei-ab" class="eingabe" data-feld="ab">${monatOpt(e.ab)}</select></div><div class="feld"><label for="ei-bis">Bis</label><select id="ei-bis" class="eingabe" data-feld="bis">${monatOpt(e.bis, 'offen')}</select></div></div>`}
      ${e.unbekannt ? '' : `<div class="label">Wie sicher?</div>
      <div class="wahl zwei-sp">${wahlKnopf('ei-status', 'fest', 'Fest – zählt zu „Frei“', e.status !== 'geplant')}${wahlKnopf('ei-status', 'geplant', 'Nur geplant', e.status === 'geplant')}</div>
      <p class="hinweistext">${e.status === 'geplant' ? 'Zählt erst zu „Frei“, wenn du „Kam an“ antippst. Bis dahin steht sie unter „Mit Geplantem“.' : 'Wird fest mit eingerechnet. Bei einer Spanne rechnet die App vorsichtig mit dem unteren Wert.'}</p>`}
      <button class="schalter" role="switch" aria-checked="${!!e.selbststaendig}" data-a="ei-selbst"><span class="t">Selbstständig / nebenberuflich<br><span class="klein">zählt zur Kleinunternehmergrenze</span></span><span class="spur"></span></button>
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      ${eb.id ? `<div class="knopfreihe"><button class="knopf leise" data-a="ei-loeschen">Löschen</button>${kannAnkommen ? '<button class="knopf" data-a="ei-angekommen">Kam an</button>' : ''}<button class="knopf haupt ${kannAnkommen ? '' : 'breit'}" data-a="ei-speichern">Speichern</button></div>`
        : `<div class="knopfreihe"><button class="knopf leise" data-a="schliessen">Abbrechen</button><button class="knopf haupt breit" data-a="ei-speichern">Eintragen</button></div>`}`, 'Einnahme');
  },

  ruecklage: (eb) => {
    const e = eb.entwurf;
    const empf = R.empfohleneRuecklage(z.daten, heuteYm());
    return sheet(`<h2>Rücklagenkonto</h2>
      <p class="hinweistext">Ein eigenes Konto (z. B. Unterkonto oder Tagesgeld), auf das ein Dauerauftrag jeden Monat denselben Betrag schiebt. Daraus zahlst du alle jährlichen und vierteljährlichen Kosten. So ist jeden Monat gleich viel frei.</p>
      <div class="zusammenfassung">Empfohlen: <b>${R.euroRund(empf)} pro Monat</b>. Das ist die Summe der Monatsanteile aller nicht monatlichen Fixkosten. ${empf ? `<button class="knopf klein akzent" data-a="rk-empfohlen" style="margin-top:8px">${R.euroRund(empf)} übernehmen</button>` : ''}</div>
      <div class="zwei">
        <div class="feld"><label for="rk-betrag">Dauerauftrag pro Monat</label><input id="rk-betrag" class="eingabe" inputmode="decimal" data-feld="betragText" value="${esc(e.betragText)}"></div>
        <div class="feld"><label for="rk-tag">Am Tag</label><input id="rk-tag" class="eingabe" inputmode="numeric" data-feld="tagText" value="${esc(e.tagText)}"></div>
      </div>
      <div class="feld"><label for="rk-stand">Was liegt heute auf dem Rücklagenkonto?</label><input id="rk-stand" class="eingabe" inputmode="decimal" data-feld="standText" value="${esc(e.standText)}"></div>
      ${uebertragListe(eb.vorhanden && R.ruecklage(z.daten) ? R.ruecklage(z.daten).id : null)}
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      <div class="knopfreihe">${eb.vorhanden ? '<button class="knopf leise" data-a="rk-loeschen">Ohne Rücklage</button>' : '<button class="knopf leise" data-a="schliessen">Abbrechen</button>'}<button class="knopf haupt breit" data-a="rk-speichern">Speichern</button></div>`, 'Rücklagenkonto');
  },

  'import-frage': (eb) => sheet(`<h2>Sicherung importieren?</h2>
    <p class="hinweistext">Die Sicherung ersetzt alle Daten auf diesem Handy: ${eb.daten.fixkosten.length} Fixkosten, ${eb.daten.buchungen.length} Buchungen${eb.daten.einstellungen.letzteSicherung ? ', gesichert am ' + esc(eb.daten.einstellungen.letzteSicherung) : ''}.</p>
    <div class="knopfreihe"><button class="knopf leise" data-a="schliessen">Abbrechen</button><button class="knopf haupt breit" data-a="import-ja">Ersetzen</button></div>`, 'Import'),

  frage: (eb) => sheet(`<h2>${esc(eb.titel)}</h2><p class="hinweistext">${esc(eb.text)}</p>
    <div class="knopfreihe"><button class="knopf leise" data-a="schliessen">Abbrechen</button><button class="knopf haupt breit" data-a="frage-ja">${esc(eb.ja)}</button></div>`, eb.titel)
};

function toastHtml() {
  if (!z.toast) return '';
  const t = z.toast; const neu = Date.now() - (t.zeit || 0) < 350;
  return `<div class="toast ${t.art === 'fehler' ? 'fehler' : t.art === 'info' ? 'info' : 'ok'} ${neu ? 'neu' : ''}" role="${t.art === 'fehler' ? 'alert' : 'status'}"><span class="toast-zeichen" aria-hidden="true">${t.art === 'fehler' ? '!' : t.art === 'info' ? 'i' : '✓'}</span><span class="t">${esc(t.text)}</span>${z.toast.rueckgaengig ? '<button class="knopf klein akzent" data-a="toast-rueck">Rückgängig</button>' : ''}<button class="knopf klein leise rund" style="width:36px" data-a="toast-zu" aria-label="Hinweis schließen">${ICON.x}</button></div>`;
}
let toastTimer = null;
function zeigeToast(text, rueckgaengig, art = 'ok') {
  z.toast = { text, rueckgaengig, art, zeit: Date.now() };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { z.toast = null; renderEbenen(); }, 6000);
  renderEbenen();
}

// ---------- Aktionen ----------
const oben = () => z.ebenen[z.ebenen.length - 1];
function schliessen() { z.ebenen.pop(); renderEbenen(); }
function oeffne(eb) { z.ebenen.push(eb); renderEbenen(); }
function kopie(x) { return JSON.parse(JSON.stringify(x)); }

const AKTION = {
  // ---------- v27 ----------
  auswertung: () => oeffne({ art: 'auswertung', n: 3, monat: null }),
  'aw-zeit': (el) => { const eb = oben(); eb.n = Number(el.dataset.wert); eb.monat = null; haptik('tick'); renderEbenen(); },
  'aw-monat': (el) => { oben().monat = el.dataset.wert; haptik('tick'); renderEbenen(); },
  hinweise: () => oeffne({ art: 'hinweise' }),
  'hw-um': async (el) => {
    const id = el.dataset.wert; const an = hinweisAn(id); const name = (HINWEISE.find((x) => x[0] === id) || [])[1];
    await aendern((d) => { const l = new Set(d.einstellungen.hinweiseAus || []); if (an) l.add(id); else l.delete(id); d.einstellungen.hinweiseAus = [...l]; }, { text: `${name}: ${an ? 'aus' : 'an'}`, haptik: 'tick' });
  },
  'hw-alle': async (el) => { const an = el.dataset.wert === '1'; await aendern((d) => { d.einstellungen.hinweiseAus = an ? [] : HINWEISE.map((x) => x[0]); }, { text: an ? 'Alle Hinweise an' : 'Alle Hinweise aus', haptik: 'tick' }); },
  'sicherung-spaeter': async () => { const d7 = R.datumText(new Date(Date.now() + 7 * 864e5)); await aendern((d) => { d.einstellungen.sicherungSpaeter = d7; }, { text: 'Erinnere in 7 Tagen wieder', haptik: false }); },
  'geplant-alle': () => oeffne({ art: 'geplant-alle' }),
  'vf-auf': () => { z.vf.auf = !z.vf.auf; render(); },
  'vf-wahl': (el) => { const f = el.dataset.feld; z.vf[f] = z.vf[f] === el.dataset.wert ? '' : el.dataset.wert; if (f === 'kategorieId') z.vf.ort = ''; haptik('tick'); render(); },
  'vf-leer': () => { z.vf = { text: '', kategorieId: '', monat: '', ort: '', auf: false }; render(); },
  'fk-giltab': (el) => { oben().entwurf.giltAb = el.dataset.wert; haptik('tick'); const a = document.querySelector('[data-giltab]'); if (a) a.innerHTML = giltAbHtml(oben()); },
  'fk-frueher-weg': () => { oben().entwurf.frueher = []; renderEbenen(); zeigeToast('Frühere Beträge werden beim Speichern vergessen', null, 'info'); },
  quellen: () => {
    const eb = oben();
    const entwurf = eb && eb.art === 'gehaltsrechner' ? Object.assign({}, eb.entwurf) : Object.assign({}, DRK.STANDARD, z.daten.einstellungen.gehaltsrechner || {});
    oeffne({ art: 'quellen', monat: (eb && eb.art === 'gehaltsrechner' && eb.monat) || heuteYm(), entwurf });
  },
  'gr-dienste': (el) => {
    const eb = oben(); const st = DI.stundenFuer(z.daten, el.dataset.monat);
    if (st.quelle === 'schnitt') return;
    Object.assign(eb.entwurf, { nachtText: std(st.nacht), sonntagText: std(st.sonntag), feiertagText: std((st.feiertag || 0) + (st.vorfest || 0)), dienstText: std(st.pauschalDienste || 0), nachtTextOffen: false, sonntagTextOffen: false, feiertagTextOffen: false });
    haptik('tick'); renderEbenen();
    zeigeToast(`Stunden und Schichten aus ${st.quelle === 'abrechnung' ? 'der Monatsübersicht' : 'den Diensten'} ${monatsName(st.monat)} eingesetzt`, null, 'info');
  },

  // Dienste
  dienste: (el) => {
    if (oben() && oben().art === 'gehalt') z.ebenen.pop();
    const m = el && el.dataset && el.dataset.monat;
    oeffne({ art: 'dienste', monat: m || heuteYm(), pinsel: (schichtarten()[0] || {}).k || '' });
  },
  'ds-monat': (el) => { const eb = oben(); eb.monat = R.ymPlus(eb.monat, Number(el.dataset.wert)); renderEbenen(); },
  'ds-pinsel': (el) => { oben().pinsel = el.dataset.wert; haptik('tick'); renderEbenen(); },
  'ds-tag': async (el) => {
    const eb = oben(); const d = el.dataset.wert;
    const da = (z.daten.dienste || []).find((x) => x.d === d);
    if (!eb.pinsel) { zeigeToast(schichtarten().length ? 'Erst oben eine Schichtart wählen' : 'Leg zuerst eine Schichtart an', null, 'info'); if (!schichtarten().length) AKTION.schichtart({ dataset: { wert: '' } }); return; }
    const a = schichtarten().find((x) => x.k === eb.pinsel);
    const weg = eb.pinsel === '-' || (da && a && da.k === a.k);
    if (eb.pinsel === '-' && !da) return;
    haptik('tick');
    await aendern((dd) => {
      dd.dienste = (dd.dienste || []).filter((x) => x.d !== d);
      if (!weg && a) dd.dienste.push(a.frei ? { d, k: a.k, frei: true } : { d, k: a.k, von: a.von, bis: a.bis });
      dd.dienste.sort((x, y) => (x.d < y.d ? -1 : 1));
    }, false);
  },
  'ds-schaetzen': async () => {
    const an = !z.daten.einstellungen.gehaltSchaetzen;
    if (an && !z.daten.einstellungen.gehaltsrechner) { zeigeToast('Erst im Gehaltsrechner deine Angaben eintragen und „Merken“ tippen', null, 'info'); return; }
    await aendern((d) => { d.einstellungen.gehaltSchaetzen = an; }, { text: an ? 'Gehalt wird aus den Diensten geschätzt' : 'Dienst-Schätzung aus – es gilt deine feste Schätzung', rueckgaengig: (d) => { d.einstellungen.gehaltSchaetzen = !an; } });
  },
  'ds-verzug': async (el) => { const v = Number(el.dataset.wert); await aendern((d) => { d.einstellungen.zuschlagVerzug = v; }, { text: v === 2 ? 'Zuschläge: 2 Monate später (spätester Termin laut Tarif)' : v === 1 ? 'Zuschläge: 1 Monat später' : 'Zuschläge: im selben Monat', haptik: 'tick' }); },
  'ds-land': async (el) => { const v = el.value; await aendern((d) => { d.einstellungen.bundesland = v; }, { text: `Feiertage: ${DI.LAENDER[v]}`, haptik: 'tick' }); },
  'ds-datei': () => document.getElementById('dienste-datei').click(),
  'ds-pdf': () => document.getElementById('mue-datei').click(),
  'ds-abr': () => document.getElementById('abr-datei').click(),
  // Abrechnung (v29)
  'abr-gehalt': async () => {
    const a = oben().ergebnis.haupt; const s = a.monat; const betrag = a.auszahlung;
    const g = gehalt(); const alt = (g.istWerte || []).find((w) => R.ymAus(w.datum) === s);
    await aendern((d) => { const x = R.gehaltVon(d); x.istWerte = (x.istWerte || []).filter((w) => R.ymAus(w.datum) !== s); x.istWerte.push({ datum: s + '-' + R.zweistellig(R.ankunftsTag(x, s)), betrag, quelle: 'abrechnung' }); },
      { text: `Gehalt ${monatsName(s)}: ${R.euro(betrag)} aus der Abrechnung eingetragen`, rueckgaengig: (d) => { const x = R.gehaltVon(d); x.istWerte = x.istWerte.filter((w) => R.ymAus(w.datum) !== s); if (alt) x.istWerte.push(alt); } });
  },
  'abr-einstellungen': async () => {
    const a = oben().ergebnis.haupt || oben().ergebnis.nachberechnungen[0];
    const felder = AB.rechnerFelder(AB.einstellungenAus(a));
    const vorher = z.daten.einstellungen.gehaltsrechner ? kopie(z.daten.einstellungen.gehaltsrechner) : null;
    await aendern((d) => { d.einstellungen.gehaltsrechner = Object.assign({}, DRK.STANDARD, d.einstellungen.gehaltsrechner || {}, felder); },
      { text: 'Einstellungen aus der Abrechnung in den Gehaltsrechner übernommen', rueckgaengig: (d) => { if (vorher) d.einstellungen.gehaltsrechner = vorher; else delete d.einstellungen.gehaltsrechner; } });
  },
  'abr-stunden': async (el) => {
    const erg = oben().ergebnis; const nb = erg.nachberechnungen.find((x) => x.monat === el.dataset.monat); if (!nb) return;
    const st = AB.stundenAus(nb.lohnarten.filter((x) => x.imBrutto && x.nach)); if (!st) return;
    const alt = kopie(z.daten.monatsstunden || {});
    await aendern((d) => { if (!d.monatsstunden) d.monatsstunden = {}; d.monatsstunden[nb.monat] = Object.assign({}, st, { fertig: true, stand: nb.datum || heute(), quelle: 'abrechnung' }); },
      { text: `Stunden ${monatsName(nb.monat)} aus der Abrechnung übernommen (abgerechnet)`, rueckgaengig: (d) => { d.monatsstunden = alt; } });
  },

  'ds-import-ja': async () => {
    const eb = oben(); const vorher = { dienste: kopie(z.daten.dienste || []), arten: kopie(schichtarten()) };
    z.ebenen.pop();
    await aendern((d) => { d.dienste = DI.diensteZusammen(d.dienste, eb.dienste); d.einstellungen.schichtarten = eb.arten; },
      { text: `${eb.dienste.length} Dienste eingelesen`, rueckgaengig: (d) => { d.dienste = vorher.dienste; d.einstellungen.schichtarten = vorher.arten; } });
    const o = oben(); if (o && o.art === 'dienste') { if (!o.pinsel) o.pinsel = (schichtarten()[0] || {}).k || ''; renderEbenen(); }
  },
  'mue-import-ja': async () => {
    const eb = oben(); const r = eb.ergebnis;
    const vorher = { dienste: kopie(z.daten.dienste || []), ms: kopie(z.daten.monatsstunden || {}), arten: kopie(schichtarten()) };
    z.ebenen.pop();
    await aendern((d) => {
      if (!d.monatsstunden) d.monatsstunden = {};
      if (r.lohnarten.length || r.fertig) d.monatsstunden[r.monat] = Object.assign({}, r.stunden, { stand: r.stand, fertig: r.fertig, quelle: 'pdf' });
      if (eb.fertig.length) { d.dienste = DI.diensteZusammen(d.dienste, eb.fertig); d.einstellungen.schichtarten = eb.arten; }
    }, { text: `Monatsübersicht ${monatsName(r.monat)} übernommen${r.fertig ? ' (abgerechnet)' : ' (Zwischenstand)'}`, rueckgaengig: (d) => { d.dienste = vorher.dienste; d.monatsstunden = vorher.ms; d.einstellungen.schichtarten = vorher.arten; } });
    const o = oben(); if (o && o.art === 'dienste') { o.monat = r.monat; if (!o.pinsel) o.pinsel = (schichtarten()[0] || {}).k || ''; renderEbenen(); }
  },
  schichtart: (el) => {
    const a = schichtarten().find((x) => x.k === el.dataset.wert);
    oeffne({ art: 'schichtart', alt: a ? a.k : null, entwurf: a ? { k: a.k, von: a.von || '07:00', bis: a.bis || '19:00', frei: !!a.frei, pauschale: DI.mitPauschale(a.k, schichtarten()) } : { k: '', von: '07:00', bis: '19:00', frei: false, pauschale: null } });
  },
  'sa-frei': (el) => { oben().entwurf.frei = el.dataset.wert === '1'; renderEbenen(); },
  'sa-pauschale': () => { const eb = oben(); eb.entwurf.pauschale = !saPauschale(eb); haptik('tick'); renderEbenen(); },
  'sa-speichern': async () => {
    const eb = oben(); const e = eb.entwurf; const k = String(e.k || '').trim();
    if (!k) { eb.fehler = 'Bitte ein Kürzel eintragen, z. B. R1T.'; renderEbenen(); return; }
    if (k === '-') { eb.fehler = 'Dieses Kürzel ist vergeben.'; renderEbenen(); return; }
    if (schichtarten().some((x) => x.k === k && x.k !== eb.alt)) { eb.fehler = `${k} gibt es schon.`; renderEbenen(); return; }
    if (!e.frei && (!/^\d{2}:\d{2}$/.test(e.von || '') || !/^\d{2}:\d{2}$/.test(e.bis || ''))) { eb.fehler = 'Bitte Beginn und Ende eintragen.'; renderEbenen(); return; }
    if (!e.frei && e.von === e.bis) { eb.fehler = 'Beginn und Ende sind gleich.'; renderEbenen(); return; }
    const neu = e.frei ? { k, frei: true } : { k, von: e.von, bis: e.bis, pauschale: saPauschale(eb) };
    z.ebenen.pop();
    await aendern((d) => { const l = (d.einstellungen.schichtarten || []).slice(); const i = l.findIndex((x) => x.k === eb.alt); if (i >= 0) l[i] = neu; else l.push(neu); d.einstellungen.schichtarten = l; }, { text: `Schichtart ${k} gespeichert` });
    const o = oben(); if (o && o.art === 'dienste') { o.pinsel = k; renderEbenen(); }
  },
  'sa-loeschen': async () => {
    const eb = oben(); const alt = schichtarten().slice();
    z.ebenen.pop();
    await aendern((d) => { d.einstellungen.schichtarten = (d.einstellungen.schichtarten || []).filter((x) => x.k !== eb.alt); }, { text: `Schichtart ${eb.alt} gelöscht · eingetragene Dienste bleiben`, rueckgaengig: (d) => { d.einstellungen.schichtarten = alt; } });
    const o = oben(); if (o && o.art === 'dienste' && o.pinsel === eb.alt) { o.pinsel = (schichtarten()[0] || {}).k || ''; renderEbenen(); }
  },
  monatsstunden: (el) => {
    const m = el.dataset.monat; const ms = (z.daten.monatsstunden || {})[m];
    const t = (x) => (x == null || x === 0 ? (ms ? '0' : '') : std(x));
    const vorbei = m < heuteYm();
    oeffne({ art: 'monatsstunden', monat: m, vorhanden: !!ms, entwurf: ms ? { nacht: t(ms.nacht), nacht04: t(ms.nacht04), sonntag: t(ms.sonntag), feiertag: t(ms.feiertag), vorfest: t(ms.vorfest), pauschale: ms.pauschale == null ? '' : std(ms.pauschale), fertig: !!ms.fertig } : { nacht: '', nacht04: '', sonntag: '', feiertag: '', vorfest: '', pauschale: '', fertig: vorbei } });
  },
  'ms-fertig': () => { oben().entwurf.fertig = !oben().entwurf.fertig; renderEbenen(); },
  'ms-speichern': async () => {
    const eb = oben(); const e = eb.entwurf;
    const w = {};
    for (const f of ['nacht', 'nacht04', 'sonntag', 'feiertag', 'vorfest']) { const n = String(e[f] || '').trim() === '' ? 0 : zahl(e[f]); if (isNaN(n) || n < 0 || n > 744) { eb.fehler = 'Bitte Stunden als Zahl eintragen (z. B. 40 oder 12,5).'; renderEbenen(); return; } w[f] = n; }
    if (w.nacht04 > w.nacht) { eb.fehler = '„davon 0–4 Uhr“ kann nicht mehr sein als die Nachtstunden gesamt.'; renderEbenen(); return; }
    // Dienstpauschale: leer = aus den Diensten zählen
    if (String(e.pauschale || '').trim() !== '') { const p = zahl(e.pauschale); if (isNaN(p) || p < 0) { eb.fehler = 'Die Dienstpauschale bitte als Betrag in € eintragen (oder leer lassen).'; renderEbenen(); return; } w.pauschale = p; }
    const alt = kopie(z.daten.monatsstunden || {});
    z.ebenen.pop();
    await aendern((d) => { if (!d.monatsstunden) d.monatsstunden = {}; d.monatsstunden[eb.monat] = Object.assign(w, { fertig: !!e.fertig, stand: heute(), quelle: 'hand' }); },
      { text: `Stunden ${monatsName(eb.monat)} gespeichert${e.fertig ? ' (abgerechnet)' : ' (Zwischenstand)'}`, rueckgaengig: (d) => { d.monatsstunden = alt; } });
  },
  'ms-loeschen': async () => {
    const eb = oben(); const alt = kopie(z.daten.monatsstunden || {});
    z.ebenen.pop();
    await aendern((d) => { delete d.monatsstunden[eb.monat]; }, { text: `Stunden ${monatsName(eb.monat)} gelöscht · es gelten wieder die Dienste`, rueckgaengig: (d) => { d.monatsstunden = alt; } });
  },
  ansicht: (el) => { z.bearbeiten = false; z.ansicht = el.dataset.wert; window.scrollTo(0, 0); render(); },
  monat: (el) => { z.monat = R.ymPlus(z.monat, Number(el.dataset.wert)); render(); },
  heute: () => { z.monat = heuteYm(); render(); },
  'zu-monat': (el) => { z.monat = el.dataset.wert; z.ansicht = 'monat'; window.scrollTo(0, 0); render(); },
  bereich: (el) => oeffne({ art: 'bereich', typ: el.dataset.wert }),
  'abo-neu': () => { AKTION['fixkosten-neu']({ dataset: { kat: R.kategorie(z.daten, 'abos') ? 'abos' : '' } }); const e = oben().entwurf; e.abo = true; oben().mehr = true; renderEbenen(); },
  'kachel-auf': async (el) => { const l = kachelListe().map((k) => Object.assign({}, k)); const k = l.find((x) => x.id === el.dataset.wert); if (k) k.offen = !k.offen; await aendern((d) => { d.einstellungen.kacheln = l; }, false); },
  'kachel-katalog': () => oeffne({ art: 'katalog' }),
  'bearbeiten-an': () => { z.bearbeiten = true; z.gewaehlt = null; haptik('tick'); render(); },
  'bearbeiten-aus': () => { z.bearbeiten = false; z.gewaehlt = null; zeigeToast('Übersicht gespeichert'); render(); },
  'kachel-x': async (el) => { await kachelEntfernen(el.dataset.wert); },
  eintragen: (el) => {
    const b = budgetKats();
    const k = alleKonten(); const erstes = R.sparratenNormal(z.daten)[0] || k[0];
    // Kategorie: vom Widget/Kurzbefehl, sonst die zuletzt benutzte, sonst die erste
    const wunsch = el && el.dataset && el.dataset.kat;
    const zuletzt = z.daten.einstellungen.letzteKategorie;
    const katId = [wunsch, zuletzt].find((id) => id && b.some((x) => x.id === id)) || (b[0] || {}).id || '';
    oeffne({ art: 'eintragen', entwurf: { art: (el && el.dataset && el.dataset.wert) || 'ausgabe', betragText: '', kategorieId: katId, ort: '', datum: heute(), name: '', kontoId: erstes ? erstes.id : '', oft: 'einmalig', tagText: '1' } });
    setTimeout(() => { const f = document.getElementById('et-betrag'); if (f) f.focus(); }, 60);
  },
  'et-art': (el) => { haptik('tick'); if (el.dataset.wert === 'abo') { z.ebenen.pop(); AKTION['abo-neu'](); return; } oben().entwurf.art = el.dataset.wert; oben().fehler = null; renderEbenen(); const f = document.getElementById('et-betrag'); if (f) f.focus(); },
  'et-kat': (el) => { haptik('tick'); oben().entwurf.kategorieId = el.dataset.wert; if (oben().art === 'eintragen') oben().entwurf.ort = ''; renderEbenen(); },
  'et-ort': (el) => { const e = oben().entwurf; e.ort = e.ort === el.dataset.wert ? '' : el.dataset.wert; renderEbenen(); },
  'et-name': (el) => { oben().entwurf.name = el.dataset.wert; renderEbenen(); },
  'et-ziel': (el) => { oben().entwurf.kontoId = el.dataset.wert; oben().fehler = null; renderEbenen(); },
  'et-oft': (el) => { const e = oben().entwurf; e.oft = el.dataset.wert; const k = alleKonten().find((x) => x.id === e.kontoId); if (e.oft === 'monatlich' && k) e.tagText = String(k.tag || 1); renderEbenen(); },
  'et-konto-neu': () => { oben().wartetAufKonto = true; AKTION.sparkonto({ dataset: {} }); },
  vorschlaege: () => {
    const v = (z.vorschlaege || [])[0];
    const b = budgetKats();
    const gemerkt = v && (z.daten.einstellungen.haendlerKategorie || {})[haendlerSchluessel(v.haendler)];
    const katId = [gemerkt, z.daten.einstellungen.letzteKategorie].find((id) => id && b.some((x) => x.id === id)) || (b[0] || {}).id || '';
    const neu = { art: 'vorschlaege', entwurf: { betragText: v ? R.euro(v.betrag, false) : '', ort: v ? v.haendler || '' : '', kategorieId: katId } };
    if (oben() && oben().art === 'vorschlaege') { z.ebenen[z.ebenen.length - 1] = neu; renderEbenen(); } else oeffne(neu);
  },
  'vs-ignorieren': async () => {
    const v = z.vorschlaege[0]; if (!v) return;
    await D.vorschlaegeEntfernen([v.id]); z.vorschlaege = z.vorschlaege.slice(1);
    if (z.vorschlaege.length) AKTION.vorschlaege(); else { z.ebenen.pop(); render(); zeigeToast('Alle erkannten Zahlungen erledigt'); }
  },
  'vs-buchen': async () => {
    const eb = oben(); const e = eb.entwurf; const v = z.vorschlaege[0]; if (!v) return;
    const betrag = zahl(e.betragText);
    if (isNaN(betrag) || betrag <= 0) { eb.fehler = 'Bitte einen Betrag über 0 € eintragen.'; renderEbenen(); return; }
    if (!e.kategorieId) { eb.fehler = 'Bitte eine Kategorie wählen.'; renderEbenen(); return; }
    const id = D.neueId('b'); const ort = (e.ort || '').trim();
    await D.vorschlaegeEntfernen([v.id]); z.vorschlaege = z.vorschlaege.slice(1);
    const kat = R.kategorie(z.daten, e.kategorieId);
    if (!z.vorschlaege.length) z.ebenen.pop();
    await aendern((d) => {
      d.buchungen.push({ id, zeit: v.zeit, kategorieId: e.kategorieId, betrag, ort: ort || null, quelle: 'erkannt' });
      if (ort) d.einstellungen.haendlerKategorie = Object.assign({}, d.einstellungen.haendlerKategorie, { [haendlerSchluessel(ort)]: e.kategorieId });
      if (v.haendler && v.haendler !== ort) d.einstellungen.haendlerKategorie = Object.assign({}, d.einstellungen.haendlerKategorie, { [haendlerSchluessel(v.haendler)]: e.kategorieId });
    }, { text: `${kat ? kat.name : 'Ausgabe'}: − ${R.euro(betrag)} gebucht`, rueckgaengig: (d) => { d.buchungen = d.buchungen.filter((x) => x.id !== id); } });
    if (z.vorschlaege.length) AKTION.vorschlaege();
  },
  'er-an': async (el) => {
    const an = el.dataset.wert === '1';
    try { await D.erkennungEinstellen(an); } catch (e) { zeigeToast('Konnte die Erkennung nicht umstellen.', null, 'fehler'); return; }
    z.erkennung = await D.erkennungStatus();
    zeigeToast(an ? (z.erkennung && z.erkennung.erlaubt ? 'Erkennung eingeschaltet' : 'Eingeschaltet – jetzt noch den Zugriff erlauben') : 'Erkennung ausgeschaltet', null, an && !(z.erkennung && z.erkennung.erlaubt) ? 'info' : 'ok');
  },
  'er-erlauben': async () => { try { await D.erkennungErlauben(); } catch (e) { zeigeToast('Die Einstellungen ließen sich nicht öffnen. Android-Einstellungen → Benachrichtigungen → Benachrichtigungen lesen.', null, 'fehler'); } },
  'er-appinfo': async () => { try { await D.appInfoOeffnen(); } catch (e) { zeigeToast('Die App-Infos ließen sich nicht öffnen. Android-Einstellungen → Apps → „Finanzen“.', null, 'fehler'); } },
  'er-app': async (el) => {
    const an = el.dataset.an !== '1';
    await D.erkennungApp(el.dataset.wert, an); z.erkennung = await D.erkennungStatus();
    zeigeToast(`${el.dataset.name || 'App'}: ${an ? 'wird erkannt' : 'wird ignoriert'}`);
  },
  monatsende: (el) => {
    const s = el.dataset.wert;
    const k = alleKonten(); const erstes = R.sparratenNormal(z.daten)[0] || k[0];
    oeffne({ art: 'monatsende', monat: s, entwurf: { wahl: null, betragText: R.euro(Math.max(0, R.uebrigIm(z.daten, s).uebrig), false), kontoId: erstes ? erstes.id : '', kategorieId: (budgetKats()[0] || {}).id || '' } });
  },
  'me-wahl': (el) => { const eb = oben(); eb.entwurf.wahl = el.dataset.wert; eb.fehler = null; eb.entwurf.betragText = R.euro(Math.max(0, R.uebrigIm(z.daten, eb.monat).uebrig), false); renderEbenen(); },
  'me-giro': async () => {
    const eb = oben(); const s = eb.monat; z.ebenen.pop();
    await aendern((d) => { d.einstellungen.abgeschlossen = (d.einstellungen.abgeschlossen || []).concat([s]); },
      { text: `${monatsName(s)} abgeschlossen`, rueckgaengig: (d) => { d.einstellungen.abgeschlossen = (d.einstellungen.abgeschlossen || []).filter((x) => x !== s); } });
  },
  'me-speichern': async () => {
    const eb = oben(); const e = eb.entwurf; const s = eb.monat;
    const betrag = zahl(e.betragText);
    if (isNaN(betrag) || betrag <= 0) { eb.fehler = 'Bitte einen Betrag über 0 € eintragen.'; renderEbenen(); return; }
    // v26: Schutz vor Vertippern – hier geht es nur um den Rest des Monats
    const uebrigVorher = R.uebrigIm(z.daten, s).uebrig;
    if (betrag > uebrigVorher + 0.005) { eb.fehler = `Das ist mehr, als im ${monatsName(s).split(' ')[0]} übrig war (≈ ${R.euro(Math.round(uebrigVorher * 100) / 100)}). Größere Beträge trägst du über ＋ ein.`; renderEbenen(); return; }
    const datum = letzterTag(s);
    let neu; let text;
    if (e.wahl === 'konto') {
      const konto = alleKonten().find((k) => k.id === e.kontoId);
      if (!konto) { eb.fehler = 'Bitte ein Konto wählen oder ein neues anlegen.'; renderEbenen(); return; }
      neu = (d) => { if (!Array.isArray(d.uebertraege)) d.uebertraege = []; d.uebertraege.push({ id: D.neueId('ue'), datum, betrag, kontoId: konto.id, angelegt: new Date().toISOString() }); };
      text = `${R.euro(betrag)} aufs ${konto.name || 'Rücklagenkonto'}`;
    } else {
      if (!e.kategorieId) { eb.fehler = 'Bitte eine Kategorie wählen.'; renderEbenen(); return; }
      const kat = R.kategorie(z.daten, e.kategorieId);
      neu = (d) => d.buchungen.push({ id: D.neueId('b'), zeit: datum + 'T20:00:00', kategorieId: e.kategorieId, betrag, ort: null, quelle: 'monatsende' });
      text = `${kat ? kat.name : 'Ausgabe'}: − ${R.euro(betrag)}`;
    }
    const vorher = kopie(z.daten);
    neu(z.daten);
    const rest = R.uebrigIm(z.daten, s).uebrig;
    const fertig = rest < 5;
    z.daten = vorher;
    if (fertig) z.ebenen.pop(); else { e.wahl = null; eb.fehler = null; e.betragText = R.euro(rest, false); }
    await aendern((d) => { neu(d); if (fertig) d.einstellungen.abgeschlossen = (d.einstellungen.abgeschlossen || []).concat([s]); },
      { text: fertig ? `${text} · ${monatsName(s)} abgeschlossen` : `${text} · noch ≈ ${R.euroRund(rest)} übrig`, rueckgaengig: (d) => { d.uebertraege = vorher.uebertraege; d.buchungen = vorher.buchungen; d.einstellungen.abgeschlossen = vorher.einstellungen.abgeschlossen; } });
  },
  'ue-weg': async (el) => {
    const u = (z.daten.uebertraege || []).find((x) => x.id === el.dataset.wert);
    if (!u) return;
    await aendern((d) => { d.uebertraege = d.uebertraege.filter((x) => x.id !== u.id); }, { text: `Übertrag ${R.euro(u.betrag)} gelöscht`, rueckgaengig: (d) => d.uebertraege.push(u) });
  },
  'et-speichern': async () => {
    const eb = oben(); const e = eb.entwurf;
    const o = e.unbekannt && e.art !== 'uebertrag' ? offenAus(e, e.art === 'ausgabe') : null;
    if (o && o.fehler) { eb.fehler = o.fehler; renderEbenen(); return; }
    const betrag = o ? o.betrag : zahl(e.betragText);
    if (!o && (isNaN(betrag) || betrag <= 0)) { eb.fehler = 'Bitte einen Betrag über 0 € eintragen – oder „? Betrag unbekannt“ wählen.'; renderEbenen(); return; }
    if (!e.datum) { eb.fehler = 'Bitte ein Datum wählen.'; renderEbenen(); return; }
    if (e.art === 'uebertrag') return uebertragSpeichern(eb, betrag);
    const jetzt = new Date();
    const zeit = e.datum === heute() ? R.zeitText(jetzt) : e.datum + 'T12:00:00';
    z.ebenen.pop();
    if (e.art === 'ausgabe') {
      if (!e.kategorieId) { eb.fehler = 'Bitte eine Kategorie wählen.'; z.ebenen.push(eb); renderEbenen(); return; }
      const id = D.neueId('b'); const kat = R.kategorie(z.daten, e.kategorieId);
      const tr = o ? null : teilRechnung(e);
      if (tr && tr.fehler) { eb.fehler = tr.fehler; z.ebenen.push(eb); renderEbenen(); return; }
      const neu = { id, zeit, kategorieId: e.kategorieId, betrag: tr ? tr.mein : betrag, ort: e.ort || null, quelle: 'app' };
      if (tr) Object.assign(neu, { gesamt: tr.gesamt, teiltMit: (e.teiltMit || '').trim() || null, zurueckErhalten: false });
      if (o) neu.offen = o.offen;
      z.leuchten = { kat: e.kategorieId, bis: Date.now() + 1500 };
      await aendern((d) => { d.buchungen.push(neu); d.einstellungen.letzteKategorie = e.kategorieId; }, { text: o ? `${kat ? kat.name : 'Ausgabe'}: Betrag offen (${R.offenText(o.offen)}) · ${o.offen.zaehlt ? 'zählt mit' : 'zählt nicht'}` : `${kat ? kat.name : 'Ausgabe'}: − ${R.euro(neu.betrag)} gebucht${tr ? ' (dein Anteil)' : ''}`, rueckgaengig: (d) => { d.buchungen = d.buchungen.filter((x) => x.id !== id); } });
    } else {
      const name = (e.name || '').trim() || 'Einnahme';
      const id = D.neueId('ein');
      if (o) {
        await aendern((d) => d.einnahmen.push(Object.assign({ id, name, wieOft: 'einmalig', monat: R.ymAus(e.datum), kommtAn: 'sofort', selbststaendig: /Selbstständig/.test(name), istWerte: [] }, offeneEinnahmeWerte(o.offen))),
          { text: `${name}: Betrag offen (${R.offenText(o.offen)}) · ${o.offen.zaehlt ? 'zählt mit' : 'zählt nicht'}`, rueckgaengig: (d) => { d.einnahmen = d.einnahmen.filter((x) => x.id !== id); } });
        return;
      }
      await aendern((d) => d.einnahmen.push({ id, name, wieOft: 'einmalig', monat: R.ymAus(e.datum), betrag, sicher: true, status: 'fest', kommtAn: 'sofort', selbststaendig: /Selbstständig/.test(name), istWerte: [{ datum: e.datum, betrag }] }), { text: `${name}: + ${R.euro(betrag)} eingetragen`, rueckgaengig: (d) => { d.einnahmen = d.einnahmen.filter((x) => x.id !== id); } });
    }
  },
  'kachel-dazu': async (el) => { const id = el.dataset.wert; z.ebenen.pop(); await aendern((d) => { d.einstellungen.kacheln = kachelListe().concat([{ id, breit: !!(KACHEL_KATALOG[id] && KACHEL_KATALOG[id].breit) }]); }, { text: 'Kachel hinzugefügt' }); },
  'kachel-breit': async (el) => { const id = oben().id; z.ebenen.pop(); await aendern((d) => { d.einstellungen.kacheln = kachelListe().map((k) => (k.id === id ? Object.assign({}, k, { breit: el.dataset.wert === '1' }) : k)); }, { text: el.dataset.wert === '1' ? 'Kachel jetzt ganze Breite' : 'Kachel jetzt halbe Breite', haptik: false }); },
  'kachel-weg': async () => { const id = oben().id; z.ebenen.pop(); await kachelEntfernen(id); },
  'ansicht-pro-monat': async (el) => { await aendern((d) => { d.einstellungen.ansichtProMonat = el.dataset.wert === '1'; }, false); },
  'verlauf-alle': () => { z.verlaufAlle = true; render(); },
  schliessen,
  'schliessen-schleier': (el, ev) => { if (ev.target === el) schliessen(); },
  mehr: () => { oben().mehr = !oben().mehr; renderEbenen(); },
  'toast-zu': () => { z.toast = null; renderEbenen(); },
  'toast-rueck': async () => { const r = z.toast && z.toast.rueckgaengig; z.toast = null; if (r) await aendern(r, { text: 'Rückgängig gemacht', haptik: 'tick' }); else renderEbenen(); },

  // Start
  'start-einrichten': () => { z.daten = D.leereDaten(); z.daten.einstellungen.gesehenVersion = APP_VERSION; oeffne(E.neueEinfuehrung(z.daten, true)); },
  'einfuehrung-erneut': () => {
    // Mit Beispieldaten: von vorne mit leeren Daten, am Ende ersetzen die Angaben das Beispiel
    if (z.daten.beispiel) { const leer = D.leereDaten(); oeffne(Object.assign(E.neueEinfuehrung(leer, true), { basis: leer })); }
    else oeffne(E.neueEinfuehrung(z.daten, false));
  },
  'ef-wert': (el) => {
    let w = el.dataset.wert; if (w === 'ja') w = true; else if (w === 'nein') w = false;
    setzePfad(oben(), el.dataset.pfad, w); oben().fehler = null; renderEbenen();
  },
  'ef-waehlen': (el) => { haptik('tick');
    const liste = oben().listen[el.dataset.liste]; const i = Number(el.dataset.i); const p = liste[i];
    if (p.eigen) liste.splice(i, 1);
    else { p.gewaehlt = !p.gewaehlt; if (p.gewaehlt) { efAndereEinklappen(liste, p); p.zu = false; } else p.loeschen = false; }
    oben().fehler = null; renderEbenen();
  },
  // schon eingetragene Fixkosten in der Einrichtung bearbeiten: Werte übernehmen und Karte öffnen
  'ef-vorhanden': (el) => {
    const liste = oben().listen[el.dataset.liste]; const p = liste[Number(el.dataset.i)];
    const f = z.daten.fixkosten.find((x) => x.id === p.vorhandenId); if (!f) return;
    const anteil = f.meinAnteil == null ? 100 : Number(f.meinAnteil);
    efAndereEinklappen(liste, p);
    Object.assign(p, { gewaehlt: true, zu: false, loeschen: false, betragText: R.euro(f.betrag, false), wieOft: f.wieOft, tag: f.tag || 1, monat: f.monat || p.monat,
      geteilt: anteil < 100, meinText: anteil < 100 ? R.euro(Math.round(R.eigenerBetrag(f) * 100) / 100, false) : '', teiltMit: f.teiltMit || '' });
    oben().fehler = null; renderEbenen();
  },
  'ef-zu': (el) => {
    const eb = oben(); const zu = el.dataset.wert === '1';
    const p = el.dataset.pfad.split('.').reduce((o, k) => o[k], eb);
    p.zu = zu; eb.fehler = null; renderEbenen();
    if (!zu) { const k = document.querySelector(`[data-feld="${el.dataset.pfad}.betragText"]`); if (k) k.closest('.ef-posten').scrollIntoView({ block: 'nearest' }); }
  },
  'ef-eigen': (el) => {
    const liste = oben().listen[el.dataset.liste];
    const neu = { name: '', eigen: true, gewaehlt: true, wieOft: 'monatlich', tag: 1, monat: R.ymTeile(heuteYm()).monat, betragText: '', geteilt: false, meinText: '', teiltMit: '' };
    efAndereEinklappen(liste, neu); liste.push(neu);
    renderEbenen();
    const felder = document.querySelectorAll('.ef-posten input[data-feld$=".name"]'); if (felder.length) felder[felder.length - 1].focus();
  },
  'ef-ein-dazu': (el) => { haptik('tick');
    const eb = oben(); const n = el.dataset.wert;
    const i = n ? eb.einnahmen.findIndex((e) => e.name === n) : -1;
    if (i >= 0) eb.einnahmen.splice(i, 1); // nochmal antippen = wieder weg
    else efAndereEinklappen(eb.einnahmen, null), eb.einnahmen.push({ name: n, betragText: '', wieOft: 'monatlich', status: 'fest', monat: heuteYm() });
    eb.fehler = null; renderEbenen();
  },
  'ef-ausblenden': (el) => { const eb = oben(); eb.ausgeblendet = [...new Set([...(eb.ausgeblendet || []), el.dataset.wert])]; renderEbenen(); },
  'ef-einblenden': (el) => { const eb = oben(); eb.ausgeblendet = (eb.ausgeblendet || []).filter((k) => !k.startsWith(el.dataset.wert)); renderEbenen(); },
  'ef-kat-weg': (el) => {
    const eb = oben(); const id = el.dataset.liste; const weg = el.dataset.wert === '1';
    eb.kategorieWeg = Object.assign({}, eb.kategorieWeg, { [id]: weg });
    if (weg) { eb.listen[id].forEach((p) => { p.gewaehlt = false; }); eb.listen[id] = eb.listen[id].filter((p) => !p.eigen); }
    renderEbenen();
  },
  'ef-ein-weg': (el) => { oben().einnahmen.splice(Number(el.dataset.i), 1); renderEbenen(); },
  'ef-budget-an': (el) => { const b = oben().budgets[Number(el.dataset.i)]; b.an = !b.an; renderEbenen(); },
  'ef-budget-neu': () => { oben().budgets.push({ id: null, name: '', emoji: '', an: true, text: '', neu: true }); renderEbenen(); },
  'ef-weiter': async () => {
    const eb = oben();
    const fehler = E.pruefeSchritt(eb, zahl);
    if (fehler) { eb.fehler = fehler; renderEbenen(); return; }
    eb.fehler = null;
    if (E.SCHRITTE[eb.schritt] === 'fertig') {
      z.ebenen = []; z.ansicht = 'monat'; z.monat = heuteYm();
      if (eb.basis) {
        const vorher = kopie(z.daten);
        await aendern((d) => {
          const neu = E.anwenden(kopie(eb.basis), eb, zahl);
          neu.einstellungen = Object.assign({}, d.einstellungen, { ausgeblendet: neu.einstellungen.ausgeblendet, abgeschlossen: [] });
          Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, neu);
        }, { text: 'Eingerichtet, Beispieldaten ersetzt.', rueckgaengig: (d) => { Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, vorher); } });
      } else await aendern((d) => E.anwenden(d, eb, zahl), { text: 'Eingerichtet. Alles lässt sich antippen und ändern.' });
      return;
    }
    eb.schritt += 1; renderEbenen(); oben0();
  },
  'ef-zurueck': () => { const eb = oben(); if (eb.schritt > 0) { eb.schritt -= 1; eb.fehler = null; renderEbenen(); oben0(); } else schliessen(); },
  'ef-ueberspringen': () => { const eb = oben(); eb.schritt = E.SCHRITTE.length - 1; eb.fehler = null; renderEbenen(); oben0(); },
  'start-beispiel': async () => { z.daten = D.beispielDaten(); z.daten.einstellungen.gesehenVersion = APP_VERSION; z.ebenen = []; await aendern(() => {}, { text: 'Beispieldaten geladen. Später unter Einstellungen ersetzen oder entfernen.', haptik: false }); },
  'start-leer': async () => { z.daten = D.leereDaten(); z.daten.einstellungen.gesehenVersion = APP_VERSION; z.ebenen = []; await aendern(() => {}, false); oeffne(gehaltEbene(heuteYm())); },
  'beispiel-weg': () => oeffne({ art: 'frage', titel: 'Beispieldaten entfernen?', text: 'Alle Beispiel-Fixkosten, das Beispiel-Sparkonto und alle Buchungen werden gelöscht. Kategorien und Budgets bleiben.', ja: 'Entfernen', bei: async () => {
    const vorher = kopie(z.daten);
    await aendern((d) => { d.fixkosten = []; d.sparraten = []; d.uebertraege = []; d.buchungen = []; d.einnahmen.forEach((e) => { e.betrag = 0; e.istWerte = []; }); delete d.beispiel; }, { text: 'Beispieldaten entfernt', rueckgaengig: (d) => Object.assign(d, vorher) });
  } }),
  'frage-ja': async () => { const eb = z.ebenen.pop(); await eb.bei(); },

  // Fixkosten
  fixkosten: (el) => {
    const f = z.daten.fixkosten.find((x) => x.id === el.dataset.id);
    if (!f) return;
    const anteilF = f.meinAnteil == null ? 100 : Number(f.meinAnteil);
    const entwurf = Object.assign(kopie(f), { betragText: f.offen ? '' : R.euro(f.betrag, false), meinText: !f.offen && anteilF < 100 ? R.euro(Math.round(R.eigenerBetrag(f) * 100) / 100, false) : '' }, offenEntwurf(f));
    delete entwurf.offen;
    if (!entwurf.monat) entwurf.monat = R.ymTeile(heuteYm()).monat;
    oeffne({ art: 'fixkosten', id: f.id, entwurf, altBetrag: Number(f.betrag) || 0, altAnteil: anteilF, warOffen: !!f.offen, mehr: !!(f.abo || (f.meinAnteil != null && f.meinAnteil !== 100) || f.endetAm || f.kuendigungsfrist || f.konto || f.teiltMit) });
  },
  'fixkosten-neu': (el) => oeffne({ art: 'fixkosten', id: null, entwurf: { name: '', betragText: '', wieOft: 'monatlich', tag: 1, monat: R.ymTeile(heuteYm()).monat, kategorieId: el.dataset.kat || (fixKats()[0] || {}).id, abo: false, meinAnteil: 100, meinText: '', endetAm: null, kuendigungsfrist: null } }),
  'fk-rhythmus': (el) => { oben().entwurf.wieOft = el.dataset.wert; renderEbenen(); },
  'fk-monat': (el) => { oben().entwurf.monat = Number(el.dataset.wert); renderEbenen(); },
  'fk-tag': (el) => { const e = oben().entwurf; e.tag = Math.min(31, Math.max(1, e.tag + Number(el.dataset.wert))); renderEbenen(); },
  'tag-wahl': () => oeffne({ art: 'tag-wahl' }),
  'tag-gewaehlt': (el) => { z.ebenen.pop(); oben().entwurf.tag = Number(el.dataset.wert); renderEbenen(); },
  'fk-abo': () => { oben().entwurf.abo = !oben().entwurf.abo; renderEbenen(); },
  'fk-kategorie': () => oeffne({ art: 'kategorie-wahl' }),
  'kategorie-gewaehlt': (el) => { z.ebenen.pop(); oben().entwurf.kategorieId = el.dataset.wert; renderEbenen(); },
  'kategorie-neu': () => oeffne({ art: 'kategorie', id: null, entwurf: { name: '', emoji: '', farbe: FARBEN[fixKats().length % FARBEN.length] } }),
  kategorie: (el) => { const k = R.kategorie(z.daten, el.dataset.id); if (k) oeffne({ art: 'kategorie', id: k.id, entwurf: { name: k.name, emoji: k.emoji || '', farbe: k.farbe } }); },
  'budgets-farbe': () => oeffne({ art: 'kategorie', id: null, nurFarbe: true, entwurf: { name: 'Budgets', farbe: z.daten.einstellungen.budgetFarbe || '#5d7d99' } }),
  'kn-emoji': (el) => { oben().entwurf.emoji = el.dataset.wert; renderEbenen(); },
  'kn-loeschen': async () => {
    const eb = oben(); const k = R.kategorie(z.daten, eb.id);
    const n = z.daten.fixkosten.filter((f) => f.kategorieId === eb.id).length;
    if (n) { eb.fehler = `In „${k.name}“ stehen noch ${n} Fixkosten. Verschiebe oder lösche sie zuerst.`; renderEbenen(); return; }
    const i = z.daten.kategorien.indexOf(k);
    z.ebenen.pop();
    await aendern((d) => { d.kategorien = d.kategorien.filter((x) => x.id !== eb.id); }, { text: `Kategorie „${k.name}“ gelöscht`, rueckgaengig: (d) => d.kategorien.splice(i, 0, k) });
  },
  'kn-farbe': (el) => { oben().entwurf.farbe = el.dataset.wert; renderEbenen(); },
  'kn-speichern': async () => {
    const eb = oben(); const e = eb.entwurf;
    if (eb.nurFarbe) { z.ebenen.pop(); await aendern((d) => { d.einstellungen.budgetFarbe = e.farbe; }, { text: 'Farbe gespeichert' }); return; }
    const name = (e.name || '').trim();
    if (!name) { eb.fehler = 'Bitte einen Namen eintragen.'; renderEbenen(); return; }
    const emoji = (e.emoji || '').trim();
    z.ebenen.pop();
    if (eb.id) { await aendern((d) => { Object.assign(R.kategorie(d, eb.id), { name, emoji, farbe: e.farbe }); }, { text: `${name} gespeichert` }); return; }
    const id = D.neueId('kat');
    // kommt aus der Kategorie-Wahl einer Fixkosten-Seite? Dann dort gleich auswählen
    if (oben() && oben().art === 'kategorie-wahl') { z.ebenen.pop(); oben().entwurf.kategorieId = id; }
    await aendern((d) => d.kategorien.splice(d.kategorien.filter((k) => k.art === 'fix').length, 0, { id, name, emoji, art: 'fix', farbe: e.farbe }), { text: `Kategorie „${name}“ angelegt` });
  },
  'fk-speichern': async () => {
    const eb = oben(); const f = eb.entwurf;
    const o = f.unbekannt ? offenAus(f, true) : null;
    if (o && o.fehler) { eb.fehler = o.fehler; renderEbenen(); return; }
    const betrag = o ? o.betrag : zahl(f.betragText);
    // bei unbekanntem Betrag bleibt der bisherige Anteil in % stehen
    const anteil = o ? (f.meinAnteil == null ? 100 : Number(f.meinAnteil) || 100) : fkAnteil(f);
    const etag = String(f.erstattungTag || '').trim() ? zahl(String(f.erstattungTag)) : null;
    if (!f.name.trim()) { eb.fehler = 'Bitte einen Namen eintragen.'; renderEbenen(); return; }
    if (!o && (isNaN(betrag) || betrag <= 0)) { eb.fehler = 'Bitte einen Betrag über 0 € eintragen – oder „? Betrag unbekannt“ wählen.'; renderEbenen(); return; }
    if (anteil === null) { eb.fehler = `Dein Teil muss mehr als 0 € und höchstens ${R.euro(betrag)} sein (leer = du zahlst alles).`; renderEbenen(); return; }
    if (etag !== null && (isNaN(etag) || etag < 1 || etag > 31)) { eb.fehler = 'Der Tag der Überweisung muss zwischen 1 und 31 liegen.'; renderEbenen(); return; }
    const fertig = { id: eb.id || D.neueId('fk'), name: f.name.trim(), betrag, wieOft: f.wieOft, tag: f.tag, monat: f.wieOft === 'monatlich' ? null : f.monat, kategorieId: f.kategorieId, abo: !!f.abo, meinAnteil: anteil, endetAm: f.endetAm || null, kuendigungsfrist: f.kuendigungsfrist || null,
      teiltMit: anteil < 100 ? (f.teiltMit || '').trim() || null : null, erstattungTag: anteil < 100 && etag ? Math.round(etag) : null, konto: (f.konto || '').trim() || null };
    z.ebenen.pop();
    // v27: „gilt ab“ – alte Monate behalten den alten Betrag, außer bei „schon immer“
    const geaendert = !!eb.id && !o && !eb.warOffen && (Math.abs(betrag - eb.altBetrag) > 0.004 || Math.abs(anteil - eb.altAnteil) > 0.004);
    const ab = !geaendert || f.giltAb === 'immer' ? null : f.giltAb === 'naechster' ? R.ymPlus(heuteYm(), 1) : heuteYm();
    await aendern((d) => {
      const i = d.fixkosten.findIndex((x) => x.id === fertig.id);
      let neu = fertig;
      if (i >= 0) {
        const alt = Object.assign({}, d.fixkosten[i]);
        if (Array.isArray(f.frueher)) alt.frueher = f.frueher;
        neu = R.betragAendern(alt, fertig, ab);
        if (neu.frueher && !neu.frueher.length) delete neu.frueher;
      }
      if (o) neu.offen = o.offen; else delete neu.offen;
      if (i >= 0) d.fixkosten[i] = neu; else d.fixkosten.push(neu);
    }, { text: o ? `${fertig.name}: Betrag offen (${R.offenText(o.offen)}) · ${o.offen.zaehlt ? 'zählt mit' : 'zählt nicht'}` : `${fertig.name} gespeichert${ab ? ` · neuer Betrag ab ${monatsName(ab)}` : geaendert ? ' · gilt für alle Monate' : ''}` });
  },
  'fk-loeschen': async () => {
    const id = oben().id; const f = z.daten.fixkosten.find((x) => x.id === id); const i = z.daten.fixkosten.indexOf(f);
    z.ebenen.pop();
    await aendern((d) => { d.fixkosten = d.fixkosten.filter((x) => x.id !== id); }, { text: `${f.name} gelöscht`, rueckgaengig: (d) => d.fixkosten.splice(i, 0, f) });
  },

  // Budgets
  budget: (el) => {
    const k = R.kategorie(z.daten, el.dataset.id); if (!k) return;
    oeffne({ art: 'budget', id: k.id, entwurf: { name: k.name, emoji: k.emoji || '', budgetText: R.euro(k.budget || 0, false), schritte: [...(k.schritte || [5, 10])], frage: k.frage || 'Wo?', chips: [...(k.chips || [])] } });
  },
  'budget-neu': () => oeffne({ art: 'budget', id: null, entwurf: { name: '', budgetText: '', schritte: [-5, 5, 10], frage: 'Wo?', chips: [] } }),
  'bu-schritt': (el) => {
    const e = oben().entwurf; const w = Number(el.dataset.wert);
    if (e.schritte.includes(w)) e.schritte = e.schritte.filter((x) => x !== w);
    else { e.schritte.push(w); if (e.schritte.length > 3) e.schritte.shift(); }
    e.schritte.sort((a, b) => a - b);
    renderEbenen();
  },
  'bu-emoji': (el) => { oben().entwurf.emoji = el.dataset.wert; renderEbenen(); },
  'bu-frage': (el) => { oben().entwurf.frage = el.dataset.wert; renderEbenen(); },
  'bu-chip-weg': (el) => { oben().entwurf.chips.splice(Number(el.dataset.wert), 1); renderEbenen(); },
  'bu-chip-dazu': () => { const e = oben().entwurf; const t = (e.neuerChip || '').trim(); if (t && !e.chips.includes(t)) e.chips.push(t); e.neuerChip = ''; renderEbenen(); },
  'bu-speichern': async () => {
    const eb = oben(); const e = eb.entwurf;
    const budget = e.budgetText.trim() === '' ? 0 : zahl(e.budgetText);
    if (!e.name.trim()) { eb.fehler = 'Bitte einen Namen eintragen.'; renderEbenen(); return; }
    if (isNaN(budget) || budget < 0) { eb.fehler = 'Bitte ein Budget ab 0 € eintragen.'; renderEbenen(); return; }
    if (!e.schritte.some((w) => w > 0)) { eb.fehler = 'Mindestens ein Plus-Knopf wird gebraucht.'; renderEbenen(); return; }
    const t = (e.neuerChip || '').trim(); if (t && !e.chips.includes(t)) e.chips.push(t);
    const werte = { name: e.name.trim(), emoji: (e.emoji || '').trim(), budget, schritte: e.schritte, frage: e.frage, chips: e.chips };
    z.ebenen.pop();
    await aendern((d) => {
      const k = d.kategorien.find((x) => x.id === eb.id);
      if (k) Object.assign(k, werte); else d.kategorien.push(Object.assign({ id: D.neueId('kat'), art: 'budget', symbol: 'sonstiges' }, werte));
    }, { text: `${werte.name} gespeichert` });
  },
  'bu-loeschen': () => {
    const id = oben().id; const k = R.kategorie(z.daten, id);
    const n = z.daten.buchungen.filter((b) => b.kategorieId === id).length;
    oeffne({ art: 'frage', titel: `${k.name} löschen?`, text: n ? `Dazu ${n === 1 ? 'gibt es 1 Buchung. Sie wird' : `gibt es ${n} Buchungen. Sie werden`} mitgelöscht. Widgets für dieses Budget zeigen danach „Kategorie wählen“.` : 'Widgets für dieses Budget zeigen danach „Kategorie wählen“.', ja: 'Löschen', bei: async () => {
      z.ebenen.pop();
      const vorher = { k: kopie(k), i: z.daten.kategorien.indexOf(k), b: z.daten.buchungen.filter((b) => b.kategorieId === id) };
      await aendern((d) => { d.kategorien = d.kategorien.filter((x) => x.id !== id); d.buchungen = d.buchungen.filter((b) => b.kategorieId !== id); }, { text: `${k.name} gelöscht`, rueckgaengig: (d) => { d.kategorien.splice(vorher.i, 0, vorher.k); d.buchungen.push(...vorher.b); } });
    } });
  },

  // Gehalt
  gehalt: (el) => { z.blinkGehalt = null; oeffne(gehaltEbene(el.dataset.monat || z.monat)); },
  'ge-stimmt': async (el) => {
    const s = el.dataset.monat; const g = gehalt(); const betrag = R.einnahmeIm(g, s).schaetzung;
    await aendern((d) => { const x = R.gehaltVon(d); x.istWerte = (x.istWerte || []).filter((w) => R.ymAus(w.datum) !== s); x.istWerte.push({ datum: s + '-' + R.zweistellig(R.ankunftsTag(x, s)), betrag }); },
      { text: `Gehalt ${monatsName(s)}: ${R.euroRund(betrag)} bestätigt`, rueckgaengig: (d) => { const x = R.gehaltVon(d); x.istWerte = x.istWerte.filter((w) => R.ymAus(w.datum) !== s); } });
  },
  'ge-anders': (el) => {
    // zum Verlauf: das Gehalt blinkt, antippen zum Korrigieren
    const s = el.dataset.monat;
    z.ansicht = 'verlauf'; z.bearbeiten = false; z.blinkGehalt = s; render();
    setTimeout(() => { if (z.blinkGehalt === s) z.blinkGehalt = null; }, 4000);
    setTimeout(() => {
      const ziel = document.querySelector(`.eintrag[data-a="gehalt"][data-monat="${s}"]`);
      if (ziel) ziel.scrollIntoView({ block: 'center', behavior: 'smooth' });
      zeigeToast(`${gehalt().name} ${monatsName(s)} antippen und den echten Betrag eintragen`, null, 'info');
    }, 80);
  },
  'ge-schnitt': () => { const eb = oben(); const st = R.gehaltStatistik(gehalt(), 3); if (st.anzahl) { eb.schaetzungText = R.euro(Math.round(st.schnitt), false); renderEbenen(); } },
  'me-gehalt': async () => {
    const eb = oben(); const s = eb.monat; const f = document.getElementById('me-gehalt');
    const betrag = zahl(f ? f.value : '');
    if (isNaN(betrag) || betrag < 0) { eb.fehler = 'Bitte den Betrag eintragen, der angekommen ist.'; renderEbenen(); return; }
    eb.fehler = null;
    await aendern((d) => { const x = R.gehaltVon(d); x.istWerte = (x.istWerte || []).filter((w) => R.ymAus(w.datum) !== s); x.istWerte.push({ datum: s + '-' + R.zweistellig(R.ankunftsTag(x, s)), betrag }); },
      { text: `Gehalt ${monatsName(s)}: ${R.euroRund(betrag)} eingetragen` });
    eb.entwurf.betragText = R.euro(Math.max(0, R.uebrigIm(z.daten, s).uebrig), false); renderEbenen();
  },
  'ge-ankunft': (el) => { gehalt().kommtAn = el.dataset.wert; renderEbenen(); },
  'of-an': () => {
    const e = oben().entwurf || oben();
    e.unbekannt = !e.unbekannt;
    if (e.unbekannt && e.zaehlt === undefined) e.zaehlt = true;
    oben().fehler = null; haptik('tick'); renderEbenen();
    const f = document.getElementById(e.unbekannt ? 'of-von' : 'et-betrag') || document.querySelector('.sheet [data-feld="betragText"], .seite:last-of-type [data-feld="betragText"]');
    if (f) f.focus();
  },
  'of-zaehlt': (el) => { const e = oben().entwurf || oben(); e.zaehlt = el.dataset.wert === '1'; oben().fehler = null; haptik('tick'); renderEbenen(); },
  offene: () => oeffne({ art: 'offene' }),
  'of-um': async (el) => {
    const x = R.offenFinden(z.daten, el.dataset.typ, el.dataset.id); if (!x) return;
    const an = !x.offen.zaehlt;
    if (an && !R.offenSpanne(x.offen).hat) { zeigeToast('Zum Mitrechnen erst ungefähr einen Wert eintragen (Eintrag antippen)', null, 'info'); return; }
    const kosten = el.dataset.typ !== 'einnahme'; const sp = R.offenSpanne(x.offen);
    const oben0 = (document.querySelector('.seite:last-of-type') || {}).scrollTop || 0;
    await aendern((d) => R.offenZaehltSetzen(d, el.dataset.typ, el.dataset.id, an),
      { text: an ? `${el.dataset.name}: zählt jetzt mit (${R.euro(kosten ? sp.bis : sp.von)})` : `${el.dataset.name}: zählt nicht mehr mit`, haptik: 'tick' });
    const seiteJetzt = document.querySelector('.seite:last-of-type'); if (seiteJetzt) seiteJetzt.scrollTop = oben0;
  },
  'of-alle': async (el) => {
    const an = el.dataset.wert === '1';
    const liste = R.offeneListe(z.daten).filter((x) => !!x.eintrag.offen.zaehlt !== an && (!an || R.offenSpanne(x.eintrag.offen).hat));
    if (!liste.length) { zeigeToast(an ? 'Alle mit Schätzung zählen schon mit' : 'Es zählt schon keiner mit', null, 'info'); return; }
    const vorher = liste.map((x) => [x.typ, x.id, !an]);
    await aendern((d) => liste.forEach((x) => R.offenZaehltSetzen(d, x.typ, x.id, an)),
      { text: liste.length === 1 ? `1 offener Betrag zählt ${an ? 'jetzt mit' : 'nicht mehr mit'}` : `${liste.length} offene Beträge zählen ${an ? 'jetzt mit' : 'nicht mehr mit'}`, rueckgaengig: (d) => vorher.forEach(([t, id, w]) => R.offenZaehltSetzen(d, t, id, w)) });
  },
  'of-oeffnen': (el) => {
    const { typ, id } = el.dataset;
    if (typ === 'fixkosten') AKTION.fixkosten({ dataset: { id } });
    else if (typ === 'einnahme') AKTION.einnahme({ dataset: { id, monat: heuteYm() } });
    else if (typ === 'buchung') AKTION.buchung({ dataset: { id } });
    else if (typ === 'konto') AKTION.sparkonto({ dataset: { id } });
  },
  gehaltsrechner: (el) => {
    const gespeichert = z.daten.einstellungen.gehaltsrechner;
    oeffne({ art: 'gehaltsrechner', monat: el.dataset.monat || heuteYm(), entwurf: Object.assign({}, DRK.STANDARD, gespeichert || {}) });
  },
  'gr-wahl': (el) => { const eb = oben(); eb.entwurf[el.dataset.feld] = el.dataset.wert; haptik('tick'); renderEbenen(); },
  'gr-offen': (el) => { const e = oben().entwurf; e[el.dataset.feld + 'Offen'] = !e[el.dataset.feld + 'Offen']; haptik('tick'); renderEbenen(); },
  'gr-schalter': (el) => { const eb = oben(); eb.entwurf[el.dataset.feld] = !eb.entwurf[el.dataset.feld]; haptik('tick'); renderEbenen(); },
  'gr-merken': async () => {
    const e = Object.assign({}, oben().entwurf);
    await aendern((d) => { d.einstellungen.gehaltsrechner = e; }, { text: 'Eingaben im Gehaltsrechner gemerkt' });
  },
  'gr-uebernehmen': async (el) => {
    const eb = oben();
    const netto = Math.round(Number(el.dataset.wert) * 100) / 100;
    const e = Object.assign({}, eb.entwurf);
    const vorher = gehalt().betrag;
    z.ebenen.pop();
    if (oben() && oben().art === 'gehalt') z.ebenen.pop(); // vom Gehalt-Fenster aus geöffnet: beide schließen
    await aendern((d) => { R.gehaltVon(d).betrag = netto; d.einstellungen.gehaltsrechner = e; },
      { text: `Gehalt-Schätzung: ${R.euroRund(netto)} übernommen`, rueckgaengig: (d) => { R.gehaltVon(d).betrag = vorher; } });
  },
  'gr-jsz': async (el) => {
    const netto = Math.round(Number(el.dataset.wert) * 100) / 100;
    const h = heuteYm();
    const jahr = R.ymTeile(h).jahr + (R.ymTeile(h).monat > 11 ? 1 : 0);
    const monat = jahr + '-11';
    const alt = z.daten.einnahmen.find((x) => x.name === 'Jahressonderzahlung' && x.monat === monat);
    const id = alt ? alt.id : 'e' + Date.now().toString(36);
    await aendern((d) => {
      const x = d.einnahmen.find((y) => y.id === id);
      if (x) x.betrag = netto;
      else d.einnahmen.push({ id, name: 'Jahressonderzahlung', wieOft: 'einmalig', monat, betrag: netto, sicher: false, status: 'fest', kommtAn: 'sofort', istWerte: [] });
    }, { text: `Jahressonderzahlung ≈ ${R.euroRund(netto)} im November ${jahr} eingetragen`, rueckgaengig: (d) => { if (alt) d.einnahmen.find((y) => y.id === id).betrag = alt.betrag; else d.einnahmen = d.einnahmen.filter((y) => y.id !== id); } });
  },
  'ge-speichern': async () => {
    const eb = oben();
    const schaetzung = zahl(eb.schaetzungText);
    const ist = eb.istText.trim() === '' ? null : zahl(eb.istText);
    const tag = zahl(eb.tagText);
    if (isNaN(schaetzung) || schaetzung < 0) { eb.fehler = 'Bitte eine Schätzung ab 0 € eintragen.'; renderEbenen(); return; }
    if (ist !== null && (isNaN(ist) || ist < 0)) { eb.fehler = 'Der Betrag ist keine Zahl.'; renderEbenen(); return; }
    z.ebenen.pop();
    await aendern((d) => {
      const g = R.gehaltVon(d);
      g.betrag = schaetzung;
      if (g.kommtAn === 'Tag') g.ankunftTag = isNaN(tag) ? 1 : Math.min(31, Math.max(1, Math.round(tag)));
      g.istWerte = g.istWerte.filter((w) => R.ymAus(w.datum) !== eb.monat);
      if (ist !== null) g.istWerte.push({ datum: eb.monat + '-' + R.zweistellig(R.ankunftsTag(g, eb.monat)), betrag: ist });
    }, { text: ist !== null ? `Gehalt ${monatsName(eb.monat)}: ${R.euroRund(ist)} eingetragen` : 'Gehalt gespeichert' });
  },

  // Sparkonto
  sparkonto: (el) => {
    const sp = z.daten.sparraten.find((x) => x.id === el.dataset.id);
    if (sp) oeffne({ art: 'sparkonto', id: sp.id, entwurf: { ...offenEntwurf(sp), art: R.kontoArt(sp), name: sp.name, betragText: sp.offen ? '' : R.euro(sp.betrag, false), tagText: String(sp.tag || 1), standText: R.euro(R.sparStand(sp, heute(), z.daten), false), zielText: Number(sp.ziel) > 0 ? R.euro(sp.ziel, false) : '', zielBis: sp.zielBis || '' } });
    else oeffne({ art: 'sparkonto', id: null, entwurf: { art: 'sparen', name: R.sparratenNormal(z.daten).length ? '' : 'Sparkonto', betragText: '', tagText: '1', standText: '0', zielText: '', zielBis: '' } });
  },
  'sp-art': (el) => { oben().entwurf.art = el.dataset.wert; renderEbenen(); },
  'sp-name': (el) => { oben().entwurf.name = el.dataset.wert; renderEbenen(); },
  'sp-speichern': async () => {
    const eb = oben(); const e = eb.entwurf;
    const o = e.unbekannt ? offenAus(e, true) : null;
    if (o && o.fehler) { eb.fehler = o.fehler; renderEbenen(); return; }
    const betrag = o ? o.betrag : e.betragText.trim() ? zahl(e.betragText) : 0; const tag = zahl(e.tagText); const stand = e.art === 'extern' ? 0 : zahl(e.standText || '0');
    if (!e.name.trim()) { eb.fehler = 'Bitte einen Namen eintragen.'; renderEbenen(); return; }
    if (isNaN(betrag) || betrag < 0) { eb.fehler = 'Bitte eine Rate ab 0 € eintragen.'; renderEbenen(); return; }
    if (isNaN(tag) || tag < 1 || tag > 31) { eb.fehler = 'Der Tag muss zwischen 1 und 31 liegen.'; renderEbenen(); return; }
    if (isNaN(stand)) { eb.fehler = 'Der Stand ist keine Zahl.'; renderEbenen(); return; }
    const ziel = e.art === 'extern' || !String(e.zielText || '').trim() ? null : zahl(e.zielText);
    if (ziel !== null && (isNaN(ziel) || ziel <= 0)) { eb.fehler = 'Das Sparziel muss über 0 € liegen (oder leer lassen).'; renderEbenen(); return; }
    z.ebenen.pop();
    const neuId = eb.id || D.neueId('spar');
    const unten = z.ebenen[z.ebenen.length - 1];
    if (unten && unten.wartetAufKonto) { unten.entwurf.kontoId = neuId; unten.wartetAufKonto = false; unten.fehler = null; }
    await aendern((d) => {
      const werte = { name: e.name.trim(), betrag, tag: Math.round(tag), stand, standDatum: heute(), standZeit: new Date().toISOString(), art: e.art === 'extern' ? 'extern' : undefined, ziel, zielBis: ziel && e.zielBis ? e.zielBis : null };
      const sp = d.sparraten.find((x) => x.id === eb.id);
      if (o) werte.offen = o.offen;
      if (sp) { Object.assign(sp, werte); if (!o) delete sp.offen; } else d.sparraten.push(Object.assign({ id: neuId }, werte));
    }, { text: o ? `${e.name.trim()}: Übertrag offen (${R.offenText(o.offen)}) · ${o.offen.zaehlt ? 'zählt mit' : 'zählt nicht'}` : `${e.name.trim()} gespeichert` });
  },
  'sp-loeschen': async () => {
    const id = oben().id; const sp = z.daten.sparraten.find((x) => x.id === id);
    z.ebenen.pop();
    const weg = (z.daten.uebertraege || []).filter((u) => u.kontoId === id);
    await aendern((d) => { d.sparraten = d.sparraten.filter((x) => x.id !== id); d.uebertraege = (d.uebertraege || []).filter((u) => u.kontoId !== id); }, { text: `${sp.name} gelöscht`, rueckgaengig: (d) => { d.sparraten.push(sp); d.uebertraege = (d.uebertraege || []).concat(weg); } });
  },

  // Rücklagenkonto
  ruecklage: () => {
    const rk = R.ruecklage(z.daten);
    const empf = R.empfohleneRuecklage(z.daten, heuteYm());
    oeffne({ art: 'ruecklage', vorhanden: !!rk, entwurf: rk
      ? { betragText: R.euro(rk.betrag, false), tagText: String(rk.tag || 1), standText: R.euro(Math.round(R.ruecklageStand(z.daten, heute()) * 100) / 100, false) }
      : { betragText: String(empf || ''), tagText: '1', standText: '0' } });
  },
  'rk-empfohlen': () => { oben().entwurf.betragText = String(R.empfohleneRuecklage(z.daten, heuteYm())); renderEbenen(); },
  budgetleiste: async () => { const aus = !z.daten.einstellungen.budgetLeisteAus; await aendern((d) => { d.einstellungen.budgetLeisteAus = aus; }, { text: aus ? 'Budgets unter „Frei“ ausgeblendet' : 'Budgets unter „Frei“ eingeblendet', haptik: false }); },
  'ruecklage-hinweis-weg': async () => { await aendern((d) => { d.einstellungen.ruecklageHinweisAus = true; }, { text: 'Hinweis ausgeblendet', haptik: false }); },
  'rk-speichern': async () => {
    const eb = oben(); const e = eb.entwurf;
    const betrag = zahl(e.betragText); const tag = zahl(e.tagText); const stand = zahl(e.standText || '0');
    if (isNaN(betrag) || betrag < 0) { eb.fehler = 'Bitte den Dauerauftrag ab 0 € eintragen.'; renderEbenen(); return; }
    if (isNaN(tag) || tag < 1 || tag > 31) { eb.fehler = 'Der Tag muss zwischen 1 und 31 liegen.'; renderEbenen(); return; }
    if (isNaN(stand)) { eb.fehler = 'Der Stand ist keine Zahl.'; renderEbenen(); return; }
    z.ebenen.pop();
    await aendern((d) => {
      const werte = { betrag, tag: Math.round(tag), stand, standDatum: heute(), standZeit: new Date().toISOString() };
      const rk = d.sparraten.find((x) => x.art === 'ruecklage');
      if (rk) Object.assign(rk, werte); else d.sparraten.push(Object.assign({ id: 'ruecklage', name: 'Rücklagenkonto', art: 'ruecklage', ziel: null }, werte));
    }, { text: 'Rücklagenkonto gespeichert' });
  },
  'rk-loeschen': async () => {
    const rk = R.ruecklage(z.daten); const i = z.daten.sparraten.indexOf(rk);
    z.ebenen.pop();
    await aendern((d) => { d.sparraten = d.sparraten.filter((x) => x.art !== 'ruecklage'); }, { text: 'Ohne Rücklagenkonto: jährliche Kosten zählen jetzt im Monat der Abbuchung', rueckgaengig: (d) => d.sparraten.splice(i, 0, rk) });
  },

  // Weitere Einnahmen
  'einnahme-neu': (el) => { const m = el.dataset.monat || heuteYm(); oeffne({ art: 'einnahme', id: null, monatAnsicht: m, entwurf: { name: '', betragText: '', wieOft: 'einmalig', monat: m < heuteYm() ? heuteYm() : m, ab: m < heuteYm() ? heuteYm() : m, bis: '', status: 'geplant', selbststaendig: false } }); },
  einnahme: (el) => {
    const e = z.daten.einnahmen.find((x) => x.id === el.dataset.id); if (!e) return;
    oeffne({ art: 'einnahme', id: e.id, monatAnsicht: el.dataset.monat || heuteYm(), entwurf: { ...offenEntwurf(e), name: e.name, betragText: e.offen ? '' : betragText(e).replace(' €', ''), wieOft: e.wieOft === 'monatlich' ? 'monatlich' : 'einmalig', monat: e.monat || heuteYm(), ab: e.ab || heuteYm(), bis: e.bis || '', status: e.status === 'geplant' ? 'geplant' : 'fest', selbststaendig: !!e.selbststaendig } });
  },
  'ei-vorschlag': (el) => { oben().entwurf.name = el.dataset.wert; if (/Selbstständig/.test(el.dataset.wert)) oben().entwurf.selbststaendig = true; renderEbenen(); },
  'ei-wieoft': (el) => { oben().entwurf.wieOft = el.dataset.wert; renderEbenen(); },
  'ei-status': (el) => { oben().entwurf.status = el.dataset.wert; renderEbenen(); },
  'ei-selbst': () => { oben().entwurf.selbststaendig = !oben().entwurf.selbststaendig; renderEbenen(); },
  'ei-speichern': async () => {
    const eb = oben(); const e = eb.entwurf;
    const o = e.unbekannt ? offenAus(e, false) : null;
    if (o && o.fehler) { eb.fehler = o.fehler; renderEbenen(); return; }
    const betrag = o ? 0 : preisAusText(e.betragText);
    if (!String(e.name || '').trim()) { eb.fehler = 'Bitte eintragen, was reinkommt.'; renderEbenen(); return; }
    if (!o && typeof betrag === 'number' && (isNaN(betrag) || betrag <= 0)) { eb.fehler = 'Bitte einen Betrag eintragen, z. B. 300 oder 200–300.'; renderEbenen(); return; }
    if (e.wieOft === 'monatlich' && e.bis && e.bis < e.ab) { eb.fehler = '„Bis“ liegt vor „Ab“.'; renderEbenen(); return; }
    const werte = { name: e.name.trim(), wieOft: e.wieOft, betrag, sicher: typeof betrag === 'number', status: e.status === 'geplant' ? 'geplant' : 'fest', selbststaendig: !!e.selbststaendig,
      monat: e.wieOft === 'einmalig' ? e.monat : null, ab: e.wieOft === 'monatlich' ? e.ab : null, bis: e.wieOft === 'monatlich' ? (e.bis || null) : null };
    if (o) Object.assign(werte, offeneEinnahmeWerte(o.offen));
    z.ebenen.pop();
    await aendern((d) => {
      const x = d.einnahmen.find((y) => y.id === eb.id);
      if (x) { Object.assign(x, werte); if (!o) delete x.offen; } else d.einnahmen.push(Object.assign({ id: D.neueId('ein'), kommtAn: 'sofort', istWerte: [] }, werte));
    }, { text: o ? `${werte.name}: Betrag offen (${R.offenText(o.offen)}) · ${o.offen.zaehlt ? 'zählt mit' : 'zählt nicht'}` : `${werte.name} eingetragen` });
  },
  'ei-angekommen': async () => {
    const eb = oben();
    if (eb.entwurf.unbekannt) { eb.fehler = 'Tippe erst auf „Betrag eintragen“ und trag ein, wie viel angekommen ist.'; renderEbenen(); return; }
    const b = preisAusText(eb.entwurf.betragText);
    const betrag = typeof b === 'object' ? b.von : b;
    if (isNaN(betrag) || betrag <= 0) { eb.fehler = 'Bitte eintragen, wie viel angekommen ist.'; renderEbenen(); return; }
    const m = eb.monatAnsicht;
    const alt = kopie(z.daten.einnahmen.find((y) => y.id === eb.id));
    z.ebenen.pop();
    await aendern((d) => {
      const x = d.einnahmen.find((y) => y.id === eb.id);
      x.istWerte = (x.istWerte || []).filter((w) => R.ymAus(w.datum) !== m);
      x.istWerte.push({ datum: m === heuteYm() ? heute() : m + '-' + R.zweistellig(R.tageImMonat(m)), betrag });
      // einmalige Einnahme mit offenem Betrag ist damit geklärt
      if (x.offen && x.wieOft === 'einmalig') { delete x.offen; x.betrag = betrag; x.sicher = true; }
    }, { text: `${eb.entwurf.name}: ${R.euro(betrag)} angekommen`, rueckgaengig: (d) => { const i = d.einnahmen.findIndex((y) => y.id === eb.id); if (i >= 0) d.einnahmen[i] = alt; } });
  },
  'ei-loeschen': async () => {
    const id = oben().id; const e = z.daten.einnahmen.find((x) => x.id === id); const i = z.daten.einnahmen.indexOf(e);
    z.ebenen.pop();
    await aendern((d) => { d.einnahmen = d.einnahmen.filter((x) => x.id !== id); }, { text: `${e.name} gelöscht`, rueckgaengig: (d) => d.einnahmen.splice(i, 0, e) });
  },

  // Potenzielle Ausgaben
  'wunsch-neu': (el) => oeffne({ art: 'wunsch', id: null, entwurf: { name: '', preisText: '', monat: el.dataset.monat && el.dataset.monat !== heuteYm() ? el.dataset.monat : '', kategorieId: '' } }),
  wunsch: (el) => {
    const w = (z.daten.wuensche || []).find((x) => x.id === el.dataset.id); if (!w) return;
    const p = w.preis;
    oeffne({ art: 'wunsch', id: w.id, entwurf: { name: (w.emoji ? w.emoji + ' ' : '') + w.name, preisText: p && typeof p === 'object' ? R.euro(p.von, false) + '–' + R.euro(p.bis, false) : R.euro(Number(p) || 0, false), monat: w.monat || '', kategorieId: w.kategorieId || '' } });
  },
  'wu-speichern': async () => {
    const eb = oben(); const e = eb.entwurf;
    const preis = preisAusText(e.preisText);
    if (!String(e.name || '').trim()) { eb.fehler = 'Bitte eintragen, was du kaufen möchtest.'; renderEbenen(); return; }
    if (typeof preis === 'number' && (isNaN(preis) || preis <= 0)) { eb.fehler = 'Bitte einen Preis eintragen, z. B. 300 oder 250–300.'; renderEbenen(); return; }
    const werte = { name: e.name.trim(), preis, monat: e.monat || null, kategorieId: e.kategorieId || null };
    z.ebenen.pop();
    await aendern((d) => {
      if (!Array.isArray(d.wuensche)) d.wuensche = [];
      const w = d.wuensche.find((x) => x.id === eb.id);
      if (w) { Object.assign(w, werte); delete w.emoji; } else d.wuensche.push(Object.assign({ id: D.neueId('wunsch'), status: 'geplant' }, werte));
    }, { text: `${werte.name} geplant` });
  },
  'wu-loeschen': async () => {
    const id = oben().id; const w = z.daten.wuensche.find((x) => x.id === id); const i = z.daten.wuensche.indexOf(w);
    z.ebenen.pop();
    await aendern((d) => { d.wuensche = d.wuensche.filter((x) => x.id !== id); }, { text: `${w.name} gelöscht`, rueckgaengig: (d) => d.wuensche.splice(i, 0, w) });
  },
  'wu-gekauft': async () => {
    const eb = oben(); const w = z.daten.wuensche.find((x) => x.id === eb.id);
    const preis = preisAusText(eb.entwurf.preisText);
    const betrag = typeof preis === 'object' ? preis.bis : preis;
    if (isNaN(betrag) || betrag <= 0) { eb.fehler = 'Bitte zuerst den Preis eintragen.'; renderEbenen(); return; }
    // v27: bei „von–bis“ erst nach dem echten Preis fragen
    if (typeof preis === 'object') { oeffne({ art: 'gekauft', id: w.id, name: w.name, von: preis.von, bis: preis.bis, betragText: '' }); setTimeout(() => { const f = document.getElementById('gk-betrag'); if (f) f.focus(); }, 60); return; }
    z.ebenen.pop();
    await wunschKaufen(w, betrag);
  },
  'gk-wert': (el) => { const eb = oben(); eb.betragText = R.euro(Number(el.dataset.wert), false); eb.fehler = null; renderEbenen(); },
  'gk-buchen': async () => {
    const eb = oben(); const w = z.daten.wuensche.find((x) => x.id === eb.id);
    const betrag = zahl(eb.betragText);
    if (isNaN(betrag) || betrag <= 0) { eb.fehler = 'Bitte eintragen, was es gekostet hat.'; renderEbenen(); return; }
    z.ebenen.pop();
    if (oben() && oben().art === 'wunsch') z.ebenen.pop();
    await wunschKaufen(w, betrag);
  },

  // Buchungen
  buchung: (el) => { const b = z.daten.buchungen.find((x) => x.id === el.dataset.id); if (b) oeffne(Object.assign({ art: 'buchung', id: b.id, betragText: b.offen ? '' : R.euro(b.gesamt || b.betrag, false), ort: b.ort || '', kategorieId: b.kategorieId, datum: b.zeit.slice(0, 10), zurueckErhalten: !!b.zurueckErhalten }, teilEntwurf(b), offenEntwurf(b))); },
  'bh-kat': (el) => { const eb = oben(); eb.kategorieId = el.dataset.wert; const k = R.kategorie(z.daten, eb.kategorieId); if (eb.ort && !((k && k.chips) || []).includes(eb.ort) && ((R.kategorie(z.daten, (z.daten.buchungen.find((x) => x.id === eb.id) || {}).kategorieId) || {}).chips || []).includes(eb.ort)) eb.ort = ''; haptik('tick'); renderEbenen(); },
  'bh-zurueck': () => { oben().zurueckErhalten = !oben().zurueckErhalten; renderEbenen(); },
  'tl-an': (el) => { const t = oben().entwurf || oben(); const vorher = !!t.geteilt; t.geteilt = el.dataset.wert === '1'; if (!t.anteil) t.anteil = '1/2'; if (t.geteilt && !vorher) t.teilAuf = Date.now(); renderEbenen(); if (t.geteilt && !vorher) { const box = document.querySelector('.teil-box'); if (box) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } },
  'tl-anteil': (el) => { haptik('tick'); const t = oben().entwurf || oben(); t.anteil = el.dataset.wert; renderEbenen(); },
  'rueck-erhalten': async (el) => {
    const b = z.daten.buchungen.find((x) => x.id === el.dataset.id); if (!b) return;
    await aendern((d) => { const x = d.buchungen.find((y) => y.id === b.id); if (x) x.zurueckErhalten = true; },
      { text: `${R.euro(Math.round((b.gesamt - b.betrag) * 100) / 100)} von ${b.teiltMit || 'der anderen Person'} bekommen`, rueckgaengig: (d) => { const x = d.buchungen.find((y) => y.id === b.id); if (x) x.zurueckErhalten = false; } });
  },
  'rueck-alle': async (el) => {
    const p = R.personenAbrechnung(z.daten).find((x) => x.name === el.dataset.name); if (!p) return;
    const ids = p.buchungen.map((b) => b.id);
    await aendern((d) => { for (const b of d.buchungen) if (ids.includes(b.id)) b.zurueckErhalten = true; },
      { text: `${R.euro(p.summe)} von ${p.name === 'Ohne Namen' ? 'der anderen Person' : p.name} bekommen (${ids.length === 1 ? '1 Ausgabe' : ids.length + ' Ausgaben'})`, rueckgaengig: (d) => { for (const b of d.buchungen) if (ids.includes(b.id)) b.zurueckErhalten = false; } });
  },
  'bh-ort': (el) => { oben().ort = el.dataset.wert; renderEbenen(); },
  'bh-speichern': async () => {
    const eb = oben();
    const o = eb.unbekannt ? offenAus(eb, true) : null;
    if (o && o.fehler) { eb.fehler = o.fehler; renderEbenen(); return; }
    const betrag = o ? o.betrag : zahl(eb.betragText);
    if (!o && (isNaN(betrag) || betrag <= 0)) { eb.fehler = 'Bitte einen Betrag über 0 € eintragen.'; renderEbenen(); return; }
    const tr = o ? null : teilRechnung(eb);
    if (tr && tr.fehler) { eb.fehler = tr.fehler; renderEbenen(); return; }
    if (!eb.datum) { eb.fehler = 'Bitte ein Datum wählen.'; renderEbenen(); return; }
    if (eb.datum > heute()) { eb.fehler = 'Das Datum liegt in der Zukunft. Für später: „Potenzielle Ausgabe planen“.'; renderEbenen(); return; }
    const alt = z.daten.buchungen.find((x) => x.id === eb.id);
    const neuKat = eb.kategorieId && R.kategorie(z.daten, eb.kategorieId) ? eb.kategorieId : alt.kategorieId;
    const verschoben = [neuKat !== alt.kategorieId ? `jetzt ${R.kategorie(z.daten, neuKat).name}` : '', eb.datum !== alt.zeit.slice(0, 10) ? `am ${Number(eb.datum.slice(8))}.${Number(eb.datum.slice(5, 7))}.` : ''].filter(Boolean).join(', ');
    z.ebenen.pop();
    await aendern((d) => {
      const b = d.buchungen.find((x) => x.id === eb.id); if (!b) return;
      b.ort = eb.ort || null;
      b.kategorieId = neuKat;
      if (eb.datum !== b.zeit.slice(0, 10)) b.zeit = eb.datum + (b.zeit.slice(10) || 'T12:00:00');
      if (tr) Object.assign(b, { betrag: tr.mein, gesamt: tr.gesamt, teiltMit: (eb.teiltMit || '').trim() || null, zurueckErhalten: !!eb.zurueckErhalten });
      else { b.betrag = betrag; delete b.gesamt; delete b.teiltMit; delete b.zurueckErhalten; }
      if (o) b.offen = o.offen; else delete b.offen;
    }, { text: o ? `Buchung: Betrag offen (${R.offenText(o.offen)})` : 'Buchung geändert' + (verschoben ? ` · ${verschoben}` : '') });
  },
  'buchung-weg': async (el) => {
    const id = el.dataset.id; const b = z.daten.buchungen.find((x) => x.id === id); if (!b) return;
    if (oben() && oben().art === 'buchung') z.ebenen.pop();
    const kat = R.kategorie(z.daten, b.kategorieId);
    await aendern((d) => { d.buchungen = d.buchungen.filter((x) => x.id !== id); }, { text: `${kat ? kat.name : 'Buchung'} ${R.euro(b.betrag)} rückgängig gemacht`, rueckgaengig: (d) => d.buchungen.push(b) });
  },

  // Sicherung
  export: async () => {
    const jetzt = new Date();
    const name = `finanz-sicherung-${R.datumText(jetzt)}-${R.zweistellig(jetzt.getHours())}${R.zweistellig(jetzt.getMinutes())}.json`;
    z.daten.einstellungen.letzteSicherung = jetzt.toLocaleDateString('de-DE') + ' ' + R.zweistellig(jetzt.getHours()) + ':' + R.zweistellig(jetzt.getMinutes());
    z.daten.einstellungen.letzteSicherungZeit = jetzt.toISOString(); delete z.daten.einstellungen.sicherungSpaeter;
    try {
      await D.speichern(z.daten);
      const pfad = await D.exportieren(z.daten, name);
      zeigeToast(`Gespeichert in ${pfad}`);
      render();
    } catch (e) { zeigeToast('Sicherung fehlgeschlagen: ' + (e && e.message ? e.message : e), null, 'fehler'); haptik('fehler'); }
  },
  import: () => document.getElementById('import-datei').click()
};

async function kachelEntfernen(id) {
  const vorher = kachelListe().map((k) => Object.assign({}, k));
  const a = kachelArt(id);
  await aendern((d) => { d.einstellungen.kacheln = vorher.filter((k) => k.id !== id); }, { text: `${a ? a.titel : 'Kachel'} entfernt`, rueckgaengig: (d) => { d.einstellungen.kacheln = vorher; } });
}

// ---------- Kacheln ziehen wie auf dem Android-Homescreen ----------
function haptik(art) {
  // Bedeutung statt Stärke: bestaetigt (wichtig gespeichert), fehler, tick (Auswahl), gegriffen (langes Drücken)
  try {
    const nativ = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    if (nativ && D.haptik(art)) return;
    if (navigator.vibrate) navigator.vibrate(art === 'fehler' ? [20, 60, 20] : art === 'bestaetigt' ? 18 : art === 'gegriffen' ? 25 : 8);
  } catch (e) { /* ohne Vibration weiter */ }
}
async function kachelGroesse(id, aenderung) {
  const l = kachelListe().map((k) => Object.assign({}, k));
  const k = l.find((x) => x.id === id);
  if (!k) return;
  Object.assign(k, aenderung);
  if (!AUFKLAPPBAR.has(id)) k.offen = false;
  await aendern((d) => { d.einstellungen.kacheln = l; }, { text: 'Größe gespeichert', haptik: false });
}
function bindeKachelZiehen() {
  let zug = null; // { platz, id, startX, startY, timer, aktiv, bewegt, klon, dx, dy }
  let gzug = null; // Größe ändern an den Punkten: { platz, id, seite, r, c, rahmen, breit, offen, zielBreit, zielOffen }
  let klickSperre = false;
  const punkt = (e) => (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
  const griffStart = (griff) => {
    const platz = griff.closest('.kachel-platz');
    const r = platz.getBoundingClientRect();
    const c = document.getElementById('kacheln').getBoundingClientRect();
    const k = kachelListe().find((x) => x.id === platz.dataset.kachel) || {};
    const rahmen = document.createElement('div');
    rahmen.className = 'groesse-rahmen';
    Object.assign(rahmen.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    document.body.appendChild(rahmen);
    const breit = platz.classList.contains('breit');
    gzug = { platz, id: platz.dataset.kachel, seite: griff.dataset.seite, r, c, rahmen, breit, offen: !!k.offen, zielBreit: breit, zielOffen: !!k.offen };
    document.body.classList.add('kachel-zieht');
    haptik('gegriffen');
  };
  const griffBewegen = (p) => {
    const g = gzug, r = g.r, c = g.c;
    let left = r.left, top = r.top, w = r.width, h = r.height;
    if (g.seite === 'r') w = Math.min(Math.max(p.clientX - r.left, 80), c.right - r.left);
    if (g.seite === 'l') { left = Math.max(Math.min(p.clientX, r.right - 80), c.left); w = r.right - left; }
    if (g.seite === 'u') h = Math.max(p.clientY - r.top, 60);
    if (g.seite === 'o') { top = Math.min(p.clientY, r.bottom - 60); h = r.bottom - top; }
    Object.assign(g.rahmen.style, { left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px' });
    let zielBreit = g.zielBreit, zielOffen = g.zielOffen;
    if (g.seite === 'l' || g.seite === 'r') zielBreit = w > c.width * 0.74;
    else zielOffen = g.offen ? h > r.height - 50 : h > r.height + 50;
    if (zielBreit !== g.zielBreit || zielOffen !== g.zielOffen) haptik('tick');
    g.zielBreit = zielBreit; g.zielOffen = zielOffen;
    g.rahmen.classList.toggle('schnapp', zielBreit !== g.breit || zielOffen !== g.offen);
  };
  const griffEnde = async () => {
    const g = gzug; gzug = null;
    g.rahmen.remove();
    document.body.classList.remove('kachel-zieht');
    klickSperre = true; setTimeout(() => { klickSperre = false; }, 400);
    if (g.seite === 'l' || g.seite === 'r') {
      if (g.zielBreit === g.breit) return;
      haptik('tick');
      await kachelGroesse(g.id, g.zielBreit ? { breit: true } : { breit: false, offen: false });
    } else {
      if (g.zielOffen === g.offen) return;
      haptik('tick');
      await kachelGroesse(g.id, { offen: g.zielOffen });
    }
  };
  const start = (e) => {
    const griff = e.target.closest('.groessen-griff');
    if (griff && z.bearbeiten && !z.ebenen.length) { griffStart(griff); return; }
    const platz = e.target.closest('.kachel-platz');
    if (!platz || z.ebenen.length || e.target.closest('[data-a="kachel-auf"]') || e.target.closest('.kachel-steuer')) return;
    const p = punkt(e);
    zug = { platz, id: platz.dataset.kachel, startX: p.clientX, startY: p.clientY, aktiv: false, bewegt: false };
    zug.timer = setTimeout(() => aufheben(p), z.bearbeiten ? 140 : 420);
  };
  const aufheben = () => {
    if (!zug) return;
    zug.aktiv = true;
    haptik('gegriffen');
    const r = zug.platz.getBoundingClientRect();
    zug.dx = zug.startX - r.left; zug.dy = zug.startY - r.top;
    const klon = zug.platz.cloneNode(true);
    klon.classList.add('kachel-klon');
    klon.style.width = r.width + 'px'; klon.style.height = r.height + 'px';
    klon.style.left = r.left + 'px'; klon.style.top = r.top + 'px';
    document.body.appendChild(klon);
    zug.klon = klon;
    zug.platz.classList.add('kachel-luecke');
    document.body.classList.add('kachel-zieht');
    let ziel = document.getElementById('entfernen-ziel');
    if (!ziel) { ziel = document.createElement('div'); ziel.id = 'entfernen-ziel'; ziel.innerHTML = ICON.x + '<span>Entfernen</span>'; document.body.appendChild(ziel); }
    ziel.classList.add('sichtbar');
  };
  const bewegen = (e) => {
    if (gzug) { if (e.cancelable) e.preventDefault(); griffBewegen(punkt(e)); return; }
    if (!zug) return;
    const p = punkt(e);
    if (!zug.aktiv) {
      if (Math.abs(p.clientX - zug.startX) > 8 || Math.abs(p.clientY - zug.startY) > 8) { clearTimeout(zug.timer); zug = null; }
      return;
    }
    if (e.cancelable) e.preventDefault();
    zug.bewegt = true;
    zug.klon.style.left = (p.clientX - zug.dx) + 'px';
    zug.klon.style.top = (p.clientY - zug.dy) + 'px';
    const ziel = document.getElementById('entfernen-ziel');
    const ueberZiel = p.clientY < 90;
    if (ziel) { if (ueberZiel && !ziel.classList.contains('aktiv')) haptik('tick'); ziel.classList.toggle('aktiv', ueberZiel); }
    zug.klon.style.visibility = 'hidden';
    const unter = document.elementFromPoint(p.clientX, p.clientY);
    zug.klon.style.visibility = '';
    const anderer = unter && unter.closest('.kachel-platz');
    if (anderer && anderer !== zug.platz && anderer.parentNode === zug.platz.parentNode) {
      const geschwister = [...zug.platz.parentNode.querySelectorAll('.kachel-platz')];
      const iA = geschwister.indexOf(zug.platz), iB = geschwister.indexOf(anderer);
      zug.platz.parentNode.insertBefore(zug.platz, iA < iB ? anderer.nextSibling : anderer);
      haptik('tick');
    }
  };
  const ende = async (e) => {
    if (gzug) { await griffEnde(); return; }
    if (!zug) return;
    clearTimeout(zug.timer);
    const z2 = zug; zug = null;
    if (!z2.aktiv) {
      if (z.bearbeiten && !(e.target.closest && e.target.closest('.kachel-steuer'))) { z.gewaehlt = z.gewaehlt === z2.id ? null : z2.id; haptik('tick'); render(); }
      return;
    }
    klickSperre = true; setTimeout(() => { klickSperre = false; }, 400);
    const ziel = document.getElementById('entfernen-ziel');
    const entfernen = ziel && ziel.classList.contains('aktiv');
    if (ziel) ziel.classList.remove('sichtbar', 'aktiv');
    if (z2.klon) z2.klon.remove();
    z2.platz.classList.remove('kachel-luecke');
    document.body.classList.remove('kachel-zieht');
    if (entfernen) { await kachelEntfernen(z2.id); return; }
    if (!z2.bewegt) { haptik('gegriffen'); z.bearbeiten = true; z.gewaehlt = z2.id; render(); return; }
    haptik('tick');
    const reihe = [...document.querySelectorAll('#kacheln .kachel-platz')].map((x) => x.dataset.kachel);
    const alt = kachelListe();
    await aendern((d) => { d.einstellungen.kacheln = reihe.map((id) => alt.find((k) => k.id === id)).filter(Boolean); }, { text: 'Reihenfolge gespeichert', haptik: false });
  };
  document.addEventListener('touchstart', start, { passive: true });
  document.addEventListener('touchmove', bewegen, { passive: false });
  document.addEventListener('touchend', ende);
  document.addEventListener('touchcancel', ende);
  document.addEventListener('mousedown', (e) => { if (e.button === 0) start(e); });
  document.addEventListener('mousemove', bewegen);
  document.addEventListener('mouseup', ende);
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('.kachel-platz')) e.preventDefault(); });
  document.addEventListener('click', (e) => { if (klickSperre && e.target.closest('.kachel-platz')) { e.stopPropagation(); e.preventDefault(); } }, true);
}

function setzePfad(obj, pfad, wert) {
  const teile = pfad.split('.');
  let o = obj;
  for (let i = 0; i < teile.length - 1; i++) o = o[teile[i]];
  o[teile[teile.length - 1]] = wert;
}
function oben0() { const s = document.querySelector('.seite:last-of-type'); if (s) s.scrollTop = 0; }

async function wunschKaufen(w, betrag) {
  const buchungId = D.neueId('b');
  await aendern((d) => {
    let katId = w.kategorieId;
    if (!katId || !R.kategorie(d, katId)) {
      let k = d.kategorien.find((x) => x.id === 'sonstiges' && x.art === 'budget');
      if (!k) { k = { id: 'sonstiges', name: 'Sonstiges', emoji: '🧾', art: 'budget', budget: 0, symbol: 'sonstiges', schritte: [5, 20], frage: 'Wofür?', chips: [] }; d.kategorien.push(k); }
      katId = k.id;
    }
    d.buchungen.push({ id: buchungId, zeit: R.zeitText(new Date()), kategorieId: katId, betrag, ort: w.name, quelle: 'geplant' });
    const x = d.wuensche.find((y) => y.id === w.id); x.status = 'gekauft'; x.gekauftAm = heute(); x.bezahlt = betrag;
  }, { text: `${w.name} gekauft: ${R.euro(betrag)} gebucht`, rueckgaengig: (d) => { d.buchungen = d.buchungen.filter((b) => b.id !== buchungId); const x = d.wuensche.find((y) => y.id === w.id); x.status = 'geplant'; delete x.bezahlt; } });
}

function gehaltEbene(s) {
  const g = gehalt();
  const ist = (g.istWerte || []).find((w) => R.ymAus(w.datum) === s);
  return { art: 'gehalt', monat: s, istText: ist ? R.euro(ist.betrag, false) : '', schaetzungText: R.euro(R.schaetzung(g), false), tagText: String(g.ankunftTag || 1) };
}

// Einrichtung: Wenn etwas Neues dazukommt, fertige Karten (mit Betrag) einklappen, damit es übersichtlich bleibt
function efAndereEinklappen(liste, ausser) {
  liste.forEach((x) => { if (x !== ausser && (x.gewaehlt !== false) && zahl(String(x.betragText || '')) > 0 && !(x.geteilt && E.anteilAusEuro(zahl(x.betragText), x.meinText, zahl) === null)) x.zu = true; });
}

// ---------- Ereignisse ----------
function bindeEreignisse() {
  bindeKachelZiehen();
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-a]');
    if (!el) return;
    const f = AKTION[el.dataset.a];
    if (!f) return;
    if (el.dataset.a === 'schliessen-schleier' && ev.target !== el) return;
    ev.preventDefault();
    f(el, ev);
  });
  document.addEventListener('input', (ev) => {
    if (ev.target.id === 'vf-text') { z.vf.text = ev.target.value; const l = document.getElementById('vf-liste'); if (l) l.innerHTML = verlaufListe(); return; }
    const el = ev.target.closest('[data-feld]');
    const eb = oben();
    if (!el || !eb) return;
    const wert = el.type === 'date' ? (el.value || null) : el.dataset.zahl ? Number(el.value) : el.value;
    if (el.dataset.feld.includes('.')) setzePfad(eb, el.dataset.feld, wert);
    else (eb.entwurf || eb)[el.dataset.feld] = wert;
    if (el.dataset.neuZeichnen) aktualisiereZusammenfassung();
    const oh = document.getElementById('of-hinweis');
    if (oh && el.dataset.offen !== undefined) oh.textContent = offenHinweis(eb.entwurf || eb, el.dataset.offen === '1');
    if (eb.art === 'gehaltsrechner') { if (el.dataset.ganz) renderEbenen(); else grAktualisieren(); }
    const szh = document.getElementById('sz-hinweis');
    if (szh && eb.art === 'sparkonto') szh.textContent = sparzielSatz(sparzielEntwurf(eb.entwurf));
    const th = document.getElementById('tl-hinweis');
    if (th && (el.dataset.teilen || el.dataset.feld === 'betragText')) th.textContent = teilHinweis(eb.entwurf || eb);
    if (eb.art === 'einfuehrung') {
      const m = el.dataset.feld.match(/^listen\.(\w+)\.(\d+)\./);
      const ah = m && document.getElementById(`ef-ah-${m[1]}-${m[2]}`);
      if (ah) ah.textContent = E.anteilHinweis(eb.listen[m[1]][Number(m[2])], zahl);
    }
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-a-wechsel]');
    if (el && AKTION[el.dataset.aWechsel]) AKTION[el.dataset.aWechsel](el);
  });
  document.getElementById('dienste-datei').addEventListener('change', async (ev) => {
    const datei = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!datei) return;
    const r = DI.diensteAusDatei(await datei.text());
    if (!r.ok) { zeigeToast(r.fehler, null, 'fehler'); haptik('fehler'); return; }
    const alt = schichtarten();
    // Schichtarten nur aus den letzten 6 Monaten ableiten – alte Uhrzeiten sollen nicht versehentlich wieder auftauchen
    const ab = R.ymPlus(heuteYm(), -6);
    const arten = DI.schichtartenAus(r.dienste.filter((x) => x.d.slice(0, 7) >= ab), alt);
    oeffne({ art: 'dienste-import', dienste: r.dienste, monate: r.monate, arten, neueArten: arten.filter((a) => !alt.some((x) => x.k === a.k)).map((a) => a.k) });
  });
  document.getElementById('mue-datei').addEventListener('change', async (ev) => {
    const datei = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!datei) return;
    let zeilen;
    try { zeigeToast('Lese die Monatsübersicht …', null, 'info'); zeilen = (await pdfZeilen(datei)).flat(); }
    catch (e) { zeigeToast('Die PDF-Datei lässt sich nicht lesen. Trag die Stunden bitte von Hand ein („Stunden laut Arbeitgeber“).', null, 'fehler'); haptik('fehler'); return; }
    if (zeilen.some((x) => /Abrechnung der Brutto\/Netto-Bezüge/i.test(x))) { zeigeToast('Das ist eine Brutto-Netto-Abrechnung. Nimm dafür den Knopf „Abrechnung einlesen“.', null, 'fehler'); haptik('fehler'); return; }
    const r = DI.monatsuebersichtLesen(zeilen);
    if (!r.ok) { zeigeToast(r.fehler, null, 'fehler'); haptik('fehler'); return; }
    const a = DI.diensteAusUebersicht(r.dienste, schichtarten());
    z.toast = null;
    // Schichtarten: glatte Zeiten übernehmen; Dienstpauschale je Kürzel so, wie sie in der Übersicht gebucht ist
    const arten = DI.schichtartenAus(a.fertig.filter((x) => x.frei || (/:(00|15|30|45)$/.test(x.von) && /:(00|15|30|45)$/.test(x.bis))), schichtarten())
      .map((x) => (x.frei || !(x.k in a.pauschale) ? x : Object.assign({}, x, { pauschale: a.pauschale[x.k] })));
    // v29 Abgleich: Kalender ↔ Übersicht (Tage) und, nach Monatsende, Stunden des Arbeitgebers ↔ aus den Diensten gerechnet
    const tage = DI.diensteVergleich(z.daten.dienste, a.fertig.concat(a.ohne), r.monat);
    const gerechnet = r.fertig && r.lohnarten.length ? DI.stundenAusDiensten(a.fertig, r.monat, DI.land(z.daten), arten) : null;
    oeffne({ art: 'mue-import', ergebnis: r, fertig: a.fertig, ohne: a.ohne, arten, tage, gerechnet });
  });
  document.getElementById('abr-datei').addEventListener('change', async (ev) => {
    const datei = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!datei) return;
    let blaetter;
    try { zeigeToast('Lese die Abrechnung …', null, 'info'); blaetter = await pdfZeilen(datei); }
    catch (e) { zeigeToast('Die PDF-Datei lässt sich nicht lesen.', null, 'fehler'); haptik('fehler'); return; }
    const r = AB.abrechnungLesen(blaetter);
    if (!r.ok) { zeigeToast(r.fehler, null, 'fehler'); haptik('fehler'); return; }
    z.toast = null;
    oeffne({ art: 'abrechnung', ergebnis: r });
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.id === 'vf-text') { ev.target.blur(); return; }
    if (ev.key === 'Escape' && z.ebenen.length && oben().art !== 'start') schliessen();
  });
  document.getElementById('import-datei').addEventListener('change', async (ev) => {
    const datei = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!datei) return;
    const text = await datei.text();
    const r = D.pruefeImport(text);
    if (!r.ok) { zeigeToast(r.fehler, null, 'fehler'); haptik('fehler'); return; }
    oeffne({ art: 'import-frage', daten: r.daten });
  });
  AKTION['import-ja'] = async () => {
    const neu = oben().daten; const vorher = kopie(z.daten);
    z.ebenen = [];
    z.daten = neu;
    z.daten.einstellungen.gesehenVersion = APP_VERSION;
    await aendern(() => {}, { text: 'Sicherung importiert', rueckgaengig: (d) => { Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, vorher); } });
  };
  // Zurück-Taste von Android (aus MainActivity aufgerufen): schließt zuerst die oberste Ebene
  window.__zurueck = () => {
    if (z.ebenen.length && oben().art === 'einfuehrung' && oben().schritt > 0) { AKTION['ef-zurueck'](); return true; }
    if (z.ebenen.length && oben().art !== 'start') { schliessen(); return true; }
    if (z.bearbeiten && z.gewaehlt) { z.gewaehlt = null; render(); return true; }
    if (z.bearbeiten) { z.bearbeiten = false; render(); return true; }
    if (z.ansicht !== 'monat' || z.monat !== heuteYm()) { z.ansicht = 'monat'; z.monat = heuteYm(); render(); return true; }
    return false;
  };
}

function aktualisiereZusammenfassung() {
  // nur den Text neu setzen, damit das Eingabefeld den Fokus behält
  const eb = oben();
  if (!eb || eb.art !== 'fixkosten') return;
  const tmp = document.createElement('div');
  tmp.innerHTML = EBENEN.fixkosten(eb);
  const neu = tmp.querySelector('[data-zusammenfassung]');
  const alt = document.querySelector('[data-zusammenfassung]');
  if (neu && alt) alt.textContent = neu.textContent;
  // geteilte Kosten: Felder ein-/ausblenden, wenn der Anteil unter 100 % fällt (Eingaben bleiben im Entwurf)
  const gn = tmp.querySelector('[data-geteilt]'), ga = document.querySelector('[data-geteilt]');
  if (gn && ga && gn.innerHTML !== ga.innerHTML && !ga.contains(document.activeElement)) ga.innerHTML = gn.innerHTML;
  const an = tmp.querySelector('[data-giltab]'), aa = document.querySelector('[data-giltab]');
  if (an && aa && an.innerHTML !== aa.innerHTML) aa.innerHTML = an.innerHTML;
}
