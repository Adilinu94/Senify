// Zaehlt im gebauten Build, wie viele Appear-Klassen wirklich animieren, ob ein
// Keyframe im Startzustand endet und ob sichtbare Knoten transparent bleiben.
// Lauf: pnpm exec tsx .scratch/framer/appear-check-2026-11-10.mts <build-verzeichnis>
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { resolve } from "node:path";

const dir = process.argv[2];
if (dir === undefined) throw new Error("Build-Verzeichnis fehlt");
const root = resolve(dir);

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
  const file = join(root, pathname === "/" ? "index.html" : pathname);
  if (!existsSync(file)) {
    response.writeHead(404).end("nicht da");
    return;
  }
  const isCss = file.endsWith(".css");
  const isJs = file.endsWith(".js");
  response.writeHead(200, { "content-type": isCss ? "text/css" : isJs ? "text/javascript" : "text/html" });
  response.end(readFileSync(file));
});
await new Promise<void>((ready) => server.listen(0, "127.0.0.1", () => ready()));
const port = (server.address() as { port: number }).port;

const css = readFileSync(join(root, "assets", "style-rules.css"), "utf8");
// The rules carry two families: `fi-<scope>-appear-<id>` (the imported class on
// the element) and `senify-appear-<key>-<variant>` (the keyframe owner).
const classes = new Set(
  [...css.matchAll(/\.(fi-[a-z0-9]+-appear-[A-Za-z0-9_-]+)\s*\{/g)].map((match) => match[1] as string),
);
const stoppedFrames = [...css.matchAll(/@keyframes[^{]+\{([\s\S]*?)\}\s*\}/g)].filter((match) => /to\s*\{[^}]*opacity:\s*0\.0*0*1/.test(match[1] ?? "")).length;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 90_000 });
await page.waitForTimeout(1200);
const result = (await page.evaluate(
  `(function(){var names=${JSON.stringify([...classes])};var out={animated:0,stopped:0,missing:0,transparent:0};for(var i=0;i<names.length;i+=1){var el=document.querySelector("."+names[i]);if(!el){out.missing+=1;continue;}var style=getComputedStyle(el);var name=style.animationName;if(name&&name!=="none"){out.animated+=1;}else{out.stopped+=1;}if(parseFloat(style.opacity)<0.05){var box=el.getBoundingClientRect();if(box.width>0&&box.height>0)out.transparent+=1;}}return out;})()`,
)) as { animated: number; stopped: number; missing: number; transparent: number };
console.log(JSON.stringify({ klassen: classes.size, keyframesMitStartEnde: stoppedFrames, ...result }, null, 1));
await browser.close();
await new Promise<void>((done) => server.close(() => done()));
