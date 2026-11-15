// Oberfläche der Finanz-App: Monat, Jahr, Verlauf und die Bearbeiten-Seiten.
// Plus/Minus gibt es bewusst nur im Widget auf dem Homescreen.
import * as R from './rechnen.js';
import * as D from './daten.js';
import * as E from './einfuehrung.js';

export const APP_VERSION = 'finanz-v2';
const NEU_IN_VERSION = [
  'Monat, Jahr und Verlauf wie im Mockup',
  'Fixkosten, Budgets, Gehalt und Sparkonto bearbeiten',
  'Widgets auf dem Homescreen: pro Kategorie eins, dazu „Fixkosten“',
  'Sicherung als Datei exportieren und wieder importieren'
];

const z = { daten: null, ansicht: 'monat', monat: null, ebenen: [], toast: null, mehrOffen: false };
const $app = () => document.getElementById('app');
const $ebene = () => document.getElementById('ebene');

// ---------- Hilfen ----------
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
const gehalt = () => z.daten.einnahmen.find((e) => e.wieOft === 'monatlich');

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
  else zeigeNeuigkeiten();
  render();
  D.beiRueckkehr(async () => {
    const neu = await D.laden();
    if (neu) { z.daten = neu; if (z.monat < z.daten.einstellungen.startMonat) z.monat = heuteYm(); render(); }
  });
  window.__finanz = z; // für Tests
}

function zeigeNeuigkeiten() {
  const gesehen = z.daten.einstellungen.gesehenVersion;
  if (gesehen && gesehen !== APP_VERSION) z.ebenen.push({ art: 'neu' });
  if (gesehen !== APP_VERSION) { z.daten.einstellungen.gesehenVersion = APP_VERSION; D.speichern(z.daten); }
}

async function aendern(fn, toast) {
  fn(z.daten);
  await D.speichern(z.daten);
  if (toast) zeigeToast(toast.text, toast.rueckgaengig);
  render();
}

// ---------- Darstellung ----------
function render() {
  const a = $app();
  if (!a) return;
  a.innerHTML = kopf() + (z.ansicht === 'monat' ? monatAnsicht() : z.ansicht === 'jahr' ? jahrAnsicht() : verlaufAnsicht());
  renderEbenen();
}

function kopf() {
  const titel = z.ansicht === 'monat' ? monatsName(z.monat) : z.ansicht === 'jahr' ? '12 Monate' : 'Verlauf';
  const k = (id, t) => `<button data-a="ansicht" data-wert="${id}" aria-pressed="${z.ansicht === id}">${t}</button>`;
  return `<header class="kopf"><h1>${esc(titel)}</h1><nav class="umschalter" aria-label="Ansicht">${k('monat', 'Monat')}${k('jahr', 'Jahr')}${k('verlauf', 'Verlauf')}</nav></header>`;
}

