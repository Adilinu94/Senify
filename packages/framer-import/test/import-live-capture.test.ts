import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runImport } from "@senify/framer-import";

// Der dokumentierte offene Punkt auf der veröffentlichten Earn-Seite
// (`docs/current/stand.md`, Zeile „Live-Messung an einer veröffentlichten
// Seite"): die fünf Bewertungssterne stehen NICHT im Server-HTML - dort halten
// fünf leere `display:contents`-Platzhalter, die eine Framer-Code-Komponente
// erst im Browser füllt (`viewBox="0 0 256 256"` im SSR 0-mal, im DOM 5-mal).
//
// Das ist der Fall, für den `capture: "browser"` existiert. Der Test läuft nur,
// wenn die Seite erreichbar ist: sie ist eine fremde, veröffentlichte Adresse
// und kein Fixture, also gehört ein Netzausfall nicht in ein rotes Gate.
// Gemessen am 22.10.2026: statisch 0 Sterne / 8 Icons, im Browser 5 / 13.

const playwright = await import("playwright").catch(() => undefined);
const browserAvailable = (() => {
  if (playwright === undefined) return false;
  try {
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();

const LIVE_URL = "https://distinct-assistant-875072.framer.app";

// Erreichbarkeit vorab prüfen: ohne Netz ist der Test nicht rot, sondern
// übersprungen - er belegt eine Messung, er bewacht sie nicht.
const reachable = await (async (): Promise<boolean> => {
  if (!browserAvailable) return false;
  try {
    const response = await fetch(LIVE_URL, { signal: AbortSignal.timeout(15_000) });
    return response.ok;
  } catch {
    return false;
  }
})();

// `viewBox="0 0 256 256"` ist die Form der Sterne in dieser Seite.
const starSvg = (document: unknown): number => JSON.stringify(document).split("256 256").length - 1;
const iconCount = (document: { nodes: Record<string, { primitive: string }> }): number =>
  Object.values(document.nodes).filter((node) => node.primitive === "icon").length;

describe.skipIf(!reachable)("Browser-Capture an der veröffentlichten Seite", () => {
  it("holt die Bewertungssterne, die im Server-HTML fehlen", async () => {
    const statisch = await runImport({ source: { kind: "url", url: LIVE_URL }, mode: "fidelity" });
    const browser = await runImport({ source: { kind: "url", url: LIVE_URL }, mode: "fidelity", capture: "browser" });

    // Der statische Weg sieht die Platzhalter, aber keine Sterne.
    expect(starSvg(statisch.mapped.document)).toBe(0);
    // Der Browser-Weg sieht sie - fünf Stück.
    expect(starSvg(browser.mapped.document)).toBeGreaterThanOrEqual(5);
    // Und mehr Grafiken insgesamt, weil dieselbe Code-Komponente sie baut.
    expect(iconCount(browser.mapped.document)).toBeGreaterThan(iconCount(statisch.mapped.document));
    // Der Bericht sagt, woher der Lauf kommt.
    expect(browser.document.source.kind).toBe("browser");
    expect(statisch.document.source.kind).toBe("html");
  }, 300_000);
});
