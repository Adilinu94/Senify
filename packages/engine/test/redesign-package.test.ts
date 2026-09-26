import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMutationsRequest,
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  type BootEnv,
  type ErrorResponse,
} from "./helpers.ts";

// The redesign package: one page, one or two references, one theme draft each.
// The route only reads; the page, the theme and the drafts stay untouched.

function pngBytes(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function pngImage(width = 1440, height = 900): string {
  return `data:image/png;base64,${pngBytes(width, height).toString("base64")}`;
}

const DARK_DOC = [
  "# Dunkel Studio - Token Reference",
  "",
  "A dark studio template with mono headlines and a green accent.",
  "",
  "## Colors",
  "",
  "| Role | Hex | Usage |",
  "|------|-----|-------|",
  "| primary | `#00E07A` | CTAs |",
  "| background | `#141414` | Page canvas |",
  "| ink | `#FFFFFF` | Headlines |",
  "",
  "## Typography",
  "",
  "Font family: **Geist Mono, Inter**, fallback `system-ui, sans-serif`.",
  "Base spacing unit 4px.",
  "",
  "| Style | Size | Weight | Line Height |",
  "|-------|------|--------|-------------|",
  "| Display (H1) | 48px | 500 | 1.05 |",
  "| Body | 14px | 400 | 1.6 |",
  "",
  "## Shape",
  "",
  "| Token | Radius | Components |",
  "|-------|--------|------------|",
  "| Base | 0px | Cards |",
  "",
  "## Motion",
  "",
  "| Token | Value | Usage |",
  "|-------|-------|-------|",
  "| ease-out | `cubic-bezier(0.16, 1, 0.3, 1)` | Reveals |",
  "| duration-medium | 500ms | Section fade |",
  "",
].join("\n");

const LIGHT_DOC = [
  "# Hell Studio - Token Reference",
  "",
  "A light interior template with a serif display face and warm stone tones.",
  "",
  "## Colors",
  "",
  "| Role | Hex | Usage |",
  "|------|-----|-------|",
  "| primary | `#B4624F` | CTAs |",
  "| background | `#F7F4EF` | Page canvas |",
  "| ink | `#1C1A16` | Headlines |",
  "",
  "## Typography",
  "",
  "Font family: **Fraunces, Public Sans**, fallback `Georgia, serif`.",
  "Base spacing unit 8px.",
  "",
  "| Style | Size | Weight | Line Height |",
  "|-------|------|--------|-------------|",
  "| Display (H1) | 72px | 400 | 1.05 |",
  "| Body | 18px | 400 | 1.7 |",
  "",
  "## Shape",
  "",
  "| Token | Radius | Components |",
  "|-------|--------|------------|",
  "| Base | 16px | Cards |",
  "",
  "## Motion",
  "",
  "| Token | Value | Usage |",
  "|-------|-------|-------|",
  "| ease-soft | `cubic-bezier(0.33, 1, 0.68, 1)` | Reveals |",
  "| duration-long | 800ms | Section fade |",
  "",
].join("\n");

type PackageBody = {
  source: {
    siteId: string;
    pageId: string;
    title: string;
    path: string;
    draftVersion: number;
    themeVersion: number;
    outline: { type: string; variant: string | null; text: Record<string, string> }[];
  };
  targets: {
    reference: { id: string; name: string; vocabulary: string[]; screenshotPath: string };
    themePatch: { scales: Record<string, unknown>; fonts: Record<string, unknown> };
    themePreview: { scales: Record<string, unknown>; displayFont: string };
    verification: { ok: boolean; issues: string[] };
    documents: { design: string | null; guidelines: string | null };
    rules: { constants: string[]; never: string[] };
    components: { name: string }[];
  }[];
  steps: string[];
  warnings: string[];
};

describe("redesign package", () => {
  let env: BootEnv;
  let pageId = "";
  let siteId = "";
  let darkId = "";
  let lightId = "";

  const importReference = async (
    name: string,
    documents: { design: string; guidelines?: string },
  ): Promise<string> => {
    const created = await env.api.request<{ reference: { id: string } }>({
      method: "POST",
      path: "/api/references/manual",
      body: {
        name,
        sourceUrl: "https://example.test/",
        documents,
        image: pngImage(),
        imageMobile: pngImage(360, 800),
        author: TEST_AUTHOR,
      },
    });
    expect(created.status).toBe(201);
    return created.body.reference.id;
  };

  beforeAll(async () => {
    env = await bootEngine();
    const site = await createTestSite(env.api, "Redesign-Quelle");
    siteId = site.id;
    const page = await createTestPage(env.api, site.id, { title: "Werkstatt", path: "/" });
    pageId = page.id;
    const applied = await applyMutationsRequest(env.api, page, [
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { type: "block", props: { headline: "Unsere Werkstatt" } },
      },
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { type: "block", props: { headline: "Leistungen" } },
      },
    ]);
    expect(applied.status).toBe(200);

    darkId = await importReference("Dunkel Studio", {
      design: DARK_DOC,
      guidelines: "## Don'ts\n\n- Never stack two shadows.\n",
    });
    lightId = await importReference("Hell Studio", { design: LIGHT_DOC });
  }, 60000);

  afterAll(async () => {
    await env.close();
  });

  async function request(query: string): Promise<{
    status: number;
    body: PackageBody & ErrorResponse;
  }> {
    return env.api.request<PackageBody & ErrorResponse>({
      method: "GET",
      path: `/api/pages/${pageId}/redesign-package${query}`,
    });
  }

  it("hands over the page content and one theme draft per reference", async () => {
    const themeBefore = await env.api.request<{ version: number }>({
      method: "GET",
      path: `/api/sites/${siteId}/theme`,
    });

    const response = await request(`?referenceIds=${darkId},${lightId}`);
    expect(response.status).toBe(200);
    const body = response.body;
    expect(body.source.siteId).toBe(siteId);
    expect(body.source.pageId).toBe(pageId);
    expect(body.source.title).toBe("Werkstatt");
    expect(body.source.outline.map((entry) => [entry.type, entry.text["headline"]])).toEqual([
      ["block", "Unsere Werkstatt"],
      ["block", "Leistungen"],
    ]);
    expect(body.targets).toHaveLength(2);
    expect(body.warnings).toEqual([]);
    expect(body.steps).toHaveLength(5);
    // The package hands out the human direction step, not the old manual
    // duplicate/update_theme pair (ADR-0012).
    expect(body.steps[0]).toContain("create_redesign_proposal");
    expect(body.steps.join(" ")).not.toContain("duplicate_site");

    const [dark, light] = body.targets;
    expect(dark?.reference.name).toBe("Dunkel Studio");
    expect(dark?.reference.screenshotPath).toBe(
      `/api/references/${darkId}/snapshots/desktop-hero-desktop-1.png`,
    );
    expect(dark?.documents.design).toContain("# Dunkel Studio");
    expect(dark?.rules.never).toEqual(["Never stack two shadows."]);
    expect(dark?.themePatch.scales["brand"]).toBe("#00E07A");
    expect(dark?.themePatch.scales["neutralBase"]).toBe("#141414");
    expect(dark?.themePreview.displayFont).toBe("Geist Mono");
    expect(dark?.verification.ok).toBe(true);
    expect(dark?.verification.issues).toEqual([]);

    // The two drafts really differ: palette, type base, radius and motion.
    expect(light?.themePatch.scales["brand"]).toBe("#B4624F");
    expect(light?.themePreview.displayFont).toBe("Fraunces");
    expect(dark?.themePreview.scales["typeBase"]).toBe(14);
    expect(light?.themePreview.scales["typeBase"]).toBe(18);
    expect(dark?.themePatch.scales["radiusBase"]).toBe("0px");
    expect(light?.themePatch.scales["radiusBase"]).toBe("16px");
    expect(dark?.themePatch.scales["spacingBase"]).toBe(4);
    expect(light?.themePatch.scales["spacingBase"]).toBe(8);

    // Reading the package changes nothing.
    const themeAfter = await env.api.request<{ version: number }>({
      method: "GET",
      path: `/api/sites/${siteId}/theme`,
    });
    expect(themeAfter.body.version).toBe(themeBefore.body.version);
    const pageAfter = await env.api.request<{ draftVersion: number }>({
      method: "GET",
      path: `/api/pages/${pageId}`,
    });
    expect(pageAfter.body.draftVersion).toBe(body.source.draftVersion);
  });

  it("works with a single reference and warns about a missing design.md", async () => {
    const response = await request(`?referenceIds=${darkId}`);
    expect(response.status).toBe(200);
    expect(response.body.targets).toHaveLength(1);
    expect(response.body.warnings).toEqual([]);

    // An analysed reference (profile without documents) warns and still works.
    const cleared = await env.api.request<{ reference: { id: string } }>({
      method: "PATCH",
      path: `/api/references/${lightId}`,
      body: { documents: { design: null, guidelines: null, components: null } },
    });
    expect(cleared.status).toBe(200);
    const withoutDoc = await request(`?referenceIds=${lightId}`);
    expect(withoutDoc.status).toBe(200);
    expect(withoutDoc.body.targets[0]?.documents.design).toBeNull();
    expect(withoutDoc.body.warnings[0]).toContain("kein Design.md");
  });

  it("refuses a reference without a profile", async () => {
    const bare = await env.api.request<{ reference: { id: string } }>({
      method: "POST",
      path: "/api/references/manual",
      body: { name: "Ohne Profil", image: pngImage(), author: TEST_AUTHOR },
    });
    expect(bare.status).toBe(201);
    const response = await request(`?referenceIds=${bare.body.reference.id}`);
    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain("kein Profil");
    expect(response.body.error.suggestion).toContain("analyze_reference");
  });

  it("validates the reference list", async () => {
    const missing = await request("");
    expect(missing.status).toBe(400);
    expect(missing.body.error.field).toBe("referenceIds");
    expect(missing.body.error.suggestion).toContain("Komma");

    const tooMany = await request("?referenceIds=a,b,c,d");
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.message).toContain("Höchstens 3");

    const unknown = await request("?referenceIds=gibt-es-nicht");
    expect(unknown.status).toBe(404);
  });
});
