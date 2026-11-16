import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// Die vier DOM-Widgets aus der Framer-Quelle (ADR-0038) im echten Browser: Der
// Canvas rendert den Server-Inhalt, die Injection lädt je Typ den Kern aus
// `/api/widget-module?type=…`, der Host mountet und das Mobilmenü reagiert.

const HARNESS = `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><title>Framer-Widgets</title></head>
<body style="margin:0">
  <div id="canvas-host" style="width:1500px;height:900px"></div>
  <script type="module">
    import { EditorStore, createRegistry, mountCanvas } from "/editor.js";

    const initialDocument = {
      version: 2,
      rootNodeId: "root000001",
      nodes: {
        root000001: { id: "root000001", primitive: "root", props: {}, children: ["nav000001", "avatar000001", "button000001", "stats000001", "viewall000001", "step000001", "rev000001", "foot000001"] },
        nav000001: { id: "nav000001", primitive: "framer-navbar", props: {
          brand: "NICK WEBDESIGN", logo: "", email: "hello@example.com",
          ctaLabel: "WhatsApp", ctaLink: "https://example.com/whatsapp"
        } },
        avatar000001: { id: "avatar000001", primitive: "framer-avatar-info", props: {
          name: "Adrian Nick", role: "Webdesigner, Entwickler", avatar: "", social: []
        } },
        button000001: { id: "button000001", primitive: "framer-button", props: {
          label: "Projekt anfragen", link: "/projects", variant: "primary"
        } },
        stats000001: { id: "stats000001", primitive: "framer-stats", props: {
          speed: 65, items: [
            { value: "11+", label: "Jahre Erfahrung" },
            { value: "95%", label: "Weiterempfehlungsrate" }
          ]
        } },
        viewall000001: { id: "viewall000001", primitive: "framer-view-all", props: {
          label: "Alle Referenzen ansehen", link: "/projects"
        } },
        step000001: { id: "step000001", primitive: "framer-step", props: {
          nr: "07", title: "SEO", text: "Bessere Sichtbarkeit.",
          points: [{ label: "Klare Texte:", text: "Verständlich." }]
        } },
        rev000001: { id: "rev000001", primitive: "framer-reviews", props: {
          speed: 60,
          items: [
            { rating: "4.5", author: "Markus B.", quote: "Sehr gut.", avatar: "" },
            { rating: "5.0", author: "Julia S.", quote: "Top Arbeit.", avatar: "" }
          ]
        } },
        foot000001: { id: "foot000001", primitive: "framer-footer", props: {
          avatar: "", logo: "", email: "hello@example.com"
        } }
      },
      styleRules: []
    };

    const store = new EditorStore({ document: initialDocument });
    const canvas = mountCanvas(document.getElementById("canvas-host"), {
      store,
      registry: createRegistry(),
    });
    canvas.setMode("live");
    globalThis.__canvas = canvas;
    globalThis.__store = store;
    globalThis.__ready = true;
  </script>
</body>
</html>`;

type WidgetProbe = {
  states: Record<string, string | null>;
  navbar: string;
  footer: string;
  reviews: string;
  step: string;
  avatar: string;
  button: string;
  stats: string;
  viewAll: string;
  reviewCards: number;
  panelHidden: boolean;
  formFrames: number;
  formLoaded: boolean;
};