function monatAnsicht() {
  const s = z.monat;
  const r = R.monatsRechnung(z.daten, s);
  const g = gehalt();
  const gehaltWert = r.einnahmen[0];
  const istHeute = s === heuteYm();
  const nav = `<div class="monatswahl">
    <button class="knopf rund" data-a="monat" data-wert="-1" aria-label="Vorheriger Monat">${ICON.links}</button>
    <span class="jahr">${istHeute ? R.ymTeile(s).jahr : `${R.ymTeile(s).jahr} · <button class="knopf klein akzent" data-a="heute">zurück zu ${esc(monatsName(heuteYm()))}</button>`}</span>
    <button class="knopf rund" data-a="monat" data-wert="1" aria-label="Nächster Monat">${ICON.rechts}</button>
  </div>`;

  // Balken: jede Kategorie ein Stück, dann Zurücklegen, Sparkonto, Rest = Frei
  const basis = Math.max(r.einkommen, r.ausgaben + r.zuruecklegen + r.sparen, 1);
  const pct = (x) => (Math.max(0, x) / basis * 100).toFixed(2);
  const stuecke = r.gruppen.filter((gr) => gr.summe > 0).map((gr) => `<span style="width:${pct(gr.summe)}%;background:${gr.farbe}" title="${esc(gr.name)}"></span>`).join('')
    + (r.zuruecklegen > 0 ? `<span class="streifen" style="width:${pct(r.zuruecklegen)}%"></span>` : '')
    + (r.sparen > 0 ? `<span style="width:${pct(r.sparen)}%;background:var(--spar)"></span>` : '')
    + (r.frei > 0 ? '<span class="rest"></span>' : '');
  const ungefaehr = r.geschaetzt ? '≈ ' : '';
  const freiText = (r.frei < 0 ? '− ' : ungefaehr) + R.euroRund(Math.abs(r.frei));
  const aria = `Gehalt ${R.euroRund(r.einkommen)}: ${R.euroRund(r.ausgaben)} Ausgaben, ${R.euroRund(r.zuruecklegen)} zurücklegen, ${R.euroRund(r.sparen)} aufs Sparkonto, ${freiText} frei`;
  const gehaltTag = g ? R.ankunftsTag(g, s) + '.' + R.ymTeile(s).monat + '.' : '';

  const freiKarte = `<section class="karte ring">
    <div class="frei-oben">
      <div class="links"><div class="label">Frei im ${esc(monatsName(s))}</div><div class="grosszahl ${r.frei < 0 ? 'minus' : ''}">${freiText}</div></div>
      <div class="rechts"><div class="klein">${g ? esc(g.name) + ' am ' + gehaltTag : 'Gehalt'}</div>
        <button class="knopf klein" data-a="gehalt" aria-label="Gehalt im ${esc(monatsName(s))} ändern">${gehaltWert && gehaltWert.geschaetzt ? '≈ ' : ''}${R.euroRund(gehaltWert ? gehaltWert.betrag : 0)} ${ICON.stift}</button></div>
    </div>
    <div class="balken" role="img" aria-label="${esc(aria)}">${stuecke}</div>
    <div class="legende">
      <span><i class="punkt ausgaben"></i>Ausgaben · ${R.euroRund(r.ausgaben)}</span>
      <span><i class="punkt streifen"></i>Zurücklegen · ${R.euroRund(r.zuruecklegen)}</span>
      <span><i class="punkt" style="background:var(--spar)"></i>Sparkonto · ${R.euroRund(r.sparen)}</span>
      <span><i class="punkt leer"></i>Frei · ${freiText}</span>
    </div>
    ${g && !g.betrag && !gehaltWert.betrag ? '<button class="knopf haupt" data-a="gehalt">Gehalt eintragen</button>' : ''}
  </section>`;

  const sparKarten = z.daten.sparraten.length ? z.daten.sparraten.map((sp) => {
    const stichtag = s === heuteYm() ? heute() : (s < heuteYm() ? s + '-' + R.tageImMonat(s) : s + '-' + R.tageImMonat(s));
    return `<button class="karte spar" data-a="sparkonto" data-id="${esc(sp.id)}">
      <span class="symbol">${ICON.pfeil}</span>
      <span class="mitte"><span style="font-size:15px;font-weight:600">Aufs ${esc(sp.name)} · ${R.euro(sp.betrag)}</span><span class="klein">am ${sp.tag || 1}. · keine Ausgabe, das Geld bleibt deins</span></span>
      <span class="stand"><span class="klein" style="font-size:12px">Stand</span><span style="font-size:17px;font-weight:500">${R.euroRund(R.sparStand(sp, stichtag))}</span></span>
    </button>`;
  }).join('') : `<button class="karte spar" data-a="sparkonto"><span class="symbol">${ICON.pfeil}</span><span class="mitte"><span style="font-size:15px;font-weight:600">Sparkonto anlegen</span><span class="klein">Sparen ist keine Ausgabe, das Geld bleibt deins</span></span></button>`;

  const liste = ausgabenHtml(r, s);

  const sicherung = `<section class="karte">
    <div class="label">Einstellungen und Sicherung</div>
    <button class="knopf" data-a="einfuehrung-erneut">Einführung erneut durchgehen</button>
    <p class="hinweistext">Alle Daten liegen nur auf diesem Handy. Exportiere ab und zu eine Sicherung, z. B. vor dem Löschen der App.${z.daten.einstellungen.letzteSicherung ? ' Zuletzt: ' + esc(z.daten.einstellungen.letzteSicherung) + '.' : ''}</p>
    <div class="zwei"><button class="knopf" data-a="export">Exportieren</button><button class="knopf" data-a="import">Importieren</button></div>
    ${z.daten.beispiel ? '<button class="knopf leise" data-a="beispiel-weg">Beispieldaten entfernen</button>' : ''}
    <div class="klein" style="font-size:12px">${APP_VERSION}</div>
  </section>`;

  return nav + freiKarte + sparKarten + liste + sicherung;
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
    ? `<button class="posten" data-a="fixkosten" data-id="${esc(p.fixkosten.id)}" aria-label="${esc(p.fixkosten.name)} bearbeiten"><span class="t"><span class="n">${esc(p.fixkosten.name)}</span><small>${esc(p.wann)}</small></span><span class="b">${R.euro(p.betrag)}</span>${PFEIL}</button>`
    : `<button class="posten grau" data-a="fixkosten" data-id="${esc(p.fixkosten.id)}" aria-label="${esc(p.fixkosten.name)} bearbeiten"><span class="t"><span class="n">${esc(p.fixkosten.name)}</span><small>${R.euro(p.betrag)} im ${naechsteFaelligkeit(p.fixkosten)} · ${esc(R.RHYTHMUS_TEXT[p.fixkosten.wieOft] || '')}</small></span><span class="b">≈ ${R.euro(Math.round(p.anteil))}</span>${PFEIL}</button>`;
  const budgetZeile = (p) => {
    const pct = p.budget > 0 ? Math.min(100, p.ausgegeben / p.budget * 100) : 0;
    const ueber = p.budget > 0 && p.ausgegeben > p.budget;
    const unter = p.budget > 0 ? (ueber ? `${R.euro(p.ausgegeben - p.budget)} über dem Budget` : `${R.euro(p.ausgegeben)} ausgegeben · noch ${R.euro(p.budget - p.ausgegeben)}`) : `${R.euro(p.ausgegeben)} ausgegeben · ohne Budget`;
    return `<button class="posten budget" data-a="budget" data-id="${esc(p.kategorie.id)}" aria-label="${esc(p.kategorie.name)} bearbeiten"><span class="t"><span class="n">${esc(mitEmoji(p.kategorie) + p.kategorie.name)}</span><small class="${ueber ? 'warn' : ''}">${unter}</small>${p.budget > 0 ? `<span class="mini"><span style="width:${pct.toFixed(1)}%${ueber ? ';background:var(--fehler)' : ''}"></span></span>` : ''}</span><span class="b">${R.euro(p.betrag)}</span>${PFEIL}</button>`;
  };

  // Ansicht „pro Monat gerechnet“: jede Fixkoste mit ihrem Monatsanteil, Jahresbetrag darunter
  const proMonatZeile = (p) => {
    const f = p.fixkosten;
    const jahr = p.anteil * 12;
    const monate = R.abbuchungsMonate(f).map((m) => R.MONATE_KURZ[m - 1]).join(', ');
    const info = f.wieOft === 'monatlich' ? esc(p.wann)
      : f.wieOft === 'jaehrlich' ? `${R.euro(p.betrag)} einmal im Jahr · im ${monate}`
      : `${R.euro(p.betrag)} ${esc(R.RHYTHMUS_TEXT[f.wieOft])} (${monate}) · ${R.euro(Math.round(jahr))} im Jahr`;
    return `<button class="posten" data-a="fixkosten" data-id="${esc(f.id)}" aria-label="${esc(f.name)} bearbeiten"><span class="t"><span class="n">${esc(f.name)}</span><small>${info}</small></span><span class="b">${f.wieOft === 'monatlich' ? '' : '≈ '}${R.euro(Math.round(p.anteil * 100) / 100)}</span>${PFEIL}</button>`;
  };

  const karten = r.gruppen.map((gr) => {
    if (proMonat && gr.art !== 'budget') {
      const k = gr.kategorie;
      const monat = gr.posten.reduce((a, p) => a + p.anteil, 0);
      const zeichen = k && k.emoji ? `<span class="kat-zeichen" aria-hidden="true">${esc(k.emoji)}</span>` : '<i class="kat-farbe" aria-hidden="true"></i>';
      return `<section class="kat-karte" style="--kat:${gr.farbe}">
        <button class="kat-kopf" data-a="kategorie" data-id="${esc(k.id)}" aria-label="Kategorie ${esc(gr.name)} bearbeiten">${zeichen}<span class="kat-titel"><b>${esc(gr.name)} ${STIFT_KLEIN}</b><small>${R.euroRund(monat * 12)} im Jahr</small></span><span class="kat-summe">≈ ${R.euroRund(monat)}</span></button>
        ${gr.posten.map(proMonatZeile).join('')}${!gr.posten.length ? '<div class="leer-zeile">Noch nichts eingetragen</div>' : ''}</section>`;
    }
    const faellig = gr.posten.filter((p) => p.faellig);
    const spaeter = gr.posten.filter((p) => !p.faellig);
    const zeilen = gr.art === 'budget' ? gr.posten.map(budgetZeile).join('') : faellig.map(fixZeile).join('');
    const spaeterHtml = spaeter.length ? `<div class="unterkopf">Nicht im ${kurz} · ≈ ${R.euroRund(gr.anteilSumme)} pro Monat zurücklegen</div>${spaeter.map(fixZeile).join('')}` : '';
    const leer = !gr.posten.length ? '<div class="leer-zeile">Noch nichts eingetragen</div>' : '';
    const unter = gr.art === 'budget' ? 'Einkäufe aus den Widgets' : (faellig.length ? `${faellig.length} Abbuchung${faellig.length > 1 ? 'en' : ''} im ${kurz}` : `keine Abbuchung im ${kurz}`);
    const k = gr.kategorie;
    const zeichen = k && k.emoji ? `<span class="kat-zeichen" aria-hidden="true">${esc(k.emoji)}</span>` : '<i class="kat-farbe" aria-hidden="true"></i>';
    const kopfAktion = gr.art === 'budget' ? 'data-a="budgets-farbe"' : `data-a="kategorie" data-id="${esc(k.id)}"`;
    return `<section class="kat-karte" style="--kat:${gr.farbe}">
      <button class="kat-kopf" ${kopfAktion} aria-label="Kategorie ${esc(gr.name)} bearbeiten">${zeichen}<span class="kat-titel"><b>${esc(gr.name)} ${STIFT_KLEIN}</b><small>${unter}</small></span><span class="kat-summe">${R.euro(gr.summe)}</span></button>
      ${zeilen}${spaeterHtml}${leer}</section>`;
  }).join('');

  const wahl = `<div class="ansicht-wahl" role="group" aria-label="Darstellung der Fixkosten">
    <button data-a="ansicht-pro-monat" data-wert="0" aria-pressed="${!proMonat}">Im ${kurz} abgebucht</button>
    <button data-a="ansicht-pro-monat" data-wert="1" aria-pressed="${proMonat}">Pro Monat gerechnet</button></div>`;
  const fixMonat = r.gruppen.filter((g) => g.art !== 'budget').reduce((a, g) => a + g.posten.reduce((b, p) => b + p.anteil, 0), 0);
  const summe = proMonat ? `<div class="pro-monat-summe">Fixkosten zusammen <b>≈ ${R.euroRund(fixMonat)}</b> pro Monat · ${R.euroRund(fixMonat * 12)} im Jahr</div>` : '';
  const titel = `<div class="abschnitt-kopf"><span class="label">Ausgaben${proMonat ? '' : ' im ' + esc(monatsName(s))}</span><span class="klein">Antippen zum Bearbeiten</span></div>`;
  return `<div class="ausgaben">${titel}${wahl}${summe}${karten}${neu}</div>`;
}

