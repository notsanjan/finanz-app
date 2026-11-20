// Einführung: fragt Gehalt, Wohnen, Versicherungen, Abos, Auto, weitere Fixkosten, Sparen und Budgets ab
// und richtet die App damit ein. Alles ist optional und lässt sich später ändern.
import * as R from './rechnen.js';
import * as D from './daten.js';

const M = 'monatlich', V = 'vierteljaehrlich', H = 'halbjaehrlich', J = 'jaehrlich';
const v = (name, wieOft = M, tag = 1, monat = null, extra = {}) => Object.assign({ name, wieOft, tag, monat }, extra);

// Listen der Einführung. Kategorie-IDs wie in daten.js (wohnen, abos, versicherungen); auto/weitere entstehen bei Bedarf.
export const LISTEN = [
  { id: 'wohnen', titel: 'Wohnen', emoji: '🏠', farbe: '#7fd6c8', frage: 'Was zahlst du fürs Wohnen?',
    vorschlaege: [v('Miete', M, 1, null, { anteil: true }), v('Nebenkosten'), v('Strom', M, 15), v('Gas / Heizung', M, 15), v('Internet', M, 3), v('Rundfunkbeitrag', V, 15, 2)] },
  { id: 'versicherungen', titel: 'Versicherungen', emoji: '🛡️', farbe: '#c9d27a', frage: 'Welche Versicherungen hast du?',
    vorschlaege: [v('Haftpflicht', J), v('Hausrat', J), v('Kfz-Versicherung', J), v('Berufsunfähigkeit'), v('Rechtsschutz', J), v('Unfallversicherung', J), v('Zahnzusatz'), v('Krankenzusatz'), v('Auslandsreise', J), v('Risikoleben', J), v('Tierhalter', J), v('Wohngebäude', J)] },
  { id: 'abos', titel: 'Handy und Abos', emoji: '📱', farbe: '#4f9a8e', frage: 'Welche Verträge und Abos laufen bei dir?',
    vorschlaege: [v('Handyvertrag', M, 28), v('Netflix', M, 1, null, { abo: true }), v('Spotify', M, 1, null, { abo: true }), v('Disney+', M, 1, null, { abo: true }), v('Amazon Prime', J, 1, null, { abo: true }), v('YouTube Premium', M, 1, null, { abo: true }), v('Cloud-Speicher', M, 1, null, { abo: true }), v('Fitnessstudio', M, 1, null, { abo: true }), v('Deutschlandticket', M, 1, null, { abo: true }), v('Zeitung / Magazin', M, 1, null, { abo: true })] },
  { id: 'auto', titel: 'Auto und Mobilität', emoji: '🚗', farbe: '#8fb3d9', frage: 'Hast du ein Auto oder andere feste Kosten fürs Unterwegssein?',
    vorschlaege: [v('Kfz-Steuer', J), v('Kredit / Leasing'), v('Schutzbrief / ADAC', J), v('Parkplatz / Garage')] },
  { id: 'weitere', titel: 'Weitere Fixkosten', emoji: '🧾', farbe: '#b9a68f', frage: 'Gibt es sonst noch etwas, das regelmäßig abgebucht wird?',
    vorschlaege: [v('Kredit'), v('Gewerkschaft / Berufsverband'), v('Verein', J), v('Spenden'), v('Kita / Schule'), v('Haustier')] }
];

const BUDGET_VORSCHLAEGE = { lebensmittel: 300, tanken: 150, freizeit: 120, sonstiges: 0 };
const SCHRITTE = ['gehalt', 'einnahmen', ...LISTEN.map((l) => 'liste:' + l.id), 'ruecklage', 'sparen', 'budgets', 'fertig'];
const EINNAHMEN = ['💼 Nebenjob', '🧑‍💼 Selbstständigkeit', '👶 Kindergeld', '🤝 Unterhalt', '🏠 Mieteinnahmen'];
const RHYTHMEN = [[M, 'monatlich'], [V, 'vierteljährlich'], [H, 'halbjährlich'], [J, 'jährlich']];

export function neueEinfuehrung(daten, erstStart) {
  const vorhanden = (katId, name) => (daten.fixkosten || []).find((f) => f.kategorieId === katId && f.name.toLowerCase() === name.toLowerCase());
  const g = R.gehaltVon(daten);
  const sp = R.sparratenNormal(daten)[0];
  const rk = R.ruecklage(daten);
  return {
    art: 'einfuehrung', erstStart, schritt: 0,
    gehalt: { text: g && g.betrag ? String(g.betrag).replace('.', ',') : '', kommtAn: g && g.kommtAn === 'Tag' ? 'Tag' : 'Monatsende', tag: String((g && g.ankunftTag) || 1) },
    listen: Object.fromEntries(LISTEN.map((l) => [l.id, l.vorschlaege.map((x) => Object.assign({}, x, {
      gewaehlt: false, vorhandenId: (vorhanden(l.id, x.name) || {}).id || null, betragText: '', monat: x.monat || R.ymTeile(R.ymAus(R.datumText(new Date()))).monat, geteilt: false, meinText: '', teiltMit: ''
    })).concat(
      // v33: schon eingetragene eigene Fixkosten dieser Kategorie erscheinen auch oben („schon da · ändern“)
      (daten.fixkosten || []).filter((f) => f.kategorieId === l.id && !l.vorschlaege.some((x) => x.name.toLowerCase() === f.name.toLowerCase())).map((f) => ({
        name: f.name, wieOft: f.wieOft, tag: f.tag || 1, abo: !!f.abo, gewaehlt: false, vorhandenId: f.id, betragText: '', monat: f.monat || R.ymTeile(R.ymAus(R.datumText(new Date()))).monat, geteilt: false, meinText: '', teiltMit: ''
      })))])),
    einnahmen: [],
    // Vorschläge, die der Nutzer nicht hat („✕“), und Kategorien, die weg sollen
    ausgeblendet: [...((daten.einstellungen && daten.einstellungen.ausgeblendet) || [])],
    kategorieWeg: {},
    ruecklage: { ja: rk ? true : null, betrag: rk ? String(rk.betrag) : '', tag: String(rk ? rk.tag || 1 : 1), stand: rk ? String(Math.round(R.ruecklageStand(daten, R.datumText(new Date())))) : '' },
    sparen: { ja: sp ? true : null, betrag: sp ? String(sp.betrag) : '', tag: String(sp ? sp.tag || 1 : 1), stand: sp ? String(R.sparStand(sp, R.datumText(new Date()))) : '' },
    budgets: daten.kategorien.filter((k) => k.art === 'budget').map((k) => ({
      id: k.id, name: k.name, emoji: k.emoji || '', an: true, text: String(k.budget || (erstStart ? BUDGET_VORSCHLAEGE[k.id] || 0 : 0))
    }))
  };
}

