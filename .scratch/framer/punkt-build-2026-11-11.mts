import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium } from "playwright";

const BUILD = resolve(
  process.env.SENIFY_PUNKT_BUILD ??
    ".scratch/framer-live-2026-11-09/structure-relay7-2026-11-11/relay/before",
);
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function serve(root: string): Promise<{ server: ReturnType<typeof createServer>; url: string }> {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://local").pathname;
    const withIndex = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const file = normalize(join(root, decodeURIComponent(withIndex)));
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const content = await readFile(file);
      response.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((complete) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("kein Port");
      complete({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

const { server, url } = await serve(BUILD);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${url}/`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      const timing = animation.effect?.getTiming?.();
      try {
        if (timing && timing.iterations === Infinity) animation.pause();
        else animation.finish();
      } catch {}
    }
  });
  const info = await page.evaluate(() => {
    const h5 = [...document.querySelectorAll("h5")].find((el) => (el.textContent ?? "").includes("200+"));
    if (!h5) return null;
    const row = h5.parentElement?.parentElement ?? h5.parentElement;
    const nodes = [...(row?.querySelectorAll("*") ?? [])].slice(0, 120).map((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        id: el.getAttribute("data-node-id"),
        tag: el.tagName,
        box: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)],
        opacity: style.opacity,
        bg: style.backgroundColor,
        transform: style.transform,
        animation: style.animationName,
        radius: style.borderRadius,
      };
    });
    return { row: row ? { id: row.getAttribute("data-node-id"), tag: row.tagName } : null, nodes };
  });
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({
    path: `${process.env.COMMANDCODE_SCRATCHPAD ?? "."}/punkt-build-2026-11-11.png`,
    clip: { x: 560, y: 130, width: 220, height: 80 },
  });
  await page.close();
} finally {
  await browser.close();
  server.close();
}
