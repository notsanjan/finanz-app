// Speichern, Laden, Sicherung. In der App über das native Plugin "FinanzSpeicher"
// (Android SharedPreferences, dieselben Daten liest und schreibt das Widget),
// im Browser zum Testen über localStorage.

export const FORMAT = 'finanz-app';
export const VERSION = 1;
const SCHLUESSEL = 'finanz.daten';

function plugin() {
  const c = typeof window !== 'undefined' ? window.Capacitor : null;
  if (c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins.FinanzSpeicher) return c.Plugins.FinanzSpeicher;
  return null;
}
export function istNativ() { return !!plugin(); }

export function neueId(vorsilbe = 'id') {
  return vorsilbe + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

// Kategorien, die es immer gibt (Farben aus dem Mockup)
export function grundKategorien() {
  return [
    { id: 'wohnen', name: 'Wohnen', art: 'fix', farbe: '#7fd6c8', emoji: '🏠' },
    { id: 'abos', name: 'Handy und Abos', art: 'fix', farbe: '#4f9a8e', emoji: '📱' },
    { id: 'versicherungen', name: 'Versicherungen', art: 'fix', farbe: '#c9d27a', emoji: '🛡️' },
    { id: 'lebensmittel', name: 'Lebensmittel', art: 'budget', budget: 300, emoji: '🛒', symbol: 'wagen', schritte: [-5, 5, 10], frage: 'Wo?', chips: ['Edeka', 'Bäcker', 'dm', 'Wochenmarkt'] },
    { id: 'tanken', name: 'Tanken', art: 'budget', budget: 150, emoji: '⛽', symbol: 'tanken', schritte: [10, 50], frage: 'Wo?', chips: ['Aral', 'Shell', 'Jet'] },
    { id: 'freizeit', name: 'Freizeit', art: 'budget', budget: 120, emoji: '🎉', symbol: 'freizeit', schritte: [5, 10, 20], frage: 'Wofür?', chips: ['Kino', 'Essen gehen', 'Sport'] },
    { id: 'sonstiges', name: 'Sonstiges', art: 'budget', budget: 0, emoji: '🧾', symbol: 'sonstiges', schritte: [5, 20], frage: 'Wofür?', chips: ['Geschenke', 'Haushalt', 'Kleidung', 'Apotheke'] }
  ];
}

export function leereDaten(heute = new Date()) {
  const s = heute.getFullYear() + '-' + String(heute.getMonth() + 1).padStart(2, '0');
  return {
    format: FORMAT,
    version: VERSION,
    einstellungen: { startMonat: s },
    kategorien: grundKategorien().map((k) => (k.art === 'budget' ? Object.assign(k, { budget: 0 }) : k)),
    fixkosten: [],
    einnahmen: [
      { id: 'gehalt', name: 'Gehalt', wieOft: 'monatlich', betrag: 0, sicher: false, kommtAn: 'Monatsende', selbststaendig: false, istWerte: [] }
    ],
    sparraten: [],
    buchungen: [],
    wuensche: []
  };
}

// Beispiel wie im Mockup, damit man die App sofort ausprobieren kann
export function beispielDaten(heute = new Date()) {
  const d = leereDaten(heute);
  const f = (name, betrag, wieOft, tag, monat, kategorieId, extra = {}) =>
    Object.assign({ id: neueId('fk'), name, betrag, wieOft, tag, monat, kategorieId, abo: false, meinAnteil: 100, endetAm: null, kuendigungsfrist: null }, extra);
  d.fixkosten = [
    f('Miete (mein Anteil)', 520, 'monatlich', 1, null, 'wohnen'),
    f('Strom', 45, 'monatlich', 15, null, 'wohnen'),
    f('Internet', 20, 'monatlich', 3, null, 'wohnen'),
    f('Rundfunkbeitrag', 55, 'vierteljaehrlich', 15, 2, 'wohnen'),
    f('Handy', 15, 'monatlich', 28, null, 'abos'),
    f('Netflix', 14, 'monatlich', 12, null, 'abos', { abo: true }),
    f('Cloud-Speicher', 30, 'jaehrlich', 1, 7, 'abos', { abo: true }),
    f('Haftpflicht', 65, 'jaehrlich', 1, 1, 'versicherungen'),
    f('Kfz-Versicherung', 480, 'jaehrlich', 1, 3, 'versicherungen'),
    f('Hausrat', 90, 'jaehrlich', 1, 10, 'versicherungen')
  ];
  d.kategorien = grundKategorien();
  d.einnahmen[0].betrag = 2400;
  const naechster = (() => { const x = new Date(heute); x.setMonth(x.getMonth() + 1); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); })();
  d.einnahmen.push({ id: 'ein-beispiel', name: '💼 Nebenjob', wieOft: 'einmalig', monat: naechster, betrag: 300, sicher: true, status: 'geplant', selbststaendig: false, istWerte: [] });
  const monat = d.einstellungen.startMonat;
  d.sparraten = [
    { id: 'sparkonto', name: 'Sparkonto', betrag: 200, tag: 1, stand: 2050, standDatum: monat + '-01', ziel: null },
    { id: 'ruecklage', name: 'Rücklagenkonto', art: 'ruecklage', betrag: 75, tag: 1, stand: 420, standDatum: monat + '-01', ziel: null }
  ];
  d.wuensche = [{ id: 'wunsch-starlink', name: '🛰️ Starlink', preis: 300, monat: null, kategorieId: null, status: 'geplant' }];
  d.beispiel = true;
  return d;
}