// ---------- Darstellung ----------
// Vorschlags-Chip mit kleinem ✕ („habe ich nicht“): blendet den Vorschlag aus
function vorschlag(knopf, schluessel, name, esc) {
  return `<span class="chip-paar">${knopf}<button class="chip-x" data-a="ef-ausblenden" data-wert="${esc(schluessel)}" aria-label="${esc(name)}: habe ich nicht, ausblenden">✕</button></span>`;
}
function ausgeblendetLink(eb, praefix, esc) {
  const n = (eb.ausgeblendet || []).filter((k) => k.startsWith(praefix)).length;
  return n ? `<button class="knopf klein leise ef-einblenden" data-a="ef-einblenden" data-wert="${esc(praefix)}">${n} ausgeblendet · wieder zeigen</button>` : '';
}
// Geteilte Kosten: Man trägt ein, wie viel man selbst zahlt (€); der Anteil in % wird ausgerechnet.
export function anteilAusEuro(betrag, meinText, zahl) {
  const mein = zahl(String(meinText || ''));
  if (!(betrag > 0) || isNaN(mein) || mein <= 0 || mein > betrag) return null;
  return Math.round(mein / betrag * 100 * 1e6) / 1e6;
}
export function anteilHinweis(p, zahl) {
  const betrag = zahl(String(p.betragText || ''));
  const mein = zahl(String(p.meinText || ''));
  if (!String(p.meinText || '').trim()) return 'Trag ein, wie viel davon du selbst zahlst. Die Prozent rechnet die App aus.';
  if (!(betrag > 0)) return 'Trag oben zuerst den Gesamtbetrag ein.';
  if (isNaN(mein) || mein <= 0 || mein > betrag) return `Dein Teil muss zwischen 0 und ${R.euro(betrag)} liegen.`;
  const pz = Math.round(mein / betrag * 1000) / 10;
  const rest = Math.round((betrag - mein) * 100) / 100;
  return `= ${String(pz).replace('.', ',')} % · ${rest > 0 ? `den Rest (${R.euro(rest)}) zahlt ${(p.teiltMit || '').trim() || 'jemand anderes'}` : 'du zahlst alles'}. Gerechnet wird mit deinen ${R.euro(mein)}.`;
}
const RHYTHMUS_TEXT = { monatlich: 'monatlich', vierteljaehrlich: 'vierteljährlich', halbjaehrlich: 'halbjährlich', jaehrlich: 'jährlich', einmalig: 'einmalig' };
function kurzfassung(p, zahl, plus = false) {
  const b = zahl(String(p.betragText || ''));
  const betrag = b > 0 ? (plus ? `<span class="plus-zahl">+ ${R.euro(b)}</span>` : `<span class="minus-zahl">− ${R.euro(b)}</span>`) : '<span class="ef-fehlt">Betrag fehlt</span>';
  const teile = [betrag, RHYTHMUS_TEXT[p.wieOft] || p.wieOft];
  if (p.tag) teile.push('am ' + p.tag + '.');
  if (p.status) teile.push(p.status === 'geplant' ? 'nur geplant' : 'fest');
  let zweite = '';
  if (p.geteilt) { const a = anteilAusEuro(b, p.meinText, zahl); zweite = a ? `du zahlst ${R.euro(zahl(p.meinText))} (${String(Math.round(a * 10) / 10).replace('.', ',')} %)` : 'Anteil fehlt'; }
  return { zeile: teile.join(' · '), zweite };
}
function zugeklappt(name, p, pfad, zahl, esc, extra = '', plus = false) {
  const k = kurzfassung(p, zahl, plus);
  return `<section class="karte ef-posten ef-zu"><button class="ef-zu-knopf" data-a="ef-zu" data-pfad="${pfad}" data-wert="0" aria-expanded="false" aria-label="${esc(name || 'Eintrag')} aufklappen und bearbeiten">
    <span class="t"><b>${esc(name || 'Ohne Namen')}</b><small>${k.zeile}</small>${k.zweite ? `<small class="ef-zweite">👥 ${esc(k.zweite)}</small>` : ''}${extra}</span><span class="ef-pfeil">▾</span></button></section>`;
}
const fertigKnopf = (pfad) => `<button class="knopf klein leise ef-fertig" data-a="ef-zu" data-pfad="${pfad}" data-wert="1">✓ Fertig, einklappen</button>`;