function jahrAnsicht() {
  const ab = R.ymPlus(heuteYm(), 1);
  const monate = R.jahresUeberblick(z.daten, ab);
  const max = Math.max(1, ...monate.map((m) => m.summe));
  const zeilen = monate.map((m) => {
    const teile = m.teile.filter((t) => t.summe > 0).map((t) => `<span style="width:${(t.summe / max * 100).toFixed(1)}%;background:${t.kategorie.farbe}"></span>`).join('');
    const extra = m.zusaetzlich.length ? `<span class="extra">+ ${m.zusaetzlich.map((x) => esc(x.text)).join(' · ')}</span>` : '';
    const jahr = R.ymTeile(m.monat).monat === 1 ? ` ${R.ymTeile(m.monat).jahr}` : '';
    return `<button class="jahr-zeile ${m.zusaetzlich.length ? 'gross' : ''}" data-a="zu-monat" data-wert="${m.monat}" aria-label="${esc(R.MONATE_LANG[R.ymTeile(m.monat).monat - 1] + jahr)}: ${R.euroRund(m.summe)}${m.zusaetzlich.length ? ', zusätzlich ' + esc(m.zusaetzlich.map((x) => x.text).join(', ')) : ''}">
      <span class="mon">${m.name}</span><span class="mitte"><span class="jahr-balken">${teile}</span>${extra}</span><span class="summe">${R.euroRund(m.summe)}</span></button>`;
  }).join('');
  const legende = fixKats().map((k) => `<span><i class="punkt" style="background:${k.farbe}"></i>${esc(k.name)}</span>`).join('');
  const leer = !z.daten.fixkosten.length ? '<div class="leerzustand">Noch keine Fixkosten. Trage sie in der Monatsansicht ein.</div>' : '';
  return `<p class="hinweistext">Fixkosten pro Monat, so wie sie wirklich abgebucht werden. Darunter steht, was zusätzlich fällig ist.</p>
    <section class="karte" style="padding:12px 14px;gap:6px">${leer || zeilen}</section><div class="legende-zeile">${legende}</div>`;
}

