import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";

const resolved = resolveTheme(defaultTheme());
const themeCss = emitCss(resolved);

const tree = {
  rootNodeId: "root",
  nodes: {
    root: { id: "root", type: "page", props: {}, children: ["sec"] },
    sec: { id: "sec", type: "section", props: {}, children: ["h", "g"] },
    h: { id: "h", type: "heading", props: { level: "h2", text: "Katalogbaustein" } },
    g: { id: "g", type: "grid", props: {}, children: ["t1", "t2"] },
    t1: { id: "t1", type: "text", props: { text: "Zelle eins" } },
    t2: { id: "t2", type: "text", props: { text: "Zelle zwei" } },
  },
} as never;

const outDir = join(mkdtempSync(join(tmpdir(), "senify-widget-bake-")), "dist");
try {
  const result = await bakeSite(
    {
      siteName: "Katalog",
      baseUrl: "https://beispiel.de",
      pages: [{ id: "p", path: "/", title: "Start", tree }],
      themeCss,
      motionTokens: { ease: {}, baseDurationMs: 300, baseStaggerMs: 80 },
      aeo: false,
    },
    { outDir },
  );
  console.log("warnings:", JSON.stringify(result.warnings, null, 2));
  const html = readFileSync(join(outDir, "index.html"), "utf8");
  console.log("--- HEAD ---");
  console.log(html.slice(0, html.indexOf("</head>") + 7));
  const bodyStart = html.indexOf("<body");
  console.log("--- BODY marker order ---");
  console.log("style@", html.indexOf("<style>"), "section@", html.indexOf("<section"));
  console.log(html.slice(bodyStart, bodyStart + 120));
  console.log("... tail of body ...");
  console.log(html.slice(html.indexOf("</style>") - 40, html.indexOf("</style>") + 200));
  console.log("--- outDir:", outDir);
} catch (error) {
  console.error("FAILED:", error);
} finally {
  // keep for inspection
}
