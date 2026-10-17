import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_BREAKPOINTS } from "@senify/widget-engine/breakpoints";
import { planImportBreakpoints } from "../src/site-breakpoints.ts";
import { bootEngine, createTestPage, createTestSite, type BootEnv, type ErrorResponse } from "./helpers.ts";

// ADR-0020: a Framer import reads the source's own breakpoints. It sets them
// for the site only where nothing else was laid out for the platform default,
// and says in the report what it did.

const SOURCE = { tablet: 1200, mobile: 810 };

function framerHtml(withBreakpoints: boolean): string {
  const script = withBreakpoints
    ? `<script type="framer/appear" id="__framer__breakpoints">[{"hash":"aaa111","mediaQuery":"(min-width: 1200px)"},{"hash":"bbb222","mediaQuery":"(min-width: 810px) and (max-width: 1199.98px)"},{"hash":"ccc333","mediaQuery":"(max-width: 809.98px)"}]</script>`
    : "";
  return `<!doctype html><html lang="de"><head><title>Umbruch</title></head><body>${script}<div id="main" class="framer-page"><h1>Willkommen</h1></div></body></html>`;
}

type Report = {
  dryRun: boolean;
  breakpoints?: { tablet: number; mobile: number; outcome: string; reason: string | null };
  findings: { kind: string; severity: string; message: string; suggestion: string }[];
};
type ImportResponse = { report: Report };
type SiteBody = { breakpoints?: { tablet: number; mobile: number } };

let env: BootEnv;
beforeAll(async () => {
  env = await bootEngine();
}, 300000);
afterAll(async () => {
  if (env) await env.close();
});

async function runImport(
  siteId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: ImportResponse & ErrorResponse }> {
  return env.api.request<ImportResponse & ErrorResponse>({
    method: "POST",
    path: `/api/sites/${siteId}/imports/framer`,
    body: { assets: "skip", fonts: "skip", ...body },
  });
}

async function pairOf(siteId: string): Promise<SiteBody["breakpoints"]> {
  const response = await env.api.request<SiteBody>({ method: "GET", path: `/api/sites/${siteId}` });
  return response.body.breakpoints;
}

const breakpointFinding = (report: Report): Report["findings"][number] | undefined =>
  report.findings.find((finding) => finding.kind === "breakpoints");

describe("planImportBreakpoints", () => {
  const a = SOURCE;
  it.each([
    ["source without a pair", null, undefined, false, null],
    ["empty site", a, undefined, false, { outcome: "set", reason: null, effective: a }],
    ["site already at the source's numbers", a, a, false, { outcome: "unchanged", reason: null, effective: a }],
    [
      "source equals the platform default on a site without a pair",
      DEFAULT_BREAKPOINTS,
      undefined,
      true,
      { outcome: "unchanged", reason: null, effective: DEFAULT_BREAKPOINTS },
    ],
    [
      "site with another pair",
      a,
      { tablet: 1100, mobile: 700 },
      false,
      { outcome: "kept", reason: "site-pair", effective: { tablet: 1100, mobile: 700 } },
    ],
    [
      "site with other pages built for the default",
      a,
      undefined,
      true,
      { outcome: "kept", reason: "other-pages", effective: DEFAULT_BREAKPOINTS },
    ],
    [
      "other pages and another pair: the pair is the reason",
      a,
      { tablet: 1100, mobile: 700 },
      true,
      { outcome: "kept", reason: "site-pair", effective: { tablet: 1100, mobile: 700 } },
    ],
  ])("%s", (_name, derived, site, otherPages, expected) => {
    const plan = planImportBreakpoints({ derived, site, otherPages });
    if (expected === null) {
      expect(plan).toBeNull();
      return;
    }
    expect(plan).toEqual({ derived, ...expected });
  });
});

