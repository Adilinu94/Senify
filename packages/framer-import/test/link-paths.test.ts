import { describe, expect, it } from "vitest";
import { captureHtml, discoverPagePaths, pagePathOf, resolveHref } from "../src/index.ts";
import type { IrNode } from "../src/ir.ts";

const rootOf = (document: ReturnType<typeof captureHtml>): IrNode => {
  const first = document.pages[0];
  if (first === undefined) throw new Error("no page");
  return first.root;
};

describe("resolveHref", () => {
  it("makes page-relative links root-relative against the page they sit on", () => {
    expect(resolveHref("./about", "/", null)).toBe("/about");
    expect(resolveHref("./", "/", null)).toBe("/");
    expect(resolveHref("../about", "/legal/privacy", null)).toBe("/about");
    expect(resolveHref("./terms", "/legal/privacy", null)).toBe("/legal/terms");
    expect(resolveHref("team?x=1#lead", "/", null)).toBe("/team?x=1#lead");
  });

  it("leaves anchors, mail, phone and other sites alone", () => {
    for (const href of ["#kontakt", "mailto:a@b.de", "tel:+49123", "https://other.de/x"]) {
      expect(resolveHref(href, "/", "https://site.de")).toBe(href);
    }
  });

  it("turns a same-origin absolute URL into its path", () => {
    expect(resolveHref("https://site.de/blog#top", "/", "https://site.de")).toBe("/blog#top");
    expect(resolveHref("//site.de/blog", "/", "https://site.de")).toBe("/blog");
  });
});

describe("pagePathOf", () => {
  it("gives the page path of an internal link and null for everything else", () => {
    expect(pagePathOf("/about")).toBe("/about");
    expect(pagePathOf("/about/")).toBe("/about");
    expect(pagePathOf("/about?x=1#y")).toBe("/about");
    expect(pagePathOf("/")).toBe("/");
    expect(pagePathOf("/logo.png")).toBeNull();
    expect(pagePathOf("/files/a.pdf")).toBeNull();
    expect(pagePathOf("https://x.de")).toBeNull();
    expect(pagePathOf("//x.de/a")).toBeNull();
    expect(pagePathOf("#a")).toBeNull();
  });
});

const page = (body: string): string =>
  `<html lang="de"><head><title>t</title></head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

describe("page discovery", () => {
  it("finds the other pages a page links to once each, in first-seen order", () => {
    const document = captureHtml({
      html: page(
        '<nav><a href="./about">About</a><a href="./blog">Blog</a><a href="./about">About</a><a href="./">Home</a><a href="https://x.de">Ext</a><a href="#top">Top</a><a href="./img/a.png">Img</a></nav>',
      ),
    });
    expect(discoverPagePaths(rootOf(document), "/")).toEqual(["/about", "/blog"]);
  });

  it("stores root-relative hrefs in the IR so links survive an import under another path", () => {
    const document = captureHtml({ html: page('<a href="../about">A</a>'), pagePath: "/elsewhere", sourcePath: "/legal/privacy" });
    const hrefs: string[] = [];
    const walk = (node: IrNode): void => {
      if (node.href !== null) hrefs.push(node.href);
      node.children.forEach(walk);
    };
    walk(rootOf(document));
    expect(hrefs).toEqual(["/about"]);
  });

  it("caps the list", () => {
    const links = Array.from({ length: 80 }, (_, index) => `<a href="./p${index}">p</a>`).join("");
    const document = captureHtml({ html: page(links) });
    expect(discoverPagePaths(rootOf(document), "/").length).toBe(40);
  });
});

describe("a page inside an export folder", () => {
  it("reads the page the source path names, whatever path it lands on", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { captureFixture, pageFileOf } = await import("../src/index.ts");
    const root = mkdtempSync(join(tmpdir(), "senify-site-"));
    try {
      const doc = (title: string, body: string): string =>
        `<html lang="de"><head><title>${title}</title></head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;
      writeFileSync(join(root, "index.html"), doc("Start", '<a href="./about">About</a><a href="./kontakt">Kontakt</a>'));
      writeFileSync(join(root, "about.html"), doc("About", '<a href="./">Home</a><a href="./kontakt">Kontakt</a>'));
      mkdirSync(join(root, "kontakt"));
      writeFileSync(join(root, "kontakt", "index.html"), doc("Kontakt", '<a href="../about">About</a>'));

      expect(pageFileOf(root, "/").endsWith("index.html")).toBe(true);
      expect(pageFileOf(root, "/about").endsWith("about.html")).toBe(true);
      expect(pageFileOf(root, "/kontakt").endsWith(join("kontakt", "index.html"))).toBe(true);
      expect(() => pageFileOf(root, "/fehlt")).toThrow(/keine HTML-Datei/);

      // The home page of the export, landing on another path in Senify.
      const home = captureFixture(root, "/start", "/");
      expect(home.pages[0]?.path).toBe("/start");
      expect(home.pages[0]?.title).toBe("Start");
      // The nested page's `../about` resolves against ITS folder, not the target.
      const nested = captureFixture(root, "/x", "/kontakt");
      expect(nested.pages[0]?.title).toBe("Kontakt");
      const hrefs: string[] = [];
      const walk = (node: IrNode): void => {
        if (node.href !== null) hrefs.push(node.href);
        node.children.forEach(walk);
      };
      walk(rootOf(nested));
      expect(hrefs).toEqual(["/about"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("makes a scraped export's absolute same-origin links root-relative when the origin is given", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { captureFixture } = await import("../src/index.ts");
    const root = mkdtempSync(join(tmpdir(), "senify-site-"));
    try {
      const body = '<a href="https://shop.test/about">About</a><a href="https://other.test/x">Extern</a>';
      writeFileSync(
        join(root, "index.html"),
        `<html lang="de"><head><title>Start</title></head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`,
      );
      const hrefsOf = (document: ReturnType<typeof captureHtml>): string[] => {
        const found: string[] = [];
        const walk = (node: IrNode): void => {
          if (node.href !== null) found.push(node.href);
          node.children.forEach(walk);
        };
        walk(rootOf(document));
        return found;
      };
      // Without an origin the page cannot tell its own site from another one.
      expect(hrefsOf(captureFixture(root))).toEqual(["https://shop.test/about", "https://other.test/x"]);
      const withOrigin = captureFixture(root, "/", "/", "https://shop.test");
      expect(hrefsOf(withOrigin)).toEqual(["/about", "https://other.test/x"]);
      expect(discoverPagePaths(rootOf(withOrigin), "/")).toEqual(["/about"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
