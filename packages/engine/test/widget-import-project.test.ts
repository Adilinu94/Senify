import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPrimitive } from "@senify/widget-engine";
import { bootEngine, createTestSite, type BootEnv, type PageResponse } from "./helpers.ts";

// Der komplette Weg „Framer-Seite als Projekt anlegen" fuer eine portierte
// Code-Component (spec 2026-11-12, WaveBackground): die Projekt-XML von
// fluffy-rectangle-418998 laeuft durch die echte Import-Route in einen
// isolierten Store. Was hier zaehlt:
// - WaveBackground landet als nativer, bearbeitbarer Widget-Knoten
//   (`wave-background`), NICHT als Platte (`payload`).
// - Die unbekannte Code-Component FormPopup bleibt eine ehrliche Platte.
// - Der Widget-Typ traegt die Inspector-Controls (Bearbeitbarkeit).
// - Der Bericht zaehlt nur die echte Platte als Placeholder.

const FLUFFY = fileURLToPath(
  new URL("../../framer-import/test/fixtures/unframer/fluffy", import.meta.url),
);

type ImportResponse = {
  job: { id: string; status: string; sourceKind: string };
  report: {
    pageId: string | null;
    counts: { nodes: number; mapped: number; placeholders: number };
    findings: { kind: string; severity: string; message: string }[];
  };
};

let env: BootEnv;
let siteId: string;

beforeAll(async () => {
  env = await bootEngine();
  const site = await createTestSite(env.api, "Fluffy Rectangle");
  siteId = site.id;
});

afterAll(async () => {
  await env.close();
});

describe("WaveBackground-Seite als Projekt (fluffy-rectangle)", () => {
  it("importiert die Code-Component als natives Widget und legt die Seite an", async () => {
    const response = await env.api.request<ImportResponse>({
      method: "POST",
      path: `/api/sites/${siteId}/imports/framer`,
      body: {
        source: {
          project: {
            xml: readFileSync(`${FLUFFY}/project.xml`, "utf8"),
            pageXml: readFileSync(`${FLUFFY}/page-home.xml`, "utf8"),
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
    const { job, report } = response.body;
    expect(job.sourceKind).toBe("project");
    expect(report.pageId).not.toBeNull();

    // Nur FormPopup bleibt eine Platte; WaveBackground ist jetzt ein Widget.
    expect(report.counts.placeholders).toBe(1);
    expect(
      report.findings.some(
        (f) => f.kind === "code-component" && f.severity === "info" && f.message.includes("wave-background"),
      ),
    ).toBe(true);

    const page = await env.api.request<PageResponse>({
      method: "GET",
      path: `/api/pages/${report.pageId}`,
    });
    expect(page.status).toBe(200);
    const nodes = Object.values(page.body.draft.nodes) as { type: string; props: Record<string, unknown> }[];
    const wave = nodes.find((n) => n.type === "wave-background");
    const plate = nodes.find((n) => n.type === "payload");
    expect(wave).toBeDefined();
    expect(plate).toBeDefined();
    expect(String(plate?.props["label"] ?? "")).toContain("Platte");

    // Bearbeitbarkeit: der gespeicherte Widget-Typ traegt die sieben Inspector-
    // Controls, der Editor gruppiert sie (T1) und der Live-Mount setzt sie um.
    const controls = getPrimitive("wave-background")!.controls.map((c) => c.key);
    expect(controls).toEqual(["speed", "amplitude", "zoom", "glow", "phase", "saturation", "steps"]);
  });
});