describe("Framer import and the site's breakpoints", () => {
  it("dry run on an empty site: the report says what would be set and nothing is written", async () => {
    const site = await createTestSite(env.api, "Umbruch Dry");
    const response = await runImport(site.id, { source: { html: framerHtml(true) } });
    expect(response.status).toBe(201);
    const { report } = response.body;
    expect(report.dryRun).toBe(true);
    expect(report.breakpoints).toEqual({ ...SOURCE, outcome: "set", reason: null });
    const finding = breakpointFinding(report);
    expect(finding?.severity).toBe("info");
    expect(finding?.message).toContain("Tablet unter 1200, Handy unter 810 Pixel");
    expect(await pairOf(site.id)).toBeUndefined();
  }, 120_000);

  it("write on an empty site: sets the pair, with its audit entry", async () => {
    const site = await createTestSite(env.api, "Umbruch Write");
    const response = await runImport(site.id, { source: { html: framerHtml(true) }, write: true, pagePath: "/start" });
    expect(response.status).toBe(201);
    expect(response.body.report.breakpoints).toEqual({ ...SOURCE, outcome: "set", reason: null });
    expect(await pairOf(site.id)).toEqual(SOURCE);
    const audit = await env.api.request<{ entries: { mutation: string; params: Record<string, unknown> }[] }>({
      method: "GET",
      path: `/api/sites/${site.id}/audit?limit=20`,
    });
    const entry = audit.body.entries.find((candidate) => candidate.mutation === "update_site_breakpoints");
    expect(entry?.params["source"]).toBe("framer-import");
    expect(entry?.params["breakpoints"]).toEqual(SOURCE);
  }, 120_000);

  it("a second page of the same source finds the site already at its numbers", async () => {
    const site = await createTestSite(env.api, "Umbruch Zweite Seite");
    await runImport(site.id, { source: { html: framerHtml(true) }, write: true, pagePath: "/start" });
    const second = await runImport(site.id, { source: { html: framerHtml(true) }, write: true, pagePath: "/ueber" });
    expect(second.status).toBe(201);
    expect(second.body.report.breakpoints).toEqual({ ...SOURCE, outcome: "unchanged", reason: null });
    expect(breakpointFinding(second.body.report)?.severity).toBe("info");
    expect(await pairOf(site.id)).toEqual(SOURCE);
  }, 120_000);

  it("keeps a site that already has pages built for the default", async () => {
    const site = await createTestSite(env.api, "Umbruch Andere Seiten");
    await createTestPage(env.api, site.id, { title: "Alt", path: "/alt" });
    const response = await runImport(site.id, { source: { html: framerHtml(true) }, write: true, pagePath: "/neu" });
    expect(response.status).toBe(201);
    const { report } = response.body;
    expect(report.breakpoints).toEqual({ ...SOURCE, outcome: "kept", reason: "other-pages" });
    const finding = breakpointFinding(report);
    expect(finding?.severity).toBe("warn");
    expect(finding?.message).toContain("schon andere Seiten");
    expect(finding?.message).toContain("Tablet unter 1200, Handy unter 810 Pixel");
    expect(await pairOf(site.id)).toBeUndefined();
  }, 120_000);

  it("replacing the only page of a site still counts as an empty site", async () => {
    const site = await createTestSite(env.api, "Umbruch Ersetzen");
    const page = await createTestPage(env.api, site.id, { title: "Start", path: "/start" });
    const response = await runImport(site.id, {
      source: { html: framerHtml(true) },
      write: true,
      pagePath: "/start",
      pageId: page.id,
      baseDraftVersion: page.draftVersion,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.report.breakpoints?.outcome).toBe("set");
    expect(await pairOf(site.id)).toEqual(SOURCE);
  }, 120_000);

  it("keeps the pair a site chose itself and says so", async () => {
    const site = await createTestSite(env.api, "Umbruch Eigene");
    const patched = await env.api.request({
      method: "PATCH",
      path: `/api/sites/${site.id}`,
      body: { breakpoints: { tablet: 1100, mobile: 700 } },
    });
    expect(patched.status).toBe(200);
    const response = await runImport(site.id, { source: { html: framerHtml(true) }, write: true, pagePath: "/start" });
    expect(response.status).toBe(201);
    const { report } = response.body;
    expect(report.breakpoints).toEqual({ ...SOURCE, outcome: "kept", reason: "site-pair" });
    const finding = breakpointFinding(report);
    expect(finding?.severity).toBe("warn");
    expect(finding?.message).toContain("Tablet unter 1100, Handy unter 700 Pixel");
    expect(await pairOf(site.id)).toEqual({ tablet: 1100, mobile: 700 });
  }, 120_000);

  it("a source without breakpoints leaves the site and the report alone", async () => {
    const site = await createTestSite(env.api, "Umbruch Ohne Quelle");
    const response = await runImport(site.id, { source: { html: framerHtml(false) }, write: true, pagePath: "/start" });
    expect(response.status).toBe(201);
    expect(response.body.report.breakpoints).toBeUndefined();
    expect(breakpointFinding(response.body.report)).toBeUndefined();
    expect(await pairOf(site.id)).toBeUndefined();
  }, 120_000);

  it("a replayed write does not set the pair a second time", async () => {
    const site = await createTestSite(env.api, "Umbruch Replay");
    const first = await runImport(site.id, { source: { html: framerHtml(true) }, write: true, pagePath: "/start" });
    expect(first.status).toBe(201);
    expect(await pairOf(site.id)).toEqual(SOURCE);
    // The author clears the pair afterwards. The same content again is a replay
    // of the committed write: it plans "set" (no pair, no other page) but the
    // commit returns the stored receipt and must not write the pair again.
    const cleared = await env.api.request({
      method: "PATCH",
      path: `/api/sites/${site.id}`,
      body: { breakpoints: null },
    });
    expect(cleared.status).toBe(200);
    const replay = await runImport(site.id, { source: { html: framerHtml(true) }, write: true, pagePath: "/start" });
    expect(replay.status).toBe(201);
    expect((replay.body.report as Report & { replayed?: boolean }).replayed).toBe(true);
    expect(await pairOf(site.id)).toBeUndefined();
  }, 120_000);
});
