import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runImport, type AssetUploader } from "@senify/framer-import";

// A mirror is a copy of the site on disk: the page's HTML plus the files it
// points at. The import reads those files from the copy instead of asking the
// network for them, so a mirror import works without the address of the
// original site - and the copy is the source of truth for what the page
// showed.
//
// The mirror may only deliver its own files: a path that leaves the mirror
// folder is refused.

const LOGO = Buffer.concat([Buffer.from("PNG-fake-logo-", "utf8"), Buffer.alloc(32, 3)]);
const FONT = Buffer.concat([Buffer.from("wOF2-fake-site-", "utf8"), Buffer.alloc(48, 5)]);
const OUTSIDE = Buffer.from("PNG-fake-outside-", "utf8");

type Upload = { filename: string; mime: string; data: Buffer };

function mirrorWith(files: Record<string, string | Buffer>, html: string): string {
  const root = mkdtempSync(join(tmpdir(), "senify-mirror-assets-"));
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }
  writeFileSync(join(root, "index.html"), html, "utf8");
  return root;
}

// Die Fonts einer Framer-Seite stehen im Block `data-framer-font-css` (das ist
// die Quelle, aus der der Capture sie liest).
const page = (body: string, fontCss = ""): string =>
  `<html lang="en"><head><title>t</title>${fontCss === "" ? "" : `<style data-framer-font-css>${fontCss}</style>`}</head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

function uploaderFor(uploads: Upload[]): AssetUploader {
  return (input) => {
    uploads.push(input);
    return { assetId: `a${uploads.length}`, url: `/assets/a${uploads.length}/${input.filename}` };
  };
}

describe("Mirror-Assets: die Dateien des Spiegels werden gelesen", () => {
  it("liest Bild und Font aus dem Mirror-Ordner, ohne baseUrl und ohne Netz", async () => {
    const root = mirrorWith(
      {
        "assets/img/logo.png": LOGO,
        "assets/fonts/site.woff2": FONT,
      },
      page(
        `<img src="assets/img/logo.png" alt="Logo"/>`,
        `@font-face{font-family:"Site";font-weight:400;src:url(assets/fonts/site.woff2) format("woff2")}`,
      ),
    );
    try {
      const uploads: Upload[] = [];
      const run = await runImport({
        source: { kind: "mirror", rootDir: root },
        uploader: uploaderFor(uploads),
      });
      const bild = uploads.find((upload) => upload.filename === "logo.png");
      const font = uploads.find((upload) => upload.filename === "site.woff2");
      expect(bild?.data.equals(LOGO)).toBe(true);
      expect(font?.data.equals(FONT)).toBe(true);
      expect(run.assets?.failed).toBe(0);
      expect(run.assets?.downloads).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("liest eine wurzelrelative URL aus dem Wurzelordner des Spiegels", async () => {
    const root = mirrorWith(
      { "assets/img/logo.png": LOGO },
      page(`<img src="/assets/img/logo.png" alt="Logo"/>`),
    );
    try {
      const uploads: Upload[] = [];
      await runImport({ source: { kind: "mirror", rootDir: root }, uploader: uploaderFor(uploads) });
      expect(uploads.some((upload) => upload.data.equals(LOGO))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("nimmt die Datei der Seite selbst vor der Datei im Wurzelordner", async () => {
    const root = mkdtempSync(join(tmpdir(), "senify-mirror-page-"));
    mkdirSync(join(root, "about"), { recursive: true });
    writeFileSync(join(root, "logo.png"), LOGO);
    writeFileSync(join(root, "about", "logo.png"), Buffer.from("PNG-fake-page-", "utf8"));
    writeFileSync(
      join(root, "about", "index.html"),
      page(`<img src="logo.png" alt="Logo"/>`),
      "utf8",
    );
    try {
      const uploads: Upload[] = [];
      await runImport({
        source: { kind: "mirror", rootDir: root, pagePath: "/about" },
        uploader: uploaderFor(uploads),
      });
      const bild = uploads.find((upload) => upload.filename === "logo.png");
      expect(bild?.data.equals(Buffer.from("PNG-fake-page-", "utf8"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("verweigert einen Pfad, der den Mirror verlässt", async () => {
    const ausserhalb = mkdtempSync(join(tmpdir(), "senify-mirror-outside-"));
    writeFileSync(join(ausserhalb, "secret.png"), OUTSIDE);
    const root = join(ausserhalb, "site");
    mkdirSync(root);
    writeFileSync(join(root, "index.html"), page(`<img src="../secret.png" alt="x"/>`), "utf8");
    try {
      const uploads: Upload[] = [];
      await expect(
        runImport({ source: { kind: "mirror", rootDir: root }, uploader: uploaderFor(uploads) }),
      ).rejects.toThrow(/Relative Asset-URL ohne baseUrl nicht auflösbar/);
      // Die Datei außerhalb des Spiegels wurde nicht gelesen.
      expect(uploads.some((upload) => upload.data.equals(OUTSIDE))).toBe(false);
    } finally {
      rmSync(ausserhalb, { recursive: true, force: true });
    }
  }, 60_000);

  it("bleibt ein Fehler, wenn die Datei fehlt und keine Adresse der Originalseite angegeben ist", async () => {
    const root = mirrorWith({}, page(`<img src="assets/img/fehlt.png" alt="x"/>`));
    try {
      const uploads: Upload[] = [];
      await expect(
        runImport({ source: { kind: "mirror", rootDir: root }, uploader: uploaderFor(uploads) }),
      ).rejects.toThrow(/Relative Asset-URL ohne baseUrl nicht auflösbar/);
      expect(uploads).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
