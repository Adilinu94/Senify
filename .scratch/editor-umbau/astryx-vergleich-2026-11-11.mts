/* Paket E: Dialog-Vergleich Senify (native <dialog>, askConfirm) gegen Astryx (Dialog, 0.7.13).
   Reines Messwerkzeug unter .scratch, kein Produktcode. Der Astryx-Prototyp liegt ausserhalb des Repos
   (siehe astryx-probe-2026-11-11.md) und wird hier nur gestartet und gemessen.
   Senify-Seite: askConfirm aus /app-core.js, aufgerufen von einem Test-Knopf, den das Skript in die Seite legt. */
import { spawn } from "node:child_process";
import { startSenify } from "./elementor-live/senify-lib.mts";

const PROBE = "C:/Users/adini/.codex/visualizations/2026/11/04/01a1a6ea-a65c-7161-89e3-b25fdcb81c75/astryx-probe";
const LANG = "Donaudampfschifffahrtsgesellschaftskapitaensmuetze-Hauptueberschrift-Klasse mit sehr langem Namen";

type Page = import("playwright").Page;

const AKTIV = `(() => { const a = document.activeElement; if (!a) return "none"; const t = (a.getAttribute("aria-label") || a.textContent || a.id || "").trim().replace(/\\s+/g, " ").slice(0, 30); return a.tagName.toLowerCase() + ":" + t; })()`;
const DIALOG_INFO = (sel: string) => `(() => {
  const d = document.querySelector(${JSON.stringify(sel)});
  if (!d) return null;
  const labelled = d.getAttribute("aria-labelledby");
  const name = d.getAttribute("aria-label") || (labelled ? (document.getElementById(labelled)?.textContent || "") : "");
  const r = d.getBoundingClientRect();
  return { tag: d.tagName.toLowerCase(), role: d.getAttribute("role"), modal: d.getAttribute("aria-modal"), name: name.trim(), nativeOpen: d.open === true,
    box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], overflowX: d.scrollWidth > d.clientWidth + 1 };
})()`;
const KONTRAST = (sel: string) => `(() => {
  const d = document.querySelector(${JSON.stringify(sel)});
  if (!d) return null;
  const parse = (c) => { const m = c.match(/[\\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0]; };
  const lum = (c) => { const [r, g, b] = parse(c).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const bgOf = (el) => { for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (parse(c)[3] !== 0 && c !== "rgba(0, 0, 0, 0)") return c; } return "rgb(255, 255, 255)"; };
  const heading = d.querySelector("h2") || d;
  const fg = getComputedStyle(heading).color, bg = bgOf(heading);
  const a = lum(fg), b = lum(bg);
  return { fg, bg, ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 };
})()`;

type Ziel = {
  name: string;
  page: Page;
  dialogSel: string;
  oeffnen: (lang?: boolean) => Promise<void>;
  openerSel: string;
  istOffen: () => Promise<boolean>;
  dunkel: () => Promise<void>;
  hell: () => Promise<void>;
  ergebnis: () => Promise<string>;
};

