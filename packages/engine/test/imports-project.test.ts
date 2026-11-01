import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bootEngine,
  createTestSite,
  type BootEnv,
  type ErrorResponse,
} from "./helpers.ts";

// Der Projekt-Weg durch die Engine-Route (ADR-0028, Schritt 3): die XML-Quelle
// laeuft durch dieselbe Route wie URL, Mirror und HTML. Was hier zaehlt:
// - Die Quelle ist ein eigener Kind-Wert (`sourceKind: "project"`), kein
//   stiller URL-Import.
// - Der Lizenz-Guard greift VOR dem Lauf: `usage: "customer"` ist 422.
// - Die Vorschau wird klar abgelehnt, weil es keine Originalseite gibt.
// - Eine kaputte XML ist ein Fehler und kein halber Import.

type ImportResponse = {
  job: { id: string; status: string; sourceKind: string };
  report: {
    dryRun: boolean;
    pageId: string | null;
    newDraftVersion: number | null;
    irHash: string;
    counts: { nodes: number; mapped: number };
    findings: { kind: string; severity: string }[];
    steps: string[];
  };
};

const PROJECT_XML = `<Project name="Mini">
  <Pages><Page nodeId="page-home" path="/" /></Pages>
  <TextStyles>
    <TextStyle path="/Heading/H1" tag="h1" fontSize="64px" lineHeight="1.1" />
  </TextStyles>
</Project>`;

const PAGE_XML = `<Page nodeId="page-home" path="/">
  <Container nodeId="hero" layout="stack" stackDirection="vertical" gap="16px">
    <Heading nodeId="title" inlineTextStyle="/Heading/H1" text="Hallo aus dem Projekt" />
  </Container>
</Page>`;

const projectSource = (usage: "private" | "customer" = "private") => ({
  project: { xml: PROJECT_XML, pageXml: PAGE_XML, page: "/", usage },
});

let env: BootEnv;
let siteId: string;

beforeAll(async () => {
  env = await bootEngine();
  const site = await createTestSite(env.api, "Projekt Werk");
  siteId = site.id;
});

afterAll(async () => {
  await env.close();
});

async function runImport(
  body: Record<string, unknown>,
): Promise<{ status: number; body: ImportResponse & ErrorResponse }> {
  return env.api.request<ImportResponse & ErrorResponse>({
    method: "POST",
    path: `/api/sites/${siteId}/imports/framer`,
    body,
  });
}

describe("Framer-Projekt an der Import-Route", () => {
  it("dry run: eigener Quell-Kind, Bericht ohne Schreiben", async () => {
    const response = await runImport({ source: projectSource() });
    expect(response.status).toBe(201);
    const { job, report } = response.body;
    expect(job.sourceKind).toBe("project");
    expect(report.dryRun).toBe(true);
    expect(report.pageId).toBeNull();
    expect(report.counts.mapped).toBeGreaterThan(0);
    expect(report.steps[0]).toContain("Framer-Projekt-XML");
    // Die Projekt-XML traegt keine Zeitsteuerung; der Bericht sagt es.
    expect(report.findings.some((finding) => finding.kind === "motion-absent")).toBe(true);
  });

  it("write: legt die Seite als Revision an", async () => {
    const response = await runImport({
      source: projectSource(),
      write: true,
      pagePath: "/projekt",
      assets: "skip",
      fonts: "skip",
    });
    expect(response.status).toBe(201);
    const { report } = response.body;
    expect(report.dryRun).toBe(false);
    expect(report.pageId).not.toBeNull();
    expect(report.newDraftVersion).toBe(2);
  });

  it("Kundenarbeit ist vor dem Lesen der XML gesperrt (422)", async () => {
    const response = await runImport({ source: projectSource("customer") });
    expect(response.status).toBe(422);
    expect(response.body.error.category).toBe("guardrail");
    expect(response.body.error.field).toBe("source.project.usage");
  });

  it("zwei Quellen in einem Auftrag werden abgelehnt (400)", async () => {
    const response = await runImport({
      source: { ...projectSource(), url: "https://example.com" },
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain("Nur eine Import-Quelle");
  });

  it("die Vorschau wird fuer das Projekt klar abgelehnt (400)", async () => {
    const response = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/sites/${siteId}/imports/framer/preview`,
      body: { source: projectSource() },
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain("keine Vorschau");
  });

  it("eine kaputte XML ist ein Fehler, kein halber Import", async () => {
    const response = await runImport({
      source: { project: { xml: "<Project", pageXml: PAGE_XML, page: "/", usage: "private" } },
    });
    expect(response.status).toBe(400);
    expect(response.body.error.category).toBe("validation");
  });
});
