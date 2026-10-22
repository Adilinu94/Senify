// Wie markiert Framer eine echte Code-Komponente im gerenderten DOM?
// Die fünf Sterne der Earn-Seite sind eine. Gesucht wird das Attribut, das
// capture-html.ts heute liest (data-framer-module), und was stattdessen da ist.
import { listenReachable } from "@senify/core/net";
import { existsSync } from "node:fs";

const { chromium } = await import("playwright");
if (!existsSync(chromium.executablePath())) {
  console.log("kein Chromium");
  process.exit(0);
}
void listenReachable;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("https://distinct-assistant-875072.framer.app", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  const report = (await page.evaluate(`(() => {
    const out = { module: 0, componentType: {}, codeish: [] };
    for (const el of document.querySelectorAll("*")) {
      if (el.hasAttribute("data-framer-module")) out.module += 1;
      const type = el.getAttribute("data-framer-component-type");
      if (type) out.componentType[type] = (out.componentType[type] || 0) + 1;
    }
    // Der Sterne-Container: suche das Element, das die Sterne haelt.
    const stars = [...document.querySelectorAll("svg")].filter((s) => s.getAttribute("viewBox") === "0 0 256 256");
    if (stars.length > 0) {
      let el = stars[0];
      const chain = [];
      for (let i = 0; i < 6 && el && el !== document.body; i += 1) {
        chain.push({
          tag: el.tagName.toLowerCase(),
          attrs: [...el.attributes].map((a) => a.name + "=" + a.value.slice(0, 60)),
          text: (el.getAttribute("data-framer-name") || "").slice(0, 40),
        });
        el = el.parentElement;
      }
      out.codeish = chain;
    }
    out.starCount = stars.length;
    return out;
  })()`)) as Record<string, unknown>;
  console.log(JSON.stringify(report, null, 1));
} finally {
  await browser.close();
}