function verlaufAnsicht() {
  const eintraege = R.verlaufMitStand(z.daten);
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
  const grenze = z.verlaufAlle ? Infinity : 60;
  for (const [t, liste] of tages(tage)) {
    if (anzahl >= grenze) break;
    anzahl += liste.length;
    teile += `<div class="tag-titel">${esc(tagName(t))}</div><section class="karte verlauf">${liste.map((e) => {
      const kat = R.kategorie(z.daten, e.kategorieId);
      const knopf = t === h
        ? `<button class="knopf klein akzent" data-a="buchung-weg" data-id="${esc(e.id)}">Rückgängig</button>`
        : `<button class="knopf klein leise" data-a="buchung" data-id="${esc(e.id)}">Ändern</button>`;
      return `<div class="eintrag"><div class="t"><b>${esc(kat ? kat.name : 'Unbekannt')} · ${R.euro(e.betrag)}</b><span>${esc(e.zeit.slice(11, 16))} · ${esc(e.ort || 'ohne Ort')} · ${R.euro(e.vorher, false)} → ${R.euro(e.nachher)}</span></div>${knopf}</div>`;
    }).join('')}</section>`;
  }
  if (!eintraege.length) teile = `<section class="karte"><div class="leerzustand">Noch keine Buchungen.<br>Gebucht wird über die Widgets auf dem Homescreen: lange auf eine freie Stelle drücken → Widgets → Finanzen.</div></section>`;
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
      if (datum <= h) keine.push({ farbe: 'var(--spar)', titel: `Aufs ${sp.name} · ${R.euro(sp.betrag)}`, text: `${tag}. ${R.MONATE_KURZ[R.ymTeile(s).monat - 1]} · Stand danach ${R.euroRund(R.sparStand(sp, datum))}` });
    }
    if (g) {
      const w = R.einnahmeIm(g, s);
      keine.push({ farbe: 'var(--akzent)', titel: `${g.name} ${monatsName(s)} · ${w.geschaetzt ? '≈ ' : ''}${R.euroRund(w.betrag)}`, text: w.geschaetzt ? 'automatisch eingetragen (geschätzt) · antippen zum Korrigieren' : (w.betrag !== w.schaetzung ? `erwartet ≈ ${R.euroRund(w.schaetzung)}, von dir korrigiert` : 'von dir bestätigt'), monat: s });
    }
  }
  const keineHtml = keine.length ? `<div class="tag-titel">Keine Ausgaben</div><section class="karte verlauf">${keine.map((k) => {
    const inhalt = `<i class="punkt" style="background:${k.farbe}"></i><span class="t"><b>${esc(k.titel)}</b><span>${esc(k.text)}</span></span>`;
    return k.monat ? `<button class="eintrag zeile" style="padding-left:0" data-a="gehalt" data-monat="${k.monat}">${inhalt}</button>` : `<div class="eintrag">${inhalt}</div>`;
  }).join('')}</section>` : '';

  return `<p class="hinweistext">Jede Buchung zeigt den Stand vorher und nachher. Vertippt? Hier rückgängig machen oder den Betrag ändern.</p>${teile}${keineHtml}`;
}
function tages(m) { return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)); }

