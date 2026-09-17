// Funktionspruefung der Zusatzbausteine in der Vorschau (Aufgabe 31, Belegpflicht).
// Prueft die Bausteine aus ui-plan.md Abschnitt 6 und 7 durch echte Bedienung.
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const preview = resolve(".scratch", "editor-v2-rebuild", "ui-preview", "index.html");
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const tab = await ctx.newPage();

const konsole = [];
tab.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
tab.on("pageerror", (e) => konsole.push(`PAGEERROR ${e.message}`));

await tab.goto(pathToFileURL(preview).href, { waitUntil: "load" });
await tab.waitForTimeout(350);

const ergebnis = await tab.evaluate(async () => {
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  const e = {};
  const pos = document.getElementById('position');
  const wert = document.getElementById('einrastwert');
  const input = () => pos.dispatchEvent(new Event('input', { bubbles: true }));

  /* Raster 4px: mehrere Rohwerte muessen auf Vielfachen von 4 landen */
  const werte = [];
  for (const roh of [1, 3, 7, 9, 13, 37]) {
    pos.value = String(roh);
    input();
    werte.push(`${roh}-${wert.textContent}`);
  }
  e.einrasten = werte;
  e.einrastenAlleVielfache = werte.every((p) => Number(p.split('-')[1]) % 4 === 0);

  /* Schalter: aus, dann wieder an */
  document.getElementById('einrastschalter').click();
  pos.value = '7';
  input();
  e.ohneEinrasten = wert.textContent;
  document.getElementById('einrastschalter').click();
  pos.value = '7';
  input();
  e.mitEinrasten = wert.textContent;

  /* Rasterhilfe: 1px, gestrichelt, nicht skalierend */
  const pfad = document.querySelector('#raster .ed-gridoverlay path');
  e.rasterStrich = getComputedStyle(pfad).strokeDasharray;
  e.rasterStrichBreite = getComputedStyle(pfad).strokeWidth;
  e.rasterNonScaling = pfad.getAttribute('vector-effect');

  /* Baender: Aussen 24, Innen 12 */
  e.aussenbandHoehe = Math.round(document.querySelector('.ed-band--margin').getBoundingClientRect().height);
  e.innenbandHoehe = Math.round(document.querySelector('.ed-band--padding').getBoundingClientRect().height);

  /* Medien: Seitenverhaeltnis 21 zu 9, Werkzeugstreifen steht */
  const flaeche = document.querySelector('.ed-media__area').getBoundingClientRect();
  e.medienVerhaeltnis = Math.round((flaeche.width / flaeche.height) * 100) / 100;
  e.medienWerkzeuge = document.querySelectorAll('.ed-media__tool').length;
  e.medienWarnung = !!document.querySelector('.ed-media__warn');

  /* Typografie-Gruppe: zu, dann offen */
  e.typoZu = Math.round(document.querySelector('.ed-typo__more').getBoundingClientRect().height);
  document.getElementById('typomore').click();
  e.typoOffen = Math.round(document.querySelector('.ed-typo__more').getBoundingClientRect().height) > 0;
  e.typoZaehler = document.querySelector('.ed-typo__head .ed-chip').textContent.trim();

  /* Bedingung: leere Zeile traegt Text, nicht nur Farbe */
  const leer = [...document.querySelectorAll('.ed-cond__row .ed-field')]
    .some((f) => f.textContent.includes('Keine Bedingung'));
  e.leereBedingungMitText = leer;
  e.bedingungSegment = document.querySelectorAll('.ed-cond .ed-seg__item').length;

  /* Mehrfachauswahl */
  const zeilen = document.querySelectorAll('.ed-multi__row');
  const chip = document.getElementById('mehrfachchip');
  e.mehrfachVorher = chip.textContent.trim();
  zeilen[0].click();
  e.mehrfachNachher = chip.textContent.trim();
  e.mehrfachKaestchen = document.querySelectorAll('.ed-multi__row .ed-lead').length;

  /* Geraeteumschaltung */
  const rahmen = document.getElementById('devframe');
  const elternBreite = rahmen.parentElement.getBoundingClientRect().width;
  document.querySelector('#geraet .ed-seg__item[data-w="1024"]').click();
  e.geraetName = document.getElementById('devname').textContent.trim();
  e.geraetBreite = document.getElementById('devwidth').textContent.trim();
  await warte(340);
  e.geraetAnteil = Math.round((rahmen.getBoundingClientRect().width / elternBreite) * 100);
  document.querySelector('#geraet .ed-seg__item[data-w="390"]').click();
  await warte(340);
  e.geraetAnteil390 = Math.round((rahmen.getBoundingClientRect().width / elternBreite) * 100);
  e.geraetStationen = document.querySelectorAll('#geraet .ed-seg__item').length;

  /* Kontextmenue am Element: schliessen, oeffnen, Escape */
  const toggle = document.getElementById('menutoggle');
  const menu = document.getElementById('elemmenu');
  toggle.click();
  e.menueGeschlossen = menu.hidden === true && document.activeElement === toggle;
  toggle.click();
  e.menueOffen = menu.hidden === false && menu.contains(document.activeElement);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  e.escapeZurueck = menu.hidden === true && document.activeElement === toggle;

  /* Stil kopieren und einfuegen */
  const paste = document.getElementById('stilpaste');
  e.einfuegenZunaechstGesperrt = paste.getAttribute('aria-disabled') === 'true';
  document.getElementById('stilcopy').click();
  e.einfuegenFreiDanach = paste.getAttribute('aria-disabled') === 'false';
  paste.click();
  e.einfuegenMeldung = document.getElementById('stiltext').textContent.includes('eingefuegt');

  return e;
});

await browser.close();
const bericht = { ergebnis, konsole, fehler: konsole.length };
writeFileSync(join(".scratch", "refs", "nick", "ui", "pruefung-runde80-funktionen.json"),
  JSON.stringify(bericht, null, 2));
console.log(JSON.stringify(bericht, null, 2));