// Fehlende Teile ergänzen, damit ältere oder unvollständige Dateien laden
export function vervollstaendigen(d) {
  const leer = leereDaten();
  const out = Object.assign({}, leer, d);
  out.format = FORMAT;
  out.einstellungen = Object.assign({}, leer.einstellungen, d.einstellungen || {});
  for (const k of ['kategorien', 'fixkosten', 'einnahmen', 'sparraten', 'buchungen', 'wuensche']) if (!Array.isArray(out[k])) out[k] = leer[k];
  if (!out.einnahmen.some((e) => e.id === 'gehalt') && !out.einnahmen.some((e) => e.wieOft === 'monatlich' && !e.status)) out.einnahmen.unshift(leer.einnahmen[0]);
  for (const e of out.einnahmen) if (!Array.isArray(e.istWerte)) e.istWerte = [];
  return out;
}

export function pruefeImport(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { return { ok: false, fehler: 'Die Datei ist keine gültige Sicherung (kein JSON).' }; }
  if (!d || d.format !== FORMAT) return { ok: false, fehler: 'Die Datei ist keine Sicherung der Finanz-App.' };
  if ((d.version || 1) > VERSION) return { ok: false, fehler: 'Die Sicherung stammt aus einer neueren App-Version. Bitte zuerst die App aktualisieren.' };
  return { ok: true, daten: vervollstaendigen(d) };
}

export async function laden() {
  const p = plugin();
  let text = null;
  if (p) { const r = await p.laden(); text = r && r.daten; }
  else { try { text = localStorage.getItem(SCHLUESSEL); } catch (e) { text = null; } }
  if (!text) return null;
  try { return vervollstaendigen(JSON.parse(text)); } catch (e) { return null; }
}

export async function speichern(daten) {
  const text = JSON.stringify(daten);
  const p = plugin();
  if (p) { await p.speichern({ daten: text }); return; }
  try { localStorage.setItem(SCHLUESSEL, text); } catch (e) { /* Browser ohne Speicher */ }
}

// Sicherung als Datei: in der App in den Ordner "Downloads", im Browser als Download
export async function exportieren(daten, dateiname) {
  const text = JSON.stringify(daten, null, 1);
  const p = plugin();
  if (p) { const r = await p.exportieren({ dateiname, inhalt: text }); return r && r.pfad ? r.pfad : 'Downloads/' + dateiname; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = dateiname;
  document.body.appendChild(a); a.click(); a.remove();
  return 'Downloads/' + dateiname;
}

export function beiRueckkehr(fn) {
  const p = plugin();
  if (p && p.addListener) p.addListener('fortgesetzt', fn);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') fn(); });
}