// ---------- Ebenen (Seiten und Sheets) ----------
function renderEbenen() {
  const e = $ebene();
  document.body.style.overflow = z.ebenen.length ? 'hidden' : '';
  e.innerHTML = z.ebenen.map((eb, i) => ebeneHtml(eb, i)).join('') + toastHtml();
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
const wahlKnopf = (aktion, wert, text, an, extra = '') => `<button data-a="${aktion}" data-wert="${esc(wert)}" aria-pressed="${!!an}" ${extra}>${esc(text)}</button>`;

const EBENEN = {
  start: () => sheet(`<h2>Willkommen</h2>
    <p class="hinweistext">Die App läuft komplett ohne Internet. Deine Daten bleiben auf diesem Handy.</p>
    <button class="knopf haupt" data-a="start-einrichten">Gemeinsam einrichten (ca. 5 Min.)</button>
    <button class="knopf" data-a="start-beispiel">Mit Beispiel ausprobieren</button>
    <button class="knopf leise" data-a="start-leer">Leer anfangen</button>
    <button class="knopf leise" data-a="import">Sicherung importieren</button>`, 'Willkommen'),

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
      const eigen = R.eigenerBetrag(Object.assign({}, f, { betrag }));
      zus = monatlich ? `Wird jeden Monat am ${f.tag}. abgebucht: ${R.euro(eigen)}.`
        : `Wird am ${f.tag}. abgebucht: ${aktiv.map((m) => f.wieOft === 'jaehrlich' ? R.MONATE_LANG[m - 1] : R.MONATE_KURZ[m - 1]).join(', ')}. In den anderen Monaten ≈ ${R.euro(Math.round(R.monatsAnteil(Object.assign({}, f, { betrag })) * 100) / 100)} anteilig zurücklegen. In Monat und Jahr erscheint es genau dort.`;
    } else zus = 'Trage einen Betrag ein.';
    const mehr = eb.mehr ? `<section class="karte">
        <button class="schalter" role="switch" aria-checked="${!!f.abo}" data-a="fk-abo"><span class="t">Ist ein Abo<br><span class="klein">Abos stehen gesammelt und lassen sich kündigen</span></span><span class="spur"></span></button>
        <div class="feld"><label for="fk-anteil">Wie viel davon zahlst du? (%)</label><input id="fk-anteil" class="eingabe" inputmode="numeric" data-feld="meinAnteil" value="${esc(f.meinAnteil == null ? 100 : f.meinAnteil)}"></div>
        <div class="feld"><label for="fk-ende">Endet am (optional)</label><input id="fk-ende" class="eingabe" type="date" data-feld="endetAm" value="${esc(f.endetAm || '')}"></div>
      </section>` : '';
    return seite(eb.id ? 'Fixkosten bearbeiten' : 'Neue Fixkosten', `
      <section class="karte">
        <div class="feld"><label for="fk-name">Name</label><input id="fk-name" class="eingabe" data-feld="name" value="${esc(f.name)}" placeholder="z. B. Kfz-Versicherung" autocomplete="off"></div>
        <div class="zwei">
          <div class="feld"><label for="fk-betrag">Betrag</label><input id="fk-betrag" class="eingabe" inputmode="decimal" data-feld="betragText" data-neu-zeichnen="1" value="${esc(f.betragText)}" placeholder="0 €"></div>
          <div class="feld"><span class="label">Kategorie</span><button class="eingabe" style="display:flex;align-items:center;gap:8px;text-align:left" data-a="fk-kategorie"><i class="punkt" style="background:${kat ? kat.farbe : '#888'}"></i>${esc(kat ? kat.name : 'wählen')}</button></div>
        </div>
      </section>
      <section class="karte">
        <div class="label">Wie oft wird abgebucht?</div>
        <div class="wahl zwei-sp">${rhythmen}</div>
        <div class="label">An welchem Tag?</div>
        <div class="stepper"><button class="knopf rund" data-a="fk-tag" data-wert="-1" aria-label="Tag früher">−</button><button class="wert" data-a="tag-wahl" aria-label="Tag wählen">am ${f.tag}.</button><button class="knopf rund" data-a="fk-tag" data-wert="1" aria-label="Tag später">+</button></div>
        ${monatlich ? '' : `<div class="label">${f.wieOft === 'jaehrlich' ? 'In welchem Monat?' : 'Ab welchem Monat? (die anderen folgen)'}</div><div class="wahl sechs">${monate}</div>`}
      </section>
      <section class="zusammenfassung" aria-live="polite" data-zusammenfassung>${esc(zus)}</section>
      <button class="mehr-knopf" data-a="mehr" aria-expanded="${!!eb.mehr}">${eb.mehr ? ICON.hoch + ' Weniger' : ICON.runter + ' Mehr: Abo, Anteil, Ende'}</button>
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
        ${eb.id ? `<div class="klein">Im ${esc(monatsName(heuteYm()))} schon ausgegeben: ${R.euro(ausgegeben)}</div>` : ''}
      </section>
      <section class="karte">
        <div class="label">Knöpfe im Widget (bis zu 3)</div>
        <div class="wahl sechs" style="grid-template-columns:repeat(3,minmax(0,1fr))">${schritte}</div>
        <p class="hinweistext">Plus und Minus gibt es nur im Widget auf dem Homescreen.</p>
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
      <div class="feld"><label for="ge-ist">Was kam an?</label><input id="ge-ist" class="eingabe" inputmode="decimal" data-feld="istText" value="${esc(eb.istText)}" placeholder="${esc(R.euro(w.schaetzung, false))} (geschätzt)"></div>
      <p class="hinweistext">Leer lassen = die Schätzung gilt (≈). Netto, so wie es auf dem Konto ankommt.</p>
      <div class="feld"><label for="ge-schaetzung">Schätzung pro Monat</label><input id="ge-schaetzung" class="eingabe" inputmode="decimal" data-feld="schaetzungText" value="${esc(eb.schaetzungText)}"></div>
      <div class="feld"><span class="label">Kommt an</span><div class="wahl zwei-sp">${wahlKnopf('ge-ankunft', 'Monatsende', 'am Monatsende', g.kommtAn !== 'Tag')}${wahlKnopf('ge-ankunft', 'Tag', 'an einem Tag', g.kommtAn === 'Tag')}</div></div>
      ${g.kommtAn === 'Tag' ? `<div class="feld"><label for="ge-tag">Am Tag</label><input id="ge-tag" class="eingabe" inputmode="numeric" data-feld="tagText" value="${esc(eb.tagText)}"></div>` : ''}
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      <div class="knopfreihe"><button class="knopf leise" data-a="schliessen">Abbrechen</button><button class="knopf haupt breit" data-a="ge-speichern">Speichern</button></div>`, 'Gehalt');
  },

  sparkonto: (eb) => {
    const sp = eb.entwurf;
    return sheet(`<h2>${eb.id ? esc(sp.name) : 'Sparkonto anlegen'}</h2>
      <p class="hinweistext">Sparen ist keine Ausgabe: Das Geld geht aufs Sparkonto und bleibt deins. Es wird nur von „Frei“ abgezogen.</p>
      <div class="feld"><label for="sp-name">Name</label><input id="sp-name" class="eingabe" data-feld="name" value="${esc(sp.name)}"></div>
      <div class="zwei">
        <div class="feld"><label for="sp-betrag">Rate pro Monat</label><input id="sp-betrag" class="eingabe" inputmode="decimal" data-feld="betragText" value="${esc(sp.betragText)}"></div>
        <div class="feld"><label for="sp-tag">Am Tag</label><input id="sp-tag" class="eingabe" inputmode="numeric" data-feld="tagText" value="${esc(sp.tagText)}"></div>
      </div>
      <div class="feld"><label for="sp-stand">Stand heute</label><input id="sp-stand" class="eingabe" inputmode="decimal" data-feld="standText" value="${esc(sp.standText)}"></div>
      <p class="hinweistext">Der Stand wächst jeden Monat um die Rate. Stimmt er nicht mehr, hier den echten Stand eintragen.</p>
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      <div class="knopfreihe">${eb.id ? '<button class="knopf leise" data-a="sp-loeschen">Löschen</button>' : '<button class="knopf leise" data-a="schliessen">Abbrechen</button>'}<button class="knopf haupt breit" data-a="sp-speichern">Speichern</button></div>`, 'Sparkonto');
  },

  buchung: (eb) => {
    const b = z.daten.buchungen.find((x) => x.id === eb.id);
    if (!b) return '';
    const kat = R.kategorie(z.daten, b.kategorieId);
    const chips = (kat && kat.chips ? kat.chips : []).map((c) => wahlKnopf('bh-ort', c, c, eb.ort === c, 'class="chip"')).join('');
    const d = new Date(b.zeit);
    return sheet(`<h2>${esc(kat ? kat.name : '')} · ${esc(d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }))}, ${esc(b.zeit.slice(11, 16))}</h2>
      <div class="feld"><label for="bh-betrag">Betrag</label><input id="bh-betrag" class="eingabe" inputmode="decimal" data-feld="betragText" value="${esc(eb.betragText)}"></div>
      ${chips ? `<div class="label">${esc(kat.frage || 'Wo?')}</div><div class="chips">${chips}${wahlKnopf('bh-ort', '', 'ohne', !eb.ort, 'class="chip"')}</div>` : ''}
      ${eb.fehler ? `<p class="fehlertext">${esc(eb.fehler)}</p>` : ''}
      <div class="knopfreihe"><button class="knopf leise" data-a="buchung-weg" data-id="${esc(b.id)}">Löschen</button><button class="knopf haupt breit" data-a="bh-speichern">Speichern</button></div>`, 'Buchung ändern');
  },

  'import-frage': (eb) => sheet(`<h2>Sicherung importieren?</h2>
    <p class="hinweistext">Die Sicherung ersetzt alle Daten auf diesem Handy: ${eb.daten.fixkosten.length} Fixkosten, ${eb.daten.buchungen.length} Buchungen${eb.daten.einstellungen.letzteSicherung ? ', gesichert am ' + esc(eb.daten.einstellungen.letzteSicherung) : ''}.</p>
    <div class="knopfreihe"><button class="knopf leise" data-a="schliessen">Abbrechen</button><button class="knopf haupt breit" data-a="import-ja">Ersetzen</button></div>`, 'Import'),

  frage: (eb) => sheet(`<h2>${esc(eb.titel)}</h2><p class="hinweistext">${esc(eb.text)}</p>
    <div class="knopfreihe"><button class="knopf leise" data-a="schliessen">Abbrechen</button><button class="knopf haupt breit" data-a="frage-ja">${esc(eb.ja)}</button></div>`, eb.titel)
};

