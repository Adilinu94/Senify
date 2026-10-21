import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SenifyError } from "@senify/core";
import { isAllowedBrowserUrl } from "@senify/core/net";

// The Playwright harness the visual checks were waiting for (T07/T14): freeze
// the motion, settle the scroll, capture full-page screenshots per breakpoint,
// diff two snapshots into a per-pixel report plus a highlight image, and
// record a short motion video. Everything renders in the browser — the diff
// runs in a canvas, so the project needs no image dependency.
//
// Playwright stays optional: every entry point lazy-imports it and fails with
// a clear message when the browser is missing.

export type Breakpoint = "desktop" | "tablet" | "mobile";

export const VISUAL_VIEWPORTS: Record<Breakpoint, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  // Tablet is 1024 everywhere (decision 23.09.): the Framer tablet range is
  // 810–1199, so 1024 sits inside it and the import gate compares at the same
  // width the visual checks capture.
  tablet: { width: 1024, height: 768 },
  mobile: { width: 390, height: 844 },
};

export type VisualCapture = {
  breakpoint: Breakpoint;
  path: string;
  width: number;
  height: number;
  bytes: number;
};

export type CaptureOptions = {
  url: string;
  outDir: string;
  breakpoints?: readonly Breakpoint[];
  // Viewport width override per breakpoint (E26 slice 2): the reference diff
  // captures the result at the reference shot's own width, so widths stay
  // comparable. Absent = the fixed VISUAL_VIEWPORTS width.
  widths?: Partial<Record<Breakpoint, number>>;
  // Extra milliseconds after the scroll settle (websockets, lazy media).
  settleMs?: number;
  // Freeze kill-switch (freeze-spec.md): "off" (default) sets
  // `window.__SENIFY_MOTION__` before load, so the page script never starts and
  // the capture compares the baseline. "live" leaves the runtime running.
  motion?: "off" | "live";
  // The browser policy: which addresses the capture may reach.
  browser?: BrowserPolicy;
};

export type DiffReport = {
  width: number;
  height: number;
  changedPixels: number;
  ratio: number;
  // Bounding box of all changes in pixels, null when nothing changed.
  bounds: { left: number; top: number; right: number; bottom: number } | null;
  path: string;
};

export type MotionCapture = {
  path: string;
  bytes: number;
  durationMs: number;
};

async function loadPlaywright(): Promise<{
  chromium: typeof import("playwright").chromium;
}> {
  try {
    const playwright = await import("playwright");
    return { chromium: playwright.chromium };
  } catch {
    throw new SenifyError(
      "not_found",
      "Playwright ist nicht installiert — visuelle Aufnahmen brauchen Chromium",
      {
        field: "playwright",
        suggestion: "npx playwright install chromium",
      },
    );
  }
}

// The browser policy of a capture: which addresses the browser may reach.
//
// `allowOrigins` names the servers the product itself started: the preview
// server and the offline mirror. They run on the loopback interface and the
// browser has to reach them - otherwise there is no preview. Every other
// address has to pass the public check, so a user-supplied URL cannot point
// the browser at a private service - no matter in which order the calls
// happen.
//
// `file:` is off by default: a REMOTE page must not be able to point the
// browser at a local file and have the capture show it. Only a capture of a
// local folder (the offline mirror) sets it.
export type BrowserPolicy = {
  allowOrigins?: readonly string[];
  allowFile?: boolean;
};

// Every request the browser makes - the navigation, its redirects, every
// sub-resource, every `fetch()` from the page's script - passes the same
// address check as the Node path (ADR-0022). Without it a public page could
// point the browser at a cloud metadata service or at a service in the LAN,
// and the answer would end up in the capture.
//
// The check sits HERE, at the browser, and not at the call site: a caller
// that forgets it (or that calls the capture in a different order) would
// otherwise open the door without noticing.
async function guardBrowser(
  context: import("playwright").BrowserContext,
  policy: BrowserPolicy | undefined,
): Promise<void> {
  await context.route("**/*", async (route) => {
    const target = route.request().url();
    if (await isAllowedBrowserUrl(target, policy)) {
      await route.continue();
      return;
    }
    await route.abort("blockedbyclient");
  });
}

