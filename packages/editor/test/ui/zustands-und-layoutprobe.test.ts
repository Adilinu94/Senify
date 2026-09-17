import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Aufgaben 26 und 28, verankert als pruefbares Sollbild in der Vorschau
// (`.scratch/editor-v2-rebuild/ui-preview/index.html`). Die Vorschau braucht
// keinen Dienst und ist damit auch dann messbar, wenn Programm und Engine nicht
// laufen; der Browser wird nur geoeffnet, wenn Playwright samt Chromium da ist
// (dieselbe Vertragslage wie `packages/app/test/support.ts`).
//
// Aufgabe 26: 16 Komponenten x 6 Zustaende = 96 Zellen; jede Zelle ausser Ruhe
//             unterscheidet sich sichtbar von ihrer Ruhezelle -- ausser dort, wo
//             der Zustand nicht vorgesehen ist (Liste unten, im Plan gedeckt).
// Aufgabe 28: 1280 / 1440 / 1920 / schmal (+900 fuer die 1024er-Regel): kein
//             waagerechter Ueberlauf, Statusleiste sichtbar, Buehne scrollt
//             allein, Panels angedockt, der Inspektor sitzt erst unter 1024px
//             unter der Buehne.
//
// Die Messquellen laufen als Zeichenkette im Browser (das Projekt hat keine
// DOM-Bibliothek im tsconfig, dieselbe Loesung wie in
// `packages/app/test/editor-browser.test.ts`).

const playwright = await import("playwright").catch(() => undefined);