async function messen(z: Ziel): Promise<Record<string, unknown>> {
  const { page } = z;
  const out: Record<string, unknown> = { ziel: z.name };
  const opener = page.locator(z.openerSel);
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Oeffnen per Tastatur, Startfokus, Rollen.
  await opener.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  out["startfokus"] = await page.evaluate(AKTIV);
  out["dialog"] = await page.evaluate(DIALOG_INFO(z.dialogSel));

  // 2. Fokusfalle: sechsmal Tab, bleibt der Fokus im Dialog?
  const tabs: string[] = [];
  let imDialog = true;
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    tabs.push(await page.evaluate(AKTIV));
    imDialog = imDialog && (await page.evaluate(`!!document.activeElement && !!document.activeElement.closest(${JSON.stringify(z.dialogSel)})`)) as boolean;
  }
  out["tab"] = tabs;
  out["fokusBleibtImDialog"] = imDialog;
  const shiftTab: string[] = [];
  await page.keyboard.press("Shift+Tab");
  shiftTab.push(await page.evaluate(AKTIV));
  out["shiftTab"] = shiftTab;

  // 3. Escape schliesst, Fokus kehrt zurueck.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  out["escSchliesst"] = !(await z.istOffen());
  out["fokusNachEsc"] = await page.evaluate(AKTIV);

  // 4. Klick auf den Hintergrund.
  await opener.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  await page.mouse.click(3, 3);
  await page.waitForTimeout(400);
  out["hintergrundKlickSchliesst"] = !(await z.istOffen());
  if (await z.istOffen()) await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 5. Enter auf dem Startfokus einer Loeschfrage: darf nicht loeschen.
  await opener.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  out["enterAufStartfokus"] = { offenDanach: await z.istOffen(), ergebnis: await z.ergebnis() };
  if (await z.istOffen()) await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 6. Schmale Ansicht und langer deutscher Name.
  for (const [label, w, h] of [["390x844", 390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await z.oeffnen(true);
    await page.waitForTimeout(500);
    const info = (await page.evaluate(DIALOG_INFO(z.dialogSel))) as { box: number[]; overflowX: boolean } | null;
    const seitenUeberlauf = (await page.evaluate("document.documentElement.scrollWidth - window.innerWidth")) as number;
    out[`lang_${label}`] = {
      box: info?.box,
      imViewport: info !== null && info.box[0]! >= 0 && info.box[2]! <= w && info.box[3]! <= h,
      textUeberlauf: info?.overflowX,
      ueberschrift: await page.evaluate(`(() => { const d = document.querySelector(${JSON.stringify(z.dialogSel)}); const h = d && d.querySelector("h2"); if (!h) return null; const r = h.getBoundingClientRect(); const dr = d.getBoundingClientRect(); return { rechts: Math.round(r.right), dialogRechts: Math.round(dr.right), scrollW: h.scrollWidth, clientW: h.clientWidth, umbruch: getComputedStyle(h).overflowWrap }; })()`),
      seitenUeberlauf,
    };
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // 7. Dunkel: Kontrast der Ueberschrift im Dialog.
  await z.oeffnen();
  await page.waitForTimeout(300);
  out["kontrastHell"] = await page.evaluate(KONTRAST(z.dialogSel));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await z.dunkel();
  await z.oeffnen();
  await page.waitForTimeout(300);
  out["kontrastDunkel"] = await page.evaluate(KONTRAST(z.dialogSel));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await z.hell();
  return out;
}

const astryx = spawn("node", ["serve.mjs"], { cwd: PROBE, stdio: ["ignore", "pipe", "inherit"] });
const url = await new Promise<string>((resolve, reject) => {
  astryx.stdout.on("data", (b: Buffer) => { const m = /URL=(\S+)/.exec(String(b)); if (m) resolve(m[1]!); });
  setTimeout(() => reject(new Error("Astryx-Server startet nicht")), 15000);
});

const s = await startSenify();
const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
try {
  // Senify: Test-Knopf legt die Frage mit askConfirm vor.
  const sPage = s.tab;
  await sPage.evaluate(`(() => {
    const b = document.createElement("button");
    b.id = "ast-opener"; b.type = "button"; b.textContent = "Klasse loeschen";
    b.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9999";
    b.addEventListener("click", async () => {
      const { askConfirm } = await import("/app-core.js");
      const lang = window.__astLang;
      const ok = await askConfirm({ title: (lang ? lang : "titel") + " loeschen?", message: "Dieser Versuch veraendert keine Senify-Projekte.", confirmLabel: "Loeschen", danger: true });
      window.__astErgebnis = ok ? "geloescht" : "nicht geloescht";
    });
    document.body.append(b);
  })()`);
  const senifyZiel: Ziel = {
    name: "Senify askConfirm (native dialog)",
    page: sPage,
    dialogSel: "dialog.ask-dialog",
    openerSel: "#ast-opener",
    oeffnen: async (lang) => {
      await sPage.evaluate(`window.__astLang = ${lang ? JSON.stringify(LANG) : "null"}`);
      await sPage.locator("#ast-opener").click();
      await sPage.waitForSelector("dialog.ask-dialog[open]");
    },
    istOffen: async () => (await sPage.locator("dialog.ask-dialog[open]").count()) > 0,
    dunkel: async () => { await sPage.evaluate("document.documentElement.setAttribute('data-mode', 'dark')"); },
    hell: async () => { await sPage.evaluate("document.documentElement.setAttribute('data-mode', 'light')"); },
    ergebnis: async () => (await sPage.evaluate("window.__astErgebnis || 'keins'")) as string,
  };
  const senifyOut = await messen(senifyZiel);

  const aPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await aPage.goto(url);
  await aPage.waitForSelector("#classname");
  const dialogSel = "[role=dialog], dialog[open]";
  const astryxZiel: Ziel = {
    name: "Astryx Dialog 0.7.13",
    page: aPage,
    dialogSel,
    openerSel: "button:has-text('Klasse')",
    oeffnen: async (lang) => {
      if (lang) await aPage.fill("#classname", LANG);
      await aPage.locator("button:has-text('Klasse')").click();
      await aPage.waitForSelector(dialogSel);
    },
    istOffen: async () => (await aPage.locator(dialogSel).count()) > 0,
    dunkel: async () => { await aPage.locator("button.theme-switch").click(); },
    hell: async () => { await aPage.locator("button.theme-switch").click(); },
    ergebnis: async () => ((await aPage.locator("p.status").textContent()) ?? "").trim(),
  };
  const astryxOut = await messen(astryxZiel);
  console.log(JSON.stringify([senifyOut, astryxOut], null, 2));
} finally {
  astryx.kill();
  await browser.close();
  await s.close();
}