// Freezing motion makes two captures of the same state comparable; the scroll
// pass triggers lazy media and settles sticky headers before the shot. The
// explicit `scroll-behavior: auto` keeps smooth-scroll pages measurable
// (freeze-spec.md §4): otherwise the scroll pass measures a moving target.
const FREEZE_CSS =
  "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; } html { scroll-behavior: auto !important; }";

// The browser slice the evaluate callbacks touch. The repo compiles without a
// DOM lib on purpose (like the editor's dom.ts), so every callback declares
// the structural shape it needs instead of pulling lib.dom in.
type BrowserSlice = {
  document: {
    body: { scrollHeight: number };
    documentElement: { scrollWidth: number; scrollHeight: number };
    fonts?: { ready: Promise<unknown> };
  };
  window: {
    innerHeight: number;
    scrollTo(x: number, y: number): void;
    requestAnimationFrame(callback: () => void): void;
  };
};
type ImageLike = {
  naturalWidth: number;
  naturalHeight: number;
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
};
type CanvasContextLike = {
  drawImage(image: unknown, x: number, y: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray };
  createImageData(width: number, height: number): { data: Uint8ClampedArray };
  putImageData(data: unknown, x: number, y: number): void;
};
type CanvasLike = {
  width: number;
  height: number;
  getContext(kind: "2d"): CanvasContextLike | null;
  toDataURL(kind: "image/png"): string;
};

async function settle(page: import("playwright").Page, extraMs: number): Promise<void> {
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.evaluate(async () => {
    const slice = globalThis as unknown as BrowserSlice;
    const step = slice.window.innerHeight;
    for (let y = 0; y < slice.document.body.scrollHeight; y += step) {
      slice.window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    slice.window.scrollTo(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 80));
    await slice.document.fonts?.ready;
    // Layout settle after fonts and scroll (freeze-spec.md §4): two frames
    // before the shot, so late reflows cannot land in the diff.
    await new Promise<void>((resolve) =>
      slice.window.requestAnimationFrame(() =>
        slice.window.requestAnimationFrame(() => resolve()),
      ),
    );
  });
  if (extraMs > 0) await page.waitForTimeout(extraMs);
}