const browserAvailable = (() => {
  if (playwright === undefined) return false;
  try {
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();

const preview = new URL(
  "../../../../.scratch/editor-v2-rebuild/ui-preview/index.html",
  import.meta.url,
).href;

const STATES = [
  { key: "ruhe", label: "Ruhe" },
  { key: "hover", label: "Ueberfahren" },
  { key: "aktiv", label: "Aktiv" },
  { key: "fokus", label: "Fokus" },
  { key: "deaktiviert", label: "Deaktiviert" },
  { key: "ausgewaehlt", label: "Ausgewaehlt" },
];

// Zustaende, die der Plan ausnimmt ("ausser dort, wo der Zustand nicht vorgesehen
// ist") beziehungsweise die deshalb gleich aussehen: die Ruhezelle des
// Panel-Tabs zeigt bereits einen ausgewaehlten Tab. Ueberfahren aendert an einem
// Tab nichts (die Tab-Regel setzt `background: transparent` und uebersteuert die
// Zustandsflaeche), und "ausgewaehlt" setzt genau die Lime-Unterkante, die die
// Ruhezelle schon traegt. Der Fokus-Zustand ist seit Runde 60 NICHT mehr dabei:
// er traegt zusaetzlich den 2px-Ring in Lime und unterscheidet sich damit von der
// Auswahl (Aufgabe 24 fordert einen sichtbaren Fokusring in jedem Zustand).
const AUSNAHMEN = [
  "Panel-Tab / hover",
  "Panel-Tab / ausgewaehlt",
];

const BREITEN = [
  { name: "1280", width: 1280, height: 900 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
  { name: "schmal", width: 480, height: 900 },
  { name: "900", width: 900, height: 900 },
];

const VERTRAG =
  ".ed-btn, .ed-iconbtn, .ed-row, .ed-field, .ed-divfield, .ed-tab, .ed-check, " +
  ".ed-switch, .ed-chip, .ed-seg__item, .ed-menu__row, .ed-sel__row, .ed-spot__row";

const STIL_EIGENSCHAFTEN = [
  "backgroundColor",
  "boxShadow",
  "transform",
  "opacity",
  "outline",
  "outlineOffset",
  "color",
  "borderColor",
  "borderTopColor",
];

type MatrixErgebnis = {
  spalten: string[];
  zeilen: number;
  zellen: number;
  zustaende: Record<string, number>;
  unterschiedlich: number;
  identisch: string[];
};

type LayoutErgebnis = {
  breite: number;
  ueberlaufPx: number;
  statusSichtbar: boolean;
  explorerSichtbar: boolean;
  inspectorSichtbar: boolean;
  stageOverflowY: string | null;
  stageScrolltAllein: boolean | null;
  inspectorUnterBuehne: boolean | null;
};

// Aufgabe 29 braucht zwei Werte je Messung: die gespeicherte Breite und den
// tatsaechlich gerenderten Rand (der Rand beweist, dass der Griff dem Zeiger
// folgt und nicht springt).
const PANEL_QUELLE = `(() => {
  const body = document.querySelector(".app__body");
  const explorer = document.querySelector(".app__explorer");
  const inspector = document.querySelector(".app__inspector");
  const rand = (el) => (el ? Math.round(el.getBoundingClientRect().right) : null);
  const breite = (el) => (el ? Math.round(el.getBoundingClientRect().width) : null);
  return {
    breiten: body ? body.getAttribute("data-breiten") : null,
    explorerRand: rand(explorer),
    explorerBreite: breite(explorer),
    inspectorBreite: breite(inspector),
    ueberlaufPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
})()`;

const MATRIX_QUELLE = `(() => {
  const vertrag = ${JSON.stringify(VERTRAG)};
  const eigenschaften = ${JSON.stringify(STIL_EIGENSCHAFTEN)};
  const zeilen = [...document.querySelectorAll("#matrix-ziel tbody tr")];
  const kopf = [...document.querySelectorAll("#matrix-ziel thead th")].map((th) => th.textContent);
  const abbild = (zelle) => {
    const ziele = [...zelle.querySelectorAll(vertrag)];
    const liste = ziele.length > 0 ? ziele : [zelle.firstElementChild ?? zelle];
    return liste.map((ziel) => {
      const s = getComputedStyle(ziel);
      return eigenschaften.map((p) => p + "=" + s[p]).join("|");
    }).join(" # ");
  };
  const unterschiedlich = [];
  const identisch = [];
  for (const zeile of zeilen) {
    const name = zeile.querySelector(".mx__name")?.textContent ?? "?";
    const zellen = [...zeile.querySelectorAll(".mx__cell")];
    const ruhe = zellen.find((z) => z.dataset.state === "ruhe");
    const basis = ruhe ? abbild(ruhe) : "";
    for (const zelle of zellen) {
      if (zelle.dataset.state === "ruhe") continue;
      const eintrag = name + " / " + zelle.dataset.state;
      (abbild(zelle) === basis ? identisch : unterschiedlich).push(eintrag);
    }
  }
  const zustaende = {};
  for (const zelle of document.querySelectorAll("#matrix-ziel .mx__cell")) {
    const zustand = zelle.dataset.state;
    zustaende[zustand] = (zustaende[zustand] ?? 0) + 1;
  }
  return {
    spalten: kopf,
    zeilen: zeilen.length,
    zellen: document.querySelectorAll("#matrix-ziel .mx__cell").length,
    zustaende,
    unterschiedlich: unterschiedlich.length,
    identisch,
  };
})()`;

const LAYOUT_QUELLE = `(() => {
  const sichtbar = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
  };
  const stage = document.querySelector(".app__stage");
  const inspector = document.querySelector(".app__inspector");
  const stageUnten = stage ? stage.getBoundingClientRect().bottom : 0;
  return {
    breite: window.innerWidth,
    ueberlaufPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    statusSichtbar: sichtbar(document.querySelector(".app__status")),
    explorerSichtbar: sichtbar(document.querySelector(".app__explorer")),
    inspectorSichtbar: sichtbar(inspector),
    stageOverflowY: stage ? getComputedStyle(stage).overflowY : null,
    stageScrolltAllein: stage ? stage.scrollHeight >= stage.clientHeight : null,
    inspectorUnterBuehne: inspector
      ? inspector.getBoundingClientRect().top >= stageUnten - 2
      : null,
  };
})()`;

describe.skipIf(!browserAvailable)("Aufgaben 26 und 28 in der Vorschau", () => {
  it(
    "traegt 96 Zustandszellen und jede Zelle unterscheidet sich von der Ruhe",
    async () => {
      const browser = await playwright!.chromium.launch({ headless: true });
      try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
        const tab = await ctx.newPage();
        await tab.goto(preview, { waitUntil: "load" });
        await tab.waitForTimeout(300);
        const ergebnis = (await tab.evaluate(MATRIX_QUELLE)) as MatrixErgebnis;

        // 16 Komponenten, sechs Zustaende, 96 Zellen (Aufgabe 26, Pruefkriterium).
        expect(ergebnis.spalten).toEqual(["Komponente", ...STATES.map((s) => s.label)]);
        expect(ergebnis.zeilen).toBe(16);
        expect(ergebnis.zellen).toBe(96);
        for (const state of STATES) {
          expect(ergebnis.zustaende[state.key], `Spalte ${state.label}`).toBe(16);
        }

        // Jede Zelle ausser Ruhe sichtbar anders; die Ausnahmen sind genau die
        // dokumentierten (eine neue, stille Ausnahme wird rot).
        expect([...ergebnis.identisch].sort()).toEqual([...AUSNAHMEN].sort());
        expect(ergebnis.unterschiedlich).toBe(96 - 16 - AUSNAHMEN.length);
      } finally {
        await browser.close();
      }
    },
    120_000,
  );

  it(
    "haelt das Layout bei 1280 / 1440 / 1920 / schmal und die 1024er-Regel",
    async () => {
      const browser = await playwright!.chromium.launch({ headless: true });
      try {
        for (const bp of BREITEN) {
          const ctx = await browser.newContext({
            viewport: { width: bp.width, height: bp.height },
            deviceScaleFactor: 1,
          });
          const tab = await ctx.newPage();
          const fehler: string[] = [];
          tab.on("console", (m) => {
            if (m.type() === "error") fehler.push(m.text());
          });
          tab.on("pageerror", (e) => fehler.push(`PAGEERROR ${e.message}`));
          await tab.goto(preview, { waitUntil: "load" });
          await tab.waitForTimeout(250);
          const ergebnis = (await tab.evaluate(LAYOUT_QUELLE)) as LayoutErgebnis;

          const wo = `${bp.width}px`;
          expect(ergebnis.ueberlaufPx, `${wo}: waagerechter Ueberlauf`).toBe(0);
          expect(ergebnis.statusSichtbar, `${wo}: Statusleiste`).toBe(true);
          expect(ergebnis.stageOverflowY, `${wo}: Buehne scrollt`).toBe("auto");
          expect(ergebnis.stageScrolltAllein, `${wo}: Buehne scrollt allein`).toBe(true);
          expect(ergebnis.inspectorSichtbar, `${wo}: Inspektor sichtbar`).toBe(true);
          expect(fehler, `${wo}: Konsolenfehler`).toEqual([]);

          if (bp.width >= 1024) {
            // Panels angedockt: der Inspektor steht neben, nicht unter der Buehne.
            expect(ergebnis.explorerSichtbar, `${wo}: Explorer angedockt`).toBe(true);
            expect(ergebnis.inspectorUnterBuehne, `${wo}: Inspektor neben der Buehne`).toBe(false);
          } else {
            // Blatt erst unter 1024px: der Inspektor rutscht unter die Buehne.
            expect(ergebnis.inspectorUnterBuehne, `${wo}: Inspektor unter der Buehne`).toBe(true);
          }
          if (bp.width < 760) {
            // Schmale Form der Vorschau: eine Spalte, der Explorer entfaellt.
            expect(ergebnis.explorerSichtbar, `${wo}: Explorer entfaellt`).toBe(false);
          }
          await ctx.close();
        }
      } finally {
        await browser.close();
      }
    },
    180_000,
  );

  it(
    "verstellt die Panels (200-360 / 260-420), ohne zu springen, und merkt die Breite",
    async () => {
      const browser = await playwright!.chromium.launch({ headless: true });
      try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const tab = await ctx.newPage();
        await tab.goto(preview, { waitUntil: "load" });
        await tab.evaluate("localStorage.clear()");
        await tab.reload({ waitUntil: "load" });
        await tab.waitForTimeout(200);

        type PanelMessung = {
          breiten: string | null;
          explorerRand: number | null;
          explorerBreite: number | null;
          inspectorBreite: number | null;
          ueberlaufPx: number;
        };
        const messen = async (): Promise<PanelMessung> =>
          (await tab.evaluate(PANEL_QUELLE)) as PanelMessung;

        // Standard: 264 / 320 (Aufgabe 29, "Doppelklick setzt den Standard").
        expect((await messen()).breiten).toBe("264x320");

        const griff = tab.locator('.app__split[data-panel="explorer"]');
        const kasten = await griff.boundingBox();
        expect(kasten).not.toBeNull();
        const startX = (kasten?.x ?? 0) + (kasten?.width ?? 0) / 2;
        const y = (kasten?.y ?? 0) + 200;

        await tab.mouse.move(startX, y);
        await tab.mouse.down();
        // Ziehen in kleinen Schritten: der Rand muss dem Zeiger folgen, ohne zu
        // springen (Breite = Zeigerweg, Toleranz 2px).
        await tab.mouse.move(startX + 30, y, { steps: 5 });
        const bei30 = await messen();
        expect(bei30.breiten).toBe("294x320");
        expect(Math.abs((bei30.explorerRand ?? 0) - (startX + 30))).toBeLessThanOrEqual(2);
        await tab.mouse.move(startX + 60, y, { steps: 5 });
        await tab.mouse.up();
        const nach60 = await messen();
        expect(nach60.breiten).toBe("324x320");
        expect(nach60.ueberlaufPx).toBe(0);

        // Obergrenze 360: weiter ziehen aendert nichts mehr.
        await tab.mouse.move(startX + 60, y);
        await tab.mouse.down();
        await tab.mouse.move(startX + 600, y, { steps: 8 });
        await tab.mouse.up();
        expect((await messen()).breiten).toBe("360x320");

        // Untergrenze 200.
        const griffNeu = await griff.boundingBox();
        const x2 = (griffNeu?.x ?? 0) + (griffNeu?.width ?? 0) / 2;
        await tab.mouse.move(x2, y);
        await tab.mouse.down();
        await tab.mouse.move(x2 - 800, y, { steps: 8 });
        await tab.mouse.up();
        expect((await messen()).breiten).toBe("200x320");

        // Inspektor: nach links ziehen vergroessert ihn, Grenze 420.
        const inspGriff = tab.locator('.app__split[data-panel="inspector"]');
        const inspKasten = await inspGriff.boundingBox();
        const inspX = (inspKasten?.x ?? 0) + (inspKasten?.width ?? 0) / 2;
        await tab.mouse.move(inspX, y);
        await tab.mouse.down();
        await tab.mouse.move(inspX - 40, y, { steps: 5 });
        await tab.mouse.up();
        expect((await messen()).breiten).toBe("200x360");
        expect((await messen()).ueberlaufPx).toBe(0);

        // Doppelklick auf die Trennkante setzt den Standard des Feldes, an dem
        // die Kante sitzt (der Inspektor behaelt seine gezogene Breite).
        await griff.dblclick();
        expect((await messen()).breiten).toBe("264x360");

        // Tastatur: Pfeil rechts verbreitert um 8px (ohne Zeiger erreichbar).
        await griff.focus();
        await tab.keyboard.press("ArrowRight");
        expect((await messen()).breiten).toBe("272x360");

        // Die Breiten ueberleben ein Neuladen.
        await tab.reload({ waitUntil: "load" });
        await tab.waitForTimeout(200);
        expect((await messen()).breiten).toBe("272x360");
        expect((await messen()).ueberlaufPx).toBe(0);

        await ctx.close();
      } finally {
        await browser.close();
      }
    },
    180_000,
  );
});