function toastHtml() {
  if (!z.toast) return '';
  return `<div class="toast" role="status"><span class="t">${esc(z.toast.text)}</span>${z.toast.rueckgaengig ? '<button class="knopf klein akzent" data-a="toast-rueck">Rückgängig</button>' : ''}<button class="knopf klein leise rund" style="width:36px" data-a="toast-zu" aria-label="Hinweis schließen">${ICON.x}</button></div>`;
}
let toastTimer = null;
function zeigeToast(text, rueckgaengig) {
  z.toast = { text, rueckgaengig };
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
  ansicht: (el) => { z.ansicht = el.dataset.wert; window.scrollTo(0, 0); render(); },
  monat: (el) => { z.monat = R.ymPlus(z.monat, Number(el.dataset.wert)); render(); },
  heute: () => { z.monat = heuteYm(); render(); },
  'zu-monat': (el) => { z.monat = el.dataset.wert; z.ansicht = 'monat'; window.scrollTo(0, 0); render(); },
  'ansicht-pro-monat': async (el) => { await aendern((d) => { d.einstellungen.ansichtProMonat = el.dataset.wert === '1'; }); },
  'verlauf-alle': () => { z.verlaufAlle = true; render(); },
  schliessen,
  'schliessen-schleier': (el, ev) => { if (ev.target === el) schliessen(); },
  mehr: () => { oben().mehr = !oben().mehr; renderEbenen(); },
  'toast-zu': () => { z.toast = null; renderEbenen(); },
  'toast-rueck': async () => { const r = z.toast && z.toast.rueckgaengig; z.toast = null; if (r) await aendern(r); else renderEbenen(); },

  // Start
  'start-einrichten': () => { z.daten = D.leereDaten(); z.daten.einstellungen.gesehenVersion = APP_VERSION; oeffne(E.neueEinfuehrung(z.daten, true)); },
  'einfuehrung-erneut': () => oeffne(E.neueEinfuehrung(z.daten, false)),
  'ef-wert': (el) => {
    let w = el.dataset.wert; if (w === 'ja') w = true; else if (w === 'nein') w = false;
    setzePfad(oben(), el.dataset.pfad, w); oben().fehler = null; renderEbenen();
  },
  'ef-waehlen': (el) => {
    const liste = oben().listen[el.dataset.liste]; const i = Number(el.dataset.i); const p = liste[i];
    if (p.eigen) liste.splice(i, 1); else p.gewaehlt = !p.gewaehlt;
    oben().fehler = null; renderEbenen();
  },
  'ef-eigen': (el) => {
    oben().listen[el.dataset.liste].push({ name: '', eigen: true, gewaehlt: true, wieOft: 'monatlich', tag: 1, monat: R.ymTeile(heuteYm()).monat, betragText: '', anteilText: '100' });
    renderEbenen();
    const felder = document.querySelectorAll('.ef-posten input[data-feld$=".name"]'); if (felder.length) felder[felder.length - 1].focus();
  },
  'ef-budget-an': (el) => { const b = oben().budgets[Number(el.dataset.i)]; b.an = !b.an; renderEbenen(); },
  'ef-budget-neu': () => { oben().budgets.push({ id: null, name: '', emoji: '', an: true, text: '', neu: true }); renderEbenen(); },
  'ef-weiter': async () => {
    const eb = oben();
    const fehler = E.pruefeSchritt(eb, zahl);
    if (fehler) { eb.fehler = fehler; renderEbenen(); return; }
    eb.fehler = null;
    if (E.SCHRITTE[eb.schritt] === 'fertig') {
      z.ebenen = []; z.ansicht = 'monat'; z.monat = heuteYm();
      await aendern((d) => E.anwenden(d, eb, zahl), { text: 'Eingerichtet. Alles lässt sich antippen und ändern.' });
      return;
    }
    eb.schritt += 1; renderEbenen(); oben0();
  },
  'ef-zurueck': () => { const eb = oben(); if (eb.schritt > 0) { eb.schritt -= 1; eb.fehler = null; renderEbenen(); oben0(); } else schliessen(); },
  'ef-ueberspringen': () => { const eb = oben(); eb.schritt = E.SCHRITTE.length - 1; eb.fehler = null; renderEbenen(); oben0(); },
  'start-beispiel': async () => { z.daten = D.beispielDaten(); z.daten.einstellungen.gesehenVersion = APP_VERSION; z.ebenen = []; await aendern(() => {}); },
  'start-leer': async () => { z.daten = D.leereDaten(); z.daten.einstellungen.gesehenVersion = APP_VERSION; z.ebenen = []; await aendern(() => {}); oeffne(gehaltEbene(heuteYm())); },
  'beispiel-weg': () => oeffne({ art: 'frage', titel: 'Beispieldaten entfernen?', text: 'Alle Beispiel-Fixkosten, das Beispiel-Sparkonto und alle Buchungen werden gelöscht. Kategorien und Budgets bleiben.', ja: 'Entfernen', bei: async () => {
    const vorher = kopie(z.daten);
    await aendern((d) => { d.fixkosten = []; d.sparraten = []; d.buchungen = []; d.einnahmen.forEach((e) => { e.betrag = 0; e.istWerte = []; }); delete d.beispiel; }, { text: 'Beispieldaten entfernt', rueckgaengig: (d) => Object.assign(d, vorher) });
  } }),
  'frage-ja': async () => { const eb = z.ebenen.pop(); await eb.bei(); },

  // Fixkosten
  fixkosten: (el) => {
    const f = z.daten.fixkosten.find((x) => x.id === el.dataset.id);
    if (!f) return;
    const entwurf = Object.assign(kopie(f), { betragText: R.euro(f.betrag, false) });
    if (!entwurf.monat) entwurf.monat = R.ymTeile(heuteYm()).monat;
    oeffne({ art: 'fixkosten', id: f.id, entwurf, mehr: !!(f.abo || (f.meinAnteil != null && f.meinAnteil !== 100) || f.endetAm) });
  },
  'fixkosten-neu': (el) => oeffne({ art: 'fixkosten', id: null, entwurf: { name: '', betragText: '', wieOft: 'monatlich', tag: 1, monat: R.ymTeile(heuteYm()).monat, kategorieId: el.dataset.kat || (fixKats()[0] || {}).id, abo: false, meinAnteil: 100, endetAm: null, kuendigungsfrist: null } }),
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
    const betrag = zahl(f.betragText);
    const anteil = zahl(f.meinAnteil);
    if (!f.name.trim()) { eb.fehler = 'Bitte einen Namen eintragen.'; renderEbenen(); return; }
    if (isNaN(betrag) || betrag <= 0) { eb.fehler = 'Bitte einen Betrag über 0 € eintragen.'; renderEbenen(); return; }
    if (isNaN(anteil) || anteil <= 0 || anteil > 100) { eb.fehler = 'Der Anteil muss zwischen 1 und 100 % liegen.'; renderEbenen(); return; }
    const fertig = { id: eb.id || D.neueId('fk'), name: f.name.trim(), betrag, wieOft: f.wieOft, tag: f.tag, monat: f.wieOft === 'monatlich' ? null : f.monat, kategorieId: f.kategorieId, abo: !!f.abo, meinAnteil: anteil, endetAm: f.endetAm || null, kuendigungsfrist: f.kuendigungsfrist || null };
    z.ebenen.pop();
    await aendern((d) => { const i = d.fixkosten.findIndex((x) => x.id === fertig.id); if (i >= 0) d.fixkosten[i] = Object.assign({}, d.fixkosten[i], fertig); else d.fixkosten.push(fertig); }, { text: `${fertig.name} gespeichert` });
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
    oeffne({ art: 'frage', titel: `${k.name} löschen?`, text: n ? `Dazu gibt es ${n} Buchungen. Sie werden mitgelöscht. Widgets für dieses Budget zeigen danach „Kategorie wählen“.` : 'Widgets für dieses Budget zeigen danach „Kategorie wählen“.', ja: 'Löschen', bei: async () => {
      z.ebenen.pop();
      const vorher = { k: kopie(k), i: z.daten.kategorien.indexOf(k), b: z.daten.buchungen.filter((b) => b.kategorieId === id) };
      await aendern((d) => { d.kategorien = d.kategorien.filter((x) => x.id !== id); d.buchungen = d.buchungen.filter((b) => b.kategorieId !== id); }, { text: `${k.name} gelöscht`, rueckgaengig: (d) => { d.kategorien.splice(vorher.i, 0, vorher.k); d.buchungen.push(...vorher.b); } });
    } });
  },

  // Gehalt
  gehalt: (el) => oeffne(gehaltEbene(el.dataset.monat || z.monat)),
  'ge-ankunft': (el) => { gehalt().kommtAn = el.dataset.wert; renderEbenen(); },
  'ge-speichern': async () => {
    const eb = oben();
    const schaetzung = zahl(eb.schaetzungText);
    const ist = eb.istText.trim() === '' ? null : zahl(eb.istText);
    const tag = zahl(eb.tagText);
    if (isNaN(schaetzung) || schaetzung < 0) { eb.fehler = 'Bitte eine Schätzung ab 0 € eintragen.'; renderEbenen(); return; }
    if (ist !== null && (isNaN(ist) || ist < 0)) { eb.fehler = 'Der Betrag ist keine Zahl.'; renderEbenen(); return; }
    z.ebenen.pop();
    await aendern((d) => {
      const g = d.einnahmen.find((e) => e.wieOft === 'monatlich');
      g.betrag = schaetzung;
      if (g.kommtAn === 'Tag') g.ankunftTag = isNaN(tag) ? 1 : Math.min(31, Math.max(1, Math.round(tag)));
      g.istWerte = g.istWerte.filter((w) => R.ymAus(w.datum) !== eb.monat);
      if (ist !== null) g.istWerte.push({ datum: eb.monat + '-' + R.zweistellig(R.ankunftsTag(g, eb.monat)), betrag: ist });
    }, { text: ist !== null ? `Gehalt ${monatsName(eb.monat)}: ${R.euroRund(ist)} eingetragen` : 'Gehalt gespeichert' });
  },

  // Sparkonto
  sparkonto: (el) => {
    const sp = z.daten.sparraten.find((x) => x.id === el.dataset.id);
    if (sp) oeffne({ art: 'sparkonto', id: sp.id, entwurf: { name: sp.name, betragText: R.euro(sp.betrag, false), tagText: String(sp.tag || 1), standText: R.euro(R.sparStand(sp, heute()), false) } });
    else oeffne({ art: 'sparkonto', id: null, entwurf: { name: 'Sparkonto', betragText: '', tagText: '1', standText: '0' } });
  },
  'sp-speichern': async () => {
    const eb = oben(); const e = eb.entwurf;
    const betrag = zahl(e.betragText); const tag = zahl(e.tagText); const stand = zahl(e.standText);
    if (!e.name.trim()) { eb.fehler = 'Bitte einen Namen eintragen.'; renderEbenen(); return; }
    if (isNaN(betrag) || betrag < 0) { eb.fehler = 'Bitte eine Rate ab 0 € eintragen.'; renderEbenen(); return; }
    if (isNaN(tag) || tag < 1 || tag > 31) { eb.fehler = 'Der Tag muss zwischen 1 und 31 liegen.'; renderEbenen(); return; }
    if (isNaN(stand)) { eb.fehler = 'Der Stand ist keine Zahl.'; renderEbenen(); return; }
    z.ebenen.pop();
    await aendern((d) => {
      const werte = { name: e.name.trim(), betrag, tag: Math.round(tag), stand, standDatum: heute() };
      const sp = d.sparraten.find((x) => x.id === eb.id);
      if (sp) Object.assign(sp, werte); else d.sparraten.push(Object.assign({ id: D.neueId('spar'), ziel: null }, werte));
    }, { text: `${e.name.trim()} gespeichert` });
  },
  'sp-loeschen': async () => {
    const id = oben().id; const sp = z.daten.sparraten.find((x) => x.id === id);
    z.ebenen.pop();
    await aendern((d) => { d.sparraten = d.sparraten.filter((x) => x.id !== id); }, { text: `${sp.name} gelöscht`, rueckgaengig: (d) => d.sparraten.push(sp) });
  },

  // Buchungen
  buchung: (el) => { const b = z.daten.buchungen.find((x) => x.id === el.dataset.id); if (b) oeffne({ art: 'buchung', id: b.id, betragText: R.euro(b.betrag, false), ort: b.ort || '' }); },
  'bh-ort': (el) => { oben().ort = el.dataset.wert; renderEbenen(); },
  'bh-speichern': async () => {
    const eb = oben(); const betrag = zahl(eb.betragText);
    if (isNaN(betrag) || betrag <= 0) { eb.fehler = 'Bitte einen Betrag über 0 € eintragen.'; renderEbenen(); return; }
    z.ebenen.pop();
    await aendern((d) => { const b = d.buchungen.find((x) => x.id === eb.id); if (b) { b.betrag = betrag; b.ort = eb.ort || null; } }, { text: 'Buchung geändert' });
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
    try {
      await D.speichern(z.daten);
      const pfad = await D.exportieren(z.daten, name);
      zeigeToast(`Gespeichert in ${pfad}`);
      render();
    } catch (e) { zeigeToast('Sicherung fehlgeschlagen: ' + (e && e.message ? e.message : e)); }
  },
  import: () => document.getElementById('import-datei').click()
};

