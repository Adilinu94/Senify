// Welche Appear-Klassen animieren im einen Build und nicht im anderen?
// Lauf: pnpm exec tsx .scratch/framer/appear-diff-2026-11-10.mts <buildA> <buildB>
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { chromium } from "playwright";

const [dirA, dirB] = process.argv.slice(2);
if (dirA === undefined || dirB === undefined) throw new Error("zwei Build-Verzeichnisse noetig");

function classesOf(root: string): string[] {
  const css = readFileSync(join(root, "assets", "style-rules.css"), "utf8");
  const names = new Set(
    [...css.matchAll(/\.(fi-[a-z0-9]+-appear-[A-Za-z0-9_-]+)\s*\{/g)].map((match) => match[1] as string),
  );
  // Only the page's own scope: index carries 8a5eda, contact 4eb950.
  return [...names].filter((name) => name.includes("8a5eda")).sort();
}

async function animated(root: string, names: string[]): Promise<Record<string, string>> {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    const file = join(root, pathname === "/" ? "index.html" : pathname);
    if (!existsSync(file)) return void response.writeHead(404).end("nicht da");
    response.writeHead(200, { "content-type": file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "text/html" });
    response.end(readFileSync(file));
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", () => ready()));
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForTimeout(1200);
  const result = (await page.evaluate(
    `(function(){var names=${JSON.stringify(names)};var out={};for(var i=0;i<names.length;i+=1){var el=document.querySelector("."+names[i]);if(!el){out[names[i]]="fehlt";continue;}var s=getComputedStyle(el);out[names[i]]=s.animationName==="none"?"keine":"animiert";}return out;})()`,
  )) as Record<string, string>;
  await browser.close();
  await new Promise<void>((done) => server.close(() => done()));
  return result;
}

const a = classesOf(resolve(dirA));
const b = classesOf(resolve(dirB));
const all = [...new Set([...a, ...b])];
const [left, right] = [await animated(resolve(dirA), all), await animated(resolve(dirB), all)];
let diff = 0;
for (const name of all) {
  if (left[name] === right[name]) continue;
  diff += 1;
  console.log(name, "A:", left[name], "B:", right[name]);
}
console.log("Klassen A:", a.length, "B:", b.length, "Unterschiede:", diff);
