/* Dunkelmodus-Nachweis: Dokumenttinte in der Bühne und native Auswahllisten.
   Aufruf: node .scratch/editor-v2-rebuild/pruef-dunkelmodus.mjs

   Gemessen wird, nicht geschätzt:
   1. Für jedes Element mit eigenem Text im Dokument (`.site`) wird die Tinte
      gegen die wirksame Fläche (nächster Vorfahr mit undurchsichtigem
      Hintergrund) gerechnet — Verhältnis nach WCAG.
   2. Für jedes `select` wird Feldfläche, Tinte und `color-scheme` ausgegeben.
*/

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";

const dir = resolve(".scratch/editor-v2-rebuild/ui-preview");
const target = pathToFileURL(join(dir, "index.html")).href;
const browser = await chromium.launch();
const result = {};

const ROUTES = [
  ["editor", "#/editor"],
  ["cms-eintrag", "#/cms/blog"],
  ["medien-dialog", "#/media"],
  ["referenzen", "#/references"],
  ["einstellungen", "#/settings"],
  ["start", "#/"],
];

/* Beide Modi: die Korrektur an Rand und Füllung der Formularelemente wirkt
   auch im hellen Modus — also wird er mitgeprüft, nicht nur behauptet. */
for (const mode of ["dark", "light"]) {
for (const [name, hash] of ROUTES) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(target, { waitUntil: "load" });
  await page.evaluate((m) => window.SENIFY_APP.setMode(m), mode);
  await page.evaluate((h) => { location.hash = h; }, hash);

  /* Dialoge: die nativen Auswahllisten sitzen dort. Über die echten
     Handlungen öffnen, nicht über erfundene Klassen. */
  if (name === "medien-dialog") {
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('[data-act="generate-image"]')?.click());
  }
  if (name === "cms-eintrag") {
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('[data-act="open-entry"]')?.click());
  }
  await page.waitForTimeout(400);

  result[`${mode}/${name}`] = await page.evaluate(() => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const l1 = lum(a), l2 = lum(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const mix = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });
    const surfaceOf = (el) => {
      let n = el, c = { r: 255, g: 255, b: 255, a: 1 };
      const stack = [];
      while (n && n !== document.documentElement) {
        const cs = getComputedStyle(n);
        const col = parse(cs.backgroundColor);
        if (col && col.a > 0) stack.push(col);
        n = n.parentElement;
      }
      for (let i = stack.length - 1; i >= 0; i -= 1) c = mix(stack[i], c);
      return c;
    };
    const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    const ownText = (el) =>
      Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();

    /* 1 — Dokument */
    const doc = document.querySelector(".site");
    const docRows = [];
    if (doc) {
      doc.querySelectorAll("*").forEach((el) => {
        const t = ownText(el);
        if (!t) return;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        const cs = getComputedStyle(el);
        const fg = parse(cs.color);
        const bg = surfaceOf(el);
        const txt = mix(fg, bg);
        const v = ratio(txt, bg);
        const size = parseFloat(cs.fontSize);
        const weight = parseInt(cs.fontWeight, 10) || 400;
        const gross = size >= 24 || (size >= 18.66 && weight >= 700);
        docRows.push({
          el: (el.className || el.tagName).toString().split(/\s+/)[0],
          text: t.slice(0, 16),
          ink: hex(txt),
          surface: hex(bg),
          verhaeltnis: Math.round(v * 100) / 100,
          soll: gross ? 3 : 4.5,
        });
      });
    }
    /* Der Wurzelknoten selbst trägt die Fläche. */
    const docRoot = doc ? { bg: hex(surfaceOf(doc)), farbe: hex(mix(parse(getComputedStyle(doc).color), surfaceOf(doc))) } : null;
    const docFail = doc ? docRows.filter((r) => r.verhaeltnis < r.soll) : [];

    /* 2 — native Auswahllisten */
    const selects = [];
    document.querySelectorAll("select").forEach((s, i) => {
      const cs = getComputedStyle(s);
      const bg = parse(cs.backgroundColor);
      const durchsichtig = !bg || bg.a === 0;
      /* Das Element malt seine Fläche selbst, wenn sie undurchsichtig ist —
         genau das war der Fehler: weißes Feld unter dunkler Tinte. */
      const surface = durchsichtig ? surfaceOf(s.parentElement) : mix(bg, surfaceOf(s.parentElement));
      const ink = parse(cs.color);
      selects.push({
        nr: i + 1,
        optionen: s.options.length,
        eigeneFlaeche: durchsichtig ? "durchsichtig" : hex(bg),
        flaeche: hex(surface),
        tinte: hex(ink),
        verhaeltnis: Math.round(ratio(mix(ink, surface), surface) * 100) / 100,
        colorScheme: cs.colorScheme,
      });
    });
    const selectFail = selects.filter((s) => s.verhaeltnis < 4.5);

    return {
      dokument: {
        wurzel: docRoot,
        geprueft: docRows.length,
        verstoesse: docFail.length,
        schlechteste: docRows.sort((a, b) => a.verhaeltnis - b.verhaeltnis).slice(0, 5),
        alle: docFail.slice(0, 8),
      },
      auswahllisten: {
        anzahl: selects.length,
        verstoesse: selectFail.length,
        beispiele: selects.slice(0, 6),
      },
      dokumentColorScheme: doc ? getComputedStyle(doc).colorScheme : "—",
      wurzelColorScheme: getComputedStyle(document.documentElement).colorScheme,
      /* Die aufklappende Liste selbst lässt sich in Chromium nicht
         aufnehmen; gemessen wird, welche Ansage das Feld macht — daran
         hängt die native Ebene. */
      listColorScheme: document.querySelector("select")
        ? getComputedStyle(document.querySelector("select")).colorScheme
        : "—",
    };
  });
  await page.close();
}
}

await browser.close();

/* Kurzfassung + Rückgabe */
let fehler = 0;
for (const [name, r] of Object.entries(result)) {
  fehler += r.dokument.verstoesse + r.auswahllisten.verstoesse;
  console.log(
    `${name.padEnd(22)} Dokument ${String(r.dokument.verstoesse).padStart(2)} Verstoß(e) · ` +
    `Auswahllisten ${String(r.auswahllisten.verstoesse).padStart(2)} Verstoß(e) von ${String(r.auswahllisten.anzahl).padStart(2)} · ` +
    `color-scheme Wurzel ${r.wurzelColorScheme} / Dokument ${r.dokumentColorScheme} / Feld ${r.listColorScheme}`,
  );
}
console.log("\n--- vollständig ---\n" + JSON.stringify(result, null, 2));
process.exit(fehler === 0 ? 0 : 1);
