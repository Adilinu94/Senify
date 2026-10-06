import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PAGE_STARTERS } from "../src/page-starters.ts";
import { bootEngine, type BootEnv } from "./helpers.ts";

let env: BootEnv;

beforeAll(async () => {
  env = await bootEngine();
});

afterAll(async () => {
  await env.close();
});

type CreatedPage = {
  id: string;
  path: string;
  title: string;
  draftVersion: number;
  draft: {
    rootNodeId: string;
    nodes: Record<string, { type: string; variant?: string; children?: string[]; props: Record<string, unknown> }>;
  };
  starter?: { applied: boolean; reason?: string };
};

async function newSite(name: string): Promise<string> {
  const response = await env.api.request({ method: "POST", path: "/api/sites", body: { name } });
  return (response.body as { id: string }).id;
}

function sectionTypes(page: CreatedPage): string[] {
  const root = page.draft.nodes[page.draft.rootNodeId];
  return (root?.children ?? []).map((id) => page.draft.nodes[id]?.type ?? "?");
}

describe("page starters", () => {
  it("lists the templates the dashboard offers", async () => {
    const response = await env.api.request({ method: "GET", path: "/api/page-starters" });
    expect(response.status).toBe(200);
    const body = response.body as { starters: { id: string; label: string; sections: string[] }[] };
    expect(body.starters.map((starter) => starter.id)).toEqual(PAGE_STARTERS.map((starter) => starter.id));
    expect(body.starters.find((starter) => starter.id === "landing")?.sections).toEqual([
      "hero",
      "features",
      "cta",
    ]);
  });

  // Every template is held to the same rules as any edit: the sections go in
  // through the mutation path, so a template that fails the registry schemas
  // fails here, not in front of a customer.
  for (const starter of PAGE_STARTERS) {
    it(`creates a page from "${starter.id}" with exactly its sections`, async () => {
      const siteId = await newSite(`Starter ${starter.id}`);
      const response = await env.api.request({
        method: "POST",
        path: `/api/sites/${siteId}/pages`,
        body: { starter: starter.id },
      });
      expect(response.status).toBe(201);
      const page = response.body as CreatedPage;
      expect(page.title).toBe(starter.defaultTitle);
      expect(sectionTypes(page)).toEqual(starter.sections.map((section) => section.type));
      if (starter.sections.length > 0) {
        expect(page.starter).toEqual({ applied: true });
        expect(page.draftVersion).toBeGreaterThan(1);
      } else {
        expect(page.starter).toBeUndefined();
        expect(page.draftVersion).toBe(1);
      }
    });
  }

  it("keeps the title and path the person typed", async () => {
    const siteId = await newSite("Starter Titel");
    const first = await env.api.request({
      method: "POST",
      path: `/api/sites/${siteId}/pages`,
      body: { title: "Startseite", path: "/", starter: "blank" },
    });
    expect((first.body as CreatedPage).path).toBe("/");
    const response = await env.api.request({
      method: "POST",
      path: `/api/sites/${siteId}/pages`,
      body: { title: "Wer wir sind", path: "/wer-wir-sind", starter: "about" },
    });
    expect(response.status).toBe(201);
    const page = response.body as CreatedPage;
    expect(page.title).toBe("Wer wir sind");
    expect(page.path).toBe("/wer-wir-sind");
    expect(sectionTypes(page)).toEqual(["content", "features"]);
  });

  it("rejects an unknown template instead of creating an empty page", async () => {
    const siteId = await newSite("Starter Unbekannt");
    const response = await env.api.request({
      method: "POST",
      path: `/api/sites/${siteId}/pages`,
      body: { starter: "magazin" },
    });
    expect(response.status).toBe(400);
    const list = await env.api.request({ method: "GET", path: `/api/sites/${siteId}/pages` });
    expect((list.body as { pages: unknown[] }).pages).toHaveLength(0);
  });

  it("reaches the same page again with the same idempotency key", async () => {
    const siteId = await newSite("Starter Idempotenz");
    const body = { starter: "contact", idempotencyKey: "starter-contact-0001" };
    const first = await env.api.request({ method: "POST", path: `/api/sites/${siteId}/pages`, body });
    const second = await env.api.request({ method: "POST", path: `/api/sites/${siteId}/pages`, body });
    expect((second.body as CreatedPage).id).toBe((first.body as CreatedPage).id);
    const list = await env.api.request({ method: "GET", path: `/api/sites/${siteId}/pages` });
    expect((list.body as { pages: unknown[] }).pages).toHaveLength(1);
  });
});