export function einfuehrungHtml(eb, h) {
  const { esc, ICON } = h;
  const art = SCHRITTE[eb.schritt];
  const gesamt = SCHRITTE.length - 1;
  const fortschritt = Math.min(eb.schritt, gesamt) / gesamt * 100;
  let inhalt = '';

  if (art === 'gehalt') {
    inhalt = `${eb.basis ? '<section class="karte ef-beispiel-hinweis"><b>Du startest mit deinen eigenen Zahlen.</b><p class="hinweistext">Die Beispieldaten werden am Ende durch deine Angaben ersetzt.</p></section>' : ''}<h2 class="ef-titel">Was kommt jeden Monat rein?</h2>
      <p class="hinweistext">Dein Gehalt netto, so wie es auf dem Konto ankommt. Ein ungefährer Wert reicht, du kannst ihn jeden Monat korrigieren.</p>
      <section class="karte">
        <div class="feld"><label for="ef-gehalt">Gehalt netto pro Monat</label><input id="ef-gehalt" class="eingabe gross-eingabe" inputmode="decimal" data-feld="gehalt.text" value="${esc(eb.gehalt.text)}" placeholder="z. B. 2.400 €"></div>
        <div class="label">Wann kommt es an?</div>
        <div class="wahl zwei-sp"><button data-a="ef-wert" data-pfad="gehalt.kommtAn" data-wert="Monatsende" aria-pressed="${eb.gehalt.kommtAn === 'Monatsende'}">am Monatsende</button><button data-a="ef-wert" data-pfad="gehalt.kommtAn" data-wert="Tag" aria-pressed="${eb.gehalt.kommtAn === 'Tag'}">an einem Tag</button></div>
        ${eb.gehalt.kommtAn === 'Tag' ? `<div class="feld"><label for="ef-gtag">Am Tag</label>${tagAuswahl('ef-gtag', 'gehalt.tag', Number(eb.gehalt.tag))}</div>` : ''}
      </section>`;
  } else if (art === 'einnahmen') {
    const jetzt = R.ymAus(R.datumText(new Date()));
    const monate = Array.from({ length: 13 }, (_, i) => R.ymPlus(jetzt, i));
    const zeilen = eb.einnahmen.map((e, i) => e.zu ? zugeklappt(e.name, e, `einnahmen.${i}`, h.zahl, esc, '', true) : `<section class="karte ef-posten">
        <div class="ef-zeile"><input class="eingabe" data-feld="einnahmen.${i}.name" value="${esc(e.name)}" placeholder="Name" aria-label="Name">
          <input class="eingabe ef-betrag" inputmode="decimal" data-feld="einnahmen.${i}.betragText" value="${esc(e.betragText)}" placeholder="Betrag €" aria-label="Betrag">
          <button class="knopf rund leise klein-x" data-a="ef-ein-weg" data-i="${i}" aria-label="Entfernen">${ICON.x}</button></div>
        <div class="wahl zwei-sp ef-rhythmus"><button data-a="ef-wert" data-pfad="einnahmen.${i}.wieOft" data-wert="monatlich" aria-pressed="${e.wieOft === 'monatlich'}">jeden Monat</button><button data-a="ef-wert" data-pfad="einnahmen.${i}.wieOft" data-wert="einmalig" aria-pressed="${e.wieOft === 'einmalig'}">einmalig</button></div>
        ${e.wieOft === 'einmalig' ? `<div class="feld"><label for="ef-em-${i}">In welchem Monat?</label><select id="ef-em-${i}" class="eingabe" data-feld="einnahmen.${i}.monat">${monate.map((m) => `<option value="${m}" ${e.monat === m ? 'selected' : ''}>${R.MONATE_LANG[R.ymTeile(m).monat - 1]} ${R.ymTeile(m).jahr}</option>`).join('')}</select></div>` : ''}
        <div class="wahl zwei-sp ef-rhythmus"><button data-a="ef-wert" data-pfad="einnahmen.${i}.status" data-wert="fest" aria-pressed="${e.status === 'fest'}">fest</button><button data-a="ef-wert" data-pfad="einnahmen.${i}.status" data-wert="geplant" aria-pressed="${e.status === 'geplant'}">nur geplant</button></div>
        ${fertigKnopf(`einnahmen.${i}`)}
      </section>`).join('');
    inhalt = `<h2 class="ef-titel">➕ Weitere Einnahmen</h2>
      <p class="hinweistext">Kommt neben dem Gehalt noch etwas rein? „Fest“ wird gleich mitgerechnet, „nur geplant“ erst, wenn das Geld da ist. Nichts davon? Einfach „Weiter“.</p>
      <p class="hinweistext ef-unregel">Unregelmäßig, z. B. Selbstständigkeit nur ab und zu? Hier weglassen und jedes Mal eintragen, wenn Geld kommt: ＋ → „+ Einnahme“. Eigene Namen merkt sich die App dort.</p>
      <div class="chips">${EINNAHMEN.filter((n) => !(eb.ausgeblendet || []).includes('ein:' + n)).map((n) => {
        const da = eb.einnahmen.some((e) => e.name === n);
        const knopf = `<button class="chip ef-chip" data-a="ef-ein-dazu" data-wert="${esc(n)}" aria-pressed="${da}">${da ? '✓' : ICON.plus} ${esc(n)}</button>`;
        return da ? knopf : vorschlag(knopf, 'ein:' + n, n, esc);
      }).join('')}<button class="chip ef-chip eigen" data-a="ef-ein-dazu" data-wert="">${ICON.plus} Eigene</button></div>
      <p class="hinweistext ef-tipp">Antippen = hinzufügen, nochmal antippen = weg. ✕ = habe ich nicht, ausblenden.</p>${ausgeblendetLink(eb, 'ein:', esc)}
      ${zeilen}`;
  } else if (art.startsWith('liste:')) {
    const l = LISTEN.find((x) => 'liste:' + x.id === art);
    const posten = eb.listen[l.id];
    const weg = (eb.ausgeblendet || []);
    const chips = posten.map((p, i) => {
      // v33: eigene Posten stehen auch oben als Knopf (antippen = an/aus, ✕ an der Karte entfernt)
      if (p.eigen) return String(p.name || '').trim() ? `<button class="chip ef-chip" data-a="ef-eigen-chip" data-liste="${l.id}" data-i="${i}" aria-pressed="${p.gewaehlt}">${p.gewaehlt ? '✓ ' : ''}${esc(p.name)}</button>` : '';
      if (p.vorhandenId && !p.gewaehlt) return `<button class="chip ef-chip da" data-a="ef-vorhanden" data-liste="${l.id}" data-i="${i}" aria-label="${esc(p.name)} ist schon eingetragen, antippen zum Ändern">✓ ${esc(p.name)} <small>schon da · ändern</small></button>`;
      const key = 'liste:' + l.id + ':' + p.name;
      if (!p.gewaehlt && weg.includes(key)) return '';
      const knopf = `<button class="chip ef-chip" data-a="ef-waehlen" data-liste="${l.id}" data-i="${i}" aria-pressed="${p.gewaehlt}">${p.gewaehlt ? '✓ ' : ''}${esc(p.name)}</button>`;
      return p.gewaehlt ? knopf : vorschlag(knopf, key, p.name, esc);
    }).join('');
    const katHatKosten = ((eb.basis || h.z.daten).fixkosten || []).some((f) => f.kategorieId === l.id);
    const wegKarte = eb.kategorieWeg && eb.kategorieWeg[l.id] ? `<h2 class="ef-titel">${esc(l.emoji)} ${esc(l.titel)}</h2>
        <section class="karte ef-weg-karte"><b>Kategorie „${esc(l.titel)}“ wird entfernt.</b><p class="hinweistext">Sie erscheint nicht in der Übersicht. Später kannst du sie jederzeit wieder anlegen.</p>
        <button class="knopf" data-a="ef-kat-weg" data-liste="${l.id}" data-wert="0">Rückgängig, ich brauche sie doch</button></section>` : '';
    const gewaehlt = posten.map((p, i) => ({ p, i })).filter((x) => x.p.gewaehlt);
    const karten = gewaehlt.map(({ p, i }) => {
      const pf = `listen.${l.id}.${i}`;
      if (p.loeschen) return `<section class="karte ef-posten ef-weg-karte"><div class="ef-zeile"><b class="ef-name">${esc(p.name)}</b><small class="ef-weg-text">wird gelöscht</small><button class="knopf klein akzent" data-a="ef-wert" data-pfad="${pf}.loeschen" data-wert="nein">Rückgängig</button></div></section>`;
      if (p.zu) return zugeklappt(p.name, p, pf, h.zahl, esc, p.vorhandenId ? '<small class="ef-zweite">schon eingetragen · wird geändert</small>' : '');
      const monat = p.wieOft === M ? '' : `<div class="feld"><label for="ef-m-${l.id}-${i}">${p.wieOft === J ? 'Im Monat' : 'Ab Monat'}</label><select id="ef-m-${l.id}-${i}" class="eingabe" data-feld="${pf}.monat" data-zahl="1">${R.MONATE_LANG.map((n, k) => `<option value="${k + 1}" ${Number(p.monat) === k + 1 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
      const teilen = p.geteilt ? `<div class="ef-teilen">
          <div class="zwei"><div class="feld"><label for="ef-a-${l.id}-${i}">Davon zahlst du (€)</label><input id="ef-a-${l.id}-${i}" class="eingabe" inputmode="decimal" data-feld="${pf}.meinText" value="${esc(p.meinText)}" placeholder="z. B. 525"></div>
          <div class="feld"><label for="ef-w-${l.id}-${i}">Rest zahlt</label><input id="ef-w-${l.id}-${i}" class="eingabe" data-feld="${pf}.teiltMit" value="${esc(p.teiltMit || '')}" placeholder="Anna (optional)"></div></div>
          <p class="hinweistext ef-anteil-hinweis" id="ef-ah-${l.id}-${i}">${esc(anteilHinweis(p, h.zahl))}</p>
          <button class="knopf klein akzent" data-a="ef-wert" data-pfad="${pf}.geteilt" data-wert="nein">Doch nicht geteilt</button></div>`
        : `<button class="knopf klein leise ef-teilen-knopf" data-a="ef-wert" data-pfad="${pf}.geteilt" data-wert="ja">👥 Teile ich mit jemandem</button>`;
      return `<section class="karte ef-posten">
        ${p.vorhandenId ? '<p class="hinweistext ef-vorhanden-text">Schon eingetragen. Was du hier änderst, wird übernommen.</p>' : ''}
        <div class="ef-zeile">
          ${p.eigen ? `<input class="eingabe" data-feld="${pf}.name" value="${esc(p.name)}" placeholder="Name" aria-label="Name">` : `<b class="ef-name">${esc(p.name)}</b>`}
          <input class="eingabe ef-betrag" inputmode="decimal" data-feld="${pf}.betragText" value="${esc(p.betragText)}" placeholder="Betrag €" aria-label="${p.geteilt ? 'Gesamtbetrag' : 'Betrag'} für ${esc(p.name || 'eigenen Posten')}">
          <button class="knopf rund leise klein-x" data-a="ef-waehlen" data-liste="${l.id}" data-i="${i}" aria-label="${esc(p.name || 'Posten')} ${p.vorhandenId ? 'nicht ändern' : 'entfernen'}">${ICON.x}</button>
        </div>
        ${p.geteilt ? '<p class="hinweistext ef-gesamt">Oben den Gesamtbetrag eintragen.</p>' : ''}
        <div class="wahl zwei-sp ef-rhythmus">${RHYTHMEN.map(([w, t]) => `<button data-a="ef-wert" data-pfad="${pf}.wieOft" data-wert="${w}" aria-pressed="${p.wieOft === w}">${t}</button>`).join('')}</div>
        <div class="zwei"><div class="feld"><label for="ef-t-${l.id}-${i}">Am Tag</label>${tagAuswahl(`ef-t-${l.id}-${i}`, pf + '.tag', Number(p.tag))}</div>${monat}</div>
        ${teilen}
        <div class="ef-unten">${p.vorhandenId ? `<button class="knopf klein leise ef-loeschen" data-a="ef-wert" data-pfad="${pf}.loeschen" data-wert="ja">🗑 Eintrag löschen</button>` : ''}${fertigKnopf(pf)}</div>
      </section>`;
    }).join('');
    inhalt = wegKarte || `<h2 class="ef-titel">${esc(l.emoji)} ${esc(l.titel)}</h2>
      <p class="hinweistext">${esc(l.frage)} Antippen zum Auswählen. Nichts davon? Einfach „Weiter“.</p>
      <div class="chips">${chips}<button class="chip ef-chip eigen" data-a="ef-eigen" data-liste="${l.id}">${ICON.plus} Eigene hinzufügen</button></div>
      <p class="hinweistext ef-tipp">✕ = habe ich nicht, ausblenden.</p>${ausgeblendetLink(eb, 'liste:' + l.id + ':', esc)}
      ${karten}
      ${katHatKosten || gewaehlt.length ? '' : `<button class="knopf leise ef-kat-weg" data-a="ef-kat-weg" data-liste="${l.id}" data-wert="1">🚫 Brauche ich nicht – Kategorie „${esc(l.titel)}“ entfernen</button>`}`;
  } else if (art === 'ruecklage') {
    const probe = h.kopie((eb.basis || h.z.daten));
    anwenden(probe, Object.assign({}, eb, { ruecklage: { ja: false } }), h.zahl);
    const jaehrliche = probe.fixkosten.filter((f) => f.wieOft !== 'monatlich');
    const empf = R.empfohleneRuecklage(probe, R.ymAus(R.datumText(new Date())));
    if (eb.ruecklage.ja && !eb.ruecklage.betrag && empf) eb.ruecklage.betrag = String(empf);
    const jahr = jaehrliche.reduce((a, f) => a + R.monatsAnteil(f) * 12, 0);
    inhalt = `<h2 class="ef-titel">📆 Jährliche Kosten</h2>
      ${jaehrliche.length ? `<p class="hinweistext">Du hast ${jaehrliche.length} Kosten, die nicht jeden Monat abgebucht werden (${esc(jaehrliche.slice(0, 4).map((f) => f.name).join(', '))}${jaehrliche.length > 4 ? ' …' : ''}). Zusammen ≈ <span class="minus-zahl">${R.euroRund(jahr)}</span> im Jahr, also ≈ <span class="minus-zahl">${R.euroRund(jahr / 12)}</span> pro Monat.</p>`
        : '<p class="hinweistext">Du hast keine jährlichen oder vierteljährlichen Kosten eingetragen. Diesen Schritt kannst du überspringen.</p>'}
      <section class="karte">
        <b style="font-size:var(--t-titel-karte)">Hast du ein eigenes Konto für Rücklagen?</b>
        <p class="hinweistext">z. B. ein Unterkonto oder Tagesgeld. Ein Dauerauftrag schiebt jeden Monat denselben Betrag dorthin, und daraus zahlst du Versicherungen und Co. So ist jeden Monat gleich viel frei.</p>
        <div class="wahl zwei-sp"><button data-a="ef-wert" data-pfad="ruecklage.ja" data-wert="ja" aria-pressed="${eb.ruecklage.ja === true}">Ja / lege ich an</button><button data-a="ef-wert" data-pfad="ruecklage.ja" data-wert="nein" aria-pressed="${eb.ruecklage.ja === false}">Nein</button></div>
        ${eb.ruecklage.ja === false ? '<p class="hinweistext">Dann zählen jährliche Kosten voll im Monat der Abbuchung, und die App warnt dich vorher.</p>' : ''}
      </section>
      ${eb.ruecklage.ja ? `<section class="karte">
        <div class="zwei"><div class="feld"><label for="ef-rb">Dauerauftrag pro Monat</label><input id="ef-rb" class="eingabe" inputmode="decimal" data-feld="ruecklage.betrag" value="${esc(eb.ruecklage.betrag)}"></div>
        <div class="feld"><label for="ef-rt">Am Tag</label>${tagAuswahl('ef-rt', 'ruecklage.tag', Number(eb.ruecklage.tag))}</div></div>
        ${empf ? `<p class="hinweistext">Empfohlen: <span class="minus-zahl">${R.euroRund(empf)}</span> pro Monat.</p>` : ''}
        <div class="feld"><label for="ef-rs">Was liegt heute schon darauf?</label><input id="ef-rs" class="eingabe" inputmode="decimal" data-feld="ruecklage.stand" value="${esc(eb.ruecklage.stand)}" placeholder="0 €"></div>
      </section>` : ''}`;
  } else if (art === 'sparen') {
    inhalt = `<h2 class="ef-titel">💰 Sparen</h2>
      <p class="hinweistext">Sparst du jeden Monat einen festen Betrag? Das ist keine Ausgabe: Das Geld bleibt deins. Es geht nur von dem ab, was im Monat übrig bleibt.</p>
      <div class="wahl zwei-sp"><button data-a="ef-wert" data-pfad="sparen.ja" data-wert="ja" aria-pressed="${eb.sparen.ja === true}">Ja</button><button data-a="ef-wert" data-pfad="sparen.ja" data-wert="nein" aria-pressed="${eb.sparen.ja === false}">Nein</button></div>
      ${eb.sparen.ja ? `<section class="karte">
        <div class="zwei"><div class="feld"><label for="ef-sb">Rate pro Monat</label><input id="ef-sb" class="eingabe" inputmode="decimal" data-feld="sparen.betrag" value="${esc(eb.sparen.betrag)}" placeholder="z. B. 200 €"></div>
        <div class="feld"><label for="ef-st">Am Tag</label>${tagAuswahl('ef-st', 'sparen.tag', Number(eb.sparen.tag))}</div></div>
        <div class="feld"><label for="ef-ss">Was liegt heute schon auf dem Sparkonto?</label><input id="ef-ss" class="eingabe" inputmode="decimal" data-feld="sparen.stand" value="${esc(eb.sparen.stand)}" placeholder="0 €"></div>
      </section>` : ''}`;
  } else if (art === 'budgets') {
    const zeilen = eb.budgets.map((b, i) => !b.an ? `<div class="ef-budget aus"><span class="ef-name">${esc((b.emoji ? b.emoji + ' ' : '') + (b.name || 'Budget'))}</span><small class="ef-weg-text">wird entfernt</small><button class="knopf klein akzent" data-a="ef-budget-an" data-i="${i}">Rückgängig</button></div>` : `<div class="ef-budget">
        ${b.neu ? `<input class="eingabe emoji-feld klein-emoji" data-feld="budgets.${i}.emoji" value="${esc(b.emoji)}" placeholder="🙂" aria-label="Emoji" maxlength="8"><input class="eingabe" data-feld="budgets.${i}.name" value="${esc(b.name)}" placeholder="Name" aria-label="Name">`
          : `<span class="ef-name">${esc((b.emoji ? b.emoji + ' ' : '') + b.name)}</span>`}
        <input class="eingabe ef-betrag" inputmode="decimal" data-feld="budgets.${i}.text" value="${esc(b.text)}" aria-label="Budget ${esc(b.name)} pro Monat">
        <button class="knopf rund leise klein-x" data-a="ef-budget-an" data-i="${i}" aria-label="${esc(b.name || 'Budget')}: brauche ich nicht, entfernen">✕</button>
      </div>`).join('');
    inhalt = `<h2 class="ef-titel">🛒 Budgets für den Alltag</h2>
      <p class="hinweistext">Wie viel willst du pro Monat ungefähr ausgeben? Gebucht wird später mit den Widgets auf dem Homescreen. 0 € = ohne festes Budget. ✕ = Kategorie brauche ich nicht.</p>
      <section class="karte">${zeilen}</section>
      <button class="knopf akzent" data-a="ef-budget-neu">${ICON.plus} Eigenes Budget</button>`;
  } else {
    const probe = h.kopie((eb.basis || h.z.daten));
    anwenden(probe, eb, h.zahl);
    const r = R.monatsRechnung(probe, h.heuteYm());
    const anzahl = probe.fixkosten.length;
    inhalt = `<h2 class="ef-titel">Fertig eingerichtet</h2>
      <section class="karte ring"><div class="label">Frei im ${esc(h.monatsName(h.heuteYm()))}</div><div class="grosszahl ${r.frei < 0 ? 'minus' : ''}">${r.frei < 0 ? '− ' : '≈ '}${R.euroRund(Math.abs(r.frei))}</div>
        <p class="hinweistext">${anzahl} Fixkosten, ${probe.kategorien.filter((k) => k.art === 'budget' && k.budget > 0).length} Budgets${r.mitRuecklage ? ', <span class="minus-zahl">' + R.euroRund(r.zuruecklegen) + '</span> aufs Rücklagenkonto' : ''}${r.sparen ? ', <span class="minus-zahl">' + R.euroRund(r.sparen) + '</span> aufs Sparkonto' : ''}. Alles lässt sich in der Monatsansicht antippen und ändern.</p></section>
      <section class="karte"><div class="label">Widgets auf den Homescreen legen</div>
        <ol class="hinweistext" style="margin:0;padding-left:20px;line-height:1.6"><li>Lange auf eine freie Stelle des Homescreens drücken</li><li>„Widgets“ antippen und „Finanzen“ suchen</li><li>„Budget“ auf den Homescreen ziehen und eine Kategorie wählen</li><li>Für jede Kategorie ein eigenes Widget, dazu gern „Fixkosten“</li></ol></section>`;
  }

  const zurueckText = eb.schritt === 0 ? (eb.erstStart ? 'Zurück' : 'Abbrechen') : 'Zurück';
  const weiterText = art === 'fertig' ? '✓ Fertig – alles speichern' : 'Weiter';
  const speicherHinweis = art === 'fertig' ? '<p class="ef-speicher">Erst mit „Fertig“ wird alles in die App übernommen.</p>'
    : `<div class="ef-speicher ef-merken-zeile"><span>${eb.schritt > 0 ? '✓ Zwischengespeichert · ' : ''}übernommen wird mit „Fertig“</span><button class="knopf klein leise" data-a="ef-merken">Später weitermachen</button></div>`;
  return `<div class="seite" role="dialog" aria-modal="true" aria-label="Einführung"><div class="seite-innen">
    <div class="ef-kopf"><span class="klein">${art === 'fertig' ? 'Geschafft' : `Schritt ${eb.schritt + 1} von ${gesamt}`}</span>${art === 'fertig' ? '' : '<button class="knopf klein leise" data-a="ef-ueberspringen">Alles überspringen</button>'}</div>
    <div class="ef-fortschritt" role="progressbar" aria-valuenow="${Math.round(fortschritt)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${fortschritt}%"></span></div>
    ${inhalt}
    ${eb.fehler ? `<p class="fehlertext" role="alert">${esc(eb.fehler)}</p>` : ''}
    <div class="abstand"></div>
    ${speicherHinweis}<div class="knopfreihe"><button class="knopf leise" data-a="ef-zurueck">${zurueckText}</button><button class="knopf haupt breit" data-a="ef-weiter">${weiterText}</button></div>
  </div></div>`;
}

function tagAuswahl(id, pfad, wert) {
  return `<select id="${id}" class="eingabe" data-feld="${pfad}" data-zahl="1">${Array.from({ length: 31 }, (_, k) => `<option value="${k + 1}" ${wert === k + 1 ? 'selected' : ''}>${k + 1}.</option>`).join('')}</select>`;
}

// ---------- Prüfen und Übernehmen ----------
export function pruefeSchritt(eb, zahl) {
  const art = SCHRITTE[eb.schritt];
  if (art === 'gehalt' && eb.gehalt.text.trim() && (isNaN(zahl(eb.gehalt.text)) || zahl(eb.gehalt.text) < 0)) return 'Das Gehalt ist keine Zahl.';
  if (art === 'einnahmen') {
    if (eb.einnahmen.some((e) => !String(e.name).trim())) return 'Bitte jeder Einnahme einen Namen geben oder sie mit ✕ entfernen.';
    const ohne = eb.einnahmen.filter((e) => isNaN(zahl(e.betragText)) || zahl(e.betragText) <= 0);
    if (ohne.length) return `Bei ${ohne.map((e) => e.name).join(', ')} fehlt noch der Betrag.`;
  }
  if (art.startsWith('liste:')) {
    const posten = eb.listen[art.slice(6)].filter((p) => p.gewaehlt && !p.loeschen);
    const ohneName = posten.filter((p) => !String(p.name || '').trim());
    if (ohneName.length) return 'Bitte gib dem eigenen Posten einen Namen oder entferne ihn mit ✕.';
    const ohne = posten.filter((p) => isNaN(zahl(p.betragText)) || zahl(p.betragText) <= 0);
    if (ohne.length) return `Bei ${ohne.map((p) => p.name).join(', ')} fehlt noch der Betrag. Eintragen oder mit ✕ entfernen.`;
    const anteil = posten.filter((p) => p.geteilt && anteilAusEuro(zahl(p.betragText), p.meinText, zahl) === null);
    if (anteil.length) return `Bei ${anteil.map((p) => p.name).join(', ')}: Trag ein, wie viel davon du zahlst (mehr als 0 € und höchstens der Gesamtbetrag), oder tippe „Doch nicht geteilt“.`;
  }
  if (art === 'ruecklage' && eb.ruecklage.ja) {
    if (isNaN(zahl(eb.ruecklage.betrag)) || zahl(eb.ruecklage.betrag) <= 0) return 'Bitte den Dauerauftrag eintragen oder „Nein“ wählen.';
    if (eb.ruecklage.stand.trim() && isNaN(zahl(eb.ruecklage.stand))) return 'Der Stand ist keine Zahl.';
  }
  if (art === 'sparen' && eb.sparen.ja) {
    if (isNaN(zahl(eb.sparen.betrag)) || zahl(eb.sparen.betrag) <= 0) return 'Bitte die Sparrate eintragen oder „Nein“ wählen.';
    if (eb.sparen.stand.trim() && isNaN(zahl(eb.sparen.stand))) return 'Der Stand ist keine Zahl.';
  }
  if (art === 'budgets') {
    const falsch = eb.budgets.filter((b) => b.an && (isNaN(zahl(b.text || '0')) || zahl(b.text || '0') < 0));
    if (falsch.length) return 'Ein Budget ist keine Zahl.';
    if (eb.budgets.some((b) => b.an && b.neu && !b.name.trim())) return 'Bitte dem eigenen Budget einen Namen geben.';
  }
  return null;
}

export function anwenden(d, eb, zahlFn) {
  const zahl = zahlFn || ((t) => Number(String(t).replace(/[€\s.]/g, '').replace(',', '.')));
  const g = R.gehaltVon(d);
  if (g && eb.gehalt.text.trim() && !isNaN(zahl(eb.gehalt.text))) {
    g.betrag = zahl(eb.gehalt.text);
    g.kommtAn = eb.gehalt.kommtAn;
    if (eb.gehalt.kommtAn === 'Tag') g.ankunftTag = Number(eb.gehalt.tag) || 1;
  }
  const anteilVon = (p) => (p.geteilt ? anteilAusEuro(zahl(p.betragText), p.meinText, zahl) || 100 : 100);
  for (const l of LISTEN) {
    // schon eingetragene Fixkosten: ändern oder löschen
    for (const p of eb.listen[l.id].filter((x) => x.gewaehlt && x.vorhandenId)) {
      const i = d.fixkosten.findIndex((f) => f.id === p.vorhandenId);
      if (i < 0) continue;
      if (p.loeschen) { d.fixkosten.splice(i, 1); continue; }
      if (!(zahl(p.betragText) > 0)) continue;
      const a = anteilVon(p);
      // offener Betrag (v25): erst mit einem neu eingetragenen Betrag ist er geklärt
      if (d.fixkosten[i].offen && zahl(p.betragText) !== d.fixkosten[i].betrag) delete d.fixkosten[i].offen;
      Object.assign(d.fixkosten[i], { betrag: zahl(p.betragText), wieOft: p.wieOft, tag: Number(p.tag) || 1, monat: p.wieOft === 'monatlich' ? null : Number(p.monat) || 1,
        meinAnteil: a, teiltMit: a < 100 ? (p.teiltMit || '').trim() || d.fixkosten[i].teiltMit || null : null, erstattungTag: a < 100 ? d.fixkosten[i].erstattungTag || null : null });
    }
    const neu = eb.listen[l.id].filter((p) => p.gewaehlt && !p.vorhandenId && zahl(p.betragText) > 0);
    if (!neu.length) continue;
    if (!d.kategorien.some((k) => k.id === l.id)) {
      d.kategorien.splice(d.kategorien.filter((k) => k.art === 'fix').length, 0, { id: l.id, name: l.titel, art: 'fix', farbe: l.farbe, emoji: l.emoji });
    }
    for (const p of neu) {
      d.fixkosten.push({ id: D.neueId('fk'), name: String(p.name).trim(), betrag: zahl(p.betragText), wieOft: p.wieOft, tag: Number(p.tag) || 1,
        monat: p.wieOft === 'monatlich' ? null : Number(p.monat) || 1, kategorieId: l.id, abo: !!p.abo,
        meinAnteil: anteilVon(p), teiltMit: anteilVon(p) < 100 ? (p.teiltMit || '').trim() || null : null, endetAm: null, kuendigungsfrist: null });
    }
  }
  // Kategorien, die der Nutzer nicht braucht (nur wenn keine Fixkosten darin stehen)
  for (const [id, weg] of Object.entries(eb.kategorieWeg || {})) {
    if (weg && !d.fixkosten.some((f) => f.kategorieId === id)) d.kategorien = d.kategorien.filter((k) => k.id !== id);
  }
  if (eb.ausgeblendet) d.einstellungen.ausgeblendet = [...new Set(eb.ausgeblendet)];
  for (const e of eb.einnahmen || []) {
    if (!String(e.name).trim() || !(zahl(e.betragText) > 0)) continue;
    d.einnahmen.push({ id: D.neueId('ein'), name: String(e.name).trim(), wieOft: e.wieOft, betrag: zahl(e.betragText), sicher: true, status: e.status, kommtAn: 'sofort',
      selbststaendig: /Selbstständig/.test(e.name), monat: e.wieOft === 'einmalig' ? e.monat : null, ab: e.wieOft === 'monatlich' ? R.ymAus(R.datumText(new Date())) : null, bis: null, istWerte: [] });
  }
  if (eb.ruecklage && eb.ruecklage.ja && zahl(eb.ruecklage.betrag) > 0) {
    const werte = { betrag: zahl(eb.ruecklage.betrag), tag: Number(eb.ruecklage.tag) || 1, stand: zahl(eb.ruecklage.stand || '0') || 0, standDatum: R.datumText(new Date()), standZeit: new Date().toISOString() };
    const rk = d.sparraten.find((x) => x.art === 'ruecklage');
    if (rk) Object.assign(rk, werte); else d.sparraten.push(Object.assign({ id: 'ruecklage', name: 'Rücklagenkonto', art: 'ruecklage', ziel: null }, werte));
  }
  if (eb.sparen.ja && zahl(eb.sparen.betrag) > 0) {
    const werte = { betrag: zahl(eb.sparen.betrag), tag: Number(eb.sparen.tag) || 1, stand: zahl(eb.sparen.stand || '0') || 0, standDatum: R.datumText(new Date()), standZeit: new Date().toISOString() };
    const sp = R.sparratenNormal(d)[0];
    if (sp) Object.assign(sp, werte);
    else d.sparraten.push(Object.assign({ id: 'sparkonto', name: 'Sparkonto', ziel: null }, werte));
  }
  for (const b of eb.budgets) {
    const k = d.kategorien.find((x) => x.id === b.id);
    if (!b.an) {
      if (k && !d.buchungen.some((x) => x.kategorieId === k.id)) d.kategorien = d.kategorien.filter((x) => x !== k);
      else if (k) k.budget = 0;
      continue;
    }
    const betrag = zahl(b.text || '0') || 0;
    if (k) Object.assign(k, { budget: betrag });
    else if (b.name.trim()) d.kategorien.push({ id: D.neueId('kat'), name: b.name.trim(), emoji: (b.emoji || '').trim(), art: 'budget', budget: betrag, symbol: 'sonstiges', schritte: [5, 10, 20], frage: 'Wofür?', chips: [] });
  }
  delete d.beispiel;
  return d;
}

export { SCHRITTE };
