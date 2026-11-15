import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPrimitive } from "@senify/widget-engine";
import { bootEngine, createTestSite, type BootEnv, type PageResponse } from "./helpers.ts";

// Der Projekt-XML-Weg für die vier benannten Framer-Komponenten (ADR-0038):
// Navbar, Step 2, Ticker reviews item und Footer 2 landen als native
// DOM-Widgets mit Inspector-Controls, nicht als Platte oder leerer Rahmen.

const FIXTURE = fileURLToPath(
  new URL("../../framer-import/test/fixtures/unframer/components", import.meta.url),
);

type ImportResponse = {
  report: {
    pageId: string | null;
    counts: { nodes: number; mapped: number; placeholders: number };
    findings: { kind: string; severity: string; message: string }[];
  };
};

type StoredNode = { type: string; props: Record<string, unknown> };

let env: BootEnv;
let siteId: string;

beforeAll(async () => {
  env = await bootEngine();
  const site = await createTestSite(env.api, "Fluffy Components");
  siteId = site.id;
});

afterAll(async () => {
  await env.close();
});

describe("Framer-Komponenten als DOM-Widgets", () => {
  it("importiert alle vier als Widgets und behält die Step-Instanzwerte", async () => {
    const response = await env.api.request<ImportResponse>({
      method: "POST",
      path: `/api/sites/${siteId}/imports/framer`,
      body: {
        source: {
          project: {
            xml: readFileSync(`${FIXTURE}/project.xml`, "utf8"),
            pageXml: readFileSync(`${FIXTURE}/page.xml`, "utf8"),
            page: "/",
            usage: "private",
          },
        },
        pagePath: "/",
        mode: "fidelity",
        assets: "skip",
        fonts: "skip",
        write: true,
        createOnly: true,
      },
    });
    expect(response.status).toBe(201);
    const { report } = response.body;
    expect(report.pageId).not.toBeNull();
    expect(report.counts.placeholders).toBe(0);
    expect(report.findings.filter((finding) => finding.kind === "code-component" && finding.severity === "info")).toHaveLength(4);

    const page = await env.api.request<PageResponse>({
      method: "GET",
      path: `/api/pages/${report.pageId}`,
    });
    expect(page.status).toBe(200);
    const nodes = Object.values(page.body.draft.nodes) as StoredNode[];
    const types = new Set(nodes.map((node) => node.type));
    expect(types).toContain("framer-navbar");
    expect(types).toContain("framer-footer");
    expect(types).toContain("framer-reviews");
    expect(types).toContain("framer-step");
    const step = nodes.find((node) => node.type === "framer-step");
    expect(step?.props["nr"]).toBe("01");
    expect(step?.props["title"]).toBe("Webdesign");
    expect(step?.props["points"]).toEqual([
      { label: "Klare Layouts:", text: "Ruhige Farben." },
      { label: "Responsiv:", text: "Auf jedem Gerät." },
    ]);
  });

  it("gibt jedem Widget einen Inspector-Katalog mit Controls", () => {
    for (const type of ["framer-navbar", "framer-footer", "framer-reviews", "framer-step"]) {
      const primitive = getPrimitive(type);
      expect(primitive, type).toBeDefined();
      expect(primitive?.controls.length, type).toBeGreaterThan(0);
      expect(primitive?.dom, type).toBe(true);
    }
  });
});