describe.skipIf(!browserAvailable)("framer DOM widgets in the editor", () => {
  it("mounts all eight widgets, renders their content and opens the mobile menu", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-framer-widgets-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    const browser = await chromium.launch({ headless: true });
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    try {
      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(30000);
      tab.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(`console: ${message.text()}`);
      });
      tab.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
      const isFavicon = (url: string): boolean => url.endsWith("/favicon.ico");
      tab.on("requestfailed", (request) => {
        if (isFavicon(request.url())) return;
        failedRequests.push(`failed: ${request.url()} (${request.failure()?.errorText ?? "?"})`);
      });
      tab.on("response", (response) => {
        if (response.status() < 400 || isFavicon(response.url())) return;
        failedRequests.push(`http ${response.status()}: ${response.url()}`);
      });

      await tab.route(
        (url) => url.pathname === "/",
        (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: HARNESS }),
      );
      await tab.route("https://embed.fillout.com/**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: "<!doctype html><html><body>Fillout-Testformular</body></html>",
        }),
      );
      await tab.goto(`${running.dashboardUrl}/`, { waitUntil: "load" });
      await tab.waitForFunction("window.__ready === true");

      const frameFor = async (device: "desktop" | "mobile") =>
        tab.locator(`.senify-canvas__frame[data-device="${device}"] .senify-canvas__iframe`).contentFrame();

      const waitMounted = async (device: "desktop" | "mobile") => {
        const frame = await frameFor(device);
        await frame.locator('[data-island="widget"]').first().waitFor();
        await frame.locator('[data-widget-state="mounted"]').nth(7).waitFor();
        return frame;
      };

      const probe = (frame: Awaited<ReturnType<typeof frameFor>>): Promise<WidgetProbe> =>
        frame.locator("body").evaluate((body) => {
          // Der Test läuft ohne DOM-Lib im Typecheck; die Struktur reicht.
          type ProbeElement = {
            getAttribute(name: string): string | null;
            hasAttribute(name: string): boolean;
            textContent: string | null;
            querySelector(selector: string): ProbeElement | null;
          };
          const doc = (body as unknown as {
            ownerDocument: {
              querySelector(selector: string): ProbeElement | null;
              querySelectorAll(selector: string): { length: number };
            };
          }).ownerDocument;
          const host = (type: string): ProbeElement | null =>
            doc.querySelector(`[data-widget-type="${type}"]`);
          const text = (type: string): string =>
            host(type)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
          const panel = host("framer-navbar")?.querySelector('[data-wf-part="panel"]');
          return {
            states: Object.fromEntries(
              [
                "framer-navbar",
                "framer-avatar-info",
                "framer-button",
                "framer-stats",
                "framer-view-all",
                "framer-step",
                "framer-reviews",
                "framer-footer",
              ].map((type) => [type, host(type)?.getAttribute("data-widget-state") ?? null]),
            ),
            navbar: text("framer-navbar"),
            footer: text("framer-footer"),
            reviews: text("framer-reviews"),
            step: text("framer-step"),
            avatar: text("framer-avatar-info"),
            button: host("framer-button")?.querySelector(".w-framer-button__label")?.textContent?.trim() ?? "",
            stats: text("framer-stats"),
            viewAll: text("framer-view-all"),
            reviewCards: doc.querySelectorAll('[data-widget-type="framer-reviews"] [data-wf-part="review"]').length,
            panelHidden: panel?.hasAttribute("hidden") ?? true,
            formFrames: doc.querySelectorAll('[data-widget-type="framer-footer"] iframe').length,
            formLoaded: host("framer-footer")?.querySelector('[data-wf-part="form-card"]')?.hasAttribute("data-loaded") ?? false,
          };
        });

      const desktop = await waitMounted("desktop");
      const first = await probe(desktop);
      expect(first.states).toEqual({
        "framer-navbar": "mounted",
        "framer-avatar-info": "mounted",
        "framer-button": "mounted",
        "framer-stats": "mounted",
        "framer-view-all": "mounted",
        "framer-step": "mounted",
        "framer-reviews": "mounted",
        "framer-footer": "mounted",
      });
      expect(first.navbar).toContain("NICK WEBDESIGN");
      expect(first.navbar).toContain("Projekte");
      expect(first.navbar).toContain("WhatsApp");
      expect(first.avatar).toContain("Adrian Nick");
      expect(first.avatar).toContain("Webdesigner, Entwickler");
      expect(first.button).toBe("Projekt anfragen");
      expect(first.stats).toContain("Jahre Erfahrung");
      expect(first.stats).toContain("Weiterempfehlungsrate");
      expect(first.viewAll).toContain("Alle Referenzen ansehen");
      expect(first.step).toContain("SEO");
      expect(first.step).toContain("Klare Texte:");
      expect(first.reviews).toContain("Markus B.");
      expect(first.reviews).toContain("Top Arbeit.");
      expect(first.reviewCards).toBe(4);
      expect(first.footer).toContain("Bereit für deine neue Website?");
      expect(first.footer).toContain("Impressum");
      expect(first.footer).toContain("Unverbindliches Anfrageformular");
      expect(first.formFrames).toBe(0);
      expect(first.formLoaded).toBe(false);
      expect(first.panelHidden).toBe(true);

      // Das Formular wird erst nach ausdrücklicher Einwilligung geladen.
      const formButton = desktop.locator('[data-widget-type="framer-footer"] [data-wf-part="form-load"]');
      await formButton.evaluate((button) => {
        (button as unknown as { click(): void }).click();
      });
      await expect.poll(async () => (await probe(desktop)).formFrames, { timeout: 10000 }).toBe(1);
      const loaded = await probe(desktop);
      expect(loaded.formLoaded).toBe(true);

      // Mobilmenü: der Umschalter ist erst im schmalen Frame sichtbar.
      await tab.evaluate(() => {
        const scope = globalThis as unknown as { __canvas: { setBreakpoint(device: string): void } };
        scope.__canvas.setBreakpoint("mobile");
      });
      const mobile = await waitMounted("mobile");
      // Der Live-Rahmen füllt die Bühne; die CSS-Medienabfrage sieht deshalb
      // die Bühnenbreite, nicht die Gerätebreite. Der Klick geht direkt an den
      // Umschalter, damit der Handler unabhängig von der Layoutsimulation läuft.
      const toggle = mobile.locator('[data-widget-type="framer-navbar"] [data-wf-part="toggle"]');
      await toggle.evaluate((button) => {
        (button as unknown as { click(): void }).click();
      });
      await expect.poll(async () => (await probe(mobile)).panelHidden, { timeout: 10000 }).toBe(false);
      const opened = await probe(mobile);
      expect(opened.navbar).toContain("Projekte");
      expect(opened.states["framer-navbar"]).toBe("mounted");

      expect(consoleErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120000);
});