export async function captureScreenshots(options: CaptureOptions): Promise<VisualCapture[]> {
  const { chromium } = await loadPlaywright();
  const breakpoints = options.breakpoints ?? (Object.keys(VISUAL_VIEWPORTS) as Breakpoint[]);
  mkdirSync(options.outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const captures: VisualCapture[] = [];
  try {
    for (const breakpoint of breakpoints) {
      const viewport = VISUAL_VIEWPORTS[breakpoint];
      const width = options.widths?.[breakpoint] ?? viewport.width;
      const context = await browser.newContext({
        viewport: { width, height: viewport.height },
        reducedMotion: "reduce",
      });
      await guardBrowser(context, options.browser);
      const page = await context.newPage();
      if (options.motion !== "live") {
        await context.addInitScript(() => {
          (globalThis as unknown as { __SENIFY_MOTION__?: string }).__SENIFY_MOTION__ = "off";
        });
      }
      await page.goto(options.url, { waitUntil: "load" });
      await settle(page, options.settleMs ?? 150);
      const path = join(options.outDir, `${breakpoint}.png`);
      await page.screenshot({ path, fullPage: true });
      const dimensions = await page.evaluate(() => {
        const slice = globalThis as unknown as BrowserSlice;
        return {
          width: slice.document.documentElement.scrollWidth,
          height: slice.document.documentElement.scrollHeight,
        };
      });
      const bytes = readFileSync(path).byteLength;
      captures.push({ breakpoint, path, width: dimensions.width, height: dimensions.height, bytes });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return captures;
}

export type ThumbnailOptions = {
  url: string;
  breakpoints?: readonly Breakpoint[];
  widths?: Partial<Record<Breakpoint, number>>;
  settleMs?: number;
  motion?: "off" | "live";
  // Width of the picture in pixels and the tallest slice of the page it shows.
  thumbWidth?: number;
  maxPageHeight?: number;
  // The browser policy: which addresses the capture may reach.
  browser?: BrowserPolicy;
};

export type Thumbnail = {
  breakpoint: Breakpoint;
  // The viewport width the page was laid out at and its full height there.
  width: number;
  pageHeight: number;
  png: Buffer;
};

// A small picture of the top of a page at each breakpoint, for a preview next
// to another page. The page is laid out at the real width; the browser scales
// the picture down itself (`deviceScaleFactor` below 1), so no image library is
// needed and a tall page costs no more than a short one.
export async function captureThumbnails(options: ThumbnailOptions): Promise<Thumbnail[]> {
  const { chromium } = await loadPlaywright();
  const breakpoints = options.breakpoints ?? (Object.keys(VISUAL_VIEWPORTS) as Breakpoint[]);
  const thumbWidth = options.thumbWidth ?? 480;
  const maxPageHeight = options.maxPageHeight ?? 1800;
  const browser = await chromium.launch({ headless: true });
  const out: Thumbnail[] = [];
  try {
    for (const breakpoint of breakpoints) {
      const viewport = VISUAL_VIEWPORTS[breakpoint];
      const width = options.widths?.[breakpoint] ?? viewport.width;
      const context = await browser.newContext({
        viewport: { width, height: viewport.height },
        deviceScaleFactor: Math.min(1, thumbWidth / width),
        reducedMotion: "reduce",
      });
      await guardBrowser(context, options.browser);
      const page = await context.newPage();
      if (options.motion !== "live") {
        await context.addInitScript(() => {
          (globalThis as unknown as { __SENIFY_MOTION__?: string }).__SENIFY_MOTION__ = "off";
        });
      }
      await page.goto(options.url, { waitUntil: "load" });
      await settle(page, options.settleMs ?? 150);
      const pageHeight = await page.evaluate(
        () => (globalThis as unknown as BrowserSlice).document.documentElement.scrollHeight,
      );
      const png = await page.screenshot({
        fullPage: true,
        clip: { x: 0, y: 0, width, height: Math.min(pageHeight, maxPageHeight) },
      });
      out.push({ breakpoint, width, pageHeight, png });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return out;
}

// Per-pixel diff in a canvas: the changed pixels are painted magenta over a
// faded copy of the "after" image, so a human sees the movement at a glance.
export async function diffScreenshots(input: {
  before: string;
  after: string;
  outDir: string;
  name?: string;
  threshold?: number;
}): Promise<DiffReport> {
  const { chromium } = await loadPlaywright();
  const threshold = input.threshold ?? 24;
  const beforeUrl = `data:image/png;base64,${readFileSync(input.before).toString("base64")}`;
  const afterUrl = `data:image/png;base64,${readFileSync(input.after).toString("base64")}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(
      async (payload: { beforeUrl: string; afterUrl: string; threshold: number }) => {
        const createImage = (): ImageLike => {
          const ImageCtor = (globalThis as unknown as { Image: { new (): ImageLike } }).Image;
          return new ImageCtor();
        };
        const canvasCtor = globalThis as unknown as {
          document: { createElement(tag: "canvas"): CanvasLike };
        };
        const load = (url: string): Promise<ImageLike> =>
          new Promise((resolve, reject) => {
            const image = createImage();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
            image.src = url;
          });
        const [before, after] = await Promise.all([
          load(payload.beforeUrl),
          load(payload.afterUrl),
        ]);
        const width = Math.max(before.naturalWidth, after.naturalWidth);
        const height = Math.max(before.naturalHeight, after.naturalHeight);
        const canvas = canvasCtor.document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Kein 2D-Kontext");
        context.drawImage(before, 0, 0);
        const beforePixels = context.getImageData(0, 0, width, height).data;
        context.clearRect(0, 0, width, height);
        context.drawImage(after, 0, 0);
        const afterPixels = context.getImageData(0, 0, width, height).data;
        const diff = context.createImageData(width, height);
        const inside = (image: ImageLike, x: number, y: number): boolean =>
          x < image.naturalWidth && y < image.naturalHeight;
        let changed = 0;
        let left = width;
        let top = height;
        let right = -1;
        let bottom = -1;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const index = (y * width + x) * 4;
            const beforeInside = inside(before, x, y);
            const afterInside = inside(after, x, y);
            let isDifferent = beforeInside !== afterInside;
            if (!isDifferent) {
              for (let channel = 0; channel < 3; channel += 1) {
                if (
                  Math.abs(
                    (beforePixels[index + channel] ?? 0) - (afterPixels[index + channel] ?? 0),
                  ) > payload.threshold
                ) {
                  isDifferent = true;
                  break;
                }
              }
            }
            if (!isDifferent) {
              // Faded copy of the after image as the background.
              diff.data[index] = afterPixels[index] ?? 255;
              diff.data[index + 1] = afterPixels[index + 1] ?? 255;
              diff.data[index + 2] = afterPixels[index + 2] ?? 255;
              diff.data[index + 3] = 90;
            } else {
              changed += 1;
              diff.data[index] = 208;
              diff.data[index + 1] = 4;
              diff.data[index + 2] = 212;
              diff.data[index + 3] = 255;
              if (x < left) left = x;
              if (y < top) top = y;
              if (x > right) right = x;
              if (y > bottom) bottom = y;
            }
          }
        }
        context.putImageData(diff, 0, 0);
        return {
          width,
          height,
          changedPixels: changed,
          bounds: changed === 0 ? null : { left, top, right, bottom },
          dataUrl: canvas.toDataURL("image/png"),
        };
      },
      { beforeUrl, afterUrl, threshold },
    );
    mkdirSync(input.outDir, { recursive: true });
    const name = input.name ?? "diff";
    const path = join(input.outDir, `${name}.png`);
    const base64 = result.dataUrl.replace(/^data:image\/png;base64,/, "");
    writeFileSync(path, Buffer.from(base64, "base64"));
    return {
      width: result.width,
      height: result.height,
      changedPixels: result.changedPixels,
      ratio: result.width * result.height === 0 ? 0 : result.changedPixels / (result.width * result.height),
      bounds: result.bounds,
      path,
    };
  } finally {
    await browser.close();
  }
}

// A short video of the page in motion: the page scrolls once through its
// height while the context records; the .webm is handed back for the
// artifact store.
export async function recordMotion(input: {
  url: string;
  outDir: string;
  name?: string;
  durationMs?: number;
  viewport?: { width: number; height: number };
  // The browser policy: which addresses the capture may reach.
  browser?: BrowserPolicy;
}): Promise<MotionCapture> {
  const { chromium } = await loadPlaywright();
  const durationMs = input.durationMs ?? 4000;
  const viewport = input.viewport ?? VISUAL_VIEWPORTS.desktop;
  mkdirSync(input.outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport,
      recordVideo: { dir: input.outDir, size: viewport },
    });
    await guardBrowser(context, input.browser);
    const page = await context.newPage();
    await page.goto(input.url, { waitUntil: "load" });
    const steps = 24;
    const stepMs = Math.max(60, Math.floor(durationMs / steps));
    for (let index = 0; index < steps; index += 1) {
      await page.evaluate(
        async (payload: { ratio: number; stepMs: number }) => {
          const slice = globalThis as unknown as BrowserSlice;
          const max = Math.max(
            0,
            slice.document.body.scrollHeight - slice.window.innerHeight,
          );
          slice.window.scrollTo(0, Math.round(max * payload.ratio));
          await new Promise((resolve) => setTimeout(resolve, payload.stepMs));
        },
        { ratio: index / (steps - 1), stepMs },
      );
    }
    const video = page.video();
    await context.close();
    const name = input.name ?? "motion";
    const path = join(input.outDir, `${name}.webm`);
    if (video) await video.saveAs(path);
    const bytes = readFileSync(path).byteLength;
    return { path, bytes, durationMs };
  } finally {
    await browser.close();
  }
}