function setzePfad(obj, pfad, wert) {
  const teile = pfad.split('.');
  let o = obj;
  for (let i = 0; i < teile.length - 1; i++) o = o[teile[i]];
  o[teile[teile.length - 1]] = wert;
}
function oben0() { const s = document.querySelector('.seite:last-of-type'); if (s) s.scrollTop = 0; }

function gehaltEbene(s) {
  const g = gehalt();
  const ist = (g.istWerte || []).find((w) => R.ymAus(w.datum) === s);
  return { art: 'gehalt', monat: s, istText: ist ? R.euro(ist.betrag, false) : '', schaetzungText: R.euro(R.schaetzung(g), false), tagText: String(g.ankunftTag || 1) };
}

// ---------- Ereignisse ----------
function bindeEreignisse() {
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
    const el = ev.target.closest('[data-feld]');
    const eb = oben();
    if (!el || !eb) return;
    const wert = el.type === 'date' ? (el.value || null) : el.dataset.zahl ? Number(el.value) : el.value;
    if (el.dataset.feld.includes('.')) setzePfad(eb, el.dataset.feld, wert);
    else (eb.entwurf || eb)[el.dataset.feld] = wert;
    if (el.dataset.neuZeichnen) aktualisiereZusammenfassung();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && z.ebenen.length && oben().art !== 'start') schliessen();
  });
  document.getElementById('import-datei').addEventListener('change', async (ev) => {
    const datei = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!datei) return;
    const text = await datei.text();
    const r = D.pruefeImport(text);
    if (!r.ok) { zeigeToast(r.fehler); return; }
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
}
